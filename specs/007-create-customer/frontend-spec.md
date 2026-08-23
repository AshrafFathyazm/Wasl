# 007 — Frontend Spec

**Screen:** Create Customer · **Route:** `/customers/new` · **Story:** US-001 ·
**Who can reach it:** any authenticated support user (Agent or Manager — BR-6)

The element-by-element screen spec, with tokens, icons, and layout regions, is
[`docs/sdd/design/screens/08-create-customer.md`](../../docs/sdd/design/screens/08-create-customer.md).
It is not duplicated here. This file carries what is specific to **this feature's**
build: the contract binding, the states, the i18n keys, and the RTL obligations.

The API surface is [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md).

---

## Components

| Component | Kind (ADR-011 §4) | Fetches? |
|---|---|---|
| `CreateCustomerPage` | Route / page | Yes — owns the mutation |
| `CustomerForm` | Feature component | No — receives handlers as props |
| `Input`, `Button` | Primitive | No |

Fetching only at the route level, per ADR-011 §4. No global store — there is nothing
here that is not either server state (TanStack Query) or form state (React Hook Form).

## Fields

| Field | Control | Required | Client rule | Mirrors |
|---|---|---|---|---|
| `fullName` | `Input` | yes | 1–200, not whitespace-only | AC-2 |
| `email` | `Input type=email` | one of two | valid email, ≤320 | AC-5 |
| `phone` | `Input type=tel` | one of two | ≤20, **no normalisation client-side** | AC-6, AC-7 |
| `companyName` | `Input` | no | ≤200 | — |
| `notes` | `Input` multiline | no | ≤2000 | — |

The at-least-one-contact rule (AC-3) shows on **both** `email` and `phone`. Zod's
`refine` attaches to one path, so the second is set in the submit handler — a single
message on one field reads as "the email is wrong", which is not what the rule says.

## States — all five, none optional

| State | What the user sees | AC |
|---|---|---|
| **Idle** | Empty form, submit enabled | — |
| **Validating** | Field-level message on blur, before any request | AC-16 |
| **Submitting** | Submit disabled and showing progress; a double-click sends one request | AC-17 |
| **Error** | Server messages attached to the fields the server named. `409` is inline, never a banner | AC-16 |
| **Success** | Navigate to the profile using the `Location` header | AC-1 |

There is no **empty** state — a create form has no collection to be empty. Recorded so
the omission is visibly a decision rather than a miss.

`401` is not a form state: the session has expired, so it redirects to sign-in.

## Localization

Every string is a key. No literals in JSX (BR-8.8), enforced by lint.

| Key | `en` | Note |
|---|---|---|
| `customers.create.title` | Create customer | Page heading |
| `customers.create.fullName` | Full name | |
| `customers.create.email` | Email | |
| `customers.create.phone` | Phone | |
| `customers.create.companyName` | Company | |
| `customers.create.notes` | Notes | |
| `customers.create.submit` | Create customer | |
| `customers.create.submitting` | Creating… | |
| `errors.contactRequired` | Provide either an email address or a phone number | Client-authored mirror of AC-3 |
| `errors.maxLength` | Must be {{max}} characters or fewer | Interpolated, never concatenated |

Every key exists in `ar` as well, enforced by the parity test (BR-8.11) — not by
discipline.

**Server-authored messages are not in this table.** Validation and duplicate messages
arrive already translated (BR-8.6). They are rendered as received; re-translating or
mapping them client-side would put the same sentence in two catalogues.

## Right-to-left

| Concern | Requirement |
|---|---|
| Direction | `dir` on the document root, set once (ADR-007 §6) |
| Layout | CSS logical properties throughout. `margin-inline-start`, never `margin-left` |
| User content | Every input carries `dir="auto"` — an Arabic name typed into an English form is normal, and without it the punctuation lands in the wrong place and looks like a typo (ADR-007 §8) |
| Phone number | **Does not mirror.** `+966501234567` reads left-to-right in both locales |
| Validation icons | Mirror with the layout; a check mark does not, an arrow does |

`FE-007-07` walks this screen in Arabic and records what it found in `tests.md`. RTL
defects are visual — no assertion catches a container sized to English label text.

## Accessibility

| Requirement | Verified by |
|---|---|
| Every control reachable by keyboard with a visible focus ring | `FE-007-07` |
| Each `Input` has a programmatic label, not a placeholder standing in for one | `FE-007-07` |
| Error messages associated via `aria-describedby`, announced on appearance | `FE-007-07` |
| Submit's disabled state is conveyed, not only styled | `FE-007-07` |

## Preview before build — not optional

`FE-007-00` renders this screen with real tokens, real copy, plausible data lengths, all
five states, and both languages **before** anything is wired.

The Arabic label for "Company" is longer than the English one. Finding that in a preview
costs minutes; finding it after the screen has tests, translation keys, and query wiring
costs hours (ADR-009, `docs/sdd/design/preview-first-workflow.md`).

## Not on this screen

| Excluded | Where |
|---|---|
| Customer list and search | `008` |
| Editing an existing customer | `017` |
| A link to the conflicting customer on `409` | Nowhere — the `409` deliberately carries no id (BR-4.7) |
| Attachments | Out of scope project-wide, stated in `spec.md` |
| Bulk import | No requirement |
