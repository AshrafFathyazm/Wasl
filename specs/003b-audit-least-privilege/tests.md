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
| AC-4 | Controls **D1**, **D2** and **D3** — run as real startup failures 2026-08-31, see below | **pass — closed 2026-08-31** |
| AC-5 | `The_application_cannot_mutate_the_audit_log`, and the live probe above | pass |
| AC-6 | **The whole integration suite, 307 tests, on the restricted connection** | pass |
| AC-7 | Live: `/health` → `Healthy`; `POST /api/tickets` → `TCK-2026-000008`; `--seed` runs | pass |
| AC-8 | `LeastPrivilegeTests.A_state_changing_request_still_writes_its_audit_row`, and `Ticket.Created / Success / manager@wasl.local` observed live | pass |
| AC-9 | `--provision` run twice against the same database; second run is a no-op | pass |
| AC-11 | A clean `--provision` on the compose container, then a working application, run rather than read | pass |
| AC-12 | `AddInfrastructure` reads only `ConnectionStrings:Wasl`; the migrator is read at the call site | pass |
| AC-14 | The guard in `AddInfrastructure` — **control C** | pass |
| AC-10 | `--deprovision`, run end to end on the compose container | **pass — closed 2026-08-30, see below** |
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
| ~~**AC-10** — `Down` revokes and drops~~ | **CLOSED 2026-08-30.** Was: *"`DeprovisionAsync` is written and has never been run … unverified, and recorded as unverified."* It has a caller now — `dotnet run --project src/Wasl.Api -- --deprovision` — and the full cycle was measured on the compose container: login and user `1|1` → deprovision → `0|0` with `Tickets` still `5` → the API's own `/health` answering **`503 Unhealthy`** → provision → `Healthy`, five tickets. **The `503` is the half that matters**: it proves the command removed something real rather than printing a message |
| ~~**AC-4, second half** — the host refuses to start without the password~~ | **CLOSED 2026-08-31.** Was: *"The `ReadPassword` throw and the placeholder check both exist and both were read. Neither was run as a startup failure, because the fixture always supplies both values."* Three controls were run instead of waiting for an accident — D1, D2 and D3 below. **Running them found two things reading them could not**, both recorded there: the required-secret list in `CLAUDE.md` is short by two, and `--provision` migrates before it reads the password |
| **AC-13, second half** — `--seed` issues its requests on the runtime connection | `--seed` was run and works. That its *requests* go through the restricted principal follows from `AddInfrastructure` registering only that string, which is AC-12 — an argument, not a separate observation |
| ~~That CI passes~~ | **DISPROVEN 2026-08-31, and the other way round: CI HAS been running this the whole time, and it is RED.** This row said the suite had not been run in CI. `gh run list` shows a run for every push — `003b` included — so the claim was never true; nothing checked. The provisioning works there: **the failure is `CustomerReadTests.Two_customers_sharing_a_name_are_each_reachable_exactly_once`**, and it is intermittent across commits that changed only documentation (`ce79c16` green, `f05f902` red). Root cause measured, and it is the trap `CLAUDE.md` records as having already recurred twice: `Marker()` is `$"m{Guid.CreateVersion7():N}"[..12]`, which is the leading **timestamp** of a v7 GUID — **2000 markers minted in a loop produced 2 distinct values, one of them used 1999 times.** Fourteen tests in that class seed a customer whose `FullName` carries the marker, and `FullName` is a searched column, so `?search={marker}` matches other tests' rows and the two-page traversal stops covering the two it seeded. The product's ordering is not at fault: `.OrderBy(FullName).ThenBy(Id)` is a total order. **FIXED 2026-08-31** — `Marker()` now uses `RandomNumberGenerator`, the identical line `007` already used. Suite green at 538/538 |
| That `wasl_app` has exactly the permissions it needs and no more | It holds `db_datareader` + `db_datawriter`, which is broader than a hand-written per-table grant. Deliberate: a per-table list is a list somebody forgets to extend, and the next feature's table becomes a `500` that reads as a bug in the feature. **The audit `DENY` is what makes the broad grant safe**, and AC-3 asserts that it wins |

## The limit of the claim

> **This feature restricts the application, not the database administrator.**

Somebody holding `sysadmin` on SSMS can still edit the audit log, and no `DENY` changes that.
A stronger claim needs cryptographic integrity or ledger tables, and that is a decision this
project has not made.

Control B is the evidence that this sentence is not modesty: with the `DENY` correctly in place,
a `sysadmin` connection tampered with the log exactly as before.

---

## AC-10, closed 2026-08-30 — and why it took a switch rather than a test

