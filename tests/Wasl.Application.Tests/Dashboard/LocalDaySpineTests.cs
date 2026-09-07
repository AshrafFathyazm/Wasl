using FluentAssertions;
using Wasl.Application.Features.Dashboard.GetDashboard;

namespace Wasl.Application.Tests.Dashboard;

/// <summary>
/// The date spine every day-bucketed block on the dashboard is built against. `020` TEST-020-08.
/// </summary>
/// <remarks>
/// <para>
/// <b>No container, no database, no HTTP.</b> <c>TimeZoneInfo</c> is BCL and the spine is pure,
/// which is the whole reason it lives in <c>Wasl.Application</c> rather than beside the SQL: the
/// DST case below is cheap enough to assert properly instead of being argued about in a comment.
/// </para>
/// <para>
/// <b>The zone under test is deliberately NOT <c>Asia/Riyadh</c> for the interesting case.</b>
/// Riyadh observes no DST, so every local day there is exactly 24 hours and
/// <c>from + n * 24h</c> would pass every assertion a Riyadh test could make. The defect would
/// then ship and wait for the first deployment outside the Gulf. <c>Europe/London</c> is used for
/// the transitions because its two 2026 transition dates are known and its offsets are 0 and +1.
/// </para>
/// </remarks>
public sealed class LocalDaySpineTests
{
    private static readonly TimeZoneInfo Riyadh = TimeZoneInfo.FindSystemTimeZoneById("Asia/Riyadh");

    private static readonly TimeZoneInfo London = TimeZoneInfo.FindSystemTimeZoneById("Europe/London");

    /// <summary>Every range produces exactly its own number of days, today last.</summary>
    [Theory]
    [InlineData(7)]
    [InlineData(14)]
    [InlineData(30)]
    public void The_spine_is_exactly_as_long_as_the_range(int dayCount)
    {
        // 2026-09-07 09:00Z is 12:00 in Riyadh — comfortably inside the local day, so the
        // assertion is about the length rather than about a boundary.
        var days = LocalDaySpine.Build(Riyadh, new DateTime(2026, 9, 7, 9, 0, 0, DateTimeKind.Utc), dayCount);

        days.Should().HaveCount(dayCount);
        days[^1].Date.Should().Be(new DateOnly(2026, 9, 7), "today is always the last entry");
        days[0].Date.Should().Be(new DateOnly(2026, 9, 7).AddDays(-(dayCount - 1)));
    }

    /// <summary>
    /// Contiguous, with no instant counted twice and none skipped.
    /// </summary>
    /// <remarks>
    /// The boundary is SHARED — each day's exclusive end is the next day's inclusive start — so
    /// this is a statement about construction rather than about two calculations agreeing.
    /// </remarks>
    [Fact]
    public void Each_day_ends_exactly_where_the_next_begins()
    {
        var days = LocalDaySpine.Build(Riyadh, new DateTime(2026, 9, 7, 9, 0, 0, DateTimeKind.Utc), 14);

        for (var index = 0; index < days.Count - 1; index++)
        {
            days[index].EndUtcExclusive.Should().Be(days[index + 1].StartUtc);
        }

        days.Should().AllSatisfy(day =>
        {
            day.StartUtc.Kind.Should().Be(DateTimeKind.Utc);
            day.EndUtcExclusive.Kind.Should().Be(DateTimeKind.Utc);
        });
    }

    /// <summary>
    /// A Riyadh day starts at 21:00Z the evening before, because the zone is UTC+3.
    /// </summary>
    /// <remarks>
    /// This is the assertion that a UTC-based spine would fail. A spine built on UTC midnights
    /// would put a ticket created at 22:00 local into the FOLLOWING day, and the chart would still
    /// have fourteen populated columns.
    /// </remarks>
    [Fact]
    public void A_Riyadh_day_begins_at_twentyone_hundred_UTC_the_day_before()
    {
        var days = LocalDaySpine.Build(Riyadh, new DateTime(2026, 9, 7, 9, 0, 0, DateTimeKind.Utc), 7);

        var lastDay = days[^1];

        lastDay.Date.Should().Be(new DateOnly(2026, 9, 7));
        lastDay.StartUtc.Should().Be(new DateTime(2026, 9, 6, 21, 0, 0, DateTimeKind.Utc));
        lastDay.EndUtcExclusive.Should().Be(new DateTime(2026, 9, 7, 21, 0, 0, DateTimeKind.Utc));
    }

