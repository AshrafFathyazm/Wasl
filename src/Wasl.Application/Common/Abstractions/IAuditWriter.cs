using Wasl.Domain.Audit;

namespace Wasl.Application.Common.Abstractions;

/// <summary>
/// Writes audit rows. <b>Two methods, and the difference between them is BR-9.4</b> — the
/// asymmetry `spec.md` calls the part to read twice.
/// </summary>
/// <remarks>
/// <para>
/// One method would be simpler and would be wrong. A successful mutation's row belongs
/// <i>inside</i> the business transaction, so a rollback takes it with it — otherwise the
/// table fills with rows describing changes that never happened. A denied or failed action
/// has no business transaction to join and must <i>survive</i> the rollback of the thing that
/// failed — otherwise the only durable record that someone was refused is destroyed by the
/// refusal.
/// </para>
/// <para>
/// Both failures are invisible: the first leaves orphan rows nobody reconciles, the second
/// loses exactly the rows an incident investigation looks for. AC-6, AC-8, and AC-9 exist for
/// this and nothing else.
/// </para>
/// <para>
/// Declared here and implemented in <c>Wasl.Infrastructure</c>, because the second method
/// needs a second <c>DbContext</c> on its own connection (`research.md` R-2) and this project
/// cannot see EF Core.
/// </para>
/// </remarks>
public interface IAuditWriter
{
    /// <summary>
    /// Enrols the row in the caller's transaction. Used on the success path only.
    /// </summary>
    /// <remarks>
    /// If this insert fails, the business change must not commit (AC-7): a mutation that
    /// cannot be audited must not happen. That falls out of being in the same transaction —
    /// it is not a decision the caller makes.
    /// </remarks>
    Task WriteInTransactionAsync(AuditEntry entry, CancellationToken cancellationToken);

    /// <summary>
    /// Writes on a separate connection, so the row commits while the caller's transaction
    /// rolls back. Used on the denial and failure paths.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Takes no <see cref="CancellationToken"/>, deliberately</b> (AC-10). The token that
    /// would be passed is the request's, and the request is the thing that just failed — a
    /// client disconnecting mid-failure must still leave the audit row. Cancelling this write
    /// would lose the record precisely in the case where someone abandoned a request that was
    /// being refused.
    /// </para>
    /// <para>
    /// <b>Never throws</b> (AC-11). If the write itself fails, the implementation logs it in
    /// English (BR-9.10) and returns, so the original exception reaches the error middleware
    /// unchanged. Replacing a `403` with a `500` because the audit write failed would hide the
    /// failure being audited behind the failure to audit it.
    /// </para>
    /// </remarks>
    Task WriteIndependentAsync(AuditEntry entry);
}
