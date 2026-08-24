# 011 — Frontend Spec

**Screen:** Ticket detail (assign flow) · **Route:** `/tickets/:id` · **Story:** US-007 ·
**Who can reach it:** any authenticated support user (Agent or Manager — BR-6)

The element-by-element screen spec, with tokens, icons, and layout regions, is
[`docs/sdd/design/screens/04-ticket-detail.md`](../../docs/sdd/design/screens/04-ticket-detail.md).
It is not duplicated here. This file carries what is specific to **this feature's**
build: the contract binding, the states, the i18n keys, and the RTL obligations.

The screen itself is built by `010-ticket-list-and-detail`. This feature adds the
assignee row in the summary strip, the **Assign / Reassign** item in the take-action
menu, and the picker behind it — action 3 in the screen spec's Actions table.

The API surface is [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md).

---

## Components

| Component | Kind (ADR-011 §4) | Fetches? |
|---|---|---|
| `TicketDetailPage` | Route / page | **Yes** — owns the ticket query, the `support-users` query, and the assign mutation |
| `AssigneeSelect` | Feature component | No — receives options, the current assignee, a permission flag, and `onChange` as props |
| `Select`, `Button`, `Badge` | Primitive | No |

Fetching only at the route level (ADR-011 §4). The picker must not fetch when it opens:
a dropdown that issues a request on click is the request waterfall the rule exists to
prevent, and it makes the first open feel broken on a slow connection.

Query and mutation hooks live in `features/tickets/queries.ts`, not in a
`features/supportUsers/` folder. Tickets are the only consumer; ADR-011 §3 says to move
something when the second consumer appears, not when one is imagined.

| Query key | Source | Invalidated by |
|---|---|---|
| `['support-users']` | `GET /api/support-users` | A `400 errors/validation` or `404 errors/assignee-not-found` on assign — both mean the list is stale |
| `['ticket', id]` | `GET /api/tickets/{id}` (owned by `010`) | Every successful assign, and every `409` |
| `['ticket', id, 'timeline']` | Owned by `013` | Every successful assign — the `Assigned` row belongs in it |

No global store. Nothing here is client state beyond "is the picker open", which is
`useState` in the component that owns it (ADR-011 §1).

## Fields

| Field | Control | Required | Client rule | Mirrors |
|---|---|---|---|---|
| Assignee | `Select`, single choice, plus an explicit **Unassigned** option | yes (the option may be "Unassigned") | Options are the active users from the server; "Unassigned" submits `null` | AC-1, AC-2, AC-5, AC-13 |
| `expectedVersion` | not rendered | yes | Taken from the loaded ticket and sent on every call. Replaced from every `200` | AC-12 |

"Unassigned" is a real option in the list, not a clear button beside it. Unassigning is
the same business action with a different target (`plan.md`), and giving it a separate
affordance implies a separate rule.

## States — none optional

| State | What the user sees | AC |
|---|---|---|
| **Loading** | Skeleton in the strip's assignee row; the picker trigger disabled while `support-users` is pending | — |
| **Empty** | `support-users` returned `[]` — an empty state inside the picker saying there is nobody to assign to. Not an empty dropdown, which reads as a broken control | AC-13 |
| **Error** | `support-users` failed — the picker is disabled with a retry, and the rest of the screen keeps working | AC-15 |
| **Forbidden** | The `403` message inline **beside the control**, not a toast (screen spec, States). The picker stays open and nothing the user chose is lost | AC-15 |
| **Conflict** | `errors/ticket-closed` → refetch, the action disappears with the rest · `errors/assignee-unchanged` → refetch and show the current assignee · `errors/concurrency-conflict` → banner above the strip with `Reload`, never an auto-retry | AC-8, AC-11, AC-12 |
| **Disabled (mirrored rule)** | For an Agent on a ticket assigned to someone else, the control is disabled and the reason is shown — before the action, not after it | AC-15 |
| **Success** | Strip shows the new assignee, the take-action menu re-renders from the returned `allowedTransitions`, a toast, and an `Assigned` row appears in the activity section | AC-1, AC-2, AC-9 |

Absence of a state is a defect, not a gap (`docs/sdd/design/screens/README.md`).

`401` is not a screen state: the session has expired, so it redirects to sign-in.

**The state that gets missed.** A ticket whose assignee has since been deactivated: the
assignee exists on the ticket and is **absent from the picker's options**. Render the
current assignee from the ticket response. Looking the id up in the options list yields
nothing and renders as blank, which reads as missing data rather than as a deactivated
user.

## Localization

Every string is a key. No literals in JSX (BR-8.8), enforced by lint.