    /// <summary>
    /// TEST-020-08's real subject: in a DST zone two consecutive local days are NOT both 24 hours,
    /// and the spine still has no gap and no overlap.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Britain moves the clock forward on the last Sunday of March — 29 March 2026 — so that local
    /// day is 23 hours long, and back on the last Sunday of October (25 October 2026), making that
    /// one 25 hours. A spine built as <c>from + n * 24h</c> is an hour out from the transition
    /// onward and stays out for the rest of the range.
    /// </para>
    /// <para>
    /// <b>The assertion is on the LENGTHS, not only on contiguity.</b> Contiguity alone passes for
    /// a 24-hour spine — every boundary would still line up with the next one; they would simply
    /// all be in the wrong place. The 23 and the 25 are what make this test fail on the naive
    /// implementation.
    /// </para>
    /// </remarks>
    [Fact]
    public void A_DST_transition_makes_one_local_day_short_and_another_long()
    {
        // A range ending 30 March 2026 contains the spring-forward day.
        var spring = LocalDaySpine.Build(London, new DateTime(2026, 3, 30, 12, 0, 0, DateTimeKind.Utc), 7);
        var shortDay = spring.Single(day => day.Date == new DateOnly(2026, 3, 29));

        (shortDay.EndUtcExclusive - shortDay.StartUtc).Should().Be(
            TimeSpan.FromHours(23),
            "the clocks go forward at 01:00 local, so 29 March 2026 is 23 hours long in London");

        // A range ending 26 October 2026 contains the autumn fall-back day.
        var autumn = LocalDaySpine.Build(London, new DateTime(2026, 10, 26, 12, 0, 0, DateTimeKind.Utc), 7);
        var longDay = autumn.Single(day => day.Date == new DateOnly(2026, 10, 25));

        (longDay.EndUtcExclusive - longDay.StartUtc).Should().Be(
            TimeSpan.FromHours(25),
            "the clocks go back at 02:00 local, so 25 October 2026 is 25 hours long in London");

        // And both spines are still gapless — the point being that contiguity was never the
        // property in doubt.
        foreach (var days in new[] { spring, autumn })
        {
            for (var index = 0; index < days.Count - 1; index++)
            {
                days[index].EndUtcExclusive.Should().Be(days[index + 1].StartUtc);
            }
        }
    }

    /// <summary>
    /// The naive implementation, run here so the reason the real one exists is visible in the test
    /// file rather than only in a comment.
    /// </summary>
    /// <remarks>
    /// <c>from + n * 24h</c> produces a boundary an hour away from the true local midnight for
    /// every day after a transition. This asserts the DISAGREEMENT, so the test fails if the
    /// spine is ever "simplified" into agreement with it.
    /// </remarks>
    [Fact]
    public void The_naive_twentyfour_hour_spine_disagrees_after_a_transition()
    {
        var days = LocalDaySpine.Build(London, new DateTime(2026, 3, 30, 12, 0, 0, DateTimeKind.Utc), 7);

        var naive = days[0].StartUtc.AddDays(days.Count - 1);

        naive.Should().NotBe(
            days[^1].StartUtc,
            "a fixed 24-hour step lands an hour off once the range spans a DST transition — this "
            + "is the defect the spine exists to avoid, and it is asserted rather than described");

        (days[^1].StartUtc - naive).Should().Be(TimeSpan.FromHours(-1));
    }

    /// <summary>A range of one day is today, and nothing smaller is accepted.</summary>
    [Fact]
    public void A_day_count_below_one_is_refused()
    {
        var act = () => LocalDaySpine.Build(Riyadh, DateTime.UtcNow, 0);

        act.Should().Throw<ArgumentOutOfRangeException>(
            "a zero-length spine would produce an empty series and a chart with no axis, which "
            + "reads as a failed request rather than as a bad argument");
    }

    /// <summary>
    /// The instant is read as UTC whatever <c>Kind</c> it arrives with.
    /// </summary>
    /// <remarks>
    /// <c>IRequestTimestamp</c> hands over a <c>DateTimeOffset</c>, so the caller passes
    /// <c>UtcDateTime</c> and the Kind is right — but a future caller with an
    /// <c>Unspecified</c> value would otherwise have it interpreted as LOCAL by
    /// <c>ConvertTimeFromUtc</c>, which throws rather than silently shifting. Specifying the Kind
    /// inside <c>Build</c> is what makes this test pass instead of throwing.
    /// </remarks>
    [Fact]
    public void An_unspecified_instant_is_treated_as_UTC_rather_than_as_local()
    {
        var unspecified = new DateTime(2026, 9, 7, 9, 0, 0, DateTimeKind.Unspecified);

        var days = LocalDaySpine.Build(Riyadh, unspecified, 7);

        days[^1].Date.Should().Be(new DateOnly(2026, 9, 7));
    }
}
