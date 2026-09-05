using Microsoft.Data.SqlClient;

namespace Wasl.Infrastructure.Persistence;

/// <summary>
/// Recognises the engine conditions `036` and `036b` translate. One implementation, two callers.
/// </summary>
/// <remarks>
/// <para>
/// <b>Extracted by `036b` from <c>WaslDbContext</c>, where `036` first wrote it.</b> A second
/// caller arrived — <c>TransientFailureBehaviour</c> — and two private copies of the same
/// predicate is how the write path and the read path come to disagree about what a deadlock is.
/// </para>
/// <para>
/// The interesting logic here is not the error number; it is the <b>walk</b>. See
/// <see cref="IsDeadlockVictim"/>.
/// </para>
/// </remarks>
internal static class TransientFailure
{
    /// <summary>
    /// SQL Server error 1205 — this session was chosen as the deadlock victim.
    /// </summary>
    /// <remarks>
    /// <b>1205 and nothing else.</b> 1222 (lock request timeout) is deliberately excluded: a
    /// timeout does not prove the work was rolled back, so advising a retry could double a write
    /// that eventually commits. A 1205 victim's batch is already rolled back by the engine, which
    /// is what makes the retry advice safe to give.
    /// </remarks>
    public const int DeadlockVictimErrorNumber = 1205;

    /// <summary>
    /// Whether this exception, or anything it wraps, is a deadlock victim.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>The walk is the whole point, and `036` measured why.</b> A deadlock does NOT arrive as
    /// a <c>DbUpdateException</c>: EF Core's <c>SqlServerExecutionStrategy</c> catches the
    /// transient failure and rethrows it inside an <c>InvalidOperationException</c> carrying the
    /// advisory *"Consider enabling transient error resiliency by adding 'EnableRetryOnFailure'"*,
    /// with the real <c>DbUpdateException → SqlException(1205)</c> underneath.
    /// </para>
    /// <para>
    /// `036`'s first attempt matched on the wrapper type and therefore translated <b>nothing</b>,
    /// while the code read as though it worked — the induced-deadlock test reported
    /// <c>found {InvalidOperationException}</c>. So the match is on the chain: <b>the wrapper
    /// belongs to EF and can change; the error number belongs to SQL Server and cannot.</b>
    /// </para>
    /// <para>
    /// A depth cap rather than a bare loop, because an exception chain can be cyclic — a
    /// hand-constructed one, or an <c>AggregateException</c> holding itself — and an infinite
    /// walk inside an exception handler is a hang with no stack to read.
    /// </para>
    /// </remarks>
    public static bool IsDeadlockVictim(Exception? exception)
    {
        const int maxDepth = 16;

        var candidate = exception;

        for (var depth = 0; candidate is not null && depth < maxDepth; depth++)
        {
            if (candidate is SqlException sql && sql.Number == DeadlockVictimErrorNumber)
            {
                return true;
            }

            candidate = candidate.InnerException;
        }

        return false;
    }
}
