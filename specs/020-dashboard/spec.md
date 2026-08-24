# 020 — Dashboard

**Phase:** 5 · Release 2 · **Story:** US-016 · **Status:** Specified, awaiting review ·
**Droppable:** yes — and not on the critical demo path (`specs/README.md` Phase 5)

## Understanding

One screen that answers *what needs attention right now*, for an Agent about their own
queue and for a Manager about the team's, from one request.

Behind it there is no new entity, no new table, and no new business rule. Everything on
the screen is an aggregate over `Tickets`, `TicketComments`, `TicketHistory`, and
`SupportUsers`, which is why the interesting part of this feature is not the domain — it
is the **query shape**, and three places where the number is wrong and looks right:

| Failure | Why it survives review |
|---|---|
| One `COUNT` per status, per channel, per day | The screen renders correctly. Roughly forty round trips instead of seven, and nothing announces it (AC-8, AC-17) |
| `GROUP BY` date with no date spine | A day with no tickets is omitted, so the chart compresses and a quiet Friday looks like it never happened (AC-5) |
| Bucketing by UTC day for a team in Riyadh | Every ticket created after 21:00 local lands on tomorrow. Invisible to anyone testing in UTC (AC-6) |

A fourth was found while writing this spec and is the one nobody would have looked for:
**there is no `ResolvedAtUtc` column.** `03-domain-model.md` gives `ClosedAtUtc` and
nothing else, so "resolved per day" and the resolution median cannot come from the ticket
row at all — they come from the `TicketHistory` row that BR-1.8 guarantees. Using
`ClosedAtUtc` instead would undercount every ticket resolved but not yet closed and
mis-date every one that was, and the chart would still look plausible. AC-19 exists for
this alone.

BR-1 (status shape), BR-3 (escalation), BR-6 (roles), BR-7 (listing), BR-8.13 (digits)
are the rules; none of them is re-implemented here.

## In scope

- `GET /api/dashboard?range=7d|14d|30d` — one endpoint, one authorization check, one
  response carrying every block (AC-1)
- Seven named query objects for a Manager, six for an Agent, executed sequentially
  against `WaslDbContext`; an executed-command-count assertion over the endpoint (AC-8,
  AC-17)
- Role scoping applied **in the query predicate**, so an Agent's response never contains
  team-load data in any form (AC-3, AC-4, AC-18)
- Local-day bucketing: the day boundaries are computed in C# from the organisation's
  `TimeZoneInfo` and passed to SQL as UTC instants, so the engine never needs a time-zone
  name (AC-6, `research.md` R-3)
- A date spine covering every day in the range, including days with zero (AC-5)
- Medians via `PERCENTILE_CONT`, not means (AC-7)
- `/dashboard` route: four attention tiles, created-vs-resolved bars, open-by-status,
  medians, needs-attention list, channel mix, and team load for a Manager
- All five screen states — loading skeletons at real card heights, first-run, zero,
  error, and the Agent-with-nothing-assigned case (AC-9 – AC-12)
- Range in the URL, so a view is a link and the back button works (AC-13, ADR-011 §2)
- i18n keys in `en` and `ar`; RTL bars, reversed axis, Latin digits (AC-14, BR-8.13)

## Out of scope

