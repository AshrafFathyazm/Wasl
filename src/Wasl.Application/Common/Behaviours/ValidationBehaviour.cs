using FluentValidation;
using MediatR;

namespace Wasl.Application.Common.Behaviours;

/// <summary>
/// Runs every registered validator for a request before its handler, and throws a
/// <see cref="ValidationException"/> if any rule fails.
/// </summary>
/// <remarks>
/// <para>
/// <b>A behaviour, not per-handler discipline</b> (Principle V). A handler cannot forget to
/// validate, because nothing reaches a handler without passing through here first.
/// </para>
/// <para>
/// This is the exception to the constitution's "no abstraction without a consumer" rule,
/// and its boundary is written down in <c>research.md</c> R-10: the rule applies to an
/// abstraction between a caller and a callee, where deferring costs one call site. It does
/// not apply to a cross-cutting concern applied by construction to a pipeline, where
/// deferring means retrofitting every participant written in the meantime — and the one
/// that gets missed is the one that matters.
/// </para>
/// <para>
/// It throws rather than returning a result. The alternative is <c>Result&lt;T&gt;</c>
/// threaded through every handler signature, and `docs/sdd/02-architecture.md` is explicit
/// that mixing exceptions and results is worse than either: the error contract is already
/// centralised on exceptions, so this joins it.
/// </para>
/// </remarks>
public sealed class ValidationBehaviour<TRequest, TResponse>(
    IEnumerable<IValidator<TRequest>> validators)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        var applicable = validators.ToArray();

        if (applicable.Length == 0)
        {
            return await next(cancellationToken);
        }

        var context = new ValidationContext<TRequest>(request);

        // The request's own token, threaded through. A cancelled request aborts validation
        // rather than completing it and then discarding the answer — and every async path
        // in this codebase takes a CancellationToken for the same reason.
        var results = await Task.WhenAll(
            applicable.Select(validator => validator.ValidateAsync(context, cancellationToken)));

        var failures = results
            .SelectMany(result => result.Errors)
            .Where(failure => failure is not null)
            .ToArray();

        if (failures.Length > 0)
        {
            // FluentValidation's own exception type. The API maps it to the 400 envelope,
            // so the Application layer stays free of HTTP — it says "these rules failed",
            // not "return 400".
            throw new ValidationException(failures);
        }

        return await next(cancellationToken);
    }
}
