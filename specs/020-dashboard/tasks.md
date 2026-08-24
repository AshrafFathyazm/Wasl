# 020 — Task Breakdown

**Phase:** 5 · Release 2 · **Role:** Story Planner · **Skill:** `speckit-tasks`

Every task has one owner, one verification, and something it serves. A task that cannot be
verified on its own is too big and is split.

Agents named here are **not dispatched until the plan is approved**. Naming is the plan;
dispatching without recording the result in [`ai-notes.md`](ai-notes.md) is what turns
evidence into a claim.

**Before any of this starts:** the whole feature is droppable and depends on `009`, `010`,
`012`, and `013` being real. A dashboard over an empty `Tickets` table is seven queries
returning zero, and a green suite over it looks like evidence. See [`plan.md`](plan.md),
Risks, first entry.

## Critical path

```text
BE-020-01 → BE-020-03 → BE-020-02 → BE-020-04 → BE-020-06 → TEST-020-02 → DOC-020-03
```

`BE-020-01` (the timezone) and `BE-020-03` (the day spine) come before any query, because
every query takes UTC instants derived from them. `TEST-020-02` is on the path rather than
after it: the command count is the one claim this feature makes that nothing else would
catch.

## Backend

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| BE-020-01 | `OrganizationTimeZone` reads `Wasl:OrganizationTimeZone` (IANA, default `Asia/Riyadh`) **once at startup** and resolves a `TimeZoneInfo`. An unrecognised id fails startup | — | Start the app with `Wasl:OrganizationTimeZone=Not/AZone`; the process fails with the id in the message and does **not** serve requests | AC-6, Q-A | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-020-02 | The seven keyless query types exist and are registered via one `DashboardQueryTypes.Apply(modelBuilder)` call in `WaslDbContext`. The EF mechanism chosen in `research.md` R-6 is **confirmed by running it**, not by reading about it | BE-020-01 | A projection round-trips through `FromSqlRaw` against the container. If `Database.SqlQuery<T>` turns out to accept these shapes in EF Core 10, the switch is recorded under **Contract changes** | AC-1 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-020-03 | `LocalDaySpine.Build(zone, nowUtc, dayCount)` returns exactly `dayCount` triples of `(LocalDate, StartUtc, EndUtcExclusive)`, contiguous, computed through `TimeZoneInfo` — never `from + n*24h` | BE-020-01 | `TEST-020-08` | AC-5, AC-6 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` + `superpowers:test-driven-development` |
| BE-020-04 | `DailySeriesQuery`: one command. `OPENJSON` spine on the **left**, `Tickets` for created, first-`Resolved` history for resolved | BE-020-02, BE-020-03 | Run against the container; a range with an empty day returns that day with zeros. `TEST-020-04`, `TEST-020-07` | AC-5, AC-19 | `voltagent-lang:sql-pro` | — |
| BE-020-05 | `AttentionTilesQuery`: one command producing all four counts plus `oldestUntouched` and `myOldest`, via conditional aggregates and a `NOT EXISTS` on `TicketComments` | BE-020-02 | Run against the container with a seeded fixture; each count matches a hand-written `SELECT` over the same data | AC-2, AC-3 | `voltagent-lang:sql-pro` | — |
| BE-020-06 | `GET /api/dashboard` returns the `200` shape in `contracts/dashboard-api.md` for both roles, assembled by `GetDashboardHandler` in the documented order, with `CancellationToken` threaded through every call | BE-020-04, BE-020-05, BE-020-07 … BE-020-11 | `curl -s "localhost:7001/api/dashboard?range=14d" -H "Authorization: Bearer …" \| jq` matches the contract | AC-1 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-020-07 | `OpenByStatusQuery`: one command, `GROUP BY Status`, `Closed` excluded, every remaining status present with `count: 0` when empty, ordered by the state machine's order | BE-020-02 | Run against the container; five entries on an empty database | Q-D | `voltagent-lang:sql-pro` | — |
| BE-020-08 | `ChannelMixQuery`: one command, `GROUP BY Channel` over tickets created in the range, all five channels always present | BE-020-02, BE-020-03 | Run against the container; five entries on an empty database | AC-1 | `voltagent-lang:sql-pro` | — |
| BE-020-09 | `MedianDurationsQuery`: one command returning both medians and both sample sizes via `PERCENTILE_CONT … WITHIN GROUP … OVER ()` and `TOP (1)` | BE-020-02, BE-020-03 | It **parses and executes** against the container — the analytic-vs-aggregate difference fails at parse time (`research.md` R-4). `TEST-020-06`, `TEST-020-17` | AC-7 | `voltagent-lang:sql-pro` | — |
| BE-020-10 | `NeedsAttentionQuery`: one command, `TOP (10)`, oldest first, `customerName` projected in the **same** query — no per-row lookup | BE-020-02 | `TEST-020-02` (the count would rise by one per row otherwise) | AC-8, AC-17 | `voltagent-lang:sql-pro` | — |
| BE-020-11 | `TeamLoadQuery`: one command, `SupportUsers LEFT JOIN Tickets`, so an active user with nothing assigned appears with `0`. **Called only for `scope: Team`** | BE-020-02 | `TEST-020-02` proves it is not executed for an Agent; `TEST-020-03` proves the property is absent | AC-4, AC-17, AC-18 | `voltagent-lang:sql-pro` | — |
| BE-020-12 | `GetDashboardValidator` rejects any `range` outside `7d\|14d\|30d`, and rejects a repeated `range` parameter, with `400` / `errors/validation` naming the three values | BE-020-06 | `TEST-020-10` | AC-15 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-020-13 | The response carries `Cache-Control: no-store`. No cache of any kind is introduced | BE-020-06 | `TEST-020-14`, and `git grep -iE "IMemoryCache\|IDistributedCache\|ResponseCache" -- src/Wasl.Api/Features/Dashboard/` returns nothing | AC-22 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-020-14 | Serialisation: `LocalDate` fields emit a bare `"YYYY-MM-DD"`; `teamLoad` is **omitted** when null rather than emitted as `null` | BE-020-06 | `TEST-020-12`, `TEST-020-03` | AC-16, AC-18 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |

## Frontend

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| FE-020-00 | The screen previewed with real tokens, real copy, plausible volumes, **every state in `frontend-spec.md`**, and both languages — **before** anything is wired | Contract frozen | The preview reviewed and approved; every divergence recorded with a reason. This screen has ten cards and six labels that differ in length between the two languages — the two most likely to wrap are "Waiting on customer" and "Escalated & open" | AC-9 … AC-12, ADR-009 | `ui-ux-pro-max:ui-styling` | `frontend-design` |
| FE-020-01 | Provisional types in `types.ts` replaced by types generated from the OpenAPI document | BE-020-06 | `tsc` passes against generated types; the `PROVISIONAL` comment is gone | ADR-011 §6 | `voltagent-lang:react-specialist` | `frontend-design` + `superpowers:test-driven-development` |
| FE-020-02 | `api.ts`, `queries.ts` (`['dashboard', range]`), the `/dashboard` route lazily loaded, and the nav item using `design/icons/dashboard.svg` | Contract frozen | The screen loads against the real endpoint with no hardcoded data | AC-1 | `voltagent-lang:react-specialist` | `frontend-design` + `superpowers:test-driven-development` |
| FE-020-03 | `RangeTabs` writes `?range=` to the URL and never holds it in state; the back button returns to the previous range | FE-020-02 | `TEST-020-18` | AC-13 | `voltagent-lang:react-specialist` | `frontend-design` + `superpowers:test-driven-development` |
| FE-020-04 | `AttentionRow` / `AttentionTile`: the four tiles for the active scope, zero rendered muted, `null` oldest rendered as "none" | FE-020-02 | `TEST-020-19` | AC-2, AC-10 | `voltagent-lang:react-specialist` | `frontend-design` + `superpowers:test-driven-development` |
| FE-020-05 | `BarTrack` plus the three bar blocks, each filling from the inline-start, each rendering a visually-hidden `ValueTable` with the bar container `aria-hidden` | FE-020-02, FE-020-09 | `FE-020-08`, and a Vitest case asserting the hidden table contains every plotted value | AC-21 | `voltagent-lang:react-specialist` | `frontend-design` + `superpowers:test-driven-development` |
| FE-020-06 | `MedianStats` (`"—"` at `sampleSize: 0`, never `0`), `NeedsAttentionList` (rows as real links), `TeamLoadList` (rendered on `teamLoad !== undefined`) | FE-020-02 | `TEST-020-19`, `TEST-020-21` | AC-7, AC-4 | `voltagent-lang:react-specialist` | `frontend-design` + `superpowers:test-driven-development` |
| FE-020-07 | `DashboardSkeleton` at real card heights, `FirstRunPanel`, `NothingAssignedPanel`, `DashboardError` with a selectable `traceId` | FE-020-04 … FE-020-06 | Each state forced with a stubbed response and observed; the skeleton→data transition causes **no layout shift** | AC-9, AC-11, AC-12 | `voltagent-lang:react-specialist` | `frontend-design` + `superpowers:test-driven-development` |
| FE-020-08 | The screen walked in **Arabic** and with a screen reader; every finding recorded in `tests.md` | FE-020-07 | The walk itself. Cards reverse, bars fill from the inline-start, the trend axis reverses, digits stay Latin, `dir="auto"` on every subject, every value obtainable from the hidden tables | AC-14, AC-21 | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |
| FE-020-09 | `formatLocalDate.ts` formats a bare date string **without** `new Date()`, and is the only place a `localDate` is formatted | FE-020-02 | `TEST-020-20` | AC-16 | `voltagent-lang:react-specialist` | `frontend-design` + `superpowers:test-driven-development` |
| FE-020-10 | `dashboard.json` in `en` and `ar`, every key in `frontend-spec.md`, counted nouns using all six Arabic CLDR plural categories | FE-020-04 … FE-020-07 | The key-parity test; `TEST-020-22` | BR-8.11, BR-8.14 | `voltagent-lang:react-specialist` | `frontend-design` + `superpowers:test-driven-development` |

## Tests

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| TEST-020-01 | A `CommandCountingInterceptor` exists **once** in the solution, counting `ReaderExecutingAsync`, resettable around a single HTTP request. Reused from `010` if it shipped one; created here if not | BE-020-02 | Deliberately add a second query to the handler and watch `TEST-020-02` go red | AC-8 | `voltagent-qa-sec:test-automator` | `superpowers:verification-before-completion` |
| TEST-020-02 | The command count for one request is **exactly 7 for a Manager and exactly 6 for an Agent**. The counter is reset after migration and seeding, so fixture commands are not counted | TEST-020-01, BE-020-06 | Test run. Then add a per-row customer lookup to `NeedsAttentionQuery` and confirm it fails | AC-8, AC-17 | `voltagent-qa-sec:test-automator` | `superpowers:verification-before-completion` |
| TEST-020-03 | An Agent's raw response body contains no `teamLoad` property — asserted on the JSON document, not on a deserialised object | BE-020-11, BE-020-14 | Test run asserting the raw string and the parsed document agree that the property is absent | AC-4, AC-18 | `voltagent-qa-sec:test-automator` | `superpowers:verification-before-completion` |
| TEST-020-04 | A range containing a day with no tickets returns that day with `created: 0, resolved: 0`, and `dailySeries.Length` equals 7 / 14 / 30 for each range | BE-020-04 | Test run | AC-5 | `voltagent-qa-sec:test-automator` | `superpowers:verification-before-completion` |
| TEST-020-05 | A ticket created at `19:00Z` (22:00 in `Asia/Riyadh`) is counted on **its local day**, not the following UTC day | BE-020-04 | Test run. Flipping the configured zone to `UTC` moves the ticket to the next day — which is the assertion that proves the bucketing is real | AC-6 | `voltagent-qa-sec:test-automator` | `superpowers:verification-before-completion` |
| TEST-020-06 | Adding one three-week outlier to a dataset moves the median by minutes. The same dataset's mean moves by hours, computed in the test for contrast | BE-020-09 | Test run | AC-7 | `voltagent-qa-sec:test-automator` | `superpowers:verification-before-completion` |
| TEST-020-07 | `resolved` comes from the **first** `StatusChanged → Resolved` history row. A ticket resolved, reopened per BR-1.6, and resolved again is counted **once**, on its first resolution day. A ticket resolved before the range and closed inside it is counted on **neither** | BE-020-04 | Test run | AC-19 | `voltagent-qa-sec:test-automator` | `superpowers:verification-before-completion` |
| TEST-020-08 | `LocalDaySpineTests`: lengths for all three ranges, contiguous boundaries, and a **DST-observing zone** where two consecutive local days are not both 24 hours. Runs with **no container**, and the observed run time is recorded | BE-020-03 | Test run, plus the recorded duration. If it starts a container, the fixture is assembly-scoped and must be moved to a collection (`plan.md`, accepted risks) | AC-5, AC-6 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-020-09 | Every `DateTime` returned through a keyless query type comes back with `DateTimeKind.Utc` | BE-020-02 | Test run. A raw-SQL projection is where the global UTC converter is most likely not to apply, so this is asserted rather than assumed | ADR-013 | `voltagent-qa-sec:test-automator` | `superpowers:verification-before-completion` |
| TEST-020-10 | `range=90d` and `range=week` each return `400` / `errors/validation` naming `7d, 14d, 30d`. `?range=7d&range=30d` returns `400`, not first-wins. Absent `range` returns `200` with `"range": "14d"` echoed | BE-020-12 | Test run | AC-15 | `voltagent-qa-sec:test-automator` | `superpowers:verification-before-completion` |
| TEST-020-11 | No token → `401` / `errors/unauthenticated`. A token with neither role → `403` / `errors/forbidden`. Both are `ProblemDetails` with a `traceId` | BE-020-06 | Test run with real tokens for both roles and one malformed one | AC-20 | `voltagent-qa-sec:test-automator` | `superpowers:verification-before-completion` |
| TEST-020-12 | `dailySeries[].localDate`, `fromLocalDate`, and `toLocalDate` match `^\d{4}-\d{2}-\d{2}$` — no `T`, no `Z`, no offset | BE-020-14 | Test run against the serialised body | AC-16 | `voltagent-qa-sec:test-automator` | `superpowers:verification-before-completion` |
| TEST-020-13 | A successful read writes **no** `AuditLog` row. A `401` and a `403` on this route each write one | BE-020-06 | Test run counting rows before and after. Both directions asserted — the absence matters as much as the presence | AC-20, BR-9.1, BR-9.2 | `voltagent-qa-sec:test-automator` | `superpowers:verification-before-completion` |
| TEST-020-14 | The response carries `Cache-Control: no-store`, and two calls one second apart with a ticket created between them return different `unassignedCount` values | BE-020-13 | Test run | AC-22 | `voltagent-qa-sec:test-automator` | `superpowers:verification-before-completion` |
| TEST-020-15 | With `Accept-Language: ar`: `Content-Language: ar`; `ProblemDetails.title` translated; `type`, every JSON property name, every enum value, and every digit byte-identical to the English response | BE-020-06 | Test run comparing both responses field by field | BR-8.7, BR-8.13 | `voltagent-qa-sec:test-automator` | `superpowers:verification-before-completion` |
| TEST-020-16 | An empty database returns `200` with zero counts, a full-length zero series, all five channels, all five statuses, `null` oldest tickets, and `null` medians — **and still exactly 7 / 6 commands** | BE-020-06, TEST-020-02 | Test run | AC-9, AC-17 | `voltagent-qa-sec:test-automator` | `superpowers:verification-before-completion` |
| TEST-020-17 | With no comments in the range, `firstReplyMinutes` is `null` and `firstReplySampleSize` is `0` — **not `0` minutes** | BE-020-09 | Test run | AC-7 | `voltagent-qa-sec:test-automator` | `superpowers:verification-before-completion` |
| TEST-020-18 | Changing the range writes `?range=` to the URL, refetches, and the back button restores the previous range | FE-020-03 | Vitest + RTL run | AC-13 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-020-19 | A zero tile renders with the muted token and **not** the danger token; a `sampleSize: 0` median renders `"—"` and not `0` | FE-020-04, FE-020-06 | Vitest run asserting the applied class and the rendered text | AC-10 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-020-20 | `formatLocalDate("2026-08-10")` renders **10 August** under `TZ=America/New_York`. The `new Date()` implementation is included in the test as the failing case, so the reason the helper exists is visible in the test file | FE-020-09 | Vitest run with `TZ` set | AC-16 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-020-21 | With `teamLoad` absent from the fixture response, no team-load card is rendered and no empty card placeholder appears | FE-020-06 | Vitest run | AC-4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-020-22 | Under `ar`, every count, date, and `ticketNumber` renders in Latin digits; counted nouns produce the correct Arabic plural at 0, 1, 2, 3, 11, 100 | FE-020-10 | Vitest run | BR-8.13, BR-8.14 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |

## Documentation

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| DOC-020-01 | `FRONTEND-API-GUIDE.md` regenerated from the contract after any **Contract changes** entry, and both lanes told | Any contract change | Diff the guide against the contract; every response, status code, and field appears in both | DoD | main session | — |
| DOC-020-02 | The two blueprint defects this feature found are **raised**, not silently worked around: `docs/sdd/design/screens/11-dashboard.md` contains PostgreSQL that ADR-013 superseded, and BR-6's matrix has no dashboard row | — | An entry in `docs/sdd/11-open-questions.md` or an equivalent record, and a decision by whoever owns `docs/sdd/` | Q-B, `research.md` R-1, R-12 | main session | — |
| DOC-020-03 | `tests.md` and `ai-notes.md` completed with **observed** output, and the board and delivery log updated | All | The `verify-story` gate | DoD | main session | `verify-story` |

## Review

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| REV-020-01 | Layer boundaries, `CancellationToken` threading, the raw-SQL query objects, and the named ADR-010 exception (keyless types on `WaslDbContext`) reviewed; verdict recorded | All BE, all TEST | `review.md` verdict is `Approved` | DoD | `comprehensive-review:code-reviewer` | `code-review:code-review` |
| REV-020-02 | Generated OpenAPI compared against `contracts/dashboard-api.md`, field by field | BE-020-06 | Any difference fixed in one of the two before closing | DoD | main session | — |
| REV-020-03 | Security: the role scope is applied **in every query predicate** and nowhere after; no query object can be called with a scope it does not filter on; no `detail` on any error leaks SQL, a table name, or a connection string | BE-020-06, TEST-020-03 | `review.md`, against `docs/sdd/testing/security-checklist.md`. Seven queries and one scope is seven chances to forget the predicate — which is why this is its own review task | AC-3, AC-4 | `comprehensive-review:security-auditor` | `code-review:code-review` |

## Droppable if time runs short

**The whole feature is droppable**, and it is fifth of seven in the Phase 5 order
(`specs/README.md`). Nothing below matters if the feature itself is cut — which is the
correct outcome if `012` or `013` is not finished.

Within the feature, in the order they should go:

| Task | What is lost |
|---|---|
| BE-020-08 / `channelMix` | The one block that answers "where does demand come from" rather than "what should I do". Genuinely interesting, prompts nothing, and the channel field is already demonstrated on the ticket list. **First out** |
| BE-020-09 / TEST-020-06 / TEST-020-17 / `medians` | The most technically interesting block and the least actionable. Two numbers nobody acts on today, and `PERCENTILE_CONT` is the highest-risk SQL in the feature. Dropping it removes one query, one card, and one class of syntax risk |
| BE-020-11 / `teamLoad` | The Manager's redistribution view. Costs AC-4 and AC-18 their most direct evidence, so if this goes, `TEST-020-02` still asserts 6 commands for both roles and the role-scope claim leans entirely on `TEST-020-03` — record that when dropping it |
| FE-020-05's third bar block | Fewer bars, same mechanism. `BarTrack` is proven by the first one |
| TEST-020-09 | The UTC round-trip through a keyless type. `001` already asserts the converter on mapped entities; this asserts it reaches raw projections. A real gap, and a narrow one |

**Not droppable: TEST-020-02.** Without the command-count assertion this feature has no
verification of its only non-obvious claim. Forty round trips render a perfect dashboard —
every other defect here is eventually visible, and this one is not. If `TEST-020-02` is cut,
the honest thing is to cut the whole feature.

**Not droppable: BE-020-01 and BE-020-03.** Local-day bucketing is the whole difference
between a correct dashboard and a plausible one, and UTC bucketing is invisible to anyone
testing in UTC (AC-6). Together they are one config read and one pure function.

**Not droppable: BE-020-04's spine on the left side of the join.** Without it, quiet days
vanish and the chart silently has fewer columns than the range it claims (AC-5). It is a
`LEFT JOIN` direction, not a feature.

**Not droppable: FE-020-09 / TEST-020-20.** One `new Date()` shifts the entire chart by a
day for any viewer west of the organisation's timezone, and nothing throws (AC-16).

**Not droppable: FE-020-00.** Ten cards and two languages is the highest ratio of
preview-value to preview-cost on the board. Skipping it means finding the wrapped Arabic
label after the screen has tests, keys, and query wiring (ADR-009).

**Not droppable: DOC-020-02.** The blueprint defects were found here; if they are not
raised, the next person to read `11-dashboard.md` writes PostgreSQL against SQL Server.
