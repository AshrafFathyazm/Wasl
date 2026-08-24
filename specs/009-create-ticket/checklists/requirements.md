# 009 — Requirements Checklist

A check on the **specification**, not on the code. Run before `/speckit-plan` is trusted,
and again before the feature closes.

## Completeness

| ✓ | Item | Where |
|---|---|---|
| ☑ | Scope and out-of-scope are both explicit | `spec.md`, In scope / Out of scope |
| ☑ | Every excluded item names the feature that owns it instead | `spec.md` (US-007 → `011`, US-008 → `012`, US-010 → `013`), `frontend-spec.md`, Not on this screen |
| ☑ | Assumptions are written down, each with what happens if it is wrong | `spec.md`, A-1 – A-4 |
| ☑ | Open questions carry a working assumption rather than blocking | `spec.md`, Q-1 – Q-4. Q-3 and Q-4 were added in migration: what a rejected create audits, and the fact that there is no `403` here |
| ☑ | Every acceptance criterion is testable as written | `spec.md`, AC-1 – AC-15 |
| ☑ | Edge cases include failure cases, not only happy variations | `spec.md`, Edge cases — whitespace-only, boundary lengths, unknown enum, malformed and unknown `Guid`, two simultaneous creations, double-submit, sequence exhaustion |
| ☑ | Referenced rules are cited by ID | `spec.md`, Rules referenced — BR-1.1, BR-1.8, BR-6, FR-2.1 – FR-2.3, FR-3.2, plus BR-8.7/8.13 and BR-9.1 – BR-9.4 added in migration |
| ☑ | Every status code the endpoint can return is in the contract | `contracts/tickets-api.md` — `201`, `400` ×2 types, `401`, `404`. The absence of `403` and `409` is stated, not implied |

## Testability — the full AC → task map

| ✓ | AC | Tasks |
|---|---|---|
| ☑ | AC-1 `201` with `Location` | BE-009-06, TEST-009-03, FE-009-03 |
| ☑ | AC-2 status `New`, null assignee | BE-009-02, TEST-009-01 |
| ☑ | AC-3 `TCK-{yyyy}-{000000}`, unique | BE-009-03 (sequence + unique index), BE-009-04, TEST-009-02 |
| ☑ | AC-4 missing → `400`, unknown → `404` | BE-009-05, TEST-009-04 |
| ☑ | AC-5 invalid enum → `400` listing accepted values | BE-009-05, TEST-009-05, FE-009-01, FE-009-05 |
| ☑ | AC-6 `subject` ≤200, `description` ≤4000 | BE-009-05, TEST-009-05 |
| ☑ | AC-7 whitespace-only → `400` | BE-009-05, TEST-009-05 |
| ☑ | AC-8 `priority` defaults to `Normal` | BE-009-05, TEST-009-06 |
| ☑ | AC-9 `Created` history row, same transaction | BE-009-02, TEST-009-07 |
| ☑ | AC-10 `allowedTransitions` = `["Open","Closed"]` | BE-009-06, TEST-009-03 |
| ☑ | AC-11 concurrent creations get distinct numbers | BE-009-04, TEST-009-08 |
| ☑ | AC-12 `createdByUserId` from the token only | BE-009-07 |
| ☑ | AC-13 unauthenticated → `401` | BE-009-06, TEST-009-09 |
| ☑ | AC-14 picker searches; no submit without a selection | FE-009-00, FE-009-02 |
| ☑ | AC-15 loading, validation, and server-error states | FE-009-00, FE-009-04 |

Rules with no AC of their own, carried by a task so they are not orphaned:

| ✓ | Rule | Tasks |
|---|---|---|
| ☑ | BR-9.1, BR-9.3, BR-9.7 — one audit row, in-transaction, nothing sensitive | BE-009-09, TEST-009-10, REV-009-02 |
| ☑ | BR-9.2, BR-9.4 — the `401` row, written outside any transaction | BE-009-10, TEST-009-11 |
| ☑ | BR-8.11, BR-8.13 — key parity, Latin-digit `TicketNumber` | FE-009-06, TEST-009-12 |
| ☑ | ADR-013 row 4 — Arabic survives `nvarchar` | TEST-009-12 |
| ☑ | NFR-4 — the `404` leaks nothing | TEST-009-13 |
| ☑ | ADR-011 §6 — types generated, not hand-written | FE-009-05 |

| ✓ | Item | Note |
|---|---|---|
| ☑ | No AC needs a follow-up question to turn into a test | Each names an observable result or a status code |
| ☑ | Nothing is verified by "it works" | Every `Verified by` cell is a command, a test run, or a named inspection |
| ☑ | The silent failures each have their own criterion or task | AC-11 (the race), TEST-009-12 (Arabic as `????`), TEST-009-10 (an audit row that survives a rollback), BE-009-03 (`is_unique` on `UX_Tickets_Number`), FE-009-05 (an enum value with no label) |
| ☑ | Every task is individually verifiable | The largest, BE-009-03, is verified by two `sys.indexes` queries on a clean database |

## Consistency with the blueprint

