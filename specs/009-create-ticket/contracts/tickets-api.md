# Contract — Tickets (create)

**Feature:** `009-create-ticket` · **Story:** US-005 · **Status:** FROZEN 2026-08-23
· **Lanes:** backend implements · frontend consumes

The agreement. The backend implements exactly this; the frontend may start against it
immediately. Any change goes through **Contract changes** in [`plan.md`](../plan.md)
first — see `docs/sdd/openapi/README.md`.

This is the first contract for `/api/tickets`. `010` (list and detail), `011`
(assignee), `012` (status), `013` (comments and timeline) and `016` (escalate) extend
it. The ticket shape defined here is the one they all read, which is why it already
carries `version` and `allowedTransitions`.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on every call
- **Content-Type:** `application/json`
- Timestamps are UTC, ISO 8601, `Z` suffix. Formatting for display is the client's job,
  in the client's locale
- Identifiers are `Guid` strings. Enums are strings on the wire
- Errors are RFC 7807 `ProblemDetails`. **`200` is never returned with an error in the
  body** (`docs/sdd/05-api-conventions.md`)

## Enums — the exact value lists

Values are identifiers and are **never translated** (BR-8.7). Only their display labels
are, and those live in the client's catalogue.

| Enum | Values |
|---|---|
| `category` | `Billing` · `Technical` · `Account` · `General` |
| `priority` | `Low` · `Normal` · `High` · `Critical` (ordered, low to high) |
| `channel` | `Email` · `WhatsApp` · `LiveChat` · `Sms` · `WebForm` |
| `status` | `New` · `Open` · `InProgress` · `PendingCustomer` · `Resolved` · `Closed` |

`Sms` is spelled `Sms`, not `SMS`. Worth stating, because a hand-typed constant list
gets it wrong and the resulting `400` reads as a backend bug.

---

## `POST /api/tickets`

Creates a ticket against an existing customer. Permitted for both `Agent` and `Manager`
(BR-6), so this endpoint has **no `403`**.

### Request

