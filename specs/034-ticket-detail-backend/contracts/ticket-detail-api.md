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

---

# Contract changes

**The frozen text above is NOT edited.** Appended, per the rule `error-contract.md` set when
`429` arrived after freezing.

## 2026-08-31 — the READ half. `034` shipped the writes and nothing to read them with

`034` built `PUT` and `DELETE /api/tickets/{id}/tags/{tagId}` and:

- **no endpoint returning the tag set a client attaches FROM**, although its own Q-3 ruled the
  tags are *"a managed set, seeded, with no admin UI this feature"* — which makes a read the
  only way a client can offer them; and
- **no `tags` on the ticket response**, so a UI could change tags it could not display.

**A UI could therefore write tags it could neither list nor show.** Found by building the
screen: the ticket read was measured on a running instance and `tags` was `undefined`.

This is the same shape as the defect that left `assigneeName` `null` on every list row for
three days — a write path proven and a read path nobody drove. `CLAUDE.md` records that
family: *an entity written only from outside the real path is an entity nothing has verified.*

### `GET /api/tags`

**NEW.** The heading above carries nothing after the closing backtick on purpose. The contract
scanner in `OpenApiContractTests` reads HEADINGS ONLY and matches a method and path between
backticks with nothing following them — so a heading that ended `— new` described the endpoint
to a human and was invisible to the gate, which stayed red until the words moved down here.

```http
GET {{baseUrl}}/api/tags
Authorization: Bearer <JWT>
```

```json
[
  { "id": "3f9a1b52-77c4-4c1e-9b2a-8d0e5c7a1234", "name": "استرداد" },
  { "id": "b7d2e4c1-90aa-4d2f-8c3b-1e5f7a9b2345", "name": "خصم مزدوج" }
]
```

| Part | Rules |
|---|---|
| Shape | A **bare array**, not the BR-7 envelope. Same reasoning `011` gave `GET /api/support-users`: the set is seeded and single-digit, and an envelope would promise paging that does not exist |
| `name` | Arabic user content. `nvarchar`, explicit CI collation — `034` §3.6. **Never localized:** it is a tag somebody typed, not a label this API authors (BR-8) |
| Filtering | Active only. `Tag.IsActive` exists and nothing can currently clear it, which is exactly when the filter is cheapest to add — adding it later silently changes results for anyone who built a habit on them (`008` Q-1's ruling, applied again) |
| Ordering | `Name` ascending under the **database** collation, which does not follow `Accept-Language`. A mixed Arabic and English set looks correctly ordered in one language and arbitrary in the other; a client needing locale-correct order sorts with `Intl.Collator`. Identical to `011`'s note on the picker, and it is the same trap |
| Auth | Any authenticated role. **No `403`** — Q-4 already opens *detaching* to the assignee and any Manager, so a role gate on merely READING the vocabulary would refuse the Agent who is allowed to attach |
| Paging | None. If tag management ever ships this becomes paged, and that is a **breaking change** recorded here rather than designed around |

**A separate controller, not `/api/tickets/{id}/tags`.** The vocabulary is not a sub-resource
of a ticket, and that path would read as *this ticket's tags* — which is the ticket response's
job, below.

### `tags` on the ticket response — added

`GET /api/tickets/{id}` and the `201` from `POST /api/tickets` both carry it, because they are
**one mapper** and the contract says a `GET` returns the same resource a create returned.

```json
"tags": [ { "id": "3f9a…", "name": "استرداد" } ]
```

| Part | Rules |
|---|---|
| Type | Always an array. **Never `null`** — an empty ticket has `[]`, so no consumer writes `tags ?? []` |
| At creation | `[]`. A ticket is never tagged at creation, which is `009` AC-2's sibling |
| Ordering | By `name`, in the query — so a client renders a stable order without sorting, and does not sort by the database collation's idea of Arabic |
| Reused, not re-queried | `TicketTagReader` already joins in the projection for the attach/detach responses. One query, one ordering; a second copy would be a second thing to keep in step, and `010` AC-12's counter is what would eventually notice |

**It is not on the LIST row.** `GET /api/tickets` returns up to 100 rows and a tag set per row
is a join per page for something the row does not draw. If the list ever tints tags, that is a
contract change of its own.

### Why this is an amendment and not a new feature

`034`'s scope was *tags and canned replies on the ticket detail screen*, and a write half that
cannot be read is not that scope delivered — it is half of it. The endpoint and the field are
`034`'s own criteria completed, recorded here so the frozen text stays the record of what was
agreed and this stays the record of what changed.

`002c`'s `OpenApiContractTests` is what forced this to be written down: `GET /api/tags` was
built, the two-way comparison found it in **no** frozen contract, and there is deliberately no
exception list for that direction.
