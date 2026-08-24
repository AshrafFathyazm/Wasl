# 013 — Frontend Spec

**Screen:** Ticket detail — the timeline drawer and the comment composer ·
**Route:** `/tickets/:id` · **Story:** US-010 ·
**Who can reach it:** any authenticated support user (Agent or Manager — BR-6)

The element-by-element screen spec, with tokens, icons, and layout regions, is
[`docs/sdd/design/screens/04-ticket-detail.md`](../../docs/sdd/design/screens/04-ticket-detail.md).
It is not duplicated here. This file carries what is specific to **this feature's**
build: the contract binding, the states, the i18n keys, the RTL obligations, and the
accessibility of a drawer.

The API surface is [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md).

This feature adds two regions to a screen that `010`, `011`, and `012` already own: the
**timeline drawer** behind the header's `Timeline` button, and the **composer** at the
foot of the Comments accordion section. It changes nothing else on the page.

---

## Components

| Component | Kind (ADR-011 §4) | Fetches? |
|---|---|---|
| `TicketDetailPage` | Route / page | Yes — owns the ticket query, the timeline query, and the add-comment mutation. Already exists from `010`; this feature adds the timeline query and the mutation to it |
| `TicketTimelineDrawer` | Feature component | **No** — receives `entries`, `hasOlder`, `isLoading`, `error`, `onLoadOlder`, `onClose` as props |
| `TimelineEntry` | Feature component | No — narrows on `entryType` and delegates |
| `CommentComposer` | Feature component | No — React Hook Form + Zod, `onSubmit` as a prop |
| `Textarea`, `Checkbox`, `Select`, `Button`, `Badge` | Primitive | No |

The drawer does not own a `useQuery`, even though a drawer that loads its own content is
the shape everyone reaches for first. Fetching stays at the route level (ADR-011 §4): a
drawer that fetches on mount is a request waterfall hidden behind a click, and the
waterfall only shows up on a slow connection, which is where it matters.

No global store. There is nothing here that is not server state (TanStack Query), form
state (React Hook Form), or "is the drawer open" (`useState` in the page).

## Query keys and invalidation

| Key | Source | Invalidated by |
|---|---|---|
| `['ticket', id]` | `GET /api/tickets/{id}` (`010`) | The add-comment mutation on `409`, so the closed state and the action menu refresh together |
| `['ticket', id, 'timeline', { page, pageSize }]` | `GET /api/tickets/{id}/timeline` | The add-comment mutation on success — the **whole prefix**, then refetch with no `page` |

Invalidating one page rather than the prefix is the bug worth naming: the last page rolls
over into a new one when it fills, so the page number the client is holding stops being
the newest, and a comment posted at that moment never appears until a reload.

## Fields — the composer

| Field | Control | Required | Client rule | Serves |
|---|---|---|---|---|
| `body` | `Textarea`, 4 rows, auto-grow, `dir="auto"` | yes | 1–4000, not whitespace-only. Counted in UTF-16 code units so the counter agrees with the server | AC-2, AC-3 |
| `isInternal` | `Checkbox` | no | Defaults unchecked | AC-5 |
| `channel` | `Select`, optional, empty by default | no | One of the five `CommunicationChannel` values | AC-6, AC-7 |
| — | `Button` Primary "Send" | — | Disabled while `body` is empty and while the request is in flight | AC-1 |

The character counter appears at 3600 and not before. A counter that is visible from the
first keystroke reads as a limit the user is being pushed towards, and it is announced to
a screen reader on every character unless it is `aria-live="off"` until it matters.

## States — all of them, none optional

| State | Condition | What the user sees | AC |
|---|---|---|---|
| **Loading** | First timeline fetch | Three skeleton entries in the drawer, composer already interactive | AC-17 |
| **Loaded** | `200` | Ascending feed: oldest at the top, newest at the bottom, scrolled to the bottom on open | AC-9, AC-12 |
| **Loading older** | `onLoadOlder` in flight | Spinner above the first entry; the scroll anchor is held on the entry that was at the top | AC-12 |
| **End of feed** | `page === 1` | The load-older control is **not rendered**. Not disabled — there is nothing to enable | AC-12 |
| **Error** | Non-2xx on the timeline | Message and a retry **inside the drawer**, per screen 04's states table. The page behind it is still usable | AC-17 |
| **Empty — comments section** | No comments on the ticket | "No comments yet", composer still shown | AC-17 |
| **Empty — whole timeline** | `items: []` on the first page | **Unreachable by invariant** — every ticket has a `Created` history row. Rendered as a fault with the `traceId`, not as a friendly empty state | AC-17 |
| **Submitting** | Mutation pending | Send disabled and showing progress; a double-click sends one request | AC-1 |
| **Conflict** | `409 errors/ticket-closed` | Optimistic entry removed, composer replaced by an explanation, ticket refetched | AC-4 |
| **Closed ticket** | `status === 'Closed'` on load | No composer at all — hidden, not disabled | AC-4 |
| **Not found** | `404` on the ticket | Page-level empty state from `010`; the drawer never opens | AC-16 |
| **Forbidden** | — | **Does not exist here.** BR-6 permits both roles on both endpoints. Recorded so the omission is visibly a decision and not a missed state |

