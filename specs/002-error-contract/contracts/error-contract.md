# Contract — The Error Envelope

**Feature:** `002-error-contract` · **Status:** FROZEN 2026-08-23 ·
**Lanes:** backend implements · frontend consumes · **every later feature inherits**

This is not an endpoint contract. It is the **shape contract** that every other feature's
contract inherits, so that a feature contract says

> Errors are RFC 7807 `ProblemDetails` per
> [`specs/002-error-contract/contracts/error-contract.md`](.)

and then lists only *which* rows of the registry below its endpoints can produce.

Any change goes through **Contract changes** in [`plan.md`](../plan.md) first
(`docs/sdd/openapi/README.md`). A change here is a change to every feature at once, which
is the reason the file exists and the reason it is the hardest one to change.

---

## Conventions

- **Base:** `{{baseUrl}}/api` · **Media type of every error:** `application/problem+json`
- Errors are RFC 7807. **`200` is never returned with an error in the body**
  (`docs/sdd/05-api-conventions.md`, constitution IV)
- Timestamps are UTC ISO 8601 with `Z`. Identifiers are `Guid` strings. Enums are strings
- `GET /health` is **outside** this contract. It has its own shape, including its own
  `503`, in [`specs/001-solution-skeleton/contracts/health-api.md`](../../001-solution-skeleton/contracts/health-api.md)

---

## The envelope

Every non-2xx response body, at every status, from every endpoint:

```json
{
  "type": "https://wasl.local/errors/invalid-status-transition",
  "title": "The requested status transition is not permitted.",
  "status": 409,
  "detail": "A ticket in status 'New' cannot move to 'InProgress'. Permitted: Open, Closed.",
  "instance": "/api/tickets/8f1c2d34-5678-4abc-9def-0123456789ab/status",
  "traceId": "00-8f1c2d3456789abc0123456789abcdef-0123456789abcdef-01"
}
```

| Field | Type | Always? | Rule |
|---|---|---|---|
| `type` | `string` (absolute URI) | **yes** | The identifier the client branches on. One of the registry rows below and nothing else. **Never localized** (BR-8.7) |
| `title` | `string` | **yes** | A short human sentence for the failure *class*. Localized (BR-8.6). The same for every instance of one `type` |
| `status` | `number` | **yes** | Equals the HTTP status line. A body whose `status` disagrees with the status line is a defect in the producer |
| `detail` | `string` | no | A human sentence about *this* occurrence. Localized. **Absent on `500`.** Never a stack trace, exception type name, SQL, table or column name, file path, connection string, or configuration value (NFR-4) |
| `instance` | `string` | yes except where noted | The request path. Present on `500` too — it is the caller's own path and leaks nothing they did not send |
| `traceId` | `string` | **yes** | Matches the server log entry for this request and the audit row for it (BR-9.9). **Never localized.** A **top-level** property — see below |
| `errors` | `object<string, string[]>` | per `type` | Field name to messages. Present only where the registry row says so. Keys are **request payload field names**, camelCase, **never localized** (BR-8.7); the messages inside are localized (BR-8.6) |

Field order in the JSON is not part of this contract. Property **names** are.

### `traceId` is top-level, not nested

```json
{ "status": 500, "traceId": "00-…-01" }              ← correct
{ "status": 500, "extensions": { "traceId": "…" } }  ← wrong, and looks fine
```

`ProblemDetails.Extensions` is flattened into the object by the serializer. If it ever is
not, `problem.traceId` is `undefined` in every client, the UI shows an error with no
reference number, and nothing throws. `traceId` appears **exactly once** and at the top
level; asserted against the raw JSON text, because a deserializer papers over the
difference (`spec.md` AC-3).

### `errors`

```json
{
  "type": "https://wasl.local/errors/validation",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "detail": "See the errors property for field-level messages.",
  "instance": "/api/customers",
  "traceId": "00-8f1c2d3456789abc0123456789abcdef-0123456789abcdef-01",
  "errors": {
    "fullName": ["'fullName' must not be empty."],
    "email": ["'email' is not a valid email address.", "Provide either an email address or a phone number."]
  }
}
```

