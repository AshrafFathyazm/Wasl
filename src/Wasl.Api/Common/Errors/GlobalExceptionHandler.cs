using FluentValidation;
using Microsoft.AspNetCore.Diagnostics;
using Wasl.Domain.Common.Exceptions;

namespace Wasl.Api.Common.Errors;

/// <summary>
/// Turns anything that throws into the one envelope. Registered via
/// <c>AddExceptionHandler</c> + <c>UseExceptionHandler</c>.
/// </summary>
/// <remarks>
/// <para>
/// <b>This catches exceptions and nothing else.</b> A `404` on a mistyped path, a `405`, a
/// `415` — the framework short-circuits those without throwing, so no exception handler in
/// any framework will ever see them. That hole is real and `research.md` R-1 calls it the
/// most important finding in this feature; the status-code writer that closes it is `002b`.
/// Recorded here so the gap is visible in the code rather than only in a document.
/// </para>
/// <para>
/// Both mechanisms call the same factory, so there is still exactly one producer of the
/// envelope (AC-2).
/// </para>
/// </remarks>
internal sealed class GlobalExceptionHandler(
    ProblemDetailsFactory factory,
    IProblemDetailsService problemDetailsService,
    ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext context,
        Exception exception,
        CancellationToken cancellationToken)
    {
        // The response has already begun; writing a body now would corrupt it. Let it
        // abort rather than producing a half-envelope on top of a partial payload.
        if (context.Response.HasStarted)
        {
            logger.LogError(
                exception,
                "Exception after the response started. TraceId {TraceId}",
                TraceContext.For(context));

            return false;
        }

        // ── `002b` AC-8, AC-9. Closes `005` AC-11 ───────────────────────────────────
        //
        // Re-applied, not set for the first time. RequestLocalizationMiddleware already wrote
        // Content-Language on the way down — and ExceptionHandlerMiddleware called
        // Response.Clear() before invoking this handler, taking the headers with it.
        //
        // Measured on one endpoint, two ways of failing: a 400 from model binding kept the
        // header, a 400 from FluentValidation lost it. Same status, same request headers; the
        // only difference is whether an exception was raised. Everything else about the response
        // was already correct, which is why this went unnoticed until someone compared the two.
        //
        // Read from IRequestCultureFeature, never from CultureInfo.CurrentUICulture: this runs at
        // the TOP of the pipeline, so the localization middleware has already unwound and restored
        // the ambient culture. That is the same trap `005` documented for the BODY, and it would
        // put `en` in the header of a correctly-Arabic response.
        var culture = context.Features
            .Get<Microsoft.AspNetCore.Localization.IRequestCultureFeature>()?
            .RequestCulture.UICulture.Name;

        if (!string.IsNullOrEmpty(culture))
        {
            context.Response.Headers.ContentLanguage = culture;
        }

        // `004b` AC-35. Set BEFORE the body is written, because a header cannot be added once the
        // response has started — and a 429 without Retry-After tells a client to wait without
        // saying how long, so it retries immediately and the limit achieves nothing.
        if (exception is RateLimitedException limited)
        {
            context.Response.Headers.RetryAfter =
                limited.RetryAfterSeconds.ToString(System.Globalization.CultureInfo.InvariantCulture);
        }

        var problem = exception switch
        {
            DomainException domain => Handle(context, domain),
            ValidationException validation => Handle(context, validation),
            _ => HandleUnexpected(context, exception),
        };

        // IProblemDetailsService rather than writing JSON directly, so the shape produced
        // by our code and the shape the framework produces on its own paths are one shape.
        return await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = context,
            ProblemDetails = problem,
            Exception = exception,
        });
    }

    private Microsoft.AspNetCore.Mvc.ProblemDetails Handle(HttpContext context, DomainException exception)
    {
        // Warning, not Error: a domain rule refusing a request is the system working. An
        // Error here would make every duplicate-email attempt look like a fault.
        logger.LogWarning(
            "Domain rule {ErrorCode} rejected {Method} {Path}. TraceId {TraceId}",
            exception.ErrorCode,
            context.Request.Method,
            context.Request.Path,
            TraceContext.For(context));

        return factory.FromDomainException(context, exception);
    }

    private Microsoft.AspNetCore.Mvc.ProblemDetails Handle(HttpContext context, ValidationException exception)
    {
        // Grouped by property name, which is the payload field name the client sent —
        // camelCase, matching the request, because the keys of `errors` are part of the
        // contract and a client maps them onto form fields by exact name.
        var failures = exception.Errors
            .GroupBy(failure => failure.PropertyName, StringComparer.Ordinal)
            .ToDictionary(
                group => group.Key,
                // Every message here is a symbolic KEY, not a sentence — enforced by a
                // test over every registered validator (AC-17). A field breaking two rules
                // yields two entries, not one merged string (AC-6).
                group => group.Select(failure => failure.ErrorMessage).ToArray(),
                StringComparer.Ordinal);

        logger.LogWarning(
            "Validation rejected {Method} {Path} on {FieldCount} field(s). TraceId {TraceId}",
            context.Request.Method,
            context.Request.Path,
            failures.Count,
            TraceContext.For(context));

        return factory.FromValidationFailures(context, failures);
    }

    private Microsoft.AspNetCore.Mvc.ProblemDetails HandleUnexpected(HttpContext context, Exception exception)
    {
        logger.LogError(
            exception,
            "Unhandled exception on {Method} {Path}. TraceId {TraceId}",
            context.Request.Method,
            context.Request.Path,
            TraceContext.For(context));

        return factory.Internal(context);
    }
}
