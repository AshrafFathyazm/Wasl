# 020 — Research

Questions that had to be answered before [`plan.md`](plan.md) could be written, what was
checked, what each one settled, and what was rejected. A question that turned out not to
matter is recorded as such, because "we looked and it did not matter" is information too.

**Standing caveat, stated once.** No code exists in this repository yet — `src/` and
`tests/` are absent, and the Docker daemon is not running (`docker info` reports
`failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`, the
same state `001/research.md` R-8 recorded). So nothing below was verified by executing a
query against SQL Server. Every item that needs execution says so and names the task that
executes it. `dotnet --version` reports `10.0.400-preview.0.26322.102` on the bare
machine and `dotnet ef` is `10.0.10`; `001`'s `global.json` is what makes the repository
build against `10.0.2xx` instead (`001` R-3, AC-13).

---

## R-1 · `docs/sdd/design/screens/11-dashboard.md` contains PostgreSQL. What of it survives ADR-013?

**Checked:** the screen spec's SQL against SQL Server's feature set, and the ADR history.

The screen spec was written under ADR-001 (PostgreSQL) and was not revised when ADR-013
superseded it. Three of its constructs do not exist in SQL Server:

| In the screen spec | SQL Server | Consequence |
|---|---|---|
| `generate_series(@from, @to, interval '1 day')` | `GENERATE_SERIES` exists in SQL Server 2022, but only as an integer/decimal series, and it requires database compatibility level 160 | Cannot be used as written. See R-2 |
| `count(*) FILTER (WHERE …)` | No `FILTER` clause | `SUM(CASE WHEN … THEN 1 ELSE 0 END)` — mechanical, and the count is identical |
| `percentile_cont(0.5) WITHIN GROUP (…)` as an aggregate | Exists, but as an **analytic** function only | Not a drop-in. See R-4 |
| `extract(epoch FROM (a - b))` | `DATEDIFF(minute, b, a)` | Minutes, not seconds — the screen shows minutes and hours, so seconds were never wanted |

**Settled:** the screen spec's *intent* is authoritative and its *syntax* is not. Every
query in this feature is written in SQL Server dialect, and each of the three rows above
carries its own research item so the translation is a decision rather than a silent
rewrite.

**Recorded as a blueprint defect, not fixed here.** `11-dashboard.md` is outside this
feature's write scope. It is listed in [`checklists/requirements.md`](checklists/requirements.md)
under blueprint gaps so someone with authority over `docs/sdd/` can correct it.

---

## R-2 · How is the date spine generated, given that the days are **local** and the data is UTC?

This is the question that shaped the whole backend design, so it is worth being explicit
about why the obvious answers fail.

**The requirement:** AC-5 wants one row per day in the range including empty days. AC-6
wants those days to be *local* days in the organisation's timezone, because a team in
Riyadh bucketing by UTC day sees its evening tickets land on tomorrow.

**Option 1 — `GENERATE_SERIES` in SQL, then `AT TIME ZONE` to localise.**

```sql
SELECT DATEADD(day, value, @fromLocalDate)
FROM   GENERATE_SERIES(0, @dayCount - 1);
```

Rejected, for three separate reasons, any one of which is sufficient:

- It requires **database compatibility level 160**. A database restored or created at
  150 silently loses the function, and the failure is a runtime `Invalid object name`
  in production-shaped environments only.
- Localising the *data* side needs
  `t.CreatedAtUtc AT TIME ZONE 'UTC' AT TIME ZONE @zone`, and that expression on the
  left-hand side of a predicate is **not sargable** — no index on `CreatedAtUtc` can be
  used, ever, regardless of volume.
- `AT TIME ZONE` resolves names from the **host operating system**: Windows names from
  `sys.time_zone_info` (`Arab Standard Time`), IANA names on Linux. So the identifier
  `Asia/Riyadh` works on a Linux container and fails on a Windows SQL Server — which
  means the test suite (Linux container) and a Windows developer instance disagree. See
  R-3.

**Option 2 — a permanent calendar/tally table.** Rejected: a schema change and a seeded
table for one screen, when the range is at most 30 rows and the application already knows
its own timezone. `data-model.md` stays empty for a reason.

**Option 3 — a recursive CTE.** Works everywhere, needs no compatibility level, and
still leaves the timezone problem in SQL. Rejected on the second half.

**Settled — Option 4: compute the spine in C#, pass it to SQL as data.**

