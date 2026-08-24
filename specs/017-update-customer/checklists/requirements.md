# 017 — Requirements Checklist

A check on the **specification**, not on the code. Run before `/speckit-plan` is trusted,
and again before the feature closes.

## Completeness

| ✓ | Item | Where |
|---|---|---|
| ☑ | Scope and out-of-scope are both explicit | `spec.md`, In scope / Out of scope |
| ☑ | Every excluded item names the feature that owns it instead, or says "nowhere, by design" | `spec.md`, Out of scope; `frontend-spec.md`, Not on this screen |
| ☑ | Assumptions are written down, each with what happens if it is wrong | `spec.md`, A-1 – A-5 |
| ☑ | Open questions carry a working assumption rather than blocking | `spec.md`, Q-1 – Q-4 |
| ☑ | Every acceptance criterion is testable as written | `spec.md`, AC-1 – AC-24 |
| ☑ | The story's original AC numbers are preserved and in order | AC-1 – AC-6 are US-003's, unchanged. AC-7 onward are the criteria that were implicit in them |
| ☑ | Edge cases include failure cases, not only happy variations | `spec.md`, Edge cases — eleven story-specific rows, nine of which are failures |
| ☑ | Referenced rules are cited by ID, not restated | `spec.md`, Rules referenced |
| ☑ | The contract is frozen before either lane starts | `contracts/customer-update-api.md`, FROZEN 2026-08-23 |
| ☑ | The dependency that could block the whole feature is named as one | `spec.md` A-1, `plan.md` Dependencies: `008`'s `GET` must return `version` |

## Testability

Every AC maps to at least one task. The full map:

| AC | Task(s) |
|---|---|
| AC-1 | BE-017-06, FE-017-02, TEST-017-02 |
| AC-2 | BE-017-03, BE-017-07, FE-017-05, TEST-017-06 |
| AC-3 | BE-017-01, FE-017-06, TEST-017-07 |
| AC-4 | BE-017-05, TEST-017-04 |
| AC-5 | BE-017-06, FE-017-06, TEST-017-10 |
| AC-6 | **FE-017-04**, FE-017-07, FE-017-11, TEST-017-16 |
| AC-7 | BE-017-03, BE-017-11, TEST-017-05 |
| AC-8 | BE-017-03, BE-017-07, FE-017-05, TEST-017-06 |
| AC-9 | BE-017-01, TEST-017-01 |
| AC-10 | BE-017-02, TEST-017-08 |
| AC-11 | BE-017-02, FE-017-06, TEST-017-08 |
| AC-12 | BE-017-01, FE-017-03, TEST-017-09 |
| AC-13 | BE-017-02, BE-017-04, FE-017-01, TEST-017-08 |
| AC-14 | BE-017-04, TEST-017-08 |
| AC-15 | BE-017-05, BE-017-11, FE-017-07, TEST-017-04 |
| AC-16 | BE-017-08, TEST-017-02 |
| AC-17 | BE-017-09, TEST-017-11 |
| AC-18 | BE-017-09, TEST-017-11 |
| AC-19 | BE-017-01, BE-017-09, TEST-017-01, TEST-017-11 |
| AC-20 | BE-017-10, TEST-017-12 |
| AC-21 | TEST-017-13 |
| AC-22 | BE-017-05, FE-017-04, TEST-017-14 |
| AC-23 | BE-017-06, FE-017-03, TEST-017-03, TEST-017-17 |
| AC-24 | FE-017-00, FE-017-10, REV-017-05 |

| ✓ | Item | Note |
|---|---|---|
| ☑ | Every AC maps to at least one task | Table above; no AC has an empty row |
| ☑ | Every task serves an AC or a BR | Checked against `tasks.md`. `BE-017-11` serves AC-7/AC-15 through the schema they depend on; `BE-017-12` serves BR-8.6/BR-8.7; `DOC-*` and `REV-*` serve the DoD |
| ☑ | No AC needs a follow-up question to turn into a test | Each names a status code, a response field, an audit row, or an observable screen behaviour |
| ☑ | Nothing is verified by "it works" | Every `Verified by` cell is a command, a test, or a named observation |
| ☑ | The silent failures each have their own criterion | AC-12 (a partial `PUT` clears fields and returns `200`), AC-14 (malformed version must not read as a conflict), AC-19 (phantom audit entries from diffing raw against normalised), AC-22 (a `409` body that invites a silent merge), AC-23 (a stale held version, invisible in single-user testing) |
| ☑ | The concurrency criterion cannot pass without a real database | AC-15 / `TEST-017-04` race two writes. EF `InMemory` does not enforce a concurrency token, so it is not used (ADR-013) |
| ☑ | The audit criteria cover absence, not only presence | AC-18: no row after a `400`, `404`, or either `409`. A test that only asserts the row exists passes against a handler that writes it outside the transaction |

## Consistency with the blueprint

