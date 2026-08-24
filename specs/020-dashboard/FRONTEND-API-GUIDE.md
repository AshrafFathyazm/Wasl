# Frontend API Guide — Dashboard (US-016)

Everything the frontend lane needs to build `/dashboard` **without waiting for the
backend**. Derived from [`contracts/dashboard-api.md`](contracts/dashboard-api.md), which is
frozen.

> Start now. Do not wait for `BE-020-06`.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on every call
- **Locale:** send `Accept-Language: ar` or `en`. Read `Content-Language` on the response to
  know which was actually applied
- Errors are RFC 7807 `ProblemDetails`. **Branch on `type`, never on `title`** — `title` is
  translated, `type` is not
- Timestamps ending `Utc` arrive UTC with a `Z`. Format for display client-side
- **`localDate` fields are not timestamps.** See the one rule below that matters more than
  the rest

## The one endpoint

```http
GET {{baseUrl}}/api/dashboard?range=14d
Authorization: Bearer <JWT>
Accept-Language: ar
```

One request for the whole screen (AC-1). There is no second call, no per-card call, and no
polling. `range` is optional and defaults to `14d`.

## Types — provisional until generated

Hand-written from the contract. **Marked provisional on purpose:** they are replaced by types
generated from the OpenAPI document once the endpoint is real (ADR-011 §6), and the swap is a
deliberate task (`FE-020-01`), not something to forget.

```ts
// PROVISIONAL — replace with generated types when /swagger exists. See FE-020-01.

export type DashboardRange = '7d' | '14d' | '30d';
export type DashboardScope = 'Mine' | 'Team';

export type TicketStatus =
  | 'New' | 'Open' | 'InProgress' | 'PendingCustomer' | 'Resolved' | 'Closed';
export type TicketPriority = 'Low' | 'Normal' | 'High' | 'Critical';
export type CommunicationChannel = 'Email' | 'WhatsApp' | 'LiveChat' | 'Sms' | 'WebForm';

/** A bare calendar date: "2026-08-10". NOT an instant. Never pass to new Date(). */
export type LocalDate = string;

export interface TicketRef {
  ticketId: string;
  ticketNumber: string;        // Latin digits in every locale
  subject: string;             // user content → dir="auto"
  createdAtUtc: string;        // ISO 8601, Z
  ageHours: number;            // computed server-side; do not recompute from the clock
}

export interface DashboardAttention {
  unassignedCount: number;         // GLOBAL in both scopes — see the note below
  escalatedOpenCount: number;
  waitingOnCustomerCount: number;
  assignedToMeCount: number;
  oldestUntouched: TicketRef | null;
  myOldest: TicketRef | null;
}

export interface DailyPoint {
  localDate: LocalDate;
  created: number;
  resolved: number;            // entered Resolved, NOT closed
}

export interface StatusCount  { status: TicketStatus; count: number }
export interface ChannelCount { channel: CommunicationChannel; count: number }

export interface DashboardMedians {
  firstReplyMinutes: number | null;      // null ≠ 0
  firstReplySampleSize: number;
  resolutionMinutes: number | null;
  resolutionSampleSize: number;
}

export interface NeedsAttentionRow extends TicketRef {
  customerName: string;        // user content → dir="auto"
  status: TicketStatus;
  priority: TicketPriority;
  isEscalated: boolean;
  isUnassigned: boolean;
}

export interface TeamLoadRow {
  userId: string;
  fullName: string;            // user content → dir="auto"
  isActive: boolean;
  assignedOpenCount: number;
}

export interface DashboardResponse {
  range: DashboardRange;
  scope: DashboardScope;
  timeZoneId: string;          // IANA, e.g. "Asia/Riyadh" — render verbatim
  fromLocalDate: LocalDate;
  toLocalDate: LocalDate;
  generatedAtUtc: string;

  attention: DashboardAttention;
  dailySeries: DailyPoint[];
  openByStatus: StatusCount[];
  medians: DashboardMedians;
  channelMix: ChannelCount[];
  needsAttention: NeedsAttentionRow[];

  /** Manager only. ABSENT — not null, not [] — for an Agent. Hence `?`. */
  teamLoad?: TeamLoadRow[];
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

`teamLoad?:` is optional in the type because it is **absent from the JSON** for an Agent
(AC-4, AC-18). Render the card on `response.teamLoad !== undefined`, never on
`scope === 'Team'`. The two agree today; keying off the data means the card cannot appear
over data that is not there.

## Responses, and what the UI does with each

| Code | `type` | What the UI does |
|---|---|---|
| `200` | — | Render. If every count is `0` and every series is empty → `FirstRunPanel` (AC-9). If `scope === 'Mine'` and `assignedToMeCount === 0` with `unassignedCount > 0` → `NothingAssignedPanel`. Otherwise the full grid |
| `400` | `errors/validation` | The `range` in the URL is not one of the three. Show `DashboardError` with the server's message. **Do not silently rewrite the URL** to a valid range — a URL that changes itself is how a shared link stops meaning what it said |
| `401` | `errors/unauthenticated` | Session expired. Redirect to sign-in. Not a screen state |
| `403` | `errors/forbidden` | Inline, with the server's message (ADR-011 §5). Reachable only for a token carrying neither role |
| `500` | `errors/unexpected` | `DashboardError` with `traceId` rendered selectably. **One** message for the whole screen, not eight broken cards (AC-12) |

```ts
// One error surface for the whole screen. AC-12.
if (!res.ok) {
  const problem: ProblemDetails = await res.json();
  throw new DashboardError(problem);      // caught by DashboardPage, rendered once
}
```

## The rule that matters more than the rest

`localDate`, `fromLocalDate`, and `toLocalDate` are **bare calendar dates in the
organisation's timezone**. They have no time and no offset.

```ts
// WRONG — "2026-08-10" parses as UTC midnight, then renders in the VIEWER's zone.
// A viewer in America/New_York sees 9 August. The whole chart shifts one column.
new Date(point.localDate).toLocaleDateString(locale);

