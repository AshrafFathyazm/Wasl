# Wasl Development Guidelines

Customer Support CRM. Spec-Driven Development with GitHub Spec Kit.

Repository language is **English** — code, comments, commits, docs, artifacts.
Product language is **English + Arabic (RTL)**. Translated strings live in resource
catalogues, never in code or docs.

## Active Technologies

- C# / .NET 8 + ASP.NET Core Minimal APIs (main)
- EF Core 8 + Microsoft.EntityFrameworkCore.SqlServer (main)
- SQL Server 2022 (main)
- TypeScript + React 18 + Vite (main)
- MediatR, FluentValidation, xUnit, FluentAssertions, Testcontainers.MsSql (main)
- TanStack Query, React Hook Form + Zod, react-i18next, Vitest + React Testing Library (main)

## Project Structure

```text
src/
  Wasl.Domain/                     no EF, no HTTP, no dependencies
    Tickets/                       Ticket, TicketStatus, transition map, invariants
    Customers/                     Customer, EmailAddress, PhoneNumber
    Audit/                         AuditEntry
  Wasl.Api/
    Features/                      one folder per vertical slice
      Tickets/CreateTicket/        endpoint + handler + validator + DTOs + query
      Tickets/ChangeStatus/
      Tickets/AssignTicket/
      Tickets/ListTickets/
      Tickets/Timeline/
      Customers/CreateCustomer/
      Customers/GetCustomer/
      Me/SetLanguage/
    Common/
      Persistence/                 DbContext, configurations, migrations
      Auth/  Errors/  Localization/  Audit/   pipeline behaviours
    Program.cs
  wasl-web/                        React + TypeScript client, feature folders
tests/
  Wasl.Domain.Tests/               pure unit tests, no database, no HTTP
  Wasl.Api.IntegrationTests/       real HTTP + real SQL Server via Testcontainers
specs/                             spec-kit features: spec.md, plan.md, tasks.md
.specify/memory/constitution.md    the non-negotiable rules
```

Dependency direction: `Wasl.Api` → `Wasl.Domain`. Never the reverse. The domain
references no EF Core, ASP.NET, or MediatR types.

## Commands

```bash
# backend
dotnet build
dotnet test                                          # all tests
dotnet test tests/Wasl.Domain.Tests                  # unit only (no Docker needed)
dotnet test tests/Wasl.Api.IntegrationTests          # needs Docker running
dotnet ef migrations add <Name> -p src/Wasl.Api -s src/Wasl.Api
dotnet ef database update -p src/Wasl.Api -s src/Wasl.Api
dotnet run --project src/Wasl.Api                    # /health, /swagger

# frontend
cd src/wasl-web && npm ci && npm run dev
npm run build && npm run test && npm run lint
```

## Code Style

**C#** — nullable enabled, warnings as errors. `TimeProvider` injected, never
`DateTime.UtcNow` inline. `CancellationToken` threaded through every async path.
One slice = one folder; a slice is deletable in one go. No `IRepository` — `DbSet<T>`
is already one; use a named query object when a query is non-trivial. Exceptions for
invariant violations, mapped to `ProblemDetails` in one middleware — no hand-built
error responses, no mixing in `Result<T>`.

**TypeScript** — feature folders. Server state through TanStack Query only; no
fetching in components. Forms are React Hook Form + Zod. No hard-coded colour,
spacing, or radius — semantic design tokens only. CSS logical properties
(`margin-inline-start`), never `left`/`right`. No user-facing string in JSX — every
one comes from an i18n catalogue, present in both `en` and `ar`.

## Recent Changes

- main: repository initialized, spec-kit scaffolded, stack fixed to .NET 8 + React + SQL Server

<!-- MANUAL ADDITIONS START -->

## Working agreement

**Read `.specify/memory/constitution.md` before planning or implementing anything.**
It is the gate, not advice.

Spec-kit loop per feature, one feature in progress at a time:

```text
/speckit-specify   → specs/<feature>/spec.md    what, and what is out of scope
/speckit-clarify   → de-risk ambiguity before planning
/speckit-plan      → plan.md                    design, files, trade-offs
/speckit-tasks     → tasks.md                   ordered, individually verifiable
/speckit-analyze   → cross-artifact consistency
/speckit-implement → build task by task
```

Task IDs: `BE-<feature>-nn`, `FE-<feature>-nn`, `TEST-<feature>-nn`, `DOC-<feature>-nn`.
A task that cannot be verified on its own is too big — split it.

Never invent a requirement. A missing requirement goes to **Open Questions** in
`spec.md`, never into the code. Never write down a test result that was not observed.
A deviation from the plan is fine; an **undocumented** deviation is not.

## Domain rules that must not be re-implemented

`BR-*` identifiers below are the business rules in the SDD blueprint
(`../customer-support-crm-sdd/04-business-rules.md`). Cite them by ID in specs and tests.

**Ticket state machine (BR-1)** — one static permitted-transition map in
`Wasl.Domain`. Never duplicated in an endpoint or in React; the API returns
`allowedTransitions` with the ticket and the UI only renders what it is given.

| From ↓ / To → | New | Open | InProgress | PendingCustomer | Resolved | Closed |
|---|---|---|---|---|---|---|
| **New** | – | yes | no | no | no | yes |
| **Open** | no | – | yes | no | no | yes |
| **InProgress** | no | yes | – | yes | yes | no |
| **PendingCustomer** | no | no | yes | – | no | no |
| **Resolved** | no | no | yes | no | – | yes |
| **Closed** | no | no | no | no | no | – |

