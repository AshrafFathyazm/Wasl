# 012 — Frontend Spec

**Screen:** Ticket detail (the take-action path) · **Route:** `/tickets/:id` ·
**Story:** US-008 · **Who can reach it:** any authenticated support user. Which actions
succeed depends on BR-6 and the server decides it

The element-by-element screen spec, with tokens, icons, and layout regions, is
[`docs/sdd/design/screens/04-ticket-detail.md`](../../docs/sdd/design/screens/04-ticket-detail.md).
It is not duplicated here. This file carries what is specific to **this feature's**
build: the contract binding, the states, the i18n keys, and the RTL obligations.

The API surface is [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md).

This feature owns the **Take action** control, the confirm dialog, the close-with-note
dialog, and the conflict banner. It does not own the rest of the screen —
`010-ticket-list-and-detail` owns the strip, the rail, and the body sections, and
`013-ticket-timeline-and-comments` owns the composer.

---

## Components

| Component | Kind (ADR-011 §4) | Fetches? |
|---|---|---|
| `TicketDetailPage` | Route / page | Yes — owns the ticket query **and** this mutation |
| `StatusActions` | Feature component | No — receives `allowedTransitions` and a handler as props |
| `ConfirmTransitionDialog` | Feature component | No |
| `ConcurrencyConflictBanner` | Feature component | No |
| `Button`, `Badge`, `Textarea`, `Dialog` | Primitive | No |

Fetching only at the route level, per ADR-011 §4. No global store — the only client
state here is which dialog is open, which is `useState` in the component that owns it.
The ticket, its `version`, and its `allowedTransitions` are server state and live in
TanStack Query.

`StatusActions` takes `allowedTransitions: TicketStatus[]` and maps over it. **It has no
`switch` on status and no local copy of BR-1** (AC-20). A reviewer should be able to
confirm that by reading one file.

## Fields

Only one, and only in one dialog.

| Field | Control | Required | Client rule | Mirrors |
|---|---|---|---|---|
| `note` | `Textarea`, `dir="auto"` | when the current status is `New` or `Open` **and** the target is `Closed` | non-empty, ≤500 | AC-5, AC-6 |

The note field is **shown on every confirm dialog** and only *required* on the two
premature-close transitions. Hiding it elsewhere would mean the volunteered reason the
contract explicitly accepts has nowhere to be typed.

`status` and `expectedVersion` are not fields. `status` comes from the menu item the
user chose; `expectedVersion` comes from the cached ticket that backed the render —
never from a fresh fetch at submit time, which would make the conflict undetectable.

## States — all seven, none optional

| State | What the user sees | AC |
|---|---|---|
| **Loading** | Skeleton where the action control sits. Not a spinner in place of the whole header | — |
| **Idle** | One menu item per entry in `allowedTransitions`, labelled from the catalogue | AC-20 |
| **Empty** | `allowedTransitions` is `[]` → **the control is not rendered at all**. The normal state of a `Closed` ticket | AC-20 |
| **Submitting** | The chosen item shows progress; the control is disabled so a double-click sends one request | AC-13 |
| **Error** | `detail` from the server, near the control; the actions are replaced from `problem.allowedTransitions` | AC-21 |
| **Forbidden** | Inline message beside the control, not a toast. The user needs to see what they cannot do, next to it | AC-14 |
| **Conflict** | Banner above the summary strip: someone else changed this ticket, with `Reload`. **No auto-retry** | AC-17 |

Two of these are decisions worth defending:

- **Empty is "not rendered", not "disabled".** A disabled menu on a closed ticket invites
  a second click and a hover-tooltip explanation that has to be written and translated. An
  absent control needs neither, and it falls out of `[].map()` with no special case.
- **`errors/same-status-transition` produces no message at all.** It refetches and stops.
  The user double-clicked; telling them they attempted something forbidden is a lie about
  a double-click, and it teaches them to distrust the real messages.

There is no **not found** state owned here — `404` on the ticket belongs to `010`.

## Localization

Every string is a key. No literals in JSX (BR-8.8), enforced by lint.

