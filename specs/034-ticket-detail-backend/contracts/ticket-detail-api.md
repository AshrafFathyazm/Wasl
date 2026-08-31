# `034` — Ticket detail · FROZEN API contract

Frozen 2026-08-31. Both lanes read this. A difference between this file and the generated
OpenAPI document is a defect in one of the two and is never fixed silently.

Base `/api`, `application/json`, UTC ISO-8601 with `Z`, ids are `Guid` strings, enums as
strings. Every non-2xx is RFC 7807 `ProblemDetails` with a `traceId`.

---

## Contract changes this feature makes to already-frozen endpoints

Recorded here, at the head, rather than edited into the older files as if they had always
said this.

| Endpoint | Change | Owner |
|---|---|---|
| `POST /api/tickets/{id}/comments` | Accepts `authorCustomerId`. Response gains `authorKind` and `recordedBy` | `013` |
| `GET /api/tickets/{id}/timeline` | Accepts `?type=`. Response gains `commentCount`, `historyCount`; entries gain `authorKind`, `recordedBy` | `013` |
| `GET /api/tickets` | Accepts `?customerId=` | `010` |
| `GET /api/tickets/{id}` | Response gains `closedAtUtc`; `customer` gains `companyName` | `009` |

**The timeline split reverses half of `013`'s ruling.** `013` merged comments and history
into one feed deliberately and `CLAUDE.md` records it. The v3 detail design puts them in two
tabs; the product owner ruled for the split on 2026-08-31. **The cursor does not change** —
each tab is still a feed that grows at the end the reader is looking at, so neither gets a page
number.

---

## `POST /api/tickets/{id}/comments`

Adds a comment, or records a reply that came **from the customer**.

```jsonc
{
  "body": "I called again to ask for written confirmation.",
  "isInternal": false,
  "channel": "Email",
  "authorCustomerId": "0198f2c1-..."   // optional — see below
}
```

`authorCustomerId` is what makes this a customer's reply rather than an agent's note.
**The customer never signs in** — there is no customer authentication in this product — so
their message arrives through a channel and a support user records it. Both people end up on
the row.

`201`, `Location: /api/tickets/{id}/timeline`:

```jsonc
{
  "id": "...", "ticketId": "...", "ticketNumber": "TCK-2026-000042",
  "body": "...",
  "isInternal": false,
  "channel": "Email",
  "authorKind": "Customer",                      // "Agent" | "Customer"
  "author":     { "id": "…", "fullName": "منيرة الدوسري", "role": null },
  "recordedBy": { "id": "…", "fullName": "عمر خالد", "role": "Agent" },
  "createdAtUtc": "2026-08-31T09:12:44.318Z"
}
```

- `author` is who the comment is **from**. `recordedBy` is the support user who typed it, and
  is **`null` on an agent's own note** — there the two are the same person.
- `author.role` is **`null` for a customer**. `role` carries `SupportUserRole` values (`Agent`,
  `Manager`); a third differently-sourced value in the same field is how a client ends up
  switching on a string that means two things. **Read `authorKind`, never infer from `role`.**

### Refusals

| Case | Status | Body |
|---|---|---|
| Customer reply marked internal | `400` | `errors.isInternal` |
| Customer reply with no `channel` | `400` | `errors.channel` |
| `authorCustomerId` is not this ticket's customer | `400` | `errors.authorCustomerId`. **Names neither customer** — echoing the real one back turns a wrong request into a lookup |
| Ticket is `Closed` | `409` | `errors/ticket-closed`. **Answered before the customer check**, because it is the one that says no retry can succeed |
| Ticket not found | `404` | `errors/not-found` |

---

## `GET /api/tickets/{id}/timeline`

`?before=<cursor>&limit=<n>&type=Comments|History`

Omitting `type` returns the union, unchanged from `013`.

```jsonc
{
  "items": [ /* … */ ],
  "hasMore": true,
  "nextCursor": "…",
  "commentCount": 12,
  "historyCount": 88
}
```

- **Both counts are reported whichever `type` was asked for** — the tab the reader is not on
  still shows its number, and fetching it would otherwise cost a second request.
- The counts are **totals for the ticket**, never the number on this page.
- A comment entry carries `authorKind` and, for a customer's reply, `recordedBy`. `actor` is
  who it is from.

---

## `GET /api/tickets`

`?customerId={guid}` — new in `034`.

The existing paged envelope, filtered. `page` and `pageSize` clamp per BR-7.2 exactly as
before, and `totalCount` counts **the filtered set** — not every ticket in the product.

---

## `GET /api/tickets/{id}`

Adds two fields to the existing shape:

```jsonc
{
  "closedAtUtc": null,                      // present and null while open, never omitted
  "customer": {
    "id": "…", "fullName": "منيرة الدوسري",
    "email": "…",
    "companyName": "مؤسسة الرياض للتجارة"   // null when the customer has none
  }
}
```

`closedAtUtc` is **always present**. An omitted key deserialises to `undefined`, which renders
empty and passes every shape assertion — the failure `027` recorded for a missing assignee.

---

## `PUT /api/tickets/{id}/tags/{tagId}`

Attaches a tag. Returns the ticket's **whole tag set** after the change.

```jsonc
{
  "ticketId": "…",
  "ticketNumber": "TCK-2026-000042",
  "tags": [ { "id": "…", "name": "خصم مزدوج" }, { "id": "…", "name": "استرداد" } ]
}
```

**No `expectedVersion`.** Tags are not part of the ticket's `rowversion` — attaching one does
not touch `dbo.Tickets` — so there is nothing to be stale against. A unique index on
`(TicketId, TagId)` is what makes a double-click safe.

| Case | Status |
|---|---|
| Applied | `200` with the whole set |
| Tag unknown or retired | `400`, `errors.tagId`. The two are **not** distinguished — a caller must not be able to enumerate which ids ever existed |
| Ticket already carries it | `409 errors/tag-unchanged` |
| Ticket not found | `404` |

## `DELETE /api/tickets/{id}/tags/{tagId}`

Detaches. Same `200` body. `409 errors/tag-unchanged` when the ticket does not carry it.

**A retired tag can still be detached** — otherwise a ticket keeps a label nobody can remove.

---

## `GET /api/canned-replies`

`?category={TicketCategory}` — optional.

```jsonc
[ { "id": "…", "title": "موعد الاسترداد", "body": "سيُعاد المبلغ…", "category": "Billing" } ]
```

- `category` is optional. With one, the response is that category's templates **plus every
  uncategorised template** — a `null` category means *offered on every ticket*, so filtering on
  equality alone would drop exactly the ones meant to appear everywhere.
- Without one, every active template. That is a management view, not a ticket's menu.
- Read-only. There is no write endpoint: the set is seeded and there is no admin screen
  (`034` Q-3), and that limitation is stated rather than left to be discovered.
