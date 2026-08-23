# Screen — Create ticket

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

**Enum options are generated from the OpenAPI enum list**, not hand-typed. A new category
added to the backend then cannot be silently missing from the dropdown.

## Actions

| # | Trigger | Guard | Request | Success | Failure |
|---|---|---|---|---|---|
| 1 | Search customer | ≥2 chars | `GET /api/customers?search=` | Result list, keyboard navigable | Empty → "no matches" plus create-new |
| 2 | Select | — | — | Collapse to the selected card | — |
| 3 | Submit | Zod passes | `POST /api/tickets` | Toast with the new number, navigate to detail | `400` field errors · `404` customer gone → clear selection, explain · `401` re-login |
| 4 | Cancel | Dirty form | — | Confirm discard, then back | — |

`createdByUserId` is taken from the token and any value in the body is ignored (AC-12).

## States

| State | Renders |
|---|---|
| No customer selected | Ticket section disabled with an explanation, not hidden |
| Submitting | Button spinner, fields read-only, double submit impossible |
| Validation errors | Field-level, focus moves to the first invalid field |
| Returning from create-customer | New customer pre-selected, form values preserved |

## RTL

Labels and asterisks move to the inline-start. Selects keep their chevron at the
inline-end. The counter sits at the inline-end of its field. Subject and description are
`dir="auto"` while typing, so Arabic input aligns correctly as it is entered.

## Not on this screen

Templates · attachments · assigning at creation (US-007 — creation and routing are
separate decisions) · custom fields · draft saving.
