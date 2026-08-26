# 012 — Task Breakdown

**Phase:** 2 · **Story:** US-008 · **Feature:** `012-change-ticket-status` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

Agents named here are **not dispatched until the plan is approved**. Naming is the plan.

What changed in the migration, beyond the header:

| Change | Reason |
|---|---|
| `BE-008-nn` → `BE-012-nn`, and every `Depends on` updated with it | A task ID names the feature folder it lives in (`specs/README.md`) |
| `Agent` and `Skill` columns on every row | Ownership is part of the plan, not something decided at dispatch time |
| `BE-012-11` and `BE-012-12` added — the audit obligation | The original predates ADR-008, so **no task carried it**. NFR-10's architecture test fails the build for a command that does not implement `IAuditableCommand`, so the first compiling commit would have been red. `BE-012-12` exists because this feature has a `403` path, and BR-9.2/BR-9.4 put that row **outside** any transaction |
| `TEST-012-11` and `TEST-012-12` added | An audit row nobody asserts is an audit row nobody knows about |
| `FE-012-00` added — screen preview | Rendering a screen costs minutes. Changing one that already has tests, translation keys, and query wiring costs hours (ADR-009) |
| `FE-012-06`, `FE-012-07` added | The provisional-types swap and the Arabic walk are obligations in `09-definition-of-done.md` that no task owned |
| `REV-012-01` … `REV-012-04` added | The original had no review section. `REV-012-03` compares the generated OpenAPI against `contracts/ticket-status-api.md` |
| Paths moved out of `Wasl.Application` / `Wasl.Infrastructure` | ADR-010. See `plan.md` **Migration note** |

## Critical path

```text
BE-012-01 → TEST-012-01 → BE-012-02 → BE-012-03 → BE-012-04
          → BE-012-06 → BE-012-08 → FE-012-02
```

**The test comes second, not last, and that is the whole point of this feature.**
The specification is already a table — 6 × 6 cells in BR-1 — so turning it into an
xUnit `[Theory]` with `[MemberData]` takes about twenty minutes, and after that the
implementation has somewhere to fail. Written the other way round, the map is read back
by a test derived from it and the 36 cases prove only that the implementation equals
itself.

`TEST-012-01` therefore sits **before** `BE-012-02` on the path, and is expected to be
red when it is committed.

## Backend

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| BE-012-01 | `TicketStatusTransitions` — a `FrozenDictionary` encoding the BR-1 matrix, in `Wasl.Domain/Tickets/` | `009` | Compiles; consumed by TEST-012-01 | AC-2 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-012-02 | `Ticket.ChangeStatus` enforces the map and rejects forbidden transitions, same-status, and any transition out of `Closed` with distinct exceptions | BE-012-01, TEST-012-01 | `dotnet test tests/Wasl.Domain.Tests --filter TicketStatusTransition` — 36 cases green | AC-1, AC-2, AC-8, AC-13 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-012-03 | Preconditions: assignee required for `InProgress`, note required when closing from `New` or `Open`, `ClosedAtUtc` set from the injected `TimeProvider` | BE-012-02 | Unit tests, including a fixed clock asserting `ClosedAtUtc` exactly | AC-4, AC-5, AC-6, AC-10 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-012-04 | `Ticket.AllowedTransitions` filtered by the preconditions that currently hold | BE-012-03 | Unit tests, including the unassigned-`Open` case | AC-18, AC-19 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-012-05 | Four exception types mapped to four distinct `409` `type` values, plus `DbUpdateConcurrencyException` → `errors/concurrency-conflict`, in the shared middleware | BE-012-03, `002` | Integration test asserting each `type` string | AC-2, AC-8, AC-13, AC-17 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-012-06 | `ChangeTicketStatusHandler` writes the `StatusChanged` history row and saves inside the one transaction opened by the behaviour | BE-012-03, `003` | Integration test: row present on success, absent after a forced failure | AC-11, AC-12 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-012-07 | BR-6 authorization: Agent restricted to own or unassigned; Manager unrestricted. Data-dependent, so in the handler — the endpoint cannot see the assignee | BE-012-06, `004` | Integration tests with real tokens for both roles | AC-14, AC-15, AC-16 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-012-08 | `PUT /api/tickets/{id}/status` minimal-API endpoint in the slice folder, with full OpenAPI metadata | BE-012-05, BE-012-07 | `/swagger` shows `200`, `400`, `401`, `403`, `404`, `409`, then compared against `contracts/ticket-status-api.md` | AC-1, AC-22, Contract | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-012-09 | `expectedVersion` decoded from base64 and compared to the loaded `rowversion` **before** the transition is evaluated; `SaveChanges` keeps the `rowversion` check | BE-012-08 | Integration test with two writes against one version: one `200`, one `409 errors/concurrency-conflict` | AC-17 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-012-10 | `allowedTransitions` present in the ticket read shape **and** in the `200` of this endpoint, recomputed for the new status | BE-012-04, `010` | Integration test on `GET /api/tickets/{id}` and on the `PUT` response | AC-18, AC-23 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-012-11 | `ChangeTicketStatusCommand` implements `IAuditableCommand` with action `Ticket.StatusChanged` (BR-9 naming table); the row is written by the pipeline behaviour in the **same transaction** as the change (BR-9.3), never by the handler | `003`, BE-012-06 | Integration test asserting one audit row on success and **none** after a forced rollback | AC-24, BR-9.1, BR-9.3, NFR-10 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-012-12 | The `403` from BE-012-07 writes one `Auth.Forbidden` row with `Outcome = Denied`, **outside** any business transaction — there is none to join (BR-9.4) | BE-012-07, `003` | Integration test: the denied call leaves exactly one audit row and changes no ticket | AC-25, BR-9.2, BR-9.4 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |

