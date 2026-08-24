# 018 — Requirements Checklist

A completeness check on the **specification**, not on the code. Run before
`/speckit-implement`. Every "no" is either fixed in `spec.md` or accepted with a reason
under *Gaps accepted*.

---

## Completeness

| ✓ | Item | Where |
|---|---|---|
| ☑ | The story is restated precisely enough to build from without asking a question | `spec.md` § Understanding |
| ☑ | The question a reviewer will actually ask — "why is this not in Release 1?" — is answered in the spec itself | `spec.md` § Why this is in Release 2 |
| ☑ | In scope is explicit | `spec.md` § In Scope |
| ☑ | Out of scope is explicit, with a reason per exclusion | `spec.md` § Out of Scope |
| ☑ | Assumptions are recorded, each with what breaks if it is wrong | `spec.md` § Assumptions, A-1 … A-6 |
| ☑ | Open questions carry a working assumption rather than a blank | `spec.md` § Open Questions, Q-1 … Q-4 |
| ☑ | Edge cases are listed, including the ones specific to this story | `spec.md` § Edge Cases |
| ☑ | Referenced business rules are cited by ID, not restated | `spec.md` § Rules Referenced |
| ☑ | Every endpoint, status code, and `ProblemDetails` `type` is written down | `contracts/customer-overview-api.md` |
| ☑ | The status codes the endpoint **does not** return are also written down | `contracts/…` — no `403`, no `409` |
| ☑ | Every screen state is enumerated, including the ones that do not exist and why | `frontend-spec.md` § States |
| ☑ | Every new i18n key is listed, and reused keys are marked as reused | `frontend-spec.md` § Localization |
| ☑ | RTL obligations name what mirrors **and** what must not | `frontend-spec.md` § Right-to-left |
| ☑ | The data model states what earlier features already created | `data-model.md` § What already exists |
| ☑ | The plan names every file it will create or change | `plan.md` § Files to Create or Change |
| ☑ | At least one real alternative is recorded as rejected, with a reason | `plan.md` § Risks and Trade-offs — twelve of them; `research.md` R-1 … R-10 |
| ☑ | The audit position is stated, whether or not there is a row to write | `plan.md` § Audit; `research.md` R-6 |

## Testability — the full AC → task map

Every criterion maps to at least one task whose verification is a command or an
observation, never "it works".

| AC | Criterion, in short | Task(s) | Test |
|---|---|---|---|
| AC-1 | One response carries profile + counts + recent tickets | `BE-018-01`, `BE-018-05`, `FE-018-02` | `TEST-018-01` |
| AC-2 | Cap of 10, `createdAtUtc DESC, id DESC` | `BE-018-04` | `TEST-018-04` |
| AC-3 | Zero tickets → zeros present, empty list, intentional empty state | `BE-018-03`, `FE-018-03` | `TEST-018-02`, `TEST-018-13` |
| AC-4 | **Exactly three** database commands | `BE-018-01` | `TEST-018-03` |
| AC-5 | Unknown id → `404` `errors/not-found` | `BE-018-06` | `TEST-018-06` |
| AC-6 | Non-GUID id → `400` `ProblemDetails` | `BE-018-07`, `FE-018-05` | `TEST-018-06`, `TEST-018-13` |
| AC-7 | All six statuses always present, keys untranslated | `BE-018-03` | `TEST-018-02`, `TEST-018-12` |
| AC-8 | Recent list not status-filtered | `BE-018-04` | `TEST-018-07` |
| AC-9 | `recentTicketsTruncated` at 10 and 11; "see all" gated on it | `BE-018-04`, `FE-018-04` | `TEST-018-05`, `TEST-018-13` |
| AC-10 | `401`, plus one audit row outside any transaction | `BE-018-08`, `BE-018-10` | `TEST-018-08` |
| AC-11 | Successful read writes **no** audit row | `BE-018-09` | `TEST-018-09` |
| AC-12 | Both roles `200`; no `403` exists | `BE-018-08` | `TEST-018-10` |
| AC-13 | `customer` block identical to `008`'s shape, `version` included | `BE-018-05` | `TEST-018-01` |
| AC-14 | Inactive customer still returns `200` | `BE-018-05` | `TEST-018-11` |
| AC-15 | Loading, empty, not-found, error each distinct | `FE-018-03`, `FE-018-05` | `TEST-018-13` |
| AC-16 | Arabic: CLDR plurals, `dir="auto"`, email/phone stay LTR | `FE-018-08` | `TEST-018-12`, the recorded Arabic pass |
| AC-17 | `IX_Tickets_Customer` exists and is seeked | `BE-018-02` | `TEST-018-14` (recorded plan) |

| Check | Result |
|---|---|
| Every AC has at least one task | ☑ 17 / 17 |
| Every AC has at least one named test or recorded observation | ☑ 17 / 17 |
| Every task serves a named `AC-*` or `BR-*` — no task serving nothing | ☑ |
| No AC contains an untestable phrase ("validates properly", "performs well") | ☑ — AC-4 is a count, AC-17 is a recorded plan, AC-2 is an explicit sort key |
| Every AC is verifiable by one person in one sitting | ☑ |

## Consistency with the blueprint