It was recorded as *"written and has never been run"*, with a real reason: a test that called
`DeprovisionAsync` would drop the login out from under the shared fixture, and every class after
it in the collection would fail on a connection error rather than on anything it asserted.

**That reason justified not writing the test. It did not justify never running the method** — and
this project's own rule is that a guard nobody has seen fail has not been verified. A method
nothing invokes is a method nothing has proven.

So it got a caller: `dotnet run --project src/Wasl.Api -- --deprovision`, beside `--provision`.
That makes it a real operation for a torn-down environment **and** makes the claim measurable
without a shared container.

```text
before            Login 1  |  DbUser 1
--deprovision     wasl_app deprovisioned. The schema and its data are untouched.
after             Login 0  |  DbUser 0  |  Tickets 5

then the API, unchanged, on the same connection string:
GET /health   ->  503     Health check database with status Unhealthy
--provision   ->  Schema applied and wasl_app provisioned.
GET /health   ->  Healthy
GET /api/tickets  ->  totalCount 5
```

**The `503` is the half that matters.** Reading `Login 0` proves two `DROP` statements executed;
the API losing its own health check proves the thing removed was the thing the application
depends on. Without it, a `DeprovisionAsync` that dropped some *other* principal would produce
identical row counts.

**It does not drop the database or the schema, deliberately.** Undoing the principal is a
permissions operation; undoing the data is `dotnet ef database drop`. Merging them would mean one
mistyped flag destroying a database somebody wanted — and the `Tickets 5` above is the assertion
that they stayed separate.

---

## AC-4, closed 2026-08-31 — three controls, and what running them found that reading them had not

The criterion was *the host refuses to start without the password*, and it sat unclaimed with an
honest reason: the integration fixture always supplies every secret, so no test can reach the
failure, and `004` AC-11 had only been proven by an **accident** — `dotnet ef` happening to fail
for a missing key. **Waiting for a second accident is not verification.**

Each control removes exactly one value and supplies every other. `ASPNETCORE_ENVIRONMENT=Production`
is the lever that makes a secret genuinely **absent** rather than blank: user secrets load only in
Development, so nothing in the developer's own secret store had to be touched.

`--no-launch-profile` is the second half of the method, and it is not optional. Without it
`dotnet run` prints *"Using launch settings from launchSettings.json"* and applies that file's
environment on top of the one the control set — so the control silently measures Development while
reporting itself as Production. The first attempt did exactly that and produced **no output at
all**, which is the only reason it was noticed.

### Control D1 — `Database:AppPassword` absent

```text
Unhandled exception. System.InvalidOperationException: 'Database:AppPassword' is not
configured. It is the password for the restricted 'wasl_app' principal the application runs
as, and it has no default by design. Set it with: dotnet user-secrets -p src/Wasl.Api set
"Database:AppPassword" "<a password>"
   at LeastPrivilegeProvisioner.ReadPassword(IConfiguration)  LeastPrivilegeProvisioner.cs:173
   at DatabaseBootstrapper.RunAsync(IConfiguration, CancellationToken)  DatabaseBootstrapper.cs:60
   at Program.<Main>$(String[])  Program.cs:71
```

Names the key, gives the command, and **never echoes a value** — which is the half reading could
not settle, because the throw is one interpolated string and the password is in scope on the line
above it.

### Control D2 — the connection string still carries the placeholder

```text
Connection string 'Wasl' still contains the placeholder 'REPLACED_BY_USER_SECRET'. Set the
real one, which is never committed: dotnet user-secrets -p src/Wasl.Api set
"Database:AppPassword" "<a password>" then set "ConnectionStrings:Wasl" with the same
password and User Id=wasl_app, then run: dotnet run --project src/Wasl.Api -- --provision.
   at DependencyInjection.AddInfrastructure(...)  DependencyInjection.cs:70
```

### Control D3 — no runtime connection string at all

```text
Connection string 'Wasl' is not configured. See specs/001-solution-skeleton/quickstart.md.
   at DependencyInjection.AddInfrastructure(...)  DependencyInjection.cs:59
```

Three distinct messages from three distinct lines. **D2 and D3 are separate on purpose**: a fresh
clone that has copied the development file hits D2 and needs to be told about a secret, while a
deployment that configured nothing hits D3 and needs to be told about a connection string. One
guard covering both would hand the wrong sentence to one of them.

### The measured order of every startup guard

Not reasoned from the registration order — **observed**, one control at a time, each run fixing
the value the previous run complained about:

