using Wasl.Api;
using Wasl.Api.Common;
using Wasl.Api.Health;
using Wasl.Infrastructure.Persistence.Seed;
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

// ── AND BEFORE UseAuthorization. `005` AC-12, Q-H, ruled 2026-08-29 ──────────────
//
// ADR-007 constrains this registration relative to UseAuthentication() ONLY. Placing it
// before UseAuthorization() as well is an ADDITION to that decision, not a change to it, and
// the reason is measured rather than argued:
//
//   `004b` gave the 401 and the 403 real ProblemDetails bodies — they used to be empty — and
//   those bodies are produced INSIDE UseAuthorization, by AuthDenialResultHandler. With
//   localization registered after it, the middleware never runs for a denial at all: no
//   culture is resolved, no Content-Language is written, and the title is served in whatever
//   the process default happens to be.
//
// Measured on the wire on 2026-08-29, before this line moved: every 401 came back with an
// empty Content-Language while an authenticated 200 on the same host came back `ar`.
//
// DO NOT MOVE THIS BACK. ADR-007 does not forbid it, the build stays green, every test that
// does not assert a denial's Content-Language stays green, and Arabic users silently get
// English on exactly the two responses that tell them they may not proceed.
app.UseRequestLocalization();
app.UseAuthorization();

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
