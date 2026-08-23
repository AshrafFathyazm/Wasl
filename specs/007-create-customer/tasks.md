# 007 — Task Breakdown

**Phase:** 1 · **Story:** US-001 · **Role:** Story Planner · **Skill:** `speckit-tasks`
· **Status:** Migrated from `docs/sdd/story-artifacts/US-001-create-customer/tasks.md`
2026-08-23, with the `Agent` and `Skill` columns added and the schema tasks re-split
against `001-solution-skeleton`.

Agents named here are **not dispatched until the plan is approved**. Naming is the plan.

## Critical path

```text
BE-007-01 → BE-007-02 → BE-007-03 → BE-007-05 → BE-007-06 → BE-007-07 → FE-007-02
```

Everything else improves the story. These make it exist.

## Backend

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| BE-007-01 | `EmailAddress` and `PhoneNumber` value objects parse and normalise, rejecting invalid input | `001` | `dotnet test tests/Wasl.Domain.Tests --filter "EmailAddress\|PhoneNumber"` | AC-4 – AC-7 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-007-02 | `Customer` gains a factory enforcing the at-least-one-contact invariant; the shell from `001` becomes a real aggregate | BE-007-01 | Unit tests, including the failure case | AC-3, BR-4.1 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-007-03 | Migration `AddCustomerDuplicateIndexes` adds both filtered unique indexes, with a case-insensitive collation on `Email` | BE-007-02 | `dotnet ef database update`, then `SELECT name, is_unique, filter_definition FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.Customers')` — `filter_definition` must be **non-null** | AC-13, BR-4.8 | `voltagent-lang:sql-pro` | — |
| BE-007-04 | A unique-index violation surfaces as `DuplicateCustomerException`, not `DbUpdateException` | BE-007-03 | Integration test forcing the race | AC-13 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-007-05 | `CreateCustomerCommand`, handler, and FluentValidation validator, in one slice folder | BE-007-02 | Unit tests | AC-2, AC-3, AC-8 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-007-06 | `POST /api/customers` returns `201` with a correct `Location`, matching the frozen contract | BE-007-05 | Integration test asserting the header, then a `GET` on it | AC-1, AC-14 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-007-07 | Duplicate email and duplicate phone return `409` with `errors/duplicate-customer`, the field name, and nothing else | BE-007-04, BE-007-06 | Integration tests | AC-8 – AC-12 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-007-08 | The endpoint requires authentication | `004` | Integration test without a token | AC-15 | `voltagent-lang:dotnet-core-expert` | — |
| BE-007-09 | The command implements `IAuditableCommand` with action `Customer.Created`; the audit row is written in the same transaction | `003`, BE-007-05 | Integration test asserting one audit row, and none after a forced rollback | BR-9.1, BR-9.3 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-007-10 | OpenAPI metadata declares `201`, `400`, `401`, and `409` | BE-007-07 | `/swagger` inspected, then compared against `contracts/customers-api.md` | Contract | `voltagent-lang:dotnet-core-expert` | — |

`BE-007-09` is new in this migration. The original `tasks.md` predates ADR-008, so no
task carried the audit obligation — and an audit gap is exactly the kind of omission
`NFR-10`'s architecture test exists to catch. It would have failed the build.

## Frontend

