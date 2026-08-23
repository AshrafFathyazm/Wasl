# 001 — Research

Questions that had to be answered before the plan could be written, what was checked,
and what each one settled. A question that turned out not to matter is recorded as
such, because "we looked and it did not matter" is information too.

---

## R-1 · Which SQL Server container image, and does it need anything unusual?

**Checked:** the image the house platform's test setup would use, and the Testcontainers
module for SQL Server.

**Settled:** `mcr.microsoft.com/mssql/server:2022-latest`, Developer edition. Two
non-obvious requirements:

- `ACCEPT_EULA=Y` must be set, or the container exits immediately with no useful log
- `MSSQL_SA_PASSWORD` must satisfy the complexity policy (8+ characters, three of
  upper/lower/digit/symbol) or the container starts and then refuses every connection

`Testcontainers.MsSql` sets both and waits for the real readiness signal rather than
for the port to open, which matters — the port accepts connections several seconds
before the engine will answer a query.

**Consequence for the plan:** the compose file and the test fixture both carry the
EULA variable, and `quickstart.md` says why. A password in `docker-compose.yml` is a
local development credential for a throwaway container and is documented as such; the
application's own connection string still comes from user secrets (AC-10).

---

## R-2 · `datetime2` or `datetimeoffset`?

**The concern, from ADR-001:** *"a type that discards the offset invites a local-time
value to be stored and never noticed."* PostgreSQL's `timestamptz` prevented that.
SQL Server has no equivalent.

**Options weighed:**

| Option | Cost |
|---|---|
| `datetimeoffset(3)` with `DateTimeOffset` properties | The type carries the offset, so the defect is structurally impossible. But every domain property, DTO, and test changes type, and `TimeProvider.GetUtcNow()` returns `DateTimeOffset` while EF's default `DateTime` mapping is what every example assumes |
| `datetime2(3)` with `DateTime` and a global value converter | One convention in `OnModelCreating`. The converter asserts `DateTimeKind.Utc` on write and stamps it on read, so a `Local` value cannot reach the database unconverted |

**Settled:** `datetime2(3)` plus the converter, and **AC-8 tests it**. The converter is
only as good as the test that proves it, which is why the criterion exists rather than
the decision being trusted.

Precision `(3)` rather than the default `(7)`: milliseconds are more than a support
timeline needs, and it makes stored values comparable with what JavaScript produces on
the client without rounding surprises.

---

## R-3 · .NET 10 or .NET 8?

**Status: DECIDED — .NET 10, confirmed by the product owner on 2026-08-23.**

**Checked:** the house platform. `azm-formbuilderBE` targets `net8.0` in every project.
The question was raised because of that, and answered against it deliberately.

**The one-sentence defence:** .NET 10 is the current LTS release and the one a new
project started today should be on; .NET 8's support window closes first, so starting a
greenfield repository on it would mean planning an upgrade before the first feature
ships.

**What it costs:** if this code is ever merged into the house platform, the target has
to come down, and any .NET 10-only API used along the way has to come out.

**How that cost is contained:** the target framework is set in exactly one place —
`Directory.Build.props` — and nothing in the planned features needs a .NET 10-specific
API. Reverting is one line until something depends on it, and `ai-notes.md` records it
if anything ever does.

**Recorded as a divergence, deliberately.** A reviewer from the house platform will
notice the version before they notice anything else, and "we chose the current LTS" is
a better answer than "we did not check what you use."

### What the machine actually has

Verified, not assumed — `dotnet --list-sdks` on 2026-08-23:

```text
8.0.418
9.0.313
10.0.200                        ← GA
10.0.400-preview.0.26322.102    ← preview, and the highest version installed
```

`dotnet ef` is 10.0.10. Runtimes 10.0.4 and 10.0.9 are both present.

**The hazard:** four SDKs are installed and the highest is a **preview**. Without a
`global.json`, SDK selection is a property of the machine rather than of the repository,
so the reviewer's build and ours can resolve to different compilers — and a preview SDK
producing a warning that GA does not is a build failure here, because warnings are
errors.

**Settled:** commit a `global.json` pinning `10.0.200` with
`"rollForward": "latestFeature"`. That accepts a newer 10.0.x feature band and refuses
the preview, and it makes the build reproducible on a machine we have never seen —
which is the actual requirement behind NFR-7.

This is `BE-001-11`. It is four lines and it removes an entire class of "works on my
machine".

---

## R-8 · Is Docker actually available here?

