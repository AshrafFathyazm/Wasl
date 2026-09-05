using MediatR;
using Wasl.Domain.Common.Exceptions;

namespace Wasl.Infrastructure.Persistence.Behaviours;

/// <summary>
/// Translates a deadlock victim raised anywhere beneath it. `036b` §3.2, AC-1 to AC-4.
/// </summary>
/// <remarks>
/// <para>
/// <b>`036` translated a deadlock at <c>SaveChangesAsync</c>, which covers the WRITE and nothing
/// else.</b> That gap was measured rather than reasoned: `036`'s own deadlock test first read
/// each row immediately before updating it, SQL Server chose the second <c>SELECT</c> as the
/// victim, and the test failed with <c>found {SqlException}</c> — an unmapped `500` for exactly
/// the condition the feature exists to answer. A read inside a command's transaction is a
/// deadlock candidate like any other statement, and which one the engine kills is its choice.
/// </para>
/// <para>
/// <b>NOT four wrappers on <c>IApplicationDbContext</c>'s read methods.</b> That was the obvious
/// shape and it is incomplete: <c>TicketTimelineQuery</c> calls EF directly on DbSets — it
/// unions two tables that are deliberately not on that interface, which is why it exists — and
/// <c>SequenceTicketNumberGenerator</c> uses <c>SqlQueryRaw</c>. Four wrappers leave two holes
/// and a third named query class would be a third. `003b` rejected the same shape as a per-table
/// grant: <b>a list is a list somebody forgets to extend, and the next feature's addition becomes
/// a `500` that reads as a bug in that feature.</b>
/// </para>
/// <para>
/// <b>OUTERMOST — and the argument for it is narrower than it first looked.</b> Inside
/// <c>TransactionBehaviour</c> this would have already returned by the time the <c>COMMIT</c>
/// runs, so a deadlock resolved there would go untranslated. That is the reason, and it is the
/// only one that survived measurement.
/// </para>
/// <para>
/// <b>The second reason was written down and then disproved.</b> It claimed that registering
/// inside <c>AuditBehaviour</c> would make BR-9's failure row record <c>transient-conflict</c>
/// rather than the fault. It does not: <c>AuditOutcomeClassifier</c> maps any non-denial
/// <c>DomainException</c> to <c>Failed</c>, which is what the raw engine exception maps to as
/// well. The control was run with this behaviour registered innermost and **every test stayed
/// green** — `036b` `tests.md` §4.2.
/// </para>
/// <para>
/// <b>So the placement is UNPROVEN by test.</b> A deadlock resolved on <c>COMMIT</c> could not
/// be induced, so nothing here goes red if someone moves this line. Stated rather than defended
/// with the claim measurement rejected — `010` recorded its stable-sort guard the same way.
/// </para>
/// <para>
/// <b>Unconstrained, unlike <c>TransactionBehaviour</c>.</b> That one is constrained to
/// <c>ICommand</c> deliberately, so a query never opens a transaction (`003` AC-16). This one
/// must run for queries too: a <c>GET /api/tickets</c> can be the victim against a concurrent
/// write, and that is the case the rejected four wrappers would have covered.
/// </para>
/// <para>
/// <b>It does not replace `036`'s catch in <c>WaslDbContext</c>.</b> That one still covers the
/// seeders, which call <c>SaveChangesAsync</c> directly and never touch MediatR. Two mechanisms,
/// each with its own negative control — the shape `002b` used for the routing statuses versus the
/// `415`.
/// </para>
/// </remarks>
internal sealed class TransientFailureBehaviour<TRequest, TResponse>
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        try
        {
            return await next(cancellationToken);
        }

        // Already translated further in — by `036`'s catch in SaveChangesAsync. Rethrown
        // untouched so the two mechanisms cannot produce two different exceptions for one
        // deadlock, and so the `Retry-After` the inner one chose survives.
        catch (TransientConflictException)
        {
            throw;
        }

        // Matched on the CHAIN, never on a wrapper's type — see TransientFailure.IsDeadlockVictim
        // for the measurement that makes this the only correct form.
        catch (Exception exception) when (TransientFailure.IsDeadlockVictim(exception))
        {
            throw new TransientConflictException(exception);
        }
    }
}
