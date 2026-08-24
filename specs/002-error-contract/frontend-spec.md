# 002 — Frontend Spec

**Screens: none.** This feature has no route, no page, no visible element, and no i18n key
of its own.

What it has is the **shared error-handling layer** every screen from `007` onward depends
on: three pure functions and one type. They are specified and frozen here; the files are
written inside `006-design-system`, which creates the React application (`spec.md` Q-D).

Which features have the screens that consume this:

| Consumer | Screen | Uses |
|---|---|---|
| `007-create-customer` | `/customers/new` | `parseProblem`, `problemCode`, `applyFieldErrors` — a `400` and a `409 duplicate-customer` both land on form fields |
| `008-customer-list-and-profile` | list, profile | `parseProblem`, `problemCode` — `404` becomes a not-found state |
| `012-change-ticket-status` | ticket detail | `problemCode` — `invalid-status-transition` refreshes the actions; `concurrency-conflict` refetches (ADR-006) |
| `004-auth-and-roles` | sign-in, and the app shell | `problemCode` — `unauthenticated` redirects; `forbidden` renders inline (ADR-011 §5) |
| every screen | — | The default branch for an unrecognised `type` |

`006` builds the presentation of these states — the inline field message, the banner, the
error boundary. This feature builds only the **parsing and routing of the failure**, and the
split is deliberate: what a `409` means is a contract question, and what it looks like is a
design question.

---

## Components

Per ADR-011 §4, three kinds of component exist and only one of them fetches. This feature
contributes **none of the three**.

| Kind | Contribution |
|---|---|
| Route / page | none |
| Feature component | none |
| Primitive | none |
| **Shared utility (not a component)** | `parseProblem`, `problemCode`, `applyFieldErrors`, and the `ProblemDetails` type |

Recorded as a row rather than omitted, so the empty lanes are visibly a decision.

`src/wasl-web/src/shared/api/index.ts` is a barrel file, and the project bans barrel files
(`CLAUDE.md`, TypeScript style). The exception is argued once, here: this folder is a
**published surface** consumed by every feature folder, its three exports are stable, and
without the barrel every feature imports from three deep paths that then cannot be
reorganised. No other folder gets one, and `REV-002-03` checks that no second barrel
appeared.

## The surface

```ts
// PROVISIONAL — replaced by types generated from the OpenAPI document once /swagger
// exists (ADR-011 §6). The swap is FE-002-04, not something to notice later.
export interface ProblemDetails {
  type: string;                              // absolute URI. Branch on this — never on title
  title: string;                             // localized. NEVER branch on it
  status: number;
  detail?: string;                            // localized. Absent on 500
  instance?: string;
  traceId: string;                            // show this to the user on a 500
  errors?: Record<string, string[]>;          // per type, not per status
}

export function parseProblem(response: Response): Promise<ProblemDetails>;
export function problemCode(problem: ProblemDetails): string;
export function applyFieldErrors(
  problem: ProblemDetails,
  setError: (field: string, message: string) => void,
  knownFields: readonly string[],
): string[];                                  // returns the keys it could NOT place
```

### `parseProblem` — never throws

| Input | Returns |
|---|---|
| A contract-shaped `application/problem+json` body | The parsed object, unchanged |
| Valid JSON with no `type` | Synthetic `errors/unparseable-response`, `status` from the response |
| A non-JSON body — an HTML page from a proxy, a plain-text gateway error | Synthetic |
| An empty body — the classic empty `404`, or a `204` | Synthetic |
| A `502`/`504` the API never authored | Synthetic |

The synthetic problem carries `type` `https://wasl.local/errors/unparseable-response`, the
real HTTP `status`, an empty `traceId`, and a `title` from the client catalogue. It exists so
that **every** failure path in the UI has one shape, and so a mistyped URL surfaces as a
not-found state instead of a JavaScript error (`research.md` R-6, AC-24).

`traceId` being empty is honest. The client did not receive one, and inventing a value would
put an unfindable reference number in front of a user.

### `problemCode` — the last path segment

```ts
problemCode({ type: 'https://wasl.local/errors/duplicate-customer', … })  // 'duplicate-customer'
```

Every branch in the application compares this, never the full URI and never `title`. A
changed base host must not change a branch, and AC-25 is the test that changes it.

### `applyFieldErrors` — and what it returns

It sets each `errors` key onto the form field of that exact name, and **returns the keys it
could not place**. The caller is obliged to render those as form-level messages.

Returning them rather than swallowing them is the whole point: a `409 duplicate-customer`
naming `email` on a form that calls the field `emailAddress` would otherwise produce a
submit that fails with no visible reason. A server message the user cannot see is worse than
no validation at all (AC-26).

## All states

This feature renders nothing, so it has no states of its own. What it has is a **complete
mapping from every registry row to the state a screen must show**, which is the artifact
`006` and `007` build against.

