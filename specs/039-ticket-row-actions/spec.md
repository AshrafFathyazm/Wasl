# 039 — Reassign and Close, from the ticket row

**Lane** frontend · **Route** `/tickets`, `/tickets/mine`, `/tickets/unassigned` · **Story** US-004, US-006
**Reverses a ruling in** `026-ticket-list` · **Design of record** `docs/sdd/design/screens/03-tickets-list.md`
**Endpoints** `PUT /api/tickets/{id}/assignee` (`011`) · `PUT /api/tickets/{id}/status` (`012`) ·
`GET /api/tickets/{id}` (`009`) · `GET /api/support-users` (`011`)

The product owner supplied a working HTML mock-up (`wasl-ticket-actions.html`) and a written
brief in three numbered parts. This spec is the reading of both against what the backend
actually carries, before any code.

---

## 1. Why

`026` shipped the row menu with four items and a stated rule: **every item navigates.** Its
own comment says why —

> Reassign and Close are real operations with a frozen contract each … and the controls that
> handle those answers live on the detail screen. Firing either from a list row would mean a
> second implementation of the concurrency handling, in a component that has no version to
> send. So the menu takes the user to where the action is, carrying its intent.

The product owner overrules that. A support agent working a queue reassigns and closes far
more often than they read a ticket in full, and the current path costs a full route change,
a detail fetch and a scroll for a decision that is one click wide.

**The objection was not wrong, and it is not dismissed — it is answered in §4.2.** The row
genuinely has no `version` and no `allowedTransitions`; `010` named both absences a decision
rather than an oversight. What changes is where they come from, not whether they are needed.

---

## 2. The mock-up was RUN, not read

Opened in Chrome at 1443 × 900 and again at 1443 × 620 CSS px, from
`scratchpad/mock.html`. Seven findings. Four change what gets built.

| # | Finding | Consequence |
|---|---|---|
| **M-1** | **The «إشعار العميل» checkbox does not render.** It is a stray `<label>` carrying `display: none`, and it sits **outside** the `[role="dialog"]` element entirely — a sibling of it inside the scrim. Measured: `{ inDialog: false, labelDisplay: "none", visible: false }`. | The brief (§2) asks for it. The mock is therefore **not** its reference — nothing in the mock shows where it goes, how it is labelled, or what it does. It also has no backend (G-5). See AC-34 and **Q-2**. |
| **M-2** | **The mock closes a ticket whose status is «قيد المعالجة» — `InProgress`.** BR-1 forbids `InProgress → Closed`; the API answers `409 errors/invalid-status-transition`. The mock's confirm succeeds, because it talks to nothing. | The Close item cannot be a straight-through action. The modal reads `allowedTransitions` from the ticket and refuses **before** the request, with the reason on screen — never by mirroring BR-1 in React. AC-16, AC-17. |
| **M-3** | **The panel's own JavaScript cap and flip both work, and both were exercised.** Cap, viewport 622, panel anchored at `top: 324`: `max-height` set to `278.254px`, panel bottom 602, 20px clear of the fold. Flip, same viewport with the trigger pushed to `top: 470` (118px of room below): `bottom: 40px`, `top: auto`, panel bottom 464 — **above** the trigger, `flippedAbove: true`, and it never covers the trigger in any of the four positions sampled. | The mechanism is sound and is the reference. Our `useMenuSurface` already flips; **it does not cap** — see G-6. |
| **M-4** | **The flip needed a taller document to reach.** At the shipped page height the document's whole scroll range is 162px, so the trigger can never sit low enough in the viewport and `place()`'s upward branch is **dead code in the mock as delivered**. It was reached only after 1400px of padding was injected. | Recorded so nobody reports "the flip works, I saw it" from a session that never ran it. Our own guard has to place the trigger deliberately, not scroll the page and hope. |
| **M-5** | Panel measured **305px** wide during the entrance animation and **308px** after it settled — `taModal` ends on `scale(.99)`. Height 429. | Any pixel assertion waits for the animation. A test asserting 308 immediately after open is a flake with a plausible-looking failure. |
| **M-6** | The mock's own action menu **already** renders «إغلاق التذكرة» in `rgb(13, 38, 38)` = `#0D2626`, and «تصعيد» disabled with its reason in `title`. Menu width 214px. | The colour change the brief asks for is already made in the mock; it is **our** `TicketListPage` that still carries `styles.rowMenuItemDanger` on that item. AC-3. |
| **M-7** | Toast host: `position: fixed`, `inset-block-start: 24px`, `inset-inline-end: 24px` (computed `left: 24px` under `dir="rtl"`), `z-index: 400`, card 360px. Stack capped at three — firing four left `[B, C, D]`, the oldest evicted. `role="status"` on success and info, `role="alert"` on warning and error. Modal: 440px wide, `max-height` 435px against a 435px 70vh, children `86 / 280 / 69` with only the middle one `overflow-y: auto`. Scrim click did **not** close it; `Escape` did. | Every one of these is already the behaviour of `components/Toast/` and `components/Modal/`. Nothing new is specified here — see §3.3 and §4.5. |

