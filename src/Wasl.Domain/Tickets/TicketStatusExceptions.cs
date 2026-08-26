using Wasl.Domain.Common.Exceptions;

namespace Wasl.Domain.Tickets;

/// <summary>
/// BR-1.5. <c>Closed</c> is terminal — no reopen, reassign, escalate, or comment.
/// </summary>
/// <remarks>
/// Raised before the same-status check, so <c>Closed → Closed</c> reports this rather than
/// <c>same-status-transition</c>. "This ticket is finished" is the more useful answer, and
/// reloading will not change it.
/// </remarks>
public sealed class TicketClosedException()
    : DomainException(DomainErrorCodes.TicketClosed, "Error.Ticket.Closed");

/// <summary>
/// BR-1.9. The requested status equals the current one.
/// </summary>
/// <remarks>
/// A <c>409</c> and never a no-op <c>200</c>: a <c>200</c> would tell the client its request was
/// applied when nothing happened. Its own error code, because the client's correct reaction is
/// to refetch quietly — the user double-clicked and did nothing wrong.
/// </remarks>
public sealed class SameStatusTransitionException(TicketStatus current)
    : DomainException(DomainErrorCodes.SameStatusTransition, "Error.Ticket.SameStatus", current.ToString());

/// <summary>
/// BR-1. The BR-1 matrix does not contain this cell.
/// </summary>
/// <remarks>
/// Carries the current status and what <b>is</b> permitted from it (AC-3), so the client can
/// offer a real alternative instead of a dead end. The permitted list is the
/// precondition-aware one — telling a client it may move to <c>InProgress</c> when the ticket
/// has no assignee would replace one refused action with another.
/// </remarks>
public sealed class InvalidStatusTransitionException(
    TicketStatus current,
    IReadOnlyList<TicketStatus> allowed)
    : DomainException(
        DomainErrorCodes.InvalidStatusTransition,
        "Error.Ticket.InvalidTransition",
        current.ToString(),
        string.Join(", ", allowed))
{
    public TicketStatus CurrentStatus { get; } = current;

    public IReadOnlyList<TicketStatus> Allowed { get; } = allowed;
}

/// <summary>
/// BR-1.3. The target is <c>InProgress</c> and the ticket has no assignee.
/// </summary>
/// <remarks>
/// Its own code because the client's reaction is to offer the Assign action, not a different
/// transition. Folding it into <c>invalid-status-transition</c> would make those two
/// indistinguishable without parsing English.
/// </remarks>
public sealed class AssigneeRequiredException()
    : DomainException(DomainErrorCodes.AssigneeRequired, "Error.Ticket.AssigneeRequired");

/// <summary>
/// BR-1.2. Closing from <c>New</c> or <c>Open</c> without a note.
/// </summary>
/// <remarks>
/// <para>
/// A <c>400</c>, not a <c>409</c> — the request is malformed for what it is asking, rather than
/// in conflict with the ticket's state. It names <c>note</c> as the offending field, which is
/// why it carries a field error.
/// </para>
/// <para>
/// Only from <c>New</c> or <c>Open</c>: closing work that was never started needs a reason.
/// `spec.md` Q-1 declined to require one on <c>Resolved → Closed</c>, because demanding a
/// reason for the expected outcome trains people to type nothing useful.
/// </para>
/// </remarks>
public sealed class NoteRequiredException(TicketStatus current)
    : DomainException(DomainErrorCodes.Validation, "Validation.Ticket.NoteRequiredToClose", current.ToString())
{
    /// <summary>
    /// Puts the message under <c>note</c> in the <c>errors</c> object, so a form can highlight
    /// the field the user has to fill rather than showing a banner.
    /// </summary>
    public override IReadOnlyDictionary<string, string[]> FieldErrors { get; } =
        new Dictionary<string, string[]> { ["note"] = ["Validation.Ticket.NoteRequiredToClose"] };
}