| Key | `en` | Note |
|---|---|---|
| `tickets:takeAction` | Take action | The control label |
| `tickets:status.new` | New | Label only; the value stays `New` on the wire |
| `tickets:status.open` | Open | |
| `tickets:status.inProgress` | In progress | |
| `tickets:status.pendingCustomer` | Waiting on customer | |
| `tickets:status.resolved` | Resolved | |
| `tickets:status.closed` | Closed | |
| `tickets:action.moveToOpen` | Move to Open | An action label, not a status label — "Start work" is not "In progress" |
| `tickets:action.startWork` | Start work | |
| `tickets:action.waitOnCustomer` | Wait on customer | |
| `tickets:action.resolve` | Resolve | |
| `tickets:action.close` | Close ticket | |
| `tickets:confirm.title` | Change status to {{status}}? | Interpolated. The label is passed in, never concatenated |
| `tickets:confirm.submit` | Confirm | |
| `tickets:close.noteLabel` | Why is this being closed? | |
| `tickets:close.notePlaceholder` | Spam, a duplicate, or a mistake — say which | Mirrors BR-1.2's purpose |
| `tickets:close.noteRequired` | A note is required when closing a ticket that was never worked | Client mirror of AC-5 |
| `tickets:note.optionalLabel` | Note (optional) | The same field on every other transition |
| `tickets:conflict.title` | Someone else changed this ticket | |
| `tickets:conflict.body` | It changed while you were looking at it. Reload to see the current state before acting | Never offers a retry |
| `tickets:conflict.reload` | Reload | |
| `tickets:statusChanged` | Status changed to {{status}} | Success toast, interpolated |
| `errors.maxLength` | Must be {{max}} characters or fewer | Interpolated, never concatenated |

Every key exists in `ar` as well, enforced by the parity test (BR-8.11) — not by
discipline.

**Server-authored messages are not in this table.** `title` and `detail` on every
`4xx`/`409` arrive already translated (BR-8.6) and are rendered as received.
Re-translating them client-side would put the same sentence in two catalogues and
guarantee they drift.

### The interpolation point

`"A ticket in {{from}} cannot move to {{to}}. Permitted: {{allowed}}."` is one key with
named placeholders, on **both** sides. It cannot be assembled from fragments, because
the fragments land in a different order in Arabic, and a template built by concatenation
reads as broken grammar rather than as a bug — so it survives review.

Counted nouns — "3 permitted transitions" — use plural keys with all six CLDR categories
(BR-8.14). An English two-form plural applied to Arabic is wrong for most counts and
nothing announces it.

## Right-to-left

| Concern | Requirement |
|---|---|
| Direction | `dir` on the document root, set once (ADR-007 §6) |
| Layout | CSS logical properties throughout. The action row's alignment is `inset-inline-end`, never `right` |
| Action order | **Mirrors.** The menu opens from the inline-end edge and the items align to `start` |
| Menu chevron | **Mirrors** with the layout — it is a directional affordance |
| Note textarea | `dir="auto"`. An Arabic note in an English interface is normal, and without it the punctuation lands in the wrong place and looks like a typo (ADR-007 §8) |
| `ticketNumber` in the toast and the dialog | **Does not mirror, and stays Latin digits.** `TCK-2026-000042` is quoted aloud and pasted between systems (BR-8.13) |
| Status badge | Colour and text mirror position; the badge itself has no direction |
| Timestamps (`closedAtUtc`) | Gregorian calendar, Latin digits under `ar` (BR-8.13) |

`FE-012-07` walks this control in Arabic and records what it found in `tests.md`. RTL
defects are visual — no assertion catches a menu sized to English action labels, and
"Waiting on customer" in Arabic is not the same width.

## Accessibility

| Requirement | Verified by |
|---|---|
| The action control is a real menu: reachable by keyboard, `Escape` closes it, focus returns to the trigger | `FE-012-07` |
| Every menu item and dialog control has a visible focus ring | `FE-012-07` |
| The note `Textarea` has a programmatic label, not a placeholder standing in for one | `FE-012-07` |
| The note error is associated via `aria-describedby` and announced on appearance | `FE-012-07` |
| The conflict banner is announced — it appears without the user's action, so it needs a live region | `FE-012-07` |
| Submitting state is conveyed, not only styled; the disabled control says why | `FE-012-07` |
| Status is never conveyed by colour alone — the badge carries text | `FE-012-07` |

## Preview before build — not optional

`FE-012-00` renders the take-action menu, both dialogs, and the conflict banner with real
tokens, real copy, plausible data, all seven states, and both languages **before**
anything is wired.

There are five action labels, a required-note dialog, and a banner in this feature, and
the Arabic label for "Waiting on customer" is materially longer than the English. Finding
that in a preview costs minutes; finding it after the control has tests, translation
keys, and query wiring costs hours (ADR-009,
`docs/sdd/design/preview-first-workflow.md`).

## Not on this screen

| Excluded | Where |
|---|---|
| Assign / reassign | `011-assign-ticket` — a different endpoint and a different rule (BR-2) |
| Escalate | `016-escalate-ticket` (US-009). Escalation is a flag, not a status |
| Add comment, the composer | `013-ticket-timeline-and-comments` |
| The timeline drawer | `013` |
| Reopening a closed ticket | Nowhere. `Closed` is terminal (ADR-004), and the UI expresses that by rendering no actions at all |
| A client-side transition matrix | Nowhere, deliberately. It is the thing `allowedTransitions` exists to prevent (AC-20) |
| Bulk status change from the list | No requirement |