- Keys are the request field names **exactly as the payload spells them** — no `$.`, no
  `request.`, no DTO type name, no PascalCase. A client attaches `errors[name]` to the input
  named `name` with no mapping table (`docs/sdd/documentation/api/error-handling.md`)
- One field with two broken rules gets **two array entries**, not two responses
- One rule spanning two fields names **both** — the at-least-one-contact rule in `007`
  (BR-4.1) is the standing example: a single message on `email` alone reads as "the email is
  wrong", which is not what the rule says
- **`errors` is a property of the `type`, not of the status.** `errors/duplicate-customer`
  carries it; `errors/concurrency-conflict` does not. The registry column is authoritative.
  See `research.md` R-9 — `docs/sdd/05-api-conventions.md` contradicts itself on this point
  and this contract resolves it

---

## Status codes

The full table. Rows marked ★ are **not** in the table in
`docs/sdd/05-api-conventions.md`; ASP.NET Core returns them regardless, so they are
specified here rather than left to arrive undocumented (`spec.md` Q-C, `DOC-002-03`).

Rows marked ★★ were **added after this file was frozen** — see **Contract changes** at the
foot of this file. A frozen contract can still change; what it cannot do is change silently.

| Code | Used when | Envelope? |
|---|---|---|
| `200 OK` | Successful read, or an update returning the resource | n/a — never an error body |
| `201 Created` | Created; `Location` names the new resource | n/a |
| `204 No Content` | Success with nothing meaningful to return | n/a — **no body at all**, not an empty envelope |
| `400 Bad Request` | Malformed request, or failed input validation | yes |
| `401 Unauthorized` | Missing, expired, or invalid token | yes |
| `403 Forbidden` | Authenticated but not permitted (BR-6) | yes |
| `404 Not Found` | The addressed resource does not exist — **or the route does not** | yes |
| `405 Method Not Allowed` ★ | The path exists; the method is not declared on it | yes |
| `409 Conflict` | Valid request, conflicts with current state. Five causes, five `type`s | yes |
| `415 Unsupported Media Type` ★ | Request body is not `application/json` | yes |
| `429 Too Many Requests` ★★ | **`POST /api/auth/token` only.** Too many failed sign-ins for this address-and-email pair. Carries `Retry-After` | yes |
| `500 Internal Server Error` | Unhandled fault | yes, reduced — see the registry |
| `503 Service Unavailable` | **`/health` only.** Not this contract | no — health shape |

Not produced by this API, and recorded so nobody adds one:

| Code | Why not |
|---|---|
| `406 Not Acceptable` | The API produces `application/json` and `application/problem+json` only. Content negotiation has one outcome |
| `422 Unprocessable Entity` | `400` covers validation, per the convention table. Two codes for one condition would mean clients handling both |
| `502`, `503` from the API | No upstream calls, one deployable (ADR-002). A `502` a client sees came from infrastructure, not from us — which is exactly why the client parser must survive a body it did not author |
| ~~`429`~~ | **Superseded 2026-08-29 by `004b`.** See **Contract changes** below |

---

## The `type` registry

`type` = `https://wasl.local/errors/` + **code**. The base is a **compile-time constant**,
never configuration (`spec.md` AC-16): a base that varies by environment breaks every client
comparing the full URI, and clients do compare it.

Clients branch on the **last path segment**, never the whole URI and never `title`
(`spec.md` AC-25, AC-27).

