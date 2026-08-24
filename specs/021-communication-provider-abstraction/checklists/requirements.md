# 021 — Requirements Checklist

A check on the **specification**, not on the code. Run before `/speckit-plan` is trusted,
and again before the feature closes.

## Completeness

| ✓ | Item | Where |
|---|---|---|
| ☑ | Scope and out-of-scope are both explicit | `spec.md` |
| ☑ | Every excluded item names the feature that owns it instead | `spec.md`, Out of scope — `013`, `015`, `018`, `DEFERRED.md` US-013, or "out of scope project-wide" |
| ☑ | The reason this story was promoted out of Deferred is stated, not implied | `spec.md`, Understanding — and `DEFERRED.md`'s reasoning is quoted and split into the part that no longer decides the question and the parts that still hold |
| ☑ | Assumptions are written down, each with what happens if it is wrong | `spec.md`, A-1 – A-6 |
| ☑ | Open questions carry a working assumption rather than blocking | `spec.md`, Q-A – Q-E |
| ☑ | Every acceptance criterion is testable as written | `spec.md`, AC-1 – AC-24 |
| ☑ | Edge cases include failure and permission cases, not only happy variations | `spec.md`, Edge cases (16 rows) — plus AC-11 to AC-15 which are all refusals |
| ☑ | Referenced rules are cited by ID and not restated at length | `spec.md`, Rules referenced |
| ☑ | The two blueprint contradictions are resolved in the open | `spec.md`, Tension 1 (the constitution) and Tension 2 (`ReceiveMessage`) |
| ☑ | Every file the plan will create or change is named | `plan.md`, Backend design and Frontend design |
| ☑ | At least two real alternatives considered and rejected, with reasons | `plan.md`, Risks — keyed DI, `502`, inbound endpoint, outbox: four |
| ☑ | The schema change is defined, including the migration name | `data-model.md` — `AddInteractions` |
| ☑ | The contract states every status code and every `ProblemDetails` type | `contracts/communications-api.md` |
| ☑ | The frontend spec names components by kind (ADR-011 §4), all states, i18n keys, RTL, and "Not on this screen" | `frontend-spec.md` |

## Testability

| ✓ | Item | Note |
|---|---|---|
| ☑ | Every AC maps to at least one task in `tasks.md` | AC-1→TEST-021-04 · AC-2→TEST-021-05 · AC-3→TEST-021-02 · AC-4→TEST-021-03 + TEST-021-13 · AC-5→TEST-021-02 · AC-6→TEST-021-16 · AC-7→TEST-021-06 · AC-8→TEST-021-15 · AC-9→TEST-021-09 · AC-10→TEST-021-05 + TEST-021-09 · AC-11→TEST-021-07 · AC-12→TEST-021-07 · AC-13→TEST-021-07 · AC-14→TEST-021-08 · AC-15→TEST-021-07 · AC-16→TEST-021-10 · AC-17→TEST-021-16 + REV-021-04 · AC-18→TEST-021-12 · AC-19→TEST-021-11 · AC-20→TEST-021-11 · AC-21→TEST-021-14 · AC-22→TEST-021-17 · AC-23→FE-021-06 · AC-24→TEST-021-13 |
| ☑ | No AC needs a follow-up question to turn into a test | Each names an input, an observable output, and where to look |
| ☑ | Nothing is verified by "it works" | Every `Verified by` cell is a command, a query, a test run, or a recorded walk |
| ☑ | The silent failures each have their own criterion | AC-4, AC-5, AC-7, AC-8, AC-9, AC-16, AC-17, AC-22 — listed together in `spec.md`, *What fails silently here* |
| ☑ | A negative is proved rather than assumed | TEST-021-07 asserts the mock's buffer is **empty** on each refusal. "The provider was not called" cannot be shown by a status code |
| ☑ | Every new index is justified by a named query | `IX_Interactions_Ticket_Time` → `TicketInteractionsQuery`, and it is the only index (`data-model.md`) |
| ☑ | Tasks that cannot be verified alone are split | The seam is BE-021-02 (shape), BE-021-03 (mock), BE-021-05 (registry) — three verifications, not one "build the abstraction" |

## Consistency with the blueprint

