# Frontend API Guide — Customer Overview (US-004)

Everything the frontend lane needs to extend `/customers/:id` **without waiting for the
backend**. Derived from
[`contracts/customer-overview-api.md`](contracts/customer-overview-api.md), which is
frozen.

> Start now. Do not wait for `BE-018-05`.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on every call
- **Locale:** send `Accept-Language: ar` or `en`. Read `Content-Language` on the response
  to know which was actually applied
- Errors are RFC 7807 `ProblemDetails`. **Branch on `type`, never on `title`** — `title`
  is translated, `type` is not
- Timestamps arrive UTC with a `Z`. Format for display client-side, in the active locale

## The one endpoint

`GET /api/customers/{id}/overview`

No query string. No `limit`, no `page`, no `status` filter — the shape is fixed, which
means the query key is just the id.

### Types — provisional until generated

Hand-written from the contract. **Marked provisional on purpose**: they are replaced by
types generated from the OpenAPI document once the endpoint is real (ADR-011 decision 6),
and the swap is a deliberate task (`FE-018-07`), not something to forget.

```ts
// PROVISIONAL — replace with generated types when /swagger exists. See FE-018-07.

export type TicketStatus =
  | 'New' | 'Open' | 'InProgress' | 'PendingCustomer' | 'Resolved' | 'Closed';

export type TicketPriority = 'Low' | 'Normal' | 'High' | 'Critical';
export type TicketCategory = 'Billing' | 'Technical' | 'Account' | 'General';
export type TicketChannel  = 'Email' | 'WhatsApp' | 'LiveChat' | 'Sms' | 'WebForm';

// Same shape 008 returns from GET /api/customers/{id}. Import it from the customers
// feature rather than redeclaring it — one shape, one declaration (AC-13).
export interface CustomerResponse {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;            // E.164, normalised by the server
  companyName: string | null;
  notes: string | null;
  isActive: boolean;
  createdAtUtc: string;            // ISO 8601, Z
  updatedAtUtc: string;
  version: string;                 // base64 rowversion — 017 needs it
}

export interface RecentTicketResponse {
  id: string;
  ticketNumber: string;            // never localized, Latin digits (BR-8.13)
  subject: string;                 // user content — dir="auto"
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  channel: TicketChannel;
  isEscalated: boolean;
  assignedToUserId: string | null;  // null = unassigned, a normal state
  assignedToName: string | null;
  createdAtUtc: string;
}

export interface TicketCounts {
  total: number;
  // Every status is always present, including zeros (AC-3, AC-7). Record<> and not a
  // Partial<> deliberately: typing it as possibly-missing would push a `?? 0` into
  // every call site and hide a real server bug behind a default.
  byStatus: Record<TicketStatus, number>;
}

export interface CustomerOverviewResponse {
  customer: CustomerResponse;
  ticketCounts: TicketCounts;
  recentTickets: RecentTicketResponse[];   // [] when there are none, never null
  recentTicketsTruncated: boolean;         // true at 11+ tickets
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  traceId: string;
  errors?: Record<string, string[]>;       // present only on 400
}
```

### Request

```http
GET {{baseUrl}}/api/customers/8f1c2d34-5678-4abc-9def-0123456789ab/overview
Authorization: Bearer <JWT>
Accept-Language: ar
```

### Responses, and what the UI does with each

| Code | `type` | What the UI does |
|---|---|---|
| `200` | — | Render the strip from `customer`, the rail from `ticketCounts`, the section from `recentTickets`. Show "see all" only when `recentTicketsTruncated` is `true` |
| `400` | `errors/validation` | The id in the URL is not a GUID — a broken link, not a missing customer. Render the broken-link state; do **not** show the not-found page, which invites the user to look for a record that was never addressed |
| `401` | `errors/unauthenticated` | Session expired. Redirect to sign-in; this is not a screen state |
| `404` | `errors/not-found` | Full-page not-found with a link back to `/customers`. No `errors` object to read |

```ts
export async function fetchCustomerOverview(
  id: string,
  signal?: AbortSignal,
): Promise<CustomerOverviewResponse> {
  const res = await apiClient.get(`/customers/${id}/overview`, { signal });
  if (!res.ok) throw await toProblem(res);   // shared: parses ProblemDetails, keeps type
  return res.json();
}
```

## Query keys — read this before writing the hook

```ts
export const customerKeys = {
  detail:   (id: string) => ['customer', id] as const,
  overview: (id: string) => ['customer', id, 'overview'] as const,
};

export function useCustomerOverview(id: string) {
  return useQuery({
    queryKey: customerKeys.overview(id),
    queryFn: ({ signal }) => fetchCustomerOverview(id, signal),
  });
}
```

**The dangerous part of this feature.** Before `018`, the profile screen read
`['customer', id]`. After it, the screen reads `['customer', id, 'overview']`. Every
`invalidateQueries` written against the old key — `017-update-customer` invalidates the
profile after a save — will still run, still succeed, still log nothing, and no longer
refresh the screen it was written to refresh. The user saves an edit and the strip keeps
showing the old value until a hard reload.

