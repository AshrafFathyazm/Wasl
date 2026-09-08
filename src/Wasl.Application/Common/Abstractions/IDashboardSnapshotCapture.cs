namespace Wasl.Application.Common.Abstractions;

/// <summary>
/// Writes down what the dashboard's attention levels are, for one local day. `020b`.
/// </summary>
/// <remarks>
/// <para>
/// <b>Declared here so the scheduler can trigger a capture without naming EF Core.</b> The
/// implementation is <c>Wasl.Infrastructure.Queries.DashboardSnapshotCapture</c> — raw SQL over
/// tables that are not on <c>IApplicationDbContext</c> — and this interface is the whole of what
/// anything outside that project needs to know about it.
/// </para>
/// <para>
/// <b>Idempotent per (day, scope), by the database rather than by this contract.</b> Calling it
/// twice for the same day updates the row rather than adding one, because
/// <c>UX_DashboardDailySnapshot_Date_Scope</c> refuses the second insert. An implementation that
/// achieved idempotency by reading first and deciding would be the check-then-act `CLAUDE.md`
/// names, and it would be wrong under two instances.
/// </para>
/// <para>
/// <b>It is not an <c>ICommand</c> and writes no audit row.</b> A snapshot is derived data, not a
/// state change a person made — BR-9 audits the latter. It also runs with no principal at all:
/// the capture takes its scope from the <c>SupportUsers</c> rows it is capturing for, never from
/// an ambient user (`spec.md` AC-16).
/// </para>
/// </remarks>
public interface IDashboardSnapshotCapture
{
    /// <summary>
    /// Captures every scope's levels for <paramref name="localDate"/>, as they are right now.
    /// </summary>
    /// <param name="localDate">
    /// The BUSINESS date the row is filed under, in the organisation's timezone. The caller
    /// decides which day this is; the capture never infers it, because inferring it is what turns
    /// a late run into a row filed under the wrong day.
    /// </param>
    /// <param name="capturedAtUtc">
    /// When the capture ran. Stored beside <paramref name="localDate"/> so a row that ran late is
    /// distinguishable from one that ran on time.
    /// </param>
    /// <remarks>
    /// <b>No return value, deliberately.</b> A count would be the only thing a caller could
    /// assert against, and `CLAUDE.md` says assert CONTENT rather than presence — a test that read
    /// back "3" would stay green on a capture that wrote three rows of zeros. The tests read the
    /// table.
    /// </remarks>
    Task CaptureAsync(
        DateOnly localDate,
        DateTime capturedAtUtc,
        CancellationToken cancellationToken);
}
