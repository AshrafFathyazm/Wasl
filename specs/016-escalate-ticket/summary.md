# US-009 — Summary

**Phase:** 7 · **Role:** Summary · **Status:** Complete · **Date:** 2026-09-08

Written for someone who was not present. This is what is read in six months and
discussed when the decision is questioned.

## What Was Built

From the user's point of view.

**A manager can escalate a ticket, and only a manager can.** On `/tickets/:id`, «اتخاذ
إجراء» → «تصعيد» opens a dialog asking one question — *why* — and nothing else. Confirm
marks the ticket escalated, raises its priority to `High` if it was below that, records who
did it and when, and writes the reason to the timeline. The ticket then carries an
«مُصعَّدة» pill in its header and an amber block on the rail naming the manager, the time
and the reason.

**It cannot be undone.** There is no de-escalate anywhere — no endpoint, no field on any
request, no button. The dialog says so before you confirm, and the callout says so
afterwards.

**An agent is never offered it.** The menu row is disabled for them with a reason, and the
endpoint refuses them with a `403` even for a ticket id that does not exist — so an agent
probing ids learns nothing about which tickets are real.

**A resolved or closed ticket cannot be escalated**, and the refusal says which of those it
is rather than "this ticket is closed" about a resolved one.

### On the wire

`POST /api/tickets/{id}/escalate` with `{ reason, expectedVersion }`, returning the updated
ticket. Four fields joined the ticket read shape: `escalatedAtUtc`, `escalatedBy`,
`escalationReason` and `canEscalate`.

## Why It Was Built This Way

### BR-3.6 is a floor, and that is the whole reason this is its own story

`docs/sdd/testing/test-strategy.md` names it the rule most likely to be implemented
wrongly, and the failure is silent: writing `Priority = High` **downgrades** a `Critical`
ticket. The request succeeds, nothing is logged, and the ticket that most needed attention
becomes less visible *because* somebody escalated it.

So it is a comparison, `Priority < EscalationPriorityFloor`, and there are four independent
statements of the rule:

1. `Escalate_WhenPriorityIsCritical_LeavesPriorityUnchanged` — TEST-016-02, the named test.
2. **The history row count.** A `Critical` ticket writes one row, a `Normal` one writes two.
   An unconditional write produces a `PriorityChanged` row saying `Critical → High` — a
   permanent record of a downgrade that never happened, and *a false history row is worse
   than a missing one*.
3. **The audit diff**, produced independently by `003`'s interceptor from EF's change
   tracker, so it reports what actually moved. A `Critical` escalation's diff names
   `IsEscalated` and not `Priority`.
4. **The dialog's own sentence**, which reads "The priority stays Critical" rather than
   announcing the defect to the user.

`tasks.md` BE-016-02 asked for a separate `TicketPriorityFloor.RaiseTo` with an explicit
rank map. **Deviation:** the comparison is inline in `Ticket.Escalate` instead. A rank map
would be a second copy of the enum's declaration order, and what makes the comparison safe
is `The_priority_rank_is_ascending_by_urgency` — four asserted literals, written out rather
than read from the enum, so reordering `TicketPriority` fails a build instead of quietly
changing a business rule. The ordinals are safe to pin because `009` stores the column as a
**string**; if it were an `int` this test would be asserting a storage format.

### `ManagerOnly` finally has a production consumer

`CLAUDE.md` recorded that the policy was proven only against a test-host endpoint, and that
*"the first endpoint that is genuinely Manager-only should carry it"*. This is that
endpoint. `011` deliberately did not use it — BR-2.2 makes an Agent self-assigning
legitimate, so a role gate there would refuse the legal case — and BR-3.2 has no such
exception.

**The `403` is ahead of the `404`, and that is a disclosure decision.** The policy runs
before the ticket is looked up, so an Agent gets `403` for every id. `004b`'s
`AuthDenialResultHandler` envelopes that body and writes an `Auth.Forbidden` audit row, so
the refusal is recorded — which is BR-6's split having a measurable consequence, not a
style choice.

`tasks.md` BE-016-07 named a new `CanEscalate` policy. **Deviation:** `ManagerOnly` is
exactly BR-3.2 and already exists. A second policy with identical contents would be a
second thing to keep in step.

### `canEscalate` is computed on the server, like `allowedTransitions`

It is `IsEscalatable && caller is Manager` — one fact about the ticket (BR-3.3, BR-3.4) and
one about the caller (BR-3.2). The client can see only the first, and a client recomputing
the whole thing is BR-3 re-implemented in TypeScript: correct until BR-3 changes, then wrong
in one place nobody looks, showing as a menu item that produces a `403` for something the
interface offered. Same reasoning as ADR-004, and there is a source scan for it.

**One boolean, not a reason string.** A reason the client branches on is BR-3 arriving
through the back door. What the client *may* read is `isEscalated` — a plain fact, not a
rule — to choose between "already escalated" and "not permitted" in the disabled row's
title. Neither message claims to know which of BR-3.2, BR-3.3 or BR-3.4 fired.

### The refusal order is fixed, and distributed on purpose

```text
400  validation                  the pipeline, before the handler
403  role policy                 the ENDPOINT, before the lookup
404  ticket not found            the handler
409  concurrency-conflict        the handler, BEFORE the entity's rules
409  ticket-not-escalatable      Ticket.Escalate (BR-3.3)
409  already-escalated           Ticket.Escalate (BR-3.4)
```

