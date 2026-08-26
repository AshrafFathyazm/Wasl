using Wasl.Application.Common.Messaging;
using Wasl.Application.Features.Tickets.CreateTicket;
using Wasl.Domain.Audit;
using Wasl.Domain.Tickets;

namespace Wasl.Application.Features.Tickets.ChangeStatus;

/// <summary>
/// <c>PUT /api/tickets/{id}/status</c>. US-008, BR-1.
/// </summary>
/// <remarks>
/// <para>
/// A sub-resource <c>PUT</c> rather than a <c>PATCH</c> on the ticket: a status change is a
/// distinct business action with its own rules and its own history row (`CLAUDE.md`).
/// </para>
/// <para>
/// Returns <see cref="CreateTicketResult"/> — the same DTO the create and the read return. The
/// contract's `200` body is the updated ticket, and a second shape for it would be a second thing
/// to keep in step. AC-23 depends on that reuse: <c>allowedTransitions</c> comes back recomputed
/// for the **new** status, from the same mapping.
/// </para>
/// </remarks>
public sealed record ChangeTicketStatusCommand(
    Guid TicketId,
    TicketStatus Status,
    string ExpectedVersion,
    string? Note = null) : IAuditableCommand<CreateTicketResult>
{
    public string AuditAction => "Ticket.StatusChanged";

    /// <summary>
    /// The ticket, on both paths — the id is on the command, so a denial or a conflict still names
    /// what it was refused against (`003` `research.md` R-8).
    /// </summary>
    public AuditTarget DescribeTarget(CreateTicketResult? response) =>
        new("Ticket", TicketId, response?.TicketNumber);
}
