using Microsoft.Extensions.Diagnostics.HealthChecks;
using Wasl.Api.Common;
using Wasl.Api.Common.Auth;
using Wasl.Api.Common.Errors;
using Wasl.Api.Health;
using Wasl.Application;
using Wasl.Application.Common.Abstractions;
using Wasl.Infrastructure;
using Wasl.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();

// Everything this layer needs from the database, behind one call. Program.cs names the
// connection string and nothing else about EF Core.
builder.Services.AddInfrastructure(builder.Configuration);

// Handler discovery and validators. It registers NO behaviour — see the comment in that
// file, and 003's research.md R-15 for what happened when two projects each registered
// their own.
builder.Services.AddApplication();

// ── The pipeline (003) ───────────────────────────────────────────────────────────
// The one place the behaviour order is declared: Validation -> Transaction -> Audit.
// It is registered AFTER both AddInfrastructure and AddApplication on purpose — every
// behaviour comes from this call, so nothing earlier can get ahead of it. AC-15 asserts
// the resolved sequence against WaslPipeline.DeclaredOrder.
builder.Services.AddWaslPipeline();

// Both are read by the audit behaviour, and both are scoped because they describe one
// request. IHttpContextAccessor is what makes them resolvable outside a controller.
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IRequestContext, HttpRequestContext>();
builder.Services.AddScoped<ICurrentUser, HttpCurrentUser>();

// ── The error contract (002) ─────────────────────────────────────────────────────
// AddProblemDetails supplies the framework's own writer; the handler and the factory
// below make every response go through one producer (AC-2).
builder.Services.AddProblemDetails();
builder.Services.AddSingleton<IProblemMessageSource, StaticProblemMessageSource>();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

// Singleton, not scoped, and the reason is a captive dependency.
//
// AddExceptionHandler<T> registers the handler as a SINGLETON. A singleton consuming a
// scoped service captures it from the root scope and holds it forever — and .NET
// validates scopes only in Development, so this started fine under the test environment
// and refused to build under Development. Registering the factory as scoped was a real
// latent defect that only the AC-13 test surfaced.
//
// It is safe as a singleton because it holds no per-request state: every request-specific
// value arrives as an HttpContext parameter. That is a CONSTRAINT, not a coincidence —
// anything scoped injected here later (ICurrentUser in 004, for one) reintroduces the
// captive dependency, and the fix then is to pass it in rather than inject it.
builder.Services.AddSingleton<ProblemDetailsFactory>();

// Injected once, here, so nothing anywhere calls DateTime.UtcNow inline and a test can
// substitute a fake clock without touching the code under test.
builder.Services.AddSingleton(TimeProvider.System);

builder.Services.AddHealthChecks()
    // Liveness. Cheap, always true if the process is answering at all — and it is what
    // distinguishes "the app is up but the database is not" from "the app is down".
    .AddCheck("self", () => HealthCheckResult.Healthy())
    .AddDbContextCheck<WaslDbContext>("database");

var app = builder.Build();

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
// handler in any framework sees those, which research.md R-1 calls this feature's most
// important finding.

app.UseHttpsRedirection();

app.MapControllers();

// Outside /api, unauthenticated, and it returns the health report shape rather than
// ProblemDetails — the one documented exception to the API conventions (AC-11).
app.MapHealthChecks("/health", new() { ResponseWriter = HealthReportWriter.Write });

app.Run();

// WebApplicationFactory<T> needs a type from this assembly. Top-level statements make
// Program internal, so it is made public here rather than opening the whole assembly
// with InternalsVisibleTo.
public partial class Program;
