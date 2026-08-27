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
      Abstractions/                  IApplicationDbContext · ICurrentUser · IRequestContext
                                     IAuditWriter · ITicketNumberGenerator
      Behaviours/                    Validation only — Transaction and Audit are in Infrastructure
      Messaging/                     ICommand · IAuditableCommand
      Exceptions/  PagedResult.cs
    Resources/                       .resx for server-authored messages
  Wasl.Infrastructure/               implements what Application declares
    Persistence/                     WaslDbContext, Configurations/, Migrations/
    Queries/                         TicketTimelineQuery · DashboardAggregatesQuery
    Persistence/Behaviours/          TransactionBehaviour · AuditBehaviour — they need a real
                                     transaction, and IApplicationDbContext exposes no EF type
    Persistence/Audit/               interceptor · accumulator · serializer · writer
    Auth/  Communications/
  Wasl.Api/                          composes everything at startup
    Controllers/  Middleware/  Localization/  Program.cs
    DependencyInjection.cs           AddPresentation() — controllers, JSON, ICurrentUser, 002
    Common/WaslPipeline.cs           THE ordered behaviour list. Validation → Transaction → Audit
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
- **`001-solution-skeleton` delivered** 2026-08-25 — four projects, `IApplicationDbContext`, UTC converter, `Customers` + `InitialCreate`, `GET /health`, CI green (17 tests)
- **`002-error-contract` core delivered** 2026-08-25 — domain exception hierarchy, the 13-row `ProblemTypes` registry, one `ProblemDetailsFactory`, `TraceContext`, `ValidationBehaviour` (33 tests). `002b` — `UseStatusCodePages`, malformed request, Swashbuckle — deferred with a reason per task
- **`003-audit-trail` core delivered** 2026-08-25 — `dbo.AuditLog`, capture-only diff interceptor, BR-9.7 redaction, `TransactionBehaviour` + `AuditBehaviour` **in `Wasl.Infrastructure`**, one ordered behaviour registration in `Wasl.Api`, NFR-10 scanner + self-test (93 tests). `003b` — `wasl_app` role, `DENY`, restricted connection, AC-12/AC-13 — deferred whole: **append-only is an application property until then**
- **`009-create-ticket` backend delivered** 2026-08-26 — `Ticket` + `TicketHistory` + `dbo.TicketNumberSeq`, `POST /api/tickets`, `GET /api/tickets/{id}`, the BR-1 map with **all 36 cells**, `IAuditableEntity` stamping in `SaveChangesAsync`, `IRequestTimestamp` (214 tests). Form is `024-frontend-create-ticket-form`
- **`012-change-ticket-status` backend delivered** 2026-08-26 — `PUT /api/tickets/{id}/status`, three distinct `409` codes, explicit optimistic concurrency **before** the transition rules (250 tests)
- **`010-ticket-list-and-detail` backend delivered** 2026-08-26 — `GET /api/tickets`, paged envelope, BR-7.2 clamping (263 tests). Filters, search and sorting to `015`; both screens to the frontend lane
- **`004-auth-and-roles` backend half delivered** 2026-08-27 — `dbo.SupportUsers` + the four FKs `009` deferred, two seeded users, `POST /api/auth/token`, real `ICurrentUser`, `ManagerOnly` + `RequireAuthenticatedUser` as the **fallback**, `UseAuthentication` before `UseRequestLocalization` (303 tests). **Open, not done:** no audit row on a `401`/`403` — a gap in BR-9.4 — and no rate limit on the token endpoint, both `004b`. Login screen and route guard belong to the frontend lane
- **The development connection string points at the compose container**, port 14330, not `.\SQLEXPRESS`. Supersedes `001` AC-10 — see `12-delivery-log.md` 2026-08-27

<!-- MANUAL ADDITIONS START -->

## Working agreement — the gates, in order

**No feature is implemented without an approved spec, and no commit happens without
permission. Both gates are per feature, every time.**

```text
1. spec        write the spec for the feature — nothing else, no code
2. questions   anything unclear or needing a change → ask. Do not assume, do not
               guess a requirement into the spec
3. review      the product owner reads the spec in full. Wait
4. approval    ask explicitly: "may I implement this spec?" and wait for yes
5. implement   build it, task by task
6. summary     write summary.md inside the same spec folder: what was built, the
               trade-offs, what deviated from the plan and why, known limitations
7. permission  ask before `git commit` and before `git push`. Every time
```

