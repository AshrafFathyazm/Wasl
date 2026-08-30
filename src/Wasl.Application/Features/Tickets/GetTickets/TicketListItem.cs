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
/// <b><see cref="AssigneeName"/> was hard-coded to <c>null</c> until 2026-08-30.</b> This block
/// used to read *"both are null until `004`: `dbo.SupportUsers` does not exist, so there is no
/// name to join to"* — true when written, and `004` created that table on 2026-08-27. The join
/// was not added with it, and the comment went on explaining an absence whose cause had gone.
/// <br/>
/// It is a CONTRACT VIOLATION and not merely a gap: `010`'s contract says the two are
/// *"both null when unassigned"* — together — so an id with no name is a shape it does not
/// describe. `002c`'s OpenAPI comparison cannot catch that, because it compares paths and
/// methods and this shape is legal. Only a value shows it.
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
