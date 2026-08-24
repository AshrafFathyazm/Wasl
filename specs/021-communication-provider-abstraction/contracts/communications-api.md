# Contract — Communications (send, read, channels)

**Feature:** `021-communication-provider-abstraction` · **Story:** US-012 ·
**Status:** FROZEN 2026-08-24 · **Lanes:** backend implements · frontend consumes

The agreement. The backend implements exactly this; the frontend may start against it
immediately. Any change goes through **Contract changes** in [`plan.md`](../plan.md)
first — see `docs/sdd/openapi/README.md`.

Three endpoints. Two of them exist so that the seam is observable to a person rather
than only to a `SELECT`; `spec.md`, *In scope, and why it is not creep*, says which and
why.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on every call
- **Content-Type:** `application/json`
- Timestamps are UTC, ISO 8601, `Z` suffix. Formatting for display is the client's job,
  in the client's locale
- Identifiers are `Guid` strings. Enums are strings on the wire
- Errors are RFC 7807 `ProblemDetails`. **`200` is never returned with an error in the
  body** (`docs/sdd/05-api-conventions.md`)

### Two additions to `docs/sdd/05-api-conventions.md`, recorded not smuggled

| Addition | Why | Owner |
|---|---|---|
| Three rows in the endpoint inventory — it currently lists none of these paths | The inventory is the list of what exists. Adding an endpoint without adding the row is how it drifts | `DOC-021-02` |
| Two new `409` `type` values: `errors/ticket-closed`, `errors/no-contact-for-channel` | The convention lists four `409` types; neither of these cases is one of them | `DOC-021-02` |

`errors/ticket-closed` is the name `013` should also use for BR-5.2 on comments. Whichever
feature lands first owns it and the other matches — `plan.md`, **Contract changes**
(spec Q-B).

### The channel → recipient map, in one place

| Channel | Recipient resolved from | Sendable |
|---|---|---|
| `Email` | `Customer.Email` | yes |
| `WhatsApp` | `Customer.PhoneE164` | yes |
| `Sms` | `Customer.PhoneE164` | yes |
| `LiveChat` | — | no |
| `WebForm` | — | no |

`LiveChat` and `WebForm` stay valid values of `CommunicationChannel` for
`Ticket.Channel` and `TicketComment.Channel` — a ticket that *arrived* through a web form
is normal. There is simply no outbound address for them (`research.md` R-11, spec A-3).

**The sendable column is not a constant anywhere in the code.** It is a projection of
what is registered in `CommunicationProviderRegistry`, served by
`GET /api/communications/channels`, and clients read it rather than mirroring it (AC-4,
AC-22).

---

## `POST /api/tickets/{ticketId}/messages`

Sends an outbound message to the ticket's customer through the provider registered for
the requested channel, and records the attempt.

**Who may:** a `Manager` on any ticket; an `Agent` on a ticket assigned to themselves or
unassigned. BR-6 has no row for this action — spec **Q-A** carries the reasoning and the
alternative.

### Request

