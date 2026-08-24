# 013 — Requirements Checklist

A check on the **specification**, not on the code. Run before `/speckit-plan` is
trusted, and again before the feature closes.

## Completeness

| ✓ | Item | Where |
|---|---|---|
| ☑ | Scope and out-of-scope are both explicit | `spec.md`, In Scope / Out of Scope |
| ☑ | Every excluded item carries a reason, and the ones owned elsewhere name where | `spec.md` Out of Scope; `frontend-spec.md` Not on this screen |
| ☑ | Assumptions are written down, each with what happens if it is wrong | `spec.md`, A-1 – A-4 |
| ☑ | Open questions carry a working assumption rather than blocking | `spec.md`, Q-1 – Q-3. Q-1 and Q-2 are resolved in `plan.md` / `research.md` R-4, R-5; Q-3 is open |
| ☑ | Every acceptance criterion is testable as written | `spec.md`, AC-1 – AC-17 |
| ☑ | Edge cases include failure cases, not only happy variations | `spec.md`, Edge Cases — closed ticket, script body, same-millisecond entries, deactivated author |
| ☑ | Referenced rules are cited by ID | `spec.md`, Rules Referenced: BR-5.1 – BR-5.7, BR-6, BR-7.2, FR-3.3 — plus BR-8.7, BR-9.1 – BR-9.4, BR-9.7 added by the migration |
| ☑ | The frozen contract covers every status code either endpoint can return | `contracts/ticket-timeline-api.md` |
| ☑ | Every state the screen can be in is specified, including the ones usually skipped | `frontend-spec.md` States — loading, empty ×2, error, conflict, closed, submitting, end-of-feed, and `403` explicitly recorded as non-existent |

## Testability — the full AC → task map

| AC | Serves | Tasks |
|---|---|---|
| AC-1 | `201` on a valid comment | `BE-013-01`, `BE-013-03`, `FE-013-03`, `TEST-013-04` |
| AC-2 | Empty or whitespace body → `400` | `BE-013-02`, `TEST-013-01`, `TEST-013-04` |
| AC-3 | Body over 4000 → `400` | `BE-013-02`, `TEST-013-01` |
| AC-4 | Closed ticket → `409 errors/ticket-closed` | `BE-013-02`, `FE-013-06`, `TEST-013-02`, `TEST-013-04` |
| AC-5 | `isInternal` stored, returned, marked | `BE-013-03`, `FE-013-04`, `TEST-013-05` |
| AC-6 | Optional `channel` stored and returned | `BE-013-03`, `TEST-013-05` |
| AC-7 | Invalid channel → `400` **naming the field** | `BE-013-03`, `TEST-013-05` |
| AC-8 | `CommentAdded` row in the same transaction, without the body | `BE-013-02`, `TEST-013-03`, `TEST-013-06` |
| AC-9 | Merged, ascending | `BE-013-04`, `BE-013-08`, `TEST-013-07`, `TEST-013-16` |
| AC-10 | Same-instant order deterministic and repeatable | `BE-013-06`, `TEST-013-08` |
| AC-11 | Each entry carries type, actor name, timestamp, own fields | `BE-013-04`, `TEST-013-19` |
| AC-12 | Pagination, default to the newest 50, load-older | `BE-013-05`, `FE-013-05`, `TEST-013-09`, `TEST-013-12` |
| AC-13 | No edit or delete endpoint | `BE-013-09` |
| AC-14 | No query per entry for actor names | `BE-013-07`, `TEST-013-10`, `TEST-013-12` |
| AC-15 | `authorUserId` from the token, never the body | `BE-013-03` |
| AC-16 | Unknown ticket id → `404` | `BE-013-03`, `TEST-013-04` |
| AC-17 | Timeline UI: distinct entry types, empty / loading / error | `FE-013-00`, `FE-013-02`, `FE-013-07`, `FE-013-08`, `TEST-013-11` |

Rules the migration added coverage for, which have no AC of their own because the
original spec predates ADR-008:

