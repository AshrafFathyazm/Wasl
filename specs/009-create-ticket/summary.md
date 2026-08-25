# 009 — Summary

**Implemented 2026-08-26. Build clean, 214 tests, 214 passed, 0 skipped** — 121 of them new.
Evidence in [tests.md](tests.md); AI usage in [ai-notes.md](ai-notes.md).

`009` closes as a **complete backend feature**. The create-ticket form is
`024-frontend-create-ticket-form`, working from the frozen contract — which is the mechanism `CLAUDE.md`
describes, not a shortfall.

---

## What was built

| Where | What |
|---|---|
| `Wasl.Domain/Tickets/` | `Ticket` (private setters, one factory, no mutator) · `TicketHistoryEntry` · `TicketNumber.Format` · `TicketStatus` · `TicketCategory` · `TicketPriority` · **`TicketStatusTransitions`** |
| `Wasl.Domain/Communications/` | `CommunicationChannel` — the five channels the product scope names |
| `Wasl.Domain/Common/` | `IAuditableEntity` — the four stamps, applied by the DbContext |
| `Wasl.Application/Features/Tickets/CreateTicket/` | Command · Handler · Validator · `CreateTicketResult` |
| `Wasl.Application/Features/Tickets/GetTicketById/` | Query · Handler |
| `Wasl.Application/Common/Abstractions/` | `ITicketNumberGenerator` · `IRequestTimestamp`, and `IApplicationDbContext` gained `Tickets`, `AnyAsync` and `FirstOrDefaultAsync` |
| `Wasl.Infrastructure/` | `SequenceTicketNumberGenerator` · `RequestTimestamp` · two EF configurations · the stamping override · migration `AddTicketsAndHistory` |
| `Wasl.Api/` | `TicketsController` — `POST /api/tickets` and `GET /api/tickets/{id}` · `AddPresentation()` |

`CreateTicketCommand` is the **first production `IAuditableCommand`**, so `003`'s NFR-10 scanner
now runs over a non-empty population: a command added later without an audit action fails the
build.

---

## Trade-offs

**No authentication.** `004` comes after this feature and after `012` in the plan.
`createdByUserId` is `null` in the `201` — present in the shape and nullable in the DTO, because
removing a field and adding it back is a breaking change for a client while a null it handles
from day one is not. The frozen contract did not change. The cost is an open endpoint and two
unverifiable criteria, both owned by `004` by name.

**Two pieces of other features moved in.** The BR-1 map with all 36 tests (from `012`) and
`GET /api/tickets/{id}` (from `010`). Both because `009` consumes them: AC-10 returns
`allowedTransitions`, and the contract promises the `201`'s `Location` resolves. The budget moved
with them — `16-three-day-plan.md` amended from 50 minutes to about two hours, and Session 2
item 1 struck through. `012` keeps `PUT /status` and optimistic concurrency; `010` keeps the list
and both screens.

**Four foreign keys deferred.** `dbo.SupportUsers` does not exist. The four columns are
`uniqueidentifier NULL` with no key, and `004` adds all four in the migration that creates the
table. `plan.md`'s multiple-cascade-path analysis stays there so the trap is not rediscovered.

**Reflection in the test project to seed a `Customer`.** The entity is a shell until `007`, so
there is no legitimate way to populate one. Confined to one class.

**No `ToListAsync` on `IApplicationDbContext`.** `009` declared only what it uses — `AnyAsync`
and `FirstOrDefaultAsync`. `010` adds listing with paging decided against a real call site, rather
than a shape guessed now.

---

## Deviations from the plan

| Deviation | Why |
|---|---|
| **`ITicketNumberGenerator` reinstated** after `research.md` R-2 removed it | R-2 removed it as ceremony under ADR-010's two projects. Under ADR-002 the handler cannot see EF Core. R-2's real argument — never fake the sequence — survived and is honoured |
| **The history row is written by the handler**, not appended inside `Ticket.Create` | The factory no longer knows the instant; `SaveChangesAsync` supplies it. Both read one scoped `IRequestTimestamp` instead |
| **`Priority` has no column default**, against `data-model.md`'s `DEFAULT 'Normal'` | It would have overwritten an explicit `Low`. See below |
| **`IAuditableEntity` and `IRequestTimestamp` added** — in no task | Product-owner decision mid-implementation. Stamping moved out of handlers entirely |
| **`AddPresentation()` added, `TimeProvider` and the DbContext health check moved to Infrastructure** | Product-owner decision. Each layer registers itself so its implementations can stay `internal` |
| **One `ICollectionFixture` replaced seven `IClassFixture`** | The suite was dying of `OutOfMemoryException`. See below |
| **`JsonStringEnumConverter` registered** — in no task | The contract had always said enums travel as names; nothing had needed it before |
| **`REV-009-03` not run** (OpenAPI vs contract) | Needs Swashbuckle, which is `002b`. `tests.md` records the comparison as manual rather than as passed |

