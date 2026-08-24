# Wasl Development Guidelines

Customer Support CRM. Spec-Driven Development with GitHub Spec Kit.

Repository language is **English** — code, comments, commits, docs, artifacts.
Product language is **English + Arabic (RTL)**. Translated strings live in resource
catalogues, never in code or docs.

**Before planning or implementing anything, read
[.specify/memory/constitution.md](.specify/memory/constitution.md) and the feature's own
`spec.md`.** The blueprint they draw on is [docs/sdd/](docs/sdd/) — `FR-*`, `BR-*`,
`NFR-*`, `US-*`, and `ADR-*` identifiers all resolve there.

## Active Technologies

- C# / .NET 10 + ASP.NET Core Web API, controllers (main)
- MediatR pipeline behaviours: validation, transaction, audit (main)
- EF Core + Microsoft.EntityFrameworkCore.SqlServer (main)
- SQL Server 2022 (main)
- TypeScript + React 18 + Vite (main)
- FluentValidation, xUnit, FluentAssertions, Moq, Testcontainers.MsSql (main)
- TanStack Query, React Hook Form + Zod, React Router, react-i18next, Vitest + React Testing Library (main)

## Project Structure

```text
docs/sdd/                            the blueprint: FR/BR/NFR/US/ADR, design, testing
specs/NNN-feature/                   one folder per feature — see specs/README.md
src/
  Wasl.Domain/                       no EF, no HTTP, no MediatR, no packages at all
    Customers/                       Customer, EmailAddress, PhoneNumber
    Tickets/                         Ticket, TicketStatus, TicketStatusTransitions
    Communications/                  Interaction, CommunicationChannel
    Audit/                           AuditEntry
  Wasl.Application/                  depends only on Wasl.Domain
    Features/                        one folder per USE CASE, not per technical type
      Customers/CreateCustomer/      Command · Handler · Validator · Dto
      Tickets/ChangeStatus/
      ...
    Common/
      Abstractions/                  IApplicationDbContext · ICurrentUser · ITicketNumberGenerator
      Behaviours/                    Validation · Transaction · Audit
      Exceptions/  PagedResult.cs
    Resources/                       .resx for server-authored messages
  Wasl.Infrastructure/               implements what Application declares
    Persistence/                     WaslDbContext, Configurations/, Migrations/
    Queries/                         TicketTimelineQuery · DashboardAggregatesQuery
    Auth/  Communications/
  Wasl.Api/                          composes everything at startup
    Controllers/  Middleware/  Localization/  Program.cs
  wasl-web/                          React + TypeScript, feature folders
tests/
  Wasl.Domain.Tests/                 pure unit tests, no database, no HTTP
  Wasl.Application.Tests/            use cases with faked infrastructure
  Wasl.Api.IntegrationTests/         real HTTP + real SQL Server via Testcontainers
```

Dependency direction: `Wasl.Api` and `Wasl.Infrastructure` → `Wasl.Application` →
`Wasl.Domain`. Never the reverse.

`Wasl.Domain` has **zero package references**, and `Wasl.Application` must not be able to
see EF Core or ASP.NET Core — it declares interfaces, Infrastructure implements them. An
architecture test fails the build on either, because those two boundaries are the whole
return on four projects.

## Commands

```bash
# backend
dotnet build                                         # warnings are errors
dotnet test                                          # all tests
dotnet test tests/Wasl.Domain.Tests                  # unit only (no Docker needed)
dotnet test tests/Wasl.Api.IntegrationTests          # needs Docker running
dotnet ef migrations add <Name> -p src/Wasl.Infrastructure -s src/Wasl.Api
dotnet ef database update -p src/Wasl.Infrastructure -s src/Wasl.Api
dotnet run --project src/Wasl.Api                    # /health, /swagger
docker compose up -d db                              # SQL Server 2022

# frontend
cd src/wasl-web && npm ci && npm run dev
npm run build && npm run test && npm run lint
```

Full run-from-clean-clone script: [specs/001-solution-skeleton/quickstart.md](specs/001-solution-skeleton/quickstart.md).

## Code Style

**C#** — nullable enabled, warnings as errors, set once in `Directory.Build.props`.
`TimeProvider` injected, never `DateTime.UtcNow` inline. `CancellationToken` threaded
through every async path. One use case = one folder under `Application/Features/`.

**No `IRepository<T>` and no per-aggregate repository** — reach EF Core through
`IApplicationDbContext`, declared in `Application/Common/Abstractions` and implemented by
`Infrastructure/Persistence/WaslDbContext`. `DbSet<T>` is already a repository; the
interface exists to keep EF Core out of the Application layer, not to re-implement it.
Query it with LINQ at the call site. A named query class only where a query is genuinely
non-trivial, in `Infrastructure/Queries/` — two exist (`TicketTimelineQuery`,
`DashboardAggregatesQuery`) and a third needs a written reason.

Controllers bind, authorise, dispatch, and map. Domain exceptions for invariant
violations, mapped to `ProblemDetails` in one middleware — no hand-built error responses,
no mixing in `Result<T>`.

