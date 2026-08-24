# 011 — Task Breakdown

**Phase:** 2 · **Story:** US-007 · **Feature:** `011-assign-ticket` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

Agents are **named** here and **not dispatched until the plan is approved**. Naming is
the plan; dispatching is the implementation.

Migrated from `docs/sdd/story-artifacts/US-007-assign-ticket/tasks.md`. What changed, and
nothing else did:

| Change | Why |
|---|---|
| `BE-/FE-/TEST-/DOC-007-*` → `*-011-*`, and every **Depends on** reference with them | The task id names the feature folder, and `007` is `create-customer` |
| `Agent` and `Skill` columns on every row | From the table in [`specs/README.md`](../README.md). Values are those exact strings |
| `BE-011-09` and `BE-011-10` added — the audit obligation | The original predates ADR-008, so **no task carried it**. Assignment and unassignment are state-changing (BR-9.1), and the NFR-10 architecture test fails the build on a command that does not implement `IAuditableCommand`. `BE-011-10` exists because this feature has a `403` path, and BR-9.2 / BR-9.4 require that row to be written **outside** any transaction |
| `BE-011-11` added — OpenAPI metadata for every status code | Two new `ProblemDetails` types ship here; an undeclared status code is a contract difference nobody sees until the client hits it |
| `FE-011-00` added — the screen preview gate | ADR-009 and `design/preview-first-workflow.md`. Rendering a screen costs minutes; changing one that already has tests, translation keys, and query wiring costs hours |
| `FE-011-05` and `FE-011-06` added | Provisional types replaced with generated ones (ADR-011 §6), and the Arabic and accessibility pass, which no original task owned |
| `TEST-011-11` … `TEST-011-14` added | The audit rows, the `403` denial row, the support-users endpoint, and the Arabic round-trip that catches a `varchar` column (ADR-013 row 4) |
| A `Review` section, with `REV-011-03` comparing the generated OpenAPI against `contracts/` | It is one of the five gates in `specs/README.md` that actually gets skipped |
| `TicketAssignmentPolicy` targets `Wasl.Domain`, and its test targets `tests/Wasl.Domain.Tests` | ADR-010: there is no `Wasl.Application` and no `Wasl.Application.Tests`. `plan.md` carries the reasoning |
| `TEST-011-06` extended to include `assigneeId: null` | BR-2.3 covers removing someone else's ownership. No new AC — the numbering is cited by `010`, `012`, and `013` |

The tasks themselves, their order, and their critical path are the originals.

## Critical path

```text
BE-011-01 → BE-011-02 → BE-011-04 → BE-011-05 → FE-011-02
```

Everything else improves the story. These make it exist. `FE-011-00` gates `FE-011-02`
but sits off the backend path, so it runs in parallel from the moment the contract is
frozen.

## Backend

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| BE-011-01 | `Ticket.AssignTo` rejects closed tickets and no-ops, and appends the `Assigned` / `Unassigned` history row with old and new values | `009` | `dotnet test tests/Wasl.Domain.Tests --filter TicketAssignment` | AC-8, AC-9, AC-11 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-011-02 | `TicketAssignmentPolicy` in `Wasl.Domain` implements all four BR-2 branches as a pure function | — | Unit tests covering every combination of role, current assignee, and target | AC-1 – AC-5 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-011-03 | Target user validated: unknown yields `404` `errors/assignee-not-found`, inactive yields `400` naming `assigneeId` | BE-011-02 | Integration tests asserting status **and** `type` | AC-6, AC-7 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-011-04 | `AssignTicketHandler` wires the version check, the policy, the domain call, the history row, and the save into one transaction, in the order fixed by the contract's precedence table | BE-011-01, BE-011-02 | Integration test | AC-1, AC-9, AC-12 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-011-05 | `PUT /api/tickets/{id}/assignee` as a minimal-API endpoint carrying `.RequireAuthorization()` and nothing role-specific | BE-011-04 | Integration test; `/swagger` inspected | AC-1, AC-14 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-011-06 | `expectedVersion` honoured: required, base64-decoded, compared before the permission decision, and re-checked by EF at `SaveChanges` | BE-011-05 | Integration test with two writes on one version — one `200`, one `409` | AC-12 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-011-07 | `GET /api/support-users` returns active users only, ordered by `FullName`, as a plain array | — | Integration test with an inactive user seeded | AC-13 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-011-08 | Status is unchanged by assignment | BE-011-04 | Integration test asserting the status before and after | AC-10 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-011-09 | `AssignTicketCommand` implements `IAuditableCommand`; the action is computed from the payload — `Ticket.Assigned` or `Ticket.Unassigned` — and the row is written in the same transaction | `003`, BE-011-04 | Integration test asserting one row on success and **none** after a forced rollback | BR-9.1, BR-9.3 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-011-10 | The `403` path writes one `Auth.Forbidden` row with `Outcome = Denied`, **outside** any transaction | `003`, BE-011-05 | Integration test: the ticket is unchanged and the audit row exists | BR-9.2, BR-9.4 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-011-11 | OpenAPI metadata declares `200`, `400`, `401`, `403`, `404`, and `409` on the `PUT`, and `200` / `401` on the `GET`, including both new `type` values | BE-011-03, BE-011-06 | `/swagger` inspected, then compared against `contracts/ticket-assignee-api.md` | Contract | `voltagent-lang:dotnet-core-expert` | — |

