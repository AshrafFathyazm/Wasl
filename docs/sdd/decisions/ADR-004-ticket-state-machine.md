# ADR-004 — Ticket state machine design

**Status:** Accepted · **Implements:** BR-1

## Context

A ticket moves through a lifecycle. Left unconstrained, status becomes a free-text
field that every part of the system interprets differently, and the history stops
being meaningful.

Three questions had to be answered: which states exist, which transitions are
permitted, and where the rule lives.

## Decision

Six states — `New`, `Open`, `InProgress`, `PendingCustomer`, `Resolved`, `Closed` —
with the transition matrix in `04-business-rules.md`, implemented once as a static
map in `Wasl.Domain`, and exposed to the client as an `allowedTransitions` array on the
ticket response.

## Reasoning for the state set

| State | Why it exists |
|---|---|
| `New` | Untriaged. Distinguishing "nobody has looked at this" from "we have looked and are not working on it yet" is the whole purpose of a triage queue |
| `Open` | Triaged, accepted, not currently being worked |
| `InProgress` | Someone is actively working it. Requires an assignee, which makes "who is working this?" always answerable |
| `PendingCustomer` | Blocked on the customer. Kept separate from `Open` because time in this state is not the team's responsibility, and merging them would make any future response-time metric meaningless |
| `Resolved` | A fix is proposed but not confirmed. Separating it from `Closed` is what makes reopening possible without resurrecting a closed record |
| `Closed` | Terminal |

## Decisions worth defending

### `Closed` is terminal

Reopening a closed ticket means its history contains two unrelated problems and any
resolution-time measurement becomes a fiction. The MVP forbids it. The correct
behaviour — creating a new ticket linked to the old one — needs a link relationship
that is out of scope, so the restriction is honest rather than convenient.

### `PendingCustomer → Resolved` is forbidden

A ticket waiting on a customer must return to `InProgress` before it can be resolved.
This forces resolution to be a deliberate act by a working agent rather than a
queue-clearing shortcut, and it keeps the history readable.

### Assignment does not change status

Assigning a `New` ticket leaves it `New`. Triage and ownership are separate events;
coupling them would silently erase one from the history. The cost is one extra click,
which is the correct price for an accurate audit trail.

### `InProgress` requires an assignee

Without this, "who is working on this right now?" has no answer, which is the one
question a support lead asks most.

### Same-status transition returns `409`, not `200`

A request to move a ticket to the status it already has is almost always a
double-submit or a stale UI. Treating it as success hides a real client bug.

## Where the rule lives

A static `IReadOnlyDictionary<TicketStatus, TicketStatus[]>` in the domain. Not in the
database, because it is behaviour rather than data and would then be untestable
without a database. Not in the controller, because two entry points would diverge.
Not duplicated in React, because two copies always drift — the client renders what
the API returns.

## Alternatives considered

- **Free-text status.** Rejected: unenforceable, and it makes filtering unreliable.
- **A configurable workflow engine.** Rejected: no requirement asks for
  per-customer workflows, and a configurable engine is a project of its own.
- **A `TicketTransition` table as the source of truth.** Rejected: it moves logic
  into data, requires a database round trip for a pure decision, and makes the rule
  invisible in code review.

## Consequences

- Adding a state requires editing one map and its tests. That is the intended cost.
- The client depends on `allowedTransitions` in the API response, which must be
  populated for every ticket read.
