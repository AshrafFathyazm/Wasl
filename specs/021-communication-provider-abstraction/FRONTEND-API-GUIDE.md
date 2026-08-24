# Frontend API Guide — Communications (US-012)

Everything the frontend lane needs to build the **Messages** panel **without waiting for
the backend**. Derived from
[`contracts/communications-api.md`](contracts/communications-api.md), which is frozen.

> Start now. Do not wait for `BE-021-06`.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on every call
- **Locale:** send `Accept-Language: ar` or `en`. Read `Content-Language` on the response
  to know which was actually applied
- Errors are RFC 7807 `ProblemDetails`. **Branch on `type`, never on `title`** — `title`
  is translated, `type` is not
- Timestamps arrive UTC with a `Z`. Format for display client-side, in the active locale

## The one thing to get right

`deliveryStatus: "Failed"` arrives with HTTP **`201`**.

The request succeeded — it recorded an attempt — and the provider's refusal is a field on
the created resource, not an HTTP error (`research.md` R-5). A client that branches only
on the status code will tell the user their message was sent when it was not, and nothing
anywhere will contradict it.

```ts
const created = await sendMessage(ticketId, { channel, body });
if (created.deliveryStatus === 'Failed') {
  // warning tone, keep the composer contents, show the translated failureCode
} else {
  // success tone, clear the composer
}
```

## The three endpoints

| Method | Path | Used for |
|---|---|---|
| `GET` | `/api/communications/channels` | The `Select` options. **The only source** — do not hard-code a channel list |
| `GET` | `/api/tickets/{ticketId}/interactions` | The list, paginated, oldest first |
| `POST` | `/api/tickets/{ticketId}/messages` | Sending |

### Types — provisional until generated

Hand-written from the contract. **Marked provisional on purpose**: they are replaced by
types generated from the OpenAPI document once the endpoints are real (ADR-011 decision
6), and the swap is a deliberate task (`FE-021-01`), not something to forget.

```ts
// PROVISIONAL — replace with generated types when /swagger exists. See FE-021-01.

// Wire values. Identifiers, never translated (BR-8.7). Labels live in the catalogue.
export type CommunicationChannel = 'Email' | 'WhatsApp' | 'LiveChat' | 'Sms' | 'WebForm';
export type InteractionDirection = 'Outbound';          // Inbound does not exist yet, by design
export type InteractionDeliveryStatus = 'Accepted' | 'Failed';

export interface SendableChannelsResponse {
  sendableChannels: CommunicationChannel[];             // may be [] — see below
}

export interface SendMessageRequest {
  channel: CommunicationChannel;
  body: string;                                         // 1..4000, not whitespace-only
}

export interface InteractionResponse {
  id: string;
  ticketId: string;
  direction: InteractionDirection;
  channel: CommunicationChannel;
  recipientAddress: string;                             // snapshot at send time
  body: string;                                         // verbatim, render with dir="auto"
  providerName: string;                                 // 'Mock' today
  providerMessageId: string | null;                     // null exactly when Failed
  deliveryStatus: InteractionDeliveryStatus;
  failureCode: string | null;                           // a CODE, not a sentence
  sentByUserId: string;
  createdAtUtc: string;                                 // ISO 8601, Z
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  traceId: string;
  errors?: Record<string, string[]>;
}
```

`InteractionDirection` is a one-member union deliberately. There is no inbound path
(`spec.md` Tension 2), and a union that says so makes the day it arrives a compile error
in the places that need to handle it rather than a runtime surprise.

## Responses, and what the UI does with each

### `POST /api/tickets/{ticketId}/messages`

| Code | `type` / field | What the UI does |
|---|---|---|
| `201` + `deliveryStatus: "Accepted"` | — | Invalidate the interactions query, success `Toast`, clear the composer |
| `201` + `deliveryStatus: "Failed"` | `failureCode` | Invalidate and refetch — **the row exists**. Warning-tone `Toast`, keep the body so another channel can be tried, render `communications.failure.<code>` with `communications.failure.unknown` as the fallback |
| `400` | `errors/validation` | Attach each `errors[field]` message to that field. `channel` errors go on the select |
| `401` | `errors/unauthenticated` | Session expired. Redirect to sign-in; not a form error |
| `403` | `errors/forbidden` | Hide the composer and show `communications.compose.forbidden`. Not a disabled button with no explanation |
| `404` | `errors/not-found` | The ticket is gone. Route-level, not a form error — the whole screen is invalid |
| `409` | `errors/ticket-closed` | Hide the composer, show `communications.compose.closed`. No retry — `Closed` is terminal |
| `409` | `errors/no-contact-for-channel` | Attach `errors.channel` to the select, inline. The remedy is picking another channel, so the message belongs on that control |
| `500` | `errors/unexpected` | `ErrorBoundary`. Show the `traceId` — it matches the server log (BR-9.9) |

