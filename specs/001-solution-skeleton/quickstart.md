# 001 — Quickstart

What a reviewer does from a clean clone. Every command exactly as it should be typed.

**This file is verified by following it, not by writing it** (`DOC-001-01`). Anything
that has to be guessed while following it is a defect in this file.

## Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| .NET SDK | 10.0.2xx — pinned by `global.json` | Everything |
| SQL Server | 2022 Express, local instance `.\SQLEXPRESS` | Running the application |
| `dotnet-ef` | `dotnet tool install -g dotnet-ef` | Migrations |
| Docker Desktop | any recent, and running | **The integration tests only** — not needed to run the app |

`global.json` pins the SDK band, so `dotnet --version` inside this repository reports the
pinned SDK regardless of what else is installed. If it reports a preview instead,
`global.json` is missing or was edited.

Without Docker: the unit suite runs, the integration suite does not. See the LocalDB
fallback at the bottom. The first integration run also **pulls about 1.5GB** for
`mssql/server:2022-latest` — an unexplained two-minute pause on a cold cache is that,
not a hang.

## Run it

```bash
git clone <repo> && cd Wasl

# 1. Create the schema against the local SQL Server 2022 Express instance.
#    Windows auth — there is no password to set, and therefore none to leak.
dotnet ef database update -p src/Wasl.Infrastructure -s src/Wasl.Api

# 2. Run.
dotnet run --project src/Wasl.Api
```

Two commands. `appsettings.Development.json` points at `.\SQLEXPRESS` with
`Trusted_Connection=True`, which is safe to commit because it contains no credential.

**SUPERSEDED by `003b`, 2026-08-30 — there are TWO connection strings now, and they are two
different database principals.**

| Name | Principal | Used by |
|---|---|---|
| `ConnectionStrings:Wasl` | `wasl_app` — restricted, **cannot UPDATE or DELETE `dbo.AuditLog`** | every request the application serves |
| `ConnectionStrings:WaslMigrator` | a DDL principal (`sa` on the compose container) | `--provision`, `--seed`, and the integration fixture. **Nothing at request time** |

`AddInfrastructure` reads only the first, and refuses to start if the two hold the same value.

Setting up a clone is three commands rather than one, and the reason is that a password cannot
live in a committed migration file:

```bash
# 1. the wasl_app password. No default, by rule — the host refuses to start without it.
dotnet user-secrets --project src/Wasl.Api set "Database:AppPassword" "<a password>"

# 2. the runtime connection, carrying that same password.
dotnet user-secrets --project src/Wasl.Api set \
  "ConnectionStrings:Wasl" \
  "Server=localhost,14330;Database=Wasl;User Id=wasl_app;Password=<the same>;TrustServerCertificate=True;MultipleActiveResultSets=True"

# 3. apply the schema AND create the principal. Idempotent; safe to re-run.
dotnet run --project src/Wasl.Api -- --provision
```

**`dotnet ef database update` on its own is no longer enough.** It applies the schema and does not
create the principal, so the application then cannot log in at all. That is the price of keeping
the credential out of source control, and it is written here rather than left to be discovered.

Until step 2 is done, `appsettings.Development.json` carries an obviously invalid placeholder and
the host fails with a sentence naming what to set — rather than SQL Server's *"Login failed for
user 'wasl_app'"*, which reads as a broken database rather than an unfinished setup.

**Docker is only needed for the integration suite**, not to run the application:

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
| `Cannot open database "Wasl"` | Step 1 was skipped | `dotnet ef database update -p src/Wasl.Infrastructure -s src/Wasl.Api` |

## Without Docker — LocalDB fallback

Documented, not recommended (`plan.md`, *Risks and trade-offs*). Windows only, and it
drifts from what CI runs.

```bash
dotnet user-secrets --project src/Wasl.Api set \
  "ConnectionStrings:Wasl" \
  "Server=(localdb)\\MSSQLLocalDB;Database=Wasl;Trusted_Connection=True"
dotnet ef database update -p src/Wasl.Infrastructure -s src/Wasl.Api
dotnet run --project src/Wasl.Api
```

The integration suite still needs Docker. Running only the unit suite is a valid state —
it is recorded in `tests.md` as a stated limitation, never as a pass.
