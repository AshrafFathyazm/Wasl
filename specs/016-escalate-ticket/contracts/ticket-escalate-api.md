# Contract — Tickets (escalate)

**Feature:** `016-escalate-ticket` · **Story:** US-009 · **Status:** FROZEN 2026-08-23
· **Lanes:** backend implements · frontend consumes

The agreement. The backend implements exactly this; the frontend may start against it
immediately. Any change goes through **Contract changes** in [`plan.md`](../plan.md)
first — see `docs/sdd/openapi/README.md`.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on every call
- **Content-Type:** `application/json`
- Timestamps are UTC, ISO 8601, `Z` suffix. Formatting for display is the client's job,
  in the client's locale
- Identifiers are `Guid` strings. Enums are strings on the wire
- Errors are RFC 7807 `ProblemDetails`. **`200` is never returned with an error in the
  body** (`docs/sdd/05-api-conventions.md`)

---

## `POST /api/tickets/{id}/escalate`

Escalates a ticket. **Manager only** (BR-3.2). Escalation is a manual act with a written
reason; there is no timer and no SLA trigger (BR-3.1). It is **one-way** — BR-3.9 puts
de-escalation out of scope, so there is no inverse of this call.

`POST` on a sub-resource rather than a field on `PUT /api/tickets/{id}`, for the reason
`05-api-conventions.md` gives for `/status` and `/assignee`: escalation is a distinct
business action with its own rule, its own authorization, and its own history entry. A
generic patch accepting `isEscalated` would also make `isEscalated: false` expressible,
which BR-3.9 forbids.

### Request

