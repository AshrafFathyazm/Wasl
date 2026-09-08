# Research — `020b-dashboard-trend`

Five questions the plan depends on. **Four were measured against the running engine or the
installed SDK on 2026-09-07**; the fifth is a design comparison with no measurable answer and
says so.

Every command and its output is copied here verbatim. Nothing below is recalled.

---

## R-1 · Does a composite `UNIQUE` index give one team row per day, or does it need a filter?

**The spec's first draft said it needed a filtered index, and that was wrong.** The claim was
written without checking, on a half-memory of PostgreSQL's behaviour — where `NULL`s in a unique
index are distinct, so `(2026-09-07, NULL)` could be inserted any number of times.

Measured, against the running SQL Server 2022 container:

```sql
CREATE TABLE #probe (LocalDate date NOT NULL, ScopeUserId uniqueidentifier NULL, N int NOT NULL);
CREATE UNIQUE INDEX UX ON #probe (LocalDate, ScopeUserId);

INSERT INTO #probe VALUES ('2026-09-07', NULL, 1);   -- first team row
INSERT INTO #probe VALUES ('2026-09-07', NULL, 2);   -- second team row, same day
INSERT INTO #probe VALUES ('2026-09-08', NULL, 3);   -- team row, next day
```

```text
first NULL row: inserted
second NULL row for the SAME date: REFUSED, error 2601 - NULLs compare EQUAL
NULL on a DIFFERENT date: inserted
rows_kept = 2
```

**SQL Server's `UNIQUE` treats `NULL`s as equal to one another.** A plain composite index gives
exactly the constraint this feature wants — one row per `(day, scope)`, with `ScopeUserId IS
NULL` standing for the team — and a filtered index would be complexity buying nothing.

**What this changes:** the table gets a plain `UNIQUE (LocalDate, ScopeUserId)`, and AC-1 asserts
the *behaviour* (the second team row is refused) rather than `filter_definition`. Asserting the
metadata would have asserted the opposite of what is built.

**The cost of not checking, if it had shipped:** a filtered pair of indexes on
`ScopeUserId IS NULL` / `IS NOT NULL` would also have worked, so nothing would have failed — the
repo would simply carry two indexes and a comment explaining a constraint that does not exist,
and the next person would copy the pattern. `CLAUDE.md`'s note about ADR-013's filtered index is
about `BR-4`'s *partial* uniqueness, which is a genuinely different problem.

---

## R-1b · The measurement above was right about the ENGINE and said nothing about the TOOL

**And EF Core silently opted out of it.** This is the finding that would have shipped a broken
guarantee, and it was caught by reading the generated migration rather than by trusting R-1.

`HasIndex(…).IsUnique()` over a nullable column produced:

```csharp
migrationBuilder.CreateIndex(
    name: "UX_DashboardDailySnapshot_Date_Scope",
    table: "DashboardDailySnapshot",
    columns: new[] { "LocalDate", "ScopeUserId" },
    unique: true,
    filter: "[ScopeUserId] IS NOT NULL");     // ← added by EF, asked for by nobody
```

**EF Core's SQL Server provider adds `IS NOT NULL` to a unique index over a nullable column by
default**, as a convention imitating the "NULLs are distinct" semantics other databases have.
That filter excludes **every team row** — `ScopeUserId IS NULL` — from the index, so
`(2026-09-07, NULL)` would have been insertable twice.

**The scope it would have broken is the one every Manager reads.** Two team snapshots for one
day, the read's `LEFT JOIN` matching whichever the engine returned first, and a trend arrow that
changes between two identical requests. Nothing would have thrown.

Fixed with `.HasFilter(null)`, which suppresses the convention. Verified **against the applied
table, not against the migration file** — the migration is a second thing that can be wrong:

```sql
SELECT name, is_unique, ISNULL(filter_definition, '(none)') FROM sys.indexes
WHERE object_id = OBJECT_ID('dbo.DashboardDailySnapshot');
```

```text
UX_DashboardDailySnapshot_Date_Scope   is_unique 1   filter_definition (none)

team row 1                    → inserted
team row 2, same day          → refused, error 2601
agent row, same day           → inserted
agent row 2, same day + agent → refused, error 2601
rows kept: 2
```

**Two lessons, and the second is the general one:**

1. `ADR-013` tells you to check that `filter_definition` comes back **non-null** for BR-4's
   partial unique index. Here the correct check is the opposite — non-null would mean broken —
   so the rule is *read the filter and know which answer you want*, not *expect a filter*.
2. R-1 measured the engine and was completely right. It was still not enough, because the
   question that mattered was what the ORM would emit. **A measurement one layer below the
   defect cannot see it** — `CLAUDE.md`'s "verify a measurement with something below it", met
   from the other direction.

---

## R-2 · Which upsert shape?

Three candidates. The concurrency requirement is AC-3: two captures racing for the same
`(day, scope)` produce one row and no exception.

