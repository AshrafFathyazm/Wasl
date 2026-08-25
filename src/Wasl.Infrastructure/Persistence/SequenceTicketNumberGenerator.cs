using Microsoft.EntityFrameworkCore;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Tickets;

namespace Wasl.Infrastructure.Persistence;

/// <summary>
/// Draws the next ticket number from <c>dbo.TicketNumberSeq</c>.
/// </summary>
/// <remarks>
/// <para>
/// <b>A sequence, and nothing else would do.</b> <c>MAX(TicketNumber) + 1</c> and a
/// <c>COUNT</c>-based scheme were both rejected in `research.md`: they race, so two concurrent
/// creates get the same number and one fails on the unique index — AC-11 exists to prove that
/// cannot happen. A sequence is atomic without a lock, which is the whole reason it is here.
/// </para>
/// <para>
/// <b>Gaps are expected.</b> A rolled-back create consumes a value, because sequence values are
/// not returned on rollback. Making the series dense would mean serialising every create behind
/// a lock — reintroducing exactly the contention the sequence avoids, to make a number look
/// tidier.
/// </para>
/// <para>
/// The year comes from the injected <c>TimeProvider</c>, so a test can pin it and nothing here
/// reads <c>DateTime.UtcNow</c>.
/// </para>
/// </remarks>
internal sealed class SequenceTicketNumberGenerator(WaslDbContext context, TimeProvider clock)
    : ITicketNumberGenerator
{
    public async Task<string> NextAsync(CancellationToken cancellationToken)
    {
        // Raw SQL because NEXT VALUE FOR has no LINQ equivalent — it is not a query over a
        // table. SqlQueryRaw with a typed result rather than ExecuteSqlRaw, because the value
        // is what is wanted, not a row count.
        //
        // No interpolation and no parameter: the statement is a constant, so there is no
        // injection surface to reason about.
        var next = await context.Database
            .SqlQueryRaw<long>("SELECT NEXT VALUE FOR dbo.TicketNumberSeq AS [Value]")
            .ToListAsync(cancellationToken);

        return TicketNumber.Format(clock.GetUtcNow().Year, next[0]);
    }
}
