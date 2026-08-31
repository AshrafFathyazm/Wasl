# 001 — Quickstart

What a reviewer does from a clean clone. Every command exactly as it should be typed.

**This file is verified by following it, not by writing it** (`DOC-001-01`). Anything
that has to be guessed while following it is a defect in this file.

## Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| .NET SDK | 10.0.2xx — pinned by `global.json` | Everything |
| SQL Server | **the `docker compose` container, host port 14330** — `appsettings.Development.json` has pointed there since 2026-08-27, not at `.\SQLEXPRESS` | Running the application |
| `dotnet-ef` | `dotnet tool install -g dotnet-ef` | Migrations |
| Docker Desktop | any recent, and running | **The application AND the integration tests.** This row said *"the integration tests only — not needed to run the app"* until 2026-08-31; the development connection string points at the compose container, so the app needs it too |

`global.json` pins the SDK band, so `dotnet --version` inside this repository reports the
pinned SDK regardless of what else is installed. If it reports a preview instead,
`global.json` is missing or was edited.

Without Docker: the unit suite runs, the integration suite does not. See the LocalDB
fallback at the bottom. The first integration run also **pulls about 1.5GB** for
`mssql/server:2022-latest` — an unexplained two-minute pause on a cold cache is that,
not a hang.

## Run it

**WALKED FROM A GENUINELY FRESH CLONE 2026-08-31, and what was here before did not work.**
This file's own rule is that it is verified by following it — it had not been followed since
`003b` changed the setup, and every line of the old block was false: it said *"Two commands"*,
it pointed at `.\SQLEXPRESS`, and it said *"there is no password to set, and therefore none to
leak."* There are **five** secrets, and the first of the two commands failed before reaching a
database at all.

```bash
git clone <repo> && cd Wasl

# 1. The database. Not optional, and not "for the integration tests only":
#    appsettings.Development.json has pointed at this container since 2026-08-27.
docker compose up -d db

# 2. Restore. `dotnet ef` does NOT restore, and without this step 4 fails with
#    NETSDK1004 "Assets file ... project.assets.json not found" — a message about
#    NuGet that says nothing about anything this file mentions.
dotnet restore

# 3. The five secrets. Every one of them has no default by rule, and the host refuses
#    to start without it. Set them in ANY order — the guards fire one at a time, so
#    missing four of them means four separate refusals.
dotnet user-secrets --project src/Wasl.Api set "Database:AppPassword"   "<a password>"
dotnet user-secrets --project src/Wasl.Api set "Jwt:SigningKey"         "<32+ bytes>"
dotnet user-secrets --project src/Wasl.Api set "Seed:ManagerPassword"   "<8+ characters>"
dotnet user-secrets --project src/Wasl.Api set "Seed:AgentPassword"     "<8+ characters>"
dotnet user-secrets --project src/Wasl.Api set "Seed:AgentTwoPassword"  "<8+ characters>"

# 4. The runtime connection, carrying the same password as step 3's first line.
dotnet user-secrets --project src/Wasl.Api set \
  "ConnectionStrings:Wasl" \
  "Server=localhost,14330;Database=Wasl;User Id=wasl_app;Password=<the same>;TrustServerCertificate=True;MultipleActiveResultSets=True"

# 5. Schema AND principal. Idempotent — but see the warning below about the password.
dotnet run --project src/Wasl.Api -- --provision

# 6. Optional: demo data. Provisions first, writes 3 customers and 5 tickets, then exits.
dotnet run --project src/Wasl.Api -- --seed

# 7. Run.
dotnet run --project src/Wasl.Api
```

Verified end to end on 2026-08-31 against a separate database: `GET /health` returned
`{"status":"Healthy"}` with both checks healthy, and `GET /api/tickets` with no token returned
`401` from the fallback policy.

