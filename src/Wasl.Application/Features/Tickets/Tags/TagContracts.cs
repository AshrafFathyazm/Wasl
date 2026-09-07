using Wasl.Application.Common.Messaging;
using Wasl.Domain.Audit;
using Wasl.Domain.Tickets;

namespace Wasl.Application.Features.Tickets.Tags;

/* ============================================================================
 * WHY THIS FOLDER HOLDS THREE USE CASES, WHEN THE RULE IS ONE PER FOLDER
 * ============================================================================
 * `CLAUDE.md`: "one folder per USE CASE, not per technical type". Every other
 * feature obeys it — `Customers/CreateCustomer/`, `Tickets/ChangeStatus/`. This
 * folder holds `GetTags`, `AttachTicketTag` and `DetachTicketTag`, and it is the
 * only place in `Features/` that does. Recorded 2026-09-07 during an
 * architecture audit, because an undocumented deviation is the thing the working
 * agreement forbids — not a deviation.
 *
 * THE REASON IS MEASURED, NOT PREFERRED. `TagSummary` is not one use case's DTO:
 * `Features/Tickets/CreateTicket/CreateTicketResult.cs:108` returns
 * `IReadOnlyList<TagSummary>` on the ticket body, and `TagsController` and
 * `TicketsController` both name it. It is the tag VOCABULARY, shared across
 * features — so this folder is a shared-contract folder that also happens to
 * hold its three use cases, rather than a use-case folder holding three.
 *
 * WHICH MEANS SPLITTING DOES NOT REMOVE THE EXCEPTION, IT ADDS TO IT. Moving the
 * three handlers into `AttachTag/`, `DetachTag/` and `GetTags/` leaves this
 * folder standing anyway — something has to own `TagSummary` — so the result is
 * one shared folder plus three thin ones, and a cross-feature `using` from every
 * consumer either way. That is more structure for the same coupling.
 *
 * SO IT STAYS, AND THE COST IS STATED: a reader looking for "where is detach
 * handled" does not find a folder named for it. `TicketTagHandlers.cs` is named
 * for the pair on purpose — the two commands are symmetric over one table and
 * return one shared result type, and `034` wrote them together for that reason.
 * ========================================================================= */

/// <summary>One tag as the client sees it. `034`.</summary>
/// <remarks>
/// <b>Shared vocabulary, not this feature's DTO</b> — <c>CreateTicketResult</c> carries a list of
/// these on the ticket body. That is what the block above turns on.
/// </remarks>
public sealed record TagSummary(Guid Id, string Name);

/// <summary>
/// Attach a tag to a ticket. `034` AC-13.
/// </summary>
/// <remarks>
/// <b>Auditable</b>, like every other state-changing command — BR-9. The row is written in the
/// same transaction as the attachment, so it is absent when that transaction rolls back.
/// </remarks>
public sealed record AttachTicketTagCommand(Guid TicketId, Guid TagId)
    : IAuditableCommand<TicketTagsResult>
{
    public string AuditAction => "Ticket.TagAttached";

    public AuditTarget DescribeTarget(TicketTagsResult? response) =>
        new("Ticket", TicketId, response?.TicketNumber);
}

/// <summary>Detach a tag from a ticket. `034` AC-13.</summary>
public sealed record DetachTicketTagCommand(Guid TicketId, Guid TagId)
    : IAuditableCommand<TicketTagsResult>
{
    public string AuditAction => "Ticket.TagDetached";

    public AuditTarget DescribeTarget(TicketTagsResult? response) =>
        new("Ticket", TicketId, response?.TicketNumber);
}

/// <summary>
/// The ticket's tags after the change.
/// </summary>
/// <remarks>
/// <b>The whole set, not the one that moved.</b> The client renders a row of tags, so returning
/// the set it should now show costs one query here and saves a refetch there — and it removes the
/// question of what to do when two people tag the same ticket at once, because the answer is
/// whatever the server just read.
/// </remarks>
public sealed record TicketTagsResult(
    Guid TicketId,
    string TicketNumber,
    IReadOnlyList<TagSummary> Tags);
