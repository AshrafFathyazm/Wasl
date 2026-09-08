# Summary — `020b-dashboard-trend`

Delivered 2026-09-08, both lanes. The `▲ 3 vs prev` arrows the 2026-09-07 canvas asked for and
`020` recorded as **not built**, because the tiles are a STOCK and the product kept no history of
one. This writes that history down.

737 backend tests (from 711) · 1226 frontend (from 1212) · `dotnet build` 0 warnings, and warnings
are errors here.

## What was built

**One table.** `dbo.DashboardDailySnapshot` — one row per (local day, scope), the team's scope
being `NULL`. A plain `UNIQUE (LocalDate, ScopeUserId)` is the concurrency guarantee.

**One writer.** `DashboardSnapshotCapture`: three statements in one round trip — a temp table of
every scope's levels, an `UPDATE` for rows that exist, an `INSERT` for the ones that do not. Ten
agents cost the same as one.

**The first scheduled work in this product.** `DailySnapshotService`, in-process, a 15-minute tick
with the day-rollover decision inside it, its clock behind `TimeProvider`.

**Four predicates, shared.** `DashboardTrendPredicates` — extracted from `020`'s read *while it
was still the only consumer*, so its 30 existing tests were the proof the extraction changed
nothing.

**`attention.previous` on the read**, as a `LEFT JOIN` — no eighth command — and one `TrendArrow`
component whose direction is declared per metric and never inferred.

## The trade-offs, and what deviated from the plan

**The build order was the plan's and it earned its keep.** Extracting the predicates before the
capture existed meant `020`'s tests validated the refactor; writing the capture first would have
changed two consumers in the commit meant to stop them drifting.

**Getting a shared constant into raw SQL took three attempts, and the first two are recorded in
the code.** `SqlQuery($"…{Constant}…")` turns the constant into a *parameter* — the statement
would have compared a column against a string of SQL and matched nothing. `SqlQueryRaw($"…")` was
refused by the EF1002 analyser, correctly, and suppressing it would have been the wrong lesson:
`CLAUDE.md` names that rule because the habit moves to a query built from user input. The answer
is `$$"""…"""` plus `FormattableStringFactory.Create` — constants baked into the FORMAT, values
still parameters.

**`DailySnapshotService` stayed `internal`, and the test suite worked around it rather than the
other way round.** `Wasl.Infrastructure` has no `InternalsVisibleTo` and keeps implementations of
abstractions internal — `CLAUDE.md` records that a layer registering its own implementations is
what lets them stay that way. So the *decision* was extracted into a public
`DailySnapshotSchedule.BusinessDateFor` (pure, tested exhaustively with no host) and the
*exception safety* is tested against a real host with a throwing capture. Both are better tests
than constructing the class would have been.

**The snapshot entity is `internal` too, so the tests read the table with SQL** rather than
through EF. That is the stronger assertion anyway: it asserts what is IN the table, not what EF
maps back out of it.

## Known limitations

**No arrow for the first N days after deployment**, where N is the range. Ruled Q-2, and it is
the designed behaviour rather than a gap: `previous` is absent, and the tile looks exactly as it
does today.

**A missed capture is permanent.** If the process is down across a local midnight for longer than
the tick, that day has no row and never will — the arrow for any range spanning it is absent. Not
back-filling is the ruling (Q-1), because filing today's levels under yesterday would be
indistinguishable from a real row and wrong by a day's work. The miss is logged at `Error`.

**Deactivated users are not captured**, while `020`'s team-load card still renders one holding
open work. Deliberate: the card answers "who is holding what now"; a trend for somebody who cannot
sign in answers nothing and would grow the table by a row a day forever.

**`2 breaching` is still not built.** It was `020`'s other limitation, needs a per-ticket SLA, and
is untouched here.

**AC-16 has no test**, and `tests.md` records it as such rather than claiming it.

## What the build found that the specs did not

**The spec's own claim about the index was wrong, and then the tool disagreed with the
correction.** `spec.md` first said SQL Server needed a *filtered* index for `NULL` to mean "the
team" — written from a half-memory of PostgreSQL, where unique `NULL`s are distinct. Measured
against the running engine, SQL Server compares them as EQUAL, so a plain index is exactly right;
the spec was corrected in place with the measurement beside it.

**Then EF Core added the filter back on its own.** The generated migration said
`filter: "[ScopeUserId] IS NOT NULL"`, which excludes every team row from the constraint — the
team's snapshot could have duplicated silently, on the scope every Manager reads. `.HasFilter(null)`
suppresses it, and the control confirms EF re-adds it the moment that line goes.

**The general lesson is the sharper half:** R-1 measured the engine and was right about it, and
that was *still not enough*, because the defect lived one layer above the measurement. `CLAUDE.md`
says verify a measurement with something below it; this is the same rule met from the other side.

**`BackgroundServiceExceptionBehavior` defaults to `StopHost`** — measured, not read. A failed
dashboard snapshot would have taken the whole API down. That single measurement is why the loop
catches internally instead of relying on a global setting.

**A `sed` that matched nothing reported success**, so the DI registration silently never happened
and six tests failed with `No service for type …`. **A find-and-replace that matches nothing is a
change that did not happen** — the run is what said so.

## Board and blueprint

- `CLAUDE.md` gains a **Scheduled work** section: where the one background service lives, what
  happens when it does not run, and the four rules that must not be "simplified".
- `020`'s frozen contract gains a **Contract changes** entry for `attention.previous`, appended
  rather than edited in.
- The two blueprint defects `020` DOC-020-02 names are still open and untouched.