No schema task, and therefore no `voltagent-lang:sql-pro` row: this feature adds no
column, index, or migration. `data-model.md` says what `009` already created and how it
is verified — the verification is a `sys.indexes` / `sys.foreign_keys` query, not a
`psql \d+`.

## Frontend

Starts as soon as [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md) exists. It does not
wait for `BE-011-05`.

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| FE-011-00 | Screen preview: the summary strip's assignee row, the picker open with mixed Arabic and English names, the disabled state with its reason, the `403` inline message, all states, both languages. **Approved before any wiring** | `006`, `010` | Rendered and reviewed (Phase 3b) | AC-15 | `ui-ux-pro-max:ui-styling` | `frontend-design` |
| FE-011-01 | Support-users query hook and the assign mutation, with request and response types marked **provisional** until generated from OpenAPI | Contract frozen | `npm run typecheck` | AC-13 | `voltagent-lang:typescript-pro` | — |
| FE-011-02 | `AssigneeSelect` assigns and unassigns from the ticket detail screen; the strip renders the assignee from the **ticket response**, never from the picker list | FE-011-00, FE-011-01, BE-011-05 | Manual run as both roles, including a ticket whose assignee is inactive | AC-1, AC-2, AC-15 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-011-03 | Picker disabled for an Agent when the rule forbids the action, with the reason conveyed programmatically, not only visually | FE-011-02 | Component test, plus a manual run as an Agent on another's ticket | AC-15 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-011-04 | A `403` from the server is displayed inline next to the control; `409` variants map to their own messages and a refetch | FE-011-02 | Component tests with a mocked `403` and each `409` `type` | AC-15 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-011-05 | Provisional types replaced with types generated from the OpenAPI document | BE-011-11 | `npm run typecheck` after regeneration | ADR-011 §6 | `voltagent-lang:typescript-pro` | — |
| FE-011-06 | Every string from a catalogue, present in `en` and `ar`; the picker walked in Arabic, keyboard-operable, with the disabled reason announced | `005`, FE-011-02 | Key-parity test, plus the Arabic pass recorded in `tests.md` | BR-8.8, BR-8.11, AC-15 | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |

