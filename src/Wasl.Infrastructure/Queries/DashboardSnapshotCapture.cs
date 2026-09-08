using System.Runtime.CompilerServices;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Wasl.Application.Common.Abstractions;
using Wasl.Infrastructure.Persistence;
using Wasl.Infrastructure.Persistence.Configurations;

namespace Wasl.Infrastructure.Queries;

/// <summary>
/// Writes one row per scope per local day into <c>dbo.DashboardDailySnapshot</c>. `020b`.
/// </summary>
/// <remarks>
/// <para>
/// <b>Three statements in ONE round trip, and the cost does not grow with the team.</b> A temp
/// table holds the levels for every scope, the <c>UPDATE</c> refreshes the rows that exist and the
/// <c>INSERT</c> adds the ones that do not. Ten agents cost the same as one — a per-scope loop
/// would have been eleven round trips a day, which is affordable and is still the shape that
/// becomes a problem the first time somebody calls it per request.
/// </para>
/// <para>
/// <b>The predicates come from <see cref="DashboardTrendPredicates"/>, shared with the read.</b>
/// That is the whole reason those constants exist: a snapshot that counted "unassigned" even
/// slightly differently from `020`'s tile would produce a trend arrow contradicting the number
/// directly above it, by one, forever.
/// </para>
/// <para>
/// <b><c>UPDATE</c>-then-<c>INSERT</c>, not <c>MERGE</c></b> (`research.md` R-2). <c>MERGE</c> is
/// not atomic against a concurrent insert without <c>HOLDLOCK</c>, and a statement whose
/// correctness lives in a lock hint is a statement somebody deletes the hint from. The bare pair
/// IS check-then-act — which is precisely why <b>the unique index is the guarantee</b> and the
/// duplicate-key violation is caught and read as <i>the other instance won</i>.
/// </para>
/// </remarks>
internal sealed class DashboardSnapshotCapture(WaslDbContext context) : IDashboardSnapshotCapture
{
    /// <summary>
    /// The scope clause inside the level counts.
    /// </summary>
    /// <remarks>
    /// <c>s.ScopeUserId IS NULL</c> is the TEAM row, and it has to be spelled out rather than
    /// written as <c>t.AssignedToUserId = s.ScopeUserId</c> alone: <c>= NULL</c> matches nothing,
    /// so the team's counts would all be zero and nothing would report an error.
    /// </remarks>
    private const string Scoped =
        "(s.ScopeUserId IS NULL OR t.AssignedToUserId = s.ScopeUserId)";

    public async Task CaptureAsync(
        DateOnly localDate,
        DateTime capturedAtUtc,
        CancellationToken cancellationToken)
    {
        try
        {
            await RunAsync(localDate, capturedAtUtc, cancellationToken);
        }
        catch (SqlException exception) when (IsSnapshotDuplicate(exception))
        {
            /* THE OTHER INSTANCE WON, AND THAT IS SUCCESS.
             *
             * The `INSERT … WHERE NOT EXISTS` is check-then-act: two captures can both find no row
             * and both insert. The unique index refuses the loser, which arrives here as
             * 2601/2627 — meaning the day's row now exists, written by somebody else, which is the
             * outcome this method was asked for.
             *
             * Re-run ONCE, which now takes the UPDATE branch and refreshes the winner's row with
             * this instance's numbers. **Not a loop**: a second collision would mean a third
             * writer, and a retry loop inside a background job is how contention becomes a spin.
             * A second failure propagates to the caller's catch, which logs and waits for the next
             * tick.
             *
             * NOT TRANSLATED into a domain exception, and NOT added to
             * `WaslDbContext.TranslateDuplicate`. That list turns an index violation into a
             * readable `409` for a CALLER; this has none — it runs in a loop with nobody to
             * answer. */
            await RunAsync(localDate, capturedAtUtc, cancellationToken);
        }
    }

