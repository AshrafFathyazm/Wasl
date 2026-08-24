# 008 — Frontend Spec

**Screens:** Customers list · Customer profile ·
**Routes:** `/customers`, `/customers/:id` · **Story:** US-002 ·
**Who can reach them:** any authenticated support user (Agent or Manager — BR-6)

The element-by-element screen specs, with tokens, icons, and layout regions, are
[`docs/sdd/design/screens/06-customers-list.md`](../../docs/sdd/design/screens/06-customers-list.md)
and
[`07-customer-profile.md`](../../docs/sdd/design/screens/07-customer-profile.md).
They are not duplicated here. This file carries what is specific to **this feature's**
build: the contract binding, the states, the i18n keys, and the RTL obligations.

The API surface is [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md).

---

## What the screen files specify that this feature does not build

Both screen files cover US-002 **and** US-004. Three things in them belong to `018`:

| In the screen file | Not built here | Why |
|---|---|---|
| `Tickets` count column on the list | Deferred to `018` | `dbo.Tickets` does not exist until `009`. The alternatives are a fabricated `0` or a query against a missing table |
| Profile rail: counts by status, total, anchors | Deferred to `018` | Same. The rail region is left out of the layout rather than rendered empty |
| Profile load calling `/api/customers/{id}/overview` | Built against `/api/customers/{id}` | `/overview` is `018`'s endpoint. Route, layout, and query key stay; only the fetcher changes |

Stated here so a reviewer comparing the screen file to the build sees a decision. A
column that exists in the spec and not in the build, with no note, reads as an oversight
every time.

## Components

| Component | Kind (ADR-011 §4) | Fetches? |
|---|---|---|
| `CustomerListPage` | Route / page | Yes — owns the list query and reads the URL params |
| `CustomerProfilePage` | Route / page | Yes — owns the detail query |
| `CustomerTable` | Feature component | No — receives rows and sort order as props |
| `CustomerSearchInput` | Feature component | No — receives the value and an `onChange`; debouncing is its own concern |
| `CustomerContactStrip` | Feature component | No |
| `Input`, `Button`, `Badge`, `Table` primitives | Primitive | No |

Fetching only at the route level, per ADR-011 §4. `CustomerSearchInput` fetching its own
results is the request waterfall this rule exists to prevent — and on a debounced input it
would produce one waterfall per keystroke.

No global store. Search and page live in the URL; the rest is server state in TanStack
Query (ADR-011 §1).

## Fields rendered

### List row

| Column | Source | Rendering |
|---|---|---|
| Name | `fullName` | Flex, ellipsis, **`dir="auto"`** |
| Email | `email` | Fixed 220, ellipsis, `--text-secondary`, **LTR always**, `—` when `null` |
| Phone | `phone` | Fixed 150, `tabular-nums`, E.164, **Latin digits, LTR always**, `—` when `null` |
| Company | `companyName` | Flex, ellipsis, `dir="auto"`, `—` when absent |

`—` rather than an empty cell for an absent value: an empty cell is indistinguishable from
a rendering failure, and both email and phone are legitimately absent (BR-4.1 requires
only one of them).

### Profile

| Field | Source | Rendering |
|---|---|---|
| Name | `fullName` | `--type-title-1` / 700, **`dir="auto"`** |
| Email | `email` | `mailto:` link, LTR always |
| Phone | `phone` | `tel:` link, `tabular-nums`, LTR always |
| Company | `companyName` | `dir="auto"`, `—` when absent |
| Since | `createdAtUtc` | Locale-formatted, Gregorian, Latin digits |
| Notes | `notes` | `dir="auto"`, line breaks preserved, muted "no notes" when empty |

`Edit` is in the screen file and is hidden until `017` ships. `version` is fetched and
held but not rendered — `017` needs it, and refetching the whole profile to obtain it
later would be a wasted round trip.

## States — none optional

### `/customers`

| State | What the user sees | AC |
|---|---|---|
| **Loading (first)** | Skeleton rows at the real 61px height | AC-13 |
| **Refetching** | Existing rows dimmed, spinner in the toolbar. **Not** skeletons | — |
| **Loaded** | Rows, pagination footer, effective page size | AC-4 |
| **Empty — none exist** | Illustration, message, create CTA | AC-13 |
| **Empty — no matches** | Different message, `Clear search`, create CTA carrying the term | AC-13 |
| **Error** | Message, `traceId`, retry | AC-13 |

The two empty states are **two components**, not one with a conditional string. They lead
to different actions, and collapsing them is how "no customers exist" gets shown to
someone who has 137 customers and a typo in the search box.

### `/customers/:id`

| State | What the user sees | AC |
|---|---|---|
| **Loading** | Skeleton header and contact strip | AC-12 |
| **Loaded** | Profile | AC-1 |
| **Not found** | Full-page state, route back to the list. Reached by `404` **and** by a malformed id | AC-12 |
| **Error** | Message, `traceId`, retry — visibly different from not-found | AC-12 |
| **No notes** | Muted "no notes" | AC-12 |

Not-found and error are the pair most often collapsed into one, and they mean opposite
things: one is an answer from the server, the other is the absence of one (ADR-011 §5).

**States that do not exist here, recorded so the absence is a decision:**

| Missing state | Why |
|---|---|
| Forbidden (`403`) | BR-6 permits both roles to view a customer. No endpoint in this feature can return `403` |
| Conflict (`409`) | Nothing on either screen mutates |
| Validating | Neither screen has a form. The search box is a filter, not an input with rules |
| Submitting | Same |

## Localization

