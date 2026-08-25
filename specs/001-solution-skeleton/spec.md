# 001 — Solution Skeleton

**Phase:** 0 · Foundation · **Story:** — (infrastructure, not a user story) ·
**Status:** Specified, awaiting review

## Understanding

Nothing in this system can be verified before it can be built and run. This feature
produces a repository that a reviewer clones, starts in two commands, and sees respond.

It is deliberately the smallest thing that can be true end to end: a solution that
builds, a database that starts, a migration that applies, an endpoint that answers, a
test that proves it, and a pipeline that runs on every push. No business rule, no
authentication, no error contract — each of those is its own feature, and each is
cheaper to add once there is one place to add it to.

The reason it is not "just setup" is that four of its decisions are expensive to
reverse later: the project layout (ADR-002), the database provider and its type
mapping (ADR-013), whether warnings are errors, and whether CI exists at all. All four
cost one file now and a sweep across every commit later.

## In scope

- Solution file and four projects — `Wasl.Domain`, `Wasl.Application`, `Wasl.Infrastructure`,
  `Wasl.Api` — plus three test projects, per ADR-002. The reference direction is the task,
  not the project count: `Wasl.Application` must not be able to see EF Core
- `Directory.Build.props`: .NET 10, nullable enabled, warnings as errors, one language
  version for every project
- `global.json` pinning the SDK, so the build does not depend on which of the four
  installed SDKs a given machine happens to resolve (`research.md` R-3)
- A connection to the **local SQL Server 2022 Express instance** over Windows auth for the
  development loop, plus `docker compose` with SQL Server 2022 for the integration suite
  and CI, and `LocalDB` documented as the second fallback
- `WaslDbContext`, the `Customers` table, and the initial migration
- A global UTC value converter for every `DateTime` (ADR-013)
- `TimeProvider` registered in DI, so no code calls `DateTime.UtcNow` (NFR)
- `GET /health` — liveness plus a database readiness probe
- Three test projects: `Wasl.Domain.Tests`, `Wasl.Application.Tests`, and
  `Wasl.Api.IntegrationTests`, the last wired to `Testcontainers.MsSql`
- An architecture test asserting `Wasl.Domain` references nothing but the BCL
- CI: build, unit tests, and integration tests on every push, failing on any warning

## Out of scope

| Excluded | Where it lives |
|---|---|
| `ProblemDetails` middleware and the error contract | `002-error-contract` |
| The audit table and its pipeline behaviour | `003-audit-trail` |
| JWT, seeded users, authorization policies | `004-auth-and-roles` |
| Localization, culture resolution, `.resx` | `005-localization-core` |
| The React application, tokens, primitives | `006-design-system` |
| Value objects, the contact invariant, the duplicate rule and its filtered indexes | `007-create-customer` |
| Any endpoint other than `/health` | The feature that owns it |
| Seed data | `docs/sdd/PHASES.md` step 7.2, before delivery |
| Deployment, hosting, container image for the API | No requirement. NFR-7 asks that it runs locally from a clean clone, and that is what this delivers |

The `Customers` table is created here at its **column** shape — including
`RowVersion` and the contact check constraint — because a migration that creates one
column proves nothing about the type mapping in ADR-013. Its **filtered unique
indexes** belong to `007`, because they are the duplicate rule (BR-4.8) rather than
schema mechanics, and they need to be tested alongside the behaviour they enforce.

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | Docker is available on the machine that runs the integration suite | **Unreliable here** — the daemon restarted mid-pull and the image download failed with `unexpected EOF` (`research.md` R-8). The **development loop no longer depends on it**: it uses the local `.\SQLEXPRESS` instance. Only the integration suite does, and if Docker is down that suite is recorded in `tests.md` as **not run, with the reason** — never as a pass |
| ~~A-2~~ | **Not an assumption — a decision.** The CI runner is `ubuntu-latest`, which ships with Docker, so Testcontainers works with no setup. The only runner that cannot host Linux containers is a Windows one, and we are not choosing that | Nothing. If the runner cannot start a container, the **job fails**. See AC-9 — there is no skip path in CI |
| A-3 | ~~.NET 10 SDK is installed~~ — **verified**: `10.0.200` is present (`research.md` R-3). The framework choice is no longer an assumption either; the product owner confirmed .NET 10 on 2026-08-23 | The remaining risk is not *whether* an SDK is installed but *which one resolves*, since a preview `10.0.400` is also present and is the highest version. `global.json` removes it — AC-13 |
| A-4 | `Guid` keys are generated client-side, so an entity has its id before `SaveChanges` | Sequential-GUID index fragmentation is a real concern at volume and not at this one. Recorded in `research.md` R-5 |

## Open questions

