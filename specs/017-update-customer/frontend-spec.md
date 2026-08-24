# 017 — Frontend Spec

**Screen:** Edit customer · **Route:** `/customers/:id/edit` · **Story:** US-003 ·
**Who can reach it:** any authenticated support user (Agent or Manager — BR-6)

The element-by-element screen spec, with tokens, icons, and layout regions, is the **edit
variant** of
[`docs/sdd/design/screens/08-create-customer.md`](../../docs/sdd/design/screens/08-create-customer.md).
It is not duplicated here. The entry point is the `[Edit]` action in
[`07-customer-profile.md`](../../docs/sdd/design/screens/07-customer-profile.md), which
that spec describes as hidden until this story ships.

This file carries what is specific to **this feature's** build: the contract binding, the
states, the i18n keys, and the RTL obligations.

The API surface is [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md).

---

## What differs from the create screen

The two screens share their fields, their Zod schema, and their layout. Listing the
differences is shorter and more accurate than restating the whole thing:

| Difference | Consequence |
|---|---|
| The form is **prefilled** from `GET /api/customers/{id}` | A loading state exists here and does not exist on create |
| The page **holds a `version`** | It is sent with every save and replaced from every response (AC-23) |
| There are **two** `409`s | The client branches on `type`, not on the status code |
| A **conflict** state exists | New component, new copy, new RTL surface (AC-6) |
| A **not found** state exists | `404` is reachable here and is not on create (AC-5) |
| `PUT` replaces the mutable field set | The form must submit all five fields, always (AC-12) |
| Primary action reads `Save changes`, not `Create customer` | Different key, and the Arabic is a different length |

## Components

| Component | Kind (ADR-011 §4) | Fetches? |
|---|---|---|
| `EditCustomerPage` | Route / page | **Yes** — owns the `GET` query, the mutation, and the held version |
| `CustomerForm` | Feature component | No — reused from `007`, gains an `initialValues` prop and a different submit handler |
| `ConcurrencyConflictNotice` | Feature component | No — receives `onReload` as a prop |
| `Input`, `Button`, `Callout` | Primitive | No |

Fetching only at the route level, per ADR-011 §4. No global store: the customer is server
state (TanStack Query), the field values are form state (React Hook Form), and the held
version is part of the server state — it lives in the query cache entry, not in a `useState`
beside it. Two copies of the version is how the two get out of step.

`CustomerForm` is reused rather than forked. Two forms with the same five fields drift, and
the second one is the one that forgets `dir="auto"`.

## Fields

| Field | Control | Required | Client rule | Serves |
|---|---|---|---|---|
| `fullName` | `Input` | yes | 1–200, not whitespace-only | AC-11 |
| `email` | `Input type=email` | one of two | valid email, ≤320. **No normalisation client-side** | AC-3, AC-9 |
| `phone` | `Input type=tel` | one of two | ≤20. **No normalisation client-side** | AC-3, AC-10 |
| `companyName` | `Input` | no | ≤200 | AC-12 |
| `notes` | `Textarea` | no | ≤2000 | AC-12 |
| `expectedVersion` | none — not a control | yes | Present. Opaque; never rendered, never edited, never parsed | AC-13, AC-23 |

The at-least-one-contact rule (AC-3) shows on **both** `email` and `phone`. Zod's `refine`
attaches to one path, so the second is set in the submit handler — a single message on one
field reads as "the email is wrong", which is not what the rule says.

Every save posts all five fields. An omitted field is cleared and the response is still
`200` (AC-12), so a partial submit is a silent data loss with no error to catch it.

## States — every one, and one deliberately absent

| State | What the user sees | AC |
|---|---|---|
| **Loading** | Skeletons in the shape of the five fields, so nothing shifts when the values arrive. Not a page-replacing spinner | — |
| **Idle / prefilled** | Current values, Save enabled | AC-1 |
| **Validating** | Field-level message on blur, before any request | AC-3, AC-11 |
| **Submitting** | Save disabled and showing progress; a double-click sends one request | AC-6, AC-15 |
| **Field error** | Server messages attached to the fields the server named. The duplicate `409` is inline, on the field, never a banner | AC-2, AC-8 |
| **Conflict** | The conflict notice: an explanation and a **Reload** action. The user's typed values stay on screen until they choose to reload | AC-6, AC-22 |
| **Not found** | Full-region not-found state with a link back to the customer list. Not a toast, and **not** the conflict notice | AC-5 |
| **Success** | Success toast, navigate to the profile, profile data already current | AC-1, AC-23 |
| **Empty** | *Does not exist.* A form has no collection to be empty. Recorded so the omission is visibly a decision | — |
| **Forbidden** | *Does not exist.* Both roles may update a customer (BR-6, AC-21). Building a `403` state here would be building for a response the endpoint cannot produce | AC-21 |

`401` is not a screen state: the session has expired, so it redirects to sign-in.

### The conflict state in detail

This is the acceptance criterion, not a fallback. ADR-006 accepted optimistic concurrency
*because* the conflict is surfaced to a human; a `409` with no path forward would mean the
trade-off that justified the whole approach was not honoured.

| Requirement | Detail |
|---|---|
| Component | `Callout`, `--state-warning-bg`, above the form — not a toast. A toast that auto-dismisses takes the only route forward with it (`10-shared-patterns.md`: errors are manual-dismiss for exactly this reason) |
| Copy | One sentence for *what happened*, one for *what to do*. Both from catalogue keys, both written to survive translation without gaining a line |
| One action | **Reload** — refetches and repopulates with the current values and the current version |
| No auto-retry | Not on a timer, not on a second Save click, not "try once more" (ADR-006) |
| No silent merge | No per-field "keep mine". Field-level merge is out of scope, and a wrong merge changes data with nothing to show it |
| Typed values preserved | Until Reload is pressed. Reload is a deliberate discard, not an ambush |
| Focus | Moves to the notice. Leaving focus on a Save button that will fail again is the accessible version of not reporting the error (`FE-017-11`) |
| Save while the notice is showing | Disabled until Reload. Saving again with the same stale version can only produce the same `409` |

