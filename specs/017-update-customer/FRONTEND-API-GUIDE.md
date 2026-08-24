# Frontend API Guide — Update Customer (US-003)

Everything the frontend lane needs to build `/customers/:id/edit` **without waiting for
the backend**. Derived from
[`contracts/customer-update-api.md`](contracts/customer-update-api.md), which is frozen.

> Start now. Do not wait for `BE-017-06`.
>
> One real dependency: the version has to come from somewhere, and that is
> `GET /api/customers/{id}` from `008-customer-list-and-profile`. Mock it until it exists.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on every call
- **Locale:** send `Accept-Language: ar` or `en`. Read `Content-Language` on the response
  to know which was actually applied
- Errors are RFC 7807 `ProblemDetails`. **Branch on `type`, never on `title`, and on this
  endpoint never on the status code either** — there are two different `409`s
- Timestamps arrive UTC with a `Z`. Format for display client-side, in the active locale
- `version` is **opaque**. Store it, echo it, never parse or compare it

## The endpoints this screen touches

| Method | Path | Owned by | Why this screen needs it |
|---|---|---|---|
| `GET` | `/api/customers/{id}` | `008` | The current values **and the `version`** to send back |
| `PUT` | `/api/customers/{id}` | `017` | The save |

### Types — provisional until generated

Hand-written from the contract. **Marked provisional on purpose**: they are replaced by
types generated from the OpenAPI document once the endpoint is real (ADR-011 decision 6),
and the swap is a deliberate task (`FE-017-09`), not something to forget.

```ts
// PROVISIONAL — replace with generated types when /swagger exists. See FE-017-09.

export interface UpdateCustomerRequest {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  notes?: string | null;
  expectedVersion: string;       // the base64 `version` that came back from the GET
}

export interface CustomerResponse {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;          // E.164, normalised by the server
  companyName: string | null;
  notes: string | null;
  createdAtUtc: string;          // ISO 8601, Z
  updatedAtUtc: string;          // ISO 8601, Z
  version: string;               // base64 rowversion — OPAQUE. Store it, echo it, never parse it
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  traceId: string;
  errors?: Record<string, string[]>;   // present only on 400 and on the duplicate 409
}
```

`UpdateCustomerRequest` marks the four contact/detail fields optional because the wire
format allows their absence. **The UI must still send all of them on every save** — see
the next section.

### Request

```http
PUT {{baseUrl}}/api/customers/8f1c2d34-5678-4abc-9def-0123456789ab
Authorization: Bearer <JWT>
Accept-Language: ar
Content-Type: application/json

{
  "fullName": "علي الأحمد",
  "email": "Ali@Example.COM",
  "phone": "+966 50 123 4567",
  "companyName": "Riyadh Holdings Group",
  "notes": null,
  "expectedVersion": "AAAAAAAAB9E="
}
```

## `PUT` replaces. It does not merge.

The single most expensive mistake available on this screen:

```ts
// WRONG — clears phone, companyName, and notes, and returns 200 while doing it
await updateCustomer(id, { fullName: form.fullName, email: form.email, expectedVersion });
```

An omitted or `null` optional field is **cleared** (AC-12). The request succeeds, the
response is `200`, and nothing anywhere reports that four fields were emptied. The user
finds out when somebody tries to phone the customer.

```ts
// RIGHT — the form is initialised from the GET, so sending the whole object is also
// the simplest thing to write
await updateCustomer(id, { ...form, expectedVersion: heldVersion });
```

This is why the form is prefilled from `GET` rather than started empty, and why
`CustomerForm` from `007` is reused with an `initialValues` prop rather than reimplemented.

## Responses, and what the UI does with each

