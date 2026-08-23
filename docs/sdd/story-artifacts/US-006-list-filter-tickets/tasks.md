# US-006 — Task Breakdown

**Phase:** 3 · **Role:** Story Planner · **Status:** Complete

## Critical Path

`BE-006-01 → BE-006-02 → BE-006-03 → FE-006-02`

This story sits late in the build order and is the safest to compress. The critical
path above is what must survive; everything below it is improvement.

## Backend

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| BE-006-01 | `TicketFilterSpecification` composes all seven filters with correct AND and OR semantics | US-005 | Unit tests per filter and per combination | AC-4, AC-5 |
| BE-006-02 | `ListTicketsHandler` projects to a flat DTO with names included, pages, and counts | BE-006-01 | Integration test | AC-1, AC-12, AC-13 |
| BE-006-03 | `GET /api/tickets` binds repeated query-string keys and clamps paging | BE-006-02 | Integration test with repeated keys | AC-1 – AC-3, AC-5 |
| BE-006-04 | `search` across ticket number, subject, and customer name, treating pattern characters literally | BE-006-02 | Integration tests including `%` and `_` | AC-6, AC-7 |
| BE-006-05 | `assignee=me` and `assignee=unassigned` resolved server-side | BE-006-03 | Integration tests as two different users | AC-8, AC-9 |
| BE-006-06 | Invalid filter values return `400` listing the accepted values | BE-006-03 | Integration test per enum | AC-10 |
| BE-006-07 | Executed-command count stays constant as the page size grows | BE-006-02 | Assertion with 50 rows | AC-12 |
| BE-006-08 | OpenAPI metadata documents every parameter and status code | BE-006-06 | `/swagger` | Contract |

## Frontend

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| FE-006-01 | `useTicketFilters` derives filter state from the URL search params | BE-006-08 | Unit test on parse and serialise | AC-14 |
| FE-006-02 | `TicketTable` renders all required columns with loading and empty states | FE-006-01 | Component test | AC-13, AC-15 |
| FE-006-03 | `TicketFilterBar` with multi-select per dimension | FE-006-01 | Manual run | AC-4, AC-5 |
| FE-006-04 | Pagination controls with a total count | FE-006-02 | Manual run across pages | AC-1 |
| FE-006-05 | Filters survive a reload and the back button | FE-006-01 | Manual: filter, reload, go back | AC-14 |
| FE-006-06 | Error state when the API is unreachable | FE-006-02 | Manual with the API stopped | AC-15 |

## Tests

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| TEST-006-01 | Unit: each filter in isolation | BE-006-01 | Test run | AC-4 |
| TEST-006-02 | Unit: AND across dimensions, OR within one | BE-006-01 | Test run | AC-4, AC-5 |
| TEST-006-03 | Integration: envelope, defaults, clamping at every boundary | BE-006-03 | Test run | AC-1 – AC-3 |
| TEST-006-04 | Integration: repeated query-string keys produce OR | BE-006-03 | Test run | AC-5 |
| TEST-006-05 | Integration: search across all three fields | BE-006-04 | Test run | AC-6 |
| TEST-006-06 | Integration: search containing `%`, `_`, and a quote | BE-006-04 | Test run | AC-7 |
| TEST-006-07 | Integration: `me` and `unassigned` | BE-006-05 | Test run | AC-8, AC-9 |
| TEST-006-08 | Integration: invalid enum returns `400` with the accepted values | BE-006-06 | Test run | AC-10 |
| TEST-006-09 | Integration: empty result and page beyond the last | BE-006-03 | Test run | AC-11 |
| TEST-006-10 | Integration: executed-command count | BE-006-07 | Test run | AC-12 |
| TEST-006-11 | Unit: filter parse and serialise round-trip | FE-006-01 | Test run | AC-14 |

## Documentation

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| DOC-006-01 | API documentation lists every filter parameter | BE-006-08 | Read it | DoD |
| DOC-006-02 | The search scaling limit recorded in `summary.md` | BE-006-04 | Read it | DoD |
| DOC-006-03 | Board and delivery log | All | DoD checklist | DoD |

## Compression plan

This is the designated story to compress. In order of what is given up first:

| Cut | What is lost | Still true |
|---|---|---|
| FE-006-03 multi-select, reduced to single-select | OR within a dimension is unreachable from the UI | The API still supports it, and TEST-006-04 still proves it |
| BE-006-04 search | Finding a ticket requires filtering rather than typing its number | Filters still work |
| BE-006-05 `me` and `unassigned` | The most common filter needs an explicit user selection | The assignee filter still works with an id |
| FE-006-05 URL binding | Filters reset on reload | Filtering still works within a session |

**Not droppable:** BE-006-02 and TEST-006-10. A list that issues a query per row is
the defect this story is most likely to ship, and it is invisible until someone looks.
