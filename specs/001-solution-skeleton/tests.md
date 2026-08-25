# 001 — Test Evidence

**Run on 2026-08-25.** Every command below was executed and every result pasted from its
output. Nothing here was asserted from memory.

Environment: Windows 11 · SDK `10.0.200` (pinned by `global.json`) · SQL Server 2022
Express `16.0.1000.6` for the development loop · Docker 29.5.3 with
`mcr.microsoft.com/mssql/server:2022-latest` for the integration suite.

---

## Build

```text
$ dotnet build --no-incremental
Build succeeded.
    0 Warning(s)
    0 Error(s)
```

Warnings are errors, so zero warnings is the same statement as zero errors.

**This gate caught a real defect on its first run**, before any test existed:

```text
$ dotnet build
error NU1903: Warning As Error: Package 'Microsoft.OpenApi' 2.0.0 has a known high
severity vulnerability, https://github.com/advisories/GHSA-v5pm-xwqc-g5wc
```

`Microsoft.AspNetCore.OpenApi` (from the `webapi` template) pulls it transitively.
Resolved by **removing the package** rather than pinning around it — feature 001 has no
OpenAPI requirement, and `research.md` R-7 already puts Swashbuckle at `002`.

## Unit tests

```text
$ dotnet test tests/Wasl.Domain.Tests
Passed!  - Failed: 0, Passed: 3, Skipped: 0, Total: 3, Duration: 72 ms

$ dotnet test tests/Wasl.Application.Tests
Passed!  - Failed: 0, Passed: 5, Skipped: 0, Total: 5, Duration: 85 ms
```

## Integration tests

```text
$ dotnet test tests/Wasl.Api.IntegrationTests
Passed!  - Failed: 0, Passed: 9, Skipped: 0, Total: 9, Duration: 1 s
```

First run took 225 s including the ~1.5 GB image pull; subsequent runs, 1 s of test time.

**Total: 17 tests, 17 passed, 0 skipped.**

---

## Acceptance criteria traceability

| AC | Verified by | Result |
|---|---|---|
| AC-1 | `dotnet build --no-incremental` → `0 Warning(s), 0 Error(s)` | **Pass** |
| AC-2 | `SELECT SERVERPROPERTY(...)` through the app's own connection string; `docker compose` image confirmed present | **Pass** |
| AC-3 | `dotnet ef database update` twice — second run: `No migrations were applied. The database is already up to date.` Also asserted by `Migrations_AreIdempotent` | **Pass** |
| AC-4 | `HealthEndpointTests.Health_WhenDatabaseIsReachable_Returns200AndTheContractShape`, plus a manual `curl` | **Pass** |
| AC-5 | Manual run against a dead instance — `HTTP 503`, failing check named | **Pass** (manual; see the gap below) |
| AC-6 | `WaslApiFactory` + all of `HealthEndpointTests` and `PersistenceConventionTests` | **Pass** |
| AC-7 | `LayerDependencyTests` — 5 tests, and **proven to fail** when the boundary breaks | **Pass** |
| AC-8 | `DateTime_RoundTrips_AsUtc`, `DateTime_WithLocalKind_IsNormalisedOnWrite` | **Pass** |
| AC-9 | `.github/workflows/ci.yml` written, with the no-skip assertion | **Not verified** — no push yet |
| AC-9b | This file records the not-run state honestly; see the Docker section | **Pass** |
| AC-10 | `git grep -iE "password\|Pwd=" -- src/` → nothing | **Pass** |
| AC-11 | `Directory.Build.props`; no `TargetFramework` anywhere else | **Pass** |
| AC-12 | `INFORMATION_SCHEMA.COLUMNS` + `sys.check_constraints` + `sys.indexes`, queried | **Pass** |
| AC-13 | `dotnet --version` inside the repository → `10.0.200`, not the installed `10.0.400-preview` | **Pass** |

### AC-12, from the real schema

```text
Id            | uniqueidentifier |   -1 | -1 | -
FullName      | nvarchar         |  200 | -1 | SQL_Latin1_General_CP1_CI_AS
Email         | nvarchar         |  320 | -1 | SQL_Latin1_General_CP1_CI_AS
PhoneE164     | nvarchar         |   20 | -1 | SQL_Latin1_General_CP1_CI_AS
CompanyName   | nvarchar         |  200 | -1 | SQL_Latin1_General_CP1_CI_AS
Notes         | nvarchar         | 2000 | -1 | SQL_Latin1_General_CP1_CI_AS
IsActive      | bit              |   -1 | -1 | -
CreatedAtUtc  | datetime2        |   -1 |  3 | -
UpdatedAtUtc  | datetime2        |   -1 |  3 | -
RowVersion    | timestamp        |   -1 | -1 | -

CK_Customers_Contact | ([Email] IS NOT NULL OR [PhoneE164] IS NOT NULL)

PK_Customers | True | (none)
```

