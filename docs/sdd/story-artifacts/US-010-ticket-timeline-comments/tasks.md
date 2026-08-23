# US-010 — Task Breakdown

**Phase:** 3 · **Role:** Story Planner · **Status:** Complete

## Critical Path

`BE-010-01 → BE-010-02 → BE-010-04 → BE-010-05 → FE-010-02 → FE-010-03`

## Backend

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| BE-010-01 | `TicketComment` entity, configuration, migration, and index | US-005 | `dotnet ef database update`; `sys.indexes` on `dbo.TicketComments` | AC-1 |
| BE-010-02 | `Ticket.AddComment` validates the body, rejects a closed ticket, appends both rows | BE-010-01 | Unit tests | AC-2 – AC-4, AC-8 |
| BE-010-03 | `POST /api/tickets/{id}/comments`; author taken from the token | BE-010-02 | Integration test supplying a false author id | AC-1, AC-15, AC-16 |
| BE-010-04 | `TimelineQuery` unions comments and history into the common projection | BE-010-01 | Integration test on ordering | AC-9, AC-11 |
| BE-010-05 | Timeline pagination correct across the union boundary | BE-010-04 | Integration test on a page spanning both sources | AC-12 |
| BE-010-06 | Deterministic tie-break for same-instant entries | BE-010-04 | Integration test repeating the same request | AC-10 |
| BE-010-07 | Actor names resolved in the same query, not per entry | BE-010-04 | Executed-command count assertion | AC-14 |
| BE-010-08 | `GET /api/tickets/{id}/timeline` with full OpenAPI metadata | BE-010-05 | `/swagger` | AC-9 |
| BE-010-09 | Confirm no edit or delete endpoint exists for comments | BE-010-03 | Read the controller; assert `405` on `DELETE` | AC-13 |

## Frontend

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| FE-010-01 | Timeline and comment types generated from the contract | BE-010-08 | `npm run typecheck` | — |
| FE-010-02 | `TimelineEntry` narrows on `entryType` and renders each distinctly | FE-010-01 | Component test with both types | AC-17 |
| FE-010-03 | `CommentComposer` posts and refreshes the timeline | FE-010-02, BE-010-03 | Manual run | AC-1 |
| FE-010-04 | Internal comments visually distinct | FE-010-02 | Component test | AC-5 |
| FE-010-05 | Load-older action for pagination | BE-010-05 | Manual run on a ticket with over 50 entries | AC-12 |
| FE-010-06 | Composer hidden on a closed ticket; `409` still handled | FE-010-03 | Manual run on a closed ticket | AC-4 |
| FE-010-07 | Empty, loading, and error states | FE-010-02 | Component test | AC-17 |

## Tests

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| TEST-010-01 | Unit: body validation, empty, whitespace, boundary length | BE-010-02 | Test run | AC-2, AC-3 |
| TEST-010-02 | Unit: comment rejected on a closed ticket | BE-010-02 | Test run | AC-4 |
| TEST-010-03 | Unit: both the comment and the history row appended | BE-010-02 | Test run | AC-8 |
| TEST-010-04 | Integration: `201`, `400` variants, `409` closed, `404` unknown | BE-010-03 | Test run | AC-1 – AC-4, AC-16 |
| TEST-010-05 | Integration: `isInternal` and `channel` round-trip | BE-010-03 | Test run | AC-5 – AC-7 |
| TEST-010-06 | Integration: history row excludes the comment body | BE-010-02 | Test run | AC-8 |
| TEST-010-07 | Integration: merged order across both sources | BE-010-04 | Test run | AC-9 |
| TEST-010-08 | Integration: same-instant entries order identically on repeat | BE-010-06 | Test run | AC-10 |
| TEST-010-09 | Integration: a page spanning the union boundary is correct and complete | BE-010-05 | Test run | AC-12 |
| TEST-010-10 | Integration: executed-command count for the timeline | BE-010-07 | Test run | AC-14 |
| TEST-010-11 | Component: a body containing a script tag renders as text | FE-010-02 | Test run | Security |

## Documentation

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| DOC-010-01 | API documentation lists both endpoints and the timeline shape | BE-010-08 | Read it | DoD |
| DOC-010-02 | The union decision recorded in `summary.md` | BE-010-04 | Read it | DoD |
| DOC-010-03 | Board and delivery log | All | DoD checklist | DoD |

## Droppable If Time Runs Short

| Task | What is lost |
|---|---|
| FE-010-05 load-older | The timeline shows the most recent 50 with no way back. Acceptable in a demo, incomplete as a feature |
| BE-010-06 tie-break | Same-instant ordering becomes non-deterministic — rare, and cosmetic when it happens |
| FE-010-04 internal styling | Internal comments still store correctly and are still distinguishable in the payload |

**Not droppable:** BE-010-04 and TEST-010-09. The merge is the substance of this
story, and a merge whose pagination is wrong is worse than two separate lists, because
it silently drops entries.
