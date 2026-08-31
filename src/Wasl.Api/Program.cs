using Wasl.Api;
using Wasl.Api.Common;
using Wasl.Api.Common.Errors;
using Wasl.Api.Health;
using Wasl.Application.Common.Abstractions;
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

// ── The identity a SEED run acts as ──────────────────────────────────────────────
// Registered ONLY when a seeding switch is present, and after AddPresentation so it
// replaces HttpCurrentUser. Every seeding branch returns before app.Run(), so a
// serving host never composes it and no request can be attributed to it.
//
// A comment needs an actor: TicketComment.AuthorUserId is non-nullable with a foreign
// key and Ticket.AddComment stamps it from ICurrentUser. Without one the seeder writes
// Guid.Empty and meets Error Number:547 — the same failure 009's fabricated assignee
// id produced once 004 gave the column its FK.
//
// It adopts the SEEDED MANAGER, which is not what ADR-005 rejects. ADR-005 forbids
// INVENTING an identity — a system user, a constant claim. This is a support user that
// SupportUserSeeder really created and that a person really signs in as, so the seeded
// rows are attributed to somebody who exists.
if (args.Contains(BulkTicketSeeder.Switch) || args.Contains(BulkTicketSeeder.CustomersSwitch))
{
    builder.Services.AddSingleton<SeedActor>();
    builder.Services.AddScoped<ICurrentUser>(sp => sp.GetRequiredService<SeedActor>());
}

var app = builder.Build();

// ── 003b. Schema and permissions, on the MIGRATOR connection ─────────────────────
//
// `dotnet run --project src/Wasl.Api -- --provision` migrates the schema and then creates the
// restricted `wasl_app` principal with its grants and denies. Idempotent, so it is safe on
// every deploy and on a database that predates the feature.
//
// It is a separate command rather than an EF migration because the principal needs a PASSWORD,
// and a migration file is committed: putting `CREATE LOGIN … WITH PASSWORD` in one would either
// commit a credential or invent a placeholder every deployment forgets to change. 004's rule —
// a secret has no default and the host refuses to start without it — cannot be honoured by a
// file in source control.
//
// The cost of that trade, stated rather than discovered: `dotnet ef database update` alone no
// longer produces a working application. quickstart.md has two steps.
// `003b` AC-10, and the reason it is a switch rather than only a method: the reverse was
// written and NEVER RUN, which this project's own rule says is not a guard at all. A method
// nothing invokes is a method nothing has proven. `--deprovision` drops the user and the login
// the way a torn-down environment needs, and makes the claim testable.
//
// It does NOT drop the database or the schema. Undoing the principal is a permissions
// operation; undoing the data is `dotnet ef database drop`, and merging the two would mean one
// mistyped flag destroying a database somebody wanted.
if (args.Contains("--deprovision"))
{
    var migrator = Wasl.Infrastructure.Persistence.DatabaseBootstrapper
        .MigratorConnectionString(builder.Configuration);

    await Wasl.Infrastructure.Persistence.LeastPrivilegeProvisioner.DeprovisionAsync(migrator);
    Console.WriteLine("wasl_app deprovisioned. The schema and its data are untouched.");
    return;
}

if (args.Contains("--provision"))
{
    await Wasl.Infrastructure.Persistence.DatabaseBootstrapper.RunAsync(builder.Configuration);
    Console.WriteLine("Schema applied and wasl_app provisioned.");
    return;
}

// ── One command for a demo from a known state ────────────────────────────────────
// `dotnet run --project src/Wasl.Api -- --seed` provisions, applies migrations, writes three
// customers and five tickets in five statuses through the real domain, and exits without serving.
//
// It exits rather than continuing to run: a seed that also starts the API makes "did the seed
// work" and "is the app up" the same question, and the answer to the second hides the first.
if (args.Contains(DemoSeeder.Switch))
{
    await DemoSeeder.RunAsync(app.Services);
    return;
}

// ── A queue big enough to work ───────────────────────────────────────────────────
// `dotnet run --project src/Wasl.Api -- --seed-bulk 120` adds N tickets on top of
// whatever is there, spread across the three views the navigation offers: assigned
// to the signed-in Manager, assigned to the two Agents, and unassigned.
//
// SEPARATE FROM --seed, and additive rather than idempotent. --seed writes a fixed
// five and stops when tickets exist, which is right for a demo from a known state
// and useless for the thing this is for: five rows make every tab count a single
// digit, never produce a second page, and leave "unassigned" a blank screen that
// reads as a broken filter rather than an empty queue.
//
// It refuses when there are no customers instead of inventing them — a second
// definition of a demo customer in a second file is how the two drift.
if (args.Contains(BulkTicketSeeder.CustomersSwitch))
{
    var at = Array.IndexOf(args, BulkTicketSeeder.CustomersSwitch);
    var howMany = at >= 0 && at + 1 < args.Length
        && int.TryParse(args[at + 1], out var asked) && asked > 0
        ? asked
        : BulkTicketSeeder.DefaultCustomerCount;

    await BulkTicketSeeder.SeedCustomersAsync(app.Services, howMany);
    return;
}

if (args.Contains(BulkTicketSeeder.Switch))
{
    var index = Array.IndexOf(args, BulkTicketSeeder.Switch);
    var count = index >= 0 && index + 1 < args.Length
        && int.TryParse(args[index + 1], out var requested) && requested > 0
        ? requested
        : BulkTicketSeeder.DefaultCount;

    await BulkTicketSeeder.RunAsync(app.Services, count);
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

// ── 002b. The statuses nobody throws ─────────────────────────────────────────────
//
// Routing answers a 404 for an unmatched path and a 405 for an undeclared method by writing
// a status and stopping. Nothing is thrown, so UseExceptionHandler is never entered — 002's
// research.md R-1 calls that the feature's most important finding, and it is why this needs
// a separate mechanism rather than a wider catch.
//
// An anonymous caller cannot tell a real route from an invented one: a GET to /api/nope, to
// /api/tickets, to /nope, and a DELETE on a GET-only route all return an IDENTICAL 401.
// AC-18 asserts that, and it must keep holding.
//
// THE REASON IS THE FALLBACK POLICY, NOT THIS LINE'S POSITION — and that correction is worth
// the space, because the first version of this comment claimed the opposite in capital letters.
// Moving the registration above UseAuthorization was measured: AC-18 still passed. The 401 is
// produced INSIDE the wrapped section and short-circuits before routing ever resolves a 404, so
// this middleware never sees the request at all. The position is conventional; the security
// property is RequireAuthenticatedUser's, and it is `004`'s.
//
// It writes only into an EMPTY response, so every envelope that already exists — a thrown
// 409, 004b's 401 and 403, MVC's 400 — passes through untouched. AC-6 proves that by
// comparing whole bodies before and after, because double-writing onto a response that was
// already correct is precisely what a shape assertion cannot see.
app.UseStatusCodePages(StatusCodeEnvelope.WriteAsync);

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