Several failures can apply at once, a test asserting "not 200" passes against the wrong
reason, and a client branching on the first failure it was shown gets a different answer on
a retry. Two of these orderings needed their own test because every other test passes
either way: a **closed and already-escalated** ticket, and a **stale version on a resolved**
ticket.

The version check is ahead of the state rules for `012`'s reason: a stale client's
escalation judged against a state it never saw produces a `409` naming a condition the user
cannot reconcile with their screen. "Reload" is true and actionable; "this ticket is
resolved" is neither, when their copy says otherwise.

### `ticket-not-escalatable` is its own `409`

Not `ticket-closed`, because BR-3.3 refuses `Resolved` as well — and a manager told "this
ticket is closed" about a resolved ticket goes looking for the wrong thing.

## Trade-offs

| Decision | Alternative | Why |
|---|---|---|
| One dialog with one field | A one-click row action | BR-3.5 makes the reason required, 1–500 chars. A one-click action cannot satisfy the endpoint |
| No priority control in the dialog | Let the manager choose | A picker could send a value **below** BR-3.6's floor — the one outcome that rule exists to prevent — and it would look like it worked |
| No optimistic update | Paint the new priority immediately | The client cannot compute the result without re-implementing BR-3.6. It refetches (`026` §5) |
| Errors inline, success as a toast | Both as toasts | A `403`/`409` is about the thing being looked at, with the typed reason still in the field. The success surface is already leaving |
| `canEscalate` absent from the list row | Add it to `TicketListItem` | Cheap on the server, but escalation needs a reason field, and `escalationReason`/`escalatedBy` would have to come too. The row stays narrow; its menu item says where the act lives |
| Redact the reason from the audit diff | Leave it | BR-9.7's principle: the trail records **that** it happened. See the finding below |
| No idempotency mechanism | An `Idempotency-Key` like `POST /api/tickets` | BR-3.4 answers a duplicate with `409 already-escalated`. A retry cannot create a second escalation — the same guarantee BR-4's unique index gives `POST /api/customers` |
| No throttle of its own | A per-endpoint limit | `036` §3.4's general write limit covers it, and BR-3.4 makes a repeat harmless. A tighter limit would need a stated reason |

## Deviations from the plan

| # | Planned | Built | Why |
|---|---|---|---|
| 1 | `TicketPriorityFloor.RaiseTo` with a rank map (BE-016-02) | An inline comparison, guarded by an explicit rank-order test | A rank map duplicates the enum's declaration order. The guard is what makes either version safe |
| 2 | `Ticket.Escalate(reason, byUserId, TimeProvider)` returning `EscalationResult` with a `PriorityChanged` flag (BE-016-03) | `Escalate(reason, byUserId, DateTime occurredAtUtc)` returning `IReadOnlyList<TicketHistoryEntry>` | Matches `Assign` and `ChangeStatus`. The instant comes from `IRequestTimestamp` so both rows and the ticket share one, and the row **count** is the signal a flag would have carried |
| 3 | A new `CanEscalate` policy (BE-016-07) | `WaslPolicies.ManagerOnly` | It is exactly BR-3.2 and already existed with no consumer |
| 4 | The full `canEscalate` matrix over six statuses (TEST-016-13) | Four rows over HTTP, six statuses exhaustively in the domain tests | The task list offers this reduction. Thirty-six requests proving a property already proven without a container is cost, not coverage |
| 5 | *(not planned)* | `TicketDetailReader`, `CurrentUserExtensions.IsManager`, `TicketReadShapeTests`, `locales/catalogues.test.ts`, `ProblemRegistryTests.Every_registered_type_is_in_the_documented_table` | Each closes a defect this feature surfaced. See below |
| 6 | FE-016-09 — focus trap and screen-reader pass | **Not done** | Recorded as a known gap in `tests.md`, per the task list's droppable note |

## What this feature found in code it did not write

Four defects and two missing guards. All are in `tests.md` with the evidence; the two that
change how the next feature should work:

1. **Four of the shared mapper's five call sites returned incomplete ticket bodies** —
   eleven missing fields, three of them contract violations standing since `011`, `012` and
   `034`. Every optional parameter on that mapper was added for an honest reason and each
   then became a field the *other* callers silently failed to supply. `026` §5 (a screen may
   not render a ticket from a write response) is what kept it invisible. There is one
   assembler now, and a guard against a second.

2. **The escalation reason was going into `AuditLog.Changes` in full, twice.** BR-9.7's
   list is five literal things and a free-text reason is none of them. Redacting only the
   ticket column would have been *worse* than redacting nothing, because the same request
   writes the text to `TicketHistoryEntry.Note` in the same transaction. Recorded as an
   extension to BR-9.7 in `04-business-rules.md`, not edited into the rule.

## Known Limitations

- **No de-escalation, by design (BR-3.9).** Adding one is a new decision, and it would need
  its own audit action and history row.
- **No concurrent-escalation test.** The sequential stale-version case passes; a genuine
  race is a recorded gap.
- **The dialog has not been walked keyboard-only or with a screen reader.** The `Modal`
  primitive carries the focus trap and eight screens depend on it, but this dialog is not
  verified.
- **Escalation cannot be started from the ticket list.** Deliberate — see the trade-off
  table and `010`'s contract-change entry.
- **The demo database now holds three tickets escalated by probe**, two of which carry a
  reason mangled by PowerShell 5.1's ISO-8859-1 body encoding (`?????`). Local dev data
  only; `--seed` rebuilds it.
- **`escalatedBy` can be `null` on an escalated ticket** if the manager's `SupportUsers`
  row is ever removed. There is no delete in this release, and the callout falls back to
  the same label the assignee row uses.
