# 018 — Frontend Spec

**Screen:** Customer profile · **Route:** `/customers/:id` · **Story:** US-004 ·
**Who can reach it:** any authenticated support user (Agent or Manager — BR-6)

The element-by-element screen spec, with tokens, icons, and layout regions, is
[`docs/sdd/design/screens/07-customer-profile.md`](../../docs/sdd/design/screens/07-customer-profile.md).
It is not duplicated here. This file carries what is specific to **this feature's**
build: the contract binding, the states, the i18n keys, and the RTL obligations.

The API surface is [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md).

**This feature adds no route.** `/customers/:id` already exists from
`008-customer-list-and-profile`. What changes is what it reads (one endpoint instead of
one) and what it renders (two new regions).

---

## Components

| Component | Kind (ADR-011 §4) | New here? | Fetches? |
|---|---|---|---|
| `CustomerProfilePage` | Route / page | No — from `008` | Yes — owns `useCustomerOverview`, and it is the **only** fetch on this screen |
| `CustomerContactStrip` | Feature component | No — from `008` | No |
| `CustomerTicketRail` | Feature component | **Yes** | No — receives `ticketCounts` as a prop |
| `CustomerTicketsSection` | Feature component | **Yes** | No — receives `recentTickets` and `recentTicketsTruncated` |
| `CustomerTicketsEmpty` | Feature component | **Yes** | No |
| `Badge`, `Button`, `Card`, `Skeleton` | Primitive | No — from `006` | No |

Fetching only at the route level, per ADR-011 §4. The rail is the component most likely
to be given its own query by someone trying to be helpful — six counts feel like their
own concern. It must not have one: the whole reason this endpoint exists is to collapse
those requests into the page's single call, and a rail that fetches undoes it while
looking tidier.

No global store. There is nothing on this screen that is not server state (TanStack
Query) or URL state (`:id`).

## Data binding

| Region | Source field | Notes |
|---|---|---|
| Header name | `customer.fullName` | `dir="auto"` |
| Header chip | `customer.isActive === false` | Muted "inactive" chip (spec Q-3). No chip when active |
| Strip — email | `customer.email` | `mailto:` link, LTR always, `—` when `null` |
| Strip — phone | `customer.phone` | `tel:` link, `tabular-nums`, LTR always, `—` when `null` |
| Strip — company | `customer.companyName` | `dir="auto"`, `—` when `null` |
| Strip — since | `customer.createdAtUtc` | Locale-formatted, Gregorian, Latin digits |
| Rail — total | `ticketCounts.total` | Plural key, six CLDR categories |
| Rail — rows | `Object.entries(ticketCounts.byStatus)` | Iterate the object. Do **not** map a hard-coded list of six statuses |
| Section rows | `recentTickets` | In the order received. No client re-sort |
| Section "see all" | `recentTicketsTruncated` | Only when `true` |
| Notes | `customer.notes` | `dir="auto"`, preserves line breaks, own empty state |
| Edit button | — | `017-update-customer` owns it. Hidden until that ships |

`customer.version` is not rendered. It is carried on the response so `017` can send it
back without a second read (AC-13), and it is held in the query cache, not in component
state.

## States — every one is required

| State | Condition | What the user sees | AC |
|---|---|---|---|
| **Loading** | `isPending` | Skeleton strip, skeleton rail with six rows, three skeleton ticket rows. A skeleton and not a spinner: the layout is known, so reserve it and avoid the reflow when data lands | AC-15 |
| **Loaded** | `total > 0` | Strip, rail with all six rows, up to 10 ticket rows | AC-1 |
| **Empty** | `total === 0` | Rail renders every status at `0`. Section renders a title, one sentence, and the create-ticket action | AC-3 |
| **No notes** | `notes === null` | Muted "no notes" in the notes region — a *separate* empty state from the tickets one | AC-15 |
| **Truncated** | `recentTicketsTruncated` | "See all" beneath the last row, linking to `/tickets?customerId={id}` | AC-9 |
| **Not found** | `404` | Full-page not-found, link back to `/customers` | AC-15 |
| **Broken link** | `400` | Distinct message: the address is malformed. Not the not-found page — that one invites the user to hunt for a record that was never addressed | AC-6 |
| **Error** | any other failure | Inline error with a retry, and the `traceId` rendered small so a user can quote it | AC-15 |
| **Forbidden** | — | **Does not exist on this screen.** BR-6 permits both roles and the endpoint has no `403` (AC-12). Recorded so the omission is a decision, not a miss | AC-12 |
| **Conflict** | — | **Does not exist.** Nothing on this screen mutates anything, so there is nothing to conflict over | — |

