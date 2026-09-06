# 038 — New ticket, redesigned

**Lane** frontend · **Route** `/tickets/new` · **Story** US-005 · **Supersedes the layout of**
`024-frontend-create-ticket-form` · **Design of record** `docs/sdd/design/screens/05-create-ticket.md`

The product owner supplied a working HTML mock-up (`wasl-new-ticket.html`) and six named
changes. This spec is the reading of that mock-up against what the backend actually
carries, before any code.

---

## 1. Why

The delivered screen is `024`. It is correct and it is single-column, and it makes one
assumption the product owner rejects: **the ticket card is disabled until a customer is
picked** — four grey fields under a «اختر عميلاً للمتابعة» legend. An agent on the phone
hears the problem before they hear who is calling, so the screen currently refuses the
first thing they want to type.

The second thing it does not do is warn. A customer with three open tickets gets a fourth
one created over the top of them, and nothing on the screen says so.

---

## 2. The mock-up was RUN, not read

Opened in Chrome at 1443 × 900 CSS px. Four findings, all of which change what gets built:

| # | Finding | Consequence |
|---|---|---|
| **M-1** | **The two-column layout never renders in the mock-up.** `#nt-grid` carries `grid-template-columns:minmax(0,1fr)` in its `style` attribute, and the `@media (min-width:1100px)` rule that sets `minmax(0,1fr) 316px` lives in a stylesheet. Inline style wins. Measured: `matchMedia('(min-width:1100px)').matches === true`, `getComputedStyle(grid).gridTemplateColumns === "1060px"` — one column. The rail's `position: sticky` from the same media block **did** apply, because the rail has no inline `position`. | The intended design was only seen after removing the inline declaration (`724px 316px`). **This is the `027` defect exactly** — `Sidebar.tsx` carried `style={{position:'relative'}}` and the stylesheet said `sticky`; the module said one thing and computed style said another and nothing errored. Recorded here so nobody "reproduces the mock-up faithfully" and reproduces the bug. |
| **M-2** | **The duplicate banner renders no number.** `{{ cust.open }}` resolves to empty — the customer rows carry no `open` field, the open tickets live in a separate map. On screen: «لدى هذا العميل ⟨ ⟩ تذاكر مفتوحة». | The count has to come from the same source as the list. In the product that is `totalCount` from the list envelope; see AC-14. |
| **M-3** | **The summary and the focus disagree.** Submitting empty produces «4 حقول ناقصة: العميل، الموضوع، الوصف، التصنيف» and moves focus to **subject** — the customer search is not in the mock-up's `[aria-invalid="true"]` set, so the first named field is skipped. | AC-19 names the customer field explicitly as focusable and first. |
| **M-4** | The attachment arrived mis-decoded (UTF-8 read through cp1252). Recovered by re-encoding, 0 unmapped characters — **but cp1252 has no code point for bytes `0x81 0x8D 0x8F 0x90 0x9D`**, and `0x81` is the second byte of `ف` (`D9 81`). Every `ف` in the mock-up is gone and cannot be recovered. | Same class as `037` AC-13. The Arabic copy in this spec is **written**, not transcribed from the mock-up. |

---

## 3. In scope

The six changes, each stated as behaviour rather than as markup.

### 3.1 No conditional disabling

Every field is live from first paint. No `fieldset disabled`, no «اختر عميلاً للمتابعة»
legend. Validation runs **on submit** and then becomes live per field (`mode: 'onSubmit'`
+ `reValidateMode: 'onChange'`), replacing `024`'s `mode: 'onBlur'`.

The `024` code being removed carries a reason worth keeping visible: the disabled
`fieldset` had a real `<legend>` because a screen reader landing on Subject announced
"Subject, edit, disabled" and nothing else. **That whole problem disappears with the
disabling** — there is no state to announce. The comment goes with the code.

### 3.2 Two columns

`minmax(0,1fr) 316px`, inside `@media (min-width:1100px)` only; one stacked column below
that. **In a stylesheet, and nothing on the element overrides it** (M-1).

Main column: customer · subject · description. Rail: channel · category · priority ·
assignment.