## Tests

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| TEST-011-01 | Unit: policy across every role and assignee combination | BE-011-02 | Test run | AC-1 – AC-5 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-011-02 | Unit: `AssignTo` on a closed ticket and on a no-op | BE-011-01 | Test run | AC-8, AC-11 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-011-03 | Integration: Manager assigns any ticket to any user | BE-011-05 | Test run | AC-1 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-011-04 | Integration: Agent self-assigns an unassigned ticket | BE-011-05 | Test run | AC-2 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-011-05 | Integration: Agent assigns to another user, `403` `errors/forbidden`, with a **fresh** version | BE-011-05 | Test run | AC-3 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-011-06 | Integration: Agent reassigns another's ticket, `403` — including `assigneeId: null`, which is a reassignment too (BR-2.3) | BE-011-05 | Test run | AC-4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-011-07 | Integration: Agent unassigns their own ticket | BE-011-05 | Test run | AC-5 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-011-08 | Integration: inactive `400` naming `assigneeId`, unknown `404` `errors/assignee-not-found` | BE-011-03 | Test run | AC-6, AC-7 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-011-09 | Integration: history rows for assign and unassign, with old and new values | BE-011-04 | Test run | AC-9 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-011-10 | Integration: stale `expectedVersion` returns `409` `errors/concurrency-conflict` — and does so **in preference to** a `403` the same request would otherwise earn | BE-011-06 | Test run | AC-12 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-011-11 | Integration: one audit row per successful assign and unassign, with the right action name; none after a forced rollback | BE-011-09 | Test run | BR-9.1, BR-9.3 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-011-12 | Integration: a `403` writes one `Auth.Forbidden` / `Denied` row that survives the rolled-back transaction | BE-011-10 | Test run | BR-9.2, BR-9.4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-011-13 | Integration: `GET /api/support-users` excludes an inactive user and returns `401` without a token | BE-011-07 | Test run | AC-13 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-011-14 | Integration: an Arabic `FullName` round-trips byte-identical through `GET /api/support-users` and through the assignee on the `PUT` response | BE-011-07 | Test run | ADR-013 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-011-15 | Security: the `403` and both `404` bodies carry no assignee detail, no ticket internals, and no `detail` a client could be tempted to parse | BE-011-05 | Test run | BR-8.7, BR-9.7 | `comprehensive-review:security-auditor` | — |

## Documentation

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| DOC-011-01 | `docs/sdd/documentation/api/overview.md` lists both endpoints, and `error-handling.md` gains the two new `type` rows | BE-011-11 | Read it | DoD, Contract | main session | — |
| DOC-011-02 | `summary.md` written: what changed, trade-offs, known limitations | All | DoD checklist | DoD | main session | — |
| DOC-011-03 | `tests.md` and `ai-notes.md` completed with **observed** output; board and delivery log updated | DOC-011-02 | The `verify-story` gate | DoD | main session | `verify-story` |

## Review

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| REV-011-01 | Layer boundaries, correctness against every AC, scope creep. Specifically: no BR-2 logic in the endpoint, no caller identity inside `Ticket`, `CancellationToken` on every async path | All | `review.md` verdict `Approved` | DoD | `comprehensive-review:code-reviewer` | `code-review:code-review` |
| REV-011-02 | Security: the authorization matrix is enforced and not merely described; nothing sensitive in `Changes`; no PII in logs | BE-011-05, BE-011-10 | `review.md` | DoD | `comprehensive-review:security-auditor` | — |
| REV-011-03 | Generated OpenAPI compared against `contracts/ticket-assignee-api.md`, status code by status code and `type` by `type` | BE-011-11 | Any difference fixed in one of the two before closing | DoD | main session | — |
| REV-011-04 | The server's `403` message and the client's mirrored "not permitted" string read consistently, in both languages | FE-011-06 | `review.md` | BR-8.6, BR-8.8 | `comprehensive-review:code-reviewer` | `code-review:code-review` |

## Droppable if time runs short

| Task | What is lost |
|---|---|
| FE-011-03 disabled picker | The user sees a `403` after acting instead of before; correct but worse. The server is still the authority, so nothing becomes unsafe |
| BE-011-08's dedicated test | AC-10 is still covered incidentally by other assignment tests, which assert the full response |
| TEST-011-14 Arabic round-trip | Only if `007` already proved the `nvarchar` mapping on a human-written column. Two features asserting the same type mapping is real duplication; dropping it before `007` lands is not |
| FE-011-05 generated types | The provisional types keep working until the contract moves — which is exactly when they stop, silently. Drop last among the frontend tasks, and record it |

**Not droppable:** `TEST-011-05` and `TEST-011-06`. They are the only proof that the
authorization matrix is enforced rather than described, and they are what `012`'s
authorization work builds on.

**Not droppable:** `BE-011-09`. An audit row added after the handler exists is an audit
row with an invisible hole, and the NFR-10 architecture test fails the build without it.

**Not droppable:** `FE-011-00`. It is the cheapest task in the list and the only one
whose omission is paid for by every task after it.
