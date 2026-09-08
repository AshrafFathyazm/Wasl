using Wasl.Application.Common.Messaging;
using Wasl.Domain.Audit;
using Wasl.Application.Features.Tickets.CreateTicket;

namespace Wasl.Application.Features.Tickets.EscalateTicket;

/// <summary>
/// <c>POST /api/tickets/{id}/escalate</c>. US-009, BR-3. `016`.
/// </summary>
/// <remarks>
/// <para>
/// <b>A sub-resource <c>POST</c>, not a field on <c>PUT /api/tickets/{id}</c></b>, for the reason
/// <c>05-api-conventions.md</c> gives for <c>/status</c> and <c>/assignee</c>: escalation is a
/// distinct business action with its own rule, its own authorization and its own history entry. A
/// generic patch accepting <c>isEscalated</c> would also make <c>isEscalated: false</c>
/// expressible, which BR-3.9 forbids.
/// </para>
/// <para>
/// <b>It returns the full ticket read shape</b> — the same one <c>GET /api/tickets/{id}</c>
/// returns — so the client replaces its cached copy rather than merging into it. Merging is how a
/// client ends up with the new <c>isEscalated</c> and the old <c>priority</c>, which is precisely
/// the pair escalation changes together.
/// </para>
/// <para>
/// <b>An <c>IAuditableCommand</c></b>, so `003`'s pipeline opens the transaction and writes the
/// BR-9.3 audit row in it. The ticket update, both history rows and the audit row land together
/// or not at all.
/// </para>
/// </remarks>
/// <param name="TicketId">From the route. A malformed one never reaches here — the
/// <c>{id:guid}</c> constraint fails the route match and `002b` answers.</param>
/// <param name="Reason">
/// 1 to 500 characters, measured AFTER trimming (BR-3.5, AC-5) — so 500 characters plus a
/// trailing newline is accepted and stored at 500. Trimmed by <c>Ticket.Escalate</c>, which is
/// the one place that can guarantee the stored value has no trailing whitespace whatever any
/// caller passes.
/// </param>
/// <param name="ExpectedVersion">
/// The base64 <c>rowversion</c> the client read. <b>Required</b>, matching <c>/status</c> and
/// <c>/assignee</c>: a client that has to remember which of three ticket mutations carries a
/// version will forget on one of them, and the one it forgets is a silent lost update.
/// </param>
public sealed record EscalateTicketCommand(
    Guid TicketId,
    string Reason,
    string ExpectedVersion) : IAuditableCommand<CreateTicketResult>
{
    /// <summary>BR-3.5. Measured after trimming.</summary>
    public const int ReasonMaxLength = 500;

    /// <summary>BR-9.3. The audit action, and it matches the history row's event type.</summary>
    public string AuditAction => "Ticket.Escalated";

    /// <summary>
    /// The ticket, on both paths — the id is on the command, so a denial or a conflict still names
    /// what it was refused against (`003` `research.md` R-8).
    /// </summary>
    public AuditTarget DescribeTarget(CreateTicketResult? response) =>
        new("Ticket", TicketId, response?.TicketNumber);
}
