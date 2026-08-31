# Screen — Ticket detail

**Route** `/tickets/:id` · **Stories** US-005, US-007, US-008, US-010 · **Agent, Manager**

The densest screen in the product. Almost every business rule surfaces here.

> **Revised 2026-08-31 from the approved `027` preview** (`src/wasl-web/src/dev/TicketDetailPreview.tsx`,
> route `/_preview/ticket-detail`). The first version of this file was written before any
> of it was rendered. What follows keeps its layout and replaces the parts the preview
> contradicted — each replacement is named in **What this revision changed**, not edited
> away. `027/spec.md` Q-5 records that this document did not exist; it did, and that is
> the one thing in `027` that is simply wrong.

## What this revision changed

| # | Was | Is | Why |
|---|---|---|---|
| 1 | Timeline in a **drawer**, opened from a header button, "newest page first" | **Inline section**, newest at the **bottom**, `load earlier` above | `027` Q-2, approved 2026-08-30. A conversation reads down and the newest entry is what the reader came for. A drawer and an inline feed are not the same screen |
| 2 | Two body sections, **Comments** and **Activity** | **One merged Timeline** | `013` returns ONE cursor-paged union of `dbo.TicketComments` and `dbo.TicketHistory`, with a `type` discriminator per entry. Two sections would need the client to split it back apart and would give each half its own cursor, which the endpoint does not offer |
| 3 | **Escalate** in the take-action menu; escalation callout in the rail | Escalate **removed**; the rail marker stays and is **read-only** | Escalation is `016`. `isEscalated` is on this response, so the marker costs nothing and the action is not ours to draw |
| 4 | Status change with no note field | **`note` on the status dialog, required when closing from `New` or `Open`** | BR-1.2, and `012`'s frozen contract. Not optional scope: without it a Close is a `400` the reader cannot act on |
| 5 | Layout unmeasured | Two columns down to **700px**, stacked below | The preview's first threshold was 900, which stacked the rail at the 880 frame — the one frame the review exists to look at. At 880 the content column gets 880 − 240 − 24 − 48 = **568px** |

## Layout

```text
‹ Back   TCK-2026-000042  [Status]              [Take action ⌄]
┌──────────────────────────────────────────────┬──────────┐
│ subject (dir="auto", up to ~200 chars)       │ rail 240 │
│ ┌ summary strip ─────────────────────────┐   │          │
│ │ Status · Customer · Assignee · Channel │   │ priority │
│ │ Category · Priority · Created · Updated│   │ escalated│
│ └────────────────────────────────────────┘   │  (r/o)   │
│ ▾ Description                                │ anchors  │
│ ▾ Timeline                                   │          │
│   ┌ [load earlier] ──────────────── scroll ┐ │          │
│   │ oldest ↑                              │ │          │
│   │ …                                     │ │          │
│   │ newest ↓                              │ │          │
│   └───────────────────────────────────────┘ │          │
│   composer (hidden entirely when Closed)     │          │
├──────────────────────────────────────────────┴──────────┤
│ ‹ Back                                   [Take action ⌄]│
└─────────────────────────────────────────────────────────┘
```

Four things taken from the house pattern and kept after the preview: a key-value summary
strip under the title, a rail that doubles as section anchors, accordion body sections,
and a **sticky bottom action bar** so a hundred timeline entries never force a scroll back
up to act.

**The rail is on the inline-end**, not the inline-start — that is what the preview
rendered in Arabic and it is correct in both directions. `inset-inline-start` on the
active anchor bar, never `left`.

## Elements

