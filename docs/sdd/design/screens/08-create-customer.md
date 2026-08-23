# Screen — Create customer

**Route** `/customers/new` · **Story** US-001 · **Agent, Manager**

The first write path in the system, and the one carrying the duplicate rule.

## Layout

```text
‹ Back   New customer

┌─────────────────────────────────────────────────┐
│ Full name *      [__________________________]   │
│                                                 │
│ At least one contact method is required         │
│ Email            [__________________________]   │
│ Phone            [__________________________]   │
│                                                 │
│ Company          [__________________________]   │
│ Notes            [                          ]   │
└─────────────────────────────────────────────────┘
                              [Cancel]  [Create]
```

Single column, max 640. The contact hint sits **above** the two fields it governs,
because a cross-field rule explained under the second field is explained too late.

## Elements

| Element | Component | Tokens | i18n key |
|---|---|---|---|
| Full name | Input | h47, max 200, `dir="auto"` | `customers:field.name` |
| Contact hint | Callout | `--state-info-bg`, `--type-caption` | `customers:contactRequired` |
| Email | Input | h47, `inputMode="email"`, always LTR | `customers:field.email` |
| Phone | Input | h47, `inputMode="tel"`, always LTR | `customers:field.phone` |
| Company | Input | h47, max 200, `dir="auto"` | `customers:field.company` |
| Notes | Textarea | 4 rows, max 2000, `dir="auto"` | `customers:field.notes` |
| Create | Button, Primary | disabled until valid | `customers:new.submit` |

## Validation, and where each rule lives

| Rule | Client | Server |
|---|---|---|
| Name required, non-whitespace | Zod, on blur | `400` naming `fullName` |
| At least one contact (BR-4.1) | Zod cross-field refinement | `400` naming both |
| Email shape | Zod | `400` |
| Phone parseable to E.164 (BR-4.3) | Light check only | `400` naming `phone` — **not** `409` |
| Duplicate email (BR-4.4) | **Not checked client-side** | `409` naming `email` |
| Duplicate phone (BR-4.5) | **Not checked client-side** | `409` naming `phone` |

The client deliberately does not pre-check duplicates. A check-then-create is a race:
two requests can both pass it. The unique index is the guarantee (BR-4.8), and the
`409` is how the client learns.

## Actions

| # | Trigger | Guard | Request | Success | Failure |
|---|---|---|---|---|---|
| 1 | Submit | Zod passes | `POST /api/customers` | Toast, follow `Location` to the profile — or return to the ticket form if `returnUrl` was set | See below |
| 2 | Cancel | Dirty | — | Confirm discard | — |

**On `409 duplicate-customer`:** attach the server's message to the field named in the
response, and offer **`Find the existing customer`** which navigates to
`/customers?search=<that value>`.

The `409` body names the field only — it does not return the existing customer's id or
details (BR-4.7). So the client cannot link straight to the record, and search is the
intended route. That constraint is deliberate and this is where it is felt.

## States

| State | Renders |
|---|---|
| Empty form | Create disabled; the contact hint is visible, not an error |
| Submitting | Spinner, fields read-only, double submit impossible (AC-17) |
| Duplicate | Field-level error plus the find-existing action |
| Both fields duplicate | Names `email` first and stops. One conflict is enough to act on |
| Returning to a ticket form | Toast confirms, navigates back, new customer pre-selected |

## RTL

Labels move to the inline-start. **Email and phone inputs stay LTR** even in the Arabic
interface — typing an address right-to-left puts the cursor in the wrong place and the
value reads scrambled. Name, company, and notes are `dir="auto"`.

## Not on this screen

Duplicate pre-warning as you type · address fields · custom fields · avatar upload ·
import · assigning an account owner.
