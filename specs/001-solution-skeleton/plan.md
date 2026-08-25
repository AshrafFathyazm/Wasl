# 001 — Plan

**Phase:** 0 · **Role:** Architecture · **Agent:** `feature-dev:code-architect` ·
**Skill:** `speckit-plan`

## Backend design

Four projects, per ADR-002. ADR-010 proposed two and was rejected. The layout below is the
whole of what this feature creates — every file is named, because a plan that does not name
its files is a description.

```text
Wasl.sln
global.json                                 pins SDK 10.0.2xx — refuses the preview
Directory.Build.props                       net10.0 · nullable · warnings as errors
docker-compose.yml                          SQL Server 2022 — for the integration suite
.github/workflows/ci.yml                    build → unit → integration
.gitignore                                  already present
src/
  Wasl.Domain/
    Wasl.Domain.csproj                      NO PackageReference. That is the point
    Customers/
      Customer.cs                           shell: private setters, no behaviour yet

  Wasl.Application/
    Wasl.Application.csproj                 references Domain ONLY — no EF Core, no ASP.NET
    Common/
      Abstractions/
        IApplicationDbContext.cs            DbSet<Customer> + SaveChangesAsync
    Features/                               empty here; 007 adds the first use case

  Wasl.Infrastructure/
    Wasl.Infrastructure.csproj              EF Core SqlServer, Design
    Persistence/
      WaslDbContext.cs                      implements IApplicationDbContext
      UtcDateTimeConverter.cs               the ADR-013 guarantee
      Configurations/
        CustomerConfiguration.cs
      Migrations/                           generated
    DependencyInjection.cs                  AddInfrastructure(config) — one entry point

  Wasl.Api/
    Wasl.Api.csproj                         references Application + Infrastructure
    Program.cs                              composition root
    appsettings.json                        no connection string — Production is not configured here
    appsettings.Development.json            local SQLEXPRESS, Windows auth — no credential, safe to commit
    Health/
      HealthReportWriter.cs                 the JSON shape in contracts/health-api.md
tests/
  Wasl.Domain.Tests/
    Wasl.Domain.Tests.csproj
  Wasl.Application.Tests/
    Wasl.Application.Tests.csproj
    Architecture/LayerDependencyTests.cs    Domain has no packages; Application cannot see EF Core
  Wasl.Api.IntegrationTests/
    Wasl.Api.IntegrationTests.csproj
    WaslApiFactory.cs                       WebApplicationFactory + Testcontainers.MsSql
    DatabaseFixture.cs                      container lifetime, migration on start
    HealthEndpointTests.cs
    PersistenceConventionTests.cs           UTC round-trip, nvarchar, check constraint
```

**`Features/` is empty in this feature and that is deliberate.** The folder exists so the
convention is visible from the first commit — a use case goes in its own folder under
`Features/`, not into `Commands/` and `Handlers/` directories. `007` puts the first one
there.

**`/health` is a controller-less endpoint.** `MapHealthChecks` is the framework's own
mapping; a `HealthController` wrapping it would add a layer that does nothing. Controllers
arrive with `002`, when there is a request to bind and a result to map.

### Where each decision is enforced

| Decision | Enforced by | Not by |
|---|---|---|
| Domain depends on nothing (ADR-002) | `LayerDependencyTests` over the compiled assembly | The csproj being tidy today |
| Application cannot see EF Core (ADR-002) | The same test, asserting `Wasl.Application` references neither `Microsoft.EntityFrameworkCore` nor `Microsoft.AspNetCore` | The project reference list looking right on the day it was written |
| Every `DateTime` is UTC (ADR-013) | `UtcDateTimeConverter` applied by convention + a round-trip test | A naming convention and good intentions |
| Warnings are errors | One `Directory.Build.props` at the root | Each csproj repeating it |
| Which SDK compiles this | `global.json`, pinned to the `10.0.2xx` band | Whatever the machine resolves — four SDKs are installed here and the highest is a preview |
| No secrets committed | Windows auth against the local instance: there is no password to commit. A container password exists only in `docker-compose.yml`, for a throwaway test container | A placeholder plus a note in the README |
| Append-only tables have no `rowversion` | Explicit `.IsRowVersion()` only where ADR-006 requires it | Applying it everywhere "to be safe" |

### `Program.cs` order

Order matters here in one place already, and it will matter more later, so it is
written down now rather than discovered:

```csharp
builder.Services.AddInfrastructure(builder.Configuration);   // Wasl.Infrastructure
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddHealthChecks()
       .AddDbContextCheck<WaslDbContext>("database");
// ── app ──
app.MapHealthChecks("/health", new() { ResponseWriter = HealthReportWriter.Write });
```

`AddInfrastructure` lives in `Wasl.Infrastructure` and registers `WaslDbContext` as
`IApplicationDbContext`. `Program.cs` therefore names the connection string and nothing
else about the database — which is what keeps the EF Core dependency on the far side of the
Application layer rather than in the composition root's business.

`TimeProvider.System` registered here, once, so nothing anywhere calls
`DateTime.UtcNow` inline. A test can then substitute a fake clock without touching the
code under test — which is the reason for the abstraction, not tidiness.