Every string is a key. No literals in JSX (BR-8.8), enforced by lint.

| Key | `en` | Note |
|---|---|---|
| `customers:list.title` | Customers | Page heading |
| `customers:new` | New customer | Header action, routes to `007`'s form |
| `customers:list.search` | Search name, email or phone | Placeholder **and** the input's accessible label |
| `customers:list.column.name` | Name | |
| `customers:list.column.email` | Email | |
| `customers:list.column.phone` | Phone | |
| `customers:list.column.company` | Company | |
| `customers:list.empty.none` | No customers yet | "Nothing exists" |
| `customers:list.empty.noMatch` | No customer matches "{{term}}" | "Nothing matched" — interpolated, never concatenated |
| `customers:list.clearSearch` | Clear search | |
| `customers:list.createWithTerm` | Create "{{term}}" as a new customer | The duplicate-prevention affordance |
| `customers:list.count` | {{count}} customer / customers | **Plural key**, all six CLDR categories in `ar` (BR-8.14) |
| `customers:list.rowsPerPage` | Rows per page | |
| `customers:field.email` | Email | Shared with the profile strip |
| `customers:field.phone` | Phone | |
| `customers:field.company` | Company | |
| `customers:field.since` | Customer since | |
| `customers:field.notes` | Notes | |
| `customers:field.noNotes` | No notes | |
| `customers:field.absent` | — | The em dash for an absent value, as a key so it can be changed once |
| `customers:profile.notFound.title` | Customer not found | |
| `customers:profile.notFound.body` | This customer does not exist, or the link is incomplete | Covers the malformed-id case in one sentence |
| `customers:profile.backToList` | Back to customers | |
| `common:retry` | Retry | Shared |
| `common:errorTraceId` | Reference: {{traceId}} | `traceId` interpolated, never translated |

Every key exists in `ar` as well, enforced by the parity test (BR-8.11) — not by
discipline.

**Server-authored messages are not in this table.** `400` and `404` messages arrive
already translated (BR-8.6) and are rendered as received.

## Right-to-left

| Concern | Requirement |
|---|---|
| Direction | `dir` on the document root, set once (ADR-007 §6) |
| Layout | CSS logical properties throughout. `padding-inline-start`, never `padding-left` |
| Table | **Column order reverses.** Name is at the inline-start in both locales, which is the visual left in `en` and the visual right in `ar` |
| Pagination | Sits at the inline-end. Chevrons **mirror** — `‹` and `›` swap meaning. This is the single highest-risk element in Phase 1's RTL work |
| Pagination digits | **Do not mirror and are not converted.** Latin digits in both locales (BR-8.13) |
| User content | `fullName`, `companyName`, `notes` carry `dir="auto"` — an Arabic name in an English table is normal, and without it the punctuation lands in the wrong place and looks like a typo (ADR-007 §8) |
| Email and phone | **Do not mirror.** `+966501234567` and `ali@example.com` read left-to-right in both locales. An E.164 number rendered RTL is un-diallable, and it is the defect most likely to survive review because it still looks like a phone number |
| Search icon | Mirrors with the layout. The magnifier's handle points at the inline-start |
| Ellipsis truncation | Truncates at the inline-end. A name truncated at the wrong end shows the family name and hides the given name |

`FE-008-06` walks both screens in Arabic and records what it found in `tests.md`. RTL
defects are visual — no assertion catches a table column sized to English heading text,
and none catches a mirrored phone number.

## Accessibility

| Requirement | Verified by |
|---|---|
| The table is a real `<table>` with `<th scope="col">` headings, not a grid of divs | `FE-008-06` |
| Row activation works by keyboard, not click-only — the row's primary action is a focusable link, not an `onClick` on `<tr>` | `FE-008-06` |
| The search input has a programmatic label, not a placeholder standing in for one | `FE-008-06` |
| Search results are announced: an `aria-live="polite"` region carries the result count after each debounced fetch | `FE-008-06` |
| Pagination controls are buttons with accessible names, and the current page carries `aria-current="page"` | `FE-008-06` |
| The disabled state of first/last page is conveyed, not only styled | `FE-008-06` |
| Every interactive element has a visible focus ring | `FE-008-06` |
| Skeletons are `aria-busy`, so a screen reader is not read a table of placeholder shapes | `FE-008-06` |

The live region matters more here than anywhere else in Phase 1: a sighted user sees rows
change as they type, and without it a screen-reader user gets silence.

## Preview before build — not optional

`FE-008-00` renders **both** screens with real tokens, real copy, plausible data lengths,
every state above, and both languages **before** anything is wired.

The table is the reason this gate is not skippable here. Column widths are decided by the
longest plausible value, and the Arabic heading for "Company" is longer than the English
one while an Arabic name is often shorter — so the widths that look right in `en` look
wrong in `ar` in a way no assertion detects. Finding that in a preview costs minutes;
finding it after the screens have tests, translation keys, and query wiring costs hours
(ADR-009, `docs/sdd/design/preview-first-workflow.md`).

## Not on these screens

| Excluded | Where |
|---|---|
| Creating a customer | `007` — this screen links to it |
| Editing, deactivating | `017` |
| Ticket counts, the status rail, recent tickets | `018` (needs `009`) |
| Filters, bulk actions, export, merge, import, inline editing | No requirement (screen file, "Not on this screen") |
| Column configuration | No requirement |
| Client-side sorting by column | No requirement, and it would break pagination — page 2 would be sorted independently of page 1 |
| Arabic search normalisation | Q-7, deferred with the fix written down. Do not normalise the term client-side |
