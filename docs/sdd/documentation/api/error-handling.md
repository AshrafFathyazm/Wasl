# Error Handling

## One shape

Every non-2xx response is RFC 7807 `ProblemDetails`, produced by a single
exception-handling middleware. Controllers never construct an error response by hand,
so there is one place to change the shape and one place for it to be wrong.

```json
{
  "type": "https://wasl.local/errors/invalid-status-transition",
  "title": "The requested status transition is not permitted.",
  "status": 409,
  "detail": "A ticket in status 'New' cannot move to 'InProgress'. Permitted: Open, Closed.",
  "instance": "/api/tickets/8f1c.../status",
  "traceId": "00-4bf92f...-01"
}
```

## Validation errors

`400` responses add an `errors` object keyed by field:

```json
{
  "type": "https://wasl.local/errors/validation",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "traceId": "00-4bf92f...-01",
  "errors": {
    "fullName": ["'fullName' must not be empty."],
    "email": ["'email' is not a valid email address."]
  }
}
```

Field names match the request payload exactly, so the client can attach each message
to its input without mapping.

## Error types

| `type` suffix | Status | Meaning |
|---|---|---|
| `errors/validation` | 400 | Input failed validation; see `errors` |
| `errors/malformed-request` | 400 | The body could not be parsed |
| `errors/unauthenticated` | 401 | Missing, expired, or invalid token |
| `errors/forbidden` | 403 | Authenticated but not permitted (BR-6) |
| `errors/not-found` | 404 | The addressed resource does not exist |
| `errors/duplicate-customer` | 409 | Email or phone already in use (BR-4) |
| `errors/invalid-status-transition` | 409 | Not permitted by the BR-1 matrix |
| `errors/already-escalated` | 409 | The ticket is already escalated (BR-3.4) |
| `errors/ticket-closed` | 409 | The ticket is closed and terminal (BR-1.5) |
| `errors/concurrency-conflict` | 409 | `expectedVersion` is stale (ADR-006) |
| `errors/internal` | 500 | Unhandled fault; body carries only a `traceId` |

Distinct types exist so the client can react differently: a duplicate needs a field
message, a concurrency conflict needs a reload, an invalid transition needs a refresh
of the available actions.

## What is never in an error response

- Stack traces
- Exception type names
- SQL, table names, or column names
- File paths
- Connection strings or configuration values
- Any hint about internal structure

A `500` returns a title, a status, and a `traceId`. Everything else goes to the log.

## Language

`title`, `detail`, and the messages inside `errors` are returned in the caller's
locale, resolved per BR-8.4. `Content-Language` on the response names the locale that
was actually applied, so a client can tell that its request for an unsupported
language produced English.

Everything a machine reads is identical in every locale: `type`, the keys of `errors`,
`status`, and `traceId`. A client that branches on `type` works in every language; one
that branches on `title` was already broken.

## `traceId`

Present on every error and matching the correlation id in the server log. A user can
report the `traceId` and it can be found in the logs without guessing, which is the
entire reason the client is given so little else.

## Client guidance

| Status | What the client should do |
|---|---|
| `400` | Show field-level messages from `errors`; do not retry |
| `401` | Redirect to login |
| `403` | Explain that the action is not permitted for this role; do not retry |
| `404` | Show a not-found state; the resource may have been removed |
| `409` | Depends on `type`: duplicate → field message; concurrency → refetch and show what changed; invalid transition → refresh the ticket and its `allowedTransitions` |
| `500` | Generic message plus the `traceId`; offer retry once |

The client never retries a `409` automatically. Every `409` means the server state is
not what the client believed, and retrying without a human looking is guessing at
intent.
