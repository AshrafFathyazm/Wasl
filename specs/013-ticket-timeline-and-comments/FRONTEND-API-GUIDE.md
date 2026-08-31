# Frontend API Guide — Ticket timeline and comments (US-010)

> ## ⚠ THE PAGING HALF OF THIS GUIDE IS SUPERSEDED — 2026-08-31
>
> **Everything below about `?page=` and `?pageSize=` is wrong, and the server has never
> behaved that way.** `GET /api/tickets/{id}/timeline` is a **cursor**:
>
> ```http
> GET …/timeline?before=<the previous page's nextCursor>&limit=50&type=Comments|History
> ```
> ```text
> envelope : items, hasMore, nextCursor, commentCount, historyCount   ← no totalCount
> ```
>
> **The recipe at *load older → `?page=N-1`* would produce a timeline that silently refuses
> to scroll back:** both parameters are ignored, so every request returns the newest page.
> Nothing errors and nothing turns red. **And the cache key this guide gives —
> `['ticket', id, 'timeline', { page, pageSize }]` — must not be built**, because there is no
> page number to put in it.
>
> The full measured shape, the `type=Comments` plural trap, and what a client must not do with
> the cursor are in **Contract changes** at the foot of
> [`contracts/ticket-timeline-api.md`](contracts/ticket-timeline-api.md).
>
> **The frontend lane found this and refused to transcribe either shape**, which was the right
> call: writing the contract's shape ships the silent failure above, and writing the
> implementation's would have ratified an unrecorded contract change from the client side.
> `FE-027-08` was blocked on it. The backend lane ruled on 2026-08-31 — the implementation is
> the truth, `CLAUDE.md` and `013`'s own `summary.md` had already said so, and the frozen file
> was simply never updated. **The defect was the omission, not the code.**
>
> Everything else in this guide — the comment composer, the `403`, the redaction, the `Closed`
> rule — still holds.

Everything the frontend lane needs to build the timeline drawer and the comment composer
on `/tickets/:id` **without waiting for the backend**. Derived from
[`contracts/ticket-timeline-api.md`](contracts/ticket-timeline-api.md), which is frozen.

> Start now. Do not wait for `BE-013-03`.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on every call
- **Locale:** send `Accept-Language: ar` or `en`. Read `Content-Language` on the
  response to know which was actually applied
- Errors are RFC 7807 `ProblemDetails`. **Branch on `type`, never on `title`** — `title`
  is translated, `type` is not
- Timestamps arrive UTC with a `Z`, at millisecond precision. Format for display
  client-side, in the active locale
- Both endpoints are open to `Agent` and `Manager`. There is **no `403`** to handle here

## The two endpoints

```text
POST /api/tickets/{id}/comments      append a comment
GET  /api/tickets/{id}/timeline      the merged feed, paged
```

There is no endpoint to edit or delete a comment, and there will not be one (BR-5.3). Do
not build an edit affordance that a later endpoint is expected to fill.

### Types — provisional until generated

Hand-written from the contract. **Marked provisional on purpose**: they are replaced by
types generated from the OpenAPI document once the endpoints are real (ADR-011 §6), and
the swap is a deliberate task (`FE-013-10`), not something to forget.

```ts
// PROVISIONAL — replace with generated types when /swagger exists. See FE-013-10.

export type CommunicationChannel = 'Email' | 'WhatsApp' | 'LiveChat' | 'Sms' | 'WebForm';

export type TimelineEventType =
  | 'Created' | 'StatusChanged' | 'Assigned'
  | 'Unassigned' | 'PriorityChanged' | 'Escalated';
// 'CommentAdded' is deliberately absent: the row exists in the database and is
// excluded from this projection, because the comment itself is the entry.

export interface AddCommentRequest {
  body: string;
  isInternal?: boolean;
  channel?: CommunicationChannel | null;
}

export interface CommentResponse {
  id: string;
  ticketId: string;
  authorUserId: string;
  authorName: string;
  body: string;
  isInternal: boolean;
  channel: CommunicationChannel | null;
  createdAtUtc: string;              // ISO 8601, Z
}

interface TimelineEntryBase {
  id: string;
  occurredAtUtc: string;
  actorUserId: string;
  actorName: string;
}

export interface CommentEntry extends TimelineEntryBase {
  entryType: 'Comment';
  comment: { body: string; isInternal: boolean; channel: CommunicationChannel | null };
  history: null;
}

export interface HistoryEntry extends TimelineEntryBase {
  entryType: 'History';
  comment: null;
  history: {
    eventType: TimelineEventType;
    oldValue: string | null;         // canonical enum value — NOT display text
    newValue: string | null;
    note: string | null;
  };
}

export type TimelineEntry = CommentEntry | HistoryEntry;

export interface Paged<T> {
  items: T[];
  page: number;                      // the page the server actually served
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  traceId: string;
  errors?: Record<string, string[]>; // present only on 400
}
```

