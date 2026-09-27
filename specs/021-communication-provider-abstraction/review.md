# US-012 — Review

**Phase:** 6 · **Role:** Review · **Status:** Complete · **Date:** 2026-09-08

Scope: this story's blast radius, not the whole system.

**Who reviewed this.** The main session, self-reviewing, because the product owner was
away and the instruction was to take decisions rather than block. That is a weaker review
than a second reader and is stated rather than dressed up: **every decision is in
`summary.md` under Trade-offs and Deviations, so any of them can be overturned without
re-deriving the reasoning.** The parts a self-review cannot do — judging whether the
Arabic copy reads well (Q-8), and ruling on the constitutional deviation below — are
listed as open.

**Written late.** `021` delivered on 2026-09-08 and this file was written on 2026-09-27,
after it had already been committed in `c6efba7`. Every other delivered feature from `007`
onward had a `review.md` and this one did not, which is exactly the gap gate 6 exists to
prevent. **Recorded rather than backdated.** Two things follow from the delay and are
noted where they arise: the OpenAPI comparison (REV-021-02) was satisfied by a test that
ran at delivery, not by a fresh run, and three of this review's findings are corrections
to *documents*, which is what a review deferred past the commit can still catch.

## Blocking Issues

| # | File | Issue | Required change |
|---|---|---|---|
| — | — | None found | — |

Blocking means the story cannot ship. It shipped, and nothing found here would have
stopped it.

## Non-Blocking Improvements

| # | File | Suggestion |
|---|---|---|
| 1 | `src/wasl-web/src/features/tickets/TicketMessagesPanel.tsx` | Not walked keyboard-only or with a screen reader. The same gap `016` recorded for its dialog, and now the second feature to record it — **two makes it a pattern, not an omission**, and it belongs to whoever owns accessibility as a task rather than to the next feature that happens to notice |
| 2 | `src/Wasl.Application/Features/Communications/SendMessage/SendMessageCommandHandler.cs` | The provider call sits **inside** `TransactionBehaviour`'s boundary. Sound only because the mock is in-process; `CLAUDE.md` names an external call inside a transaction as a defect shape. Recorded in `summary.md` as the change a real provider forces, rather than pre-built as an outbox nothing needs yet |
| 3 | `src/Wasl.Infrastructure/Communications/MockProviderOptions.cs` | `FailChannels` binds only from `appsettings`, not from an environment variable or a `--Key=Value` argument. Measured, not assumed — `MockProviderOptionsBindingTests`. It is a demo affordance, so the limitation is stated rather than worked around |
| 4 | `src/wasl-web/src/lib/api-types.provisional.ts` | Still hand-written, now with three more shapes in it. Blocked on the OpenAPI document being served or exported, which `002c` deliberately does not do — not this feature's to unblock |
| 5 | `src/Wasl.Application/Features/Communications/SendMessage/SendMessageCommandHandler.cs` | `SendMessageCommandValidator` is the only validator in the codebase with a constructor dependency. It is the right place for the check — an unregistered channel is a `400`, not a `409` — but it broke three validator-scanning guards, which is a cost the next validator with a dependency will pay again unless `ValidatorFactory` is kept in mind |

## Missing Tests

| Rule or AC | What is missing |
|---|---|
| AC-8 | A fault injected between `provider.SendAsync` and `SaveChangesAsync`, proving the row rolls back while the buffer keeps the attempt. **Recorded unmet** in `tests.md`. The asymmetry is documented on `SentMessageBuffer` (*"a diagnostic, not a ledger"*) and is **not proved** |
| AC-18 | No test drives a cancelled request through the pipeline. The mock checks the token before recording anything and `SendOutcome` has no factory that could express a cancelled send, so the wrong behaviour is not expressible — but that is an argument, not a test. **Partial** |
| Accessibility | Keyboard-only and screen-reader walkthrough of the Messages panel |
| Pagination | A genuine second page of interactions. The clamp and `page=0` are tested; no seeded ticket has more than one page |
| The `500` path | A provider that **throws** for a reason other than cancellation. Needs a throwing stub; the shape is `002`'s middleware, which every other feature exercises |

## Acceptance Criteria Status

