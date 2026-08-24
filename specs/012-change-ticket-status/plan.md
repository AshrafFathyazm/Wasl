# US-008 — Technical Plan

**Phase:** 2 · **Story:** US-008 · **Feature:** `012-change-ticket-status` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

## Design Summary

The transition matrix is a static readonly map in the domain. `Ticket.ChangeStatus`
is the only way a status changes, and it checks the map plus the preconditions before
mutating. The slice wraps the call, writes the history row, and saves — one
transaction, opened by a pipeline behaviour, with the audit row inside it. The API
returns `allowedTransitions` on every read **and on the write** so the client never
re-implements the rule.

## Backend

Two projects, one slice. ADR-010.

| Where | Component | Responsibility |
|---|---|---|
| `Wasl.Domain/Tickets/` | `TicketStatus` enum | The six states |
| `Wasl.Domain/Tickets/` | `TicketStatusTransitions` | `static readonly FrozenDictionary<TicketStatus, TicketStatus[]>`; the single source of truth for BR-1 |
| `Wasl.Domain/Tickets/` | `Ticket.ChangeStatus(newStatus, note, TimeProvider)` | Validates against the map, checks BR-1.3 and BR-1.2, mutates, sets `ClosedAtUtc` |
| `Wasl.Domain/Tickets/` | `Ticket.AllowedTransitions` | Computed property: the map entry filtered by the preconditions that currently hold (AC-19) |
| `Wasl.Domain/Tickets/` | `InvalidStatusTransitionException`, `SameStatusTransitionException`, `TicketClosedException`, `AssigneeRequiredException` | Distinct types so the middleware can map distinct `type` values |
| **The slice** — `Wasl.Api/Features/Tickets/ChangeStatus/` | `Endpoint` | One minimal-API endpoint. Binds, authorizes by role, sends the command, maps the result to `200` |
| | `Command` + `Handler` | Loads the ticket, authorizes by data (BR-6), compares `expectedVersion`, calls the domain, writes the `StatusChanged` history row, saves |
| | `Validator` | FluentValidation: enum validity, note length, `expectedVersion` present and decodable |
| | `Response` | The ticket read DTO plus `allowedTransitions`. Never the entity |
| `Wasl.Api/Common/Errors/` | Exception mapping | Maps the four new exceptions and `DbUpdateConcurrencyException` to their `type` values |
| `Wasl.Api/Common/Behaviors/` | `TransactionBehavior`, `AuditBehavior` | Already exist from `003`. This slice declares `IAuditableCommand`; it does not write the audit row itself |

`AllowedTransitions` as a computed property rather than a service call keeps the rule
and its exposure in the same object. If they were separate, they could disagree, and
the client would be told about a transition the domain would reject.

### Why the version is checked twice

`expectedVersion` is compared to the loaded `RowVersion` **before** the transition is
evaluated, and EF Core's `rowversion` check at `SaveChanges` is left in place as well.
Both are needed and they fail differently:

| Layer | Gives you | Alone it fails when |
|---|---|---|
| Pre-check after load | `409 errors/concurrency-conflict` on a stale client, instead of a misleading `errors/invalid-status-transition` computed against a state the client never saw | Another write lands between the load and `SaveChanges` |
| `rowversion` at `SaveChanges` | The guarantee, closing that window | It surfaces as `DbUpdateConcurrencyException`, which is not a message a client can act on |

The mapping of the second onto the first is the same pattern `007` uses for the unique
index (BR-4.8): the application produces the usable answer, the database produces the
guarantee. The failure worth naming is the one where only `SaveChanges` is relied on —
the request then does all of its rule evaluation against a state the caller never held,
and a forbidden-transition message is returned for what is really a stale UI.

The conflict response deliberately carries **no new version**. Handing the client a
fresh token is an invitation to retry silently, which ADR-006 rejects: the system cannot
know whether "set to Resolved" is still intended after someone else set the ticket to
`PendingCustomer`.

### The two rows are not redundant

One accepted transition writes **two** rows in one transaction:

| Row | Table | Audience | Survives ticket deletion |
|---|---|---|---|
| `StatusChanged` | `TicketHistory` | Support agents — it is the timeline (BR-1.8) | No, it cascades |
| `Ticket.StatusChanged` | `AuditLog` | Incident response, compliance (BR-9.1) | Yes, no foreign keys |

ADR-008 explains why both exist. The important consequence for this slice is that
writing only one of them looks correct in every test that reads the timeline, and the
gap is invisible until someone needs the forensic record — which is why NFR-10's
architecture test exists and why `BE-012-11` is not droppable.

## Data Changes

**No migration.** Nothing in this feature changes the schema.

