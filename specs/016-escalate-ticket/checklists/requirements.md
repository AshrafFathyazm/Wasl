# 016 — Requirements Checklist

**Feature:** `016-escalate-ticket` · **Story:** US-009 · **Checked against:**
[`spec.md`](../spec.md) · `docs/sdd/04-business-rules.md` (BR-3, BR-6, BR-9) ·
`docs/sdd/user-stories/US-009-escalate-ticket.md` · `docs/sdd/09-definition-of-done.md`

This checklist tests the **specification**, not the implementation. Nothing here is built
yet.

---

## Completeness

| ✓ | Item | Where |
|---|---|---|
| ✅ | Scope stated | `spec.md` → In Scope, 12 items |
| ✅ | Out-of-scope stated **explicitly**, with a reason per row | `spec.md` → Out of Scope, 9 rows. De-escalation, auto-escalation, tier escalation, notifications, and the `escalated=true` filter each name where they live or why they do not exist |
| ✅ | Every BR-3 sub-rule is claimed by at least one AC | BR-3.1 → In Scope statement · 3.2 → AC-1, AC-2 · 3.3 → AC-3 · 3.4 → AC-4 · 3.5 → AC-5 · 3.6 → **AC-6** · 3.7 → AC-7 · 3.8 → AC-8 · 3.9 → Out of Scope + AC-15 (`canEscalate` is never `true` twice) |
| ✅ | Assumptions recorded rather than held silently | `spec.md` → A-1 … A-7, each with an "if wrong" consequence |
| ✅ | Open questions recorded with a working assumption | `spec.md` → Q-1 … Q-6 |
| ✅ | Edge and failure cases listed | `spec.md` → Edge Cases, 14 story-specific rows plus the shared list |
| ✅ | Business rules cited by ID, not restated | `spec.md` → Rules Referenced |
| ✅ | The authorization path is specified, both directions | AC-1 (Manager `200`), AC-2 (Agent `403`), AC-11 (`403` before `404`), AC-15 (`canEscalate` false for an Agent) |
| ✅ | The audit obligation is specified for **both** the success and the denial path | AC-13 (in-transaction, BR-9.3), AC-14 (out-of-transaction, BR-9.4) |
| ✅ | Every status code the endpoint can return appears in an AC | `200` AC-1 · `400` AC-5 · `401` AC-10 · `403` AC-2 · `404` AC-11 · `409` AC-3, AC-4, AC-12 |
| ✅ | Localization obligations stated | AC-17; `plan.md` → Localization Impact; `frontend-spec.md` → i18n key table |
| ✅ | Client states enumerated, including forbidden and conflict | `frontend-spec.md` → States, 12 rows, with the absence of an empty state recorded as a decision |
| ✅ | A concrete file list exists | `plan.md` → Files to Create or Change |
| ✅ | At least one real alternative considered and rejected with a reason | `plan.md` → Risks and Trade-offs, 13 rows; `research.md` R-1 … R-10 each carry rejections |
| ⚠️ | AC-9 is only **partly** in this feature's scope | The filter clause belongs to `015`. Recorded in `spec.md` Q-6, `plan.md` → Dependencies, and `frontend-spec.md` → Not on this screen. Not silently reassigned |

## Testability — the full AC → task map

Every AC maps to at least one named task. An AC with no task is a finding, not a footnote.

