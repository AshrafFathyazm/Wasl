# Definition of Done

A story is Done only when every applicable item is satisfied **and** the artifact
that evidences it exists. The right-hand column names that artifact.

## Specification

| ✓ | Item | Evidence |
|---|---|---|
| ☐ | Scope and out-of-scope are explicit | `spec.md` |
| ☐ | Every acceptance criterion is testable as written | `spec.md` |
| ☐ | Assumptions are recorded, not silently held | `spec.md` |
| ☐ | Edge cases and failure cases are listed | `spec.md` |
| ☐ | Referenced business rules are cited by ID | `spec.md` |

## Planning

| ✓ | Item | Evidence |
|---|---|---|
| ☐ | The plan names the files it will create or change | `plan.md` |
| ☐ | At least one alternative was considered and rejected with a reason | `plan.md` |
| ☐ | Tasks are ordered, dependency-aware, and individually verifiable | `tasks.md` |

## Backend

| ✓ | Item | Evidence |
|---|---|---|
| ☐ | Business rules implemented in the domain, not the controller | `backend.md`, `review.md` |
| ☐ | Input validated at the boundary | `backend.md` |
| ☐ | Errors go through the shared middleware and match the contract | `05-api-conventions.md`, `tests.md` |
| ☐ | Status codes match the convention table | `tests.md` |
| ☐ | `CancellationToken` threaded through async paths | `review.md` |

## Database

| ✓ | Item | Evidence |
|---|---|---|
| ☐ | Schema change reviewed against `03-domain-model.md` | `backend.md` |
| ☐ | Constraints exist where an invariant must hold | `backend.md` |
| ☐ | Every new index is justified by a named query | `backend.md` |
| ☐ | Migration created, applied, and verified on a clean database | `tests.md` |

## Frontend

| ✓ | Item | Evidence |
|---|---|---|
| ☐ | UI connected to the real API, no hardcoded data | `frontend.md` |
| ☐ | Loading state handled | `frontend.md` |
| ☐ | Error state handled and shows the server message | `frontend.md` |
| ☐ | Validation feedback is field-level and understandable | `frontend.md` |
| ☐ | Empty state handled where a list can be empty | `frontend.md` |

## Design

| ✓ | Item | Evidence |
|---|---|---|
| ☐ | A preview was rendered and approved before the screen was built | `frontend.md` |
| ☐ | Any divergence from the approved preview is recorded with a reason | `frontend.md` |
| ☐ | No hard-coded colour, spacing, or radius; semantic tokens only | `frontend.md`, `review.md` |
| ☐ | Built from the eight primitives; any new component has a written reason | `frontend.md` |
| ☐ | Every interactive element is keyboard reachable with a visible focus ring | `frontend.md` |
| ☐ | Disabled, loading, and error states exist, not just the default | `frontend.md` |

## Audit

| ✓ | Item | Evidence |
|---|---|---|
| ☐ | Every state-changing operation in this story writes an audit row (BR-9.1) | `backend.md`, `tests.md` |
| ☐ | The audit row is in the same transaction as the change, and absent when it rolls back (BR-9.3) | `tests.md` |
| ☐ | Any denial or failure this story can produce writes a row (BR-9.2) | `tests.md` |
| ☐ | Nothing sensitive appears in `Changes` (BR-9.7) | `review.md` |
| ☐ | The command implements `IAuditableCommand`; the architecture test passes | `backend.md` |

## Localization

| ✓ | Item | Evidence |
|---|---|---|
| ☐ | No user-facing string is hard-coded; every one comes from a catalogue | `frontend.md`, lint rule |
| ☐ | Every new key exists in both `en` and `ar` | Key-parity test |
| ☐ | Server-authored messages added by this story are translated | `backend.md` |
| ☐ | Machine-readable values are untranslated (BR-8.7) | `tests.md` |
| ☐ | Every screen touched was viewed in Arabic and renders right-to-left correctly | `frontend.md` |
| ☐ | Any new layout uses CSS logical properties, not `left` / `right` | `review.md` |
| ☐ | Any counted noun uses plural forms, not string concatenation | `review.md` |

## Testing

| ✓ | Item | Evidence |
|---|---|---|
| ☐ | Unit tests cover the business rules this story implements | `tests.md` |
| ☐ | Integration tests cover the happy path and the main failure path | `tests.md` |
| ☐ | Every acceptance criterion maps to a named test | `tests.md` |
| ☐ | Test commands and their output are recorded, not asserted from memory | `tests.md` |
| ☐ | Anything knowingly untested is listed with a reason | `tests.md` |

## AI usage

| ✓ | Item | Evidence |
|---|---|---|
| ☐ | What AI produced is recorded | `ai-notes.md` |
| ☐ | What was modified or rejected is recorded, with reasons | `ai-notes.md` |
| ☐ | Every accepted output was run, not just read | `ai-notes.md` |
| ☐ | No secrets or production data were placed in a prompt | `ai-notes.md` |
| ☐ | Every referenced API, package, and method was confirmed to exist | `ai-notes.md` |

## Review

| ✓ | Item | Evidence |
|---|---|---|
| ☐ | Layer boundaries respected | `review.md` |
| ☐ | Security basics checked against `testing/security-checklist.md` | `review.md` |
| ☐ | No scope creep beyond the approved specification | `review.md` |
| ☐ | Verdict recorded as Approved | `review.md` |

## Summary and documentation

| ✓ | Item | Evidence |
|---|---|---|
| ☐ | What changed and why is written down | `summary.md` |
| ☐ | Trade-offs and rejected alternatives recorded | `summary.md` |
| ☐ | Known limitations stated honestly | `summary.md` |
| ☐ | API documentation and OpenAPI updated if the contract changed | `summary.md` |
| ☐ | Documentation describes what was built, not what was intended | `documentation/` |
| ☐ | Board and delivery log updated | `08-board.md`, `12-delivery-log.md` |

## The ownership test

Independent of the checklist, one question must be answerable for every part of the
story: **can I explain why this is here, and change it without help?**

If the answer is no for any file in the diff, the story is not Done, regardless of
whether the tests pass.
