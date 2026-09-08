using System.Net;
using System.Text.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Api.IntegrationTests.Audit;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Tickets;
using Wasl.Infrastructure.Persistence;
using Microsoft.Data.SqlClient;

namespace Wasl.Api.IntegrationTests.Dashboard;

/// <summary>
/// The daily snapshot capture. `020b` AC-1 to AC-4, AC-9.
/// </summary>
/// <remarks>
/// <para>
/// <b>Every property here is proved by calling a METHOD, with no scheduler involved.</b>
/// `plan.md` §2 orders the build that way on purpose: the capture's correctness — idempotence,
/// the race, agreement with the read, no back-fill — is testable without a timer, so the
/// scheduler is left with exactly one thing to prove afterwards.
/// </para>
/// <para>
/// <b>The dates are far in the future</b>, `2099-…`, so these rows cannot collide with a real
/// capture or with `020`'s reads. The suite shares one database and one seeded container, which
/// is the constraint `CLAUDE.md` records.
/// </para>
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class DashboardSnapshotCaptureTests(WaslApiFactory factory)
{
    private static readonly DateTime CapturedAt =
        new(2099, 1, 1, 6, 0, 0, DateTimeKind.Utc);

    private async Task CaptureAsync(DateOnly localDate, DateTime? capturedAtUtc = null)
    {
        using var scope = factory.Services.CreateScope();
        var capture = scope.ServiceProvider.GetRequiredService<IDashboardSnapshotCapture>();

        await capture.CaptureAsync(localDate, capturedAtUtc ?? CapturedAt, CancellationToken.None);
    }

    /// <summary>
    /// One snapshot row, as the TABLE holds it.
    /// </summary>
    /// <remarks>
    /// <b>A test-local shape rather than the entity, and the entity being <c>internal</c> is only
    /// half the reason.</b> `Wasl.Infrastructure` exposes no <c>InternalsVisibleTo</c> and this
    /// feature is not the right size of change to introduce one — that would open every internal
    /// in the project to the test assembly to save a few lines here. Reading the columns directly
    /// is also the stronger assertion: it asserts what is IN the table, not what EF maps back out
    /// of it, so a mapping that silently dropped a column would fail rather than round-trip.
    /// </remarks>
    private sealed record SnapshotRow(
        Guid? ScopeUserId,
        int UnassignedCount,
        int EscalatedOpenCount,
        int WaitingOnCustomerCount,
        int AssignedCount,
        int? OldestUntouchedHours,
        DateTime CapturedAtUtc);

    private async Task<List<SnapshotRow>> RowsAsync(DateOnly localDate)
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        return await context.Database
            .SqlQuery<SnapshotRow>(
                $"""
                SELECT ScopeUserId, UnassignedCount, EscalatedOpenCount, WaitingOnCustomerCount,
                       AssignedCount, OldestUntouchedHours, CapturedAtUtc
                  FROM dbo.DashboardDailySnapshot
                 WHERE LocalDate = {localDate}
                """)
            .ToListAsync();
    }

    private async Task ClearAsync(DateOnly localDate)
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        await context.Database.ExecuteSqlAsync(
            $"DELETE FROM dbo.DashboardDailySnapshot WHERE LocalDate = {localDate}");
    }

    private async Task InsertTeamRowAsync(DateOnly localDate, int unassigned)
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        await context.Database.ExecuteSqlAsync(
            $"""
            INSERT INTO dbo.DashboardDailySnapshot
                (LocalDate, ScopeUserId, UnassignedCount, EscalatedOpenCount,
                 WaitingOnCustomerCount, AssignedCount, OldestUntouchedHours, CapturedAtUtc)
            VALUES ({localDate}, NULL, {unassigned}, 0, 0, 0, NULL, {CapturedAt})
            """);
    }

    /// <summary>
    /// A day nothing else in the suite touches. One per test, so they cannot see each other's rows.
    /// </summary>
    /// <remarks>
    /// <c>AddDays</c>, not <c>new DateOnly(2099, 1, 1 + offset)</c> — which is what the first
    /// version did and which threw <c>ArgumentOutOfRangeException</c> the moment an offset pushed
    /// the day past 31. A date is not three independent integers.
    /// </remarks>
    private static DateOnly Day(int offset) => new DateOnly(2099, 1, 1).AddDays(offset);

    /* ══════════════════════════════════════════════════════════════════════════════════════
     * AC-1 · the constraint, asserted as BEHAVIOUR
     * ══════════════════════════════════════════════════════════════════════════════════════ */

    /// <summary>
    /// AC-1 — one row per (day, scope), including the TEAM row whose scope is <c>NULL</c>.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Asserted by inserting, not by reading <c>sys.indexes</c>.</b> The metadata check that
    /// ADR-013 prescribes for BR-4 wants <c>filter_definition</c> to be NON-null; here the correct
    /// answer is the opposite, because EF Core adds `[ScopeUserId] IS NOT NULL` to a unique index
    /// over a nullable column BY DEFAULT — which would exclude every team row from the constraint.
    /// `research.md` R-1b caught that in the generated migration and `.HasFilter(null)` removes it.
    /// </para>
    /// <para>
    /// So the assertion is the behaviour the filter would have broken: a second TEAM row for one
    /// day is refused. A metadata assertion would have passed on the broken index.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task A_second_team_row_for_one_day_is_refused_by_the_database()
    {
        var day = Day(10);
        await ClearAsync(day);

        await InsertTeamRowAsync(day, unassigned: 1);

        var act = async () => await InsertTeamRowAsync(day, unassigned: 2);

        (await act.Should().ThrowAsync<SqlException>(
            "the unique index covers the TEAM row too — EF's default filter would have excluded "
            + "it, and two team snapshots for one day would make the trend arrow depend on which "
            + "row the engine happened to return first"))
            .Which.Number.Should().BeOneOf(
                [2601, 2627],
                "a unique-index violation, not some other failure that happens to throw");

        (await RowsAsync(day)).Should().ContainSingle(
            "and the first row is still the only one");

        await ClearAsync(day);
    }

    /* ══════════════════════════════════════════════════════════════════════════════════════
     * AC-2, AC-3 · idempotence and the race
     * ══════════════════════════════════════════════════════════════════════════════════════ */

    /// <summary>
    /// AC-2 — capturing twice for one day updates the row rather than adding a second.
    /// </summary>
    /// <remarks>
    /// The state is CHANGED between the two captures and the assertion reads the numbers back, so
    /// this cannot pass on a second call that silently did nothing. Counting rows alone would.
    /// </remarks>
    [Fact]
    public async Task Capturing_twice_updates_the_row_rather_than_adding_one()
    {
        var day = Day(20);
        await ClearAsync(day);

        await CaptureAsync(day);

        var first = (await RowsAsync(day)).Single(row => row.ScopeUserId is null);

        // One more unassigned ticket, so the second capture MUST see a different number.
        var customerId = await AuditFixture.SeedCustomerAsync(factory);
        await DashboardFixture.SeedTicketAsync(factory, customerId, DateTime.UtcNow.AddHours(-3));

        var later = CapturedAt.AddHours(2);
        await CaptureAsync(day, later);

        var rows = await RowsAsync(day);
        var second = rows.Single(row => row.ScopeUserId is null);

        rows.Count(row => row.ScopeUserId is null).Should().Be(1, "AC-2 — one row, updated");
        second.UnassignedCount.Should().Be(
            first.UnassignedCount + 1,
            "the row carries the SECOND capture's numbers, not the first's — a no-op second call "
            + "would leave the old count and still satisfy a row count");
        second.CapturedAtUtc.Should().Be(later, "and it says when it was refreshed");

        await ClearAsync(day);
    }

    /// <summary>
    /// AC-3 — two captures racing for one day produce one row per scope and no exception.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The project's second concurrency test, in the shape `007` AC-13 established. It exists
    /// because the <c>INSERT … WHERE NOT EXISTS</c> inside the capture IS check-then-act: both
    /// callers can find no row and both insert. The unique index refuses the loser, the capture
    /// reads that as "the other instance won", and re-runs into the UPDATE branch.
    /// </para>
    /// <para>
    /// <b>Separate scopes, and therefore separate DbContexts.</b> One context is not thread-safe,
    /// so racing two calls through a shared one would measure EF's internal state rather than the
    /// database's.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task Two_captures_racing_for_one_day_produce_one_row_each_and_no_exception()
    {
        var day = Day(30);
        await ClearAsync(day);

        var act = async () => await Task.WhenAll(
            CaptureAsync(day),
            CaptureAsync(day));

        await act.Should().NotThrowAsync(
            "the loser's duplicate-key violation means the row exists, which is the outcome asked "
            + "for — it is caught by index NAME and read as success");

        var rows = await RowsAsync(day);

        rows.Should().HaveCountGreaterThan(0);
        rows.Select(row => row.ScopeUserId).Should().OnlyHaveUniqueItems(
            "one row per scope, however many writers there were");

        await ClearAsync(day);
    }

    /* ══════════════════════════════════════════════════════════════════════════════════════
     * AC-4 · the capture and the read agree
     * ══════════════════════════════════════════════════════════════════════════════════════ */

    /// <summary>
    /// AC-4 — the captured team numbers equal the ones <c>GET /api/dashboard</c> reports.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>This is the assertion the shared predicates exist for</b>, and it is why they were
    /// extracted while `020` was still the only consumer. Two hand-written copies would agree on
    /// the day they were written and disagree after the first edit — and the symptom is a trend
    /// arrow contradicting the number directly above it by one, which is close to undebuggable
    /// from a screenshot.
    /// </para>
    /// <para>
    /// Compared field by field rather than as a whole object: the read carries fields the snapshot
    /// does not, and an object comparison would have to be loosened until it asserted nothing.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task The_captured_team_levels_equal_what_the_endpoint_reports()
    {
        var day = Day(40);
        await ClearAsync(day);

        await CaptureAsync(day);

        var response = await factory.CreateManagerClient().GetAsync("/api/dashboard");
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var attention = JsonDocument
            .Parse(await response.Content.ReadAsStringAsync())
            .RootElement
            .GetProperty("attention");

        var snapshot = (await RowsAsync(day)).Single(row => row.ScopeUserId is null);

        snapshot.UnassignedCount.Should().Be(
            attention.GetProperty("unassignedCount").GetInt32(),
            "the same predicate, from DashboardTrendPredicates.Unassigned");

        snapshot.EscalatedOpenCount.Should().Be(
            attention.GetProperty("escalatedOpenCount").GetInt32());

        snapshot.WaitingOnCustomerCount.Should().Be(
            attention.GetProperty("waitingOnCustomerCount").GetInt32());

        await ClearAsync(day);
    }

    /// <summary>
    /// The team row and the per-agent rows are different numbers, and the agent's are scoped.
    /// </summary>
    /// <remarks>
    /// <c>unassignedCount</c> is the documented exception — global in every scope, because an
    /// unassigned ticket has no owner. Everything else narrows. Both halves are asserted, because
    /// asserting only the narrowing would pass on a capture that scoped the global one too.
    /// </remarks>
    [Fact]
    public async Task An_agent_row_is_scoped_while_the_unassigned_count_stays_global()
    {
        var day = Day(50);
        await ClearAsync(day);

        var customerId = await AuditFixture.SeedCustomerAsync(factory);
        var agentId = await UserIdAsync(
            Wasl.Infrastructure.Persistence.Seed.SupportUserSeeder.AgentTwoEmail);

        // One ticket waiting on the customer, assigned to somebody else entirely.
        await DashboardFixture.SeedTicketAsync(
            factory,
            customerId,
            DateTime.UtcNow.AddHours(-5),
            status: TicketStatus.PendingCustomer,
            assignedToUserId: await UserIdAsync(
                Wasl.Infrastructure.Persistence.Seed.SupportUserSeeder.ManagerEmail));

        await CaptureAsync(day);

        var rows = await RowsAsync(day);
        var team = rows.Single(row => row.ScopeUserId is null);
        var agent = rows.Single(row => row.ScopeUserId == agentId);

        agent.UnassignedCount.Should().Be(
            team.UnassignedCount,
            "an unassigned ticket has no owner, so there is no `mine` version of it — the "
            + "documented exception `020` carries on the tile");

        team.WaitingOnCustomerCount.Should().BeGreaterThan(
            agent.WaitingOnCustomerCount,
            "the ticket just seeded is the manager's, so it counts for the team and not for this "
            + "agent — if these were equal the scope clause would be doing nothing");

        await ClearAsync(day);
    }

    /* ══════════════════════════════════════════════════════════════════════════════════════
     * AC-9 · no back-fill
     * ══════════════════════════════════════════════════════════════════════════════════════ */

    /// <summary>
    /// AC-9 — capturing day 3 writes day 3 only. A missed day stays missing.
    /// </summary>
    /// <remarks>
    /// The ruling behind this is Q-1's second half: a snapshot is the level AT THE MOMENT OF
    /// CAPTURE, so filing today's levels under yesterday would be the reconstruction defect
    /// `spec.md` §2.1 rejects, wearing a different hat. This test is what stops a helpful
    /// back-fill being added later.
    /// </remarks>
    [Fact]
    public async Task A_missed_day_is_not_back_filled()
    {
        var missed = Day(60);
        var captured = Day(62);

        await ClearAsync(missed);
        await ClearAsync(captured);

        await CaptureAsync(captured);

        (await RowsAsync(captured)).Should().NotBeEmpty("the day asked for is written");
        (await RowsAsync(missed)).Should().BeEmpty(
            "and no other day is — a capture writes the date it was given and never invents one");

        await ClearAsync(captured);
    }

    /// <summary>
    /// The oldest-untouched age is <c>null</c> when nothing qualifies — never <c>0</c>.
    /// </summary>
    /// <remarks>
    /// Asserted on the shape of the value rather than on its magnitude: `020`'s medians make the
    /// same distinction, and a `0` here would render as an age and be read as one.
    /// </remarks>
    [Fact]
    public async Task The_oldest_untouched_age_is_null_or_a_real_age_but_never_a_zero_placeholder()
    {
        var day = Day(70);
        await ClearAsync(day);

        await CaptureAsync(day);

        var team = (await RowsAsync(day)).Single(row => row.ScopeUserId is null);

        if (team.UnassignedCount == 0)
        {
            team.OldestUntouchedHours.Should().BeNull();
        }
        else
        {
            team.OldestUntouchedHours.Should().NotBeNull(
                "there are unassigned tickets, so one of them is the oldest");
        }

        await ClearAsync(day);
    }

    private async Task<Guid> UserIdAsync(string email)
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        return await context.SupportUsers
            .Where(user => user.Email == email)
            .Select(user => user.Id)
            .SingleAsync();
    }
}