| Region | Element | Component | Tokens | Icon | i18n key |
|---|---|---|---|---|---|
| Header | Back | Button, Secondary-Outline, md | h40 | — | `common:back` |
| Header | Ticket number | `<bdi dir="ltr">` | `--type-title-1` / 700, `tabular-nums`, Latin digits | — | — |
| Header | Status | Badge | BR-1 tone map — `features/tickets/TicketBadges.tsx` is the one copy | — | `tickets:status.*` |
| Header | Take action | Button, Primary + menu | rendered from `allowedTransitions`; **absent** when the array is empty | `chevronDown` | `tickets:takeAction` |
| Body | Subject | — | `--type-title-2` / 700, `--leading-ar-heading` under `ar`, **`dir="auto"`**, `overflow-wrap: anywhere` | — | — |
| Strip | Key-value pair | — | label `--text-helper` / `--text-muted`; value `--type-label-md` / 500 | — | per field |
| Strip | Assignee | — | from `ticket.assignee`, **never** looked up in the picker list | — | `tickets:assignee` |
| Rail | Priority | — | `--type-label-lg` / 700 | — | `tickets:priority.*` |
| Rail | Escalated | Callout, **read-only** | `--state-danger-bg`, `--state-danger-text` | `escalate` | `tickets:escalated` |
| Rail | Anchors | — | active gets 3px `--navy-900` on `border-inline-start` | — | per section |
| Body | Section header | button | h48, `--type-title-3` / 600, chevron at `margin-inline-start: auto` | `chevronDown` | per section |
| Body | Description | — | `--text-body`, `--leading-ar-normal` under `ar`, **`dir="auto"`**, `white-space: pre-wrap` | — | — |
| Timeline | Load earlier | Button, pill | at the **top** of the feed. **Not** a page number | — | `tickets:timeline.loadEarlier` |
| Timeline | Comment | — | avatar + name + role + time + body `dir="auto"` | — | — |
| Timeline | Internal badge | Badge, warning outline | BR-5.4 — **marked, never hidden** | — | `tickets:comment.internal` |
| Timeline | Channel | — | icon + label, only when `channel` is non-null | per channel | `tickets:channel.*` |
| Timeline | History row | — | no avatar, one line, `--text-secondary`, indented to the avatar column | — | per `type` |
| Timeline | History note | — | `border-inline-start` 2px, `--text-muted` | — | — |
| Body | Composer | Textarea + controls | **hidden entirely when Closed**, not disabled | — | `tickets:comment.placeholder` |
| Body | Internal toggle | Checkbox | helper states BR-5.4 in words | — | `tickets:comment.markInternal` |
| Body | Channel select | Dropdown, sm | optional; placeholder means "typed here" | `chevronDown` | `tickets:comment.channel` |
| Body | Send | Button, Primary, md | disabled while the body is empty | `comment` | `tickets:comment.send` |
| Footer | Sticky bar | — | `--surface-card`, `border-block-start` 1px, `position: sticky; inset-block-end: 0` | — | — |

## Take-action menu

**Rendered from `allowedTransitions` on the response. The client holds no copy of the
state machine** (ADR-004). BR-1 lives in `Wasl.Domain` once; a second copy in React is
correct until the map changes and then wrong in exactly one place nobody looks at.

**If the array is empty the button is not rendered at all** — the `Closed` case, and the
one `027` AC-2 insists on asserting directly rather than only with a populated array.

A **menu, not inline buttons** (`027` Q-3, approved). The reason is not the count: controls
that appear and disappear per state read as a broken toolbar.

| Menu item | Condition | Opens |
|---|---|---|
| Move to `<status>` | present in `allowedTransitions` | Confirm, with `note` |
| Close | present in the array | Confirm; **note required** from `New` or `Open` (BR-1.2) |
| Assign / Reassign | always, while the menu exists | Assignee picker |
| Unassign | assignee is non-null | Confirm |
| ~~Escalate~~ | — | **`016`. Not on this screen** |

Assignment is bundled into the same menu, so "empty array ⇒ no button" also removes it.
That is safe only because `Closed` is terminal for assignment too — a reassign on a closed
ticket is a `409`. Stated because it is not obvious from AC-2, which is about transitions.

## Actions

Every write carries `expectedVersion`, taken from the `version` that came with the ticket.

