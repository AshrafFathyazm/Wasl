# Contract — Ticket assignee, and the support-user picker

**Feature:** `011-assign-ticket` · **Story:** US-007 · **Status:** FROZEN 2026-08-23
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
- `version` is the base64 form of the SQL Server `rowversion` (ADR-006 as amended by
  ADR-013). It is opaque: never parsed, compared, or ordered by the client
- Errors are RFC 7807 `ProblemDetails`. **`200` is never returned with an error in the
  body** (`docs/sdd/05-api-conventions.md`)

---

## `PUT /api/tickets/{id}/assignee`

Sets or clears a ticket's assignee. One business action with one set of rules (BR-2) and
one history row, which is why it is a sub-resource `PUT` and not a field in a generic
`PATCH` on the ticket (`docs/sdd/05-api-conventions.md`, `research.md` R-2).

**Who may call it:** any authenticated support user. The endpoint carries
`.RequireAuthorization()` and **no role policy** — an Agent self-assigning an unassigned
ticket is legitimate (BR-2.2). The role-dependent part of the rule is decided inside the
handler, because it needs the request body and the ticket row. See `plan.md`, *Where each
BR-2 check lives*.

### Request

```json
{
  "assigneeId": "3f9a1b52-77c4-4c1e-9b2a-8d0e5c7a1234",
  "expectedVersion": "AAAAAAAAB9E="
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `assigneeId` | `Guid?` | **yes, may be `null`** | The target support user. `null` means **unassign** (AC-5). Omitting the property is treated as `null`, consistent with the edge-case register |
| `expectedVersion` | `string` (base64) | **yes** | The `version` from the ticket the client is looking at. A missing, empty, or non-base64 value is `400` — never an unchecked write |

`{id}` is the ticket's `Guid`. A malformed `Guid` in the route is `400`, not `404`.

### `200 OK`

The ticket read representation, which is owned by `010-ticket-list-and-detail`. This
contract freezes the fields the acceptance criteria depend on; the rest of the shape
comes from `010` unchanged.

```json
{
  "id": "8f1c2d34-5678-4abc-9def-0123456789ab",
  "ticketNumber": "TCK-2026-000042",
  "status": "New",
  "assignee": {
    "id": "3f9a1b52-77c4-4c1e-9b2a-8d0e5c7a1234",
    "fullName": "سارة العتيبي",
    "role": "Agent"
  },
  "allowedTransitions": ["Open", "Closed"],
  "updatedAtUtc": "2026-08-23T12:00:00Z",
  "version": "AAAAAAAAB9I="
}
```

| Field | Guarantee |
|---|---|
| `status` | **Unchanged by this call** (BR-2.7, AC-10). Assigning a `New` ticket returns `"New"` |
| `assignee` | The new assignee, or `null` after an unassign. Nested object, never a bare id — the client must not have to look the name up |
| `allowedTransitions` | Recomputed. Assignment changes it even though `status` did not, because BR-1.3 makes `InProgress` conditional on having an assignee |
| `version` | The **new** `rowversion`. The client replaces the one it held; a second call with the old value is a `409` |
| `updatedAtUtc` | Advanced. The clock is the injected `TimeProvider`, so a test can pin it |

### Failures

| Code | `type` | When |
|---|---|---|
| `400` | `errors/malformed-request` | The body could not be parsed |
| `400` | `errors/validation` | Malformed route `Guid`; missing, empty, or non-base64 `expectedVersion`; **the target user is inactive** (BR-2.4, AC-6) — keyed on `assigneeId` |
| `401` | `errors/unauthenticated` | Missing, expired, or invalid token |
| `403` | `errors/forbidden` | An Agent assigning to anyone but themselves (BR-2.2, AC-3), or an Agent changing a ticket already assigned to someone else — `null` included (BR-2.3, AC-4) |
| `404` | `errors/not-found` | The **ticket** does not exist (AC-14) |
| `404` | `errors/assignee-not-found` | The **target user** does not exist (AC-7) |
| `409` | `errors/ticket-closed` | The ticket is `Closed`; it cannot be assigned or unassigned by anyone (BR-2.5, BR-1.5, AC-8) |
| `409` | `errors/assignee-unchanged` | The ticket is already assigned to that user, or already unassigned and `null` was sent (AC-11) |
| `409` | `errors/concurrency-conflict` | `expectedVersion` is stale (ADR-006, AC-12) |

Two of these `type` values are new and are added to the registry owned by
`002-error-contract` — see **Contract changes** in [`plan.md`](../plan.md).

#### `400` — inactive target

```json
{
  "type": "https://wasl.local/errors/validation",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "instance": "/api/tickets/8f1c2d34-5678-4abc-9def-0123456789ab/assignee",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01",
  "errors": {
    "assigneeId": ["This user is not active and cannot be assigned tickets."]
  }
}
```

Inactive is `400` and not `404` because the user exists — the request is what is wrong
(`spec.md` Q-2). The `errors` key is `assigneeId`, which is the machine-readable part;
that is what tells the client to put the message on the picker and refresh the list.

#### `403` — not permitted

```json
{
  "type": "https://wasl.local/errors/forbidden",
  "title": "You are not permitted to perform this action.",
  "status": 403,
  "instance": "/api/tickets/8f1c2d34-5678-4abc-9def-0123456789ab/assignee",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01"
}
```

No `errors` dictionary, and **no `detail` naming the current assignee**. The response
says the action is not permitted and stops. Who currently owns the ticket is available on
the ticket read; a denial is not the place to disclose state, and a client that parsed
`detail` for it would be parsing a translated sentence (BR-8.7).

#### `409` — every variant carries the same shape

```json
{
  "type": "https://wasl.local/errors/assignee-unchanged",
  "title": "This ticket is already assigned to that user.",
  "status": 409,
  "instance": "/api/tickets/8f1c2d34-5678-4abc-9def-0123456789ab/assignee",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01"
}
```

Only `type` distinguishes them, which is the whole reason there are three of them.

### The order the checks run in

Several failures can apply to one request. The order is fixed by this contract, because
a test that asserts "not `200`" passes against the wrong reason and a client that
branches on the first failure it was shown gets a different answer on a retry.

| # | Check | Result |
|---|---|---|
| 1 | Token | `401` |
| 2 | Body parses; route `Guid`; `expectedVersion` present and base64 | `400` |
| 3 | Ticket exists | `404` `errors/not-found` |
| 4 | `expectedVersion` equals the loaded row's `rowversion` | `409` `errors/concurrency-conflict` |
| 5 | BR-2.1 – BR-2.3 permission, decided from the loaded row | `403` |
| 6 | Target exists (skipped when `assigneeId` is `null`) | `404` `errors/assignee-not-found` |
| 7 | Target is active | `400` |
| 8 | Ticket is not `Closed` | `409` `errors/ticket-closed` |
| 9 | The assignment is a change | `409` `errors/assignee-unchanged` |
| 10 | `SaveChanges` — EF re-checks the token against the row it is updating | `409` `errors/concurrency-conflict` |

**Why the version check precedes the permission decision (step 4 before step 5).** The
permission decision reads the *current* assignee. With a stale version, the client is
looking at a different assignee than the server is, so a `403` computed there may be
wrong — and the client has no way to tell that it might be. A `409` sends it back for the
truth first. `research.md` R-6.

**Why permission precedes state (step 5 before step 8).** An Agent assigning someone
else to a `Closed` ticket gets `403`, not `409`. They could not have done it on an open
ticket either, and answering `409` first implies that reopening would help — which it
would not, because `Closed` is terminal (BR-1.5).

### What stays identical in every locale

`title`, `detail`, and the messages inside `errors` are translated (BR-8.6). These are
**not** (BR-8.7):

| Part | Reason |
|---|---|
| `type` | The identifier the client branches on. Three distinct `409` types exist only so this works |
| The **keys** of `errors` | They are request field names, part of this contract |
| `status`, `role`, `allowedTransitions` values | Enum values and identifiers. `"Agent"` is `"Agent"` in Arabic |
| `ticketNumber` | Quoted aloud and pasted between systems; Latin digits in every locale (BR-8.13) |
| `traceId` | An identifier |

A client that branches on `type` works in Arabic. One that branches on `title` was
already broken. `Content-Language` on the response names the locale that was actually
applied.

---

## `GET /api/support-users`

The assignee picker's source. Every **active** support user, both roles.

### Request

```http
GET {{baseUrl}}/api/support-users
Authorization: Bearer <JWT>
```

No parameters. No paging.

### `200 OK`

```json
[
  { "id": "3f9a1b52-77c4-4c1e-9b2a-8d0e5c7a1234", "fullName": "سارة العتيبي", "role": "Agent" },
  { "id": "b7d2e4c1-90aa-4d2f-8c3b-1e5f7a9b2345", "fullName": "Omar Khalid",  "role": "Manager" }
]
```

| Field | Type | Note |
|---|---|---|
| `id` | `Guid` | Send this back as `assigneeId` |
| `fullName` | `string` | May be Arabic in an English interface. Render with `dir="auto"` |
| `role` | `"Agent" \| "Manager"` | An enum value, never translated. The client renders a translated label |

A **plain array, not the paged envelope** from BR-7. The set is seeded and bounded
(ADR-005), so a page control nobody can use is worse than none. If user management ever
ships, this becomes a paged endpoint and that is a breaking change — recorded as
`spec.md` A-4 rather than designed around.

Email is deliberately **not** returned. The picker does not need it, and a list endpoint
that hands out every internal email address to every caller is a disclosure with no
requirement behind it.

### Failures

| Code | `type` | When |
|---|---|---|
| `401` | `errors/unauthenticated` | Missing, expired, or invalid token |

No `403`: both roles need the picker. No `404`: an empty pool is `200` with `[]`
(BR-7.6) — which the client must render as an empty state, not as a working dropdown
with nothing in it.

---

## Behaviour worth knowing before you build against it

| Situation | What happens | Why |
|---|---|---|
| Assigning a `New` ticket | `200`, and `status` is still `"New"` | BR-2.7 and ADR-004. Triage and ownership are separate events, and coupling them erases one from the history |
| …but `allowedTransitions` changed | It now contains `InProgress` where it did not before | BR-1.3: `InProgress` requires an assignee. A client that keeps its old action menu shows "Start work" as unavailable on a ticket that can now be started |
| A Manager assigns a ticket to themselves | `200` | A manager is also an agent in practice, and BR-2.1 does not exclude self |
| An Agent unassigns **someone else's** ticket | `403` | BR-2.3. `null` is a target like any other, so removing another agent's ownership is a reassignment |
| An Agent unassigns **their own** ticket | `200` | AC-5, `spec.md` Q-1. The alternative traps an agent on a ticket they cannot progress |
| The current assignee was deactivated after assignment | The ticket keeps them, and they are **absent from `GET /api/support-users`** | Deactivation does not retroactively strand tickets. Render the current assignee from the ticket response — looking it up in the picker list yields nothing and reads as missing data |
| A no-op is sent to a ticket whose assignee is inactive | `409` `errors/assignee-unchanged`, not `400` | A no-op is not an opportunity to enforce BR-2.4 retroactively; doing so would make that ticket un-actionable |
| Two agents assign against the same `version` | One `200`, one `409` `errors/concurrency-conflict` | ADR-006. The loser refetches and is shown what changed. **Never retried automatically** — retrying is guessing at intent |
| Assignment succeeds but nothing else changes | One `TicketHistory` row (`Assigned` or `Unassigned`) and one `AuditLog` row, both in the same transaction as the update | BR-2.6, BR-9.3. Roll the transaction back and both are gone |
| A `403` is returned | One `AuditLog` row, `Auth.Forbidden` / `Denied`, written **outside** the transaction | BR-9.2, BR-9.4. There is no business transaction to join, and the one that opened has rolled back |
| `GET /api/support-users` ordering | `FullName` ascending under the **database** collation, which does not follow `Accept-Language` | A mixed Arabic and English list looks correctly ordered in English and arbitrary in Arabic. A client that needs locale-correct ordering sorts with `Intl.Collator` |
| An unknown field is in the request body | Ignored | Not an error; the command binds what it declares |
| `PUT` is sent twice with the same fresh version | The second is `409` `errors/assignee-unchanged` or `errors/concurrency-conflict`, never a silent second write | Both are safe answers; neither is `200` |

## Verification

| What | How |
|---|---|
| Every status code above | `TEST-011-03` … `TEST-011-10`, `TEST-011-13` |
| The check order in the precedence table | `TEST-011-10` asserts `409` in preference to the `403` the same request would earn |
| The `403` body carries nothing extra | `TEST-011-15` |
| History rows for assign and unassign, with old and new values | `TEST-011-09` |
| One audit row in-transaction; none after rollback; one `Denied` row on `403` | `TEST-011-11`, `TEST-011-12` |
| Arabic `fullName` byte-identical, not `????` | `TEST-011-14` |
| `type` and `errors` keys byte-identical in Arabic | Covered by `005-localization-core`, re-asserted here |
| This contract matches what was built | `REV-011-03` — generated OpenAPI compared before the feature closes |
