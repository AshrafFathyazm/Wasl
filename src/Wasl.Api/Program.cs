using Microsoft.Extensions.Diagnostics.HealthChecks;
using Wasl.Api.Health;
using Wasl.Infrastructure;
using Wasl.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();

// Everything this layer needs from the database, behind one call. Program.cs names the
// connection string and nothing else about EF Core.
builder.Services.AddInfrastructure(builder.Configuration);

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
// Reserved, deliberately not added yet: UseAuthentication (004) must come BEFORE
// UseRequestLocalization (005). ADR-007 calls the wrong order the single most likely
// defect in this build, because the culture provider then cannot see the user and fails
// silently. Noted here so whoever adds the second one finds the constraint written down.

app.UseHttpsRedirection();

app.MapControllers();

// Outside /api, unauthenticated, and it returns the health report shape rather than
// ProblemDetails — the one documented exception to the API conventions.
app.MapHealthChecks("/health", new() { ResponseWriter = HealthReportWriter.Write });

app.Run();

// WebApplicationFactory<T> needs a type from this assembly. Top-level statements make
// Program internal, so it is made public here rather than opening the whole assembly
// with InternalsVisibleTo.
public partial class Program;