| ✓ | Item | Source |
|---|---|---|
| ☑ | Two projects, vertical slices, minimal APIs — no `Wasl.Application`, no `Wasl.Infrastructure`, no controller | ADR-010 |
| ☑ | No `IRepository`; the number generator is a concrete class, not an interface | ADR-010, constitution, `research.md` R-2 |
| ☑ | Every type is the SQL Server type: `uniqueidentifier`, `nvarchar`, `datetime2(3)`, `bit`, `rowversion` | ADR-013, `docs/sdd/03-domain-model.md` |
| ☑ | The concurrency token is `rowversion` with `.IsRowVersion()`, not `xmin` and not a counter | ADR-006 as amended by ADR-013 |
| ☑ | `ON DELETE NO ACTION`, never `RESTRICT`; only `TicketHistory → Tickets` cascades | ADR-013, `docs/sdd/03-domain-model.md` |
| ☑ | The sequence syntax is `CREATE SEQUENCE … AS bigint START WITH 1 INCREMENT BY 1` | ADR-013, `data-model.md` |
| ☑ | Index verification is a `sys.indexes` query, not `\d+` | `docs/sdd/03-domain-model.md` |
| ☑ | Integration tests use `Testcontainers.MsSql`; EF `InMemory` appears nowhere | ADR-013, `research.md` R-8 |
| ☑ | Every `ProblemDetails.type` used exists in the registry — no per-feature type invented | `docs/sdd/documentation/api/error-handling.md` |
| ☑ | `200` is never returned with an error in the body | `docs/sdd/05-api-conventions.md` |
| ☑ | The state machine is read from the domain and returned as `allowedTransitions`; the client never derives it | ADR-004, `research.md` R-6 |
| ☑ | The command implements `IAuditableCommand`; the action name is `Ticket.Created` from BR-9's naming table | ADR-008, BR-9 |
| ☑ | `TimeProvider` injected; no `DateTime.UtcNow` inline. `CancellationToken` on every async path | Constitution V, REV-009-01 |
| ☑ | Enums are strings on the wire and in the database; enum values are never translated | BR-8.7, `docs/sdd/03-domain-model.md` |
| ☑ | Fetching at route level only; no global store; CSS logical properties; `dir="auto"` on user content | ADR-011 §4, ADR-007 |
| ☑ | Task IDs follow `{LANE}-{feature}-{nn}` with the feature's own number | `specs/README.md` |
| ☑ | Every task row carries an Agent and a Skill from the table in `specs/README.md` | `specs/README.md`, Who builds what |

## Gaps accepted, with reasons

| Gap | Reason |
|---|---|
| A rejected create (`400`, `404`) writes no audit row | `spec.md` Q-3. BR-9.1 is about state changes and BR-9.2 about auth events; a boundary rejection is neither. Auditing every validation failure would bury the rows an incident review needs. Recorded as an assumption, not a silent choice |
| The ticket number series has gaps | A sequence value is consumed by a rolled-back create. Making it dense requires a lock that serialises every create, defeating the reason the sequence was chosen (`research.md` R-1) |
| The sequence past 999999 widens the format instead of wrapping | `spec.md` Edge cases. Documented as a limit and not handled in code; at the volume in scope it is roughly a century away, and wrapping would break the unique index silently |
| The database does not constrain `Category`, `Priority`, `Channel`, or `Status` to their valid values | Deliberate, project-wide: enums are behaviour, not data, and the domain is the constraint (`docs/sdd/03-domain-model.md`, *No lookup tables*). A `CHECK` per enum would need a migration to add a value |
| A double-submitted form creates two tickets | The endpoint is deliberately not idempotent — two people reporting the same problem is two tickets, and deduplicating would require guessing intent (`docs/sdd/05-api-conventions.md`, *Idempotency*). Prevention is the client's obligation (AC-15) |
| Enum serialisation is untested | Framework behaviour. What *is* tested is the accepted-values list in the `400` message (TEST-009-05), which is the part this feature owns |
| `allowedTransitions` does not account for the caller's role | Not needed for `New` on create, and it is `012`'s question. Recorded in `research.md` R-6 so `012` does not rediscover it |
| The customer picker's search endpoint belongs to `008` | This feature consumes it. If `008` is late, `FE-009-02` is blocked while `FE-009-00`, `FE-009-01`, and the whole backend lane are not |
| No load or performance verification | No stated requirement. The five indexes are justified by named queries, not by a measurement |
| Integration tests are unverifiable while Docker is not running | `001`'s `research.md` R-8. Stated rather than discovered by a red suite |

## Sign-off

| Gate | State |
|---|---|
| Specification reviewed by the product owner | **Pending** — this feature is awaiting approval before implementation |
| Plan names every file it will create | ☑ `plan.md`, Files to create or change |
| At least one real alternative considered and rejected with a reason | ☑ `plan.md` Risks and trade-offs, `research.md` R-1 – R-8 |
| Contract frozen | ☑ `contracts/tickets-api.md`, 2026-08-23 |
| Frontend handoff exists so the lane need not wait | ☑ `FRONTEND-API-GUIDE.md` |
| Tasks have an owner, a verification, and something they serve | ☑ `tasks.md` |
| Screen preview gated before any wiring | ☑ `FE-009-00`, listed as not droppable |