| Code | `type` | What the UI does |
|---|---|---|
| `200` | — | **Store the returned `version`** (see below). Write the response into the query cache, show a success toast, navigate back to the profile. Render the returned `email`/`phone`, not what the user typed — the server normalised them |
| `400` | `errors/validation` | Attach each `errors[field]` message to that field. `email` and `phone` both appear when the update would leave neither — show it on both. `expectedVersion` appearing here is a **client bug**, not a user error: it means the version was lost or mangled |
| `401` | `errors/unauthenticated` | Session expired. Redirect to sign-in; this is not a form error |
| `404` | `errors/not-found` | The customer is gone. Inline not-found state with a link back to the list — not a toast, and not the conflict notice |
| `409` | `errors/duplicate-customer` | Attach `errors[field]` to the named field, exactly as on create. **Not** the conflict notice: the user has to change what they typed, not reload |
| `409` | `errors/concurrency-conflict` | Render the conflict notice: explanation plus a **Reload** action. **Do not retry. Do not resubmit. Do not merge** |

### Branching, with the trap named

```ts
// The status code is not enough on this endpoint.
if (problem.status === 409) {
  if (problem.type.endsWith('/concurrency-conflict')) {
    setConflict(true);                       // FE-017-04 — reload path, no retry
  } else if (problem.type.endsWith('/duplicate-customer')) {
    for (const [field, messages] of Object.entries(problem.errors ?? {})) {
      setError(field as keyof UpdateCustomerRequest, { message: messages[0] });
    }
  }
}
```

A `switch` on `res.status` alone puts a "reload" button in front of a user whose only
problem is a duplicate email, and a field-level message in front of a user whose record
has moved underneath them. Both are wrong, and both look like they work in whichever
case was tested first.

## The version, and the bug that hides in it

The `200` response carries a **new** `version`. Store it.

```ts
const mutation = useMutation({
  mutationFn: (body: UpdateCustomerRequest) => updateCustomer(id, body),
  onSuccess: (updated) => {
    // Replace, do not just invalidate: the held version must be the one the server
    // just returned, with no window in which the form holds the previous one.
    queryClient.setQueryData(['customer', id], updated);
  },
});
```

| If you… | What happens |
|---|---|
| `setQueryData` with the response | The next save works (AC-23) |
| `invalidateQueries` only | There is a window between the save and the refetch during which the form holds the **old** version. A save in that window returns `409` the user did nothing to earn |
| Keep the version from the first load | Every save after the first returns `409`. **Invisible in single-user testing**, because a human rarely saves twice without reloading — and obvious to a reviewer who tries |

`TEST-017-17` is the test for this: save twice in a row with no reload between them.

## The conflict path — this is the acceptance criterion, not the fallback

AC-6, and ADR-006 accepted optimistic concurrency on the explicit basis that the conflict
is surfaced to a human. What the notice must do:

| Requirement | Detail |
|---|---|
| Explain | Someone else changed this customer since it was opened. Say it in a sentence, from a catalogue key, in both languages |
| Offer exactly one action | **Reload** — refetch `GET /api/customers/{id}` and repopulate the form with the current values and the current version |
| Never auto-retry | Not on a timer, not on a second click, not "one more attempt". The server cannot know whether the user's edit is still what they intend, and neither can the client |
| Never merge silently | No "keep my value for the fields they did not touch". Field-level merge is out of scope, and a wrong merge is a silent data change |
| Not lose what was typed | Show the user's entered values alongside the notice until they choose Reload. Reload is a deliberate discard, not an ambush |
| Move focus | Focus goes to the notice, not to a Save button that will fail again (`FE-017-11`) |

The `409` body carries **no** customer data and no current version (AC-22), so the reload
is a real refetch. There is nothing in the error to shortcut it with.

## Client-side validation — mirror, never authority

The Zod schema is `007`'s, plus `expectedVersion`. Every rule is also enforced
server-side; the client is not the authority (ADR-003).

```ts
const schema = z.object({
  fullName:        z.string().trim().min(1).max(200),
  email:           z.string().trim().email().max(320).optional().or(z.literal('')),
  phone:           z.string().trim().max(20).optional().or(z.literal('')),
  companyName:     z.string().trim().max(200).optional().or(z.literal('')),
  notes:           z.string().trim().max(2000).optional().or(z.literal('')),
  expectedVersion: z.string().min(1),      // present, and nothing more — it is opaque
}).refine(v => !!v.email || !!v.phone, {
  message: 'errors.contactRequired',       // i18n key, not a sentence
  path: ['email'],                         // and mirror onto ['phone'] in the handler
});
```

