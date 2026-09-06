# Screen — Create ticket

**Route** `/tickets/new` · **Story** US-005 · **Agent, Manager**

> **v2 — 2026-09-06, `038-new-ticket-redesign`.** The product owner supplied a working HTML
> mock-up and six named changes. **The v1 revision is kept in full at the foot of this
> file**, not deleted: `027` established that a superseded design is recorded rather than
> replaced, so that a reader meeting a v1 decision in old code can find out what it was
> and why it changed.

## Layout

```text
Tickets  ›  New ticket

┌ Customer * ─────────────────────── + New customer ─┐ ┌ Routing ───────────┐
│ [search by name, email or phone…………………………………]     │ │ Channel *          │
│ ┌ عـ  Gulf Logistics · ops@… · Gulf Holdings [change]│ │ [✉][W][💬][SMS][▤] │
│ ⚠ 3 open tickets — review before creating  [show]  │ │ arrived on: Email  │
└─────────────────────────────────────────────────────┘ │ Category *  [⌄]    │
┌ Subject * ──────────────────────────────────────────┐ │ Priority           │
│ [_______________________________________]  0/200    │ │ [•Low ][•Normal ]  │
│ ─────────────────────────────────────────────────── │ │ [•High][•Critical] │
│ Description *                                       │ │ Assignment         │
│ [                                              ]    │ │ [Unassigned ⌄] ✕   │
└─────────────────────────────────────────────────────┘ └────────────────────┘
─────────────────────────────────────────────────────────────────────────────
⊗ 2 fields missing: Description, Category        [Cancel]  [Create ticket]
```

Two columns at **≥1100px** — `minmax(0, 1fr) 316px` — one stacked column below it. The
declaration lives in the **stylesheet**; see *How this design was measured*.

The footer is fixed to the bottom of the content area. The form scrolls under it.

## Elements

| Element | Component | Tokens | Icon | i18n key |
|---|---|---|---|---|
| Section card | feature-local | `--surface-card`, 1px `--border-subtle`, **radius 10 by value**, padding 16 | — | — |
| Customer search | Input + result list | h47 (`--field-height-md`), debounce 300ms | `search` | `tickets:new.searchPlaceholder` |
| Result row | — | avatar + name + email + **company** | — | — |
| Selected customer | Card | name, email · company, «change» | — | `tickets:new.changeCustomer` |
| New customer | Button, Secondary-Outline | opens `CreateCustomerForm` in a **SideSheet** | `add-customer` | `tickets:new.newCustomer` |
| **Duplicate banner** | feature-local | `--state-warning-bg` / `--state-warning-border` / `--state-warning-text` | `triangle-alert` | `tickets:new.openTickets` |
| Subject | Input | h47, max **200**, counter `0/200` always visible | — | `tickets:field.subject` |
| Description | Textarea | 6 rows, max 4000, counter from 3800 | — | `tickets:field.description` |
| **Channel** | feature-local `RadioGroup` | five cells, h40, `aria-checked` | `mail` `whatsapp` `chat` `sms` `web form` | `tickets:field.channel` |
| Category | Dropdown | required | `chevron-down` | `tickets:field.category` |
| **Priority** | feature-local `RadioGroup` | four cells, colour dot, **none selected** | — | `tickets:field.priority` |
| Assignment | Dropdown, **disabled** | reason rendered as helper text | `chevron-down` | `tickets:new.assignment` |
| Error summary | feature-local | `--state-danger-text`, in the footer | `circle-x` | `tickets:new.missing` |
| Cancel | Button, Secondary-Outline | — | — | `common:cancel` |
| Create | Button, Primary | **never disabled** | — | `tickets:new.submit` |

**Enum options come from the contract constants**, never hand-typed — categories, channels
and priorities alike. A value added on the server then appears; a literal list would stay
complete-looking and wrong.

## Actions

| # | Trigger | Guard | Request | Success | Failure |
|---|---|---|---|---|---|
| 1 | Search customer | ≥2 chars | `GET /api/customers?search=` | Result list, keyboard navigable | Empty → "no matches" plus create-new |
| 2 | Select | — | `GET /api/tickets?customerId=&status=…` | Collapse to the card; banner if any are open | **Silent.** The check is advisory |
| 3 | New customer | — | `POST /api/customers` in a sheet | Sheet closes, customer **read back** and selected | Sheet keeps the input; the ticket form is untouched |
| 4 | Submit | Zod passes | `POST /api/tickets` + `Idempotency-Key` | Navigate by `Location` | `400` field errors · `404` customer gone → clear selection · `401` re-login |
| 5 | Submit, incomplete | — | **none** | — | Footer summary + focus to the first missing field |

`createdByUserId` is taken from the token and any value in the body is ignored (AC-12).

## States

| State | Renders |
|---|---|
| First paint | **Every field live.** No customer is required to start typing |
| Before the first submit | No error anywhere, on any field |
| After a failed submit | Summary in the footer; each bad field marked; live per-field correction |
| Customer with open tickets | Amber banner, count from `totalCount`, list on demand |
| Submitting | Button spinner, double submit impossible |
| Customer gone (`404`) | Selection cleared, **everything else preserved** |

