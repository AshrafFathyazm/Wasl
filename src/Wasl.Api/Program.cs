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
    .AddPresentation();

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

// Reserved, deliberately not added yet: UseAuthentication (004) must come BEFORE
// UseRequestLocalization (005). ADR-007 calls the wrong order the single most likely
// defect in this build, because the culture provider then cannot see the user and fails
// silently. Noted here so whoever adds the second one finds the constraint written down.
//
// Also deferred to 002b: UseStatusCodePages, which envelopes the statuses the framework
// short-circuits without throwing — 404 on a mistyped path, 405, 415. No exception
// handler in any framework sees those, which 002's research.md R-1 calls its most
// important finding.

app.UseHttpsRedirection();

app.MapControllers();

// Outside /api, unauthenticated, and it returns the health report shape rather than
// ProblemDetails — the one documented exception to the API conventions (002 AC-11).
app.MapHealthChecks("/health", new() { ResponseWriter = HealthReportWriter.Write });

app.Run();

// WebApplicationFactory<T> needs a type from this assembly. Top-level statements make
// Program internal, so it is made public here rather than opening the whole assembly
// with InternalsVisibleTo.
public partial class Program;