**Reserved for later, deliberately not added now:** `UseAuthentication` (`004`) must
come **before** `UseRequestLocalization` (`005`). ADR-007 calls this the single most
likely defect in the whole build because it fails silently. It is noted in this plan so
that whoever adds the second one finds the constraint already written down.

## Frontend design

**None in this feature.** The React application, tokens, and primitives are `006`.

This is a deliberate ordering choice: the design work has a hard one-day timebox
(ADR-009) and it degrades gracefully, while everything in this feature is a
prerequisite for verifying anything at all. Starting with the part that is fun to build
is the documented way to lose a day.

## Data changes

See [`data-model.md`](data-model.md). One table, one migration, `InitialCreate`.

## Contract changes

The initial contract: [`contracts/health-api.md`](contracts/health-api.md), frozen.

No prior contract exists, so nothing is broken. Recorded because the heading is part of
every plan from here on, and an empty one is information.

## Test strategy

| Level | What | Why there |
|---|---|---|
| Unit (`Wasl.Domain.Tests`) | The architecture test only | There is no domain behaviour yet. A unit test asserting a shell class has private setters would test the compiler |
| Integration (`Wasl.Api.IntegrationTests`) | Health `200` and `503`, migration on empty database, UTC round-trip, Arabic round-trip, check constraint present | Every one of these is a property of the real engine. EF `InMemory` enforces none of them, which is why `docs/sdd/testing/test-strategy.md` forbids it |
| Not tested | That EF Core saves, that ASP.NET routes, that Docker starts containers | Testing the framework |

**Deliberately untested and recorded:** the CI workflow itself. It is verified by
observing a green run on the first push — which is AC-9 — not by a test.

## Dependencies

Nothing. This is the first feature; everything else depends on it.

## Risks and trade-offs

### Decided: a local instance for the development loop, a container for the tests

The machine already runs SQL Server 2022 Express (`research.md` R-8, verified — 16.0.1000.6,
`ISJSON` present, Windows auth). Docker on this machine has failed twice in one sitting:
the daemon was down, and the image pull then died with `unexpected EOF`.

So the two are split rather than one chosen:

| | Uses | Because |
|---|---|---|
| Development loop | `.\SQLEXPRESS`, Windows auth | Nothing to start, nothing to pull, and **no password to store** — AC-10 is satisfied by there being no secret rather than by remembering user secrets |
| Integration suite | `Testcontainers.MsSql` | CI needs a container regardless, so tying the tests to a local instance would create two paths and the one that breaks would be the one on the server. A container also gives a clean database per run |

**Rejected: use the local instance for the integration tests too.** It removes the Docker
prerequisite entirely and it is tempting for exactly that reason. But a shared instance has
no per-run isolation, so a test can come to depend on the order tests ran in — and it
drifts from CI, which makes "green locally, red on the server" normal and takes the value
of the suite with it.

**Rejected: LocalDB as the primary.** It is installed (`MSSQLLocalDB`) and it is the second
fallback, not the first — Express is already running, is the same edition family, and needs
no instance to be started on demand.

**If Docker is unavailable**, the integration suite is **not run**, and `tests.md` records
it as not run with the reason. Never as a pass.

### Considered and rejected: no CI until there is something to test

CI on a repository with one endpoint feels premature. It is the opposite: adding it now
costs one file, and adding it after twenty commits means fixing twenty commits' worth
of accumulated drift in one sitting — and it is direct evidence for *Engineering
Foundations*.

### Considered and rejected: create every table in `InitialCreate`

Tempting, and it would make `007` through `013` migration-free. Rejected because a
migration is the cheapest place to get the type mapping wrong, and one table's worth of
review beats seven tables reviewed at once. Each feature brings its own migration and
its own verification of it.

### Accepted risk: the `Customers` shell

`Customer.cs` exists here with no behaviour, which is the kind of file that attracts
someone adding a property to it "while they are there". Contained by `007` owning the
entity's specification, and by the shell having private setters so a caller cannot
mutate it into something before then.

### Confirmed divergence: .NET 10 against the house platform's `net8.0`

**Confirmed by the product owner on 2026-08-23**, so this is a decision rather than an
assumption being carried. Reasoning and containment in [`research.md`](research.md) R-3:
one line in one file until something depends on a .NET 10-only API, and `ai-notes.md`
records it if anything ever does.

The residual risk was never the framework version — it was **SDK resolution**. Four
SDKs are installed on this machine and the highest is `10.0.400-preview`. A preview
compiler emitting one warning that GA does not is a *build failure* here, because
warnings are errors. `global.json` pins the band, and AC-13 checks that
`dotnet --version` inside the repository reports the pinned SDK rather than the preview.

### Accepted risk: Docker is the one unreliable dependency left

Superseded the earlier note that the daemon was simply down. It has since been started —
and the image pull then failed with `unexpected EOF` (`research.md` R-8).

The development loop no longer depends on it, so the blast radius is now exactly one thing:
`BE-001-10` and every `TEST-` task needing a container. Two mitigations, both already in
the plan:

- `WaslApiFactory` fails **fast** with a message naming Docker rather than hanging until a
  test timeout — the difference between diagnosing this in a second and investigating it
  for two minutes.
- If the suite cannot run, `tests.md` records it as **not run, with the reason**. Never as
  a pass. That is the rule that makes the rest of the evidence worth anything.
