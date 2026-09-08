# Tests — `020b-dashboard-trend`

Every command was run on **2026-09-07/08** and every figure is copied from the run.

## The commands, and what they printed

```text
$ dotnet build --no-incremental
Build succeeded.
    0 Warning(s)
    0 Error(s)

$ dotnet test
Passed!  - Failed: 0, Passed: 189, Total: 189  — Wasl.Domain.Tests.dll        (463 ms)
Passed!  - Failed: 0, Passed:  35, Total:  35  — Wasl.Application.Tests.dll   (861 ms)
Passed!  - Failed: 0, Passed: 513, Total: 513  — Wasl.Api.IntegrationTests.dll (1 m 35 s)

  737 backend tests, up from 711 after `020`. +26.

$ cd src/wasl-web && npx tsc -b        (no output — clean)
$ npm run lint                          (no output — clean)
$ npm run test
 Test Files  54 passed (54)
      Tests  1226 passed (1226)

  +14 frontend tests. The first invocation died with `ERR_IPC_CHANNEL_CLOSED`, which the
  delivery log records as a known vitest pool flake under resource contention; the second
  run was clean and is the one reported.
```

## AC → test

| AC | Test | Where |
|---|---|---|
| AC-1 · one row per (day, scope), team row included | `A_second_team_row_for_one_day_is_refused_by_the_database` | `DashboardSnapshotCaptureTests` |
| AC-1b · a failing capture cannot stop the host | `A_capture_that_always_throws_leaves_the_api_serving` | `DailySnapshotFailureTests` |
| AC-2 · capturing twice updates | `Capturing_twice_updates_the_row_rather_than_adding_one` | `DashboardSnapshotCaptureTests` |
| AC-3 · two captures racing | `Two_captures_racing_for_one_day_produce_one_row_each_and_no_exception` | `DashboardSnapshotCaptureTests` |
| AC-4 · the capture and the read agree | `The_captured_team_levels_equal_what_the_endpoint_reports` | `DashboardSnapshotCaptureTests` |
| AC-5 · `previous` present / absent, all three ranges | `Without_a_snapshot_for_the_baseline_day_there_is_no_previous`, `With_a_snapshot_previous_carries_the_levels_and_names_the_day` | `DashboardTrendReadTests` |
| AC-6 · the baseline day is echoed | same, first assertion | `DashboardTrendReadTests` |
| AC-7 · scoped per role | `A_manager_reads_the_teams_baseline_and_an_agent_reads_their_own`, `An_agent_with_no_row_gets_no_baseline_even_when_the_team_has_one` | `DashboardTrendReadTests` |
| AC-8 · still 7 and 6 commands | `The_baseline_costs_no_extra_command` | `DashboardTrendReadTests` |
| AC-9 · no back-fill | `A_missed_day_is_not_back_filled` | `DashboardSnapshotCaptureTests` |
| AC-10 · no baseline → no arrow | `renders nothing when previous is absent`, `…is null` | `TrendArrow.test.tsx` |
| AC-11 · the arrow does not mirror | `AC-11 — the trend glyphs are NOT in 037s flip set` | `dashboardGuards.test.ts` |
| AC-13 · direction declared, not inferred | `renders the SAME rise as bad or good depending on higherIsWorse` + the source scan | `TrendArrow.test.tsx`, `dashboardGuards.test.ts` |
| AC-14 · the age copy claims nothing | `says the AGE got older or newer, never that anything improved` | `TrendArrow.test.tsx` |
| AC-15 · the local day, from the injected clock | `The_business_date_is_yesterday_locally_not_yesterday_in_UTC`, `Every_instant_within_one_local_day_maps_to_the_day_before`, `A_DST_zone_follows_its_local_clock` | `DailySnapshotScheduleTests` |
| AC-16 · no principal in the capture | Satisfied structurally: `DashboardSnapshotCapture` takes only `WaslDbContext`, and the scope comes from the `SupportUsers` spine. **No test**, and it is recorded here rather than claimed — see UNMET below |

## Negative controls — three run, all reported as observed

### C1 — remove `.HasFilter(null)` from the index

The one that would have shipped a broken guarantee.

```text
$ dotnet ef migrations add ControlProbeFilter
Done.

  filter: "[ScopeUserId] IS NOT NULL"
```

