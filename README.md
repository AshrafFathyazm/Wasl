# Wasl

A customer support CRM, built spec-first. Every feature has a written specification, an
acceptance-criteria list, recorded test output, and a summary saying what was built and what was
not.

**.NET 10 · ASP.NET Core · EF Core · SQL Server 2022 · React 18 + TypeScript**

---

## Setup

### What you need

| | |
|---|---|
| .NET SDK | `10.0.2xx` — pinned in `global.json`. `dotnet --version` must report `10.0.2*` |
| SQL Server | 2022, or Express. A local instance is enough |
| Docker | **Only for the integration tests.** The app itself never needs it |
| Node | 20+, only for the frontend |

### Point it at a database

`src/Wasl.Api/appsettings.Development.json` holds the connection string:

```json
"ConnectionStrings": {
  "Wasl": "Server=.\\SQLEXPRESS;Database=Wasl;Trusted_Connection=True;TrustServerCertificate=True;MultipleActiveResultSets=True"
}
```

Change `Server=` if your instance is named differently. Windows auth, no password in any file.

### Create the schema and seed a demo

```bash
dotnet run --project src/Wasl.Api -- --seed
```

One command. It applies every migration and writes **three customers and five tickets in five
different statuses** — `New`, `Open`, `InProgress`, `PendingCustomer`, `Resolved`. Two of the
customers and one ticket are in Arabic, so RTL and `nvarchar` are exercised by the demo rather
than by a claim.

Running it twice is a no-op. It exits without serving, so "did the seed work" and "is the app up"
stay two separate questions.

The tickets are created through the **real domain** — `Ticket.Create`, the BR-1 state machine, the
number sequence, the history rows. A status the state machine forbids makes the seed fail rather
than writing a ticket the product could not produce.

### Run it

```bash
dotnet run --project src/Wasl.Api
```

Then, on the port it prints:

```bash
curl http://localhost:5272/health
curl 'http://localhost:5272/api/tickets?pageSize=20'
```

### Run the tests

```bash
dotnet test                                    # everything — 263 tests
dotnet test tests/Wasl.Domain.Tests            # no database, no Docker
dotnet test tests/Wasl.Api.IntegrationTests    # needs Docker running
```

Warnings are errors. The integration suite starts one real SQL Server container — never EF
`InMemory`, which enforces no constraint this codebase relies on.

**Verify with the whole suite.** `--filter` is for diagnosis: seven test classes each passed
alone while the suite died of `OutOfMemoryException`, because a per-class fixture started seven
containers. A green filtered run says nothing about the suite.

---

## The API

Base `/api`. JSON, UTC ISO-8601 with `Z`, ids are GUID strings, enums are **strings** in both
directions. Every non-2xx is RFC 7807 `ProblemDetails` with a `traceId` that matches the server
log. `200` is never returned with an error in the body.

| | |
|---|---|
| `GET /health` | Liveness and a database check. Outside `/api`, and the one documented exception to the envelope |
| `POST /api/tickets` | `201` with `Location`. Draws a ticket number from a SQL sequence, writes the first history row in the same transaction |
| `GET /api/tickets?page=&pageSize=` | Paged, newest first. `pageSize` defaults to 20 and clamps at 100; `page` clamps up to 1 |
| `GET /api/tickets/{id}` | The same resource shape the create returns |
| `PUT /api/tickets/{id}/status` | The BR-1 state machine, with optimistic concurrency on `expectedVersion` |

### Three things worth looking at

**`allowedTransitions` comes from the server.** Every ticket read and every status write returns
the transitions permitted *right now*, computed from one map in the domain and its preconditions.
The client renders what it was given and never holds a copy of the rule. An `Open` ticket with no
assignee returns `["Closed"]` — not `InProgress`, because BR-1 requires an assignee before work
can start, and offering it would render a button whose only outcome is a `409`.

**A status change can be refused four different ways, each with its own error type.**
`errors/ticket-closed`, `errors/same-status-transition`, `errors/invalid-status-transition`,
`errors/assignee-required`. One code would have compiled. Four exist because the client's correct
reaction differs for each — refetch quietly, offer Assign, offer a different transition — and it
cannot tell them apart by parsing an English sentence.

**Every state change writes an audit row in the same transaction as the change.** A rollback takes
the row with it. A *denial* or a *failure* writes its row on a second connection, so it survives
the rollback of the thing that failed — which is the half that is invisible when it is wrong.

---

## Layout

```text
docs/sdd/            the blueprint — FR/BR/NFR/US/ADR, design, testing strategy
specs/NNN-feature/   one folder per feature: spec, plan, contract, tasks, tests, summary
src/
  Wasl.Domain/       entities and rules. Zero package references, enforced by a test
  Wasl.Application/  use cases, one folder each. Cannot see EF Core or ASP.NET Core
  Wasl.Infrastructure/  EF Core, the audit and transaction behaviours, the number sequence
  Wasl.Api/          controllers, the error contract, the ordered pipeline registration
  wasl-web/          React + TypeScript
tests/               domain · application · integration against a real SQL Server
```

Dependency direction is `Api`/`Infrastructure` → `Application` → `Domain`, and an architecture
test fails the build if `Domain` gains a package or `Application` gains EF Core. Those two
boundaries are the whole return on four projects, so they are checked rather than trusted.