| Code | Status | `errors`? | `detail`? | Raised by | Owning feature | Meaning |
|---|---|---|---|---|---|---|
| `validation` | 400 | **yes** | yes | Validation pipeline behaviour | `002` | Input failed validation. `errors` carries the field messages |
| `malformed-request` | 400 | no | yes | Model binding / JSON reader | `002` | The body or a route value could not be parsed. **Never a `500`** |
| `method-not-allowed` ★ | 405 | no | yes | Routing short-circuit | `002` | The path exists; this method is not declared on it |
| `unsupported-media-type` ★ | 415 | no | yes | Routing short-circuit | `002` | Body is not `application/json` |
| `rate-limited` ★★ | 429 | **no** | yes | `SignInThrottleFilter`, ahead of the pipeline | `004b` | Too many failed sign-ins for this address-and-email pair. No field is at fault, so no `errors`. Says **nothing** about whether the account exists or how many attempts remain — a throttle that answers differently for a real address than for an invented one is an enumeration oracle wearing a rate limit |
| `unauthenticated` | 401 | no | yes | Authentication middleware | `004` | Missing, expired, or invalid token. Says nothing about which |
| `forbidden` | 403 | no | yes | Authorization policy or handler (BR-6) | `004` | Permitted for some role, not this one. Names **no** role that would have worked |
| `not-found` | 404 | no | yes | Handler, or routing with no match | `002` raises route misses; features raise resource misses | The addressed resource — or route — does not exist |
| `duplicate-customer` | 409 | **yes** | yes | `CreateCustomer` / `UpdateCustomer` (BR-4.4, BR-4.5) | `007` | Normalised email or phone already belongs to an active customer. Carries **no id and no name** of the existing record (BR-4.7) |
| `invalid-status-transition` | 409 | no | yes | `ChangeTicketStatus` (BR-1) | `012` | Not permitted by the BR-1 matrix. Includes a same-status request (BR-1.9) and any mutation of a `Closed` ticket (BR-1.5) |
| `already-escalated` | 409 | no | yes | `EscalateTicket` (BR-3.4) | `016` | The ticket is already escalated |
| `ticket-closed` | 409 | no | yes | Any ticket mutation (BR-1.5) | `012` — **reserved, not yet raised** | `Closed` is terminal. Registered now so `012` does not invent a local code. See `spec.md` Q-B |
| `concurrency-conflict` | 409 | **no** | yes | Any endpoint taking `expectedVersion` (ADR-006) | `012`, `017` | `expectedVersion` is stale. No field is at fault, so no `errors`: the answer is refetch, not a form message |
| `internal` | 500 | **no** | **no** | Exception handler, last resort | `002` | Unhandled fault. Body is `type`, `title`, `status`, `instance`, `traceId` and **nothing else** |

### Client-side only

One code is produced by the **client**, never by the server, and it is registered here so it
cannot collide with a future server code:

| Code | Meaning |
|---|---|
| `unparseable-response` | The client received a body it could not read as this envelope — an HTML page from a proxy, an empty `404`, a `502` from a gateway. Synthesised locally so that every failure path in the UI has one shape (`spec.md` AC-24) |

---

## The rule this file exists to enforce

> **A feature that adds a new failure mode adds a row to the registry above. It does not
> invent a `type` locally.**

The mechanics:

1. Add the row here, in the same change that adds the failure. The `Owning feature` column
   is filled in, so a reviewer can see who is responsible for it
2. Add the code constant and its registry entry in
   `src/Wasl.Api/Common/Errors/ProblemTypes.cs`
3. Add the title key to the message catalogue (from `005`, to both `en` and `ar`; the
   key-parity test fails the build otherwise, BR-8.11)
4. Record it under **Contract changes** in the feature's `plan.md`, and regenerate its
   `FRONTEND-API-GUIDE.md`

**Why it is enforced by a build failure rather than by review** (`spec.md` AC-14): a domain
exception carrying an unregistered code degrades into `500 errors/internal` — a real failure
rendered as a generic one, indistinguishable from a genuine bug in the log and in the UI. A
test over the `Wasl.Api` assembly enumerates every domain-exception subtype and asserts its
code is in the registry, so the omission is a red build rather than a mystery `500` three
features later.

**What a new row costs a client:** nothing, if the client branches on `type` with a default
branch. That default branch is a contract obligation on the frontend, not a nicety —
`FRONTEND-API-GUIDE.md` names it.

---

## Localization

| Localized (BR-8.6) | Never localized (BR-8.7) |
|---|---|
| `title` | `type` |
| `detail` | the **keys** of `errors` |
| the **messages inside** `errors` | `status` |
| | `traceId` |
| | enum values (`InProgress`, not its label) |
| | `TicketNumber` |
| | any identifier |

The same failure, in Arabic:

```json
{
  "type": "https://wasl.local/errors/duplicate-customer",
  "title": "<Arabic title from the ar catalogue>",
  "status": 409,
  "instance": "/api/customers",
  "traceId": "00-8f1c2d3456789abc0123456789abcdef-0123456789abcdef-01",
  "errors": { "email": ["<Arabic message>"] }
}
```

