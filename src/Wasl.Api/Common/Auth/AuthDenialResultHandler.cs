using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Policy;
using Wasl.Api.Common.Errors;
using Wasl.Application.Common.Abstractions;
using Wasl.Domain.Audit;
using Wasl.Domain.Common.Exceptions;

namespace Wasl.Api.Common.Auth;

/// <summary>
/// Writes the audit row for a denial, and gives it a body. `004b` AC-17, AC-18, AC-19, AC-31.
/// </summary>
/// <remarks>
/// <para>
/// <b>This closes the last gap in BR-9.4.</b> Sign-in success and failure have written rows since
/// `004`, because <c>IssueTokenCommand</c> is an <c>IAuditableCommand</c> and `003`'s pipeline
/// handles both paths. A denial by the authorization middleware threw nothing, so MediatR never
/// saw it and <c>dbo.AuditLog</c> had <b>no record of anyone being refused access</b>.
/// </para>
/// <para>
/// <b>`011` measured what that cost.</b> Moving BR-2's checks into a policy made the denial's audit
/// row come back <c>found 0: {empty}</c> — so until now, <i>the placement of a permission check
/// decided whether the refusal was recorded at all</i>. After this, a denial is audited wherever it
/// is raised, and that coupling is gone.
/// </para>
/// <para>
/// <b>It also writes the body, and that is a condition of the feature rather than an addition to
/// it.</b> The middleware's `401` and `403` were empty — no <c>type</c>, no <c>traceId</c>, nothing
/// a client could branch on. AC-19 requires the row's <c>traceId</c> to equal the one in the
/// response body, so AC-17 and AC-18 were not verifiable while no body existed. A criterion that
/// cannot be measured is not a criterion.
/// </para>
/// <para>
/// <b>Not `002b`'s job.</b> `002b` owns the statuses <i>routing</i> and content negotiation produce
/// — `404`, `405`, `415` — which is a different mechanism reached through
/// <c>UseStatusCodePages</c>. This sits on the authorization path, which is the one place that
/// mechanism cannot reach.
/// </para>
/// </remarks>
internal sealed class AuthDenialResultHandler(ProblemDetailsFactory problems, TimeProvider clock)
    : IAuthorizationMiddlewareResultHandler
{
    /// <summary>
    /// The framework's handler, wrapped rather than replaced.
    /// </summary>
    /// <remarks>
    /// Kept for the success path, so nothing about an <b>allowed</b> request changes — this type
    /// adds a branch for denials and delegates everything else. Replacing it outright would mean
    /// reimplementing behaviour nobody has a reason to change.
    /// </remarks>
    private readonly AuthorizationMiddlewareResultHandler _default = new();

    public async Task HandleAsync(
        RequestDelegate next,
        HttpContext context,
        AuthorizationPolicy policy,
        PolicyAuthorizationResult authorizeResult)
    {
        if (authorizeResult.Challenged || authorizeResult.Forbidden)
        {
            var (code, action) = authorizeResult.Challenged
                ? (DomainErrorCodes.Unauthenticated, "Auth.Unauthenticated")
                : (DomainErrorCodes.Forbidden, "Auth.Forbidden");

            await DenyAsync(context, code, action);
            return;
        }

        await _default.HandleAsync(next, context, policy, authorizeResult);
    }

    /// <summary>Writes the row, then the body. AC-17, AC-18, AC-31, AC-32, AC-34.</summary>
    /// <remarks>
    /// <para>
    /// <b>The row first, and outside any transaction</b> — there is none, because authorization
    /// runs before MediatR. <c>WriteIndependentAsync</c> is `003`'s method for exactly this, and it
    /// never throws (`003` AC-11): a `403` that became a `500` because logging failed would be
    /// worse than an unlogged `403`.
    /// </para>
    /// <para>
    /// <b>The actor is whatever the principal holds, which is nothing on a `401`</b> (AC-32). A
    /// challenge means there was no authenticated identity, so all three actor columns are null and
    /// the row is still worth writing: "somebody with no token asked for this" is the fact.
    /// </para>
    /// <para>
    /// <b>No target.</b> The endpoint is in <c>Instance</c> on the response and the row carries the
    /// same <c>traceId</c>, so the two join. Inventing an <c>EntityType</c> for "the thing you were
    /// refused" would put a route string in a column that means an aggregate elsewhere.
    /// </para>
    /// <para>
    /// <b>Nothing from the request is copied</b> (AC-34) — not the <c>Authorization</c> header, not
    /// a token fragment, not a query string. The IP and user agent come from
    /// <c>IRequestContext</c>, which every other audit row already uses.
    /// </para>
    /// </remarks>
    private async Task DenyAsync(HttpContext context, string errorCode, string action)
    {
        // The scoped services are resolved from the REQUEST, not injected.
        //
        // This type is a singleton — the authorization middleware takes it once, at construction —
        // while IAuditWriter, ICurrentUser and IRequestContext are all scoped. Injecting them would
        // be a captive dependency, which `002` already met once: AddExceptionHandler<T> registers a
        // singleton and the factory was scoped, and .NET only validates that in Development, so the
        // test environment started cleanly and Development refused to build.
        //
        // ProblemDetailsFactory and TimeProvider are singletons and are injected normally.
        var audit = context.RequestServices.GetRequiredService<IAuditWriter>();
        var currentUser = context.RequestServices.GetRequiredService<ICurrentUser>();
        var requestContext = context.RequestServices.GetRequiredService<IRequestContext>();

        var problem = problems.ForCode(context, errorCode);

        await audit.WriteIndependentAsync(AuditEntry.For(
            occurredAtUtc: clock.GetUtcNow().UtcDateTime,
            action: action,
            outcome: AuditOutcome.Denied,

            // The same string the body carries, from the one accessor `002` built for it —
            // AC-19, BR-9.9. Read from the context rather than from the ProblemDetails, so a
            // change to the envelope cannot silently decouple the two.
            traceId: requestContext.TraceId,
            actorUserId: currentUser.UserId,
            actorEmail: currentUser.Email,
            actorRole: currentUser.Role,
            ipAddress: requestContext.IpAddress,
            userAgent: requestContext.UserAgent));

        await context.Response.WriteAsJsonAsync(
            problem, problem.GetType(), options: null, contentType: "application/problem+json");
    }
}