### 3.3 Channel is five buttons

`Email · WhatsApp · LiveChat · Sms · WebForm` — the contract enum, in order, from
`COMMUNICATION_CHANNELS`, never a literal list. One `role="radiogroup"`, each button
`aria-checked`, arrow keys move within the group, `Tab` enters and leaves it once.
Selected: `--purple-50` fill, `--brand` border. A line under the row names the chosen
channel in words, because five icons in a row are not five legible labels.

> The mock-up sets `aria-pressed`. `aria-pressed` is a toggle button; five mutually
> exclusive options are a radio group and get `aria-checked`. Deliberate departure.

**`IconWhatsapp` is used exactly as the set ships it** (R-7, ruled 2026-09-06 —
*«استخدم الموجودة في السيستم، ما تستخدم الموجودة في الديزاين الجديد»*). The mock-up's
bubble-with-two-ticks is **not** drawn, and `src/icons/icons.tsx` is not touched by this
feature. Consequences, stated rather than left to be discovered:

- `037`'s trademark question stays **flagged and unresolved**, where `037` left it. This
  feature does not close it, and nothing here should be read as having closed it.
- The rule *"the official mark belongs on the integration page"* is therefore **not
  enforced by this screen** — it is a live instruction with no guard, which is the shape
  `icons.md` Rule 2 had for three releases before `037` measured it. Recorded, not fixed:
  fixing it means changing the set, and the ruling says the set is not changed here.
- The five channel buttons draw five icons the set already exports. **No `<svg>` is
  written by this feature at all** (AC-25), which is now true without exception.

### 3.3b Priority is four buttons, none selected

R-3. Same radio-group model as the channel row, with the colour dots. **Nothing is
selected on first paint**, and «عادية» carries `(افتراضي)` — the existing
`tickets:new.priorityDefault` key, which exists because the Arabic walk found two
identical «عادية» entries sending different requests. `priority` stays omitted from the
body when untouched, so the server's default governs (`toCreateTicketRequest` is
unchanged).

### 3.4 Customer card and live search

Before: search field, results showing **name · email · company** per row (`companyName` is
already on `CustomerListItem` — no contract change). After: a card with name, email,
company and a «تغيير» button. `024`'s keyboard model (arrows, Enter, Escape) is kept.

### 3.5 Duplicate detection — the load-bearing addition

On selecting a customer, one request for that customer's **open** tickets. If any:
an amber banner naming the count, with «عرضها» expanding the list — ticket number,
subject, age — each row a link to the ticket.

Backend already carries this: `?customerId=` was added by `034`, `?status=` takes
repeats, and the envelope's `totalCount` is the number. No backend work.

**Open means everything that is not `Resolved` or `Closed`** — `New`, `Open`, `InProgress`,
`PendingCustomer` (R-4). The request is `pageSize: 5`; the **count comes from
`totalCount`**, so a customer with nine open tickets says nine and lists five, with a link
to `/tickets?customerId=…` for the rest. Counting the rows would under-report by four and
nothing would look wrong.

### 3.5b Previous tickets — the quiet line, R-4b

A second request, and a second element **under** the warning: the customer's
`Resolved`/`Closed` tickets, newest first, 3 rows, neutral rather than amber.

**WHY IT EXISTS.** `Closed` is terminal (BR-1.5, ADR-004), so a customer whose problem was
closed yesterday and who calls back today gets a NEW ticket — and R-4 scoped the banner to
the four OPEN statuses, so it says nothing about the one ticket the agent needs. **That is
the exact case the banner was built to catch**, and R-4 made it invisible.

Ruled 2026-09-06 **instead of making `Closed` reopenable**, and the reasoning is worth
keeping, because the obvious fix is the other one:

- The way back already exists and is correctly placed — `Resolved → InProgress`, BR-1.6. A
  team that wants "reopen" is usually a team **closing** when it should be **resolving**,
  which is a workflow problem, not a rule problem.
- A reopenable `Closed` makes `ClosedAtUtc` and every duration derived from it ambiguous:
  clear it and you lose that it was ever closed; keep it and a "closed" ticket is being
  worked on. `020-dashboard` is built on those numbers.
