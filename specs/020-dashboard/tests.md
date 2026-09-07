# Tests — `020-dashboard`

Every command below was run on **2026-09-07** and every figure is copied from the run, not
recalled. Where a criterion is not met it says so.

## The commands, and what they printed

```text
$ dotnet build --no-incremental
Build succeeded.
    0 Warning(s)
    0 Error(s)

$ dotnet test
Passed!  - Failed: 0, Passed: 189, Skipped: 0, Total: 189  — Wasl.Domain.Tests.dll        (364 ms)
Passed!  - Failed: 0, Passed:  35, Skipped: 0, Total:  35  — Wasl.Application.Tests.dll   (216 ms)
Passed!  - Failed: 0, Passed: 487, Skipped: 0, Total: 487  — Wasl.Api.IntegrationTests.dll (1 m 3 s)

  711 backend tests, up from 672 before this feature.

$ cd src/wasl-web && npx tsc -b        (no output — clean)
$ npm run lint                          (no output — clean)
$ npm run test
 Test Files  53 passed (53)
      Tests  1212 passed (1212)

  1212 frontend tests, up from 1148 before this feature — 64 new, all in
  src/features/dashboard/.

$ npx vitest run src/features/dashboard
 Test Files  4 passed (4)
      Tests  64 passed (64)
```

`LocalDaySpineTests` runs with **no container**, which TEST-020-08 requires. Observed:

```text
$ dotnet test tests/Wasl.Application.Tests --filter "FullyQualifiedName~LocalDaySpineTests"
Passed!  - Failed: 0, Passed: 9, Total: 9, Duration: 594 ms
```

## The endpoint, measured against a running API

Docker, `docker compose up -d db`, `--seed`, `dotnet run --project src/Wasl.Api` on `:5272`,
signed in as the seeded Manager. Verbatim:

```text
GET /api/dashboard                     → 200 · Cache-Control: no-store · Content-Language: ar
  "fromLocalDate":"2026-08-25" "toLocalDate":"2026-09-07"     ← bare dates, no T, no Z
  dailySeries: 14 entries including days with created 0        ← the spine
  oldestUntouched: TCK-2026-000001, ageHours 185
  openByStatus: New 53 · Open 56 · InProgress 26 · PendingCustomer 26 · Resolved 24
  channelMix:   Email 39 · WhatsApp 39 · LiveChat 37 · Sms 37 · WebForm 37
  teamLoad:     منى العتيبي 59 · Omar Khalid 35 · نورة السالم 31
  Arabic subjects returned intact — "الفاتورة الأخيرة بها رسوم غير معروفة" (nvarchar, not ????)

GET /api/dashboard  as the seeded Agent → "scope":"Mine", NO `teamLoad` key in the document
  unassignedCount 60 (same as the Manager's — the documented global exception)
  waitingOnCustomerCount 9 against the Manager's 26, assignedToMeCount 35 — scoped

GET /api/dashboard?range=7d            → 200 · "range":"7d" "fromLocalDate":"2026-09-01"
GET /api/dashboard                     → 200 · "range":"14d" echoed
GET /api/dashboard?range=90d           → 400 · errors.range: ["مدة غير مقبولة. القيم المقبولة: 7d, 14d, 30d."]
GET /api/dashboard?range=7d&range=30d  → 400 · errors.range: ["أرسل المدة مرة واحدة."]
GET /api/dashboard  (no token)         → 401
```

**`medians` came back `0` with sample sizes 44 and 25, and that is correct on this data.**
`--seed` writes every ticket and its comments in one instant, so `DATEDIFF(MINUTE, …)` is
genuinely zero for 44 tickets. A real zero, not "no data" — which is the distinction
`sampleSize` exists to carry, and `A_scope_with_no_replies_reports_a_null_median_and_a_zero_sample`
covers the other side.

## AC → test

