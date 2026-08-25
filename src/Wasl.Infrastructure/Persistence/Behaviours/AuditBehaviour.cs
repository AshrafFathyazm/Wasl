using MediatR;
using Wasl.Application.Common.Abstractions;
using Wasl.Application.Common.Messaging;
using Wasl.Domain.Audit;
using Wasl.Infrastructure.Persistence.Audit;

namespace Wasl.Infrastructure.Persistence.Behaviours;

/// <summary>
/// Writes exactly one audit row per auditable command, on both the success and the failure
/// path, with the BR-9.4 asymmetry.
/// </summary>
/// <typeparam name="TRequest">Constrained to <see cref="IAuditableCommand{TResponse}"/>, so
/// the compiler decides what is audited rather than a runtime check.</typeparam>
/// <remarks>
/// <para>
/// <b>Inside <c>TransactionBehaviour</c>, deliberately.</b> On success the row must join the
/// business transaction, so a rollback takes it with it (BR-9.3) — which only works if the
/// transaction is still open when this writes. On failure the row must survive that same
/// rollback, which is why the two paths use two different methods on
/// <c>IAuditWriter</c>. AC-6, AC-8 and AC-9 exist for this asymmetry and nothing else.
/// </para>
/// <para>
/// <b>Outside <c>ValidationBehaviour</c>, equally deliberately</b> (`spec.md` Q-3). A `400`
/// must not write a row, or the table collects an entry for every mistyped form. That is a
/// property of registration order, and `research.md` R-15 records what happens when it is left
/// to two projects to agree on: the order silently inverts. All three are registered once, in
/// <c>Wasl.Api</c>, and AC-15 asserts the resulting sequence.
/// </para>
/// </remarks>
internal sealed class AuditBehaviour<TRequest, TResponse>(
    IAuditWriter writer,
    AuditDiffAccumulator accumulator,
    ICurrentUser currentUser,
    IRequestContext requestContext,
    TimeProvider clock) : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IAuditableCommand<TResponse>
{
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        TResponse response;

        try
        {
            response = await next(cancellationToken);
        }
        catch (Exception exception)
        {
            var outcome = AuditOutcomeClassifier.Classify(exception, cancellationToken);

            if (outcome is not null)
            {
                // DescribeTarget(null): a denied command has no response but does know which
                // entity it was refused against, from its own fields (research.md R-8). This
                // is the call that makes the failure path's row complete.
                //
                // WriteIndependentAsync never throws (AC-11), so the original exception below
                // reaches the error middleware unchanged. It also takes no CancellationToken,
                // so a client disconnecting mid-failure still leaves the row (AC-10).
                await writer.WriteIndependentAsync(
                    Compose(request, request.DescribeTarget(default), outcome.Value));
            }

            // Rethrown untouched. `002`'s handler maps it to the envelope, and the traceId in
            // that response is the same string this row carries — one derivation, reached
            // through IRequestContext (BR-9.9, AC-21).
            throw;
        }

        await writer.WriteInTransactionAsync(
            Compose(request, request.DescribeTarget(response), AuditOutcome.Success),
            cancellationToken);

        return response;
    }

    private AuditEntry Compose(TRequest request, AuditTarget target, AuditOutcome outcome) =>
        AuditEntry.For(
            // From the injected clock, never DateTime.UtcNow (AC-23). UtcDateTime rather than
            // the raw offset, because the column is datetime2(3) and `001`'s converter
            // guarantees the Kind on the way back out.
            occurredAtUtc: clock.GetUtcNow().UtcDateTime,
            action: request.AuditAction,
            outcome: outcome,
            traceId: requestContext.TraceId,

            // Snapshotted, not joined (BR-9.6). All three are null until `004` lands, which is
            // the designed shape for BR-9.2's anonymous events rather than a gap. AC-20 proves
            // the copy happens by changing the actor after the write and re-reading the row.
            actorUserId: currentUser.UserId,
            actorEmail: currentUser.Email,
            actorRole: currentUser.Role,
            target: target,

            // Null when nothing was captured, never `[]` — an empty array and a lost diff must
            // not look the same (research.md R-1).
            changes: AuditChangeSerializer.Serialize(accumulator.Changes),
            ipAddress: requestContext.IpAddress,
            userAgent: requestContext.UserAgent);
}
