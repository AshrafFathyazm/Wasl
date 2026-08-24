# 016 — Frontend Spec

**Screen:** Ticket detail · **Route:** `/tickets/:id` · **Story:** US-009 ·
**Who can reach the screen:** any authenticated support user · **Who can reach the
action:** a `Manager`, on a ticket the server reports as escalatable (BR-3.2, BR-3.3,
BR-3.4)

The element-by-element screen spec, with tokens, icons, and layout regions, is
[`docs/sdd/design/screens/04-ticket-detail.md`](../../docs/sdd/design/screens/04-ticket-detail.md);
the confirm-modal structure, the toast rules, and the four-states doctrine are
[`10-shared-patterns.md`](../../docs/sdd/design/screens/10-shared-patterns.md). Neither is
duplicated here. This file carries what is specific to **this feature's** build: the
contract binding, the states, the i18n keys, the RTL obligations, and the one rule that
must not be re-implemented on this side.

The API surface is [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md).

This feature **adds to** an existing screen. It does not own `/tickets/:id` — `010` does,
and `012` owns the take-action menu that the Escalate item joins.

---

## Components

| Component | Kind (ADR-011 §4) | Fetches? | Owner |
|---|---|---|---|
| `TicketDetailPage` | Route / page | Yes — owns the ticket query and the escalate mutation | `010`, extended here |
| `TakeActionMenu` | Feature component | No | `012`, gains one item here |
| `EscalateDialog` | Feature component | No — receives handlers as props | **New here** |
| `EscalatedCallout` | Feature component | No | **New here** |
| `Modal`, `Textarea`, `Button`, `Badge` | Primitive | No | `006` |

Fetching only at the route level (ADR-011 §4). No global store: the dialog's open/closed
state is `useState` in `TicketDetailPage`, the reason is React Hook Form state, and the
ticket is TanStack Query state. There is nothing else, so there is nothing for a store to
hold.

`EscalatedCallout` is a feature component rather than a new primitive: it is one instance
of the `Callout` shape at `--state-danger-bg`, and a primitive arrives when the second
consumer does, not when one is imagined (ADR-011 §3).

## Fields

One field. That is the whole request besides the version the client already holds.

| Field | Control | Required | Client rule | Mirrors |
|---|---|---|---|---|
| `reason` | `Textarea`, multiline, 4 rows | **yes** | Trimmed, 1–500 characters. **Trim first, then measure** — the server does, and doing it the other way round rejects a 500-character reason with a trailing space that the server would accept | AC-5, BR-3.5 |
| `expectedVersion` | — (hidden) | **yes** | Taken from the loaded ticket's `version`. Never typed, never derived | AC-12 |

Counter appears at 450 characters (90% of the maximum, per the form-field pattern).
Confirm is disabled at 0 and above 500 — disabled and *conveyed as disabled*, not merely
styled that way.

The record identifier goes **inside the question**, not only in the title:
*"Escalate ticket TCK-2026-000042?"*. Confirming against a specific thing is what stops a
mis-click on the wrong row (`10-shared-patterns.md`).

## The rule this side must not re-implement

Two client-side computations look harmless and are the two defects this feature is about:

| Tempting | Why it is wrong |
|---|---|
| `if (role === 'Manager' && !isEscalated && !['Resolved','Closed'].includes(status))` to decide whether to show Escalate | BR-3 re-implemented in TypeScript. It drifts from the server, and the drift presents as a menu item that produces a `403` for something the interface offered. **Render from `canEscalate`.** `FE-016-03` verifies by grep that no status or role literal appears in `features/tickets/` outside the label catalogue |
| An optimistic `priority: 'High'` while the request is in flight | BR-3.6 is a **floor**. On a `Critical` ticket this shows the user a downgrade that never happened, and they may act on it before the real response lands. **Read `priority` from the response** |

## States — all of them, none optional