`LocalDaySpine` produces, for each local day in the range, a triple
`(localDate, startUtc, endUtcExclusive)` using `TimeZoneInfo` — so DST transitions are
handled by the BCL rather than by `from + n*24h` arithmetic. The triples are serialised as
a single JSON parameter and shredded with `OPENJSON`, which is SQL Server 2016+ and needs
no compatibility level above 130.

```sql
DECLARE @spine nvarchar(max) = @p0;   -- [{"d":"2026-08-10","s":"2026-08-09T21:00:00","e":"2026-08-10T21:00:00"}, …]

SELECT  sp.d                                     AS LocalDate,
        SUM(CASE WHEN t.Id IS NOT NULL THEN 1 ELSE 0 END) AS Created
FROM    OPENJSON(@spine)
        WITH (d date '$.d', s datetime2(3) '$.s', e datetime2(3) '$.e') AS sp
LEFT JOIN dbo.Tickets AS t
        ON  t.CreatedAtUtc >= sp.s
        AND t.CreatedAtUtc <  sp.e
GROUP BY sp.d
ORDER BY sp.d;
```

Three things this buys, and they are the reasons it was chosen rather than side effects:

1. The predicate is `CreatedAtUtc >= @s AND < @e` — a plain range on the stored column.
   **Sargable.** An index on `CreatedAtUtc` is usable if one ever becomes justified.
2. SQL never learns a timezone name, so the Windows/IANA split in R-3 cannot reach it.
3. The DST arithmetic is in C# where `TimeZoneInfo` is correct and unit-testable with no
   database — which is what makes `LocalDaySpineTests` a fast test instead of a container
   test.

**One parameter, not thirty-one.** A `VALUES` list of 30 rows would work and would cost 90
parameters; a single `nvarchar(max)` costs one and keeps the plan cache from fragmenting
across the three ranges.

**To be executed, not assumed:** `BE-020-04` runs this against the container and
`TEST-020-05` asserts a 22:00-local ticket lands on its local day. Until then this is a
design, not a verified query.

---

## R-3 · `AT TIME ZONE` and the timezone identifier — the failure that only appears on one OS

**Checked:** how SQL Server resolves a timezone name, and how .NET does.

| Layer | Accepts | Notes |
|---|---|---|
| SQL Server on **Windows** | Windows registry names — `Arab Standard Time` | `SELECT * FROM sys.time_zone_info` lists them; IANA ids are rejected |
| SQL Server on **Linux** | IANA names — `Asia/Riyadh` | ICU-backed |
| .NET 6+ `TimeZoneInfo.FindSystemTimeZoneById` | Both, on both platforms — it converts between the two internally | This is why the C# side is the safe place for the identifier |

**Settled:** the timezone identifier exists in exactly one place — configuration, read by
.NET — and never crosses into SQL. Config carries the **IANA** id (`Asia/Riyadh`) because
that is what the screen spec displays and what the response echoes as `timeZoneId`.

**Why this is worth a research item at all:** the integration suite runs against
`Testcontainers.MsSql`, which is Linux. A query using `AT TIME ZONE 'Asia/Riyadh'` would
be **green in CI and red on a Windows developer's local instance**, or the reverse. A
divergence that depends on which OS the engine happens to be on is close to the worst
possible failure mode, and R-2's design removes it rather than documenting it.

**Rejected:** storing the Windows name in configuration and converting for display.
Config would then carry a value that means nothing to anyone reading it, and the
conversion would exist to serve a query that R-2 already decided not to write.

**Startup, not per request.** An unrecognised id throws `TimeZoneNotFoundException`. That
is resolved once at startup so the process fails loudly, rather than per request where the
tempting `catch` falls back to UTC and every bucket is quietly wrong (Q-A).

---

## R-4 · `PERCENTILE_CONT` in SQL Server is not an aggregate

**Checked:** the function's form, and what AC-7 actually requires.

In PostgreSQL `percentile_cont` is an ordered-set **aggregate**, so it composes with
`GROUP BY`. In SQL Server it is an **analytic** function: it requires
`WITHIN GROUP (ORDER BY …) OVER (PARTITION BY …)` and returns the same value on every row
of the partition. `SELECT PERCENTILE_CONT(0.5) … FROM t GROUP BY x` is a syntax error.

**Settled:** compute it over the whole set with an empty `OVER ()` and take one row.