The discriminated union is the point. `entryType` narrows `comment` and `history` for
you, so `TimelineEntry` needs no defensive checks — and an added entry type becomes a
compile error in the switch rather than a blank row on the screen.

## Requests

```http
POST {{baseUrl}}/api/tickets/8f1c2d34-.../comments
Authorization: Bearer <JWT>
Accept-Language: ar
Content-Type: application/json

{ "body": "تم تأكيد الاستلام.", "isInternal": false, "channel": "WhatsApp" }
```

```http
GET {{baseUrl}}/api/tickets/8f1c2d34-.../timeline
GET {{baseUrl}}/api/tickets/8f1c2d34-.../timeline?page=2&pageSize=50
```

**Send the first request with no `page`.** Omitting it returns the newest page and tells
you its number. Sending `page=1` because it looks like the obvious default returns the
*oldest* fifty entries, and on an active ticket that renders as a timeline that stopped
weeks ago — with no error anywhere.

## Responses, and what the UI does with each

### `POST /comments`

| Code | `type` | What the UI does |
|---|---|---|
| `201` | — | Replace the optimistic entry with the returned comment (it carries `authorName`, so no second request). Then invalidate the timeline query. **There is no `Location` header** — do not read one |
| `400` | `errors/validation` | Attach each `errors[field]` message to that field. Keys are `body`, `channel`, `isInternal` |
| `401` | `errors/unauthenticated` | Session expired. Redirect to sign-in; this is not a form error |
| `404` | `errors/not-found` | The ticket is gone. Leave the composer and send the user back to the list — this is a page-level state, not a field error |
| `409` | `errors/ticket-closed` | The ticket closed between load and submit. **Roll back the optimistic entry**, hide the composer, explain, and refetch the ticket so the action menu disappears too |

```ts
if (res.status === 409 && problem.type.endsWith('/ticket-closed')) {
  rollbackOptimisticEntry();                      // or the phantom comment stays on screen
  queryClient.invalidateQueries({ queryKey: ['ticket', ticketId] });
}
```

The rollback is the part that gets forgotten. Without it the failed comment stays
rendered, looks saved, and is gone after the next reload — which the user reads as the
system losing their work.

### `GET /timeline`

| Code | `type` | What the UI does |
|---|---|---|
| `200` | — | Render `items` in the order received. Ascending: oldest at the top, newest at the bottom, scrolled to the bottom on open |
| `200`, `items: []` | — | Only possible past the last page. **A timeline for a real ticket is never empty** — every ticket has a `Created` entry — so an empty first load means the union broke. Render a fault state, not a friendly "no activity yet" that hides it |
| `400` | `errors/validation` | Only reachable by sending a non-integer `page`. Fix the caller |
| `401` | `errors/unauthenticated` | Redirect to sign-in |
| `404` | `errors/not-found` | Page-level not-found for the ticket, not an error inside the drawer |

## Paging: the whole rule in five lines

```text
open drawer      → GET …/timeline                (no page) → newest page, envelope says page = N
load older       → GET …/timeline?page=N-1                 → prepend, keep the scroll anchor
at page 1        → stop. There is nothing older
new comment      → invalidate the WHOLE ['ticket', id, 'timeline'] prefix and refetch with no page
```

Three things this protects against:

| Mistake | What it looks like |
|---|---|
| Caching the page number and reusing it after a comment is added | The last page can roll over into a new one when it fills, so the cached number now points at a full, immutable page and the new comment never appears |
| Decrementing past 1 | `page=0` clamps back to 1 and returns the same page, so a loop that does not check spins on the oldest page forever |
| Prepending older entries without an anchor | The reader's scroll position jumps by however tall the new entries are, and they lose their place mid-sentence |

Query keys:

```ts
['ticket', id]                                    // the ticket itself
['ticket', id, 'timeline', { page, pageSize }]    // one page
```

Fetching happens **at the route level only** (ADR-011 §4). `TicketTimelineDrawer`
receives entries and an `onLoadOlder` callback as props. A drawer that owns its own
`useQuery` is a request waterfall hidden behind a click, and it is the natural-feeling
way to build this.

## Client-side validation — mirror, never authority

