# US-005 — Task Breakdown

**Phase:** 3 · **Role:** Story Planner · **Status:** Complete

## Critical Path

`BE-005-01 → BE-005-02 → BE-005-03 → BE-005-05 → BE-005-06 → FE-005-03`

## Backend

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| BE-005-01 | `Ticket` aggregate, `TicketHistory`, and the enums | US-001 | Compiles; unit tests | AC-2 |
| BE-005-02 | `Ticket.Create` sets `New` and appends the `Created` history row | BE-005-01 | Unit test asserting both | AC-2, AC-9 |
| BE-005-03 | EF configuration, migration, sequence, and all five indexes applied cleanly | BE-005-02 | `dotnet ef database update`; `sys.indexes` on `dbo.Tickets` lists all five | AC-3 |
| BE-005-04 | `SequenceTicketNumberGenerator` produces the correct format | BE-005-03 | Integration test | AC-3 |
| BE-005-05 | `CreateTicketHandler` and validator; unknown customer yields `404` | BE-005-02 | Application and integration tests | AC-4 – AC-8 |
| BE-005-06 | `POST /api/tickets` returns `201` with `Location` and `allowedTransitions` | BE-005-05 | Integration test | AC-1, AC-10 |
| BE-005-07 | `createdByUserId` is read from the token and any body value ignored | BE-005-06 | Integration test supplying a false id | AC-12 |
| BE-005-08 | OpenAPI metadata declares `201`, `400`, `401`, `404` | BE-005-06 | `/swagger` | Contract |

## Frontend

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| FE-005-01 | Generated API types and enum constants | BE-005-08 | `npm run typecheck` | AC-5 |
| FE-005-02 | `CustomerPicker` with debounced search and single selection | US-002 list endpoint | Manual run | AC-14 |
| FE-005-03 | `TicketForm` submits and navigates to the created ticket | FE-005-01, FE-005-02 | Manual run | AC-1, AC-15 |
| FE-005-04 | Validation, loading, and server-error states | FE-005-03 | Component test | AC-15 |

## Tests

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| TEST-005-01 | Unit: initial status and the `Created` history row | BE-005-02 | Test run | AC-2, AC-9 |
| TEST-005-02 | Unit: ticket number formatting | BE-005-04 | Test run | AC-3 |
| TEST-005-03 | Integration: happy path with `Location` retrieval | BE-005-06 | Test run | AC-1 |
| TEST-005-04 | Integration: missing `400` and unknown `404` customer | BE-005-05 | Test run | AC-4 |
| TEST-005-05 | Integration: each `400` validation variant | BE-005-05 | Test run | AC-5 – AC-7 |
| TEST-005-06 | Integration: priority defaults to `Normal` | BE-005-05 | Test run | AC-8 |
| TEST-005-07 | Integration: history row persisted with the ticket | BE-005-06 | Test run | AC-9 |
| TEST-005-08 | Integration: two concurrent creations produce distinct numbers | BE-005-04 | Test run | AC-11 |
| TEST-005-09 | Integration: `401` without a token | BE-005-06 | Test run | AC-13 |

## Documentation

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| DOC-005-01 | API documentation lists the endpoint | BE-005-08 | Read it | DoD |
| DOC-005-02 | `03-domain-model.md` confirmed to match the migration | BE-005-03 | Compare | DoD |
| DOC-005-03 | `summary.md`, board, delivery log | All | DoD checklist | DoD |

## Droppable If Time Runs Short

| Task | What is lost |
|---|---|
| FE-005-02 debounced search in the picker | Falls back to a plain select of recent customers; fine for a demo, poor at scale |
| TEST-005-08 concurrency test | Weakens the AC-11 evidence, though the sequence still guarantees it |

**Not droppable:** BE-005-02. If the history row is not written by the factory, every
later ticket story inherits an audit trail with a hole at its start.