**M-8, the encoding.** The attachment arrived mis-decoded (UTF-8 read through cp1252), the
same as `038`. Re-encoding recovered 31,082 bytes with **0 unmapped characters**, and the
Arabic still has holes: cp1252 has no code point for bytes `0x81 0x8D 0x8F 0x90 0x9D`, and
`0x81` is the second byte of `ف`. Every `ف` in the mock is gone and cannot be recovered.
**The Arabic copy in this feature is written, not transcribed** — same ruling as `038` M-4.

---

## 3. What the brief asks for

Restated as behaviour. The mock is the reference for geometry and interaction; the brief is
the reference for intent; where they disagree, §2 says which.

### 3.1 Reassign — a menu, not a modal

A single choice with no other field does not earn a surface that blocks the page. 308px,
hung under the trigger, holding: a search-by-name field, the list of support users, then a
rule and «إلغاء الإسناد».

Each row: the initial, the name, the second line, and the count of that person's open
tickets — `#C4362F` at 8 or more, `#8A5A00` from 5 to 7, `#76818C` below that. The brief's
reason for the count is the load-bearing half: *«هذا ما يجعل الاختيار قراراً بدل قائمة
أسماء»* — it is what makes the pick a decision rather than a list of names.

The current assignee carries a tick and a `#F5F8F8` ground. **Picking commits immediately —
there is no confirm button.** «إلغاء الإسناد» is *not* red: red is for what cannot be taken
back, and an unassign is one click from being undone. The rule above it and the dashed
circle are what separate it.

**The height cap is computed in JavaScript on every open, never as a CSS value** — measure
the room under the trigger, flip the menu above it when that is not enough, recompute on
`scroll` and `resize`. Only the name list scrolls; «إلغاء الإسناد» stays pinned beneath it.
Dismissed by an outside click and by `Escape`.

### 3.2 Close — a 420px modal

This one is a decision: a reason, and a record of it.

Four reasons as buttons — «تم حلّ المشكلة» · «مكرّرة» · «لا تتطلّب إجراءً» · «لم يردّ
العميل». «التذكرة الأصلية» appears only under «مكرّرة», and there is an optional resolution summary.

The brief also asks for an «إشعار العميل» checkbox and an amber «آخر رسالة من العميل بلا
ردّ» warning. **Neither ships** — G-5 and G-6, ruled in Q-2 — and neither is drawn disabled.

The primary button is navy, not red — closing is reopenable, so it is not destructive — and
the action menu's «Close ticket» loses its red for `#0D2626` as well. **Red is left to
delete, alone.**

The scrim is `position: fixed`, `z-index: 300`, at page level and not inside a card; the
dialog is 420 wide (Q-3) and `max-height: 70vh`, with a scrolling body between a fixed
header and a fixed footer. A scrim click does **not** close it, because it holds input. `Escape` does.

