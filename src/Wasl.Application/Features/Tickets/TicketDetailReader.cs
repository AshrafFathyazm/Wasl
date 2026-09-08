using Wasl.Application.Common.Abstractions;
using Wasl.Application.Features.Tickets.CreateTicket;
using Wasl.Application.Features.Tickets.Tags;
using Wasl.Domain.Tickets;

namespace Wasl.Application.Features.Tickets;

/// <summary>
/// The whole <c>TicketDetailResponse</c> read shape, assembled once. `016`.
/// </summary>
/// <remarks>
/// <para>
/// <b>This exists because <see cref="CreateTicketCommandHandler.Map"/> grew five optional
/// parameters and four of its five call sites were not passing all of them.</b> Every optional
/// parameter on that method was added for the same honest reason — a create cannot supply an
/// assignee, tags, or an escalation — and each one then quietly became a field the *other* four
/// callers also failed to supply. Measured on 2026-09-08, before this file existed:
/// </para>
/// <code>
/// endpoint                            assignee   tags   escalatedBy   canEscalate
/// POST   /api/tickets                 n/a        n/a    n/a           MISSING
/// GET    /api/tickets/{id}            ok         ok     ok            ok
/// PUT    /api/tickets/{id}/assignee   ok         MISSING  MISSING     MISSING
/// PUT    /api/tickets/{id}/status     MISSING    MISSING  MISSING     MISSING
/// POST   /api/tickets/{id}/escalate   ok         MISSING  ok          ok
/// </code>
/// <para>
/// So <c>PUT /status</c> on an assigned, tagged ticket answered <c>assignedToUserId</c> populated
/// with <c>assignee: null</c> and <c>tags: []</c> — the exact defect `011` left on
/// <c>GET /api/tickets/{id}</c> for three days and the exact defect `034` left on the same
/// endpoint, arriving a third time through a different door. Both frozen contracts say the body
/// "is <c>TicketDetailResponse</c>", so all three were contract violations rather than omissions
/// somebody could argue for.
/// </para>
/// <para>
/// <b>The fix is not "remember to pass them".</b> `026` §5 forbids a screen rendering a ticket
/// from a write response, which is the rule that has been hiding this: the client refetches, so
/// the wrong body is never displayed and nothing goes red. A default of <c>null</c> on an
/// optional parameter is indistinguishable from a deliberate null at every call site, and there
/// is no build error to find. One assembler removes the choice.
/// </para>
/// <para>
/// <b>Reads, never writes.</b> Called after <c>SaveChangesAsync</c> so the entity it maps is the
/// committed one; it opens nothing and stamps nothing. <c>CreateTicketCommandHandler</c> keeps
/// calling <see cref="CreateTicketCommandHandler.Map"/> directly — a just-created ticket has no
/// assignee (BR-2.7), no tags and no escalation, so three of these queries would be three round
/// trips guaranteed to return nothing.
/// </para>
/// </remarks>
internal static class TicketDetailReader
{
    /// <summary>
    /// Assembles the full detail shape for <paramref name="ticket"/>.
    /// </summary>
    /// <param name="knownAssignee">
    /// An assignee the caller has already loaded, to save a round trip.
    /// <para>
    /// Optional, and <b>the default is the correct behaviour rather than the incomplete one</b> —
    /// which is the whole difference between this parameter and the ones on
    /// <see cref="CreateTicketCommandHandler.Map"/>. Omitting it costs one query; omitting one of
    /// <c>Map</c>'s cost a wrong field. Only <c>AssignTicketCommandHandler</c> passes it, because
    /// only that handler had to load the row anyway to tell a `404` from a `400`.
    /// </para>
    /// </param>
    public static async Task<CreateTicketResult> ReadAsync(
        IApplicationDbContext context,
        ICurrentUser currentUser,
        Ticket ticket,
        CancellationToken cancellationToken,
        TicketAssignee? knownAssignee = null)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(currentUser);
        ArgumentNullException.ThrowIfNull(ticket);

        var customer = await context.FirstOrDefaultAsync(
            context.Customers
                .Where(candidate => candidate.Id == ticket.CustomerId)
                .Select(candidate => new TicketCustomerSummary(
                    candidate.Id, candidate.FullName, candidate.Email, candidate.CompanyName)),
            cancellationToken);

        // A ticket whose customer is gone. There is no delete in this release and the foreign key
        // is NO ACTION, so it should be unreachable — but a `404` for the ticket would be wrong
        // (the ticket exists) and dereferencing null would be a `500`. The customer's own id is
        // the honest minimum, and it is stated here once instead of at four call sites.
        customer ??= new TicketCustomerSummary(ticket.CustomerId, string.Empty, null, null);

        // Read from ticket.AssignedToUserId, never from what the caller asked for: on an unassign
        // the entity's field is null and no query runs, which is why this needs no unassign case.
        var assignee = knownAssignee;

        if (assignee is null && ticket.AssignedToUserId is { } assigneeId)
        {
            assignee = await LoadUserAsync(context, assigneeId, cancellationToken);
        }

        // `TicketTagReader` rather than a second join: it already projects in one query and orders
        // by name, and a second copy is a second ordering to keep in step.
        var tags = await TicketTagReader.ReadAsync(context, ticket, cancellationToken);

        // Only when there IS one, so an unescalated ticket — the common case — costs no extra
        // round trip and `010` AC-12's counter stays where it was.
        var escalatedBy = ticket.EscalatedByUserId is { } escalatedByUserId
            ? await LoadUserAsync(context, escalatedByUserId, cancellationToken)
            : null;

        return CreateTicketCommandHandler.Map(
            ticket,
            customer,
            assignee,
            tags.Tags,
            escalatedBy,

            /* BR-3.2's caller half, read from the token in ONE place now.
             *
             * `POST /escalate` used to pass `true` here on the argument that its ManagerOnly
             * policy had already proven it, and that two readers of the role are two things that
             * can disagree. The argument was right about the risk and now points the other way:
             * there is exactly one reader, so deriving it is what keeps the four endpoints
             * agreeing. The policy still holds — a non-Manager never reaches that handler — so
             * this returns `true` there for the same reason the literal did. */
            currentUser.IsManager());
    }

    private static Task<TicketAssignee?> LoadUserAsync(
        IApplicationDbContext context,
        Guid userId,
        CancellationToken cancellationToken) =>
        context.FirstOrDefaultAsync(
            context.SupportUsers
                .Where(candidate => candidate.Id == userId)
                .Select(candidate => new TicketAssignee(
                    candidate.Id, candidate.FullName, candidate.Role.ToString())),
            cancellationToken);
}