    private Task RunAsync(DateOnly localDate, DateTime capturedAtUtc, CancellationToken cancellationToken)
    {
        /* THE SCOPE SPINE: the team, then every ACTIVE support user.
         *
         * `NULL` first, by `UNION ALL` over a literal — the same shape `020`'s status and channel
         * spines use, and for the same reason: the set of scopes is a fact about the product, not
         * about the tickets, so it comes from the left of the query rather than from whatever
         * happens to have work assigned.
         *
         * INACTIVE users are excluded from the CAPTURE while `020`'s team-load card still RENDERS
         * one that holds open work. That is deliberate and not a contradiction: the card answers
         * "who is holding what right now", and a deactivated account holding tickets is exactly
         * what a manager needs to see — while a TREND for somebody who cannot sign in answers
         * nothing and would grow this table by a row a day forever.
         *
         * `{0}` is the local date and `{1}` the capture instant; both are FormattableString
         * arguments, so both are parameters. The predicates are compile-time constants — see
         * `DashboardAggregatesQuery.AttentionAsync` for why this is `$$"""…"""` and not either of
         * the two obvious alternatives. */
        var sql = $$"""
            SELECT
                s.ScopeUserId,
                (SELECT COUNT(*) FROM dbo.Tickets t
                  WHERE {{DashboardTrendPredicates.Unassigned}})                   AS UnassignedCount,
                (SELECT COUNT(*) FROM dbo.Tickets t
                  WHERE {{DashboardTrendPredicates.EscalatedOpen}}
                    AND {{Scoped}})                                                AS EscalatedOpenCount,
                (SELECT COUNT(*) FROM dbo.Tickets t
                  WHERE {{DashboardTrendPredicates.WaitingOnCustomer}}
                    AND {{Scoped}})                                                AS WaitingOnCustomerCount,
                (SELECT COUNT(*) FROM dbo.Tickets t
                  WHERE {{DashboardTrendPredicates.Assigned}}
                    AND {{Scoped}})                                                AS AssignedCount,
                -- MAX of the age is the OLDEST ticket, and NULL when the set is empty — which is
                -- what the column wants. COUNT would have been 0 for "none", and 0 hours is an
                -- age rather than an absence.
                (SELECT MAX(DATEDIFF(HOUR, t.CreatedAtUtc, {1}))
                   FROM dbo.Tickets t
                  WHERE {{DashboardTrendPredicates.Unassigned}}
                    AND NOT EXISTS (SELECT 1 FROM dbo.TicketComments c WHERE c.TicketId = t.Id))
                                                                                   AS OldestUntouchedHours
            INTO #levels
            FROM (
                SELECT CAST(NULL AS uniqueidentifier) AS ScopeUserId
                UNION ALL
                SELECT u.Id FROM dbo.SupportUsers u WHERE u.IsActive = 1
            ) AS s;

            UPDATE tgt
               SET tgt.UnassignedCount        = l.UnassignedCount,
                   tgt.EscalatedOpenCount     = l.EscalatedOpenCount,
                   tgt.WaitingOnCustomerCount = l.WaitingOnCustomerCount,
                   tgt.AssignedCount          = l.AssignedCount,
                   tgt.OldestUntouchedHours   = l.OldestUntouchedHours,
                   tgt.CapturedAtUtc          = {1}
              FROM dbo.DashboardDailySnapshot tgt
              JOIN #levels l
                ON (tgt.ScopeUserId = l.ScopeUserId
                    OR (tgt.ScopeUserId IS NULL AND l.ScopeUserId IS NULL))
             WHERE tgt.LocalDate = {0};

            INSERT INTO dbo.DashboardDailySnapshot
                (LocalDate, ScopeUserId, UnassignedCount, EscalatedOpenCount,
                 WaitingOnCustomerCount, AssignedCount, OldestUntouchedHours, CapturedAtUtc)
            SELECT {0}, l.ScopeUserId, l.UnassignedCount, l.EscalatedOpenCount,
                   l.WaitingOnCustomerCount, l.AssignedCount, l.OldestUntouchedHours, {1}
              FROM #levels l
             WHERE NOT EXISTS (
                       SELECT 1 FROM dbo.DashboardDailySnapshot s
                        WHERE s.LocalDate = {0}
                          AND (s.ScopeUserId = l.ScopeUserId
                               OR (s.ScopeUserId IS NULL AND l.ScopeUserId IS NULL)));

            DROP TABLE #levels;
            """;

        return context.Database.ExecuteSqlAsync(
            FormattableStringFactory.Create(sql, localDate, capturedAtUtc),
            cancellationToken);
    }

    /// <summary>
    /// Whether this violation is OUR index, matched by NAME.
    /// </summary>
    /// <remarks>
    /// Never on the number alone. `007` established the rule and `036` §3.1 repeated it: 2601/2627
    /// matches ANY unique violation, so keying on it would swallow an unrelated collision and
    /// report a failed capture as a successful one.
    /// </remarks>
    private static bool IsSnapshotDuplicate(SqlException exception) =>
        exception.Number is 2601 or 2627
        && exception.Message.Contains(
            DashboardDailySnapshotConfiguration.UniqueIndexName,
            StringComparison.Ordinal);
}
