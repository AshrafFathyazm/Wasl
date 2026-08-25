using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Audit;

namespace Wasl.Infrastructure.Persistence.Audit;

/// <summary>
/// The two write paths BR-9.4 requires. `research.md` R-2.
/// </summary>
internal sealed class AuditWriter(
    WaslDbContext context,
    IDbContextFactory<WaslDbContext> contextFactory,
    ILogger<AuditWriter> logger) : IAuditWriter
{
    /// <summary>
    /// Adds the row to the request's own <c>DbContext</c>, so it commits or rolls back with
    /// the business change.
    /// </summary>
    /// <remarks>
    /// AC-7 falls out of this rather than being implemented: if the audit insert fails, the
    /// whole transaction fails, so a mutation that cannot be audited does not happen. Nothing
    /// here catches anything — catching would be what breaks it.
    /// </remarks>
    public async Task WriteInTransactionAsync(AuditEntry entry, CancellationToken cancellationToken)
    {
        context.AuditLog.Add(entry);
        await context.SaveChangesAsync(cancellationToken);
    }

    /// <summary>
    /// Writes on a second connection so the row survives the rollback of the thing that
    /// failed.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>A separate <c>DbContext</c> from the factory, not the request's.</b> The request's
    /// context is enrolled in the transaction that is about to roll back, so adding the row
    /// there would create it and then destroy it — the request would still return the right
    /// status, the log would still show the error, and the only durable record that someone
    /// was denied would be gone. That is the failure BR-9.4 exists to prevent, and it leaves
    /// no trace of itself.
    /// </para>
    /// <para>
    /// <b><c>CancellationToken.None</c>, deliberately (AC-10).</b> The request's token is
    /// already cancelled or about to be — this write is happening <i>because</i> the request
    /// failed. Threading the request token here would drop the audit row exactly when a client
    /// disconnected mid-refusal, which is the case an investigation cares most about.
    /// </para>
    /// <para>
    /// <b>Catches everything, and rethrows nothing (AC-11).</b> The caller is in a catch block
    /// holding the original exception. Letting an audit failure escape from here would replace
    /// that exception with this one, so a `403` would surface as a `500` and the failure being
    /// audited would be hidden behind the failure to audit it. Logged in English (BR-9.10) at
    /// <c>Error</c>, because a silent audit gap is worse than a noisy one.
    /// </para>
    /// <para>
    /// <b>No deadlock</b> (`spec.md` A-6): on this path the business transaction has never
    /// inserted into <c>AuditLog</c>, so the two connections touch disjoint objects. BR-9.1's
    /// "exactly one row" is what keeps that true.
    /// </para>
    /// </remarks>
    public async Task WriteIndependentAsync(AuditEntry entry)
    {
        try
        {
            await using var independent = await contextFactory.CreateDbContextAsync(CancellationToken.None);

            independent.AuditLog.Add(entry);
            await independent.SaveChangesAsync(CancellationToken.None);
        }
        catch (Exception exception)
        {
            logger.LogError(
                exception,
                "Failed to write the independent audit row for action {AuditAction} with outcome "
                + "{AuditOutcome} and trace {TraceId}. The original failure is unaffected and is "
                + "reported separately.",
                entry.Action,
                entry.Outcome,
                entry.TraceId);
        }
    }
}
