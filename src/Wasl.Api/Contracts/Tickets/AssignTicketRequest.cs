namespace Wasl.Api.Contracts.Tickets;

/// <summary>
/// The request body, exactly as `contracts/ticket-assignee-api.md` freezes it. `011`.
/// </summary>
/// <remarks>
/// <para>
/// <b>A separate type from the command, and the difference is the ticket id</b> — the same reason
/// <see cref="ChangeTicketStatusRequest"/> is separate. The command carries the id; this does not.
/// Binding the command straight from the body would give the client a <c>TicketId</c> field it
/// could set, and a request whose route said one ticket and whose body said another would change
/// the one in the body, making the URL a suggestion.
/// </para>
/// <para>
/// <b><see cref="AssigneeId"/> defaults to <c>null</c>, and that default is load-bearing.</b>
/// <c>null</c> means unassign (AC-5), and the contract states that <b>omitting</b> the property is
/// treated the same way. Without the default, a body of <c>{"expectedVersion":"..."}</c> would
/// bind <c>AssigneeId</c> to <c>default</c> — which for <c>Guid?</c> is null anyway, so the
/// behaviour is the same either way; the default is written so the intent is not left to be
/// inferred from a language rule.
/// </para>
/// <para>
/// There is no <c>note</c> field. `011` writes an <c>Assigned</c> history row with the old and new
/// ids and nothing else — BR-2.6 asks for the event, not for a justification, and adding an
/// optional free-text field the timeline would then have to render is `013`'s decision to make,
/// not this feature's to pre-empt.
/// </para>
/// </remarks>
public sealed record AssignTicketRequest(
    string ExpectedVersion,
    Guid? AssigneeId = null);
