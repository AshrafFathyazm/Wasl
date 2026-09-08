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

**Every row in `ProblemTypes`, and the list is checked against it.** This table had eleven
rows against the registry's eighteen until `016` added its own and went looking for what
else was missing — the same drift `036` found in `05-api-conventions.md`'s status table, in
the same shape: a "second, independent statement" that had quietly become one statement
plus a stale copy. `ProblemRegistryTests` now parses this table and compares the suffixes
both ways, so a registry row with no row here fails the build, and so does the reverse.

| `type` suffix | Status | Meaning | Added by |
|---|---|---|---|
| `errors/validation` | 400 | Input failed validation; see `errors` | `002` |
| `errors/malformed-request` | 400 | The body could not be parsed. **No `errors` object** — no field is identifiable in a body that would not parse | `002b` |
| `errors/unauthenticated` | 401 | Missing, expired, or invalid token. **No `detail`** — the three causes must read alike | `004` |
| `errors/forbidden` | 403 | Authenticated but not permitted (BR-6) | `004` |
| `errors/not-found` | 404 | The addressed resource does not exist | `002b` |
| `errors/assignee-not-found` | 404 | The assignee id is unknown — the **picker** is stale, not the ticket | `011` |
| `errors/method-not-allowed` | 405 | The route exists, the verb does not | `002b` |
| `errors/unsupported-media-type` | 415 | Not `application/json` | `002b` |
| `errors/duplicate-customer` | 409 | Email or phone already in use (BR-4). Names the field and **nothing else** | `007` |
| `errors/invalid-status-transition` | 409 | Not permitted by the BR-1 matrix | `002` |
| `errors/same-status-transition` | 409 | The ticket is already in the requested status — refetch quietly | `012` |
| `errors/assignee-required` | 409 | Target is `InProgress` and the ticket has no assignee (BR-1.3) | `012` |
| `errors/ticket-closed` | 409 | The ticket is closed and terminal (BR-1.5) | `002` |
| `errors/already-escalated` | 409 | The ticket is already escalated (BR-3.4) | `002` |
| `errors/ticket-not-escalatable` | 409 | The ticket is `Resolved` or `Closed` (BR-3.3). **Its own type rather than `ticket-closed`**, because BR-3.3 refuses `Resolved` too and a manager told "this ticket is closed" about a resolved one goes looking for the wrong thing | **`016`** |
| `errors/assignee-unchanged` | 409 | The ticket already has that assignee — a double-click on the picker | `011` |
| `errors/tag-unchanged` | 409 | The tag is already attached, or already absent | `034` |
| `errors/no-contact-for-channel` | 409 | The ticket's customer has no address for the requested channel — for example `Sms` to a customer with only an email, which BR-4.1 allows. **Carries `errors.channel`**, because the remedy is to change the channel; it never names the addresses the customer *does* have (NFR-4) | **`021`** |
| `errors/concurrency-conflict` | 409 | `expectedVersion` is stale (ADR-006) | `002` |
| `errors/idempotency-conflict` | 409 | The same `Idempotency-Key` arrived with a **different** body | `036` |
| `errors/rate-limited` | 429 | Too many attempts. Carries `Retry-After` | `004b` |
| `errors/internal` | 500 | Unhandled fault; body carries only a `traceId` | `002` |
| `errors/transient-conflict` | 503 | A deadlock or serialization failure. Carries `Retry-After`, and it is **the only failure here a client should retry** | `036` |

Distinct types exist so the client can react differently: a duplicate needs a field
message, a concurrency conflict needs a reload, an invalid transition needs a refresh
of the available actions.

**Clients branch on the last path segment, never on the full URI** (`002` AC-25). That is
what makes `ProblemTypes.TypeBase` safe to change, and it is why a client meeting an
unfamiliar `409` should treat it as "refetch and look again" rather than as an unknown
error — every conflict here is a fact about the request's relationship to something else,
and reloading is true for all of them.

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
