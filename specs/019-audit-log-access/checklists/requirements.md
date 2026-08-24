# 019 — Requirements Checklist

**Feature:** `019-audit-log-access` · **Story:** US-015 · **Checked:** 2026-08-23

A completeness check on the **specification**, not on the code. It answers one question:
could `spec.md` be handed to a stranger and turned into tests without a follow-up
question?

---

## Completeness

| ✓ | Item | Where |
|---|---|---|
| ☑ | Scope is explicit | `spec.md` → *In Scope* |
| ☑ | Out-of-scope is explicit, with a reason per exclusion | `spec.md` → *Out of Scope* — nine rows, each carrying its reason |
| ☑ | The one place this feature **exceeds** its user story is called out rather than smuggled in | `spec.md` → *Scope note — the screen*. US-015 excludes a UI; this feature specifies one and records it as `Q-019-1`, first to be cut |
| ☑ | Assumptions recorded, each with what happens if it is wrong | `spec.md` → six rows, `A-1` – `A-6` |
| ☑ | Open questions recorded with a working assumption, none guessed silently | `spec.md` → `Q-9`, `Q-10`, `Q-019-1` – `Q-019-3` |
| ☑ | The two blueprint-level open questions this feature sharpens are carried, not dropped | `Q-9` retention, `Q-10` read auditing. Both restated with *why this feature makes them sharper*, and `DOC-019-02` puts them in `summary.md` as known limitations |
| ☑ | Edge and failure cases listed | `spec.md` → *Edge Cases*, sixteen story-specific rows plus the shared list |
| ☑ | Business rules cited by ID, not restated | `spec.md` → *Rules Referenced* |
| ☑ | Every endpoint, request, response, and status code frozen before either lane starts | `contracts/audit-api.md`, FROZEN 2026-08-23 |
| ☑ | Data model states what already exists and what this feature adds | `data-model.md` — **adds nothing**, and says why in the first line rather than leaving an empty section |
| ☑ | Every screen state specified, including the absent ones | `frontend-spec.md` → six states. Absence of a state is a defect, not a gap |
| ☑ | The screen's provenance is honest | `frontend-spec.md` opens by stating no design exists and that the screen is **composed, not matched** |
| ☑ | Research records what was settled and what was rejected | `research.md` → `R-1` – `R-11` |
| ☑ | The plan names every file it will create or change | `plan.md` → *Files to Create or Change* |
| ☑ | At least one real alternative rejected with a reason | `plan.md` → thirteen rows in *Risks and Trade-offs* |
| ☑ | Every task is individually verifiable, with an owner | `tasks.md` — `Verified by` is a command or an observation on every row |

## Testability — the full AC → task map

Every acceptance criterion, and what proves it. An AC with no test is a finding, not a
footnote.

| AC | Proven by | Built by |
|---|---|---|
| AC-1 · paginated envelope, newest first | `TEST-019-01` | `BE-019-04`, `BE-019-05` |
| AC-2 · seven filters, AND'ed | `TEST-019-02` | `BE-019-03`, `BE-019-04` |
| AC-3 · `action` prefix match | `TEST-019-03` (including `action=%` returning **none**) | `BE-019-04` |
| AC-4 · `Denied`/`Failed` served by the filtered index | `TEST-019-04` — **execution plan**, plus a row assertion | `BE-019-07` |
| AC-5 · Agent gets `403` | `TEST-019-05`; `FE-019-06` for the inline forbidden state | `BE-019-06`, `FE-019-07` |
| AC-6 · every successful read writes `Audit.Read` | `TEST-019-06`, `TEST-019-07` | `BE-019-01`, `BE-019-08` |
| AC-7 · rows for deleted entities still return | `TEST-019-09` | inherent — no FK exists (`003`) |
| AC-8 · actor is the snapshot, not a join | `TEST-019-08` | `BE-019-04`; `FE-019-03` renders the snapshot hint |
| AC-9 · no create/alter/delete endpoint | `TEST-019-16` (`405` on four verbs) + `BE-019-11` (`DENY` confirmed in `sys.database_permissions`) | absence, guaranteed by permission |
| AC-10 · `traceId` finds its row | `TEST-019-10` | `BE-019-04` |
| AC-11 · empty result is `200` with an empty array | `TEST-019-01`; `FE-019-06` for the **two** empty states | `BE-019-05` |
| AC-12 · cursor pagination on `id` | `TEST-019-11` (insert between pages), `TEST-019-01` | `BE-019-04`, `FE-019-05` |
| AC-13 · the `403` writes a row, outside any transaction | `TEST-019-05` | `BE-019-06` |
| AC-14 · the `Audit.Read` row is absent from its own response | `TEST-019-06` (its `id` exceeds every `id` returned) | `BE-019-08` |
| AC-15 · `pageSize` default 20, clamp 100 | `TEST-019-12` | `BE-019-03`, `FE-019-05` |
| AC-16 · every `400` names its field | `TEST-019-13` | `BE-019-02`, `BE-019-03` |
| AC-17 · every data field English in every locale | `TEST-019-15` | `BE-019-12`, `FE-019-09` |
| AC-18 · `401` before the role check, no `Auth.Forbidden` row | `TEST-019-14` | `BE-019-10` |
| AC-19 · the six client states, URL-bound filters, no polling | `FE-019-02` – `FE-019-06`, `FE-019-09`; previewed by `FE-019-00` | `FE-019-02` – `FE-019-07` |

