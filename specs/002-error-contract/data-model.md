# 002 — Data Model

## There is no schema change in this feature

**No table, no column, no index, no constraint, no migration.** Stated explicitly rather
than by omission, because "no data-model.md" and "a data-model.md that says none" are
different claims, and only the second one has been checked.

**Migration name:** none. `dotnet ef migrations list` returns the same single
`InitialCreate` from `001` before and after this feature, and `DOC-002-04` records that as
the evidence.

## Why nothing is stored

| Thing that might look like state | Where it actually lives |
|---|---|
| The `type` URI registry | A `static readonly` table in `Wasl.Api/Common/Errors/ProblemTypes.cs`. It is part of the contract, so it belongs in the artifact that is versioned, reviewed, and diffable — not in rows an operator can edit without a code review. A row changing under a running client is a silent contract break |
| Error message text | `Wasl.Api/Common/Errors/ProblemMessages.cs` in this feature, `.resx` from `005`. ADR-007 rejected database-stored translations outright: it needs an admin UI to be worth anything, adds a query per request, and puts strings outside version control where they cannot be reviewed |
| The `traceId` | Derived per request from `Activity.Current` or `HttpContext.TraceIdentifier`, never persisted. `003` persists a **copy** onto its own audit row (BR-9.9); this feature only exposes the accessor both read |
| The audit row for a `401`/`403` | `003-audit-trail` owns the `AuditLog` table and its columns, including `TraceId` |
| Validation failures | Per request, in memory, thrown and mapped. Persisting them would create a table nobody queries |

## What this feature reads from the database

**Nothing.** No `DbSet` is touched on any path in `Common/Errors/` or
`Common/Behaviors/ValidationBehavior.cs`.

That is a load-bearing property, not a coincidence. The error path is the path that runs
when things are already broken — including when the database is the thing that is broken. A
handler that resolved a message from a table would return `500 errors/internal` for every
error whenever SQL Server was unreachable, replacing a diagnosable `409` with an
undiagnosable `500` at exactly the moment someone needs the truth.

`REV-002-01` checks this by reading the folder rather than by trusting it: no `WaslDbContext`
injection, no `IServiceProvider` resolution of one, in any type under `Common/Errors/`.

## Types this feature would have used, had it needed any

Recorded so that `003`, which does add a table carrying a `TraceId`, inherits a decided
answer rather than choosing one:

| Value | SQL Server type | Reason |
|---|---|---|
| `TraceId` | `nvarchar(64)` | A W3C trace-context id is 55 characters (`00-` + 32 hex + `-` + 16 hex + `-01`); Kestrel's `TraceIdentifier` is shorter. `nvarchar` rather than `varchar` by the project-wide rule, even though the value is ASCII — one rule with no exceptions beats a rule with one, and the exception is what gets copied |
| A `type` URI, if ever stored | `nvarchar(200)` | Not stored. Listed so `003` records the **code** (`duplicate-customer`), not the URI: the code is the stable identity and the URI is a rendering of it |

## Consequence for verification

This feature is verified entirely by HTTP responses, log output, and assembly inspection.
`dotnet ef database update` is unaffected, and the integration suite still needs a real SQL
Server container — not for anything in `Common/Errors/`, but because `WaslApiFactory` from
`001` boots the whole application and the application needs a database to start.

Worth naming: an error-contract suite that needs Docker in order to prove that a `404`
carries a `traceId` is slightly absurd, and it is still the right trade. A second
lighter-weight host would be a second composition root, and a second composition root is
where the middleware order silently differs from production's.
