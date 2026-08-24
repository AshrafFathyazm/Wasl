# Frontend API Guide — Customer list and profile (US-002)

Everything the frontend lane needs to build `/customers` and `/customers/:id` **without
waiting for the backend**. Derived from
[`contracts/customers-read-api.md`](contracts/customers-read-api.md), which is frozen.

> Start now. Do not wait for `BE-008-05`.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on every call
- **Locale:** send `Accept-Language: ar` or `en`. Read `Content-Language` on the
  response to know which was actually applied
- Errors are RFC 7807 `ProblemDetails`. **Branch on `type`, never on `title`** — `title`
  is translated, `type` is not
- Timestamps arrive UTC with a `Z`. Format for display client-side, in the active locale,
  Gregorian calendar and Latin digits (BR-8.13)
- Neither endpoint returns `403`. Both roles may read a customer (BR-6), so there is no
  forbidden state to build on these two screens

## The two endpoints

| Method | Path | Screen |
|---|---|---|
| `GET` | `/api/customers?page&pageSize&search` | `/customers` |
| `GET` | `/api/customers/{id}` | `/customers/:id` |

### Types — provisional until generated

Hand-written from the contract. **Marked provisional on purpose**: they are replaced by
types generated from the OpenAPI document once the endpoints are real (ADR-011 §6), and
the swap is a deliberate task (`FE-008-05`), not something to forget.

```ts
// PROVISIONAL — replace with generated types when /swagger exists. See FE-008-05.

export interface CustomerListItem {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;          // E.164
  companyName: string | null;
  createdAtUtc: string;          // ISO 8601, Z
}
// No `notes`, no `version` on a list row — see the contract for why.

export interface CustomerDetailResponse {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;          // E.164
  companyName: string | null;
  notes: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;          // detail only; 007's 201 body does not have it
  version: string;               // base64 rowversion — keep it, 017 needs it
}

export interface PagedResult<T> {
  items: T[];                    // never null; empty array when nothing matched
  page: number;                  // the EFFECTIVE page after clamping
  pageSize: number;              // the EFFECTIVE page size after clamping
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
  errors?: Record<string, string[]>;   // present on 400; absent on 404
}
```

`007` exports a `CustomerResponse` for its `201` body. **It is not this type.** It has no
`updatedAtUtc`, so reusing it for the profile compiles until the profile reads that field
and then does not. Three names, three shapes.

### Query keys

```ts
export const customerKeys = {
  list:   (p: { page: number; pageSize: number; search: string }) =>
            ['customers', 'list', p] as const,
  detail: (id: string) => ['customers', 'detail', id] as const,
};
```

The parsed URL params object **is** the list key (ADR-011 §2), so caching per
page-and-search combination falls out of the design rather than being built. Parse the
search params once at the route, pass the typed object down.

## Responses, and what the UI does with each

### `GET /api/customers`

| Code | `type` | What the UI does |
|---|---|---|
| `200`, `items` non-empty | — | Render rows. **Use the returned `page` and `pageSize`**, not the ones you sent — the server clamps |
| `200`, `items: []`, no `search` | — | "No customers yet" empty state with a create CTA |
| `200`, `items: []`, `search` present | — | **A different empty state**: "nothing matched", a `Clear search`, and a create CTA carrying the term. Not the same component as the one above |
| `400` | `errors/validation` | Only reachable by hand-editing the URL to a non-integer `page`. Reset to page 1 rather than showing a form error — there is no form |
| `401` | `errors/unauthenticated` | Session expired. Redirect to sign-in |

The two empty states are the most important branch on this screen. "Nothing matched" is
the exact moment someone is about to create a duplicate, and it is the reason this screen
exists (`docs/sdd/design/screens/06-customers-list.md`).

### `GET /api/customers/{id}`

| Code | `type` | What the UI does |
|---|---|---|
| `200` | — | Render the profile |
| `400` | `errors/validation` | The id in the URL is not a `Guid` — a mistyped or truncated link. Show the **not-found** state, not a validation error: to the user, "this link is broken" is one situation, not two |
| `401` | `errors/unauthenticated` | Redirect to sign-in |
| `404` | `errors/not-found` | Full-page not-found with a route back to the list. Distinct from the error state — a `404` is an answer, a network failure is not (ADR-011 §5) |

```ts
if (!res.ok) {
  const problem: ProblemDetails = await res.json();
  if (problem.status === 404 || problem.type.endsWith('/validation')) throw new NotFound();
  if (problem.status === 401) throw new SessionExpired();
  throw new ApiError(problem);          // renders the error state with problem.traceId
}
```