| Object | Created by | This feature |
|---|---|---|
| `dbo.Tickets`, including `Status`, `ClosedAtUtc`, `RowVersion` | `009-create-ticket` | Reads and writes; adds nothing |
| `dbo.TicketHistory`, including `Note nvarchar(500)` | `009-create-ticket` | Inserts one row per transition |
| `dbo.AuditLog` | `003-audit-trail` | Inserts one row per transition, via the behaviour |
| `IX_TicketHistory_Ticket_Time` on `(TicketId, PerformedAtUtc)` | `009-create-ticket` | Already covers reading these rows |

Full detail in [`data-model.md`](data-model.md), including why `ClosedAtUtc` gets no
index. Recording "no data change" explicitly, rather than leaving the section blank, is
what makes it a decision rather than an oversight.

## API Contract

Frozen: [`contracts/ticket-status-api.md`](contracts/ticket-status-api.md).

| Method | Path | Request | Success | Failures |
|---|---|---|---|---|
| `PUT` | `/api/tickets/{id}/status` | `{ status, note?, expectedVersion }` | `200` + updated ticket, with `allowedTransitions` recomputed | `400` invalid enum / missing note / missing or malformed `expectedVersion`, `401`, `403` not permitted, `404` unknown, `409` × 5 |

Ticket read shape gains:

```json
"allowedTransitions": ["Open", "Closed"]
```

Five distinct `409` causes, each with its own `type`, because the client reacts
differently to each:

| `type` | The client's correct reaction |
|---|---|
| `errors/invalid-status-transition` | Show the message, refetch the actions |
| `errors/same-status-transition` | Refetch quietly. The user double-clicked or the UI was stale; they did nothing wrong |
| `errors/ticket-closed` | Remove the actions entirely |
| `errors/assignee-required` | Offer Assign, not a different transition |
| `errors/concurrency-conflict` | Explain and offer reload. **Never retry** |

The two new ones — `same-status-transition` and `assignee-required` — are `spec.md` Q-3.
The alternative was one `type` and five messages, and a client cannot branch on a
translated sentence.

## Frontend

| Route | Component | Kind (ADR-011 §4) | Purpose |
|---|---|---|---|
| `/tickets/:id` | `TicketDetailPage` | Route | Owns the query and the mutation |
| — | `StatusActions` | Feature | Renders one item per entry in `allowedTransitions` |
| — | `ConfirmTransitionDialog` | Feature | Confirms a transition; collects the note when closing from `New` or `Open` |
| — | `ConcurrencyConflictBanner` | Feature | Explains and offers reload |

- `StatusActions` maps over `allowedTransitions`. There is no client-side matrix and
  no `switch` on status. If the array is empty, the component renders nothing, which
  is the correct behaviour for a closed ticket without any special case.
- The mutation sends the `version` from the loaded ticket as `expectedVersion`.
- On `409`, the ticket query is invalidated and the message shown. On
  `errors/concurrency-conflict`, the message explains that someone else changed the
  ticket and offers reload rather than retry.

