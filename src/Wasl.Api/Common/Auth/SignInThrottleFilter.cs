using Microsoft.AspNetCore.Mvc.Filters;
using Wasl.Application.Common.Abstractions;
using Wasl.Application.Features.Auth.IssueToken;
using Wasl.Domain.Audit;
using Wasl.Domain.Common.Exceptions;

namespace Wasl.Api.Common.Auth;

/// <summary>
/// Refuses a sign-in that has already failed too often. `004b` AC-35, AC-36, AC-37.
/// </summary>
/// <remarks>
/// <para>
/// <b>Ahead of the MediatR pipeline, not inside the handler</b> — and the reason is AC-36 rather
/// than layering taste. The refusal must be recorded as <c>Auth.RateLimited</c>, and an
/// <c>IAuditableCommand</c> carries <b>one</b> action string evaluated on both paths (`004` D-2),
/// so a check inside the handler could only ever produce <c>Auth.SignIn / Denied</c>. A refusal
/// that can name itself belongs where it can — the same reasoning that lets
/// <see cref="AuthDenialResultHandler"/> choose between two names from the authorization result.
/// </para>
/// <para>
/// It also means no transaction is opened for a request that will be refused, and the throttle is
/// consulted before the credentials are looked at — so being throttled says nothing about whether
/// the password was right, which is the oracle `004` AC-4 exists to close.
/// </para>
/// <para>
/// <b>Applied to the one action rather than globally.</b> The ruling limits
/// <c>POST /api/auth/token</c> and not the API — a rate limit on a working application is a
/// different feature with different numbers, and nobody has asked for one.
/// </para>
/// </remarks>
internal sealed class SignInThrottleFilter(
    ISignInThrottle throttle,
    IRequestContext requestContext,
    IAuditWriter audit,
    TimeProvider clock) : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(
        ActionExecutingContext context,
        ActionExecutionDelegate next)
    {
        // Read from the bound argument rather than the raw body, so the filter and the handler
        // agree about which email this attempt was for — re-reading the stream would also consume
        // it before model binding.
        var email = context.ActionArguments.Values
            .OfType<IssueTokenCommand>()
            .FirstOrDefault()?.Email;

        // Nothing to key on: let it through and let validation produce the `400`. Throttling a
        // request that has no email would put every malformed body into one bucket, so one broken
        // client could lock out an address it never named.
        if (string.IsNullOrWhiteSpace(email))
        {
            await next();
            return;
        }

        if (throttle.RetryAfterSeconds(requestContext.IpAddress, email) is not { } wait)
        {
            await next();
            return;
        }

        // AC-36. Written here because the pipeline never runs — and outside any transaction, which
        // is what WriteIndependentAsync is for. It never throws (`003` AC-11), so a logging failure
        // cannot turn this `429` into a `500`.
        //
        // The row carries the attempted email as the label and NOTHING else about the attempt: no
        // password, no count, no window. It is the one signal that separates a person who forgot
        // their password from a script (`spec.md` Q-C).
        await audit.WriteIndependentAsync(AuditEntry.For(
            occurredAtUtc: clock.GetUtcNow().UtcDateTime,
            action: "Auth.RateLimited",
            outcome: AuditOutcome.Denied,
            traceId: requestContext.TraceId,
            target: new AuditTarget("SupportUser", null, email),
            ipAddress: requestContext.IpAddress,
            userAgent: requestContext.UserAgent));

        // Thrown rather than short-circuited with a result, so `002`'s one producer builds the body
        // and GlobalExceptionHandler sets Retry-After. A hand-built response here would be a second
        // place that constructs ProblemDetails, which AC-2 of `002` forbids.
        throw new RateLimitedException(wait);
    }
}
