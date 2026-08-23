# US-007 — Specification

**Phase:** 1 · **Role:** Specification · **Status:** Complete

## Understanding

An unassigned ticket is not being worked by anyone. Assignment converts a shared list
into individual workloads and makes "who is handling this?" answerable at any moment.

This is the first story where the two roles genuinely diverge, so it is where the
authorization model stops being a diagram and becomes enforced behaviour.

## In Scope

Assign, reassign, and unassign; the BR-2 permission rules; the active-user
requirement; history rows; the assignee picker; optimistic concurrency.

## Out of Scope

| Excluded | Reason |
|---|---|
| Round-robin or load-based auto-assignment | Needs a workload model and a policy nobody has specified |
| Teams and queues | Single flat pool of support users in this release |
| Out-of-office handling | No requirement |
| Assignment notifications | Notification infrastructure is out of scope |
| Assignment changing the status | Deliberately not done — BR-2.7 |

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | An agent picking up unowned work should not need a manager | If triage is manager-only, BR-2.2 is removed and one check goes with it |
| A-2 | A ticket has one assignee, not several | Multiple assignees would need a join table and a different ownership rule |
| A-3 | Unassigning is a legitimate action, not an error | If tickets must always have an owner once assigned, `null` is rejected instead |

## Open Questions

| # | Question | Working assumption |
|---|---|---|
| Q-1 | May an Agent unassign themselves from their own ticket? | Yes. Handing work back is legitimate, and the alternative traps an agent on a ticket they cannot progress |
| Q-2 | Should assigning to an inactive user be `400` or `404`? | `400`. The user exists; the request is invalid. `404` would suggest the id is wrong |

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | `PUT /api/tickets/{id}/assignee` with a Manager token assigns any ticket to any active user and returns `200` (BR-2.1) |
| AC-2 | An Agent may assign an unassigned ticket to themselves (BR-2.2) |
| AC-3 | An Agent assigning to any user other than themselves returns `403` (BR-2.2) |
| AC-4 | An Agent reassigning a ticket already assigned to someone else returns `403` (BR-2.3) |
| AC-5 | An Agent may unassign themselves from their own ticket |
| AC-6 | Assigning to an inactive user returns `400` (BR-2.4) |
| AC-7 | Assigning to an unknown user id returns `404` |
| AC-8 | Assigning or unassigning a `Closed` ticket returns `409` (BR-2.5) |
| AC-9 | Assignment writes an `Assigned` history row with the old and new assignee; clearing writes `Unassigned` (BR-2.6) |
| AC-10 | Assigning a ticket in `New` leaves its status unchanged (BR-2.7) |
| AC-11 | Assigning a ticket to the user it is already assigned to returns `409` |
| AC-12 | A stale `expectedVersion` returns `409` with `errors/concurrency-conflict` (ADR-006) |
| AC-13 | `GET /api/support-users` returns active users with id, name, and role |
| AC-14 | An unknown ticket id returns `404` |
| AC-15 | The picker lists active users and shows a clear `403` message when the action is not permitted |

## Edge Cases

From `testing/edge-cases.md`: unknown id, malformed id, inactive referenced user, no
token, wrong role, stale version, mutation of a closed ticket.

Specific to this story:

| Case | Expected |
|---|---|
| Manager assigns a ticket to themselves | Allowed; a manager is also an agent in practice |
| Assignee is deactivated after assignment | The ticket keeps the assignee. Deactivation does not retroactively strand tickets; reassignment is a deliberate act |
| Unassign an already-unassigned ticket | `409`, consistent with AC-11 — the request describes a change that is not a change |

## Rules Referenced

BR-2.1 – BR-2.7, BR-6, ADR-006
