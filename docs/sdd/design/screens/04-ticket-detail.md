# Screen — Ticket detail

**Route** `/tickets/:id` · **Stories** US-005, US-007, US-008, US-010 · **Agent, Manager**

The densest screen in the product. Almost every business rule surfaces here.

> **Revised 2026-09-01 from the product owner's v3 canvas** (`Wasl Ticket Details v3.dc.html`
> plus eleven review frames) **and from the built screen, measured in a browser against the
> running API.** This is the design of record.
>
> The two earlier revisions are kept below, because each replacement is a decision and a
> deleted decision is one somebody makes again:
>
> - the **first** version of this file was written before anything was rendered
> - the **second**, 2026-08-31, was revised from `027`'s approved preview
>   (`src/wasl-web/src/dev/TicketDetailPreview.tsx`)
>
> **That preview no longer exists.** It rendered the v2 screen from the same stylesheet the
> real page uses, so every shared class silently restyled a design nobody was maintaining —
> and the next reader to open it would have "fixed" the built screen to match a superseded
> canvas. Deleted 2026-09-01, recoverable at `git show 33ba1e8^:src/wasl-web/src/dev/TicketDetailPreview.tsx`.
> ADR-009's preview-before-wiring gate was spent: the screen is built, and it has been
> reviewed in a browser by the owner, which is the thing a preview stands in for.

## What the v3 revision changed

| # | Was (v2) | Is (v3) | Why |
|---|---|---|---|
| 1 | `[Take action ⌄]` holding the transitions | **The status pill IS the control** — a menu headed «نقل الحالة إلى», the current status ticked and inert, only `allowedTransitions` actionable | The canvas. A reader changes status from the thing that shows the status |
| 2 | One merged **Timeline** section | **Two tabs, each labelled with its own total** — `?type=Comments\|History` | `034` added the filter and both counts on either response. Two lists with two counts genuinely are two lists |
| 3 | Newest at the **bottom**, `load earlier` **above** | **Newest first**, «تحميل الأقدم» at the **foot** | The canvas labels the strip «الأحدث أولاً», which reverses `027` Q-2. The canvas is the later ruling |
| 4 | Accordion sections + a 240px rail doubling as anchors | **A 292px rail of facts** — assignee · customer and their other tickets · channel, category, created, updated, closed | The canvas. Nothing on this screen collapses any more, so anchors have nothing to anchor |
| 5 | Composer at the foot of the timeline | **Composer above the feed**, inside the same card | The canvas. Replying is the reason the screen is open |
| 6 | A **sticky bottom bar** repeating Back and Take action | **Removed** | It existed to repeat a menu. With four entries visible at a time (row 9) the feed no longer forces a scroll to act |
| 7 | Summary strip of eight key-value pairs under the title | **Removed** — the rail carries the facts, the header carries status and priority | The strip and the rail duplicated `Priority`, which `027` open question A had already flagged |
| 8 | Escalate absent entirely | **Escalate, merge and extend-due are DRAWN and INERT**, each stating why | Owner's ruling: *"شوف ايه الاكشنز الموجود ليها باك اند والي مش موجود حطها بس خليها read only"*. An absent control says the product cannot do this; a disabled one with a reason says not yet |
| 9 | The whole feed rendered | **Four entries, then «تحميل الأقدم»** reveals four more and fetches only when the fetched rows run out | The canvas. `013`'s page stays fifty — this is a screen rule, not a page size |
| 10 | Tags one style; avatars one fill | **Five tints, derived from the name.** No two tags on one ticket share one; a person keeps theirs everywhere | Owner's ruling, twice. `TagSummary` is `(id, name)` and `SupportUserOption` is `(id, fullName, role)` — see *Derived colour* |
| 11 | Customer as text (`026` Q-3) | **A link to `/customers/:id`**, with the company name under it | `032` built the profile, and `customer.companyName` is on the wire |

## What the 2026-08-31 revision changed (kept)

