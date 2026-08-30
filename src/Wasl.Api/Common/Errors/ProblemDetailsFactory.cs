using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
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

        // `004b`. One `type` can describe two situations with different correct titles —
        // errors/unauthenticated covers both "no credentials supplied" and "credentials
        // rejected", and the frozen contract gives them different titles. The registry row
        // carries the default; an exception may override it. The `type` never varies, because
        // that is what a client branches on.
        if (exception.TitleKey is { } titleKey)
        {
            problem.Title = messages.Resolve(context, titleKey);
        }

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
                field => CamelCase(field.Key),
                field => field.Value
                    .Select(key => messages.Resolve(context, key))
                    .ToArray(),
                StringComparer.Ordinal);
        }

        return problem;
    }

    /// <summary>
    /// Lowercases the first character of a field name, so the keys of <c>errors</c> match the
    /// request's field names.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>The keys of <c>errors</c> are part of the contract.</b> A client maps them onto its form
    /// fields by exact name, and the request fields are camelCase because that is how the JSON
    /// arrives. FluentValidation and ASP.NET model state both report the **CLR property name**, so
    /// without this the response says <c>Subject</c> where the request said <c>subject</c>.
    /// </para>
    /// <para>
    /// <b>Found by the frontend lane running the real API, not by a test.</b> `002`'s own evidence
    /// recorded the mismatch and left it — which was the wrong call: the failure is silent on the
    /// server and visible only as a message that lands in a page-level banner instead of under
    /// the field the user has to fix. Nothing 400s, nothing logs, and the form simply never
    /// highlights anything.
    /// </para>
    /// <para>
    /// Only the first character, and only when it is upper-case. A nested model-state key like
    /// <c>$.subject</c> or <c>Items[0].Name</c> is left alone rather than half-transformed: the
    /// first is already camelCase, and inventing a rule for the second without a call site that
    /// produces one is guessing.
    /// </para>
    /// </remarks>
    private static string CamelCase(string field) =>
        field.Length == 0 || !char.IsUpper(field[0])
            ? field
            : char.ToLowerInvariant(field[0]) + field[1..];

    /// <summary>Builds the `400` for a validation failure, with field-level messages.</summary>
    public ProblemDetails FromValidationFailures(
        HttpContext context,
        IReadOnlyDictionary<string, string[]> failures)
    {
        var definition = ProblemTypes.Find(DomainErrorCodes.Validation)!;
        var problem = Create(context, DomainErrorCodes.Validation, definition);

        problem.Detail = messages.Resolve(context, "Error.Validation.Detail");

        // camelCase here too, and this is the path the frontend lane actually hit: a validation
        // failure from FluentValidation reports `Subject`, and the form looks for `subject`.
        problem.Extensions["errors"] = failures.ToDictionary(
            field => CamelCase(field.Key),
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

    /// <summary>
    /// The body could not be read at all. `002b` AC-15, AC-16, AC-17.
    /// </summary>
    /// <remarks>
    /// <b>No <c>errors</c> object, deliberately.</b> Nothing about an unparseable payload is a field
    /// the client can fix, and the measured alternative put <c>$</c> — the JSON root — and
    /// <c>command</c> — the action method's parameter name — on the wire as though they were form
    /// fields. <c>detail</c> is one localized sentence and carries no parser text, no byte offset
    /// and no line number: AC-17 searches the whole body for each.
    /// </remarks>
    public ProblemDetails Malformed(HttpContext context)
    {
        var problem = ForCode(context, ProblemTypes.MalformedRequest);
        problem.Detail = messages.Resolve(context, "Error.MalformedRequest.Detail");

        return problem;
    }

    /// <summary>
    /// A status the registry does not document, kept as the framework composed it. `002b` AC-3.
    /// </summary>
    /// <remarks>
    /// <b>Here rather than in <c>MvcProblemDetailsFactory</c>, because `002` AC-2 says one
    /// producer and means it.</b> The first version constructed <c>ProblemDetails</c> inside the
    /// MVC adapter, and <c>ErrorEnvelopeTests.OnlyTheFactory_ConstructsProblemDetails</c> went
    /// red — correctly. A second constructor is a second shape, and the second shape is found by
    /// a client that already parsed the first.
    /// <br/>
    /// The registry IS the contract, so a status with no row is NOT forced into an invented
    /// envelope: manufacturing a `type` that `error-contract.md` does not document would relocate
    /// this feature's defect rather than remove it.
    /// </remarks>
    public ProblemDetails Passthrough(
        HttpContext context, int status, string? title, string? type, string? detail, string? instance) =>
        new()
        {
            Status = status,
            Title = title,
            Type = type,
            Detail = detail,
            Instance = instance ?? context.Request.Path.Value,
        };

    /// <summary>
    /// MVC's validation shape, kept as MVC composed it. `002b` AC-3.
    /// </summary>
    /// <remarks>
    /// Validation problems reach the wire through <c>ApiBehaviorOptions</c> —
    /// <c>ModelStateEnvelope</c> — which already decides between <c>validation</c> and
    /// <c>malformed-request</c>. Giving this method the same job would create two paths to one
    /// answer, and the day they disagreed the response would depend on which one MVC happened to
    /// call.
    /// </remarks>
    public ValidationProblemDetails PassthroughValidation(
        HttpContext context, ModelStateDictionary modelState,
        int status, string? title, string? type, string? detail, string? instance) =>
        new(modelState)
        {
            Status = status,
            Title = title,
            Type = type,
            Detail = detail,
            Instance = instance ?? context.Request.Path.Value,
        };

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
