# Contract — Dashboard

**Feature:** `020-dashboard` · **Story:** US-016 · **Status:** FROZEN 2026-08-23 ·
**Lanes:** backend implements · frontend consumes

The agreement. The backend implements exactly this; the frontend may start against it
immediately. Any change goes through **Contract changes** in [`plan.md`](../plan.md)
first — see `docs/sdd/openapi/README.md`.

## Conventions

- **Base:** `{{baseUrl}}/api` · **Auth:** `Authorization: Bearer <JWT>` · required
- **Method:** `GET`. Read-only. No request body. Not cacheable — see **Freshness** below
- Timestamps ending `Utc` are UTC, ISO 8601, `Z` suffix. Formatting for display is the
  client's job, in the client's locale
- `localDate` fields are **bare calendar dates** — `"2026-08-10"` — and carry no time and
  no offset. See **The one field most likely to be mishandled**
- Enums are strings and are never localized: `Status`, `Priority`, `Channel`, `scope`
  (BR-8.7)
- Errors are RFC 7807 `ProblemDetails`. **`200` is never returned with an error in the
  body** (`docs/sdd/05-api-conventions.md`)

---

## `GET /api/dashboard`

Returns every block of the dashboard in one response (AC-1). One request, one
authorization check, one query batch — so the numbers cannot disagree with each other by
having been taken a second apart.

### Query parameters

| Name | Type | Required | Rules |
|---|---|---|---|
| `range` | `"7d" \| "14d" \| "30d"` | no | Defaults to `14d`. Any other value is `400` naming the three accepted values (AC-15). Sending it **twice** is `400`, not first-wins |

`range` is inclusive of today in the organisation's timezone: `7d` is today and the six
local days before it. The response echoes `range`, `fromLocalDate`, and `toLocalDate`, so
no client ever has to reproduce that arithmetic.

### Role and scope — the contract's most important row

There is one endpoint. The role on the token selects the scope, and the scope is applied
**inside every query predicate** (AC-3):

| `scope` | Role | Predicate applied to Tickets |
|---|---|---|
| `"Mine"` | `Agent` | `AssignedToUserId = <caller>` |
| `"Team"` | `Manager` | none |

Two deliberate exceptions, both stated because they look like bugs otherwise:

| Field | Behaviour | Why |
|---|---|---|
| `attention.unassignedCount` | **Global for both scopes** — never filtered by assignee | An unassigned ticket has no owner, so there is no "mine" version of it. Scoping it would show every Agent `0` forever and break the most actionable number on the screen (`spec.md` A-3) |
| `needsAttention[]` | `Mine`: assigned to the caller **or** unassigned. `Team`: all | Matches `11-dashboard.md`: an Agent's attention list is *"mine and unassigned"* |

`teamLoad` is present only for `scope: "Team"`. For an Agent the property is **absent from
the JSON document** — not `null`, not `[]` (AC-4, AC-18). The query that produces it is not
executed at all (AC-17).

### `200 OK` — Manager