---

## What is built

| Feature | State |
|---|---|
| `001` solution skeleton, `/health`, CI | Done — CI green on `ubuntu-latest` |
| `002` error contract — one `ProblemDetails` producer, 13-row type registry, validation behaviour | **Core done.** `002b` deferred, see below |
| `003` audit trail — `dbo.AuditLog`, capture-only diff, redaction, transaction + audit behaviours, NFR-10 scanner | **Core done.** `003b` deferred |
| `009` create ticket — entity, history, sequence, `POST`, `GET /{id}`, the BR-1 map with all 36 cells | Backend done |
| `012` change status — `PUT /status`, four refusal types, optimistic concurrency | Backend done |
| `010` ticket list — paged, newest first | Backend done |

**263 tests, 0 warnings.** Every acceptance criterion maps to a named test, and the run output is
recorded in each feature's `tests.md` rather than asserted from memory.

---

## What is NOT built, and why

This section is not an apology. Three days is about nine working hours, the product scope document
lists roughly sixty features across twelve sections, and choosing what to cut is part of the work.
Every cut below has a reason that would still hold with four times the time, and each names the
feature folder that owns it.

### Deferred with a specification already written

| Not built | Where it is specified | Why it was cut |
|---|---|---|
| **Authentication and roles** (`004`) | `specs/004-auth-and-roles/` | The most expensive item that is not on the demo path. `createdByUserId` is `null` and the endpoints are open. **The consequence is stated rather than hidden:** every audit row is anonymous, and BR-6's authorization checks have nothing to evaluate. The handler that needs one names the exact line the check goes on. A forgeable header was rejected outright — ADR-005 makes the argument: every authorization test would pass while proving nothing |
| **Assignment** (`011`) | `specs/011-assign-ticket/` | The demo is create → list → change status. Assignment is a fourth verb on the same object, and BR-2's rules need `004`'s roles to mean anything |
| **Filters and search** (`015`) | `specs/015-ticket-filters-and-search/` | Seven filters that combine with AND, repeated keys that combine with OR, and a search that must treat `%` and `_` as literals. Shipping half of it leaves a query surface that looks complete and silently ignores combinations |
| **Timeline and comments** (`013`) | `specs/013-ticket-timeline-and-comments/` | `dbo.TicketHistory` is written and correct — `Created` and `StatusChanged` rows with notes. What is missing is the read surface |
| **Escalation** (`016`) | `specs/016-escalate-ticket/` | The columns exist so no second migration is needed. The verb does not |
| **Localization catalogues** (`005`) | `specs/005-localization-core/` | The seam is built and every server-authored message is a **symbolic key**, not a sentence — so there is no retrofit later, only a catalogue to fill. Arabic content already round-trips through `nvarchar` end to end and the seed includes it. What is missing is `.resx` files and a language switcher |
| **The audit read endpoint** (`019`) | `specs/019-audit-log-access/` | The table is queryable today and four indexed SQL queries are written down in that folder. A screen for it is not on the demo path |

### Deferred *halves* of features that shipped

| Not built | Owner | Consequence, stated plainly |
|---|---|---|
| `UseStatusCodePages` — enveloping `404`, `405`, `415` | `002b` | A mistyped URL returns an **empty-bodied** `404`. No exception handler in any framework sees those, which is the finding that split the feature |
| OpenAPI generation | `002b` | The contract files are frozen and both lanes read them, but nothing automatically compares the generated document against them. The comparison is manual and recorded as such |
| **`DENY UPDATE, DELETE` on `dbo.AuditLog`** | `003b` | **The audit log is append-only by application convention, not by database permission.** Deferred whole rather than halved: `DENY` on a connection that is a `sysadmin` is decorative, and shipping it without the test that proves the connection is restricted would be a claim with no evidence |
| The customer write path (`007`, `008`) | `007`, `008` | Customers are seeded, not created through the UI. `Customer` is deliberately a shell with private setters so it cannot drift before it gets its invariants |

### Known defects, not omissions

| | |
|---|---|
| A malformed `{id}` returns `404`, not the `400` its criterion asks for | The route constraint short-circuits before the action. `002b` owns it |
| `errors` keys are PascalCase where the contract implies camelCase | Recorded in `002`'s evidence rather than smoothed over. A client mapping errors onto form fields by exact name will miss |
| The list's stable-sort tie-break is unproven | The query orders by `CreatedAtUtc` then `Id`, and **no test fails without the tie-break** — three attempts are documented in `010`'s evidence. It stays because SQL Server promises no order for a tie; proving it needs a data volume the test strategy excludes |

---

## Where the reasoning lives

- `docs/sdd/12-delivery-log.md` — every decision, in order, with what was rejected and why
- `docs/sdd/16-three-day-plan.md` — the nine-hour plan, amended as scope moved between features
- `docs/sdd/15-scope-coverage.md` — all twelve sections of the product scope, mapped to covered
  or cut
- `docs/sdd/11-open-questions.md` — questions for the evaluator, each with a working assumption
- `specs/NNN-*/tests.md` — recorded output, the defects each feature's tests found, and the gaps
- `CLAUDE.md` — the working agreement, the decisions that are not to be relitigated, and the
  testing rules that were learned the hard way
