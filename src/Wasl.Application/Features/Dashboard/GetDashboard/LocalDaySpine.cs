namespace Wasl.Application.Features.Dashboard.GetDashboard;

/// <summary>
/// One local calendar day, and the half-open UTC interval that is exactly that day.
/// </summary>
/// <param name="Date">The calendar date, in the organisation's timezone.</param>
/// <param name="StartUtc">Inclusive.</param>
/// <param name="EndUtcExclusive">Exclusive, and equal to the next day's <see cref="StartUtc"/>.</param>
public sealed record LocalDay(DateOnly Date, DateTime StartUtc, DateTime EndUtcExclusive);

/// <summary>
/// The date spine every day-bucketed block on the dashboard is built against. AC-5, AC-6.
/// </summary>
/// <remarks>
/// <para>
/// <b>The spine is why a quiet day appears at all.</b> A <c>GROUP BY</c> over the tickets alone
/// omits days with none, and the chart then silently compresses — fourteen columns become eleven,
/// the shape still looks like a fortnight, and nothing reports an error. Every query joins onto
/// these rows rather than producing them.
/// </para>
/// <para>
/// <b>Never <c>from + n * 24h</c>.</b> A local day is 23 or 25 hours long across a DST
/// transition, so arithmetic on a fixed 24 hours drifts by an hour and then buckets a ticket into
/// the wrong day for the rest of the range. <c>Asia/Riyadh</c> observes no DST and would never
/// show it, which is precisely why the unit test pins a zone that does: the defect would ship and
/// wait for the first deployment outside the Gulf.
/// </para>
/// <para>
/// <b>Pure, and it needs no database.</b> <c>TimeZoneInfo</c> is BCL, so this lives in
/// <c>Wasl.Application</c> and its test runs with no container — which is what makes the DST case
/// cheap enough to assert properly instead of arguing about.
/// </para>
/// </remarks>
public static class LocalDaySpine
{
    /// <summary>
    /// The <paramref name="dayCount"/> local days ending today, oldest first.
    /// </summary>
    /// <param name="zone">The organisation's timezone. Every date in the result is expressed in it.</param>
    /// <param name="nowUtc">The request's instant, from the injected <c>TimeProvider</c>.</param>
    /// <param name="dayCount">7, 14 or 30. Today is always the last entry.</param>
    /// <returns>
    /// Exactly <paramref name="dayCount"/> contiguous days: each day's
    /// <see cref="LocalDay.EndUtcExclusive"/> equals the next day's <see cref="LocalDay.StartUtc"/>,
    /// so no instant is counted twice and none is skipped.
    /// </returns>
    public static IReadOnlyList<LocalDay> Build(TimeZoneInfo zone, DateTime nowUtc, int dayCount)
    {
        ArgumentNullException.ThrowIfNull(zone);
        ArgumentOutOfRangeException.ThrowIfLessThan(dayCount, 1);

        var today = DateOnly.FromDateTime(
            TimeZoneInfo.ConvertTimeFromUtc(
                DateTime.SpecifyKind(nowUtc, DateTimeKind.Utc),
                zone));

        var first = today.AddDays(-(dayCount - 1));

        // dayCount + 1 boundaries produce dayCount intervals, and the shared boundary is what
        // makes them contiguous BY CONSTRUCTION rather than by two calculations agreeing.
        var boundaries = new DateTime[dayCount + 1];

        for (var index = 0; index <= dayCount; index++)
        {
            boundaries[index] = StartOfLocalDayUtc(first.AddDays(index), zone);
        }

        var days = new LocalDay[dayCount];

        for (var index = 0; index < dayCount; index++)
        {
            days[index] = new LocalDay(
                first.AddDays(index),
                boundaries[index],
                boundaries[index + 1]);
        }

        return days;
    }

    /// <summary>
    /// The UTC instant a local calendar day begins.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Midnight does not always exist, and sometimes it happens twice.</b> A spring-forward
    /// transition at 00:00 skips the local hour entirely — <c>ConvertTimeToUtc</c> throws
    /// <c>ArgumentException</c> on it, which would turn a dashboard into a `500` twice a year in
    /// any zone that does this. An autumn transition makes local midnight ambiguous, and the two
    /// candidate instants are an hour apart.
    /// </para>
    /// <para>
    /// <b>Invalid midnight resolves forward</b> to the instant the clock jumps to, so the day
    /// begins when it actually began locally. <b>Ambiguous midnight takes the EARLIER instant</b>
    /// — the larger UTC offset — because the previous day's spine entry ends where this one
    /// starts: taking the later one would leave the repeated hour in neither day, and a ticket
    /// created inside it would vanish from the chart while still being counted in every total.
    /// </para>
    /// </remarks>
    private static DateTime StartOfLocalDayUtc(DateOnly date, TimeZoneInfo zone)
    {
        var local = date.ToDateTime(TimeOnly.MinValue);

        // Walk forward in quarter-hours rather than assuming a one-hour jump: not every zone's
        // transition is exactly 60 minutes (Lord Howe moves 30), and a hard-coded hour would
        // leave the loop still standing on an invalid instant.
        while (zone.IsInvalidTime(local))
        {
            local = local.AddMinutes(15);
        }

        var offset = zone.IsAmbiguousTime(local)
            ? zone.GetAmbiguousTimeOffsets(local).Max()
            : zone.GetUtcOffset(local);

        return DateTime.SpecifyKind(local - offset, DateTimeKind.Utc);
    }
}
