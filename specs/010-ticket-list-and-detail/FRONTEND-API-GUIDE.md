# Frontend API Guide — Ticket list and detail (US-006 read half)

Everything the frontend lane needs to build `/tickets` and `/tickets/:id` **without
waiting for the backend**. Derived from
[`contracts/tickets-list-api.md`](contracts/tickets-list-api.md), which is frozen.

> Start now. Do not wait for `BE-010-03`.

Filters and search are **not** in this feature. They arrive in `015` as extra query
parameters on the same endpoint, and nothing you build here has to change when they do —
provided `page` and `pageSize` are read from the URL rather than from component state.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on every call
- **Locale:** send `Accept-Language: ar` or `en`. Read `Content-Language` on the response
  to know which was actually applied
- Errors are RFC 7807 `ProblemDetails`. **Branch on `type`, never on `title`** — `title`
  is translated, `type` is not
- Timestamps arrive UTC with a `Z`. Format for display client-side, in the active locale
- Enum values arrive as identifiers. `status === 'InProgress'` in every locale; the label
  comes from `t('tickets:status.InProgress')`

## The two endpoints

```text
GET /api/tickets?page&pageSize      → paged envelope
GET /api/tickets/{id}               → detail, including allowedTransitions
```

### Types — provisional until generated

Hand-written from the contract. **Marked provisional on purpose**: they are replaced by
types generated from the OpenAPI document once the endpoints are real (ADR-011 §6), and
the swap is a deliberate task (`FE-010-08`), not something to forget.

```ts
// PROVISIONAL — replace with generated types when /swagger exists. See FE-010-08.

export type TicketStatus =
  | 'New' | 'Open' | 'InProgress' | 'PendingCustomer' | 'Resolved' | 'Closed';
export type TicketPriority = 'Low' | 'Normal' | 'High' | 'Critical';
export type TicketCategory = 'Billing' | 'Technical' | 'Account' | 'General';
export type Channel = 'Email' | 'WhatsApp' | 'LiveChat' | 'Sms' | 'WebForm';

export interface PagedResult<T> {
  items: T[];
  page: number;          // the EFFECTIVE page after clamping
  pageSize: number;      // the EFFECTIVE page size after clamping
  totalCount: number;
  totalPages: number;    // 0 when totalCount is 0 — not 1
}

export interface TicketListItem {
  id: string;
  ticketNumber: string;          // TCK-2026-000042, Latin digits in every locale
  subject: string;               // user content — dir="auto"
  customerId: string;
  customerName: string;          // user content — dir="auto"
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  channel: Channel;
  assigneeId: string | null;     // null together with assigneeName
  assigneeName: string | null;
  isEscalated: boolean;
  createdAtUtc: string;          // ISO 8601, Z
}

export interface UserRef { id: string; fullName: string }

export interface TicketDetail {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;           // user content — dir="auto", preserve line breaks
  customer: UserRef;             // always present
  category: TicketCategory;
  priority: TicketPriority;
  channel: Channel;
  status: TicketStatus;
  assignee: UserRef | null;      // null while unassigned
  createdBy: UserRef;
  isEscalated: boolean;
  escalatedAtUtc: string | null;
  escalatedBy: UserRef | null;
  escalationReason: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
  closedAtUtc: string | null;
  allowedTransitions: TicketStatus[];  // always present; [] for a Closed ticket
  version: string;               // base64 rowversion — keep it, 011 and 012 need it
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  traceId: string;
  errors?: Record<string, string[]>;   // present only on 400
}
```

`version` is not used by anything on these two screens. **Keep it in the type and keep it
in the cached object anyway** — `011-assign-ticket` and `012-change-ticket-status` send it
back as `expectedVersion`, and dropping it here means they refetch to get a value the
cache already had.

### Query keys

```ts
export const ticketKeys = {
  list: (params: { page: number; pageSize: number }) => ['tickets', 'list', params] as const,
  detail: (id: string) => ['tickets', 'detail', id] as const,
};
```

The list key is the **parsed parameter object**, so a page change is a different cache
entry and going back is instant. `015` adds filter properties to that same object and the
caching per filter combination falls out of it (ADR-011 §2) — which is why the key is an
object from the start rather than `['tickets', page, pageSize]`.

## Responses, and what the UI does with each

### `GET /api/tickets`

| Code | `type` | What the UI does |
|---|---|---|
| `200`, `items` non-empty | — | Render the table. **Use the returned `page` and `pageSize`, not the requested ones** — the server clamps and the control must show what is actually in effect |
| `200`, `items: []`, `totalCount: 0` | — | The "no tickets" empty state: illustration, message, and a CTA to create one. This is a valid answer, not a failure (ADR-011 §5) |
| `200`, `items: []`, `totalCount > 0` | — | The requested page is past the end. Offer page 1 rather than showing a bare empty table |
| `400` | `errors/validation` | Only reachable by hand-editing the URL to a non-numeric `page`. Fall back to page 1 and drop the bad parameter |
| `401` | `errors/unauthenticated` | The session expired. Redirect to sign-in; this is not a list state |
| Network failure / `5xx` | — | Error state with the message, the `traceId`, and a retry |

### `GET /api/tickets/{id}`