Rules the client mirrors but is never the authority for:

| Mirrored | Authority | Why the client still does it |
|---|---|---|
| `fullName` required, ≤200 | `400` naming `fullName` | The user is told before a round trip |
| At least one contact method | `400` naming both, then `CK_Customers_Contact` | Same. AC-3 requires **both** field names, and Zod's `refine` attaches to one path — set the second in the submit handler |
| Field maximums | `400` | Same |

Rules the client deliberately does **not** implement:

| Not done client-side | Why |
|---|---|
| E.164 normalisation | The server owns it (BR-4.3). Two implementations of one rule is how they diverge |
| Lowercasing the email before sending | Same reason (BR-4.2). Send what was typed; render what came back |
| Duplicate checking | Only the database can answer it (BR-4.8), and a check-then-save is a race |
| Comparing versions, or deciding whether one is "newer" | `expectedVersion` is opaque. The comparison happens in the `WHERE` clause of an `UPDATE`, on the server, once |
| Deciding whether anything changed before saving | Allowed as a UX nicety (disable Save on a pristine form), but it is not the rule. A no-op save is a valid `200` with an empty audit diff |

## States — every one of them is required

| State | Behaviour | AC |
|---|---|---|
| Loading | Skeleton in the form's shape while the `GET` runs. Not a spinner replacing the page | — |
| Idle / prefilled | Current values, Save enabled | AC-1 |
| Validating | Field-level messages on blur, before any request | AC-3, AC-11 |
| Submitting | Save disabled while pending, so a double-click sends one request | AC-6, AC-15 |
| Field error | Server messages attached to the named fields, inline — duplicate `409` included | AC-2, AC-8 |
| **Conflict** | The notice plus Reload. No retry | AC-6 |
| Not found | Inline not-found state, link back to the list | AC-5 |
| Success | Toast, navigate to the profile, cache updated | AC-1, AC-23 |

Absence of a state is a defect, not a gap (`docs/sdd/design/screens/README.md`). There is
no **forbidden** state on this screen: both roles may update a customer (BR-6, AC-21). Do
not build one — that absence is recorded so it reads as a decision.

## Localization

| Item | Rule |
|---|---|
| Labels, buttons, the conflict title and explanation, the Reload action, the not-found state | Client-owned. Keys in `en` **and** `ar`, enforced by the parity test (BR-8.11) |
| Validation, duplicate, and concurrency messages from the server | Already translated on arrival. Render them; do not re-translate or map them |
| `dir` | Set on the document root. Every input rendering user content carries `dir="auto"` |
| Email and phone inputs | **Stay LTR even under `ar`.** Typing an address right-to-left puts the cursor in the wrong place and the value reads scrambled (`08-create-customer.md`) |
| Layout | CSS logical properties. `margin-inline-start`, never `margin-left`. The conflict notice's icon and action are the new direction-sensitive elements |
| `version`, `traceId`, `type` | Never translated, never localized, never formatted (BR-8.7) |

Screen spec, element by element:
[`docs/sdd/design/screens/08-create-customer.md`](../../docs/sdd/design/screens/08-create-customer.md)
— the edit variant — with the entry point in
[`07-customer-profile.md`](../../docs/sdd/design/screens/07-customer-profile.md)
(`[Edit]`, described there as hidden until this story ships).

## Before this feature closes

The generated OpenAPI document is compared against
[`contracts/customer-update-api.md`](contracts/customer-update-api.md). A difference is a
defect in one of the two, and both are corrected — never one silently. Check specifically
that **both** `409` types are documented; a generated document that lists one `409` is the
likely failure, and it is the one the client cannot work around.

If the contract moves while you are building, it arrives as a **Contract changes** entry in
[`plan.md`](plan.md) and this guide is regenerated. A contract change discovered by the
frontend failing to compile is the failure this process exists to prevent.