| # | Trigger | Guard | Request | Success | Failure |
|---|---|---|---|---|---|
| 1 | Status change | Confirm accepted | `PUT /tickets/:id/status` with `status`, `note?`, `expectedVersion` | Take the **new** `version` from the response; refetch ticket and timeline | see the table below |
| 2 | Close | Note non-empty when from `New`/`Open` | same, `note` | Actions disappear, composer hides | `400` → field error on the note |
| 3 | Assign / Reassign / Unassign | BR-2, mirrored for affordance only | `PUT /tickets/:id/assignee` with `expectedVersion` | Strip updates, a history row appears | `403` · `409` |
| 4 | Add comment | Body non-empty, ≤4000 | `POST /tickets/:id/comments` with `body`, `isInternal`, `channel?` | Refetch the newest page | `409 ticket-closed` → hide composer, explain |
| 5 | Load earlier | `hasMore` | `GET /tickets/:id/timeline?before=<nextCursor>` | Prepend, **and correct the scroll** — see below | Error inside the feed only |
| 6 | Anchor click | — | — | Expand and scroll to the section | — |

### `expectedVersion` has three answers and the screen acts on each

Collapsing them into "it failed" throws away the only one the reader can do anything
about.

| Response | Meaning | What the screen does |
|---|---|---|
| `200` | Applied | Take the **new** `version` from the body. The old one is now a `409` |
| `400` | Missing, empty, or non-base64 | **A bug in this client, not a user error.** Never worded as "try again", never offers a retry, never counted as recoverable |
| `409 errors/concurrency-conflict` | Someone else changed it first | Banner above the strip, refetch, say what happened. **Never retried automatically** — the second write would apply to a state the reader never saw |

**Nothing renders a ticket from a write response, and no `setQueryData` seeds a ticket
key** (`026` §5). The write's job is to produce a new `version` and invalidate; the read
is the only thing that paints.

## Measured rules

Four things the preview established that reading the contracts would not have.

### 1 · The prepend needs `overflow-anchor: none`, then a manual correction

"Load earlier" prepends, and a naive implementation jumps. The correction is to capture
`scrollHeight` before the insert and add the difference to `scrollTop` in a
`useLayoutEffect` — before paint; a `useEffect` runs after it and turns the scroll into a
flicker.

**On its own that correction makes Chrome worse.** Chrome implements CSS scroll anchoring
and enables it by default on every scroll container. Measured on a 50-entry prepend: it
had *already* moved `scrollTop` by +3929px and left the same row at the same offset
(109 → 110) before the effect ran. The manual correction then applied the same +3929 a
second time and the feed clamped to the bottom — 9852 → 7398. The code written to stop a
jump was causing one, and only in the engine that needed it least.

So the feed sets `overflow-anchor: none` and does it in code. Not belt-and-braces:
**Safari has never shipped scroll anchoring**, and Chrome suppresses its own under
conditions that are invisible from here. One mechanism that runs everywhere beats two that
overlap in one engine and neither of which runs in another.

| Correction | Inserted | `scrollTop` moved | Same row at top | Drift |
|---|---|---|---|---|
| on | 3929px | +3929 | yes | 1px |
| **off** (negative control) | 3649px | **0** | **no** | −77px — the reader is thrown back a day |

The control genuinely fails now. Before `overflow-anchor: none` it passed, because Chrome
was quietly doing the work.

### 2 · The timeline is a cursor, and it must not become pages

`?before=<cursor>&limit=` while the list is an envelope, and **the difference is
deliberate**. A list grows at the end the reader is not looking at, so page 2 stays page
2; a timeline grows at the end they *are* looking at, so a page number silently skips or
repeats entries between two requests. `013` measured exactly that — one comment on two
consecutive pages — and the assertion that caught it was *no entry appears twice*, not a
count.

The cursor is **opaque**: never parsed, compared, or ordered by the client. The wire is
newest-first; the render reverses a prefix of it. **The client never re-sorts** — a client
that re-sorts has taken over an ordering it cannot see.

### 3 · The assignee picker

`GET /api/support-users` returns a **bare JSON array** — not an envelope, not a
`{ "value": [...] }` wrapper. Items carry `id`, `fullName`, `role`. No email: a picker
needs a name and a role.

**Sort it with `Intl.Collator`.** The server orders `FullName` ascending under the
database collation, which does not follow `Accept-Language`. Measured on eight names:

