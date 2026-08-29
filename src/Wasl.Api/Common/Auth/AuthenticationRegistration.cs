using System.IdentityModel.Tokens.Jwt;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.IdentityModel.Tokens;
using Wasl.Application.Common.Abstractions;

namespace Wasl.Api.Common.Auth;

/// <summary>
/// JWT bearer authentication, the two policies, and the fallback that closes every endpoint.
/// `004`.
/// </summary>
internal static class AuthenticationRegistration
{
    public static IServiceCollection AddWaslAuthentication(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // Throws at startup if the key is missing or too short (AC-11). One options object is read
        // by both the issuer and the validator below, so they cannot drift.
        var options = JwtOptions.From(configuration);

        services.AddSingleton(options);
        services.AddScoped<IAccessTokenIssuer, JwtAccessTokenIssuer>();

        // Inbound claim mapping OFF, and this is the setting that costs an afternoon when it is
        // left on. By default ASP.NET Core rewrites `sub` to a long WS-Federation URI, so
        // User.FindFirst("sub") returns null while the token plainly contains it — and nothing
        // throws. AC-6 is the test. It is set before AddAuthentication so it applies to the
        // handler that reads the token.
        JwtSecurityTokenHandler.DefaultInboundClaimTypeMap.Clear();
        JwtSecurityTokenHandler.DefaultMapInboundClaims = false;

        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(bearer =>
            {
                bearer.MapInboundClaims = false;

                bearer.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = options.Issuer,

                    ValidateAudience = true,
                    ValidAudience = options.Audience,

                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = options.Key(),

                    // Named explicitly rather than left to the defaults. A token whose header says
                    // `alg: none` is then rejected because HS256 is the only algorithm accepted —
                    // AC-8. Accepting "none" is the classic JWT forgery, and it is the default in
                    // more libraries than it should be.
                    ValidAlgorithms = [SecurityAlgorithms.HmacSha256],

                    ValidateLifetime = true,

                    // Zero, not the five-minute default (AC-9). Five minutes of grace on an
                    // eight-hour token is not a security decision anyone made — it is a default
                    // nobody read, and it means "expired" is a five-minute range rather than an
                    // instant.
                    ClockSkew = TimeSpan.Zero,

                    // So the role policy below reads `role` and the name reads `sub`, matching
                    // what the issuer writes.
                    RoleClaimType = ActorClaimTypes.Role,
                    NameClaimType = ActorClaimTypes.UserId,
                };
            });

        // `004b`. Registered BEFORE AddAuthorizationBuilder so the intent reads in order; the
        // container does not care, but a reader meeting SetFallbackPolicy first would reasonably
        // assume nothing observes what it refuses.
        //
        // This is what closes BR-9.4's last gap: until now a denial by the authorization
        // middleware wrote no audit row, and `011` measured the consequence — the placement of a
        // permission check decided whether the refusal was recorded at all.
        services.AddSingleton<
            Microsoft.AspNetCore.Authorization.IAuthorizationMiddlewareResultHandler,
            AuthDenialResultHandler>();

        // Scoped, because it reads IRequestContext and IAuditWriter — both scoped. Registered as
        // itself so those dependencies are injected normally rather than resolved out of the
        // request inside the method, which is what the singleton denial handler has to do.
        services.AddScoped<SignInThrottleFilter>();

        services.AddAuthorizationBuilder()
            .AddPolicy(WaslPolicies.ManagerOnly, policy => policy
                .RequireAuthenticatedUser()
                .RequireRole(nameof(Wasl.Domain.Users.SupportRole.Manager)))

            // The fallback, and it is the reason a forgotten [Authorize] cannot open an endpoint.
            //
            // Without it, security is a per-endpoint attribute — and the endpoint that gets it
            // wrong is the one added in a hurry. With it, an endpoint is closed unless it says
            // otherwise, so the mistake becomes a 401 in a test rather than an open door in
            // production. AC-10 asserts every endpoint carries metadata or [AllowAnonymous]
            // deliberately.
            .SetFallbackPolicy(new AuthorizationPolicyBuilder()
                .RequireAuthenticatedUser()
                .Build());

        return services;
    }
}
