# US-007 — Technical Plan

**Phase:** 2 · **Role:** Architecture · **Status:** Complete

## Design Summary

The permission rule is data-dependent — it needs the current assignee and the caller's
identity — so it lives in the application layer rather than as an attribute-based
policy. The domain owns only what is a ticket invariant: a closed ticket cannot be
reassigned.

## Backend

| Layer | Component | Responsibility |
|---|---|---|
| Domain | `Ticket.AssignTo(userId?)` | Rejects assignment on a closed ticket; rejects a no-op; appends the history row |
| Application | `AssignTicketCommand` / `Handler` | Loads the ticket and the target user, applies BR-2.1–BR-2.3, calls the domain, saves |
| Application | `TicketAssignmentPolicy` | The BR-2 permission decision, as a testable unit separate from the handler |
| Application | `ListSupportUsersQuery` | Active users for the picker |
| API | `TicketsController.ChangeAssignee` | Binds, delegates, maps |
| API | `SupportUsersController.List` | The picker source |

`TicketAssignmentPolicy` is separated from the handler because the rule has four
branches and is the most likely thing in this story to be got wrong. As its own class
it can be unit-tested exhaustively without a database.

## Data Changes

None. `AssignedToUserId` and `ix_tickets_assignee` were created in US-005.

## API Contract

| Method | Path | Request | Success | Failures |
|---|---|---|---|---|
| `PUT` | `/api/tickets/{id}/assignee` | `{ assigneeId?, expectedVersion }` | `200` + updated ticket | `400` inactive, `401`, `403`, `404`, `409` closed / no-op / concurrency |
| `GET` | `/api/support-users` | — | `200` + active users | `401` |

`assigneeId` is nullable, and `null` means unassign. A separate `DELETE` endpoint was
considered and rejected: unassigning is the same business action with a different
target, it writes to the same field, and it belongs in the same history sequence.

## Frontend

| Component | Purpose |
|---|---|
| `AssigneeSelect` | Lists active users; includes an "Unassigned" option |
| `TicketDetailPage` | Hosts it; shows the current assignee |

The picker is enabled or disabled based on the caller's role and the current
assignee — the client mirrors BR-2 for usability. A `403` is still handled, because
the client's copy of the rule can be stale.

## Localization Impact

| Item | Detail |
|---|---|
| New client strings | The assignee picker label, the "Unassigned" option, the reassign confirmation, and the permission-denied message |
| New server messages | `Error.AssigneeInactive`, `Error.AssigneeNotFound`, `Error.TicketClosed`, and the forbidden message |
| Direction-sensitive layout | A dropdown and an avatar or name pairing; the name must sit on the correct side of the avatar |
| User content | Support-user names are seeded and may be Arabic; `dir="auto"` applies |

The `403` message is server-authored and therefore server-translated. The client
mirrors BR-2 to disable the control, and that mirrored explanation is a *client* string
saying the same thing in a different place. Both need Arabic, and they must not
contradict each other — the review checks that they read consistently.

## Test Strategy

| Level | Covered | Why here |
|---|---|---|
| Unit | `TicketAssignmentPolicy`, all four branches, both roles | Pure decision logic |
| Unit | `Ticket.AssignTo` rejects a closed ticket and a no-op; history row appended | Domain behaviour |
| Integration | AC-1 – AC-8, AC-11, AC-12, AC-14, each with real tokens | Authorization proven only with real tokens |
| Integration | History row content, old and new assignee | Needs persistence |
| Frontend | Picker disabled state, `403` message | The mirrored rule |

## Dependencies

US-005 (tickets), authentication with roles from the walking skeleton.

## Risks and Trade-offs

| Decision | Alternative | Why rejected |
|---|---|---|
| Permission rule in the application layer | Attribute-based policy at the API boundary | The boundary does not have the current assignee, so the rule cannot be expressed there |
| Permission rule in the application layer | Inside the domain entity | The domain would need to know about the caller's identity and role, which is not a ticket concern |
| `TicketAssignmentPolicy` as its own class | Inline in the handler | Four branches inline are hard to test exhaustively and easy to get subtly wrong |
| `null` assignee means unassign | Separate `DELETE` endpoint | Same field, same action, same history sequence; two endpoints would need the same rules twice |
| Assignment does not change status | Auto-advance `New → Open` | BR-2.7 and ADR-004: coupling would erase the triage event from the history |
| No-op assignment returns `409` | Return `200` | Consistent with BR-1.9; a no-op usually indicates a stale client |

## Files to Create or Change

```text
src/Wasl.Domain/Tickets/Ticket.cs                     (AssignTo)
src/Wasl.Application/Tickets/Assign/AssignTicketCommand.cs
src/Wasl.Application/Tickets/Assign/AssignTicketHandler.cs
src/Wasl.Application/Tickets/Assign/TicketAssignmentPolicy.cs
src/Wasl.Application/SupportUsers/List/ListSupportUsersQuery.cs
src/Wasl.Api/Controllers/TicketsController.cs
src/Wasl.Api/Controllers/SupportUsersController.cs
src/wasl-web/src/features/tickets/AssigneeSelect.tsx
tests/Wasl.Application.Tests/Tickets/TicketAssignmentPolicyTests.cs
tests/Wasl.Domain.Tests/Tickets/TicketAssignmentTests.cs
tests/Wasl.Api.IntegrationTests/Tickets/AssignTicketTests.cs
```