```json
{
  "channel": "Email",
  "body": "Your invoice has been corrected. Apologies for the delay."
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `channel` | `string` enum | **yes** | Must be a value of `CommunicationChannel` **and** be present in `GET /api/communications/channels`. Anything else is `400` (AC-3, AC-4) |
| `body` | `string(1..4000)` | **yes** | Not whitespace-only. Stored and sent verbatim, never translated (BR-8.10). Arabic round-trips byte-identical (AC-10) |

No recipient field. The address is resolved from the ticket's customer and snapshotted
onto the record (spec A-5) — an agent cannot redirect a message to an arbitrary address,
which is a whole validation and authorization surface this feature does not have.

No `expectedVersion`. Nothing on the ticket is mutated, and the interaction row carries
no concurrency token (`data-model.md`, *Not added here*).

### `201 Created`

```json
{
  "id": "3f2a1b44-0c9d-4e5f-8a7b-1c2d3e4f5a6b",
  "ticketId": "8f1c2d34-5678-4abc-9def-0123456789ab",
  "direction": "Outbound",
  "channel": "Email",
  "recipientAddress": "ali@example.com",
  "body": "Your invoice has been corrected. Apologies for the delay.",
  "providerName": "Mock",
  "providerMessageId": "mock-9f14c0a27b3d4e5f8a6b1c2d3e4f5a6b",
  "deliveryStatus": "Accepted",
  "failureCode": null,
  "sentByUserId": "22222222-2222-4222-8222-222222222222",
  "createdAtUtc": "2026-08-23T12:00:00Z"
}
```

**No `Location` header, and that is a deliberate deviation** from
`05-api-conventions.md`'s `201` row. There is no single-interaction resource to point at;
inventing `GET /api/tickets/{id}/interactions/{interactionId}` to satisfy a header would
be an endpoint with no caller. Recorded here, and in `plan.md` under risks, rather than
left as an inconsistency a reviewer finds. If a single-interaction read ever exists, the
header is added and this note is deleted.

### `201 Created` — the provider reported a failure

Same status code, same shape, different data. **The row exists.**

```json
{
  "id": "5b6c7d88-1e2f-4a3b-9c4d-5e6f7a8b9c0d",
  "ticketId": "8f1c2d34-5678-4abc-9def-0123456789ab",
  "direction": "Outbound",
  "channel": "Sms",
  "recipientAddress": "+966501234567",
  "body": "Your invoice has been corrected.",
  "providerName": "Mock",
  "providerMessageId": null,
  "deliveryStatus": "Failed",
  "failureCode": "MockConfiguredFailure",
  "sentByUserId": "22222222-2222-4222-8222-222222222222",
  "createdAtUtc": "2026-08-23T12:00:05Z"
}
```

Why this is a `201` and not a `502` — and why that is **not** "`200` with an error in the
body": the request succeeded in recording an attempt, and the attempt is the resource. A
`5xx` would unwind the request transaction and take the record of the attempt with it,
leaving nothing to show a support agent. Full reasoning and the rejected alternative in
[`research.md`](../research.md) R-5. Consequence for the client: **branch on
`deliveryStatus`, not only on the status code** (AC-7).

`failureCode` is a machine-readable code, never a sentence — the client translates it
(BR-8.7, AC-22). Codes emitted by the mock:

| `failureCode` | Meaning |
|---|---|
| `MockConfiguredFailure` | The channel is listed in `Communications:Mock:FailChannels`. The only failure the mock can produce, and it is reachable by configuration only (AC-6) |

A real provider adds codes here. The client's fallback for an unrecognised code is a
generic translated sentence, never the raw code (AC-22).

### Failures

| Code | `type` | When |
|---|---|---|
| `400` | `errors/validation` | `body` missing, whitespace-only, or over 4000; `channel` missing, not a `CommunicationChannel` value, or not in the sendable set (AC-3) |
| `401` | `errors/unauthenticated` | Missing or invalid token (AC-14) |
| `403` | `errors/forbidden` | An `Agent` on a ticket assigned to someone else (AC-13, Q-A) |
| `404` | `errors/not-found` | No ticket with that id (AC-15) |
| `409` | `errors/ticket-closed` | The ticket's status is `Closed` (BR-5.2 mirrored, AC-11) |
| `409` | `errors/no-contact-for-channel` | The customer has no address for that channel — for example `Sms` to a customer with only an email, which BR-4.1 allows (AC-12) |
| `500` | `errors/unexpected` | The provider threw rather than returning a failure. Transaction rolled back, no row. `detail` carries nothing but a trace id (NFR-4) |

`401`, `403`, `404`, and both `409`s are all decided **before** the provider is called,
and none of them writes an `Interactions` row. Nothing leaves the process for a request
that was going to be refused (AC-11, AC-12, AC-13).

#### `400` — validation, non-sendable channel

```json
{
  "type": "https://wasl.local/errors/validation",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "detail": "See the errors property for field-level messages.",
  "instance": "/api/tickets/8f1c2d34-5678-4abc-9def-0123456789ab/messages",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01",
  "errors": {
    "channel": ["No provider is registered for this channel."]
  }
}
```

The message names the channel field. It does **not** enumerate the sendable set in the
message — the client already has that list from
`GET /api/communications/channels`, and duplicating it into a translated sentence makes
one fact live in two catalogues.

#### `409` — closed ticket

```json
{
  "type": "https://wasl.local/errors/ticket-closed",
  "title": "This ticket is closed.",
  "status": 409,
  "detail": "A message cannot be sent on a closed ticket.",
  "instance": "/api/tickets/8f1c2d34-5678-4abc-9def-0123456789ab/messages",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01"
}
```

No `errors` dictionary — it is not a field-level failure. `Closed` is terminal
project-wide, so there is no "reopen and retry" action to offer.

#### `409` — no contact for the channel

```json
{
  "type": "https://wasl.local/errors/no-contact-for-channel",
  "title": "This customer has no address for the selected channel.",
  "status": 409,
  "detail": "Choose a different channel, or add a phone number to the customer.",
  "instance": "/api/tickets/8f1c2d34-5678-4abc-9def-0123456789ab/messages",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01",
  "errors": {
    "channel": ["This customer has no phone number, so SMS cannot be used."]
  }
}
```

`errors.channel` is present because the user's remedy is to change the channel — the
message belongs on that control. **The body does not name the customer's other
addresses**, and does not say which one exists: the remedy is "pick another channel or
edit the customer", and enumerating contact details into an error response is a leak with
no purpose (NFR-4, and the same restraint as BR-4.7's `409`).

---

## `GET /api/tickets/{ticketId}/interactions`

The record of what was sent on this ticket, oldest first.

**Who may:** any authenticated support user. Reading is not assignment-sensitive —
BR-6 lets every support user see every ticket, and this is part of a ticket.

### Request

```text
GET /api/tickets/{ticketId}/interactions?page=1&pageSize=20
```

| Parameter | Default | Rules |
|---|---|---|
| `page` | `1` | 1-based. `0` or negative clamps to `1` |
| `pageSize` | `20` | Above `100` clamps to `100`, never rejected (BR-7.2) |

No filters and no sort parameter. Order is `createdAtUtc` **ascending** — the reading
order of a conversation, and the same order BR-5.7 uses for the timeline. Filtering is
`research.md` R-13: deliberately absent.

### `200 OK`

```json
{
  "items": [
    {
      "id": "3f2a1b44-0c9d-4e5f-8a7b-1c2d3e4f5a6b",
      "ticketId": "8f1c2d34-5678-4abc-9def-0123456789ab",
      "direction": "Outbound",
      "channel": "Email",
      "recipientAddress": "ali@example.com",
      "body": "Your invoice has been corrected.",
      "providerName": "Mock",
      "providerMessageId": "mock-9f14c0a27b3d4e5f8a6b1c2d3e4f5a6b",
      "deliveryStatus": "Accepted",
      "failureCode": null,
      "sentByUserId": "22222222-2222-4222-8222-222222222222",
      "createdAtUtc": "2026-08-23T12:00:00Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "totalCount": 1,
  "totalPages": 1
}
```

The item shape is byte-for-byte the `201` shape from `POST`, so the client has one type
and one renderer, not two.

A ticket with no interactions returns `200` with `items: []` and `totalCount: 0` —
**never `404`** (BR-7.6, AC-20).

### Failures

| Code | `type` | When |
|---|---|---|
| `400` | `errors/validation` | `page` or `pageSize` is not an integer. An out-of-range value is clamped, not rejected |
| `401` | `errors/unauthenticated` | Missing or invalid token |
| `404` | `errors/not-found` | No ticket with that id |

---

## `GET /api/communications/channels`

What the module can currently send on. One call, no parameters, no pagination.

**Who may:** any authenticated support user.

### `200 OK`

```json
{
  "sendableChannels": ["Email", "WhatsApp", "Sms"]
}
```

- The array is a projection of `CommunicationProviderRegistry`, in the declaration order
  of `CommunicationChannel` so the response is stable between restarts.
- With no providers registered it is `[]`. The module is then visibly disabled and every
  send is a `400` — not a `500` on first use (spec, Edge cases).
- Values are enum identifiers and are **never** localized (BR-8.7). The client owns the
  display label (AC-22).
- This is the endpoint that makes AC-4 observable: register a provider for `LiveChat` and
  it appears here, with no other change anywhere.

### Failures

| Code | `type` | When |
|---|---|---|
| `401` | `errors/unauthenticated` | Missing or invalid token |

Caching: the value changes only when the deployed registrations change. The client may
treat it as fresh for the lifetime of the page load; it must not persist it beyond that.

---

## What stays identical in every locale

`title`, `detail`, and the messages inside `errors` are translated (BR-8.6). These are
**not** (BR-8.7, AC-21):

| Part | Reason |
|---|---|
| `type` | The identifier the client branches on |
| The **keys** of `errors` | They are request field names, part of this contract |
| `channel`, `direction`, `deliveryStatus` | Enum identifiers |
| `failureCode` | A machine-readable code the client maps to a translated sentence |
| `providerName`, `providerMessageId` | Provider identifiers, quoted in support conversations |
| `recipientAddress` | User data, returned verbatim (BR-8.10) |
| `traceId` | An identifier |

Send `Accept-Language: ar` to see the difference; `Content-Language` on the response
names the locale actually applied.

---

## Behaviour worth knowing before you build against it

| Situation | What happens | Why |
|---|---|---|
| The provider rejects the send | `201`, `deliveryStatus: "Failed"` | The attempt is the resource (`research.md` R-5). Branch on `deliveryStatus` |
| The same message is submitted twice | Two rows, two `201`s | Not idempotent, and deduplicating outbound messages would mean guessing intent — the same position `05-api-conventions.md` takes on tickets. The client disables submit while pending (AC-22) |
| The customer's email changes afterwards (`017`) | Existing rows keep the address they were sent to | `recipientAddress` is a snapshot (spec A-5), the same reasoning as BR-9.6 |
| A message is sent, then the request fails afterwards | No row, and the `201` never arrives | The transaction rolls back (AC-8). The mock's in-memory buffer still holds the attempt — a diagnostic, not a ledger |
| A message is sent successfully | No entry appears in the ticket **timeline** | The timeline is comments plus history (BR-5.7). Interactions are their own panel — spec Q-C |
| An inbound message arrives at the system | Nothing. There is no inbound endpoint | `DEFERRED.md` US-013, and spec Tension 2. `POST /api/communications/inbound` returns `404` and appears nowhere in the OpenAPI document |
| An unknown field is in the request body | Ignored | Not an error; the DTO binds what it declares |

## Verification

| What | How |
|---|---|
| Every status code above | `TEST-021-04` … `TEST-021-12` |
| `201` with `Failed` keeps the row | `TEST-021-06` |
| No provider call on `403`, `409`, or `404` | `TEST-021-07` — asserted against the mock's buffer being empty |
| The sendable set comes from the registry | `TEST-021-03` (channels endpoint) and `TEST-021-13` (a stub provider changes the answer) |
| Arabic `type`, `errors` keys, and enum values byte-identical to English | `TEST-021-14` |
| This contract matches what was built | Generated OpenAPI compared before the feature closes — `REV-021-02` |
