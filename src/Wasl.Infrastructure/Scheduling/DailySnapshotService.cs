using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Wasl.Application.Common.Abstractions;
using Wasl.Infrastructure.Persistence;
using Wasl.Infrastructure.Queries;

namespace Wasl.Infrastructure.Scheduling;

/// <summary>
/// Captures the dashboard's attention levels once per local day. `020b`, and the FIRST scheduled
/// work in this product.
/// </summary>
/// <remarks>
/// <para>
/// <b>In-process, ruled 2026-09-07.</b> An external cron would add a deployment and operations
/// dependency for one feature; the capture is internal work on the application's own data and
/// needs no public surface; and multi-instance is already safe because
/// <c>UX_DashboardDailySnapshot_Date_Scope</c> plus the upsert makes a double fire converge on one
/// row. `spec.md` §3.3 keeps the rejected alternative and its trade-offs.
/// </para>
/// <para>
/// <b>A FREQUENT TICK WITH THE DECISION INSIDE, not a timer aimed at midnight.</b> A once-a-day
/// timer misses the day entirely if the process restarts at the wrong minute — and a restart is
/// the normal case, not the exception. This wakes every few minutes and asks *has the local day
/// rolled over since the last row?*, which converges from any starting state.
/// </para>
/// <para>
/// <b>A missed day stays missed and is never back-filled.</b> Filing today's levels under
/// yesterday's date would be the reconstruction defect `spec.md` §2.1 rejects, wearing a different
/// hat: the row would look exactly like a real capture and be wrong by a day's worth of work.
/// </para>
/// </remarks>
internal sealed class DailySnapshotService(
    IServiceScopeFactory scopeFactory,
    TimeProvider clock,
    OrganizationTimeZone organizationTimeZone,
    ILogger<DailySnapshotService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        /* THE CLOCK IS INJECTED, so a test drives this loop with a fake one instead of waiting a
         * real quarter of an hour. `PeriodicTimer` has taken a `TimeProvider` since .NET 8 —
         * verified by compiling it against this target rather than assumed (`research.md` R-3),
         * which is why there is no `IClock` interface here to invent. */
        using var timer = new PeriodicTimer(DailySnapshotSchedule.TickInterval, clock);

        // The first pass runs immediately rather than after one interval: a process that starts
        // just after midnight should not wait fifteen minutes to notice.
        do
        {
            await CaptureIfDueAsync(stoppingToken);
        }
        while (await SafeWaitAsync(timer, stoppingToken));
    }

    /// <summary>
    /// Captures yesterday's levels if no row exists for it yet.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>YESTERDAY, not today.</b> Ruled Q-4: the row describes the day that just ended, in full.
    /// A capture taken at 09:00 and filed under today would fold half a day of new events into a
    /// number the trend then compares against a complete one.
    /// </para>
    /// <para>
    /// <b>The exception is caught here and never leaves.</b>
    /// <c>HostOptions.BackgroundServiceExceptionBehavior</c> defaults to <c>StopHost</c> —
    /// measured, `research.md` R-4 — so an escape from this method would take the entire API down,
    /// every ticket screen with it, for a number that decorates four tiles. Setting the global to
    /// <c>Ignore</c> was the alternative and was rejected: it would also silence the next
    /// background service somebody adds, whose failure may well deserve to stop the host.
    /// </para>
    /// <para>
    /// <b>And the miss is LOGGED at <c>Error</c> with the date it was writing.</b> A silent miss is
    /// a gap in a chart nobody can explain three weeks later.
    /// </para>
    /// </remarks>
    private async Task CaptureIfDueAsync(CancellationToken stoppingToken)
    {
        var localDate = default(DateOnly);

        try
        {
            localDate = DailySnapshotSchedule.BusinessDateFor(
                clock.GetUtcNow(),
                organizationTimeZone.Zone);


            using var scope = scopeFactory.CreateScope();

            /* A SCOPE PER CAPTURE. `WaslDbContext` is registered scoped and this service is a
             * singleton, so it cannot take one by constructor injection — `research.md` R-5. The
             * scope is disposed at the end of every tick rather than held, so a long-lived context
             * cannot accumulate tracked entities for the life of the process. */
            var context = scope.ServiceProvider.GetRequiredService<WaslDbContext>();

            if (await AlreadyCapturedAsync(context, localDate, stoppingToken))
            {
                return;
            }

            var capture = scope.ServiceProvider.GetRequiredService<IDashboardSnapshotCapture>();

            await capture.CaptureAsync(localDate, clock.GetUtcNow().UtcDateTime, stoppingToken);

            logger.LogInformation(
                "Dashboard snapshot captured for {LocalDate}.", localDate);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogError(
                exception,
                "Dashboard snapshot capture failed for {LocalDate}. The day is missed and will "
                + "NOT be back-filled; the next tick will move on to the following day.",
                localDate);
        }
    }

    /// <summary>
    /// Whether the day already has a row — the cheap check that makes a frequent tick affordable.
    /// </summary>
    /// <remarks>
    /// <b>It is an optimisation, not the guarantee.</b> Two instances can both read "no row" and
    /// both capture; the unique index is what makes that safe, and the capture reads the
    /// duplicate-key violation as "the other instance won". Removing this check would leave the
    /// feature correct and merely wasteful — which is the right relationship between a check and a
    /// constraint.
    /// </remarks>
    private static Task<bool> AlreadyCapturedAsync(
        WaslDbContext context,
        DateOnly localDate,
        CancellationToken cancellationToken) =>
        context.Database
            .SqlQuery<int>(
                $"""
                SELECT TOP (1) 1 AS Value
                  FROM dbo.DashboardDailySnapshot
                 WHERE LocalDate = {localDate}
                """)
            .AnyAsync(cancellationToken);

    /// <summary>
    /// Waits for the next tick, treating shutdown as "stop" rather than as a failure.
    /// </summary>
    private static async Task<bool> SafeWaitAsync(PeriodicTimer timer, CancellationToken stoppingToken)
    {
        try
        {
            return await timer.WaitForNextTickAsync(stoppingToken);
        }
        catch (OperationCanceledException)
        {
            return false;
        }
    }
}