```json
{
  "customerId": "8f1c2d34-5678-4abc-9def-0123456789ab",
  "subject": "لا يمكنني تسجيل الدخول",
  "description": "The password reset email never arrives.",
  "category": "Technical",
  "priority": "High",
  "channel": "WhatsApp"
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `customerId` | `Guid` | **yes** | Must resolve to an existing customer. Missing or unparseable is `400`; well-formed but unknown is `404` (AC-4) |
| `subject` | `string(1..200)` | **yes** | Not whitespace-only (AC-6, AC-7) |
| `description` | `string(1..4000)` | **yes** | Not whitespace-only (AC-6, AC-7) |
| `category` | enum | **yes** | One of the four above (AC-5) |
| `priority` | enum | no | Defaults to `Normal` when **omitted or null** (AC-8) |
| `channel` | enum | **yes** | One of the five above (AC-5) |

`createdByUserId` is **not a request field**. It is taken from the token; a value sent in
the body is ignored rather than rejected (AC-12). `status`, `ticketNumber`,
`assignedToUserId`, and `isEscalated` are likewise server-owned and ignored on input.

### `201 Created`

`Location: /api/tickets/{id}` — and a `GET` on it returns the same resource (AC-1).

```json
{
  "id": "3b9a1f22-77c4-4f0e-9a51-6c2d8e4b1a90",
  "ticketNumber": "TCK-2026-000042",
  "customer": {
    "id": "8f1c2d34-5678-4abc-9def-0123456789ab",
    "fullName": "علي الأحمد",
    "email": "ali@example.com"
  },
  "subject": "لا يمكنني تسجيل الدخول",
  "description": "The password reset email never arrives.",
  "category": "Technical",
  "priority": "High",
  "channel": "WhatsApp",
  "status": "New",
  "assignedToUserId": null,
  "isEscalated": false,
  "createdByUserId": "5d0e7a11-3c2b-4a8f-8e10-9f4b6c2a7d31",
  "createdAtUtc": "2026-08-23T12:00:00Z",
  "updatedAtUtc": "2026-08-23T12:00:00Z",
  "allowedTransitions": ["Open", "Closed"],
  "version": "AAAAAAAAB9E="
}
```

| Field | Note |
|---|---|
| `ticketNumber` | `TCK-{yyyy}-{000000}`. Latin digits in every locale (BR-8.13) — it is quoted aloud and pasted between systems. Not localized, not reformatted, not zero-trimmed |
| `customer` | A **summary**: id, name, email. Deliberately not the whole customer — the profile is `008`, and a create response that embeds a full customer is a second read shape to keep in step |
| `status` | Always `New` on creation (AC-2, BR-1.1) |
| `assignedToUserId` | Always `null` on creation (AC-2). Assignment is `011`; BR-2.7 keeps triage and ownership separate |
| `allowedTransitions` | For `New` this is exactly `["Open", "Closed"]` (AC-10, BR-1 matrix). **Server-computed** — the client renders it and never derives it (ADR-004) |
| `version` | Base64 `rowversion` (ADR-006 as amended by ADR-013). Unused by this endpoint; `011` and `012` send it back as `expectedVersion` |

The `Created` history row written in the same transaction (AC-9, BR-1.8) is **not** in
this response. It is visible through the timeline in `013`. A create response that also
returns the history it just wrote invites a client to render a timeline of length one and
then diverge from the real one.

### Failures

| Code | `type` | When |
|---|---|---|
| `400` | `errors/validation` | Missing or whitespace `subject` or `description`; either over its maximum; missing or unparseable `customerId`; an unrecognised value for `category`, `priority`, or `channel` |
| `400` | `errors/malformed-request` | The body could not be parsed at all |
| `401` | `errors/unauthenticated` | Missing or invalid token (AC-13) |
| `404` | `errors/not-found` | `customerId` is well-formed but no such customer exists (AC-4) |

No `403`: BR-6 permits creation for both roles. No `409`: nothing here conflicts with
existing state — two identical tickets are two real tickets
(`docs/sdd/05-api-conventions.md`, *Idempotency*).

#### `400` — validation

```json
{
  "type": "https://wasl.local/errors/validation",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "detail": "See the errors property for field-level messages.",
  "instance": "/api/tickets",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01",
  "errors": {
    "subject": ["'subject' must not be empty."],
    "category": ["'category' must be one of: Billing, Technical, Account, General."]
  }
}
```

An invalid enum message **lists the accepted values** (AC-5). The list is generated from
the enum, not written out by hand, so a new value cannot be missing from the message
while being accepted by the parser.

#### `404` — unknown customer

```json
{
  "type": "https://wasl.local/errors/not-found",
  "title": "The requested resource was not found.",
  "status": 404,
  "instance": "/api/tickets",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01",
  "errors": {
    "customerId": ["No customer exists with this identifier."]
  }
}
```

The type is the **registered** `errors/not-found`
(`docs/sdd/documentation/api/error-handling.md`), not a per-feature
`errors/customer-not-found`. Which reference failed to resolve is carried by the *key* of
`errors`, so the client can clear the customer picker rather than showing a full-page
not-found — and no new client branch is needed for the next endpoint that cannot resolve
something.

The body names nothing about the customer beyond the id the caller already sent.

### What stays identical in every locale

`title`, `detail`, and the messages inside `errors` are translated (BR-8.6). These are
**not** (BR-8.7):

| Part | Reason |
|---|---|
| `type` | The identifier the client branches on |
| The **keys** of `errors` | They are request field names, part of this contract |
| Every enum value | `InProgress` is an identifier; only its label is translated |
| `ticketNumber` | Quoted aloud and pasted between systems (BR-8.13) |
| `traceId` | An identifier |

Send `Accept-Language: ar` to see the difference; `Content-Language` on the response
names the locale that was actually applied. A client that branches on `type` works in
Arabic; one that branches on `title` was already broken.

---

## Behaviour worth knowing before you build against it

| Situation | What happens | Why |
|---|---|---|
| Two creations arrive concurrently | Two `201`s with **different** `ticketNumber`s | The number comes from `dbo.TicketNumberSeq`, a database sequence. A `COUNT(*) + 1` would hand both the same value (AC-11) |
| The sequence is never reset at new year | `TCK-2026-000900` can be followed by `TCK-2027-000901` | The year is informational; the sequence is what guarantees uniqueness. Numbers are not dense within a year and were never promised to be |
| A creation fails after the number was drawn | That number is **never reused** | A sequence value is consumed outside the transaction. Gaps in the number series are expected and are not a defect — treating them as one would require a lock that serialises every create |
| The sequence passes `999999` | The format **widens** to seven digits rather than wrapping | Documented limit, not handled in code. At the volume in scope it is roughly a century away; wrapping would break the unique index and the wrap is the failure that would be silent |
| `priority` is omitted | Stored and returned as `Normal` | AC-8. `null` is treated as omitted; an empty string is a `400` |
| The form is double-submitted | **Two tickets** | This endpoint is not idempotent and deliberately has no duplicate rule — two people reporting the same problem is two tickets. Preventing the double-submit is a client obligation (AC-15) |
| An unknown field is in the body | Ignored | Not an error; the DTO binds what it declares |
| `createdByUserId` is supplied in the body | Ignored, and the token's user is stored | AC-12. Silently ignored rather than a `400`, because rejecting it would leak which server-owned fields exist |
| The customer is deleted between the picker and submit | `404`, never `500` | Hard delete does not exist in this release, so this is defence against a manual delete during support work. The FK is `ON DELETE NO ACTION`, so the delete itself would fail first |
| The customer is **inactive** | `201` — created | `spec.md` Q-2. Deactivation is not in this release and blocking it would create a state with no exit |
| An Arabic `subject` | Round-trips byte-identical | Every human-written column is `nvarchar` (ADR-013 row 4). Under `varchar` it stores as `????`, which presents as a font problem and survives review — hence `TEST-009-12` |
| A `201` is returned | Exactly one `Ticket.Created` audit row exists, in the same transaction | BR-9.1, BR-9.3. Roll the transaction back and the audit row goes with it |
| A `401` is returned | An `Auth.Unauthenticated` audit row exists, outside any transaction | BR-9.2, BR-9.4. A `400` or `404` writes **no** audit row — `spec.md` Q-3 |

## Verification

| What | How |
|---|---|
| `201`, `Location`, and a `GET` on it | `TEST-009-03` |
| `400` on a missing / malformed `customerId`, `404` on an unknown one, never `500` | `TEST-009-04` |
| Every other `400` variant, including the accepted-values list | `TEST-009-05` |
| `priority` defaults to `Normal` | `TEST-009-06` |
| `status` is `New`, assignee is null, and `allowedTransitions` is `["Open","Closed"]` | `TEST-009-01`, `TEST-009-03` |
| The `Created` history row exists in the same transaction | `TEST-009-07` |
| Concurrent creations get distinct numbers | `TEST-009-08` |
| `401` without a token | `TEST-009-09` |
| The audit rows, and their absence after a rollback | `TEST-009-10`, `TEST-009-11` |
| Arabic text and Latin-digit `ticketNumber` under `Accept-Language: ar` | `TEST-009-12` |
| The `404` body leaks nothing | `TEST-009-13` |
| This contract matches what was built | `REV-009-03` — generated OpenAPI compared before the feature closes |
