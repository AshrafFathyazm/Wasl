# Contract — Ticket status

**Feature:** `012-change-ticket-status` · **Story:** US-008 · **Status:** FROZEN 2026-08-23
· **Lanes:** backend implements · frontend consumes

The agreement. The backend implements exactly this; the frontend may start against it
immediately. Any change goes through **Contract changes** in [`plan.md`](../plan.md)
first — see `docs/sdd/openapi/README.md`.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on every call
- **Content-Type:** `application/json`
- Timestamps are UTC, ISO 8601, `Z` suffix. Formatting for display is the client's job,
  in the client's locale
- Identifiers are `Guid` strings. Enums are strings on the wire — `InProgress`, never
  `2`, and never a translated label
- Errors are RFC 7807 `ProblemDetails`. **`200` is never returned with an error in the
  body** (`docs/sdd/05-api-conventions.md`)
- `version` and `expectedVersion` are the base64 form of the row's SQL Server
  `rowversion` (ADR-006 as amended by ADR-013) — 8 bytes, so 12 base64 characters

---

## `PUT /api/tickets/{id}/status`

Moves a ticket to another status, if BR-1 permits it. One field changes; two rows are
written (`TicketHistory` and `AuditLog`).

### Request

```json
{
  "status": "Closed",
  "note": "Duplicate of TCK-2026-000041.",
  "expectedVersion": "AAAAAAAAB9E="
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `status` | `TicketStatus` | **yes** | One of `New`, `Open`, `InProgress`, `PendingCustomer`, `Resolved`, `Closed`. A value outside the enum is `400` listing the accepted values, **never** `409` |
| `note` | `string(..500)?` | when closing from `New` or `Open` | BR-1.2. Accepted and stored on **any** transition — a volunteered reason is useful. 501 characters is `400`, because `TicketHistory.Note` is `nvarchar(500)` and a truncated reason is worse than a rejected one |
| `expectedVersion` | `string` (base64) | **yes** | The `version` from the ticket the user was looking at. Absent → `400`; present but not decodable → `400`; decodable but stale → `409` |

`{id}` is a `Guid`. A malformed one is `400` from route binding, before the handler runs
(AC-22).

`expectedVersion` is **required, not optional**. Treating a missing token as "no
opinion" would make the concurrency check opt-in, and the client that forgets it is
exactly the client that overwrites someone else's work.

### `200 OK`

The updated ticket. The shape is `TicketDetailResponse`, owned by
`010-ticket-list-and-detail`; `allowedTransitions` is added to it by this feature.

```json
{
  "id": "8f1c2d34-5678-4abc-9def-0123456789ab",
  "ticketNumber": "TCK-2026-000042",
  "subject": "Invoice charged twice",
  "status": "Closed",
  "priority": "Normal",
  "category": "Billing",
  "channel": "Email",
  "customer": { "id": "…", "fullName": "علي الأحمد" },
  "assignedToUserId": null,
  "isEscalated": false,
  "createdAtUtc": "2026-08-20T09:14:02.117Z",
  "updatedAtUtc": "2026-08-23T12:00:00.484Z",
  "closedAtUtc": "2026-08-23T12:00:00.484Z",
  "version": "AAAAAAAAB9M=",
  "allowedTransitions": []
}
```

Three things about this body that the client depends on:

| Field | Guarantee |
|---|---|
| `allowedTransitions` | **Recomputed for the new status**, and filtered by the preconditions that currently hold (AC-19, AC-23). `Closed` returns `[]`. An unassigned ticket in `Open` does **not** list `InProgress` |
| `version` | The **new** token. Send it as `expectedVersion` on the next call; the one that was sent is now stale |
| `closedAtUtc` | Set on this response when `status` became `Closed` (BR-1.7), null otherwise |

`allowedTransitions` is the reason the client holds no copy of the state machine
(ADR-004). Deriving the next set of actions from the transition that just succeeded is
the duplication this field exists to prevent, and it drifts the first time BR-1 changes.

### Failures

| Code | `type` | When |
|---|---|---|
| `400` | `errors/validation` | `status` not in the enum · `note` missing when closing from `New` or `Open` · `note` over 500 characters · `expectedVersion` missing or not decodable · malformed `{id}` |
| `401` | `errors/unauthenticated` | Missing or invalid token |
| `403` | `errors/forbidden` | An Agent acting on a ticket assigned to someone else (BR-6, AC-14). Audited as `Auth.Forbidden` |
| `404` | `errors/not-found` | No ticket with that id (AC-22) |
| `409` | `errors/ticket-closed` | The ticket is `Closed`. Terminal — no reopen, reassign, escalate, or comment (BR-1.5, AC-8) |
| `409` | `errors/same-status-transition` | `status` equals the current status (BR-1.9, AC-13) |
| `409` | `errors/invalid-status-transition` | The cell is not ✅ in the BR-1 matrix (AC-2), including `PendingCustomer → Resolved` (BR-1.4, AC-7) |
| `409` | `errors/assignee-required` | Target is `InProgress` and the ticket has no assignee (BR-1.3, AC-4) |
| `409` | `errors/concurrency-conflict` | `expectedVersion` does not match the current row (ADR-006, AC-17) |

#### Evaluation order — and it is part of the contract

A request can violate more than one rule at a time. The first match wins, and the order
is fixed so a client never has to guess which answer it will get:

```text
1  malformed {id}                        400
2  ticket not found                      404
3  body validation (enum, note, token)   400
4  authorization (BR-6)                  403   + one Auth.Forbidden audit row
5  ticket is Closed                      409   errors/ticket-closed
6  expectedVersion mismatch              409   errors/concurrency-conflict
7  status == current status               409   errors/same-status-transition
8  cell not permitted in BR-1            409   errors/invalid-status-transition
9  InProgress with no assignee           409   errors/assignee-required
```

Two orderings in that list are decisions rather than accidents:

- **Closed before the version check (5 before 6).** A closed ticket is not going to
  become un-closed by reloading, so "this ticket is finished" is the more useful thing
  to say than "your copy is out of date". `Closed → Closed` therefore returns
  `errors/ticket-closed`, not `errors/same-status-transition`.
- **The version check before the transition rules (6 before 7–9).** A stale client's
  transition is evaluated against a state it never saw, so the forbidden-transition
  message would name a `currentStatus` the user cannot reconcile with their screen.
  Telling them to reload is both true and actionable. This is the ordering that is
  easiest to get wrong and hardest to notice: get it backwards and every stale UI
  reports a rule violation that does not exist.

#### `400` — validation

```json
{
  "type": "https://wasl.local/errors/validation",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "detail": "See the errors property for field-level messages.",
  "instance": "/api/tickets/8f1c2d34-5678-4abc-9def-0123456789ab/status",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01",
  "errors": {
    "note": ["A note is required when closing a ticket that was never worked."]
  }
}
```

#### `409` — invalid transition

```json
{
  "type": "https://wasl.local/errors/invalid-status-transition",
  "title": "That status change is not allowed.",
  "status": 409,
  "detail": "A ticket in PendingCustomer cannot move to Resolved. Permitted: InProgress.",
  "instance": "/api/tickets/8f1c2d34-.../status",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01",
  "currentStatus": "PendingCustomer",
  "allowedTransitions": ["InProgress"]
}
```

`currentStatus` and `allowedTransitions` are **extension members**, not localized, and
they carry enum values. They exist so the client can correct its actions from the
rejection itself rather than firing a refetch to learn what it should have offered
(AC-3, AC-21). `errors/same-status-transition`, `errors/ticket-closed`, and
`errors/assignee-required` carry the same two members; `errors/ticket-closed` carries
`allowedTransitions: []`.

#### `409` — concurrency conflict

```json
{
  "type": "https://wasl.local/errors/concurrency-conflict",
  "title": "Someone else changed this ticket.",
  "status": 409,
  "detail": "This ticket changed while you were looking at it. Reload to see the current state.",
  "instance": "/api/tickets/8f1c2d34-.../status",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01",
  "currentStatus": "PendingCustomer"
}
```

**This response deliberately carries no new `version`.** Handing the client a fresh
token is an invitation to retry silently, and ADR-006 rejects that: the system cannot
know whether "set to Resolved" is still intended after someone else set the ticket to
`PendingCustomer`. Only a human can decide that. A client that wants to proceed refetches
the ticket, which is the point at which the user sees what changed.

### What stays identical in every locale

`title` and `detail` are translated (BR-8.6). These are **not** (BR-8.7):

| Part | Reason |
|---|---|
| `type` | The identifier the client branches on |
| The keys of `errors` | They are request field names, part of this contract |
| `currentStatus`, `allowedTransitions` | Enum values. `InProgress` travels as `InProgress` in every locale; only its label is translated, and that label lives in the client's catalogue |
| `ticketNumber` | Quoted aloud and pasted between systems. Latin digits under `ar` (BR-8.13) |
| `traceId` | An identifier |

A client that branches on `type` works in Arabic. One that branches on `title` was
already broken. Send `Accept-Language: ar` to see the difference; `Content-Language` on
the response names the locale that was actually applied.

---

## Behaviour worth knowing before you build against it

| Situation | What happens | Why |
|---|---|---|
| The same transition is submitted twice — a double-click | The first is `200`, the second is `409 errors/same-status-transition` | BR-1.9. Returning `200` for the second would hide a real client bug, and the bug it hides is a stale UI, which produces worse decisions later |
| The user opens the take-action menu on an unassigned `Open` ticket | `InProgress` is not in `allowedTransitions`, so it is not offered. Calling it anyway is `409 errors/assignee-required` | BR-1.3 filtered at source (AC-19), because a UI that invites an action the server refuses is worse than one that never offered it |
| A `PendingCustomer` ticket needs resolving | `PendingCustomer → InProgress`, then `InProgress → Resolved`. Two calls | BR-1.4. Resolution is always a deliberate act by a working agent, not a queue-clearing shortcut |
| A `Resolved` ticket turns out not to be fixed | `Resolved → InProgress` is permitted (BR-1.6, AC-9) | This is reopening *before* closure, and it is the reason `Resolved` and `Closed` are separate states |
| A `Closed` ticket needs reopening | Not possible. Every target returns `409 errors/ticket-closed` | `Closed` is terminal (ADR-004). The correct behaviour — a new ticket linked to the old one — needs a link relationship that is out of scope, so the restriction is honest rather than convenient |
| Spam or a mistaken ticket | `New → Closed` or `Open → Closed`, **with a note** | BR-1.2. The note is what makes an unworked closure auditable; without it the history shows a ticket that vanished |
| Two agents transition the same ticket at the same second | One `200`, one `409 errors/concurrency-conflict` | The `rowversion` check at `SaveChanges` is the guarantee; the pre-check after load is what makes the message usable (`plan.md`) |
| The assignee was deactivated while the ticket was `InProgress` | The transition still works | Deactivating a user does not invalidate work in flight; blocking it would strand tickets |
| A `note` is sent on a transition that does not require one | Accepted and stored on the history row | A volunteered reason is useful |
| The transition succeeds | Two rows are written in one transaction: `TicketHistory.StatusChanged` and `AuditLog.Ticket.StatusChanged` | They are not redundant (ADR-008). The timeline cascades with its ticket; the audit row outlives it |
| The save fails for any reason | No status change, no history row, **no audit row** | BR-9.3. A log recording things that did not happen is worse than no log |
| An Agent is denied (`403`) | One `Auth.Forbidden` audit row, written **outside** any transaction, and the ticket is untouched | BR-9.4. There is no business transaction on a denial to join — and if the row were written inside one, it would roll back with the request that was rejected, which is precisely the event worth keeping |
| An unknown field is in the body | Ignored | Not an error; the DTO binds what it declares |
| `status` is sent as an integer | `400` | Enums are strings on the wire (`05-api-conventions.md`) |

## Verification

| What | How |
|---|---|
| All 36 BR-1 cells, with the right `type` per cell | `TEST-012-01` (unit), `TEST-012-04` (HTTP) |
| Every status code above | `TEST-012-04` … `TEST-012-09` |
| `note` required, stored, and length-bounded | `TEST-012-05` |
| One history row on success, none on failure | `TEST-012-06`, `TEST-012-07` |
| BR-6 across all four actor/ticket combinations | `TEST-012-08` |
| Two writes on one version: one `200`, one `409`, no version in the conflict body | `TEST-012-09` |
| One audit row in-transaction; none after rollback; one on the `403` | `TEST-012-11`, `TEST-012-12` |
| `type`, enum values, and extension members byte-identical under `ar` | `TEST-012-13` |
| This contract matches what was built | `REV-012-03` — generated OpenAPI compared before the feature closes |
