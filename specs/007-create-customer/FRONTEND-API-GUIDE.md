# Frontend API Guide — Create Customer (US-001)

Everything the frontend lane needs to build `/customers/new` **without waiting for the
backend**. Derived from [`contracts/customers-api.md`](contracts/customers-api.md),
which is frozen.

> Start now. Do not wait for `BE-007-06`.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on every call
- **Locale:** send `Accept-Language: ar` or `en`. Read `Content-Language` on the
  response to know which was actually applied
- Errors are RFC 7807 `ProblemDetails`. **Branch on `type`, never on `title`** — `title`
  is translated, `type` is not
- Timestamps arrive UTC with a `Z`. Format for display client-side, in the active locale

## The one endpoint

`POST /api/customers`

### Types — provisional until generated

Hand-written from the contract. **Marked provisional on purpose**: they are replaced by
types generated from the OpenAPI document once the endpoint is real (ADR-011 decision
6), and the swap is a deliberate task (`FE-007-01`), not something to forget.

```ts
// PROVISIONAL — replace with generated types when /swagger exists. See FE-007-01.
export interface CreateCustomerRequest {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  notes?: string | null;
}

export interface CustomerResponse {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;          // E.164, normalised by the server
  companyName: string | null;
  notes: string | null;
  createdAtUtc: string;          // ISO 8601, Z
  version: string;               // base64 rowversion — keep it, 017 needs it
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  traceId: string;
  errors?: Record<string, string[]>;   // present only on 400 and 409
}
```

### Request

```http
POST {{baseUrl}}/api/customers
Authorization: Bearer <JWT>
Accept-Language: ar
Content-Type: application/json

{ "fullName": "علي الأحمد", "email": "Ali@Example.COM", "phone": "+966 50 123 4567" }
```

### Responses, and what the UI does with each

| Code | `type` | What the UI does |
|---|---|---|
| `201` | — | Read the `Location` header, navigate to that customer's profile. **Render the returned `email`/`phone`, not what the user typed** — the server normalised them |
| `400` | `errors/validation` | Attach each `errors[field]` message to that field. `email` and `phone` both appear when neither was provided — show it on both |
| `401` | `errors/unauthenticated` | Session expired. Redirect to sign-in; this is not a form error |
| `409` | `errors/duplicate-customer` | Attach `errors[field]` to the named field. **Not a banner** — the user needs to see it where the problem is. There is no existing-customer id to link to, by design (BR-4.7) |

```ts
if (res.status === 409 && problem.type.endsWith('/duplicate-customer')) {
  for (const [field, messages] of Object.entries(problem.errors ?? {})) {
    setError(field as keyof CreateCustomerRequest, { message: messages[0] });
  }
}
```

## Client-side validation — mirror, never authority

The Zod schema mirrors the server so the user is told sooner. Every rule below is also
enforced server-side; the client is not the authority (ADR-003).

```ts
const schema = z.object({
  fullName:    z.string().trim().min(1).max(200),
  email:       z.string().trim().email().max(320).optional().or(z.literal('')),
  phone:       z.string().trim().max(20).optional().or(z.literal('')),
  companyName: z.string().trim().max(200).optional().or(z.literal('')),
  notes:       z.string().trim().max(2000).optional().or(z.literal('')),
}).refine(v => !!v.email || !!v.phone, {
  message: 'errors.contactRequired',      // i18n key, not a sentence
  path: ['email'],                        // and mirror onto ['phone'] — see below
});
```

Three things the client deliberately does **not** do:

| Not done client-side | Why |
|---|---|
| E.164 normalisation | The server owns it (BR-4.3). Two implementations of one rule is how they diverge |
| Lowercasing the email before sending | Same reason (BR-4.2). Send what was typed; render what came back |
| Duplicate checking | Only the database can answer it (BR-4.8) |

Zod's `refine` attaches to one path, so the at-least-one-contact message is set on
`phone` as well in the submit handler — AC-3 requires **both** fields to be named.

## States — all five are required

| State | Behaviour | AC |
|---|---|---|
| Idle | Empty form, submit enabled | |
| Validating | Field-level messages appear on blur, before any request | AC-16 |
| Submitting | Submit disabled while pending, so a double-click sends one request | AC-17 |
| Error | Field-level messages from the server, attached to the named fields | AC-16 |
| Success | Navigate using `Location` | AC-1 |

Absence of a state is a defect, not a gap (`docs/sdd/design/screens/README.md`).

## Localization

| Item | Rule |
|---|---|
| Labels, placeholders, button text, helper text | Client-owned. Keys in `en` **and** `ar`, enforced by the parity test (BR-8.11) |
| Validation and duplicate messages from the server | Already translated on arrival. Render them; do not re-translate or map them |
| `dir` | Set on the document root. Every input rendering user content carries `dir="auto"` — an Arabic name in an English form is normal (ADR-007 decision 8) |
| Layout | CSS logical properties. `margin-inline-start`, never `margin-left` |

Screen spec, element by element, with tokens and icons:
[`docs/sdd/design/screens/08-create-customer.md`](../../docs/sdd/design/screens/08-create-customer.md).

## Before this feature closes

The generated OpenAPI document is compared against
[`contracts/customers-api.md`](contracts/customers-api.md). A difference is a defect in
one of the two, and both are corrected — never one silently.

If the contract moves while you are building, it arrives as a **Contract changes** entry
in [`plan.md`](plan.md) and this guide is regenerated. A contract change discovered by
the frontend failing to compile is the failure this process exists to prevent.
