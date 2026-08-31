# Contract — Tickets (list and detail)

**Feature:** `010-ticket-list-and-detail` · **Story:** US-006 (read half) · **Status:** FROZEN 2026-08-23
· **Lanes:** backend implements · frontend consumes

The agreement. The backend implements exactly this; the frontend may start against it
immediately. Any change goes through **Contract changes** in [`plan.md`](../plan.md)
first — see `docs/sdd/openapi/README.md`.

`015-ticket-filters-and-search` **extends** `GET /api/tickets` with query parameters. It
adds no endpoint, removes no field, and changes no type. Its parameters are documented in
[`../../015-ticket-filters-and-search/contracts/tickets-filter-api.md`](../../015-ticket-filters-and-search/contracts/tickets-filter-api.md)
rather than here, so this file stays readable as the thing `010` was reviewed against.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on every call
- **Content-Type:** `application/json`
- Timestamps are UTC, ISO 8601, `Z` suffix. Formatting for display is the client's job,
  in the client's locale
- Identifiers are `Guid` strings. Enums are strings on the wire — `InProgress`, never `2`
  and never a translated label
- Errors are RFC 7807 `ProblemDetails`. **`200` is never returned with an error in the
  body** (`docs/sdd/05-api-conventions.md`)
- Both roles may call both endpoints (BR-6). There is no `403` on either

---

## `GET /api/tickets`

The ticket list, newest first. Paginated. No filters in this feature.

### Request

| Parameter | Type | Default | Rules |
|---|---|---|---|
| `page` | `int` | `1` | 1-based. `0` or negative is **clamped to 1**, not rejected |
| `pageSize` | `int` | `20` | Above 100 is **clamped to 100**. Below 1 is clamped to the default of 20 |

```http
GET {{baseUrl}}/api/tickets?page=1&pageSize=20
Authorization: Bearer <JWT>
Accept-Language: ar
```

No other parameter is honoured in this feature. An unrecognised parameter is ignored, not
rejected — including `sort`, which is deliberately not implemented (`spec.md` Q-3).

### `200 OK`

```json
{
  "items": [
    {
      "id": "8f1c2d34-5678-4abc-9def-0123456789ab",
      "ticketNumber": "TCK-2026-000042",
      "subject": "لا يمكنني تسجيل الدخول إلى الحساب",
      "customerId": "1b2c3d4e-5678-4abc-9def-0123456789ab",
      "customerName": "علي الأحمد",
      "status": "InProgress",
      "priority": "High",
      "category": "Technical",
      "channel": "Email",
      "assigneeId": "2c3d4e5f-5678-4abc-9def-0123456789ab",
      "assigneeName": "Sara Khan",
      "isEscalated": false,
      "createdAtUtc": "2026-08-23T12:00:00Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "totalCount": 137,
  "totalPages": 7
}
```

| Field | Type | Note |
|---|---|---|
| `items[].id` | `Guid` | The route parameter for the detail call |
| `items[].ticketNumber` | `string(20)` | `TCK-yyyy-000000`. Identical in every locale, Latin digits (BR-8.13) |
| `items[].subject` | `string(200)` | User content, verbatim, may be Arabic in an English UI. Render with `dir="auto"` |
| `items[].customerId` / `customerName` | `Guid` / `string(200)` | Projected in the same query as the row (AC-12) |
| `items[].status` | enum | `New` \| `Open` \| `InProgress` \| `PendingCustomer` \| `Resolved` \| `Closed` |
| `items[].priority` | enum | `Low` \| `Normal` \| `High` \| `Critical` |
| `items[].category` | enum | `Billing` \| `Technical` \| `Account` \| `General` |
| `items[].channel` | enum | `Email` \| `WhatsApp` \| `LiveChat` \| `Sms` \| `WebForm` |
| `items[].assigneeId` / `assigneeName` | `Guid?` / `string?` | **Both `null` when unassigned.** The row is still returned — the join is a left join |
| `items[].isEscalated` | `bool` | The escalation *reason* is on the detail only |
| `items[].createdAtUtc` | `datetime` | The sort key |
| `page` | `int` | Echoes the **effective** page after clamping |
| `pageSize` | `int` | Echoes the **effective** page size after clamping — see the behaviour table |
| `totalCount` | `int` | Total matching rows, from a second query (`docs/sdd/05-api-conventions.md`) |
| `totalPages` | `int` | `0` when `totalCount` is `0`, not `1` |

**Order:** `CreatedAtUtc DESC, Id DESC` (BR-7.1 plus a deterministic tie-breaker). The
second key is not decoration — without it a row sharing a millisecond with another can
appear on two pages or on neither.