| AC | Rule | Verified by | Backend / Frontend task |
|---|---|---|---|
| AC-1 | BR-3.2 | `TEST-016-08` (happy path assertions), integration test in `BE-016-05` | `BE-016-05`, `FE-016-02` |
| AC-2 | BR-3.2 | `TEST-016-05` `Escalate_AsAgent_ReturnsForbidden` | `BE-016-07`, `FE-016-03` |
| AC-3 | BR-3.3 | `TEST-016-06` | `BE-016-03`, `BE-016-08`, `FE-016-05` |
| AC-4 | BR-3.4 | `TEST-016-06` | `BE-016-03`, `BE-016-08`, `FE-016-05` |
| AC-5 | BR-3.5 | `TEST-016-07` (missing, whitespace, 501, 500, 500+space, missing `expectedVersion`) | `BE-016-04`, `FE-016-04` |
| **AC-6** | **BR-3.6** | `TEST-016-01` (all four values), **`TEST-016-02`** (`Escalate_WhenPriorityIsCritical_LeavesPriorityUnchanged`), `TEST-016-03` (rank order) | **`BE-016-02`**, `BE-016-03`, `FE-016-02` |
| AC-7 | BR-3.7 | `TEST-016-08` | `BE-016-01`, `BE-016-03` |
| AC-8 | BR-3.8 | `TEST-016-04` (one row for `Critical`, two for `Normal`) | `BE-016-04` |
| AC-9 | — | `FE-016-06` (callout), `010` (list marker). **Filter clause: `015`** | `FE-016-06`, and `015` for the filter |
| AC-10 | — | `TEST-016-08` | `BE-016-09` |
| AC-11 | BR-6 | `TEST-016-08` (`404` for a Manager, `403` for an Agent with an unknown id) | `BE-016-07`, `BE-016-09` |
| AC-12 | ADR-006 | `TEST-016-09` (two writes on one version; one `Escalated` row) | `BE-016-09`, `FE-016-05` |
| AC-13 | BR-9.1, BR-9.3 | `TEST-016-10`, `TEST-016-14` | `BE-016-06` |
| AC-14 | BR-9.2, BR-9.4 | `TEST-016-11` | `BE-016-07` |
| AC-15 | Constitution III | `TEST-016-13` (role × flag × six statuses) | `BE-016-10`, `FE-016-03` |
| AC-16 | — | `FE-016-04`, `FE-016-05`, `FE-016-06`, `FE-016-09`, plus `FE-016-00`'s approved preview | `FE-016-00` … `FE-016-06`, `FE-016-09` |
| AC-17 | BR-8.7, BR-8.8, BR-8.11 | `TEST-016-12`, `FE-016-08` (Arabic pass recorded in `tests.md`), `BE-016-11` (key parity) | `BE-016-11`, `FE-016-08` |

**Every AC is independently testable as written.** The one to re-read is AC-6: it states
both halves of the floor — raised from `Low`/`Normal`, *left unchanged* from
`High`/`Critical` — so a stranger could turn it into two tests without a follow-up
question. That is the exit condition Constitution I sets.

| ✓ | Item | Note |
|---|---|---|
| ✅ | No AC says "validates properly" or similar | Each names an input, a status code, and an observable field |
| ✅ | The rule most likely to be got wrong has its **own** AC and its **own named** test | AC-6 / `TEST-016-02`, named exactly as `docs/sdd/testing/test-strategy.md` names it |
| ✅ | The silent-failure mode is written down, not just the correct behaviour | `spec.md` → "The one thing that fails silently": two wrong implementations and what catches each |
| ✅ | Unit-level rules are separable from HTTP-level rules | The floor, the preconditions, and `IsEscalatable` are all unit-testable with no database (`plan.md` → Test Strategy) |
| ✅ | Anything deliberately untested is named | `plan.md` → Test Strategy: entity-to-DTO mapping, the `Modal` focus trap (`006`), the `escalated=true` filter (`015`) |

## Consistency with the blueprint

| ✓ | Check | Result |
|---|---|---|
| ✅ | Endpoint matches `05-api-conventions.md`'s inventory | `POST /api/tickets/{id}/escalate` — exact match |
| ✅ | Status codes match the convention table | `200`, `400`, `401`, `403`, `404`, `409`. No `200`-with-an-error |
| ✅ | Every `409` carries a specific `type` | `ticket-not-escalatable`, `already-escalated`, `concurrency-conflict` |
| ⚠️ | `errors/ticket-not-escalatable` is **not yet** in the registry | New in this feature. `DOC-016-01` adds it to `docs/sdd/documentation/api/error-handling.md`. Recorded under `plan.md` → Contract changes, and in `spec.md` Q-1 |
| ✅ | Authorization split matches BR-6 | Escalate is Agent ❌ / Manager ✅, enforced as a boundary policy because it is role-only |
| ✅ | Concurrency matches ADR-006 as amended by ADR-013 | `expectedVersion` is the base64 `rowversion`; a mismatch is `409 errors/concurrency-conflict`; the client never auto-retries |
| ✅ | Architecture matches ADR-010 | Two projects. `Wasl.Api/Features/Tickets/EscalateTicket/` plus `Wasl.Domain/Tickets/`. No `Wasl.Application`, no `Wasl.Infrastructure`, no controller, no `ITicketRepository` |
| ✅ | Database matches ADR-013 | `nvarchar(500)`, `bit`, `datetime2(3)`, `uniqueidentifier`, `rowversion`, `ON DELETE NO ACTION`, `sys.columns` verification, `Testcontainers.MsSql` |
| ✅ | Audit matches ADR-008 and BR-9 | `IAuditableCommand` with `Ticket.Escalated` from BR-9's naming table; in-transaction on success; out-of-transaction on denial; actor snapshotted; `Changes` limited to fields that changed |
| ✅ | Escalation-as-a-flag matches ADR-004 and the US-009 notes | Not a status; orthogonal to `InProgress` |
| ✅ | Frontend matches ADR-011 | Components typed route / feature / primitive; fetching only at route level; no global store; expected states inline, unexpected at the boundary; types generated from OpenAPI, provisional until then |
| ✅ | Localization matches BR-8 | `type`, `errors` keys, enum values, `ticketNumber`, `traceId` never translated; user content verbatim with `dir="auto"`; one-key sentences with named placeholders, never concatenation; logical CSS properties |
| ✅ | The screen spec is referenced, not duplicated | `frontend-spec.md` points at `04-ticket-detail.md` and `10-shared-patterns.md` |
| ✅ | The floor behaviour matches the screen spec's action 4 | "priority raised to a **floor** of High, never lowered" — identical |
| ⚠️ | The screen spec's action 4 omits `expectedVersion` | The contract file is authoritative and requires it. Recorded in `plan.md` → Contract changes, `spec.md` Q-4, and `research.md` R-5 |
| ✅ | Test names match `test-strategy.md`'s convention and its two named examples | `Escalate_AsAgent_ReturnsForbidden`, `Escalate_WhenPriorityIsCritical_LeavesPriorityUnchanged` |
| ✅ | Phase and feature number match `specs/README.md` | Phase 5, feature `016`, story US-009 |
| ✅ | Task IDs follow `{LANE}-{feature}-{nn}` | `BE-016-*`, `FE-016-*`, `TEST-016-*`, `DOC-016-*`, `REV-016-*` |
| ✅ | Every task row carries Agent and Skill from `specs/README.md`'s table | `tasks.md`, header exactly `ID · Outcome · Depends on · Verified by · Serves · Agent · Skill` |
| ✅ | Every task's **Serves** names an `AC-*` or a `BR-*` | A task serving nothing would be scope creep |