**Checked:** `docker --version` and `docker info` on 2026-08-23.

**Found:** Docker 29.5.3 CLI is installed. The **daemon is not running** —
`failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`.

**Consequence, and it is not a spec problem:** assumption A-1 is currently false. The
integration suite cannot run until Docker Desktop is started. Nothing about the plan
changes; what changes is that this is known now rather than discovered by a red suite
during implementation.

**Two things follow:**

1. `WaslApiFactory` must fail **fast** with a message naming Docker, not hang until a
   test timeout. That is already an edge case in `spec.md` and it is the behaviour that
   makes this state diagnosable in one second instead of two minutes.
2. The `mssql/server:2022-latest` image is not in the local cache, so the first
   integration run pulls roughly 1.5GB. `quickstart.md` says so, because an unexplained
   two-minute pause reads as a hang.

---

## R-4 · Does `/health` need the database, and what does it return?

**Checked:** ASP.NET Core health checks, and what a reviewer actually does with the
endpoint.

**Settled:** one endpoint, two checks, `AddDbContextCheck<WaslDbContext>()` for the
database. `200` when both pass; `503` when either fails, with the failing check named.

**Rejected:** liveness only. An endpoint that returns `200` while every request fails
because the database is down is worse than no endpoint, because it will be believed.

**Rejected:** two endpoints, `/health/live` and `/health/ready`. Correct in Kubernetes
and meaningless here — there is no orchestrator reading them, and ADR-002 says one
deployable. One endpoint, and the split can be added the day something needs it.

**Not requiring auth** is deliberate and matches `docs/sdd/05-api-conventions.md`'s
endpoint inventory, which lists `/health` as the one unauthenticated route besides the
token endpoint.

---

## R-5 · Client-generated `Guid` keys and index fragmentation

**The known issue:** random `Guid` primary keys on a clustered index cause page splits
and fragmentation as rows are inserted in non-sequential key order.

**Checked:** whether it matters at this scale, and what the alternatives cost.

**Settled: use `Guid`, generated in the application, and do not sequence them.**

- The domain needs an id before `SaveChanges` — `Customer.Create(...)` returns a valid
  aggregate, and an entity whose identity arrives later is a worse model.
- The volume here is a demo dataset and a support team, not an ingest pipeline.
- `NEWSEQUENTIALID()` would fix fragmentation and move id generation into the database,
  which reintroduces exactly the problem above.

**Recorded rather than hidden:** at a volume where this mattered, the answer would be a
sequential-GUID generator in the application (which keeps client-side generation *and*
insert locality). That is a change to one factory, not a redesign, and nothing in scope
justifies it now.

---

## R-6 · Does `Wasl.Domain` staying clean need a test, or a review?

**Checked:** `docs/sdd/testing/test-strategy.md`, which already names two architecture
tests — `IAuditableCommand` coverage and translation key parity — on the grounds that
both fail by omission, and omission is what review is worst at catching.

**Settled:** a third architecture test, here, for the same reason. `Wasl.Domain` having
no dependency on EF Core or ASP.NET is the entire load-bearing claim of ADR-010; if it
quietly gains one, the two-project layout stops buying anything and nothing announces
it.

The test asserts over the compiled assembly's references, so it catches a transitive
reference arriving through a package as well as a direct one.

---

## R-7 · Anything in the house platform worth copying that is not already decided?

**Checked:** `azm-formbuilderBE` project layout and package set.

| Found | Taken? |
|---|---|
| `Serilog.AspNetCore` for structured logging | **Not in this feature.** No requirement yet, and BR-8.9 (logs are always English) only bites once there are messages to log. Revisit at `002`, where the error contract creates the first real log entry |
| `Mapster` for DTO mapping | **Not yet.** ADR-010 puts DTOs inside the slice that owns them, and a slice mapping its own two records by hand is clearer than a convention. Revisit if hand-mapping appears three times |
| `Swashbuckle.AspNetCore` | **Yes**, but at `002`, when there is more than one endpoint to document |
| `Moq` over `FakeItEasy` | **Yes** — already applied across `docs/sdd/`. House convention, and no reason to differ |
| A separate `IOC` project for DI registration | **No.** ADR-010 has two projects; a third holding only registration calls would be ceremony at this size. `Program.cs` composes everything |

**The pattern in these answers:** take the house convention where it costs nothing and
we have no reason of our own, and diverge only where a written reason exists. Both
directions are recorded so neither looks accidental.