> ### `--provision` can report success and leave the application unable to log in
>
> **Found by this walkthrough on 2026-08-31 and FIXED the same day** — `--provision` now opens the
> runtime connection as its last act and refuses if the principal it just configured cannot log in,
> so a success message means it works. The paragraphs below describe what it used to do, and they
> stay because the failure is still possible on any build older than that fix.
> `LeastPrivilegeProvisioner` creates the login under
> `IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = @user)`, and
> `sys.server_principals` is **server-scoped**. So if a `wasl_app` login already exists on that
> SQL Server — another database, another clone, or a rotated password — `CREATE LOGIN` is
> **skipped, the old password is kept**, and `--provision` still prints
> *"Schema applied and wasl_app provisioned."*
>
> Measured: a fresh clone provisioned with its own new password could not connect, and the same
> database accepted `wasl_app` immediately when the connection string was given the **other**
> clone's password.
>
> **The symptom is `Login failed for user 'wasl_app'`, which this file elsewhere teaches you to
> read as "you skipped `--provision`".** It is the same sentence for at least three different
> causes, and re-running `--provision` — the one recovery this file documents — changes nothing
> and reports success again.
>
> `--deprovision` then `--provision` does fix it, and **it is not a safe blanket recovery**: it
> drops the *server-level* login, so on a shared SQL Server it breaks every other database using
> that principal.

**`dotnet ef database update` on its own is not enough, and it is not even step one any more.**
It applies the schema and does not create the principal. Worse, run on a fresh clone before the
secrets are set, it does something actively misleading:

```text
An error occurred while accessing the Microsoft.Extensions.Hosting services. Continuing
without the application service provider. Error: Connection string 'Wasl' still contains
the placeholder 'REPLACED_BY_USER_SECRET'. ...
Unable to create a 'DbContext' of type 'WaslDbContext'. The exception 'Unable to resolve
service for type 'DbContextOptions`1[WaslDbContext]' ...' was thrown ...
```

The guard's own message — correct, and naming exactly what to set — is in the **middle**, behind
the words *"Continuing without"*. The **last** line, which is the one a developer reads and
searches for, is about dependency injection. **A correct guard degraded into noise by the tool
that triggered it.**

**And `--provision` migrates BEFORE it reads the password.** Measured on a genuinely fresh
database with `Database:AppPassword` unset: the database was created, all **7 tables** and **8
migrations** were applied, and `wasl_app` was **not** a principal in it. It is idempotent, so
setting the secret and re-running completes the job — but the intermediate state is the one that
produces `Login failed for user 'wasl_app'`, and nothing in the refusal message mentions that the
schema went in.


**SUPERSEDED by `003b`, 2026-08-30 — there are TWO connection strings now, and they are two
different database principals.**

| Name | Principal | Used by |
|---|---|---|
| `ConnectionStrings:Wasl` | `wasl_app` — restricted, **cannot UPDATE or DELETE `dbo.AuditLog`** | every request the application serves |
| `ConnectionStrings:WaslMigrator` | a DDL principal (`sa` on the compose container) | `--provision`, `--seed`, and the integration fixture. **Nothing at request time** |

`AddInfrastructure` reads only the first, and refuses to start if the two hold the same value.

Setting up a clone is **seven steps**, not one and not three, and the reason the count grew is
that a password cannot live in a committed migration file. **The list lives in `## Run it` above and only
there** — it was duplicated here, the two copies disagreed on both the count and the contents,
and the copy a reader reaches first is the one they follow.


Until the runtime connection is set, `appsettings.Development.json` carries an obviously invalid
placeholder and the host fails with a sentence naming what to set. **That claim needs one
qualification, added 2026-08-31: it is true of `dotnet run` and NOT of `dotnet ef`**, which buries
the sentence behind *"Continuing without the application service provider"* and then fails with a
dependency-injection error instead. See `## Run it`.

**Docker is needed for BOTH** — this line said *"only needed for the integration suite, not to run
the application"* until 2026-08-31, and the development connection string has pointed at this
container since 2026-08-27:

```bash
# ACCEPT_EULA is set in the compose file — the container exits silently without it,
# which is the least helpful failure in this stack.
docker compose up -d db
docker compose ps                 # wait for: db  healthy
```

Then:

```bash
curl -s https://localhost:7001/health | jq
```

Expected — the shape is fixed by [`contracts/health-api.md`](contracts/health-api.md):

```json
{ "status": "Healthy", "totalDurationMs": 34,
  "checks": [ { "name": "self", "status": "Healthy", "durationMs": 0 },
              { "name": "database", "status": "Healthy", "durationMs": 33 } ] }
```