Anything not `yes` is `409 Conflict`. `Closed` is terminal — no reopen, reassign,
escalate, or comment. A same-status transition is `409`, not `200`. `InProgress`
requires an assignee. `PendingCustomer → Resolved` is not permitted directly.

- **BR-2 assignment** — a `Manager` assigns anyone; an `Agent` may only self-assign an
  unassigned ticket. Assigning a `New` ticket does not move it to `Open`.
- **BR-4 duplicate customer** — email and phone are each optional but unique when
  present, case-insensitive on email. A second create returns `409 duplicate-customer`.
- **BR-6 authorization** — enforced server-side. Role-only checks at the endpoint as
  policies; data-dependent checks ("is this user the assignee?") in the handler.
- **BR-7.2** — `pageSize` above 100 is clamped to 100; `page` is 1-based, clamped up to 1.
- **BR-8 localization** — the server localizes only the strings it authors. Never
  localized: `ProblemDetails.type`, the keys of `errors`, enum values, `TicketNumber`,
  `traceId`. `UseRequestLocalization()` goes **after** `UseAuthentication()` — the
  wrong order fails silently.
- **BR-9 audit** — every state-changing command implements `IAuditableCommand`; the
  audit row is written by a pipeline behaviour in the **same transaction** as the
  change, so it is absent when that transaction rolls back. Denials and failures write
  a row too. Nothing sensitive in `Changes`. An architecture test enforces this.

The frontend may mirror a rule for UX (disable a button that would be rejected) but is
never the authority. Every mirrored rule is also enforced server-side.

## API contract

Base `/api`, `application/json`, UTC ISO-8601 with a `Z` suffix, ids are `Guid`
strings, enums serialised as strings. `200` is never returned with an error in the body.

`201` carries `Location`. `409` covers duplicate customer, forbidden transition, stale
version, and already-escalated — each with its own `type`:
`errors/duplicate-customer`, `errors/invalid-status-transition`,
`errors/concurrency-conflict`, `errors/already-escalated`.

Every non-2xx is RFC 7807 `ProblemDetails` carrying a `traceId` that matches the server
log entry. `errors` appears only on `400`. `detail` never contains a stack trace, SQL,
an exception type name, or a connection string.

Pagination response: `{ items, page, pageSize, totalCount, totalPages }`.

Sub-resource `PUT` (`/status`, `/assignee`) instead of `PATCH` on the ticket — each is a
distinct business action with its own rules and its own history row.

## SQL Server specifics

SQL Server replaces the blueprint's PostgreSQL (ADR-001, open question Q-3, resolved by
the product owner). Four provider-coupled points — get these right or the rules break
quietly:

| Concern | Implementation |
|---|---|
| Concurrency token (ADR-006) | `rowversion` column + `.IsRowVersion()`. **Not** `xmin`, **not** a manual `int Version`. `expectedVersion` on the wire is the base64 rowversion |
| Partial unique index (BR-4) | Filtered index: `.HasIndex(x => x.Email).IsUnique().HasFilter("[Email] IS NOT NULL")` |
| Case-insensitive email uniqueness | Explicit CI collation on the column via `.UseCollation(...)` — do not rely on the server default |
| Integration tests | `Testcontainers.MsSql`, a real engine per run. Never EF `InMemory` — it does not enforce constraints |
| Arabic text | `nvarchar` (the EF default for `string` on SQL Server). Never `varchar` |

## Definition of Done

A feature is Done when all of these hold **and** the artifact evidencing each exists:

- Scope, out-of-scope, assumptions, edge cases, and referenced `BR-*` IDs written down
- Business rules in the domain, not in an endpoint or a component
- Input validated at the boundary; invariants enforced in the domain
- Errors through the shared middleware, status codes matching the table above
- Migration created, applied, and verified on a clean database; every new index
  justified by a named query
- UI on the real API — loading, error, empty, and validation states all handled
- Every state-changing operation writes an audit row, in the same transaction
- Every new i18n key exists in both `en` and `ar`; every touched screen viewed in
  Arabic and rendering RTL correctly
- Unit tests for the business rules, integration tests for the happy path and the main
  failure path, every acceptance criterion mapped to a named test
- Test commands and their real output recorded — never asserted from memory
- Anything knowingly untested listed with a reason
- AI usage recorded: what was accepted, what was modified, what was rejected, and how
  each accepted output was verified

**The ownership test, independent of the list:** can this change be explained and
modified without help? If not, it is not Done, regardless of whether tests pass.

## Assumptions to confirm

- **Vertical slices (ADR-010) assumed accepted** over four-project Clean Architecture
  (ADR-002). Reason: almost no coupling between features, and the diff for a story
  lands in one folder. If the house convention is strict four-project Clean, say so —
  the structure above becomes `Wasl.Domain / Application / Infrastructure / Api`.
- The SDD blueprint lives outside this repo at `../customer-support-crm-sdd/`. Confirm
  before relying on it in CI or docs; it may need to be vendored into `docs/sdd/`.
- Auth is JWT with seeded users (ADR-005). Two roles only: `Agent` and `Manager`.
- Out of scope: real WhatsApp/SMS/email delivery, attachments, an automatic SLA engine,
  analytics, a customer portal, reopening a closed ticket, multi-tenancy, translation of
  user-entered content, and locales beyond `en` and `ar`.

<!-- MANUAL ADDITIONS END -->