```json
{
  "reason": "Customer is a strategic account and has been waiting four days.",
  "expectedVersion": "AAAAAAAAB9E="
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `reason` | `string(1..500)` | **yes** | Not whitespace-only. **Trimmed by the server before the limit is measured and before storage**, so 500 characters plus trailing whitespace is accepted and stored at 500 (AC-5, BR-3.5) |
| `expectedVersion` | `string` | **yes** | The base64 `rowversion` from the ticket read. A mismatch is `409 errors/concurrency-conflict` (ADR-006 as amended by ADR-013) |

`expectedVersion` is **required**, matching `PUT /api/tickets/{id}/status` and
`PUT /api/tickets/{id}/assignee`. A client that has to remember which of three ticket
mutations carries a version will forget on one of them, and the one it forgets is a silent
lost update. The screen spec's action table
(`docs/sdd/design/screens/04-ticket-detail.md`, action 4) omits it for brevity; **this
file is authoritative** and the difference is recorded under **Contract changes** in
[`plan.md`](../plan.md).

An unknown field in the body is ignored, not an error.

### `200 OK`

The full updated ticket — the same read shape `GET /api/tickets/{id}` returns, so the
client can replace its cached copy rather than merge into it.

```json
{
  "id": "3a7f9c10-1111-4222-8333-444455556666",
  "ticketNumber": "TCK-2026-000042",
  "subject": "Invoice not received",
  "status": "InProgress",
  "priority": "High",
  "category": "Billing",
  "channel": "Email",
  "allowedTransitions": ["Open", "PendingCustomer", "Resolved"],
  "isEscalated": true,
  "escalatedAtUtc": "2026-08-23T12:04:00Z",
  "escalatedBy": { "id": "9c1e...", "displayName": "Sara Al-Otaibi" },
  "escalationReason": "Customer is a strategic account and has been waiting four days.",
  "canEscalate": false,
  "updatedAtUtc": "2026-08-23T12:04:00Z",
  "version": "AAAAAAAAB9F="
}
```

Only the escalation-relevant fields are shown above; the rest of the ticket read shape is
unchanged and is owned by `010-ticket-list-and-detail`.

| Field | Type | Meaning |
|---|---|---|
| `priority` | `"Low" \| "Normal" \| "High" \| "Critical"` | After the **floor** has been applied. See the floor table below — this is the field to read, never to compute |
| `isEscalated` | `bool` | `true` after a successful escalation, and never `false` again (BR-3.9) |
| `escalatedAtUtc` | `string?` | Set on escalation; `null` before it (BR-3.7) |
| `escalatedBy` | `{ id, displayName }?` | The Manager who escalated. Still reported if that user is later deactivated — there is no hard delete and the FK is `ON DELETE NO ACTION` |
| `escalationReason` | `string(500)?` | Stored verbatim and never translated (BR-8.10). May be Arabic in an English interface — render with `dir="auto"` |
| `canEscalate` | `bool` | **The server's answer to "may this caller escalate this ticket right now?"** `IsEscalatable && caller is Manager`. The client renders the action from this and holds no copy of BR-3 |
| `version` | `string` | The **new** base64 `rowversion`. The old one is now stale |

`canEscalate` exists for the reason `allowedTransitions` exists (ADR-004,
Constitution III): the server tells the client what is permitted rather than the client
deriving it. A client computing `role === 'Manager' && !isEscalated &&
!['Resolved','Closed'].includes(status)` is a second implementation of BR-3, and the two
copies drift into a menu item that produces a `403`.

### The priority floor — BR-3.6

**Escalation raises priority to a floor of `High`. It does not set priority to `High`.**

| Priority before | Priority after | `PriorityChanged` history row? |
|---|---|---|
| `Low` | `High` | Yes — `Low` → `High` |
| `Normal` | `High` | Yes — `Normal` → `High` |
| `High` | `High` (unchanged) | **No** |
| `Critical` | **`Critical`** (unchanged) | **No** |

An implementation that writes `Priority = High` silently downgrades a `Critical` ticket:
the request succeeds, nothing is logged, and the ticket that most needed attention becomes
less visible *because* someone escalated it.
`docs/sdd/testing/test-strategy.md` names this as the rule most likely to be implemented
wrongly. `TEST-016-02` is the named test.

**The client must not compute this.** Read `priority` from the response.

### History rows written — BR-3.8

| Row | When | `OldValue` | `NewValue` | `Note` |
|---|---|---|---|---|
| `Escalated` | Always | `null` | `null` | The trimmed reason. There is no from/to because BR-3.9 makes escalation one-way — the event type *is* the fact |
| `PriorityChanged` | **Only when the priority actually changed** | e.g. `"Normal"` | `"High"` | `null` |

Enum values in `OldValue` and `NewValue` are the canonical untranslated strings (BR-8.7),
so a history row written under `ar` stays readable under `en`.

Both rows and the ticket update land in **one transaction**, together with the
`Ticket.Escalated` audit row (BR-9.3). If the transaction rolls back, all four go with it.

### Failures

| Code | `type` | When |
|---|---|---|
| `400` | `errors/validation` | `reason` missing, whitespace-only, or over 500 characters after trimming; `expectedVersion` missing (AC-5) |
| `400` | `errors/malformed-request` | The body could not be parsed |
| `401` | `errors/unauthenticated` | Missing, expired, or invalid token (AC-10) |
| `403` | `errors/forbidden` | The caller is not a `Manager` (AC-2, BR-3.2). **Also returned for an unknown ticket id when the caller is an Agent** — the role policy runs before the lookup |
| `404` | `errors/not-found` | No ticket with that id, for a Manager (AC-11) |
| `409` | `errors/ticket-not-escalatable` | The ticket is `Resolved` or `Closed` (AC-3, BR-3.3, BR-1.5). **New type** — see the note below |
| `409` | `errors/already-escalated` | The ticket is already escalated (AC-4, BR-3.4) |
| `409` | `errors/concurrency-conflict` | `expectedVersion` is stale (AC-12, ADR-006) |

#### Order of evaluation — fixed, so no client and no test has to guess

```text
400  malformed body / validation          nothing is loaded yet
403  role policy                          boundary — before the ticket is looked up
404  ticket not found
409  errors/ticket-not-escalatable        BR-3.3   ← before BR-3.4
409  errors/already-escalated             BR-3.4
409  errors/concurrency-conflict          raised by the write
```

A ticket that is **both** `Closed` and already escalated returns
`errors/ticket-not-escalatable`. The terminal state is the more fundamental refusal, and a
manager told "already escalated" about a closed ticket would go looking for de-escalation,
which does not exist.

#### `400` — validation

```json
{
  "type": "https://wasl.local/errors/validation",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "detail": "See the errors property for field-level messages.",
  "instance": "/api/tickets/3a7f9c10-1111-4222-8333-444455556666/escalate",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01",
  "errors": {
    "reason": ["A reason of 1 to 500 characters is required."]
  }
}
```

#### `403` — forbidden

```json
{
  "type": "https://wasl.local/errors/forbidden",
  "title": "You are not permitted to escalate a ticket.",
  "status": 403,
  "instance": "/api/tickets/3a7f9c10-1111-4222-8333-444455556666/escalate",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01"
}
```

No `errors` dictionary — there is no field at fault. **This response also writes an
`Auth.Forbidden` audit row, outside any transaction** (BR-9.2, BR-9.4). That row is the
part most likely to be missing: the policy denies at the boundary, so the handler and the
MediatR pipeline never run, and an audit mechanism that lives only in the pipeline
behaviour records nothing for the one endpoint whose entire authorization story is
"Manager only".

#### `409` — not escalatable

```json
{
  "type": "https://wasl.local/errors/ticket-not-escalatable",
  "title": "A ticket in status Resolved cannot be escalated.",
  "status": 409,
  "instance": "/api/tickets/3a7f9c10-1111-4222-8333-444455556666/escalate",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01",
  "errors": {
    "status": ["Resolved"]
  }
}
```

`errors.status` carries the **untranslated** current status so the client can render its
own sentence without parsing the title (BR-8.7).

**This `type` is new** and joins the registry in
`docs/sdd/documentation/api/error-handling.md` via `DOC-016-01`. The existing
`errors/ticket-closed` is deliberately **not** reused: a client that hides the comment
composer on `errors/ticket-closed` (BR-5.2) would then hide it on a `Resolved` ticket,
where commenting is still permitted. One wrong `type` produces a wrong screen.

#### `409` — already escalated

```json
{
  "type": "https://wasl.local/errors/already-escalated",
  "title": "This ticket is already escalated.",
  "status": 409,
  "instance": "/api/tickets/3a7f9c10-1111-4222-8333-444455556666/escalate",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01"
}
```

The response carries **no** detail about the existing escalation — not who escalated it,
not when, not the reason. The client refetches the ticket and gets all three from the read
shape, which is the path that is already authorized.

#### `409` — concurrency conflict

```json
{
  "type": "https://wasl.local/errors/concurrency-conflict",
  "title": "This ticket was changed by someone else.",
  "status": 409,
  "instance": "/api/tickets/3a7f9c10-1111-4222-8333-444455556666/escalate",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01"
}
```

The client refetches and shows the user what changed. **It never retries silently**
(ADR-006) — the system cannot know whether "escalate with this reason" is still intended
after someone else resolved the ticket.

### What stays identical in every locale

`title`, `detail`, and the human sentences inside `errors` are translated (BR-8.6). These
are **not** (BR-8.7):

| Part | Reason |
|---|---|
| `type` | The identifier the client branches on |
| The **keys** of `errors` (`reason`, `expectedVersion`, `status`) | They are request field names and a field name; part of this contract |
| The **value** of `errors.status` | An enum value — `Resolved` is an identifier, not a sentence |
| `priority`, `status`, `allowedTransitions` values | Enum values. Only their labels are translated, client-side |
| `ticketNumber` | Quoted aloud and pasted between systems (BR-8.13) |
| `escalationReason` | User content. Stored and returned verbatim, never translated (BR-8.10) |
| `traceId` | An identifier |

A client that branches on `type` works in Arabic. One that branches on `title` was already
broken. Send `Accept-Language: ar` to see the difference; `Content-Language` on the
response names the locale that was actually applied.

---

## Behaviour worth knowing before you build against it

| Situation | What happens | Why |
|---|---|---|
| A `Critical` ticket is escalated | `200`, `priority` comes back **`Critical`**, and exactly **one** history row is written | BR-3.6 is a floor, not an assignment. This is the single most important row in this table |
| A `High` ticket is escalated | `200`, `priority` stays `High`, one history row | Same rule. `High` is already at the floor |
| A `Low` ticket is escalated | `200`, `priority` becomes `High`, **two** history rows | BR-3.8's conditional `PriorityChanged` row |
| The same ticket is escalated twice | One `200`, then `409 errors/already-escalated` | BR-3.4. This endpoint is not idempotent, and it does not need to be — the second call is refused rather than repeated |
| Two Managers escalate concurrently | One `200`; the other gets `409 errors/concurrency-conflict` or `409 errors/already-escalated` depending on which read it did first. **Exactly one `Escalated` history row exists either way** | Both are correct refusals. The `rowversion` is the guarantee, not the pre-check |
| A ticket is escalated and then `Closed` | Stays escalated. `isEscalated` remains `true`, the callout remains | BR-3.9. Closing does not clear escalation, and nothing in the system can |
| An **Agent** calls with a nonexistent id | `403`, not `404` | The role policy is at the boundary and runs before the lookup. An integration test written the other way round fails for the right reason and looks like an endpoint bug |
| The ticket is unassigned | `200`. Escalation neither requires nor changes an assignee | Escalation raises visibility; it does not assign. Assignment is `011` |
| The reason is Arabic | Stored and returned byte-identical | `nvarchar(500)`. A `varchar` column returns `????`, which reads as a font problem and survives review (ADR-013 row 4) |
| The reason is 500 characters plus trailing spaces | `200`, stored at 500 | Trimmed before the limit is measured (`spec.md` A-2) |
| The reason is `"   "` | `400` naming `reason` | "Non-empty" means non-whitespace, consistent with BR-5.1 (`spec.md` A-1) |
| `escalatedBy` is later deactivated | Still reported on every read | `ON DELETE NO ACTION`, no hard delete. The audit row separately snapshots the actor's email and role at the time (BR-9.6) |
| A rolled-back transaction | No ticket change, **no** history rows, **no** audit row | BR-9.3. A log recording things that did not happen is worse than no log |
| De-escalation is attempted | There is no endpoint | BR-3.9. Not a gap — a stated exclusion |

## Verification

| What | How |
|---|---|
| Every status code above | `TEST-016-05` … `TEST-016-09` |
| The floor, all four starting priorities | `TEST-016-01`, `TEST-016-02` |
| `Critical` produces exactly one history row | `TEST-016-04` |
| The rank order is `Low < Normal < High < Critical` | `TEST-016-03` |
| One audit row on success, none after rollback | `TEST-016-10` |
| The `403` writes a row outside any transaction | `TEST-016-11` |
| `canEscalate` across role × flag × status | `TEST-016-13` |
| Arabic reason byte-identical; `type` and `errors` keys unchanged under `ar` | `TEST-016-12` |
| The `409` bodies carry nothing extra | `TEST-016-14`, `REV-016-02` |
| This contract matches what was built | `REV-016-03` — generated OpenAPI compared before the feature closes |
