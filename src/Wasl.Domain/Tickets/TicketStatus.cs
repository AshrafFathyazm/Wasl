namespace Wasl.Domain.Tickets;

/// <summary>
/// The six states of a ticket. BR-1.
/// </summary>
/// <remarks>
/// Persisted as a string (ADR-013), so a database dump is readable and reordering the members
/// cannot silently re-label existing rows. The <b>order of declaration carries no meaning</b> —
/// `TicketStatusTransitions` is the only thing that says what may follow what, and reading a
/// workflow out of enum ordering is how a state machine ends up in two places.
/// </remarks>
public enum TicketStatus
{
    /// <summary>Reported, not yet triaged. Every ticket starts here (BR-1.1).</summary>
    New,

    /// <summary>Triaged and accepted, not yet being worked.</summary>
    Open,

    /// <summary>Being worked. <b>Requires an assignee</b> — BR-1.</summary>
    InProgress,

    /// <summary>Waiting on the customer.</summary>
    PendingCustomer,

    /// <summary>Fixed, awaiting close.</summary>
    Resolved,

    /// <summary>Terminal. No reopen, reassign, escalate, or comment (BR-1.5).</summary>
    Closed,
}