| ✓ | Item | Source |
|---|---|---|
| ☑ | Two projects, vertical slices, minimal APIs. No `Wasl.Application`, no `Wasl.Infrastructure`, no controller, no `IRepository` | ADR-010; `plan.md` Files to create |
| ☑ | Every type is SQL Server: `uniqueidentifier`, `nvarchar`, `datetime2(3)`, `bit`, `rowversion` | ADR-013; `data-model.md` |
| ☑ | The concurrency token is a `rowversion` column mapped `.IsRowVersion()` — never `xmin`, never a manual counter | ADR-006 as amended by ADR-013; `research.md` R-1 |
| ☑ | Filtered unique indexes, not an index on `LOWER(Email)` | ADR-013 rows 2–3; `data-model.md` |
| ☑ | Integration tests use `Testcontainers.MsSql`, never EF `InMemory` | `docs/sdd/testing/test-strategy.md`; `plan.md` Test strategy |
| ☑ | `409` types come from the documented list, and both are used | `docs/sdd/05-api-conventions.md`; `contracts/customer-update-api.md` |
| ☑ | `200` is never returned with an error in the body; every error is `ProblemDetails` from the shared middleware | `05-api-conventions.md`; `BE-017-05` |
| ☑ | The version transport matches the convention (`expectedVersion` in the body, not `If-Match`) | `05-api-conventions.md` §Concurrency; `research.md` R-2 |
| ☑ | The audit action name follows `Entity.Verb` and appears in BR-9's naming table | BR-9; `Customer.Updated` is listed there verbatim |
| ☑ | The audit row is written by the pipeline behaviour in the same transaction; the `401` row is written outside one | BR-9.3, BR-9.4, ADR-008; `BE-017-09`, `BE-017-10` |
| ☑ | `TimeProvider` injected; no `DateTime.UtcNow` inline | Constitution §V; `BE-017-08`, `REV-017-01` |
| ☑ | Both roles may update a customer; no `403` path is built | BR-6; AC-21, and the absence is stated in `frontend-spec.md` States |
| ☑ | No global store; filters and fetching at route level; types generated from OpenAPI | ADR-011 §1, §4, §6; `frontend-spec.md`, `FE-017-09` |
| ☑ | CSS logical properties; `dir="auto"` on user content; email and phone stay LTR | ADR-007; `08-create-customer.md`; `frontend-spec.md` RTL |
| ☑ | Every new key exists in `en` and `ar`, enforced by the parity test | BR-8.11; `FE-017-10`, `BE-017-12` |
| ☑ | Nothing machine-readable is translated | BR-8.7; the contract's "What stays identical in every locale" |
| ☑ | The screen is previewed before it is built | ADR-009; `FE-017-00` |
| ☑ | Task IDs use the feature's number, and every row has an Agent and a Skill from `specs/README.md` | `specs/README.md`; `tasks.md` |

## Gaps accepted, with reasons

| Gap | Reason |
|---|---|
| No field-level customer change history | Out of scope in US-003 by name. The `Customer.Updated` audit row is the record of who changed a phone number, and ADR-008 cites this exact gap as a reason the audit log exists separately from `TicketHistory`. Consequence: nobody sees a customer's edit history until `019-audit-log-access` ships, and then only a Manager can (`research.md` R-9) |
| "Every phone-number change" is not an indexed query | `AuditLog.Changes` is `nvarchar(max)` because SQL Server has no `jsonb` (ADR-013). It is written and read whole. Nothing in scope queries it by key |
| No field-level merge on conflict | Reload is the whole conflict resolution. ADR-006 chose a detectable failure over a silent one; a merge UI is a feature nobody asked for and a wrong merge is a silent data change |
| The `409 concurrency-conflict` costs an extra round trip | `spec.md` Q-1 and `research.md` R-5. Accepted because contention is expected to be low (A-2) and because a body carrying the fresh state invites the silent merge ADR-006 rejected |
| A partial `PUT` clears fields and returns `200` | `research.md` R-4. `PATCH` machinery is larger than the five fields it would serve. Contained by AC-12, a test, a block quote in the contract, and a prefilled form that makes the correct call the easiest one to write |
| Behaviour on an **inactive** customer is unspecified and untested | `spec.md` A-3. No code path can produce an inactive customer, so the case is unreachable. Recorded rather than defended, and it will need an answer the day deactivation gets a story |
| The `GET` this screen depends on is not tested here | It belongs to `008`. Testing it here would duplicate that feature's coverage and hide which feature broke it |
| No load or performance verification of the conflict path | No stated requirement. `docs/sdd/testing/test-strategy.md` lists performance as deliberately untested |
| Entity-to-DTO mapping untested | No behaviour. Same position as `007` |
| Both `409`s cannot be distinguished by a client that branches on the status code | Not a gap in the spec — it is a property of the contract, stated three times (contract, guide, `frontend-spec.md`) because it is the mistake most available to a client author |

## Sign-off

| Gate | State |
|---|---|
| Specification reviewed by the product owner | **Pending** — this feature is awaiting approval before implementation |
| Plan names every file it will create or change | ☑ `plan.md`, Files to create or change |
| At least one real alternative considered and rejected with a reason | ☑ `plan.md`, Risks and trade-offs — ten rows; `research.md` R-2, R-4, R-5 |
| Contract frozen | ☑ `contracts/customer-update-api.md`, 2026-08-23 |
| Frontend handoff derived from the frozen contract | ☑ `FRONTEND-API-GUIDE.md` |
| Tasks have an owner, a verification, and something they serve | ☑ `tasks.md` — Agent and Skill on every row |
| Agents named but not dispatched | ☑ Stated under the header in `tasks.md` |
| Schema claim verified rather than assumed | ☐ `BE-017-11` — runs at implementation time; the claim is "no migration", and it is checked by query |