| State | Condition | What the user sees | AC |
|---|---|---|---|
| **Action hidden** | `canEscalate === false` | No Escalate item in the take-action menu. Not disabled — absent | AC-15 |
| **Idle** | Dialog open | Empty reason, Confirm **disabled**, counter absent | AC-16 |
| **Validating** | On blur / on type past 450 | Field-level message on blur; counter visible; Confirm disabled at 0 and above 500 | AC-5, AC-16 |
| **Submitting** | Request in flight | Confirm shows a spinner, both buttons disabled, so a double-click sends one request | AC-16 |
| **Error — field** | `400` | `errors.reason` attached to the field. Dialog stays open with the typed text intact | AC-5, AC-16 |
| **Error — forbidden** | `403` | Inline beside the control, **never a toast**. Should be unreachable if `canEscalate` was respected; if it appears the cache is stale, so refetch | AC-16 |
| **Error — not escalatable** | `409 errors/ticket-not-escalatable` | Inline, naming the current status from `errors.status` through a translated label. Close the dialog and refetch — the action should now be hidden | AC-3, AC-16 |
| **Error — already escalated** | `409 errors/already-escalated` | Inline. Refetch; the callout should already have been there. Somebody escalated it while the dialog was open | AC-4, AC-16 |
| **Conflict** | `409 errors/concurrency-conflict` | Banner above the summary strip: someone else changed this ticket, with **Reload**. **No auto-retry** | AC-12, AC-16 |
| **Success** | `200` | Dialog closes, success toast (auto-dismiss 4s), rail callout appears | AC-1, AC-16 |
| **Escalated (steady)** | `isEscalated === true` | Callout on the rail with who / when / why; escalated marker in the list; no Escalate action | AC-9, AC-16 |
| **Loading** | First load of the ticket | Owned by `010` — skeleton for the strip and rail. The rail's escalated slot is part of that skeleton | — |

There is no **empty** state: a one-field dialog has no collection to be empty. Recorded so
the omission is visibly a decision rather than a miss.

`401` is not a dialog state — the session has expired, so it redirects to sign-in.
`404` is not a dialog state either — the ticket is gone, so the page shows the full-page
empty state that `010` owns.

**Errors do not auto-dismiss.** An error that disappears before it is read is an error that
was not reported (`10-shared-patterns.md`).

## Localization

Every string is a key. No literals in JSX (BR-8.8), enforced by lint.

| Key | `en` | Note |
|---|---|---|
| `tickets:escalate.action` | Escalate | The take-action menu item |
| `tickets:escalate.title` | Escalate ticket | Dialog title |
| `tickets:escalate.question` | Escalate ticket {{ticketNumber}}? | Identifier inside the question, interpolated |
| `tickets:escalate.explain` | This raises the priority to at least High and cannot be undone. | Names both consequences. "Cannot be undone" is BR-3.9 told to the user before they act, not after |
| `tickets:escalate.reason.label` | Reason | |
| `tickets:escalate.reason.helper` | Why does this need attention now? | Replaced by the error when there is one |
| `tickets:escalate.reason.counter` | {{count}} / {{max}} | Interpolated; Latin digits in both locales |
| `tickets:escalate.confirm` | Escalate | |
| `tickets:escalate.confirming` | Escalating… | |
| `tickets:escalate.cancel` | Cancel | From `common`, listed for completeness |
| `tickets:escalate.success` | Ticket {{ticketNumber}} escalated | Toast |
| `tickets:escalate.errors.required` | A reason is required | Client mirror of AC-5 |
| `tickets:escalate.errors.tooLong` | Must be {{max}} characters or fewer | Interpolated, never concatenated |
| `tickets:escalate.errors.forbidden` | Only a manager can escalate a ticket | Client copy for the `403` |
| `tickets:escalate.errors.already` | This ticket is already escalated | Client copy for the `409` |
| `tickets:escalate.errors.notEscalatable` | A ticket in {{status}} cannot be escalated | `{{status}}` is a **translated label**, looked up from the untranslated enum value in `errors.status` |
| `tickets:escalated.by` | Escalated by {{name}} · {{when}} | Rail callout heading |
| `tickets:escalated.reasonLabel` | Reason | Callout body label |
| `tickets:escalated` | Escalated | The list/table marker's accessible label |

Every key exists in `ar` as well, enforced by the parity test (BR-8.11) — not by
discipline.