Full detail in [`frontend-spec.md`](frontend-spec.md); the API surface for the lane is
[`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md).

## Localization Impact

| Item | Detail |
|---|---|
| New client strings | Display names for all six `TicketStatus` values, the action labels, the close-dialog copy, and the conflict message |
| New server messages | `Error.InvalidStatusTransition`, `Error.SameStatusTransition`, `Error.TicketClosed`, `Error.AssigneeRequired`, `Error.ConcurrencyConflict`, `Validation.Note.Required`, `Validation.Note.TooLong`, `Validation.ExpectedVersion.Required` |
| Status labels | Translated in the client catalogue only. `InProgress` stays `InProgress` on the wire, in `TicketHistory.NewValue`, and in `AuditLog.Changes`, which is exactly why history rows remain readable after a language change (BR-8.7) |
| Interpolation | The invalid-transition message names the current status and the permitted ones. Those names are inserted into a translated sentence, so the sentence must accept them as parameters — Arabic word order differs, and a template built by concatenation would break |
| Direction-sensitive layout | A row of action items; order and alignment reverse under RTL |
| Not translated | `type`, the `currentStatus` and `allowedTransitions` extension members, enum values, `TicketNumber`, `traceId`, and the audit row's contents (BR-9.10) |

The interpolation point is the substantive one. `"A ticket in status X cannot move to
Y"` cannot be assembled from fragments, because the fragments land in a different order
in Arabic. The whole sentence is one key with named placeholders.

## Test Strategy

| Level | Covered | Why here |
|---|---|---|
| Unit | Every cell of the BR-1 matrix, permitted and forbidden — 36 cases, driven by `[Theory]` from the matrix itself | Pure logic; this is the core of the story and must be exhaustive |
| Unit | BR-1.3 assignee precondition; BR-1.7 `ClosedAtUtc`; BR-1.9 same-status | Domain behaviour |
| Unit | `AllowedTransitions` filters by precondition (AC-19) | Pure logic, and easy to get wrong |
| Integration | `200` happy path, each `409` variant with its `type`, `400` note required, `403` wrong role, `404`, `401` | The contract is HTTP-shaped and the authorization needs real tokens |
| Integration | History row written; and not written when the save fails (AC-12) | Transactional behaviour needs a real database |
| Integration | One audit row on success; none after a forced rollback; one `Auth.Forbidden` row on the `403` | BR-9.3 and BR-9.4 are the asymmetry, and the only way to see it is to make a transaction fail |
| Integration | Stale `expectedVersion` returns `409` | Needs a real concurrency token — `rowversion` does not exist under EF `InMemory` |
| Frontend | `StatusActions` renders exactly the entries in `allowedTransitions`; server rejection surfaced | Prevents the rule being duplicated client-side |

Driving the unit theory from `TicketStatusTransitions` itself would make the test
tautological. The test data is a **separately written** copy of the BR-1 table, so
that changing the map without intending to breaks a test.

The 36 cells are not 36 equal cases. The expected outcome breaks down as:

| Cells | Expected |
|---|---|
| 10 | `200` — the ✅ cells |
| 15 | `409 errors/invalid-status-transition` |
| 6 | `409 errors/ticket-closed` — the whole `Closed` row, including `Closed → Closed` |
| 5 | `409 errors/same-status-transition` — the diagonal, excluding `Closed` |

The theory asserts the **`type`**, not merely that the call failed. A `409` with the
wrong `type` is a defect the status code cannot reveal, and it lands on the client as an
action the user cannot understand.

Not tested: the enum-to-string serialisation, which is framework behaviour.

## Dependencies

`009-create-ticket` (ticket exists, `ClosedAtUtc` and `RowVersion` exist, history table
exists), `011-assign-ticket` (assignee exists, needed for BR-1.3 and BR-6),
`003-audit-trail` (the behaviour and `IAuditableCommand`), `002-error-contract` (the
middleware), `004-auth-and-roles` (the tokens), `010-ticket-list-and-detail` (the ticket
read shape this feature extends).

## Risks and Trade-offs

| Decision | Alternative | Why rejected |
|---|---|---|
| Static map in the domain | Transition table in the database | Moves behaviour into data, needs a round trip for a pure decision, and hides the rule from code review (ADR-004) |
| Static map in the domain | `switch` inside the endpoint | Two entry points would diverge, and the rule would be untestable without HTTP |
| `allowedTransitions` returned by the API | Client holds its own matrix | Two copies always drift; the drift shows up as a button that produces a `409` |
| `allowedTransitions` on the write response too | Client refetches after every transition | An extra round trip on the happy path, and the obvious shortcut is to derive the next set client-side — which is the duplication this whole design avoids |
| `AllowedTransitions` filters by precondition | Return the raw map entry | The client would offer `InProgress` on an unassigned ticket and the user would hit a `409` for something the UI invited them to do |
| Distinct exception types per `409` cause | One `ConflictException` with a message | The client cannot branch on a message string without parsing English |
| Test data is a hand-written copy of the matrix | Drive tests from the production map | A test that reads the implementation proves only that the implementation equals itself |
| Same-status returns `409` | Return `200` as idempotent | Hides a double-submit or a stale client, which is a real bug worth surfacing (BR-1.9) |
| Version pre-check plus the `rowversion` check | `SaveChanges` only | Rule evaluation would happen against a state the caller never saw, so a stale client gets a forbidden-transition message instead of "reload" |
| Version pre-check plus the `rowversion` check | Pre-check only | It leaves the window between load and save open, which is the entire lost-update defect ADR-006 exists to prevent |
| The audit row written by the behaviour | Written by the handler | A handler can forget, and the one that forgets is the one that matters. BR-9.3 becomes a property of the pipeline instead of a habit |
| `403` audited outside the transaction | Audited inside | There is no business transaction on a denial — nothing to join, and nothing to roll back with (BR-9.4) |

## Files to Create or Change

```text
src/Wasl.Domain/Tickets/TicketStatus.cs
src/Wasl.Domain/Tickets/TicketStatusTransitions.cs
src/Wasl.Domain/Tickets/Ticket.cs                                   (ChangeStatus, AllowedTransitions)
src/Wasl.Domain/Tickets/InvalidStatusTransitionException.cs
src/Wasl.Domain/Tickets/SameStatusTransitionException.cs
src/Wasl.Domain/Tickets/TicketClosedException.cs
src/Wasl.Domain/Tickets/AssigneeRequiredException.cs
src/Wasl.Api/Features/Tickets/ChangeStatus/Endpoint.cs
src/Wasl.Api/Features/Tickets/ChangeStatus/ChangeTicketStatusCommand.cs
src/Wasl.Api/Features/Tickets/ChangeStatus/ChangeTicketStatusHandler.cs
src/Wasl.Api/Features/Tickets/ChangeStatus/ChangeTicketStatusValidator.cs
src/Wasl.Api/Features/Tickets/ChangeStatus/ChangeTicketStatusResponse.cs
src/Wasl.Api/Features/Tickets/GetTicket/TicketDetailResponse.cs        (allowedTransitions — shape owned by 010)
src/Wasl.Api/Common/Errors/ExceptionToProblemDetailsMapper.cs          (four new types)
src/Wasl.Api/Common/Localization/Resources/Errors.resx                 (+ .ar.resx)
src/wasl-web/src/features/tickets/TicketDetailPage.tsx
src/wasl-web/src/features/tickets/StatusActions.tsx
src/wasl-web/src/features/tickets/ConfirmTransitionDialog.tsx
src/wasl-web/src/features/tickets/ConcurrencyConflictBanner.tsx
src/wasl-web/src/features/tickets/api.ts
src/wasl-web/src/features/tickets/queries.ts
src/wasl-web/src/features/tickets/schema.ts
src/wasl-web/src/locales/en/tickets.json                               (+ ar)
tests/Wasl.Domain.Tests/Tickets/TicketStatusTransitionTests.cs
tests/Wasl.Domain.Tests/Tickets/AllowedTransitionsTests.cs
tests/Wasl.Api.IntegrationTests/Tickets/ChangeTicketStatusTests.cs
tests/Wasl.Api.IntegrationTests/Tickets/ChangeStatusAuthorizationTests.cs
tests/Wasl.Api.IntegrationTests/Tickets/ChangeStatusConcurrencyTests.cs
tests/Wasl.Api.IntegrationTests/Tickets/ChangeStatusAuditTests.cs
src/wasl-web/src/features/tickets/StatusActions.test.tsx
```

## Contract changes

First contract for this endpoint:
[`contracts/ticket-status-api.md`](contracts/ticket-status-api.md), frozen 2026-08-23.

It **extends** a shape owned elsewhere. `TicketDetailResponse` belongs to
`010-ticket-list-and-detail`; this feature adds `allowedTransitions` to it. That is a
contract change to `010` and it is recorded here, in `010`'s terms, rather than being
discovered by the frontend when a field appears:

| Change | Owner | Effect |
|---|---|---|
| `allowedTransitions: TicketStatus[]` added to `TicketDetailResponse` | `010` | Additive. No existing field moves or changes type, so nothing built against `010` breaks |

Nothing else existed before this contract, so nothing else is broken. The heading stays
even when empty — an empty contract-changes section is the statement that the contract
did not move.

The frontend lane reads [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md) and may start
as soon as that file exists; it does not wait for `BE-012-08`.

## Migration note

The original plan predates three decisions. What changed, and what did not:

| Was | Now | Why |
|---|---|---|
| `Wasl.Application/Tickets/ChangeStatus/...`, `ITicketRepository.GetForUpdateAsync`, `TicketsController.ChangeStatus` | One slice folder, `Wasl.Api/Features/Tickets/ChangeStatus/`, a minimal-API endpoint, and `DbSet<Ticket>` | ADR-010 was accepted after this plan was written. There is no `Wasl.Application` and no `Wasl.Infrastructure`. `ITicketRepository` with one implementation is an abstraction over `DbSet<T>`, which is already one — and this slice's load is `FirstOrDefaultAsync` with a `ct`, not a query worth naming |
| `IReadOnlyDictionary<,>` for the map | `FrozenDictionary<,>` | Read-only, built once at type initialisation, and faster to look up. `IReadOnlyDictionary` remains the exposed type |
| Two exception types | Four | Q-3. `SameStatusTransitionException` and `AssigneeRequiredException` join them, because the client's reaction to each differs |
| Silent about the audit log | `IAuditableCommand`, action `Ticket.StatusChanged`, plus `Auth.Forbidden` on the denial | ADR-008 was accepted after this plan. Without it, no task carried the obligation and NFR-10's architecture test would fail the build on the first commit that compiles |
| Nothing about `expectedVersion`'s form | Base64 `rowversion`, checked twice | ADR-006 as amended by ADR-013 |
| No migration expected | Still no migration | Unchanged, and now stated against SQL Server types in [`data-model.md`](data-model.md) |

The original's reasoning about what each piece does is unchanged. What moved is where it
lives, one abstraction fewer, and the obligations three later ADRs added.
