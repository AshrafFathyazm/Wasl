using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Domain.Communications;
using Wasl.Domain.Tickets;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Api.IntegrationTests.Dashboard;

/// <summary>
/// Tickets and history rows at instants a test chooses. `020`.
/// </summary>
/// <remarks>
/// <para>
/// <b>THIS WRITES ENTITIES OUTSIDE THE REAL PATH, AND `CLAUDE.md` REQUIRES SAYING SO.</b>
/// <c>CreatedAtUtc</c> comes from <c>IRequestTimestamp</c> on the write path, so a ticket created
/// through <c>POST /api/tickets</c> is always created NOW — and every interesting property of the
/// dashboard is about WHEN something happened: a quiet day inside the range, a 22:00-local ticket,
/// a resolution before the range whose close falls inside it. None of those is reachable through
/// the API.
/// </para>
/// <para>
/// What that costs, stated rather than hidden: these tests verify the READ and verify nothing
/// about the write path. `009`'s and `012`'s own tests exercise <c>Ticket.Create</c> and the
/// history rows through HTTP, and the three defects `CLAUDE.md` lists under "an entity written
/// only from outside the real path" are why this paragraph exists.
/// </para>
/// <para>
/// <b>THE TIMESTAMP IS SET BY AN EXPLICIT UPDATE, NOT BY REFLECTION BEFORE THE INSERT — AND THAT
/// IS NOT A STYLE CHOICE.</b> <c>WaslDbContext.Stamp()</c> assigns
/// <c>CreatedAtUtc = now</c> to every <c>IAuditableEntity</c> in <c>EntityState.Added</c>
/// <i>unconditionally</i> (<c>Customer</c> has an <c>== default</c> guard; <c>Ticket</c> does
/// not). A reflection-set value is therefore silently overwritten, every fixture ticket would be
/// created "now", and every assertion about a quiet day or a local-day boundary would pass on
/// data that never had the shape it claims. <see cref="SeedTicketAsync"/> reads the row back and
/// THROWS if the instant did not stick — the same rule `008`'s query counter follows, because a
/// fixture that quietly produces the wrong data is worse than one that fails.
/// </para>
/// <para>
/// <b>Comments are NOT written here.</b> <c>Stamp()</c> also overwrites
/// <c>TicketComment.AuthorUserId</c> from <c>ICurrentUser</c> on insert, which has no principal in
/// a test scope, so the FK would refuse the row. A first-reply interval is built the other way
/// round instead: the comment goes through <c>POST /api/tickets/{id}/comments</c> — the real path,
/// with a real actor, at "now" — and the TICKET is dated backwards by the interval under test.
/// </para>
/// <para>
/// <b>The ticket number's discriminator comes from <c>RandomNumberGenerator</c>, never from a Guid
/// slice.</b> `008` matched the wrong row and `007` collided on a unique index because
/// <c>Guid.CreateVersion7()</c> leads with a timestamp, so two ids minted milliseconds apart share
/// their leading hex digits. <c>dbo.Tickets.TicketNumber</c> carries a unique index and a
/// collision here would present as "the dashboard is wrong".
/// </para>
/// </remarks>
internal static class DashboardFixture
{
    /// <summary>
    /// Writes one ticket, with every field the dashboard reads under the test's control.
    /// </summary>
    /// <param name="assignedToUserId">
    /// <c>null</c> leaves it unassigned, which is what the attention tiles and the attention list
    /// are mostly about.
    /// </param>
    /// <param name="resolvedAtUtc">
    /// When supplied, a <c>StatusChanged → Resolved</c> history row is written at that instant —
    /// the only source the daily series reads for <c>resolved</c> (AC-19).
    /// </param>
    /// <param name="extraResolutions">
    /// Further <c>→ Resolved</c> rows, for the reopen case: BR-1.6 permits a resolved ticket to go
    /// back to <c>InProgress</c> and be resolved again, and the series must count it once.
    /// </param>
    public static async Task<Guid> SeedTicketAsync(
        WaslApiFactory factory,
        Guid customerId,
        DateTime createdAtUtc,
        TicketStatus status = TicketStatus.New,
        Guid? assignedToUserId = null,
        bool isEscalated = false,
        CommunicationChannel channel = CommunicationChannel.Email,
        DateTime? resolvedAtUtc = null,
        IEnumerable<DateTime>? extraResolutions = null)
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        var ticket = Ticket.Create(
            customerId,
            TicketNumber.Format(2026, RandomNumberGenerator.GetInt32(100_000, 999_999)),
            "Probe ticket",
            "Written by DashboardFixture, outside the write path — see the type's remarks.",
            TicketCategory.Account,
            TicketPriority.Normal,
            channel);

