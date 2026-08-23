# US-002 — Task Breakdown

**Phase:** 3 · **Role:** Story Planner · **Status:** Complete

## Critical Path

`BE-002-01 → BE-002-03 → FE-002-02`

`GET` by id is what US-001's `Location` header points at, so it unblocks that story's
AC-14 as well.

## Backend

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| BE-002-01 | `GET /api/customers/{id}` returns the projection, `404` for unknown, `400` for malformed | US-001 | Integration tests | AC-1 – AC-3 |
| BE-002-02 | `PagingParameters` clamps page and page size | — | Unit tests at every boundary | AC-5, AC-6 |
| BE-002-03 | `GET /api/customers` returns the paged envelope with defaults | BE-002-02 | Integration test | AC-4, AC-9, AC-10 |
| BE-002-04 | Search matches name, email, and phone case-insensitively, treating pattern characters literally | BE-002-03 | Integration tests including `%` and `_` | AC-7, AC-8 |
| BE-002-05 | The list query is a single projection with no per-row query | BE-002-03 | Executed-command count assertion | AC-11 |
| BE-002-06 | Both endpoints require authentication; OpenAPI metadata complete | BE-002-03 | Integration test; `/swagger` | AC-14 |

## Frontend

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| FE-002-01 | Query hooks for detail and list | BE-002-06 | `npm run typecheck` | — |
| FE-002-02 | `CustomerProfilePage` with loading, error, and not-found states | FE-002-01 | Component test; manual with the API stopped | AC-12 |
| FE-002-03 | `CustomerListPage` with pagination and an empty state | FE-002-01 | Component test | AC-13 |
| FE-002-04 | Debounced search bound to the URL query string | FE-002-03 | Manual: search, navigate away, use the back button | AC-7 |

## Tests

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| TEST-002-01 | Unit: clamping at every boundary | BE-002-02 | Test run | AC-5, AC-6 |
| TEST-002-02 | Integration: `200`, `404`, `400` on detail | BE-002-01 | Test run | AC-1 – AC-3 |
| TEST-002-03 | Integration: envelope shape and defaults | BE-002-03 | Test run | AC-4, AC-5 |
| TEST-002-04 | Integration: search across all three fields | BE-002-04 | Test run | AC-7 |
| TEST-002-05 | Integration: search containing `%`, `_`, and a quote | BE-002-04 | Test run | AC-8 |
| TEST-002-06 | Integration: empty result and page beyond the last | BE-002-03 | Test run | AC-9, AC-10 |
| TEST-002-07 | Integration: executed-command count | BE-002-05 | Test run | AC-11 |
| TEST-002-08 | Component: loading, error, not-found, empty | FE-002-02, FE-002-03 | Test run | AC-12, AC-13 |

## Documentation

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| DOC-002-01 | API documentation lists both endpoints | BE-002-06 | Read it | DoD |
| DOC-002-02 | `summary.md`, board, delivery log | All | DoD checklist | DoD |

## Droppable If Time Runs Short

| Task | What is lost |
|---|---|
| FE-002-04 URL-bound search | Search still works; the result set is not shareable and the back button loses the term |
| BE-002-04 phone matching | Name and email search cover most real use |

**Not droppable:** BE-002-01. US-001's `Location` header points at it, and the demo
flow cannot continue past step one without it.
