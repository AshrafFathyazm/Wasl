using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Infrastructure.Persistence;
using Wasl.Infrastructure.Queries;

namespace Wasl.Api.IntegrationTests.Dashboard;

/// <summary>
/// <c>attention.previous</c> on <c>GET /api/dashboard</c>. `020b` AC-5 to AC-8.
/// </summary>
/// <remarks>
/// <para>
/// <b>These tests write the snapshot row themselves rather than running the capture.</b> The
/// baseline day is *the day before the range began* — a fortnight ago for the default range — and
/// the capture only ever writes the day it is given. Arranging the row directly is what lets the
/// read be tested at every range without a fake clock.
/// </para>
/// <para>
/// The rows are deleted afterwards. The suite shares one database, and a stray baseline would put
/// an arrow on `020`'s own tests.
/// </para>
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class DashboardTrendReadTests(WaslApiFactory factory)
{
    private static readonly Regex BareDate = new(@"^\d{4}-\d{2}-\d{2}$", RegexOptions.Compiled);

    private static readonly TimeZoneInfo Riyadh =
        TimeZoneInfo.FindSystemTimeZoneById(OrganizationTimeZone.DefaultId);

    /// <summary>The local day the API will compare a range of <paramref name="days"/> against.</summary>
    private static DateOnly BaselineFor(int days)
    {
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, Riyadh));

        // The spine's first day is `today - (days - 1)`; the baseline is the day before that.
        return today.AddDays(-days);
    }

    private async Task WriteSnapshotAsync(
        DateOnly localDate,
        Guid? scopeUserId,
        int unassigned,
        int escalated = 0,
        int waiting = 0,
        int? oldestUntouchedHours = null)
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        await context.Database.ExecuteSqlAsync(
            $"""
            INSERT INTO dbo.DashboardDailySnapshot
                (LocalDate, ScopeUserId, UnassignedCount, EscalatedOpenCount,
                 WaitingOnCustomerCount, AssignedCount, OldestUntouchedHours, CapturedAtUtc)
            VALUES ({localDate}, {scopeUserId}, {unassigned}, {escalated}, {waiting}, 0,
                    {oldestUntouchedHours}, SYSUTCDATETIME())
            """);
    }

    private async Task ClearAsync(DateOnly localDate)
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        await context.Database.ExecuteSqlAsync(
            $"DELETE FROM dbo.DashboardDailySnapshot WHERE LocalDate = {localDate}");
    }

    private static async Task<JsonElement> AttentionOf(HttpResponseMessage response)
    {
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        return JsonDocument
            .Parse(await response.Content.ReadAsStringAsync())
            .RootElement
            .GetProperty("attention");
    }

    /* ══════════════════════════════════════════════════════════════════════════════════════
     * AC-5, AC-6 · present when there is a baseline, absent when there is not
     * ══════════════════════════════════════════════════════════════════════════════════════ */

    /// <summary>
    /// AC-5 — with no snapshot for the baseline day, <c>previous</c> is absent from the document.
    /// </summary>
    /// <remarks>
    /// <b>Absent, not <c>null</c>, and asserted on the raw JSON.</b> `020`'s <c>teamLoad</c> makes
    /// the same distinction for the same reason: a deserialised object cannot tell an absent
    /// property from a null one, and the client's test for whether to draw an arrow is exactly
    /// that difference. Ruled Q-2 — the first fortnight shows no arrow at all.
    /// </remarks>
    [Theory]
    [InlineData("", 14)]
    [InlineData("?range=7d", 7)]
    [InlineData("?range=30d", 30)]
    public async Task Without_a_snapshot_for_the_baseline_day_there_is_no_previous(
        string query,
        int days)
    {
        await ClearAsync(BaselineFor(days));

        var attention = await AttentionOf(
            await factory.CreateManagerClient().GetAsync($"/api/dashboard{query}"));

        attention.TryGetProperty("previous", out _).Should().BeFalse(
            "no baseline means the question has no answer — and a dash or a zero would imply a "
            + "comparison that does not exist");
    }

    /// <summary>
    /// AC-5, AC-6 — with a snapshot, <c>previous</c> carries its numbers and names its day.
    /// </summary>
    /// <remarks>
    /// The day is asserted against the one the test wrote, so an off-by-one in the spine — or a
    /// baseline derived in the wrong timezone — fails here rather than producing an arrow measured
    /// against the wrong day.
    /// </remarks>
    [Theory]
    [InlineData("", 14)]
    [InlineData("?range=7d", 7)]
    [InlineData("?range=30d", 30)]
    public async Task With_a_snapshot_previous_carries_the_levels_and_names_the_day(
        string query,
        int days)
    {
        var baseline = BaselineFor(days);
        await ClearAsync(baseline);

        await WriteSnapshotAsync(
            baseline,
            scopeUserId: null,
            unassigned: 9,
            escalated: 4,
            waiting: 16,
            oldestUntouchedHours: 51);

        var attention = await AttentionOf(
            await factory.CreateManagerClient().GetAsync($"/api/dashboard{query}"));

        var previous = attention.GetProperty("previous");

        previous.GetProperty("localDate").GetString().Should().Be(
            baseline.ToString("yyyy-MM-dd"),
            "AC-6 — the day is echoed, so no client re-derives it in a timezone it does not have");

        previous.GetProperty("localDate").GetString().Should().MatchRegex(
            BareDate, "a bare calendar date, like every other date in this document");

        previous.GetProperty("unassignedCount").GetInt32().Should().Be(9);
        previous.GetProperty("escalatedOpenCount").GetInt32().Should().Be(4);
        previous.GetProperty("waitingOnCustomerCount").GetInt32().Should().Be(16);
        previous.GetProperty("oldestUntouchedHours").GetInt32().Should().Be(51);

        previous.EnumerateObject().Select(property => property.Name)
            .Should().BeEquivalentTo(
                [
                    "localDate", "unassignedCount", "escalatedOpenCount",
                    "waitingOnCustomerCount", "oldestUntouchedHours",
                ],
                "the contract change of 2026-09-07, exactly — and NO server-computed delta: the "
                + "client needs the baseline to make the arrow checkable");

        await ClearAsync(baseline);
    }

    /// <summary>
    /// <c>oldestUntouchedHours</c> survives as <c>null</c> rather than becoming zero.
    /// </summary>
    [Fact]
    public async Task A_null_baseline_age_stays_null_rather_than_becoming_zero()
    {
        var baseline = BaselineFor(14);
        await ClearAsync(baseline);

        await WriteSnapshotAsync(baseline, scopeUserId: null, unassigned: 3);

        var previous = (await AttentionOf(
            await factory.CreateManagerClient().GetAsync("/api/dashboard")))
            .GetProperty("previous");

        previous.GetProperty("oldestUntouchedHours").ValueKind.Should().Be(
            JsonValueKind.Null,
            "nothing was untouched that day — and 0 hours is an age, which would be read as one");

        await ClearAsync(baseline);
    }

    /* ══════════════════════════════════════════════════════════════════════════════════════
     * AC-7 · the baseline is scoped like everything else
     * ══════════════════════════════════════════════════════════════════════════════════════ */

    /// <summary>
    /// AC-7 — a Manager reads the team's baseline and an Agent reads their own.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Two rows for one day with deliberately different numbers</b>, so the test cannot pass by
    /// reading the wrong one: if the scope clause were ignored, the Manager and the Agent would
    /// report the same figure and both assertions could not hold at once.
    /// </para>
    /// <para>
    /// The bug this prevents is the one Q-3's ruling names: *my unassigned = 3* under
    /// *▲ 5 vs prev* where the 5 is the team's.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task A_manager_reads_the_teams_baseline_and_an_agent_reads_their_own()
    {
        var baseline = BaselineFor(14);
        await ClearAsync(baseline);

        var agentId = await UserIdAsync(
            Wasl.Infrastructure.Persistence.Seed.SupportUserSeeder.AgentEmail);

        await WriteSnapshotAsync(baseline, scopeUserId: null, unassigned: 90, escalated: 9);
        await WriteSnapshotAsync(baseline, scopeUserId: agentId, unassigned: 90, escalated: 2);

        var manager = await AttentionOf(
            await factory.CreateManagerClient().GetAsync("/api/dashboard"));
        var agent = await AttentionOf(
            await factory.CreateAgentClient().GetAsync("/api/dashboard"));

        manager.GetProperty("previous").GetProperty("escalatedOpenCount").GetInt32()
            .Should().Be(9, "the team's row");

        agent.GetProperty("previous").GetProperty("escalatedOpenCount").GetInt32()
            .Should().Be(
                2,
                "the agent's own row — an unscoped baseline under a scoped number is the semantic "
                + "bug Q-3 was ruled against");

        await ClearAsync(baseline);
    }

    /// <summary>
    /// An Agent with no row of their own gets no baseline, even when the TEAM has one.
    /// </summary>
    /// <remarks>
    /// The tempting bug is a <c>LEFT JOIN</c> that falls back to the team row when the agent's is
    /// missing — which would put the team's numbers under the agent's tile and look plausible.
    /// </remarks>
    [Fact]
    public async Task An_agent_with_no_row_gets_no_baseline_even_when_the_team_has_one()
    {
        var baseline = BaselineFor(14);
        await ClearAsync(baseline);

        await WriteSnapshotAsync(baseline, scopeUserId: null, unassigned: 90);

        var agent = await AttentionOf(
            await factory.CreateAgentClient().GetAsync("/api/dashboard"));

        agent.TryGetProperty("previous", out _).Should().BeFalse(
            "there is no baseline for THIS agent, and the team's is not a substitute");

        await ClearAsync(baseline);
    }

    /* ══════════════════════════════════════════════════════════════════════════════════════
     * AC-8 · and it still costs no eighth command
     * ══════════════════════════════════════════════════════════════════════════════════════ */

    /// <summary>
    /// AC-8 — seven commands for a Manager and six for an Agent, WITH a baseline present.
    /// </summary>
    /// <remarks>
    /// <para>
    /// `020` TEST-020-02 already asserts the counts; this asserts they did not move when the
    /// baseline arrived. The measurement is taken with a snapshot row in place, because a
    /// <c>LEFT JOIN</c> that matched nothing could hide a second command that only runs on a hit.
    /// </para>
    /// <para>
    /// An equality, never a threshold — a threshold drifts with every unrelated change, and the
    /// property under test is *no extra round trip*, not *not too chatty*.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task The_baseline_costs_no_extra_command()
    {
        var baseline = BaselineFor(14);
        await ClearAsync(baseline);

        var agentId = await UserIdAsync(
            Wasl.Infrastructure.Persistence.Seed.SupportUserSeeder.AgentEmail);

        await WriteSnapshotAsync(baseline, scopeUserId: null, unassigned: 7);
        await WriteSnapshotAsync(baseline, scopeUserId: agentId, unassigned: 3);

        var managerClient = factory.CreateManagerClient();
        var agentClient = factory.CreateAgentClient();

        // Warm both, so nothing first-request lands inside the measured window.
        (await managerClient.GetAsync("/api/dashboard")).EnsureSuccessStatusCode();
        (await agentClient.GetAsync("/api/dashboard")).EnsureSuccessStatusCode();

        var managerProbe = factory.CountQueries();
        var manager = await AttentionOf(await managerClient.GetAsync("/api/dashboard"));
        var managerCount = managerProbe.Count;

        var agentProbe = factory.CountQueries();
        var agent = await AttentionOf(await agentClient.GetAsync("/api/dashboard"));
        var agentCount = agentProbe.Count;

        // The baseline really was in the response — otherwise the counts above measure the
        // no-match path and prove nothing about the join.
        manager.GetProperty("previous").GetProperty("unassignedCount").GetInt32().Should().Be(7);
        agent.GetProperty("previous").GetProperty("unassignedCount").GetInt32().Should().Be(3);

        managerCount.Should().Be(7, "the baseline is a LEFT JOIN, not an eighth command");
        agentCount.Should().Be(6, "and teamLoad is still not executed for an Agent");

        await ClearAsync(baseline);
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
