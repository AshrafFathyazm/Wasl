using Microsoft.EntityFrameworkCore;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Communications;
using Wasl.Domain.Tickets;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Api.Seed;

/// <summary>
/// Three customers and five tickets in five different statuses, from one command.
/// </summary>
/// <remarks>
/// <para>
/// <b>A demo from a known state beats typing data in front of people.</b> `016-three-day-plan.md`
/// put the seed script in Session 3 for that reason, and this is it.
/// </para>
/// <para>
/// <b>Tickets go through the real domain and the real rules</b> — <c>Ticket.Create</c>,
/// <c>ChangeStatus</c>, the sequence, the history rows. So the seeder is itself a check on BR-1: a
/// transition it cannot make is a transition the product cannot make, and the seed fails loudly
/// rather than writing a ticket into a state the state machine forbids.
/// </para>
/// <para>
/// <b>Customers go in as SQL, and that is a stated shortcut.</b> <c>Customer</c> has no factory
/// until `007`, so there is no legitimate way to build one in code — and adding reflection to
/// production code to work around a missing factory would be worse than three <c>INSERT</c>
/// statements that `007` deletes. Parameterised, not interpolated.
/// </para>
/// <para>
/// <b>Idempotent.</b> Running it twice is a no-op, because a demo rehearsed three times must not
/// end with fifteen tickets.
/// </para>
/// </remarks>
internal static class DemoSeeder
{
    /// <summary>
    /// The switch <c>Program.cs</c> looks for: <c>dotnet run --project src/Wasl.Api -- --seed</c>.
    /// </summary>
    public const string Switch = "--seed";

    public static async Task RunAsync(IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();
        var numbers = scope.ServiceProvider.GetRequiredService<ITicketNumberGenerator>();
        var clock = scope.ServiceProvider.GetRequiredService<IRequestTimestamp>();

        // Applied here too, so a clean clone needs one command rather than two — and so the seed
        // can never run against a schema older than the code that seeds it.
        await context.Database.MigrateAsync();

        if (await context.Tickets.AnyAsync())
        {
            Console.WriteLine("Seed skipped: tickets already exist.");
            return;
        }

        var customers = await SeedCustomersAsync(context);

        var now = clock.UtcNow.UtcDateTime;

        // Five tickets, five statuses, walked through real transitions. New needs no walk; the
        // rest reach their status the way a user would, which is why InProgress is assigned first
        // — BR-1.3 refuses it otherwise, and the seeder would stop.
        await AddAsync(context, numbers, customers[0], "Cannot sign in to the portal",
            "The password reset email never arrives.", TicketCategory.Account,
            TicketPriority.High, CommunicationChannel.Email, now, TicketStatus.New);

        await AddAsync(context, numbers, customers[0], "Invoice total looks wrong",
            "March invoice is double February with no usage change.", TicketCategory.Billing,
            TicketPriority.Normal, CommunicationChannel.WhatsApp, now, TicketStatus.Open);

        await AddAsync(context, numbers, customers[1], "لا يمكنني تحديث بيانات الحساب",
            "الصفحة تعطي خطأ عند الحفظ.", TicketCategory.Technical,
            TicketPriority.Critical, CommunicationChannel.LiveChat, now, TicketStatus.InProgress);

        await AddAsync(context, numbers, customers[1], "Waiting on a screenshot",
            "Asked the customer for the error screen.", TicketCategory.Technical,
            TicketPriority.Low, CommunicationChannel.Sms, now, TicketStatus.PendingCustomer);

        await AddAsync(context, numbers, customers[2], "Export finished but file was empty",
            "Ran the CSV export twice with the same result.", TicketCategory.General,
            TicketPriority.Normal, CommunicationChannel.WebForm, now, TicketStatus.Resolved);

        await context.SaveChangesAsync();

        Console.WriteLine($"Seeded {customers.Count} customers and 5 tickets.");
    }

    private static async Task<List<Guid>> SeedCustomersAsync(WaslDbContext context)
    {
        var ids = new List<Guid>();

        foreach (var (name, email, phone, company) in new[]
        {
            ("علي الأحمد", "ali@example.com", "+966501234567", "شركة الأفق للتقنية"),
            ("Sara Khan", "sara.khan@example.com", "+966555000111", "Northwind Logistics"),
            ("مها العتيبي", "maha@example.com", "+966533221100", (string?)null),
        })
        {
            var id = Guid.CreateVersion7();
            var now = DateTime.UtcNow;

            await context.Database.ExecuteSqlAsync(
                $"""
                INSERT INTO dbo.Customers
                    (Id, FullName, Email, PhoneE164, CompanyName, Notes, IsActive, CreatedAtUtc, UpdatedAtUtc)
                VALUES
                    ({id}, {name}, {email}, {phone}, {company}, NULL, 1, {now}, {now})
                """);

            ids.Add(id);
        }

        return ids;
    }

    private static async Task AddAsync(
        WaslDbContext context,
        ITicketNumberGenerator numbers,
        Guid customerId,
        string subject,
        string description,
        TicketCategory category,
        TicketPriority priority,
        CommunicationChannel channel,
        DateTime now,
        TicketStatus target)
    {
        var ticket = Ticket.Create(
            customerId, await numbers.NextAsync(CancellationToken.None),
            subject, description, category, priority, channel);

        context.Tickets.Add(ticket);
        context.TicketHistory.Add(TicketHistoryEntry.Created(ticket.Id, now));

        // InProgress and everything past it needs an assignee (BR-1.3). `011` owns assignment and
        // `004` owns SupportUsers, so this is a placeholder id with no row behind it — legal
        // today precisely because the column carries no foreign key yet, and the reason that is
        // recorded in `009`'s data-model.md.
        if (target is TicketStatus.InProgress or TicketStatus.PendingCustomer or TicketStatus.Resolved)
        {
            typeof(Ticket).GetProperty(nameof(Ticket.AssignedToUserId))!
                .SetValue(ticket, Guid.CreateVersion7());
        }

        foreach (var step in PathTo(target))
        {
            context.TicketHistory.Add(ticket.ChangeStatus(step, now, note: "seeded"));
        }
    }

    /// <summary>
    /// The real transitions that reach <paramref name="target"/>, in order.
    /// </summary>
    /// <remarks>
    /// Written out rather than searched for. A path finder over the BR-1 map would be a second
    /// implementation of the rule in the one place that must not have one — and if it disagreed
    /// with the map, the seed would produce a ticket the product cannot.
    /// </remarks>
    private static TicketStatus[] PathTo(TicketStatus target) => target switch
    {
        TicketStatus.New => [],
        TicketStatus.Open => [TicketStatus.Open],
        TicketStatus.InProgress => [TicketStatus.Open, TicketStatus.InProgress],
        TicketStatus.PendingCustomer =>
            [TicketStatus.Open, TicketStatus.InProgress, TicketStatus.PendingCustomer],
        TicketStatus.Resolved =>
            [TicketStatus.Open, TicketStatus.InProgress, TicketStatus.Resolved],
        _ => throw new ArgumentOutOfRangeException(
            nameof(target), target, "The seed does not create closed tickets — a demo needs "
            + "something it can still act on."),
    };
}