`BE-012-11` and `BE-012-12` are new in this migration. The original `tasks.md` predates
ADR-008, so nothing carried the audit obligation. Two consequences, both build-breaking
or silent: NFR-10's architecture test fails on any `ICommand` that does not implement
`IAuditableCommand`, and a status change with no forensic record looks completely
correct in every test that reads the timeline — because `TicketHistory` is still written.
That is the failure worth naming here.

## Frontend

Starts as soon as [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md) exists. It does not
wait for `BE-012-08`.

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| FE-012-00 | Screen preview of the take-action menu, the confirm dialog, the close-with-note dialog, and the conflict banner: real tokens, real copy, all seven states, both languages. **Approved before any wiring** | `006` | Rendered and reviewed (Phase 3b) | AC-20, AC-21 | `ui-ux-pro-max:ui-styling` | `frontend-design` |
| FE-012-01 | Ticket detail query type includes `allowedTransitions` and `version`; request type includes `expectedVersion`. Types marked **provisional** until generated from OpenAPI | Contract frozen | `npm run typecheck` | AC-20 | `voltagent-lang:typescript-pro` | — |
| FE-012-02 | `StatusActions` renders one item per allowed transition, and nothing when the array is empty | FE-012-00, FE-012-01 | Component test; manual on a closed ticket | AC-20 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-012-03 | `ConfirmTransitionDialog` collects the required note when closing from `New` or `Open`, and shows the server's `400` on the note field | FE-012-02 | Component test with a mocked `400`, plus a manual run | AC-5, AC-6 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-012-04 | A server `409` is displayed and the ticket refetched; `errors/same-status-transition` refetches **without** an error message | FE-012-02 | Component test with a mocked `409` per `type` | AC-21 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-012-05 | A concurrency conflict shows an explanation and a reload action, never an automatic retry | FE-012-04 | Manual test with two browser tabs | AC-17 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-012-06 | Provisional types replaced with types generated from the OpenAPI document | BE-012-10 | `npm run typecheck` after regeneration | ADR-011 §6 | `voltagent-lang:typescript-pro` | — |
| FE-012-07 | Every string from a catalogue, present in `en` and `ar`; the take-action menu, both dialogs, and the conflict banner viewed in Arabic and rendering RTL correctly; keyboard reachable with a visible focus ring | `005`, FE-012-05 | Key-parity test, plus the Arabic pass recorded in `tests.md` | BR-8.8, BR-8.11, BR-8.14 | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |

## Tests

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| TEST-012-01 | `[Theory]` covering all 36 cells of the BR-1 matrix, from a **hand-written** copy of the table, asserting the `type` and not merely the failure: 10 permitted, 15 `invalid-status-transition`, 6 `ticket-closed`, 5 `same-status-transition` | BE-012-01 | 36 cases pass; committed red first | AC-2, AC-7, AC-8, AC-13 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-012-02 | Unit tests for the assignee precondition and `ClosedAtUtc` against a fixed `TimeProvider` | BE-012-03 | Test run | AC-4, AC-10 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-012-03 | Unit tests for `AllowedTransitions`, including the unassigned-`Open` case and the empty array on `Closed` | BE-012-04 | Test run | AC-19 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-012-04 | Integration tests for each `409` variant, asserting the `type` value and the `currentStatus` / `allowedTransitions` extension members | BE-012-05 | Test run | AC-2, AC-3, AC-7, AC-8, AC-13 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-012-05 | Integration test: note required when closing from `New` and from `Open`; accepted and stored when supplied; `400` at 501 characters | BE-012-03 | Test run | AC-5, AC-6 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-012-06 | Integration test: exactly one `StatusChanged` history row on success, with old and new value | BE-012-06 | Test run | AC-11 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-012-07 | Integration test: no history row when the save fails, forced by an interceptor rather than by luck | BE-012-06 | Test run | AC-12 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-012-08 | Authorization tests: Agent-on-other → `403`, Agent-on-own → `200`, Agent-on-unassigned → `200`, Manager-on-any → `200` | BE-012-07 | Test run | AC-14 – AC-16 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-012-09 | Integration test: two writes against one `expectedVersion` give one `200` and one `409 errors/concurrency-conflict`, and the conflict body carries **no** new version | BE-012-09 | Test run | AC-17 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-012-10 | Component test: `StatusActions` renders exactly the array it is given, and nothing for `[]` | FE-012-02 | Test run | AC-20 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-012-11 | Integration test: one `Ticket.StatusChanged` audit row per accepted transition, in the same transaction; **none** after a forced rollback | BE-012-11 | Test run | AC-24, BR-9.1, BR-9.3 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-012-12 | Integration test: the `403` writes one `Auth.Forbidden` row with `Outcome = Denied` and the ticket is unchanged | BE-012-12 | Test run | AC-25, BR-9.2, BR-9.4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-012-13 | Integration test: `type`, enum values, `currentStatus`, and `allowedTransitions` are byte-identical under `Accept-Language: ar`; only `title` and `detail` change | BE-012-05 | Test run | BR-8.7 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |

