using Wasl.Application.Common.Messaging;
using Wasl.Application.Features.Tickets.CreateTicket;
using Wasl.Domain.Audit;

namespace Wasl.Application.Features.Tickets.AssignTicket;

/// <summary>
/// <c>PUT /api/tickets/{id}/assignee</c>. US-007, BR-2.
/// </summary>
/// <remarks>
/// <para>
/// A sub-resource <c>PUT</c> rather than a <c>PATCH</c> on the ticket, for the same reason
/// <c>012</c>'s status change is one: assignment is a distinct business action with its own rules
/// and its own history row (`CLAUDE.md`).
/// </para>
/// <para>
/// <b><see cref="AssigneeId"/> is nullable and that is the API, not a convenience.</b> <c>null</c>
/// means unassign (AC-5). There is no separate <c>DELETE</c>, because unassigning obeys the same
/// BR-2 permission rules as assigning — an Agent may hand back their own ticket and may not take
/// someone else's away — and a second endpoint would be a second place to enforce them.
/// </para>
/// <para>
/// Returns <see cref="CreateTicketResult"/>, the same DTO every ticket endpoint returns, now
/// carrying the nested <c>Assignee</c> object `011`'s contract froze.
/// </para>
/// </remarks>
public sealed record AssignTicketCommand(
    Guid TicketId,
    Guid? AssigneeId,
    string ExpectedVersion) : IAuditableCommand<CreateTicketResult>
{
    /// <summary>
    /// <c>Ticket.Assigned</c> on both paths, including an unassign.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>One action name, and the outcome column carries the rest</b> — the rule `004` R-18
    /// settled after a failed sign-in wrote <c>Auth.LoginSucceeded / Failed</c>. The audit action
    /// is evaluated on the success and the failure path alike from a single property, so a name
    /// that encodes the result is a row that can contradict itself.
    /// </para>
    /// <para>
    /// It does not distinguish assign from unassign either, although <c>TicketHistory</c> does
    /// with two event types. The two tables answer different questions: the history is a product
    /// timeline a user reads, where "handed back" and "handed over" are different sentences; the
    /// audit log is a forensic index, where "who changed ownership of this ticket, and was it
    /// allowed" is one query. ADR-008.
    /// </para>
    /// </remarks>
    public string AuditAction => "Ticket.Assigned";

    /// <summary>
    /// The ticket, on both paths — the id is on the command, so a denial still names what it was
    /// refused against (`003` `research.md` R-8).
    /// </summary>
    /// <remarks>
    /// This is what makes AC-17 possible. A `403` raised in the handler reaches
    /// <c>AuditBehaviour</c>, which calls this with <c>null</c> and writes an independent row
    /// naming the ticket, the actor, and the traceId of the response. A `403` produced by an
    /// authorization policy would never get here.
    /// </remarks>
    public AuditTarget DescribeTarget(CreateTicketResult? response) =>
        new("Ticket", TicketId, response?.TicketNumber);
}
