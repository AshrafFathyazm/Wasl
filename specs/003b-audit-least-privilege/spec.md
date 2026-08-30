# `003b` — Audit Least Privilege

**Phase:** 0 · Foundation · **Story:** — (infrastructure) · **Status:** Specified, awaiting review

`003` shipped the audit trail and said plainly what it had not shipped:

> **The `·b` least-privilege block is not built.** So, stated plainly and not left to be
> inferred: **the audit log is append-only by application convention, not by database
> permission.** No `wasl_app` role, no `GRANT`, no `DENY`, no restricted connection string, and
> AC-12/AC-13 unverified. `003b` owns that block whole.

This is that block. BR-9.5.

---

## Measured first

The claim above is a year old in project time and has never been demonstrated. Probed against
the running compose container, 2026-08-30:

```text
ServerPrincipal | DbUser | IsSysadmin | IsDbOwner | CanUpdate | CanDelete
sa              | dbo    | 1          | 1         | 1         | 1
```

```sql
BEGIN TRAN;
UPDATE TOP (1) dbo.AuditLog SET Action = 'TAMPERED';   -- RowsUpdated: 1
DELETE TOP (1) FROM dbo.AuditLog;                      -- RowsDeleted: 1
ROLLBACK;
```

**Both succeeded.** The audit log is mutable today, by the connection the application actually
uses. `003`'s statement was accurate and is now demonstrated rather than asserted.

Three logins exist on the instance — `sa` and two Windows service accounts. There is no
`wasl_app`.

---

## The thing that makes this feature more than four SQL statements

**`DENY` does not restrict a member of `sysadmin`.** `003`'s own spec names this and calls the
failure *decorative*: a `DENY UPDATE ON dbo.AuditLog` applied while the application connects as
`sa` changes nothing at all, and AC-13 would fail honestly on a developer's machine while
appearing to pass wherever a restricted login happened to exist.

So the deliverable is **not** the `GRANT`/`DENY` pair. It is:

1. a `wasl_app` login and user that is **not** `db_owner` and **not** `sysadmin`;
2. the application's connection string pointing at it;
3. a test that fails if either is undone.

Without (2), (1) and (3) are theatre. `004` D-6 recorded the move to `sa` as deliberate — the
same throwaway credential is already in `docker-compose.yml`, so it added no secret to the
repository — and **that reasoning is about secrecy, not about privilege.** It does not survive
this feature.

### And the tension this creates, which is the whole design problem

`Database.MigrateAsync()` is called from **two** places:

| Caller | Why |
|---|---|
| `DemoSeeder.RunAsync` | `--seed` applies migrations before writing demo data |
| `WaslApiFactory.InitializeAsync` | the integration suite migrates a fresh container per run |

**Migrating requires DDL rights. A least-privileged runtime principal must not have them.** One
principal cannot both be restricted enough to satisfy AC-13 and powerful enough to create tables.

That was Q-A, and it is **ruled: two connection strings.**

### The condition attached to that ruling

> **The migrator has no presence in the request path at all — no injection, no fallback, and no
> "if the first one fails". A second connection string that exists inside the application is a
> second connection string somebody will use.**

Which makes this a structural requirement rather than a convention:

| Rule | Why it is not merely tidy |
|---|---|
| `AddInfrastructure` reads **only** `ConnectionStrings:Wasl` | A `DbContext` resolvable from the request scope with DDL rights is a `DbContext` that can drop the audit table. The registration is where that is decided |
| The migrator string is read **at the call site**, by `--seed` and by the test fixture, and never registered in the container | Nothing can inject what nothing registered. There is no `IMigratorConnection`, no keyed service, no `IServiceProvider.GetService` for it |
| **No fallback.** A missing runtime string is a startup failure, never a silent promotion to the migrator | Retrying a failed restricted connection with a privileged one turns a permissions defect into a silent privilege escalation — and it would look like resilience |
| AC-14 fails the build if `AddInfrastructure` is handed the migrator string | The rule above is worth exactly as much as the thing that enforces it |

**This is the load-bearing half of the feature.** The grants and denies are four statements; the
guarantee is that the process serving requests holds a principal that cannot undo them.

## In scope

- A `wasl_app` **login** and database **user**, created by migration, with a password from
  configuration and **no default** — the same rule `004` applies to `Jwt:SigningKey`
- `GRANT SELECT, INSERT` on `dbo.AuditLog` to that user; `DENY UPDATE, DELETE` on it
- The permissions the rest of the application needs on every other table — `SELECT`, `INSERT`,
  `UPDATE`, `DELETE`, plus `EXECUTE` on nothing and `SELECT` on `dbo.TicketNumberSeq`