`type`, the `email` key, `status`, and `traceId` are **byte-identical** to the English
response. Only human sentences changed. A client that branches on `type` keeps working in
Arabic; one that branches on `title` was already broken.

Until `005` ships, every sentence is English regardless of `Accept-Language`, and the
response is still a `200`-class outcome for the locale negotiation itself — asking for a
language the system does not yet speak is not a client error (BR-8.3). Nothing about the
machine-readable half of the envelope changes when `005` arrives, which is what makes
`005` a low-risk feature.

Server-side logs stay English at every locale (BR-8.9). A log that changes language with
traffic cannot be searched.

---

## What is never in an error response

From `docs/sdd/documentation/api/error-handling.md` and
`docs/sdd/testing/security-checklist.md`, restated here because this is the file an
implementer has open:

- Stack traces
- Exception type names
- SQL, table names, column names
- File paths
- Connection strings, configuration values, environment variable names
- Any hint about internal structure
- On a `403`: which role *would* have been permitted. Specific enough to act on, vague
  enough not to enumerate
- On a `401`: whether the token was missing, malformed, or expired
- On `duplicate-customer`: the id, name, or any field of the existing customer (BR-4.7)

`500` carries a `title`, a `status`, a `type`, an `instance`, and a `traceId`. Everything
else went to the log, and the `traceId` is how it is found.

---

## Client obligations

Binding on every consumer, including the ones in later features:

| # | Obligation | Why |
|---|---|---|
| 1 | Branch on the last path segment of `type`. Never on `title` | `title` is translated; `type` is not (BR-8.7) |
| 2 | Never branch on `status` alone where a status has several `type`s | `409` has five causes and they need different UI: a field message, a refetch, a refresh of the available actions |
| 3 | Have a default branch for an unrecognised `type` | A new registry row must not break a deployed client |
| 4 | Never throw on a body that is not this envelope | A proxy or gateway can return anything. Synthesise `errors/unparseable-response` |
| 5 | Surface the `traceId` to the user on a `500` | It is the only thing that connects their report to the log (BR-9.9) |
| 6 | Never auto-retry a `409` | Every `409` means server state is not what the client believed; retrying without a human is guessing at intent |
| 7 | Render an `errors` key that matches no field as a form-level message | A server message the user cannot see is worse than no validation |

---

## Verification

| What | How |
|---|---|
| Envelope present on every status in the table | `TEST-002-01` … `TEST-002-07` |
| `traceId` top-level, exactly once, and equal to the log's | `TEST-002-03`, `TEST-002-04` |
| `500` body carries exactly five properties | `TEST-002-05` — set equality on property names, not a substring search |
| `500` shape holds in Development | `TEST-002-06` |
| `/health` `503` unchanged by this feature | `TEST-002-08` |
| Every registry row unique, status in the table, code registered | `TEST-002-09` |
| Nothing constructs an envelope outside the factory | `REV-002-01` plus a `grep` recorded in `tests.md` |
| One shared `ProblemDetails` schema in the OpenAPI document | `TEST-002-13` |
| This contract matches what was built | Generated OpenAPI compared before the feature closes — `REV-002-02` |

---

## Contract changes

A change to a frozen contract is recorded here, dated, with the reason — and both lanes are
told. The alternative is a frontend written against a file that no longer describes the API.

### 2026-08-29 · `429 errors/rate-limited` added — `004b`

**What changed.** `429` moved out of the *not produced by this API* list and into both tables
above. `POST /api/auth/token` now answers `429 errors/rate-limited` with a `Retry-After`
header after ten failed sign-ins in five minutes for one (address, email) pair.

**Why the original entry was written, and why it is now wrong.** It read "no rate limiting" —
a statement of fact about the build at the time, not a decision that there never would be.
`004` closed with "no rate limit and no lockout on `POST /api/auth/token`" recorded as an open
gap; `004b` closes it.

**What the frontend must do.** The sign-in screen (`025`) already renders any `ProblemDetails`
it receives, so a `429` shows a message rather than breaking — but the message will be the
generic one until the screen branches on `rate-limited` and reads `Retry-After`. **No other
screen can receive a `429`**, because the limit is on the one action, not on the API.

**What did not change.** No other status, no other code, no envelope shape. `errors` is still
absent on a `429` — no field is at fault.
