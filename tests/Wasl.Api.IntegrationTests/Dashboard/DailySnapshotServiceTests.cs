using System.Net;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Wasl.Application.Common.Abstractions;
using Wasl.Infrastructure.Queries;
using Wasl.Infrastructure.Scheduling;

namespace Wasl.Api.IntegrationTests.Dashboard;

/// <summary>
/// The first scheduled work in this product. `020b` AC-1b, AC-15.
/// </summary>
/// <remarks>
/// <para>
/// <b>Two halves, tested two ways, because they fail differently.</b> Which DAY a capture
/// describes is a fact about dates — a pure function, tested exhaustively with no host at all.
/// Whether a failure can take the API down is a fact about HOSTING, and the only honest way to
/// assert it is to start a real host with a capture that throws.
/// </para>
/// <para>
/// <b>Neither test constructs <c>DailySnapshotService</c>, and that is deliberate.</b> It is
/// <c>internal</c>, like every other implementation of an abstraction in
/// <c>Wasl.Infrastructure</c> — and `CLAUDE.md` records that a layer registering its own
/// implementations is what lets them stay internal. Making one public for a test's benefit would
/// spend that property to save a few lines.
/// </para>
/// </remarks>
public sealed class DailySnapshotScheduleTests
{
    private static readonly TimeZoneInfo Riyadh =
        TimeZoneInfo.FindSystemTimeZoneById(OrganizationTimeZone.DefaultId);

    /// <summary>
    /// AC-15 — the day captured is YESTERDAY in the organisation's timezone.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>22:30Z is the discriminating instant, and `020` AC-6 is why it was chosen carefully.</b>
    /// Riyadh is UTC+3, so 22:30Z on the 7th is already 01:30 on the 8th locally: a UTC reading
    /// files the row under the 6th and a local reading under the 7th. <b>An instant sampled around
    /// midday would agree in both</b>, which is exactly how `020`'s first version of this test
    /// passed while the timezone offset had been deleted from the spine.
    /// </para>
    /// <para>
    /// The first assertion is on the FIXTURE — that the instant really is the next local day —
    /// because a test whose premise is wrong asserts nothing and still goes green.
    /// </para>
    /// </remarks>
    [Fact]
    public void The_business_date_is_yesterday_locally_not_yesterday_in_UTC()
    {
        var instant = new DateTimeOffset(2026, 9, 7, 22, 30, 0, TimeSpan.Zero);

        TimeZoneInfo.ConvertTimeFromUtc(instant.UtcDateTime, Riyadh).Should().Be(
            new DateTime(2026, 9, 8, 1, 30, 0),
            "the instant must really fall on the NEXT local day, or this test discriminates "
            + "nothing — which is the mistake `020` AC-6 recorded");

        DailySnapshotSchedule.BusinessDateFor(instant, Riyadh).Should().Be(
            new DateOnly(2026, 9, 7),
            "yesterday LOCALLY — a UTC reading would have said the 6th");
    }

    /// <summary>The whole local day, every hour of it, maps to the day before.</summary>
    /// <remarks>
    /// Both ends of the local day are included: 00:00 local and 23:59 local must produce the same
    /// business date, which is the property that makes the capture idempotent whenever it happens
    /// to run.
    /// </remarks>
    [Theory]
    // 21:00Z is 00:00 local on the 8th → the day before is the 7th.
    [InlineData(2026, 9, 7, 21, 0, 2026, 9, 7)]
    // 22:30Z is 01:30 local on the 8th → still the 7th.
    [InlineData(2026, 9, 7, 22, 30, 2026, 9, 7)]
    // 12:00Z is 15:00 local on the 8th → still the 7th.
    [InlineData(2026, 9, 8, 12, 0, 2026, 9, 7)]
    // 20:59Z is 23:59 local on the 8th → the last minute, still the 7th.
    [InlineData(2026, 9, 8, 20, 59, 2026, 9, 7)]
    // 21:00Z is 00:00 local on the 9th → the day rolls over, and so does the answer.
    [InlineData(2026, 9, 8, 21, 0, 2026, 9, 8)]
    public void Every_instant_within_one_local_day_maps_to_the_day_before(
        int year, int month, int day, int hour, int minute,
        int expectedYear, int expectedMonth, int expectedDay)
    {
        var instant = new DateTimeOffset(year, month, day, hour, minute, 0, TimeSpan.Zero);

        DailySnapshotSchedule.BusinessDateFor(instant, Riyadh).Should().Be(
            new DateOnly(expectedYear, expectedMonth, expectedDay));
    }

