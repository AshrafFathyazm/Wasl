# 001 — Plan

**Phase:** 0 · **Role:** Architecture · **Agent:** `feature-dev:code-architect` ·
**Skill:** `speckit-plan`

## Backend design

Two projects, per ADR-010. The layout below is the whole of what this feature creates —
every file is named, because a plan that does not name its files is a description.

```text
Wasl.sln
global.json                                 pins SDK 10.0.2xx — refuses the preview
Directory.Build.props                       net10.0 · nullable · warnings as errors
docker-compose.yml                          SQL Server 2022, one service: db
.github/workflows/ci.yml                    build → unit → integration
.gitignore                                  already present
src/
  Wasl.Domain/
    Wasl.Domain.csproj                      NO PackageReference. That is the point
    Customers/
      Customer.cs                           shell: private setters, no behaviour yet
  Wasl.Api/
    Wasl.Api.csproj                          EF Core SqlServer, Design, AspNetCore
    Program.cs                               composition root
    appsettings.json                         connection string PLACEHOLDER only
    appsettings.Development.json
    Common/
      Persistence/
        WaslDbContext.cs
        UtcDateTimeConverter.cs              the ADR-013 guarantee
        Configurations/
          CustomerConfiguration.cs
        Migrations/                          generated
      Health/
        HealthEndpoint.cs                    maps GET /health, writes the contract shape
        HealthReportWriter.cs                the JSON shape in contracts/health-api.md
tests/
  Wasl.Domain.Tests/
    Wasl.Domain.Tests.csproj
    Architecture/DomainHasNoDependenciesTests.cs
  Wasl.Api.IntegrationTests/
    Wasl.Api.IntegrationTests.csproj
    WaslApiFactory.cs                        WebApplicationFactory + Testcontainers.MsSql
    DatabaseFixture.cs                       container lifetime, migration on start
    HealthEndpointTests.cs
    PersistenceConventionTests.cs            UTC round-trip, nvarchar, check constraint
```

### Where each decision is enforced

| Decision | Enforced by | Not by |
|---|---|---|
| Domain depends on nothing (ADR-010) | `DomainHasNoDependenciesTests` over the compiled assembly | The csproj being tidy today |
| Every `DateTime` is UTC (ADR-013) | `UtcDateTimeConverter` applied by convention + a round-trip test | A naming convention and good intentions |
| Warnings are errors | One `Directory.Build.props` at the root | Each csproj repeating it |
| Which SDK compiles this | `global.json`, pinned to the `10.0.2xx` band | Whatever the machine resolves — four SDKs are installed here and the highest is a preview |
| No secrets committed | Placeholder in `appsettings.json`, real value from user secrets | A note in the README |
| Append-only tables have no `rowversion` | Explicit `.IsRowVersion()` only where ADR-006 requires it | Applying it everywhere "to be safe" |

### `Program.cs` order

Order matters here in one place already, and it will matter more later, so it is
written down now rather than discovered:

```csharp
builder.Services.AddDbContext<WaslDbContext>(o => o.UseSqlServer(connectionString));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddHealthChecks()
       .AddDbContextCheck<WaslDbContext>("database");
// ── app ──
app.MapHealthChecks("/health", new() { ResponseWriter = HealthReportWriter.Write });
```

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

### Considered and rejected: skip Docker, use LocalDB for integration tests

Faster to start on a Windows machine and it removes the Docker prerequisite entirely.
Rejected because LocalDB is Windows-only, has no clean per-run isolation, and drifts
from whatever CI runs — so a test suite green locally and red in CI becomes normal,
and the value of the suite goes with it.

**Kept as a documented fallback**, not as the default. A contributor without Docker
runs the unit suite and says so in `tests.md`.

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

### Known-false assumption at time of writing: Docker

The Docker daemon is not running on this machine (`research.md` R-8). Nothing in the
plan changes — but `BE-001-10` and every `TEST-` task depending on a container cannot be
verified until Docker Desktop is started, and `WaslApiFactory` must fail fast naming
Docker rather than hanging. Recorded here so a red integration suite is diagnosed in one
second rather than investigated.
