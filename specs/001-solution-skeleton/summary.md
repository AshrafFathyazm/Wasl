# 001 — Summary

**Implemented 2026-08-25.** 17 tests, 17 passed, 0 skipped. `dotnet build` reports zero
warnings, and warnings are errors.

## What was built

A repository that a stranger can clone, run in two commands, and see answer — with the four
decisions that are expensive to reverse already made and already enforced by something
other than memory.

```text
Wasl.slnx · global.json · Directory.Build.props · docker-compose.yml · .github/workflows/ci.yml
src/
  Wasl.Domain/           Customers/Customer.cs                    — zero package references
  Wasl.Application/      Common/Abstractions/IApplicationDbContext.cs
                         Features/                                — empty, on purpose
  Wasl.Infrastructure/   Persistence/WaslDbContext.cs
                         Persistence/UtcDateTimeConverter.cs
                         Persistence/Configurations/CustomerConfiguration.cs
                         Persistence/Migrations/…_InitialCreate.cs
                         DependencyInjection.cs
  Wasl.Api/              Program.cs · Health/HealthReportWriter.cs · appsettings*.json
tests/
  Wasl.Domain.Tests/           Customers/CustomerShapeTests.cs              3 tests
  Wasl.Application.Tests/      Architecture/LayerDependencyTests.cs         5 tests
  Wasl.Api.IntegrationTests/   WaslApiFactory · HealthEndpointTests
                               PersistenceConventionTests                   9 tests
```

Every acceptance criterion has an observed result in [`tests.md`](tests.md) except AC-9,
which is recorded as unverified because CI has never run.

## Decisions taken during implementation

Each of these was a real fork, and each is recorded here because a reviewer will ask.

| Decision | Why |
|---|---|
| **`Wasl.Api` has no `Controllers/` folder yet** | `/health` is mapped by `MapHealthChecks`, the framework's own endpoint. A `HealthController` wrapping it would add a layer that does nothing. Controllers arrive with `002`, when there is a request to bind and a result to map |
| **`IApplicationDbContext` exposes `IQueryable<T>`, not `DbSet<T>`** | `DbSet<T>` is a type in `Microsoft.EntityFrameworkCore`, so naming it in the Application layer would put the ORM in that project's dependency graph and break AC-7. Raised as a spec contradiction, answered by the product owner: keep the boundary, shape the interface around it |
| **The async-materialisation abstraction is deferred to `007`** | `ToListAsync` and friends are EF Core extension methods, so an EF-free Application layer needs an abstraction over them. `001` has no handler and therefore no consumer, and the constitution forbids an abstraction with none. Its shape is better decided against a real call site |
| **`Wasl.Domain.Tests` asserts the entity's *shape*** | The plan said there is no domain behaviour yet, which is true — but `dotnet test` exits non-zero on a project with no tests, which would fail CI. Three assertions about a deliberate decision (sealed, no public constructor, no public setter) are not the same as testing the compiler |
| **The development loop uses local SQL Server Express; the integration suite uses Testcontainers** | Recorded in `research.md` R-8. Docker failed twice on this machine before the suite ever ran; the local instance needs nothing started and stores no password |
| **`xunit 2.9.3`, not v3** | That is what the template installed. The code was adapted to v2 rather than the package changed — the xunit version is not something this feature has a reason to decide |

## Deviations from the plan

| Planned | Actual | Why |
|---|---|---|
| `Wasl.sln` | `Wasl.slnx` | The .NET 10 SDK creates the XML solution format by default. No behavioural difference; the CI workflow and the architecture test both find it |
| `DomainHasNoDependenciesTests` in `Wasl.Domain.Tests` | `LayerDependencyTests` in `Wasl.Application.Tests` | It has to inspect the *Application* assembly and project file, so it belongs in that project. It now asserts both boundaries rather than one |
| `Wasl.Api/Common/Persistence/` | `Wasl.Infrastructure/Persistence/` | The plan predated the four-project reversal; the persistence layer is Infrastructure's |
| `BE-001-03` = one task | Split into `BE-001-03` (local instance) and `BE-001-03b` (compose, for the suite and CI) | They serve different consumers and one of them is not needed to run the application |
| `Microsoft.AspNetCore.OpenApi` from the template | Removed | The build gate flagged a high-severity advisory in its transitive `Microsoft.OpenApi 2.0.0`, and `001` has no OpenAPI requirement |

None of these changes an acceptance criterion.

## What the discipline caught

Four defects, none of them found by reading:

1. **A high-severity advisory** in a transitive package, on the first `dotnet build` —
   because warnings are errors.
2. **`global.json` resolving to the installed preview SDK.** `rollForward: latestFeature`
   permits a *higher* feature band, which is the opposite of pinning. AC-13 caught it in
   seconds.
3. **The architecture test was a false negative.** It passed with EF Core added to
   `Wasl.Application`, because `GetReferencedAssemblies()` reports what the IL *uses* and
   nothing used it yet. Only trying to break it revealed this — and a guard that has not
   been seen to fail has not been verified.
4. **Two `/health` contract violations** — a missing `self` check and `description`
   emitted as `null` where the contract says absent. The contract was frozen first, so the
   implementation moved.

## Known limitations

| Limitation | Detail |
|---|---|
| **The UTC guarantee covers EF writes only** | A raw `INSERT` bypasses the value converter, so a manual insert during support work can still store a local time. Nothing in the schema prevents it. Discovered by a test that was itself wrong — see `tests.md` |
| **CI has never run** | AC-9 is unverified. The workflow is written, including the assertion that fails the job if the integration suite reports zero tests, but it needs a push |
| **AC-5 is verified manually** | The `503` path was observed by pointing the app at a dead instance and reading the status line. A test for it would need the factory to boot a second host; worth doing, not done |
| **`docker-compose.yml` was never started** | Nothing in this feature consumes it — the app uses the local instance and the suite starts its own container. Its `ACCEPT_EULA` and healthcheck are untested |
| **The explicit `Email` collation is unasserted** | Both the local instance and the container default to `CI_AS`, so a case-insensitivity test would pass with the `UseCollation` call removed. The call stays because relying on a server default is the trap ADR-013 row 3 describes, but the suite cannot currently prove it does anything |
| **`Customer` is a shell** | No factory, no invariant enforcement in code, no value objects. Feature `007` owns that specification. The database enforces the contact invariant in the meantime |

## The ownership test

Every file in this diff can be explained and changed without help. The two that would take
longest to explain are `UtcDateTimeConverter` — because the reason it exists is a type
SQL Server does not have — and `LayerDependencyTests`, because *why it reads the project
file as well as the assembly* is the whole point of it.

## Next

`002-error-contract`. Its spec exists and still describes minimal APIs in four places;
per the working agreement it gets corrected, reviewed, and approved before any code.