| Code | `type` | What the UI does |
|---|---|---|
| `200` | — | Render the detail. The action menu is a `map` over `allowedTransitions`; an empty array means **render no action control at all**, not a disabled one |
| `401` | `errors/unauthenticated` | Redirect to sign-in |
| `404` | `errors/not-found` | Full-page not-found with a route back to `/tickets`. Do **not** let it reach the error boundary — a `404` is information, a thrown render error is not (ADR-011 §5) |

## The one rule this screen exists to respect

```ts
// Correct: the server is the authority on what may happen next.
{ticket.allowedTransitions.map(next => (
  <MenuItem key={next} label={t(`tickets:action.${next}`)} />
))}

// Wrong, and it will look right for about a week:
// const next = TRANSITIONS[ticket.status];
```

**There is no client-side copy of the state machine** (ADR-004, constitution III). Not a
map, not a `switch`, not "just for the disabled state". Two copies of BR-1 agree on the
day they are written and drift silently afterwards, and the drift surfaces as a `409` on
an action the UI offered the user.

Two consequences to design for, both correct:

| Consequence | Handling |
|---|---|
| The menu can offer a transition the server rejects — `Start work` on an unassigned ticket is a `409` (BR-1.3) | The `409` message is shown inline next to the control, and the ticket is refetched. `012` owns that path; `010` only has to not prevent it |
| A user without permission can see an item they may not use — a `403` (BR-2, BR-6) | Same shape, inline. The array answers "what can happen to this ticket", not "what may you do" |

## Client-side rules — mirror, never authority

Nothing on these two screens validates anything. The only rules the client mirrors are
presentational, and each is also true server-side:

| Mirrored | Where the authority is |
|---|---|
| `pageSize` capped at 100 in the selector | BR-7.2, clamped server-side. The selector offers 10 / 20 / 50 / 100 so the clamp is never reached by accident |
| `page` ≥ 1 | Clamped server-side |
| The BR-1 status colour map | `docs/sdd/design/screens/03-tickets-list.md`. It is presentation, not a rule — but red is never a status, only `Critical` priority and escalation |

Three things the client deliberately does **not** do:

| Not done client-side | Why |
|---|---|
| Deriving `allowedTransitions` | ADR-004. See above |
| Sorting or re-sorting rows in the browser | The order is the server's contract (BR-7.1 plus the `Id` tie-breaker). Client-side sorting of one page produces an order that is wrong across pages and looks right on the page you are looking at |
| Filtering the fetched page in the browser | `015` filters server-side. Filtering one page of 20 would silently answer a different question from the one the user asked |

## States — all five are required

| State | Behaviour | AC |
|---|---|---|
| Loading | Skeleton rows at the real row height, so there is no layout shift when data lands | AC-15 |
| Empty — no tickets | Illustration, message, CTA to create one | AC-15 |
| Error | Message, the `traceId`, and a retry | AC-15 |
| Not found (detail) | Full-page state with a route back to the list | AC-19 |
| Loaded, no permitted actions | `allowedTransitions: []` → no action control | AC-23 |

Absence of a state is a defect, not a gap (`docs/sdd/design/screens/README.md`).

The "no matches" empty state — different message, plus `Clear filters` — belongs to `015`.
It is deliberately **not** the same state as "no tickets", and building one state for both
now is what makes them the same later.

## Localization

| Item | Rule |
|---|---|
| Column headers, page title, empty and error copy, `Unassigned`, rows-per-page | Client-owned. Keys in `en` **and** `ar`, enforced by the parity test (BR-8.11) |
| Enum labels — status, priority, category, channel | Client-owned, keyed by the wire value: `t(`tickets:status.${ticket.status}`)`. The wire value is never translated (BR-8.7) |
| Server messages on `400` / `404` | Already translated on arrival. Render them; do not re-translate or map them |
| `dir` | Set on the document root (ADR-007 §6). Subject, description, customer name, and assignee name each carry `dir="auto"` |
| `ticketNumber` | Latin digits and left-to-right in **both** locales (BR-8.13). Give the cell an explicit `dir="ltr"` — inherited RTL will put `TCK-` on the wrong end, and it reads as a rendering bug |
| Layout | CSS logical properties. `margin-inline-start`, never `margin-left` |
| Dates | Gregorian calendar, Latin digits, formatted client-side in the active locale (BR-8.13) |
| Counts | **No count string in this feature.** The result-count summary is a counted noun needing all six Arabic plural categories (BR-8.14) and it belongs to `015` |

Screen specs, element by element, with tokens and icons:
[`docs/sdd/design/screens/03-tickets-list.md`](../../docs/sdd/design/screens/03-tickets-list.md)
and
[`docs/sdd/design/screens/04-ticket-detail.md`](../../docs/sdd/design/screens/04-ticket-detail.md).

Note that both screen specs describe more than this feature builds: the status tabs, the
search box, and the filter panel are `015`; the composer, the timeline drawer, and every
action handler are `011`, `012`, `013`, and `016`. `frontend-spec.md` lists exactly what
`010` renders.

## Before this feature closes

The generated OpenAPI document is compared against
[`contracts/tickets-list-api.md`](contracts/tickets-list-api.md). A difference is a defect
in one of the two, and both are corrected — never one silently.

If the contract moves while you are building, it arrives as a **Contract changes** entry in
[`plan.md`](plan.md) and this guide is regenerated. A contract change discovered by the
frontend failing to compile is the failure this process exists to prevent.