| Rule | Tasks |
|---|---|
| BR-9.1, BR-9.3 — one audit row, in-transaction, absent after rollback | `BE-013-10`, `TEST-013-13` |
| BR-9.7 — no comment body in the audit row | `BE-013-10`, `TEST-013-14` |
| BR-9.2, BR-9.4 — the `401` row, written outside any transaction | `BE-013-11`, `TEST-013-15` |
| BR-8.6, BR-8.7 — server messages translated; enum values and `type` never | `BE-013-12`, `FE-013-09`, `TEST-013-17` |
| ADR-013 row 4 — `nvarchar`, so Arabic is not `????` | `TEST-013-18` |

| ✓ | Item | Note |
|---|---|---|
| ☑ | Every AC maps to at least one task | Table above; no AC is unmapped |
| ☑ | No AC needs a follow-up question to turn into a test | Each names a status code, a stored value, or an observable render |
| ☑ | Nothing is verified by "it works" | Every `Verified by` cell in `tasks.md` is a command, a query, or a named inspection |
| ☑ | The silent failures each have their own criterion or their own test | Client-evaluated union → `TEST-013-12` · double-rendered comment → `TEST-013-16` · Latin enum inside an Arabic sentence → `TEST-013-17` · `????` Arabic body → `TEST-013-18` · vanished deactivated author → `TEST-013-19` · comment body in the audit log → `TEST-013-14` |
| ☑ | The one non-droppable test is identified as such, with the reason | `tasks.md`: `TEST-013-09` and `TEST-013-12` |

## Consistency with the blueprint

| ✓ | Item | Source |
|---|---|---|
| ☑ | Two projects, vertical slices, minimal APIs. No `Wasl.Application`, no `Wasl.Infrastructure`, no controller | ADR-010; repaired from the original plan's four-layer table |
| ☑ | The union is a **named query object** — one caller, no interface — and not a repository | ADR-010, which names this query explicitly |
| ☑ | Every type is a SQL Server type: `uniqueidentifier`, `nvarchar`, `bit`, `datetime2(3)`, `ON DELETE NO ACTION` | ADR-013; `docs/sdd/03-domain-model.md` physical shape |
| ☑ | `nvarchar` on the comment body, because `varchar` returns `????` for Arabic and reads as a font bug | ADR-013 row 4 |
| ☑ | No `rowversion` on an append-only table | ADR-006 as amended by ADR-013 |
| ☑ | Migration verified by `sys.indexes` / `sys.check_constraints` / `sys.foreign_keys`, not by reading the migration and not by `\d+` | `data-model.md`; ADR-013 |
| ☑ | Integration tests use `Testcontainers.MsSql` against a real engine, never EF `InMemory` | `docs/sdd/testing/test-strategy.md`; `research.md` R-12 |
| ☑ | MediatR kept only for the three pipeline concerns — validation, audit, transaction | ADR-010, Supporting decisions |
| ☑ | `TimeProvider` injected; the domain takes the timestamp as a parameter | Constitution V; `data-model.md` |
| ☑ | RFC 7807 everywhere; `200` never carries an error; `type` / `errors` keys / enum values never translated | `docs/sdd/05-api-conventions.md`; BR-8.7 |
| ☑ | Pagination envelope matches the convention: `items`, `page`, `pageSize`, `totalCount`, `totalPages`; `pageSize > 100` clamped; `page ≤ 0` clamped | `docs/sdd/05-api-conventions.md`; BR-7.2 |
| ☑ | No global store; filters and paging in the URL where shareable; fetching at route level only | ADR-011 §1, §2, §4 |
| ☑ | Components typed route / feature / primitive | ADR-011 §4; `frontend-spec.md` |
| ☑ | Types generated from the contract; the hand-written ones are marked provisional with the swap as a task | ADR-011 §6; `FE-013-10` |
| ☑ | CSS logical properties only; `dir="auto"` per entry | ADR-007; `frontend-spec.md` RTL |
| ☑ | Preview before build | ADR-009; `FE-013-00` |

### Deliberate deviations from the blueprint, each recorded with its reason