Absence of a state is a defect, not a gap (`docs/sdd/design/screens/README.md`).

### The empty state is the point of this screen's frontend work

A customer with no tickets is **normal and common**, not an edge case. Every customer is
in that state for the interval between being created and having their first ticket
raised, and a customer who contacted support once two years ago and never again stays in
it forever.

Three specific requirements, each of which is a way this goes wrong:

| Requirement | What happens without it |
|---|---|
| The rail renders all six rows at `0` | Hiding zero rows makes the rail change shape per customer. An agent who sees no `Open` row cannot tell whether that means zero or means the rail failed to load |
| The section renders a title, a sentence, and the create-ticket action | A section that renders nothing is indistinguishable from a section whose request failed |
| The empty state is **not** styled as an error | Muted, centred, with an action. No warning icon, no red. Nothing has gone wrong |

`FE-018-03` builds it and `TEST-018-13` covers it. It is not droppable.

## Localization

Every string is a key. No literals in JSX (BR-8.8), enforced by lint.

| Key | `en` | New here? | Note |
|---|---|---|---|
| `customers:field.email` | Email | No — `008` | |
| `customers:field.phone` | Phone | No — `008` | |
| `customers:field.company` | Company | No — `008` | |
| `customers:field.since` | Customer since | No — `008` | |
| `customers:field.notes` | Notes | No — `008` | |
| `tickets:status.new` … `tickets:status.closed` | New … Closed | No — `010` | Six keys. **Reused**, not re-added under `customers:` |
| `tickets:new` | New ticket | No — `009` | The create action in the section header |
| `customers:ticketTotal` | `{{count}} ticket` / `{{count}} tickets` | **Yes** | Plural key. `ar` needs all six CLDR categories (BR-8.14) |
| `customers:tickets.section` | Tickets | **Yes** | Section heading |
| `customers:tickets.empty.title` | No tickets yet | **Yes** | |
| `customers:tickets.empty.body` | This customer has not raised a support ticket. | **Yes** | One sentence. Not an apology, not an error |
| `customers:tickets.empty.cta` | Create the first ticket | **Yes** | |
| `customers:tickets.seeAll` | See all tickets | **Yes** | Shown only when truncated |
| `customers:tickets.unassigned` | Unassigned | **Yes** | For `assignedToName === null` |
| `customers:notes.empty` | No notes | **Yes** | Distinct from the tickets empty state |
| `customers:inactive` | Inactive | **Yes** | The header chip (spec Q-3) |
| `customers:notFound.title` | Customer not found | **Yes** | Full-page `404` |
| `customers:notFound.back` | Back to customers | **Yes** | |
| `customers:badLink.title` | That link is not valid | **Yes** | The `400` state. Deliberately different wording from not-found |
| `common:retry` | Try again | No — `006` | |
| `common:traceId` | Reference | No — `002` | Label for the `traceId` on the error state |

Every new key exists in `ar` as well, enforced by the parity test (BR-8.11) — not by
discipline.

**Server-authored messages are not in this table.** The `404` and `400` titles arrive
already translated (BR-8.6) and are rendered as received. Mapping them client-side would
put the same sentence in two catalogues.

**Status labels are not in this table either**, on purpose. They belong to the `tickets`
namespace because a status is a ticket concept, and a second copy under `customers:`
would drift the moment one of them is reworded.

## Right-to-left

