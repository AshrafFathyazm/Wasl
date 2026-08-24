# US-008 — Specification

**Phase:** 2 · **Story:** US-008 · **Feature:** `012-change-ticket-status` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

## Understanding

A ticket's status is what the whole team filters, prioritises, and reports on. If any
status can be set from any other, the field records what somebody clicked rather than
what happened, and every downstream use of it becomes unreliable.

This story implements the transition matrix in BR-1 as an enforced rule with a single
implementation, surfaces the permitted transitions to the client so the rule is not
duplicated, and records every accepted change in the ticket history.

It is the story where the state machine, the authorization split, and the concurrency
contract all meet.

## In Scope

- Enforcing the BR-1 transition matrix on the server
- Rejecting forbidden transitions with a `409` that explains what is permitted
- The assignee precondition for `InProgress`
- A required note when closing from `New` or `Open`
- Writing a `StatusChanged` history row in the same transaction
- Writing the `Ticket.StatusChanged` audit row in that same transaction (BR-9.1, BR-9.3)
- Returning `allowedTransitions` on every ticket read **and on the `200` of this write**
- Authorization per BR-6: an Agent may act on their own or an unassigned ticket; a
  Manager on any
- Optimistic concurrency on the status change
- Client actions rendered from `allowedTransitions`

## Out of Scope

| Excluded | Reason |
|---|---|
| Reopening a `Closed` ticket | `Closed` is terminal; see ADR-004 |
| Bulk status changes | No requirement |
| Automatic close of `Resolved` after N days | That is an SLA feature, out of scope project-wide |
| Per-transition custom fields | No requirement |
| Configurable workflows | ADR-004 rejects this explicitly |
| Escalation | US-009 (`016`); escalation is a flag, not a status |
| Assigning, unassigning, commenting | US-007 (`011`), US-010 (`013`). This endpoint changes one field and writes two rows |

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | The six states in BR-1 are sufficient for the team's real workflow | Adding a state is one map entry plus tests, by design |
| A-2 | An Agent may change the status of an unassigned ticket, because picking up unowned work should not require a manager | If the team wants triage restricted to managers, BR-6 changes and one policy changes with it |
| A-3 | A note is required only when closing prematurely, not on every transition | If every transition needs a reason, the request shape is unchanged and only validation moves |
| A-4 | `Tickets`, `Tickets.ClosedAtUtc`, `Tickets.RowVersion`, and `TicketHistory` all exist before this feature starts — `009-create-ticket` creates them | If `ClosedAtUtc` were missing, this feature gains a one-column migration. Nothing else about it changes |

## Open Questions

| # | Question | Working assumption |
|---|---|---|
| Q-1 | Should `Resolved → Closed` also require a note? | No. Closing a resolved ticket is the normal end of the flow; requiring a reason for the expected outcome trains people to type nothing useful |
| Q-2 | Should the transition also clear the assignee when returning to `Open`? | No. Returning to `Open` means "not being worked right now", not "nobody owns it". Unassigning is a separate action in US-007 |
| Q-3 | `05-api-conventions.md` names three `409` `type` values and this endpoint produces five. Do the same-status rejection and the assignee precondition get their own `type`, or do they fold into `errors/invalid-status-transition`? | **Their own.** The client's correct reaction differs for each: a same-status `409` means refetch quietly, because the user did nothing wrong and telling them they attempted something forbidden is a lie about a double-click; an assignee-required `409` means offer the Assign action, not a different transition. A client cannot distinguish them without parsing an English sentence. `DOC-012-02` adds both to the conventions table so the inventory stays complete |
| Q-4 | BR-1's matrix shows `PendingCustomer → PendingCustomer` as **permitted** (✅), where every other row carries `–` on its own diagonal. Is that intentional? | **No — treated as a typo, and the diagonal is not permitted.** BR-1.9 says a same-status transition returns `409` with no exception, and five of six rows agree. Taking the cell literally would make `PendingCustomer` the one state that can be re-entered from itself, which BR-1.9 explicitly forbids. Recorded here rather than silently coded around; `04-business-rules.md` is owned by the blueprint and this specification does not edit it. **This needs a product-owner ruling before `BE-012-01` is written**, because it is one cell of the map and one row of the theory's expectation table |

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | `PUT /api/tickets/{id}/status` performs a permitted transition and returns `200` with the updated ticket |
| AC-2 | Every transition not marked permitted in the BR-1 matrix returns `409` with `type: errors/invalid-status-transition` |
| AC-3 | The `409` detail names the current status and the permitted transitions from it |
| AC-4 | Moving to `InProgress` on a ticket with no assignee returns `409` (BR-1.3) |
| AC-5 | `New → Closed` and `Open → Closed` with no note return `400` naming `note` (BR-1.2) |
| AC-6 | `New → Closed` and `Open → Closed` with a note succeed, and the note is stored on the history row |
| AC-7 | `PendingCustomer → Resolved` returns `409` (BR-1.4) |
| AC-8 | No transition out of `Closed` is accepted; each returns `409` with `type: errors/ticket-closed` (BR-1.5) |
| AC-9 | `Resolved → InProgress` succeeds (BR-1.6) |
| AC-10 | Moving to `Closed` sets `ClosedAtUtc` to the current UTC time (BR-1.7) |
| AC-11 | Every accepted transition writes exactly one `StatusChanged` history row with the old and new value, in the same transaction (BR-1.8) |
| AC-12 | If persistence fails, no history row is written — the change and its audit entry are atomic |
| AC-13 | Transitioning to the ticket's current status returns `409` (BR-1.9) |
| AC-14 | An Agent changing the status of a ticket assigned to another user returns `403` (BR-6) |
| AC-15 | A Manager may change the status of any ticket (BR-6) |
| AC-16 | An Agent may change the status of an unassigned ticket, or one assigned to themselves |
| AC-17 | A stale `expectedVersion` returns `409` with `type: errors/concurrency-conflict` (ADR-006) |
| AC-18 | `GET /api/tickets/{id}` includes `allowedTransitions` for the ticket's current status |
| AC-19 | `allowedTransitions` accounts for preconditions: an unassigned ticket in `Open` does not list `InProgress` |
| AC-20 | The client renders status actions from `allowedTransitions` and holds no copy of the matrix |
| AC-21 | If the server rejects a transition the client believed was allowed, the error is shown and the ticket is refetched |
| AC-22 | An unknown ticket id returns `404`; a malformed id returns `400` |
| AC-23 | The `200` response body carries `allowedTransitions` **recomputed for the new status**, so the UI never derives the next set of actions from the one it just used |
| AC-24 | Every accepted transition writes exactly one `Ticket.StatusChanged` audit row, in the same transaction as the change, and **no** audit row survives a rolled-back transaction (BR-9.1, BR-9.3) |
| AC-25 | A `403` from AC-14 writes one `Auth.Forbidden` audit row with `Outcome = Denied`, **outside** any business transaction, because there is no transaction to join (BR-9.2, BR-9.4) |