`traceId` goes on the error state, verbatim and untranslated. It is what turns "it broke"
into a log line someone can find.

## Rules the client mirrors but is never the authority for

| Rule | Client behaviour | Server is the authority because |
|---|---|---|
| Default page size 20, maximum 100 (BR-7.2) | The rows-per-page control offers 10 / 20 / 50 / 100 | The server clamps whatever arrives. Render the `pageSize` it returned |
| `page` ≥ 1 | Pagination controls never generate `0` | `page=0` is clamped, not rejected — a hand-edited URL still works |
| Search is a case-insensitive substring | Nothing. Do not filter client-side | Filtering the current page client-side would search 20 of 137 rows and look like a broken search |
| Order is `fullName`, then `id` | Nothing. Render in the order received | Re-sorting the page client-side breaks pagination: page 2 would be sorted independently of page 1 |
| Arabic search does not normalise hamza forms | Nothing — do **not** normalise the term client-side | Normalising the term without a normalised column to match would make search worse, not better. Q-7 |

Three things the client deliberately does **not** do:

| Not done client-side | Why |
|---|---|
| Escaping `%`, `_`, `[` in the search term | The server escapes it. Doing it twice produces `[[%]]`, which matches nothing |
| Trimming the search term before deciding whether to send it | Send it; the server treats whitespace-only as absent. One rule, one place |
| Caching a page and paging through it locally | `totalCount` is what the footer reads, and the next page is a request |

## States — all of them are required

### `/customers`

| State | Behaviour | AC |
|---|---|---|
| Loading (first) | Skeleton rows at the real 61px height, so nothing shifts when data arrives | AC-13 |
| Refetching (search or page change) | Dim the existing rows, spinner in the toolbar. **Not** skeletons — replacing populated rows on every keystroke makes a fast interface feel slow | — |
| Empty — none exist | Illustration plus create CTA | AC-13 |
| Empty — no matches | Different message, `Clear search`, create CTA carrying the term | AC-13 |
| Error | Message, `traceId`, retry | AC-13 |

### `/customers/:id`

| State | Behaviour | AC |
|---|---|---|
| Loading | Skeleton header and contact strip | AC-12 |
| Loaded | Profile | AC-1 |
| Not found (`404` or a malformed id) | Full-page state, route back to the list | AC-12 |
| Error | Message, `traceId`, retry — distinct from not-found | AC-12 |
| No notes | Muted "no notes", not an absent section | AC-12 |

There is **no forbidden state** on either screen (BR-6) and **no conflict state** (nothing
here mutates). Both are recorded so the omission is visibly a decision.

Absence of a state is a defect, not a gap (`docs/sdd/design/screens/README.md`).

## Localization

| Item | Rule |
|---|---|
| Column headings, search placeholder, pagination, both empty states, the not-found copy | Client-owned. Keys in `en` **and** `ar`, enforced by the parity test (BR-8.11) |
| Server messages on `400` / `404` | Already translated on arrival (BR-8.6). Render them; do not re-translate or map them |
| Field values (`fullName`, `companyName`, `notes`) | User content. Rendered verbatim, `dir="auto"`, never translated (BR-8.10) |
| `email` and `phone` | **Stay LTR in both locales.** An E.164 number rendered right-to-left is unreadable and un-diallable |
| Row counts ("137 customers") | Plural keys, all six CLDR categories for `ar` (BR-8.14). Never `count + " customers"` |
| Layout | CSS logical properties. `margin-inline-start`, never `margin-left`. Pagination chevrons mirror; the digits do not |

Screen specs, element by element, with tokens and icons:
[`06-customers-list.md`](../../docs/sdd/design/screens/06-customers-list.md) and
[`07-customer-profile.md`](../../docs/sdd/design/screens/07-customer-profile.md).

**Two things in those files are not in this feature.** The profile's ticket rail and
counts, and the list's `Tickets` column, both need `dbo.Tickets`, which does not exist
until `009`. They arrive with `018`. The profile's load also shows
`/api/customers/{id}/overview` there — that is `018`'s endpoint; build against
`/api/customers/{id}` and the route does not change when it swaps.

## Before this feature closes

The generated OpenAPI document is compared against
[`contracts/customers-read-api.md`](contracts/customers-read-api.md) — `REV-008-03`. A
difference is a defect in one of the two, and both are corrected, never one silently.

If the contract moves while you are building, it arrives as a **Contract changes** entry
in [`plan.md`](plan.md) and this guide is regenerated. A contract change discovered by
the frontend failing to compile is the failure this process exists to prevent.