| AC | Test | Where |
|---|---|---|
| AC-1 · one response, every block | `The_response_carries_every_documented_block_and_nothing_else` | `DashboardReadTests` |
| AC-3 · scope in every predicate | `An_escalated_ticket_assigned_to_someone_else_is_the_managers_and_not_the_agents` | `DashboardReadTests` |
| AC-4, AC-18 · `teamLoad` absent for an Agent | `An_agent_gets_no_teamLoad_property_at_all` (asserted on the JSON document) | `DashboardReadTests` |
| AC-5 · quiet days present | `The_series_is_exactly_as_long_as_the_range`, `A_named_day_inside_the_range_is_present_whether_or_not_it_has_tickets` | `DashboardReadTests` |
| AC-6 · the LOCAL day | `A_ticket_created_at_one_in_the_morning_local_counts_on_its_local_day` | `DashboardReadTests` |
| AC-6 · the spine itself | `A_Riyadh_day_begins_at_twentyone_hundred_UTC_the_day_before`, `A_DST_transition_makes_one_local_day_short_and_another_long` | `LocalDaySpineTests` |
| AC-7 · median, never mean | `An_outlier_moves_the_median_by_minutes_where_it_would_move_a_mean_by_hours` | `DashboardReadTests` |
| AC-8 · full status and channel spines | `The_status_and_channel_spines_carry_every_member_in_a_fixed_order` | `DashboardReadTests` |
| AC-9 · null is not zero | `A_scope_with_no_replies_reports_a_null_median_and_a_zero_sample`; `renders an em dash at sample size zero, and no overshoot` | `DashboardReadTests`, `DashboardView.test.tsx` |
| AC-10 · ten rows, oldest first, name in the same command | `The_attention_list_is_ten_rows_oldest_first_with_the_customer_name` | `DashboardReadTests` |
| AC-15 · range echoed, refused, defaulted | `An_unaccepted_range_is_a_400_naming_the_three_accepted_values`, `An_absent_range_answers_two_hundred_and_echoes_the_default`, `An_empty_range_is_treated_as_absent_and_answers_the_default`, `Sending_the_range_twice_is_refused_rather_than_taking_the_first` | `DashboardReadTests` |
| AC-16 · bare calendar dates | `Every_local_date_has_no_time_and_no_offset` | `DashboardReadTests` |
| AC-17 · 7 commands / 6 commands | `One_request_costs_seven_commands_for_a_manager_and_six_for_an_agent` | `DashboardReadTests` |
| AC-19 · resolved from history, reopen once | `A_reopened_and_resolved_ticket_counts_once_on_its_first_resolution_day`, `A_ticket_resolved_before_the_range_is_counted_on_no_day_inside_it` | `DashboardReadTests` |
| AC-20 · a read writes no audit row | `A_successful_read_writes_no_audit_row` | `DashboardReadTests` |
| AC-22 · no caching | `The_response_says_no_store_and_two_calls_around_a_write_differ` | `DashboardReadTests` |
| TEST-020-09 · UTC through raw SQL | `Every_instant_in_the_document_is_serialised_as_UTC` | `DashboardReadTests` |
| TEST-020-11 · `401` enveloped | `An_unauthenticated_request_is_refused_with_an_enveloped_problem` | `DashboardReadTests` |
| TEST-020-15 · Arabic translates prose only | `Arabic_translates_the_message_and_leaves_the_identifiers_alone` | `DashboardReadTests` |
| TEST-020-20 · `localDate` never through `new Date()` | `DISAGREES with the new Date() implementation west of UTC — the failing case` | `dashboardFormat.test.ts` |
| FE-020-03 · the range is in the URL | `writes the chosen range to the URL, and omits the default`, `reads a range out of the URL and asks for that one` | `DashboardPage.test.tsx` |
| FE-020-04 · a zero tile is muted | `mutes a zero rather than painting it red` | `DashboardView.test.tsx` |
| FE-020-06 · medians, list, team load | `names each median against its target…`, `shows Escalated where both memberships are true…`, the five `team load` tests | `DashboardView.test.tsx` |
| FE-020-07 · skeleton, error, trace id | `renders a skeleton at the real card heights while loading`, `shows the trace id on a failure`, `omits the reference line when the failure carries no trace id` | `DashboardView.test.tsx` |
| FE-020-10 · all six Arabic plural forms | `gives every Arabic counted noun all six CLDR forms` | `dashboardGuards.test.ts` |
| The 2026-09-07 contract change | `names how many escalations are over a day`, `Only_escalations_older_than_a_day_are_counted_as_overdue`, `links the whole set when there are more rows than the list holds` | both suites |