AC-23 through AC-25 were added in the spec-kit migration. AC-1 through AC-22 keep their
original numbers and wording; other features cite them.

## Edge Cases

From `testing/edge-cases.md`: every forbidden transition, transition to the current
status, any mutation of a closed ticket, `InProgress` without an assignee, stale
version, unknown id, malformed id, no token, wrong role.

Specific to this story:

| Case | Expected |
|---|---|
| Assignee is deactivated while the ticket is `InProgress` | The transition still works. Deactivating a user does not invalidate work in flight; blocking it would strand tickets |
| Note supplied on a transition that does not require one | Accepted and stored on the history row. A volunteered reason is useful |
| Note of 501 characters | `400`. `TicketHistory.Note` is `nvarchar(500)`; a note that would be truncated by the column is rejected at the boundary rather than silently shortened |
| Two agents transition the same ticket simultaneously | One `200`, one `409` concurrency conflict (AC-17) |
| Transition requested with a status value not in the enum | `400` listing the accepted values, not `409` |
| `Closed → Closed` | `409 errors/ticket-closed`, not `errors/same-status-transition`. The terminal check runs first, because "this ticket is finished" is the more useful thing to tell a client than "you sent the value it already has" |
| `expectedVersion` omitted entirely | `400`. Treating a missing token as "no opinion" would make the concurrency check opt-in, and the client that forgets it is exactly the client that overwrites someone's work |
| `expectedVersion` present but not valid base64 | `400`, not `409`. A malformed token is a client defect, not a conflict |
| A permitted transition requested against a version that is already stale | `409 errors/concurrency-conflict`, **not** a `200`. The version is checked before the transition is evaluated — see `plan.md` |
| The status changes between load and `SaveChanges` | `409 errors/concurrency-conflict` from the `rowversion` check at save time. The pre-check narrows the window; the database closes it |

## Rules Referenced

BR-1.1 – BR-1.9, BR-6, BR-8.6, BR-8.7, BR-9.1 – BR-9.4, ADR-004, ADR-006, ADR-008,
ADR-013

## Migration note

Written before three decisions landed, and repaired here:

| Was | Now | Why |
|---|---|---|
| Nothing about the audit log | AC-24, AC-25, and the audit tasks in `tasks.md` | ADR-008 was accepted after this spec was written. `TicketHistory` is a product projection; `AuditLog` is the durable record, and NFR-10's architecture test fails the build for a command that declares neither |
| `expectedVersion` unspecified in form | Base64 `rowversion`, and `400` when absent or malformed | ADR-006 as amended by ADR-013 |
| `allowedTransitions` only on the read | Also on the `200` of the write (AC-23) | The client would otherwise need a second round trip after every transition to learn what it may do next, and the obvious shortcut — deriving it client-side — is the duplication ADR-004 exists to prevent |