## Documentation

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| DOC-012-01 | `docs/sdd/documentation/api/overview.md` and `error-handling.md` list the endpoint and all five `409` types | BE-012-08 | Read them | DoD | main session | — |
| DOC-012-02 **✅ done 2026-08-26** — BR-1's `PendingCustomer` diagonal corrected in `docs/sdd/04-business-rules.md` (it read ✅ where every other row reads `–`), by product-owner instruction. The `05-api-conventions.md` `409` inventory still needs the two new types | `05-api-conventions.md`'s `409` inventory gains `errors/same-status-transition` and `errors/assignee-required`; ADR-004 confirmed to match what was built, and corrected if not. **A blueprint edit — the product owner approves it, it is not committed quietly** | BE-012-05, `spec.md` Q-3 | Read them | DoD, Q-3 | main session | — |
| DOC-012-03 | `summary.md`, `08-board.md`, and `12-delivery-log.md` updated; `tests.md` and `ai-notes.md` completed with **observed** output | All | The `verify-story` gate | DoD | main session | `verify-story` |

## Review

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| REV-012-01 | Layer boundaries, correctness against every AC, `CancellationToken` on every async path, no scope creep | All | `review.md` verdict `Approved` | DoD | `comprehensive-review:code-reviewer` | `code-review:code-review` |
| REV-012-02 | Security: the `403` path cannot be used to probe ticket existence (`404` before `403` for an unknown id, `403` before any state check for a known one); no PII in `AuditLog.Changes` (BR-9.7); the `409` `detail` leaks no SQL, no exception type, and no assignee identity | BE-012-07, BE-012-12 | `review.md` | DoD | `comprehensive-review:security-auditor` | — |
| REV-012-03 | Generated OpenAPI compared line by line against `contracts/ticket-status-api.md`: all five `409` `type` values, the extension members, and `expectedVersion` being required | BE-012-08, BE-012-10 | Any difference fixed in one of the two before closing — never one silently | DoD, Contract | main session | — |
| REV-012-04 | The hand-written matrix in `TEST-012-01` read cell by cell against BR-1 by someone who did not write it, including the `PendingCustomer` diagonal from `spec.md` Q-4 | TEST-012-01 | `review.md` records the cell count and the Q-4 ruling | AC-2, Q-4 | `comprehensive-review:code-reviewer` | `code-review:code-review` |

`REV-012-04` exists because the hand-written table is now load-bearing. It is the only
copy of BR-1 that is not the implementation, so a typo in it converts a forbidden
transition into a passing test — and the suite goes green while the rule is wrong. One
reader with the blueprint open is the control.

## Droppable if time runs short

| Task | What is lost |
|---|---|
| FE-012-03 close dialog | Closing from `New` or `Open` becomes unavailable in the UI; the endpoint still works and the flow still demonstrates |
| FE-012-05 conflict reload UX | The conflict still returns `409` and is shown; the user has to refresh manually |
| FE-012-06 generated types | The provisional hand-written types stay. They are correct today; the risk is that a later contract change becomes a runtime surprise instead of a compile error |
| TEST-012-13 locale invariance | Covered indirectly by `005-localization-core`. Drop only after recording it |
| TEST-012-07 no-history-on-failure | Weakens the AC-12 evidence. Drop last among the tests |

## Not droppable

| Task | Why |
|---|---|
| TEST-012-01 | Thirty-six cases is the entire point of this story, and it is the cheapest test in the suite to write. The forbidden transitions are what the feature is |
| BE-012-07 | Authorization that is not tested is authorization that is not known to work |
| BE-012-09 | Without the version check, two agents produce one silent lost update — the defect ADR-006 exists to prevent, and the one that is invisible in single-user testing |
| BE-012-11 | An audit row added after the handler exists is an audit row with an invisible hole, and NFR-10's architecture test fails the build without `IAuditableCommand` |
| BE-012-12 | The denial path is the asymmetry in BR-9.4. If it is only ever tested inside a transaction, nobody discovers that the row rolls back with the request that was rejected |
