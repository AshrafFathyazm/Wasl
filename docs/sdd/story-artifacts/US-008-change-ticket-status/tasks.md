# US-008 — Task Breakdown

**Phase:** 3 · **Role:** Story Planner · **Status:** Complete

## Critical Path

`BE-008-01 → TEST-008-01 → BE-008-02 → BE-008-04 → BE-008-06 → BE-008-08 → FE-008-02`

The tests come second, not last. The transition matrix is the one part of this system
where writing the test first is unambiguously cheaper, because the specification is
already a table.

## Backend

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| BE-008-01 | `TicketStatusTransitions` map encoding the BR-1 matrix | US-005 | Compiles; consumed by TEST-008-01 | AC-2 |
| BE-008-02 | `Ticket.ChangeStatus` enforces the map and rejects forbidden transitions | BE-008-01, TEST-008-01 | Unit tests pass | AC-1, AC-2, AC-13 |
| BE-008-03 | Preconditions: assignee required for `InProgress`, note required when closing from `New` or `Open`, `ClosedAtUtc` set | BE-008-02 | Unit tests | AC-4, AC-5, AC-6, AC-10 |
| BE-008-04 | `Ticket.AllowedTransitions` filtered by the preconditions that currently hold | BE-008-03 | Unit tests, including the unassigned-`Open` case | AC-18, AC-19 |
| BE-008-05 | Distinct exception types mapped to distinct `409` `type` values in the middleware | BE-008-03 | Integration test asserting each `type` | AC-2, AC-8, AC-13 |
| BE-008-06 | `ChangeTicketStatusHandler` writes the `StatusChanged` history row and saves in one transaction | BE-008-03 | Integration test: row present on success, absent on failure | AC-11, AC-12 |
| BE-008-07 | BR-6 authorization: Agent restricted to own or unassigned; Manager unrestricted | BE-008-06 | Integration tests with real tokens for both roles | AC-14, AC-15, AC-16 |
| BE-008-08 | `PUT /api/tickets/{id}/status` endpoint with full OpenAPI metadata | BE-008-05, BE-008-07 | `/swagger` shows `200`, `400`, `401`, `403`, `404`, `409` | AC-1, AC-22 |
| BE-008-09 | `expectedVersion` honoured; mismatch returns `errors/concurrency-conflict` | BE-008-08 | Integration test with two writes against one version | AC-17 |
| BE-008-10 | `allowedTransitions` included in every ticket read shape | BE-008-04 | Integration test on `GET /api/tickets/{id}` | AC-18 |

## Frontend

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| FE-008-01 | Ticket detail query includes `allowedTransitions` in its type | BE-008-10 | `npm run typecheck` | AC-20 |
| FE-008-02 | `StatusActions` renders one button per allowed transition, and nothing when the array is empty | FE-008-01 | Component test; manual on a closed ticket | AC-20 |
| FE-008-03 | `CloseTicketDialog` collects the note when closing from `New` or `Open` | FE-008-02 | Manual run | AC-5, AC-6 |
| FE-008-04 | A server `409` is displayed and the ticket refetched | FE-008-02 | Component test with a mocked `409` | AC-21 |
| FE-008-05 | A concurrency conflict shows an explanation and a reload action, never an automatic retry | FE-008-04 | Manual test with two browser tabs | AC-17 |

## Tests

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| TEST-008-01 | Theory covering all 36 cells of the BR-1 matrix, from a hand-written copy of the table | BE-008-01 | 36 cases pass | AC-2 |
| TEST-008-02 | Unit tests for the assignee precondition and `ClosedAtUtc` | BE-008-03 | Test run | AC-4, AC-10 |
| TEST-008-03 | Unit tests for `AllowedTransitions`, including the unassigned-`Open` case | BE-008-04 | Test run | AC-19 |
| TEST-008-04 | Integration tests for each `409` variant, asserting the `type` value | BE-008-05 | Test run | AC-2, AC-7, AC-8, AC-13 |
| TEST-008-05 | Integration test: note required when closing from `New` and `Open` | BE-008-03 | Test run | AC-5, AC-6 |
| TEST-008-06 | Integration test: history row written on success | BE-008-06 | Test run | AC-11 |
| TEST-008-07 | Integration test: no history row when the save fails | BE-008-06 | Test run | AC-12 |
| TEST-008-08 | Authorization tests for Agent-on-other, Agent-on-own, Agent-on-unassigned, Manager-on-any | BE-008-07 | Test run | AC-14 – AC-16 |
| TEST-008-09 | Integration test for a stale `expectedVersion` | BE-008-09 | Test run | AC-17 |
| TEST-008-10 | Component test: `StatusActions` renders exactly the array it is given | FE-008-02 | Test run | AC-20 |

## Documentation

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| DOC-008-01 | `documentation/api/overview.md` and `error-handling.md` list the endpoint and the new `409` types | BE-008-08 | Read them | DoD |
| DOC-008-02 | ADR-004 confirmed to match what was built, and corrected if not | BE-008-04 | Read it | DoD |
| DOC-008-03 | `summary.md`, board, and delivery log updated | All | DoD checklist | DoD |

## Droppable If Time Runs Short

| Task | What is lost |
|---|---|
| FE-008-03 close dialog | Closing from `New` or `Open` becomes unavailable in the UI; the endpoint still works and the flow still demonstrates |
| FE-008-05 conflict reload UX | The conflict still returns `409` and is shown; the user has to refresh manually |
| TEST-008-07 no-history-on-failure | Weakens the AC-12 evidence. Drop last among the tests |

**Not droppable:** TEST-008-01. Thirty-six cases is the entire point of this story,
and it is the cheapest test in the suite to write. BE-008-07 is also not droppable —
authorization that is not tested is authorization that is not known to work.