```json
{
  "range": "14d",
  "scope": "Team",
  "timeZoneId": "Asia/Riyadh",
  "fromLocalDate": "2026-08-10",
  "toLocalDate": "2026-08-23",
  "generatedAtUtc": "2026-08-23T09:14:02Z",

  "attention": {
    "unassignedCount": 12,
    "escalatedOpenCount": 3,
    "waitingOnCustomerCount": 21,
    "assignedToMeCount": 4,
    "oldestUntouched": {
      "ticketId": "8f1c2d34-5678-4abc-9def-0123456789ab",
      "ticketNumber": "TCK-2026-000042",
      "subject": "لا يمكنني تسجيل الدخول",
      "createdAtUtc": "2026-08-19T06:11:00Z",
      "ageHours": 99
    },
    "myOldest": null
  },

  "dailySeries": [
    { "localDate": "2026-08-10", "created": 4, "resolved": 2 },
    { "localDate": "2026-08-11", "created": 0, "resolved": 0 }
  ],

  "openByStatus": [
    { "status": "New",             "count": 5 },
    { "status": "Open",            "count": 9 },
    { "status": "InProgress",      "count": 7 },
    { "status": "PendingCustomer", "count": 21 },
    { "status": "Resolved",        "count": 3 }
  ],

  "medians": {
    "firstReplyMinutes": 42,
    "firstReplySampleSize": 18,
    "resolutionMinutes": 1380,
    "resolutionSampleSize": 11
  },

  "channelMix": [
    { "channel": "Email",    "count": 30 },
    { "channel": "WhatsApp", "count": 12 },
    { "channel": "LiveChat", "count": 4 },
    { "channel": "Sms",      "count": 0 },
    { "channel": "WebForm",  "count": 2 }
  ],

  "needsAttention": [
    {
      "ticketId": "8f1c2d34-5678-4abc-9def-0123456789ab",
      "ticketNumber": "TCK-2026-000042",
      "subject": "لا يمكنني تسجيل الدخول",
      "customerName": "علي الأحمد",
      "status": "New",
      "priority": "High",
      "isEscalated": false,
      "isUnassigned": true,
      "createdAtUtc": "2026-08-19T06:11:00Z",
      "ageHours": 99
    }
  ],

  "teamLoad": [
    { "userId": "1a2b3c4d-0000-4000-8000-000000000001", "fullName": "Sara Khalid", "isActive": true,  "assignedOpenCount": 9 },
    { "userId": "1a2b3c4d-0000-4000-8000-000000000002", "fullName": "Omar Nasser", "isActive": true,  "assignedOpenCount": 0 },
    { "userId": "1a2b3c4d-0000-4000-8000-000000000003", "fullName": "Layla Fahd",  "isActive": false, "assignedOpenCount": 2 }
  ]
}
```

### `200 OK` — Agent

Identical shape with `scope: "Mine"`, every count already scoped, and **no `teamLoad`
property at all**:

```json
{
  "range": "14d",
  "scope": "Mine",
  "timeZoneId": "Asia/Riyadh",
  "fromLocalDate": "2026-08-10",
  "toLocalDate": "2026-08-23",
  "generatedAtUtc": "2026-08-23T09:14:02Z",
  "attention": {
    "unassignedCount": 12,
    "escalatedOpenCount": 0,
    "waitingOnCustomerCount": 2,
    "assignedToMeCount": 7,
    "oldestUntouched": null,
    "myOldest": {
      "ticketId": "…", "ticketNumber": "TCK-2026-000107",
      "subject": "Refund not received", "createdAtUtc": "2026-08-21T05:00:00Z", "ageHours": 52
    }
  },
  "dailySeries": [],
  "openByStatus": [],
  "medians": { "firstReplyMinutes": null, "firstReplySampleSize": 0, "resolutionMinutes": null, "resolutionSampleSize": 0 },
  "channelMix": [],
  "needsAttention": []
}
```

`unassignedCount: 12` on an Agent's response is correct and is the exception documented
above. `escalatedOpenCount: 0` is the Agent's own escalated tickets, not the team's.

### Field reference

#### Envelope

| Field | Type | Notes |
|---|---|---|
| `range` | `string` | Echoed, never inferred by the client (AC-15) |
| `scope` | `"Mine" \| "Team"` | Enum value. **Not localized.** The client renders "My view" / "Manager view" from its own catalogue |
| `timeZoneId` | `string` | IANA id. Rendered in the header, so the buckets are never ambiguous (AC-6) |
| `fromLocalDate`, `toLocalDate` | `date` | Bare calendar dates in `timeZoneId`. Inclusive both ends |
| `generatedAtUtc` | `datetime` | When the server produced this. The client renders "updated a minute ago" from it |

#### `attention`

Every count is an `int`, already scoped, and never `null`.