- What was missing was never a transition. It was **visibility**.

**IT MAKES NO CLAIM ABOUT WHEN A TICKET WAS CLOSED, and the first draft did.** The label
was to be «أُغلقت خلال ١٤ يوماً», and the API cannot answer that: `GET /api/tickets`
filters on `createdFrom`/`createdTo` and there is **no `closedFrom`**, while `closedAtUtc`
is on the ticket DETAIL and not on a list row (`010` contract). Approximating with a
creation window is wrong in both directions — a ticket opened six months ago and closed
yesterday is missed, one opened ten days ago and closed nine days ago is included — so the
label would be a fact the product does not have. **Weaker and true beats precise and
invented.**

**TWO REQUESTS, NOT ONE SPLIT CLIENT-SIDE.** Asking for all six statuses at once returns
five rows that could all be closed, so the OPEN count — the half that actually warns —
would come back wrong. Each count comes from its own `totalCount`, which is the reasoning
`countTickets` already records for the list's chip counts.

### 3.6 Error summary in the footer

A fixed footer bar. On an incomplete submit it shows «٣ حقول ناقصة: العميل، الوصف،
التصنيف», marks each field, and moves focus to the **first** invalid field in reading
order — the customer search included (M-3).

### 3.7 «عميل جديد» is wired, in a side sheet

R-5. The button is live and opens `CreateCustomerForm` in a `SideSheet` with `scrim` —
`035` built exactly this on `/customers`, and the form already takes `chrome={false}`,
`onCancel`, `onDirtyChange` and `onCreated(id, fullName)`. A sheet rather than a
navigation because **nothing typed into the ticket may be lost**; the scrim is what turns
on the body-scroll lock, the tab trap and `aria-modal`.

On create the sheet closes, then the customer is **read back by id** and selected —
`getCustomer(id)`, not the two values the callback hands over. The card shows email and
company, which `onCreated` does not carry, and `026` §5 / `032` AC-1 already rule that a
screen never seeds itself from a write response.

---

## 4. Not on this screen

Templates · attachments · custom fields · draft saving · escalation · tags · SLA. The
`027` rule holds: **a data region drawn from nothing looks exactly like a working one.**

---