**Not on the row, and not by omission:** `description` (4,000 characters × 100 rows of
payload nothing renders), `version` (nothing on the list mutates), and
`allowedTransitions` (nothing on the list acts).

### Failures

| Code | `type` | When |
|---|---|---|
| `400` | `errors/validation` | `page` or `pageSize` is not an integer. Out-of-range values are clamped, never rejected |
| `401` | `errors/unauthenticated` | Missing or invalid token (AC-16) |

An empty result is **`200` with `items: []`** and never `404` (BR-7.6, AC-11). A `404`
here would mean "there is no ticket list", which is false.

---

## `GET /api/tickets/{id}`

One ticket, with everything the detail screen renders and the array that tells the client
what it may do next.

### Request

```http
GET {{baseUrl}}/api/tickets/8f1c2d34-5678-4abc-9def-0123456789ab
Authorization: Bearer <JWT>
```

`{id}` carries a `:guid` route constraint. A segment that is not a `Guid` does not match
the route and returns `404` — see the behaviour table for why that is the answer and not
`400`.

### `200 OK`

```json
{
  "id": "8f1c2d34-5678-4abc-9def-0123456789ab",
  "ticketNumber": "TCK-2026-000042",
  "subject": "لا يمكنني تسجيل الدخول إلى الحساب",
  "description": "…",
  "customer": { "id": "1b2c…", "fullName": "علي الأحمد" },
  "category": "Technical",
  "priority": "High",
  "channel": "Email",
  "status": "InProgress",
  "assignee": { "id": "2c3d…", "fullName": "Sara Khan" },
  "createdBy": { "id": "3d4e…", "fullName": "Omar Said" },
  "isEscalated": true,
  "escalatedAtUtc": "2026-08-23T13:30:00Z",
  "escalatedBy": { "id": "4e5f…", "fullName": "Layla Nasser" },
  "escalationReason": "Customer is a key account and has waited two days.",
  "createdAtUtc": "2026-08-23T12:00:00Z",
  "updatedAtUtc": "2026-08-23T13:30:00Z",
  "closedAtUtc": null,
  "allowedTransitions": ["Open", "PendingCustomer", "Resolved"],
  "version": "AAAAAAAAB9E="
}
```

| Field | Type | Note |
|---|---|---|
| `customer` | object | Always present. A ticket cannot exist without a customer |
| `assignee` | object? | `null` while unassigned. The strip renders "Unassigned" (BR-2) |
| `createdBy` | object | Always present |
| `isEscalated` | `bool` | When `false`, `escalatedAtUtc`, `escalatedBy`, and `escalationReason` are all `null` |
| `closedAtUtc` | `datetime?` | Set only when `status` is `Closed` (BR-1.7) |
| `allowedTransitions` | `string[]` | The statuses this ticket may move to, from BR-1's matrix for its **current** status. Always present. `[]` for a `Closed` ticket — never absent, never `null` |
| `version` | `string` | Base64 `rowversion` (ADR-006 as amended by ADR-013). Returned even though this feature never consumes it, so `011` and `012` do not have to change the read shape later |

#### `allowedTransitions` — what it is for

**The client renders what this array contains and holds no copy of the state machine**
(ADR-004). The take-action menu is a `map` over it. If the array is empty, no action
control is rendered at all — not a disabled one.

The array is the permitted-transition set, not the permitted-*action* set. Two rules are
deliberately not folded into it:

| Rule | Where it is enforced | Why not here |
|---|---|---|
| BR-1.3 — `InProgress` requires an assignee | `012`, server-side, as a `409` | Folding it in would make the array depend on the ticket's assignment *and* the caller, so two clients viewing the same ticket would see different arrays and the field would stop being cacheable |
| BR-6 / BR-2 — who may perform the change | `011` and `012`, as a `403` | Same reason. The array answers "what can happen to this ticket", not "what may you do" |

So a client may offer a transition the server then rejects. That is correct: the rejection
is a `409` or a `403` with a message, and the alternative is an array that means something
different for every viewer.

### Failures

| Code | `type` | When |
|---|---|---|
| `401` | `errors/unauthenticated` | Missing or invalid token (AC-16) |
| `404` | `errors/not-found` | No ticket has that id — including a well-formed `Guid` that belongs to a customer (AC-19), and a segment that is not a `Guid` at all (AC-20) |

```json
{
  "type": "https://wasl.local/errors/not-found",
  "title": "The requested ticket was not found.",
  "status": 404,
  "instance": "/api/tickets/8f1c2d34-5678-4abc-9def-0123456789ab",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01"
}
```

No `errors` dictionary: there is no field to attach a message to.

### What stays identical in every locale