| Gate | Do not |
|---|---|
| 1 | Write code, scaffold a project, or install a package before the spec exists |
| 2 | Invent a missing requirement. It goes to **Open Questions** in `spec.md`, never into the design |
| 3–4 | Start implementing because the spec "looks approved". Approval is a yes, not an absence of objection |
| 6 | Leave the feature without a `summary.md`. An implemented feature with no summary cannot be reviewed against what it promised |
| 7 | Run `git commit`, `git push`, or `gh pr create` without being asked. Approval of one commit is not approval of the next |

Writing, editing, and `git add` need no permission. The line is at commit and push.

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


## Testing rules that were learned the hard way

Two of these came from defects that a green test run was actively hiding.

**Verification means the whole suite. `--filter` is for diagnosis, never for proof.**
Seven integration classes each passed under `--filter` and the suite died of
`System.OutOfMemoryException` — because `IClassFixture` creates a fixture per class, so seven
classes started seven SQL Server containers at once. The failures landed on unrelated
validation assertions, so it read as a feature bug rather than resource exhaustion. A filtered
run tells you about a class; it tells you nothing about the suite.

**One `ICollectionFixture` for every integration class, so one container. Which means the
tests share a database — so scope every assertion.** Filter by ticket id, customer id, or
audit action. **Never `COUNT(*)` over a whole table**: an assertion that was correct with one
container per class is wrong now, and it fails intermittently depending on which tests ran
first, which is the worst way to find out.

**Assert content, not presence.** `003` moved its diff interceptor one hook later and four
tests went red while the audit row still existed, `COUNT(*)` still returned 1, and `Changes`
came back `null` on every command. A test checking that a row exists, or that a field is
present, would have stayed green on a broken audit trail.

**A guard that has never been seen to fail has not been verified.** `001` shipped an
architecture test that was a false negative until someone broke it on purpose. Break the thing
the test protects, watch it go red, put it back — and record that in `tests.md`.

**Verify a measurement with something below it.** A `grep` over `src/` cannot see what
the framework builds inside itself — `002`'s AC-2 guard was green while three request
shapes returned the framework's envelope. Four tools have lied here: that grep, a
regex that matched the wrong table, a preview toggle that said `en` while rendering
Arabic, and a measurement block that named the wrong label. Each produced a
well-formed report about nothing. **A measurement that names the wrong thing is worse
than no measurement, because it is believed.**

## Correctness under concurrency and abuse — check these on every write

Not a general security list. Every row below is a defect that this codebase
has already had, or that the shape of a feature makes likely.

| Before you finish a write endpoint | Why |
|---|---|
| **Does a duplicate request create a duplicate row?** `POST /api/tickets` is not idempotent. The client guard is not the guarantee — the guarantee is a unique index or a rule | Two clicks, two tickets, no error. Found by the support team, not the developer |
| **Does the version check run on every path?** `PUT /status` and `/assignee` check `rowversion`. A new path that skips it loses the update silently | Last-write-wins is the default when nobody looks |
| **Is a sequence relied on for uniqueness, or the code?** `ITicketNumberGenerator` under three parallel requests | If the code allocates, it races. If the sequence does, it does not |
| **Does the DTO carry a field the client must not set?** `Id`, `TicketNumber`, `Status`, `CreatedByUserId`, `RowVersion` are server-owned | Mass assignment. The endpoint looks correct and the client controls state it should never touch |
| **Does the error distinguish "not found" from "not permitted"?** BR-4.4 forbids it for customers | The distinction is an enumeration oracle. Applies to every resource, not just customers |
| **Does anything write two tables without a transaction?** | A ticket with no history row is invisible to the timeline and nothing failed |
| **Does the database compute a value the code also computes?** | `009` shipped `DEFAULT 'Normal'` that silently overrode the caller's `Low` |
| **Is an enum stored as an int?** | A reordered enum rewrites the meaning of every existing row |
| **Is `DateTime.UtcNow` called anywhere?** `IRequestTimestamp` or `TimeProvider`, never inline | Two timestamps in one request that should be one |
| **Is `pageSize` clamped on every path?** BR-7.2 | An unclamped page size is a denial of service with one query string |
| **Is any SQL built by interpolation?** `ExecuteSqlRaw`, `FromSqlRaw` | EF1002 is an analyser rule, and the habit formed in a test moves to `015`, which builds a query from user input |