- The application's runtime connection string switched to `wasl_app`
- A migration that creates all of it, and a `Down` that **revokes and drops** — `003` recorded
  that its `Down` "drops the table and revokes nothing", correct then and not now
- AC-12 and AC-13 from `003`, finally runnable
- **A negative control that is part of the deliverable, not an afterthought:** the tamper probe
  above, re-run on the restricted connection, must fail with SQL Server error 229

## Out of scope

| Excluded | Where it lives |
|---|---|
| Row-level security, Always Encrypted, ledger tables | Nowhere. `dbo.AuditLog` is protected by permission, not by cryptography — a stronger claim needs a decision this project has not made |
| Protecting any other table from `UPDATE` | Nowhere. Tickets and customers are meant to change; only the audit log claims append-only |
| A separate database for audit | Nowhere. It would make the same-transaction guarantee (BR-9.4) impossible |
| Rotating the `wasl_app` password | Nowhere. One credential, from configuration, like the three `004` already requires |
| Anything about the frontend | The lane does not touch the database |

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | A migration can create a server-level login. It needs `securityadmin` or `sysadmin` **at migration time**, which the migrating principal has | The login is created by a script outside migrations, and the migration only creates the database user. Q-A decides which |
| A-2 | `DENY` on a table beats `GRANT` at the database-role level, so `db_datawriter` plus a table `DENY` is safe | It is: `DENY` wins over `GRANT` everywhere except column-level. Asserted anyway by AC-3, because the whole feature rests on it |
| A-3 | The integration suite can create the restricted login in its container and connect as it | If `Testcontainers` will not permit a second connection string, AC-13 becomes untestable in CI and the feature is unverifiable — which would be a reason to stop, not to ship it unproven |
| A-4 | `EF Core` does not need `UPDATE` on `dbo.AuditLog` for any path | `AuditEntry` has private setters, one factory and no mutator (`003` `BE-003-01`), and nothing tracks it for modification. If EF emits an `UPDATE`, the `DENY` turns a working request into a `500` — which is why AC-6 runs the whole suite on the restricted connection rather than one probe |

## Open questions

| # | Question | Working assumption |
|---|---|---|
| **Q-A** | **Migrations need DDL; the runtime must not have it. One principal or two?** `MigrateAsync` is called by `DemoSeeder` and by `WaslApiFactory`, both of which are development and test paths — but they run through the same `AddInfrastructure` connection string | **RULED: two.** `Wasl` is the runtime string and connects as `wasl_app`; `WaslMigrator` carries DDL rights and is used by `--seed` and the test fixture **and by nothing else**. The reason given for the ruling was the argument itself: one principal cannot be restricted enough for AC-2 and powerful enough to create tables. **`001` and `docs/sdd/02-architecture.md` both describe a single connection string and are corrected** |
| **Q-B** | Does the restricted connection break anything else? `TicketNumberSeq` needs `SELECT`/`UPDATE` on a sequence object, the health check runs a query, and `003`'s interceptor writes on every save | **Assume it does, somewhere, and that finding out is the point.** AC-6 runs the **entire suite** on the restricted connection rather than probing the audit table alone. A permission this feature forgets is a `500` in production and a green test run here |
| **Q-C** | Where does the `wasl_app` password come from in CI? | **A GitHub Actions secret, like nothing else in this repository so far** — `004`'s three secrets are supplied by `UseSetting` in the test factory, which works because the tests own the container. Same mechanism: the fixture creates the login with a password it generates per run, so no credential is stored anywhere |
| **Q-D** | `003` AC-13 asserts `IS_SRVROLEMEMBER('sysadmin') = 0` **on the application's own connection**. Does that mean asserting it from inside a request, or from the test's own restricted connection? | **From inside a request**, through a probe endpoint like `004`'s. A test that opens its own connection proves what the test can do, not what the application does — and the whole failure mode here is the application quietly running as something more powerful than intended |
| **Q-E** | The developer's machine: does local development also use `wasl_app`? | **Yes, from `appsettings.Development.json`.** Two shapes of connection between developer and CI is how `004` D-6's defect happened — CI failed while local passed. If the restricted connection is only used in tests, then production-shaped behaviour is never what anyone runs |

## Acceptance criteria

AC-12 and AC-13 are `003`'s, renumbered here as AC-1 and AC-2 and unchanged in substance.

### The principal

