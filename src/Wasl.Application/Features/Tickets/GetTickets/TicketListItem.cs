using Wasl.Domain.Communications;
using Wasl.Domain.Tickets;

namespace Wasl.Application.Features.Tickets.GetTickets;

/// <summary>
/// One row of the list, exactly as `contracts/tickets-list-api.md` freezes it. AC-13.
/// </summary>
/// <remarks>
/// <para>
/// <b>A row, not a ticket.</b> It carries no description, no escalation reason, no
/// <c>allowedTransitions</c> and no <c>version</c> — the detail read has those. A list that
/// returned whole tickets would send a description per row to render a table that shows none of
/// it, and would then be a second full read shape to keep in step with the first.
/// </para>
/// <para>
/// <b><see cref="CustomerName"/> and <see cref="AssigneeName"/> are projected in the same query
/// as the row</b> (AC-12). The alternative — loading rows and then resolving names — is one query
/// per row, which passes every test at ten tickets and is the reason a list page times out at ten
/// thousand.
/// </para>
/// <para>
/// <see cref="AssigneeId"/> and <see cref="AssigneeName"/> are both <c>null</c> until `004`:
/// <c>dbo.SupportUsers</c> does not exist, so there is no name to join to. The contract already
/// specifies both as nullable for the unassigned case, so the shape is right and only the values
/// are missing.
/// </para>
/// </remarks>
public sealed record TicketListItem(
    Guid Id,
    string TicketNumber,
    string Subject,
    Guid CustomerId,
    string CustomerName,
    TicketStatus Status,
    TicketPriority Priority,
    TicketCategory Category,
    CommunicationChannel Channel,
    Guid? AssigneeId,
    string? AssigneeName,
    bool IsEscalated,
    DateTime CreatedAtUtc);