| # | Question | Working assumption |
|---|---|---|
| Q-A | Should `/health` report the database, or only that the process is alive? | Both, on one endpoint, with the database as a *readiness* check. A liveness-only endpoint returns 200 while every request fails, which is the least useful possible answer during an incident |
| Q-B | Does the reviewer run this, or read it? | Assume they run it. AC-1 through AC-4 are written as things a stranger does from a clean clone, and `quickstart.md` is the script for it |

## Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | From a clean clone, `dotnet build` succeeds with **zero warnings**. Warnings are errors, so a warning fails the build rather than being reported |
| AC-2 | The application connects to the local `.\SQLEXPRESS` instance over Windows auth, with **no password anywhere** in configuration or source. `docker compose up -d db` also starts SQL Server 2022 for the integration suite and reaches a healthy state without manual intervention |
| AC-3 | `dotnet ef database update` applies the initial migration to an **empty** database and is idempotent on a second run |
| AC-4 | `GET /health` returns `200` with no authentication and a body naming each check and its status |
| AC-5 | `GET /health` returns `503` when the database is unreachable, and the body says which check failed. It does not return `200` with a failure inside it |
| AC-6 | An integration test boots the API through `WebApplicationFactory` against a `Testcontainers.MsSql` instance, applies migrations, and asserts AC-4 |
| AC-7 | An architecture test fails if `Wasl.Domain` gains a reference to EF Core, ASP.NET Core, MediatR, or any third-party package |
| AC-8 | Every `DateTime` round-tripped through the database comes back with `DateTimeKind.Utc`, asserted by an integration test that writes and re-reads a row |
| AC-9 | CI runs build, unit tests, **and integration tests** on every push, on `ubuntu-latest`. **The integration suite has no skip path: if it does not run, the job fails.** An individual test may be skipped with a written reason; the suite may not. A green run with the suite absent is the failure this criterion exists to prevent |
| AC-9b | Running locally without Docker is a valid state, and a different one: the integration suite is **not run**, and `tests.md` records it as not run **with the reason**. Never as a pass, and never as a green CI |
| AC-10 | No connection string, password, or key appears in a committed file. The development loop uses Windows auth, so **there is no password to leak**; the only credential in the repository is the throwaway `sa` password in `docker-compose.yml`, which exists for a test container and is documented as such |
| AC-11 | `Directory.Build.props` sets `Nullable=enable` and `TreatWarningsAsErrors=true` for every project, including the test projects |
| AC-12 | The `Customers` table exists with `nvarchar` text columns, `datetime2(3)` timestamps, a `rowversion` column, and the contact check constraint — verified by querying `INFORMATION_SCHEMA` and `sys.check_constraints`, not by reading the migration |
| AC-13 | `global.json` pins the SDK to the `10.0.2xx` band. `dotnet --version` inside the repository reports `10.0.200`, not the installed `10.0.400-preview`, so the build is reproducible on a machine with a different SDK set |

## Edge cases

| Case | Expected |
|---|---|
| `dotnet ef database update` run twice | Second run applies nothing and exits 0 |
| Migration run against a database that already has an unrelated table | Applies cleanly; the migration touches only its own objects |
| `/health` called while the database is starting but not accepting connections | `503`, with the database check named as failing — not a hang and not a 500 |
| Container port already in use | `docker compose` fails with a readable message; the port is documented in `quickstart.md` so it can be changed |
| Integration test run with no Docker daemon, **locally** | The suite fails fast with a message naming Docker, rather than timing out. `tests.md` records it as not run, with the reason |
| Integration test run with no Docker daemon, **in CI** | The job fails. There is no skip path, and a green run with the suite absent is exactly what AC-9 forbids |
| A `DateTime` with `Kind = Local` passed to a handler | The converter normalises to UTC on write. A test asserts this rather than trusting it |
| Arabic text written to `Customers.FullName` | Round-trips intact. `varchar` would return `????`, and this is the test that would catch it (ADR-013 row 4) |

## Rules referenced

- **NFR-7** — the system runs locally from a clean clone in documented steps
- **NFR-1** — maintainability over cleverness
- **BR-4.1** — the contact invariant, enforced here as the check constraint only; its
  domain-level enforcement and its friendly message belong to `007`
- **ADR-002** — four-project Clean Architecture, with feature folders inside the
  Application layer. ADR-010 proposed vertical slices and was **rejected**
- **ADR-013** — SQL Server, and the four provider-coupled points
- **ADR-002** — one deployable, one database, no broker

## Why this is not one big "setup" task

Each acceptance criterion above is something that can fail on its own, and several
fail *silently* if nobody looks: a filtered index created without its filter, a
`DateTime` stored as local time, a warning nobody reads, an integration suite skipped
in CI. AC-5, AC-7, AC-8, and AC-9 exist because those four failures all look like
success until much later.