| ✓ | Item | Source |
|---|---|---|
| ☑ | Minimal APIs, vertical slices, two projects, no repository | ADR-010 |
| ☑ | The interface is **not** in `Wasl.Domain`, and the `001` architecture test still proves the domain is clean | ADR-010, `research.md` R-7 |
| ☑ | MediatR pipeline carries validation, the audit row, and the transaction — the handler does not | ADR-010, constitution V |
| ☑ | SQL Server types only: `uniqueidentifier`, `nvarchar`, `datetime2(3)`, `ON DELETE NO ACTION`, check constraints verified against `sys.check_constraints` | ADR-013, `data-model.md` |
| ☑ | No `rowversion` on an append-only table | ADR-006 as amended by ADR-013, `research.md` R-12 |
| ☑ | `TimeProvider` injected; `CancellationToken` on every async path | Constitution V, AC-18 |
| ☑ | Integration tests use `Testcontainers.MsSql`, never EF `InMemory` | `docs/sdd/testing/test-strategy.md`, `plan.md` Test strategy |
| ☑ | Every error is `ProblemDetails` from the shared middleware; `200` never carries an error | ADR-002/`002`, `05-api-conventions.md` |
| ☑ | `type`, `errors` keys, enum values, `failureCode`, `traceId` never localized | BR-8.7, AC-21 |
| ☑ | Pagination default 20, clamp 100, empty is `200` | BR-7.2, BR-7.6, AC-19, AC-20 |
| ☑ | One audit row per state change, in the transaction, body excluded | BR-9.1, BR-9.3, BR-9.7, AC-16 |
| ☑ | `UseAuthentication()` before `UseRequestLocalization()` — and a test that would fail if reversed | ADR-007, TEST-021-14 |
| ☑ | React: no global store, fetching at route level only, URL for shareable state, generated types replacing provisional ones | ADR-011 §1, §4, §6 |
| ☑ | Composed from the eight primitives; no ninth | ADR-009, `frontend-spec.md` |
| ☑ | FR-3's promise — "a provider adapter can be added later without changing the ticket model" — is made true rather than asserted | FR-3, AC-24. Nothing in `Tickets`, `TicketComments`, or `Customers` changes |

### Where this specification knowingly departs from a blueprint document

| Departure | Handling |
|---|---|
| The constitution forbids a channel abstraction without a second implementation | `spec.md` Tension 1 is the written justification the constitution's Governance section requires; `REV-021-03` records it in `review.md` and states it is not precedent |
| `02-architecture.md` lists a `ReceiveMessage` slice that is not built | `spec.md` Tension 2, `research.md` R-3. The same document says its slice list is illustrative; `CK_Interactions_Direction` makes the absence visible instead of implicit |
| `05-api-conventions.md` says a `201` carries `Location` | No single-interaction resource exists to point at. Deviation stated in the contract, in `plan.md` Risks, and recorded by `REV-021-01` |
| `03-domain-model.md` has no `Interaction` entity, though it calls itself the single source of truth | `DOC-021-01` amends it. The DoD item is satisfied by amendment, not by claiming agreement that does not exist |
| `04-business-rules.md` BR-9 has no `Communication.MessageSent` action | `DOC-021-03` |
| ADR-010 cites ADR-009 as having rejected a provider abstraction; ADR-009 says nothing of the kind | `DOC-021-05` corrects the citation. Recorded because a reader chasing it finds nothing and doubts the rest |

## Gaps accepted, with reasons

| Gap | Reason |
|---|---|
| No inbound path, and no design for one | `DEFERRED.md` US-013 stands: four design problems, three of which need a provider that is out of scope. A guessed webhook contract is worse than none |
| The interface will be wrong in detail when a real provider arrives | Accepted and stated (`plan.md`, Accepted risk). One caller, one implementation, one folder — reshaping it is a same-day change |
| The provider call sits inside the request transaction | Correct for an in-process mock, wrong for a real provider. The fix is an outbox, named as the change a provider forces rather than pre-built (spec A-6, `research.md` R-8) |
| An interaction does not appear in the ticket timeline | Q-C. BR-5.7 defines the timeline as comments plus history; a third source is a `013` change |
| No retry on a failed message | No requirement. Composing again produces one row per attempt, which is an honest history; a retry reusing the row would erase the first attempt |
| `Interactions` is append-only by convention, not by grant | Q-E. `DeliveryStatus` is the one field a real provider's callback would legitimately update, so `DENY` would have to be undone |
| The `500` path when a provider throws is untested | The mock never throws except on cancellation. The shape is in the contract; the mechanism is `002`'s middleware, tested there (`plan.md`, deliberately not tested) |
| No load or volume verification on `Interactions` | No stated requirement; one ticket holds a handful of rows |
| BR-6 has no row for "send a message" | Q-A carries a working assumption derived from the status rows and names the alternative and its one-line cost. It is an open question, not a guess in the code |

## Sign-off

| Gate | State |
|---|---|
| Specification reviewed by the product owner | **Pending** — and Q-A and Q-C are the two questions to put in front of them first |
| The constitutional deviation acknowledged by the product owner | **Pending.** `spec.md` Tension 1 is written; it is not approved. If it is refused, the feature is cut whole — nothing depends on it (`plan.md`, Dependencies) |
| Plan names every file it will create | ☑ `plan.md` |
| Contract frozen | ☑ `contracts/communications-api.md`, 2026-08-24 |
| Tasks have an owner, a verification, and something they serve | ☑ `tasks.md` |
| Droppable and not-droppable both stated with reasons | ☑ `tasks.md` |