| AC | Met / Not met / Partial | Note |
|---|---|---|
| AC-1 … AC-7 | **Met** | Every one named to a test in `tests.md`. AC-7 is the feature's central decision — a refused delivery is a `201` carrying `deliveryStatus: "Failed"` |
| AC-8 | **Not met** | Recorded, not quietly dropped. See Missing Tests |
| AC-9 … AC-17 | **Met** | AC-9's constraint assertion had to move to the **migrator** connection: `003b`'s `db_datareader` lacks `VIEW DEFINITION`, and SQL Server returns null rather than erroring, so the test reported a missing constraint for one that was present and enforcing |
| AC-18 | **Partial** | See Missing Tests |
| AC-19 … AC-23 | **Met** | AC-21 verified live in both languages: `type`, the `errors` key and `status` byte-identical while `title` and `detail` translated |
| AC-24 | **Met, by a different route than planned** | A stub on `LiveChat` gets `409` — correctly, per spec A-3, which requires a recipient rule as well as a registration. The mock was **replaced on `Email`** instead, and the `LiveChat` case kept as its own test asserting what it actually proves |

## Boundary Check

| Check | Result |
|---|---|
| Domain logic outside controllers and components | **Pass.** The outcome pairing is enforced in `Interaction.Send`; the handler orders the refusals and calls the provider; the controller binds, authorises, dispatches and maps |
| Domain has no infrastructure dependency | **Pass.** `Wasl.Domain/Communications/` names no provider type and no EF type. `LayerDependencyTests` unchanged and green |
| The port is in the right project | **Pass, and this was the approval-gate correction.** `ICommunicationProvider` is in `Wasl.Application/Common/Abstractions/` because **nothing in `Wasl.Domain` calls a provider** — R-7's argument survived ADR-010's rejection; only its destination moved |
| DTOs at the boundary, not entities | **Pass.** `SendMessageRequest` in, `InteractionResponse` out. `InteractionResponse.From` has **no optional parameters**, deliberately — `016`'s eleven missing fields came from a mapper whose optional parameters every call site could silently drop |
| Every new index justified | **`IX_Interactions_Ticket_Time`** serves the only read there is — one ticket's interactions, oldest first. No second index speculatively |
| No query inside a loop | **Pass.** One projection per request; `010` AC-12's counter is unchanged |
| `CancellationToken` threaded through | **Pass.** Verified by grep: every `async Task` in `Features/Communications/` and `Infrastructure/Communications/` takes one and passes it, including into `provider.SendAsync` |

Extra checks this story's shape called for:

| Check | Result |
|---|---|
| The refusals run **before** the provider call | **Pass, and it is the check this feature most needed.** `404 → 403 → 409 ticket-closed → 409 no-contact`, all above `provider.SendAsync` in one method. A guard that ran after the send would look identical in every test that only reads the status code, and the failure mode is a message reaching a customer on a ticket the sender had no business touching |
| `DateTime.UtcNow` anywhere | **None.** `IRequestTimestamp` only |
| A server-owned field the client can set | **None.** `SendMessageRequest` is `(Channel, Body)`. **No recipient**, deliberately — an address on the wire would be the one place in this product a support user could direct customer data to an arbitrary destination. No `deliveryStatus`, no `providerMessageId`, no `expectedVersion` (nothing is being mutated) |
| Two tables written without a transaction | **N/A.** One table, one `SaveChangesAsync`, inside `TransactionBehaviour` |
| Check-then-act as the guarantee | **Not relied on.** `CK_Interactions_Direction` and the outcome constraint are database rules, not code conventions |
| A deadlock translated as a business conflict | **Pass, inherited.** `036b`'s `TransientFailureBehaviour` is outermost and unconstrained |
| An external call inside the transaction | **Present, and stated.** See Non-Blocking #2 |
| Duplicate request creates a duplicate row | **Yes, deliberately, and it is the honest answer.** No `Idempotency-Key`: deduplicating an outbound message means guessing whether the user meant to send twice, and a swallowed second message is worse than a duplicate — the customer sees neither and the agent believes they sent it. Submit is disabled while in flight, which is a mitigation and not a guarantee |

## Contract Check — REV-021-02

The generated OpenAPI document was compared against `contracts/communications-api.md` by
`OpenApiContractTests`, which runs in the integration suite in both directions. **At
delivery it was green as part of 591 passing integration tests**; this review did not
re-run it, and says so rather than implying a fresh measurement.