// RIGHT — parse the parts, format the parts. One place owns this: formatLocalDate.ts
const [y, m, d] = point.localDate.split('-').map(Number);
formatLocalDate(y, m, d, locale);          // Gregorian, Latin digits (BR-8.13)
```

Nothing throws. No test fails unless one is written for it. The chart is simply wrong by one
column and still looks like a plausible fortnight. A Vitest case runs `formatLocalDate` under
a non-UTC `TZ` for exactly this reason.

The same applies in reverse: **never send a `Date` anywhere.** The only request parameter is
`range`, a string.

## Client-side validation — mirror, never authority

There is one input on this screen and it is a three-way choice, so there is almost nothing to
mirror — which is itself worth stating, because it is why no Zod schema appears here for the
request.

```ts
const RANGES = ['7d', '14d', '30d'] as const;

// Mirror: keeps a typo in the URL from becoming a request.
const range = RANGES.includes(param as DashboardRange) ? (param as DashboardRange) : '14d';
```

| Not done client-side | Why |
|---|---|
| Deciding the scope from the role in the token | The **server** decides, from the role, in the query predicate (AC-3). A client that computed scope would be one bug away from asking for team data as an Agent — and the server would still refuse, which is the point |
| Filtering `teamLoad` out for an Agent | There is nothing to filter. The property is absent and the query was never executed (AC-4, AC-17) |
| Computing `ageHours` from `createdAtUtc` and the browser clock | The server computed it from an injected `TimeProvider`. A skewed client clock would change what "oldest" means on screen |
| Computing the date range from `range` | The server echoes `fromLocalDate` and `toLocalDate`. Reproducing that arithmetic client-side means two implementations of one off-by-one |
| Bucketing anything by day | Local-day bucketing is the single most silently-wrong thing on a dashboard, and it is done once, server-side, in the organisation's timezone (AC-6) |
| Summing `dailySeries` to cross-check a tile | The tiles and the series answer different questions over different windows. Any "reconciliation" would produce a false mismatch |

Every rule that could be mirrored is enforced server-side. The client is not the authority
(ADR-003).

## States — all of them are required

| State | Behaviour | AC |
|---|---|---|
| Loading | Per-card skeletons at real heights; nothing shifts on load | AC-11 |
| First run | One panel and one CTA, not twelve zeros | AC-9 |
| Nothing assigned (Agent) | "Nothing assigned to you" plus the pool count as a next action | — |
| Zero in a tile | `0`, muted. **Never the danger colour** — a red zero trains people to ignore red | AC-10 |
| No median data | `"—"` plus "no data yet". **Never `0`** — no data is not zero minutes | — |
| Empty block in a populated system | That card's own empty line; the rest renders | BR-7.6 |
| Error | One message, one `traceId` | AC-12 |
| Range change | URL updates, query refetches, back button works | AC-13 |

Absence of a state is a defect, not a gap (`docs/sdd/design/screens/README.md`).

## Caching and freshness

| Concern | Rule |
|---|---|
| Server cache | **None**, by decision. The response carries `Cache-Control: no-store` (AC-22) |
| TanStack Query key | `['dashboard', range]` — the parsed URL value *is* the key, so per-range caching falls out of the design (ADR-011 §2) |
| `staleTime` | Short. This screen is a snapshot, not a live feed; `generatedAtUtc` is what tells the user how old it is |
| Polling / websockets | Not implemented. No requirement, and "updated a minute ago" is an honest promise where a stale live-looking number is not |
| Invalidation | Nothing on this screen mutates, so nothing invalidates it. Arriving from a mutation elsewhere refetches naturally on mount |

## Localization

| Item | Rule |
|---|---|
| Every label, heading, caption, empty state, CTA | Client-owned. Keys in `en` **and** `ar`, enforced by the parity test (BR-8.11). The full table is in [`frontend-spec.md`](frontend-spec.md) |
| `scope`, `status`, `priority`, `channel` | **Enum identifiers, never translated** (BR-8.7). Map each to a label from the client catalogue |
| `timeZoneId` | Rendered **verbatim**. `Asia/Riyadh` is an identifier, not a sentence |
| `ticketNumber` | Latin digits, `nowrap`, `tabular-nums`, does not mirror (BR-8.13) |
| Every count and every date | **Latin digits in Arabic** (BR-8.13, ADR-007 §7) |
| `ProblemDetails.title` and `errors` messages | Already translated on arrival (BR-8.6). Render them; do not re-translate or map them |
| Counted nouns | Plural forms with all six Arabic CLDR categories, never concatenation (BR-8.14) |
| `dir` | Set once on the document root. Every `subject`, `customerName`, and `fullName` carries `dir="auto"` (AC-14, ADR-007 §8) |
| Layout | CSS logical properties. `margin-inline-start`, never `margin-left`. Bars fill from the inline-start; the trend axis reverses so the most recent day sits at the inline-end |

Screen spec, card by card, with states, keys, RTL, and accessibility obligations:
[`frontend-spec.md`](frontend-spec.md). The underlying design intent, tile by tile:
[`docs/sdd/design/screens/11-dashboard.md`](../../docs/sdd/design/screens/11-dashboard.md).

## Accessibility obligation the API shape creates

The response is nine blocks of numbers and four of them are rendered as bars. A bar built
from `div`s is invisible to a screen reader and to anyone who cannot distinguish the colour
ramp, so **every bar block renders a visually-hidden `<table>` of its values** (AC-21), with
the bar container `aria-hidden="true"`.

This is not extra polish — the data is already in hand and the table is the cheapest correct
representation of it. An `aria-label` summarising the chart in a sentence is not the same
thing: a summary is not the data.

## Before this feature closes

The generated OpenAPI document is compared against
[`contracts/dashboard-api.md`](contracts/dashboard-api.md). A difference is a defect in one
of the two, and both are corrected — never one silently (`REV-020-02`).

If the contract moves while you are building, it arrives as a **Contract changes** entry in
[`plan.md`](plan.md) and this guide is regenerated. A contract change discovered by the
frontend failing to compile is the failure this process exists to prevent.
