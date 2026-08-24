# Frontend API Guide — Create Ticket (US-005)

Everything the frontend lane needs to build `/tickets/new` **without waiting for the
backend**. Derived from [`contracts/tickets-api.md`](contracts/tickets-api.md), which is
frozen.

> Start now. Do not wait for `BE-009-06`.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on every call
- **Locale:** send `Accept-Language: ar` or `en`. Read `Content-Language` on the response
  to know which was actually applied
- Errors are RFC 7807 `ProblemDetails`. **Branch on `type`, never on `title`** — `title`
  is translated, `type` is not
- Timestamps arrive UTC with a `Z`. Format for display client-side, in the active locale
- Enum values arrive as identifiers (`WhatsApp`, `InProgress`). Translate the **label**,
  never the value

## The endpoints this screen touches

| Method | Path | Purpose | Owned by |
|---|---|---|---|
| `GET` | `/api/customers?search=…` | The customer picker | `008` — read its guide for the list shape |
| `POST` | `/api/tickets` | Create | This contract |

The picker is a consumer of `008`, not of this feature. If `008` is not ready, build the
picker against its contract and stub the fetcher — `FE-009-02` depends on the endpoint,
`FE-009-01` and `FE-009-00` do not.

### Types — provisional until generated

Hand-written from the contract. **Marked provisional on purpose**: they are replaced by
types generated from the OpenAPI document once `/swagger` is real (ADR-011 §6), and the
swap is a deliberate task (`FE-009-05`), not something to forget.

```ts
// PROVISIONAL — replace with generated types when /swagger exists. See FE-009-05.
export type TicketCategory = 'Billing' | 'Technical' | 'Account' | 'General';
export type TicketPriority = 'Low' | 'Normal' | 'High' | 'Critical';
export type CommunicationChannel = 'Email' | 'WhatsApp' | 'LiveChat' | 'Sms' | 'WebForm';
export type TicketStatus =
  | 'New' | 'Open' | 'InProgress' | 'PendingCustomer' | 'Resolved' | 'Closed';

export interface CreateTicketRequest {
  customerId: string;
  subject: string;
  description: string;
  category: TicketCategory;
  priority?: TicketPriority | null;      // omit for Normal
  channel: CommunicationChannel;
}

export interface TicketCustomerSummary {
  id: string;
  fullName: string;
  email: string | null;
}

export interface TicketResponse {
  id: string;
  ticketNumber: string;                  // TCK-2026-000042 — display verbatim
  customer: TicketCustomerSummary;
  subject: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  channel: CommunicationChannel;
  status: TicketStatus;
  assignedToUserId: string | null;
  isEscalated: boolean;
  createdByUserId: string;
  createdAtUtc: string;                  // ISO 8601, Z
  updatedAtUtc: string;
  allowedTransitions: TicketStatus[];    // render these; never compute them
  version: string;                       // base64 rowversion — keep it, 011/012 need it
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  traceId: string;
  errors?: Record<string, string[]>;     // present on 400 and on this 404
}
```

`Sms`, not `SMS`. `WhatsApp` with a capital A. A hand-typed union that gets either wrong
produces a `400` that reads as a backend bug, which is the single most likely defect in
this file and the reason `FE-009-05` exists.

### Request

```http
POST {{baseUrl}}/api/tickets
Authorization: Bearer <JWT>
Accept-Language: ar
Content-Type: application/json

{
  "customerId": "8f1c2d34-5678-4abc-9def-0123456789ab",
  "subject": "لا يمكنني تسجيل الدخول",
  "description": "The password reset email never arrives.",
  "category": "Technical",
  "channel": "WhatsApp"
}
```

`priority` omitted → the server stores `Normal` and returns it. Send the field only when
the user changed it; sending `"Normal"` explicitly is equivalent, sending `""` is a `400`.

### Responses, and what the UI does with each

| Code | `type` | What the UI does |
|---|---|---|
| `201` | — | Read the `Location` header and navigate to the ticket detail. Toast the returned `ticketNumber` verbatim — Latin digits, no reformatting, in both locales |
| `400` | `errors/validation` | Attach each `errors[field]` message to that field and move focus to the first invalid one. The keys are request field names, so no mapping table is needed |
| `400` | `errors/malformed-request` | A bug in the client, not user error. Generic failure message, and it should never be reachable from this form |
| `401` | `errors/unauthenticated` | Session expired. Redirect to sign-in; this is not a form error |
| `404` | `errors/not-found` | The customer disappeared between picking and submitting. **Clear the picker selection**, explain, and keep every other field the user typed |