---

## The three that would have shipped

**Enums bound from numbers.** Every request in the first integration run returned `400` —
including the one that should have been `404` — because `System.Text.Json` binds enums from
integers by default. Binding failed before any validator ran. Had a request bound, `status` would
have serialised as `0`, and a client would be branching on integers whose meaning changes the day
someone reorders an enum. The contract had shown `"channel": "WhatsApp"` since it was frozen;
`002` never hit it because `002` has no enum on the wire.

**A column default that overwrote an explicit `Low`.** EF warned that a database default applies
whenever a property holds the CLR default — and the CLR default for `TicketPriority` is `Low`. So
a caller choosing `Low` would have been stored as `Normal`, with no error. AC-8's default belongs
in one place, and the handler already had it.

**Seven SQL Server containers.** `IClassFixture` is per class, so seven classes started seven
containers at roughly 2 GB each and the suite died of `OutOfMemoryException` — with the failures
landing on unrelated validation assertions, so it read as a `009` bug. **It was invisible under
`--filter`, because one class is one container.** That is now a rule in `CLAUDE.md`: verification
means the whole suite; `--filter` is for diagnosis. The integration project also went from 1m29s
to 27s.

## And one that was in a document

`data-model.md` claimed `dbo.SupportUsers` was created by `001`. It exists nowhere in source.
Two further statements were wrong the same way — `dbo.AuditLog` attributed to `001` rather than
`003`, and an index attributed to the unbuilt `008`. Four foreign keys stood on the first of
them, and `CreatedByUserId` was specified `NOT NULL` with a key into the missing table, colliding
with the authentication decision on the same column.

Found by reading the file before writing a migration against it. **A specification describing
state that does not exist makes every decision after it stand on invented ground**, which is
precisely what had happened. The correction is a table at the top of `data-model.md` rather than
a silent edit.

## And one that was mine

`CommunicationChannel` was written as `Email · Phone · WhatsApp · Portal`. The five correct
values are stated in six places in the blueprint, including `03-domain-model.md` line 372. I read
the contract's example payload — which shows one channel — and invented the rest. `Portal`
contradicted `15-scope-coverage.md`, which excludes a customer portal outright. Caught by the
product owner, not by me and not by a test, because a wrong enum compiles.

---

## Known limitations

| Limitation | Owner |
|---|---|
| **The endpoint is unauthenticated.** No `[Authorize]`, no `401`, `createdByUserId` null | `004-auth-and-roles` |
| **AC-5's `400` carries the framework's shape, not the contract's.** Model binding rejects an unparseable enum before any validator runs | `002b` — `UseStatusCodePages` |
| **The generated OpenAPI is not compared against the frozen contract** | `002b` — Swashbuckle. Manual comparison today, recorded as such |
| **No `Auth.Unauthenticated` audit row** | `004`. `003` ships `WriteIndependentAsync` for it already |
| **Four foreign keys absent** | `004`, with `dbo.SupportUsers` |
| **No customer seed.** Tests seed by reflection; there is no demo customer in a migration | Session 3's first task in the plan |
| **`IRequestTimestamp` freezes the clock in a long-lived scope** | Nothing has one. Written at the implementation for whoever adds a hosted service |
| **The sequence's gap behaviour is documented, not tested** | Asserting a gap tests the sequence rather than the feature |
| **The integration suite is now sequential across classes** | Accepted with the container fix. Every assertion scopes itself by id or audit action; none counts rows in a table, and `CLAUDE.md` now says so |

---

## What the next feature inherits

- **`012-change-ticket-status`** gets `TicketStatusTransitions` with all 36 cells verified in both
  assignee states, and `AllowedFrom(status, hasAssignee)` — the signature that stops an unassigned
  `Open` ticket offering `InProgress`. It builds `PUT /status`, optimistic concurrency against the
  `rowversion` already on the entity, and the `StatusChanged` history row
- **`010-ticket-list-and-detail`** gets the detail read and its DTO; it adds the list, paging, and
  `ToListAsync` on `IApplicationDbContext`
- **`004-auth-and-roles`** gets `ICurrentUser` wired through the stamping and the audit row, four
  columns waiting for their keys, and two acceptance criteria named as its own
- **`011`, `016`** get an entity that adds methods rather than setters, and stamping they do not
  have to remember
- **`013-ticket-timeline-and-comments`** gets `dbo.TicketHistory` with its first row already
  written, and `TicketHistoryEventType` covering the events it will add
- **`024-frontend-create-ticket-form`** gets a frozen contract, a `FRONTEND-API-GUIDE.md`, an endpoint whose
  `Location` resolves, and `allowedTransitions` computed server-side so the screen never derives
  BR-1
