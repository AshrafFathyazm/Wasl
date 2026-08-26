namespace Wasl.Domain.Common.Exceptions;

/// <summary>
/// The caller's <c>expectedVersion</c> does not match the row. ADR-006, `012` AC-17.
/// </summary>
/// <remarks>
/// <para>
/// <b>Added by `012`</b>, and `002` had already reserved the registry row — the code and its
/// `409` existed with nothing able to raise them, because nothing could be edited yet.
/// </para>
/// <para>
/// <b>Raised from an explicit comparison, not caught from EF Core.</b>
/// <c>DbUpdateConcurrencyException</c> would only surface after the write is attempted, which
/// means the rule is enforced by whichever save happens to run — and any rule evaluated before
/// that save has already judged a stale request against a state the client never saw.
/// `012`'s contract fixes the version check <b>before</b> the transition rules for exactly that
/// reason: get it backwards and every stale UI reports a rule violation that does not exist.
/// </para>
/// <para>
/// It carries no detail about the current state. Telling a client what changed invites it to
/// merge, and the answer is to reload — a partial merge of a state machine is how a ticket ends
/// up in a status nobody chose.
/// </para>
/// </remarks>
public sealed class ConcurrencyConflictException()
    : DomainException(DomainErrorCodes.ConcurrencyConflict, "Error.Ticket.ConcurrencyConflict");
