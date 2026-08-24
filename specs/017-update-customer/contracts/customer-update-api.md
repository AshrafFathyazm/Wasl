# Contract — Customer (update)

**Feature:** `017-update-customer` · **Story:** US-003 · **Status:** FROZEN 2026-08-23
· **Lanes:** backend implements · frontend consumes

The agreement. The backend implements exactly this; the frontend may start against it
immediately. Any change goes through **Contract changes** in [`plan.md`](../plan.md)
first — see `docs/sdd/openapi/README.md`.

This contract adds one endpoint and changes no existing shape. The response body is
`007`'s `CustomerResponse`, unchanged, including `version` — which `007` returned
deliberately so this feature would not have to move the read shape.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on every call
- **Content-Type:** `application/json`
- Timestamps are UTC, ISO 8601, `Z` suffix. Formatting for display is the client's job,
  in the client's locale
- Identifiers are `Guid` strings. Enums are strings on the wire
- Errors are RFC 7807 `ProblemDetails`. **`200` is never returned with an error in the
  body** (`docs/sdd/05-api-conventions.md`)
- `version` and `expectedVersion` are the base64 form of the SQL Server `rowversion`
  (ADR-006 as amended by ADR-013). They are **opaque**: the client stores and echoes the
  string and never parses, compares, orders, or constructs one

---

## `PUT /api/customers/{id}`

Replaces the mutable fields of a customer. Requires the version the client read
(ADR-006). Permitted for both `Agent` and `Manager` (BR-6).

### Request

```http
PUT /api/customers/8f1c2d34-5678-4abc-9def-0123456789ab
Authorization: Bearer <JWT>
Accept-Language: ar
Content-Type: application/json
```

