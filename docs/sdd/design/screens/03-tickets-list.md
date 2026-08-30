# Screen — Tickets list

**Route** `/tickets` · **Story** US-006 · **Reachable by** Agent, Manager

## Purpose

Turn the ticket collection into a queue a person can work: filtered, paginated, scannable.

## Layout

```text
Tickets                                            (page title)
┌ All 128 │ ● Open 41 │ ● In progress 62 │ ● Resolved 25 ┐
[search………………]              [⚙ Filters] [⇅]
┌────────────────────────────────────────────────────────┐
│ Number   Subject   Customer   Status  Priority  Assignee│
│ ───────────────────────────────────────────────────────│
│ rows, 61px each                                        │
└────────────────────────────────────────────────────────┘
Rows per page [10 ⌄]                        ‹ 1 2 … 13 ›
```

## Elements

| Region | Element | Component | Tokens | Icon | i18n key |
|---|---|---|---|---|---|
| Header | Page title | — | `--text-page-title` (h2 30) / 700 | — | `tickets:list.title` |
| Tabs | Container | — | 1px `--Neutral-200`, `--radius-sm`, white, `width: fit-content` | — | — |
| Tabs | Tab | — | h40, padding-inline 14, divider between | — | `tickets:status.*` |
| Tabs | Status dot | — | 7px circle, `--state-*-text` | — | — |
| Tabs | Count | — | `--text-placeholder`; active `--Neutral-800` | — | — |
| Toolbar | Search | Input | h40, icon inline-start, debounce 300ms | `search` | `tickets:list.search` |
| Toolbar | Filters | Button, Secondary-Outline, md | h40 | `filter` | `common:filters` |
| Toolbar | Sort | Icon button | h40 square | `sort` | `common:sort` |
| Table | Header row | — | h40, `--surface-content`, `--type-caption` / 600 | — | per column |
| Table | Data row | — | h61, `border-bottom` 1px, hover `--surface-content` | — | — |
| Table | Number | — | fixed 132, nowrap, `tabular-nums` | — | — |
| Table | Subject | — | flex, ellipsis, **`dir="auto"`** | — | — |
| Table | Status | Badge | pill h22, `--state-*-bg` / `-text`, leading dot | — | `tickets:status.*` |
| Table | Priority | Badge | pill, outline for Low/Normal, filled for High/Critical | — | `tickets:priority.*` |
| Table | Escalated | — | icon only, `--red-600`, `title` attribute | `escalate` | `tickets:escalated` |
| Table | Assignee | Avatar + name | 24px avatar; "—" when unassigned | — | `tickets:unassigned` |
| Table | Row menu | Icon button | on hover and on focus | `more` | `common:rowActions` |
| Footer | Rows per page | Select | h40, options 10 / 20 / 50 / 100 | `chevronDown` | `common:rowsPerPage` |
| Footer | Pagination | — | square buttons; active filled `--navy-900` | `chevronDown` rotated | — |

### Status colours (BR-1, decided in `design/layout-patterns.md`)

| Status | Treatment |
|---|---|
| New | Neutral filled |
| Open | Info filled |
| InProgress | Warning filled |
| PendingCustomer | Neutral filled |
| Resolved | Success filled |
| Closed | Neutral filled |

**Changed 2026-08-29, and only the last two rows.** `PendingCustomer` was *Warning
outline* and `Closed` was *Neutral outline*. Rendered against real rows, the two outlines
were the loudest thing on the table — a heavy amber ring around a waiting ticket drew more
attention than a `Critical` priority two columns away, which inverts the ranking this map
exists to express. There is no outline treatment in the supplied design at all.

**`New` and `Open` were NOT changed, and the attempt is recorded because it was made
twice.** The supplied canvas paints both with the same blue. It was adopted, then ruled
against: two distinct states in the BR-1 machine must not read as one appearance, in the
column an agent scans first. This table is the source of record and the canvas is wrong on
that row. See `specs/026-ticket-list/table-primitive.md` Q-T-1.

Red is never a status. It is `Critical` priority and escalation only, so red on a ticket
always means "needs attention now".

## Filter panel

Opens inline below the toolbar. Two-column grid, `Clear` and `Apply` at the inline-end.

| Field | Control | Values |
|---|---|---|
| Status | Multi-select | Six statuses |
| Priority | Multi-select | Four |
| Category | Multi-select | Four |
| Channel | Multi-select | Five |
| Assignee | Select | Active users, plus `me` and `unassigned` |
| Customer | Customer picker | — |
| Escalated | Tri-state | Any / Yes / No |

`Apply` is explicit, not live-as-you-type — the filter set triggers a server round trip.

## Actions

| # | Trigger | Guard | Request | Success | Failure |
|---|---|---|---|---|---|
| 1 | Tab click | — | `GET /api/tickets?status=…` | URL updates, list refetches | Error state |
| 2 | Search | ≥1 char, debounced | same, `&search=` | List refetches | — |
| 3 | Apply filters | — | same, all params | Panel closes, URL updates | `400` → message naming accepted values |
| 4 | Clear | — | — | Params removed, panel stays open | — |
| 5 | Row click | — | — | Navigate `/tickets/:id` | — |
| 6 | Page change | — | same, `&page=` | Scroll to top of table | — |
| 7 | Rows per page | Clamped to 100 | same | Return to page 1 | — |

## States

| State | Condition | Renders |
|---|---|---|
| Loading | First load | Skeleton rows at 61px — same height, so no layout shift |
| Refetching | Filter change | Table dims to 60%, spinner in the toolbar. Rows are **not** replaced by skeletons |
| Empty — no tickets | `totalCount` 0, no filters | Illustration, message, CTA to create one |
| Empty — no matches | `totalCount` 0, filters active | Different message plus `Clear filters`. Never the same as "no tickets" |
| Error | Network or 5xx | Message, `traceId`, retry |
| Page beyond last | `page` too high | Empty array with correct `totalCount`; footer offers page 1 |

## RTL

Column order reverses. Pagination reverses and its chevrons mirror. The status dot moves
to the inline-start of its label automatically — it is `gap`, not a margin. Ticket
numbers stay Latin digits (BR-8.13). Subject cells keep `dir="auto"`, so Arabic subjects
read correctly in the English interface.

## Not on this screen

Bulk actions · saved views · CSV export · column configuration · inline editing ·
infinite scroll · grouping. All out of scope in US-006; the reasons are there.
