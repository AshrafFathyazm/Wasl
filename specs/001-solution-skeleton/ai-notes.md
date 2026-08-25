# 001 — AI Usage Notes

**State: implemented and tested on 2026-08-25.** 17 tests, 17 passed. The sections below
are filled from observed output, not from memory.

---

## Specification and planning

**Used for:** reading the whole SDD blueprint (19 root documents, 13 ADRs, 12
story-artifact sets, the design and testing folders) and reconciling it against two
external inputs — the assessment sheet and the house platform repository.

**Accepted as-is:**

- The blueprint's business rules (`BR-1` – `BR-9`), acceptance-criteria style, and
  Definition of Done. They were already written as testable propositions
- ADR-008's audit reasoning, ADR-007's localization ordering constraint, ADR-004's
  state machine — none needed changing

**Modified, and why:**

| What | Change | Reason |
|---|---|---|
| ADR-001 (PostgreSQL) | Superseded by ADR-013 (SQL Server) | The product owner specified SQL Server. ADR-001 itself said to revisit rather than defend if that happened |
| ADR-006 concurrency token | `xmin` → `rowversion`, reasoning preserved | Provider consequence of the above |
| `03-domain-model.md` physical shape | Rewritten in SQL Server types | `uuid`/`timestamptz`/`jsonb`/`boolean` do not exist there. `varchar` → `nvarchar` matters most: it is the one that breaks Arabic and looks like a font bug |
| `CRM.*` namespaces | → `Wasl.*` | Two names for one system across the blueprint |
| `FakeItEasy` | → `Moq` | House platform convention, no reason of our own to differ |
| `openapi/README.md` | Added a contract-first amendment | "The app is the contract" leaves the frontend unable to start. A frozen contract file now precedes both lanes |
| Story artifacts | Migrated to `specs/NNN-slug/` | Spec Kit's shape, matching the house platform's own `specs/` folders |

**Rejected:**

| Suggestion | Why it was rejected |
|---|---|
| Drop MediatR "to reduce complexity and keep the solution easier to explain" | ADR-008 needs a pipeline behaviour to make the audit row and the transaction boundary **structural** rather than something each handler remembers. Without it, BR-9.3 becomes discipline, and discipline is what the architecture test exists to replace. The house platform also uses MediatR, so the familiarity argument points the other way |
| ~~Four-project Clean Architecture, matching the house platform~~ — **this was not rejected in the end** | Raised as the safer choice, initially overruled in favour of ADR-010's vertical slices, and then **adopted on 2026-08-24** when the product owner reversed the decision. ADR-010 is now `Rejected`. Kept in this table rather than deleted because the sequence is the record: the argument was made, was set aside, and won on its own terms — the house convention, separation of concerns visible without explanation, and the developer being fastest in a familiar structure. Two things were carried over from the rejected proposal: feature folders inside `Wasl.Application`, and `IApplicationDbContext` instead of a repository |
| Adopt the house response envelope `{ IsSuccess, StatusCode, Data, Errors }` | The assessment sheet counts "returning 200 with an error in the body" against you. `ProblemDetails` with correct HTTP status codes is the deliberate divergence, and it is defended rather than accidental |
| Create every table in `InitialCreate` | A migration is the cheapest place to get a type mapping wrong. One table reviewed now beats seven reviewed at once |
| Add `Serilog`, `Mapster`, and `Swashbuckle` in this feature because the house platform has them | No consumer yet. Each is revisited at the feature that first needs it (`research.md` R-7). Adding a package with zero consumers is speculative, which is the same test ADR-010 applied to `IRepository` — and that particular conclusion survived its own rejection: there is no repository, only `IApplicationDbContext` |

**How each accepted output was verified:** every claim about the house platform was
checked by reading `azm-formbuilderBE/src` — project list, `TargetFramework` in the
csproj files, the `PackageReference` set, and the existing `specs/` folder shape. Every
claim about the blueprint was checked by reading the file, not by recalling it. The
Postgres-specific leakage was found with a grep across all 244 files, not by inspection,
because inspection is what let it survive this long.

**Not put into any prompt:** no credentials, no connection strings, no customer data.
The `sa` password in `docker-compose.yml` is a local throwaway and is not the
application own connection string: the development loop uses Windows auth, so there is no
application credential at all (AC-10, and `research.md` R-8).

---

## Implementation

