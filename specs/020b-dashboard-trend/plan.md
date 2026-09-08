# Plan — `020b-dashboard-trend`

**Spec:** [`spec.md`](spec.md), ruled 2026-09-07 · **Research:** [`research.md`](research.md) ·
**Data model:** [`data-model.md`](data-model.md)

**Status:** plan written. **Nothing implemented** — gate 4 has not been passed.

---

## 1 · Shape of the change

```text
Wasl.Domain            ── untouched. A snapshot is derived data, not a domain concept:
                          nothing invariant, nothing to make impossible to construct

Wasl.Application       ── DashboardTrend/            the DTO the read returns
                          Abstractions/IDashboardSnapshotCapture   one method, so the Api layer
                                                     can trigger a capture without naming EF

Wasl.Infrastructure    ── Persistence/Configurations/DashboardSnapshotConfiguration.cs
                          Persistence/Migrations/…_DashboardDailySnapshot.cs
                          Queries/DashboardSnapshotCapture.cs      the writer + the upsert
                          Queries/DashboardTrendPredicates.cs      the shared WHERE clauses
                          Scheduling/DailySnapshotService.cs       the first BackgroundService

Wasl.Api               ── nothing new. AddInfrastructure registers the hosted service, because
                          the layer that owns the work owns its registration

wasl-web               ── features/dashboard/TrendArrow.tsx        one component
                          features/dashboard/DashboardView.tsx     the tiles declare direction
```

**`Wasl.Domain` gains nothing, and that is the first design decision.** A snapshot has no
invariant to protect and no illegal state to make unconstructible — it is four integers and two
dates. Putting it in the domain because it is "a business concept" would be the reflex ADR-002
exists to resist.

## 2 · The order, and why

Each step leaves the build green and the suite passing. **No step depends on a later one.**

| # | Step | Leaves behind |
|---|---|---|
| 1 | The table, its configuration and the migration | A table nothing reads or writes |
| 2 | `DashboardTrendPredicates` — the four `WHERE` clauses, extracted from `AttentionAsync` **and used by it** | `020` still passes its 711 tests, now reading its predicates from one place |
| 3 | `DashboardSnapshotCapture` + the upsert, invoked directly by a test | AC-2, AC-3, AC-4, AC-9 provable with **no scheduler at all** |
| 4 | `DailySnapshotService` — the loop, the clock, the catch | AC-1b, AC-15 |
| 5 | `attention.previous` on the read | AC-5, AC-6, AC-7, AC-8 |
| 6 | The arrow | AC-10, AC-11, AC-13, AC-14 |

**Step 2 before step 3 is the load-bearing ordering.** Extracting the predicates *while `020` is
the only consumer* means its existing tests prove the extraction changed nothing. Writing the
capture first and extracting afterwards would mean two consumers changing at once, and the drift
AC-4 exists to catch would be introduced in the same commit that is supposed to prevent it.

**Step 3 before step 4** means every correctness property of the capture is testable by calling
a method. The scheduler then has exactly one thing left to prove — that it calls it, on time,
and survives it throwing.

## 3 · The four decisions inside the code

### 3.1 · The predicates are shared, not copied

```csharp
// Wasl.Infrastructure/Queries/DashboardTrendPredicates.cs
internal static class DashboardTrendPredicates
{
    public const string Unassigned        = "t.AssignedToUserId IS NULL AND t.Status <> N'Closed'";
    public const string EscalatedOpen     = "t.IsEscalated = 1 AND t.Status NOT IN (N'Resolved', N'Closed')";
    public const string WaitingOnCustomer = "t.Status = N'PendingCustomer'";
    public const string Assigned          = "t.AssignedToUserId IS NOT NULL AND t.Status <> N'Closed'";
}
```

Const strings interpolated into SQL text — **not** values, and never anything that came from a
request. The scope and the dates stay parameters, as they are in `020`. `CLAUDE.md` bans SQL
built from user input; a compile-time constant is the opposite of that, and the alternative
(two hand-written copies) is the drift this exists to stop.

**AC-4 is what proves it worked**: capture and read in one test, compare the numbers. Two copies
that agree today would pass a code review and fail that test the first time one of them changes.

### 3.2 · The upsert, and the catch that means success

```sql
UPDATE dbo.DashboardDailySnapshot
   SET UnassignedCount = @u, …, CapturedAtUtc = @now
 WHERE LocalDate = @date
   AND ((@scope IS NULL AND ScopeUserId IS NULL) OR ScopeUserId = @scope);

IF @@ROWCOUNT = 0
    INSERT INTO dbo.DashboardDailySnapshot (…) VALUES (…);   -- may raise 2601/2627
```

The `INSERT` can lose a race. **2601/2627 here is not an error to translate — it means the other
instance won**, so it is caught locally, and the capture retries the `UPDATE` once. `research.md`
R-2 records why `MERGE` was rejected and why the bare `UPDATE`-then-`INSERT` is check-then-act
without the index behind it.

The `@scope IS NULL AND ScopeUserId IS NULL` half of the predicate is not decoration: `= NULL`
never matches, so without it the team row would be updated by nothing and inserted every time.

### 3.3 · The loop, and the exception that must not escape

