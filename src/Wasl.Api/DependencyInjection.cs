using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Wasl.Api.Common;
using Wasl.Api.Common.Auth;
using Wasl.Api.Common.Errors;
using Wasl.Api.Common.Localization;
using Wasl.Api.Common.RateLimiting;
using Wasl.Infrastructure.Persistence.Seed;
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
    public static IServiceCollection AddPresentation(
        this IServiceCollection services,
        IConfiguration configuration)
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
        // `002b` FINISHED IT. The framework's English sentences no longer reach the wire: a
        // JSON parse failure is now `errors/malformed-request` with a localized `detail` and NO
        // `errors` object, and the field errors that remain are filtered. See ModelStateEnvelope
        // for what was measured leaking before that — a parser diagnostic naming byte offsets,
        // and the action method's own parameter name presented as a form field.
        services.Configure<ApiBehaviorOptions>(options =>
            options.InvalidModelStateResponseFactory = ModelStateEnvelope.Build);

        // ── `002c` AC-5. The framework stops writing validation messages ────────────
        //
        // With nullable reference types enabled, the model binder treats a non-nullable reference
        // property as implicitly required and reports it missing BEFORE the MediatR pipeline runs
        // — so ValidationBehaviour never executes and the catalogue key is never reached. The
        // measured result was an English sentence inside an Arabic response:
        //
        //   POST /api/tickets {"subject":"s"}   ->  description = The Description field is required.
        //   POST /api/customers {"fullName":"x"} ->  email = أدخل بريدًا إلكترونيًا أو رقم هاتف.
        //
        // Same locale, same shape, different half of the stack answering. The second endpoint's
        // fields are nullable, so its request BINDS and FluentValidation gets to speak.
        //
        // SUPPRESSED ONLY BECAUSE AC-4 IS GREEN. That gate enumerates every ICommand's
        // non-nullable members and requires a FluentValidation rule for each — because without
        // one, a missing field now arrives as null in a non-nullable property and reaches a
        // handler. That trades a `400` with awkward wording for a `500`: a worse defect wearing a
        // localization fix. If RequiredMemberCoverageTests ever goes red, this line comes out.
        services.Configure<MvcOptions>(options =>
            options.SuppressImplicitRequiredAttributeForNonNullableReferenceTypes = true);

        // Who is asking, and about which request. Both scoped because both describe one request;
        // IHttpContextAccessor is what makes them resolvable outside a controller.
        services.AddHttpContextAccessor();
        services.AddScoped<IRequestContext, HttpRequestContext>();
        services.AddScoped<ICurrentUser, HttpCurrentUser>();

        AddErrorContract(services);

        // `005`. Culture resolution and the two catalogues. Registered here rather than in
        // AddErrorContract because IProblemMessageSource is now localizer-backed and belongs
        // beside the resources it reads — and because AC-19 needs the supported list to come
        // from configuration, which AddErrorContract does not receive.
        services.AddWaslLocalization(configuration);

        // `004`. Throws at startup if the signing key is missing or shorter than 32 bytes.
        services.AddWaslAuthentication(configuration);

        // `036` §3.4. The general write limit — separate from `004b`'s sign-in throttle, which
        // counts failures rather than requests and stays on its one endpoint (AC-12).
        //
        // AFTER AddErrorContract, because OnRejected resolves ProblemDetailsFactory: the `429` it
        // writes goes through the same producer as every other error, which is what stops it
        // being the empty-bodied status `002b` had to fix three times.
        services.AddWaslRateLimiting(configuration);

        // `004` AC-12. Read at startup so a missing seed password fails the host build rather
        // than the first sign-in, and so there is nowhere for a default to hide.
        services.AddSingleton(SeedOptions.From(configuration));

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

        // `002c` Q-B: the document is REGISTERED so a test can generate it, and is deliberately
        // NOT MAPPED — `Program.cs` never calls MapOpenApi. A served document is an unauthenticated
        // description of every endpoint, and this API's fallback policy is closed on purpose:
        // exposing it would need AllowAnonymous, making it the third anonymous endpoint after
        // /health and POST /api/auth/token, which `004` AC-10 counts and asserts.
        //
        // Ruled: if a demo ever wants the explorer, it is Development-only AND a test asserts it
        // answers 404 in Production. Not now.
        services.AddOpenApi(options =>
            // `002c` AC-3's other half. Without this the document lists the formatters MVC could
            // negotiate — `text/plain, application/json, text/json` — on responses this API only
            // ever sends as `application/problem+json`.
            options.AddDocumentTransformer<ProblemJsonDocumentTransformer>());
        // `005` moved this to AddWaslLocalization: the implementation is localizer-backed now and
        // belongs beside the catalogues it reads. `002` predicted one changed line here; it is
        // one deleted line instead, because the registration moved rather than changed shape.
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

        // `002b` AC-3. Substituting MVC's factory is what finally makes `002` AC-2 — ONE producer
        // of the envelope — true for the statuses MVC composes on its own. The `415` was the
        // proof it was not: a well-formed body carrying an RFC section URI instead of our
        // registered `type`, which every shape assertion passed and no client could branch on.
        services.AddSingleton<
            Microsoft.AspNetCore.Mvc.Infrastructure.ProblemDetailsFactory,
            MvcProblemDetailsFactory>();
    }
}
