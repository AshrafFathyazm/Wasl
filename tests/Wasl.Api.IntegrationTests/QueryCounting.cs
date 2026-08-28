using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Wasl.Api.IntegrationTests;

/// <summary>
/// Counts database round trips, so "this query does not issue one per row" can be asserted
/// instead of argued. Built in `008` for AC-11, and general on purpose.
/// </summary>
/// <remarks>
/// <para>
/// <b>An entire category of criterion had no coverage before this.</b> Four features carry one:
/// `008` AC-11 (the customer list), `013` AC-14 (the timeline's actor names), `010`'s
/// same-query customer-name projection, and `020`'s per-widget aggregate. Every one of them was
/// met by <i>reading the LINQ</i> — which is inspection, not verification, and inspection cannot
/// see a lazy load, a client-side <c>ToList</c> introduced later, or a projection that stops being
/// translatable after an unrelated edit.
/// </para>
/// <para>
/// <b>It counts commands, not entities, and it is not tied to any endpoint.</b> Any operation can
/// be measured — a request, a seeder, a single query — because the interesting property is always
/// "how many times did this talk to SQL Server", never "how many customers were on the page".
/// </para>
/// <para>
/// <b>It refuses to report zero as a pass.</b> A counter that is never wired counts nothing, and
/// nothing satisfies every "no more than N queries" assertion ever written — the exact
/// false-negative `001`'s architecture test shipped with, and the reason `023`'s §12 rule exists.
/// <see cref="QueryCountProbe.Count"/> therefore throws if it is read after having observed no
/// commands at all.
/// </para>
/// </remarks>
public sealed class QueryCountingInterceptor : DbCommandInterceptor
{
    private int _count;

    /// <summary>Commands executed since the process started.</summary>
    public int Total => Volatile.Read(ref _count);

    public override InterceptionResult<DbDataReader> ReaderExecuting(
        DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result)
    {
        Interlocked.Increment(ref _count);
        return base.ReaderExecuting(command, eventData, result);
    }

    public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
        DbCommand command,
        CommandEventData eventData,
        InterceptionResult<DbDataReader> result,
        CancellationToken cancellationToken = default)
    {
        Interlocked.Increment(ref _count);
        return base.ReaderExecutingAsync(command, eventData, result, cancellationToken);
    }

    public override InterceptionResult<int> NonQueryExecuting(
        DbCommand command, CommandEventData eventData, InterceptionResult<int> result)
    {
        Interlocked.Increment(ref _count);
        return base.NonQueryExecuting(command, eventData, result);
    }

    public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(
        DbCommand command,
        CommandEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        Interlocked.Increment(ref _count);
        return base.NonQueryExecutingAsync(command, eventData, result, cancellationToken);
    }

    public override InterceptionResult<object> ScalarExecuting(
        DbCommand command, CommandEventData eventData, InterceptionResult<object> result)
    {
        Interlocked.Increment(ref _count);
        return base.ScalarExecuting(command, eventData, result);
    }

    public override ValueTask<InterceptionResult<object>> ScalarExecutingAsync(
        DbCommand command,
        CommandEventData eventData,
        InterceptionResult<object> result,
        CancellationToken cancellationToken = default)
    {
        Interlocked.Increment(ref _count);
        return base.ScalarExecutingAsync(command, eventData, result, cancellationToken);
    }
}

/// <summary>
/// One measurement window. Take it, do the thing, read <see cref="Count"/>.
/// </summary>
/// <remarks>
/// <para>
/// A delta over a shared counter rather than a per-scope one, because the integration suite is a
/// single xUnit collection: its classes run sequentially against one container, so nothing else is
/// issuing commands inside the window. Stated rather than assumed — a parallel collection would
/// make this measure the wrong thing, and it would measure it quietly.
/// </para>
/// <para>
/// <b><see cref="Count"/> throws when it observed nothing.</b> An assertion of the form
/// <c>Count.Should().BeLessThan(3)</c> is satisfied by zero, so a probe that was never attached
/// would turn every one of these tests into a green no-op. The lower bound is not optional.
/// </para>
/// </remarks>
public sealed class QueryCountProbe(QueryCountingInterceptor interceptor)
{
    private readonly int _start = interceptor.Total;

    /// <summary>Commands issued since the probe was taken.</summary>
    /// <exception cref="InvalidOperationException">
    /// When no command was observed at all — which means the interceptor is not attached, not that
    /// the operation was efficient.
    /// </exception>
    public int Count
    {
        get
        {
            var observed = interceptor.Total - _start;

            if (observed == 0)
            {
                throw new InvalidOperationException(
                    "The query counter observed no commands. That is not a fast operation — it is "
                    + "an unattached interceptor, and every 'no more than N queries' assertion "
                    + "would pass against it. Check that QueryCountingInterceptor is registered "
                    + "as IInterceptor in the test host and that AddInfrastructure still calls "
                    + "AddInterceptors(provider.GetServices<IInterceptor>()).");
            }

            return observed;
        }
    }

    /// <summary>The raw delta, without the lower-bound guard.</summary>
    /// <remarks>
    /// For the one case where zero is the expected answer — asserting that an operation touched
    /// the database not at all. Separate from <see cref="Count"/> so that reading zero is always a
    /// deliberate act.
    /// </remarks>
    public int CountAllowingZero => interceptor.Total - _start;
}
