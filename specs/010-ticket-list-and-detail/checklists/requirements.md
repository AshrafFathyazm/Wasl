# 010 — Requirements Checklist

A check on the **specification**, not on the code. Run before `/speckit-plan` is trusted,
and again before the feature closes.

## Completeness

| ✓ | Item | Where |
|---|---|---|
| ☑ | Scope and out-of-scope are both explicit | `spec.md`, In Scope / Out of Scope |
| ☑ | Every excluded item names the feature that owns it instead | `spec.md`, Out of Scope — `015`, `011`, `012`, `013`, `016` |
| ☑ | The US-006 split is stated as an auditable table, every AC landing in exactly one folder | `spec.md`, "The acceptance-criteria split" |
| ☑ | New criteria are in a range disjoint from `015`'s, so a cross-feature citation is unambiguous | `spec.md` — `010` owns AC-17 – AC-23, `015` owns AC-24 – AC-27 |
| ☑ | Assumptions are written down, each with what happens if it is wrong | `spec.md`, A-1 – A-5 |
| ☑ | Open questions carry a working assumption rather than blocking | `spec.md`, Q-1 – Q-5 |
| ☑ | Every acceptance criterion is testable as written | `spec.md`, Acceptance Criteria |
| ☑ | Edge cases include failure cases, not only happy variations | `spec.md`, Edge Cases — `page=abc`, non-`Guid` path, a customer's id, an empty database |
| ☑ | Referenced rules are cited by ID | `spec.md`, Rules Referenced |
| ☑ | The audit position is stated, including why BR-9.1 / BR-9.3 do **not** apply | `spec.md`, "On the audit obligation"; `tasks.md`, migration note |
| ☑ | The contract is frozen and covers every status code | `contracts/tickets-list-api.md` |

## Testability — the full AC → task map

Every criterion maps to at least one task, and every task serves at least one criterion.

| AC | Tasks |
|---|---|
| AC-1 | BE-010-02, BE-010-03, FE-010-03, TEST-010-02 |
| AC-2 | BE-010-02, BE-010-10, TEST-010-02 |
| AC-3 | BE-010-01, BE-010-03, BE-010-11, FE-010-03, TEST-010-01 |
| AC-11 | BE-010-03, TEST-010-03 |
| AC-12 | BE-010-02, BE-010-04, TEST-010-06 |
| AC-13 | BE-010-02, FE-010-01, FE-010-02, TEST-010-13 |
| AC-15 | FE-010-00, FE-010-02, FE-010-07, TEST-010-14 |
| AC-16 | BE-010-08, TEST-010-10 |
| AC-17 | BE-010-06, FE-010-01, FE-010-04, TEST-010-07 |
| AC-18 | BE-010-05, BE-010-06, FE-010-05, TEST-010-08 |
| AC-19 | BE-010-07, FE-010-06, TEST-010-09 |
| AC-20 | BE-010-07, TEST-010-09 |
| AC-21 | BE-010-03, FE-010-03, TEST-010-04 |
| AC-22 | BE-010-02, BE-010-10, TEST-010-05 |
| AC-23 | FE-010-05, TEST-010-08 |

Rules with a task but no AC of their own — deliberate, and each is a Definition-of-Done
obligation rather than a story criterion:

| Rule | Task |
|---|---|
| BR-9.2, BR-9.4 — the `401` audit row | BE-010-09, TEST-010-11, REV-010-04 |
| BR-8.8, BR-8.11, BR-8.13 — key parity, the Arabic pass, Latin digits | FE-010-09, TEST-010-14 |
| BR-8.10 / ADR-013 row 4 — Arabic round-trips byte-identical | TEST-010-12 |
| ADR-011 §6 — generated types replace provisional ones | FE-010-08 |
| Contract — OpenAPI matches `contracts/` | BE-010-12, REV-010-03 |

| ✓ | Item | Note |
|---|---|---|
| ☑ | Every AC maps to at least one task | Table above; no AC is unmapped |
| ☑ | No AC needs a follow-up question to turn into a test | Each names an observable result — a status code, a field, a count, or a rendered state |
| ☑ | Nothing is verified by "it works" | Every `Verified by` cell in `tasks.md` is a command, a query, or a named observation |
| ☑ | The silent failures each have their own criterion | AC-12 (N+1), AC-22 (tie-breaker), AC-18 and AC-23 (a client-side copy of BR-1), AC-20 (`404` not `500`), AC-13 via TEST-010-13 (an inner join hiding unassigned tickets) |
| ☑ | The clamp is verified by the **echoed** value, not only by the row count | TEST-010-01, and the contract's behaviour table |
| ☑ | Arabic is verified by a byte-identical round trip, not by looking at it | TEST-010-12 — `varchar` returning `????` looks like a font bug |

## Consistency with the blueprint