```sql
SELECT TOP (1)
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x.FirstReplyMinutes) OVER ()  AS FirstReplyMedian,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x.ResolutionMinutes) OVER ()  AS ResolutionMedian,
    COUNT(x.FirstReplyMinutes) OVER ()                                       AS FirstReplySampleSize,
    COUNT(x.ResolutionMinutes) OVER ()                                       AS ResolutionSampleSize
FROM (…) AS x;
```

**The property that makes one query enough for both medians:** `PERCENTILE_CONT` **ignores
`NULL`** in its `ORDER BY` expression. The inner derived table emits one row per ticket
with `FirstReplyMinutes` null where the ticket has no comment and `ResolutionMinutes` null
where it was never resolved — and each median is then computed over its own population
without a second pass. `COUNT(col)` over the same expression gives the sample size for
free, which is what lets the contract distinguish "median is zero" from "there is no
data" (an edge case in `spec.md`).

**Rejected:** `AVG`. Not a style preference — support-time distributions have long tails
by nature, so the mean describes the tail and the median describes the day. One ticket left
open over a holiday moves a mean by hours. `TEST-020-06` is the test: the same dataset with
and without an outlier, asserting the median barely moves.

**Rejected:** computing the median in C# from a fetched list of durations. It would work at
this volume and it fetches a row per ticket to compute one number, which is the shape of
the problem this feature exists to avoid.

**Rejected:** `PERCENTILE_DISC`. It returns an actual observed value rather than
interpolating. Defensible, and AC-7 says `percentile_cont` — so the criterion decides it.

**To be executed:** `TEST-020-06`. The `OVER ()`-plus-`TOP (1)` form is the part most
worth running early, because it is the one that fails at parse time rather than quietly.

---

## R-5 · There is no `ResolvedAtUtc`. Where does "resolved" come from?

**Checked:** `docs/sdd/03-domain-model.md`, the `Ticket` field table, twice.

The ticket row carries `CreatedAtUtc`, `UpdatedAtUtc`, and `ClosedAtUtc`. **There is no
timestamp for entering `Resolved`.** BR-1.7 sets `ClosedAtUtc` on `Closed` only.

So the screen's "created vs resolved" trend — the block the screen spec calls *the only
trend that matters* — has no column behind it.

**Settled:** derive it from `TicketHistory`. BR-1.8 guarantees a row of
`EventType = StatusChanged` with `NewValue = Resolved` for every accepted transition into
`Resolved`, with `PerformedAtUtc`. That row is the fact; `ClosedAtUtc` is a different fact.

BR-1.6 permits `Resolved → InProgress`, so a ticket can be resolved more than once. The
series therefore counts **the first** such row per ticket:

```sql
CROSS APPLY (SELECT MIN(h.PerformedAtUtc) FROM dbo.TicketHistory h
             WHERE h.TicketId = t.Id AND h.EventType = 'StatusChanged'
               AND h.NewValue = 'Resolved') AS r(FirstResolvedAtUtc)
```

**Rejected — use `ClosedAtUtc` as a proxy.** It is one column, already indexed by nothing,
and it is wrong twice over: it omits every ticket resolved but not yet closed, and it dates
the ones it does include by their closure rather than their resolution. Both errors make
the bar *smaller and later*, so the chart looks plausible and slightly pessimistic — which
is why nobody would catch it. AC-19 exists for this and nothing else.

**Rejected — add a `ResolvedAtUtc` column.** Tempting: one column, one cheap query. Three
reasons against, and the third is the real one:

1. It changes the ticket **write** path, which is owned by `012-change-ticket-status` — a
   Release 1 feature this Release 2 feature must not reach into.
2. It denormalises a fact `TicketHistory` already records, so the two can disagree, and
   the one that gets fixed is the one someone notices.
3. Nothing else in the product needs it. A column added for one screen is where drift
   starts.

**If the derivation is ever measurably slow**, the answer is a filtered index on
`TicketHistory` — named in [`data-model.md`](data-model.md) with its threshold — not a new
column.

---

## R-6 · How does EF Core return the shape these queries produce?

**Checked:** what the seven queries return, and which EF Core mechanisms accept raw SQL.

None of the seven is expressible in LINQ: `OPENJSON`, `PERCENTILE_CONT … OVER ()`, and
conditional aggregates with a `CROSS APPLY` have no translation. So every one is raw SQL
returning a projection that is not an entity.

