namespace Wasl.Domain.Common.Exceptions;

/// <summary>
/// The database refused the write for a transient reason and the request was not applied.
/// Mapped to <c>503 errors/transient-conflict</c>. `036` §3.3, AC-8.
/// </summary>
/// <remarks>
/// <para>
/// <b>Today this means one thing: SQL Server chose this request as a deadlock victim (error
/// 1205).</b> The engine has already rolled the batch back, so nothing was written, and the
/// same request run again is very likely to succeed — which is exactly what makes an untyped
/// `500` the wrong answer. A `500` says *something is broken*; this says *nothing happened,
/// try again.*
/// </para>
/// <para>
/// <b>`503` and not `409`.</b> A `409` in this API means a business rule refused — a duplicate,
/// a forbidden transition, a stale version — and every one of them is a fact about the request
/// that a retry cannot change. A deadlock is a fact about two requests overlapping in time and
/// says nothing about either one. Folding it into `409` would put a retryable failure in the
/// bucket the client is told never to retry.
/// </para>
/// <para>
/// <b>Route A of `036` Q-3, ruled 2026-09-05.</b> The alternative was to retry inside the
/// server with <c>EnableRetryOnFailure</c> and an <c>ExecutionStrategy</c>. That was turned
/// down because the retried delegate must be idempotent and a create handler is not: it has
/// already drawn a value from <c>dbo.TicketNumberSeq</c>, and sequence values are not returned
/// on rollback. So an in-server retry burns numbers per attempt and, more importantly, would
/// have required rewriting <c>TransactionBehaviour</c> — the one class `003` research.md R-15
/// fixed in place. **The client retries. The server tells it that it may.**
/// </para>
/// </remarks>
public sealed class TransientConflictException(Exception? cause = null, int retryAfterSeconds = 1)
    : DomainException(DomainErrorCodes.TransientConflict, "Error.TransientConflict", cause), IRetryAfterHint
{
    /// <inheritdoc />
    /// <remarks>
    /// One second. The contention is already gone by the time the client reads this header — the
    /// engine resolved the deadlock the instant it killed the victim — so the value exists to
    /// stop an immediate retry landing inside the winner's still-open transaction, not to wait
    /// out a queue.
    /// </remarks>
    public int RetryAfterSeconds { get; } = Math.Max(1, retryAfterSeconds);
}