### 3.3 A toast after every success

From the system's `Toast`, four seconds, top of the inline-end edge.

| Event | Tone | Title | Body |
|---|---|---|---|
| Assign | `success` | «أُسندت التذكرة إلى {الاسم}» | «{رقم التذكرة} — سيصل إشعار للمُسند إليه.» |
| Unassign | `info` | «أُلغي إسناد التذكرة» | «{رقم التذكرة} انتقلت إلى غير المسندة.» |
| Close | `success` | «أُغلقت التذكرة» | «{رقم التذكرة} — السبب: {السبب}. يمكن إعادة فتحها من سجل التذكرة.» |

Three at most, the timer pauses on hover, `role="status"` for success and info and
`role="alert"` for warning and error, and **no success toast is fired from inside a modal —
the modal closes first.**

**Every rule in that paragraph is already `components/Toast/`'s behaviour**, verified
against the source and against M-7: `TOAST_MS.success === 4000`, `TOAST_MS.info === 5000`,
`MAX_VISIBLE === 3`, `role={interrupts ? 'alert' : 'status'}`, the host at
`inset-inline-end: var(--space-6)`. This feature **fires** toasts; it does not configure the
toast system, and the one thing it must not do is re-implement any of it.

> **One deviation from the brief, put to the product owner rather than absorbed.** The brief
> says four seconds for all three. The unassign toast is `info`, and `info` is five seconds
> in `design/feedback-layer.md` §2's timing table. Changing `TOAST_MS.info` for this screen
> would change every info toast in the product. **Ruled 2026-09-06 (Q-4): the tone wins** —
> 4s success, 5s info, and `TOAST_MS` is not touched.

---

## 4. What the backend carries, and what it does not

This is the half the mock cannot tell you, and it is where this feature is decided.

### 4.1 The gaps, measured against the types and the contracts

| # | The mock draws | The product has | Ruling |
|---|---|---|---|
| **G-1** | A team under each name — «الدعم الأول», «الفريق التقني» | `SupportUser` is `(id, fullName, role)`. **There is no team and no department.** `027` met this already and recorded it: *"the department does not exist"* | The second line is the **role** — «مدير» / «وكيل» — which is real and is already rendered on the detail screen's panel. Not a team. AC-8 |
| **G-2** | An open-ticket count per person, in three colours | **No such field on any contract.** It is derivable: `GET /api/tickets?assignee={id}&status=…&pageSize=1` returns `totalCount` | Derivable is not the same as free — one request per person. See §4.3 and **Q-1** |
| **G-3** | Closing an `InProgress` ticket | BR-1 forbids it. The row carries **no `allowedTransitions`** — `010` excluded it because "nothing on the list acts" | Fetch the ticket when the modal opens. §4.2 |
| **G-4** | A reason, an original-ticket number and a summary as three fields | `ChangeTicketStatusRequest` is `{ status, note?, expectedVersion }`. **One** free-text `note`, max 500 — `TicketHistory.Note` is `nvarchar(500)` | The three compose into one `note`. §4.4 |
| **G-5** | «إشعار العميل» | `ICommunicationProvider` is **specified and not built** (`021`). Nothing in the product sends a customer anything | A checkbox that promises a message nobody sends is the defect this repo names in `027`: *a fact the product does not have, which looks exactly like a working one*. **Q-2** |
| **G-6** | An amber «آخر رسالة من العميل بلا ردّ» warning | **There is no customer message in this product.** `Wasl.Domain/Communications/` holds one file and `Interaction` was never built — CLAUDE.md records `034` going looking for a home for a customer's message and finding none. Timeline entries are staff comments and history rows | **Absent.** Not disabled, not greyed — absent, with no fetcher. §5 |
| **G-7** | A menu whose height is capped in JavaScript | `useMenuSurface` computes the flip and the geometry; the menu's height is `var(--dropdown-menu-max-height)`, **a CSS constant** | Extend the hook with a measured `maxBlockSize`. §4.6 |

