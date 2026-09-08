# 020b — AI Usage and Audit

**Phase:** Delivered · **Status:** both lanes built and verified 2026-09-08

Be specific. "AI helped and I reviewed it" is worthless. Name the artifact, the suggestion, and
what was wrong with it.

---

## What AI wrote, and what changed after review

| Artifact | AI produced | Changed after review |
|---|---|---|
| `spec.md`, `research.md`, `data-model.md`, `plan.md` | All of it | The spec's index claim was **wrong** and was corrected by measurement, not by re-reading — see below |
| `DashboardDailySnapshot` + configuration + migration | All of it | `.HasFilter(null)` added after reading the generated migration. Without it the feature shipped broken |
| `DashboardTrendPredicates` | All of it | Extracted from `020` unchanged, verified by `020`'s own 30 tests |
| `DashboardSnapshotCapture` | All of it | The first version's retry updated only `CapturedAtUtc`, contradicting its own doc comment; rewritten to re-run the whole statement pair once. Its `Task<int>` return was dropped — a count is a presence assertion, and `CLAUDE.md` says assert content |
| `DailySnapshotService` | All of it | The day-selection logic was extracted into a public `DailySnapshotSchedule` so the service could stay `internal` |
| `TrendArrow` | All of it | `higherIsWorse` has **no default** — a default would be the inference the component exists to refuse, hidden one level down |
| Tests (4 new files) | All of it | Three assertions were wrong; each is recorded in `tests.md` rather than quietly fixed |

## Accepted, after verification against a source file or the running system

| Claim | Verified against |
|---|---|
| SQL Server compares `NULL`s as EQUAL in a unique index | **Measured** on the running container: error 2601 on the second `(date, NULL)` |
| EF Core adds `IS NOT NULL` to a unique index over a nullable column | **Measured** — read out of the generated migration, then re-confirmed by a control |
| `BackgroundServiceExceptionBehavior` defaults to `StopHost` | **Measured** — compiled and printed `new HostOptions().BackgroundServiceExceptionBehavior` |
| `PeriodicTimer` takes a `TimeProvider` on net10.0 | **Measured** — compiled the overload |
| No seeder writes a `TicketHistory` row | Grepped all six files in `Persistence/Seed/`; zero matches |
| Escalation is monotonic (no de-escalate) | Only `IsEscalated = false` in the codebase is `Ticket.Create`'s initial value |
| No scheduler existed before this | Grepped `src/` for `IHostedService`, `BackgroundService`, Hangfire, Quartz, cron — nothing |
| An Infrastructure-owned entity has no `DbSet` and is reached via `context.Set<T>()` | `IdempotencyRecord` and `IdempotencyStore` |
| The visibility convention: implementations internal, named types public | Enumerated every class in `Wasl.Infrastructure` |
| `db_datawriter` already covers a new table | `LeastPrivilegeProvisioner`'s per-role grant |

## Rejected

| Suggestion | Why |
|---|---|
| Reconstruct past levels from `dbo.TicketHistory` | Two measurements killed it: no seeder writes a history row, and `016` is unbuilt so no `Escalated` event exists. It would be confidently wrong on the demo data |
| Redefine the delta as a flow ("created this period vs last") | A different number from the one above it. A plausible arrow pointing at the wrong thing |
| `MERGE` for the upsert | Not atomic against a concurrent insert without `HOLDLOCK`; correctness living in a lock hint is correctness somebody deletes |
| `BackgroundServiceExceptionBehavior = Ignore` | Global. It would silence the next background service too |
| Back-fill a missed day from current state | The reconstruction defect wearing a different hat |
| Suppress EF1002 to keep `SqlQueryRaw` | `CLAUDE.md` names that rule and its reason. The analyser was right; the code changed |
| Make `DailySnapshotService` public for the test | Spends the internal-implementation property to save a few lines. The decision was extracted instead |
| `previous ?? 0` in the arrow | Turns "no answer" into "it was zero" and puts a ▲12 under a tile never compared to anything |
| A generic `delta > 0 ? 'bad' : 'good'` | Already false for half this product's metrics, and a guard now scans for it |

## Hallucination risks caught

| Risk | Caught by |
|---|---|
| The claim that SQL Server needs a filtered index for NULL semantics | A measurement. It was in the spec, stated confidently, and wrong |
| `ExecuteSqlAsync` returning the value of a trailing `SELECT COUNT(*)` | Reading the API: it returns rows affected. The interface's return value was dropped rather than made to lie |
| `DashboardDailySnapshot.For(...)` usable from the test project | The compiler — CS0122, inaccessible |
| `Microsoft.Extensions.Time.Testing` being available | The compiler. The dependency was avoided rather than added |
| A `sed` insertion that silently matched nothing | Six failing tests naming the missing service |

## Context provided

Only files in this repository, plus the two design canvases from the session. **No secrets, no
connection strings, no tokens, no customer data.** The `sa` password used for the two `sqlcmd`
probes is the throwaway already committed in `docker-compose.yml`.
