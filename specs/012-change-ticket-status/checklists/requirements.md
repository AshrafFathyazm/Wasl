# 012 — Requirements Checklist

A check on the **specification**, not on the code. Run before `/speckit-plan` is
trusted, and again before the feature closes.

## Completeness

| ✓ | Item | Where |
|---|---|---|
| ☑ | Scope and out-of-scope are both explicit | `spec.md` |
| ☑ | Every excluded item names the feature that owns it instead | `spec.md`, Out of Scope — `011`, `013`, `016`, or "nowhere, deliberately" |
| ☑ | Assumptions are written down, each with what happens if it is wrong | `spec.md`, A-1 – A-4 |
| ☑ | Open questions carry a working assumption rather than blocking | `spec.md`, Q-1 – Q-4 |
| ☑ | Every acceptance criterion is testable as written | `spec.md`, AC-1 – AC-25 |
| ☑ | Edge cases include failure cases, not only happy variations | `spec.md`, Edge Cases — 10 rows, 9 of them failures |
| ☑ | Referenced rules are cited by ID, not restated | `spec.md`, Rules Referenced |
| ☑ | Every `409` cause has its own `type` and its own criterion | `contracts/ticket-status-api.md`, Failures |
| ☑ | The evaluation order between competing failures is specified | `contracts/ticket-status-api.md` — a client never has to guess which of two violations answers |
| ☑ | The audit obligation is a criterion, not an implicit expectation | AC-24, AC-25 |

## Testability

| ✓ | Item | Note |
|---|---|---|
| ☑ | Every AC maps to at least one task in `tasks.md` | See the full map below |
| ☑ | No AC needs a follow-up question to turn into a test | Each names a status code, a `type`, a stored value, or a rendered element |
| ☑ | Nothing is verified by "it works" | Every `Verified by` cell is a command, a test run, or an inspection |
| ☑ | The silent failures each have their own criterion | AC-12 (rollback), AC-17 (lost update), AC-19 (a UI inviting a `409`), AC-23 (client-derived transitions), AC-24 (audit row absent on rollback), AC-25 (denial row inside a transaction that rolls back) |
| ☑ | The exhaustive case is exhaustive | 36 cells, and `research.md` R-5 fixes the expected outcome of each before implementation |

### AC → task map

| AC | Tasks |
|---|---|
| AC-1 | BE-012-02, BE-012-08, TEST-012-04 |
| AC-2 | BE-012-01, BE-012-02, TEST-012-01, REV-012-04 |
| AC-3 | BE-012-05, TEST-012-04 |
| AC-4 | BE-012-03, TEST-012-02 |
| AC-5 | BE-012-03, TEST-012-05, FE-012-03 |
| AC-6 | BE-012-03, TEST-012-05, FE-012-03 |
| AC-7 | BE-012-01, TEST-012-01, TEST-012-04 |
| AC-8 | BE-012-02, TEST-012-01, TEST-012-04 |
| AC-9 | BE-012-01, TEST-012-01 |
| AC-10 | BE-012-03, TEST-012-02 |
| AC-11 | BE-012-06, TEST-012-06 |
| AC-12 | BE-012-06, TEST-012-07 |
| AC-13 | BE-012-02, TEST-012-01, TEST-012-04 |
| AC-14 | BE-012-07, TEST-012-08, REV-012-02 |
| AC-15 | BE-012-07, TEST-012-08 |
| AC-16 | BE-012-07, TEST-012-08 |
| AC-17 | BE-012-09, TEST-012-09, FE-012-05 |
| AC-18 | BE-012-04, BE-012-10 |
| AC-19 | BE-012-04, TEST-012-03 |
| AC-20 | FE-012-01, FE-012-02, TEST-012-10 |
| AC-21 | FE-012-04 |
| AC-22 | BE-012-08, TEST-012-04 |
| AC-23 | BE-012-10, FE-012-02 |
| AC-24 | BE-012-11, TEST-012-11 |
| AC-25 | BE-012-12, TEST-012-12 |

Every AC appears. Every task in `tasks.md` serves either an AC, a `BR-*`, `NFR-10`, the
contract, or the Definition of Done — a task serving nothing is scope creep
(`specs/README.md`).

## Consistency with the blueprint