`FE-018-06` sweeps every invalidation target. Two ways to make it safe, in order of
preference:

1. Invalidate the **prefix**: `invalidateQueries({ queryKey: ['customer', id] })` matches
   both keys, because TanStack Query matches keys by prefix. Prefer this — it stays
   correct when the next view of a customer is added.
2. Invalidate both keys explicitly. Correct today, and one more thing to remember later.

Nothing in this feature is a mutation, so this guide declares no invalidation of its own.
It changes what *other* features must invalidate, which is exactly why it is written down
here rather than left to be discovered.

## Rules the client mirrors but is never the authority for

| Rule | Server owns it | What the client does |
|---|---|---|
| The cap of 10 | AC-2 | Renders what arrived. It does **not** `slice(0, 10)` — if 11 rows ever arrive, that is a server defect and silently hiding it is how it survives |
| Truncation | AC-9 | Reads `recentTicketsTruncated`. It does **not** compute `total > 10`; two sources for one fact drift |
| Ordering | AC-2, BR-7.1 | Renders in the order received. No client-side re-sort — a re-sort without the `id` tie-break re-introduces exactly the instability the server's tie-break removed |
| Which statuses exist | BR-1 | Iterates `Object.entries(byStatus)`. It does **not** hold its own list of six statuses; that list is the thing that goes stale when a status is added |
| The sum of the counts | Server | Renders `total` as given. Summing `byStatus` client-side would produce a number that disagrees with the server's during any future partial-response change, and the disagreement would be invisible |

## States — all of them are required

| State | Condition | Behaviour | AC |
|---|---|---|---|
| Loading | `isPending` | Skeleton for the strip, the rail, and three ticket rows. Skeleton, not a spinner — the layout is known, so reserve it and avoid the reflow | AC-15 |
| Loaded, with tickets | `total > 0` | Strip, rail with all six rows, up to 10 ticket rows | AC-1 |
| **Empty** | `total === 0` | Rail shows every status at `0`. Section shows a title, one sentence, and the create-ticket action. **This is the common case, not an error** | AC-3 |
| No notes | `customer.notes === null` | Muted "no notes" in the notes region — its own empty state, separate from the tickets one | AC-15 |
| Truncated | `recentTicketsTruncated` | "See all" link to `/tickets?customerId={id}` under the last row | AC-9 |
| Not found | `404` | Full-page state, link back to `/customers` | AC-15 |
| Broken link | `400` | Distinct message: the address is malformed. Not the not-found page | AC-6, AC-15 |
| Error | anything else | Inline error with a retry, and the `traceId` shown small so a user can quote it | AC-15 |
| Forbidden | — | **Does not exist.** BR-6 permits both roles; there is no `403` on this endpoint. Recorded so the omission is visibly a decision | AC-12 |

Absence of a state is a defect, not a gap (`docs/sdd/design/screens/README.md`).

The empty state is the one to get right. A customer with no tickets is normal — every
customer is in that state between being created and having a ticket raised — and a
section that renders nothing at all is indistinguishable from a section that failed to
load. It gets a title, a sentence, and the action that resolves it.

## Localization

| Item | Rule |
|---|---|
| Status labels | From `tickets:status.*`, already in both catalogues from `010`. Reuse; do not add a second set under `customers:` |
| The ticket total | A counted noun. Plural keys with all six CLDR categories (BR-8.14). Never `count + ' ' + t('tickets')` |
| Timestamps | Locale-formatted client-side, Gregorian calendar, Latin digits (BR-8.13) |
| `ticketNumber` | Rendered as received. Not localized, not digit-shaped, `tabular-nums`, LTR |
| Email and phone | **Stay LTR inside the RTL layout.** An E.164 number rendered right-to-left is unusable |
| User content | `fullName`, `companyName`, `notes`, and every ticket `subject` carry `dir="auto"` |
| Layout | CSS logical properties. The rail moves to the inline-end in Arabic for free; `margin-inline-start`, never `margin-left` |
| Server messages | The `404` and `400` titles arrive already translated. Render them; do not re-translate or map them |

Screen spec, element by element, with tokens and icons:
[`docs/sdd/design/screens/07-customer-profile.md`](../../docs/sdd/design/screens/07-customer-profile.md).
Feature-specific bindings, keys, and RTL obligations:
[`frontend-spec.md`](frontend-spec.md).

## Before this feature closes

The generated OpenAPI document is compared against
[`contracts/customer-overview-api.md`](contracts/customer-overview-api.md) (`REV-018-03`).
A difference is a defect in one of the two, and both are corrected — never one silently.

If the contract moves while you are building, it arrives as a **Contract changes** entry
in [`plan.md`](plan.md) and this guide is regenerated. Note that this contract embeds
`008`'s customer shape, so a change *there* is a change *here*.