Every task also serves at least one `AC-*` or `BR-*`. A task serving nothing is scope
creep, and there is none in `tasks.md`.

### Three criteria that would pass while doing nothing

Named because these are the ones a plausible implementation satisfies without doing the
work:

| AC | How it would falsely pass | What stops it |
|---|---|---|
| AC-4 | A row-count assertion is correct whether or not `IX_AuditLog_NotSuccess` is used. The index is the *point* of the criterion | `TEST-019-04` asserts the **execution plan** names the index |
| AC-6 | A row written by the behaviour *before* the handler satisfies "every read writes a row" — and puts the row inside its own response | `AC-14` and `TEST-019-06` assert the row's `id` exceeds every `id` returned |
| AC-3 | `action=%` returning the entire table looks like a filter that matched broadly, not like a missing `ESCAPE` clause | `TEST-019-03` asserts `action=%` returns **none** |

## Consistency with the blueprint

| ✓ | Check | Result |
|---|---|---|
| ☑ | Status codes match `05-api-conventions.md` | `200`, `400`, `401`, `403`, `500`. `405` from routing |
| ☑ | Error shape is RFC 7807 from the single middleware; `200` never carries an error | `contracts/audit-api.md` |
| ☑ | Nothing machine-readable is localized | `type`, `errors` keys, `traceId`, plus — uniquely here — **every field of the success body** (BR-9.10) |
| ☐ | Pagination matches `05-api-conventions.md` | **Deliberate deviation.** Cursor instead of `page`/`pageSize`, and no `totalCount`. AC-12 requires it; ADR-008's `bigint` key exists for it; recorded in the contract, in `research.md` R-1 and R-4, and in `plan.md` |
| ☑ | `BR-7.2`'s page-size clamp still honoured | Default 20, clamp 100, never rejected |
| ☑ | `BR-7.6`'s empty result is `200` | AC-11 |
| ☑ | `BR-7.4`'s repeated-value OR | `outcome` repeatable |
| ☑ | `BR-6` role matrix | *Read the audit log: Agent ❌ · Manager ✅ (and the read is itself audited)* |
| ☑ | Every BR-9 rule this feature touches is cited and tested | BR-9.2, 9.4, 9.5, 9.6, 9.7, 9.9, 9.10, 9.11, 9.12 each map to a test |
| ☑ | ADR-010 respected — two projects, vertical slice, minimal API, no repository | `plan.md` file list contains no `Wasl.Application` or `Wasl.Infrastructure` path and no controller. The one non-trivial query is a named query object with one caller |
| ☑ | ADR-013 respected | SQL Server types throughout; `Testcontainers.MsSql`; `sys.indexes` and `sys.database_permissions` instead of `\d+`; `DENY` not `REVOKE`; `nvarchar` for every human-written column |
| ☑ | ADR-008 respected | Snapshotted actor, no foreign keys, append-only, pipeline-written rows, and the same-transaction / independent-write asymmetry |
| ☑ | ADR-011 respected | Fetching at route level only, URL as state container, provisional types replaced by generated ones, no global store |
| ☑ | `TimeProvider`, `CancellationToken`, enums as strings | `plan.md`, and `REV-019-01` checks the token on every async path |
| ☐ | The screen inherits an approved design | **No.** No screen spec exists; the screen is authored in `frontend-spec.md` and flagged there. `FE-019-00` is the design review and `REV-019-04` is the gate |
| ☐ | Nav entry follows `02-app-shell.md` | **Open.** That file says the roles share one nav, so the entry point sits in the user popover beside `Settings`. `Q-019-2` |

