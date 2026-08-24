# 009 — Frontend Spec

**Screen:** Create ticket · **Route:** `/tickets/new` · **Story:** US-005 ·
**Who can reach it:** any authenticated support user (Agent or Manager — BR-6)

The element-by-element screen spec, with tokens, icons, and layout regions, is
[`docs/sdd/design/screens/05-create-ticket.md`](../../docs/sdd/design/screens/05-create-ticket.md).
It is not duplicated here. This file carries what is specific to **this feature's**
build: the contract binding, the states, the i18n keys, and the RTL obligations.

The API surface is [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md).

---

## Components

| Component | Kind (ADR-011 §4) | Fetches? |
|---|---|---|
| `CreateTicketPage` | Route / page | Yes — owns the `POST` mutation **and** the customer search query |
| `CustomerPicker` | Feature component | No — receives results and handlers as props |
| `TicketForm` | Feature component | No — receives handlers as props |
| `Input`, `Textarea`, `Select`, `Button`, `Card` | Primitive | No |

Both fetches live in the route, per ADR-011 §4. The picker looking up its own customers
is the request-waterfall pattern the rule exists to prevent, and it is the tempting
shape here because the search *feels* local to the picker.

No global store. The complete client state on this screen:

| State | Home |
|---|---|
| Form values | React Hook Form |
| The selected customer | Form state — `customerId` is a form field, not a separate selection object |
| The search term | `useState` in the route. **Not the URL** — see below |
| Server results | TanStack Query, keyed on the debounced term |

`customerId` being a form field rather than its own piece of state is what makes the Zod
schema the single gate on "is a customer selected" (AC-14). A parallel `selectedCustomer`
object would be a second copy that can disagree with the form.

The search term is the one exception to ADR-011 §2 on this screen: a half-typed search
inside a create form is not a shareable view, and pushing it to the URL would put a
history entry behind every keystroke. Recorded because it is a deliberate departure.

## Fields

| Field | Control | Required | Client rule | Serves |
|---|---|---|---|---|
| `customerId` | `CustomerPicker` | yes | Must be a selected customer's id; search needs ≥2 chars, debounced 300ms | AC-14 |
| `subject` | `Input` | yes | Trimmed 1–200, counter from 180, `dir="auto"` | AC-6, AC-7 |
| `description` | `Textarea`, min 5 rows | yes | Trimmed 1–4000, counter from 3800, `dir="auto"` | AC-6, AC-7 |
| `category` | `Select` | yes | One of four; options generated, never hand-typed | AC-5 |
| `priority` | `Select` | no | Defaults to `Normal`; omitted from the request when untouched | AC-8 |
| `channel` | `Select` | yes | One of five | AC-5 |

Trim before measuring, not after submitting: `"   "` passes a naive length check and is a
`400` at the server (AC-7). Send what the user typed; measure what is left after trimming.

## States — none optional

| State | What the user sees | AC |
|---|---|---|
| **Idle, no customer** | The ticket section is rendered **disabled with an explanation**. Not hidden — a section that appears after a selection reads as a page that was broken until it wasn't | AC-14 |
| **Searching** | Spinner inside the search field. Results are keyboard navigable, each `dir="auto"` because a customer name may be Arabic | AC-14 |
| **Empty search result** | "No matches" plus a link to `/customers/new` carrying `returnUrl`. Returning pre-selects the new customer and **preserves every field already typed** | AC-14 |
| **Validating** | Field-level message on blur, before any request. Focus moves to the first invalid field on a failed submit | AC-15 |
| **Submitting** | Button spinner, fields read-only, submit disabled — a double-click sends one request. The endpoint is not idempotent, so this is the only thing preventing two tickets | AC-15 |
| **Error (`400`)** | Server messages attached to the fields the server named. Field-level, never a banner | AC-15 |
| **Customer gone (`404`)** | Picker selection cleared with an explanation; `subject`, `description`, and the three selects keep their values. Losing the user's typing here is the worst possible response to someone else's data change | AC-15 |
| **Forbidden (`403`)** | **Cannot occur.** BR-6 permits creation for both roles. Recorded so the omission is visibly a decision — every other Phase 2 ticket screen has one | — |
| **Conflict (`409`)** | **Cannot occur.** No duplicate rule and no concurrency token on create | — |
| **Success** | Navigate to the ticket detail via the `Location` header; toast the `ticketNumber` verbatim | AC-1 |

There is no **empty** state in the list sense — a create form has no collection to be
empty. The nearest thing is the empty search result, which is listed above.

`401` is not a form state: the session has expired, so it redirects to sign-in.

## Localization

Every string is a key. No literals in JSX (BR-8.8), enforced by lint.