| # | Guard | Where |
|---|---|---|
| 1 | `ConnectionStrings:Wasl` present | `DependencyInjection.cs:59` |
| 2 | ...and not the placeholder | `DependencyInjection.cs:70` |
| 3 | ...and not identical to `WaslMigrator` | `DependencyInjection.cs:93` — Control C, proven at delivery |
| 4 | `Seed:ManagerPassword`, `Seed:AgentPassword`, `Seed:AgentTwoPassword` present and at least 8 characters | `SeedOptions.cs:72,80` |
| 5 | `Database:AppPassword` present | `LeastPrivilegeProvisioner.cs:173` |

### Two things the controls found that reading could not

**1 · The required-secret list in `CLAUDE.md` was short by two.** It named `Jwt:SigningKey`,
`Seed:ManagerPassword` and `Seed:AgentPassword`. There are **five**: `011` added
`Seed:AgentTwoPassword` for its second Agent and `003b` added `Database:AppPassword`, and neither
release updated the list. Somebody following `CLAUDE.md` on a fresh clone sets three secrets and
is then refused twice more — by two guards that each name their own key correctly, so the fix is
obvious every time and the document is simply wrong three times over. Found because D1 had to be
**run four times**, each run naming the next missing key. Corrected in the same commit.

**2 · `--provision` migrates BEFORE it reads the password.** `ReadPassword` is evaluated as an
argument to `ProvisionAsync` on line 60, after `MigrateAsync` on line 57. So a clone missing only
`Database:AppPassword` ends up with a **fully migrated schema and no `wasl_app` principal**, and
the message says nothing about the schema having been applied. It is idempotent, so setting the
secret and re-running finishes the job — but the intermediate state is one the message does not
describe. **Confirmed on a genuinely fresh database 2026-08-31**, in the clean-clone walkthrough this row
deferred it to: with `Database:AppPassword` unset, `--provision` created the database, applied all
**7 tables** and **8 migrations**, left `wasl_app` a principal in it **zero** times, and then
refused. A finished-looking schema with no principal — and that is one of the three causes of the
single sentence `Login failed for user 'wasl_app'`.

---

## The intermittent test, followed up 2026-08-31 — ten runs, and why it is still not settled

`CreateCustomerTests.Two_simultaneous_identical_creates_produce_one_201_and_one_409` — `007`
AC-13 — was recorded above as **one failure in four full runs**, cause not established. Ten
consecutive full-suite runs were done to settle it.

```text
run  1   538 passed   0 failed   3 suites
run  2   538 passed   0 failed   3 suites
run  3   538 passed   0 failed   3 suites
run  4   538 passed   0 failed   3 suites
run  5   538 passed   0 failed   3 suites
run  6   538 passed   0 failed   3 suites
run  7   538 passed   0 failed   3 suites
run  8   538 passed   0 failed   3 suites
run  9   538 passed   0 failed   3 suites
run 10   538 passed   0 failed   3 suites
```

`Skipped: 0` in all three suites on every run, which is the only evidence available that the test
in question actually executed: **a passing test is not named in the output**, so the log cannot be
grepped for it. Stated rather than glossed.

### The harness was verified before its result was believed

Ten green runs reported by a loop whose own summary line printed `passed=?` for all ten — the
arithmetic was silently broken while the verdict looked confident. That is the shape of every
lying tool this project has recorded, so the loop was tested against a real failure before its
output was used: one Domain assertion inverted, `TicketStatus.Open` to `TicketStatus.Closed`.

```text
exit=1
parser says: passed=176 failed=1
Failed Wasl.Domain.Tests.Tickets.ChangeStatusTests
       .A_permitted_transition_moves_the_status_and_returns_a_history_row
```

Exit code, count and name all reacted. Reverted, rebuilt with `--no-incremental`, 177/177.

### What this establishes, and what it does not

**Does not reproduce.** One failure in fourteen observed full runs now, and none in ten under
stable conditions.

**It is not called fixed and it is not called noise.** The two sets of runs were not made under
the same conditions: the original failure happened during `003b`'s own development, in a session
where the schema and the database principal were being changed between runs, while these ten ran
against a database that was already migrated and provisioned and was not touched.

### The reason this cannot be closed is a recording gap, not a measurement gap

The original observation is four words — `run 2 FAIL` — and **the failure output was never
captured.** So the failure mode is unknown: whether both requests got `201` (a real BR-4.8 hole),
whether both got `409` (a pre-check ordering problem), whether it was a timeout, or whether it was
a `SqlException` from the shared container. Each of those has a different cause and a different
fix, and a repro attempt without that string is searching blind — which is what ten green runs
cost.

