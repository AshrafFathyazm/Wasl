using System.Globalization;
using System.Text.Json;
using System.Runtime.CompilerServices;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Wasl.Application.Common.Abstractions;
using Wasl.Application.Features.Dashboard.GetDashboard;
using Wasl.Domain.Communications;
using Wasl.Domain.Tickets;
using Wasl.Infrastructure.Persistence;

namespace Wasl.Infrastructure.Queries;

/// <summary>
/// The dashboard, in seven commands. `020`, US-016.
/// </summary>
/// <remarks>
/// <para>
/// <b>The second of exactly two named query classes `CLAUDE.md` sanctions</b>, and it is named
/// there already — <c>DashboardAggregatesQuery</c>, beside <c>TicketTimelineQuery</c>. The reason
/// is the same one and it is structural, not stylistic: every block below is an aggregate over a
/// spine that must include its empty buckets, a median, or a <c>LEFT JOIN</c> from a table that is
/// not on <c>IApplicationDbContext</c> at all (<c>dbo.TicketHistory</c>, <c>dbo.TicketComments</c>,
/// <c>dbo.SupportUsers</c> for the load). None of it is expressible over that interface, and the
/// alternative is widening it with five more <c>IQueryable</c>s for one consumer.
/// </para>
/// <para>
/// <b>ONE class, not the seven `plan.md` sketched.</b> `plan.md` BE-020-04 through BE-020-11 name
/// <c>DailySeriesQuery</c>, <c>AttentionTilesQuery</c> and five more as separate types. That is a
/// deviation taken deliberately and recorded here rather than in silence: `CLAUDE.md` allows two
/// named query classes and says a THIRD needs a written reason — seven would need five, for one
/// screen, and the sanctioned name is singular. Each block is a private method returning one
/// command, so the count AC-17 asserts is unchanged and every SQL statement is still readable on
/// its own.
/// </para>
/// <para>
/// <b>Seven commands for a Manager, six for an Agent</b>, and the missing one is
/// <see cref="TeamLoadAsync"/> — not executed, not executed-and-discarded (AC-17, AC-18).
/// </para>
/// <para>
/// <b>The scope is a PARAMETER inside every predicate, never string concatenation and never a
/// filter applied afterwards</b> (REV-020-03). <c>(@team = 1 OR t.AssignedToUserId = @userId)</c>
/// appears in each statement that has an assignee to filter on, so there is no path that returns
/// a row an Agent may not see and then removes it in C# — which is the shape of leak that survives
/// a refactor.
/// </para>
/// <para>
/// <b>Raw SQL through <c>SqlQuery</c>, and it bypasses the model.</b> The UTC value converter in
/// <c>ConfigureConventions</c> applies to MAPPED properties; a projection onto an unmapped type
/// does not go through it, so every <c>DateTime</c> read here arrives with
/// <c>DateTimeKind.Unspecified</c> and is stamped <see cref="AsUtc"/> on the way out. `001`
/// asserts the converter on entities and that assertion cannot see this path — TEST-020-09 is the
/// one that does.
/// </para>
/// <para>
/// <b>Registered explicitly in <c>AddInfrastructure</c>.</b> MediatR scans
/// <c>Wasl.Application</c> only, so a handler living in this project is invisible to it — the
/// same situation `003`'s behaviours and <c>TicketTimelineQuery</c> met, and the same answer.
/// </para>
/// </remarks>
internal sealed class DashboardAggregatesQuery(
    WaslDbContext context,
    ICurrentUser currentUser,
    IRequestTimestamp timestamp,
    OrganizationTimeZone organizationTimeZone,
    DashboardTargets targets)
    : IRequestHandler<GetDashboardQuery, DashboardSnapshot>
{
    /// <summary>
    /// How many rows the attention list carries. A top-ten prompt, not a page.
    /// </summary>
    private const int AttentionListSize = 10;

    /// <summary>
    /// How old an escalated ticket has to be to be counted overdue on the tile.
    /// </summary>
    /// <remarks>
    /// The design's sentence is "2 older than 24h", so the threshold is the design's and lives
    /// here as a named constant rather than as a <c>-24</c> inside a SQL string. It is <b>not</b>
    /// an SLA: no SLA exists in this product (`027` left every SLA region unbuilt on purpose), and
    /// nothing here should be read as one arriving.
    /// </remarks>
    private static readonly TimeSpan EscalationOverdueAfter = TimeSpan.FromHours(24);

    /// <summary>
    /// The order the status bars are drawn in — the state machine's, not the counts'.
    /// </summary>
    /// <remarks>
    /// <c>Closed</c> is absent: the block answers "what is open", and a terminal status in a
    /// queue-shape chart is a column nobody acts on. The five members are also spelled into the
    /// SQL spine below, and <see cref="OpenByStatusAsync"/> asserts the two lists agree rather
    /// than trusting that they do — `009` shipped an enum written from a contract example with two
    /// invented members, and a hand-kept SQL list is the same defect one edit away.
    /// </remarks>
    private static readonly TicketStatus[] OpenStatuses =
    [
        TicketStatus.New,
        TicketStatus.Open,
        TicketStatus.InProgress,
        TicketStatus.PendingCustomer,
        TicketStatus.Resolved,
    ];

    public async Task<DashboardSnapshot> Handle(
        GetDashboardQuery request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        /* THE SCOPE IS THE ROLE ON THE TOKEN, and nothing on the wire can change it.
         *
         * A `Manager` reads the team; anyone else reads their own. Not "an Agent reads their
         * own": the role set can grow, and a new role defaulting to the TEAM view would be a
         * silent widening of what somebody sees. Defaulting to `Mine` is the failure that shows
         * up as an empty screen and gets reported, rather than the one nobody notices. */
        var isManager = currentUser.IsManager();
        var scope = isManager ? DashboardScope.Team : DashboardScope.Mine;

        /* Guid.Empty for a principal with no id, which after `004`'s fallback policy cannot reach
         * here — every route but /health and the token endpoint is authenticated. It matches no
         * row, so the failure mode is an empty personal view rather than a null-reference or, far
         * worse, a predicate that silently stops filtering. */
        var userId = currentUser.UserId ?? Guid.Empty;
        var team = isManager ? 1 : 0;

        /* ONE INSTANT FOR THE WHOLE RESPONSE. IRequestTimestamp memoizes the clock per request
         * (`007`), so the spine's "today", every ageHours, the overdue threshold and
         * generatedAtUtc are the same moment. Two of them taken a millisecond apart could put a
         * ticket in a different day from the one its age is measured against — a discrepancy of
         * exactly one row that nobody could reproduce. */
        var nowUtc = timestamp.UtcNow.UtcDateTime;

        var days = LocalDaySpine.Build(
            organizationTimeZone.Zone,
            nowUtc,
            DashboardRange.Days(request.Selected));

        var from = days[0].StartUtc;
        var toExclusive = days[^1].EndUtcExclusive;

        // The commands, in a fixed order so the count is reproducible and a query log reads the
        // same way twice. Sequential rather than concurrent: one DbContext is not thread-safe,
        // and seven connections to save a few milliseconds on a screen nothing polls is a trade
        // in the wrong direction.
        /* `020b`. The baseline day is the one BEFORE the range began — so a 14-day view compares
         * against the level a fortnight ago, which is what the tile's "vs prev" says. Derived from
         * the spine rather than re-computed, so the two can never disagree about the timezone. */
        var previousDate = days[0].Date.AddDays(-1);

        var attention = await AttentionAsync(team, userId, previousDate, nowUtc, cancellationToken);
        var dailySeries = await DailySeriesAsync(days, team, userId, cancellationToken);
        var openByStatus = await OpenByStatusAsync(team, userId, cancellationToken);
        var medians = await MediansAsync(from, toExclusive, team, userId, cancellationToken);
        var channelMix = await ChannelMixAsync(from, toExclusive, team, userId, cancellationToken);
        var needsAttention = await NeedsAttentionAsync(team, userId, nowUtc, cancellationToken);

        // THE SEVENTH COMMAND, AND ONLY FOR A MANAGER. Not fetched-then-hidden: the property is
        // absent from the JSON document and the work is absent from the database.
        var teamLoad = isManager
            ? await TeamLoadAsync(cancellationToken)
            : null;

        return new DashboardSnapshot(
            Range: DashboardRange.Normalise(request.Selected),
            Scope: scope,
            TimeZoneId: organizationTimeZone.Id,
            FromLocalDate: Iso(days[0].Date),
            ToLocalDate: Iso(days[^1].Date),
            GeneratedAtUtc: AsUtc(nowUtc),
            Attention: attention,
            DailySeries: dailySeries,
            OpenByStatus: openByStatus,
            Medians: medians,
            ChannelMix: channelMix,
            NeedsAttention: needsAttention,
            TeamLoad: teamLoad);
    }

    /* ══════════════════════════════════════════════════════════════════════════════════════
     * 1 · The four tiles, plus the two named tickets — ONE command
     * ══════════════════════════════════════════════════════════════════════════════════════
     * Five conditional counts as scalar subqueries and two OUTER APPLYs over one anchor row.
     *
     * A CROSS APPLY would drop the whole row when a ticket does not exist, so an empty system
     * would return NO row and the tiles would have nothing to render — the shape of the
     * "empty system is a 200 with zeros" requirement (AC-9) failing as an exception instead.
     * ══════════════════════════════════════════════════════════════════════════════════════ */
    private async Task<DashboardAttention> AttentionAsync(
        int team,
        Guid userId,
        DateOnly previousDate,
        DateTime nowUtc,
        CancellationToken cancellationToken)
    {
        var overdueBefore = nowUtc - EscalationOverdueAfter;

        /* THE FORMAT IS BUILT HERE AND THE VALUES STAY PARAMETERS — AND THE TWO ATTEMPTS THAT DID
         * NOT WORK ARE WORTH KNOWING ABOUT.
         *
         * `020b` extracted the four attention predicates into DashboardTrendPredicates so this
         * read and the snapshot capture cannot drift apart. Getting a CONSTANT into the SQL while
         * keeping the VALUES parameterised took three goes:
         *
         *   1. `SqlQuery($"… {Predicates.Unassigned} …")` — WRONG. A FormattableString turns every
         *      hole into a parameter, so the predicate would ship as `WHERE @p0`: a comparison
         *      against a string of SQL text, matching nothing, with no error anywhere.
         *   2. `SqlQueryRaw($"…")` — REFUSED BY THE ANALYSER, EF1002, and correctly. `CLAUDE.md`
         *      names that rule and its reason: the habit formed here moves to `015`, which builds
         *      a query from user input. Suppressing it would have been the wrong lesson.
         *   3. This. `$$"""…"""` makes `{{Constant}}` an interpolation hole and leaves `{0}`
         *      literal, so the constants are baked into the FORMAT and the runtime values are the
         *      FormattableString's arguments — parameters, exactly as before.
         *
         * Nothing user-supplied is concatenated: the predicates are compile-time constants, and
         * the scope flag, the user id and the threshold are `{0}`, `{1}`, `{2}`. */
        var scope = DashboardTrendPredicates.ScopedBy("{0}", "{1}");

        var sql = $$"""
                SELECT
                    (SELECT COUNT(*) FROM dbo.Tickets t
                      WHERE {{DashboardTrendPredicates.Unassigned}})               AS UnassignedCount,
                    (SELECT COUNT(*) FROM dbo.Tickets t
                      WHERE {{DashboardTrendPredicates.EscalatedOpen}}
                        AND {{scope}})                                             AS EscalatedOpenCount,
                    (SELECT COUNT(*) FROM dbo.Tickets t
                      WHERE {{DashboardTrendPredicates.EscalatedOpen}}
                        AND t.CreatedAtUtc < {2}
                        AND {{scope}})                                             AS EscalatedOverdueCount,
                    (SELECT COUNT(*) FROM dbo.Tickets t
                      WHERE {{DashboardTrendPredicates.WaitingOnCustomer}}
                        AND {{scope}})                                             AS WaitingOnCustomerCount,
                    (SELECT COUNT(*) FROM dbo.Tickets t
                      WHERE t.AssignedToUserId = {1}
                        AND t.Status <> N'Closed')                                 AS AssignedToMeCount,
                    -- The attention SET's size, not the list's length. The predicate is the one
                    -- NeedsAttentionAsync uses, kept beside it here rather than in an eighth
                    -- command — the card's header says "View all 15" and the list holds ten.
                    (SELECT COUNT(*) FROM dbo.Tickets t
                      WHERE t.Status <> N'Closed'
                        AND (t.AssignedToUserId IS NULL OR t.IsEscalated = 1)
                        AND ({0} = 1
                             OR t.AssignedToUserId = {1}
                             OR t.AssignedToUserId IS NULL))                       AS NeedsAttentionTotal,
                    untouched.Id            AS UntouchedId,
                    untouched.TicketNumber  AS UntouchedTicketNumber,
                    untouched.Subject       AS UntouchedSubject,
                    untouched.CreatedAtUtc  AS UntouchedCreatedAtUtc,
                    mine.Id                 AS MineId,
                    mine.TicketNumber       AS MineTicketNumber,
                    mine.Subject            AS MineSubject,
                    mine.CreatedAtUtc       AS MineCreatedAtUtc,
                    -- `020b`. The baseline, LEFT JOINed rather than fetched — an eighth command
                    -- would break AC-17, and the whole point of the snapshot table is that this
                    -- costs a join. Absent row → every column NULL → `previous: null` → no arrow,
                    -- with no branch anywhere.
                    prev.UnassignedCount        AS PrevUnassignedCount,
                    prev.EscalatedOpenCount     AS PrevEscalatedOpenCount,
                    prev.WaitingOnCustomerCount AS PrevWaitingOnCustomerCount,
                    prev.OldestUntouchedHours   AS PrevOldestUntouchedHours
                FROM (SELECT 1 AS Anchor) AS anchor
                OUTER APPLY (
                    SELECT TOP (1) t.Id, t.TicketNumber, t.Subject, t.CreatedAtUtc
                    FROM dbo.Tickets t
                    WHERE {{DashboardTrendPredicates.Unassigned}}
                      AND NOT EXISTS (SELECT 1 FROM dbo.TicketComments c WHERE c.TicketId = t.Id)
                    ORDER BY t.CreatedAtUtc, t.Id
                ) AS untouched
                OUTER APPLY (
                    SELECT TOP (1) t.Id, t.TicketNumber, t.Subject, t.CreatedAtUtc
                    FROM dbo.Tickets t
                    WHERE t.AssignedToUserId = {1}
                      AND t.Status <> N'Closed'
                    ORDER BY t.CreatedAtUtc, t.Id
                ) AS mine
                LEFT JOIN dbo.DashboardDailySnapshot prev
                       ON prev.LocalDate = {3}
                      -- The TEAM row's scope is NULL, so `= NULL` would match nothing and every
                      -- Manager would silently get no baseline at all.
                      AND (({0} = 1 AND prev.ScopeUserId IS NULL)
                           OR ({0} = 0 AND prev.ScopeUserId = {1}))
                """;

        var rows = await context.Database
            .SqlQuery<AttentionRow>(
                FormattableStringFactory.Create(sql, team, userId, overdueBefore, previousDate))
            .ToListAsync(cancellationToken);

        // One row always, because the anchor is a literal. Defended anyway: a shape assumption
        // that turns into an IndexOutOfRangeException in production is worse than a stated zero.
        var row = rows.Count > 0 ? rows[0] : new AttentionRow();

        return new DashboardAttention(
            UnassignedCount: row.UnassignedCount,
            EscalatedOpenCount: row.EscalatedOpenCount,
            EscalatedOverdueCount: row.EscalatedOverdueCount,
            WaitingOnCustomerCount: row.WaitingOnCustomerCount,
            AssignedToMeCount: row.AssignedToMeCount,
            OldestUntouched: TicketRef(
                row.UntouchedId,
                row.UntouchedTicketNumber,
                row.UntouchedSubject,
                row.UntouchedCreatedAtUtc,
                nowUtc),
            NeedsAttentionTotal: row.NeedsAttentionTotal,
            MyOldest: TicketRef(
                row.MineId,
                row.MineTicketNumber,
                row.MineSubject,
                row.MineCreatedAtUtc,
                nowUtc),
            Previous: Previous(row, previousDate));
    }

    /* ══════════════════════════════════════════════════════════════════════════════════════
     * 2 · Created versus resolved, one row per local day — ONE command
     * ══════════════════════════════════════════════════════════════════════════════════════
     * The SPINE IS THE LEFT SIDE and it arrives as JSON in a single parameter, read back by
     * OPENJSON. Three alternatives were available and each is worse:
     *
     *   - GROUP BY over the tickets: omits quiet days (AC-5), and the chart compresses silently.
     *   - a VALUES list built in C#: dynamic SQL text, so either string concatenation (EF1002,
     *     and the habit moves to a query built from user input) or thirty numbered parameters.
     *   - one command per day: thirty round trips for one card, which is the exact failure
     *     AC-17's command count exists to catch.
     *
     * `resolved` comes from the FIRST StatusChanged -> Resolved history row per ticket, computed
     * once in a CTE. Never from ClosedAtUtc (AC-19): a ticket resolved on Monday and closed on
     * Thursday belongs to Monday, and a reopen-then-resolve counts once because MIN takes the
     * first.
     * ══════════════════════════════════════════════════════════════════════════════════════ */
    private async Task<IReadOnlyList<DashboardDay>> DailySeriesAsync(
        IReadOnlyList<LocalDay> days,
        int team,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var spine = JsonSerializer.Serialize(days.Select(day => new
        {
            d = Iso(day.Date),

            // Round-trip format, so OPENJSON's datetime2 parse is unambiguous regardless of the
            // server's language setting. A "yyyy-MM-dd HH:mm:ss" string is interpreted against
            // DATEFORMAT on some collations and silently swaps day and month.
            s = day.StartUtc.ToString("O", CultureInfo.InvariantCulture),
            e = day.EndUtcExclusive.ToString("O", CultureInfo.InvariantCulture),
        }));

        var rows = await context.Database
            .SqlQuery<DailyRow>(
                $"""
                WITH firstResolved AS (
                    SELECT h.TicketId, MIN(h.PerformedAtUtc) AS AtUtc
                    FROM dbo.TicketHistory h
                    WHERE h.EventType = N'StatusChanged'
                      AND h.NewValue = N'Resolved'
                    GROUP BY h.TicketId
                ),
                spine AS (
                    SELECT LocalDate, StartUtc, EndUtc
                    FROM OPENJSON({spine})
                    WITH (
                        LocalDate char(10)      '$.d',
                        StartUtc  datetime2(3)  '$.s',
                        EndUtc    datetime2(3)  '$.e'
                    )
                )
                SELECT
                    s.LocalDate AS LocalDate,
                    (SELECT COUNT(*)
                       FROM dbo.Tickets t
                      WHERE t.CreatedAtUtc >= s.StartUtc
                        AND t.CreatedAtUtc <  s.EndUtc
                        AND ({team} = 1 OR t.AssignedToUserId = {userId})) AS Created,
                    (SELECT COUNT(*)
                       FROM firstResolved fr
                       JOIN dbo.Tickets t ON t.Id = fr.TicketId
                      WHERE fr.AtUtc >= s.StartUtc
                        AND fr.AtUtc <  s.EndUtc
                        AND ({team} = 1 OR t.AssignedToUserId = {userId})) AS Resolved
                FROM spine s
                ORDER BY s.LocalDate
                """)
            .ToListAsync(cancellationToken);

        /* THE SPINE IS THE AUTHORITY ON LENGTH, not the result set.
         *
         * The rows are matched back onto the days that were sent, so the response is exactly 7,
         * 14 or 30 entries whatever SQL Server returns — including the case where OPENJSON
         * silently yields nothing because the JSON shape changed. A missing day would otherwise
         * shorten the chart by one column, which looks like a quiet Friday. */
        var byDate = rows.ToDictionary(row => row.LocalDate, StringComparer.Ordinal);

        return days
            .Select(day =>
            {
                var iso = Iso(day.Date);
                return byDate.TryGetValue(iso, out var row)
                    ? new DashboardDay(iso, row.Created, row.Resolved)
                    : new DashboardDay(iso, 0, 0);
            })
            .ToList();
    }

    /* ══════════════════════════════════════════════════════════════════════════════════════
     * 3 · Open by status — ONE command, and the empty statuses are in the answer
     * ══════════════════════════════════════════════════════════════════════════════════════
     * A VALUES spine on the left, LEFT JOIN Tickets, so a status with no tickets comes back as 0
     * rather than being absent. The client then never needs to know the enum's membership to draw
     * an axis — which is the same reasoning as the date spine, applied to a categorical axis.
     * ══════════════════════════════════════════════════════════════════════════════════════ */
    private async Task<IReadOnlyList<DashboardStatusCount>> OpenByStatusAsync(
        int team,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var rows = await context.Database
            .SqlQuery<NamedCountRow>(
                $"""
                SELECT s.Name AS Name, COUNT(t.Id) AS Total
                FROM (VALUES
                        (N'New', 1),
                        (N'Open', 2),
                        (N'InProgress', 3),
                        (N'PendingCustomer', 4),
                        (N'Resolved', 5)
                     ) AS s(Name, Ord)
                LEFT JOIN dbo.Tickets t
                       ON t.Status = s.Name
                      AND ({team} = 1 OR t.AssignedToUserId = {userId})
                GROUP BY s.Name, s.Ord
                ORDER BY s.Ord
                """)
            .ToListAsync(cancellationToken);

        return Spine(rows, OpenStatuses, (status, count) => new DashboardStatusCount(status, count));
    }

    /* ══════════════════════════════════════════════════════════════════════════════════════
     * 4 · Where demand comes from — ONE command
     * ══════════════════════════════════════════════════════════════════════════════════════
     * Over tickets CREATED IN THE RANGE, unlike the status block, which is a snapshot of what is
     * open right now. The two cards look alike and answer questions with different tenses; the
     * subtitles say so on the screen.
     * ══════════════════════════════════════════════════════════════════════════════════════ */
    private async Task<IReadOnlyList<DashboardChannelCount>> ChannelMixAsync(
        DateTime from,
        DateTime toExclusive,
        int team,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var rows = await context.Database
            .SqlQuery<NamedCountRow>(
                $"""
                SELECT s.Name AS Name, COUNT(t.Id) AS Total
                FROM (VALUES
                        (N'Email', 1),
                        (N'WhatsApp', 2),
                        (N'LiveChat', 3),
                        (N'Sms', 4),
                        (N'WebForm', 5)
                     ) AS s(Name, Ord)
                LEFT JOIN dbo.Tickets t
                       ON t.Channel = s.Name
                      AND t.CreatedAtUtc >= {from}
                      AND t.CreatedAtUtc <  {toExclusive}
                      AND ({team} = 1 OR t.AssignedToUserId = {userId})
                GROUP BY s.Name, s.Ord
                ORDER BY s.Ord
                """)
            .ToListAsync(cancellationToken);

        return Spine(
            rows,
            Enum.GetValues<CommunicationChannel>(),
            (channel, count) => new DashboardChannelCount(channel, count));
    }

    /* ══════════════════════════════════════════════════════════════════════════════════════
     * 5 · The two medians — ONE command
     * ══════════════════════════════════════════════════════════════════════════════════════
     * PERCENTILE_CONT over two DIFFERENT populations in one statement, and the trick that makes
     * it one is that PERCENTILE_CONT ignores NULLs: each ticket in the range contributes a reply
     * duration, a resolution duration, both, or neither, and each median sees only its own
     * non-null column. COUNT(col) OVER () is the sample size for the same reason.
     *
     * TOP (1) because both are window functions over the whole partition, so every row carries
     * the same four values. An empty population returns NO rows, which is what makes
     * `null` medians with sampleSize 0 fall out rather than needing a branch — and `null` is not
     * `0`: zero minutes to first reply is a claim, and an empty system does not make it.
     * ══════════════════════════════════════════════════════════════════════════════════════ */
    private async Task<DashboardMedians> MediansAsync(
        DateTime from,
        DateTime toExclusive,
        int team,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var rows = await context.Database
            .SqlQuery<MedianRow>(
                $"""
                WITH durations AS (
                    SELECT
                        DATEDIFF(MINUTE, t.CreatedAtUtc, fc.AtUtc) AS ReplyMinutes,
                        DATEDIFF(MINUTE, t.CreatedAtUtc, fr.AtUtc) AS ResolveMinutes
                    FROM dbo.Tickets t
                    OUTER APPLY (
                        SELECT MIN(c.CreatedAtUtc) AS AtUtc
                        FROM dbo.TicketComments c
                        WHERE c.TicketId = t.Id
                    ) AS fc
                    OUTER APPLY (
                        SELECT MIN(h.PerformedAtUtc) AS AtUtc
                        FROM dbo.TicketHistory h
                        WHERE h.TicketId = t.Id
                          AND h.EventType = N'StatusChanged'
                          AND h.NewValue = N'Resolved'
                    ) AS fr
                    WHERE t.CreatedAtUtc >= {from}
                      AND t.CreatedAtUtc <  {toExclusive}
                      AND ({team} = 1 OR t.AssignedToUserId = {userId})
                )
                SELECT TOP (1)
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ReplyMinutes)   OVER () AS FirstReplyMinutes,
                    COUNT(ReplyMinutes)                                         OVER () AS FirstReplySampleSize,
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ResolveMinutes) OVER () AS ResolutionMinutes,
                    COUNT(ResolveMinutes)                                       OVER () AS ResolutionSampleSize
                FROM durations
                """)
            .ToListAsync(cancellationToken);

        if (rows.Count == 0)
        {
            // The TARGETS are still reported on an empty population: they are configuration, not a
            // measurement, and the card renders "target 2h" beside an em dash rather than losing
            // the label along with the number.
            return new DashboardMedians(
                null, 0, null, 0, targets.FirstReplyMinutes, targets.ResolutionMinutes);
        }

        var row = rows[0];

        // PERCENTILE_CONT interpolates, so it returns a float and an even-sized population gives
        // a half-minute. Rounded to whole minutes here rather than in SQL, because a median of
        // 42.5 minutes rendered as "42m" or "43m" is a display decision and this is the layer
        // that owns the contract's int.
        return new DashboardMedians(
            FirstReplyMinutes: Minutes(row.FirstReplyMinutes, row.FirstReplySampleSize),
            FirstReplySampleSize: row.FirstReplySampleSize,
            ResolutionMinutes: Minutes(row.ResolutionMinutes, row.ResolutionSampleSize),
            ResolutionSampleSize: row.ResolutionSampleSize,

            // Configuration, not data — no command, no column. The client compares and shades.
            FirstReplyTargetMinutes: targets.FirstReplyMinutes,
            ResolutionTargetMinutes: targets.ResolutionMinutes);
    }

    /* ══════════════════════════════════════════════════════════════════════════════════════
     * 6 · Needs attention — ONE command, ten rows, customer name in the SAME statement
     * ══════════════════════════════════════════════════════════════════════════════════════
     * Membership is "not Closed AND (unassigned OR escalated)". For an Agent the scope is
     * "mine OR unassigned", which the contract states and `11-dashboard.md` words as *mine and
     * unassigned*: an Agent's attention list is what they could act on, and an unassigned ticket
     * is exactly that.
     *
     * ORDER BY CreatedAtUtc, Id — the id is a TIE-BREAK, not decoration. `013` deleted one and
     * its repeatability test still passed, because SQL Server agreed with itself twice over nine
     * rows; what catches a missing tie-break is an assertion about a SPECIFIC order.
     * ══════════════════════════════════════════════════════════════════════════════════════ */
    private async Task<IReadOnlyList<DashboardAttentionItem>> NeedsAttentionAsync(
        int team,
        Guid userId,
        DateTime nowUtc,
        CancellationToken cancellationToken)
    {
        var rows = await context.Database
            .SqlQuery<AttentionItemRow>(
                $"""
                SELECT TOP ({AttentionListSize})
                    t.Id            AS TicketId,
                    t.TicketNumber  AS TicketNumber,
                    t.Subject       AS Subject,
                    c.FullName      AS CustomerName,
                    t.Status        AS Status,
                    t.Priority      AS Priority,
                    t.IsEscalated   AS IsEscalated,
                    CAST(CASE WHEN t.AssignedToUserId IS NULL THEN 1 ELSE 0 END AS bit) AS IsUnassigned,
                    t.CreatedAtUtc  AS CreatedAtUtc
                FROM dbo.Tickets t
                JOIN dbo.Customers c ON c.Id = t.CustomerId
                WHERE t.Status <> N'Closed'
                  AND (t.AssignedToUserId IS NULL OR t.IsEscalated = 1)
                  AND ({team} = 1
                       OR t.AssignedToUserId = {userId}
                       OR t.AssignedToUserId IS NULL)
                ORDER BY t.CreatedAtUtc, t.Id
                """)
            .ToListAsync(cancellationToken);

        return rows
            .Select(row => new DashboardAttentionItem(
                TicketId: row.TicketId,
                TicketNumber: row.TicketNumber,
                Subject: row.Subject,
                CustomerName: row.CustomerName,
                Status: Enum.Parse<TicketStatus>(row.Status),
                Priority: Enum.Parse<TicketPriority>(row.Priority),
                IsEscalated: row.IsEscalated,
                IsUnassigned: row.IsUnassigned,
                CreatedAtUtc: AsUtc(row.CreatedAtUtc),
                AgeHours: AgeHours(row.CreatedAtUtc, nowUtc)))
            .ToList();
    }

    /* ══════════════════════════════════════════════════════════════════════════════════════
     * 7 · Team load — ONE command, MANAGER ONLY
     * ══════════════════════════════════════════════════════════════════════════════════════
     * LEFT JOIN, so an active agent holding nothing appears with 0 — the person a Manager should
     * hand the next ticket to is the one at the bottom of this list, and an INNER JOIN would
     * remove exactly them.
     *
     * No scope parameter, because this statement is only ever reached for a Manager. That is
     * enforced by the caller and stated here: a scope parameter nobody uses would read as though
     * the statement were safe for an Agent to run.
     * ══════════════════════════════════════════════════════════════════════════════════════ */
    private async Task<IReadOnlyList<DashboardTeamMember>> TeamLoadAsync(
        CancellationToken cancellationToken)
    {
        var rows = await context.Database
            .SqlQuery<TeamLoadRow>(
                $"""
                SELECT
                    u.Id        AS UserId,
                    u.FullName  AS FullName,
                    u.IsActive  AS IsActive,
                    COUNT(t.Id) AS AssignedOpenCount,
                    -- A CONDITIONAL AGGREGATE OVER THE SAME JOIN, so the agent card's "3
                    -- escalated" footnote costs no second command. SUM over a CASE rather than a
                    -- second LEFT JOIN: two joins to the same table would multiply the rows and
                    -- the load count would come back wrong, which is a defect that reads as
                    -- "the dashboard is exaggerating".
                    SUM(CASE WHEN t.IsEscalated = 1 THEN 1 ELSE 0 END) AS EscalatedOpenCount
                FROM dbo.SupportUsers u
                LEFT JOIN dbo.Tickets t
                       ON t.AssignedToUserId = u.Id
                      AND t.Status <> N'Closed'
                GROUP BY u.Id, u.FullName, u.IsActive
                ORDER BY COUNT(t.Id) DESC, u.FullName
                """)
            .ToListAsync(cancellationToken);

        return rows
            .Select(row => new DashboardTeamMember(
                row.UserId,
                row.FullName,
                row.IsActive,
                row.AssignedOpenCount,
                row.EscalatedOpenCount))
            .ToList();
    }

    /* ══════════════════════════════════════════════════════════════════════════════════════
     * Mapping helpers
     * ══════════════════════════════════════════════════════════════════════════════════════ */

    /// <summary>
    /// Matches a SQL spine's rows back onto the CLR enum, so the response's membership comes from
    /// the enum and its counts come from the database.
    /// </summary>
    /// <remarks>
    /// <b>This is the guard against the hand-kept SQL list drifting from the enum.</b> A member
    /// added to <c>TicketStatus</c> or <c>CommunicationChannel</c> and forgotten in the
    /// <c>VALUES</c> spine above appears here with a count of 0 rather than vanishing from the
    /// screen — and <c>DashboardSpineTests</c> is what turns that into a red test. `009` shipped
    /// an enum written from a contract example with two invented members; a list kept by hand in
    /// two languages is the same defect waiting.
    /// </remarks>
    private static IReadOnlyList<TResult> Spine<TEnum, TResult>(
        IReadOnlyList<NamedCountRow> rows,
        IReadOnlyList<TEnum> members,
        Func<TEnum, int, TResult> project)
        where TEnum : struct, Enum
    {
        var byName = rows.ToDictionary(row => row.Name, row => row.Total, StringComparer.Ordinal);

        return members
            .Select(member => project(
                member,
                byName.TryGetValue(member.ToString(), out var count) ? count : 0))
            .ToList();
    }

    /// <summary>
    /// The baseline, or <c>null</c> when the <c>LEFT JOIN</c> matched no snapshot row. `020b`.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>ONE column decides, not four.</b> The four values come from a single row and are absent
    /// together; testing them independently would let a future column that is legitimately
    /// nullable — as <c>OldestUntouchedHours</c> already is — be mistaken for "no baseline".
    /// <c>UnassignedCount</c> is the discriminator because it is <c>NOT NULL</c> in the table, so
    /// a null here can only mean the join found nothing.
    /// </para>
    /// <para>
    /// <b>No baseline renders NO ARROW</b> (ruled Q-2) — not a dash, not a zero. The first
    /// fortnight after this ships, the tiles look exactly as they do today.
    /// </para>
    /// </remarks>
    private static DashboardPrevious? Previous(AttentionRow row, DateOnly previousDate) =>
        row.PrevUnassignedCount is { } unassigned
            ? new DashboardPrevious(
                LocalDate: Iso(previousDate),
                UnassignedCount: unassigned,
                EscalatedOpenCount: row.PrevEscalatedOpenCount ?? 0,
                WaitingOnCustomerCount: row.PrevWaitingOnCustomerCount ?? 0,
                OldestUntouchedHours: row.PrevOldestUntouchedHours)
            : null;

    private static DashboardTicketRef? TicketRef(
        Guid? id,
        string? ticketNumber,
        string? subject,
        DateTime? createdAtUtc,
        DateTime nowUtc) =>
        id is { } ticketId && ticketNumber is not null && subject is not null
        && createdAtUtc is { } created
            ? new DashboardTicketRef(
                ticketId,
                ticketNumber,
                subject,
                AsUtc(created),
                AgeHours(created, nowUtc))
            : null;

    /// <summary>
    /// The bare calendar date the contract returns — <c>"2026-08-10"</c>, invariant.
    /// </summary>
    /// <remarks>
    /// <c>CultureInfo.InvariantCulture</c> is load-bearing and not decoration: under
    /// <c>ar-SA</c> the default calendar is Umm al-Qura, and <c>ToString("yyyy-MM-dd")</c> on the
    /// ambient culture would emit a HIJRI date — <c>"1448-02-26"</c> — into a field the client
    /// parses as Gregorian. The response would still be well formed and the chart would still
    /// draw. `005` set the localization middleware between authentication and authorization, so a
    /// request with <c>Accept-Language: ar</c> reaches this method with that culture ambient.
    /// </remarks>
    private static string Iso(DateOnly date) =>
        date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    /// <summary>
    /// Stamps <c>DateTimeKind.Utc</c> on a value that came back through raw SQL. TEST-020-09.
    /// </summary>
    /// <remarks>
    /// The model's UTC converter applies to mapped properties, and a projection onto an unmapped
    /// type does not pass through it — so these arrive <c>Unspecified</c>, serialise without the
    /// <c>Z</c>, and a client reads them as local time. The offset is silent and, in
    /// <c>Asia/Riyadh</c>, three hours.
    /// </remarks>
    private static DateTime AsUtc(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Utc);

    /// <summary>
    /// Whole hours between a creation instant and this request's instant, never negative.
    /// </summary>
    /// <remarks>
    /// Server-side, from the memoized clock, so client-clock skew cannot change the number the
    /// screen shows. Floored at zero because a row created inside the same millisecond as the
    /// request would otherwise be able to report <c>-0</c> once rounding is involved, and a
    /// negative age on a support screen reads as data corruption.
    /// </remarks>
    private static int AgeHours(DateTime createdAtUtc, DateTime nowUtc)
    {
        var hours = (nowUtc - DateTime.SpecifyKind(createdAtUtc, DateTimeKind.Utc)).TotalHours;

        return hours <= 0 ? 0 : (int)Math.Floor(hours);
    }

    /// <summary>
    /// A median in whole minutes, or <c>null</c> when nothing contributed to it.
    /// </summary>
    /// <remarks>
    /// The sample size decides, not the value: <c>PERCENTILE_CONT</c> over an all-null column
    /// returns <c>NULL</c>, and a population of one ticket answered in under thirty seconds
    /// rounds to <c>0</c> — a legitimate zero that must not be turned back into "no data".
    /// </remarks>
    private static int? Minutes(double? median, int sampleSize) =>
        sampleSize == 0 || median is null
            ? null
            : (int)Math.Round(median.Value, MidpointRounding.AwayFromZero);

    /* ══════════════════════════════════════════════════════════════════════════════════════
     * The row shapes
     * ══════════════════════════════════════════════════════════════════════════════════════
     * Classes with settable properties rather than records, because EF materialises an unmapped
     * SqlQuery type by name onto a parameterless constructor. Internal to this file's concern and
     * never leaving it — every one is mapped to a contract type above.
     *
     * ENUM-VALUED COLUMNS ARE CARRIED AS STRINGS and parsed in the mapping, which is what they
     * are in the database: `HasConversion<string>()` on Status, Priority and Channel. Typing them
     * as the CLR enum here would ask EF to convert an nvarchar to an int outside the model, and
     * `013` measured what that produces — "Unable to cast object of type 'System.String' to type
     * 'System.Int32'", a 500 with nothing in it pointing at the projection.
     * ══════════════════════════════════════════════════════════════════════════════════════ */

    private sealed class AttentionRow
    {
        public int UnassignedCount { get; set; }
        public int EscalatedOpenCount { get; set; }
        public int EscalatedOverdueCount { get; set; }
        public int WaitingOnCustomerCount { get; set; }
        public int AssignedToMeCount { get; set; }
        public int NeedsAttentionTotal { get; set; }
        public Guid? UntouchedId { get; set; }
        public string? UntouchedTicketNumber { get; set; }
        public string? UntouchedSubject { get; set; }
        public DateTime? UntouchedCreatedAtUtc { get; set; }
        public Guid? MineId { get; set; }
        public string? MineTicketNumber { get; set; }
        public string? MineSubject { get; set; }
        public DateTime? MineCreatedAtUtc { get; set; }

        /* `020b`. All four nullable, and they are null TOGETHER — the LEFT JOIN either matched a
         * snapshot row or it did not. `Previous()` reads one of them to decide, rather than
         * treating them as four independent absences. */
        public int? PrevUnassignedCount { get; set; }
        public int? PrevEscalatedOpenCount { get; set; }
        public int? PrevWaitingOnCustomerCount { get; set; }
        public int? PrevOldestUntouchedHours { get; set; }
    }

    private sealed class DailyRow
    {
        public string LocalDate { get; set; } = string.Empty;
        public int Created { get; set; }
        public int Resolved { get; set; }
    }

    /// <summary>
    /// One bucket of a categorical spine. <c>Total</c>, not <c>Count</c>: the latter collides with
    /// nothing in SQL but reads as a method everywhere in C#.
    /// </summary>
    private sealed class NamedCountRow
    {
        public string Name { get; set; } = string.Empty;
        public int Total { get; set; }
    }

    private sealed class MedianRow
    {
        public double? FirstReplyMinutes { get; set; }
        public int FirstReplySampleSize { get; set; }
        public double? ResolutionMinutes { get; set; }
        public int ResolutionSampleSize { get; set; }
    }

    private sealed class AttentionItemRow
    {
        public Guid TicketId { get; set; }
        public string TicketNumber { get; set; } = string.Empty;
        public string Subject { get; set; } = string.Empty;
        public string CustomerName { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public string Priority { get; set; } = string.Empty;
        public bool IsEscalated { get; set; }
        public bool IsUnassigned { get; set; }
        public DateTime CreatedAtUtc { get; set; }
    }

    private sealed class TeamLoadRow
    {
        public Guid UserId { get; set; }
        public string FullName { get; set; } = string.Empty;
        public bool IsActive { get; set; }
        public int AssignedOpenCount { get; set; }
        public int EscalatedOpenCount { get; set; }
    }
}