| # | Criterion |
|---|---|
| AC-1 | The application's database principal can `INSERT` and `SELECT` on `dbo.AuditLog`, and an attempted `UPDATE` or `DELETE` fails with **SQL Server error 229** (BR-9.5) — `003` AC-12 |
| AC-2 | On the application's own connection, `IS_SRVROLEMEMBER('sysadmin')` and `IS_ROLEMEMBER('db_owner')` both return `0`, and `HAS_PERMS_BY_NAME('dbo.AuditLog','OBJECT','UPDATE')` returns `0` — `003` AC-13. **Asserted from inside a request** (Q-D), because the failure is the application running as something more powerful than intended |
| AC-3 | The `DENY` beats the role grant: `wasl_app` is in `db_datawriter` **and** cannot update the audit log. Asserted rather than assumed, because the entire feature rests on `DENY` winning |
| AC-4 | The `wasl_app` password has **no default**. The host refuses to start without it, and the failure names the configuration key and never echoes the value — the rule `004` AC-11 established for `Jwt:SigningKey` |

### It has to still work

| # | Criterion |
|---|---|
| AC-5 | **The tamper probe, re-run on the restricted connection, fails.** The same `UPDATE` and `DELETE` that succeeded in the measurement above return error 229. This is the negative control, and it is a deliverable rather than an afterthought |
| AC-6 | **The entire integration suite passes on the restricted connection** — not a probe on `dbo.AuditLog`. A permission this feature forgets to grant is a `500` in production and an untouched code path in a narrow test (Q-B) |
| AC-7 | `POST /api/tickets` still allocates a number, which needs the sequence; `GET /health` still reports `Healthy`, which needs the health check's query; `--seed` still runs |
| AC-8 | A request that writes an audit row still writes it, and a request that rolls back still writes none (BR-9.4, `003` AC-8/AC-9 re-run under the new principal) |

### The migration

| # | Criterion |
|---|---|
| AC-9 | `Up` creates the login, the user, the grants and the denies. Re-running it against a database that already has them does not fail |
| AC-10 | `Down` **revokes the grants, drops the user, and drops the login.** `003` recorded that its `Down` "drops the table and revokes nothing" — correct when there was nothing to revoke, and not correct now |
| AC-11 | A fresh clone plus `docker compose up -d db` plus `dotnet ef database update` produces a working application with the restricted principal, with no manual SQL. Verified by running it, not by reading the migration |

### Two connections, if Q-A is answered that way

| # | Criterion |
|---|---|
| AC-12 | The runtime connection string is `wasl_app` and the migrator connection string is separate. **`AddInfrastructure` registers only the runtime one** — a `DbContext` that could migrate is a `DbContext` with DDL rights |
| AC-13 | `--seed` and the test fixture use the migrator connection **only** to migrate, and every request they then issue goes through the runtime one. Asserted by AC-2 running inside `--seed`'s own process |
| AC-14 | A source-level or architecture test fails the build if `AddInfrastructure` is given the migrator connection string |

## Edge cases

| Case | Expected |
|---|---|
| The migration runs twice | Idempotent — `IF NOT EXISTS` around the login, the user, and each grant |
| The login exists but the user does not | Created. The two are separate objects and a dropped database leaves the login behind |
| `wasl_app` password changed outside the application | Every request fails at connection time with a clear error. Not this feature's to recover from |
| An `UPDATE` attempted inside a transaction that also writes a legitimate row | The whole transaction fails. Correct: BR-9.4 puts the audit row in the same transaction, and a request that tried to tamper should not commit anything |
| SQL Server error 229 reaching the client | It must not. A `DbUpdateException` from a denied `UPDATE` is an unhandled fault and becomes `500 errors/internal` with no SQL in `detail` — `002`'s rule, re-asserted here because this feature makes the error possible for the first time |
| A developer connecting with SSMS as `sa` | Still able to update the audit log. **Stated, not hidden:** this feature restricts the *application*, not the database administrator. A DBA with `sysadmin` can always alter anything, and claiming otherwise would be the false assurance `003` warned about |

## The limit of the claim — say it, do not imply it

> **This feature restricts the application, not the database administrator.**

Somebody holding `sysadmin` on SSMS can still edit the audit log, and no `DENY` changes that:
SQL Server does not apply permission checks to `sysadmin` at all. A stronger claim needs
cryptographic integrity or ledger tables, and **that is a decision this project has not made.**

Stating the boundary is not a caveat bolted on at the end. `003` warned that a `DENY` applied to
a connection it cannot restrict is **decorative**, and the way a decorative control does damage is
by being described as more than it is — a review reads "append-only, enforced by the database",
and nobody checks which principal the application actually holds.

## Rules referenced

- **BR-9.5** — the audit log is append-only
- **BR-9.4** — the audit row commits with the change it describes
- **NFR-10** — the architecture test that keeps audit writing structural
- **ADR-013** — SQL Server specifics; `DENY` semantics are provider behaviour
- **`003` AC-12, AC-13** — carried here as AC-1 and AC-2
- **`004` AC-11** — the no-default-secret rule this feature reuses for the `wasl_app` password
- **`004` D-6** — why the connection is `sa` today, and why that reasoning does not survive