## Localization

Every string is a key. No literals in JSX (BR-8.8), enforced by lint.

| Key | `en` | Note |
|---|---|---|
| `customers.edit.title` | Edit customer | Page heading |
| `customers.edit.submit` | Save changes | Longer than "Create customer" in `ar` — the preview is where that is found |
| `customers.edit.submitting` | Saving… | |
| `customers.edit.saved` | Customer updated | Success toast |
| `customers.edit.discard` | Discard your changes? | Confirmation when leaving a dirty form |
| `customers.edit.notFound.title` | This customer no longer exists | `404` |
| `customers.edit.notFound.action` | Back to customers | |
| `customers.conflict.title` | Someone else changed this customer | The conflict notice heading |
| `customers.conflict.body` | Your changes were not saved. Reload to see the current details, then apply your change again. | Says what happened **and** what to do |
| `customers.conflict.reload` | Reload customer | The only action on the notice |
| `errors.contactRequired` | Provide either an email address or a phone number | Reused from `007` — client-authored mirror of AC-3 |

Every key exists in `ar` as well, enforced by the parity test (BR-8.11) — not by
discipline.

**Server-authored messages are not in this table.** The validation, duplicate, and
concurrency-conflict messages arrive already translated (BR-8.6) and are rendered as
received. The client's own `customers.conflict.*` keys are the *screen's* framing — the
heading, the button — and the server's `detail` is rendered beneath them. Re-translating
the server's sentence would put the same message in two catalogues, where they drift.

## Right-to-left

| Concern | Requirement |
|---|---|
| Direction | `dir` on the document root, set once (ADR-007 §6) |
| Layout | CSS logical properties throughout. `margin-inline-start`, never `margin-left` |
| User content | `fullName`, `companyName`, `notes` carry `dir="auto"` — an Arabic name in an English form is normal, and without it the punctuation lands in the wrong place and reads as a typo (ADR-007 §8) |
| Email and phone inputs | **Do not mirror and are not `dir="auto"`.** They stay LTR even under `ar`: an address typed right-to-left puts the cursor in the wrong place, and `+966501234567` reversed is unusable (`08-create-customer.md`) |
| Conflict notice | Icon at the inline-start, Reload at the inline-end. Both mirror. The **new** direction-sensitive surface in this feature, and the one with no equivalent on the create screen to have caught it already |
| Notice copy | The Arabic sentence is longer. A notice sized to the English text wraps to three lines and pushes the form down, which is the most common RTL defect in the register |
| Save / Cancel pair | Order reverses with the layout; the primary action stays at the inline-end |
| Timestamps in the not-found and success copy | Gregorian calendar, Latin digits (BR-8.13) |

`FE-017-10` walks this screen **and the conflict notice** in Arabic and records what it
found in `tests.md`, including "nothing found" if that is the result. RTL defects are
visual — no assertion catches a container sized to English label text.

## Accessibility

| Requirement | Verified by |
|---|---|
| Every control reachable by keyboard with a visible focus ring | `FE-017-11` |
| Each `Input` has a programmatic label, not a placeholder standing in for one | `FE-017-11` |
| Error messages associated via `aria-describedby`, announced on appearance | `FE-017-11` |
| The conflict notice is announced when it appears — a live region, not only a visual change | `FE-017-11` |
| Focus moves to the notice on conflict, and the Reload action is the next tab stop | `FE-017-11` |
| Save's disabled state is conveyed, not only styled | `FE-017-11` |
| The not-found state is announced and its link is focusable | `FE-017-11` |

The conflict path is the one that fails silently for a screen-reader user: the form looks
unchanged, the save did nothing, and nothing was said. That is the reason it has its own
row rather than being covered by "errors are announced".

## Preview before build — not optional

`FE-017-00` renders this screen with real tokens, real copy, plausible data lengths, **all
states including conflict and not-found**, and both languages **before** anything is
wired.

The conflict notice is the reason this matters here more than on the create screen. It is a
state that does not exist until something goes wrong, so it is the state that gets styled
last, in a hurry, in one language — and it is the state carrying an acceptance criterion.
Rendering it costs minutes. Changing it after the screen has tests, translation keys, and
query wiring costs hours (ADR-009, `docs/sdd/design/preview-first-workflow.md`).

## Not on this screen

| Excluded | Where |
|---|---|
| A field-level history of who changed what | Nowhere by design. US-003 excludes it; the `Customer.Updated` audit row is the record, and `019-audit-log-access` is where it becomes readable (ADR-008) |
| A three-way merge, or per-field "keep mine / keep theirs" on conflict | Out of scope in `spec.md`. Reload is the whole conflict resolution |
| A diff showing what the other person changed | Out of scope. The `409` carries no data (AC-22), and the reload shows the current record — the user compares it against what they typed, on screen |
| Deactivating the customer | No story. `IsActive` is not writable by this endpoint |
| Merging duplicate customers | No requirement |
| A link to the conflicting customer on a duplicate `409` | Nowhere — the `409` deliberately carries no id (BR-4.7). Search in `008` is the route |
| Editing the customer's tickets | `011`, `012` |
| Attachments, address fields, custom fields | Out of scope project-wide |