| Excluded | Where it lives |
|---|---|
| The ticket list, its filters, its search | `010-ticket-list-and-detail`, `015-ticket-filters-and-search`. Every "see all" on this screen is a link into those |
| Escalation itself — setting `IsEscalated` | `016-escalate-ticket`. This feature only counts the flag; until `016` ships the tile reads `0`, correctly (`research.md` R-11) |
| Comments and history rows — writing them | `013-ticket-timeline-and-comments`, `012-change-ticket-status`. This feature only reads them |
| The audit-log read surface | `019-audit-log-access`. A dashboard read is not a state change and writes no audit row (AC-20) |
| Customer-side aggregates | `018-customer-overview` |
| Any schema change, any new index | Nothing — see [`data-model.md`](data-model.md). This feature is schema-free by decision |
| CSV export, configurable widgets, a free date-range picker, SLA compliance, satisfaction scores, an agent leaderboard | Excluded by US-016 **Out of scope**. The leaderboard is excluded on purpose, not for effort: ranking agents by closed count rewards closing, and the fastest way up such a board is closing things that should have stayed open |
| Caching of any kind | Nothing. AC-22 asserts its absence. The revisit threshold is ~300ms at realistic volume, and crossing it costs an ADR (`docs/sdd/design/screens/11-dashboard.md`, Caching) |
| A charting library, and a ninth primitive | Nothing. The bars are composed inside the feature folder — see A-6 |
| Auto-refresh, polling, websockets | No requirement. "Updated a minute ago" is a rendered timestamp, not a live one |

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | The organisation has **one** timezone, supplied by configuration, and it is `Asia/Riyadh` by default | Per-user timezones would make every bucket a per-request computation and every cached number wrong. If a second timezone appears, the spine moves from a singleton to a per-request value — the same code, a different lifetime. Q-A |
| A-2 | The role scope predicate is `AssignedToUserId == me` for an Agent, applied uniformly to every block | A ticket an Agent *created* but is not assigned would then be absent from "their" figures. If that is wrong, the created series switches to `CreatedByUserId` — one clause in `DailySeriesQuery`, and the two series then answer different questions, which has to be said on the screen |
| A-3 | `unassignedCount` is **global for both roles** — the unassigned pool has no owner, so it is not scoped | If it should be scoped, an Agent sees `0` forever and the most actionable number on the screen stops working. This is the one field that deliberately ignores A-2, and the contract says so in a row of its own |
| A-4 | `range` defaults to `14d` when absent, matching the screen's 14-day trend | A different default changes the first render only; the response echoes `range` so nothing infers it |
| A-5 | The seven reads happen inside whatever transaction `003-audit-trail`'s behaviour opens for the request. If that behaviour wraps commands only, the seven reads are not one snapshot | Then two blocks can disagree by one ticket created between them. For a dashboard that is acceptable and is stated on the screen ("updated a minute ago"); it is **not** worth a serializable transaction. Recorded rather than discovered |
| A-6 | Bars are composed from `div` elements and tokens inside `features/dashboard/`, not from a chart library and not as a ninth primitive | `docs/sdd/design/component-inventory.md` lists **Charts — no reporting in scope**, and ADR-009 caps primitives at eight. If bars turn out to need real axes, ticks, and tooltips, that is a written request for a ninth primitive with a reason, not a quiet `npm install` |
| A-7 | `010-ticket-list-and-detail` has already introduced a command-counting test interceptor for its own AC-9 | If it has not, this feature creates it (`TEST-020-01`) and `010` reuses it. Either way it exists once; two of them would drift |

## Open questions

| # | Question | Working assumption |
|---|---|---|
| Q-A | Where does the organisation's timezone come from? Nothing in `docs/sdd/` defines it | Configuration key `Wasl:OrganizationTimeZone`, an IANA id, default `Asia/Riyadh`, resolved once at startup through `TimeZoneInfo.FindSystemTimeZoneById`. It is echoed in the response as `timeZoneId` and rendered in the header, so the number is never ambiguous (AC-6). A missing or unrecognised id **fails at startup**, not per request — a dashboard silently bucketing in UTC is the defect this feature exists to avoid |
| Q-B | BR-6's authorization matrix has **no dashboard row**. Who may read it? | Both roles, same route, different content — US-016 AC-3 and AC-4 are the authority and are treated as such. Flagged in [`checklists/requirements.md`](checklists/requirements.md) as a blueprint gap rather than silently filled |
| Q-C | US-016 AC-2 names the Manager's four tiles; `11-dashboard.md` gives the Agent a different four (`Assigned to me`, `Unassigned pool`, `My oldest`, `Waiting on customer`) | Both are right about their own role. The response returns **all six counts**, every one already role-scoped, and the client renders the four for its scope. This leaks nothing (A-3 aside, every count is the caller's own data) and keeps one response shape |
| Q-D | "Open by status" — which statuses count as open? | Every status except `Closed`. `Resolved` is included because a resolved-and-not-closed ticket is still in the queue's shape, and excluding it would make the block disagree with the ticket list. Stated in the contract so the client does not have to infer it |
| Q-E | Does "resolved" in the daily series mean *entered Resolved* or *entered Closed*? | Entered `Resolved`, from the **first** `StatusChanged → Resolved` history row per ticket. BR-1.6 permits `Resolved → InProgress`, so a ticket can be resolved twice; counting the first transition only means a reopen does not inflate yesterday's bar (AC-19) |
| Q-F | Is a 30-day range ever going to be slow enough to matter? | No, at the volume in scope. The measurement that would change the answer is named in [`plan.md`](plan.md) (Risks) with the threshold from the screen spec, and the answer would be an index — not a cache and not a materialised table |

## Acceptance criteria

