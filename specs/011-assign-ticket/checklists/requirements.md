# 011 — Requirements Checklist

A check on the **specification**, not on the code. Run before `/speckit-plan` is trusted,
and again before the feature closes.

## Completeness

| ✓ | Item | Where |
|---|---|---|
| ☑ | Scope and out-of-scope are both explicit | `spec.md` |
| ☑ | Every excluded item names the feature that owns it instead, or says no requirement exists | `spec.md`, Out of scope |
| ☑ | Assumptions are written down, each with what happens if it is wrong | `spec.md`, A-1 – A-4 |
| ☑ | Open questions carry a working assumption rather than blocking | `spec.md`, Q-1 – Q-4 |
| ☑ | Every acceptance criterion is testable as written | `spec.md`, AC-1 – AC-15 |
| ☑ | Edge cases include failure cases and rule collisions, not only happy variations | `spec.md`, Edge cases |
| ☑ | Referenced rules are cited by ID | `spec.md`, Rules referenced |
| ☑ | Both endpoints are specified, including the one that only feeds a picker | `contracts/ticket-assignee-api.md` |
| ☑ | Every status code has a `type`, and every `type` has a stated client recovery | `contracts/`, `FRONTEND-API-GUIDE.md` |
| ☑ | The order in which competing failures are evaluated is fixed, not left to the implementation | `contracts/`, *The order the checks run in* |

## Testability

| ✓ | Item | Note |
|---|---|---|
| ☑ | Every AC maps to at least one task | AC-1→BE-011-05/TEST-011-03 · AC-2→TEST-011-04 · AC-3→TEST-011-05 · AC-4→TEST-011-06 · AC-5→TEST-011-07 · AC-6→BE-011-03/TEST-011-08 · AC-7→BE-011-03/TEST-011-08 · AC-8→BE-011-01/TEST-011-02 · AC-9→BE-011-01/TEST-011-09 · AC-10→BE-011-08 · AC-11→BE-011-01/TEST-011-02 · AC-12→BE-011-06/TEST-011-10 · AC-13→BE-011-07/TEST-011-13 · AC-14→BE-011-05 · AC-15→FE-011-02/03/04, FE-011-06 |
| ☑ | Every business rule this feature implements maps to a task | BR-2.1–2.3→BE-011-02/TEST-011-01 · BR-2.4→BE-011-03 · BR-2.5→BE-011-01 · BR-2.6→BE-011-01/TEST-011-09 · BR-2.7→BE-011-08 · BR-6→BE-011-05 + `plan.md` split table · BR-9.1/9.3→BE-011-09/TEST-011-11 · BR-9.2/9.4→BE-011-10/TEST-011-12 |
| ☑ | No AC needs a follow-up question to turn into a test | Each names a status code, a row, or an observable screen state |
| ☑ | Nothing is verified by "it works" | Every `Verified by` cell is a command, a test run, or a named inspection |
| ☑ | The silent failures each have their own criterion or task | Assignment not changing status (BE-011-08) · the audit row absent after rollback (TEST-011-11) · the denial row surviving the rollback (TEST-011-12) · Arabic not becoming `????` (TEST-011-14) · `409` taking precedence over `403` (TEST-011-10) · the disabled reason being announced, not only styled (FE-011-06) |
| ☑ | A test that could pass for the wrong reason is called out | `plan.md`, Test Strategy: a `403` assertion sent with a stale version receives `409` |

## Consistency with the blueprint