Starts as soon as [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md) exists. It does not
wait for `BE-007-06`.

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| FE-007-00 | Screen preview: real tokens, real copy, plausible data, all five states, both languages. **Approved before any wiring** | `006` | Rendered and reviewed (Phase 3b) | AC-16 | `ui-ux-pro-max:ui-styling` | `frontend-design` |
| FE-007-01 | Zod schema and request/response types matching the contract. Types marked **provisional** until generated from OpenAPI | Contract frozen | `npm run typecheck` | AC-16 | `voltagent-lang:typescript-pro` | — |
| FE-007-02 | `CustomerForm` submits and navigates using the `Location` header | FE-007-01, BE-007-06 | Manual run against the API | AC-1, AC-16 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-007-03 | Client-side validation renders field-level messages before submit, including the at-least-one-contact rule on **both** fields | FE-007-01 | Component test | AC-3, AC-16 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-007-04 | Loading state; submit disabled while pending so a double-click sends one request | FE-007-02 | Component test, plus a manual run with a throttled network | AC-16, AC-17 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-007-05 | A `409` message attaches to the field the server named, not to a banner | FE-007-02 | Component test with a mocked `409` | AC-16 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-007-06 | Provisional types replaced with types generated from the OpenAPI document | BE-007-10 | `npm run typecheck` after regeneration | ADR-011 | `voltagent-lang:typescript-pro` | — |
| FE-007-07 | Every string from a catalogue, present in `en` and `ar`; the screen viewed in Arabic and rendering RTL correctly | `005`, FE-007-02 | Key-parity test, plus the Arabic pass recorded in `tests.md` | BR-8.8, BR-8.11 | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |

## Tests

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| TEST-007-01 | Email and phone normalisation across the edge-case list | BE-007-01 | Test run | AC-4 – AC-7 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-007-02 | The contact invariant, both directions | BE-007-02 | Test run | AC-3 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-007-03 | Happy path plus retrieval via `Location` | BE-007-06 | Test run | AC-1, AC-14 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-007-04 | Each `400` variant | BE-007-05 | Test run | AC-2, AC-3, AC-5, AC-7 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-007-05 | `409` on email and on phone, including mixed case | BE-007-07 | Test run | AC-8 – AC-10 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-007-06 | Two customers may share a name | BE-007-06 | Test run | AC-11, BR-4.6 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-007-07 | The `409` body contains no existing-customer detail | BE-007-07 | Test run | AC-12, BR-4.7 | `comprehensive-review:security-auditor` | — |
| TEST-007-08 | Two simultaneous identical requests produce one `201` and one `409` | BE-007-04 | Test run | AC-13 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-007-09 | `401` without a token | BE-007-08 | Test run | AC-15 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-007-10 | One audit row per create; none after a rolled-back transaction | BE-007-09 | Test run | BR-9.1, BR-9.3 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-007-11 | An Arabic `fullName` round-trips byte-identical through create and read | BE-007-06 | Test run | ADR-013 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |

## Documentation

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| DOC-007-01 | `docs/sdd/documentation/api/overview.md` lists the endpoint | BE-007-10 | Read it | DoD | main session | — |
| DOC-007-02 | `summary.md` written: what changed, trade-offs, known limitations | All | DoD checklist | DoD | main session | — |
| DOC-007-03 | `tests.md` and `ai-notes.md` completed with **observed** output; board and delivery log updated | DOC-007-02 | The `verify-story` gate | DoD | main session | `verify-story` |

## Review

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| REV-007-01 | Layer boundaries, correctness against every AC, scope creep | All | `review.md` verdict `Approved` | DoD | `comprehensive-review:code-reviewer` | `code-review:code-review` |
| REV-007-02 | Security: the `409` leaks nothing, no PII in logs, no secret in the diff | BE-007-07 | `review.md` | DoD | `comprehensive-review:security-auditor` | — |
| REV-007-03 | Generated OpenAPI compared against `contracts/customers-api.md` | BE-007-10 | Any difference fixed in one of the two before closing | DoD | main session | — |

## Droppable if time runs short

| Task | What is lost |
|---|---|
| FE-007-03 client-side validation | The server still rejects invalid input correctly; the user finds out one round trip later |
| BE-007-04 exception translation | AC-13 degrades from a clean `409` to a `500` under a genuine race — rare in a demo, still a real defect. Drop only as a last resort, and record it |

**Not droppable:** BE-007-03. Without the filtered unique indexes the duplicate rule is
a suggestion rather than a guarantee, and AC-13 cannot pass at all.

**Not droppable:** BE-007-09. An audit row added after the handler exists is an audit
row with an invisible hole, and the architecture test fails the build without it.