| Key | `en` | Note |
|---|---|---|
| `tickets:assignee.label` | Assignee | Strip label and the picker's programmatic label |
| `tickets:assignee.unassigned` | Unassigned | Both the strip value and the picker option |
| `tickets:assignee.assign` | Assign | Menu item when the ticket is unassigned |
| `tickets:assignee.reassign` | Reassign | Menu item when it is assigned — a different word, because it is a different act |
| `tickets:assignee.confirm` | Assign to {{name}}? | Interpolated, never concatenated |
| `tickets:assignee.confirmUnassign` | Remove the current assignee? | |
| `tickets:assignee.notPermitted` | Only a manager can assign a ticket to someone else | Client-authored **mirror** of BR-2. Must not contradict the server's `403` message — `REV-011-04` checks that they read consistently in both languages |
| `tickets:assignee.selfOnly` | You can only assign an unassigned ticket to yourself | The BR-2.2 case of the same mirror |
| `tickets:assignee.pickerEmpty` | There are no active users to assign | The empty state |
| `tickets:assignee.pickerError` | The user list could not be loaded | With a retry |
| `tickets:assignee.role.Agent` | Agent | Label for the enum value `Agent` |
| `tickets:assignee.role.Manager` | Manager | Label for the enum value `Manager` |

Every key exists in `ar` as well, enforced by the parity test (BR-8.11) — not by
discipline.

**Server-authored messages are not in this table.** The `403`, the inactive-user `400`,
and every `409` title arrive already translated (BR-8.6). They are rendered as received;
re-translating or mapping them client-side would put the same sentence in two catalogues
and let them drift.

**No plural key on this screen.** There is no counted noun in the assign flow, so
BR-8.14 does not apply here. Recorded so the omission is visibly a decision — the
"assigned N tickets" style string belongs to `020-dashboard`.

## Right-to-left

| Concern | Requirement |
|---|---|
| Direction | `dir` on the document root, set once (ADR-007 §6) |
| Layout | CSS logical properties throughout. The picker's popover anchors with `inset-inline-start`, never `left` |
| Avatar and name pairing | **Mirrors.** In Arabic the name sits on the inline-start side of the avatar, which is the right of it. Getting this with `margin-left` looks correct in English and collides in Arabic |
| Select chevron | **Does not mirror.** `chevronDown` is vertical, and vertical meaning has no direction (screen spec, RTL) |
| User content | Every element rendering a `fullName` carries `dir="auto"` — an Arabic name in an English list is normal, and without it the punctuation lands in the wrong place and looks like a typo (ADR-007 §8) |
| Ticket number in the conflict banner | **Does not mirror and stays Latin** — `TCK-2026-000042` reads left-to-right in both locales (BR-8.13) |
| Option ordering | Sorted with `Intl.Collator(activeLocale)`. The server's order is a database collation and does not follow the request locale |

`FE-011-06` walks this in Arabic and records what it found in `tests.md`. RTL defects are
visual — no assertion catches a picker sized to English names.

## Accessibility

| Requirement | Verified by |
|---|---|
| The picker is keyboard operable — open, arrow, select, escape — with a visible focus ring | `FE-011-06` |
| It has a programmatic label (`tickets:assignee.label`), not a placeholder standing in for one | `FE-011-06` |
| The **disabled** state's reason is associated with the control via `aria-describedby` | `FE-011-06` |
| The `403` message is announced when it appears, not only rendered | `FE-011-06` |
| The role badge is not the only carrier of meaning — the role is in the accessible name too | `FE-011-06` |

The second and third rows are the ones that fail silently: a control that is visually
disabled with a tooltip-only reason tells a screen-reader user that the action is
unavailable and never says why, which is indistinguishable from a broken page.

## Preview before build — not optional

`FE-011-00` renders this before anything is wired: the strip's assignee row, the picker
open with a mixed Arabic and English list, the disabled state with its reason, the `403`
inline message, the empty picker, and both languages.

Two things this catches in minutes and nowhere else. The Arabic for "Unassigned"
(`غير مُسند`) is longer than the English, and it sits in a 240px rail beside a status
badge. And a long Arabic full name plus a role badge in the summary strip is the widest
single cell on the densest screen in the product. Finding either after the picker has
tests, translation keys, and query wiring costs hours (ADR-009,
`docs/sdd/design/preview-first-workflow.md`).

## Not on this screen

| Excluded | Where |
|---|---|
| Status changes, and the rest of the take-action menu | `012-change-ticket-status` |
| The `assignee` filter (`me`, `unassigned`) on the list | `010`, then `015` |
| The activity and timeline sections themselves | `013-ticket-timeline-and-comments`. This feature only expects its `Assigned` row to appear there |
| Escalation | `016-escalate-ticket` |
| A workload count next to each name in the picker | Needs a workload model nobody has specified (`spec.md`, Out of scope) |
| Search or paging inside the picker | The pool is seeded and bounded (`spec.md` A-4) |
| Managing support users | Not in the release. `SupportUsers` is seeded (ADR-005) |
| A capability flag from the server replacing the mirrored rule | Nowhere yet — `spec.md` Q-4 records it as the better design and `010`'s read shape as its home |