```ts
const commentSchema = z.object({
  body:       z.string().trim().min(1, 'errors.commentRequired').max(4000, 'errors.maxLength'),
  isInternal: z.boolean().default(false),
  channel:    z.enum(['Email', 'WhatsApp', 'LiveChat', 'Sms', 'WebForm']).optional(),
});
```

Every rule above is also enforced server-side; the client is not the authority (ADR-003,
constitution III).

| Not done client-side | Why |
|---|---|
| Deciding whether the ticket is closed | The client hides the composer from `status`, which is a hint. The server owns BR-5.2, and the ticket can close between load and submit — which is exactly why the `409` path exists |
| Sanitising or escaping the body | React escapes text nodes. The body goes in as text; nothing strips tags, and nothing needs to |
| Counting graphemes | Count `String.length` — UTF-16 code units — so the counter agrees with the server and with `nvarchar(4000)`. A grapheme-aware counter says 3998 where the server says 4001 |
| Filtering internal comments | The server returns them to every support user by design (BR-5.4). Hiding them client-side would invent a rule and make the flag untestable |

## Rendering a history entry — where the localization bug lives

The sentence is translated. The values inside it are **canonical enum strings** and are
not (BR-8.7).

```ts
// WRONG — renders a fully Arabic sentence with "New" and "Open" in Latin script
t('tickets:timeline.entry.statusChanged', { from: e.history.oldValue, to: e.history.newValue })

// RIGHT — the values go through the enum-label catalogue too
t('tickets:timeline.entry.statusChanged', {
  from: t(`tickets:status.${e.history.oldValue}`),
  to:   t(`tickets:status.${e.history.newValue}`),
})
```

The wrong version has every key present in both catalogues, passes the parity test,
renders a complete sentence, and throws nothing. `TEST-013-17` renders an Arabic
`StatusChanged` entry and fails on a Latin enum token, because that is the only way this
gets caught.

`tickets:status.*` and `tickets:priority.*` are owned by `010` and `012`. Reference them;
do not add a second copy in this feature's keys — two catalogue entries for one enum
label drift, and the one you did not update is the one the user sees.

## States — every one of them is required

| State | Behaviour | AC |
|---|---|---|
| Loading | Skeleton entries inside the drawer | AC-17 |
| Loaded | Ascending feed, scrolled to the newest | AC-9, AC-12 |
| Loading older | Spinner at the top of the feed, scroll anchor held | AC-12 |
| Error | Message inside the drawer with a retry, not a page-level takeover | AC-17 |
| Empty — comments section | "No comments yet", composer still shown | AC-17 |
| Empty — whole timeline | Unreachable by invariant. Rendered as a fault, and it says so | AC-17 |
| Submitting a comment | Send disabled while pending, so a double-click sends one request | AC-1 |
| Conflict (`409`) | Optimistic entry rolled back, composer hidden, explained | AC-4 |
| Closed ticket | No composer at all — hidden, not disabled | AC-4 |

Absence of a state is a defect, not a gap (`docs/sdd/design/screens/README.md`).

## Localization

| Item | Rule |
|---|---|
| Composer labels, the internal badge, load-older, empty and error copy, one sentence per event type | Client-owned. Keys in `en` **and** `ar`, enforced by the parity test (BR-8.11) |
| Validation and conflict messages from the server | Already translated on arrival. Render them; do not re-translate or map them |
| Enum labels inside a sentence | Through `tickets:status.*` / `tickets:priority.*` / `tickets:channel.*` — see above |
| Relative times | `Intl.RelativeTimeFormat`, never a hand-built string. Arabic has six plural categories (BR-8.14) and concatenation gets most counts wrong |
| Counted nouns (an older-entry count, a character counter) | Plural keys, interpolated. Never `count + ' ' + t('entries')` |
| `dir` | `dir="auto"` on **each entry's body and note**, not on the feed. One Arabic comment must not flip the direction of an English feed |
| Layout | CSS logical properties. `margin-inline-start`, never `margin-left` |

Screen spec, element by element, with tokens and icons:
[`docs/sdd/design/screens/04-ticket-detail.md`](../../docs/sdd/design/screens/04-ticket-detail.md).
This feature's build detail — components, states, keys, RTL, accessibility — is in
[`frontend-spec.md`](frontend-spec.md).

## Before this feature closes

The generated OpenAPI document is compared against
[`contracts/ticket-timeline-api.md`](contracts/ticket-timeline-api.md) (`REV-013-03`). A
difference is a defect in one of the two, and both are corrected — never one silently.

If the contract moves while you are building, it arrives as a **Contract changes** entry
in [`plan.md`](plan.md) and this guide is regenerated. A contract change discovered by
the frontend failing to compile is the failure this process exists to prevent.