| Mechanism | Status |
|---|---|
| **Keyless query types** — `modelBuilder.Entity<T>().HasNoKey().ToView(null)` plus `FromSqlRaw` | **Chosen.** The long-established EF Core pattern for exactly this: an arbitrary projection with no key and no table |
| `Database.SqlQuery<T>` / `SqlQueryRaw<T>` | **Not relied on.** Documented for **scalar** types. Whether EF Core 10 accepts an arbitrary type here must be **confirmed by running it** before anything depends on it — and this is precisely the AI failure mode the constitution names (VI): a plausible API that does not do what it looks like it does. If `BE-020-02` confirms it works for these shapes, the switch is one line per query object and is recorded under **Contract changes**; until then, keyless types |
| Dapper alongside EF | **Rejected.** A second data-access library for one screen, and `Directory.Build.props` would then have two things to keep in step. `DbSet<T>` and `FromSqlRaw` are already there |
| A stored procedure per block | **Rejected.** Seven procedures live outside the migration story, outside code review, and outside `git blame` |

**Consequence for the plan, and it is a real cost:** the seven keyless types must be
registered in `WaslDbContext.OnModelCreating`, which is `Common/Persistence/` — outside
this slice. ADR-010 puts DTOs inside the slice that owns them, and this is a deliberate,
named exception: EF requires the model to know the type. [`plan.md`](plan.md) names the
file, and the registration is one `DashboardQueryTypes.Apply(modelBuilder)` call so the
slice still owns the definitions.

**Also settled:** `.AsNoTracking()` is redundant on a keyless type — they are never
tracked. Stated so nobody adds it and nobody wonders why it is missing.

---

## R-7 · How is the executed command count asserted, and who owns the mechanism?

**Checked:** `docs/sdd/testing/test-strategy.md`, which already requires
*"Absence of N+1 in the list and timeline queries — assert the executed command count"*,
and `specs/README.md`, where `010-ticket-list-and-detail` ends when *"the list costs one
query, asserted"*.

**Settled:** an EF Core `DbCommandInterceptor` in the integration test project,
incrementing a counter on `ReaderExecutingAsync`, scoped to one request and reset between
tests.

**Ownership:** `010` needs the same object for its AC-9 and comes first. So:

- If `010` has shipped `CommandCountingInterceptor`, this feature **reuses it** and
  `TEST-020-01` is a one-line reuse.
- If not, this feature creates it in `tests/Wasl.Api.IntegrationTests/Common/` and `010`
  reuses it later.

Either way it exists once. Two counters would drift, and the second one would be the one
nobody trusts. A-7 records the assumption; `TEST-020-01` records the branch.

**Why exact numbers rather than a ceiling (AC-17):** a `<= 10` assertion passes at eleven
queries after someone adds a lookup inside a loop, and passing is what a test is for. The
number is 7 for a Manager and 6 for an Agent, and the difference between them is AC-4
proven from the database side — an Agent's team-load query is not filtered, it is *never
executed*.

**A caution that belongs with the mechanism:** the count must be taken around one HTTP
request, not around a test method. Migration and seeding commands from a fixture would
otherwise be counted, the number would look wrong, and the natural fix — loosening the
assertion — destroys the test. `TEST-020-01` records the reset point.

---

## R-8 · Does the dashboard read write an audit row?

**Checked:** BR-9.1, BR-9.2, BR-9.11.

BR-9.1 is scoped to operations that **change state**; a dashboard read changes none. BR-9.2
covers `401` and `403` and applies here like everywhere else. BR-9.11's "the read is itself
audited" is specific to the **audit log** and is about reading the forensic record, not
about reading aggregates.

**Settled:** no audit row on success; a row on denial, written by the existing behaviour
from `004-auth-and-roles`. AC-20 asserts **both** directions, because "the dashboard is
audited" and "nothing on this route is audited" are both wrong and the first one is the
one somebody adds while being helpful.

**Consequence:** `GetDashboardQuery` is a query, not a command, and does not implement
`IAuditableCommand`. The architecture test from `003` covers commands only, so nothing
fails — worth stating, because an architecture test that stays green is indistinguishable
from one that was not consulted.

---

## R-9 · Does this need a chart library, or a ninth primitive?

**Checked:** `docs/sdd/design/component-inventory.md` and ADR-009.