### 4.2 The version, and `026`'s objection

`026` was right that the row has nothing to send. The answer is not to invent one and not to
write a second concurrency implementation:

**Opening either surface fetches the ticket.** `GET /api/tickets/{id}` under the existing
`ticketKeys.detail(id)` key — the same key the detail route uses, so a user who has just
come back from a ticket pays nothing, and the cache is invalidated by the same writes.

That one fetch answers all three of the row's absences at once: `version` for
`expectedVersion`, `allowedTransitions` for whether Close is even legal, and `assignee` for
which row wears the tick. **One request, three answers, zero duplicated rules.**

The cost is honest and is stated: the menu and the modal open on a skeleton for one
round trip. `components/Loader/Skeleton` exists for exactly this.

### 4.3 The open-ticket count

Three ways to get it, and the third is the one this spec proposes:

1. **Ask the backend to add `openTicketCount` to `GET /api/support-users`.** Correct, one
   query, and it is a contract change to a **frozen** contract in another lane — which by
   the working agreement is not this lane's call to make.
2. **Drop the count.** Honest, cheap, and it removes the only thing the brief says makes the
   pick a decision.
3. **Derive it on the client**, one `countTickets({ assignee: id, status: OPEN_STATUSES })`
   per support user, fired in parallel when the menu opens, under
   `ticketKeys.count({...})` — the key space `026` built for the chip counts, cached for
   the session. The seeded product has **three** support users; the fan-out is three
   requests, and it is bounded by a list `011` froze as a bare array.

**Proposed: 3, with 1 recorded as the right long-term answer.** The definition of "open"
needs settling too — `New`, `Open`, `InProgress`, `PendingCustomer` (everything not
`Resolved` or `Closed`) is what this spec assumes. **Q-1.**

> **The number this produces is a different number from the one a backend field would
> produce**, and the difference is not visible on screen: a client count is the count *this
> user is allowed to see*, at the moment the menu opened. With no per-user list scoping in
> the product today the two agree. The day scoping arrives they diverge silently, which is
> why option 1 is recorded and not merely mentioned.

### 4.4 Composing the `note`

The reason is the first line, the duplicate reference and the summary follow, and the whole
thing is capped client-side at 500 with the counter visible past 450.

```
«مكرّرة — التذكرة الأصلية TCK-2026-000412»
«تفاصيل الرسوم مطابقة لما في التذكرة الأصلية.»
```

**The reason is written in the language of the person acting**, not as a key — `note` lands
in `TicketHistory.Note` and is rendered verbatim by the timeline, which does not translate
it. That is a property of the field, not a choice here, and it is why the four reasons are
**not** an enum in disguise: nothing downstream can read them back.

BR-1.2 makes the reason **required** by the server when closing from `New` or `Open` and
optional elsewhere. **The modal requires it on every path** — a stricter client is allowed,
a looser one is a `400` the user has to decode. AC-14.

«التذكرة الأصلية» is a **free-text ticket number**, not a picker and not a link: there is no
merge endpoint, no duplicate relation on any contract, and nothing that resolves a number to
an id. It is text in a note, and the modal says so.

### 4.5 What is reused, and the one thing that is not

| Need | Component | Note |
|---|---|---|
| The toast | `components/Toast` + `useToast()` | Fire only. No timing, no stacking, no roles authored here |
| The modal | `components/Modal` | `size="sm"` — 420, ruled in Q-3, the mock's 440 recorded and not chased. `unsavedInput` is exactly "the scrim does not close it"; `destructive` is **not** set, because the primary is not destructive and the prop moves focus to cancel |
| The reason buttons, the confirm, the cancel | `components/Button` | |
| «التذكرة الأصلية», the menu's search | `components/Input` | |
| The summary | `components/Textarea` | |
| Every glyph | `src/icons/icons.tsx` (`037`) | **No `<svg>` is authored in this feature.** The mock's paths are illustrative. If a glyph the design needs is absent from the set, that is a finding for `037`, not an inline path |
| The menu's open state, dismissal, portal geometry and flip | `components/Dropdown/useMenuSurface` | Extended with the height cap — §4.6 |

