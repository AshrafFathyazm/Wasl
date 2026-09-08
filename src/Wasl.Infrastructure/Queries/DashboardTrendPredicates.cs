namespace Wasl.Infrastructure.Queries;

/// <summary>
/// The four attention predicates, in one place. `020b` `plan.md` §3.1.
/// </summary>
/// <remarks>
/// <para>
/// <b>Extracted so the READ and the CAPTURE cannot drift.</b> `020`'s
/// <c>DashboardAggregatesQuery.AttentionAsync</c> computes these counts for a request; `020b`'s
/// <c>DashboardSnapshotCapture</c> computes the same ones for a row that will be compared against
/// a future request. Two hand-written copies would agree the day they were written and disagree
/// after the first edit — and the symptom is a trend arrow that contradicts the number directly
/// above it by one, which is the least debuggable defect this feature could ship.
/// </para>
/// <para>
/// <b>Extracted BEFORE the capture existed, deliberately</b> (`plan.md` §2, step 2 before step
/// 3). While `020` is the only consumer, its 711 tests are the proof that the extraction changed
/// nothing. Writing the capture first and extracting afterwards would mean two consumers changing
/// in the same commit — introducing the drift that AC-4 exists to catch, inside the change meant
/// to prevent it.
/// </para>
/// <para>
/// <b>These are compile-time CONSTANTS interpolated into SQL text, never values.</b> `CLAUDE.md`
/// bans SQL built from user input; a <c>const string</c> is the opposite of that — it cannot
/// carry anything a caller supplied. Every value the statements need — the scope, the dates, the
/// thresholds — stays a parameter, exactly as it is in `020`.
/// </para>
/// <para>
/// <b>The table alias is fixed at <c>t</c>.</b> Both consumers alias <c>dbo.Tickets</c> that way,
/// and a predicate that silently assumes an alias is a predicate that fails to compile the moment
/// somebody renames one — which is the failure worth having, rather than one that binds to the
/// wrong table.
/// </para>
/// </remarks>
internal static class DashboardTrendPredicates
{
    /// <summary>
    /// Unassigned and not closed.
    /// </summary>
    /// <remarks>
    /// <b>Carries no scope clause, and that is the contract rather than an omission.</b> An
    /// unassigned ticket has no owner, so there is no "mine" version of it — scoping it would show
    /// every Agent <c>0</c> forever while being the most actionable number on the screen. `020`
    /// documents it on <c>DashboardAttention.UnassignedCount</c> and the snapshot inherits it.
    /// </remarks>
    public const string Unassigned =
        "t.AssignedToUserId IS NULL AND t.Status <> N'Closed'";

    /// <summary>
    /// Escalated, and neither resolved nor closed — BR-3.3 makes those two the non-actionable
    /// ones. Scoped by the caller.
    /// </summary>
    public const string EscalatedOpen =
        "t.IsEscalated = 1 AND t.Status NOT IN (N'Resolved', N'Closed')";

    /// <summary>Waiting on the customer. BR-1.4 — that clock is not ours. Scoped by the caller.</summary>
    public const string WaitingOnCustomer =
        "t.Status = N'PendingCustomer'";

    /// <summary>
    /// Assigned to somebody and not closed.
    /// </summary>
    /// <remarks>
    /// No tile shows this today. The snapshot captures it because it is the one number a trend on
    /// that table would obviously want next, and adding a column later is a migration while an
    /// unused one costs four bytes a day (`data-model.md`).
    /// </remarks>
    public const string Assigned =
        "t.AssignedToUserId IS NOT NULL AND t.Status <> N'Closed'";

    /// <summary>
    /// The scope clause both consumers apply: everything for a Manager, one assignee otherwise.
    /// </summary>
    /// <remarks>
    /// <b>It is a FORMAT, not a constant, because the two parameter names differ between the
    /// interpolated statements.</b> The shape is what matters — <c>(team = 1 OR assignee =
    /// user)</c> — and keeping it here means a change to the scoping rule is one edit rather than
    /// nine. REV-020-03's property is that the scope lives inside every predicate and is never a
    /// filter applied afterwards.
    /// </remarks>
    public static string ScopedBy(string teamParameter, string userParameter) =>
        $"({teamParameter} = 1 OR t.AssignedToUserId = {userParameter})";
}