| Field | Definition |
|---|---|
| `unassignedCount` | Tickets with `AssignedToUserId IS NULL` and `Status <> 'Closed'`. **Global in both scopes** |
| `escalatedOpenCount` | `IsEscalated = 1` and `Status NOT IN ('Resolved','Closed')` (BR-3.3 makes those two the non-actionable ones) |
| `waitingOnCustomerCount` | `Status = 'PendingCustomer'`. Shown so it can be *excluded* from judgement — that clock is not ours (BR-1.4) |
| `assignedToMeCount` | `AssignedToUserId = <caller>` and `Status <> 'Closed'`. Present in both scopes; a Manager's own assigned count is harmless and keeps one shape |
| `oldestUntouched` | Oldest ticket with **no assignee and no comment**, `Status <> 'Closed'`. `null` when none exists |
| `myOldest` | Oldest ticket assigned to the caller, `Status <> 'Closed'`. `null` when none exists |

`oldestUntouched` and `myOldest` share one shape:

| Field | Type | Notes |
|---|---|---|
| `ticketId` | `guid` | |
| `ticketNumber` | `string(20)` | Latin digits in every locale (BR-8.13) |
| `subject` | `string(200)` | User content. Rendered with `dir="auto"` (AC-14) |
| `createdAtUtc` | `datetime` | |
| `ageHours` | `int` | Whole hours, computed server-side from the injected `TimeProvider`, so client-clock skew cannot change the number the screen shows |

#### `dailySeries`

One entry per local day in the range — **always**, including days with no tickets (AC-5).
Length is exactly 7, 14, or 30. Ordered ascending by `localDate`.

| Field | Type | Notes |
|---|---|---|
| `localDate` | `date` | `"2026-08-10"`. See the warning below |
| `created` | `int` | Tickets whose `CreatedAtUtc` falls inside that **local** day (AC-6) |
| `resolved` | `int` | Tickets whose **first** entry into `Resolved` falls inside that local day — from `TicketHistory`, never from `ClosedAtUtc` (AC-19) |

**`resolved` is not "closed".** A ticket resolved on Monday and closed on Thursday counts on
Monday. A ticket resolved, reopened (BR-1.6), and resolved again counts **once**, on its
first resolution day.

#### `openByStatus`

Every `TicketStatus` except `Closed`, including `Resolved`. A status with no tickets is
returned with `count: 0` — the client never has to know the enum's full membership to draw
an axis. Ordered by the state machine's natural order (`New`, `Open`, `InProgress`,
`PendingCustomer`, `Resolved`), not by count, so the bars do not reorder between refreshes.

#### `medians`

| Field | Type | Notes |
|---|---|---|
| `firstReplyMinutes` | `int?` | Median minutes from `CreatedAtUtc` to the ticket's **first** comment, over tickets created in the range that have at least one comment |
| `firstReplySampleSize` | `int` | How many tickets contributed |
| `resolutionMinutes` | `int?` | Median minutes from `CreatedAtUtc` to the **first** entry into `Resolved`, over tickets created in the range that reached it |
| `resolutionSampleSize` | `int` | |

**`null` is not `0`.** No data is not zero minutes, and a dashboard that renders `0 min to
first reply` for an empty system is stating something false. `sampleSize: 0` is what the
client branches on.

**Median, never mean** (AC-7, `PERCENTILE_CONT`). One ticket left open over a holiday moves
a mean by hours and a median by minutes; support-time distributions have long tails by
nature, so the mean describes the tail and the median describes the day.

#### `channelMix`

One entry per `CommunicationChannel`, always all five, `count: 0` included. Over tickets
**created in the range**, scoped. Ordered by the enum's declaration order so the bars are
stable across refreshes.

#### `needsAttention`

At most **10** entries, ordered `CreatedAtUtc` ascending — oldest first. Not paginated:
this is a top-ten prompt, and "see all" is a link into the ticket list (`010`, and its
filters in `015`). An empty list is `[]` with `200`, never `404` (BR-7.6).

