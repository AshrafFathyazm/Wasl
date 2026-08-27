using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Hosting;
using Wasl.Api.Common.Auth;
using Wasl.Application.Common.Abstractions;

namespace Wasl.Api.IntegrationTests.Auth;

/// <summary>
/// Two authenticated routes the product does not need: one that echoes the principal, one behind
/// <see cref="WaslPolicies.ManagerOnly"/>.
/// </summary>
/// <remarks>
/// <para>
/// <b>Why a probe rather than an assertion over a product endpoint.</b> AC-6 is about what
/// <c>HttpContext.User</c> holds <b>inside a request</b> — the claim types, not the response — and
/// AC-7 needs an endpoint carrying the Manager policy, which the product has none of until `011`
/// adds assignment. Asserting either from outside would test the response shape instead of the
/// principal.
/// </para>
/// <para>
/// <b>It also proves <c>ICurrentUser</c> in situ.</b> The same route returns what the injected
/// <see cref="ICurrentUser"/> resolved to, so the claim names and the abstraction reading them are
/// checked against each other rather than separately — which is the pair that silently disagrees
/// when inbound claim mapping is left on.
/// </para>
/// </remarks>
internal static class AuthProbeEndpoints
{
    public const string WhoAmIPath = "/__probe/auth/whoami";
    public const string ManagerOnlyPath = "/__probe/auth/manager-only";

    public static void Map(IEndpointRouteBuilder routes)
    {
        // No AllowAnonymous. These two are the only probes that rely on the fallback policy and
        // the named policy being real.
        routes.MapGet(WhoAmIPath, (HttpContext http, ICurrentUser current) => Results.Ok(new
        {
            ClaimTypes = http.User.Claims.Select(claim => claim.Type).OrderBy(type => type),
            Sub = http.User.FindFirst("sub")?.Value,
            Email = http.User.FindFirst("email")?.Value,
            Role = http.User.FindFirst("role")?.Value,
            PreferredLanguage = http.User.FindFirst("preferred_language")?.Value,
            CurrentUserId = current.UserId,
            CurrentUserEmail = current.Email,
            CurrentUserRole = current.Role,
        }));

        routes.MapGet(ManagerOnlyPath, () => Results.Ok(new { ok = true }))
            .RequireAuthorization(WaslPolicies.ManagerOnly);
    }
}

/// <summary>Maps <see cref="AuthProbeEndpoints"/> into the real pipeline.</summary>
internal sealed class AuthProbeStartupFilter : IStartupFilter
{
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) =>
        app =>
        {
            next(app);
            app.UseEndpoints(AuthProbeEndpoints.Map);
        };
}
