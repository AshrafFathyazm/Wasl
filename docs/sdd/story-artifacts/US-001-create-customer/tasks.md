# US-001 — Task Breakdown

**Phase:** 3 · **Role:** Story Planner · **Status:** Complete

## Critical Path

`BE-001-01 → BE-001-02 → BE-001-03 → BE-001-05 → BE-001-06 → BE-001-07 → FE-001-02`

Everything else improves the story. These make it exist.

## Backend

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| BE-001-01 | `EmailAddress` and `PhoneNumber` value objects parse and normalise, rejecting invalid input | — | `dotnet test tests/Wasl.Domain.Tests --filter EmailAddress\|PhoneNumber` | AC-4, AC-5, AC-6, AC-7 |
| BE-001-02 | `Customer` aggregate with a factory that enforces the at-least-one-contact invariant | BE-001-01 | Unit tests, including the failure case | AC-3 |
| BE-001-03 | EF configuration, migration, and both filtered unique indexes applied to a clean database | BE-001-02 | `dotnet ef database update`; then `SELECT name, is_unique, filter_definition FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.Customers')` | AC-13 |
| BE-001-04 | `DbUpdateException` from a unique-index violation is translated to `DuplicateCustomerException` | BE-001-03 | Integration test forcing the race | AC-13 |
| BE-001-05 | `CreateCustomerCommand`, handler, and validator | BE-001-02 | Application unit tests | AC-2, AC-3, AC-8 |
| BE-001-06 | `POST /api/customers` returns `201` with a correct `Location` | BE-001-05 | Integration test asserting the header and a follow-up `GET` | AC-1, AC-14 |
| BE-001-07 | Duplicate email and duplicate phone return `409` with `errors/duplicate-customer` and the field name, and no other detail | BE-001-04, BE-001-06 | Integration tests | AC-8 – AC-12 |
| BE-001-08 | The endpoint requires authentication | Walking skeleton | Integration test without a token | AC-15 |
| BE-001-09 | OpenAPI metadata declares `201`, `400`, `401`, and `409` | BE-001-07 | Inspect `/swagger` | Contract |

## Frontend

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| FE-001-01 | Zod schema and generated types matching the contract | BE-001-09 | `npm run typecheck` | AC-16 |
| FE-001-02 | `CustomerForm` submits and navigates to the created customer | FE-001-01, BE-001-06 | Manual run against the API | AC-1, AC-16 |
| FE-001-03 | Client-side validation renders field-level messages before submit | FE-001-01 | Component test | AC-16 |
| FE-001-04 | Loading state, and the submit button disabled while pending | FE-001-02 | Component test; manual with a throttled network | AC-16, AC-17 |
| FE-001-05 | A `409` message is attached to the field the server named | FE-001-02 | Component test with a mocked `409` | AC-16 |

## Tests

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| TEST-001-01 | Unit tests for email and phone normalisation across the edge-case list | BE-001-01 | Test run | AC-4 – AC-7 |
| TEST-001-02 | Unit test for the contact invariant, both directions | BE-001-02 | Test run | AC-3 |
| TEST-001-03 | Integration test for the happy path plus `Location` retrieval | BE-001-06 | Test run | AC-1, AC-14 |
| TEST-001-04 | Integration tests for each `400` variant | BE-001-05 | Test run | AC-2, AC-3, AC-5, AC-7 |
| TEST-001-05 | Integration tests for `409` on email and on phone, including mixed case | BE-001-07 | Test run | AC-8 – AC-10 |
| TEST-001-06 | Integration test asserting two customers may share a name | BE-001-06 | Test run | AC-11 |
| TEST-001-07 | Integration test asserting the `409` body contains no existing-customer detail | BE-001-07 | Test run | AC-12 |
| TEST-001-08 | Concurrency test: two simultaneous identical requests produce one `201` and one `409` | BE-001-04 | Test run | AC-13 |
| TEST-001-09 | Integration test for `401` without a token | BE-001-08 | Test run | AC-15 |

## Documentation

| ID | Outcome | Depends on | Verified by | Serves |
|---|---|---|---|---|
| DOC-001-01 | `documentation/api/overview.md` lists the endpoint | BE-001-09 | Read it | DoD |
| DOC-001-02 | `summary.md` written with trade-offs and limitations | All | DoD checklist | DoD |
| DOC-001-03 | Board and delivery log updated | DOC-001-02 | Read them | DoD |

## Droppable If Time Runs Short

| Task | What is lost |
|---|---|
| FE-001-03 client-side validation | The server still rejects invalid input correctly; the user finds out one round trip later |
| BE-001-04 exception translation | AC-13 degrades from a clean `409` to a `500` under a genuine race, which is rare in a demo but is a real defect. Drop only as a last resort, and record it |

**Not droppable:** BE-001-03. Without the unique indexes, the duplicate rule is a
suggestion rather than a guarantee, and AC-13 cannot pass at all.