| ✓ | Item | Source |
|---|---|---|
| ☑ | Two projects, vertical slices, minimal APIs; no `Wasl.Application`, no `Wasl.Infrastructure`, no `IRepository` | ADR-010 |
| ☑ | The business rule lives in `Wasl.Domain`, once | Constitution III, `research.md` R-1 |
| ☑ | Endpoints bind, authorize, delegate, and map — no rule in the endpoint | Constitution III, `plan.md` |
| ☑ | Every type is SQL Server: `uniqueidentifier`, `nvarchar`, `datetime2(3)`, `bit`, `rowversion`, `ON DELETE NO ACTION` | ADR-013, `data-model.md` |
| ☑ | The concurrency token is `rowversion`, never `xmin` and never an application counter | ADR-006 as amended, `data-model.md` |
| ☑ | Index and object names are PascalCase; the artifact's `ix_tickets_assignee` is corrected | `docs/sdd/03-domain-model.md`, `research.md` R-10 |
| ☑ | Integration tests use a real engine via `Testcontainers.MsSql`, never EF `InMemory` | `docs/sdd/testing/test-strategy.md`, `data-model.md` |
| ☑ | RFC 7807 everywhere; `200` is never returned with an error in the body | `docs/sdd/05-api-conventions.md`, `contracts/` |
| ☑ | Machine-readable values untranslated: `type`, `errors` keys, enum values, `ticketNumber`, `traceId` | BR-8.7, `contracts/` |
| ☑ | Sub-resource `PUT`, not `PATCH`, and no separate `DELETE` for unassign | `docs/sdd/05-api-conventions.md`, `research.md` R-2 |
| ☑ | Every state-changing command implements `IAuditableCommand` with a BR-9 action name | ADR-008, NFR-10, `plan.md` Audit |
| ☑ | The denial row is written outside the transaction and the success row inside it | BR-9.3, BR-9.4 |
| ☑ | `TimeProvider` injected; `CancellationToken` on every async path | Constitution V, `REV-011-01` |
| ☑ | Fetching only at the route level; no global store; the picker does not fetch on open | ADR-011 §1, §4 |
| ☑ | CSS logical properties only; `dir="auto"` on every element rendering a user's name | ADR-007 §6, §8 |
| ☑ | The screen is previewed before it is built | ADR-009, `FE-011-00` |
| ☑ | Two new `ProblemDetails` types are recorded as a registry change, not added quietly | `plan.md`, Contract changes |

## Gaps accepted, with reasons

| Gap | Reason |
|---|---|
| The client mirrors BR-2 instead of reading a server-authored capability flag | The flag is the better design and it changes the ticket read shape, which `010` owns. `spec.md` Q-4 records it; the mirror is safe because the server is still the authority and the `403` path is tested |
| `allowedTransitions` may not yet be precondition-aware when this feature ships | `012` AC-19 owns that. This feature asserts only that the field is present and recomputed. `spec.md` Q-3 |
| No index on `SupportUsers.IsActive` | Seeded table, single digits of rows. `data-model.md` |
| `GET /api/support-users` is unpaged | Bounded, seeded set. If user management ever ships this is a breaking change — `spec.md` A-4, `research.md` R-8 |
| An assignee deactivated after assignment keeps the ticket | Deliberate (BR-2.4 governs the act, not the state). The consequence is that the strip can show a user absent from the picker, which is why the client renders the assignee from the ticket response |
| No test that a Manager cannot assign to a deactivated user *they* deactivated in the same session | There is no deactivation endpoint in the release; the state is only reachable through the seed |
| `TicketHistory` rows store `Guid`s, so the timeline needs a join | Accepted, and recorded for `013` rather than left for it to find. `research.md` R-4 |
| No load or performance verification | No stated requirement. `docs/sdd/testing/test-strategy.md` lists this as deliberately untested |
| The Arabic walk is manual | RTL defects are visual; no assertion catches a picker sized to English names. It is a deliverable (`FE-011-06`), recorded in `tests.md` |

## Sign-off

| Gate | State |
|---|---|
| Specification reviewed by the product owner | **Pending** — this feature is awaiting approval before implementation |
| Plan names every file it will create or change | ☑ `plan.md`, Files to Create or Change |
| Plan records at least one real alternative, rejected with a reason | ☑ `plan.md`, Risks and Trade-offs · `research.md` R-1 – R-10 |
| Contract frozen | ☑ `contracts/ticket-assignee-api.md`, 2026-08-23 |
| Frontend handoff derived from the frozen contract | ☑ `FRONTEND-API-GUIDE.md` |
| Tasks have an owner, a verification, and something they serve | ☑ `tasks.md` |
| Agents named, and **not** dispatched before approval | ☑ `tasks.md`, header |