**`Dropdown` itself is not used for the assignee menu, and that is a deliberate departure
from the brief's wording.** Two reasons, both from the design system's own document:

- Abyan Dropdown §10 forbids it in words the repo already quotes: *«لا تستخدمها كقائمة
  إجراءات مع حالة اختيار — افصل بين النوعين»*. `useMenuSurface` was split out of `Dropdown`
  **for this exact second consumer**, and `027`'s status control is the precedent.
- `DropdownOption` is `{ value, label, description, icon, disabled }`. It has no trailing
  slot for the coloured count and no pinned footer outside the scroll area — the two things
  §3.1 says the menu is *for*. Adding both to the primitive to serve one screen changes a
  component eight screens depend on.

So: **the system's mechanism, not the system's value model.** `AssigneePanel` already exists
inside `TicketDetailPage.tsx` with the search, the rows, the tick and the unassign row —
it is extracted to `features/tickets/AssigneePanel.tsx`, given the count and the surface, and
**both screens then render one component**. This is the part of the work that removes code.

### 4.6 The height cap

`useMenuSurface` gains `maxBlockSize` on `MenuPosition`, measured in the same
`useLayoutEffect` that already measures the flip:

```
roomBelow = innerHeight - rect.bottom - GAP - EDGE
roomAbove = rect.top - GAP - EDGE
maxBlockSize = max(MIN_MENU_HEIGHT, flipped ? roomAbove : roomBelow)
```

`Dropdown`'s own menu keeps `--dropdown-menu-max-height` and takes the smaller of the two,
so **nothing about the eight existing Dropdown consumers changes** — the cap can only make a
menu shorter than it already was, never taller. That claim is a test, not a sentence: AC-22.

---

## 5. Out of scope, and absent rather than disabled

`027` set the rule and this feature keeps it: **draw the unbuilt actions and leave them
read-only; draw no unbuilt data at all.**

| Left out | Why |
|---|---|
| The «آخر رسالة من العميل بلا ردّ» banner | G-6. There is no customer message. **No fetcher, no prop, no disabled variant** — a test asserts the module imports nothing that could supply it, because a `disabled` prop is one edit from deletion and a function that does not exist is not |
| «تصعيد» | Stays exactly as `026` left it — drawn, disabled, reason in the accessible name. `016` is unbuilt |
| A merge action, a duplicate relation, a link on «التذكرة الأصلية» | No endpoint, no field |
| Bulk reassign, bulk close | Not asked for, and every control here is per row |
| Any change to `GET /api/support-users` or `PUT /api/tickets/{id}/status` | Frozen contracts, other lane. Q-1 is the ask, not this spec |
| The detail screen's status control and rail assignee panel | Untouched in behaviour. The panel's **code** moves out to be shared; the screen renders the same thing |

---

## 6. Acceptance criteria

**The menu**

- **AC-1** Opening the row menu on any of the three list routes shows five items: view,
  reassign, escalate (disabled), a rule, close.
- **AC-2** «إعادة الإسناد» opens the assignee menu **in place**. It does not navigate, and
  `location.pathname` is unchanged after it opens.
- **AC-3** «إغلاق التذكرة» renders in `#0D2626`. No item on this menu carries the danger
  class, and a source guard asserts `rowMenuItemDanger` has no consumer.

**The assignee menu**

- **AC-4** The menu is 308px wide, measured after the entrance animation settles (M-5).
- **AC-5** It contains, in order: a search field, the list, a separator, «إلغاء الإسناد».
- **AC-6** Typing filters by name. A term matching nobody shows the empty line, not an empty
  box.