```json
{
  "fullName": "علي الأحمد",
  "email": "  Ali@Example.COM  ",
  "phone": "+966 50 123 4567",
  "companyName": "Riyadh Holdings Group",
  "notes": null,
  "expectedVersion": "AAAAAAAAB9E="
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `fullName` | `string(1..200)` | **yes** | Not whitespace-only (AC-11) |
| `email` | `string(..320)?` | one of the two | Trimmed and lowercased by the server before comparison and storage (BR-4.2). Syntactically validated |
| `phone` | `string(..20)?` | one of the two | Normalised to E.164 by the server (BR-4.3). Unparseable input is `400`, never `409` (AC-10) |
| `companyName` | `string(..200)?` | no | A label on the person, not a relationship |
| `notes` | `string(..2000)?` | no | Free text, stored verbatim |
| `expectedVersion` | `string` | **yes** | The base64 `version` the client read. Missing → `400`; malformed → `400`; stale → `409` (AC-13, AC-14, AC-4) |

`email` and `phone` are each optional; **at least one must be present after the update**
(AC-3). Submitting neither names *both* fields in the error.

> **`PUT` replaces; it does not merge.** An omitted or `null` optional field is
> **cleared**. Sending `{ fullName, email, expectedVersion }` alone sets `phone`,
> `companyName`, and `notes` to `null` (AC-12). This is the only failure on this endpoint
> that produces no error at all: the request succeeds, returns `200`, and four fields are
> gone. **Always send the full field set.** `PATCH` is deliberately not offered — see
> `plan.md`, Risks and trade-offs.

### `200 OK`

The full resource, with a **new** `version`. That new value is immediately usable as
`expectedVersion` on the next `PUT` from the same screen (AC-23).

```json
{
  "id": "8f1c2d34-5678-4abc-9def-0123456789ab",
  "fullName": "علي الأحمد",
  "email": "ali@example.com",
  "phone": "+966501234567",
  "companyName": "Riyadh Holdings Group",
  "notes": null,
  "createdAtUtc": "2026-08-20T09:14:00Z",
  "updatedAtUtc": "2026-08-23T12:00:00Z",
  "version": "AAAAAAAAB+E="
}
```

`email` and `phone` come back **normalised**, not as sent (BR-4.2, BR-4.3). Render what
the server returned, not what the user typed.

There is no `204` variant. The client needs the new `version`, and a `204` would force a
refetch after every save.

### Failures

| Code | `type` | When |
|---|---|---|
| `400` | `errors/validation` | Missing or whitespace `fullName`; neither contact method after the update; invalid email; unparseable phone; any field over its maximum; missing `expectedVersion`; `expectedVersion` not valid base64 or the wrong length; malformed `id` in the route |
| `401` | `errors/unauthenticated` | Missing, expired, or tampered token (AC-20) |
| `404` | `errors/not-found` | A well-formed `Guid` that is not a customer (AC-5) |
| `409` | `errors/duplicate-customer` | The normalised email or phone matches a **different** active customer (BR-4.4, BR-4.5) |
| `409` | `errors/concurrency-conflict` | `expectedVersion` does not match the row's current version (ADR-006, AC-4) |

**Two different `409`s on one endpoint.** They need opposite actions from the user, so
branch on `type`, never on the status code:

| `type` | What the user must do |
|---|---|
| `errors/duplicate-customer` | Change the email or phone they entered |
| `errors/concurrency-conflict` | Reload and look at what someone else changed |

#### `400` — validation

```json
{
  "type": "https://wasl.local/errors/validation",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "detail": "See the errors property for field-level messages.",
  "instance": "/api/customers/8f1c2d34-5678-4abc-9def-0123456789ab",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01",
  "errors": {
    "email": ["Provide either an email address or a phone number."],
    "phone": ["Provide either an email address or a phone number."]
  }
}
```

A missing or malformed `expectedVersion` appears here, under the key `expectedVersion`.
It is **not** a `409`: the client sent something the server cannot interpret, which is a
different fault from sending something that no longer matches.

#### `404` — not found

```json
{
  "type": "https://wasl.local/errors/not-found",
  "title": "The requested customer was not found.",
  "status": 404,
  "instance": "/api/customers/8f1c2d34-5678-4abc-9def-0123456789ab",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01"
}
```

No `errors` dictionary. `errors` is for field-level validation.

#### `409` — duplicate customer

```json
{
  "type": "https://wasl.local/errors/duplicate-customer",
  "title": "A customer with this email already exists.",
  "status": 409,
  "instance": "/api/customers/8f1c2d34-5678-4abc-9def-0123456789ab",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01",
  "errors": {
    "email": ["A customer with this email already exists."]
  }
}
```

The body carries no detail about the conflicting customer — not its id, not its name
(BR-4.7). The customer search in `008` is the intended way to find it.

**Submitting the customer's own current email or phone is not a conflict** (AC-7). The
duplicate check excludes the row being updated. A client is expected to be able to save a
record it did not change.

#### `409` — concurrency conflict

```json
{
  "type": "https://wasl.local/errors/concurrency-conflict",
  "title": "This customer was changed by someone else while you were editing it.",
  "status": 409,
  "detail": "Reload the customer to see the current values, then apply your change again.",
  "instance": "/api/customers/8f1c2d34-5678-4abc-9def-0123456789ab",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01"
}
```

**The body carries no customer data and no current version** (AC-22). That is deliberate:

- `ProblemDetails` has no defined place for a resource, so it would have to be smuggled
  into an extension member
- A body carrying the fresh state invites the client to merge silently, which is the
  behaviour ADR-006 rejected by name

The client refetches through `GET /api/customers/{id}` (`008`) and shows the user the
current record. One extra round trip on an uncommon path.

**Nothing was written.** A `409` is not a partial update: the `UPDATE` carried the version
in its `WHERE` clause and matched zero rows, and no audit row was written either (AC-18).

### What stays identical in every locale

`title`, `detail`, and the messages inside `errors` are translated (BR-8.6). These are
**not** (BR-8.7):

| Part | Reason |
|---|---|
| `type` | The identifier the client branches on — and here it is the *only* thing separating two different `409`s |
| The **keys** of `errors` | They are request field names, part of this contract |
| `version` / `expectedVersion` | An opaque token |
| `traceId` | An identifier |

A client that branches on `type` works in Arabic. One that branches on `title` was
already broken — and on this endpoint it cannot even tell the two `409`s apart. Send
`Accept-Language: ar` to see the difference; `Content-Language` on the response names the
locale that was actually applied.

---

## Behaviour worth knowing before you build against it

| Situation | What happens | Why |
|---|---|---|
| An optional field is omitted from the body | It is **cleared** | `PUT` replaces the mutable set (AC-12). The request succeeds, so nothing tells you — send all five fields |
| The submitted email equals the customer's own stored email | `200` | The duplicate query excludes the row being updated (AC-7). The naive BR-4.4 implementation makes every save of an unchanged email fail |
| The email differs from its own stored value only in case or whitespace | `200`, and the audit `Changes` is **empty** | BR-4.2 normalises both sides to the same value, so nothing changed (AC-9, AC-19) |
| Nothing at all changed | `200`, and an audit row is still written with an empty `Changes` | The attempt is a fact worth recording (BR-9.8). `304` was rejected — see `spec.md` Q-3 |
| Two `PUT`s with the same `expectedVersion` | One `200`, one `409 concurrency-conflict` | SQL Server compares the `rowversion` in the `WHERE` clause; the second matches zero rows (AC-15) |
| The version is stale **and** the new email duplicates another customer | `409 concurrency-conflict` | The version is checked by the `UPDATE` itself, so it is decided first. Reload, then the duplicate surfaces on the next attempt |
| `expectedVersion` is a valid token belonging to a **different** customer | `409 concurrency-conflict` | It is well-formed and does not match this row. The server does not know where the client got it, and should not guess |
| `expectedVersion` is valid base64 of the wrong length | `400` naming `expectedVersion` | Malformed input, not a conflict (AC-14). A `409` here would send the client into a reload loop over a bug in its own code |
| Two agents change **different** fields concurrently | The second gets `409` | Field-level merge is out of scope. ADR-006 chose the detectable failure over the silent one |
| The `200` is received and the client keeps the version it sent | The **next** save gets `409` | The response carries a new `version` and it must be stored (AC-23). This is invisible in single-user testing and is the most likely defect in a client built against this endpoint |
| The email matches an **inactive** customer | `200` | The rule is between active customers (BR-4.4). Unreachable today: no code path deactivates a customer |
| An unknown field is in the body | Ignored | Not an error; the DTO binds what it declares |
| An `Agent` calls it | `200` | Both roles may update a customer (BR-6). **There is no `403` on this endpoint** — do not build a forbidden state for it |
| A successful update | Exactly one `Customer.Updated` audit row, in the same transaction, listing only the fields that changed | BR-9.1, BR-9.3, BR-9.8. There is no customer field-history table; this row is the record of who changed a phone number (ADR-008) |

## Verification

| What | How |
|---|---|
| Every status code above | `TEST-017-02` … `TEST-017-13` |
| Two `PUT`s on one version give one `200` and one `409` | `TEST-017-04`, against `Testcontainers.MsSql` — EF `InMemory` does not enforce a concurrency token |
| The customer's own email is not a self-conflict | `TEST-017-05` |
| The returned `version` works immediately as the next `expectedVersion` | `TEST-017-03`, and `TEST-017-17` on the client |
| Neither `409` leaks another customer's data | `TEST-017-14` |
| One audit row on success, none after a rollback | `TEST-017-11` |
| Arabic `type` and `errors` keys byte-identical to English | `BE-017-12`, on top of `005-localization-core` |
| Both `409` types documented, not just one | `REV-017-04`, comparing the generated OpenAPI against this file |
| This contract matches what was built | Generated OpenAPI compared before the feature closes |