## Gaps accepted, with reasons

| Gap | Reason it is accepted | Where it is recorded |
|---|---|---|
| A read that fails with a `500` writes **no** audit row | BR-9.2 requires rows for auth events and BR-9.1 for state changes; a faulted read is neither. Writing the row before the query would fix this and break AC-14, which is the worse trade | `plan.md`, `research.md` R-2 |
| No retention policy, no purge, no export | Q-9 is a legal question, not an engineering one. Guessing a period is worse than an honest "indefinite, unanswered" | `spec.md` Q-9, `summary.md` via `DOC-019-02` |
| The table holds personal data indefinitely, and this feature makes it easy to read | Restricted to `Manager` and every read is recorded. That is mitigation, not resolution — resolution is Q-9 | `spec.md` Q-9, `REV-019-02` |
| Reads of customer data are still unaudited | Q-10. This feature proves the mechanism on one resource; extending it multiplies the table by the read-to-write ratio and is its own story | `spec.md` Q-10 |
| `Audit.Read` rows accumulate in the log they describe | Excluding them would hide BR-9.11's own evidence. Left visible, filterable by `action` | `research.md` R-11 |
| No index on `Action`, so the prefix filter scans | No speculative indexes. The threshold and the fix are named rather than left to be discovered | `data-model.md` |
| `changes` is returned unvalidated | The reader is not the authority on a column the writer owns; validating on read would silently drop rows an older writer produced | `research.md` R-6 |
| `action` prefix matching is case-insensitive **only because of the server collation** | An explicit collation would be a schema change to `003`'s object, for a search rather than a uniqueness rule | `research.md` R-8 |
| No `totalCount`, so the UI cannot show "137 results" or a numbered pager | A count over an append-only table is a scan producing a stale number. The shared pagination pattern is explicitly declared inapplicable rather than quietly reshaped | `research.md` R-4, `frontend-spec.md` |
| The screen was authored here, not designed | Stated in the first paragraph of `frontend-spec.md`, gated by `FE-019-00` and `REV-019-04`. The alternative — claiming to match a design nobody saw — is worse | `frontend-spec.md`, `Q-019-1` |
| `ipAddress` and `userAgent` are not columns | Nine columns is already the widest table in the product; both appear in the expanded row | `frontend-spec.md` |
| No alerting on repeated `Auth.LoginFailed` or `Auth.Forbidden` | ADR-008 names it as valuable and out of scope. Detecting a pattern is not reading a log | `spec.md` *Out of Scope* |

## Sign-off

| Gate | State |
|---|---|
| Specification reviewed by the product owner | **Pending** |
| `contracts/audit-api.md` frozen | Yes — 2026-08-23. Any change goes through *Contract changes* in `plan.md` first |
| Plan approved, agents dispatched | **Not yet.** Agents are named in `tasks.md` and are not dispatched until the plan is approved |
| `Q-9` (retention) answered | **No.** Working assumption recorded; carried into `summary.md` as a known limitation |
| `Q-10` (read auditing) answered | **No.** Working assumption recorded |
| `Q-019-1` (is a screen in scope at all?) answered | **No.** Working assumption: yes, and first to be cut |
| `Q-019-2` (entry point) confirmed by a design owner | **No** |
| `Q-019-3` (record the filter in the `Audit.Read` row?) confirmed | **No.** Working assumption: yes |

Nothing in this file claims an implementation result. Evidence of what was actually run
belongs in `tests.md`, and it is empty because nothing has been run.
