# US-007 — Task Breakdown

**Phase:** 3 · **Role:** Story Planner · **Status:** Complete

## Critical Path

`BE-007-01 → BE-007-02 → BE-007-04 → BE-007-05 → FE-007-02`

## Backend

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| BE-007-01 | `Ticket.AssignTo` rejects closed tickets and no-ops, and appends the history row | US-005 | Unit tests | AC-8, AC-9, AC-11 |
| BE-007-02 | `TicketAssignmentPolicy` implements all four BR-2 branches | — | Unit tests covering every combination of role, current assignee, and target | AC-1 – AC-5 |
| BE-007-03 | Target user validated: unknown yields `404`, inactive yields `400` | BE-007-02 | Integration tests | AC-6, AC-7 |
| BE-007-04 | `AssignTicketHandler` wires policy, domain, history, and save into one transaction | BE-007-01, BE-007-02 | Integration test | AC-1, AC-9 |
| BE-007-05 | `PUT /api/tickets/{id}/assignee` with full OpenAPI metadata | BE-007-04 | `/swagger`; integration test | AC-1, AC-14 |
| BE-007-06 | `expectedVersion` honoured | BE-007-05 | Integration test with two writes | AC-12 |
| BE-007-07 | `GET /api/support-users` returns active users only | — | Integration test with an inactive user seeded | AC-13 |
| BE-007-08 | Status is unchanged by assignment | BE-007-04 | Integration test asserting the status before and after | AC-10 |

## Frontend

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| FE-007-01 | Support-users query hook | BE-007-07 | `npm run typecheck` | AC-13 |
| FE-007-02 | `AssigneeSelect` assigns and unassigns from the ticket detail screen | FE-007-01, BE-007-05 | Manual run as both roles | AC-1, AC-2, AC-15 |
| FE-007-03 | Picker disabled for an Agent when the rule forbids the action | FE-007-02 | Manual run as an Agent on another's ticket | AC-15 |
| FE-007-04 | A `403` from the server is displayed clearly | FE-007-02 | Component test with a mocked `403` | AC-15 |

## Tests

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| TEST-007-01 | Unit: policy across every role and assignee combination | BE-007-02 | Test run | AC-1 – AC-5 |
| TEST-007-02 | Unit: `AssignTo` on a closed ticket and on a no-op | BE-007-01 | Test run | AC-8, AC-11 |
| TEST-007-03 | Integration: Manager assigns any ticket to any user | BE-007-05 | Test run | AC-1 |
| TEST-007-04 | Integration: Agent self-assigns an unassigned ticket | BE-007-05 | Test run | AC-2 |
| TEST-007-05 | Integration: Agent assigns to another user, `403` | BE-007-05 | Test run | AC-3 |
| TEST-007-06 | Integration: Agent reassigns another's ticket, `403` | BE-007-05 | Test run | AC-4 |
| TEST-007-07 | Integration: Agent unassigns their own ticket | BE-007-05 | Test run | AC-5 |
| TEST-007-08 | Integration: inactive `400`, unknown `404` | BE-007-03 | Test run | AC-6, AC-7 |
| TEST-007-09 | Integration: history rows for assign and unassign, with old and new values | BE-007-04 | Test run | AC-9 |
| TEST-007-10 | Integration: stale `expectedVersion` | BE-007-06 | Test run | AC-12 |

## Documentation

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| DOC-007-01 | API documentation lists both endpoints | BE-007-05 | Read it | DoD |
| DOC-007-02 | `summary.md`, board, delivery log | All | DoD checklist | DoD |

## Droppable If Time Runs Short

| Task | What is lost |
|---|---|
| FE-007-03 disabled picker | The user sees a `403` after acting instead of before; correct but worse |
| BE-007-08's dedicated test | AC-10 is still covered incidentally by other assignment tests |

**Not droppable:** TEST-007-05 and TEST-007-06. They are the only proof that the
authorization matrix is enforced rather than described, and they are what US-008's
authorization work builds on.