What the comparison found, and it was a real finding rather than a formality:

- **Four dead `NotBuiltYet` exemptions**, every one naming an endpoint its own contract
  *rejects*. Three of them were found by a guard written during this feature —
  `No_pending_entry_names_an_endpoint_no_contract_declares` — not by reading the list.
- **No inbound operation appears in the document**, which is the half of the "no inbound"
  claim a schema constraint cannot make. `CK_Interactions_Direction` is the other half.
- `POST /…/messages` returns `201` with **no `Location`**, which the contract states in
  words and `The_created_response_carries_no_location_header` asserts. **This is the
  deviation most likely to be "corrected" by someone applying the house rule that a `201`
  carries `Location`** — there is no single-interaction resource to point at, and inventing
  `GET /api/interactions/{id}` to satisfy a convention would be a new endpoint with no
  caller.

## Constitutional Deviation — REV-021-03

**Recorded, not argued away.** The constitution says: *"No new abstraction without a second
implementation in hand or in prospect. This applies to provider wrappers, **channel
abstractions**, and generic base classes alike."* `ICommunicationProvider` is a channel
abstraction with exactly one implementation, and no second is in prospect — no provider
account is in scope, and AC-17 asserts by source search that nothing behind the seam
touches a network.

`DEFERRED.md` applied that test to this exact story and deferred it. `08-board.md` then
promoted it. **That is a conflict, not an ambiguity**, and it is resolved through the
mechanism the constitution specifies in Governance: complexity justified in writing at the
point it is introduced.

**The justification** (`spec.md` Tension 1): Communication Channels resolves to one enum
column today, which reads as *missing* rather than as *scoped*. The feature's deliverable
is a demonstrable seam and a visible surface — a module a reviewer can open, not an
interface they have to be told about.

**It is not precedent.** The next abstraction with one implementation gets the same test
and, absent the same demonstrability argument, the same answer `DEFERRED.md` gave. What
made this one pass is not "an interface is good design"; it is a stated, checkable reason
that another feature would have to make for itself.

**Open for the product owner:** this deviation was approved in-session under the standing
instruction to decide rather than block. It is the item in this feature most worth an
explicit ruling, because it is the one that could be read as loosening a constitutional
rule rather than as one recorded exception to it.

## Security Notes — REV-021-04

Against `docs/sdd/testing/security-checklist.md`.

| Concern | Finding |
|---|---|
| A credential anywhere | **None.** No key, no token, no account, no connection to a provider. AC-17 asserts it by source search over `Features/Communications/` and `Infrastructure/Communications/` |
| A network path | **None.** No `HttpClient`, `SmtpClient`, `Socket` or `WebSocket`. **The guard's first run went red on its own prose** — `MockCommunicationProvider`'s comment promises the absence of all three — so it strips comments now, with a five-case control proving the stripper ran |
| A request-reachable failure trigger | **None, by design.** `FailChannels` is configuration only. A body token and an `X-Force-Failure` header were both rejected **by name**: either one is a request that changes how the server behaves toward a customer, which is a production affordance wearing a demo label |
| Sensitive data in the audit diff | **This was a real finding, now fixed.** `Interaction.Body` — an outbound message's text, and the only text in this product a *customer* receives — was going into `Changes` in full. Redacted under both spellings (CLR type and table). **The third time BR-9.7's list has been found short**, after `016`'s escalation reason twice |
| The recipient address in the diff | **Deliberately not redacted.** It is the fact being audited — *who was contacted* — and redacting it would leave an audit row that records a message was sent and refuses to say to whom |
| Sensitive data in a log line | **None.** One English `Information` line carrying `ticketId`, `channel`, `providerName`, `deliveryStatus` and body **length**. Neither the body nor the recipient: the body by direct analogy to BR-9.7's comment rule, the address because it is already in `dbo.Interactions` for anyone entitled to read it and duplicating it into logs widens access for no diagnostic gain |
| Authorization | Assignment-sensitive (Q-A, ruled by the product owner). A Manager sends on any ticket; an Agent on their own or an unassigned one. **In the handler, not as a policy** — BR-6: a handler denial is audited and a policy denial is not, and `ManagerOnly` here would refuse the legitimate Agent case |
| Enumeration oracle | **Closed.** An Agent gets `404` for an unknown id and `403` only for a ticket that exists and is someone else's — `An_agent_gets_not_found_for_an_unknown_id_here` |
| PII in a refusal body | **None.** `no-contact-for-channel` names the field `channel` and nothing else — no address, no customer name, no id |
| A secret in the diff | **None.** `Communications:Mock` carries no secret; the five in `CLAUDE.md` are unchanged |
| Rate limiting | Inherited from `036` §3.4 — 60 writes per caller per minute. **No endpoint-specific limit, and this is the one endpoint where that deserved a second look**, because it is the only write that reaches a customer. Left inherited with a stated reason: the mock sends nothing, so the abuse surface is a database row until a real provider exists — **and a real provider makes this a per-endpoint decision that has to be taken, not inherited** |