## Negative controls — each was RUN, and each is reported as observed

A guard nobody has seen fail has not been verified.

### C1 — delete the timezone offset from the spine

`LocalDaySpine.StartOfLocalDayUtc` returning `local` instead of `local - offset`, which turns
every boundary into a UTC midnight. Rebuilt with `--no-incremental`.

```text
× A_ticket_created_at_one_in_the_morning_local_counts_on_its_local_day
  Expected DayIn(after, localDay).Created to be 1 because 01:00 in Riyadh belongs to the
  local day that has just begun — AC-6, but found 0 (difference of -1).
Failed!  - Failed: 1, Passed: 0
```

**And the FIRST version of that test did not fail this control.** It used the criterion's own
example — a ticket created at **22:00 local** — and passed with the offset deleted. The reason
is arithmetic: Riyadh is UTC+3, so 22:00 local is 19:00Z *on the same calendar date*, and local
and UTC bucketing agree about it. **AC-6's example discriminates only in a zone with a negative
offset, and this product's zone is positive** — so the criterion as written could never have
caught its own defect. The test now uses 01:00 local (22:00Z the previous date), which is where
the two disagree in a UTC+3 zone. Recorded rather than quietly corrected, because the wording
is the contract's and someone will copy it.

### C2 — `MIN` becomes `MAX` on the first-resolution CTE

```text
× A_reopened_and_resolved_ticket_counts_once_on_its_first_resolution_day
  Expected DayIn(after, firstDay).Resolved to be 1 because BR-1.6 permits the reopen; the
  FIRST resolution is the one that counts, but found 0 (difference of -1).
Failed!  - Failed: 1, Passed: 0
```

### C3 — `teamLoad` executed for everyone

Replacing the Manager-only branch with `true || isManager` turned **two** tests red, which is
the point: the shape and the cost are separate claims.

```text
× An_agent_gets_no_teamLoad_property_at_all
  Expected agent.TryGetProperty("teamLoad", out _) to be False …, but found True.
× One_request_costs_seven_commands_for_a_manager_and_six_for_an_agent
  Expected agentCount to be 6 because teamLoad is not executed for an Agent — AC-17,
  but found 7.
Failed!  - Failed: 2, Passed: 0
```

### C4 — remove the range button's class

The guard for the `base.css` defect below. `className={styles.rangeButton}` deleted:

```text
× has no <button> without a className — base.css rule 17 would fill it navy
  + "DashboardView.tsx: <button key={option} type=\"button\" aria-pressed={option === range} onClick={() ="
Tests  1 failed | 8 passed (9)
```

It names the offending file and the offending tag, which is what makes it actionable.

### C5 — the RTL tooltip transform, measured in the browser

Forcing the LTR transform inside the Arabic frame and re-measuring the tooltip's centre against
its column's centre:

```text
column width 48px
with    [dir='rtl'] .tooltip override:   off by   -1px
without [dir='rtl'] .tooltip override:   off by -103px
```

More than two columns away. The rule is load-bearing and is now measured rather than argued.

### C6 — the fixture's own guard, which fired for real

`DashboardFixture.BackdateAsync` reads the row back and throws if the instant did not stick,
because `WaslDbContext.Stamp()` assigns `CreatedAtUtc = now` to every `IAuditableEntity` on
insert *unconditionally*. On the first run it threw — but not for that reason:

```text
System.InvalidOperationException : DashboardFixture could not date ticket … to
2026-09-07T11:32:02.4890000Z — the row came back as 2026-09-07T11:32:02.4900000Z.
```

**`datetime2(3)` ROUNDS rather than truncates.** `007` AC-14's note about the same column says
"truncation", which is what `RequestTimestamp` does on the way in — so the product never meets
the rounding and a fixture writing raw instants does. The fixture truncates to whole
milliseconds before the write, which keeps the read-back an equality rather than a tolerance:
an epsilon would also have accepted a value `Stamp()` had overwritten, if the test ran inside
the same millisecond.