**Server-authored messages are not in this table.** `title` and the sentences inside
`errors` arrive already translated (BR-8.6) and are rendered as received. Re-translating
them would put the same sentence in two catalogues; mapping them would mean parsing
English.

`tickets:escalate.explain` is worth its own line. The sentence must be **one key with named
placeholders**, not fragments joined at runtime: Arabic word order differs from English, so
a sentence assembled by concatenation lands in the wrong order and reads as broken grammar
rather than as a bug.

## Right-to-left

| Concern | Requirement |
|---|---|
| Direction | `dir` on the document root, set once (ADR-007 §6) |
| Layout | CSS logical properties throughout. `margin-inline-start`, never `margin-left` |
| Rail | Moves to the **inline-end**. The escalated callout moves with it; its anchor bar follows via `inset-inline-start` |
| Dialog buttons | Order reverses. Cancel is **always second** in reading order, whichever direction that is |
| The escalate glyph | **Does not mirror.** It contains a vertical arrow, and vertical meaning has no direction (`04-ticket-detail.md`, RTL) |
| Reason text | `dir="auto"` on the `Textarea`, on the callout body, and on the timeline row that renders it. An Arabic reason in an English interface is normal; without `dir="auto"` the trailing full stop lands on the wrong side and reads as a typo (ADR-007 §8) |
| `ticketNumber` inside the question | Latin digits, left-to-right, in both locales (BR-8.13) |
| Timestamp in the callout | Gregorian calendar, Latin digits (BR-8.13) |
| Counter `450 / 500` | Latin digits; the separator does not mirror |

`FE-016-08` walks this screen in Arabic with the dialog open and the callout visible, and
records what it found in `tests.md`. RTL defects are visual — no assertion catches a
callout sized to English label text, and none catches an arrow that flipped when it should
not have.

## Accessibility

| Requirement | Verified by |
|---|---|
| The dialog traps focus; `Escape` and the backdrop both cancel; focus returns to the trigger on close | `FE-016-09` |
| The `Textarea` has a programmatic label, not a placeholder standing in for one | `FE-016-09` |
| The error message is associated via `aria-describedby` and announced when it appears | `FE-016-09` |
| Confirm's disabled state is **conveyed**, not only styled | `FE-016-09` |
| The character counter is announced politely, not on every keystroke | `FE-016-09` |
| The escalated marker in the list carries a label or `title` — **never colour alone**. Red fails for colour-blind users and in monochrome print | `FE-016-06`, `FE-016-08` |
| Every control keyboard reachable with a visible focus ring | `FE-016-09` |

## Preview before build — not optional

`FE-016-00` renders the escalate dialog and the escalated rail callout with real tokens,
real copy, a **500-character reason**, all states, and both languages **before** anything
is wired.

Two things this preview is specifically looking for: a 500-character Arabic reason inside a
440px-wide modal panel, and the callout on the rail at 240px with a long escalator name and
a full reason. Both are containers sized to short English strings by default. Finding that
in a preview costs minutes; finding it after the dialog has tests, translation keys, and
query wiring costs hours (ADR-009,
`docs/sdd/design/preview-first-workflow.md`).

## Not on this screen

| Excluded | Where |
|---|---|
| De-escalating / clearing the flag | Nowhere. BR-3.9 puts it out of scope, and the dialog says so before the user commits |
| The `escalated=true` list filter | `015-ticket-filters-and-search`. If `015` is dropped, AC-9's filter clause is unmet and that is recorded in `summary.md`, not quietly closed (`spec.md` Q-6) |
| The escalated column in the ticket list | `010`'s list projection, using the `isEscalated` this feature exposes |
| Editing the escalation reason | No operation defined. BR-3.4 refuses a second escalation, and there is no update path |
| Escalating to a person or a tier | No requirement. Escalation raises visibility; assignment is `011` |
| An escalation notification | Real delivery is out of scope project-wide; `021` is the provider abstraction |
| Changing priority directly | A separate Manager-only action per BR-6, with no story in this release |
| A count of escalated tickets | `020-dashboard` |