| `problemCode` | Status | State the screen shows | Where handled (ADR-011 §5) |
|---|---|---|---|
| `validation` | 400 | Field-level messages on the named fields. Submit re-enabled | Inline |
| `malformed-request` | 400 | Generic failure with a retry. This is a client bug, not user error — it should never reach a user, and if it does, hiding it helps nobody | Inline |
| `unauthenticated` | 401 | Redirect to sign-in. **Not a form error** | App shell |
| `forbidden` | 403 | "You do not have permission for this action", inline, no retry | Inline |
| `not-found` | 404 | Not-found state. The resource may have been removed | Inline |
| `method-not-allowed` | 405 | Generic failure. A client bug | Inline |
| `unsupported-media-type` | 415 | Generic failure. A client bug | Inline |
| `duplicate-customer` | 409 | Field-level message on the named field. **Not a banner** — the user needs to see it where the problem is | Inline |
| `invalid-status-transition` | 409 | Refetch the ticket and re-render `allowedTransitions`. The client's view of what is possible is stale | Inline |
| `already-escalated` | 409 | Refetch; the action is no longer available | Inline |
| `ticket-closed` | 409 | Refetch; a closed ticket is terminal | Inline |
| `concurrency-conflict` | 409 | Explanatory message plus a reload action. **Never an automatic retry** (ADR-006) | Inline |
| `internal` | 500 | Generic message **plus the `traceId`**, and a retry offered once | Inline |
| `unparseable-response` | any | Generic failure with a retry, never a blank screen | Inline |
| *unrecognised* | any | Generic failure with a retry. **Every consumer has this branch** | Inline |

Two rows are load-bearing:

- **`internal` shows the `traceId`.** It is the only thing connecting a user's report to the
  log (BR-9.9). A generic apology with no reference number makes the whole correlation
  mechanism unusable at the one moment it is needed.
- **The unrecognised row is mandatory.** A new registry row must not break a deployed
  client, and it is the one branch that gets left out because nothing exercises it.

A thrown render error is not in this table. That is a route-level `ErrorBoundary`
(ADR-011 §5) — the distinction being whether the API told us something meaningful.

## i18n keys

Server-authored sentences — `title`, `detail`, and the messages inside `errors` — arrive
already translated (BR-8.6) and are rendered as received. They are **not** in this table, and
re-translating or mapping them client-side would put the same sentence in two catalogues.

Client-authored strings this feature introduces:

| Key | `en` | Note |
|---|---|---|
| `errors.generic.title` | Something went wrong | The fallback title for an unrecognised or unparseable failure |
| `errors.generic.retry` | Try again | |
| `errors.generic.reference` | Reference: {{traceId}} | Interpolated, **never concatenated** (ADR-007 §9). `traceId` is not translated and not localized in any way — no digit shaping (BR-8.13) |
| `errors.unparseable.title` | The server response could not be read | |
| `errors.network.title` | Could not reach the server | `fetch` rejected: no response at all, so not a `ProblemDetails` case |
| `errors.forbidden.hint` | You do not have permission for this action | Client-authored on purpose: the server's `403` `detail` deliberately says nothing about which role would work |
| `errors.conflict.reload` | Reload and try again | The action label on a `concurrency-conflict` |

Every key exists in `ar` as well, enforced by the parity test (BR-8.11) — not by discipline.
Seven keys added here rather than in `006` because they belong to the failure taxonomy this
feature defines; `006` styles them.

## Right-to-left

No layout, so nothing mirrors. Two obligations still land on this feature, and both are the
kind that survive review:

| Concern | Requirement |
|---|---|
| `traceId` rendering | `dir="ltr"` on the element showing it, inside an Arabic sentence. A W3C trace id is punctuation-heavy (`00-…-…-01`), and the bidirectional algorithm moves the leading `00-` to the wrong end. It then looks like a typo rather than a bug, so it survives review — and it is a value a user reads aloud or pastes into a report |
| `traceId` digits | Latin digits always. No digit shaping, ever (BR-8.13, ADR-007 §7). Same reason as `TicketNumber`: it is quoted and pasted |
| Server messages | `dir="auto"` on the element rendering a `title`, `detail`, or an `errors` message — before `005`, an English sentence can arrive inside an Arabic interface, which is exactly the normal case ADR-007 §8 describes |
| Layout of the components that show these | `006` and `007`. CSS logical properties, never `left`/`right` |

## Accessibility

The utilities have no DOM, so these are obligations on their **consumers**, recorded here
because this is the file that defines the failure taxonomy and a screen spec that omits them
has nowhere to have inherited them from:

| Requirement | Verified by |
|---|---|
| A field-level message from `errors` is associated with its input via `aria-describedby` and announced when it appears | The consuming feature's own FE task |
| A form-level message from `applyFieldErrors`' return value is in a live region, so a submit that fails for an unplaceable key is announced rather than silent | The consuming feature |
| The `traceId` is selectable text, not an image and not `user-select: none` | `006` |
| A retry control is a `button`, keyboard reachable, with a visible focus ring | `006` |
| An error state does not rely on colour alone | `006` |

`FE-002-05` records this table in `006`'s handoff so it is inherited rather than rediscovered.

## Not on this screen

There is no screen. What is deliberately **not** in this feature:

| Excluded | Where |
|---|---|
| The visual design of any error state — banner, inline message, toast, empty state | `006-design-system` |
| The error boundary component | `006` (ADR-011 §5) |
| A TanStack Query error handler, retry policy, or `onError` default | `006` sets up the query client. This feature defines what to branch on, not where the branch lives |
| Any form, field, or Zod schema | `007` is the first form. The mirror-never-authority rule is stated in `FRONTEND-API-GUIDE.md` |
| Sign-in redirect behaviour on `401` | `004` |
| Localized Arabic error sentences | `005`. Before it, every server sentence is English in both locales, and the machine-readable half is already correct |
| Telemetry, error reporting to a service | No requirement. The `traceId` and the server log are the mechanism |