## 5. Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | Subject, description, category, priority and channel are editable on first paint, with no customer selected. Asserted on the enabled state of each control, not on the absence of a legend |
| AC-2 | No field shows an error before the first submit — typing in and blurring subject leaves no message |
| AC-3 | After a failed submit, correcting a field clears **that** field's error without a second submit |
| AC-4 | At ≥1100px the grid computes to two tracks, the second exactly `316px`; below 1100px, one track. **Asserted against computed style, not against the presence of a media block** (M-1) |
| AC-5 | The rail order is channel, category, priority, assignment |
| AC-6 | Five channel buttons, in `COMMUNICATION_CHANNELS` order; the list is derived from the constant — a test fails if a sixth enum value is added and the row still shows five |
| AC-7 | Exactly one channel is `aria-checked="true"`; arrow keys move the selection; the group holds one tab stop |
| AC-8 | The line under the row names the selected channel, translated, in both `en` and `ar` |
| AC-9 | A search result row shows name, email and company; a row for a customer with no company renders without an empty separator |
| AC-10 | The selected card shows name, email, company and «تغيير»; «تغيير» returns to the search with the term empty |
| AC-11 | Email is bidi-isolated (`<bdi>`) in the row and the card — a Latin address inside an Arabic line (ADR-007 §8) |
| AC-12 | Selecting a customer issues **exactly one** open-ticket request. Selecting the same customer twice issues one (cached). Clearing the selection issues none |
| AC-13 | A customer with no open tickets renders **no banner** — not an empty one |
| AC-14 | The banner names the count, and the count equals the number of rows «عرضها» reveals when the count is at or below the page size (M-2) |
| AC-15 | «عرضها» toggles the list and toggles its own label; the button carries `aria-expanded` |
| AC-16 | Each listed ticket links to `/tickets/{id}` |
| AC-17 | The open-ticket request failing does **not** block creation: no banner, no error, the form stays usable. A duplicate warning is advisory |
| AC-18 | An incomplete submit shows the footer summary naming every missing field, and issues **no** `POST` |
| AC-19 | Focus lands on the first invalid field in reading order, **including the customer search** (M-3) |
| AC-20 | The summary counts correctly for 1, 2 and 4 missing fields, with the Arabic plural forms from the catalogue — never a hand-built string |
| AC-21 | Subject counter renders `0/N` and updates on input |
| AC-22 | The footer is fixed at the bottom of the content area; the form scrolls under it; the buttons are never in the scrolled flow |
| AC-23 | No `left`/`right` in the new CSS — logical properties only, guarded by the existing stylelint rule |
| AC-24 | Every new string exists in `en` and `ar`; the screen is walked in Arabic and RTL |
| AC-25 | Icons come from `src/icons/icons.tsx`; no `<svg>` is written in this feature (the mock-up's SVGs are illustrative) |
| AC-26 | Category and assignment use the `Dropdown` primitive; no `<select>` |
| AC-27 | `024`'s double-submit guard survives: two synchronous clicks send one `POST`. It is a `ref`, not `isPending` — state is not true until React re-renders and the second click is before that |
| AC-28 | The `400` / `404` / `401` failure handling of `024` survives unchanged, including "customer gone clears the selection and nothing else" |
| AC-29 | Nothing is preselected in the priority group on first paint; «عادية» is labelled as the default (R-3) |
| AC-30 | Submitting without touching priority sends a body with **no `priority` key** — asserted on the serialised payload, not on form state (`024` TEST-024-02 keeps its shape) |
| AC-31 | The assignment control is present, disabled, and states why. **No fetcher exists for it** — a test asserts the module imports no support-user query, because a `disabled` prop is one edit away from deletion and a function that does not exist is not (`027`'s rule) |
| AC-32 | The subject counter reads `0/200` and the field accepts 200 characters (R-2) |
| AC-33 | The open-ticket request asks for `New, Open, InProgress, PendingCustomer` and `pageSize: 5` |
| AC-34 | The banner's count comes from `totalCount`: a customer with 9 open tickets says 9 and lists 5, with a link to the rest (R-4) |
| AC-35 | «عميل جديد» opens the sheet; closing it with input asks before discarding; creating one closes the sheet, selects the new customer, and **leaves every ticket field exactly as it was** (R-5) |
| AC-36 | The selected customer after a sheet create is read back with `getCustomer(id)` — the card's email and company come from the server, never from the create response |
| AC-37 | Every channel button renders an icon **imported from `src/icons/icons.tsx`**, `IconWhatsapp` included. `src/icons/` is unchanged by this feature — asserted by a diff over that directory, not by reading the imports (R-7) |
| AC-40 | Selecting a customer issues **two** list requests — the four open statuses at `pageSize 5`, and `Resolved`/`Closed` at `pageSize 3` — each cached by its own key |
| AC-41 | A customer with no open tickets and one closed shows **the quiet line and no banner**. The two are independent |
| AC-42 | The quiet line is not `role="status"` — the banner owns that. Context must not be announced with a warning's urgency |
| AC-43 | Each previous row shows its **status badge**: `Resolved` invites a reopen (BR-1.6), `Closed` does not (BR-1.5) |
| AC-44 | The copy makes **no claim about when** a ticket was closed — the API cannot answer it (R-4b) |
| AC-39 | `POST /api/tickets` carries an `Idempotency-Key` (`036`). Minted at mount, **and re-minted on the first edit after a failed submit** — see the note below, which is a correction, not a preference. Asserted on the sent header: identical resubmit reuses the key, an edited resubmit does not |

---

## 6. Tokens

Every colour in the mock-up already exists as a token, except three. Nothing is
hard-coded.

| Mock-up | Token |
|---|---|
| `#F9FAFB` page | `--surface-content` |
| `#FFFFFF` card | `--surface-card` |
| `#DEE5E7` border | `--neutral-200` |
| `#EDF1F2` rule | `--neutral-75` |
| `#F3F3FB` selected fill | `--purple-50` |
| `#1D174D` | `--brand` (navy-900) |
| `#0D2626` | `--ink` |
| `#76818C` · `#9FABB5` · `#4A5567` · `#606873` | `--neutral-500` · `--neutral-400` · `--neutral-800` · `--neutral-700` |
| `#FFFAE8` banner fill | `--state-warning-bg` |
| `#8A5A00` banner text | `--state-warning-text` |
| `#1570EF` · `#FFAF36` · `#E54545` priority dots | `--blue-500` · `--amber-500` · `--red-600` |
| **`#C4362F`** error text | **near-match to `--red-600` (#E54545)** → use `--state-danger-text`. A near-match is a second palette (`nearMatch.test.ts`) |
| **`#F2E2B4`** banner border | no token. Proposed: `--state-warning-border`, declared beside the other two warning semantics — `tokens.css` already notes that amber arrived semantically incomplete |
| **`#FCFDFD`** field fill | near-match to `--surface-row-hover` (#FAFCFC). **Dropped** — the primitives' own field background is used, which is R-6's consequence |

Heights land exactly: `--field-height-md` **is** 47px and `--button-height-md` **is** 40px,
so the mock-up's two heights need no new value. Radii do not, and R-6 rules on it: fields
keep `--field-radius` (4px), cards take 10px by value.

---

## 7. Rulings — product owner, 2026-09-06

Every one of §7's questions was put before any code. None was guessed.

| # | Question | Ruling |
|---|---|---|
| **R-1** | Assignment at creation, with no `assigneeId` on `POST /api/tickets` | **Drawn, disabled, with the reason written.** `027`'s refinement: an unbuilt **action** may be drawn read-only, because a menu row promises nothing until it is pressed. It gets **no fetcher at all** (AC-31). Not the two-step `PUT /assignee`, which is not atomic |
| **R-2** | Subject counter 120 against a 200 contract | **`0/200`.** The contract governs; a client that narrows one is a client editing it. No contract change |
| **R-3** | Priority preselected as «عادية» | **Nothing selected**, «عادية» marked `(افتراضي)`. `priority` stays omitted from the body, so the server's default keeps governing. The mock-up's preselection is not adopted |
| **R-4** | What counts as open, and how many rows | **Everything that is not `Resolved`/`Closed`** — four statuses. First **5** listed, count from `totalCount` |
| **R-4b** | *Amendment, 2026-09-06.* A customer whose ticket was closed yesterday and who calls back gets a NEW ticket, and R-4 made the old one invisible here — the exact case the banner exists for | **A second, quieter line**: the customer's previous (`Resolved`/`Closed`) tickets, newest first, 3 rows, neutral not amber. **Ruled INSTEAD of making `Closed` reopenable** — see the note below |
| **R-5** | «عميل جديد» | **Wired, in a `SideSheet`** (`035`'s pattern). Not a navigation: the ticket form's input must survive |
| **R-6** | Field radius 8px against `--field-radius: 4px` | **4px stands.** The primitives are used as they are; a screen-local override is a second field shape, which is what the near-match rule exists to prevent. Cards take 10px by value, with `TicketDetail.module.css` as precedent |
| **R-7** | The WhatsApp mark | **The set is used as it ships. Reversed 2026-09-06**, after the first ruling said to change it: *«ايكون الواتس اب استخدم الموجوده في السيستم، متستخدمش الموجوده في الديزاين الجديد»*. `src/icons/icons.tsx` is untouched, no screen is repainted, and `037`'s trademark question stays open. The mock-up's glyph is not drawn |

**What did not survive the rulings:** the mock-up's preselected priority (R-3), its 8px
fields (R-6), its 120-character subject (R-2), its live assignment select (R-1), and its
WhatsApp glyph (R-7). Each is a deliberate departure, recorded here rather than silently
reproduced or silently dropped.

**Five of the mock-up's own decisions are overridden, and that is the point of the gate.**
The mock-up is a design brief, not a design of record — `027` established that a preview
is not one either. Every override above is a ruling with a date, not a developer's
preference.

## 8. What this costs

### On this screen

| Touched | |
|---|---|
| `CreateTicketPage.tsx` | rewritten — both fetches stay at the route (ADR-011 §4), and the open-ticket query joins them there rather than inside the banner |
| `CustomerPicker.tsx` | rewritten: result rows and the selected card gain company; keyboard model kept |
| `CreateTicket.module.css` | rewritten |
| new: `ChannelPicker.tsx` · `PriorityPicker.tsx` · `DuplicateWarning.tsx` | feature-local, `src/features/tickets/` |
| new: `openTickets` query | `listTickets({ customerId, status, pageSize: 5 })` — the existing fetcher, no new API function, and `ticketKeys.list` already keys on the params object |
| `createTicket.schema.ts` | **`mode` only.** The schema, `emptyCreateTicketForm` and `toCreateTicketRequest` are untouched: R-2 keeps 200, R-3 keeps `priority` omitted |
| `locales/{en,ar}/tickets.json` | new keys, both files, same commit — including the Arabic plural forms for the missing-field summary (AC-20) and the open-ticket count |
| `CreateTicketPage.test.tsx` | 273 lines, rewritten against the new behaviour |
| `docs/sdd/design/screens/05-create-ticket.md` | becomes v2; the v1 layout table is **kept**, `027`'s precedent. Its *Not on this screen* line about assignment is amended, not deleted — R-1 draws the control and still does not build it |

### Reaching outside this screen — one ruling does, and one no longer does

| Touched | Why, and what has to be re-checked |
|---|---|
| `CreateCustomerPage.tsx` | R-5. **Read, not changed** — `chrome={false}`, `onCancel`, `onDirtyChange`, `onCreated` all already exist for `035`'s sheet. If it turns out a prop is missing, that is a finding for `ai-notes.md`, not a quiet widening |
| ~~`src/icons/icons.tsx`~~ | **Not touched.** R-7 was reversed: the set ships as it is. No screen outside `/tickets/new` changes appearance, `037`'s guards run unchanged on unchanged geometry, and `037`'s open trademark question is left open. Kept in this table rather than deleted, because "the icon set changed" is the kind of claim a later reader would otherwise go looking for and not find |

**No backend work and no contract change.** Every ruling landed on the side of the frozen
contract: R-2 keeps subject at 200, R-3 keeps `priority` omitted, R-1 builds no
`assigneeId`. If implementation finds otherwise, it goes under *Contract changes* in
`plan.md` and both lanes are told — it is not fixed silently in one of them.

### The rows from CLAUDE.md's write-path table that apply

This screen writes, so the table is answered rather than read past:

| Row | Answer |
|---|---|
| Does a duplicate request create a duplicate row? | `POST /api/tickets` accepts an `Idempotency-Key` since `036`. **`024` does not send one.** The `ref` guard (AC-27) stops the double click; it does not stop a retried request whose response was lost. Sending a key is a small change and it is **in scope** — recorded here because a client guard is not the guarantee |

**The key's lifetime was got wrong once in this spec and is corrected here, because the
wrong version is the obvious one.** "Mint one key per form" is what you write first, and
`036` Q-5 rules that **same key with a different body is `409`, scoped per user, retained
24 hours**. So a `400` on the first submit, an edit, and a second submit would answer
`409` on a form that is now correct — and the user could never get past it. Re-minting on
the first edit after a failure is what makes both cases right at once: an edited
resubmit is a new intent and gets a new key, while a retry the user did not edit — the
lost-response case the header exists for — keeps the old one and replays.
| Does the DTO carry a field the client must not set? | No. `toCreateTicketRequest` builds the body field by field; `Id`, `TicketNumber`, `Status`, `CreatedByUserId`, `RowVersion` are never named |
| Is `pageSize` clamped? | The open-ticket query sends 5. BR-7.2 clamps server-side regardless |
| Can the same request be retried safely? | With the key above, yes. Without it, no — which is why it is in scope |
| Does this endpoint need a throttle of its own? | No. `036` §3.4's general write limit — 60 per caller per minute — already covers it, and no reason exists for a tighter one here |
