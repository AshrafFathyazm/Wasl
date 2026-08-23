# API Conventions

One shape, applied everywhere. Every deviation must be justified in a review artifact.

## Base

- Base path: `/api`
- Media type: `application/json`
- All timestamps are UTC, ISO 8601, with a `Z` suffix. Formatting for display is the
  client's responsibility, in the client's locale.
- Locale is negotiated per request; see **Localization** below.
- All identifiers in payloads are `Guid` strings; `TicketNumber` is the human-facing identifier.
- Enums are serialised as strings.

## Status codes

| Code | Used when |
|---|---|
| `200 OK` | Successful read, or a successful update that returns the resource |
| `201 Created` | Resource created; `Location` header points at the new resource |
| `204 No Content` | Successful action with nothing meaningful to return |
| `400 Bad Request` | Malformed request or failed input validation |
| `401 Unauthorized` | Missing or invalid token |
| `403 Forbidden` | Authenticated but not permitted (see BR-6) |
| `404 Not Found` | The addressed resource does not exist |
| `409 Conflict` | The request is valid but conflicts with current state: duplicate customer, forbidden status transition, stale version, already escalated |
| `500 Internal Server Error` | Unhandled fault; body carries a trace id and nothing else |

`200` is never returned with an error in the body.

## Error contract

Every non-2xx response is RFC 7807 `ProblemDetails`:

```json
{
  "type": "https://wasl.local/errors/validation",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "detail": "See the errors property for field-level messages.",
  "instance": "/api/customers",
  "traceId": "00-8f1c2d...-01",
  "errors": {
    "email": ["'email' is not a valid email address."],
    "fullName": ["'fullName' must not be empty."]
  }
}
```

- `errors` is present only for `400` validation failures.
- `traceId` is always present and matches the server log entry.
- `detail` never contains a stack trace, SQL, exception type name, or connection string.
- A `409` uses a specific `type` so the client can distinguish causes:
  `errors/duplicate-customer`, `errors/invalid-status-transition`,
  `errors/concurrency-conflict`, `errors/already-escalated`.

Produced by a single exception-handling middleware. Controllers do not build error
responses by hand.

## Pagination

Request:

```text
GET /api/tickets?page=1&pageSize=20&status=Open&status=InProgress&sort=-createdAt
```

Response:

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "totalCount": 137,
  "totalPages": 7
}
```

- `page` is 1-based. `page=0` or negative is clamped to 1.
- `pageSize` above 100 is clamped to 100 (BR-7.2).
- `totalCount` is a second query; it is included because the UI shows a count. If it
  ever becomes a measured bottleneck, the trade-off is recorded in an ADR before it
  is removed.

## Concurrency

Endpoints that mutate a ticket or a customer accept the current version:

```json
{ "status": "InProgress", "expectedVersion": "AAAAAAAAB9E=" }
```

A mismatch returns `409` with `type: errors/concurrency-conflict`. The client is
expected to refetch and show the user what changed rather than retrying blindly.
See `decisions/ADR-006-concurrency.md`.

## Localization

The server localizes the strings it authors and nothing else.

**Request:**

```http
GET /api/tickets
Accept-Language: ar
```

Resolution order per BR-8.4: `?culture=` → the user's stored `PreferredLanguage` →
`Accept-Language` → `en`. An unsupported value falls back to `en` with a `200`, never
a `400`.

**Response:** every response carries `Content-Language` naming the locale that was
actually applied, so a client can tell that its request for `fr` produced English.

**Localized:** `ProblemDetails.title`, `ProblemDetails.detail`, and every message
inside the `errors` dictionary.

**Not localized, ever:**

| Part | Reason |
|---|---|
| `ProblemDetails.type` | A machine-readable identifier the client branches on |
| Keys of `errors` | They map to request field names, which are part of the contract |
| Enum values | `InProgress` is an identifier; only its label is translated |
| `TicketNumber` | Quoted aloud and pasted between systems |
| `traceId` | An identifier |

The same error in Arabic:

```json
{
  "type": "https://wasl.local/errors/duplicate-customer",
  "title": "<Arabic title from the ar catalogue>",
  "status": 409,
  "instance": "/api/customers",
  "traceId": "00-8f1c2d...-01",
  "errors": { "email": ["<Arabic message>"] }
}
```

`type` and the `email` key are byte-identical to the English response. Only the human
sentences changed. A client that branches on `type` keeps working in every locale;
one that branches on `title` was already broken.

## Idempotency

`POST /api/customers` and `POST /api/tickets` are not idempotent, but the customer
duplicate rule (BR-4) makes an accidental double-submit of a customer safe: the
second call returns `409` rather than creating a twin. Double-submitted tickets are
accepted; deduplicating them would require guessing intent.

## Endpoint inventory

| Method | Path | Story |
|---|---|---|
| `POST` | `/api/customers` | US-001 |
| `GET` | `/api/customers/{id}` | US-002 |
| `GET` | `/api/customers` | US-002 |
| `PUT` | `/api/customers/{id}` | US-003 |
| `GET` | `/api/customers/{id}/overview` | US-004 |
| `POST` | `/api/tickets` | US-005 |
| `GET` | `/api/tickets` | US-006 |
| `GET` | `/api/tickets/{id}` | US-006 |
| `PUT` | `/api/tickets/{id}/assignee` | US-007 |
| `PUT` | `/api/tickets/{id}/status` | US-008 |
| `POST` | `/api/tickets/{id}/escalate` | US-009 |
| `POST` | `/api/tickets/{id}/comments` | US-010 |
| `GET` | `/api/tickets/{id}/timeline` | US-010 |
| `GET` | `/api/support-users` | US-007 |
| `PUT` | `/api/me/language` | US-014 |
| `GET` | `/api/audit` | US-015 |
| `GET` | `/api/dashboard` | US-016 |
| `POST` | `/api/auth/token` | Auth |
| `GET` | `/health` | Infrastructure |

Sub-resource `PUT` (`/status`, `/assignee`) is used instead of `PATCH` on the ticket
because each is a distinct business action with its own rules and its own history
entry. A generic patch would make the state machine unenforceable.
