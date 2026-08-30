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
| Docker | For the database, and for the integration tests |
| SQL Server | Only if you would rather use a local instance than the container — see below |
| Node | 20+, only for the frontend |

### Start the database

```bash
docker compose up -d db
```

SQL Server 2022 on host port **14330**, from `docker-compose.yml`. Wait for
`docker compose ps` to say `healthy` — the port accepts connections several seconds before the
engine will answer a query, and that gap looks exactly like a wrong password.

`src/Wasl.Api/appsettings.Development.json` points at that container and needs no editing. To use
a local instance instead, change `Server=` there to e.g. `.\SQLEXPRESS` with
`Trusted_Connection=True`.

> This file used to default to `Server=.\SQLEXPRESS`, which existed on one developer's machine.
> A clean clone that followed these instructions started a container the application never spoke
> to. `/health` reported the database `Unhealthy` — correctly, which made it read like a broken
> health check rather than a wrong address. Changed 2026-08-27; the `sa` password there is the
> same throwaway already in `docker-compose.yml`.

### Set the two secrets

Nothing starts without them, on purpose. There is no default signing key and no default password
— a random key per restart invalidates every token silently, and a default password is a committed
credential wearing a different hat.

```bash
dotnet user-secrets set "Jwt:SigningKey" "any-string-of-at-least-32-bytes-please" -p src/Wasl.Api
dotnet user-secrets set "Seed:ManagerPassword" "Manager#2026" -p src/Wasl.Api
dotnet user-secrets set "Seed:AgentPassword"   "Agent#2026"   -p src/Wasl.Api
dotnet user-secrets set "Seed:AgentTwoPassword" "Agent2#2026" -p src/Wasl.Api
```

Omit any one of them and the host refuses to start with a message naming the configuration key
and never the value.

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

The tickets go through the **real pipeline** — validation, the transaction boundary, the audit row,
the BR-1 state machine, the number sequence. So a status the machine forbids fails the seed rather
than writing a ticket the product could not produce — and anything that breaks the pipeline breaks
the seed, before a demo rather than during one. It writes 14 audit rows.

### Run it

```bash
dotnet run --project src/Wasl.Api
```

Then, on the port it prints:

```bash
curl http://localhost:5272/health                          # anonymous — the only one

# Everything under /api needs a token.
curl -sX POST http://localhost:5272/api/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"email":"manager@wasl.local","password":"Manager#2026"}'

curl 'http://localhost:5272/api/tickets?pageSize=20' \
  -H "Authorization: Bearer <accessToken from above>"
```