Membership: `Status <> 'Closed'` **and** (`AssignedToUserId IS NULL` **or**
`IsEscalated = 1`).

| Field | Type | Notes |
|---|---|---|
| `ticketId`, `ticketNumber`, `subject`, `createdAtUtc`, `ageHours` | | As in `attention` |
| `customerName` | `string(200)` | Projected in the **same** query. There is no per-row lookup — that is what AC-17's command count protects |
| `status` | enum string | |
| `priority` | enum string | |
| `isEscalated` | `bool` | |
| `isUnassigned` | `bool` | Which of the two membership reasons applies. Both can be true |

#### `teamLoad` — `scope: "Team"` only

One entry per `SupportUser`, from a `LEFT JOIN`, so an active agent with nothing assigned
appears with `assignedOpenCount: 0`. Ordered by `assignedOpenCount` descending, then
`fullName` ascending, so the order is deterministic.

| Field | Type | Notes |
|---|---|---|
| `userId` | `guid` | |
| `fullName` | `string(200)` | `dir="auto"` when rendered |
| `isActive` | `bool` | An inactive user still appears **while holding open tickets** — dropping them hides work that exists |
| `assignedOpenCount` | `int` | `Status <> 'Closed'` |

**This is not a leaderboard.** It is assigned-and-open per agent, which prompts
redistribution. US-016 excludes a ranking by tickets closed deliberately: the fastest way
up such a board is closing things that should have stayed open.

### The one field most likely to be mishandled

`localDate`, `fromLocalDate`, and `toLocalDate` are **calendar dates, not instants**.

```text
"2026-08-10"                     ← what this contract returns
"2026-08-10T00:00:00Z"           ← what it must never return  (AC-16)
```

A client west of the organisation's timezone that puts `2026-08-10T00:00:00Z` through
`new Date(...)` renders **9 August**, and the whole chart shifts by one column. Nothing
throws, no test fails, and the shape still looks like a plausible week. AC-16 asserts the
string shape on the server side for exactly this reason, and
[`FRONTEND-API-GUIDE.md`](../FRONTEND-API-GUIDE.md) states the client-side rule that
matches it.

### Freshness

No caching, by decision (`11-dashboard.md`, and [`research.md`](../research.md) R-10). The
response carries `Cache-Control: no-store`. Two calls a second apart with a ticket created
between them return different numbers, and AC-22 asserts it — so a later "optimisation"
fails a test rather than silently changing what the screen means.

The revisit threshold is ~300ms at realistic volume, measured, and it costs an ADR.

### Failures

| Code | `type` | When |
|---|---|---|
| `400` | `errors/validation` | `range` is not one of `7d`, `14d`, `30d`; or `range` was sent more than once |
| `401` | `errors/unauthenticated` | Missing, expired, or invalid token |
| `403` | `errors/forbidden` | Authenticated but the token carries neither `Agent` nor `Manager`. Produced by the shared authorization handler from `004-auth-and-roles`, not by this endpoint |
| `500` | `errors/unexpected` | Unhandled fault. Body carries `traceId` and nothing else — no SQL, no exception type, no connection string |

`type` values and their exact URIs are owned by `002-error-contract`; this contract follows
whatever `002` established. If they differ, `002` is right and this file is the defect.

#### `400` — validation

```json
{
  "type": "https://wasl.local/errors/validation",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "detail": "See the errors property for field-level messages.",
  "instance": "/api/dashboard",
  "traceId": "00-8f1c2d3456789abc-0123456789abcdef-01",
  "errors": {
    "range": ["'range' must be one of: 7d, 14d, 30d."]
  }
}
```

The accepted values appear **in the message** and are not localized as a list — they are
contract literals, like an enum value (BR-8.7). Only the sentence around them is translated.

There is no `404` on this route. The dashboard always exists; an empty system is a `200`
with zeros and a `null` median, and the client renders the first-run panel from that shape
(AC-9). Returning `404` for "no data yet" would be a status code describing the data rather
than the resource.