```csharp
while (await timer.WaitForNextTickAsync(stoppingToken))
{
    try
    {
        await CaptureIfDueAsync(stoppingToken);
    }
    catch (Exception exception) when (exception is not OperationCanceledException)
    {
        // MEASURED: HostOptions.BackgroundServiceExceptionBehavior defaults to StopHost, so an
        // escape here takes the whole API down — every ticket screen with it — for a number that
        // decorates four tiles. Caught locally rather than by setting the global to Ignore, which
        // would also silence the next background service somebody adds.
        logger.LogError(exception, "Dashboard snapshot capture failed for {LocalDate}", date);
    }
}
```

**A missed day is logged at `Error` and never back-filled.** Silent misses are gaps in a chart
nobody can explain later; a back-fill would file today's levels under yesterday's date, which is
the reconstruction defect §2.1 rejects.

`OperationCanceledException` passes through, because that is shutdown rather than failure.

**The tick is short and the decision is inside.** The timer fires every few minutes and the
capture asks *has the local day rolled over since the last row?* — rather than the timer being
set to fire once at midnight. A once-a-day timer misses the day entirely if the process restarts
at the wrong minute; a frequent tick with an idempotent capture converges.

### 3.4 · The read: a `LEFT JOIN`, not an eighth command

`AttentionAsync` already computes the spine's first day. The snapshot row for `firstDay − 1`
joins onto the same statement:

```sql
LEFT JOIN dbo.DashboardDailySnapshot s
       ON s.LocalDate = @previousDate
      AND ((@scope IS NULL AND s.ScopeUserId IS NULL) OR s.ScopeUserId = @scope)
```

Absent row → every column `NULL` → `previous` serialised as `null` → **no arrow**. The empty
case needs no branch anywhere, which is what makes Q-2's ruling cheap.

**AC-8 is the guard**: `020`'s command count test is extended, never loosened. If this ever
becomes an eighth command, that test goes red.

## 4 · Contract changes

`attention.previous`, additive, appended to
[`020`'s contract](../020-dashboard/contracts/dashboard-api.md) under its existing
**Contract changes** heading — the frozen body is never edited in place, which is the shape `020`
established on 2026-09-07.

```jsonc
"attention": {
  "unassignedCount": 12,
  "previous": {                     // null when no snapshot exists for the day before the range
    "localDate": "2026-08-24",
    "unassignedCount": 9,
    "escalatedOpenCount": 4,
    "waitingOnCustomerCount": 16,
    "oldestUntouchedHours": 51
  }
}
```

**One nullable object, not five nullable numbers**, and **no server-computed delta** — the client
needs the baseline to make the arrow checkable, and `+3` alone throws it away. Both are `spec.md`
§3.4.

Both lanes are told when this is appended. The frontend can build against it immediately, because
`previous: null` is the state it must handle anyway.

## 5 · Risks, and what each is answered with

| Risk | Answer |
|---|---|
| **A failing capture stops the API** | Measured (R-4): `StopHost` is the default. The catch in §3.3, and AC-1b asserts the host survives |
| **Two instances write two rows** | The unique index, measured in R-1. AC-3 races two captures |
| **The predicates drift from `020`'s** | Shared constants (§3.1), and AC-4 compares a capture with a read in one test |
| **A wrong baseline day** — off by one, or the wrong zone | `previous.localDate` is echoed (AC-6) and is derived from the spine, not re-computed |
| **An eighth command creeps in** | AC-8 extends `020` TEST-020-02 rather than replacing it |
| **The arrow implies a judgement the data does not support** | The direction is declared per metric (AC-13) and the oldest-untouched copy names the age, not the backlog (AC-14) |
| **The capture runs at the wrong local hour** | The clock is `TimeProvider` and the day comes from `Wasl:OrganizationTimeZone` (AC-15). A fake clock drives the test |
| **The first fortnight looks broken** | It looks exactly like today: `previous: null`, no arrow. Ruled Q-2 |

## 6 · Cut order, written before it is needed

If this has to shrink, cut from the bottom. Each line leaves the ones above it whole.

| Cut | What is lost | What still works |
|---|---|---|
| The `oldestUntouchedHours` trend | The one arrow whose meaning is hardest to state (Q-5) | The three count arrows |
| Per-agent snapshots | An Agent sees no arrow; a Manager sees all three | The table keeps `ScopeUserId`, so adding it later is a capture change and not a migration |
| The scheduler | Nothing captures automatically | The capture is a method, testable and callable — and `--seed` could invoke it once for a demo |
| **The whole feature** | The tiles look exactly as they do today | `020` is untouched. Nothing depends on this |

**The first two cuts are reversible without a migration**, which is why the table carries
`ScopeUserId` and `OldestUntouchedHours` from the start even if either is cut.

## 7 · What this plan does not decide

- **How long a capture takes at real volume.** Unknown, unbudgeted, and stated as such in
  `research.md`. If it matters, `CountQueries` measures it.
- **Whether snapshots are ever pruned.** No retention policy, by decision.
- **Whether other metrics later want a trend.** The table is shaped for the four tiles. A fifth
  column is a migration, and that is the right cost for a new claim about the past.