| Shape | Verdict |
|---|---|
| `MERGE` | **Rejected.** `MERGE` is not atomic against a concurrent insert unless the source is read `WITH (HOLDLOCK)`, and the failure it produces without one is a duplicate-key violation under load — which is exactly the condition being defended against. A statement that needs a lock hint to be correct is a statement whose correctness lives in a hint somebody deletes |
| `UPDATE`, then `INSERT` when `@@ROWCOUNT = 0` | **Rejected on its own.** This is check-then-act with the check spelled differently: two captures can both see 0 rows updated and both insert. `CLAUDE.md`'s write-path table names it |
| **`UPDATE`, then `INSERT` when `@@ROWCOUNT = 0`, with the duplicate-key violation caught and turned back into an `UPDATE`** | **Chosen.** The index is the guarantee and the code is the message — the same division `007` uses, where the filtered unique index is the rule and the pre-check is the readable `409` |

The loser of the race does one extra round trip and both rows converge. **The index is what makes
it correct**, not the ordering, which is the property AC-3 asserts by racing two captures.

`WaslDbContext.TranslateDuplicate` is the existing list of index-violation translations, and
`CLAUDE.md` says adding an index means adding a row to it. This one is **deliberately not**
translated into a domain exception: the capture is not a request, has no caller to answer, and
2601/2627 here means *the other instance won*, which is success. The catch is local to the
capture and is documented there.

---

## R-3 · Does `PeriodicTimer` take a `TimeProvider` on this target?

The scheduler must be drivable by a fake clock, or the tests wait in real time.

Compiled and run against the solution's target (`net10.0`):

```csharp
var timer = new PeriodicTimer(TimeSpan.FromMinutes(1), TimeProvider.System);
```

```text
PeriodicTimer(TimeSpan, TimeProvider): OK - period 00:01:00
```

**Yes.** The overload exists, so the capture loop takes the same `TimeProvider` singleton
`AddInfrastructure` already registers, and a test can advance a fake clock instead of sleeping.
No new abstraction, no `IClock` interface, nothing to invent.

---

## R-4 · What happens when the capture throws?

**This is the finding that changes the design, and it is the one nobody would have looked for.**

Measured, same probe:

```csharp
var options = new HostOptions();
Console.WriteLine(options.BackgroundServiceExceptionBehavior);
```

```text
HostOptions.BackgroundServiceExceptionBehavior default = StopHost
```

**An unhandled exception in a `BackgroundService` stops the entire host by default** — .NET 6
changed this from "log and ignore" precisely so a dead background worker cannot be missed. Here
that default is the wrong trade by a wide margin: **a failed dashboard snapshot would take the
API down**, and every ticket screen with it, for a number that is decoration on four tiles.

Two ways to avoid it, and the choice matters:

| | |
|---|---|
| Set `BackgroundServiceExceptionBehavior = Ignore` on `HostOptions` | **Rejected.** It is a global setting. It would also silence the *next* background service somebody adds, which may well be one whose failure should stop the host |
| **Catch inside the capture loop, log, and continue to the next tick** | **Chosen.** Local to this service, and it makes the failure mode explicit: a missed day, which the ruling already says is acceptable and is never back-filled |

**A missed capture must be visible.** It is logged at `Error` with the local date it was trying
to write — a silent miss is a gap in a chart nobody can explain later. AC-1b asserts the host
survives and the next tick still runs.

---

## R-5 · How does a hosted service reach the database? (no measurement — a convention)

`WaslDbContext` is registered scoped and a `BackgroundService` is a singleton, so it cannot take
one by constructor injection. The standard answer applies: inject `IServiceScopeFactory`, create
a scope per capture, resolve inside it, dispose it at the end.

**And the capture has no principal.** `ICurrentUser` is scoped to an HTTP request; resolving it
from a background scope yields nothing useful. The capture therefore takes its scope from the
`SupportUsers` rows it is capturing *for*, never from an ambient user — which AC-16 asserts.

Two consequences follow and both are deliberate:

- `AuditBehaviour` never runs, because the capture is not a MediatR command. That is correct: a
  snapshot is derived data, not a state change a person made, and BR-9 audits the latter.
- The capture connects as `wasl_app`, the restricted principal `003b` created. It needs
  `INSERT` and `UPDATE` on one new table, which `db_datawriter` already grants — **no new
  permission and no change to `--provision`**, confirmed against `LeastPrivilegeProvisioner`'s
  per-role grant rather than a per-table list.

---

## What is still unknown, and is not guessed

**How long a capture takes at real volume.** At the seeded ~200 tickets it is four aggregate
scans per scope, and with three support users that is four scopes. Nothing here claims a
duration, and `plan.md` does not budget one. If it ever matters, the measurement is the same
`CountQueries` probe `008` built, pointed at the capture instead of a request.