AC-1 – AC-14 are US-016's, at US-016's numbers and unchanged in meaning. AC-15 onward are
added by this specification for things US-016 does not state and a test would otherwise
have to guess.

| # | Criterion |
|---|---|
| AC-1 | `GET /api/dashboard?range=7d\|14d\|30d` returns every block in one response |
| AC-2 | The first row is actionable metrics only — unassigned, escalated and open, oldest untouched, waiting on customer |
| AC-3 | An Agent sees their own figures; a Manager sees the team's. Same endpoint, filtered by role in the query |
| AC-4 | An Agent's response contains no team-load data at all — not hidden client-side |
| AC-5 | The daily series includes days with zero, produced by a generated date spine |
| AC-6 | Times are bucketed in the organisation's timezone, and the header states which |
| AC-7 | First-reply and resolution times are **medians**, computed with `percentile_cont` |
| AC-8 | The whole screen costs roughly six queries; an executed-command-count test asserts it |
| AC-9 | An empty system renders a first-run state, not a grid of zeros |
| AC-10 | A zero in any tile renders muted, never in the danger colour |
| AC-11 | Each card has its own skeleton at its real height, so nothing shifts on load |
| AC-12 | A failure renders one message with a `traceId`, not eight broken cards |
| AC-13 | Changing the range updates the URL and refetches |
| AC-14 | Every ticket subject shown carries `dir="auto"`; numbers use Latin digits |
| AC-15 | An unrecognised `range` returns `400` with `type: errors/validation` naming the three accepted values. An absent `range` is not an error: it defaults to `14d` and the response echoes `range` so the client never infers it |
| AC-16 | `dailySeries[].localDate` is a bare calendar date — `"2026-08-10"`, no `T`, no `Z`, no offset. Asserted by string shape. An instant here is rendered as the previous day by any client west of the organisation's zone, and the chart is simply wrong by one column with nothing to see |
| AC-17 | The executed command count for one request is **exactly 7 for a Manager and exactly 6 for an Agent**, asserted per role by name. The Agent number is lower because `TeamLoadQuery` is never executed, which is AC-4 proven from the database side rather than the JSON side |
| AC-18 | For an Agent the `teamLoad` property is **absent from the JSON document** — not `null`, not `[]`. Asserted on the raw response body, because a `null` that the client happens not to render is exactly the client-side hiding AC-4 forbids |
| AC-19 | The resolved series and the resolution median derive from the **first** `TicketHistory` row with `EventType = StatusChanged` and `NewValue = Resolved` per ticket, never from `ClosedAtUtc`. A ticket resolved, reopened per BR-1.6, and resolved again is counted **once**, on its first resolution day |
| AC-20 | A successful dashboard read writes **no** audit row — it changes no state (BR-9.1). A `401` or `403` on this route does write one, through the existing behaviour from `004-auth-and-roles` (BR-9.2). Both directions are asserted, because "the dashboard is audited" and "nothing on this route is audited" are both wrong |
| AC-21 | Every bar block carries a text alternative conveying each plotted value — a visually-hidden table or an equivalent — so the numbers are obtainable without seeing the bars. A bar chart that exists only as coloured `div`s is unreadable to a screen reader and to anyone who cannot distinguish the ramp |
| AC-22 | Two requests one second apart, with a ticket created between them, return different `unassignedCount` values, and the response carries no cache-control header permitting reuse. There is no cache, by decision, and this is the criterion that fails if one is added as an "optimisation" |

## Edge cases