### What stays identical in every locale

`title`, `detail`, and the messages inside `errors` are translated (BR-8.6). These are not
(BR-8.7):

| Part | Reason |
|---|---|
| `type` | The identifier the client branches on |
| The keys of `errors` | Request parameter names, part of this contract |
| Every JSON property name in the `200` body | Part of this contract |
| `scope`, `status`, `priority`, `channel` values | Enum identifiers. Only their labels are translated, client-side |
| `ticketNumber` | Quoted aloud and pasted between systems. Latin digits in `ar` (BR-8.13) |
| Every number and every date | Latin digits in `ar` (BR-8.13, ADR-007 §7) |
| `traceId`, `timeZoneId` | Identifiers |

`Content-Language` on the response names the locale actually applied, so a client can tell
that its request for `fr` produced English (BR-8.3).

---

## Behaviour worth knowing before you build against it

| Situation | What happens | Why |
|---|---|---|
| Empty system | `200`. Counts `0`, `dailySeries` full of zero days, `oldestUntouched` and `myOldest` `null`, medians `null` with `sampleSize: 0` | There is no special empty response. The **client** decides that this shape means "first run" (AC-9) |
| Agent with nothing assigned | Own counts `0`, `unassignedCount` non-zero | The pool is the next action. An empty box is not |
| A quiet day inside the range | An entry with `created: 0, resolved: 0` | The date spine. `GROUP BY` alone omits the day and the chart silently compresses (AC-5) |
| A ticket created at 22:00 local | Buckets on its **local** day, not the UTC one | AC-6. The most common silently-wrong thing in a dashboard, and invisible to anyone testing in UTC |
| A ticket resolved and reopened and resolved | Counted once, on the first resolution | BR-1.6 permits the reopen; AC-19 stops it inflating a past bar |
| A ticket resolved before the range, closed inside it | Not in `resolved` for any day | Its resolution day is outside the range, and `ClosedAtUtc` is not the source |
| No comments anywhere in the range | `firstReplyMinutes: null`, `firstReplySampleSize: 0` | Not `0`. Zero minutes to first reply is a claim |
| Nothing escalated yet | `escalatedOpenCount: 0` | Correct. Escalation is written by `016-escalate-ticket`; the column exists from the initial schema |
| An Agent reads the raw body looking for team data | Finds no `teamLoad` property, because the query never ran | AC-4, AC-17, AC-18 |
| A deactivated user still holds open tickets | Appears in `teamLoad` with `isActive: false` | Hiding them hides work |
| `range` omitted | `14d`, echoed in the response | AC-15 |
| Two identical requests one second apart | May differ. No cache | AC-22 |
| A successful read | Writes **no** audit row | A read changes no state (BR-9.1, AC-20) |
| A `401` or `403` on this route | Writes an audit row | BR-9.2, through `004`'s existing behaviour |

## Verification

| What | How |
|---|---|
| Every status code above | `TEST-020-10`, `TEST-020-11` |
| Role scope, and `teamLoad` absent for an Agent | `TEST-020-03` (JSON), `TEST-020-02` (command count) |
| Exactly 7 commands for a Manager, 6 for an Agent | `TEST-020-02` |
| A zero day appears in `dailySeries` | `TEST-020-04` |
| A 22:00-local ticket buckets on its local day | `TEST-020-05` |
| `localDate` has no `T` and no `Z` | `TEST-020-12` |
| The median barely moves when an outlier is added | `TEST-020-06` |
| Resolved comes from history, and a reopen counts once | `TEST-020-07` |
| No audit row on success; one on `401`/`403` | `TEST-020-13` |
| `Cache-Control: no-store`, and two calls differ | `TEST-020-14` |
| Arabic response: sentences translated, `type` / property names / digits identical | `TEST-020-15` |
| This contract matches what was built | Generated OpenAPI compared before the feature closes — `REV-020-02` |