## RTL

Labels and asterisks move to the inline-start. Dropdowns keep their chevron at the
inline-end. The counter sits at the inline-end of its field. **The channel and priority
groups swap their horizontal arrow keys**: in Arabic the visually-next cell is the one
ArrowLeft reaches. The breadcrumb chevron mirrors — «تذكرة جديدة ‹ التذاكر» — because it
points from parent to child in reading order.

## Not on this screen

Templates · attachments · custom fields · draft saving · escalation · tags · SLA.

**Assigning at creation is DRAWN AND DISABLED, with the reason on the control.** v1 put it
out of scope outright (US-007 — creation and routing are separate decisions) and that
reasoning still holds: `POST /api/tickets` carries no `assigneeId`. What changed is only
how the absence is presented — `027`'s rule that an unbuilt *action* may be drawn
read-only, while an unbuilt *data* region may not, because a control promises nothing until
it is pressed. It has **no fetcher at all**, and a test asserts that.

## How this design was measured

The mock-up was opened in Chrome at 1443 × 900 before anything was built. Four things it
does are **not** reproduced, and three of them are its own defects:

1. **Its two-column layout never renders.** `grid-template-columns` is in the element's
   `style` attribute, so its `@media (min-width:1100px)` rule never applies. Measured:
   media query `true`, computed columns one `1060px` track. *An inline style outranks every
   stylesheet rule that is not `!important`, and nothing errors.* `027` hit the identical
   thing in `Sidebar.tsx`. The grid here is declared in CSS and a source scan forbids an
   inline `style` on the page.
2. **Its duplicate banner renders no count** — the template variable resolves to empty. The
   count here comes from the list envelope's `totalCount`, so nine open tickets say nine
   while five are listed.
3. **Its summary and its focus disagree** — it names the customer first and focuses the
   subject, because its focus lookup only sees fields carrying `aria-invalid`. Both read one
   ordered array here.
4. Its preselected priority, its 120-character subject and its 8px field radius are
   **rulings against**, not defects — see `specs/038-new-ticket-redesign/spec.md` §7.

---

# v1 — superseded 2026-09-06, kept for the record

**Route** `/tickets/new` · **Story** US-005 · **Agent, Manager**

## Layout

```text
‹ Back   New ticket

┌ Customer ──────────────────────────────────────────┐
│ [search a customer…………………]  or  + New customer     │
│ selected: Riyadh Holdings · ali@…  [change]         │
└─────────────────────────────────────────────────────┘
┌ Ticket ─────────────────────────────────────────────┐
│ Subject *          [_____________________________]  │
│ Description *      [                             ]  │
│ Category *  [⌄]   Priority [⌄]   Channel * [⌄]      │
└─────────────────────────────────────────────────────┘
                                  [Cancel]  [Create]
```

Single column, max 720. A form wider than that makes the eye travel between label and
field.

## Elements

| Element | Component | Tokens | Icon | i18n key |
|---|---|---|---|---|
| Section card | — | white, 1px `--Neutral-200`, `--radius-sm`, padding 24, gap 16 | — | — |
| Customer search | Input + result list | h47, debounce 300ms, `dir="auto"` on results | `search` | `tickets:new.findCustomer` |
| Selected customer | Card | `--surface-content`, name + email + `change` | `customer` | — |
| New customer | Link button | opens `/customers/new` with `returnUrl` | `add` | `customers:new` |
| Subject | Input | h47, max 200, counter from 180 | — | `tickets:field.subject` |
| Description | Textarea | min 5 rows, max 4000, counter from 3800 | — | `tickets:field.description` |
| Category | Select | required | `chevronDown` | `tickets:field.category` |
| Priority | Select | defaults to Normal | `chevronDown` | `tickets:field.priority` |
| Channel | Select | required | `chevronDown` | `tickets:field.channel` |
| Required marker | — | `*` in `--red-600` **after** the label | — | — |
| Cancel | Button, Secondary-Outline | — | — | `common:cancel` |
| Create | Button, Primary | disabled until valid | — | `tickets:new.submit` |

## Actions

| # | Trigger | Guard | Request | Success | Failure |
|---|---|---|---|---|---|
| 1 | Search customer | ≥2 chars | `GET /api/customers?search=` | Result list, keyboard navigable | Empty → "no matches" plus create-new |
| 2 | Select | — | — | Collapse to the selected card | — |
| 3 | Submit | Zod passes | `POST /api/tickets` | Toast with the new number, navigate to detail | `400` field errors · `404` customer gone → clear selection, explain · `401` re-login |
| 4 | Cancel | Dirty form | — | Confirm discard, then back | — |

## States

| State | Renders |
|---|---|
| No customer selected | Ticket section disabled with an explanation, not hidden |
| Submitting | Button spinner, fields read-only, double submit impossible |
| Validation errors | Field-level, focus moves to the first invalid field |
| Returning from create-customer | New customer pre-selected, form values preserved |

## Not on this screen (v1)

Templates · attachments · assigning at creation (US-007 — creation and routing are
separate decisions) · custom fields · draft saving.