`title` and `detail` are translated (BR-8.6). These are **not** (BR-8.7):

| Part | Reason |
|---|---|
| `type` | The identifier the client branches on |
| Every enum value — `status`, `priority`, `category`, `channel`, and every entry in `allowedTransitions` | Identifiers. Only their display labels are translated, and those live in the client's catalogue |
| `ticketNumber` | Quoted aloud and pasted between systems. Latin digits in Arabic too (BR-8.13) |
| `traceId`, every `Guid`, `version` | Identifiers |

Subject, description, customer name, and assignee name are **user content**: stored and
returned verbatim, never translated (BR-8.10), and rendered with `dir="auto"`.

`Content-Language` on the response names the locale that was actually applied, so a client
can tell that its request for `fr` produced English (BR-8.3).

---

## Behaviour worth knowing before you build against it

| Situation | What happens | Why |
|---|---|---|
| `?pageSize=500` | `200`, and the response says `"pageSize": 100` | BR-7.2 clamps rather than rejects. The response reports the **effective** value — echoing back 500 is what makes a clamp invisible to the client and is the bug this row exists to prevent |
| `?page=0` | `200`, and the response says `"page": 1` | Same principle (`docs/sdd/05-api-conventions.md`) |
| `?pageSize=0` | `200`, `pageSize` 20 | Zero has no useful meaning and rejecting it would be the one place the pagination contract rejects instead of clamping (`spec.md` Q-4) |
| `?page=abc` | `400` `errors/validation` | Not a number is malformed, not out of range. It must arrive as `ProblemDetails` with a `traceId`, not as the framework's bare `400` — `BE-010-11` is the test |
| `?page=9999` on 137 rows | `200`, `items: []`, `totalCount: 137`, `totalPages: 7` | A page past the end is an empty answer, not an error (AC-21). The footer can offer page 1 from `totalPages` |
| The table is empty | `200`, `items: []`, `totalCount: 0`, **`totalPages: 0`** | Zero, not one. A client dividing by `totalPages` needs to know |
| Two tickets share a `CreatedAtUtc` | Each appears exactly once across pages | The `Id DESC` tie-breaker. `datetime2(3)` makes ties reachable in a seeded fixture, not merely theoretical |
| A ticket has no assignee | Listed, with `assigneeId` and `assigneeName` both `null` | Left join. An inner join would silently drop every unassigned ticket — which is the entire triage queue |
| The customer has been deactivated | The ticket is still listed | `IsActive` is a customer-level flag and is not a filter on tickets. Hiding the ticket would lose history |
| `/api/tickets/not-a-guid` | `404`, not `400` and not `500` | The `:guid` route constraint rejects the segment before any handler runs, so there is no request to validate. Recorded because `400` is the intuitive guess and the test asserts `404` |
| A `Closed` ticket | `allowedTransitions: []` | `Closed` is terminal (BR-1.5). The client renders no action control |
| The same list is requested twice while a ticket is created in between | Page 1 may shift by one row | Page-based pagination with a newest-first sort. Accepted: the alternative is cursors, which cannot show page numbers or a total |
| `Accept-Language: fr` | `200` in English, `Content-Language: en` | An unsupported locale is not a client error (BR-8.3) |
| A `403` | Never returned by either endpoint | BR-6 grants list and view to both roles. If that ever changes, a `403` arrives with a BR-9.2 audit row attached |

## Verification

| What | How |
|---|---|
| Envelope, default sort, clamping at every boundary | `TEST-010-01`, `TEST-010-02` |
| Empty result is `200` with `[]`, and `totalPages` is `0` | `TEST-010-03` |
| `page` beyond the last | `TEST-010-04` |
| Ties appear exactly once across a page boundary | `TEST-010-05` |
| The page costs a constant number of commands, not one per row | `TEST-010-06`, via a `DbCommandInterceptor` |
| Detail shape, including `version` and the escalation fields | `TEST-010-07` |
| `allowedTransitions` per status, and `[]` for `Closed` | `TEST-010-08` |
| `404` for an unmatched id, a non-`Guid` segment, and a customer's id | `TEST-010-09` |
| `401` on both endpoints | `TEST-010-10` |
| Arabic subject and customer name byte-identical through both endpoints | `TEST-010-12` |
| Malformed `page` stays inside the error contract | `BE-010-11` |
| This contract matches what was built | `REV-010-03` — generated OpenAPI compared field by field before the feature closes |

---

# Contract changes

**The frozen text above is NOT edited.** This section is appended, which is the rule
`error-contract.md` set when `429` arrived on `POST /api/auth/token` after freezing: a contract a
lane has already built against is a record of what was agreed, and rewriting it in place destroys
the only evidence of what changed.

