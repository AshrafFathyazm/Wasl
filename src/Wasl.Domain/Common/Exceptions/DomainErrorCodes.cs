namespace Wasl.Domain.Common.Exceptions;

/// <summary>
/// The stable machine-readable codes a domain rule can report.
/// </summary>
/// <remarks>
/// <para>
/// These are <b>strings, not status codes</b>. `Wasl.Domain` has zero package references
/// (ADR-002, Principle III), so it cannot name <c>StatusCodes.Status409Conflict</c> — and
/// it should not want to. The domain says <i>which rule was broken</i>; the API decides
/// what that means over HTTP, in
/// <c>Wasl.Api/Common/Errors/ProblemTypes.cs</c>.
/// </para>
/// <para>
/// An <c>int HttpStatus</c> property here would be "just an integer", which is exactly how
/// this boundary erodes — see <c>research.md</c> R-2.
/// </para>
/// <para>
/// Every code below must have a registry row. A code without one degrades into
/// <c>500 errors/internal</c>, indistinguishable from a genuine bug, so an architecture
/// test asserts the mapping is total (AC-14) rather than trusting this comment.
/// </para>
/// </remarks>
public static class DomainErrorCodes
{
    /// <summary>An invariant that must hold regardless of caller was violated.</summary>
    public const string Validation = "validation";

    /// <summary>A uniqueness rule rejected the value. BR-4.4, BR-4.5.</summary>
    public const string DuplicateCustomer = "duplicate-customer";

    /// <summary>The addressed resource does not exist.</summary>
    public const string NotFound = "not-found";

    /// <summary>The BR-1 matrix does not permit the requested transition.</summary>
    public const string InvalidStatusTransition = "invalid-status-transition";

    /// <summary><c>Closed</c> is terminal. BR-1.5.</summary>
    public const string TicketClosed = "ticket-closed";

    /// <summary>The ticket is already escalated. BR-3.4.</summary>
    public const string AlreadyEscalated = "already-escalated";

    /// <summary><c>expectedVersion</c> is stale. ADR-006.</summary>
    public const string ConcurrencyConflict = "concurrency-conflict";
}