## Test it

```bash
dotnet test                                   # everything
dotnet test tests/Wasl.Domain.Tests           # unit only — no Docker needed
dotnet test tests/Wasl.Api.IntegrationTests   # needs Docker running
```

The integration suite starts its **own** SQL Server container through Testcontainers —
it does not use the one from `docker compose`. First run pulls the image and takes a
couple of minutes; later runs are fast.

## Prove the interesting parts

Four things in this feature fail silently. These are how to see them working:

```bash
# The database check actually checks the database — start it against a dead instance
dotnet run --project src/Wasl.Api -- \
  --ConnectionStrings:Wasl='Server=.\NOPE;Database=Wasl;Trusted_Connection=True;Connect Timeout=2'
curl -s -o /dev/null -w '%{http_code}\n' https://localhost:7001/health   # → 503

# Warnings really are errors
#   add an unused local to any file, then:
dotnet build          # → error, not warning

# The layer boundaries really hold (Domain has no packages; Application cannot see EF Core)
dotnet test tests/Wasl.Application.Tests --filter LayerDependency

# Arabic really round-trips (varchar would give ????)
dotnet test tests/Wasl.Api.IntegrationTests --filter ArabicText
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `db` container exits immediately, no log | `ACCEPT_EULA` missing or not `Y` | It is in `docker-compose.yml`; check it was not edited out |
| Container runs, every connection refused | The `sa` password fails SQL Server's complexity policy | 8+ characters, three of upper / lower / digit / symbol |
| `A network-related or instance-specific error occurred` | The container is up but the engine is not ready yet | `docker compose ps` and wait for `healthy`. The port opens before the engine answers |
| Port 1433 already in use | A local SQL Server instance | Change the host port in `docker-compose.yml` and in the connection string |
| Integration tests hang, then fail | Docker daemon not running | Start Docker Desktop. The suite should fail fast naming Docker — if it hangs instead, that is a defect in `WaslApiFactory` |
| `Cannot open database "Wasl"` | `--provision` was never run | `dotnet run --project src/Wasl.Api -- --provision`. **This row said `dotnet ef database update` until 2026-08-31** — that applies the schema and does not create the principal, so it turns this error into the next one |
| `Login failed for user 'wasl_app'` | **Three different causes wear this one sentence.** (a) `--provision` was never run. (b) It WAS run but refused for a missing secret before reaching the principal — the schema goes in first, so the database looks finished. (c) A `wasl_app` login already existed on this SQL Server with a **different** password, so `CREATE LOGIN` was skipped and `--provision` reported success anyway | (a) and (b): set all five secrets, then `--provision`. (c) `--deprovision` then `--provision` — **and only if no other database on that server uses `wasl_app`**, because the login is server-scoped and dropping it breaks all of them. Measured 2026-08-31; see `## Run it` |

## Without Docker — LocalDB fallback

Documented, not recommended (`plan.md`, *Risks and trade-offs*). Windows only, and it
drifts from what CI runs.

**And it silently defeats `003b`, flagged 2026-08-31.** The block below puts
`Trusted_Connection=True` in `ConnectionStrings:Wasl` — the RUNTIME slot — so the application
serves every request as a principal with full rights over `dbo.AuditLog`, which is the exact
thing `003b` exists to prevent. Nothing fails, no guard fires, and the audit log is mutable again.
The two-connection-string guard does not catch it either: it compares the two strings for
equality, and these two differ. **If you use this path, `003b`'s guarantee does not apply to your
machine** — and `003b`'s own note that *two shapes of connection between a developer machine and
CI is exactly how `004` D-6 happened* applies here first.

```bash
dotnet user-secrets --project src/Wasl.Api set \
  "ConnectionStrings:Wasl" \
  "Server=(localdb)\\MSSQLLocalDB;Database=Wasl;Trusted_Connection=True"
dotnet ef database update -p src/Wasl.Infrastructure -s src/Wasl.Api
dotnet run --project src/Wasl.Api
```

The integration suite still needs Docker. Running only the unit suite is a valid state —
it is recorded in `tests.md` as a stated limitation, never as a pass.
