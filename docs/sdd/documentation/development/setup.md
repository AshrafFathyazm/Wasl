# Development Setup

## Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| .NET SDK | 8.0 | Backend |
| Node.js | 20 LTS | Frontend |
| Docker | any recent | SQL Server and the integration tests |
| EF Core tools | `dotnet tool install --global dotnet-ef` | Migrations |

Without Docker, unit tests run and integration tests do not. That limitation is a
direct consequence of `decisions/ADR-001-database.md`.

## Backend

```bash
# 1. Start SQL Server
docker compose up -d db

# 2. Configure secrets — never in appsettings.json
cd src/Wasl.Api
dotnet user-secrets set "ConnectionStrings:Default" "Host=localhost;Database=crm;Username=crm;Password=<local>"
dotnet user-secrets set "Jwt:SigningKey" "<a long random local value>"

# 3. Apply migrations
dotnet ef database update --project ../Wasl.Infrastructure --startup-project .

# 4. Run
dotnet run
```

The API listens on the port printed at startup. Interactive documentation is at
`/swagger` in Development.

The application fails fast at startup if the connection string or the signing key is
missing. It does not fall back to a default, because a development default that
reaches production is a worse outcome than a failed start.

## Frontend

```bash
cd src/wasl-web
npm install
cp .env.example .env.local        # set VITE_API_BASE_URL
npm run dev
```

## Seed data

The application seeds two support users on first run in Development:

| Role | Email |
|---|---|
| Manager | `manager@wasl.local` |
| Agent | `agent@wasl.local` |

Passwords come from configuration and are not committed. Set them alongside the other
secrets above. Seeding runs only in Development.

## Common problems

| Symptom | Cause | Fix |
|---|---|---|
| `A network-related... error occurred` | The database container is not running | `docker compose up -d db` |
| Startup fails naming a missing configuration key | Secrets not set | Re-run the `user-secrets` commands |
| `relation "Customers" does not exist` | Migrations not applied | `dotnet ef database update` |
| Integration tests hang or fail immediately | Docker not running | Start Docker; without it, run unit tests only |
| Frontend requests fail with CORS errors | `VITE_API_BASE_URL` does not match the API origin | Correct `.env.local` |

## Localization

Both catalogues ship with the application; nothing extra is needed to run in Arabic.
Switch language from the switcher in the app shell, or hit any endpoint with
`Accept-Language: ar`.

To force a locale for a single request without changing any preference:

```bash
curl -H "Authorization: Bearer <token>" "http://localhost:5000/api/tickets?culture=ar"
```

See `documentation/development/localization.md` before adding any user-facing string.

## Verifying a clean setup

```bash
dotnet build
dotnet test tests/Wasl.Domain.Tests
dotnet test tests/Wasl.Application.Tests
dotnet test tests/Wasl.Api.IntegrationTests   # requires Docker
cd src/wasl-web && npm run build
npm run lint                                  # includes the no-hard-coded-string rule
```

All five succeeding from a clean clone is the definition of "the setup instructions
work". They are re-run before delivery, not assumed.
