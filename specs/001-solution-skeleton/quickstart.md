# 001 — Quickstart

What a reviewer does from a clean clone. Every command exactly as it should be typed.

**This file is verified by following it, not by writing it** (`DOC-001-01`). Anything
that has to be guessed while following it is a defect in this file.

## Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| .NET SDK | 10.0.2xx — pinned by `global.json` | Everything |
| Docker Desktop | any recent, **and running** | SQL Server and the integration tests |
| `dotnet-ef` | `dotnet tool install -g dotnet-ef` | Migrations |

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

# 1. Start SQL Server. ACCEPT_EULA is set in the compose file — the container exits
#    silently without it, which is the least helpful failure in this stack.
docker compose up -d db
docker compose ps                 # wait for: db  healthy

# 2. Point the app at it. The connection string is NOT in source control.
dotnet user-secrets --project src/Wasl.Api set \
  "ConnectionStrings:Wasl" \
  "Server=localhost,1433;Database=Wasl;User Id=sa;Password=<the compose password>;TrustServerCertificate=True"

# 3. Create the schema.
dotnet ef database update --project src/Wasl.Api

# 4. Run.
dotnet run --project src/Wasl.Api
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
# The database check actually checks the database
docker compose stop db
curl -s -o /dev/null -w "%{http_code}\n" https://localhost:7001/health   # → 503
docker compose start db

# Warnings really are errors
#   add an unused local to any file, then:
dotnet build          # → error, not warning

# The domain really has no dependencies
dotnet test tests/Wasl.Domain.Tests --filter DomainHasNoDependencies

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
| `Cannot open database "Wasl"` | Step 3 was skipped | `dotnet ef database update --project src/Wasl.Api` |

## Without Docker — LocalDB fallback

Documented, not recommended (`plan.md`, *Risks and trade-offs*). Windows only, and it
drifts from what CI runs.

```bash
dotnet user-secrets --project src/Wasl.Api set \
  "ConnectionStrings:Wasl" \
  "Server=(localdb)\\MSSQLLocalDB;Database=Wasl;Trusted_Connection=True"
dotnet ef database update --project src/Wasl.Api
dotnet run --project src/Wasl.Api
```

The integration suite still needs Docker. Running only the unit suite is a valid state —
it is recorded in `tests.md` as a stated limitation, never as a pass.
