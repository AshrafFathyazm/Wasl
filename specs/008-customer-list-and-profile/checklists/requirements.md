# 008 — Requirements Checklist

A check on the **specification**, not on the code. Run before `/speckit-plan` is
trusted, and again before the feature closes.

## Completeness

| ✓ | Item | Where |
|---|---|---|
| ☑ | Scope and out-of-scope are both explicit | `spec.md` |
| ☑ | Every excluded item names the feature that owns it instead | `spec.md`, Out of Scope — `017`, `018`, or "no requirement" |
| ☑ | Assumptions are written down, each with what happens if it is wrong | `spec.md`, A-1 – A-3 |
| ☑ | Open questions carry a working assumption rather than blocking | `spec.md`, Q-1 – Q-3 |
| ☑ | Every acceptance criterion is testable as written | `spec.md`, AC-1 – AC-16 |
| ☑ | Edge cases include failure cases, not only happy variations | `spec.md`, Edge Cases — malformed id, pattern characters, the Arabic non-match |
| ☑ | Referenced rules are cited by ID | `spec.md`, Rules Referenced |
| ☑ | A known limitation is stated as a limitation, not omitted | `spec.md`, **Known limitation carried in deliberately** — Q-7 |
| ☑ | Screen elements specified in the design but not built here are named | `frontend-spec.md`, and `spec.md` Out of Scope |

## Testability — the full AC → task map

Every criterion, every task that delivers it, and every task that proves it. An AC with
no test is a finding, not a footnote.

| AC | Delivered by | Proven by |
|---|---|---|
| AC-1 profile fields including `version` | `BE-008-01` | `TEST-008-02` |
| AC-2 unknown id → `404` | `BE-008-01` | `TEST-008-02` |
| AC-3 malformed id → `400`, with a body and a `type` | `BE-008-02` | `TEST-008-03` |
| AC-4 paged envelope | `BE-008-05` | `TEST-008-04` |
| AC-5 defaults and the 100 clamp | `BE-008-03`, `BE-008-05` | `TEST-008-01`, `TEST-008-04` |
| AC-6 `page=0` clamped to 1 | `BE-008-03` | `TEST-008-01` |
| AC-7 search across name, email, phone, case-insensitive | `BE-008-06`, `FE-008-04` | `TEST-008-05`, `TEST-008-13` |
| AC-8 `%`, `_`, `[`, quote literal | `BE-008-06` | `TEST-008-06` |
| AC-9 empty result is `200` with `totalCount` 0 | `BE-008-05` | `TEST-008-07` |
| AC-10 page beyond the last | `BE-008-05` | `TEST-008-07` |
| AC-11 no query per row | `BE-008-07` | `TEST-008-08` (asserts **2**, not 1 — `research.md` R-7) |
| AC-12 profile: loading, error, not-found distinct | `FE-008-02` | `TEST-008-14`, plus `FE-008-00` preview |
| AC-13 list: empty state, not a bare header | `FE-008-03` | `TEST-008-14`, plus `FE-008-00` preview |
| AC-14 unauthenticated → `401` | `BE-008-08` | `TEST-008-11` |
| AC-15 total order across a full traversal | `BE-008-04`, `BE-008-05` | `TEST-008-09` |
| AC-16 case-insensitivity is explicit, not collation-inherited | `BE-008-06` | `TEST-008-10` |

Non-AC obligations, mapped for the same reason:

| Obligation | Delivered by | Proven by |
|---|---|---|
| BR-9.1 / NFR-10 — a read writes no audit row, and no query is an `ICommand` | `BE-008-09` | `TEST-008-12` |
| BR-9.2 / BR-9.4 — the `401` writes one row, outside any transaction | `BE-008-09` | `TEST-008-11` |
| ADR-013 — Arabic round-trips byte-identical | `BE-008-01`, `BE-008-06` | `TEST-008-13` |
| BR-8.11 — key parity, both screens walked in Arabic | `FE-008-06` | Key-parity test + the recorded Arabic pass |
| Contract fidelity | `BE-008-10` | `REV-008-03` |
| The index is used, not merely created | `BE-008-04` | `REV-008-04` (execution plan) |

| ✓ | Item | Note |
|---|---|---|
| ☑ | Every AC maps to at least one task | Table above; 16 of 16 |
| ☑ | Every AC maps to a named verification | Table above; no AC verified by "it works" |
| ☑ | No AC needs a follow-up question to turn into a test | Each names a status code, a count, or an observable state |
| ☑ | The silent failures each have their own criterion | AC-3 (a `404` that looks correct), AC-11 (the plausible-but-wrong assertion), AC-15 (`ORDER BY (SELECT 1)`), AC-16 (accidental collation) |
| ☑ | A criterion exists for the negative audit case | `TEST-008-12` — a table this feature never touches |

## Consistency with the blueprint

