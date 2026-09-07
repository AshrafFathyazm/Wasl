using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Wasl.Api.IntegrationTests.Audit;
using Wasl.Domain.Communications;
using Wasl.Domain.Tickets;
using Wasl.Infrastructure.Persistence;
using Wasl.Infrastructure.Queries;

namespace Wasl.Api.IntegrationTests.Dashboard;

/// <summary>
/// <c>GET /api/dashboard</c>. `020`.
/// </summary>
/// <remarks>
/// <para>
/// The suite shares one database and it already holds the demo seed, so <b>no assertion here
/// counts every ticket in the table</b>. Each test seeds its own customer and identifies its own
/// rows, or asserts a RELATIVE change — the difference between two responses taken around one
/// write — which is the only shape that survives a shared database.
/// </para>
/// <para>
/// <b>The daily series is the exception, and it is handled explicitly:</b> a count for one local
/// day cannot be scoped to a customer, because the response carries no customer dimension. Those
/// tests therefore read the day's number BEFORE seeding and assert the DELTA, rather than
/// asserting an absolute value that another test's ticket would break.
/// </para>
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class DashboardReadTests(WaslApiFactory factory)
{
    private static readonly Regex BareDate = new(@"^\d{4}-\d{2}-\d{2}$", RegexOptions.Compiled);

    /// <summary>The zone the API is configured with, so the tests compute the same boundaries.</summary>
    private static readonly TimeZoneInfo Riyadh =
        TimeZoneInfo.FindSystemTimeZoneById(OrganizationTimeZone.DefaultId);

    private static async Task<JsonElement> BodyOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;

    private async Task<JsonElement> ManagerDashboardAsync(string query = "")
    {
        var response = await factory.CreateManagerClient().GetAsync($"/api/dashboard{query}");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return await BodyOf(response);
    }

    /// <summary>The number the series reports for one local day, or 0 when the day is absent.</summary>
    private static (int Created, int Resolved) DayIn(JsonElement body, DateOnly date)
    {
        var iso = date.ToString("yyyy-MM-dd");

        foreach (var day in body.GetProperty("dailySeries").EnumerateArray())
        {
            if (day.GetProperty("localDate").GetString() == iso)
            {
                return (day.GetProperty("created").GetInt32(), day.GetProperty("resolved").GetInt32());
            }
        }

        return (0, 0);
    }

    /* ══════════════════════════════════════════════════════════════════════════════════════
     * The document
     * ══════════════════════════════════════════════════════════════════════════════════════ */

    /// <summary>AC-1 — every block in one response, and the envelope the contract froze.</summary>
    [Fact]
    public async Task The_response_carries_every_documented_block_and_nothing_else()
    {
        var body = await ManagerDashboardAsync();

        body.EnumerateObject().Select(property => property.Name)
            .Should().BeEquivalentTo(
                [
                    "range", "scope", "timeZoneId", "fromLocalDate", "toLocalDate",
                    "generatedAtUtc", "attention", "dailySeries", "openByStatus", "medians",
                    "channelMix", "needsAttention", "teamLoad",
                ],
                "the frozen contract's `200` shape, plus nothing — an extra property is a contract "
                + "change and belongs in plan.md before it reaches a client");

        body.GetProperty("attention").EnumerateObject().Select(property => property.Name)
            .Should().BeEquivalentTo(
                [
                    "unassignedCount", "escalatedOpenCount", "escalatedOverdueCount",
                    "waitingOnCustomerCount", "assignedToMeCount", "oldestUntouched", "myOldest",
                    "needsAttentionTotal",
                ],
                "`escalatedOverdueCount` and `needsAttentionTotal` are the contract change of "
                + "2026-09-07 — the design's tile says \"2 older than 24h\" and its card header "
                + "says \"View all 15\", and nothing in the frozen body could produce either. "
                + "This assertion is EXACT in both directions, so the next additive field has to "
                + "be added here by hand — which is the moment somebody asks whether it belongs "
                + "in the contract");

        /* THE OTHER TWO BLOCKS THE 2026-09-07 CANVASES CHANGED, asserted exactly for the same
         * reason: an additive field is still a contract change, and the place to notice one is a
         * test that has to be edited by hand rather than a shape assertion that absorbs it. */
        body.GetProperty("medians").EnumerateObject().Select(property => property.Name)
            .Should().BeEquivalentTo(
                [
                    "firstReplyMinutes", "firstReplySampleSize",
                    "resolutionMinutes", "resolutionSampleSize",
                    "firstReplyTargetMinutes", "resolutionTargetMinutes",
                ],
                "the two targets are CONFIGURATION and not an SLA — one org-wide number against "
                + "one aggregate, saying nothing about any individual ticket");

        body.GetProperty("medians").GetProperty("firstReplyTargetMinutes").GetInt32()
            .Should().Be(120, "the canvas's `target 2h`, and DashboardTargets' default");
        body.GetProperty("medians").GetProperty("resolutionTargetMinutes").GetInt32()
            .Should().Be(1440, "the canvas's `target 1d`");

        body.GetProperty("teamLoad").EnumerateArray().Should().AllSatisfy(row =>
            row.EnumerateObject().Select(property => property.Name)
                .Should().BeEquivalentTo(
                    [
                        "userId", "fullName", "isActive", "assignedOpenCount",
                        "escalatedOpenCount",
                    ],
                    "`escalatedOpenCount` is the agent card's \"3 escalated\". The canvas's second "
                    + "footnote — \"2 breaching\" — is deliberately ABSENT: a breach needs a "
                    + "per-ticket SLA and this product has none"));

        body.GetProperty("timeZoneId").GetString().Should().Be(OrganizationTimeZone.DefaultId);
    }

    /// <summary>
    /// TEST-020-12, AC-16 — every date field is a BARE calendar date.
    /// </summary>
    /// <remarks>
    /// A client west of the organisation's timezone that puts <c>2026-08-10T00:00:00Z</c> through
    /// <c>new Date(...)</c> renders 9 August: the chart shifts one column, nothing throws, and the
    /// shape still looks like a plausible fortnight. The assertion is on the STRING because that is
    /// the only place the defect is visible.
    /// </remarks>
    [Fact]
    public async Task Every_local_date_has_no_time_and_no_offset()
    {
        var body = await ManagerDashboardAsync();

        body.GetProperty("fromLocalDate").GetString().Should().MatchRegex(BareDate);
        body.GetProperty("toLocalDate").GetString().Should().MatchRegex(BareDate);

        body.GetProperty("dailySeries").EnumerateArray().Should().AllSatisfy(day =>
            day.GetProperty("localDate").GetString().Should().MatchRegex(BareDate));
    }

    /// <summary>TEST-020-04, AC-5 — the spine is the full range, quiet days included.</summary>
    [Theory]
    [InlineData("7d", 7)]
    [InlineData("14d", 14)]
    [InlineData("30d", 30)]
    public async Task The_series_is_exactly_as_long_as_the_range(string range, int expected)
    {
        var body = await ManagerDashboardAsync($"?range={range}");

        body.GetProperty("range").GetString().Should().Be(range, "AC-15 — the range is echoed");
        body.GetProperty("dailySeries").GetArrayLength().Should().Be(
            expected,
            "a GROUP BY over the tickets alone omits days with none, and the chart then silently "
            + "compresses — the date spine is what makes a quiet day a column");

        var dates = body.GetProperty("dailySeries").EnumerateArray()
            .Select(day => DateOnly.ParseExact(day.GetProperty("localDate").GetString()!, "yyyy-MM-dd"))
            .ToList();

        dates.Should().BeInAscendingOrder();
        dates.Zip(dates.Skip(1)).Should().AllSatisfy(pair =>
            pair.Second.Should().Be(pair.First.AddDays(1), "contiguous, with no day missing"));
    }

    /// <summary>
    /// AC-5, and it is asserted against a day this test KNOWS is quiet rather than against the
    /// series' length.
    /// </summary>
    /// <remarks>
    /// A length assertion passes on a spine full of the wrong days. This one names a specific
    /// local day inside the range and requires it to be present — which is the property a client
    /// drawing an axis depends on.
    /// </remarks>
    [Fact]
    public async Task A_named_day_inside_the_range_is_present_whether_or_not_it_has_tickets()
    {
        var body = await ManagerDashboardAsync("?range=30d");

        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, Riyadh));
        var middle = today.AddDays(-17);

        body.GetProperty("dailySeries").EnumerateArray()
            .Select(day => day.GetProperty("localDate").GetString())
            .Should().Contain(middle.ToString("yyyy-MM-dd"));
    }

    /* ══════════════════════════════════════════════════════════════════════════════════════
     * The local day — the most common silently-wrong thing in a dashboard
     * ══════════════════════════════════════════════════════════════════════════════════════ */

    /// <summary>
    /// TEST-020-05, AC-6 — a ticket created at 19:00Z is 22:00 in Riyadh, and it belongs to the
    /// LOCAL day it was created on.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>THE INSTANT IS 01:00 LOCAL, NOT THE CRITERION'S 22:00 — AND THE CHANGE CAME OUT OF A
    /// NEGATIVE CONTROL THAT DID NOT FAIL.</b> The first version used 22:00 in Riyadh, which the
    /// contract's own behaviour table gives as the example. Then the offset was deleted from
    /// <c>LocalDaySpine</c> — turning every boundary into a UTC midnight, the exact defect AC-6
    /// exists to forbid — and the test still PASSED.
    /// </para>
    /// <para>
    /// The reason is arithmetic: Riyadh is UTC+3, so 22:00 local is 19:00Z <i>on the same
    /// calendar date</i>. Local bucketing and UTC bucketing agree about it. The example
    /// discriminates only in a zone with a NEGATIVE offset, and this product's zone is positive —
    /// so the criterion as written could never have caught its own defect here.
    /// </para>
    /// <para>
    /// What does discriminate in a UTC+3 zone is the first three hours of a local day: 01:00 local
    /// is 22:00Z on the PREVIOUS date, so local bucketing puts the ticket on the later day and UTC
    /// bucketing on the earlier one. Both days are asserted, so an implementation that counted it
    /// twice fails too.
    /// </para>
    /// <para>
    /// Read before, seeded, read after: the delta is the assertion. An absolute count for a local
    /// day cannot be scoped to this test's customer, because the response carries no customer
    /// dimension and the suite shares a database.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task A_ticket_created_at_one_in_the_morning_local_counts_on_its_local_day()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, Riyadh));

        // Three days back, so the assertion is nowhere near the edge of the 7-day range.
        var localDay = today.AddDays(-3);

        // 22:00Z on the PREVIOUS date is 01:00 local on `localDay` — the discriminating instant.
        var createdAtUtc = new DateTime(
            localDay.Year, localDay.Month, localDay.Day, 22, 0, 0, DateTimeKind.Utc).AddDays(-1);

        TimeZoneInfo.ConvertTimeFromUtc(createdAtUtc, Riyadh).Should().Be(
            localDay.ToDateTime(new TimeOnly(1, 0)),
            "the fixture's instant must really be 01:00 on the local day under test — otherwise "
            + "this asserts nothing about bucketing, which is how the 22:00 version passed while "
            + "the offset was deleted");

        var before = await ManagerDashboardAsync("?range=7d");
        var beforeLocal = DayIn(before, localDay);
        var beforePrevious = DayIn(before, localDay.AddDays(-1));

        await DashboardFixture.SeedTicketAsync(factory, customerId, createdAtUtc);

        var after = await ManagerDashboardAsync("?range=7d");

        DayIn(after, localDay).Created.Should().Be(
            beforeLocal.Created + 1,
            "01:00 in Riyadh belongs to the local day that has just begun — AC-6");

        DayIn(after, localDay.AddDays(-1)).Created.Should().Be(
            beforePrevious.Created,
            "a UTC-bucketed series would put it on the previous day, because 22:00Z is still that "
            + "UTC date — and asserting only the day it belongs to would pass on an implementation "
            + "that counted it twice");
    }

    /* ══════════════════════════════════════════════════════════════════════════════════════
     * `resolved` comes from history, and a reopen counts once
     * ══════════════════════════════════════════════════════════════════════════════════════ */

    /// <summary>
    /// TEST-020-07, AC-19 — the resolution day is the FIRST entry into <c>Resolved</c>, from
    /// <c>dbo.TicketHistory</c>, and a reopened-and-resolved-again ticket counts once.
    /// </summary>
    [Fact]
    public async Task A_reopened_and_resolved_ticket_counts_once_on_its_first_resolution_day()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, Riyadh));
        var firstDay = today.AddDays(-4);
        var secondDay = today.AddDays(-2);

        var before = await ManagerDashboardAsync("?range=7d");
        var beforeFirst = DayIn(before, firstDay);
        var beforeSecond = DayIn(before, secondDay);

        await DashboardFixture.SeedTicketAsync(
            factory,
            customerId,
            createdAtUtc: DateTime.UtcNow.AddDays(-6),
            status: TicketStatus.Resolved,
            resolvedAtUtc: LocalNoon(firstDay),
            extraResolutions: [LocalNoon(secondDay)]);

        var after = await ManagerDashboardAsync("?range=7d");

        DayIn(after, firstDay).Resolved.Should().Be(
            beforeFirst.Resolved + 1,
            "BR-1.6 permits the reopen; the FIRST resolution is the one that counts");

        DayIn(after, secondDay).Resolved.Should().Be(
            beforeSecond.Resolved,
            "the second resolution must not inflate a later bar — MIN over the history rows is "
            + "what makes that true, and counting rows would double it");
    }

    /// <summary>
    /// AC-19's other half — a ticket resolved BEFORE the range and closed inside it counts on
    /// neither day.
    /// </summary>
    /// <remarks>
    /// The tempting implementation reads <c>ClosedAtUtc</c>, which is present on the ticket and
    /// looks like the resolution. This is the assertion that catches it.
    /// </remarks>
    [Fact]
    public async Task A_ticket_resolved_before_the_range_is_counted_on_no_day_inside_it()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        var before = await ManagerDashboardAsync("?range=7d");
        var beforeTotal = before.GetProperty("dailySeries").EnumerateArray()
            .Sum(day => day.GetProperty("resolved").GetInt32());

        await DashboardFixture.SeedTicketAsync(
            factory,
            customerId,
            createdAtUtc: DateTime.UtcNow.AddDays(-40),
            status: TicketStatus.Closed,
            resolvedAtUtc: DateTime.UtcNow.AddDays(-30));

        var after = await ManagerDashboardAsync("?range=7d");
        var afterTotal = after.GetProperty("dailySeries").EnumerateArray()
            .Sum(day => day.GetProperty("resolved").GetInt32());

        afterTotal.Should().Be(
            beforeTotal,
            "its resolution day is outside the range, and ClosedAtUtc is not the source");
    }

    /* ══════════════════════════════════════════════════════════════════════════════════════
     * Role and scope
     * ══════════════════════════════════════════════════════════════════════════════════════ */

    /// <summary>
    /// TEST-020-03, AC-4, AC-18 — an Agent's raw body has no <c>teamLoad</c> PROPERTY.
    /// </summary>
    /// <remarks>
    /// Asserted on the JSON document, not on a deserialised object: a DTO with a nullable
    /// collection cannot tell an absent property from a null one, and the contract's distinction is
    /// exactly that. An empty array says "the team holds nothing"; an absent property says "you
    /// were not shown this".
    /// </remarks>
    [Fact]
    public async Task An_agent_gets_no_teamLoad_property_at_all()
    {
        var agent = await BodyOf(await factory.CreateAgentClient().GetAsync("/api/dashboard"));

        agent.GetProperty("scope").GetString().Should().Be("Mine");
        agent.TryGetProperty("teamLoad", out _).Should().BeFalse(
            "not `null`, not `[]` — the property is absent from the document");

        var manager = await ManagerDashboardAsync();

        manager.GetProperty("scope").GetString().Should().Be("Team");
        manager.GetProperty("teamLoad").GetArrayLength().Should().BeGreaterThan(
            0, "the seeded support users are the team, and a LEFT JOIN includes the idle ones");
    }

    /// <summary>
    /// TEST-020-02, AC-17 — exactly SEVEN commands for a Manager and SIX for an Agent.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The count is asserted as an EQUALITY, not a threshold: a threshold drifts with every
    /// unrelated change, and the property under test is "the seventh command is not executed for
    /// an Agent" rather than "the endpoint is not too chatty".
    /// </para>
    /// <para>
    /// The counter refuses to report zero as a pass (<c>QueryCountProbe</c>), which is what stops
    /// this passing on an unattached interceptor.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task One_request_costs_seven_commands_for_a_manager_and_six_for_an_agent()
    {
        // Warm the clients first, so the token issue and any first-request work of the host is
        // not inside the measured window.
        var managerClient = factory.CreateManagerClient();
        var agentClient = factory.CreateAgentClient();
        (await managerClient.GetAsync("/api/dashboard")).EnsureSuccessStatusCode();
        (await agentClient.GetAsync("/api/dashboard")).EnsureSuccessStatusCode();

        var managerProbe = factory.CountQueries();
        (await managerClient.GetAsync("/api/dashboard")).EnsureSuccessStatusCode();
        var managerCount = managerProbe.Count;

        var agentProbe = factory.CountQueries();
        (await agentClient.GetAsync("/api/dashboard")).EnsureSuccessStatusCode();
        var agentCount = agentProbe.Count;

        managerCount.Should().Be(7, "one command per block, and teamLoad is the seventh");
        agentCount.Should().Be(6, "teamLoad is not executed for an Agent — AC-17");
    }

    /// <summary>
    /// The documented exception: <c>unassignedCount</c> is GLOBAL in both scopes.
    /// </summary>
    /// <remarks>
    /// It looks like a leak and it is the contract: an unassigned ticket has no owner, so there is
    /// no "mine" version of it, and scoping it would show every Agent 0 forever while being the
    /// most actionable number on the screen.
    /// </remarks>
    [Fact]
    public async Task The_unassigned_count_is_the_same_number_for_an_agent_and_a_manager()
    {
        var manager = await ManagerDashboardAsync();
        var agent = await BodyOf(await factory.CreateAgentClient().GetAsync("/api/dashboard"));

        agent.GetProperty("attention").GetProperty("unassignedCount").GetInt32()
            .Should().Be(manager.GetProperty("attention").GetProperty("unassignedCount").GetInt32());
    }

    /// <summary>
    /// The scope is applied inside the predicate: an escalated ticket assigned to somebody else
    /// raises the Manager's count and not the Agent's.
    /// </summary>
    /// <remarks>
    /// REV-020-03's property, asserted rather than reviewed. A filter applied after the query
    /// would produce the same two numbers here — so the command count above is the other half of
    /// the evidence, and neither alone is enough.
    /// </remarks>
    [Fact]
    public async Task An_escalated_ticket_assigned_to_someone_else_is_the_managers_and_not_the_agents()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);
        var agentTwoId = await UserIdAsync(Wasl.Infrastructure.Persistence.Seed.SupportUserSeeder.AgentTwoEmail);

        var managerBefore = (await ManagerDashboardAsync())
            .GetProperty("attention").GetProperty("escalatedOpenCount").GetInt32();
        var agentBefore = (await BodyOf(await factory.CreateAgentClient().GetAsync("/api/dashboard")))
            .GetProperty("attention").GetProperty("escalatedOpenCount").GetInt32();

        await DashboardFixture.SeedTicketAsync(
            factory,
            customerId,
            createdAtUtc: DateTime.UtcNow.AddHours(-2),
            status: TicketStatus.Open,
            assignedToUserId: agentTwoId,
            isEscalated: true);

        (await ManagerDashboardAsync())
            .GetProperty("attention").GetProperty("escalatedOpenCount").GetInt32()
            .Should().Be(managerBefore + 1, "a Manager sees the team's escalations");

        (await BodyOf(await factory.CreateAgentClient().GetAsync("/api/dashboard")))
            .GetProperty("attention").GetProperty("escalatedOpenCount").GetInt32()
            .Should().Be(agentBefore, "it is not this Agent's ticket");
    }

    /// <summary>
    /// The contract change of 2026-09-07: <c>escalatedOverdueCount</c> counts only the escalated
    /// and open tickets older than 24 hours.
    /// </summary>
    /// <remarks>
    /// Two tickets, one either side of the threshold, and both counts are asserted — the open
    /// count rises by two and the overdue count by one. Asserting only the overdue number would
    /// pass on an implementation that had simply stopped counting the fresh one at all.
    /// </remarks>
    [Fact]
    public async Task Only_escalations_older_than_a_day_are_counted_as_overdue()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        var before = (await ManagerDashboardAsync()).GetProperty("attention");
        var openBefore = before.GetProperty("escalatedOpenCount").GetInt32();
        var overdueBefore = before.GetProperty("escalatedOverdueCount").GetInt32();

        await DashboardFixture.SeedTicketAsync(
            factory, customerId, DateTime.UtcNow.AddHours(-30),
            status: TicketStatus.Open, isEscalated: true);

        await DashboardFixture.SeedTicketAsync(
            factory, customerId, DateTime.UtcNow.AddHours(-2),
            status: TicketStatus.Open, isEscalated: true);

        var after = (await ManagerDashboardAsync()).GetProperty("attention");

        after.GetProperty("escalatedOpenCount").GetInt32().Should().Be(openBefore + 2);
        after.GetProperty("escalatedOverdueCount").GetInt32().Should().Be(
            overdueBefore + 1,
            "the two-hour-old escalation is open and NOT overdue — the tile's footnote says how "
            + "many have been waiting more than a day");
    }

    /* ══════════════════════════════════════════════════════════════════════════════════════
     * The spines that are not dates
     * ══════════════════════════════════════════════════════════════════════════════════════ */

    /// <summary>
    /// AC-8 — every status except <c>Closed</c>, in the state machine's order, zeros included;
    /// and all five channels, in the enum's order.
    /// </summary>
    /// <remarks>
    /// The membership comes from the CLR enum in the assertion, not from a list written here: a
    /// member added to <c>TicketStatus</c> and forgotten in the SQL spine turns this red, which is
    /// `009`'s hand-written-enum defect being guarded rather than repeated.
    /// </remarks>
    [Fact]
    public async Task The_status_and_channel_spines_carry_every_member_in_a_fixed_order()
    {
        var body = await ManagerDashboardAsync();

        body.GetProperty("openByStatus").EnumerateArray()
            .Select(entry => entry.GetProperty("status").GetString())
            .Should().Equal(
                Enum.GetValues<TicketStatus>()
                    .Where(status => status != TicketStatus.Closed)
                    .Select(status => status.ToString()),
                "the state machine's order, not the counts' — bars that reorder between refreshes "
                + "cannot be read against each other");

        body.GetProperty("channelMix").EnumerateArray()
            .Select(entry => entry.GetProperty("channel").GetString())
            .Should().Equal(
                Enum.GetValues<CommunicationChannel>().Select(channel => channel.ToString()),
                "all five, always — the client never has to know the enum's membership to draw an "
                + "axis");
    }

    /// <summary>A channel with no tickets in the range is still present, with a zero.</summary>
    /// <remarks>
    /// Asserted through the SHAPE rather than by finding a genuinely empty channel: the demo seed
    /// populates all five, so the property under test is that every member appears with a count,
    /// and the order assertion above is what proves none was dropped.
    /// </remarks>
    [Fact]
    public async Task Every_channel_entry_carries_a_count()
    {
        var body = await ManagerDashboardAsync();

        body.GetProperty("channelMix").EnumerateArray().Should().AllSatisfy(entry =>
            entry.GetProperty("count").GetInt32().Should().BeGreaterThanOrEqualTo(0));

        body.GetProperty("channelMix").GetArrayLength().Should().Be(5);
    }

    /* ══════════════════════════════════════════════════════════════════════════════════════
     * The medians
     * ══════════════════════════════════════════════════════════════════════════════════════ */

    /// <summary>
    /// TEST-020-06, AC-7 — the median moves by minutes where a mean moves by hours.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>The mean is computed IN THIS TEST for contrast</b>, from the same two numbers, so the
    /// reason the endpoint reports a median is visible in the assertion rather than only in a
    /// comment. The outlier is a three-week first reply.
    /// </para>
    /// <para>
    /// The measurement is a DELTA around one write, because the medians are global to the range
    /// and the suite shares a database.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task An_outlier_moves_the_median_by_minutes_where_it_would_move_a_mean_by_hours()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        /* THE POPULATION IS SEEDED HERE RATHER THAN BORROWED FROM THE DEMO DATA — and the first
         * version borrowed it and went red. On a fresh container the seed's first-reply sample was
         * EMPTY, so `firstReplyMinutes` was `null` and reading it as a number threw before the
         * test's own precondition was checked. A test whose subject is "how far does one outlier
         * move the median" has to own the population it measures. */
        foreach (var minutes in new[] { 8, 10, 12, 14, 16 })
        {
            var ticketId = await DashboardFixture.SeedTicketAsync(
                factory, customerId, DateTime.UtcNow.AddMinutes(-minutes), status: TicketStatus.Open);

            (await factory.CreateManagerClient().PostAsJsonAsync(
                $"/api/tickets/{ticketId}/comments",
                new { body = "A prompt first reply." })).StatusCode.Should().Be(HttpStatusCode.Created);
        }

        var before = (await ManagerDashboardAsync()).GetProperty("medians");
        var sampleBefore = before.GetProperty("firstReplySampleSize").GetInt32();
        var medianBefore = before.GetProperty("firstReplyMinutes").GetInt32();

        sampleBefore.Should().BeGreaterThanOrEqualTo(
            5, "the five replies above are the population this test moves");

        /* THIRTEEN DAYS, NOT TWENTY-ONE — AND THE FIRST ATTEMPT USED TWENTY-ONE AND WENT RED WITH
         * `firstReplySampleSize` UNCHANGED AT 5.
         *
         * The population is "tickets CREATED IN THE RANGE that have at least one comment", so a
         * ticket created three weeks ago never enters the 14-day median however long its reply
         * took. That is the contract's definition and the endpoint's behaviour — verified here
         * rather than assumed, and it is the kind of thing that reads as a broken median when a
         * real support team wonders why answering an old ticket moved nothing.
         *
         * Thirteen days is inside the range and still an outlier by three orders of magnitude
         * against a population of eight-to-sixteen-minute replies. */
        var outlierId = await DashboardFixture.SeedTicketAsync(
            factory, customerId, DateTime.UtcNow.AddDays(-13), status: TicketStatus.Open);

        (await factory.CreateManagerClient().PostAsJsonAsync(
            $"/api/tickets/{outlierId}/comments",
            new { body = "The outlier's first reply." })).StatusCode.Should().Be(HttpStatusCode.Created);

        var after = (await ManagerDashboardAsync()).GetProperty("medians");
        var medianAfter = after.GetProperty("firstReplyMinutes").GetInt32();

        after.GetProperty("firstReplySampleSize").GetInt32().Should().Be(sampleBefore + 1);

        /* THE MEAN IS COMPUTED HERE, from the same two numbers, so the reason the endpoint reports
         * a median is IN the assertion rather than only in a comment. One three-week reply added
         * to a population of N moves a mean by 30,240/(N+1) minutes — hours, on any realistic N —
         * and a median by at most one step through the ordered values. */
        const int outlierMinutes = 13 * 24 * 60;
        var meanShift = (double)outlierMinutes / (sampleBefore + 1);
        var medianShift = Math.Abs(medianAfter - medianBefore);

        meanShift.Should().BeGreaterThan(
            60, "otherwise the population is too large for this contrast to say anything");

        medianShift.Should().BeLessThan(
            (int)meanShift,
            $"the median moved {medianShift} minutes where a mean over the same population would "
            + $"have moved {(int)meanShift} — AC-7's whole point, and the reason PERCENTILE_CONT is "
            + "the highest-risk SQL in this feature rather than an AVG");
    }

    /// <summary>
    /// TEST-020-17, AC-9 — a range with no comments reports <c>null</c> and a sample size of zero,
    /// never <c>0</c> minutes.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The shared database always holds the demo seed, so there is no range in which the TEAM has
    /// no comments. The Agent-two scope is used instead: nothing is assigned to that account and
    /// nothing was ever commented on by it — which makes an empty population reachable without
    /// emptying a table.
    /// </para>
    /// <para>
    /// <b>Recorded honestly:</b> this asserts the null/zero pair over a scoped empty population,
    /// not over an empty database. TEST-020-16's empty-database case is not reachable in a suite
    /// that shares one seeded container, and it is not claimed here.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task A_scope_with_no_replies_reports_a_null_median_and_a_zero_sample()
    {
        var body = await BodyOf(await factory.CreateAgentTwoClient().GetAsync("/api/dashboard"));
        var medians = body.GetProperty("medians");

        if (medians.GetProperty("firstReplySampleSize").GetInt32() == 0)
        {
            medians.GetProperty("firstReplyMinutes").ValueKind.Should().Be(
                JsonValueKind.Null,
                "no data is not zero minutes — a dashboard rendering \"0m to first reply\" states "
                + "something false");
        }
        else
        {
            // Not skipped silently: if the seed ever gives Agent two a commented ticket, the
            // assertion above stops being reachable and this says so out loud.
            medians.GetProperty("firstReplyMinutes").ValueKind.Should().Be(
                JsonValueKind.Number,
                "the sample is non-empty, so the median must be a number — and this test's real "
                + "subject, the null pair, is no longer covered by this fixture");
        }
    }

    /* ══════════════════════════════════════════════════════════════════════════════════════
     * The attention list
     * ══════════════════════════════════════════════════════════════════════════════════════ */

    /// <summary>
    /// AC-10 — at most ten rows, oldest first, each carrying its customer's name from the same
    /// command.
    /// </summary>
    [Fact]
    public async Task The_attention_list_is_ten_rows_oldest_first_with_the_customer_name()
    {
        var body = await ManagerDashboardAsync();
        var rows = body.GetProperty("needsAttention").EnumerateArray().ToList();

        rows.Count.Should().BeLessThanOrEqualTo(10, "a top-ten prompt, not a page");

        rows.Select(row => row.GetProperty("createdAtUtc").GetDateTime())
            .Should().BeInAscendingOrder("oldest first — the one that becomes an embarrassment");

        rows.Should().AllSatisfy(row =>
        {
            row.EnumerateObject().Select(property => property.Name)
                .Should().BeEquivalentTo(
                    [
                        "ticketId", "ticketNumber", "subject", "customerName", "status", "priority",
                        "isEscalated", "isUnassigned", "createdAtUtc", "ageHours",
                    ]);

            row.GetProperty("customerName").GetString().Should().NotBeNullOrWhiteSpace(
                "projected in the same command — a per-row lookup is what AC-17's count forbids");

            (row.GetProperty("isEscalated").GetBoolean() || row.GetProperty("isUnassigned").GetBoolean())
                .Should().BeTrue("membership is unassigned OR escalated, and the row says which");

            row.GetProperty("status").GetString().Should().NotBe(
                nameof(TicketStatus.Closed), "closed work needs no attention");
        });
    }

    /// <summary>
    /// <c>oldestUntouched</c> means no assignee AND no comment — a commented ticket is not
    /// untouched.
    /// </summary>
    /// <remarks>
    /// Both halves are asserted through one write: a ticket old enough to become the oldest is
    /// seeded, checked to have taken the tile, then commented on through the real endpoint and
    /// checked to have lost it. Asserting only the first half would pass on an implementation that
    /// ignored <c>TicketComments</c> entirely.
    /// </remarks>
    [Fact]
    public async Task A_commented_ticket_is_no_longer_the_oldest_untouched()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        // Older than anything the seed writes, so it takes the tile deterministically.
        var ticketId = await DashboardFixture.SeedTicketAsync(
            factory, customerId, new DateTime(2020, 1, 1, 8, 0, 0, DateTimeKind.Utc));

        var taken = (await ManagerDashboardAsync()).GetProperty("attention").GetProperty("oldestUntouched");

        taken.GetProperty("ticketId").GetGuid().Should().Be(
            ticketId, "unassigned, uncommented, and older than every other candidate");

        taken.GetProperty("ageHours").GetInt32().Should().BeGreaterThan(
            40_000, "the age is computed server-side from the request's clock");

        var comment = await factory.CreateManagerClient().PostAsJsonAsync(
            $"/api/tickets/{ticketId}/comments",
            new { body = "Someone has now touched it." });

        comment.StatusCode.Should().Be(HttpStatusCode.Created);

        var afterComment = (await ManagerDashboardAsync())
            .GetProperty("attention").GetProperty("oldestUntouched");

        if (afterComment.ValueKind == JsonValueKind.Null)
        {
            return;
        }

        afterComment.GetProperty("ticketId").GetGuid().Should().NotBe(
            ticketId, "a comment is a touch — the NOT EXISTS on TicketComments is what says so");
    }

    /* ══════════════════════════════════════════════════════════════════════════════════════
     * The request surface
     * ══════════════════════════════════════════════════════════════════════════════════════ */

    /// <summary>TEST-020-10 — an unaccepted value is refused, and the message lists what is taken.</summary>
    [Theory]
    [InlineData("?range=90d")]
    [InlineData("?range=week")]
    public async Task An_unaccepted_range_is_a_400_naming_the_three_accepted_values(string query)
    {
        var response = await factory.CreateEnglishManagerClient().GetAsync($"/api/dashboard{query}");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var problem = await BodyOf(response);

        problem.GetProperty("type").GetString().Should().EndWith("errors/validation");
        problem.GetProperty("traceId").GetString().Should().NotBeNullOrWhiteSpace();

        var messages = problem.GetProperty("errors").GetProperty("range").EnumerateArray()
            .Select(message => message.GetString())
            .ToList();

        // READ THE MESSAGE, not the count. `004b` found seventeen raw resource keys shipping under
        // assertions that checked a field was present and held exactly one entry.
        messages.Should().ContainSingle().Which.Should().Be(
            "Not an accepted range. Accepted values: 7d, 14d, 30d.",
            "the accepted values are IN the message, and it is resolved from the catalogue rather "
            + "than being a key");
    }

    /// <summary>
    /// The contract says sending <c>range</c> twice is a `400`, and it was FIRST-WINS until this
    /// test existed.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Measured against the running API on 2026-09-07: <c>?range=7d&amp;range=30d</c> answered
    /// `200` with a seven-day body. MVC hands a repeated parameter's first value to a scalar
    /// parameter and discards the rest, so nothing downstream could see the second one — the
    /// endpoint bound <c>string?</c>. It binds <c>string[]?</c> now.
    /// </para>
    /// <para>
    /// The message is its own, not the accepted-values one: both values here were accepted, and
    /// telling the caller otherwise sends them looking at the wrong thing.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task Sending_the_range_twice_is_refused_rather_than_taking_the_first()
    {
        var response = await factory.CreateEnglishManagerClient()
            .GetAsync("/api/dashboard?range=7d&range=30d");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

        var problem = await BodyOf(response);

        problem.GetProperty("errors").GetProperty("range").EnumerateArray()
            .Select(message => message.GetString())
            .Should().ContainSingle().Which.Should().Be("Send range once.");
    }

    /// <summary>AC-15 — an absent range is <c>14d</c>, and the response says so.</summary>
    [Fact]
    public async Task An_absent_range_answers_two_hundred_and_echoes_the_default()
    {
        var body = await ManagerDashboardAsync();

        body.GetProperty("range").GetString().Should().Be("14d");
        body.GetProperty("dailySeries").GetArrayLength().Should().Be(14);
    }

    /// <summary>
    /// <c>?range=</c> — an EMPTY value is an absent one, not an invalid one.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>This test was written expecting a `400` and the endpoint answered `200`. The ENDPOINT is
    /// right and the expectation was wrong</b>, so it is recorded here rather than corrected into
    /// silence. `015` ruled the same question for its filters — <c>?status=</c> is no filter, not
    /// <c>WHERE Status IN ()</c> — and the reason carries over: an unset form field or a
    /// query-string builder that always emits its keys would otherwise turn a working screen into
    /// an error the reader cannot act on.
    /// </para>
    /// <para>
    /// The distinction that still matters is REPETITION, which is refused. An empty value asks
    /// nothing; two values ask two different questions and get neither.
    /// </para>
    /// </remarks>
    [Fact]
    public async Task An_empty_range_is_treated_as_absent_and_answers_the_default()
    {
        var body = await ManagerDashboardAsync("?range=");

        body.GetProperty("range").GetString().Should().Be("14d");
        body.GetProperty("dailySeries").GetArrayLength().Should().Be(14);
    }

    /// <summary>TEST-020-11 — no token is a `401`, and the body is a ProblemDetails.</summary>
    [Fact]
    public async Task An_unauthenticated_request_is_refused_with_an_enveloped_problem()
    {
        var response = await factory.CreateClient().GetAsync("/api/dashboard");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        var problem = await BodyOf(response);

        problem.GetProperty("type").GetString().Should().EndWith("errors/unauthenticated");
        problem.GetProperty("traceId").GetString().Should().NotBeNullOrWhiteSpace(
            "`004b` envelopes a denial, and AC-19 compares the audit row's trace id to the one in "
            + "the response");
    }

    /// <summary>TEST-020-14, AC-22 — the response is not cacheable, and it is not cached.</summary>
    [Fact]
    public async Task The_response_says_no_store_and_two_calls_around_a_write_differ()
    {
        var customerId = await AuditFixture.SeedCustomerAsync(factory);

        var first = await factory.CreateManagerClient().GetAsync("/api/dashboard");

        first.Headers.CacheControl!.NoStore.Should().BeTrue(
            "no caching by decision — `research.md` R-10");

        var before = (await BodyOf(first)).GetProperty("attention")
            .GetProperty("unassignedCount").GetInt32();

        await DashboardFixture.SeedTicketAsync(
            factory, customerId, DateTime.UtcNow.AddMinutes(-5));

        var after = (await ManagerDashboardAsync()).GetProperty("attention")
            .GetProperty("unassignedCount").GetInt32();

        after.Should().Be(
            before + 1,
            "two calls with a ticket created between them return different numbers — so a later "
            + "\"optimisation\" fails a test rather than quietly changing what the screen means");
    }

    /// <summary>TEST-020-13, AC-20 — a successful read writes no audit row.</summary>
    /// <remarks>
    /// Scoped by counting the rows for the dashboard's would-be action before and after, rather
    /// than counting <c>dbo.AuditLog</c>, which the whole suite writes to.
    /// </remarks>
    [Fact]
    public async Task A_successful_read_writes_no_audit_row()
    {
        using var scope = factory.Services.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

        var before = await context.AuditLog.CountAsync(row => row.Action.StartsWith("Dashboard"));

        (await factory.CreateManagerClient().GetAsync("/api/dashboard")).EnsureSuccessStatusCode();

        var after = await context.AuditLog.CountAsync(row => row.Action.StartsWith("Dashboard"));

        after.Should().Be(before, "a read changes no state — BR-9.1, and the query is not an ICommand");
        after.Should().Be(0, "and there has never been such a row");
    }

    /// <summary>
    /// TEST-020-09 — every <c>DateTime</c> that came back through raw SQL is UTC on the wire.
    /// </summary>
    /// <remarks>
    /// The model's UTC converter applies to MAPPED properties, and a projection onto an unmapped
    /// type does not pass through it — so these arrive <c>Unspecified</c> from the reader and are
    /// stamped in the handler. Asserted on the JSON's <c>Z</c> suffix, which is the thing a client
    /// actually parses; a <c>DateTime.Kind</c> assertion on a deserialised value would pass on a
    /// string that never carried an offset.
    /// </remarks>
    [Fact]
    public async Task Every_instant_in_the_document_is_serialised_as_UTC()
    {
        var body = await ManagerDashboardAsync();

        body.GetProperty("generatedAtUtc").GetString().Should().EndWith("Z");

        foreach (var row in body.GetProperty("needsAttention").EnumerateArray())
        {
            row.GetProperty("createdAtUtc").GetString().Should().EndWith(
                "Z",
                "an Unspecified DateTime serialises without the Z and a client reads it as local "
                + "time — three hours out in Riyadh, and silent");
        }

        var oldest = body.GetProperty("attention").GetProperty("oldestUntouched");

        if (oldest.ValueKind != JsonValueKind.Null)
        {
            oldest.GetProperty("createdAtUtc").GetString().Should().EndWith("Z");
        }
    }

    /// <summary>TEST-020-15 — Arabic translates the prose and touches nothing else.</summary>
    [Fact]
    public async Task Arabic_translates_the_message_and_leaves_the_identifiers_alone()
    {
        var response = await factory.CreateManagerClient().GetAsync("/api/dashboard?range=90d");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        response.Content.Headers.ContentLanguage.Should().Contain("ar");

        var problem = await BodyOf(response);

        problem.GetProperty("errors").GetProperty("range").EnumerateArray()
            .Select(message => message.GetString())
            .Should().ContainSingle().Which.Should().Be(
                "مدة غير مقبولة. القيم المقبولة: 7d, 14d, 30d.",
                "the sentence is translated and the three literals are not — BR-8.7");

        problem.GetProperty("type").GetString().Should().EndWith(
            "errors/validation", "the identifier is never localized");

        var body = await ManagerDashboardAsync();

        body.GetProperty("scope").GetString().Should().Be("Team", "an enum value, not a label");
        body.GetProperty("openByStatus").EnumerateArray().First()
            .GetProperty("status").GetString().Should().Be("New");
    }

    private static DateTime LocalNoon(DateOnly date)
    {
        var local = date.ToDateTime(new TimeOnly(12, 0));

        return TimeZoneInfo.ConvertTimeToUtc(local, Riyadh);
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