| ✓ | Item | Source |
|---|---|---|
| ☑ | Six states and the permitted set match the matrix, one exception raised as a question | BR-1, `spec.md` Q-4 |
| ☑ | The matrix lives once, in the domain, and the client reads `allowedTransitions` | ADR-004 |
| ☑ | `Closed` is terminal — no reopen path anywhere, including in the UI | ADR-004, BR-1.5 |
| ☑ | Same-status returns `409`, never `200` | BR-1.9 |
| ☑ | The concurrency token is `rowversion`, base64 on the wire, never a manual counter or `xmin` | ADR-006 as amended by ADR-013 |
| ☑ | A conflict is never retried automatically | ADR-006 |
| ☑ | Authorization split: role at the boundary, assignee in the handler | BR-6 |
| ☑ | Two projects, vertical slice, minimal API endpoint. No `Wasl.Application`, no `Wasl.Infrastructure`, no `IRepository` | ADR-010 |
| ☑ | MediatR kept for exactly three pipeline concerns; the audit row is one of them | ADR-010, BR-9.3 |
| ☑ | `IAuditableCommand` with `Entity.Verb` naming; success in-transaction, denial outside | ADR-008, BR-9.1 – BR-9.4, NFR-10 |
| ☑ | Every human-written column is `nvarchar`; timestamps are `datetime2(3)` from an injected `TimeProvider` | ADR-013 |
| ☑ | Integration tests use a real engine, never EF `InMemory` | `docs/sdd/testing/test-strategy.md` |
| ☑ | `200` is never returned with an error in the body; every failure is `ProblemDetails` | `05-api-conventions.md` |
| ☑ | `type`, enum values, `TicketNumber`, and `traceId` are identical in every locale | BR-8.7 |
| ☑ | No global store; filters and the version live in server state and the URL | ADR-011 |
| ☑ | Screen preview before the screen is built | ADR-009, `docs/sdd/design/preview-first-workflow.md` |
| ⚠ | `05-api-conventions.md` lists three `409` `type` values; this endpoint has five | `spec.md` Q-3, closed by `DOC-012-02` **with the product owner's approval** — the blueprint is not edited quietly |
| ⚠ | BR-1's `PendingCustomer` diagonal shows ✅ where the other five rows show `–` | `spec.md` Q-4, `research.md` R-6. **Needs a ruling before `BE-012-01`** |

## Gaps accepted, with reasons

| Gap | Reason |
|---|---|
| No `CHECK` constraint on `Tickets.Status` | Enums-as-strings, per `03-domain-model.md`. The domain is the constraint. Consequence named in `data-model.md`: a hand-written `UPDATE` during support work could produce a status the state machine cannot leave |
| No index on `ClosedAtUtc` | Nothing in scope filters on it; time-based auto-close is an SLA feature and out of scope project-wide. No speculative indexes |
| `Resolved → Closed` requires no note | `spec.md` Q-1. Requiring a reason for the expected outcome trains people to type nothing useful |
| Returning to `Open` does not clear the assignee | `spec.md` Q-2. Unassigning is a separate action owned by `011` |
| A deactivated assignee does not block a transition | `spec.md` Edge Cases. Blocking it would strand tickets, and deactivation is about future assignment, not work in flight |
| No test for enum-to-string serialisation | Framework behaviour. `plan.md` says so rather than leaving it unstated |
| No end-to-end test in this feature | One E2E covers the critical path across features (`docs/sdd/testing/test-strategy.md`); duplicating it per feature buys nothing |
| RTL correctness is a human pass, not an assertion | `FE-012-07`. No assertion catches a menu sized to English labels — recorded in `tests.md` as an observation |
| Reopening a `Closed` ticket has no path at all | ADR-004, and honest rather than convenient: the correct behaviour needs a ticket-link relationship that is out of scope |

## Sign-off

| Gate | State |
|---|---|
| Specification reviewed by the product owner | **Pending** — this feature is awaiting approval before implementation |
| Q-3 (two new `409` `type` values) ruled on | **Pending** — working assumption in `spec.md`; blocks `DOC-012-02`, not the build |
| Q-4 (the `PendingCustomer` diagonal in BR-1) ruled on | **Pending** — working assumption in `spec.md`; **blocks `BE-012-01` and `TEST-012-01`**, which must agree about that cell |
| Plan names every file it will create | ☑ `plan.md` |
| Contract frozen | ☑ `contracts/ticket-status-api.md`, 2026-08-23 |
| Contract change to a shape owned elsewhere recorded | ☑ `plan.md` **Contract changes** — `allowedTransitions` added to `010`'s `TicketDetailResponse` |
| Tasks have an owner, a verification, and something they serve | ☑ `tasks.md` |
| Frontend can start without the backend | ☑ `FRONTEND-API-GUIDE.md` |