| ✓ | Item | Source |
|---|---|---|
| ☑ | Two projects, vertical slices, minimal APIs; no `Wasl.Application`, no `Wasl.Infrastructure`, no controller | ADR-010; `plan.md`, Files to Create or Change |
| ☑ | No repository abstraction; `DbSet<T>` used directly | ADR-010, constitution |
| ☑ | SQL Server types throughout — `uniqueidentifier`, `nvarchar`, `datetime2(3)`, `bit`, `rowversion` | ADR-013; `data-model.md` |
| ☑ | Index verification uses a `sys.indexes` query, not a `psql` meta-command | ADR-013; BE-010-10 |
| ☑ | Integration tests use `Testcontainers.MsSql` against a real engine, never EF `InMemory` | `docs/sdd/testing/test-strategy.md`; `research.md` R-3 |
| ☑ | Status codes match the convention table; an empty result is `200`, never `404` | `docs/sdd/05-api-conventions.md`; BR-7.6 |
| ☑ | `ProblemDetails` on every non-2xx, with a `traceId`; `200` never carries an error | `docs/sdd/05-api-conventions.md`; `contracts/tickets-list-api.md` |
| ☑ | Pagination shape and clamping match the convention | BR-7.1, BR-7.2 |
| ☑ | `allowedTransitions` is returned and the client holds no copy of the state machine | ADR-004; AC-18, AC-23 |
| ☑ | `TimeProvider` injected, never `DateTime.UtcNow` inline | Constitution V; TEST-010-05 depends on it |
| ☑ | `CancellationToken` on every async path | REV-010-01 |
| ☑ | Enums as strings on the wire, untranslated | BR-8.7; `docs/sdd/03-domain-model.md` |
| ☑ | `TicketNumber` in Latin digits and left-to-right in both locales | BR-8.13; `frontend-spec.md` |
| ☑ | Components typed route / feature / primitive; fetching at route level only; no global store | ADR-011 §1, §4 |
| ☑ | Filters and paging live in the URL | ADR-011 §2 — paging here, filters in `015` |
| ☑ | CSS logical properties only; `dir="auto"` on every element rendering user content | ADR-007; `frontend-spec.md` |
| ☑ | Screen preview before any wiring | ADR-009; FE-010-00 |
| ☑ | Every new index justified by a named query | `data-model.md` — one index, one query |
| ☑ | The audit obligation is addressed rather than absent | BR-9.2, BR-9.4; BE-010-09 |

### Inconsistencies found in the blueprint, and what was done

| Found | Action |
|---|---|
| `docs/sdd/03-domain-model.md` justifies `IX_Tickets_Status_Created` as the "default list query", but that index cannot serve an unfiltered `ORDER BY CreatedAtUtc` — it describes `015`'s query | `research.md` R-2; a new index added here, named by this feature's query. The blueprint row is reported, not edited |
| `docs/sdd/design/screens/03-tickets-list.md` draws a sort control that no story specifies, and `05-api-conventions.md`'s pagination example shows `sort=-createdAt` | `spec.md` Q-3 and `research.md` R-10. Not implemented, not rendered. One of the two documents should change and that is a product decision |
| The source story has no criterion for `GET /api/tickets/{id}`, though `05-api-conventions.md` lists it under US-006 and `04-ticket-detail.md` is a US-006 screen | AC-17 – AC-20 and AC-23 added, in a range disjoint from `015`'s |
| BR-7.1 specifies a sort that is not deterministic on `datetime2(3)` | AC-22 added, plus the `Id DESC` tie-breaker. BR-7.1 is not contradicted — the tie-breaker is what makes it true |

## Gaps accepted, with reasons

| Gap | Reason |
|---|---|
| No filtering or search | `015`, by the board's instruction. This feature is deliberately half of US-006 |
| No sorting | No requirement in the source story. See Q-3 — the disagreement is recorded rather than resolved by guessing |
| No load or performance measurement | No stated requirement. AC-12's constant command count is a **structural** assertion, not a performance number, and it is the one that catches the defect that matters |
| The search-scaling limit is not addressed | There is no search here. `015`'s `research.md` records the limit rather than pre-solving it with an index nobody has measured a need for |
| The status tabs' counts | An aggregate no endpoint provides. Raised as an open question in `015`, where the tabs live, rather than inventing an endpoint |
| `allowedTransitions` does not reflect BR-1.3 or BR-6 | Deliberate — `research.md` R-5. A client can offer an action the server rejects, and the rejection carries a message. The alternative is a field that means something different for every viewer |
| The detail screen's Comments and Activity sections are empty | `013`. Declared now so the approved layout does not have to be re-opened to add them |
| Two `IRequestHandler`s that a plain method could do | `research.md` R-11. Accepted to avoid a second path to the `400` shape |
| Mapping a projection to a response record is untested | It has no behaviour. Testing it would test the compiler |

## Sign-off

| Gate | State |
|---|---|
| **Specification reviewed by the product owner** | **Pending** — this feature is awaiting approval before implementation |
| The US-006 AC split reviewed against `015`'s copy of the same table | **Pending** — both tables must agree, and disagreement is a defect in one of them |
| Plan names every file it will create or change | ☑ `plan.md` |
| Plan records at least one rejected alternative with a reason | ☑ `plan.md`, Risks and Trade-offs — twelve of them |
| Contract frozen | ☑ `contracts/tickets-list-api.md`, 2026-08-23 |
| Tasks have an owner, a verification, and something they serve | ☑ `tasks.md` |
| Agents named but not dispatched | ☑ `tasks.md`, header note |