```ts
if (res.status === 409 && problem.type.endsWith('/no-contact-for-channel')) {
  setError('channel', { message: problem.errors?.channel?.[0] });
}
```

Note the shape: `.endsWith('/no-contact-for-channel')` on `type`, never a comparison
against `title`. `title` is Arabic when the user is Arabic.

### `GET /api/tickets/{ticketId}/interactions`

| Code | What the UI does |
|---|---|
| `200` with items | Render oldest first — the order the server returns. Do not re-sort |
| `200` with `items: []` | Empty state, `communications.panel.empty`. This is **not** an error and never a `404` (BR-7.6) |
| `401` / `404` | As above |

`pageSize` above 100 is clamped by the server, not rejected — so a request for 500 comes
back with 100 items and `pageSize: 100`. Read the envelope's `pageSize`, do not assume
the one that was sent.

### `GET /api/communications/channels`

| Response | What the UI does |
|---|---|
| `sendableChannels: ["Email","WhatsApp","Sms"]` | Populate the `Select` in this order |
| `sendableChannels: []` | No providers registered. Replace the composer with `communications.panel.unavailable`. Do **not** render an empty dropdown |

Fetch it once per page load and treat it as fresh for that page's lifetime. Do not
persist it: it changes when the deployment's registrations change, and a stale cached
list is a `<select>` offering a channel the server will reject with a `400`.

**Do not hard-code this list, and do not derive it from the `CommunicationChannel`
type.** `LiveChat` and `WebForm` are valid channels for a *ticket* and are not sendable.
The server is the authority on what is sendable, and the whole seam claim (AC-4) is that
adding a provider changes this response and nothing else.

## Client-side validation — mirror, never authority

The Zod schema mirrors the server so the user is told sooner. Every rule below is also
enforced server-side; the client is not the authority (ADR-003, constitution III).

```ts
const schema = (sendable: CommunicationChannel[]) => z.object({
  channel: z.string().refine(c => sendable.includes(c as CommunicationChannel), {
    message: 'communications.errors.channelUnavailable',   // i18n key, not a sentence
  }),
  body: z.string().trim().min(1).max(4000),
});
```

The schema takes the sendable list as an argument rather than closing over a constant —
that is what keeps the client from becoming a second authority on the registry.

Three things the client deliberately does **not** do:

| Not done client-side | Why |
|---|---|
| Resolve or display-validate the recipient address | The server resolves it from the customer and snapshots it (spec A-5). The client renders what came back |
| Decide which channels are sendable | Only the registry knows (AC-4) |
| Decide whether the ticket is closed or the user is permitted | It may *hide* the composer using the ticket it already has, and the server still enforces both (AC-11, AC-13). Hiding is a courtesy; the `409` and `403` are the rule |

## States — all ten are required

Listed with their behaviour in [`frontend-spec.md`](frontend-spec.md). The ones that get
skipped, and that a reviewer will try: `Failed` inside a `201`, the empty channel list,
the closed ticket, and the forbidden composer.

## Localization

| Item | Rule |
|---|---|
| Labels, placeholders, buttons, empty states, badge text, `failureCode` sentences | Client-owned. Keys in `en` **and** `ar`, enforced by the parity test (BR-8.11) |
| Validation, `403`, and `409` messages from the server | Already translated on arrival (BR-8.6). Render them; do not re-translate or map them |
| Enum values — `channel`, `direction`, `deliveryStatus`, `failureCode` | **Never translated on the wire.** Map to a label client-side (BR-8.7) |
| `body`, `recipientAddress` | User data, verbatim. `dir="auto"` on the body; the address does not mirror |
| Layout | CSS logical properties. `margin-inline-start`, never `margin-left` |

## Before this feature closes

The generated OpenAPI document is compared against
[`contracts/communications-api.md`](contracts/communications-api.md). A difference is a
defect in one of the two, and both are corrected — never one silently (`REV-021-02`).

If the contract moves while you are building, it arrives as a **Contract changes** entry
in [`plan.md`](plan.md) and this guide is regenerated. Two changes are already
foreseeable and are listed there: the `errors/forbidden` type name belongs to `004`, and
`errors/ticket-closed` is shared with `013`.
