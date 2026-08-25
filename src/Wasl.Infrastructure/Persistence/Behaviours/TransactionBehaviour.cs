using MediatR;
using Microsoft.EntityFrameworkCore;
using Wasl.Application.Common.Messaging;

namespace Wasl.Infrastructure.Persistence.Behaviours;

/// <summary>
/// One explicit transaction per state-changing request, opened by the pipeline. BR-9.3.
/// </summary>
/// <typeparam name="TRequest">Constrained to <see cref="ICommand"/>, so a query never opens
/// one (AC-16).</typeparam>
/// <remarks>
/// <para>
/// <b>In <c>Wasl.Infrastructure</c>, not <c>Wasl.Application</c>, and that was a decision</b>
/// (`research.md` R-14, product owner 2026-08-25). This class needs a real transaction;
/// <c>IApplicationDbContext</c> deliberately exposes no EF Core type, and
/// <c>IDbContextTransaction</c> is one — putting it on that interface would fail `001`'s
/// architecture test. The alternative was an <c>IUnitOfWork</c> wrapper in the Application
/// layer; moving the behaviour instead keeps the boundary strict with no exemption, at the
/// cost of one of three behaviours living in a different project from the other two.
/// </para>
/// <para>
/// <b>The constraint is what keeps queries out.</b> Not an <c>if</c> at the top — a query does
/// not implement <see cref="ICommand"/>, so this behaviour is never constructed for it. AC-16
/// asserts <c>Database.CurrentTransaction</c> is null inside a query handler, and MediatR was
/// observed honouring exactly this kind of constraint on 14.2.0 (`research.md` R-3).
/// </para>
/// </remarks>
internal sealed class TransactionBehaviour<TRequest, TResponse>(WaslDbContext context)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : ICommand
{
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        // An already-open transaction means something upstream opened one — a nested command
        // (A-4) or a test fixture. Joining it rather than opening a second keeps BR-9.1's
        // "exactly one row" true, because the audit write then commits with the outer scope.
        if (context.Database.CurrentTransaction is not null)
        {
            return await next(cancellationToken);
        }

        await using var transaction = await context.Database.BeginTransactionAsync(cancellationToken);

        // No try/catch. `await using` disposes the transaction on the way out, and an
        // undisposed-uncommitted transaction rolls back — so the failure path needs no code,
        // which means it cannot be written wrong. A catch block here would also have to
        // decide whether to rethrow, and the one thing this behaviour must never do is swallow.
        var response = await next(cancellationToken);

        await transaction.CommitAsync(cancellationToken);

        return response;
    }
}
