# `003b-audit-least-privilege` — summary

**Delivered 2026-08-30.** 501 tests, 0 warnings. BR-9.5 is a database permission now, not a
convention.

## What was built

| # | What | Where |
|---|---|---|
| 1 | `LeastPrivilegeProvisioner` — creates `wasl_app`, grants what the application needs, denies `UPDATE`/`DELETE` on `dbo.AuditLog` | `Infrastructure/Persistence` |
| 2 | `DatabaseBootstrapper` — migrates then provisions, on the migrator connection | same |
| 3 | `--provision`, a switch beside `--seed` | `Program.cs` |
| 4 | Two connection strings: `Wasl` (restricted) and `WaslMigrator` (DDL) | `AddInfrastructure`, `appsettings.Development.json` |
| 5 | A guard that refuses to start if the two are the same value | `AddInfrastructure` |
| 6 | `/__probe/db/principal` — a **test-only** endpoint reporting the principal the pipeline holds while serving a request | test project |
| 7 | `LeastPrivilegeTests` — six, including the tamper probe | test project |

## The one thing worth reading

**Controls A and B produce identical output, and that is the whole feature.**

- **Control A** removes the `DENY` and leaves the application on `wasl_app`. Four tests fail.
- **Control B** puts the `DENY` back, perfectly correct, and moves the application to `sa`. **The
  same four tests fail with the same messages.**

SQL Server does not apply permission checks to `sysadmin` at all, so a correct `DENY` on a
`sysadmin` connection protects nothing. `003` predicted this and called it *decorative*; controls
A and B are what turned the prediction into a measurement.

Which is why the deliverable was never the `GRANT`/`DENY` pair. It is the connection string, and
the guard that stops the two strings being confused. **The four SQL statements are the half that
would have been easy to ship alone and call it done.**

## What Q-B cost, exactly as Q-B said it would

The ruling was *run the whole suite, not a probe on the audit table.* Two things broke, neither of
them the audit table:

1. **Every `POST /api/tickets`.** `dbo.TicketNumberSeq` is a **sequence**, and neither
   `db_datareader` nor `db_datawriter` covers a sequence. A principal that can read and write
   every table in the database still cannot allocate a ticket number.
2. **Four schema tests**, which read `sys.indexes` or create a throwaway table. Fixed by giving
   *them* the DBA connection — **not** by granting `wasl_app` metadata rights. Widening the
   production principal so a test can pass is how a least-privilege system stops being one.

## Deviations

| # | Spec says | Built | Reason |
|---|---|---|---|
| D-1 | The login, user, grants and denies are created **by migration** (AC-9, AC-10, AC-11) | by `--provision`, a separate command | A migration file is committed and `migrationBuilder.Sql()` takes a static string, so `CREATE LOGIN … WITH PASSWORD` in one would either commit a credential or ship a placeholder every deployment forgets. `004`'s rule — a secret has no default — cannot be honoured by a file in source control. **The cost is stated rather than discovered: `dotnet ef database update` alone no longer produces a working application**, and the quickstart has two steps |
| D-2 | — | a separate `MigrationDbContext`, then deleted | Written on the argument that a context able to run DDL *and* stamp audit actors is a category error. EF resolves migrations by the `[DbContext(typeof(...))]` attribute, so a different context found **zero** migrations, created only `__EFMigrationsHistory` and reported success — every request then failed with `Invalid object name 'SupportUsers'`. Replaced with `WaslDbContext` plus two inert stubs. **The suite disproved it in one run** |
| D-3 | `GRANT SELECT, INSERT, UPDATE, DELETE` per table | `db_datareader` + `db_datawriter` | A per-table list is a list somebody forgets to extend, and the next feature's table is then a `500` that reads as a bug in the feature. The audit `DENY` is what makes the broad grant safe, and AC-3 asserts that `DENY` beats the role |
| D-4 | Schema assertions run on the application's connection | they run on the migrator's | `wasl_app` has no `VIEW DEFINITION`, correctly — the application never inspects its own schema. See Q-B above |

## Known limitations — all of them recorded in `tests.md` as not claimed

- ~~**AC-10 is unverified.**~~ **Closed 2026-08-30** by giving it a caller — `--deprovision` — and
  measuring the whole cycle, including the `503 Unhealthy` that proves the removal was real.
- **AC-4's startup-failure half is unverified.** The throw and the placeholder check exist and
  were read, not run. `004` AC-11 was proven by an accident that has not happened here.
- **CI has not run this.** `ci.yml` was not touched and the fixture generates its own password,
  so nothing should need configuring — *should* is not *did*.
- **An intermittent test was observed and recorded**, not re-run until green:
  `Two_simultaneous_identical_creates_produce_one_201_and_one_409` failed once in four full runs.
  Whether `003b` made it more likely is **not established**.
- **`wasl_app` is broader than strictly necessary** — two roles rather than a per-table grant.
  Deliberate, D-3.

## The limit of the claim

> **This feature restricts the application, not the database administrator.**

Somebody holding `sysadmin` on SSMS can still edit the audit log, and no `DENY` changes that. A
stronger claim needs cryptographic integrity or ledger tables, and **that is a decision this
project has not made.**

Control B is why that sentence is not modesty: with the `DENY` correctly in place, a `sysadmin`
connection tampered with the log exactly as before.