`RowVersion` reports as `timestamp` because that is SQL Server's internal name for
`rowversion`; they are the same type. Only the primary key index exists — the filtered
unique indexes are feature 007's, and a test asserts they are absent so that adding them
early is caught rather than absorbed.

### AC-5, observed

```json
{"status":"Unhealthy","totalDurationMs":3410,
 "checks":[{"name":"self","status":"Healthy","durationMs":1},
           {"name":"database","status":"Unhealthy","durationMs":3269,
            "description":"The check reported a failure."}]}
HTTP 503
```

`self` stays `Healthy` — which is the whole reason it exists. It distinguishes "the app is
up but the database is not" from "the app is down", and that distinction is what the
endpoint is for during an incident. `description` carries no exception detail.

---

## What the tests found

Four things, and they are the reason this section exists.

### 1. A high-severity advisory in a transitive package

Covered above. Found by the build gate on its first run, not by review.

### 2. The architecture test was a false negative

`LayerDependencyTests` originally asserted only over
`Assembly.GetReferencedAssemblies()`, which returns what the compiled IL **uses**. Adding
`Microsoft.EntityFrameworkCore` to `Wasl.Application` left the test **green**, because no
code in that project touched an EF Core type yet.

```text
$ dotnet add package Microsoft.EntityFrameworkCore   # deliberately
$ dotnet test tests/Wasl.Application.Tests
Passed!  - Failed: 0, Passed: 3, Skipped: 0, Total: 3      ← wrong
```

The only reason this is known is that `tasks.md` said to add the reference deliberately
and watch it go red. It did not. Fixed by also reading the declared `PackageReference`
set from the project file, which sees a reference nothing has used yet:

```text
$ dotnet test tests/Wasl.Application.Tests           # with the package still added
Failed Application_declares_no_reference_to_EF_Core_or_ASP_NET_Core
  Expected ... to be empty, but found at least one item {"Microsoft.EntityFrameworkCore"}.
Failed!  - Failed: 1, Passed: 4, Total: 5

$ dotnet remove package Microsoft.EntityFrameworkCore
$ dotnet test tests/Wasl.Application.Tests
Passed!  - Failed: 0, Passed: 5, Total: 5
```

**A guard that has not been seen to fail has not been verified.**

### 3. Two contract violations, caught before the feature closed

The first working `/health` returned:

```json
{"status":"Healthy","checks":[{"name":"database","status":"Healthy","description":null}]}
```

Against the frozen `contracts/health-api.md` that is wrong twice: the `self` check was
missing, and `description` was emitted as `null` where the contract says it is present
only on a non-healthy check — a null property is not an absent one. Both fixed in the
implementation, because the contract was frozen first and wins.

### 4. The UTC converter guarantee is narrower than it looks

`DateTime_WithLocalKind_IsNormalisedOnWrite` failed by exactly three hours:

```text
Expected read.CreatedAtUtc to be within 1ms from <2026-08-25 09:00:00>,
but <2026-08-25 12:00:00> was off by 3h.
```

The test was wrong, not the converter: it inserted with raw SQL, and **raw SQL bypasses
an EF Core value converter entirely**. Rewritten to insert through EF, it passes.

But the failure surfaced a real limitation, recorded rather than papered over: **the
write-side UTC guarantee holds only for writes that go through EF Core.** A manual
`INSERT` during support work can still store a local time, and nothing in the schema
prevents it. The honest mitigation is that every application write goes through EF; the
dishonest one would be to claim the database enforces it.

---

## Gaps, each with a reason

| Gap | Reason |
|---|---|
| **AC-9 is not verified.** The CI workflow is written but has never run | It needs a push, and pushing needs permission. It is the only AC on this feature with no observed result, and it is recorded as unverified rather than assumed |
| **AC-5 is verified manually, not by a test** | `TEST-001-07` would need the factory to boot a second host pointed at a dead connection string. Worth doing and not done here; the manual run is recorded above with its actual output |
| **`docker-compose.yml` was never started** | The development loop uses the local instance and the integration suite starts its own container, so nothing in this feature consumes the compose file. Its `ACCEPT_EULA` and healthcheck are unverified |
| **No test asserts the explicit `Email` collation does anything** | The local instance and the container both default to `CI_AS`, so a case-insensitivity test would pass with the `UseCollation` call removed. The call is kept because relying on a server default is the trap `ADR-013` row 3 describes — but this is an assertion the suite cannot currently make, and saying so is better than a test that proves nothing |
| **Deliberately untested:** that EF Core saves, that ASP.NET routes, that Docker starts containers | Testing the framework |