| | Order |
|---|---|
| SQL collation | Layla Al-Harbi · Noura Al-Qahtani · Omar Khalid · Sara Al-Mutairi · أحمد الزهراني · بدر العتيبي · خالد الشمري · منيرة الدوسري |
| `Intl.Collator('ar')` | أحمد الزهراني · بدر العتيبي · خالد الشمري · منيرة الدوسري · Layla Al-Harbi · Noura Al-Qahtani · Omar Khalid · Sara Al-Mutairi |

A mixed list therefore looks ordered in English and arbitrary in Arabic. Nothing errors.

**Render the current assignee from the TICKET, never by looking the id up in this list.**
A user deactivated after assignment keeps their tickets and leaves the picker, so the
lookup yields nothing and reads as missing data. The picker says so in words when the
current assignee is absent from it.

BR-2 is **mirrored for affordance only** — a Manager assigns anyone, an Agent may only
self-assign an unassigned ticket. Disabling the rest saves a round trip and enforces
nothing; the server decides, and the endpoint carries no role policy because `ManagerOnly`
there would refuse every legitimate Agent.

### 4 · Two bidi traps, and only one of them is ours

The ticket number is pinned: `<bdi dir="ltr">`, Latin digits, `tabular-nums`. Without it
the leading neutrals lay out on the visual right and the reader copies a string that does
not exist.

**An identifier typed inside an Arabic description is not ours to fix and still reads
wrong.** `4471-0092` in the body renders `0092-4471` — leading digit, neutral hyphen, and
`dir="auto"` does not save it, because `auto` resolves the *paragraph*, not a run inside
it. Recorded rather than worked around: the client does not rewrite user content, and
anyone who meets this should know it is bidi and not a data fault.

A third trap was caught in the preview's own instrumentation and is worth naming because
the same shape will recur: eight names joined into a single `<bdi>` resolved rtl and
rendered **reversed** inside an ltr line, so two genuinely different orderings looked
identical. One `bdi` per value, and number them.

## States

| State | Condition | Renders |
|---|---|---|
| Loading | First load | Skeleton in the description and timeline regions |
| Not found | `404` | Full-page empty state, back to the list |
| Forbidden | `403` | **Inline, beside the control it refused** — not a toast. The reader needs to see what they cannot do, next to it |
| Client fault | `400` on `expectedVersion` | A plain statement that nothing changed and retrying will not help. No retry control |
| Concurrency conflict | `409` | Banner above the strip: someone else changed this, with `Reload` |
| Closed ticket | `status = Closed` | `allowedTransitions` is `[]`, so no action control; composer **hidden entirely** with one sentence saying why; timeline read-only |
| Unassigned | `assignee` is `null` | "Unassigned" in the strip. **The key is present** — an absent key is `undefined`, which renders empty and passes every shape assertion |
| Empty timeline | No entries | Empty state inside the section, composer still shown |
| Timeline error | Timeline failed, ticket did not | **Only that region degrades.** Retry inside the section |

## RTL

Rail moves to the inline-end. Anchor bars follow via `border-inline-start`. The section
chevron **rotates and does not mirror** — a vertical disclosure has no direction. The
back chevron mirrors. Subject, description and every comment body keep `dir="auto"`, and
the block stays aligned with the page, so a Latin comment in an Arabic thread starts on
the same edge as its neighbours. The ticket number stays Latin. Dates go through
`lib/formatters.ts`: Latin digits and Gregorian in both locales, because `ar` defaults to
Arabic-Indic digits and `ar-SA` defaults to the Hijri calendar, and neither default
announces itself.

## Open against this screen

| # | Question | Working assumption |
|---|---|---|
| A | The rail's only content at 880px is `Priority`, which the summary strip also carries. Is the rail earning 240px before `016` adds the escalation callout? | Keep it — the anchors need a home and `016` fills it. Flagged because the preview made the duplication visible and nothing else will |
| B | The preview shows the picker only for an Agent, where BR-2 disables every row and the list reads as inert | A Manager variant should be added before the picker is wired |

## Not on this screen

Editing a comment · deleting a comment · attachments · reopening a closed ticket ·
merging or linking tickets · time tracking · SLA countdown · related tickets · escalation
(`016`) · the customer profile link (`018` — the customer is text here, as on the list) ·
the audit log view (`019`).