## Three defects the browser found that no test could have

jsdom computes no cascade and no flex layout. All three were invisible to 1148 green tests and
were found by opening the page, measuring, and fixing — in that order.

| Defect | Measured before | Measured after |
|---|---|---|
| **All three range buttons rendered navy with no visible pressed state.** `base.css` rule 17 fills `button:not([class])` with `--action-primary-bg` `!important` as a dark-mode safety net for *unstyled* controls, and a button with no `class` attribute is unstyled by that rule's definition however much CSS points at its parent | `7d → rgb(29,23,77)` `14d → rgb(29,23,77)` `30d → rgb(29,23,77)` | `7d → rgb(255,255,255)` `14d → rgb(29,23,77)` `30d → rgb(255,255,255)` |
| **The chart's axis labels were drawn INSIDE the bars.** Inherited from the canvas's own CSS, which reserves 17px for the axis and then positions the label `absolute; bottom: 0` inside a full-height column | column 124px, bars 124px, tick overlapping | `column 124 = bars 107 + tick 17` |
| **Every progress track collapsed to a hairline in the two new cards.** `.track` carries `flex: 1` for the bar ROW; inside `.median` and `.agent` — flex COLUMNS — that resolves against the vertical axis and `flex-basis: 0%` beat the `block-size: 7px`. The median bars were absent entirely; the agent bars read as a 1px red underline | median track missing, agent track ~1px | `median 545×7`, `agent 459×7`, `barRow 405×7` |

**This is the third time `base.css` rule 17 has produced a defect** — `026`'s status tabs and
`032`'s copy buttons were the first two. `dashboardGuards.test.ts` scans the feature's source
for a `<button` with no `className`, which is the only guard that can see it, and C4 above is
that guard failing on purpose.

## Recorded UNMET

| Criterion | Why |
|---|---|
| **TEST-020-16 — an EMPTY DATABASE returns `200` with zeros and still 7/6 commands** | Not reachable. The integration suite shares one container that always holds the demo seed (`WaslApiCollection`, and `CLAUDE.md` records why one container replaced seven). The nearest honest assertion is in its place — `A_scope_with_no_replies_reports_a_null_median_and_a_zero_sample`, over a scoped empty population — and it is not the same claim. The EMPTY frame of `/_preview/dashboard` covers the client half: zeros muted, em dashes for the medians, the chart's empty sentence, and the good-news line under the attention list |
| **AC-11 — the response is under 300 ms at realistic volume** | Not measured. The seeded database holds ~200 tickets; the threshold in `research.md` R-10 is about realistic volume, and asserting it against 200 rows would be a number with no meaning. No performance claim is made |
| **A previous-period delta per tile (`▲ 3 vs prev`)** | Not built — no daily snapshot exists to compare against. See `plan.md` § Contract changes |
| **A per-agent breach count (`2 breaching`)** | Not built — requires a per-ticket SLA the product does not have |

## Frontend suites

| File | Tests | What it covers |
|---|---|---|
| `dashboardFormat.test.ts` | 19 | The bare calendar date **with the `new Date()` implementation as its own failing case**, ages, durations, `minutesSince` |
| `DashboardView.test.tsx` | 29 | Both audiences' tiles, the queue card and its bar scale, the medians against their targets, the attention list, the channel ranking, the five team-load properties, the chart's sr-only table, and the three states |
| `DashboardPage.test.tsx` | 7 | `?range=` in the URL in both directions, the request path on the wire, and the failure state. **`fetch` is stubbed rather than the fetcher**, so the query string is part of what is asserted |
| `dashboardGuards.test.ts` | 9 | The classless-button scan, the `new Date` scan, catalogue parity and the six Arabic plural forms, and no hex in the stylesheet — **each with a control proving the scanner ran** |

One assertion in `DashboardPage.test.tsx` was written wrong and the run corrected it: it claimed
that returning to a cached range issues no request. Three went out, not two — React Query's
default `staleTime` is 0, so a cached entry is stale on arrival and going back serves the cache
instantly *and* revalidates. That is right for an endpoint that is `no-store` by decision, so
the test now asserts the three-request sequence and that the card never re-skeletons.