## 2026-08-31 — `034-ticket-detail-backend` added `?customerId=`

| Parameter | Type | Default | Rules |
|---|---|---|---|
| `customerId` | `Guid` | absent | Return only this customer's tickets. Clamped and paged through the same helpers as everything else |

A parameter on this list rather than a new `/api/customers/{id}/tickets`, because the second would
be a list endpoint with its own paging, its own clamping and its own copy of the projection.

## 2026-08-31 — `015-ticket-filters-and-search` added six filters and a search

Eight parameters in total on this endpoint now. `?page=` and `?pageSize=` are unchanged.

| Parameter | Type | Default | Rules |
|---|---|---|---|
| `status` | repeated string | absent | `New` \| `Open` \| `InProgress` \| `PendingCustomer` \| `Resolved` \| `Closed`. **OR** within the key |
| `priority` | repeated string | absent | `Low` \| `Normal` \| `High` \| `Critical` |
| `category` | repeated string | absent | `Billing` \| `Technical` \| `Account` \| `General` |
| `channel` | repeated string | absent | `Email` \| `WhatsApp` \| `LiveChat` \| `Sms` \| `WebForm` |
| `assignee` | string | absent | `me` \| `unassigned` \| a user `Guid` |
| `escalated` | bool | absent | **Absent means "any". `false` means "not escalated"** |
| `search` | string | absent | Case-insensitive substring over `ticketNumber`, `subject`, and the **customer's** `fullName` |

**Filters AND across keys and OR within one key** — BR-7.3 and BR-7.4.

### The rules that are not obvious from the table

| Case | Answer | Why |
|---|---|---|
| `?status=` present and empty | **No filter** | Not `WHERE Status IN ()`, which returns nothing to a user who filtered nothing. `spec.md` Q-4. **This was a defect in the first implementation:** the parameter binds as an array holding one empty string, not as an empty array, and it answered `400`. A filter bar that clears its select sends exactly this |
| `?status=Open&status=Open` | Same as `?status=Open` | A duplicate value is a set, not a multiplier. Duplicates collapse before the clamp |
| `?status=open` | **Accepted** | Enum parsing is case-insensitive by ruling. Rejecting a case variant of a correct value is a worse failure than normalising it |
| `?status=Open&status=Bogus` | **`400`**, naming `status` and listing all six accepted values | One bad value invalidates the parameter. Silently dropping it answers a different question from the one asked, and the client cannot tell |
| `?status=3` | **`400`** | `Enum.TryParse<TicketStatus>("3")` returns `true` and yields `PendingCustomer`; `"99"` returns `true` for a value no member has. Enums travel as strings on this API, so a number is a client that guessed — and the alternative is `009`'s shape, where the request succeeds and means something the caller never asked for |
| More than **20** values in one repeated filter | **Clamped, not refused** | BR-7.2's clamp-never-reject. An unbounded repeated parameter is a denial of service from one URL and an `IN` list SQL Server has to plan. Same ruling `033` took for `?company=` on the same day |
| `?assignee=me` | Resolved from the **token**, server-side | A client cannot reach another user's queue by editing a URL |
| `?assignee=nobody` | **`400`** naming `assignee`, and the message names `me` and `unassigned` | Not a dropped filter, for the same reason as `status` |
| `?search=%` or `_` or `[` | The **character**, literally | EF Core 10 on SQL Server builds the pattern and escapes the term, emitting `LIKE @p ESCAPE N'\'`. **There is deliberately no hand-written escaper** — `008` measured that one would double-escape and make any subject containing a backslash unfindable |
| `?search=` whitespace only | **No filter** | A cleared search box is not a request for the tickets whose subject is a space |
| No rows match | `200` with `items: []` and the real `totalCount` | BR-7.6, unchanged from the frozen text |

### The `400` body

`errors/validation`, with the parameter as the key — `status`, `priority`, `category`, `channel`,
`assignee` — and a message that **lists every accepted value**. The list lives in the message
catalogue in `en` and `ar`, and `TicketFilterMessageTests` asserts each message names every member
of its enum, so an enum that gains a member cannot leave the message naming one fewer.

**The member names are Latin in the Arabic message.** BR-8 never localizes an enum value, and a
translated list would be unusable in a URL.

### What did NOT change

- The envelope, the row, the default order, the clamps, `401`, and `404`.
- **No `?sort=` or `?dir=`.** The order stays BR-7.1's `CreatedAtUtc DESC, Id DESC`. `033` adds
  sorting to **customers**; nothing has asked for it here.
- `GET /api/tickets/{id}` is untouched.

Evidence: [`015/tests.md`](../../015-ticket-filters-and-search/tests.md).
