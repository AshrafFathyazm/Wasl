# Contract — Ticket timeline and comments

**Feature:** `013-ticket-timeline-and-comments` · **Story:** US-010 · **Status:** FROZEN 2026-08-23
· **Lanes:** backend implements · frontend consumes

The agreement. The backend implements exactly this; the frontend may start against it
immediately. Any change goes through **Contract changes** in
[`plan.md`](../plan.md) first — see `docs/sdd/openapi/README.md`.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on every call
- **Content-Type:** `application/json`
- Timestamps are UTC, ISO 8601, `Z` suffix. Formatting for display is the client's job,
  in the client's locale
- Identifiers are `Guid` strings. Enums are strings on the wire
- Errors are RFC 7807 `ProblemDetails`. **`200` is never returned with an error in the
  body** (`docs/sdd/05-api-conventions.md`)
- Both endpoints are open to `Agent` **and** `Manager` (BR-6). Neither has a `403` path

---

## `POST /api/tickets/{id}/comments`

Appends a comment to a ticket. Append-only: there is no `PUT`, `PATCH`, or `DELETE` on
a comment, in this contract or any future one (BR-5.3).

### Request

```json
{
  "body": "تم التواصل مع العميل هاتفياً وتم تأكيد الاستلام.",
  "isInternal": false,
  "channel": "WhatsApp"
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `body` | `string(1..4000)` | **yes** | Not whitespace-only (AC-2). Length is counted in **UTF-16 code units** — the same count `String.length` gives in JavaScript and `string.Length` gives in .NET, and the same one `nvarchar(4000)` stores. A body of 4000 graphemes containing emoji is rejected, deliberately: the alternative is a client counter reading 3998 while the server reads 4001 |
| `isInternal` | `boolean` | no, default `false` | Marks the comment as internal (BR-5.4). It is **not** a visibility filter — see the behaviour table |
| `channel` | `string?` | no | One of `Email`, `WhatsApp`, `LiveChat`, `Sms`, `WebForm` (FR-3.3). Any other value is `400` naming `channel` and listing the permitted values (AC-7) |

There is **no `authorUserId` field**. The author is taken from the token. Sending one is
not an error and is ignored — the DTO does not declare it (AC-15).

There is **no `expectedVersion` field**, unlike the other ticket mutations. Adding a
comment does not modify the `Tickets` row, so there is nothing to conflict over. See the
behaviour table.

### `201 Created`

```json
{
  "id": "3f2a1b40-9c8d-4e7f-8a1b-2c3d4e5f6071",
  "ticketId": "8f1c2d34-5678-4abc-9def-0123456789ab",
  "authorUserId": "b7e4c210-3344-4a55-9b66-77c8d9e0f112",
  "authorName": "Layla Al-Harbi",
  "body": "تم التواصل مع العميل هاتفياً وتم تأكيد الاستلام.",
  "isInternal": false,
  "channel": "WhatsApp",
  "createdAtUtc": "2026-08-23T12:04:11.113Z"
}
```

**No `Location` header.** This is a deliberate deviation from
`docs/sdd/05-api-conventions.md`, recorded in `plan.md`: there is no
`GET /api/tickets/{id}/comments/{commentId}` in the endpoint inventory and there will
not be one, because BR-5.3 gives a comment no addressable identity of its own. A
`Location` pointing at a route that answers `404` is worse than no header. The created
comment is returned in the body so the client can reconcile its optimistic entry without
a refetch.

`authorName` is included for the same reason: the client has just rendered an optimistic
entry and needs the real one to replace it, and a second request to resolve a name it
already knows the id of would be a waterfall.

### Failures

| Code | `type` | When |
|---|---|---|
| `400` | `errors/validation` | Missing, empty, or whitespace-only `body`; `body` over 4000; `channel` not one of the five permitted values; `isInternal` not a boolean |
| `401` | `errors/unauthenticated` | Missing or invalid token |
| `404` | `errors/not-found` | No ticket with that id (AC-16). The slug is owned by `002-error-contract`; if `002` landed a different one, this contract follows it and this row is corrected rather than duplicated |
| `409` | `errors/ticket-closed` | The ticket's status is `Closed` (BR-5.2, BR-1.5, AC-4) |

There is no `403`. Both roles may comment (BR-6).

#### `400` — validation

```json
{
  "type": "https://wasl.local/errors/validation",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "detail": "See the errors property for field-level messages.",
  "instance": "/api/tickets/8f1c2d34-5678-4abc-9def-0123456789ab/comments",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01",
  "errors": {
    "body": ["A comment body is required."]
  }
}
```

#### `409` — the ticket is closed

```json
{
  "type": "https://wasl.local/errors/ticket-closed",
  "title": "This ticket is closed and cannot be commented on.",
  "status": 409,
  "instance": "/api/tickets/8f1c2d34-5678-4abc-9def-0123456789ab/comments",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01"
}
```

No `errors` dictionary: nothing the caller sent is wrong. The state changed underneath
them, which is a different thing and needs a different presentation in the UI.

`errors/ticket-closed` is **not** `errors/invalid-status-transition`. No transition was
attempted, and a client branching on the transition type would show the wrong message
and offer the wrong recovery.

---

## `GET /api/tickets/{id}/timeline`

Comments and history rows as one feed, ordered by timestamp **ascending** (BR-5.7).

### Query parameters

| Parameter | Type | Default | Rules |
|---|---|---|---|
| `page` | `int` | **the last page** | 1-based. Page 1 is the **oldest** entries. `page ≤ 0` is clamped to 1. `page` beyond `totalPages` returns `200` with an empty `items` array, never `404` (BR-7.6) |
| `pageSize` | `int` | `50` | Above 100 is clamped to 100 (BR-7.2). `50` rather than BR-7.2's 20 per AC-12 and spec assumption A-3; the clamp is unchanged |

**Omitting `page` returns the newest page, not the first one.** A client that sends
`page=1` because it looks like the sensible default gets the oldest fifty entries, which
on an active ticket looks like a timeline frozen weeks ago. The response always names the
page it actually served.

### `200 OK`

```json
{
  "items": [
    {
      "entryType": "History",
      "id": "1a2b3c4d-0000-4000-8000-000000000001",
      "occurredAtUtc": "2026-08-20T08:15:00.000Z",
      "actorUserId": "b7e4c210-3344-4a55-9b66-77c8d9e0f112",
      "actorName": "Layla Al-Harbi",
      "comment": null,
      "history": {
        "eventType": "StatusChanged",
        "oldValue": "New",
        "newValue": "Open",
        "note": null
      }
    },
    {
      "entryType": "Comment",
      "id": "3f2a1b40-9c8d-4e7f-8a1b-2c3d4e5f6071",
      "occurredAtUtc": "2026-08-20T08:16:42.500Z",
      "actorUserId": "b7e4c210-3344-4a55-9b66-77c8d9e0f112",
      "actorName": "Layla Al-Harbi",
      "comment": {
        "body": "Customer confirmed receipt.",
        "isInternal": false,
        "channel": "WhatsApp"
      },
      "history": null
    }
  ],
  "page": 3,
  "pageSize": 50,
  "totalCount": 137,
  "totalPages": 3
}
```

| Field | Type | Note |
|---|---|---|
| `entryType` | `"Comment" \| "History"` | The discriminator. Exactly one of `comment` and `history` is non-null, and which one is fully determined by this field |
| `id` | `Guid` | The comment id or the history row id. Unique **within its own kind**; use `` `${entryType}:${id}` `` as a render key rather than `id` alone |
| `occurredAtUtc` | `datetime` | `CreatedAtUtc` for a comment, `PerformedAtUtc` for a history row. Millisecond precision (`datetime2(3)`) |
| `actorUserId` | `Guid` | The author or the performer |
| `actorName` | `string` | Resolved in the same query (AC-14). **Live, not snapshotted** — a renamed user's past entries show the new name. That is correct for a product timeline and wrong for an audit log, which is why `AuditLog` snapshots instead (BR-9.6, ADR-008) |
| `comment.body` | `string` | Verbatim user content. Render as **text**, `dir="auto"` |
| `comment.isInternal` | `boolean` | Mark it. Do not hide it |
| `comment.channel` | `string?` | Enum value, untranslated |
| `history.eventType` | `string` | `Created`, `StatusChanged`, `Assigned`, `Unassigned`, `PriorityChanged`, `Escalated`. **Never `CommentAdded`** — see the behaviour table |
| `history.oldValue` / `newValue` | `string?` | Canonical enum values or a name, stored untranslated (BR-8.7). Translate the *sentence*, and the values through the enum-label catalogue |
| `history.note` | `string?` | User-entered text, e.g. the reason a ticket was closed. `dir="auto"` |

### Failures

| Code | `type` | When |
|---|---|---|
| `400` | `errors/validation` | `page` or `pageSize` not an integer. Out-of-range values are clamped, not rejected |
| `401` | `errors/unauthenticated` | Missing or invalid token |
| `404` | `errors/not-found` | No ticket with that id. Note the distinction from an empty page: an unknown ticket is `404`, a page past the end is `200` with `items: []` |

### What stays identical in every locale

`title`, `detail`, and the messages inside `errors` are translated (BR-8.6). These are
**not** (BR-8.7):

| Part | Reason |
|---|---|
| `type` | The identifier the client branches on |
| The **keys** of `errors` | They are request field names, part of this contract |
| `traceId` | An identifier |
| `entryType`, `eventType`, `channel` | Enum values. `StatusChanged` travels as `StatusChanged` in Arabic |
| `history.oldValue`, `history.newValue` | Canonical status, priority, and assignee values. A timeline written while the interface was English must render correctly in Arabic, and that is only possible if the stored value never carried a language |
| `comment.body`, `history.note` | User content. Stored and returned verbatim, never translated (BR-8.10) |

Send `Accept-Language: ar` to see the difference; `Content-Language` on the response
names the locale that was actually applied.

---

## Behaviour worth knowing before you build against it

| Situation | What happens | Why |
|---|---|---|
| A comment is added | Exactly **one** timeline entry appears — the comment | A `CommentAdded` history row **is** written (BR-5.5), and it is **excluded from this projection**. Projecting it would show every comment twice, the second copy with no body, which reads as data loss. Client-side de-duplication was rejected: it needs a stable link and breaks when two comments share a millisecond (`plan.md`, spec Q-1) |
| A comment is added to a ticket someone else is changing the status of | Both succeed | Adding a comment does not touch the `Tickets` row, so it does not move the ticket's `rowversion`. If it did, the two agents would collide on a `409 concurrency-conflict` neither of them caused, and it would look random. The cost: "last activity" on the ticket list is not comment-aware (`research.md` R-10) |
| `page` is omitted | The **newest** page is returned, and `page` in the envelope says which number that was | AC-12 and spec Q-2. The client never computes a page number |
| A new comment arrives between two `load older` calls | Older pages are unaffected | The feed is append-only and numbered from the oldest entry, so pages `1 … totalPages−1` are immutable once full and only the last page grows. Numbering from the newest end instead would shift every entry on each insert and "load older" would skip or repeat |
| `page=1` is reached | That is the end of the feed. There is nothing older | The client stops there. `page=0` clamps back to 1 and re-serves the same page, so a load-older loop that does not check will spin on the oldest page forever |
| A brand-new ticket | Exactly one entry: `Created` | Every ticket has at least that history row, so **the timeline is never empty**. If it comes back empty, the history branch of the union has broken — treat it as a fault, not as an empty state |
| A ticket with history and no comments | History only, and it is **not** an empty state | The comments *section* on the screen can be empty; the timeline cannot |
| The author has been deactivated | Their entries still appear, name resolved | The join is on id with **no `IsActive` predicate**. Copying that predicate from an assignee-picker query would make a departed colleague's history disappear from every ticket they touched |
| An internal comment is read by any support user | Returned in full, with `isInternal: true` | BR-5.4 and spec A-2: visible to all support users, marked distinctly. The flag exists so a future customer-facing view can exclude them **without a data migration**. The server does not filter, and that is the rule, not a gap |
| `body` contains `<script>` | Stored verbatim, returned verbatim | Storage is not the sanitisation point. The client renders it as **text** — never `dangerouslySetInnerHTML` — which is asserted by `TEST-013-11` |
| An unknown field is in the body | Ignored | Not an error; the DTO binds what it declares |
| The same comment is posted twice | Two comments | This endpoint is not idempotent and deduplicating would mean guessing intent (`05-api-conventions.md`). The client disables send while the request is in flight |
| Two entries share a millisecond | Deterministic order, identical on every request | Ordered by `(occurredAtUtc, entryType, id)`. Note that SQL Server does not order `uniqueidentifier` the way .NET's `Guid.CompareTo` does, so a client must not assume it can reproduce the order locally — and neither may a test |

## Verification

| What | How |
|---|---|
| Every status code above | `TEST-013-04`, `TEST-013-05`, `TEST-013-15` |
| The merged order, and the same-instant tie-break | `TEST-013-07`, `TEST-013-08` |
| A page spanning both sources loses and repeats nothing | `TEST-013-09` |
| The paging really happened in the database | `TEST-013-12` — the captured SQL is one statement with `UNION ALL` and `OFFSET … FETCH` |
| One comment produces one entry | `TEST-013-16` |
| No comment body in the audit row | `TEST-013-14` |
| A deactivated author still renders | `TEST-013-19` |
| An Arabic body survives `nvarchar` byte-identical | `TEST-013-18` |
| Arabic `type`, `errors` keys, and enum values byte-identical to English | Covered by `005-localization-core`, re-asserted here by `BE-013-12` |
| No edit or delete surface exists | `BE-013-09` — `PUT`/`PATCH`/`DELETE` return `405` |
| This contract matches what was built | `REV-013-03` — generated OpenAPI compared before the feature closes |