## Scope Check

Anything built that is not in `spec.md`.

| Built | In `spec.md`? | Justification |
|---|---|---|
| `MockProviderOptionsBindingTests` | No | Written to settle a disagreement between two measurements, and it is the reason the binder was **not** "fixed" to satisfy three false negatives. The cause was a stale process holding the port |
| `channelIcons.ts` | No | `021` became the channel-icon map's second consumer. `037` found `IconEye` declared in two files with different geometry, rendering different drawings under one import name — one map now, before the same thing happens again |
| `No_pending_entry_names_an_endpoint_no_contract_declares` | No | Found four dead exemptions, two of them `021`'s own. A pending list that outlives its reason is a list that stops guarding anything |
| `ValidatorFactory` | No | Forced by the validator's constructor dependency. **It throws rather than skipping** an unbuildable validator, because a guard that silently skips what it cannot construct is a guard that reports green on the case it was written for |
| `AuditRedaction`'s two new rows | Implied by AC-16 | AC-16 requires the body out of `Changes`. BR-9.7's literal list did not cover it |
| `SentMessageBuffer` | Yes, as the demo surface | Bounded at 200 and documented as *"a diagnostic, not a ledger"* — the row that AC-8 was supposed to prove and does not |

**Nothing here widens the feature's behaviour.** Every item is a guard, a consolidation, a
measurement, or a correction to something already shipped.

## Documents corrected by this review

Written late, this review found three document defects that the delivery pass missed. All
three are fixed in the same change as this file:

| Document | Was | Now |
|---|---|---|
| `docs/sdd/design/screens/04-ticket-detail.md` | No Messages section at all (DOC-021-04 never done). Also **two statements made stale by `016`**: escalate listed as "drawn and inert", and a priority-change row listed as absent because `PriorityChanged` "cannot arrive" | The Messages tab documented — elements, the four decisions it encodes, six new state rows, and its RTL rule — plus both `016` corrections, the second kept with the reason the blank row survived every frontend test |
| `docs/sdd/user-stories/DEFERRED.md` | US-012 read **Deferred**, so a reader arriving there would conclude `021` was built against a standing decision | **Promoted and delivered**, pointing at this folder and the board, with the original reasoning kept in a fold and the non-precedent statement carried across |
| `docs/sdd/documentation/api/overview.md` · `development/setup.md` | Both promised interactive documentation at `/swagger` | **There is no `/swagger`, and there never was.** `002c` measured it in August; these two files were never updated. A path that answers `401` from the fallback policy reads like a protected endpoint rather than an absent one, which is why it survived fifteen features |

**DOC-021-05's other half needed no work, and the task row was stale before `021` started.**
It asked for ADR-010's claim that *"ADR-009 applied the same test to a provider abstraction
and rejected it"* to be corrected — a sentence `research.md` R-1 rightly flagged, since
ADR-009 says nothing of the kind. It is not in the file. `git log -S` puts it at line 28 of
`fd0dfca`, removed by `d3add43`, the commit that rejected ADR-010. **Verified rather than
assumed**, because "the correction is already there" and "the correction was never needed"
look identical from a clean grep.

## Verdict

**`Approved`**, with AC-8 recorded **Not met**, AC-18 **Partial**, and one item open for
the product owner: the constitutional deviation above, which was taken in-session under a
standing instruction to decide rather than block, and is the kind of decision that should
be affirmed by a person rather than inherited by the next feature.
