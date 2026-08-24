# US-007 — Specification

**Phase:** 2 · **Story:** US-007 · **Feature:** `011-assign-ticket` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

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
| Status changes of any kind | `012-change-ticket-status`. This feature moves ownership only |
| The `assignee` filter on the ticket list | `010-ticket-list-and-detail` for `me` / `unassigned`, `015` for the rest |
| User management (creating, editing, deactivating support users) | Not in the release. `SupportUsers` is seeded (ADR-005) |

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | An agent picking up unowned work should not need a manager | If triage is manager-only, BR-2.2 is removed and one check goes with it |
| A-2 | A ticket has one assignee, not several | Multiple assignees would need a join table and a different ownership rule |
| A-3 | Unassigning is a legitimate action, not an error | If tickets must always have an owner once assigned, `null` is rejected instead |
| A-4 | The support-user pool is small and seeded, so the picker needs no search or paging | If user management ever ships, `GET /api/support-users` becomes a paged endpoint and that is a breaking change for the client. Recorded as a known limitation, not designed around |

## Open Questions

| # | Question | Working assumption |
|---|---|---|
| Q-1 | May an Agent unassign themselves from their own ticket? | Yes. Handing work back is legitimate, and the alternative traps an agent on a ticket they cannot progress |
| Q-2 | Should assigning to an inactive user be `400` or `404`? | `400`. The user exists; the request is invalid. `404` would suggest the id is wrong. Settled in `research.md` R-3, which also fixes the `type` and the `errors` key |
| Q-3 | Is `allowedTransitions` already precondition-aware when this feature ships? | Assume not. `012-change-ticket-status` AC-19 owns making the array account for BR-1.3, so this feature asserts only that the field is present and recomputed after the assignment. If `012` lands first, nothing here changes; the client renders whatever the response carries either way |
| Q-4 | Should the response tell the client whether the caller *may* assign, rather than the client mirroring BR-2? | Not in this feature. A server-authored capability flag is the better design (the constitution's "the server tells the client what is permitted") and it is a change to the read shape, which `010` owns. Recorded so the mirrored rule in `FE-011-03` is visibly a stopgap, not the intended end state |

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

Every number above is cited elsewhere — `010`, `012`, and `013` all reference this
feature's authorization proof — so the numbering is fixed. Anything discovered during
the migration is an edge case or an open question, never a renumbering.

## Edge Cases

From `testing/edge-cases.md`: unknown id, malformed id, inactive referenced user, no
token, wrong role, stale version, mutation of a closed ticket.

Specific to this story:

| Case | Expected |
|---|---|
| Manager assigns a ticket to themselves | Allowed; a manager is also an agent in practice |
| Assignee is deactivated after assignment | The ticket keeps the assignee. Deactivation does not retroactively strand tickets; reassignment is a deliberate act |
| Unassign an already-unassigned ticket | `409`, consistent with AC-11 — the request describes a change that is not a change |
| Agent unassigns a ticket assigned to **another** agent | `403` (BR-2.3). `null` is a target like any other, so removing someone else's ownership is a reassignment. Covered by `TEST-011-06`, not by a new AC |
| Agent assigns someone else to a `Closed` ticket — both `403` and `409` apply | `403`. The caller could not have performed this action on an open ticket either, and answering `409` first suggests that reopening would help — which it would not, because `Closed` is terminal (BR-1.5) |
| Stale `expectedVersion` **and** a forbidden action | `409` concurrency-conflict, checked first. The permission decision would otherwise be made against a ticket the client has not seen, and a `403` computed from data the caller cannot see is unfalsifiable. `research.md` R-6 |
| The current assignee is inactive and the caller sends the same id again | `409` unchanged (AC-11) before `400` inactive — a no-op is not an opportunity to enforce BR-2.4 retroactively, which would make an inactive assignee's ticket un-actionable |
| A ticket assigned to a now-inactive user is opened in the client | The strip shows that user; the picker does not list them. The current assignee is rendered from the ticket response, **never** looked up in the picker list, or it renders blank and reads as missing data |

## Rules Referenced

BR-2.1 – BR-2.7, BR-6 (the authorization matrix, and its split between boundary and
handler), BR-9.1 – BR-9.4 (the audit obligation this feature carries), ADR-004
(assignment does not change status), ADR-006 as amended by ADR-013 (`rowversion`),
ADR-010 (where the rule lives), ADR-013 (SQL Server).