Two seeded users, and no screen to create more (`004`'s scope was the backend half):

| Email | Role | Language |
|---|---|---|
| `manager@wasl.local` | Manager | `ar` — signs in to an Arabic interface |
| `agent@wasl.local` | Agent | `en` |
| `agent2@wasl.local` | Agent | `ar` — a second Agent, so BR-2.3 (an Agent may not take a **colleague's** ticket) is provable rather than asserted |

Passwords are whatever you set in `Seed:*` above. The email is case-insensitive by column
collation, so `MANAGER@WASL.LOCAL` works.

### Run the tests

```bash
dotnet test                                    # everything — 434 tests
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
| `POST /api/auth/token` | Email and password for a JWT. Anonymous, and the only other one. A wrong password, an unknown email and a deactivated user return the **same** `401` — including the same response time |
| `POST /api/tickets` | `201` with `Location`. Draws a ticket number from a SQL sequence, writes the first history row in the same transaction |
| `GET /api/tickets?page=&pageSize=` | Paged, newest first. `pageSize` defaults to 20 and clamps at 100; `page` clamps up to 1 |
| `GET /api/tickets/{id}` | The same resource shape the create returns |
| `PUT /api/tickets/{id}/status` | The BR-1 state machine, with optimistic concurrency on `expectedVersion` |
| `PUT /api/tickets/{id}/assignee` | Assign, reassign, or unassign (`assigneeId: null`). BR-2 in full — a Manager assigns anyone, an Agent may only take an **unassigned** ticket for themselves |
| `POST /api/tickets/{id}/comments` | `201`. Append-only — there is no edit and no delete, by design (BR-5.3) |
| `GET /api/tickets/{id}/timeline` | Comments and recorded changes merged into one ascending feed. **Cursor-paged**, not page-numbered — see below |
| `GET /api/customers?search=&page=&pageSize=` | The directory. Substring search over name, email and phone, case-insensitive **by column collation**, with pattern characters treated literally |
| `GET /api/customers/{id}` | The full record, with a `version` for a future edit to send back |
| `POST /api/customers` | `201` with a `Location` that returns a **byte-identical** body. Duplicate email or phone is `409` naming the field and nothing else — enforced by the application **and** by a filtered unique index, so two simultaneous identical requests produce one `201` and one `409` |
| `GET /api/support-users` | The assignee picker. Active users only, three fields — id, name, role |

### Five things worth looking at

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

**A permission check's placement decides whether the refusal is recorded.** BR-2's
data-dependent rules — "may this Agent take this ticket?" — are enforced in the handler, not in an
authorization policy, and that is not a style choice. A handler denial is a domain exception, so
the audit pipeline classifies it `Denied` and writes a row naming the actor, the ticket, and the
`traceId` the caller received. A denial produced by the authorization middleware throws nothing
and writes nothing. **Measured, not assumed:** moving the check into a policy and re-running the
suite reports `found 0: {empty}` for the audit row, while the API still answers a perfectly
correct `403`. Role-only checks stay on the endpoint, where they belong.

**Two pagination shapes, and the difference is a failure mode rather than a preference.** The
ticket list returns `{ items, page, pageSize, totalCount, totalPages }`; the ticket timeline
returns a cursor. A list grows at the end the reader is not looking at, so page 2 stays page 2. A
timeline grows at the end they *are* reading, so a page number silently skips or repeats entries
between two requests. **The first implementation of that cursor did exactly that** — it ordered by
`Id` and compared the id as text, and SQL Server orders `uniqueidentifier` by a byte order of its
own, so one comment appeared on two consecutive pages. Caught by a test asserting that no entry
appears twice; a test counting entries per page would have passed.

**Every state change writes an audit row in the same transaction as the change.**

 A rollback takes
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
| `004` auth — `dbo.SupportUsers`, `POST /api/auth/token`, real `ICurrentUser`, `ManagerOnly` + an authenticated **fallback** policy | **Backend half done.** `004b` deferred, see below |
| `011` assign ticket — `PUT /assignee`, `GET /api/support-users`, BR-2 in full | Backend done |
| `013` timeline and comments — `dbo.TicketComments`, `POST /comments`, `GET /timeline` (cursor-paged) | Backend done |
| `008` customer list and profile — `GET /api/customers` with search, `GET /api/customers/{id}` | Backend done |
| `007` create customer — the duplicate rule, two filtered unique indexes, and a concurrency test | Backend done |

**434 tests, 0 warnings.** Every acceptance criterion maps to a named test, and the run output is
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
| **Authentication and roles — the frontend half** (`004`) | `specs/004-auth-and-roles/` | The backend half **shipped 2026-08-27**: `POST /api/auth/token`, JWT with a role claim, two seeded users, real `ICurrentUser`, `RequireAuthenticatedUser` as the fallback policy so a forgotten `[Authorize]` cannot open an endpoint. What is missing is the login screen, the route guard, the `401` interceptor and sign-out — the frontend lane owns them. Until then, a token is obtained with `curl` and pasted into a header |
| **Filters and search** (`015`) | `specs/015-ticket-filters-and-search/` | Seven filters that combine with AND, repeated keys that combine with OR, and a search that must treat `%` and `_` as literals. Shipping half of it leaves a query surface that looks complete and silently ignores combinations |
| **Escalation** (`016`) | `specs/016-escalate-ticket/` | The columns exist so no second migration is needed. The verb does not |
| **Localization catalogues** (`005`) | `specs/005-localization-core/` | The seam is built and every server-authored message is a **symbolic key**, not a sentence — so there is no retrofit later, only a catalogue to fill. Arabic content already round-trips through `nvarchar` end to end and the seed includes it. What is missing is `.resx` files and a language switcher |
| **The audit read endpoint** (`019`) | `specs/019-audit-log-access/` | The table is queryable today and four indexed SQL queries are written down in that folder. A screen for it is not on the demo path |

### Deferred *halves* of features that shipped

| Not built | Owner | Consequence, stated plainly |
|---|---|---|
| `UseStatusCodePages` — enveloping `404`, `405`, `415` | `002b` | A mistyped URL returns an **empty-bodied** `404`. No exception handler in any framework sees those, which is the finding that split the feature |
| OpenAPI generation | `002b` | The contract files are frozen and both lanes read them, but nothing automatically compares the generated document against them. The comparison is manual and recorded as such |
| **`DENY UPDATE, DELETE` on `dbo.AuditLog`** | `003b` | **The audit log is append-only by application convention, not by database permission.** Deferred whole rather than halved: `DENY` on a connection that is a `sysadmin` is decorative, and shipping it without the test that proves the connection is restricted would be a claim with no evidence |
| **An audit row on a `401` or a `403`** | `004b` | **A gap in BR-9.4, not a satisfied criterion.** Sign-in success and failure both write rows — `IssueTokenCommand` is an `IAuditableCommand`, so the existing pipeline does it. A *denial* by the authorization middleware writes nothing, because that needs an `IAuthorizationMiddlewareResultHandler`. So "who was refused access, and to what" is not in the log |
| **Rate limiting and lockout on `POST /api/auth/token`** | `004b` | **Brute force is unimpeded.** Returning one identical `401` for every wrong input is the correct response shape and does nothing whatever to slow a script. There is also no password policy: the two seeded passwords are the only ones the system has, and nothing enforces a minimum beyond 8 characters on those |
| **A CORS policy** | unowned | None is configured, deliberately. In development the frontend runs behind Vite's proxy, so no cross-origin request is made and a policy would be untested configuration. A deployment that serves the two from different origins needs one, and adding it without knowing that origin means either a wildcard or a guess |

### Concurrency and abuse — a sideways review

`CLAUDE.md` carries a twelve-row checklist for write endpoints, each row a defect this codebase
has already had or that a feature's shape makes likely. **Reviewed across `002`, `003`, `009`,
`010` and `012`: one defect fixed, four gaps recorded, eight items accepted with reasons.**

The one fixed: `Customers.IsActive` carried a column `DEFAULT 1` while the CLR default for `bool`
is `false` — so any code deactivating a customer would have stored them as **active**, with no
error. Identical in shape to the `Priority` defect `009` found, sitting in `001`'s configuration
since day one, unreachable only because `Customer` has no factory until `007` — which is also the
feature where deactivation starts to matter.

The four recorded:

| Gap | Owner | Consequence |
|---|---|---|
| **`POST /api/tickets` is not idempotent** | Unowned by design | Two clicks create two tickets, with different numbers and no error. No acceptance criterion asks for idempotency, so this is not a deviation — but the question is now asked and this is the answer. A client-side guard is not the guarantee; the guarantee would be a request key or a business rule |
| **A `404` for an unknown `customerId` on create is an enumeration oracle** | open, `007` | **No longer harmless. `004` landed, so the endpoint is authenticated and the oracle is live:** any signed-in Agent can now probe which customer ids exist by posting tickets and reading `404` against `201`. The review predicted this exact activation and named `004` as the trigger. BR-4.4 forbids exactly this for the duplicate rule; the same reasoning applies here |
| **`expectedVersion` is validated by allocating a buffer the size of the input** | **closed, `004b`** 2026-08-29 | A multi-megabyte token allocated before it was refused. **Fixed with a `MaximumLength` rule on the field**, cascade-stopped so it runs before `TryFromBase64String` — `Ticket.RowVersionTokenMaxLength`, on both endpoints that take the token. **This row previously recommended a Kestrel request-body limit as "the cleaner fix", and that recommendation was wrong.** A global body cap is sized by the largest legitimate body in the API — a 4000-character ticket description — so it would sit far above the twelve characters a `rowversion` needs and refuse nothing; and lowering it to where it would bite refuses legitimate requests on unrelated endpoints. The defect is one field on two endpoints, and it is fixed where it lives. Corrected in place rather than annotated below, because a wrong recommendation left standing is a recommendation that gets followed |
| **`MultipleActiveResultSets=True` disables EF savepoints** | Unowned | Inherited from `001`'s connection string and used by nothing. Not a correctness defect — `TransactionBehaviour` rolls the whole transaction back, which is exactly what the warning prescribes — but it logs on every save, and a warning that always fires is a warning nobody reads |

### Known defects, not omissions

| | |
|---|---|
| ~~A malformed `{id}` returns `404`, not the `400` its criterion asks for~~ | **CLOSED 2026-08-30 by `002b` — answered differently, and now a decision rather than an inheritance.** The `404` stands and carries a proper envelope. A `400` would tell an unauthenticated prober that the id SHAPE was wrong, which is the enumeration oracle BR-4.4 closes for customers; a malformed id and an absent one are both "no such resource" from the caller's position. Recorded in `008` AC-3 and `011` D-2, which were the same finding twice |
| **The audit log is append-only by DATABASE PERMISSION** (`003b`, 2026-08-30) | The application runs as `wasl_app`, which has `SELECT` and `INSERT` on `dbo.AuditLog` and an explicit `DENY` on `UPDATE` and `DELETE`. **This restricts the application, not the database administrator** — SQL Server does not apply permission checks to `sysadmin` at all, so somebody on SSMS with that role can still edit the log, and a stronger claim needs cryptographic integrity or ledger tables, which is a decision this project has not made. **Measured, not assumed:** with the `DENY` correctly in place and the application connected as `sa`, the log was exactly as mutable as before — which is why the connection string, not the `DENY`, is the load-bearing half |
| **`Content-Language` is absent on any response produced by throwing** | `005` AC-11, recorded **unmet**. `ExceptionHandlerMiddleware` clears the response — headers included — before invoking any `IExceptionHandler`, and `RequestLocalizationMiddleware` writes the header eagerly on the way down. **Bodies on those paths ARE correctly localized**; only the header is missing. Measured with one probe: on the same endpoint a `400` from model binding keeps the header and a `400` from FluentValidation loses it. **`002b` owns it** |
| **The 63 Arabic strings have never been read by anyone who reads Arabic** | `005` wrote both catalogues; the Arabic half is unreviewed. This is **Q-8**, open since the start — *who writes and reviews the Arabic copy* — and it is a delivery risk rather than a code risk: machine-quality interface copy in a support tool reads as unserious, and no test can see it. `014`'s manual Arabic pass is where it gets read |
| **The sign-in throttle is keyed by (address, email), where the ruling said "per IP"** | **Not a defect — confirmed by the product owner 2026-08-29 and the wording corrected in `004`'s `spec.md`.** The pair prevents the lockout the ruling was guarding against *and* satisfies AC-37; keying by address alone refuses a Manager who never failed, which control B measured. Listed here only because a decision described wrongly gets reverted later |
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