| Key | `en` | Note |
|---|---|---|
| `tickets:new.title` | New ticket | Page heading |
| `tickets:new.findCustomer` | Search a customer… | Search placeholder |
| `tickets:new.selectCustomerFirst` | Select a customer to continue | The disabled-section explanation |
| `tickets:new.noMatches` | No matching customers | Empty search result |
| `tickets:new.customerRequired` | Select a customer | Client-authored mirror of AC-14 |
| `tickets:new.customerGone` | This customer is no longer available. Choose another. | Rendered on the `404` |
| `tickets:new.submit` | Create ticket | |
| `tickets:new.submitting` | Creating… | |
| `tickets:new.created` | Ticket {{ticketNumber}} created | Toast. Interpolated, never concatenated |
| `tickets:field.subject` | Subject | |
| `tickets:field.description` | Description | |
| `tickets:field.category` | Category | |
| `tickets:field.priority` | Priority | |
| `tickets:field.channel` | Channel | |
| `tickets:category.Billing` … `.General` | Billing / Technical / Account / General | One key **per enum value** |
| `tickets:priority.Low` … `.Critical` | Low / Normal / High / Critical | One key per enum value |
| `tickets:channel.Email` … `.WebForm` | Email / WhatsApp / Live chat / SMS / Web form | One key per enum value. The **key** carries the wire value (`Sms`), the label is free |
| `common:cancel` | Cancel | Shared |
| `errors.maxLength` | Must be {{max}} characters or fewer | Interpolated |

Every key exists in `ar` as well, enforced by the parity test (BR-8.11) — not by
discipline.

**The enum-label tables are the silent failure on this screen.** The parity test catches
a key present in `en` and missing in `ar`. It cannot catch a key missing from **both**,
which is exactly what happens when someone adds `TicketCategory.Hardware` to the backend.
The dropdown then shows a fallback or a raw key for a real, selectable category. That is
why the option lists are generated from the OpenAPI enum and checked against the
catalogue at build time (`FE-009-05`), rather than trusted.

**Server-authored messages are not in this table.** Validation and not-found messages
arrive already translated (BR-8.6). They are rendered as received.

## Right-to-left

| Concern | Requirement |
|---|---|
| Direction | `dir` on the document root, set once (ADR-007 §6) |
| Layout | CSS logical properties throughout. `margin-inline-start`, never `margin-left` |
| Labels and the required `*` | Move to the inline-start |
| Select chevron | Stays at the inline-**end** — it mirrors with the field |
| Character counter | Inline-end of its field |
| `subject`, `description`, search results, the selected-customer card | `dir="auto"`, so Arabic content aligns as it is typed and its punctuation lands correctly. Without it an Arabic subject renders with the full stop on the wrong side and reads as a typo (ADR-007 §8) |
| **`ticketNumber` does not mirror** | `TCK-2026-000042` reads left-to-right in both locales, in Latin digits (BR-8.13). It is quoted aloud and pasted between systems |
| Customer email in the picker result | Does not mirror — an address is LTR in every locale |

`FE-009-06` walks this screen in Arabic and records what it found in `tests.md`. RTL
defects are visual — no assertion catches a container sized to English label text, and
"Priority" is much shorter than its Arabic label.

## Accessibility

| Requirement | Verified by |
|---|---|
| Every control keyboard reachable with a visible focus ring | `FE-009-06` |
| The search result list is arrow-navigable and selectable with Enter; it is a listbox, not a div that happens to respond to clicks | `FE-009-06` |
| Each field has a programmatic label; a placeholder is never the only label | `FE-009-06` |
| Error messages associated via `aria-describedby` and announced on appearance | `FE-009-06` |
| The disabled ticket section conveys **why** it is disabled to a screen reader, not only visually | `FE-009-06` |
| The character counter is `aria-live="polite"` and does not announce on every keystroke | `FE-009-06` |
| Submit's disabled state is conveyed, not only styled | `FE-009-06` |

## Preview before build — not optional

`FE-009-00` renders this screen with real tokens, real copy, plausible data lengths,
every state above, and both languages **before** anything is wired.

Two things this screen will get wrong that a preview catches in minutes and a wired
screen costs hours: the three selects on one row do not fit the Arabic labels at 720px,
and the disabled-until-a-customer-is-selected section has to look deliberately disabled
rather than broken (ADR-009, `docs/sdd/design/preview-first-workflow.md`).

## Not on this screen

| Excluded | Where |
|---|---|
| Assigning at creation | `011`. BR-2.7 keeps triage and ownership separate events |
| Setting a status other than `New` | `012`. BR-1.1 fixes the initial status |
| Comments | `013` |
| Escalation | `016` |
| The ticket list | `010` |
| Ticket templates, draft saving, custom fields | No requirement |
| Attachments | Out of scope project-wide, stated in `spec.md` |
| A timeline of the ticket just created | `013`. The `Created` history row exists (AC-9) but the create response does not carry it — see the contract |