- **AC-7** Each row shows the initial, the full name, the role, and the open count.
- **AC-8** The second line is the **role** (`role.Manager` / `role.Agent`), not a team
  (G-1).
- **AC-9** The count's colour: 8 → `#C4362F`, 7 → `#8A5A00`, 5 → `#8A5A00`, 4 → `#76818C`.
  **The boundaries are asserted individually** — the mock's fixture has no agent with 8, so
  the upper threshold is unexercised there.
- **AC-10** The current assignee's row carries the tick and `#F5F8F8`. Exactly one row does.
- **AC-11** Clicking a row sends `PUT /assignee` immediately. There is no confirm control in
  the menu — asserted by absence.
- **AC-12** «إلغاء الإسناد» sends `assigneeId: null` explicitly, and is not styled with any
  danger token.
- **AC-13** The cap: with the trigger placed so that less room remains below than the menu
  needs, the menu's rendered bottom is inside the viewport and its `max-block-size` is a
  computed pixel value, not the CSS token. With the trigger low enough that the room above
  is greater, the menu's bottom is above the trigger's top and it does not cover it. **The
  trigger is positioned deliberately, not by scrolling a short page** (M-4).
- **AC-14** Only the name list scrolls under the cap; the «إلغاء الإسناد» row stays visible.
- **AC-15** Outside click closes it; `Escape` closes it **and returns focus to the trigger**.

**The close modal**

- **AC-16** Opening it fetches the ticket. Until it resolves, the body is a skeleton and the
  confirm is disabled.
- **AC-17** When `Closed` is not in `allowedTransitions`, the confirm is disabled and the
  modal says why in words — naming the current status. **No `PUT` is sent.** The BR-1 table
  is not present in the client: a source guard asserts no transition map in this feature.
- **AC-18** Four reason buttons, one selectable, the selection visible as the mock draws it.
- **AC-19** «التذكرة الأصلية» is in the DOM only while «مكرّرة» is selected, and leaves when
  another reason is picked.
- **AC-20** Confirming with no reason selected shows the inline error and sends nothing.
- **AC-21** The composed `note` carries the reason first, then the duplicate reference, then
  the summary; it is never longer than 500 characters.
- **AC-22** `expectedVersion` is the `version` from the fetched ticket. A `409
  errors/concurrency-conflict` is reported in words that say the ticket changed and offers a
  reload — never as a raw problem body.
- **AC-23** The dialog is 420px (`size="sm"`, Q-3), `max-height: 70vh`, header and footer fixed, body the only
  scroller. The scrim is `position: fixed`, page level, above the shell.
- **AC-24** A scrim click does not close it. `Escape` does. The primary button is navy and
  carries no danger token.

**The toasts**

- **AC-25** Each of the three successes fires exactly one toast, with the tone, title and
  body of §3.3, and the ticket number is rendered LTR-isolated inside an Arabic sentence.
- **AC-26** The close toast appears **after** the modal has left the DOM, asserted in that
  order and not merely as "both happened".
- **AC-27** No toast is fired on a failure path — errors are reported where the action was
  taken. (The tone table has an `error` row; this feature does not use it, and that is the
  assertion.)
- **AC-28** Nothing in this feature sets a toast duration, a stack limit or an ARIA role.
  A source guard asserts it: the only import from `components/Toast` is `useToast`.

**Everything else**

- **AC-29** Every string is in `en` and `ar`, in the same commit as the code that renders it.
- **AC-30** No `<svg>` element is authored in any file this feature adds or edits; every
  glyph comes from `src/icons/icons.tsx`.
- **AC-31** No hard-coded colour: the three count colours and the amber and navy above are
  **token names** in the implementation, and a guard rejects a hex literal in this feature's
  CSS.
- **AC-32** No physical `left`/`right` property in the CSS this feature adds.
- **AC-33** After a successful assign or close, the list refetches and the row shows the new
  value without a manual reload.
