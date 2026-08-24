# Contract — Customer overview

**Feature:** `018-customer-overview` · **Story:** US-004 · **Status:** FROZEN 2026-08-23
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

## `GET /api/customers/{id}/overview`

Everything the customer profile screen needs, in one response: the profile, the ticket
counts by status, and the ten most recent tickets.

This endpoint **replaces** `GET /api/customers/{id}` as the profile screen's call. Both
continue to exist — the plain profile read is still the right call for anything that
needs only the customer, such as the pre-fill on `/tickets/new`.

### Request

| Part | Value |
|---|---|
| Route | `id` — the customer's `Guid`. **No route constraint**: a value that is not a GUID is a `400`, not a `404` (see *Failures*) |
| Query string | None. There is no `limit`, no `page`, and no `status` filter — deliberately |
| Headers | `Authorization: Bearer <JWT>`, optional `Accept-Language: en \| ar` |
| Role | `Agent` or `Manager`. Both are permitted (BR-6), so this endpoint has **no `403`** |

### `200 OK`

```json
{
  "customer": {
    "id": "8f1c2d34-5678-4abc-9def-0123456789ab",
    "fullName": "شركة الرياض القابضة",
    "email": "ops@riyadh-holdings.example",
    "phone": "+966501234567",
    "companyName": "Riyadh Holdings Group",
    "notes": "Prefers WhatsApp. Escalate billing issues to Faisal.",
    "isActive": true,
    "createdAtUtc": "2026-01-14T09:12:00Z",
    "updatedAtUtc": "2026-07-02T11:40:00Z",
    "version": "AAAAAAAAB9E="
  },
  "ticketCounts": {
    "total": 7,
    "byStatus": {
      "New": 1,
      "Open": 2,
      "InProgress": 0,
      "PendingCustomer": 0,
      "Resolved": 3,
      "Closed": 1
    }
  },
  "recentTickets": [
    {
      "id": "b21e77aa-1c2d-4e3f-8a90-112233445566",
      "ticketNumber": "TCK-2026-000418",
      "subject": "الفاتورة الشهرية غير صحيحة",
      "status": "Open",
      "priority": "High",
      "category": "Billing",
      "channel": "WhatsApp",
      "isEscalated": false,
      "assignedToUserId": "3c9a0011-2233-4455-6677-8899aabbccdd",
      "assignedToName": "Faisal Al-Otaibi",
      "createdAtUtc": "2026-08-21T07:55:00Z"
    }
  ],
  "recentTicketsTruncated": false
}
```

#### `customer`

Identical in shape to the body of `GET /api/customers/{id}` from
`008-customer-list-and-profile` (AC-13). It is **embedded, not restated** — a change to
that shape is a change to this contract and is recorded in both features' *Contract
changes*.

`version` is the base64 `rowversion` (ADR-006 as amended by ADR-013). It is carried here
so the screen can hand it straight to `017-update-customer` without a second read.

#### `ticketCounts`

| Field | Type | Rules |
|---|---|---|
| `total` | `int` | Every ticket for this customer, regardless of status. Equals the sum of `byStatus` |
| `byStatus` | `object` | **All six** BR-1 statuses are always present, in the order above, including statuses with no tickets — those are `0`, not omitted (AC-3, AC-7) |

The keys of `byStatus` are the untranslated `TicketStatus` enum names and are
byte-identical in every locale (BR-8.7). The client maps them to labels through the
`tickets:status.*` catalogue. A client that renders the keys directly is showing English
identifiers to an Arabic user; a client that switches on them is correct.

`byStatus` is an object rather than an array so a lookup is `byStatus[status]` and not a
`.find()` that can return `undefined` — a status the API always sends should not be
typed as possibly missing.

#### `recentTickets`

