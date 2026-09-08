namespace Wasl.Infrastructure.Scheduling;

/// <summary>
/// When the daily snapshot runs, and which day it describes. `020b`.
/// </summary>
/// <remarks>
/// <para>
/// <b>Separated from <see cref="DailySnapshotService"/> because the decision is a fact about
/// DATES, not about hosting.</b> "Which day does a capture taken now describe?" needs no timer, no
/// scope factory and no database — so it is a pure function, and it is the half of the scheduler
/// that can actually be wrong in an interesting way.
/// </para>
/// <para>
/// <b>Public while the service stays internal, and that is the convention rather than a
/// concession to testing.</b> `Wasl.Infrastructure` keeps implementations of an abstraction
/// internal — <c>RequestTimestamp</c>, <c>TicketTimelineQuery</c>, <c>DashboardSnapshotCapture</c>
/// — and makes public only what something outside names. This is named by a test; the service is
/// named by nothing but <c>AddHostedService</c> inside the same assembly.
/// </para>
/// </remarks>
public static class DailySnapshotSchedule
{
    /// <summary>
    /// How often the service wakes to ask whether the day has rolled over.
    /// </summary>
    /// <remarks>
    /// <b>A frequent tick with the decision inside, not a timer aimed at midnight.</b> A
    /// once-a-day timer misses the day entirely if the process restarts at the wrong minute — and
    /// a restart is the normal case rather than the exception. Fifteen minutes is 96 cheap
    /// existence checks a day, and the worst case is a row written a quarter of an hour late,
    /// which <c>CapturedAtUtc</c> records honestly.
    /// </remarks>
    public static readonly TimeSpan TickInterval = TimeSpan.FromMinutes(15);

    /// <summary>
    /// The business date a capture taken at <paramref name="nowUtc"/> describes.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Yesterday, LOCALLY.</b> Ruled Q-4: the row describes the day that just ended, in full. A
    /// capture taken at 09:00 and filed under today would fold half a day of new events into a
    /// number the trend then compares against a complete one.
    /// </para>
    /// <para>
    /// <b>"Locally" is the load-bearing word, and `020` AC-6 recorded what happens when it is not
    /// tested at a discriminating instant.</b> In a UTC+3 zone, 22:30Z is already 01:30 the next
    /// local day — so a UTC reading files the row two days back while a local reading files it
    /// one. Any instant sampled around midday would agree in both, which is why the test uses
    /// this one.
    /// </para>
    /// </remarks>
    public static DateOnly BusinessDateFor(DateTimeOffset nowUtc, TimeZoneInfo zone)
    {
        ArgumentNullException.ThrowIfNull(zone);

        var nowLocal = TimeZoneInfo.ConvertTimeFromUtc(nowUtc.UtcDateTime, zone);

        return DateOnly.FromDateTime(nowLocal).AddDays(-1);
    }
}
