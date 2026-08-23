# US-008 — Technical Plan

**Phase:** 2 · **Role:** Architecture · **Status:** Complete

## Design Summary

The transition matrix is a static readonly map in the domain. `Ticket.ChangeStatus`
is the only way a status changes, and it checks the map plus the preconditions before
mutating. The application layer wraps the call, writes the history row, and saves —
one transaction. The API returns `allowedTransitions` on every read so the client
never re-implements the rule.

## Backend

| Layer | Component | Responsibility |
|---|---|---|
| Domain | `TicketStatus` enum | The six states |
| Domain | `TicketStatusTransitions` | `static readonly IReadOnlyDictionary<TicketStatus, TicketStatus[]>`; the single source of truth for BR-1 |
| Domain | `Ticket.ChangeStatus(newStatus, note, TimeProvider)` | Validates against the map, checks BR-1.3 and BR-1.2, mutates, sets `ClosedAtUtc` |
| Domain | `Ticket.AllowedTransitions` | Computed property: the map entry filtered by the preconditions that currently hold (AC-19) |
| Domain | `InvalidStatusTransitionException`, `TicketClosedException` | Distinct types so the middleware can map distinct `type` values |
| Application | `ChangeTicketStatusCommand` / `Handler` | Loads, authorizes (BR-6), calls the domain, writes history, saves |
| Application | `ChangeTicketStatusValidator` | Enum validity, note length, `expectedVersion` presence |
| Application | `ITicketRepository.GetForUpdateAsync` | Loads with the concurrency token |
| API | `TicketsController.ChangeStatus` | Binds, delegates, maps |
| API | Exception middleware additions | Maps the two new exceptions to their `type` values |

`AllowedTransitions` as a computed property rather than a service call keeps the rule
and its exposure in the same object. If they were separate, they could disagree, and
the client would be told about a transition the domain would reject.

## Data Changes

Migration: `AddTicketClosedAt` — only if `ClosedAtUtc` was not created with the
`Tickets` table in US-005. It was, so **no migration is expected for this story**.

`TicketHistory` already exists from US-005. No new indexes: the timeline query index
`(TicketId, PerformedAtUtc)` already covers reading these rows.

Recording "no data change" explicitly, rather than leaving the section blank, is what
makes it a decision rather than an oversight.

## API Contract

| Method | Path | Request | Success | Failures |
|---|---|---|---|---|
| `PUT` | `/api/tickets/{id}/status` | `{ status, note?, expectedVersion }` | `200` + updated ticket | `400` invalid enum or missing note, `401`, `403` wrong role, `404` unknown, `409` invalid transition / closed / same status / concurrency |

Ticket read shape gains:

```json
"allowedTransitions": ["Open", "Closed"]
```

Four distinct `409` causes, each with its own `type`, because the client reacts
differently to each: an invalid transition needs a refetch of the actions, a
concurrency conflict needs a reload with an explanation, a closed ticket needs the
actions removed entirely.

## Frontend

| Route | Component | Purpose |
|---|---|---|
| `/tickets/:id` | `TicketDetailPage` | Hosts the actions |
| — | `StatusActions` | Renders one button per entry in `allowedTransitions` |
| — | `CloseTicketDialog` | Collects the required note when closing from `New` or `Open` |

- `StatusActions` maps over `allowedTransitions`. There is no client-side matrix and
  no `switch` on status. If the array is empty, the component renders nothing, which
  is the correct behaviour for a closed ticket without any special case.
- The mutation sends the `version` from the loaded ticket.
- On `409`, the ticket query is invalidated and the message shown. On
  `errors/concurrency-conflict`, the message explains that someone else changed the
  ticket and offers reload rather than retry.

## Localization Impact