**TypeScript** — feature folders, no barrel files. Server state through TanStack Query
only; fetching happens at the route level, never in a child component. Forms are React
Hook Form + Zod, one schema driving both types and validation. No global store — filters
and pagination live in the URL. No hard-coded colour, spacing, or radius: semantic
design tokens only. CSS logical properties (`margin-inline-start`), never `left`/`right`.
No user-facing string in JSX — every one comes from a catalogue present in both `en`
and `ar`.

## Recent Changes

- main: repository initialized; spec-kit scaffolded; blueprint vendored to `docs/sdd/` and converted to SQL Server; **ADR-010 rejected — four-project Clean stands (ADR-002)**; the product scope document traced in `docs/sdd/15-scope-coverage.md`; nine-hour plan in `docs/sdd/16-three-day-plan.md`

<!-- MANUAL ADDITIONS START -->

## Working agreement

One feature in progress at a time. The plan — phases, feature numbering, task IDs, and
who builds what — is [specs/README.md](specs/README.md).

```text
/speckit-specify   → spec.md            what, and what is out of scope
/speckit-clarify   → ambiguity removed before any design
/speckit-plan      → plan.md · data-model.md · research.md
                     contracts/*-api.md ← FROZEN. both lanes read it
                     FRONTEND-API-GUIDE.md · frontend-spec.md
/speckit-tasks     → tasks.md           ordered, verifiable, one owner each
/speckit-analyze   → cross-artifact consistency
/speckit-implement → build, task by task
verify-story       → tests.md + ai-notes.md + the Definition of Done gate
```

Task IDs: `BE-007-03`, `FE-007-02`, `TEST-007-08`, `DOC-007-01`, `REV-007-01` — the
number is the feature folder's number. Every task row carries **Agent** and **Skill**;
a task with neither is a task nobody owns. Agents are named in `tasks.md` before they
are dispatched, and whatever they return is recorded in `ai-notes.md`.

Never invent a requirement. A missing one goes to **Open Questions** in `spec.md`, never
into the code. Never write down a test result that was not observed. A deviation from the
plan is fine; an **undocumented** deviation is not.

## The contract between backend and frontend

The frontend does not wait for the backend, and it does not guess either.

```text
spec.md                    one set of acceptance criteria
   ↓
contracts/<name>-api.md    FROZEN before either lane starts
   ↓                  ↓
BE implements it     FE reads FRONTEND-API-GUIDE.md and starts
   ↓                  ↓
generated OpenAPI  →  compared against the contract before the feature closes
                      a difference is a defect in one of the two, never fixed silently
```

Hand-written client types are marked **provisional** in the file that declares them and
replaced with types generated from OpenAPI once the endpoint is real. A contract change
mid-flight goes under **Contract changes** in `plan.md` and both lanes are told.

## Domain rules that must not be re-implemented

`BR-*` are in [docs/sdd/04-business-rules.md](docs/sdd/04-business-rules.md). Cite them
by ID in specs and tests.

**Ticket state machine (BR-1)** — one static permitted-transition map in `Wasl.Domain`.
Never duplicated in an endpoint or in React; the API returns `allowedTransitions` with
the ticket and the UI renders only what it was given.

| From ↓ / To → | New | Open | InProgress | PendingCustomer | Resolved | Closed |
|---|---|---|---|---|---|---|
| **New** | – | yes | no | no | no | yes |
| **Open** | no | – | yes | no | no | yes |
| **InProgress** | no | yes | – | yes | yes | no |
| **PendingCustomer** | no | no | yes | – | no | no |
| **Resolved** | no | no | yes | no | – | yes |
| **Closed** | no | no | no | no | no | – |

Anything not `yes` is `409 Conflict`. `Closed` is terminal — no reopen, reassign,
escalate, or comment. A same-status transition is `409`, not `200`. `InProgress` requires
an assignee. `PendingCustomer → Resolved` is not permitted directly.

- **BR-2 assignment** — a `Manager` assigns anyone; an `Agent` may only self-assign an
  unassigned ticket. Assigning a `New` ticket does not move it to `Open`.
- **BR-4 duplicate customer** — email and phone each optional but unique when present,
  case-insensitive on email. A second create returns `409 duplicate-customer` naming the
  field and **nothing else** — no id, no name.
- **BR-6 authorization** — server-side. Role-only checks as endpoint policies;
  data-dependent checks ("is this user the assignee?") in the handler.
- **BR-7.2** — `pageSize` above 100 clamps to 100; `page` is 1-based, clamps up to 1.
- **BR-8 localization** — the server localizes only strings it authors. Never localized:
  `ProblemDetails.type`, the keys of `errors`, enum values, `TicketNumber`, `traceId`.
  `UseRequestLocalization()` goes **after** `UseAuthentication()` — the wrong order
  fails silently and ADR-007 calls it the most likely defect in the build.
- **BR-9 audit** — every state-changing command implements `IAuditableCommand`; a
  pipeline behaviour writes the row in the **same transaction** as the change, so it is
  absent when that transaction rolls back. Denials and failures write a row too, outside
  any transaction. Nothing sensitive in `Changes`. An architecture test enforces it.