- **AC-34** The absence guard, and it covers two unbuilt things rather than one. No module
  in this feature imports, declares or references a fetcher, prop or type that could supply
  "the customer's last message" (G-6), and the close modal renders **no** notification
  control — no checkbox, no disabled variant, no `notify` field on any type it declares
  (G-5, Q-2). Both are asserted by a source scan, because a `disabled` prop is one edit from
  deletion and a function that does not exist is not.
- **AC-35** `AssigneePanel` has exactly one definition in the repo, and both the detail
  screen and the list menu import it from there.
- **AC-36** Adding the cap changes no existing `Dropdown` behaviour: the eight consumers'
  tests pass unchanged, and a menu that fits is capped at the CSS token's value, not below
  it.

Each AC maps to a named test before this is called done, and the run output is recorded in
`tests.md` — never asserted from memory.

---

## 7. Open Questions

**Q-1 to Q-4 were put to the product owner and RULED on 2026-09-06**, before any code. Each
was answered with the option this spec proposed; the alternatives are kept because a ruling
whose rejected options are deleted cannot be re-read later.

| # | Question | **Ruling** |
|---|---|---|
| **Q-1** | The open-ticket count (G-2). Derive it on the client with one bounded count request per support user, or ask the backend lane to add `openTicketCount` to the frozen `GET /api/support-users`, or ship the menu without it? And is "open" everything except `Resolved` and `Closed`? | **Derive on the client.** One `countTickets` per support user, parallel, cached under `ticketKeys.count`. "Open" is `New`, `Open`, `InProgress`, `PendingCustomer`. The backend field stays recorded in §4.3 as the right long-term answer, together with the reason the two numbers diverge silently the day list scoping arrives |
| **Q-2** | «إشعار العميل» (G-5, M-1). `021` is unbuilt, so the checkbox cannot notify anyone. Leave it out until `021`; draw it disabled with the reason in its accessible name, the way `026`'s escalate item is; or ship it live and have it do nothing? | **Left out until `021`.** No checkbox, no field, no disabled variant. `027`'s "draw it inert" ruling covers *actions*; a checkbox is an input, and a disabled input in a form reads as "not yet" rather than "never". **AC-34** asserts the absence |
| **Q-3** | `Modal` has `sm` 420 and `md` 560. The mock is 440. Add a size, use `sm`, or use `md`? | **`sm`, 420, and the 20px is recorded** rather than absorbed. A fourth size on a primitive eight screens depend on is the change with the wider blast radius. **AC-23's number changes from 440 to 420 accordingly** — the modal is 420 wide and everything else about it is unchanged |
| **Q-4** | The brief says four seconds for all three toasts; the unassign toast is `info`, which the feedback-layer spec times at five (§3.3). Tone or duration? | **The tone wins.** 4s success, 5s info. `TOAST_MS` is not touched, so no other info toast in the product changes — which is the whole reason this was asked rather than assumed |

**Q-5 and Q-6 are not blocking.** Each has a working assumption that follows an existing
ruling rather than inventing one; they are here to be overruled, not to be waited on.

| # | Question | Working assumption |
|---|---|---|
| **Q-5** | `026`'s ruling is reversed for the list. Does the **detail** screen keep its own reassign and close controls unchanged, or does it adopt these two surfaces as well? | Detail keeps its controls; only `AssigneePanel`'s code is shared. Two screens, one component, no behaviour change on the detail |
| **Q-6** | BR-2.2 lets an Agent self-assign an unassigned ticket and nothing else; BR-2 is enforced in the handler, so the client cannot know who is allowed. Does the menu list everyone and report the refusal — `027`'s answer — or filter to what the current user may do? | List everyone, report the refusal. Filtering would tell an Agent that self-assignment is impossible rather than that *this* assignment is |

---

## 8. What this spec does not do

It does not write code, choose file names beyond the two it names, or number tasks. Those
are `/speckit-plan` and `/speckit-tasks`, after this is read in full and approved.
