# 001 — Task Breakdown

**Phase:** 0 · **Role:** Story Planner · **Skill:** `speckit-tasks`

Every task has one owner, one verification, and something it serves. A task that cannot
be verified on its own is too big and is split.

Agents named here are **not dispatched until the plan is approved**. Naming is the
plan; dispatching without recording the result in `ai-notes.md` is the thing that turns
evidence into a claim.

## Critical path

```text
BE-001-01 → BE-001-02 → BE-001-04 → BE-001-05 → BE-001-07 → TEST-001-06 → DOC-001-03
```

Everything else hardens it. These make it exist.

## Backend

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| BE-001-01 | `Wasl.sln`, `Wasl.Domain`, `Wasl.Api`, and both test projects exist and reference each other correctly | — | `dotnet build` | AC-1 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-001-02 | `Directory.Build.props`: `net10.0`, `Nullable=enable`, `TreatWarningsAsErrors=true`, one `LangVersion` | BE-001-01 | `dotnet build` fails on a deliberately introduced unused-variable warning, then passes once removed | AC-1, AC-11 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-001-03 | `docker-compose.yml` with SQL Server 2022, `ACCEPT_EULA`, a compliant password, and a healthcheck | — | `docker compose up -d db` then `docker compose ps` shows healthy | AC-2 | `voltagent-lang:dotnet-core-expert` | — |
| BE-001-04 | `WaslDbContext`, `UtcDateTimeConverter`, `CustomerConfiguration`, and the model conventions from `data-model.md` | BE-001-01 | `dotnet ef migrations add InitialCreate` produces the columns and types in `data-model.md` | AC-12 | `voltagent-lang:sql-pro` | — |
| BE-001-05 | `InitialCreate` applies to an empty database and is idempotent | BE-001-03, BE-001-04 | `dotnet ef database update` twice; second run applies nothing | AC-3 | `voltagent-lang:sql-pro` | — |
| BE-001-06 | `TimeProvider.System` registered; a repository-wide search finds no inline `DateTime.UtcNow` | BE-001-01 | `grep -rn "DateTime.UtcNow" src/` returns nothing | NFR | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-001-07 | `GET /health` returns the `200` shape in `contracts/health-api.md`, unauthenticated | BE-001-04 | `curl -s localhost:7001/health \| jq` matches the contract | AC-4 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-001-08 | `GET /health` returns `503` with the failing check named when the database is unreachable | BE-001-07 | Stop the container, call the endpoint, read the status line | AC-5 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-001-09 | Connection string is a placeholder in `appsettings.json`; the real value comes from user secrets | BE-001-04 | `git grep -iE "password|Pwd=" -- src/` returns only the placeholder | AC-10 | `comprehensive-review:security-auditor` | — |
| BE-001-10 | `.github/workflows/ci.yml` runs build, unit, and integration on push, with Docker available to the runner | BE-001-05, BE-001-07 | A green run visible on the first push | AC-9 | `voltagent-lang:dotnet-core-expert` | — |
| BE-001-11 | `global.json` pins the SDK to `10.0.200` with `rollForward: latestFeature`, so the installed `10.0.400-preview` is not used | BE-001-01 | `dotnet --version` run **inside the repository** reports `10.0.200`, not the preview | AC-13 | `voltagent-lang:dotnet-core-expert` | — |

## Frontend

**None.** The React application, tokens, and primitives are `006-design-system`.
Recorded rather than omitted, so the empty lane is visibly a decision.

## Tests

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| TEST-001-01 | `DomainHasNoDependenciesTests` fails if `Wasl.Domain` references EF Core, ASP.NET Core, MediatR, or any third-party assembly — transitively included | BE-001-01 | Add a reference deliberately, watch it go red, remove it | AC-7 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-001-02 | `WaslApiFactory` boots the API against a `Testcontainers.MsSql` container and applies migrations before the first test | BE-001-05 | The suite runs green from a cold Docker | AC-6 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-001-03 | A `DateTime` written and re-read comes back with `Kind == Utc`; a `Local` input is normalised on write | BE-001-04 | Test run | AC-8 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-001-04 | Arabic text written to `FullName` round-trips byte-identical | BE-001-05 | Test run — `varchar` would return `????` | AC-12, ADR-013 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-001-05 | `CK_Customers_Contact` exists and rejects a row with neither email nor phone | BE-001-05 | Test run asserting the `DbUpdateException`, plus a `sys.check_constraints` query | AC-12, BR-4.1 | `voltagent-lang:sql-pro` | — |
| TEST-001-06 | `GET /health` returns `200` and the contract shape | BE-001-07 | Test run | AC-4, AC-6 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-001-07 | `GET /health` returns `503` and names the failing check when the database is unreachable | BE-001-08 | Test run pointing the app at a dead connection string | AC-5 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-001-08 | Migration applies cleanly to a database that already contains an unrelated table | BE-001-05 | Test run | Edge case | `voltagent-lang:sql-pro` | — |

## Documentation

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| DOC-001-01 | `quickstart.md` verified by following it on a clean clone — every command as written | BE-001-10 | Delete the clone, follow it, note anything that had to be guessed | AC-1, NFR-7 | main session | — |
| DOC-001-02 | `docs/sdd/documentation/development/setup.md` updated for SQL Server, including the EULA variable and the LocalDB fallback | BE-001-03 | Read it against what was actually done | NFR-7 | main session | — |
| DOC-001-03 | `tests.md` and `ai-notes.md` completed with **observed** output, and the board and delivery log updated | All | The `verify-story` gate | DoD | main session | `verify-story` |

## Review

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| REV-001-01 | Layer boundaries, secret handling, and the migration reviewed; verdict recorded | All BE, all TEST | `review.md` verdict is `Approved` | DoD | `comprehensive-review:code-reviewer` | `code-review:code-review` |
| REV-001-02 | Generated OpenAPI compared against `contracts/health-api.md` | BE-001-07 | Any difference is fixed in one of the two before closing | DoD | main session | — |

## Droppable if time runs short

| Task | What is lost |
|---|---|
| TEST-001-08 (migration onto a non-empty database) | An edge case a reviewer is unlikely to exercise. The clean-database path is covered by TEST-001-02 |
| BE-001-08 / TEST-001-07 (the `503` path) | `/health` still proves the app is up. What is lost is the answer to "is the database reachable?" during a demo failure — which is exactly when it is wanted, so drop this last |

**Not droppable:** BE-001-02. Without warnings-as-errors from the first commit, the
warning count only ever grows, and turning it on later means fixing everything at once.

**Not droppable:** BE-001-11. Four SDKs are installed here and the highest is a preview.
Four lines of `global.json` are the difference between a build that is reproducible on
the reviewer's machine and one that is a property of ours.

**Not droppable:** BE-001-10. Adding CI after twenty commits is the retrofit this
ordering exists to avoid.