The frontend may mirror a rule for UX (disable a button that would be rejected) but is
never the authority. Every mirrored rule is enforced server-side.

## API contract

Base `/api`, `application/json`, UTC ISO-8601 with `Z`, ids are `Guid` strings, enums as
strings. **`200` is never returned with an error in the body.**

`201` carries `Location`. `409` covers duplicate customer, forbidden transition, stale
version, and already-escalated — each with its own `type`:
`errors/duplicate-customer`, `errors/invalid-status-transition`,
`errors/concurrency-conflict`, `errors/already-escalated`.

Every non-2xx is RFC 7807 `ProblemDetails` with a `traceId` matching the server log.
`errors` appears only on `400` and `409`. `detail` never contains a stack trace, SQL, an
exception type name, or a connection string.

Pagination response: `{ items, page, pageSize, totalCount, totalPages }`.

Sub-resource `PUT` (`/status`, `/assignee`) instead of `PATCH` on the ticket — each is a
distinct business action with its own rules and its own history row.

`/health` is the exception: outside `/api`, unauthenticated, and it returns the health
report shape rather than `ProblemDetails`.

## SQL Server specifics — ADR-013

Four provider-coupled points. Each fails **quietly** if done wrong:

| Concern | Implementation |
|---|---|
| Concurrency token | `rowversion` + `.IsRowVersion()`. **Not** `xmin`, **not** a manual `int`. `expectedVersion` on the wire is the base64 rowversion |
| Duplicate rule (BR-4) | Filtered unique index: `.HasFilter("[Email] IS NOT NULL AND [IsActive] = 1")`. Verify `filter_definition` comes back **non-null** from `sys.indexes` — an unfiltered index rejects the second customer with no email |
| Case-insensitive email | Explicit CI collation on the column. SQL Server cannot build a filtered index on `LOWER(Email)`, so the expression form does not exist here |
| Arabic text | `nvarchar` (the EF default for `string`). Never `varchar` — it returns `????` and looks like a font bug |
| Timestamps | `datetime2(3)` + a global UTC value converter. SQL Server has no `timestamptz` |
| Integration tests | `Testcontainers.MsSql`, a real engine per run. Never EF `InMemory` — it enforces no constraints |

## Definition of Done

Full list: [docs/sdd/09-definition-of-done.md](docs/sdd/09-definition-of-done.md). The
five that get skipped:

- Every AC maps to a named test, and the run output is **recorded** — never asserted
  from memory
- Every state-changing operation writes an audit row, in the same transaction
- Every new i18n key exists in `en` and `ar`; every touched screen viewed in Arabic and
  rendering RTL correctly
- The generated OpenAPI matches `contracts/`
- Every accepted AI output was **run**, not just read

**The ownership test, independent of the list:** can this change be explained and
modified without help? If not, it is not Done, regardless of whether tests pass.

## Decisions already made — do not relitigate

| Decision | Where |
|---|---|
| **Four-project Clean** — `Domain` · `Application` · `Infrastructure` · `Api`, with feature folders inside Application | ADR-002. ADR-010 proposed vertical slices, was evaluated, and was **rejected**: house convention, separation of concerns that is visible without explanation, and the developer is fastest in a familiar structure |
| MediatR stays — it is what makes validation, audit, and the transaction boundary structural rather than remembered | ADR-008, ADR-002 |
| SQL Server, not PostgreSQL | ADR-013 (supersedes ADR-001, resolves Q-3) |
| `ProblemDetails`, not the house `{ IsSuccess, Data, Errors }` envelope | The assessment counts `200`-with-an-error against you |
| **.NET 10** — confirmed by the product owner 2026-08-23, while the house platform targets `net8.0` | `specs/001-solution-skeleton/research.md` R-3 — current LTS, one line to revert. `global.json` pins the SDK band because a preview `10.0.400` is also installed and would otherwise win |
| React, not Angular | ADR-003 (Q-4, Q-12 closed) |
| No global state store | ADR-011 §1 |
| `ICommunicationProvider` + one Mock **is** built | `docs/sdd/08-board.md`, feature `021`. Channels is a named module in the requirement |
| Attachments are **out of scope**, stated explicitly in the affected `spec.md` | `docs/sdd/00-project-context.md` |
| Theming: token architecture in `006`, settings screen deferred | ADR-012, accepted in part |

## Still open — and they are for the evaluator, not for us

| # | Question |
|---|---|
| Q-1 | What does the Productivity criterion measure? The sheet's description is blank |
| Q-2 | The Quality gate is stated as 24/40 while that axis's weights sum to 20 |
| Q-5, Q-6 | Session length; live or recorded demo |
| Q-8 | Who writes and reviews the Arabic copy |
| Q-11 | How far the house design assets may be reused |
| Q-15 | The Arabic typeface — it may never have been chosen |

Asking a specific question raises the Requirement & Specification score. Guessing
silently lowers it. All of them are in
[docs/sdd/11-open-questions.md](docs/sdd/11-open-questions.md) with a working assumption.

<!-- MANUAL ADDITIONS END -->