**So the actionable output of this follow-up is an instruction rather than a verdict:** when this
test next fails, keep the whole `Error Message` and `Stack Trace` block before re-running
anything. This project's rule is *never write down a result that was not observed*; this is its
neighbour — **a result that was observed and not captured is a result nobody can use.**

`specs/007-create-customer/tests.md` owns AC-13 and was deliberately **not** edited: the frontend
lane has uncommitted work in that file, and two lanes writing one file is how a commit sweeps in
somebody else's change.

---

## A defect this feature shipped with, found 2026-08-31 — FIXED the same day, see the section below

> **`--provision` can report success and leave the application unable to log in.**

`ProvisionAsync` guards the login like this:

```sql
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = @user)
BEGIN
    ... CREATE LOGIN [wasl_app] WITH PASSWORD = ..., CHECK_POLICY = OFF
END
```

**`sys.server_principals` is server-scoped, and the password is only ever written on creation.**
So if a `wasl_app` login already exists anywhere on that SQL Server, `CREATE LOGIN` is skipped and
the **existing** password is kept. `CREATE USER`, the two role memberships, the sequence `GRANT`
and the audit `DENY` all then succeed against the new database, and the command prints:

```text
Schema applied and wasl_app provisioned.
```

The application cannot connect.

### Measured, both directions

A second clone was provisioned against its own separate database with its own new password:

```text
dotnet run --project src/Wasl.Api -- --provision
  -> Schema applied and wasl_app provisioned.

dotnet run --project src/Wasl.Api -- --seed
  -> Microsoft.Data.SqlClient.SqlException (0x80131904): Login failed for user 'wasl_app'.
```

Then the same connection string, same database, with the **first** clone's password substituted
and nothing else changed:

```text
dotnet run --project src/Wasl.Api -- --seed
  -> Seeded 3 customers ...
```

Which is the whole proof: the principal works, and it works with a password that `--provision`
was never given.

### Three real triggers, not a contrived one

| Trigger | What happens |
|---|---|
| **Password rotation** — set a new `Database:AppPassword`, re-run `--provision` | Reports success. Application is dead. The documented recovery *is* `--provision` |
| **Two databases on one server** — a second environment, a clean-clone check, a colleague's box | Whichever was provisioned second inherits the first's password |
| **A forgotten password** — set a new one, re-provision | Told it worked |

### Why it stayed invisible through delivery and three negative controls

`003b`'s controls all ran against **one** database on a server where the login was created by the
**first** `--provision`, so `CREATE LOGIN` and the password were always in agreement. The
integration fixture generates a password per run — but it also runs against a container whose
login does not exist yet, so the same agreement holds. **Nothing in the feature ever provisioned
twice with two different passwords**, which is the only shape that shows it.

### And the symptom is a sentence three causes share

`Login failed for user 'wasl_app'` is produced by:

1. `--provision` never run.
2. `--provision` run and refused for a missing secret **after** the migration — so the schema is
   there and the database looks finished (measured above, AC-4).
3. This defect.

`quickstart.md` documented only cause 1, and its recovery — re-run `--provision` — is a no-op for
2 and reports success for 3. All three rows are in its troubleshooting table now.

### Not fixed, and what fixing it would mean

Two candidate shapes, and **choosing between them is a decision, not a cleanup**:

- **`ALTER LOGIN ... WITH PASSWORD`** when the login exists — makes the command genuinely
  idempotent with respect to the password. It also means `--provision` silently rewrites a
  credential other databases on that server may be using.
- **Detect and refuse** — try the runtime connection after provisioning and fail with a sentence
  naming `--deprovision`. Safer, and it turns a silent success into a loud failure, which is this
  project's stated preference.

`--deprovision` then `--provision` is the recovery today, and it is **not safe as a blanket
instruction**: the login is server-scoped, so dropping it breaks every other database using it.

**FIXED 2026-08-31 after the product owner chose between the two shapes: verify, do not repair.**
Controls E1 and E2 in the next section, and the guard turned the whole suite red on its first run
before it turned it green.

---

## Both defects fixed 2026-08-31, and each guard was seen to fail first

538 tests, 0 warnings, built with `--no-incremental`.

```text
Wasl.Domain.Tests            Failed: 0   Passed: 177   Total: 177
Wasl.Application.Tests       Failed: 0   Passed:  26   Total:  26
Wasl.Api.IntegrationTests    Failed: 0   Passed: 335   Total: 335
                                         ─────────────────────────
                                         Passed: 538   Total: 538
```

### Fix 1 — the login password. `VerifyRuntimeLoginAsync`, and why it verifies rather than repairs

