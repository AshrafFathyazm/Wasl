# Contract — Health

**Feature:** `001-solution-skeleton` · **Status:** FROZEN 2026-08-23 ·
**Consumers:** CI, the reviewer, `docker compose` healthcheck

The only endpoint in this feature. Frozen means: the backend implements exactly this,
and any change goes through **Contract changes** in `plan.md` before either side moves.

## Conventions

- **Base:** `{{baseUrl}}` — `https://localhost:7001` by default, see `quickstart.md`
- **Auth:** none. This is the one route besides `POST /api/auth/token` that does not
  require a token (`docs/sdd/05-api-conventions.md`)
- **Content-Type:** `application/json`
- Note the path: **`/health`**, not `/api/health`. It is infrastructure, not part of
  the product API surface

## `GET /health`

Liveness and database readiness in one response.

### `200 OK` — every check passed

```json
{
  "status": "Healthy",
  "totalDurationMs": 34,
  "checks": [
    { "name": "self",     "status": "Healthy", "durationMs": 0  },
    { "name": "database", "status": "Healthy", "durationMs": 33 }
  ]
}
```

### `503 Service Unavailable` — a check failed

```json
{
  "status": "Unhealthy",
  "totalDurationMs": 2014,
  "checks": [
    { "name": "self",     "status": "Healthy",   "durationMs": 0    },
    { "name": "database", "status": "Unhealthy", "durationMs": 2013,
      "description": "Cannot connect to the database." }
  ]
}
```

| Field | Rule |
|---|---|
| `status` | `Healthy` \| `Degraded` \| `Unhealthy`. The worst individual result wins |
| `checks[].name` | Stable identifier. `self` and `database` in this feature. Machine-readable, never localized |
| `checks[].description` | Present only on a non-healthy check. A **short** reason, never an exception message, a stack trace, or a connection string |
| `totalDurationMs` | Integer milliseconds |

### Status codes

| Code | When |
|---|---|
| `200` | `status` is `Healthy` or `Degraded` |
| `503` | `status` is `Unhealthy` |

**There is no other outcome.** In particular this endpoint never returns `200` with a
failure described inside the body — the rule from
`docs/sdd/05-api-conventions.md` applies here as everywhere.

## Deliberately not in this contract

| Not here | Why |
|---|---|
| `ProblemDetails` on the failure path | Health checks are not part of the product API and are consumed by tooling that expects the report shape above. The `ProblemDetails` contract (`002`) governs `/api/*` |
| Version, build number, commit SHA | Useful, and nothing needs them yet. Adding one is a one-line change to the response writer |
| A separate `/health/live` and `/health/ready` | Correct under an orchestrator, meaningless with one deployable (`research.md` R-4) |
| Localization | Consumed by machines. `checks[].description` is English, consistent with BR-8.9 |

## Verification

| What | How |
|---|---|
| The `200` shape | `TEST-001-06` — integration test against a real container |
| The `503` shape and code | `TEST-001-07` — the app is started pointing at an unreachable database |
| The contract matches what was built | Compared against the generated OpenAPI document before this feature closes (`docs/sdd/openapi/README.md`) |
