using Wasl.Api;
using Wasl.Api.Common;
using Wasl.Api.Health;
using Wasl.Api.Seed;
using Wasl.Application;
using Wasl.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

// Each layer registers itself, so nothing here names a type from another layer and every
// implementation can stay internal to the project that owns it.
builder.Services
    .AddApplication()
    .AddInfrastructure(builder.Configuration)
    .AddPresentation(builder.Configuration);

// ── The pipeline (003) — deliberately NOT inside any of the three above ──────────
//
// The one place the MediatR behaviour order is declared: Validation -> Transaction -> Audit.
// That order is execution order, not a naming convention, and it is asserted by AC-15 against
// WaslPipeline.DeclaredOrder.
//
// It is called LAST so no earlier registration can get ahead of it, and it is called from here
// rather than from a layer because the three behaviours do not live in one layer:
// ValidationBehaviour is in Wasl.Application, and TransactionBehaviour and AuditBehaviour are in
// Wasl.Infrastructure because both need a real transaction. Registering per layer was tried and
// OBSERVED producing Transaction -> Audit -> Validation — a 400 then opens a transaction and
// writes an audit row for every mistyped form, and nothing throws (003 research.md R-15).
//
// So this call is the documented exception to "each layer registers itself", and the exception
// is the whole reason the order is trustworthy.
builder.Services.AddWaslPipeline();

var app = builder.Build();

// ── One command for a demo from a known state ────────────────────────────────────
// `dotnet run --project src/Wasl.Api -- --seed` applies migrations, writes three customers and
// five tickets in five statuses through the real domain, and exits without serving.
//
// It exits rather than continuing to run: a seed that also starts the API makes "did the seed
// work" and "is the app up" the same question, and the answer to the second hides the first.
if (args.Contains(DemoSeeder.Switch))
{
    await DemoSeeder.RunAsync(app.Services);
    return;
}

// ── Middleware order ─────────────────────────────────────────────────────────────
// UseExceptionHandler goes FIRST, and it is first for a reason: it can only catch what
// is thrown downstream of it. Registered after anything else and that middleware's
// failures escape into a blank 500 with no envelope and no traceId.
//
// It runs in Development too, deliberately. The developer exception page is a different
// shape from the contract, so leaving it on would mean the shape a developer sees is not
// the shape a client gets — and AC-13 is the test that keeps it off.
app.UseExceptionHandler();

// ── The order ADR-007 warns about, and both halves are now here ──────────────────
//
// UseAuthentication BEFORE UseRequestLocalization. ADR-007 calls the wrong order the single
// most likely defect in this build, and the reason is that it fails SILENTLY: the culture
// provider cannot see a user who has not been authenticated yet, so a signed-in Arabic user
// gets English and nothing anywhere reports a problem.
//
// They are registered together, in one commit, precisely so the constraint is satisfied by
// whoever knew about it rather than inherited by whoever did not.
app.UseAuthentication();
app.UseAuthorization();

// Culture resolution only — `005` still owns the catalogues. This is here because the
// frontend lane needs `Content-Language` on every response to tell an Arabic request that
// answered in English from one that answered in Arabic, and without the header that check is
// impossible from the client side.
//
// ApplyCurrentCultureToResponseHeaders defaults to true, which is what sends the header.
// Named explicitly anyway: a behaviour this feature depends on should not rest on a default
// someone may change.
app.UseRequestLocalization(new RequestLocalizationOptions
{
    ApplyCurrentCultureToResponseHeaders = true,
}
    .SetDefaultCulture("en")

    // en and ar (BR-8.1). Both lists, because SupportedCultures governs formatting and
    // SupportedUICultures governs resource lookup — setting only one gives Arabic text with
    // English number formatting, or the reverse.
    .AddSupportedCultures("en", "ar")
    .AddSupportedUICultures("en", "ar"));

// Still deferred to 002b: UseStatusCodePages, which envelopes the statuses the framework
// short-circuits without throwing — 404 on a mistyped path, 405, 415. No exception
// handler in any framework sees those, which 002's research.md R-1 calls its most
// important finding.

app.UseHttpsRedirection();

app.MapControllers();

// Outside /api, unauthenticated, and it returns the health report shape rather than
// ProblemDetails — the one documented exception to the API conventions (002 AC-11).
app.MapHealthChecks("/health", new() { ResponseWriter = HealthReportWriter.Write })

    // One of exactly two anonymous endpoints (AC-10, AC-20). Written as an explicit opt-out
    // rather than relying on health checks being exempt, because they are not: the fallback
    // policy applies to every endpoint, and a probe that answers 401 reports the application as
    // unhealthy to a load balancer that is behaving correctly.
    .AllowAnonymous();

app.Run();

// WebApplicationFactory<T> needs a type from this assembly. Top-level statements make
// Program internal, so it is made public here rather than opening the whole assembly
// with InternalsVisibleTo.
public partial class Program;