`--provision` now opens the **runtime** connection as its last act, so a success message means the
principal it just configured actually works.

**The alternative was `ALTER LOGIN … WITH PASSWORD` when the login exists**, which would make the
command genuinely idempotent — and would silently rewrite a credential other databases on the same
server may be using. This repository refuses loudly everywhere else it had that choice: the host
will not start without a secret, the migrator has **no** fallback to the runtime string, and a
plausible error envelope was recorded as *worse* than an empty one. So: no repair, one sentence
naming the cause and the recovery, and the `SqlException` kept as the inner exception.

#### Control E1 — a `wasl_app` login that already exists with a different password

The exact scenario measured before the fix, which had printed *"Schema applied and wasl_app
provisioned."*:

```text
System.InvalidOperationException: Provisioning finished, but 'wasl_app' cannot log in — so
the application would not start. The likely cause is that this SQL Server ALREADY had a
'wasl_app' login with a DIFFERENT password: the login is server-scoped and its password is
only written when it is created, so 'Database:AppPassword' was applied to nothing and every
other grant still succeeded. Fix: run 'dotnet run --project src/Wasl.Api -- --deprovision'
and then '--provision' again — but ONLY if no other database on this server uses
'wasl_app', because dropping a server-scoped login breaks all of them.
 ---> Microsoft.Data.SqlClient.SqlException: Login failed for user 'wasl_app'.
      Error Number:18456,State:1,Class:14
```

No password and no connection string in the message — `002`'s rule, and this one is printed to a
console.

#### Control E2 — the runtime and migrator naming different databases

**The first attempt at this control did not fail, and that is a recorded limit rather than a
tidied-away detail.** Pointing the runtime at `master` printed *success*: `wasl_app` can connect
to `master` through the `public` role. So the guard proves *the principal can log in*, **not**
*the principal can use the application's database*. Retried against a database where `wasl_app`
has no user at all:

```text
System.InvalidOperationException: Provisioning finished and 'wasl_app' can log in, but the
database named in 'ConnectionStrings:Wasl' refused it — the login exists at server level and
has no user in that database. This means the runtime and migrator connection strings name
DIFFERENT databases: --provision created the user in the migrator's one.
 ---> SqlException: Cannot open database "WaslNoUser" requested by the login. The login failed.
      Error Number:4060,State:1,Class:11
```

#### The guard verified itself on its first suite run

`WaslApiFactory` goes through `DatabaseBootstrapper.RunAsync`, so the check is on the path every
integration test takes — which was the point of putting it there. **Its first run turned all 335
integration tests red**, because the fixture's provisioning configuration carried the migrator
string and the password but not the runtime string:

```text
System.InvalidOperationException : Connection string 'Wasl' is not configured, so
provisioning cannot verify that the principal it created works.
   at DatabaseBootstrapper.RuntimeConnectionString(IConfiguration)  DatabaseBootstrapper.cs:87
   at WaslApiFactory.InitializeAsync()  WaslApiFactory.cs:75
```

Fixed by giving that configuration `ConnectionStrings:Wasl` from the fixture's own
`RestrictedConnectionString()` — which it already had. **Not** by letting the check skip when the
string is absent: a guard that quietly does nothing is the thing this feature was written against.

### Fix 2 — `Marker()`, the third recurrence of a documented trap

`CustomerReadTests.Marker()` was `$"m{Guid.CreateVersion7():N}"[..12]`, and it is now
`$"m{Convert.ToHexString(RandomNumberGenerator.GetBytes(6)).ToLowerInvariant()}"` — the identical
line `007` already used for the identical reason.

The measurement that settled it:

```text
2000 markers minted in a tight loop -> 2 distinct
colliding markers: 1, worst reuse: 1999
  m01a05709332 used 1999 times
```

The leading twelve hex digits of a version-7 GUID are its 48-bit millisecond timestamp, so this
was a clock with roughly 16 ms of resolution rather than a discriminator. Fourteen tests in that
class seed a customer whose `FullName` carries the marker, and `FullName` is a searched column —
so once two share a marker, `?search={marker}` returns another test's rows.

**It broke CI and never a local run**, which is why it survived: a fast Release runner lands
consecutive tests inside one 16 ms window, and ten consecutive local Debug runs did not.
`.OrderBy(FullName).ThenBy(Id)` was correct throughout; the product was never at fault.

`008` recorded this trap as a search-term prefix and `007` hit it again as an email local-part.
**Written down twice, repeated a third time, in the test file of the feature that recorded it
first** — and the only reason it was found is that the CI result was finally read.