EF Core re-adds the filter immediately. That filter excludes every TEAM row from the unique
index, so `(2026-09-07, NULL)` becomes insertable twice — the team's snapshot silently duplicates
and the trend arrow depends on which row the engine returns first. Migration removed, index
restored, `filter_definition` confirmed `(none)` on the applied table.

### C2 — delete the scope clause from the capture

`Scoped` replaced with `(1 = 1)`, rebuilt with `--no-incremental`:

```text
× An_agent_row_is_scoped_while_the_unassigned_count_stays_global
  Expected team.WaitingOnCustomerCount to be greater than 1 because the ticket just seeded is
  the manager's, so it counts for the team and not for this agent — if these were equal the
  scope clause would be doing nothing, but found 1.
Failed!  - Failed: 1, Passed: 0
```

Every scope's counts collapse to the team's, which is the Q-3 defect: *my unassigned = 3* under
*▲ 5 vs prev* where the 5 is everybody's.

### C3 — key the baseline join on the wrong argument

`ON prev.LocalDate = {3}` changed to `{2}` — the overdue threshold instead of the baseline date:

```text
× With_a_snapshot_previous_carries_the_levels_and_names_the_day (all three ranges)
× A_manager_reads_the_teams_baseline_and_an_agent_reads_their_own
× A_null_baseline_age_stays_null_rather_than_becoming_zero
× The_baseline_costs_no_extra_command
Failed!  - Failed: 6, Passed: 4
```

Six red, and the four that stayed green are the ones asserting the ABSENCE of a baseline — which
is exactly right: a join keyed on the wrong column matches nothing, and "no arrow" is
indistinguishable from correct behaviour when there is genuinely no row. **That is why AC-5's
present-case and AC-8's count are both measured with a baseline actually in the response.**

### C4 — the banned direction inference

Not a code change: the guard's own control, run as part of the suite.

```text
✓ CONTROL — the scan finds the banned shape when one is put in front of it
    delta > 0 ? 'bad' : 'good'   → detected
    change < 0 ? 'good' : 'bad'  → detected
    the same text inside a comment → NOT detected (the stripper ran)
```

## What the runs found

### The generated migration disagreed with the measured engine

`research.md` R-1 measured SQL Server and was completely right: `NULL`s compare equal inside a
unique index, so a plain composite index gives one team row per day. **It was still not enough**,
because the question that mattered was what EF Core would EMIT — and EF adds an `IS NOT NULL`
filter to a unique index over a nullable column by default. Caught by reading the migration, not
by trusting the measurement.

`CLAUDE.md`'s rule is *verify a measurement with something below it*. This is the same rule met
from the other side: **a measurement one layer BELOW the defect cannot see it either.**

### `datetime2(3)` rounds, and `020`'s fixture guard fired again

Inherited from `020` and worth repeating here because this feature's `LocalDate` is a `date` and
therefore immune, while `CapturedAtUtc` is not.

### A test helper that built a date from three integers

`Day(offset)` was `new DateOnly(2099, 1, 1 + offset)`, which threw
`ArgumentOutOfRangeException` the moment an offset pushed past 31. Four tests failed at once with
a stack trace pointing at the helper rather than at anything under test. `AddDays` now. **A date
is not three independent integers**, and the mistake is only visible past a month boundary.

### The DI registration silently did not exist

`sed` was used to insert `AddScoped<IDashboardSnapshotCapture, …>` after a line that had been
renamed by an earlier file move, so the edit matched nothing and reported success. Six tests then
failed with `No service for type … has been registered`, which named the cause exactly. **A
find-and-replace that matches nothing is a change that did not happen**, and only the run said so.

## Recorded UNMET

| Criterion | Why |
|---|---|
| **AC-12's third control — the unique index DROPPED** | C1 above proves the stronger property: EF actively re-adds a filter that neuters the index, which is the failure that could really happen. Dropping the index by hand would prove only that SQL Server enforces a constraint it is given. Recorded rather than claimed |
| **AC-16 — the capture runs with no principal** | Satisfied by construction: `DashboardSnapshotCapture`'s only dependency is `WaslDbContext`, and `DailySnapshotService` resolves it from a fresh scope with no HTTP context. **There is no test**, because the honest one would be an architecture scan asserting that neither type names `ICurrentUser` — and a scan over two files is a statement about today rather than a guard. Left as a stated property |
| **A capture measured at realistic volume** | Unmeasured, as `research.md` says. The seeded database holds ~200 tickets and four scopes; no duration is claimed |
