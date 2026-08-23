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
reverse later: the project layout (ADR-010), the database provider and its type
mapping (ADR-013), whether warnings are errors, and whether CI exists at all. All four
cost one file now and a sweep across every commit later.

## In scope

- Solution file and two projects — `Wasl.Domain`, `Wasl.Api` — per ADR-010
- `Directory.Build.props`: .NET 10, nullable enabled, warnings as errors, one language
  version for every project
- `docker compose` with SQL Server 2022, and a documented `LocalDB` fallback
- `WaslDbContext`, the `Customers` table, and the initial migration
- A global UTC value converter for every `DateTime` (ADR-013)
- `TimeProvider` registered in DI, so no code calls `DateTime.UtcNow` (NFR)
- `GET /health` — liveness plus a database readiness probe
- Two test projects: `Wasl.Domain.Tests` and `Wasl.Api.IntegrationTests`, the latter
  wired to `Testcontainers.MsSql`
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
| A-1 | Docker Desktop is available on the machine that runs the integration suite | Unit tests still run. The integration suite falls back to LocalDB, documented in `docs/sdd/documentation/development/setup.md`, and the fallback is recorded in `tests.md` rather than left implied |
| A-2 | The CI runner can run Linux containers | Integration tests are skipped in CI with an explicit skip reason, never silently. AC-9 fails if they are skipped without one |
| A-3 | .NET 10 SDK is installed. The house platform targets `net8.0`; this diverges | See `research.md` R-3. Reverting is a one-line change in `Directory.Build.props` before any code depends on a .NET 10 API |
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
| AC-2 | `docker compose up -d db` starts SQL Server 2022 and the container reaches a healthy state without manual intervention |
| AC-3 | `dotnet ef database update` applies the initial migration to an **empty** database and is idempotent on a second run |
| AC-4 | `GET /health` returns `200` with no authentication and a body naming each check and its status |
| AC-5 | `GET /health` returns `503` when the database is unreachable, and the body says which check failed. It does not return `200` with a failure inside it |
| AC-6 | An integration test boots the API through `WebApplicationFactory` against a `Testcontainers.MsSql` instance, applies migrations, and asserts AC-4 |
| AC-7 | An architecture test fails if `Wasl.Domain` gains a reference to EF Core, ASP.NET Core, MediatR, or any third-party package |
| AC-8 | Every `DateTime` round-tripped through the database comes back with `DateTimeKind.Utc`, asserted by an integration test that writes and re-reads a row |
| AC-9 | CI runs build, unit tests, and integration tests on every push. A skipped test suite fails the job unless it carries an explicit skip reason |
| AC-10 | No connection string, password, or key appears in a committed file. `appsettings.json` carries a placeholder; the real value comes from user secrets or an environment variable |
| AC-11 | `Directory.Build.props` sets `Nullable=enable` and `TreatWarningsAsErrors=true` for every project, including the test projects |
| AC-12 | The `Customers` table exists with `nvarchar` text columns, `datetime2(3)` timestamps, a `rowversion` column, and the contact check constraint — verified by querying `INFORMATION_SCHEMA` and `sys.check_constraints`, not by reading the migration |

## Edge cases

| Case | Expected |
|---|---|
| `dotnet ef database update` run twice | Second run applies nothing and exits 0 |
| Migration run against a database that already has an unrelated table | Applies cleanly; the migration touches only its own objects |
| `/health` called while the database is starting but not accepting connections | `503`, with the database check named as failing — not a hang and not a 500 |
| Container port already in use | `docker compose` fails with a readable message; the port is documented in `quickstart.md` so it can be changed |
| Integration test run with no Docker daemon | The suite fails fast with a message naming Docker, rather than timing out |
| A `DateTime` with `Kind = Local` passed to a handler | The converter normalises to UTC on write. A test asserts this rather than trusting it |
| Arabic text written to `Customers.FullName` | Round-trips intact. `varchar` would return `????`, and this is the test that would catch it (ADR-013 row 4) |

## Rules referenced

- **NFR-7** — the system runs locally from a clean clone in documented steps
- **NFR-1** — maintainability over cleverness
- **BR-4.1** — the contact invariant, enforced here as the check constraint only; its
  domain-level enforcement and its friendly message belong to `007`
- **ADR-010** — two projects, vertical slices, thin domain core
- **ADR-013** — SQL Server, and the four provider-coupled points
- **ADR-002** — one deployable, one database, no broker

## Why this is not one big "setup" task

Each acceptance criterion above is something that can fail on its own, and several
fail *silently* if nobody looks: a filtered index created without its filter, a
`DateTime` stored as local time, a warning nobody reads, an integration suite skipped
in CI. AC-5, AC-7, AC-8, and AC-9 exist because those four failures all look like
success until much later.