| Case | Expected |
|---|---|
| Empty system — no tickets at all | `200`. Every count `0`, `dailySeries` still has one entry per day in the range with zeros, `oldestUntouched` is `null`, medians are `null` with `sampleSize: 0`. The **client** renders the first-run panel from this shape (AC-9); the server does not have a special empty response |
| Agent with nothing assigned | `200`, own counts `0`, `unassignedCount` global and non-zero. The screen says "nothing assigned to you" and shows the pool — a next action, not an empty box |
| Range spans a day with no tickets | That day appears with `created: 0, resolved: 0` (AC-5). Without the spine it would vanish and the chart would silently have fewer columns than the range |
| A ticket created at 22:00 Riyadh time (19:00 UTC) | Counted on **its local day**, not the UTC day. The test writes exactly this instant and asserts the bucket (AC-6) |
| The organisation's zone observes DST | The spine's days are not uniformly 24 hours. Computed with `TimeZoneInfo`, never as `from + n*24h`. `Asia/Riyadh` has no DST today, which is precisely why this would never be caught by a test written against the default |
| No ticket in the range has a comment | `medians.firstReplyMinutes` is `null` with `firstReplySampleSize: 0` — **not** `0`. Zero minutes to first reply is a claim; no data is not |
| One ticket left open across a three-week holiday | The median moves by minutes; a mean would move by hours. This is the test for AC-7: the same dataset with and without the outlier, asserting the median barely moves |
| A ticket resolved, reopened, resolved again inside the range | Counted once, on the first resolution day (AC-19) |
| A ticket resolved before the range and closed inside it | Not in the resolved series. Its resolution day is outside the range; `ClosedAtUtc` is not the source (AC-19) |
| `range=90d` or `range=week` | `400`, `errors/validation`, naming `7d`, `14d`, `30d` (AC-15) |
| `range` sent twice — `?range=7d&range=30d` | `400`. A silent "first one wins" makes the URL and the chart disagree, which is the class of bug ADR-011 §2 exists to remove |
| No token | `401`, `errors/unauthenticated`, `ProblemDetails`, and an audit row (AC-20, BR-9.2) |
| Token whose role is neither `Agent` nor `Manager` | `403`, produced by the shared authorization handler from `004`, not by this endpoint. Audit row written (BR-9.2) |
| Agent inspects the raw response for team data | Finds none — the property is absent and `TeamLoadQuery` was never executed (AC-17, AC-18) |
| A support user is deactivated with tickets still assigned | Still appears in `teamLoad` while they hold open tickets; the row carries `isActive: false`. Dropping them hides work that exists |
| An active agent with nothing assigned | Appears in `teamLoad` with `0`. A `LEFT JOIN` from `SupportUsers`, so the list is the team and not just the busy part of it |
| Database unreachable mid-request | `500` with a `traceId` and nothing else (`05-api-conventions.md`). The screen shows one message, not eight broken cards (AC-12) |
| Arabic locale requested | `Content-Language: ar`. Every number, date, and `TicketNumber` stays Latin-digit (BR-8.13). `type`, enum values, and JSON property names are byte-identical to the English response (BR-8.7) |
| A subject written in Arabic inside an English UI | Renders with `dir="auto"` (AC-14, ADR-007 §8) |
| 30-day range on an empty database | 30 spine rows, zero data rows, seven queries. The command count does not depend on the data — which is the whole point of asserting it |

## Rules referenced

- **BR-1** — status shape. BR-1.6 (`Resolved → InProgress`) is why AC-19 counts the first
  resolution only; BR-1.7 (`ClosedAtUtc` set on close) is why it is not the source; BR-1.8
  (every transition writes a history row) is what makes `TicketHistory` the source
- **BR-3** — escalation. BR-3.1: manual only, so the escalated tile counts a flag and
  never a computed condition. BR-3.9: escalated is permanent, so the tile has no
  de-escalation case
- **BR-6** — roles. The matrix has no dashboard row; see Q-B
- **BR-7** — listing. BR-7.1's sort and BR-7.6's "empty is `200`, never `404`" both apply
  to the needs-attention list; BR-7.2's page size does not, because that list is a fixed
  top ten with a link into `010`
- **BR-8.7** — `type`, `errors` keys, enum values, `TicketNumber` never localized
- **BR-8.13** — Latin digits in Arabic, for identifiers, timestamps, and counts
- **BR-9.1, BR-9.2** — a read writes no audit row; a denial does (AC-20)
- **NFR-10** — auditability as a structural property, which is why AC-20 asserts the
  *absence* of a row as well as its presence
- **ADR-006 / ADR-013** — `rowversion`; not read here, and named because a read-only
  endpoint returning no `version` is a deliberate omission
- **ADR-007** — §6 logical properties, §7 Latin digits, §8 `dir="auto"`
- **ADR-009** — eight primitives, capped. See A-6
- **ADR-010** — the slice layout every file in [`plan.md`](plan.md) follows
- **ADR-011** — §2 URL as state container (AC-13), §4 fetch at the route only, §5 expected
  states inline
- **ADR-013** — SQL Server. The reason `research.md` R-1 through R-4 exist at all: the
  screen spec's SQL predates it

## Why the six-queries criterion is the load-bearing one

AC-8 is the only criterion on this screen that fails **without changing what the user
sees**. Every other defect here shows up eventually: a wrong count is noticed, a missing
day is noticed, a broken card is noticed. Forty round trips render a perfect dashboard.

That is also why AC-17 pins an exact number per role instead of trusting "roughly six".
"Roughly" is not a test, and a test that passes at eleven queries because eleven is
roughly six protects nothing.