The whole-timeline empty state deserves its own sentence. The instinct is to render "No
activity yet" and move on. But it cannot legitimately happen — a ticket always has at
least its `Created` row — so if it renders, the history branch of the union has silently
stopped contributing. A friendly empty state hides a broken query behind a reassuring
message, which is the worst of both.

## Rendering an entry

| Entry type | Renders |
|---|---|
| `Comment` | Avatar, `actorName`, relative time (absolute in the `title`), the internal badge when `isInternal`, the channel label when present, then the body with `dir="auto"` and preserved line breaks |
| `History` | Icon per `eventType`, then one translated **sentence** built from `eventType`, `oldValue`, `newValue`, and `actorName`, with `note` beneath it when present, also `dir="auto"` |

Two rules that are not negotiable:

- **The body is text.** Never `dangerouslySetInnerHTML`, never a markdown renderer.
  React escapes text nodes; that is the whole defence and it is sufficient because the
  body is plain text by design. `TEST-013-11` asserts a `<script>` body renders as
  visible characters, and greps the slice for the escape hatch.
- **The switch on `entryType` is exhaustive**, with a `default` branch that assigns to
  `never`. An added entry type then fails to compile instead of rendering a blank row.

Render keys are `` `${entryType}:${id}` ``. A comment id and a history id come from
different tables, so `id` alone is not the identity of an entry, and React key collisions
present as entries that refuse to update.

## Localization

Every string is a key. No literals in JSX (BR-8.8), enforced by lint.

| Key | `en` | Note |
|---|---|---|
| `tickets:timeline` | Timeline | The header button (existing key, screen 04) |
| `tickets:timeline.title` | Ticket timeline | Drawer heading, and the dialog's accessible name |
| `tickets:timeline.loadOlder` | Load older | Rendered only when `page > 1` |
| `tickets:timeline.loadingOlder` | Loading older entries… | Announced politely |
| `tickets:timeline.error` | The timeline could not be loaded | Retry sits next to it |
| `tickets:timeline.empty` | No activity recorded for this ticket | The unreachable branch. Copy says "recorded", not "yet" — it is a fault, not a beginning |
| `tickets:timeline.entry.created` | {{actor}} created this ticket | |
| `tickets:timeline.entry.statusChanged` | {{actor}} changed the status from {{from}} to {{to}} | `from`/`to` are **translated enum labels**, not raw values |
| `tickets:timeline.entry.assigned` | {{actor}} assigned this ticket to {{to}} | `to` is a person's name, rendered verbatim |
| `tickets:timeline.entry.unassigned` | {{actor}} removed the assignee | |
| `tickets:timeline.entry.priorityChanged` | {{actor}} changed the priority from {{from}} to {{to}} | Translated labels again |
| `tickets:timeline.entry.escalated` | {{actor}} escalated this ticket | The reason arrives as `note` |
| `tickets:comment.internal` | Internal | The badge (existing key, screen 04) |
| `tickets:comment.placeholder` | Add a comment… | Existing key |
| `tickets:comment.label` | Comment | The **programmatic label**. The placeholder is not a label |
| `tickets:comment.markInternal` | Mark as internal | Existing key |
| `tickets:comment.channel` | Channel | Existing key |
| `tickets:comment.send` | Send | Existing key |
| `tickets:comment.sending` | Sending… | |
| `tickets:comment.empty` | No comments yet | The comments-section empty state |
| `tickets:comment.closed` | This ticket is closed. No further comments can be added | Shown where the composer was |
| `tickets:comment.remaining` | {{count}} characters remaining | **Plural key**, all six CLDR categories in `ar` (BR-8.14) |
| `errors.commentRequired` | Enter a comment | Client-authored mirror of AC-2 |
| `errors.maxLength` | Must be {{max}} characters or fewer | Interpolated, never concatenated |

Every key exists in `ar` as well, enforced by the parity test (BR-8.11) — not by
discipline.

**Not in this table, and deliberately so:**

| Absent | Why |
|---|---|
| `tickets:timeline.entry.commentAdded` | `CommentAdded` history rows are excluded from the projection, so no sentence is ever rendered for one. A key for it would be dead, and a later reader "fixing the gap" by adding it would be reintroducing the double-render |
| `tickets:status.*`, `tickets:priority.*`, `tickets:channel.*` | Owned by `010` and `012`. Referenced, not copied. Two catalogue entries for one enum label drift, and the stale one is the one the user sees |
| Server validation and conflict messages | They arrive already translated (BR-8.6). Rendered as received; re-translating would put the same sentence in two catalogues |