The inventory's **Not built** table says, in one row: *"Charts — no reporting in scope"*.
ADR-009 caps primitives at eight and requires a written reason for a ninth. The blocks the
screen actually asks for are: paired bars per day, horizontal bars per status, horizontal
bars per channel, horizontal bars per agent. No axes with ticks, no tooltips, no zoom, no
legend beyond two labels.

**Settled:** compose them from `div` elements, semantic tokens, and CSS grid, inside
`features/dashboard/`. Not a primitive, because ADR-011 §3 is explicit — *move something to
`components/` when the second consumer appears, not when a second one is imagined* — and
the dashboard is the only consumer in the product.

**Rejected — Recharts / Chart.js / D3.** Each is a real dependency with its own RTL story,
its own accessibility story, and its own opinion about colour, on a droppable Release 2
screen. The bar blocks are roughly forty lines of CSS between them.

**Rejected — `<canvas>`.** Nothing in it is reachable by a screen reader, and AC-21 then
needs a parallel DOM representation anyway. `div`s with `aria` are the same work with none
of the drawing.

**What this obliges instead (AC-21):** a bar made of `div`s conveys nothing to a screen
reader, and neither does a colour ramp to someone who cannot distinguish it. Each block
carries a visually-hidden table of its values. The inventory's own rule — *never encode
meaning by colour alone* — already required this; AC-21 is that rule applied to a shape the
inventory did not anticipate.

---

## R-10 · Is a cache needed? — a question that turned out not to matter, and is recorded anyway

**Checked:** the screen spec's own answer, and whether anything in scope contradicts it.

The screen spec settles it: **no cache**, with a revisit threshold of ~300ms at realistic
volume and an ADR required before adding one. Nothing found contradicts it. Seven aggregate
queries over a demo-sized dataset are not a performance problem, and a cached dashboard
means explaining why a number is stale — which is worse than the milliseconds.

**Why it is still written down:** "add a cache" is the first thing anyone suggests about a
dashboard, and without this entry the answer would be relitigated. AC-22 makes the absence
of a cache a testable property rather than a preference, so a later "optimisation" fails a
test instead of silently changing what the screen means.

---

## R-11 · Escalation ships in `016`. Does the escalated tile work before then?

**Checked:** the schema and the feature order.

`Tickets.IsEscalated` exists from the initial schema (`03-domain-model.md`), so the column
and the query are valid regardless. Only the **writer** is missing until
`016-escalate-ticket` ships.

**Settled: it does not block anything.** The tile reads `0`, which is the correct answer for
a system where nothing has been escalated. No stub, no placeholder, no "coming soon" —
those are worse than a correct zero, and AC-10 already requires a zero to render muted
rather than alarming.

**Recorded because the opposite conclusion is easy to reach:** "the dashboard depends on
016" would have made this feature blocked by another droppable feature, and it is not.

---

## R-12 · Does BR-6 permit an Agent to read the dashboard?

**Checked:** BR-6's authorization matrix, row by row.

There is **no dashboard row.** The matrix covers customers, tickets, comments, escalation,
priority, and the audit log.

**Settled:** US-016 AC-3 and AC-4 are the authority — both roles, one route, different
content. The endpoint requires an authenticated user with either role and no more.

**Not fixed here.** BR-6 lives in `docs/sdd/`, outside this feature's write scope. It is
recorded as a blueprint gap in [`checklists/requirements.md`](checklists/requirements.md).
Filling it in from this spec would put a rule in a feature folder, which is the one place
`00-project-context.md` says rules must not live.

---

## R-13 · Do the seven reads need to agree with each other?

**Checked:** what `003-audit-trail`'s transaction behaviour is specified to wrap — and
`003` is not yet specified, so this could not be answered from an artifact.

**Settled as an assumption, not a fact (A-5).** If the behaviour opens a transaction for
every request, the seven reads are one snapshot and the blocks agree. If it wraps commands
only, a ticket created between query 3 and query 5 can appear in one block and not another.

**And the deliberate decision: do not fix it here.** Two blocks disagreeing by one ticket
for one second is not a defect a support dashboard has. Opening an explicit serializable
transaction to prevent it would take locks on `Tickets` for the duration of seven aggregate
scans — a real cost against every writer, to buy consistency nobody asked for. The screen
already says "updated a minute ago", which is the honest promise.

Recorded so that whoever reads two blocks disagreeing knows it was considered.