| Deviation | Blueprint says | Recorded in |
|---|---|---|
| `201` carries **no `Location`** header | `05-api-conventions.md`: `201` points at the new resource | `plan.md` API Contract; contract; `research.md` R-7. There is no comment-addressable route and BR-5.3 means there never will be |
| Default `pageSize` is 50 | BR-7.2: default 20 | `plan.md`; contract; `research.md` R-9. The 100 maximum and both clamps are unchanged |
| `CK_TicketComments_Body` is a constraint the physical sketch does not show | `03-domain-model.md` shows no check on `TicketComments` | `data-model.md`. The sketch is explicitly not authoritative over the migration; the constitution requires a constraint where an invariant holds |
| `CommentAdded` history rows are excluded from the timeline projection | BR-5.7: the timeline is the union of comments and history | `plan.md`; `research.md` R-5; contract behaviour table. The row is still written per BR-5.5; projecting it shows every comment twice |
| `errors/ticket-closed` is a fifth `409` `type` | `05-api-conventions.md` lists four | `plan.md` Contract changes; `DOC-013-04` adds the row |
| A new comment is **appended**, not prepended | `design/screens/04-ticket-detail.md` action 5 says prepend | `frontend-spec.md`; `DOC-013-04` corrects the screen spec. The feed is ascending |

## Gaps accepted, with reasons

| Gap | Reason |
|---|---|
| No keyset (cursor) pagination | Offset paging is drift-free on an append-only feed numbered from the oldest entry (`research.md` R-4), and keyset changes the contract shape. It is the right answer at tens of thousands of entries per ticket, which nothing here asks for. Stated as a limitation in `plan.md`, not pre-built |
| "Last activity" on a ticket is not comment-aware | Adding a comment deliberately does not touch the `Tickets` row, because bumping its `rowversion` would make an unrelated status change collide on a `409` that looks random (`research.md` R-10). If activity-based sorting is wanted later, it needs a deliberate column, not a side effect |
| Internal comments are not filtered for anyone | BR-5.4 and A-2: visible to all support users, marked distinctly. There is no customer login to filter for, and building the filter now would invent a rule and make the flag untestable |
| The whole-timeline empty state is unreachable and still implemented | Every ticket has a `Created` history row, so it cannot legitimately render. It is implemented as a **fault** state rather than removed, because if it ever appears the history branch of the union has broken and a friendly empty state would hide that |
| `CK_TicketComments_Body` does not catch a tab-only body | `LEN(LTRIM(RTRIM(…)))` trims spaces, not tabs or non-breaking spaces. The domain is the real rule; the constraint is the floor for a row inserted by hand. Stated in `data-model.md` rather than implied |
| No load or performance measurement | No stated requirement. `TEST-013-10` asserts the command count is constant as the entry count grows, which is the property that actually matters here; wall-clock timing is not measured |
| No real-time push | Out of scope in `spec.md`. TanStack Query refetches on window focus |
| Q-3 — whether a rejected comment writes an audit row — is unresolved | Genuinely undecided, and BR-9.4's word "failed" is ambiguous. Carried as an open question with a working assumption (no row) rather than guessed in code. If the answer is yes, it is a change to the shared behaviour in `003`, not to this feature |

## Sign-off

| Gate | State |
|---|---|
| Specification reviewed by the product owner | **Pending** — this feature is awaiting approval before implementation |
| Plan names every file it will create or change | ☑ `plan.md`, Files to Create or Change |
| At least one real alternative considered and rejected with a reason | ☑ `plan.md`, Risks and Trade-offs — thirteen rows |
| Contract frozen | ☑ `contracts/ticket-timeline-api.md`, 2026-08-23 |
| Frontend handoff derived from the frozen contract | ☑ `FRONTEND-API-GUIDE.md` |
| Tasks have an owner, a verification, and something they serve | ☑ `tasks.md` — every row carries `Agent`, `Verified by`, and `Serves` |
| Agents named but **not dispatched** until the plan is approved | ☑ `tasks.md` header |
