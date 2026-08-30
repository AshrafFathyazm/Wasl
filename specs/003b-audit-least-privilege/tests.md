# `003b-audit-least-privilege` — test evidence

**Run:** 2026-08-30, Windows 11, .NET 10.0.200 SDK, SQL Server 2022 via `Testcontainers.MsSql`
(one container for the whole integration suite) plus one `docker compose` container for the
manual probes.

```text
dotnet build --no-incremental      0 Warning(s)   0 Error(s)
dotnet test --no-build

Wasl.Domain.Tests            Failed: 0   Passed: 177   Total: 177     380 ms
Wasl.Application.Tests       Failed: 0   Passed:  17   Total:  17     677 ms
Wasl.Api.IntegrationTests    Failed: 0   Passed: 307   Total: 307    1 m 10 s
                                         ─────────────────────────
                                         Passed: 501   Total: 501
```

Before `003b`: 495. **And the 301 integration tests that already existed now run as
`wasl_app`** — which is AC-6, and is most of what this feature is.

---

## The measurement, before and after, on the same two statements

Before, on the connection the application actually used:

```text
ServerPrincipal | DbUser | IsSysadmin | IsDbOwner | CanUpdate | CanDelete
sa              | dbo    | 1          | 1         | 1         | 1

UPDATE TOP (1) dbo.AuditLog SET Action = 'TAMPERED';   -- RowsUpdated: 1
DELETE TOP (1) FROM dbo.AuditLog;                      -- RowsDeleted: 1
```

After `--provision`, same container, same statements:

```text
ServerPrincipal | IsSysadmin | IsDbOwner | CanUpdate | CanDelete | CanInsert
wasl_app        | 0          | 0         | 0         | 0         | 1

Msg 229, Level 14, State 5 — The UPDATE permission was denied on the object 'AuditLog',
                             database 'Wasl', schema 'dbo'.
Msg 229, Level 14, State 5 — The DELETE permission was denied on the object 'AuditLog',
                             database 'Wasl', schema 'dbo'.

SELECT COUNT(*) FROM dbo.AuditLog  -->  108
```

Refused for writing, still readable, still appendable. `003`'s statement — *"append-only by
application convention, not by database permission"* — is no longer true, and both halves of that
were measured rather than argued.

---

## Acceptance criteria → named tests

| AC | Test | Result |
|---|---|---|
| AC-1 | `LeastPrivilegeTests.The_application_cannot_mutate_the_audit_log` (`UPDATE`, `DELETE`) | pass |
| AC-2 | `LeastPrivilegeTests.The_request_principal_is_neither_sysadmin_nor_db_owner` — **through the API**, via `/__probe/db/principal` | pass |
| AC-3 | `LeastPrivilegeTests.The_deny_beats_the_role_grant` | pass |
| AC-4 | `LeastPrivilegeProvisioner.ReadPassword` throws naming the key; the placeholder check in `AddInfrastructure` | **partial — see below** |
| AC-5 | `The_application_cannot_mutate_the_audit_log`, and the live probe above | pass |
| AC-6 | **The whole integration suite, 307 tests, on the restricted connection** | pass |
| AC-7 | Live: `/health` → `Healthy`; `POST /api/tickets` → `TCK-2026-000008`; `--seed` runs | pass |
| AC-8 | `LeastPrivilegeTests.A_state_changing_request_still_writes_its_audit_row`, and `Ticket.Created / Success / manager@wasl.local` observed live | pass |
| AC-9 | `--provision` run twice against the same database; second run is a no-op | pass |
| AC-11 | A clean `--provision` on the compose container, then a working application, run rather than read | pass |
| AC-12 | `AddInfrastructure` reads only `ConnectionStrings:Wasl`; the migrator is read at the call site | pass |
| AC-14 | The guard in `AddInfrastructure` — **control C** | pass |
| AC-10 | `LeastPrivilegeProvisioner.DeprovisionAsync` exists and is written | **not claimed — see below** |
| AC-13 | `--seed` uses the migrator only to bootstrap | **partial — see below** |

---

## Negative controls — three, and control B is the one that matters

### Control A — the `DENY` removed, runtime still `wasl_app`

```text
Failed: 4, Passed: 2

  The_application_cannot_mutate_the_audit_log (UPDATE)
      Expected a <SqlException> to be thrown, but no exception was thrown.
  The_application_cannot_mutate_the_audit_log (DELETE)
      Expected a <SqlException> to be thrown, but no exception was thrown.
  The_deny_beats_the_role_grant
      Expected HAS_PERMS_BY_NAME(…,'UPDATE') to be 0, but found 1.
  The_request_principal_is_neither_sysadmin_nor_db_owner
      Expected canUpdateAuditLog to be 0 …, but found 1.
```

`db_datawriter` alone makes the table writable. The `DENY` is what overrides the role, which is
AC-3 stated as a failure.

### Control B — the `DENY` fully in place, runtime back on `sa`

```text
Failed: 4, Passed: 2

  … the identical four failures, with the identical messages.
```

**This is the feature.** With the permission correctly applied and the application connecting as
`sysadmin`, the audit log is exactly as mutable as it was before any of this existed — because
SQL Server does not apply permission checks to `sysadmin` at all.

