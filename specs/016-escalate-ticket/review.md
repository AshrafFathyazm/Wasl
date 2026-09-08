# US-009 — Review

**Phase:** 6 · **Role:** Review · **Status:** Complete · **Date:** 2026-09-08

Scope: this story's blast radius, not the whole system.

**Who reviewed this.** The main session, self-reviewing, because the product owner was
away and the instruction was to take decisions rather than block. That is a weaker review
than a second reader and is stated rather than dressed up: **every decision is in
`summary.md` under Deviations and `ai-notes.md` under "Open questions that were decided",
so any of them can be overturned without re-deriving the reasoning.** The parts a
self-review cannot do — judging whether the Arabic copy reads well (Q-8), and whether
redacting `012`'s status note is wanted — are listed below as open.

## Blocking Issues

| # | File | Issue | Required change |
|---|---|---|---|
| — | — | None found | — |

Marking everything blocking makes the review useless. Blocking means the story cannot
ship.

## Non-Blocking Improvements

| # | File | Suggestion |
|---|---|---|
| 1 | `src/wasl-web/src/features/tickets/EscalateTicketModal.tsx` | FE-016-09's focus trap and screen-reader pass were not done. `Modal` carries the trap and eight screens rely on it, but this dialog was not walked keyboard-only |
| 2 | `tests/Wasl.Api.IntegrationTests/Tickets/EscalateTicketTests.cs` | No concurrent-escalation test. The sequential stale-version case passes and the mechanism (`rowversion` + EF's re-check at `SaveChanges`) is `007` AC-13's, unchanged — but two in-flight requests against one version are untested |
| 3 | `src/wasl-web/src/lib/api-types.provisional.ts` | Still hand-written. FE-016-07 replaces these with types generated from OpenAPI, and that is blocked on `002c`'s document being served or exported — not this feature's to unblock |
| 4 | `docs/sdd/documentation/api/error-handling.md` | The new table has an "Added by" column that no test checks. The suffixes are checked both ways; the attribution is prose |
| 5 | `src/Wasl.Application/Features/Tickets/TicketDetailReader.cs` | Three separate reads plus `TicketTagReader`'s one. `010` AC-12's counter proves there is no per-row query, but a single projection would be fewer round trips — declined because it would be a second mapping, which the contract's "returns the same resource" forbids |

## Missing Tests

| Rule or AC | What is missing |
|---|---|
| ADR-006, concurrency | Two simultaneous escalations on one `expectedVersion`. Recorded in `tests.md` under **Not Tested** |
| AC-16, accessibility | Keyboard-only and screen-reader walkthrough of the dialog |
| BR-3.5 | A reason of exactly 501 characters *after* trimming, i.e. 501 real characters plus trailing space. 501 and 500+space are both covered; the composite case is not, and the server measures after trimming so it is the same code path |

## Acceptance Criteria Status

| AC | Met / Not met / Partial | Note |
|---|---|---|
| AC-1 … AC-8 | **Met** | Every one named to a test in `tests.md` |
| AC-9 | **Met, inherited** | `026` built the badge and the filter. Re-verified live: the dashboard's escalated tile moved 0 → 3 |
| AC-10 … AC-15 | **Met** | AC-15 gained `Every_endpoint_reports_canEscalate_the_same_way`, which is what caught finding #2 |
| AC-16 | **Partial** | The dialog, the `canEscalate` gate, the length rules, inline errors and the callout are all built and tested. **The focus trap and screen-reader pass (FE-016-09) were not done** |
| AC-17 | **Met** | Both catalogues, guarded for all six namespaces, and both languages walked in a browser. **Q-8 stands: nobody has reviewed the Arabic copy for register or tone** |

## Boundary Check

| Check | Result |
|---|---|
| Domain logic outside controllers and components | **Pass.** BR-3.3, BR-3.4, BR-3.6 and BR-3.7 are all in `Ticket.Escalate`; the handler does the lookup and the version check; the controller binds, authorises, dispatches and maps |
| Domain has no infrastructure dependency | **Pass.** `Ticket.Escalate` takes a `DateTime` and a `Guid`. `LayerDependencyTests` unchanged and green |
| DTOs at the boundary, not entities | **Pass.** `EscalateTicketRequest` in, `CreateTicketResult` out. No entity crosses |
| Every new index justified | **No new index, and no migration.** The four columns and the FK are `009`'s; `TicketHistoryEventType` is `nvarchar(30)`, so a new enum member needs no schema change |
| No query inside a loop | **Pass.** `TicketDetailReader` does a fixed number of reads regardless of tags or history size; `TicketTagReader` joins in the projection |
| `CancellationToken` threaded through | **Pass.** Every async path from the controller down takes and passes it |

Extra checks this story's shape called for:

| Check | Result |
|---|---|
| `DateTime.UtcNow` anywhere | **None.** `IRequestTimestamp` only, and `Both_rows_share_one_instant` proves one instant per request |
| A server-owned field the client can set | **None.** The request has two members; `Object.keys(body).sort()` is asserted to equal `['expectedVersion','reason']` |
| Two tables written without a transaction | **Pass.** One `SaveChangesAsync` inside `TransactionBehaviour`'s boundary, so a ticket cannot become escalated without the row explaining it |
| Check-then-act as the guarantee | **Not relied on.** The explicit version check gives the readable `409`; EF's re-check at `SaveChanges` is the rule |
| A deadlock translated as a business conflict | **Pass, inherited.** `036`'s `TransientFailureBehaviour` is outermost and unconstrained |
| An external call inside the transaction | **None** |

## Security Notes

Against `testing/security-checklist.md`.

| Concern | Finding |
|---|---|
| Role enforcement | `ManagerOnly` at the endpoint, and it is the policy's first production use. Verified with a real Agent token against the running server: `403` |
| The `403` is audited | Yes — `Auth.Forbidden`, `Outcome = Denied`, outside any transaction, matched to the trace id **in the response body** |
| Enumeration oracle | Closed deliberately: an Agent gets `403` for an unknown id, so the endpoint discloses nothing about which tickets exist. A Manager gets `404`, which discloses nothing they may not already see |
| Sensitive data in the audit diff | **This was a real finding, now fixed.** The escalation reason was going out in full, twice. Redacted at both entity-qualified names, with the field names and the fact of the change kept — so "escalated with a stated reason" stays auditable |
| Sensitive data in a log line | None. The reason is never logged; the handler logs nothing |
| PII in the `409` bodies | None. No conflict here carries an `errors` object, an id, or a name |
| A secret in the diff | None. No new configuration and no new secret — the five in `CLAUDE.md` are unchanged |
| Rate limiting | Inherited from `036` §3.4. No endpoint-specific limit, with a stated reason: BR-3.4 makes a repeat a `409`, so a flood cannot double a write |

**Open for the product owner:** redacting `TicketHistoryEntry.Note` also redacts `012`'s
status-change note from the audit diff. The argument is in `04-business-rules.md` — the same
category of data through a different endpoint — and it is a widening of BR-9.7 that nobody
asked for explicitly. It can be narrowed to `Ticket.EscalationReason` plus a per-event-type
rule if that is wanted, at the cost of the reason surviving in the `Escalated` row's `Note`.

## Scope Check

Anything built that is not in `spec.md`.

| Built | In `spec.md`? | Justification |
|---|---|---|
| `TicketDetailReader` | No | Forced by adding a field to a mapper whose five call sites disagreed. Not building it meant either shipping `canEscalate: false` from three endpoints or passing four arguments at five sites and hoping |
| `CurrentUserExtensions.IsManager` | No | Three copies of the role comparison existed, two as the literal `"Manager"` and one as `nameof(SupportRole.Manager)`. They agree today, which is what would make a rename break two of three with a green build |
| `AuditRedaction`'s three new rows | Implied by TEST-016-14 | `tasks.md` requires the reason out of `Changes`. BR-9.7's literal list did not cover it |
| `TicketReadShapeTests` | No | The guard that makes the reader structural. A comment promising it without the test would be a false claim |
| `locales/catalogues.test.ts` | Implied by AC-17 | AC-17 requires `en`/`ar` parity for new keys and nothing checked the `tickets` namespace at all |
| `ProblemRegistryTests.Every_registered_type_is_in_the_documented_table` | No | DOC-016-01 asks for one row in a table that had drifted eight rows behind. Adding the row without the guard repeats `036`'s finding |
| `CloseTicketModal.module.css` — one line | No | `039`'s footer had the identical measured defect, and its own comment asserted the behaviour that did not happen |
| `PriorityChanged` on the timeline | Implied by AC-8 | AC-8 requires the row. The server addition was mandatory; the client label was missing and rendered blank |

**Nothing here widens the feature's behaviour.** Every item is a guard, a consolidation, or
a correction to something already shipped. The one judgement call with product consequences
is the `TicketHistoryEntry.Note` redaction, flagged above.

## Verdict

**`Approved`**, with AC-16 recorded **Partial** (FE-016-09 not done) and one item open for
the product owner (the `012` note redaction).