| ✓ | Claim in these artifacts | Blueprint source |
|---|---|---|
| ☑ | Path is `GET /api/customers/{id}/overview` | `docs/sdd/05-api-conventions.md` endpoint inventory |
| ☑ | Recent tickets sort newest first | BR-7.1 |
| ☑ | An empty result is `200` with an empty collection, never `404` | BR-7.6 |
| ☑ | Both roles may view; no `403` | BR-6 |
| ☑ | Status enum values and `byStatus` keys are never localized | BR-8.7 |
| ☑ | The ticket total uses six CLDR plural categories | BR-8.14 |
| ☑ | `ticketNumber` uses Latin digits and is not localized | BR-8.13 |
| ☑ | No audit row on a read; one on the `401`, outside a transaction | BR-9.1, BR-9.2, BR-9.4 |
| ☑ | The status set is the six BR-1 values | BR-1 transition table |
| ☑ | `IX_Tickets_Customer` serves "tickets for one customer / US-004" | `docs/sdd/03-domain-model.md` query-to-index map |
| ☑ | SQL Server types throughout: `uniqueidentifier`, `nvarchar`, `datetime2(3)`, `bit`, `rowversion` | ADR-013, `docs/sdd/03-domain-model.md` § Physical shape |
| ☑ | Two projects, vertical slice, minimal API, no `Wasl.Application` / `Wasl.Infrastructure`, no repository | ADR-010, constitution § Technology Constraints |
| ☑ | Integration tests against `Testcontainers.MsSql`, never EF `InMemory` | Constitution |
| ☑ | Fetching only at the route level; three component kinds; no global store | ADR-011 §§ 1, 4 |
| ☑ | Types generated from OpenAPI, hand-written ones marked provisional | ADR-011 § 6 |
| ☑ | The screen is previewed before it is built | ADR-009, `docs/sdd/design/preview-first-workflow.md` |
| ☑ | Screen elements, tokens, and icons are referenced, not duplicated | `docs/sdd/design/screens/07-customer-profile.md` |
| ☑ | This feature is Release 2 / Phase 5, fourth in the cut order | `specs/README.md`, `docs/sdd/08-board.md`, `docs/sdd/PHASES.md` |
| ☑ | US-004's own out-of-scope list is honoured — no interaction feed, no charts, no SLA | `docs/sdd/user-stories/US-004-customer-overview.md` |
| ☑ | Requirement traced | FR-1.5; NFR-2, NFR-10 |

### Deviations from the blueprint, deliberate

| Deviation | Reason |
|---|---|
| The screen spec lists `400` for a malformed id; ASP.NET Core's *natural* behaviour with a `{id:guid}` route constraint would be `404`. The plan drops the constraint to honour the screen spec | `research.md` R-7. The screen shows different things for a broken link and a missing customer, so the API must be able to tell them apart |
| `docs/sdd/03-domain-model.md` puts `IX_Tickets_Customer` in the `dbo.Tickets` DDL, but no feature had claimed the migration | `data-model.md`, spec Q-1. Claimed here, created only if absent |
| AC-2 adds an ordering tie-break the blueprint's sort rule (BR-7.1) does not mention | `research.md` R-4. BR-7.1 was written against microsecond timestamps; `datetime2(3)` makes ties ordinary |

## Gaps accepted, with reasons

| Gap | Reason it is acceptable |
|---|---|
| No comment count and no "last contacted" timestamp | Spec Q-2. Neither is on the screen spec, and each is another aggregate. Adding them speculatively means an index and a test for a number nobody asked to see |
| No pagination inside the overview | Spec A-5. The cap is 10 and "see all" hands off to `/tickets?customerId=…`, which already pages. A second pagination surface over the same rows is the gap that should stay open |
| No `403` path, and therefore no forbidden state on the screen | BR-6 permits both roles. Building the state would mean building a branch no request can reach |
| No cross-channel interaction feed | Out of scope in US-004, and there is no interaction entity in the domain model to feed it |
| The `customer` block's shape is owned by `008`, so this contract can be moved by a change elsewhere | Accepted deliberately in `plan.md` § Contract changes. The alternative is two declarations of one shape kept in step by hand, which is the more expensive failure |
| `IX_Tickets_Customer`'s effect on latency is not measured | It would measure the test container, not the code. `AC-17` records the plan instead, which is the thing that can actually be wrong |
| The DTO-mapping code is not unit-tested field by field | It has no behaviour beyond assignment. The full shape is asserted once, at the HTTP boundary, in `TEST-018-01` |
| Ownership of the index migration is unresolved | Spec Q-1, flagged for a human. The working assumption is safe in all three orderings, and the wrong outcome is a loud migration failure rather than a silent scan |

## Sign-off

| Item | Status |
|---|---|
| Specification reviewed by the product owner | **Pending** |
| Contract frozen | ☑ 2026-08-23 — `contracts/customer-overview-api.md` |
| Open questions Q-1 … Q-4 answered | **Pending** — Q-1 blocks `BE-018-02` and must be answered before it starts. Q-2, Q-3, Q-4 have working assumptions that are safe to build on |
| Plan approved, and agents therefore dispatchable | **Pending** — `tasks.md` names agents; none is dispatched until this row is signed |
| Screen preview `FE-018-00` approved | **Pending** — gates all other `FE-018-*` work |

Nothing in this feature is implemented. `docs/sdd/08-board.md` and
`docs/sdd/12-delivery-log.md` are where delivery is recorded, and neither says otherwise.