`003` predicted this and used the word *decorative*. Controls A and B are indistinguishable in
their output, and that is the point: **the connection string is the load-bearing half, and the
four SQL statements are the half that would have been easy to ship alone and call it done.**

### Control C — the two connection strings made identical

```text
System.InvalidOperationException : Connection string 'Wasl' is identical to 'WaslMigrator'.
The runtime connection must use the restricted 'wasl_app' principal; the migrator connection
carries DDL rights and belongs only to --provision, --seed and the integration fixture.
```

The host refuses to build. AC-14, and the enforcement behind the product owner's condition that
*a second connection string that exists inside the application is a second connection string
somebody will use.*

All three reverted, rebuilt with `--no-incremental`, whole suite re-run: **501 / 501.**

---

## What Q-B predicted, and what it actually cost

> *Assume it does break somewhere, and that finding out is the point.*

It did, in two places, and neither was the audit table:

| What broke | Why | Fix |
|---|---|---|
| **Every `POST /api/tickets`** | `dbo.TicketNumberSeq` is a **sequence**, and neither `db_datareader` nor `db_datawriter` covers one. A principal that can read and write every table still cannot allocate a ticket number | `GRANT UPDATE ON OBJECT::dbo.TicketNumberSeq` |
| **Four schema tests** | They read `sys.indexes` or create a throwaway table. `wasl_app` has no `VIEW DEFINITION` and no DDL — correctly, because the application never inspects its own schema | They use the **migrator** connection now. **Not** a wider grant: giving production a permission only the suite wanted is how a least-privilege system stops being one |

A probe on `dbo.AuditLog` alone would have found neither. AC-6 is the criterion that did.

---

## A design that the suite disproved in one run

`003b` first migrated through a separate `MigrationDbContext`, on the argument that a context able
to run DDL *and* stamp audit actors is a category error.

**EF resolves migrations by the `[DbContext(typeof(...))]` attribute the scaffolder writes.** A
different context type finds **zero** migrations, creates only `__EFMigrationsHistory`, and
reports success. Every request then failed with:

```text
Microsoft.Data.SqlClient.SqlException : Invalid object name 'SupportUsers'.
```

Not a permissions error — there were no tables to be refused. `MigrationDbContext` was deleted and
`WaslDbContext` is constructed by hand with two inert stubs: a clock that throws if anything asks
it for the time, and an actor that returns nulls. The stubs are safe for the same reason the
argument was wrong: those dependencies are read by `SaveChanges` stamping, and a migration calls
no `SaveChanges`.

The `NoActor` stub returns nulls rather than a fabricated identity, which is ADR-005's rule — this
project rejected a seeded "system" user by name, and `004` closed its audit gap by building a real
identity rather than inventing one. A migration genuinely has no actor.

---

## Observed, not staged: an intermittent failure

`CreateCustomerTests.Two_simultaneous_identical_creates_produce_one_201_and_one_409` — `007`
AC-13, the project's first concurrency test — **failed once in four full runs** and passed alone
every time.

```text
run 1   pass      (alongside the four schema failures)
run 2   FAIL
run 3   pass
run 4   pass
```

**Recorded rather than re-run until green.** It races two identical creates against a filtered
unique index in a database shared with 300 other tests, so timing is genuinely variable — but
whether `003b` made it more likely is **not established**, and claiming either way would be
guessing. It is a real intermittency in the suite, it predates nothing that can be proven, and it
is the kind of thing that becomes a mystery if the first person to see it says nothing.

---

## Not claimed

| What | Why |
|---|---|
| **AC-10** — `Down` revokes and drops | `DeprovisionAsync` is written and **has never been run.** Nothing calls it, and a test that called it would drop the login out from under the shared fixture. Written so the reverse exists; **unverified, and recorded as unverified** |
| **AC-4, second half** — the host refuses to start without the password | The `ReadPassword` throw and the placeholder check both exist and both were read. **Neither was run as a startup failure**, because the fixture always supplies both values. `004` AC-11 was proven by accident when `dotnet ef` failed for a missing key; this one has had no such accident |
| **AC-13, second half** — `--seed` issues its requests on the runtime connection | `--seed` was run and works. That its *requests* go through the restricted principal follows from `AddInfrastructure` registering only that string, which is AC-12 — an argument, not a separate observation |
| That CI passes | **The suite has not been run in CI with this change.** `ci.yml` was not touched, and the fixture generates its own password per run, so nothing should need configuring — but *should* is not *did* |
| That `wasl_app` has exactly the permissions it needs and no more | It holds `db_datareader` + `db_datawriter`, which is broader than a hand-written per-table grant. Deliberate: a per-table list is a list somebody forgets to extend, and the next feature's table becomes a `500` that reads as a bug in the feature. **The audit `DENY` is what makes the broad grant safe**, and AC-3 asserts that it wins |

## The limit of the claim

> **This feature restricts the application, not the database administrator.**

Somebody holding `sysadmin` on SSMS can still edit the audit log, and no `DENY` changes that.
A stronger claim needs cryptographic integrity or ledger tables, and that is a decision this
project has not made.

Control B is the evidence that this sentence is not modesty: with the `DENY` correctly in place,
a `sysadmin` connection tampered with the log exactly as before.