```ts
if (res.status === 404 && problem.type.endsWith('/not-found')) {
  // errors.customerId names the reference that failed to resolve
  clearSelectedCustomer();
  setFormError(t('tickets:new.customerGone'));
  // do NOT reset the form — the subject and description are the user's work
}
```

The `404` shares its `type` with every other unresolvable reference in the system, which
is deliberate. Branch on the **key** inside `errors` when the distinction matters:
`problem.errors?.customerId` is what identifies this case.

There is no `403` on this endpoint and no `409`. Both roles may create (BR-6), and two
identical tickets are two real tickets — the endpoint is not idempotent, so preventing a
double submit is the client's job (AC-15).

## Client-side validation — mirror, never authority

The Zod schema mirrors the server so the user is told sooner. Every rule below is also
enforced server-side; the client is not the authority (constitution III).

```ts
const schema = z.object({
  customerId:  z.string().uuid({ message: 'tickets:new.customerRequired' }),
  subject:     z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).min(1),
  category:    z.enum(['Billing', 'Technical', 'Account', 'General']),
  priority:    z.enum(['Low', 'Normal', 'High', 'Critical']).optional(),
  channel:     z.enum(['Email', 'WhatsApp', 'LiveChat', 'Sms', 'WebForm']),
});
```

`.trim().min(1)` and not `.min(1)`: a subject of three spaces passes a bare `min(1)` and
is a `400` at the server (AC-7). The client must trim before measuring, and must send the
value the user typed.

Four things the client deliberately does **not** do:

| Not done client-side | Why |
|---|---|
| Generate or predict the `ticketNumber` | It comes from a database sequence. Any client-side guess is wrong and would be shown to a customer |
| Compute `allowedTransitions` | The state machine lives in the domain, once (ADR-004). Render what the response carries |
| Send `createdByUserId` | Taken from the token; a body value is ignored (AC-12) |
| Check whether the customer exists before submitting | The picker's search is a convenience, not a guarantee. Only the write can answer it, and it answers with the `404` above |

The enum lists above are the one place this guide duplicates the contract, and it is why
`FE-009-05` replaces them with generated types. Until then, a value added on the server
is silently missing from the dropdown — the failure is a user who cannot select a
category that exists.

## States — every one is required

| State | Behaviour | AC |
|---|---|---|
| No customer selected | The ticket section renders **disabled with an explanation**, not hidden. A hidden section reads as a broken page | AC-14 |
| Searching | Debounced at 300ms, minimum 2 characters. Spinner inside the field, not over the page | AC-14 |
| No search matches | "No matches", plus a link to create a customer that returns here with the form preserved | AC-14 |
| Validating | Field-level messages on blur, before any request; character counters from 180 and 3800 | AC-15 |
| Submitting | Submit disabled and fields read-only, so a double-click sends one request | AC-15 |
| Error | Server messages attached to the fields the server named; focus moves to the first | AC-15 |
| Customer gone (`404`) | Selection cleared, everything else preserved | AC-15 |
| Success | Navigate using `Location`; toast the `ticketNumber` | AC-1 |

Absence of a state is a defect, not a gap (`docs/sdd/design/screens/README.md`).

## Localization

| Item | Rule |
|---|---|
| Labels, placeholders, button text, counters, helper text | Client-owned. Keys in `en` **and** `ar`, enforced by the parity test (BR-8.11) |
| Enum **labels** | Client-owned, one key per value of `category`, `priority`, `channel`. A missing key shows a fallback, not a crash — and the parity test cannot see a key missing from *both* catalogues, which is why `FE-009-05` generates the list from the enum |
| Validation messages from the server | Already translated on arrival (BR-8.6). Render them; do not re-translate or map them |
| `ticketNumber` | Latin digits in both locales (BR-8.13). Never formatted with a locale-aware number formatter — it is a string, not a number |
| `dir` | Set on the document root. `subject` and `description` carry `dir="auto"` so Arabic input aligns as it is typed |
| Layout | CSS logical properties. `margin-inline-start`, never `margin-left` |

Screen spec, element by element, with tokens and icons:
[`docs/sdd/design/screens/05-create-ticket.md`](../../docs/sdd/design/screens/05-create-ticket.md).
Feature-specific build detail: [`frontend-spec.md`](frontend-spec.md).

## Before this feature closes

The generated OpenAPI document is compared against
[`contracts/tickets-api.md`](contracts/tickets-api.md) (`REV-009-03`). A difference is a
defect in one of the two, and both are corrected — never one silently.

If the contract moves while you are building, it arrives as a **Contract changes** entry
in [`plan.md`](plan.md) and this guide is regenerated. A contract change discovered by
the frontend failing to compile is the failure this process exists to prevent.
