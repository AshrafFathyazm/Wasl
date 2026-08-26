using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Wasl.Api.Common;
using Wasl.Api.Common.Auth;
using Wasl.Api.Common.Errors;
using Wasl.Application.Common.Abstractions;

namespace Wasl.Api;

/// <summary>
/// Everything the presentation layer registers. <c>Program.cs</c> composes three calls and names
/// no type from any other layer.
/// </summary>
/// <remarks>
/// <para>
/// <b>Each layer registers itself so its implementations can stay <c>internal</c>.</b> Before
/// this file, <c>Program.cs</c> named <c>HttpCurrentUser</c>, <c>HttpRequestContext</c>,
/// <c>StaticProblemMessageSource</c> and <c>ProblemDetailsFactory</c> directly — which works
/// inside one assembly and is the habit that, one layer over, forces a type public purely to be
/// registered. The difference between a layer that is isolated and a layer that is called
/// isolated is whether anything outside it can name its parts.
/// </para>
/// <para>
/// <b>The MediatR behaviours are NOT here.</b> They are registered by
/// <see cref="WaslPipeline.AddWaslPipeline"/>, called last from <c>Program.cs</c>, and that is a
/// documented exception rather than an oversight — see the remarks on that method and `003`
/// `research.md` R-15. Two of the three live in <c>Wasl.Infrastructure</c>, which
/// <c>Wasl.Application</c> sits below and cannot see, so per-layer registration is not merely
/// unwise here; it does not compile.
/// </para>
/// </remarks>
public static class DependencyInjection
{
    public static IServiceCollection AddPresentation(this IServiceCollection services)
    {
        services.AddControllers()
            .AddJsonOptions(options =>
            {
                // Enums travel as STRINGS in both directions. `CLAUDE.md`'s API contract says so,
                // every contract example shows `"channel": "WhatsApp"`, and BR-8.7 puts enum
                // values outside localisation — which only means anything if the value on the
                // wire is the name.
                //
                // System.Text.Json binds enums from NUMBERS by default. Without this converter
                // `009`'s first request failed as a 400 during binding, before any validator
                // ran, and the response would have serialised `status` as `0` — leaving a client
                // branching on integers whose meaning changes the day someone reorders an enum.
                //
                // Registered once rather than per property: an attribute is a thing the next DTO
                // forgets, and the resulting contract violation compiles.
                options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
            });

        // ── Model binding failures go through OUR factory, not the framework's ──────────
        //
        // Found by rehearsing the demo, not by a test. A malformed JSON body came back as
        //
        //   "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1"
        //
        // instead of `errors/validation`. [ApiController]'s automatic model-state filter
        // short-circuits BEFORE any handler and before UseExceptionHandler, so `002`'s AC-2
        // guarantee — one producer of the envelope — had a hole nothing covered: an unparseable
        // enum, a malformed Guid in the body, or a truncated payload all bypassed the factory.
        //
        // `002` A-2 assumed this would surface as a BadHttpRequestException. The observed
        // behaviour is different and more mundane: it never becomes an exception at all.
        //
        // The messages here are the framework's English sentences rather than symbolic keys,
        // because they describe a JSON parse failure and no catalogue could translate them
        // usefully. That is the one place a sentence enters a response without passing through
        // IProblemMessageSource, and it is `002b`'s to finish along with the rest of the
        // malformed-request work.
        services.Configure<ApiBehaviorOptions>(options =>
            options.InvalidModelStateResponseFactory = context =>
            {
                var factory = context.HttpContext.RequestServices
                    .GetRequiredService<ProblemDetailsFactory>();

                var failures = context.ModelState
                    .Where(entry => entry.Value?.Errors.Count > 0)
                    .ToDictionary(
                        entry => entry.Key,
                        entry => entry.Value!.Errors
                            .Select(error => error.ErrorMessage)
                            .ToArray(),
                        StringComparer.Ordinal);

                var problem = factory.FromValidationFailures(context.HttpContext, failures);

                return new ObjectResult(problem)
                {
                    StatusCode = problem.Status,
                    ContentTypes = { "application/problem+json" },
                };
            });

        // Who is asking, and about which request. Both scoped because both describe one request;
        // IHttpContextAccessor is what makes them resolvable outside a controller.
        services.AddHttpContextAccessor();
        services.AddScoped<IRequestContext, HttpRequestContext>();
        services.AddScoped<ICurrentUser, HttpCurrentUser>();

        AddErrorContract(services);

        services.AddHealthChecks()
            // Liveness. Cheap, always true if the process is answering at all — and it is what
            // distinguishes "the app is up but the database is not" from "the app is down".
            //
            // The database check belongs to Infrastructure, which owns the DbContext, and is
            // registered there.
            .AddCheck("self", () => HealthCheckResult.Healthy());

        return services;
    }

    /// <summary>
    /// `002`. One producer of the envelope, and one place a sentence enters a response.
    /// </summary>
    private static void AddErrorContract(IServiceCollection services)
    {
        // AddProblemDetails supplies the framework's own writer; the handler and the factory
        // below make every response go through one producer (AC-2).
        services.AddProblemDetails();
        services.AddSingleton<IProblemMessageSource, StaticProblemMessageSource>();
        services.AddExceptionHandler<GlobalExceptionHandler>();

        // Singleton, not scoped, and the reason is a captive dependency.
        //
        // AddExceptionHandler<T> registers the handler as a SINGLETON. A singleton consuming a
        // scoped service captures it from the root scope and holds it forever — and .NET
        // validates scopes only in Development, so a scoped factory started fine under the test
        // environment and refused to build under Development. That was a real latent defect and
        // only `002`'s AC-13 test surfaced it.
        //
        // Safe as a singleton because it holds no per-request state: every request-specific value
        // arrives as an HttpContext parameter. That is a CONSTRAINT, not a coincidence —
        // injecting ICurrentUser here at `004` reintroduces the capture, and the fix then is to
        // pass it in rather than inject it.
        services.AddSingleton<ProblemDetailsFactory>();
    }
}
