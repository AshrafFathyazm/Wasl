# Contract — Customers (read)

**Feature:** `008-customer-list-and-profile` · **Story:** US-002 · **Status:** FROZEN 2026-08-23
· **Lanes:** backend implements · frontend consumes

The agreement. The backend implements exactly this; the frontend may start against it
immediately. Any change goes through **Contract changes** in
[`plan.md`](../plan.md) first — see `docs/sdd/openapi/README.md`.

The write side of this resource is [`007`'s contract](../../007-create-customer/contracts/customers-api.md)
and is not reopened here.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on every call
- **Content-Type:** `application/json`
- Timestamps are UTC, ISO 8601, `Z` suffix. Formatting for display is the client's job,
  in the client's locale
- Identifiers are `Guid` strings. Enums are strings on the wire
- Errors are RFC 7807 `ProblemDetails`. **`200` is never returned with an error in the
  body** (`docs/sdd/05-api-conventions.md`)
- Both endpoints are readable by `Agent` and `Manager` alike (BR-6), so **neither
  returns `403`**. Its absence from the tables below is the authorization matrix, not an
  omission

---

## `GET /api/customers/{id}`

Returns one customer's profile.

### Request

```http
GET {{baseUrl}}/api/customers/8f1c2d34-5678-4abc-9def-0123456789ab
Authorization: Bearer <JWT>
Accept-Language: ar
```

| Part | Type | Rules |
|---|---|---|
| `id` | `Guid` in the path | A value that is not a `Guid` is a `400`, **not** a `404`. See the note below |

There is **no route constraint** on `id`. `{id:guid}` would make an unparseable value
fail to match the route, which produces `404` — indistinguishable, from the client's
side, from a customer that does not exist. AC-3 requires the two to be distinguishable.

### `200 OK`

```json
{
  "id": "8f1c2d34-5678-4abc-9def-0123456789ab",
  "fullName": "علي الأحمد",
  "email": "ali@example.com",
  "phone": "+966501234567",
  "companyName": "شركة الرياض",
  "notes": "Prefers WhatsApp.",
  "createdAtUtc": "2026-08-23T12:00:00Z",
  "updatedAtUtc": "2026-08-23T12:00:00Z",
  "version": "AAAAAAAAB9E="
}
```

| Field | Type | Note |
|---|---|---|
| `id` | `string` (uuid) | |
| `fullName` | `string` | Verbatim as stored. Never translated (BR-8.10) |
| `email` | `string?` | Normalised form (lowercased, trimmed) — BR-4.2 |
| `phone` | `string?` | E.164. `null` when the customer has only an email |
| `companyName` | `string?` | |
| `notes` | `string?` | Up to 2000 characters, line breaks preserved |
| `createdAtUtc` | `string` (date-time) | |
| `updatedAtUtc` | `string` (date-time) | Equal to `createdAtUtc` until `017` ships an update path |
| `version` | `string` | Base64 `rowversion` (ADR-006 as amended by ADR-013). Returned here so `017` does not have to change the read shape later — US-002 AC-3 |

This shape is a **superset** of `007`'s `201` body: it adds `updatedAtUtc`. It is a
distinct type, `CustomerDetailResponse`, and not the same one reused.

`IsActive` is **not** in the response. Nothing sets it in release 1, and exposing a flag
whose only value is `true` invites a client to branch on it. It arrives with `017`.

### Failures

| Code | `type` | When |
|---|---|---|
| `400` | `errors/validation` | `id` is not a parseable `Guid`. `errors` names `id` (AC-3) |
| `401` | `errors/unauthenticated` | Missing or invalid token (AC-14) |
| `404` | `errors/not-found` | Well-formed `Guid`, no such customer (AC-2) |

#### `404` — not found

```json
{
  "type": "https://wasl.local/errors/not-found",
  "title": "The requested resource was not found.",
  "status": 404,
  "instance": "/api/customers/8f1c2d34-5678-4abc-9def-0123456789ab",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01"
}
```

No `errors` dictionary — there is no field at fault. `detail` is omitted rather than
carrying "customer 8f1c… does not exist", which adds nothing the `instance` does not
already say.

#### `400` — malformed identifier

```json
{
  "type": "https://wasl.local/errors/validation",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "detail": "See the errors property for field-level messages.",
  "instance": "/api/customers/not-a-guid",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01",
  "errors": {
    "id": ["'id' must be a valid identifier."]
  }
}
```

It is the **same** `type` as a body-validation failure, on purpose: from the client's
point of view, both are "the request was malformed", and a second type would only make
the error branch wider without making it more useful.

---

## `GET /api/customers`

Paginated list, optionally filtered by a free-text search.

### Request

```http
GET {{baseUrl}}/api/customers?page=1&pageSize=20&search=ali
Authorization: Bearer <JWT>
```

| Parameter | Type | Default | Rules |
|---|---|---|---|
| `page` | `int` | `1` | 1-based. `0` or negative is **clamped** to 1, never rejected (AC-6) |
| `pageSize` | `int` | `20` | Above 100 is clamped to 100; `0` is clamped to the default of 20. Never rejected (BR-7.2, AC-5) |
| `search` | `string?` | absent | Case-insensitive substring over `fullName`, `email`, and `phone`. Trimmed; a whitespace-only value is treated as absent (AC-7) |

Clamping rather than rejecting is BR-7.2 as written. A client sending `pageSize=500`
gets 100 rows and a `200` — it does not get a `400` to handle.

`includeInactive` does **not** exist. Deactivation arrives with `017`; a parameter frozen
into a contract before anything can exercise it is a promise nobody has tested.

### `200 OK`

```json
{
  "items": [
    {
      "id": "8f1c2d34-5678-4abc-9def-0123456789ab",
      "fullName": "علي الأحمد",
      "email": "ali@example.com",
      "phone": "+966501234567",
      "companyName": "شركة الرياض",
      "createdAtUtc": "2026-08-23T12:00:00Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "totalCount": 137,
  "totalPages": 7
}
```

The envelope is the shared one from `docs/sdd/05-api-conventions.md`, and `010` and `015`
reuse it unchanged.

| Field | Type | Note |
|---|---|---|
| `items` | `CustomerListItem[]` | Empty array when nothing matches — never `null` (BR-7.6, AC-9) |
| `page` | `int` | The **effective** page after clamping, not what was sent |
| `pageSize` | `int` | The **effective** page size after clamping |
| `totalCount` | `int` | Rows matching the filter, ignoring paging |
| `totalPages` | `int` | `ceil(totalCount / pageSize)`. `0` when `totalCount` is `0` |

`CustomerListItem` deliberately omits two fields the detail response has:

| Omitted | Why |
|---|---|
| `notes` | Up to 2000 characters × 20 rows of payload that no column renders |
| `version` | Nothing on a list mutates. A concurrency token on a read-only row invites a client to hold a stale one |

**Order:** `fullName` ascending, then `id` ascending. The `id` tiebreaker is not
decoration — names are not unique (BR-4.6), and `OFFSET`/`FETCH` over a non-total order
can return the same row on two pages or skip it entirely (AC-15).

### Failures

| Code | `type` | When |
|---|---|---|
| `400` | `errors/validation` | `page` or `pageSize` is not an integer; `search` exceeds 200 characters |
| `401` | `errors/unauthenticated` | Missing or invalid token (AC-14) |

An out-of-range **value** is clamped; a non-integer is a `400`, because there is nothing
to clamp. `search=%` is not an error: `%` is matched as literal text (AC-8).

### What stays identical in every locale

`title`, `detail`, and the messages inside `errors` are translated (BR-8.6). These are
**not** (BR-8.7):

| Part | Reason |
|---|---|
| `type` | The identifier the client branches on |
| The **keys** of `errors` | They are request field names, part of this contract |
| `traceId` | An identifier |
| Every field name in the envelope and in the items | Contract, not copy |
| `fullName`, `companyName`, `notes` values | User content, returned verbatim (BR-8.10) |

`Content-Language` on the response names the locale that was actually applied, so a
client can tell that its request for `fr` produced English (BR-8.3).

---

## Behaviour worth knowing before you build against it

| Situation | What happens | Why |
|---|---|---|
| `GET /api/customers/not-a-guid` | `400` `errors/validation` naming `id` | AC-3. With a `{id:guid}` route constraint this would be a `404`, and with unconstrained minimal-API binding alone it would be a `400` with an **empty body** — a client branching on `type` would read `undefined`. The mapping lives in the shared middleware |
| `search=100%` | Matches the literal text `100%` | The term's `LIKE` metacharacters are escaped server-side (AC-8) |
| `search=[a-z]` | Matches the literal text `[a-z]` | `[` is a `LIKE` metacharacter **on SQL Server** and is not one on PostgreSQL. It is the character AC-8's original list did not name |
| `search=احمد`, record stored as `أحمد` | **No match** | Stated limitation. Arabic hamza/alef/ta-marbuta normalisation is `docs/sdd/11-open-questions.md` Q-7, deferred with the fix written down. And for a customer with a phone and no email, BR-4 will not catch the resulting duplicate either — the prevention and the guarantee miss the same row |
| `search=ALI` where the stored email is `ali@example.com` | Matches | Case-insensitivity is applied by an **explicit** `COLLATE` in the query, not inherited from the server's default collation (AC-16). The behaviour is identical on a case-sensitive server, which is the point |
| `page=9999` on 137 rows | `200`, `items: []`, `totalCount: 137` | An empty page is a valid answer (AC-10). The client offers a way back to page 1 |
| `pageSize=500` | `200` with 100 items and `pageSize: 100` | Clamped, not rejected (BR-7.2). Read the **returned** `pageSize`, not the one you sent |
| Nothing matches | `200`, `items: []`, `totalCount: 0`, `totalPages: 0` | Never `404` (BR-7.6, AC-9) |
| Two customers share a name | Both appear, in a stable order, exactly once across a full traversal | AC-15 |
| The customer is inactive | The **detail** endpoint returns it; the **list** excludes it | Q-1 and Q-3. Nothing can be inactive until `017`, so the difference is currently unobservable — it is fixed now so it cannot change results later |
| Either endpoint is called successfully | **No audit row is written** | BR-9.1 covers state changes. A customer read is not `Audit.Read`, which is reading the audit log itself (BR-9.11) |
| A call without a token | `401`, and **one** audit row (`Auth.Unauthenticated`) written outside any transaction | BR-9.2, BR-9.4 |
| The `Tickets` count shown on the list screen | Not in this contract | `dbo.Tickets` does not exist until `009`. The column arrives with `018` |
| A list request | Costs exactly **two** database commands: the page and the count | AC-11. A test asserting "one command" would fail correct code — the count is deliberately a second query (`05-api-conventions.md`) |

## Verification

| What | How |
|---|---|
| Every status code above | `TEST-008-02` … `TEST-008-07`, `TEST-008-11` |
| The malformed id is a `400` with a `type` and a body | `TEST-008-03` |
| Pattern characters are literal, including `[` | `TEST-008-06` |
| Case-insensitivity is explicit, not collation-dependent | `TEST-008-10` |
| Paging is stable over duplicate names | `TEST-008-09` |
| One list request, two commands | `TEST-008-08` |
| A read writes no audit row; the `401` writes one | `TEST-008-12`, `TEST-008-11` |
| Arabic content round-trips byte-identical, and Q-7's limitation is pinned | `TEST-008-13` |
| Arabic `type` and `errors` keys byte-identical to English | Covered by `005-localization-core`, re-asserted here |
| This contract matches what was built | Generated OpenAPI compared before the feature closes — `REV-008-03` |