**Run on 2026-08-25. No subagent was dispatched.** `tasks.md` names an agent per task, and
none was used: the whole feature was implemented in the main session, because every task
here is small and each one's verification informed the next. The named agents stand for
`002` onward. Recording this because "the agents did it" would be a false claim about how
the work happened.

### What AI was used for

Writing the code and, more usefully, **running it after each step**. Not one of the
findings below came from reading the output; every one came from executing something and
looking at what came back.

### Accepted as written, and verified

| What | Verified by |
|---|---|
| `Directory.Build.props`, `global.json`, the seven projects, the reference direction | `dotnet build` → 0 warnings; `dotnet --version` → `10.0.200` |
| `IApplicationDbContext` with `IQueryable<T>` | `LayerDependencyTests`, then proven to fail when EF Core was added |
| `WaslDbContext`, `CustomerConfiguration`, `UtcDateTimeConverter` | `INFORMATION_SCHEMA` query, then the round-trip tests |
| `InitialCreate` | Applied to the real database; run twice for idempotency |
| `HealthReportWriter` | `curl` against both the healthy and the unreachable-database case |

### Modified after running it

| First attempt | Why it changed |
|---|---|
| `global.json` with `rollForward: latestFeature` | Resolved to the installed **`10.0.400-preview`** — `latestFeature` explicitly permits a higher feature band, which is the opposite of pinning. `latestPatch` plus `allowPrerelease: false`. Caught in seconds by AC-13, which exists for exactly this |
| The `webapi` template as generated | Removed `Microsoft.AspNetCore.OpenApi`: the build gate flagged a high-severity advisory in its transitive `Microsoft.OpenApi 2.0.0`. Removed rather than pinned — `001` has no OpenAPI requirement |
| Template `csproj` files | They each restated `TargetFramework`, `Nullable`, and `ImplicitUsings`, so `Directory.Build.props` was decorative. Stripped, leaving `Wasl.Domain.csproj` genuinely empty |
| `LayerDependencyTests`, first version | **A false negative.** Asserting only over `GetReferencedAssemblies()` left it green with EF Core added, because nothing in `Wasl.Application` used an EF type yet. Now reads the declared `PackageReference` set as well |
| `/health`, first working version | Two contract violations: no `self` check, and `description` emitted as `null`. The contract was frozen first, so the implementation moved |
| `PersistenceConventionTests.Insert` | Used raw SQL, which **bypasses the value converter**, so the write-side UTC test was proving nothing and failed by three hours. Rewritten to insert through EF |
| The `DbUpdateException` assertion | Raw SQL surfaces `SqlException` (error 547) directly; EF only wraps `SaveChanges`. The behaviour was right, the assertion wrong |
| `xunit v3` idioms (`ValueTask` lifetimes, `TestContext.Current`) | The template installed **xunit 2.9.3**. Adapted the code to v2 rather than changing the package — the version is not something this feature has a reason to decide |

### Rejected

| Suggestion | Why |
|---|---|
| Pin `Microsoft.OpenApi` to a patched version | Keeps a package `001` does not need. Removing it fixes the advisory and the unnecessary dependency at once |
| Let `Wasl.Domain.Tests` stay empty | `dotnet test` exits non-zero on a project with no tests, which would fail CI. Added `CustomerShapeTests` — three assertions about a deliberate design decision (sealed, no public constructor, no public setter), which is not the same as testing the compiler |
| Add the async-materialisation abstraction now | `ToListAsync` and friends need it, but `001` has no handler and therefore no consumer, and the constitution forbids an abstraction with none. Deferred to `007`, where its shape can be decided against a real call site |
| Keep the round-trip test on raw SQL and relax the assertion | It would have made a failing test pass while proving less. The test was fixed, and the limitation it exposed was written down instead |

### Not put into any prompt

No credentials, no connection strings, no customer data. The `sa` password in
`docker-compose.yml` is a local throwaway for a disposable container; the application uses
Windows auth and has no credential at all.

---

## Testing

**17 tests, 17 passed, 0 skipped** — 3 domain, 5 application, 9 integration. Every command
and its real output is in `tests.md`, pasted rather than paraphrased.

AI wrote the tests; running them is what made them worth having. Four of them were wrong
on the first pass and only running them showed it — most importantly the architecture test,
which passed while the boundary it guards was broken. That one would have shipped as
evidence of a guarantee it was not making.

What was NOT verified is listed in `tests.md` under Gaps: AC-9 (CI has never run, because
that needs a push), AC-5 (verified manually, not by a test), and the `docker-compose.yml`
file itself (never started, since nothing in this feature consumes it).