        Set(ticket, nameof(Ticket.Status), status);
        Set(ticket, nameof(Ticket.AssignedToUserId), assignedToUserId);
        Set(ticket, nameof(Ticket.IsEscalated), isEscalated);

        context.Tickets.Add(ticket);
        context.TicketHistory.Add(TicketHistoryEntry.Created(ticket.Id, createdAtUtc));

        if (resolvedAtUtc is { } resolved)
        {
            context.TicketHistory.Add(TicketHistoryEntry.StatusChanged(
                ticket.Id, TicketStatus.InProgress, TicketStatus.Resolved, resolved));
        }

        foreach (var again in extraResolutions ?? [])
        {
            context.TicketHistory.Add(TicketHistoryEntry.StatusChanged(
                ticket.Id, TicketStatus.InProgress, TicketStatus.Resolved, again));
        }

        await context.SaveChangesAsync(CancellationToken.None);

        await BackdateAsync(factory, ticket.Id, createdAtUtc);

        return ticket.Id;
    }

    /// <summary>
    /// Moves a ticket's creation instant, and refuses to return if it did not move.
    /// </summary>
    /// <remarks>
    /// <para>
    /// A <c>Modified</c> entity has only <c>UpdatedAtUtc</c> re-stamped, so this could have been an
    /// entity update — but an explicit statement says what it does, and it stays correct if the
    /// stamping rules change again. Interpolated through <c>ExecuteSqlInterpolatedAsync</c>, so
    /// both values are parameters and nothing here is string-built SQL (EF1002).
    /// </para>
    /// <para>
    /// The read-back is the part that matters. Without it, a future change to <c>Stamp()</c> — or
    /// a column renamed — would leave every dashboard test asserting the right things about the
    /// wrong data, all green.
    /// </para>
    /// </remarks>
    public static async Task BackdateAsync(WaslApiFactory factory, Guid ticketId, DateTime createdAtUtc)
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        /* TRUNCATED TO WHOLE MILLISECONDS BEFORE THE WRITE, NOT COMPARED WITH A TOLERANCE AFTER
         * IT — and this cost a red run to find.
         *
         * `datetime2(3)` does not truncate the value it is given: IT ROUNDS. The first version
         * wrote `DateTime.UtcNow.AddMinutes(-5)` and compared against the same value truncated,
         * and the read-back came home 0.001 second LARGER:
         *
         *     expected 2026-09-07T11:32:02.4890000Z
         *     stored   2026-09-07T11:32:02.4900000Z
         *
         * `007` AC-14's note is about the same column and says "truncation", which is what
         * `RequestTimestamp` does on the way in — so the product never meets the rounding. A
         * fixture that writes raw instants does.
         *
         * Truncating here removes the question rather than papering over it with an epsilon: an
         * instant that is already a whole millisecond cannot be rounded to a different one, so
         * the read-back below stays an EQUALITY. A tolerance would also have accepted a value
         * `Stamp()` had overwritten, if the test happened to run inside the same millisecond. */
        var expected = createdAtUtc.AddTicks(-(createdAtUtc.Ticks % TimeSpan.TicksPerMillisecond));

        await context.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE dbo.Tickets SET CreatedAtUtc = {expected}, UpdatedAtUtc = {expected} WHERE Id = {ticketId}");

        var stored = await context.Tickets
            .AsNoTracking()
            .Where(ticket => ticket.Id == ticketId)
            .Select(ticket => ticket.CreatedAtUtc)
            .SingleAsync();

        if (stored != expected)
        {
            throw new InvalidOperationException(
                $"DashboardFixture could not date ticket {ticketId} to {expected:O} — the row came "
                + $"back as {stored:O}. Every assertion about a quiet day, a local-day boundary or "
                + "a resolution outside the range would otherwise be running against data created "
                + "now, and would pass.");
        }
    }

    /// <summary>
    /// Sets a private setter. The same mechanism <c>AuditFixture</c> uses, and for the same
    /// reason: adding a public mutator to a domain entity for a test's benefit is how an entity
    /// becomes a bag.
    /// </summary>
    private static void Set(object target, string property, object? value) =>
        target.GetType()
            .GetProperty(property)!
            .SetValue(target, value);
}