| Item | Detail |
|---|---|
| New client strings | Display names for all six `TicketStatus` values, the action button labels, the close-dialog copy, and the conflict message |
| New server messages | `Error.InvalidStatusTransition`, `Error.TicketClosed`, `Error.AssigneeRequired`, `Error.ConcurrencyConflict`, `Validation.Note.Required` |
| Status labels | Translated in the client catalogue only. `InProgress` stays `InProgress` on the wire and in `TicketHistory.NewValue`, which is exactly why history rows remain readable after a language change (BR-8.7) |
| Interpolation | The invalid-transition message names the current status and the permitted ones. Those names are inserted into a translated sentence, so the sentence must accept them as parameters — Arabic word order differs, and a template built by concatenation would break |
| Direction-sensitive layout | A row of action buttons; order and alignment reverse under RTL |

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
| Integration | Stale `expectedVersion` returns `409` | Needs a real concurrency token |
| Frontend | `StatusActions` renders exactly the entries in `allowedTransitions`; server rejection surfaced | Prevents the rule being duplicated client-side |

Driving the unit theory from `TicketStatusTransitions` itself would make the test
tautological. The test data is a **separately written** copy of the BR-1 table, so
that changing the map without intending to breaks a test.

Not tested: the enum-to-string serialisation, which is framework behaviour.

## Dependencies

US-005 (ticket exists, history table exists), US-007 (assignee exists, needed for
BR-1.3 and BR-6).

## Risks and Trade-offs

| Decision | Alternative | Why rejected |
|---|---|---|
| Static map in the domain | Transition table in the database | Moves behaviour into data, needs a round trip for a pure decision, and hides the rule from code review (ADR-004) |
| Static map in the domain | `switch` inside the controller | Two entry points would diverge, and the rule would be untestable without HTTP |
| `allowedTransitions` returned by the API | Client holds its own matrix | Two copies always drift; the drift shows up as a button that produces a `409` |
| `AllowedTransitions` filters by precondition | Return the raw map entry | The client would offer `InProgress` on an unassigned ticket and the user would hit a `409` for something the UI invited them to do |
| Distinct exception types per `409` cause | One `ConflictException` with a message | The client cannot branch on a message string without parsing English |
| Test data is a hand-written copy of the matrix | Drive tests from the production map | A test that reads the implementation proves only that the implementation equals itself |
| Same-status returns `409` | Return `200` as idempotent | Hides a double-submit or a stale client, which is a real bug worth surfacing (BR-1.9) |

## Files to Create or Change

```text
src/Wasl.Domain/Tickets/TicketStatus.cs
src/Wasl.Domain/Tickets/TicketStatusTransitions.cs
src/Wasl.Domain/Tickets/Ticket.cs                     (ChangeStatus, AllowedTransitions)
src/Wasl.Domain/Tickets/InvalidStatusTransitionException.cs
src/Wasl.Domain/Tickets/TicketClosedException.cs
src/Wasl.Application/Tickets/ChangeStatus/ChangeTicketStatusCommand.cs
src/Wasl.Application/Tickets/ChangeStatus/ChangeTicketStatusHandler.cs
src/Wasl.Application/Tickets/ChangeStatus/ChangeTicketStatusValidator.cs
src/Wasl.Application/Tickets/TicketDto.cs             (allowedTransitions)
src/Wasl.Api/Controllers/TicketsController.cs
src/Wasl.Api/Middleware/ExceptionHandlingMiddleware.cs
src/wasl-web/src/features/tickets/TicketDetailPage.tsx
src/wasl-web/src/features/tickets/StatusActions.tsx
src/wasl-web/src/features/tickets/CloseTicketDialog.tsx
src/wasl-web/src/features/tickets/api.ts
tests/Wasl.Domain.Tests/Tickets/TicketStatusTransitionTests.cs
tests/Wasl.Domain.Tests/Tickets/AllowedTransitionsTests.cs
tests/Wasl.Api.IntegrationTests/Tickets/ChangeTicketStatusTests.cs
tests/Wasl.Api.IntegrationTests/Tickets/ChangeStatusAuthorizationTests.cs
src/wasl-web/src/features/tickets/StatusActions.test.tsx
```