| Field | Type | Notes |
|---|---|---|
| `id` | `Guid` | Row link target: `/tickets/{id}` |
| `ticketNumber` | `string` | Human-facing identifier. **Never localized**, Latin digits always (BR-8.13) |
| `subject` | `string` | User content. Render with `dir="auto"` |
| `status` | enum string | One of the six BR-1 values |
| `priority` | enum string | `Low \| Normal \| High \| Critical` |
| `category` | enum string | `Billing \| Technical \| Account \| General` |
| `channel` | enum string | `Email \| WhatsApp \| LiveChat \| Sms \| WebForm` |
| `isEscalated` | `bool` | Drives the escalated badge |
| `assignedToUserId` | `Guid?` | `null` when unassigned — a normal state, not an error |
| `assignedToName` | `string?` | The assignee's display name. **No email, no role** — see *Behaviour*, below |
| `createdAtUtc` | `string` | ISO 8601, `Z` |

Ordering and size:

- At most **10** items (AC-2). There is no page 2 and no `limit` parameter (spec A-5)
- Ordered `createdAtUtc` **descending**, tie-broken by `id` descending (BR-7.1, AC-2).
  The tie-break is part of the contract, not an implementation detail: `datetime2(3)` is
  millisecond-precision, so ties are ordinary, and without the tie-break the same
  request can return the same ten rows in a different order
- **Not filtered by status.** `Resolved` and `Closed` tickets appear (AC-8)
- `[]` when the customer has no tickets — never `null`, and never a `404` (BR-7.6, AC-3)

#### `recentTicketsTruncated`

`true` when the customer has more than 10 tickets, meaning `recentTickets` is a window
rather than the whole set (AC-9). The client uses it to decide whether to show "see all",
which links to `/tickets?customerId={id}`.

It is a boolean and not a count, because the count is already in `ticketCounts.total`
and two fields carrying the same fact drift.

### Failures

| Code | `type` | When |
|---|---|---|
| `400` | `errors/validation` | `id` is not a well-formed GUID (AC-6) |
| `401` | `errors/unauthenticated` | Missing or invalid token (AC-10) |
| `404` | `errors/not-found` | No customer with that id (AC-5) |

There is **no `403`** and no `409`. BR-6 permits both roles to view any customer, and
this endpoint changes nothing there could be a conflict about.

#### `400` — malformed id

```json
{
  "type": "https://wasl.local/errors/validation",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "detail": "See the errors property for field-level messages.",
  "instance": "/api/customers/abc/overview",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01",
  "errors": {
    "id": ["The value 'abc' is not a valid customer identifier."]
  }
}
```

`400` and not `404` on purpose. A route constraint (`{id:guid}`) would make this URL
match no route at all and return `404`, which is the same answer the API gives for a
customer that genuinely does not exist. The screen shows different things for the two:
`404` is a not-found page with a link back to the list, `400` is a broken link. Making
them indistinguishable at the API removes the screen's ability to tell them apart.

#### `404` — unknown customer

```json
{
  "type": "https://wasl.local/errors/not-found",
  "title": "Customer not found.",
  "status": 404,
  "instance": "/api/customers/8f1c2d34-5678-4abc-9def-0123456789ab/overview",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01"
}
```

No `errors` object: there is no field-level problem to report. The response carries
nothing about why — not whether the id ever existed, not whether it was deactivated.

**A customer with zero tickets is not a `404`.** It is a `200` with zeros and an empty
array (BR-7.6, AC-3). This is the single most likely thing to be got wrong here, on both
sides: a server that treats "no rows in the join" as not-found, or a client that treats
an empty list as a failed load.

### What stays identical in every locale

`title` and the messages inside `errors` are translated (BR-8.6). These are **not**
(BR-8.7):

| Part | Reason |
|---|---|
| `type` | The identifier the client branches on |
| The keys of `errors` | They are request field names, part of this contract |
| The keys of `byStatus`, and every `status`, `priority`, `category`, `channel` value | Enum identifiers. Only their labels are translated, client-side |
| `ticketNumber` | Quoted aloud and pasted between systems (BR-8.13) |
| `traceId` | An identifier |

