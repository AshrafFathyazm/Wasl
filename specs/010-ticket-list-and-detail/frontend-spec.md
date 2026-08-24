# 010 — Frontend Spec

**Screens:** Tickets list · Ticket detail · **Routes:** `/tickets`, `/tickets/:id` ·
**Story:** US-006 (read half) · **Who can reach them:** any authenticated support user
(Agent or Manager — BR-6)

The element-by-element screen specs, with tokens, icons, and layout regions, are
[`docs/sdd/design/screens/03-tickets-list.md`](../../docs/sdd/design/screens/03-tickets-list.md)
and
[`docs/sdd/design/screens/04-ticket-detail.md`](../../docs/sdd/design/screens/04-ticket-detail.md).
They are not duplicated here.

**Both screen specs describe more than this feature builds.** This file is the boundary:
what `010` renders, in which states, with which keys. The API surface is
[`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md).

---

## Components

| Component | Kind (ADR-011 §4) | Fetches? |
|---|---|---|
| `TicketListPage` | Route / page | **Yes** — owns the list query |
| `TicketDetailPage` | Route / page | **Yes** — owns the detail query |
| `TicketTable` | Feature | No — receives `items`, `isLoading`, `error` as props |
| `TicketStatusBadge`, `TicketPriorityBadge` | Feature | No — wrap `Badge` with the BR-1 colour map |
| `TicketSummaryStrip`, `TicketRail`, `TicketSections` | Feature | No |
| `TicketActionMenu` | Feature | No — receives `allowedTransitions` as a prop |
| `Badge`, `Button`, `Select`, `Avatar`, `Pagination` | Primitive | No |

Fetching only at route level, per ADR-011 §4. If `TicketTable` fetched, a filter change in
`015` would produce a waterfall — page renders, table mounts, table fetches.

**No global store.** `page` and `pageSize` live in the URL; the rest is server state that
TanStack Query owns (ADR-011 §1). `page` and `pageSize` are in the URL in this feature even
though AC-14 belongs to `015`, because paging is shareable by the same argument and putting
it in `useState` first would mean `015` moving it.

---

## Screen 1 — Tickets list (`/tickets`)

### What `010` renders

| Region | Renders | Note |
|---|---|---|
| Page title | Yes | `tickets:list.title` |
| Status tabs (`All 128 │ ● Open 41 …`) | **No** | A tab is a status filter with a label — `015`. And their counts are an aggregate nothing in the contract provides (`015` spec Q) |
| Search box | **No** | `015` |
| Filters button and panel | **No** | `015` |
| Sort button | **No** | No story specifies sorting; the order is fixed at `CreatedAtUtc DESC`. Omitted rather than rendered inert (`spec.md` Q-3) |
| Table header and rows | Yes | All nine AC-13 columns |
| Row menu | Navigation only — open the ticket, copy the number | Every state-changing row action needs `allowedTransitions`, which the list does not carry (`spec.md` Q-5) |
| Rows per page | Yes | 10 / 20 / 50 / 100 |
| Pagination | Yes | Page buttons plus the total from `totalPages` |

### Columns — AC-13, all nine

| Column | Source field | Rendering |
|---|---|---|
| Number | `ticketNumber` | Fixed 132px, `nowrap`, `tabular-nums`, **`dir="ltr"`**, Latin digits in both locales (BR-8.13) |
| Subject | `subject` | Flex, ellipsis, **`dir="auto"`** |
| Customer | `customerName` | **`dir="auto"`**; links to `/customers/:customerId` |
| Status | `status` | `TicketStatusBadge` — pill, leading dot, per the BR-1 colour map |
| Priority | `priority` | `TicketPriorityBadge` — outline for `Low`/`Normal`, filled for `High`/`Critical` |
| Channel | `channel` | Label from `tickets:channel.*` |
| Assignee | `assigneeName` | 24px avatar plus name; **`—` when `null`**, with `tickets:unassigned` as the accessible label |
| Escalated | `isEscalated` | Icon only, `--red-600`, with a `title`. Nothing when `false` — an "off" icon is noise on 100 rows |
| Created | `createdAtUtc` | Formatted client-side in the active locale, Gregorian, Latin digits |

Red is never a status. It is `Critical` priority and escalation only, so red on a row
always means "needs attention now" (`docs/sdd/design/layout-patterns.md`).

### States — all five, none optional

| State | Condition | Renders | AC |
|---|---|---|---|
| **Loading** | First load | Skeleton rows at the **real** 61px row height, so nothing shifts when data lands | AC-15 |
| **Empty — no tickets** | `totalCount === 0` | Illustration, message, CTA to `/tickets/new` | AC-15 |
| **Page past the end** | `items` empty, `totalCount > 0` | Empty table plus an offer to go to page 1, computed from `totalPages` | AC-21 |
| **Error** | Network or `5xx` | Message, the `traceId`, and a retry | AC-15 |
| **Loaded** | `items` non-empty | The table | AC-13 |

There is **no "no matches" state in `010`** — there are no filters, so no query can match
nothing while the table is non-empty. `015` adds it as a **different** state with a
different message and a `Clear filters` action. Building one state for both now is exactly
what makes them the same state later, and `docs/sdd/design/screens/03-tickets-list.md` says
"never the same as 'no tickets'".

`401` is not a list state: the session has expired, so it redirects to sign-in.

### Refetching, not reloading

When the page changes, the table dims to 60% with a spinner in the toolbar. Rows are **not**
replaced by skeletons. Replacing a rendered table with skeletons on every page change makes
a fast interaction look slow, and the user loses their reading position.

---

## Screen 2 — Ticket detail (`/tickets/:id`)

### What `010` renders

| Region | Renders in `010` | Owner if not |
|---|---|---|
| Back, ticket number in the header | Yes | — |
| Summary strip: status, customer, assignee, channel, priority, created | Yes | — |
| Rail: priority badge, escalation callout, section anchors | Yes | The escalate **action** is `016` |
| Description section | Yes | — |
| Take-action control | **Rendered from `allowedTransitions`**, items present, handlers not wired | `011` (assign), `012` (status), `016` (escalate) |
| Comments section | Declared in the accordion, empty | `013` |
| Activity section | Declared in the accordion, empty | `013` |
| Comment composer | **No** | `013` |
| Timeline drawer | **No** | `013` |
| Sticky bottom action bar | Yes, containing Back and the action control | — |

Declaring the Comments and Activity sections now and filling them in `013` is deliberate:
the accordion, the anchors, and the rail heights are what the preview validates, and
adding two sections to an approved layout afterwards re-opens it.

### The one rule this screen exists to respect

`TicketActionMenu` receives `allowedTransitions` and maps over it. **There is no client-side
copy of the state machine** — not a map, not a `switch`, not "just for the disabled state"
(ADR-004, constitution III). An empty array renders **no control at all**, not a disabled
one: a `Closed` ticket has nothing to offer and a disabled button invites a support ticket
about the support tool.

`FE-010-05`'s test passes `[]`, `['Open']`, and the full `InProgress` set, and asserts the
rendered items exactly.

### States

| State | Condition | Renders | AC |
|---|---|---|---|
| **Loading** | First load | Skeleton for the strip, the rail, and the first section | AC-15 |
| **Not found** | `404` | Full-page state with a route back to the list — never the error boundary | AC-19 |
| **Error** | Network or `5xx` | Message, `traceId`, retry | AC-15 |
| **Loaded** | `200` | The screen | AC-17 |
| **No permitted actions** | `allowedTransitions: []` | No action control, and a `Closed` badge in outline treatment | AC-18, AC-23 |
| **Unassigned** | `assignee === null` | "Unassigned" in the strip | AC-17 |
| **Escalated** | `isEscalated` | Rail callout with the reason and who escalated it | AC-17 |

`403` and `409` are not states of this screen. They are outcomes of actions, and every
action belongs to `011`, `012`, `013`, or `016`. When those land they render inline next to
the control that caused them, never as a toast — the user needs to see what they cannot do,
next to it (`docs/sdd/design/screens/04-ticket-detail.md`).

---

## Localization

Every string is a key. No literals in JSX (BR-8.8), enforced by lint.

| Key | `en` | Note |
|---|---|---|
| `tickets:list.title` | Tickets | Page heading |
| `tickets:list.column.number` | Number | |
| `tickets:list.column.subject` | Subject | |
| `tickets:list.column.customer` | Customer | |
| `tickets:list.column.status` | Status | |
| `tickets:list.column.priority` | Priority | |
| `tickets:list.column.channel` | Channel | |
| `tickets:list.column.assignee` | Assignee | |
| `tickets:list.column.created` | Created | |
| `tickets:list.empty.title` | No tickets yet | The "no tickets" state, **not** "no matches" |
| `tickets:list.empty.body` | Tickets raised by customers will appear here. | |
| `tickets:list.empty.cta` | Create a ticket | |
| `tickets:list.error` | The ticket list could not be loaded. | Shown with the `traceId` |
| `tickets:list.pastEnd` | That page is past the end of the list. | Offers page 1 |
| `tickets:unassigned` | Unassigned | Also the accessible label behind the `—` |
| `tickets:escalated` | Escalated | `title` on the row icon |
| `tickets:status.New` … `tickets:status.Closed` | New … Closed | Six keys, keyed by the **wire value** |
| `tickets:priority.Low` … `Critical` | | Four keys |
| `tickets:category.Billing` … `General` | | Four keys |
| `tickets:channel.Email` … `WebForm` | | Five keys |
| `tickets:detail.description` | Description | Section header |
| `tickets:detail.comments` | Comments | Declared, empty until `013` |
| `tickets:detail.activity` | Activity | Declared, empty until `013` |
| `tickets:detail.notFound` | This ticket does not exist, or it has been removed. | |
| `tickets:detail.escalatedBy` | Escalated by {{name}} | Interpolated, never concatenated |
| `tickets:takeAction` | Take action | Only rendered when `allowedTransitions` is non-empty |
| `tickets:action.Open` … `tickets:action.Closed` | Move to Open … Close | Keyed by the transition target |
| `common:back` | Back | |
| `common:retry` | Retry | |
| `common:rowsPerPage` | Rows per page | |
| `common:rowActions` | Row actions | Accessible name for the icon button |

Every key exists in `ar` as well, enforced by the parity test (BR-8.11) — not by discipline.

**Not in this table, deliberately:** any counted-noun string. The result count needs all six
Arabic CLDR plural categories (BR-8.14) and it belongs to `015`'s filter bar. Adding
`"128 tickets"` here as a concatenation would be the exact defect BR-8.14 exists to prevent,
and it looks fine to an English reviewer.

**Server-authored messages are not in this table.** The `400` and `404` messages arrive
already translated (BR-8.6) and are rendered as received.

---

## Right-to-left

| Concern | Requirement |
|---|---|
| Direction | `dir` on the document root, set once (ADR-007 §6) |
| Layout | CSS logical properties throughout. `padding-inline`, `margin-inline-start`, `inset-inline-start` — never `left` / `right` |
| **Table column order** | Reverses. It falls out of the document direction; nothing in the table may position a cell by index or by `left` |
| **Pagination** | Reverses, and its chevrons **mirror** — "next" points toward the reading direction |
| **Detail rail** | Moves to the inline-end. The active anchor's 3px bar follows via `inset-inline-start` |
| **Back chevron** | Mirrors |
| **Escalate icon** | Does **not** mirror. Its arrow is vertical, and vertical meaning has no direction |
| Status dot | Moves to the inline-start of its label automatically — it is `gap`, not a margin. If it is a margin it will end up on the wrong side, and that is the tell |
| **`ticketNumber`** | **Does not mirror.** Explicit `dir="ltr"`, Latin digits, `tabular-nums`. Left to inherit RTL, the `TCK-` prefix lands on the wrong end and the whole cell reads as a rendering bug (BR-8.13) |
| Dates and times | Latin digits, Gregorian, formatted in the active locale (BR-8.13) |
| User content | `subject`, `description`, `customerName`, `assigneeName` each carry `dir="auto"`. An Arabic subject in an English interface is normal; without it the punctuation lands in the wrong place and looks like a typo (ADR-007 §8) |

`FE-010-09` walks **both** screens in Arabic and records what it found in `tests.md`. RTL
defects are visual — no assertion catches a column sized to English header text, and the
list is the most direction-sensitive screen in Release 1.

---

## Accessibility

| Requirement | Verified by |
|---|---|
| The table is a real `<table>` with `<th scope="col">`, so a screen reader announces the column with the cell | `FE-010-09` |
| Every row is reachable by keyboard and activating it navigates; the row menu is reachable on **focus**, not only on hover | `TEST-010-14` |
| Visible focus ring on every interactive element, including the row | `TEST-010-14` |
| The `—` for an unassigned ticket has an accessible label, not just a dash | `TEST-010-14` |
| The escalated icon's meaning is available to a screen reader, not carried by colour alone | `TEST-010-14` |
| Pagination announces the current page and the total | `TEST-010-14` |
| Loading state is announced once, not on every skeleton row | `TEST-010-14` |
| The detail accordion's headers are buttons with `aria-expanded` | `TEST-010-14` |

---

## Preview before build — not optional

`FE-010-00` renders **both** screens with real tokens, real copy, 100 plausible rows, a
200-character Arabic subject, all five states, and both languages **before** anything is
wired.

Three things this preview is specifically looking for, each cheap to find now and expensive
later:

| Looking for | Why it matters |
|---|---|
| A 200-character subject next to a 132px number column at 61px row height | The subject column is the only flexible one. If it collapses, the table is unreadable and the fix is a column-width decision, not a CSS tweak |
| The Arabic column headers | "Priority" and "Assignee" are longer in Arabic. A header that wraps changes the header row height and therefore every skeleton row |
| The detail rail at 240px with an Arabic escalation reason of 500 characters | The rail is fixed-width and the callout is the longest string on the screen |

Approving a layout costs minutes there and hours after the screen is wired, tested, and
translated (ADR-009, `docs/sdd/design/preview-first-workflow.md`).

---

## Not on these screens

| Excluded | Where |
|---|---|
| Status tabs, search, the filter panel, filters in the URL | `015` |
| The result-count summary and its plural forms | `015` |
| Sorting, and the sort control the screen spec draws | Nowhere — no story specifies it (`spec.md` Q-3) |
| Assigning, changing status, escalating | `011`, `012`, `016`. `010` renders the menu; they wire it |
| Comment composer, timeline drawer, activity rows | `013` |
| Bulk actions, saved views, CSV export, column configuration, inline editing, infinite scroll, grouping | Out of scope in US-006, with reasons in `spec.md` |
| Attachments | Out of scope project-wide (`docs/sdd/00-project-context.md`) |
| Reopening a closed ticket | Out of scope project-wide (BR-1.5, ADR-004) |