| ✓ | Item | Source |
|---|---|---|
| ☑ | Two projects, vertical slices, minimal APIs — no `Wasl.Application`, no `Wasl.Infrastructure`, no controller | ADR-010 |
| ☑ | No `IRepository`; a named query object only where the query is non-trivial (`CustomerSearch`) | ADR-010, constitution |
| ☑ | SQL Server types throughout; `nvarchar` for every human-written column | ADR-013, `docs/sdd/03-domain-model.md` |
| ☑ | `ILIKE` replaced by `LIKE` plus an explicit collation, not by `LOWER()` | ADR-013, `research.md` R-1 |
| ☑ | `LIKE` metacharacters are the SQL Server set, including `[` | `research.md` R-2 |
| ☑ | The index is non-unique and non-filtered, unlike `007`'s two | `data-model.md`, `docs/sdd/03-domain-model.md` |
| ☑ | `IX_Customers_FullName` is created here, as `007` deferred it | `007/data-model.md`, **Not added here** |
| ☑ | Every new index justified by a named query | `data-model.md` — the `ORDER BY`, not the search |
| ☑ | Paged envelope matches the shared shape exactly | `docs/sdd/05-api-conventions.md` |
| ☑ | Clamping, not rejecting, for out-of-range paging | BR-7.2 |
| ☑ | Empty result is `200`, never `404` | BR-7.6 |
| ☑ | One error shape; `200` never carries an error | Constitution IV, `docs/sdd/05-api-conventions.md` |
| ☑ | `type`, `errors` keys, and `traceId` identical in every locale | BR-8.7 |
| ☑ | No `403` on either endpoint, and that is the matrix, not an omission | BR-6 |
| ☑ | Integration tests against a real engine, never EF `InMemory` | `research.md` R-11, constitution |
| ☑ | `TimeProvider` and `CancellationToken` obligations carried to review | `REV-008-01`, DoD |
| ☑ | Types generated from OpenAPI; hand-written ones marked provisional with a task to replace them | ADR-011 §6, `FE-008-05` |
| ☑ | URL owns search and pagination; no global store | ADR-011 §1, §2 |
| ☑ | Fetching at route level only | ADR-011 §4 |
| ☑ | Preview before build, both screens, both languages | ADR-009, `FE-008-00` |
| ☑ | CSS logical properties; email and phone do not mirror | ADR-007, screen files |

## Gaps accepted, with reasons

| Gap | Reason |
|---|---|
| Arabic search does not match across hamza, alef, or ta-marbuta forms | Q-7, deferred **with the fix written down**. The consequence is named in full, including that BR-4 will not catch the resulting duplicate for a phone-only customer. `TEST-008-13` pins it so the deferral is visible in the suite |
| The search predicate is not sargable and will scan | The data volume makes it correct. Full-text search would need a catalogue in every test container. `data-model.md` records the limit rather than pre-solving it |
| AC-16 is verified by asserting on generated SQL, not on behaviour | A behavioural test cannot distinguish an explicit collation from an inherited one on a `CI_AS` server. The white-box trade is recorded in `plan.md` rather than disguised as behaviour |
| The `Tickets` count column and the profile rail are specified in the screen files and not built | `dbo.Tickets` does not exist until `009`. The alternatives were a fabricated `0` or a query against a missing table. Scoped to `018` in three places so it cannot read as an oversight |
| `includeInactive` is specified in the original Q-1 and is **not** in the frozen contract | Deactivation arrives with `017`. An untested parameter inside a frozen contract is a promise nobody has exercised. The list's `IsActive = 1` filter ships now so results cannot silently change later |
| `updatedAtUtc` will equal `createdAtUtc` for every row until `017` | Nothing updates a customer yet. The field is in the read shape now so `017` does not change it later |
| No performance or load verification of the list query | No stated requirement. `docs/sdd/testing/test-strategy.md` lists this as deliberately untested. `REV-008-04` checks the plan, which is the cheap half |
| `PagingParameters` living in `Wasl.Domain` is the weakest-held decision here | `research.md` R-9 states both sides. If `010` finds it awkward, it is a file move |
| The `BadHttpRequestException` mapping edits `002`'s middleware from inside this feature | It is the correct home — one mapping covers every `Guid` route parameter — but it does mean this feature changes a file another feature owns. Named in `plan.md` and in `BE-008-02` rather than arriving as a surprise in the diff |

## Sign-off

| Gate | State |
|---|---|
| Specification reviewed by the product owner | **Pending** — this feature is awaiting approval before implementation |
| Plan names every file it will create or change | ☑ `plan.md`, in the ADR-010 layout |
| Contract frozen | ☑ `contracts/customers-read-api.md`, 2026-08-23 |
| Tasks have an owner, a verification, and something they serve | ☑ `tasks.md`, with `Agent` and `Skill` on every row |
| Agents named but not dispatched | ☑ Stated at the top of `tasks.md` |
| Every AC preserved by number from the source artifact | ☑ AC-1 – AC-14 unchanged; AC-15 and AC-16 appended, with their reason |