## Gaps accepted, with reasons

| # | Gap | Reason it is accepted |
|---|---|---|
| G-1 | **No de-escalation.** An escalated ticket stays escalated for its lifetime | BR-3.9 puts it out of scope. It is not a symmetric addition: it needs a second event type, a policy, and a decision about whether priority comes back down — none of which is specified. Stated in the dialog copy (`tickets:escalate.explain`) so the user is told **before** they commit, not after |
| G-2 | **No way to correct a wrong reason.** BR-3.4 refuses a second escalation and there is no update path | No requirement, and the reason is on the immutable history row (BR-5.6). A manager can add a comment. Recorded so it is visibly a decision |
| G-3 | **AC-9's `escalated=true` filter is not delivered here** | It belongs to `015`, which is cut **before** `016` in the Phase 5 order. If `015` is dropped, AC-9 is partially unmet and `summary.md` says so rather than marking it done (`spec.md` Q-6) |
| G-4 | **No `CHECK` constraint** enforcing that the three metadata fields are non-null when `IsEscalated = 1` | One writer only — `Ticket.Escalate`, private setters, the only path that can set the flag. Unlike `CK_Customers_Contact`, there is no plausible second writer. Reasoning in full in `data-model.md`; if a second writer appears, this is the constraint to add |
| G-5 | **No index on `IsEscalated`** | No speculative indexes. It serves `015`'s filter and arrives with the query it serves |
| G-6 | The escalation reason is **not** in the audit row's `Changes` | It would be a third copy of the same free text, which is the pattern BR-9.7 rejects for comment bodies. The audit row records that it happened, by whom, when; `EntityLabel` carries the `TicketNumber` (`spec.md` Q-3) |
| G-7 | The `Modal` primitive's focus trap is not re-tested here | It belongs to `006-design-system`. `FE-016-09` verifies the **behaviour on this dialog**, which is the part specific to this feature |
| G-8 | No test for entity-to-DTO mapping | It has no behaviour |
| G-9 | The Arabic pass is a **manual deliverable**, not an assertion | RTL defects are visual: no assertion catches a callout sized to English text or an arrow that flipped when it should not have. Naming it as a listed deliverable (`FE-016-08`) is the honest version; calling it "covered by tests" would be false |

## Sign-off

| Role | Status | Date |
|---|---|---|
| Specification reviewed by the product owner | **Pending** | — |
| Contract frozen | Yes — [`contracts/ticket-escalate-api.md`](../contracts/ticket-escalate-api.md), 2026-08-23 | 2026-08-23 |
| Plan approved | **Pending** — no agent is dispatched until it is (`tasks.md` header) | — |
| Open questions Q-1 … Q-6 answered by the owner | **Pending.** Each carries a working assumption, so the feature is not blocked; Q-1 and Q-4 are the two that change the contract if the owner disagrees | — |

Nothing in this feature is implemented. `docs/sdd/08-board.md` and
`docs/sdd/12-delivery-log.md` are where delivery is recorded, and neither says otherwise.
