# Contract — Audit log (read)

**Feature:** `019-audit-log-access` · **Story:** US-015 · **Status:** FROZEN 2026-08-23
· **Lanes:** backend implements · frontend consumes

The agreement. The backend implements exactly this; the frontend may start against it
immediately. Any change goes through **Contract changes** in [`plan.md`](../plan.md)
first — see `docs/sdd/openapi/README.md`.

One endpoint, read-only. There is deliberately no `POST`, `PUT`, `PATCH` or `DELETE` on
this resource, and there never will be (BR-9.5, AC-9).

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` on every call
- **Role:** `Manager` only (BR-6, BR-9.11). An `Agent` gets `403`, **and the denial is
  itself an audit row** (BR-9.2)
- **Content-Type:** `application/json`
- Timestamps are UTC, ISO 8601, `Z` suffix. Formatting for display is the client's job,
  in the client's locale
- Enums are strings on the wire. `Guid`s are strings
- Errors are RFC 7807 `ProblemDetails`. **`200` is never returned with an error in the
  body** (`docs/sdd/05-api-conventions.md`)
- **Every data field in the success body is English in every locale** (BR-9.10). Only
  `ProblemDetails` sentences are translated

### Two deliberate deviations from `05-api-conventions.md`

Named here because a reviewer will otherwise read them as mistakes.

| Convention | What this endpoint does instead | Why |
|---|---|---|
| Pagination is `page` / `pageSize` with `totalCount` and `totalPages` | **Cursor** on `id`, with `nextCursor` and `hasMore`. No `totalCount`, no `totalPages`, no `page` | AC-12. Offset paging over a table that is appended to constantly skips and repeats rows: new entries arrive at the top, everything shifts down, and page 2 re-serves what page 1 already showed. `bigint IDENTITY` exists in ADR-008 for exactly this |
| `totalCount` is included because the UI shows a count | Omitted | A count over an append-only table is a full scan whose answer is stale before it renders. The UI shows "showing *n*" and a next-page control instead — see `frontend-spec.md` |

`pageSize` still follows BR-7.2: default 20, clamped to 100, never rejected.

---

## `GET /api/audit`

Returns audit rows newest-first, filtered, cursor-paginated. `Manager` only.

### Query parameters

All optional. All combined with **AND** (AC-2). A repeated parameter is OR'd within
itself (BR-7.4).

| Parameter | Type | Default | Rules |
|---|---|---|---|
| `entityType` | `string` | — | One of `Ticket`, `Customer`, `SupportUser`, `AuditLog`. Anything else is `400` (AC-16) |
| `entityId` | `Guid` | — | **Requires `entityType`.** Alone it is `400` — see the behaviour table for why |
| `actorUserId` | `Guid` | — | The snapshotted actor id. No join, so an id that no longer exists in `SupportUsers` is valid and may return rows (BR-9.12) |
| `action` | `string(1..80)` | — | **Prefix match** (AC-3). `Auth.` returns every `Auth.*` row; `Customer.Created` matches only itself. `%`, `_`, `[` are literal text, not wildcards |
| `outcome` | `string`, repeatable | — | `Success`, `Denied`, `Failed`. Repeat to OR: `?outcome=Denied&outcome=Failed` (AC-4) |
| `from` | ISO 8601 UTC | — | Inclusive lower bound on `occurredAtUtc` |
| `to` | ISO 8601 UTC | — | Inclusive upper bound. `from` later than `to` is `400` naming both fields |
| `cursor` | `string` | — | The `id` of the last row of the previous page, as a decimal string. Rows **strictly older** than it are returned. A non-numeric value is `400` |
| `pageSize` | `int` | `20` | Clamped to `100`; `0` or negative falls back to `20` (BR-7.2, AC-15) |

```http
GET {{baseUrl}}/api/audit?entityType=Customer&entityId=8f1c2d34-5678-4abc-9def-0123456789ab&outcome=Denied&outcome=Failed&from=2026-08-01T00:00:00Z&pageSize=50
Authorization: Bearer <JWT>
Accept-Language: ar
```

### `200 OK`

```json
{
  "items": [
    {
      "id": "104862",
      "occurredAtUtc": "2026-08-23T09:14:02.317Z",
      "actorUserId": "3f2b19c4-0a77-4f61-9a2e-b1c0d5e6f701",
      "actorEmail": "sara.alharbi@example.com",
      "actorRole": "Agent",
      "action": "Customer.Updated",
      "entityType": "Customer",
      "entityId": "8f1c2d34-5678-4abc-9def-0123456789ab",
      "entityLabel": "علي الأحمد",
      "outcome": "Success",
      "changes": { "Phone": { "from": "+966501234567", "to": "+966505550000" } },
      "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01",
      "ipAddress": "203.0.113.7",
      "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) …"
    },
    {
      "id": "104861",
      "occurredAtUtc": "2026-08-23T09:11:48.004Z",
      "actorUserId": null,
      "actorEmail": "unknown@example.com",
      "actorRole": null,
      "action": "Auth.LoginFailed",
      "entityType": null,
      "entityId": null,
      "entityLabel": null,
      "outcome": "Failed",
      "changes": null,
      "traceId": "00-11aa22bb33cc44dd-5566778899aabbcc-01",
      "ipAddress": "203.0.113.9",
      "userAgent": "curl/8.6.0"
    }
  ],
  "pageSize": 50,
  "nextCursor": "104861",
  "hasMore": true
}
```

| Field | Type | Notes |
|---|---|---|
| `items` | array | Newest first. Empty array on no match — `200`, never `404` (AC-11, BR-7.6) |
| `items[].id` | `string` | **A decimal string, not a JSON number.** The column is `bigint`; a value above 2^53 loses precision silently in JavaScript, and a cursor built from a rounded id points at the wrong row. Sent as a string so that cannot happen |
| `items[].occurredAtUtc` | `string` | UTC, millisecond precision (`datetime2(3)`) |
| `items[].actorUserId` | `string?` | Null for anonymous events such as a failed sign-in |
| `items[].actorEmail` | `string?` | **Snapshot** at write time |
| `items[].actorRole` | `string?` | **Snapshot** — the role held *then*, not now (BR-9.6, AC-8) |
| `items[].action` | `string` | `Entity.Verb`. Never translated (BR-8.7) |
| `items[].entityType` | `string?` | Null for auth events |
| `items[].entityId` | `string?` | No foreign key. May reference a deleted row (BR-9.12, AC-7) |
| `items[].entityLabel` | `string?` | Snapshotted readable handle — `TCK-2026-000042`, a customer name. May be Arabic; render with `dir="auto"` |
| `items[].outcome` | `string` | `Success` \| `Denied` \| `Failed`. Never translated |
| `items[].changes` | `object?` | The stored JSON, parsed. Shape as written by `003-audit-trail`: `{ "Field": { "from": …, "to": … } }`. Null where there is no diff. **Passed through unvalidated** — see the behaviour table |
| `items[].traceId` | `string` | Matches the `traceId` in the `ProblemDetails` the request produced and the correlation id in the request log (BR-9.9, AC-10) |
| `items[].ipAddress` | `string?` | Text form, IPv4 or IPv6 |
| `items[].userAgent` | `string?` | Verbatim, up to 400 characters |
| `pageSize` | `int` | The value **actually applied** after clamping — not what was asked for (AC-15) |
| `nextCursor` | `string?` | Pass as `cursor` for the next page. `null` when `hasMore` is `false` |
| `hasMore` | `bool` | `true` when a further page exists. Determined by reading `pageSize + 1` rows and returning `pageSize` — one row, not a second `COUNT` query |

**`changes` may contain personal data** — customer emails and phone numbers appear in
diffs. That is why the endpoint is `Manager`-only, and it is the reason Q-9 (retention)
is open rather than assumed.

### Failures

| Code | `type` | When |
|---|---|---|
| `400` | `errors/validation` | Unknown `entityType` or `outcome`; unparseable `from`/`to`; `from` later than `to`; `entityId` without `entityType`; non-numeric `cursor`; `action` over 80 characters |
| `401` | `errors/unauthenticated` | Missing or invalid token (AC-18). Checked **before** the role, so an anonymous caller never produces `Auth.Forbidden` |
| `403` | `errors/forbidden` | The caller is an `Agent` (BR-9.11, AC-5). **Writes an `Auth.Forbidden` audit row** (AC-13) |
| `500` | `errors/unexpected` | Unhandled fault. Body carries `traceId` and nothing else |

`405 Method Not Allowed` is returned by routing for any other verb, because no handler is
mapped (AC-9). It is not a designed response; it is the absence of one.

#### `400` — validation

```json
{
  "type": "https://wasl.local/errors/validation",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "detail": "See the errors property for field-level messages.",
  "instance": "/api/audit",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01",
  "errors": {
    "from": ["'from' must be earlier than or equal to 'to'."],
    "to": ["'from' must be earlier than or equal to 'to'."]
  }
}
```

An inverted range names **both** fields, because either one could be the mistake.

#### `403` — forbidden

```json
{
  "type": "https://wasl.local/errors/forbidden",
  "title": "You do not have permission to perform this action.",
  "status": 403,
  "instance": "/api/audit",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01"
}
```

The `403` body carries no hint about what a Manager would have seen, and no `errors`
dictionary. The `type` is owned by `004-auth-and-roles`; this contract cites it rather
than defining it.

### What stays identical in every locale

| Part | Localized? | Reason |
|---|---|---|
| `ProblemDetails.title`, `.detail`, `errors[*]` messages | **Yes** (BR-8.6) | Human sentences |
| `ProblemDetails.type`, keys of `errors`, `traceId` | No | Machine-readable (BR-8.7) |
| **Every field of the `200` body** — `action`, `outcome`, `entityType`, `entityLabel`, `changes` | **No** (BR-9.10, BR-8.9) | Audit content is always English. `Action` and `Outcome` are identifiers; `entityLabel` and `changes` are stored user data, reproduced verbatim |

`Content-Language` still names the locale that was applied, so a client can tell that its
`ar` request was honoured even though the rows came back in English. A screen that shows
Arabic chrome around English audit values is correct, not a defect — see `AC-17`.

---

## Behaviour worth knowing before you build against it

| Situation | What happens | Why |
|---|---|---|
| A successful read | **Writes an `Audit.Read` row** (AC-6) | BR-9.11. This endpoint writes to the table it reads |
| That row in the same response | **Never present.** It is written after the page is materialised (AC-14) | Write it first and every response contains its own audit row; a client that refetches then sees a list that grows by one per refetch, forever, and it looks like real activity |
| The next read | Contains the previous read's `Audit.Read` row | The test that proves reading the log appears in the log |
| Refetching on window focus, or polling | **Do not.** Each refetch appends a row | Read volume is write volume here. `frontend-spec.md` makes this a rule, with an explicit Refresh control instead |
| An `Agent` calls it | `403`, **and an `Auth.Forbidden` row is written outside any transaction** (AC-13) | BR-9.2 plus BR-9.4: there is no business transaction to join. Denying access without recording the attempt loses the signal an auditor came for |
| An unauthenticated call | `401`, and `Auth.Unauthenticated` — not `Auth.Forbidden` | The two are different events; conflating them makes `WHERE action = 'Auth.Forbidden'` mean "or maybe the token expired" |
| `entityId` sent without `entityType` | `400` | `IX_AuditLog_Entity` is keyed `(EntityType, EntityId, OccurredAtUtc DESC)`. Without the leading column the filter cannot seek and scans the whole table. Requiring the type costs the caller nothing — they always know it |
| `action=Auth.` | Prefix match, no index | No index on `Action`, deliberately (no speculative indexes). It is a residual predicate on a backwards clustered scan; correct at demo volume, and `data-model.md` names the volume at which it stops being |
| `action=%` | Returns rows whose action literally starts with `%` — i.e. none | `LIKE` metacharacters are escaped with an explicit `ESCAPE` clause. Without it, `%` returns the entire table and looks like a filter that "didn't apply" |
| `outcome=Denied&outcome=Failed` | Served by `IX_AuditLog_NotSuccess` | The handler adds a redundant `Outcome <> 'Success'` predicate whenever the requested set excludes `Success`, which is what makes the filtered index eligible. `research.md` R-3 has the detail, and the verification is an **execution plan**, not a row count |
| `outcome=Success&outcome=Denied` | Correct rows, no filtered index | The redundant predicate would exclude rows the caller asked for, so it is not added. A scan here is right, not a regression |
| The actor was promoted since | `actorRole` shows the role held **then** (AC-8) | Snapshot, not join. A join would make every past action of a promoted agent look like a manager's, inverting the answer to every authorization question |
| The entity was deleted since | The row still returns, with its snapshotted `entityLabel` (AC-7) | `AuditLog` has no foreign keys, deliberately (ADR-008) |
| `changes` is not the `{field:{from,to}}` shape | Returned as-is | The endpoint passes the column through; `ISJSON` guarantees it is valid JSON and nothing more. The client renders an unrecognised shape as raw text rather than failing the page |
| `changes` is `null` | Normal | `Auth.LoginFailed` and `Audit.Read` have no before/after |
| A cursor from a different filter set | Accepted | The cursor is only an `id` boundary. It does not encode the filter, so it stays meaningful when the filter changes |
| A cursor past the newest row | `200`, empty array | BR-7.6 |
| Two rows in the same millisecond | Ordered by `id`, deterministically | `ORDER BY Id DESC` is newest-first **and** stable; `ORDER BY OccurredAtUtc DESC` alone is not, and an unstable sort under cursor pagination drops or duplicates rows at the page boundary |
| A page read twice with the same cursor | Identical rows | The table is append-only and rows below a cursor never change. This is the property offset paging does not have |
| Any write verb | `405` | No handler mapped (AC-9). Even so, `DENY UPDATE, DELETE` on the table is the actual guarantee (BR-9.5) |

## Verification

| What | How |
|---|---|
| `200`, ordering, envelope shape | `TEST-019-01` |
| Every filter, and their AND combination | `TEST-019-02` |
| `action` prefix match, and `%` treated literally | `TEST-019-03` |
| `outcome` filter uses `IX_AuditLog_NotSuccess` | `TEST-019-04` — **asserts the execution plan**, not only the rows |
| `403` for an Agent, plus the `Auth.Forbidden` row | `TEST-019-05` |
| `Audit.Read` written on success, and absent from its own response | `TEST-019-06` |
| Reading the log appears in the log | `TEST-019-07` |
| Snapshotted actor survives a role change | `TEST-019-08` |
| Row for a deleted entity still returns | `TEST-019-09` |
| `traceId` from a `ProblemDetails` finds its row | `TEST-019-10` |
| Cursor stability across an insert between pages | `TEST-019-11` |
| `pageSize` clamp and default | `TEST-019-12` |
| Every `400` variant | `TEST-019-13` |
| `401` before the role check, and no `Auth.Forbidden` row for it | `TEST-019-14` |
| Every data field English under `Accept-Language: ar` | `TEST-019-15` |
| `405` on every write verb | `TEST-019-16` |
| This contract matches what was built | `REV-019-03` — generated OpenAPI compared before the feature closes |