| # | Was | Is | Why |
|---|---|---|---|
| 1 | Timeline in a **drawer**, "newest page first" | **Inline section** | `027` Q-2. A drawer and an inline feed are not the same screen. *(v3 keeps it inline and flips the order — row 3 above.)* |
| 2 | Two body sections, **Comments** and **Activity** | One merged Timeline | `013` returned one union with a `type` discriminator. *(Reversed by v3 row 2: `034` added `?type=`, so the split is now the server's.)* |
| 3 | **Escalate** in the menu; escalation callout in the rail | Escalate removed; marker read-only | Escalation is `016`. *(v3 row 8 draws it inert instead of hiding it.)* |
| 4 | Status change with no note field | **`note`, required when closing from `New` or `Open`** | BR-1.2 and `012`'s frozen contract. **Still true in v3** |
| 5 | Layout unmeasured | Two columns down to 700px | **Still true in v3**, at 980px |

## Layout

```text
‹ التذاكر │ TCK-2026-000042  [● قيد التنفيذ ⌄] [↑ حرجة]        [اتخاذ إجراء ⌄]
┌──────────┬───────────────────────────────────────────────────────────────┐
│ rail 292 │ ┌ subject card ─ 3px priority edge on the inline-start ─────┐ │
│          │ │ subject (dir="auto")                                      │ │
│ assignee │ │ description (dir="auto", pre-wrap)                        │ │
│  + pencil│ │ [tag ×] [tag ×] [+ إضافة وسم]                             │ │
│ ─────────│ └───────────────────────────────────────────────────────────┘ │
│ customer │ ┌ feed card ────────────────────────────────────────────────┐ │
│  company │ │ composer: textarea · [قالب] · (internal) · [إرسال]        │ │
│  others  │ ├───────────────────────────────────────────────────────────┤ │
│ ─────────│ │ [التعليقات 12] [السجل 88]              الأحدث أولاً        │ │
│ channel  │ │ newest ↑                                                  │ │
│ category │ │ … four entries …                                          │ │
│ created  │ │ oldest ↓                                                  │ │
│ updated  │ │                  [↓ تحميل الأقدم]                         │ │
│ (closed) │ └───────────────────────────────────────────────────────────┘ │
└──────────┴───────────────────────────────────────────────────────────────┘
```

Sheet is `max-inline-size: 1240px`, centred, `gap: 18px`. Grid is `292px minmax(0, 1fr)`
with `gap: 20px`; one column below **980px**, where the rail stops being sticky.

**The rail is on the inline-end in Arabic** and the inline-start in English — one
`grid-template-columns` and no direction in the code. `inset-inline-*` throughout, never
`left`/`right`.

## Elements

| Region | Element | Component | Tokens / geometry | Icon | i18n key |
|---|---|---|---|---|---|
| Header | Back | link | 13px, `--text-secondary`; chevron rotates **and** mirrors via `--ld-dir` | `chevronDown` | `tickets:detail.backToList` |
| Header | Ticket number | `<bdi dir="ltr">` | mono 13px, `tabular-nums`, Latin digits | — | — |
| Header | **Status control** | button + menu | pill h28, radius pill, dot 7px, 12.5/700; menu 208px, items h34/13px | `chevronDown`, `check` | `tickets:status.*`, `tickets:detail.statusMenuHead` |
| Header | Priority | span, **read-only** | pill h28; `Critical`/`High` take the danger tone, the other two neutral | `arrowUp` | `tickets:priority.*` |
| Header | Escalated | span, **read-only** | danger tone pill; only when `isEscalated` | `escalate` | `tickets:detail.escalated` |
| Header | Take action | button + menu | navy h38; menu 236px, items h36/13px, one separator | `chevronDown` | `tickets:detail.takeAction` |
| Rail | Group label | — | 11px/600, `--text-muted` | — | per group |
| Rail | Assignee | avatar 30 + name + pencil | pencil h28 icon-button; opens the panel **from the group**, not from the pencil | `edit` | `tickets:detail.assignee` |
| Rail | Unassigned | dashed avatar + button | «تعيين» h32, `--surface-chip` | `assign` | `tickets:detail.unassigned` |
| Rail | Customer | link + text | link 13.5/500 `--text-link`; company 12px `--text-muted` | — | `tickets:list.column.customer` |
| Rail | Other tickets | links | status dot 6px + subject 12.5px + `·NNN` mono 11px; at most **three**, then a muted count | — | `tickets:detail.otherTickets` |
| Rail | Fact row | — | label 12.5px `--text-muted`; value 12.5px, dates 12px `tabular-nums` | channel glyph | per field |
| Body | Subject card | section | pad 20/22, radius 14, **3px priority edge** on `border-inline-start` | — | — |
| Body | Subject | `h1` | 21px/700/1.55, max 46ch, `dir="auto"` | — | — |
| Body | Description | `p` | 14px/1.9, max 68ch, `pre-wrap`, `dir="auto"` | — | — |
| Body | Tag chip | span | h25, radius pill, 12px; **five derived tints**; `×` removes | `close` | — |
| Body | Add tag | button + menu | dashed chip h25; menu lists only unattached tags | `add` | `tickets:detail.addTag` |
| Composer | Shell | — | pad 12, radius 10, `--border-focus`; danger border after a failed send | — | — |
| Composer | Textarea | Textarea | 13.5/1.85, min 62px, max 72ch; placeholder changes with the mode | — | `tickets:detail.commentPlaceholder` / `.internalPlaceholder` |
| Composer | Template | button + menu | h32/12.5px; menu 316px, header «ردود جاهزة · <category>», rows title + clipped body | `comment` | `tickets:detail.useTemplate` |
| Composer | Internal | `role="switch"` | track 34×20, knob 16, amber when on; the note under it changes with the mode | — | `tickets:detail.markInternal` |
| Composer | Send | Button, Primary | **amber when internal**, navy otherwise; disabled while the body is empty | — | `tickets:detail.send` |
| Composer | Locked | — | replaces the composer when `Closed`; one sentence, no disabled box | `eyeOff` | `tickets:detail.closedNoComment` |
| Tabs | Tab | `role="tab"` | h40, 13.5px, active takes a 2px `--text-link` underline + 700 | — | `tickets:detail.tabComments` / `.tabHistory` |
| Tabs | Count | span | min 20 × h19 pill, 11px/600, `tabular-nums`; **absent until the first page lands** | — | — |
| Tabs | Order note | span | 11.5px `--text-placeholder`, at the row's end | — | `tickets:detail.newestFirst` |
| Feed | Comment | article | avatar 34 + name 13.5/700 + role pill + time + body 13.5/1.9 `dir="auto"` | — | — |
| Feed | Customer badge | span | success tone; driven by `authorKind`, **never** inferred from `actor.role` | — | `tickets:list.column.customer` |
| Feed | Internal badge | span | warning tone + lock-ish glyph. BR-5.4 — **marked, never hidden** | `eyeOff` | `tickets:detail.internal` |
| Feed | Recorded by | span | 11.5px; only when `recordedBy` is non-null | — | `tickets:detail.recordedBy` |
| Feed | History row | div | glyph circle 26 + sentence 13px + time; **both status names toned inside the sentence** | per `type` | `tickets:detail.event.*` |
| Feed | History note | span | `border-inline-start` 2px, 12.5px `--text-muted` | — | — |
| Feed | Load older | button, pill | h34 centred **at the foot**. **Not** a page number | `chevronDown` | `tickets:detail.loadOlder` |
| Feed | Empty / error pane | div | 64/24/60 pad, brand mark on the pattern, trace id in mono on the error | — | `tickets:detail.empty*` / `.error*` |

## The status menu

**Rendered from `allowedTransitions` on the response. The client holds no copy of the
state machine** (ADR-004). BR-1 lives in `Wasl.Domain` once; a second copy in React is
correct until the map changes and then wrong in exactly one place nobody looks at.

- **The current status is in the menu, ticked, and is NOT an item.** It is absent from
  `allowedTransitions` because a same-status transition is a `409`, not a no-op — so it is
  rendered from `ticket.status` as a `<span>`. A reader who could pick it would get a
  conflict for choosing where they already are.
- **An empty array renders the pill as text**, not as a disabled button: the `Closed` case,
  and the one `027` AC-2 insists on asserting with `[]` rather than only with a populated
  array. A disabled control invites a hunt for what would enable it, and nothing will.
- `New → Closed` and `Open → Closed` open the **note** field first (BR-1.2). Every other
  transition sends immediately.

## The take-action menu

Four rows, one live. **Every inert row states its reason in `title`** — a control that
refuses without saying why is the defect this screen was rebuilt to avoid.

| Row | Backend | State |
|---|---|---|
| تصعيد | `016`, unbuilt. `isEscalated` is read-only here | **inert** — `detail.actionUnavailable` |
| دمج مع تذكرة أخرى | no endpoint of any kind | **inert** — same |
| تمديد الاستحقاق | no endpoint, and no due date to extend | **inert** — same |
| إغلاق التذكرة | `PUT /status` | **live** when `allowedTransitions` contains `Closed`; otherwise inert with `detail.closeNotAllowed` |

**Inert is structural, not an attribute.** There is no client fetcher for any of the three:
`tickets.api.ts` exports nothing matching `escalateTicket`, `mergeTicket`, `extendDue`,
`/escalate` or `/merge`, and a test asserts that. A `disabled` prop is one edit away from
deletion; a function that does not exist is not.

Assignment is **not** in this menu — it is the rail's pencil, beside the fact it changes.

## Actions

Every state-changing write carries `expectedVersion`, taken from the `version` that came
with the ticket. Tags do not: attaching is not a transition, and two people attaching
different tags do not conflict — that is the server's shape, not an omission.

| # | Trigger | Guard | Request | Success | Failure |
|---|---|---|---|---|---|
| 1 | Status change | note when BR-1.2 demands one | `PUT /tickets/:id/status` | invalidate ticket + both feeds | the four answers below |
| 2 | Assign / Unassign | BR-2, mirrored for affordance only | `PUT /tickets/:id/assignee` | rail updates, a history row appears | `403` · `409` |
| 3 | Add comment | body non-empty | `POST /tickets/:id/comments` with `isInternal` | draft clears, **the tab switches to Comments** so the write is visible | inline error above the shell, draft kept |
| 4 | Attach / detach tag | — | `PUT`/`DELETE /tickets/:id/tags/:tagId` | invalidate ticket | `403` for an Agent who is neither assignee nor Manager (`034` Q-4) |
| 5 | Load older | `hasMore`, or unrevealed fetched rows | `GET …/timeline?before=<nextCursor>&type=` | **append** at the foot | error inside the feed only |
| 6 | Tab switch | — | a **second request**, `?type=` | the other list, with its own cursor | — |

### `expectedVersion` has four answers and the screen acts on each

Collapsing them into "it failed" throws away the only ones the reader can do anything
about.

| Response | Meaning | What the screen does |
|---|---|---|
| `200` | Applied | The read brings the new `version`. **Nothing renders a ticket from a write response and no `setQueryData` seeds a ticket key** (`026` §5) |
| `400` | Missing, empty, or non-base64 | **A bug in this client, not a user error.** Never worded as "try again", never offers a retry |
| `403` | BR-6 handler denial | «الاطلاع فقط» banner. The control **stays**: hiding it would say the action is impossible rather than that this one is |
| `409 errors/concurrency-conflict` | Someone else changed it first | Banner with `Reload`, and a refetch. **Never retried automatically** — the second write would apply to a state the reader never saw |

## Derived colour

Tags and people carry colour that **the backend does not have**: `TagSummary` is
`(id, name)`, `SupportUserOption` is `(id, fullName, role)`. The owner ruled that they must
differ anyway, so the tint is derived from the name — which is the whole difference between
decoration and invented data. Nothing is *claimed* by it: it says "this is a different
one", never "this one is urgent". A tint that meant something would need a field.

**Five hues**, because that is how many this palette has that are not red — red is danger
and is not available for decoration. Two corrections got there:

| Attempt | Result on the owner's five-tag frame |
|---|---|
| 3 buckets, sum-of-code-units | four amber chips and one grey — a collision is arithmetic at 3/5 |
| 6 buckets | two washes nobody could tell apart: teal at 12% and blue at 10% are the same pale ground at 25px |
| **5 hues, mixed to survive a chip** | five distinguishable chips |

**The hash is FNV-1a, and that was measured too.** Summing code units clusters on this
alphabet — Arabic names are built from a small set of letters, and two of the three seeded
agents landed in one bucket at four colours *and* at five («نورة السالم» / «منى العتيبي»).
Over ten real names: sum used 3 of 5 buckets with a group of four; FNV-1a gives 3,2,2,2,1.
`Math.imul` keeps the multiply in 32 bits so the same name tints identically in every
engine.

**Two rules pull in opposite directions and both are deliberate:**

- a **tag** must differ from the tag beside it → the hash chooses and a collision walks to
  the next free bucket, **within the ticket**
- a **person** must be one colour everywhere — the rail, every comment they wrote, the
  picker → **no walk**, because de-colliding per region would give one person two colours
  on one screen, which is worse than two people sharing one

Ten people over five colours must collide. That is pigeonhole, it is stated rather than
hidden, and the fix if it ever matters is a palette decision.

## Measured rules

### 1 · ~~The prepend needs `overflow-anchor: none`~~ — no longer reachable, kept as evidence

v3 appends at the foot, so nothing prepends and no scroll correction runs. The measurement
stays because the next feed that grows upward will meet it:

> Chrome implements CSS scroll anchoring and enables it by default. On a 50-entry prepend it
> had *already* moved `scrollTop` by +3929px and left the same row at the same offset before
> the effect ran; the manual correction then applied the same +3929 again and the feed
> clamped, 9852 → 7398. **The code written to stop a jump was causing one, and only in the
> engine that needed it least.** Safari has never shipped scroll anchoring, so one mechanism
> that runs everywhere beats two that overlap in one engine and neither of which runs in
> another.

### 2 · The timeline is a cursor, and each page arrives **ascending**

`?before=<cursor>&limit=` while the list is an envelope, and **the difference is
deliberate**. A list grows at the end the reader is not looking at, so page 2 stays page 2;
a timeline grows at the end they *are* looking at, so a page number silently skips or
repeats entries. `013` measured exactly that — one comment on two consecutive pages — and
the assertion that caught it was *no entry appears twice*, not a count.

**The v2 note here said "the wire is newest-first" and that is FALSE — measured
2026-09-01:**

```text
GET …/timeline?limit=4&type=History
08:51:33 · 08:52:27 · 08:52:38 · 08:53:10        ascending
```

The SQL orders `OccurredAtUtc DESC` and the handler hands the page back oldest-first —
`013` Q-2's chat order. v3 labels the strip «الأحدث أولاً», so the client flips it **per
page, never over the flattened list**:

```text
page 0 asc [a b c]  page 1 asc [x y z]   (z older than a)
flat then reverse → [z y x c b a]   the second page sorts ahead of the first
reverse each page → [c b a][z y x]   strictly descending
```

Only a **two-page** test can fail on that; a single-page test passes either way. The cursor
is untouched by the display flip — `getNextPageParam` reads `nextCursor` from the page, never
from an entry — which is exactly why a display-order bug here cannot be caught by the paging
assertions.

The cursor is **opaque**: never parsed, compared, or ordered by the client.

### 3 · The assignee picker

`GET /api/support-users` returns a **bare JSON array**. Items carry `id`, `fullName`,
`role` — and **no department**, so the canvas's «وكيل · الفوترة» renders as the role alone.

**Sort it with `Intl.Collator`.** The server orders `FullName` under the database collation,
which does not follow `Accept-Language`, so a mixed list looks ordered in English and
arbitrary in Arabic. Nothing errors.

**Render the current assignee from the TICKET, never by looking the id up in this list.** A
user deactivated after assignment keeps their tickets and leaves the picker.

BR-2 is **mirrored for affordance only** — the server decides, and a refusal is the `403`
banner. The endpoint carries no role policy, because `ManagerOnly` there would refuse every
legitimate Agent.

**The panel hangs off the rail GROUP, not off the pencil.** A 316px panel anchored to a 28px
icon button lands wherever that arithmetic puts it; `inset-inline-start: 0` on a box that
starts where the rail starts is right in both directions.

### 4 · Two bidi traps, and only one of them is ours

The ticket number is pinned: `<bdi dir="ltr">`, Latin digits, `tabular-nums`. Without it the
leading neutrals lay out on the visual right and the reader copies a string that does not
exist.

**An identifier typed inside an Arabic description is not ours to fix and still reads
wrong.** `4471-0092` in the body renders `0092-4471`, and `dir="auto"` does not save it
because `auto` resolves the *paragraph*, not a run inside it. Recorded rather than worked
around: the client does not rewrite user content.

### 5 · `position: sticky` establishes a stacking context, and the rail is sticky

So the assignee panel's `z-index` ranked it **inside the rail**, and the rail was a
positioned box at `z-index: auto`: the composer's own `position: relative` wrappers come
later in the document and painted straight through an opaque panel. `z-index: 1` on the rail
is enough to beat every `auto` sibling and stays far below the shell's `--z-flyout`.

### 6 · The feed card must NOT clip

The tickets list clips its table card, because its row flyout is `position: fixed` and needs
nothing to escape. Here the composer's popovers are `position: absolute` inside the card, so
`overflow: hidden` would cut a menu off at the card's edge — a list that shows four of its
six rows, with no error. The corner-painting defect that made the list clip is answered
instead by giving the one opaque child (`Closed`'s locked composer) its own top radius.

## States

| State | Condition | Renders |
|---|---|---|
| Loading | first load | `Skeleton` shapes in the rail, the subject card and the feed. **No local keyframes** — `029` owns the one waiting animation and a guard scans for a second |
| Not found | `404` | full-page pane, brand mark on the pattern, back to the list |
| Ticket error | any other failure of the ticket read | same pane with a retry |
| Feed error | the timeline failed and the ticket did not | **only that region degrades** — pane inside the card, with the **trace id** in mono and a retry |
| Empty feed | no entries on the active tab | pane inside the card, composer still shown |
| Forbidden | `403` from any write | **a banner above the layout**, not inline beside the control. *Deviation from v2, which specified inline: with the controls now spread across the header, the rail and the composer, one place to look beats three* |
| Client fault | `400` on `expectedVersion` | banner stating nothing changed and retrying will not help. No retry control |
| Conflict | `409` | banner with `Reload`, and a refetch |
| Closed | `allowedTransitions` is `[]` | status pill as text; take-action's Close inert; **composer replaced** by one locked sentence, not disabled |
| Unassigned | `assignee` is `null` | dashed avatar + «تعيين». **The key is present** — an absent key is `undefined`, which renders empty and passes every shape assertion |
| Send failed | `POST /comments` rejected | inline error above the shell, danger border on it, **draft kept** |

## RTL

Rail moves to the inline-end; one `grid-template-columns` does both. The back chevron
mirrors via `--ld-dir`; the **history transition arrow does not** — it diagrams "from → to"
rather than a reading direction, and the canvas draws it pointing right in an Arabic screen.
The switch knob travels toward the end edge, also via `--ld-dir`.

Subject, description, tag names and every comment body keep `dir="auto"`, and the block stays
aligned with the page, so a Latin comment in an Arabic thread starts on the same edge as its
neighbours. The ticket number stays Latin. Dates go through `lib/formatters.ts`: Latin digits
and Gregorian in both locales, because `ar` defaults to Arabic-Indic digits and `ar-SA`
defaults to Hijri, and neither default announces itself.

**Measured in English 2026-09-01:** nothing escapes the viewport, the body has no horizontal
scroll, the header stays one row, the priority edge moves to the left border, and both
popovers open inward.

## Open against this screen

| # | Question | Working assumption |
|---|---|---|
| ~~A~~ | ~~Is the rail earning 240px?~~ | **Closed by v3.** It carries the assignee, the customer, their other tickets and five facts |
| ~~B~~ | ~~A Manager variant of the picker should exist before it is wired~~ | **Closed.** The picker is offered to everyone and the server decides; a refusal is the `403` banner |
| C | Two people can share an avatar tint once the team passes five | A palette decision, not code. Stated in *Derived colour* rather than hidden |
| D | «تذاكره الأخرى» shows at most three and then a count with no link | `?customerId=` is a list filter, not a facet — a chip for it would put an id in the filter bar. A scoped list route is the answer if it is ever wanted |

## Not on this screen

**Drawn and inert** (owner's ruling, with a stated reason each): escalate · merge · extend
the due date.

**Absent entirely, because nothing behind them exists:** the SLA pill, the rail's SLA block
and the «خُرق زمن الحل» banner — there is no due date, no first-response time and no SLA
field, table or setting anywhere in the domain; `@ mentions` — no field on a comment, no
notification, nothing to resolve a name against; a priority-change history row — there is no
`PriorityChanged` in `TicketHistoryEventType`, so it cannot arrive.

**Out of scope by decision:** editing or deleting a comment · attachments · reopening a
closed ticket · time tracking · the audit log view (`019`).
