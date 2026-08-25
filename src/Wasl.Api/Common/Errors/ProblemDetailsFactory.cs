using Microsoft.AspNetCore.Mvc;
using Wasl.Domain.Common.Exceptions;

namespace Wasl.Api.Common.Errors;

/// <summary>
/// The only type in the solution that constructs a <see cref="ProblemDetails"/>.
/// </summary>
/// <remarks>
/// <para>
/// AC-2 states it as a grep: <c>grep -rn "new ProblemDetails" src/</c> returns hits only in
/// this file. One producer is the entire feature — two producers means two shapes, and the
/// second one is discovered by a client that already parsed the first.
/// </para>
/// <para>
/// <b>Everything is a key until it reaches here.</b> Titles, details, and field messages
/// arrive as symbolic keys and are resolved through <see cref="IProblemMessageSource"/> on
/// the way out, which is what lets `005` translate the whole surface by swapping one
/// registration.
/// </para>
/// </remarks>
internal sealed class ProblemDetailsFactory(
    IProblemMessageSource messages,
    ILogger<ProblemDetailsFactory> logger)
{
    /// <summary>Builds the envelope for a domain rule violation.</summary>
    public ProblemDetails FromDomainException(HttpContext context, DomainException exception)
    {
        var definition = ProblemTypes.Find(exception.ErrorCode);

        if (definition is null)
        {
            // A real failure about to be rendered as a generic one. Loud, because the
            // alternative is a mystery 500 three features later — and never a status
            // guessed at runtime. AC-14 turns this into a red build instead.
            logger.LogCritical(
                "Domain error code {ErrorCode} has no registry row in ProblemTypes. "
                + "Returning 500. Add the row — see specs/002-error-contract/contracts/error-contract.md.",
                exception.ErrorCode);

            return Internal(context);
        }

        var problem = Create(context, exception.ErrorCode, definition);

        if (definition.CarriesDetail)
        {
            problem.Detail = messages.Resolve(context, exception.MessageKey, exception.MessageArguments);
        }

        // `errors` is a property of the type, not of the status. A 409 duplicate carries
        // it; a 409 stale-version does not, because no field is at fault there and the
        // answer is refetch rather than a form message. Spec Q-A.
        if (definition.CarriesErrors && exception.FieldErrors.Count > 0)
        {
            problem.Extensions["errors"] = exception.FieldErrors.ToDictionary(
                field => field.Key,
                field => field.Value
                    .Select(key => messages.Resolve(context, key))
                    .ToArray(),
                StringComparer.Ordinal);
        }

        return problem;
    }

    /// <summary>Builds the `400` for a validation failure, with field-level messages.</summary>
    public ProblemDetails FromValidationFailures(
        HttpContext context,
        IReadOnlyDictionary<string, string[]> failures)
    {
        var definition = ProblemTypes.Find(DomainErrorCodes.Validation)!;
        var problem = Create(context, DomainErrorCodes.Validation, definition);

        problem.Detail = messages.Resolve(context, "Error.Validation.Detail");

        problem.Extensions["errors"] = failures.ToDictionary(
            field => field.Key,
            field => field.Value
                .Select(key => messages.Resolve(context, key))
                .ToArray(),
            StringComparer.Ordinal);

        return problem;
    }

    /// <summary>
    /// Builds the `500`. Body is <c>type</c>, <c>title</c>, <c>status</c>,
    /// <c>instance</c>, <c>traceId</c> — and nothing else.
    /// </summary>
    /// <remarks>
    /// No <c>detail</c>, no <c>errors</c>, no exception type name, no stack trace, no SQL,
    /// no connection string. `instance` is the caller's own request path and leaks nothing
    /// they did not send; a body without `type` would make `500` the one status the shared
    /// client parser cannot read (spec Q-F).
    /// </remarks>
    public ProblemDetails Internal(HttpContext context) =>
        Create(context, ProblemTypes.Internal, ProblemTypes.Find(ProblemTypes.Internal)!);

    /// <summary>Builds the envelope for a status the framework produced without an exception.</summary>
    public ProblemDetails ForCode(HttpContext context, string code)
    {
        var definition = ProblemTypes.Find(code);

        if (definition is null)
        {
            logger.LogCritical("Problem code {Code} has no registry row in ProblemTypes.", code);
            return Internal(context);
        }

        return Create(context, code, definition);
    }

    private ProblemDetails Create(HttpContext context, string code, ProblemTypeDefinition definition)
    {
        var problem = new ProblemDetails
        {
            Type = ProblemTypes.UriFor(code),
            Title = messages.Resolve(context, definition.TitleKey),
            Status = definition.Status,
            Instance = context.Request.Path,
        };

        // Top level, not nested under extensions. AC-3 asserts there is exactly one
        // occurrence in the JSON — a traceId in two places is a traceId a client picks the
        // wrong one of.
        problem.Extensions["traceId"] = TraceContext.For(context);

        context.Response.StatusCode = definition.Status;

        return problem;
    }
}