Send `Accept-Language: ar` to see the difference; `Content-Language` on the response
names the locale that was actually applied.

---

## Behaviour worth knowing before you build against it

| Situation | What happens | Why |
|---|---|---|
| The customer has no tickets | `200`, `total: 0`, all six status keys at `0`, `recentTickets: []`, `recentTicketsTruncated: false` | BR-7.6. Common and normal — every customer looks like this for the first minute of their existence (AC-3) |
| The customer has exactly 10 tickets | 10 rows, `recentTicketsTruncated: false` | The boundary is inclusive on the untruncated side |
| The customer has 11 tickets | 10 rows, `recentTicketsTruncated: true` | The server reads 11 and returns 10; the extra row exists only to answer this flag |
| Several tickets share a `createdAtUtc` to the millisecond | The order is still total and repeatable | `createdAtUtc DESC, id DESC`. Without the tie-break the same request can reorder between calls, which reads as data changing on its own |
| A ticket is unassigned | `assignedToUserId` and `assignedToName` are both `null` | A normal state. Render a muted placeholder, not an error |
| The customer is inactive | `200`, with counts and history intact | AC-14. Deactivation does not erase support history |
| `notes` is absent | `null`, not `""` | The client renders its own empty state; an empty string would render as a blank region indistinguishable from a layout bug |
| The whole response is requested twice | Identical bytes, no cache headers set by this endpoint | It is a plain read; TanStack Query owns client-side freshness |
| Reading the overview | **No audit row is written** | BR-9.1 audits state changes. Reads are not audited, with the one deliberate exception of the audit log itself (BR-9.11). AC-11 asserts the absence |
| Calling without a token | `401`, **and** one audit row (`Auth.Unauthenticated`) written outside any transaction | BR-9.2, BR-9.4, AC-10 |
| Adding a seventh ticket status one day | `byStatus` grows a key | The client must not assume six keys; iterate the object, do not index six known names in a fixed array |

### What this response deliberately does not carry

| Not returned | Why |
|---|---|
| The assignee's email or role | The screen shows a name. An email is contact data for an internal user and has no reason to cross this boundary (`docs/sdd/testing/security-checklist.md`) |
| Comment counts, "last contacted" | Spec Q-2. Each is another aggregate and neither is on the screen |
| A ticket's `description` | The row shows a subject. Descriptions are up to 4000 characters each, and ten of them would dominate the payload for text nothing renders |
| `allowedTransitions` per ticket | That belongs to `GET /api/tickets/{id}` (`012`). The overview is not an action surface |
| SLA figures, activity series | Out of scope in US-004 |

## Verification

| What | How |
|---|---|
| The `200` shape, field by field | `TEST-018-01` |
| Zero-ticket customer: zeros present, list empty, still `200` | `TEST-018-02` |
| **Exactly three database commands per request** | `TEST-018-03` — a `DbCommandInterceptor` counting commands, against Testcontainers.MsSql |
| The 10-item cap and the `createdAtUtc DESC, id DESC` order, including a same-millisecond tie | `TEST-018-04` |
| `recentTicketsTruncated` at exactly 10 and at 11 | `TEST-018-05` |
| `404` unknown id and `400` malformed id, both as `ProblemDetails` | `TEST-018-06` |
| `Resolved` and `Closed` tickets present in the recent list | `TEST-018-07` |
| `401` returns and writes exactly one audit row | `TEST-018-08` |
| A successful read writes **no** audit row | `TEST-018-09` |
| Both roles receive `200`; no `403` exists | `TEST-018-10` |
| Inactive customer still returns `200` | `TEST-018-11` |
| Arabic content round-trips; `byStatus` keys and enum values byte-identical to English | `TEST-018-12` |
| Both ticket reads seek `IX_Tickets_Customer` | `TEST-018-14`, recorded plan |
| This contract matches what was built | `REV-018-03` — generated OpenAPI compared against this file before the feature closes |