### The mistake this screen makes easily and invisibly

The stored values are canonical enum strings (BR-8.7). The sentence is translated. Pass
`oldValue` straight into the interpolation and you get a fully Arabic sentence with
`New` and `Open` sitting inside it in Latin script.

Nothing fails. The key exists in both catalogues. The parity test passes. The sentence
renders. It is only visible to someone reading Arabic, which is why `TEST-013-17` renders
an Arabic `StatusChanged` entry and fails on a Latin enum token.

The interpolated values must go through the enum-label keys themselves —
``t(`tickets:status.${value}`)`` — and a missing label falls back to the English string,
never to the raw key (BR-8.12).

## Right-to-left

| Concern | Requirement |
|---|---|
| Direction | `dir` on the document root, set once (ADR-007 §6) |
| Drawer | Enters from the **inline-end**, so it slides in from the left in Arabic. `inset-inline-end: 0`, never `right: 0` |
| Feed layout | Avatar at the inline-start, timestamp at the inline-end. The connector rail uses `inset-inline-start`, never `left` |
| Entry content | `dir="auto"` on **each** body and each note — never on the feed container. One Arabic comment inside an English feed must not flip the whole feed, and it will if the attribute is hoisted |
| Composer | Textarea `dir="auto"`. The send button follows the inline-end of the control row |
| **Does not mirror** | The timestamp digits (Latin, BR-8.13) · the `TicketNumber` in the drawer heading · the channel value inside a translated label · the escalate icon's up-arrow — vertical meaning has no direction (screen 04) |
| **Does mirror** | The drawer's close chevron · the load-older affordance's arrow · the drawer's entry animation direction |

`FE-013-09` walks the drawer and the composer in Arabic and records what it found in
`tests.md`. RTL defects are visual — no assertion catches a translated sentence with two
embedded enum labels wrapping onto three lines where the English took one.

## Accessibility

| Requirement | Verified by |
|---|---|
| The drawer is a real dialog: `role="dialog"`, `aria-modal="true"`, named by `tickets:timeline.title`, focus trapped inside it | `FE-013-08` |
| `Escape` closes it and focus returns to the `Timeline` button that opened it | `FE-013-08` |
| The feed is an ordered list (`<ol>` / `<li>`), because the order carries meaning | `FE-013-08` |
| Load-older keeps the reader's place: scroll anchored on the previously-first entry, and focus not thrown to the top | `FE-013-08` |
| A newly posted comment is announced once, politely — not on every optimistic re-render | `FE-013-08` |
| The textarea has a programmatic label, not a placeholder standing in for one | `FE-013-08` |
| The character counter is associated via `aria-describedby` and announced only near the limit | `FE-013-08` |
| The internal badge is conveyed by text, not by colour alone | `FE-013-04` |
| Every control keyboard reachable with a visible focus ring | `FE-013-08` |

## Preview before build — not optional

`FE-013-00` renders the drawer and the composer with real tokens, real copy, a
**137-entry** ticket, every state above, and both languages **before** anything is wired.

Three things a preview finds in minutes and a wired screen hides for hours:

- The Arabic sentence for `statusChanged` carries two translated enum labels and is
  materially longer than the English one. It wraps where the English does not.
- A 4000-character comment in the feed. The tallest single entry the design has to
  survive, and nothing in the data model prevents it.
- The internal badge, the channel label, and a long author name on one row, in both
  directions.

ADR-009, `docs/sdd/design/preview-first-workflow.md`.

## Divergence from the screen spec, recorded

`docs/sdd/design/screens/04-ticket-detail.md` action 5 says a new comment is
**prepended** optimistically. The feed is ascending — oldest first — so a new comment is
**appended** at the newest end and the view scrolls to it. Prepending would put it above
entries that happened before it.

Recorded here rather than silently implemented the other way. `DOC-013-04` corrects the
screen spec.

## Not on this screen

| Excluded | Where |
|---|---|
| Editing or deleting a comment | Nowhere. BR-5.3 makes comments append-only; there is no endpoint and no plan for one |
| Reactions, mentions, threading | No requirement |
| Rich text or markdown | Plain text by design — a rich-text field without sanitisation is stored XSS, and with sanitisation it is a surface nobody asked for |
| Attachments | Out of scope project-wide |
| Real-time updates | No requirement. TanStack Query refetches on window focus, which is enough |
| Filtering internal comments out for a customer view | No customer login exists. The flag is stored so the view can be added later **without a data migration** (BR-5.4) |
| The take-action menu, assignment, escalation | `012`, `011`, `016` |
| A jump-to-date or search within the timeline | No requirement |
