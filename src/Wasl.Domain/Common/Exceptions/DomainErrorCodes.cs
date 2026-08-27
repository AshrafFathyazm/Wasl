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

    /// <summary>
    /// The requested status equals the current one. BR-1.9.
    /// </summary>
    /// <remarks>
    /// <b>Its own code rather than folding into <see cref="InvalidStatusTransition"/></b>
    /// (`012` `spec.md` Q-3). The client's correct reaction differs: a same-status `409` means
    /// refetch quietly, because the user did nothing wrong and telling them they attempted
    /// something forbidden is a lie about a double-click. A client cannot tell the two apart
    /// without parsing an English sentence.
    /// </remarks>
    public const string SameStatusTransition = "same-status-transition";

    /// <summary>
    /// The target status is <c>InProgress</c> and the ticket has no assignee. BR-1.3.
    /// </summary>
    /// <remarks>
    /// Also its own code, for the same reason: this one means "offer the Assign action", not
    /// "offer a different transition".
    /// </remarks>
    public const string AssigneeRequired = "assignee-required";

    /// <summary><c>Closed</c> is terminal. BR-1.5.</summary>
    public const string TicketClosed = "ticket-closed";

    /// <summary>The ticket is already escalated. BR-3.4.</summary>
    public const string AlreadyEscalated = "already-escalated";

    /// <summary><c>expectedVersion</c> is stale. ADR-006.</summary>
    public const string ConcurrencyConflict = "concurrency-conflict";

    /// <summary>
    /// The actor is authenticated but not permitted to do this. BR-2, BR-6.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Added by `003`, and the reason is worth keeping.</b> `002` reserved a
    /// <c>forbidden</c> registry row for `004`, on the understanding that a `403` is produced
    /// by the auth middleware. That is true for a role-only check — and it means the middleware
    /// throws nothing, so MediatR never sees it and the audit pipeline cannot record it.
    /// </para>
    /// <para>
    /// But BR-6 also has <b>data-dependent</b> checks — "is this user the assignee?" — which
    /// `CLAUDE.md` puts in the handler, not in a policy. Those are raised as a
    /// <c>DomainException</c> carrying this code, and they are the denials
    /// <c>AuditOutcomeClassifier</c> classifies as <c>Denied</c> rather than <c>Failed</c>
    /// (`spec.md` Q-4). Without this code the classifier would have nothing to key on and
    /// every in-handler denial would be recorded as a failure — the distinction an incident
    /// investigation is looking for, lost.
    /// </para>
    /// </remarks>
    public const string Forbidden = "forbidden";

    /// <summary>
    /// The credentials were not accepted, or no credentials were supplied. `004`.
    /// </summary>
    /// <remarks>
    /// Added by `004` for the same reason `Forbidden` was added by `003`: `002` reserved the
    /// registry row for a status the auth middleware produces, and a middleware `401` throws
    /// nothing. This code is for the one `401` that IS raised in a handler — a rejected sign-in,
    /// which is a domain outcome rather than an absent token.
    /// </remarks>
    public const string Unauthenticated = "unauthenticated";
}