| Concern | Requirement |
|---|---|
| Direction | `dir` on the document root, set once (ADR-007 §6). Not per component |
| The rail | Moves to the **inline-end**. This is free if the layout uses logical properties and a rewrite if it does not |
| Layout | CSS logical properties throughout. `margin-inline-start`, `padding-inline`, `border-inline-start` — never `left` or `right` |
| Email | **Does not mirror.** `ops@riyadh-holdings.example` reads left-to-right in both locales |
| Phone | **Does not mirror.** `+966501234567` right-to-left is unusable, and the `+` lands in the wrong place |
| `ticketNumber` | **Does not mirror**, and uses Latin digits in both locales (BR-8.13). `TCK-2026-000418` is quoted aloud and pasted into other systems |
| Timestamps | Locale-formatted, Gregorian calendar, Latin digits (BR-8.13) |
| Counts in the rail | Latin digits, `tabular-nums`, so the column of numbers aligns |
| User content | `fullName`, `companyName`, `notes`, and every ticket `subject` carry `dir="auto"` — an Arabic subject in an English interface is normal, and without it the trailing punctuation lands on the wrong side and reads as a typo (ADR-007 §8) |
| Status dot | Mirrors with the row. A dot is symmetric, so this is invisible; it is listed because the row's padding is not |
| The "see all" chevron | **Mirrors.** It is a direction indicator; an arrow flips, a check mark does not |

`FE-018-08` walks this screen in Arabic and records what it found in `tests.md`. RTL
defects are visual — no assertion catches a rail sized to the English word "PendingCustomer".

The specific thing to look at: **the rail's status labels.** "قيد الانتظار من العميل" is
substantially longer than "PendingCustomer", and the rail is 240px wide in the screen
spec. Either it wraps, or the count is pushed out of the row. This is found in the
preview or it is found after the screen is wired.

## Accessibility

| Requirement | Verified by |
|---|---|
| Every ticket row is a link, reachable by keyboard, with a visible focus ring | `FE-018-08` |
| The rail is a list, marked up as one — not a grid of divs | `FE-018-08` |
| Each rail row's count is associated with its status label, so a screen reader reads "Open, 2" and not "Open" then "2" | `FE-018-08` |
| The status dot is decorative and carries no accessible name; the label is the name | `FE-018-08` |
| The loading skeleton is `aria-busy` and does not announce placeholder text as content | `FE-018-08` |
| The empty state's action is a real button or link, not a clickable div | `FE-018-08` |
| The `traceId` on the error state is selectable text, so it can be copied and quoted | `FE-018-08` |
| Colour is never the only carrier of status — every dot has its label beside it | `FE-018-08` |

## Preview before build — not optional

`FE-018-00` renders this screen with real tokens, real copy, plausible data volumes, all
of the states above, and both languages **before** anything is wired.

Three things this preview exists to find, all of which cost minutes here and hours after
the screen has tests, translation keys, and query wiring (ADR-009,
`docs/sdd/design/preview-first-workflow.md`):

1. **The empty state at full size.** It is the common case, and it is the state that is
   never designed because it is never the one in the mock-up.
2. **The Arabic status labels in a 240px rail.** See above.
3. **Ten ticket rows with long Arabic subjects.** The screen spec gives the row 61px. A
   subject that wraps to two lines makes ten rows into fifteen rows of height, and the
   rail then ends well above the bottom of the section.

## Not on this screen

| Excluded | Where |
|---|---|
| Editing the customer | `017-update-customer` — it owns the `Edit` button |
| Paging through all of the customer's tickets | `/tickets?customerId=…`, via "see all" |
| Filtering the recent list by status | Nowhere. The recent list is the last ten things that happened (AC-8) |
| Ticket actions — assign, change status, escalate | `/tickets/:id`. The overview is not an action surface |
| A cross-channel interaction feed | Out of scope in US-004 |
| Charts, trends, per-customer SLA | Out of scope in US-004; `020-dashboard` owns aggregate visualisation |
| A "forbidden" state | Nowhere. BR-6 permits both roles (AC-12) |
| A "conflict" state | Nowhere. This screen mutates nothing |