### Authentication — `004`'s backend half is built. Read this before touching it

`ICurrentUser` returns real values from the token. It returns `null` **only** for a genuinely
unauthenticated principal, which after the fallback policy can happen on exactly two endpoints:
`GET /health` and `POST /api/auth/token`.

**`RequireAuthenticatedUser` is the fallback policy.** An endpoint with no `[Authorize]` is
closed, not open — so a forgotten attribute is a `401` in a test rather than an open door. Add
`[Authorize]` anyway: `AuthorizationSurfaceTests` enumerates endpoint **metadata**, and a
fallback policy is not metadata.

Four settings in `AddWaslAuthentication` are load-bearing and every one of them fails silently
if reverted. This was **measured**, not reasoned: reverting two of them turns four tests red,
and one of the four is that `dbo.AuditLog` stops naming any actor while every request still
succeeds.

| Setting | Reverted, what breaks |
|---|---|
| `MapInboundClaims = false` | `sub` becomes a WS-Federation URI. `FindFirst("sub")` returns null, `ICurrentUser` returns null, **and every audit row's actor columns go null.** Nothing throws |
| `RoleClaimType = "role"` | Every Manager gets `403`. Asserting only the Manager's success looks identical to asserting only the Agent's refusal — so AC-7 asserts both |
| `ValidAlgorithms = [HS256]` | A token whose header says `alg: none` is accepted |
| `ClockSkew = TimeSpan.Zero` | Expired tokens keep working for five minutes, and the expiry test passes or fails depending on when it runs |

**BR-2 is still not implemented, and the distinction matters.** `004` built the identity BR-2
stands on; the rules themselves need `PUT /api/tickets/{id}/assignee`, which is `011`. Role-only
checks go on the endpoint as `[Authorize(Policy = WaslPolicies.ManagerOnly)]`; data-dependent
checks ("is this user the assignee?") go in the handler off `ICurrentUser.UserId`.

**Never fill any remaining gap with a fake actor** — a seeded "system" user, a header, a
constant claim. ADR-005 rejects it by name, and the rule still applies: `004` closed the gap by
building the identity, not by inventing one.

**Two things are open and are not to be written up as done:**

- **No audit row on a `401` or a `403`** (AC-17, AC-18). Sign-in success and failure both write
  rows because `IssueTokenCommand` is an `IAuditableCommand`; a *denial* by the authorization
  middleware writes nothing, which needs an `IAuthorizationMiddlewareResultHandler`. **This is a
  gap in BR-9.4.** `004b`.
- **No rate limit and no lockout on `POST /api/auth/token`.** One identical `401` per wrong
  input is the correct response shape and does nothing to slow a script.

The secrets have no defaults and the host refuses to start without them —
`Jwt:SigningKey` (32 bytes minimum), `Seed:ManagerPassword`, `Seed:AgentPassword`. Set them with
`dotnet user-secrets -p src/Wasl.Api`. Do not add a fallback value: a random key per restart
invalidates every token silently, and a hard-coded one is a signing key in the repository.


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
| **`TransactionBehaviour` and `AuditBehaviour` live in `Wasl.Infrastructure`**, not beside `ValidationBehaviour` | `003` `research.md` R-14, product owner 2026-08-25. Both need a real transaction; `IApplicationDbContext` exposes no EF Core type and `IDbContextTransaction` is one, so putting it there would fail the architecture test. The `IUnitOfWork` wrapper was the alternative and was turned down — the boundary keeps **no exemption** |
| **Each layer registers itself** — `AddApplication()` · `AddInfrastructure(config)` · `AddPresentation()`, three chained calls in `Program.cs`, which names no type from another layer. A layer registering its own implementations is what lets them stay `internal` | 2026-08-26. `TimeProvider` and the `WaslDbContext` health check belong to `AddInfrastructure`, not to the composition root |
| **All three behaviours are registered once, in `Wasl.Api/Common/WaslPipeline.cs`** — the **one exception** to the row above, called last from `Program.cs` | `003` `research.md` R-15. Registration order is execution order and `Program.cs` calls `AddInfrastructure` first, so per-project registration was **observed** producing `Transaction → Audit → Validation` — a `400` then writes an audit row, and nothing throws. Do not move a registration back into `AddApplication` or `AddInfrastructure` |

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
