using Wasl.Domain.Common.Exceptions;

namespace Wasl.Domain.Tickets;

/// <summary>
/// `011` AC-11. The request names the assignee the ticket already has, or sends <c>null</c> for a
/// ticket that is already unassigned.
/// </summary>
/// <remarks>
/// <para>
/// A <c>409</c> and never a no-op <c>200</c> — the same rule and the same reason as
/// <see cref="SameStatusTransitionException"/>: a <c>200</c> tells the client its request was
/// applied when nothing happened, so two clients disagree about what the last write was.
/// </para>
/// <para>
/// Its own error code, because the client's correct reaction is to refetch quietly. This is what
/// a double-click on the assignee picker produces, and reporting a rule violation for a
/// double-click is a lie about the interaction.
/// </para>
/// <para>
/// It names neither the current assignee nor the requested one. A `409` on this path can be
/// reached by an Agent who is permitted to act, so it is not a denial — but the response still
/// has no reason to disclose ownership, which the ticket read supplies legitimately.
/// </para>
/// </remarks>
public sealed class AssigneeUnchangedException()
    : DomainException(DomainErrorCodes.AssigneeUnchanged, "Error.Ticket.AssigneeUnchanged");

/// <summary>
/// `011` AC-7. The support user named as the assignment target does not exist.
/// </summary>
/// <remarks>
/// <para>
/// <b>Distinct from <see cref="NotFoundException"/>, which addresses the ticket.</b> One request
/// can fail either way, and the client's reaction differs completely: an unknown ticket means the
/// page is stale and should be reloaded, an unknown assignee means the picker is stale and should
/// be refreshed. Collapsing both into `404 errors/not-found` forces the client to guess which of
/// the two it is holding out of date.
/// </para>
/// <para>
/// <b>Raised in the handler, not here in the domain</b> — the domain has no way to look a user
/// up, and <c>Ticket.Assign</c> deliberately takes a bare <c>Guid?</c> rather than a
/// <c>SupportUser</c>, so the entity does not reach across an aggregate boundary. The type lives
/// beside its sibling because they are the same feature's vocabulary.
/// </para>
/// </remarks>
public sealed class AssigneeNotFoundException()
    : DomainException(DomainErrorCodes.AssigneeNotFound, "Error.Ticket.AssigneeNotFound");

/// <summary>
/// `011` AC-6, BR-2.4. The named support user exists and is not active.
/// </summary>
/// <remarks>
/// <para>
/// <b>A `400` with the error on <c>assigneeId</c>, not a `404`.</b> The user exists — the request
/// is what is wrong (`spec.md` Q-2). A `404` would tell the client the id was wrong and send it
/// looking for a typo that is not there.
/// </para>
/// <para>
/// <b>The field name is the point.</b> The message is translated (BR-8.6) and the key is not
/// (BR-8.7), so <c>errors.assigneeId</c> is what tells the client to render the message on the
/// picker and refresh its list. A `400` with no field key leaves it with a sentence and nowhere
/// to put it.
/// </para>
/// <para>
/// <b>Raised in the handler, not the entity.</b> "Is this user active" is a row in another table;
/// <c>Ticket.Assign</c> takes a bare <c>Guid?</c> precisely so the entity does not reach across an
/// aggregate boundary to find out.
/// </para>
/// </remarks>
public sealed class AssigneeInactiveException()
    : DomainException(DomainErrorCodes.Validation, "Validation.Ticket.AssigneeInactive")
{
    public override IReadOnlyDictionary<string, string[]> FieldErrors { get; } =
        new Dictionary<string, string[]> { ["assigneeId"] = ["Validation.Ticket.AssigneeInactive"] };
}
