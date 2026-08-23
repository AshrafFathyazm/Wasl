# Contract — Customers (create)

**Feature:** `007-create-customer` · **Story:** US-001 · **Status:** FROZEN 2026-08-23
· **Lanes:** backend implements · frontend consumes

The agreement. The backend implements exactly this; the frontend may start against it
immediately. Any change goes through **Contract changes** in
[`plan.md`](../plan.md) first — see `docs/sdd/openapi/README.md`.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on every call
- **Content-Type:** `application/json`
- Timestamps are UTC, ISO 8601, `Z` suffix. Formatting for display is the client's job,
  in the client's locale
- Identifiers are `Guid` strings. Enums are strings on the wire
- Errors are RFC 7807 `ProblemDetails`. **`200` is never returned with an error in the
  body** (`docs/sdd/05-api-conventions.md`)

---

## `POST /api/customers`

Creates a customer. Requires a name and at least one contact method (BR-4.1).

### Request

```json
{
  "fullName": "علي الأحمد",
  "email": "  Ali@Example.COM  ",
  "phone": "+966 50 123 4567",
  "companyName": null,
  "notes": null
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `fullName` | `string(1..200)` | **yes** | Not whitespace-only (AC-2) |
| `email` | `string(..320)?` | one of the two | Trimmed and lowercased by the server before comparison and storage (BR-4.2). Syntactically validated (AC-5) |
| `phone` | `string(..20)?` | one of the two | Normalised to E.164 by the server (BR-4.3). Unparseable input is `400`, never `409` (AC-7) |
| `companyName` | `string(..200)?` | no | A label on the person, not a relationship (spec A-1) |
| `notes` | `string(..2000)?` | no | Free text, stored verbatim |

`email` and `phone` are each optional; **at least one must be present** (AC-3). Sending
neither names *both* fields in the error.

### `201 Created`

`Location: /api/customers/{id}` — and a `GET` on it returns the same resource (AC-14).

```json
{
  "id": "8f1c2d34-5678-4abc-9def-0123456789ab",
  "fullName": "علي الأحمد",
  "email": "ali@example.com",
  "phone": "+966501234567",
  "companyName": null,
  "notes": null,
  "createdAtUtc": "2026-08-23T12:00:00Z",
  "version": "AAAAAAAAB9E="
}
```

Note that `email` and `phone` come back **normalised**, not as sent. The client should
render what the server returned rather than what the user typed.

`version` is the base64 `rowversion` (ADR-006 as amended by ADR-013). It is returned
even though this endpoint does not consume it, so `017-update-customer` does not have to
change the read shape later.

### Failures

| Code | `type` | When |
|---|---|---|
| `400` | `errors/validation` | Missing or whitespace `fullName`; neither contact method; invalid email; unparseable phone; any field over its maximum |
| `401` | `errors/unauthenticated` | Missing or invalid token (AC-15) |
| `409` | `errors/duplicate-customer` | The normalised email or phone matches an existing **active** customer (BR-4.4, BR-4.5) |

#### `400` — validation

```json
{
  "type": "https://wasl.local/errors/validation",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "detail": "See the errors property for field-level messages.",
  "instance": "/api/customers",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01",
  "errors": {
    "email": ["Provide either an email address or a phone number."],
    "phone": ["Provide either an email address or a phone number."]
  }
}
```

#### `409` — duplicate

```json
{
  "type": "https://wasl.local/errors/duplicate-customer",
  "title": "A customer with this email already exists.",
  "status": 409,
  "instance": "/api/customers",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01",
  "errors": {
    "email": ["A customer with this email already exists."]
  }
}
```

**The `409` body carries no detail about the existing customer** — not its id, not its
name (BR-4.7, AC-12). Returning the id would leak a record the caller may not have been
entitled to look up; the search in `008` is the intended way to find it.

When **both** email and phone duplicate an existing record, the response names `email`
and stops. One conflict is enough to act on.

### What stays identical in every locale

`title` and the messages inside `errors` are translated (BR-8.6). These are **not**
(BR-8.7):

| Part | Reason |
|---|---|
| `type` | The identifier the client branches on |
| The **keys** of `errors` | They are request field names, part of this contract |
| `traceId` | An identifier |

A client that branches on `type` works in Arabic. One that branches on `title` was
already broken. Send `Accept-Language: ar` to see the difference; `Content-Language` on
the response names the locale that was actually applied.

---

## Behaviour worth knowing before you build against it

| Situation | What happens | Why |
|---|---|---|
| The same email is sent twice, concurrently | One `201`, one `409` | A filtered unique index is the guarantee; the application check produces the friendly message (BR-4.8, AC-13) |
| The email matches an **inactive** customer | `201` — created | The rule applies between active customers (BR-4.4). A known limitation: reactivation is not designed |
| Two customers share a `fullName` | Both created | Name is deliberately not part of the duplicate rule (BR-4.6) |
| `"  Ali@Example.COM  "` is sent | Stored and returned as `ali@example.com` | BR-4.2. It also collides with a stored `ali@example.com` (AC-9) |
| The form is double-submitted | The client must send one request | AC-17 is a client obligation, not a server one. This endpoint is not idempotent |
| An unknown field is in the body | Ignored | Not an error; the DTO binds what it declares |

## Verification

| What | How |
|---|---|
| Every status code above | `TEST-007-03` … `TEST-007-09` |
| The `409` body carries nothing extra | `TEST-007-07` |
| Concurrency: one `201`, one `409` | `TEST-007-08` |
| Arabic `type` and `errors` keys byte-identical to English | Covered by `005-localization-core`, re-asserted here |
| This contract matches what was built | Generated OpenAPI compared before the feature closes |