    /// <summary>
    /// A DST-observing zone: the answer follows the local clock, not a fixed offset.
    /// </summary>
    /// <remarks>
    /// <c>Asia/Riyadh</c> observes no DST, so it can never show an offset bug. London can — and
    /// this is the same reasoning `020`'s <c>LocalDaySpineTests</c> applies to the spine: a
    /// timezone that never moves cannot test code that handles one that does.
    /// </remarks>
    [Fact]
    public void A_DST_zone_follows_its_local_clock()
    {
        var london = TimeZoneInfo.FindSystemTimeZoneById("Europe/London");

        // 23:30Z on 30 June is 00:30 on 1 July in London (BST, UTC+1) → yesterday is 30 June.
        DailySnapshotSchedule.BusinessDateFor(
            new DateTimeOffset(2026, 6, 30, 23, 30, 0, TimeSpan.Zero), london)
            .Should().Be(new DateOnly(2026, 6, 30));

        // The same wall-clock instant in DECEMBER is 23:30 on the 30th locally (GMT, UTC+0) →
        // yesterday is the 29th. Same UTC time of day, different answer, because the offset moved.
        DailySnapshotSchedule.BusinessDateFor(
            new DateTimeOffset(2026, 12, 30, 23, 30, 0, TimeSpan.Zero), london)
            .Should().Be(new DateOnly(2026, 12, 29));
    }

    /// <summary>The tick is frequent, so a restart cannot make the service miss a whole day.</summary>
    [Fact]
    public void The_tick_is_frequent_rather_than_once_a_day()
    {
        DailySnapshotSchedule.TickInterval.Should().BeLessThan(
            TimeSpan.FromHours(1),
            "a timer aimed once at midnight misses the day entirely if the process restarts at "
            + "the wrong minute, and a restart is the normal case");

        DailySnapshotSchedule.TickInterval.Should().BeGreaterThan(
            TimeSpan.FromMinutes(1),
            "and it is not a busy loop — the existence check is cheap, not free");
    }
}

/// <summary>
/// AC-1b — a failing capture does not take the API down. `020b`.
/// </summary>
/// <remarks>
/// <para>
/// <b>This is the test the whole design of the loop exists for.</b>
/// <c>HostOptions.BackgroundServiceExceptionBehavior</c> defaults to <c>StopHost</c> — measured,
/// `research.md` R-4 — so an exception escaping the capture would stop the host, taking every
/// ticket screen down for a number that decorates four tiles.
/// </para>
/// <para>
/// <b>Asserted against a real host, not by inspecting a <c>catch</c> block.</b> A source scan
/// would pass on a <c>catch</c> that rethrew, and constructing the service directly would test a
/// loop nobody hosts. This starts the application with a capture that always throws and then asks
/// the API a question — the host answering is the assertion.
/// </para>
/// <para>
/// <b>A second host, built with <c>WithWebHostBuilder</c></b> — the pattern `036` used to lower a
/// rate limit for the limiter's own tests. The shared fixture keeps the real capture, so no other
/// test sees the throwing one.
/// </para>
/// </remarks>
[Collection(WaslApiCollection.Name)]
public sealed class DailySnapshotFailureTests(WaslApiFactory factory)
{
    private sealed class AlwaysThrows : IDashboardSnapshotCapture
    {
        public Task CaptureAsync(
            DateOnly localDate,
            DateTime capturedAtUtc,
            CancellationToken cancellationToken) =>
            Task.FromException(
                new InvalidOperationException("the snapshot table is unreachable"));
    }

    [Fact]
    public async Task A_capture_that_always_throws_leaves_the_api_serving()
    {
        using var host = factory.WithWebHostBuilder(builder =>
            builder.ConfigureServices(services =>
                services.AddScoped<IDashboardSnapshotCapture, AlwaysThrows>()));

        var client = host.CreateClient();

        /* The hosted service starts with the host, so by the time the first request is answered it
         * has already run its immediate first pass and failed. If the exception escaped, the host
         * would be shutting down and this request would not be answered. */
        var health = await client.GetAsync("/health");

        health.StatusCode.Should().Be(
            HttpStatusCode.OK,
            "a failed snapshot must not stop the host — BackgroundServiceExceptionBehavior "
            + "defaults to StopHost, so the exception has to be caught inside the loop");

        // And the application is not merely alive but still working: a real endpoint answers.
        var dashboard = await host.CreateClient()
            .GetAsync("/api/dashboard");

        dashboard.StatusCode.Should().Be(
            HttpStatusCode.Unauthorized,
            "an unauthenticated request still reaches the pipeline and is refused properly, "
            + "rather than failing to connect");
    }
}
