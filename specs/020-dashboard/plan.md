# 020 — Plan

**Phase:** 5 · Release 2 · **Role:** Architecture · **Agent:** `feature-dev:code-architect`
· **Skill:** `speckit-plan`

## Backend design

One slice, one endpoint, one handler, seven named query objects. Every file this feature
creates or changes is named below; a plan that does not name its files is a description.

```text
src/Wasl.Api/
  Features/Dashboard/GetDashboard/
    GetDashboardEndpoint.cs            maps GET /api/dashboard; binds range, authorizes, delegates
    GetDashboardQuery.cs               IRequest<DashboardResponse>. A query, NOT IAuditableCommand
    GetDashboardHandler.cs             resolves scope, builds the spine, runs the seven queries, assembles
    GetDashboardValidator.cs           FluentValidation: range ∈ { 7d, 14d, 30d } → AC-15
    DashboardResponse.cs               the whole response record tree, per contracts/dashboard-api.md
    DashboardScope.cs                  Mine | Team, derived from the role claim — one place, one predicate
    DashboardRange.cs                  parses "7d|14d|30d" → day count. Rejects everything else
    Queries/
      AttentionTilesQuery.cs           conditional aggregates + oldest-untouched + my-oldest  → 1 command
      DailySeriesQuery.cs              OPENJSON spine LEFT JOIN created LEFT JOIN first-resolved → 1
      OpenByStatusQuery.cs             GROUP BY Status, Closed excluded                        → 1
      ChannelMixQuery.cs               GROUP BY Channel over the range                         → 1
      MedianDurationsQuery.cs          PERCENTILE_CONT … OVER (), both medians, one row         → 1
      NeedsAttentionQuery.cs           TOP (10), customer name projected in the same query      → 1
      TeamLoadQuery.cs                 SupportUsers LEFT JOIN Tickets. Manager only            → 1 or 0
    Queries/DashboardQueryTypes.cs     the seven keyless types + their model configuration
  Common/
    Persistence/WaslDbContext.cs       CHANGED: one line — DashboardQueryTypes.Apply(modelBuilder)
    Time/OrganizationTimeZone.cs       NEW. Reads Wasl:OrganizationTimeZone once, at startup
    Time/LocalDaySpine.cs              NEW. Pure: (TimeZoneInfo, today, dayCount) → day triples
  Program.cs                           CHANGED: registers OrganizationTimeZone; maps the endpoint
  appsettings.json                     CHANGED: "Wasl": { "OrganizationTimeZone": "Asia/Riyadh" }

tests/Wasl.Api.IntegrationTests/
  Common/CommandCountingInterceptor.cs NEW **only if 010 has not already created it** (research.md R-7)
  Common/LocalDaySpineTests.cs         pure unit tests, no container — DST and boundary arithmetic
  Dashboard/DashboardQueryCountTests.cs
  Dashboard/DashboardRoleScopeTests.cs
  Dashboard/DashboardDateSpineTests.cs
  Dashboard/DashboardTimeZoneTests.cs
  Dashboard/DashboardMedianTests.cs
  Dashboard/DashboardResolvedFromHistoryTests.cs
  Dashboard/DashboardValidationTests.cs
  Dashboard/DashboardAuditTests.cs
  Dashboard/DashboardFreshnessTests.cs
  Dashboard/DashboardLocalizationTests.cs
  Dashboard/DashboardContractShapeTests.cs
  Dashboard/DashboardBuilders.cs       test data builders: a ticket at a named local instant
```

**No migration, no `Wasl.Domain` change.** [`data-model.md`](data-model.md) explains why,
and the absence is checkable: if a migration file appears in a commit for this feature, one
of the two documents is wrong.

### Where each decision is enforced

| Decision | Enforced by | Not by |
|---|---|---|
| Seven queries, not forty | `DashboardQueryCountTests` asserting an exact count per role (AC-17) | Reviewing the handler and counting `await`s |
| An Agent gets no team data | `TeamLoadQuery` is **not called**, and the response record omits the property | A filter applied after fetching, or a `null` the client happens not to render |
| Days are local days | `LocalDaySpine` in C#; SQL receives UTC instants and never a timezone name | `AT TIME ZONE` in the query, which is non-sargable and resolves names from the host OS (`research.md` R-3) |
| Empty days appear | The spine is the **left** side of the join, always | `GROUP BY` over the data, which omits them silently |
| Medians, not means | `PERCENTILE_CONT` with an explicit `sampleSize` beside each one | `AVG`, and a hope that nobody left a ticket open over a holiday |
| "Resolved" is a resolution, not a closure | `TicketHistory` `MIN(PerformedAtUtc)` where `NewValue = 'Resolved'` (AC-19) | `ClosedAtUtc`, which is a different fact and undercounts pessimistically |
| `localDate` is a date, not an instant | The response type carries `DateOnly`, and `DashboardContractShapeTests` asserts the serialised string (AC-16) | A `DateTime` and a serialiser setting somebody changes later |
| A bad timezone id is loud | `OrganizationTimeZone` resolves at **startup** and throws | A per-request `try/catch` whose fallback is UTC — the silent version of the bug this feature is about |
| Time comes from a clock we control | Injected `TimeProvider`; `ageHours` computed server-side | `DateTime.UtcNow`, and a client clock deciding what "oldest" means |

### `GetDashboardHandler` — the order, written down

```csharp
var scope   = DashboardScope.From(currentUser.Role);              // Mine | Team
var days    = DashboardRange.ToDayCount(request.Range);           // 7 | 14 | 30
var spine   = LocalDaySpine.Build(orgTimeZone, timeProvider.GetUtcNow(), days);

var tiles    = await attentionTiles.RunAsync(scope, currentUser.Id, ct);          // 1
var series   = await dailySeries.RunAsync(scope, currentUser.Id, spine, ct);      // 2
var statuses = await openByStatus.RunAsync(scope, currentUser.Id, ct);            // 3
var channels = await channelMix.RunAsync(scope, currentUser.Id, spine, ct);       // 4
var medians  = await medianDurations.RunAsync(scope, currentUser.Id, spine, ct);  // 5
var needs    = await needsAttention.RunAsync(scope, currentUser.Id, ct);          // 6
var team     = scope is DashboardScope.Team
             ? await teamLoad.RunAsync(ct)                                        // 7, Manager only
             : null;
```

Four properties of this shape that are deliberate:

- **Sequential, not `Task.WhenAll`.** One `DbContext` is not thread-safe, and seven parallel
  reads would need seven contexts or seven connections. Seven sequential aggregate scans at
  this volume are already far below the 300ms threshold; the concurrency would buy latency
  nobody has asked for and cost a lifetime rule that is easy to break later.
- **`CancellationToken` on every call.** A 30-day dashboard abandoned by a closing tab
  should stop, and threading the token is a Definition-of-Done item, not a nicety.
- **`scope` and `currentUser.Id` are passed into the query, never applied after.** This is
  AC-3 and AC-4 as a shape rather than as discipline: there is no in-memory collection to
  filter, so there is nothing to forget to filter.
- **`team` is `null` and the response record omits the property**
  (`JsonIgnoreCondition.WhenWritingNull` on that member only). Not an empty array. AC-18
  asserts the raw body.

### Program.cs — the ordering constraint that is not ours but bites here

This feature adds one registration and one `MapGet`. It changes no middleware order — and
that is worth writing down, because the order it must not disturb is the one ADR-007 calls
*the single most likely defect in this piece of work*:

```csharp
app.UseAuthentication();
app.UseRequestLocalization();   // ← AFTER authentication, always. ADR-007 §4
app.UseAuthorization();
```

`UseRequestLocalization()` before `UseAuthentication()` fails **silently**: the custom
culture provider reads a claim that is not there yet, returns nothing, and the application
quietly falls back to `Accept-Language` forever. This endpoint's Arabic test
(`TEST-020-15`) exercises a route that returns translated `ProblemDetails`, so it is one of
the places that would catch a regression — but it is not the owner of the constraint, and it
must not "fix" it by re-registering anything.

### The exception to ADR-010, named rather than absorbed

ADR-010 puts DTOs inside the slice that owns them. Seven **keyless query types** must be
registered on `WaslDbContext.OnModelCreating`, which lives in `Common/Persistence/` — EF
Core will not project into a type the model does not know (`research.md` R-6).

Contained as tightly as possible: the types and their configuration are defined in
`Features/Dashboard/GetDashboard/Queries/DashboardQueryTypes.cs`, and `WaslDbContext` gains
**one line** calling `DashboardQueryTypes.Apply(modelBuilder)`. The slice still owns the
definitions; the context only knows they exist.

## Frontend design

One route, one query, one card grid. Fetching happens at the route level only (ADR-011 §4),
so there is no waterfall to prevent — there is one request for the whole screen by
construction.

```text
wasl-web/src/features/dashboard/
  api.ts                     getDashboard(range) → typed fetch
  queries.ts                 useDashboard(range); key ['dashboard', range]
  types.ts                   PROVISIONAL types, replaced by generated ones (FE-020-01)
  DashboardPage.tsx          ROUTE. Owns the range from the URL and the single query
  RangeTabs.tsx              7d | 14d | 30d → writes to the URL, never to state (AC-13)
  AttentionTile.tsx          one number, one label, muted at zero (AC-10)
  AttentionRow.tsx           the four tiles for the active scope
  CreatedVsResolvedBars.tsx  paired bars per local day + hidden table (AC-21)
  OpenByStatusBars.tsx       horizontal bars, status dot language
  ChannelMixBars.tsx         horizontal bars, navy ramp — channel is not a state
  MedianStats.tsx            two medians; renders "—" when sampleSize is 0
  NeedsAttentionList.tsx     top ten, oldest first, links into /tickets/:id
  TeamLoadList.tsx           Manager only; rendered only when teamLoad is present
  BarTrack.tsx               the shared bar geometry. Local to this feature, not a primitive
  ValueTable.tsx             the visually-hidden table every bar block renders (AC-21)
  DashboardSkeleton.tsx      per-card skeletons at real heights (AC-11)
  FirstRunPanel.tsx          empty system: one CTA, not twelve zeros (AC-9)
  NothingAssignedPanel.tsx   Agent with nothing assigned: the pool count as a next action
  DashboardError.tsx         one message + traceId for the whole screen (AC-12)
  formatLocalDate.ts         renders a bare date string WITHOUT new Date() (AC-16)
wasl-web/src/locales/en/dashboard.json     NEW
wasl-web/src/locales/ar/dashboard.json     NEW
wasl-web/src/routes.tsx                    CHANGED: /dashboard, lazily loaded
wasl-web/src/features/shell/AppNav.tsx     CHANGED: nav item, design/icons/dashboard.svg
```

Primitives consumed unchanged: `Button` (range tabs, CTA), `Badge` (status, priority,
escalated), `Table` (needs-attention rows). **No ninth primitive.** The bar geometry lives
in `BarTrack.tsx` inside this feature because the dashboard is its only consumer, and
ADR-011 §3 is explicit that sharing waits for the second one. `spec.md` A-6 carries the
reasoning; [`research.md`](research.md) R-9 carries what was rejected.

Full screen detail — states, i18n keys, RTL obligations, accessibility, and what is
deliberately not on the screen — is [`frontend-spec.md`](frontend-spec.md). The API surface
is [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md).

## Data changes

**None.** See [`data-model.md`](data-model.md): no table, no column, no index, no migration.
Five candidate indexes are named there with the measurement that would justify each, so
adding one later is a five-minute decision rather than a fresh investigation.

## Contract changes

The initial contract: [`contracts/dashboard-api.md`](contracts/dashboard-api.md), frozen
2026-08-23. No prior contract exists, so nothing is broken.

Two things this contract settles that US-016 left open, recorded here because they are
contract decisions rather than spec decisions:

| Settled | Where it came from |
|---|---|
| `teamLoad` is **absent** for an Agent rather than `null` or `[]` | AC-4's "not hidden client-side" is only checkable if the property is not there. AC-18 |
| `localDate` is a bare `date` string, and `medians.*Minutes` are `int?` with a `sampleSize` beside each | AC-16, and the "median is zero" / "there is no data" distinction the screen must not blur |

Anything that moves after today arrives as a row in this section, the guide is regenerated,
and both lanes are told. A contract change discovered by the frontend failing to compile is
the failure this process exists to prevent.

## Test strategy

| Level | What | Why there |
|---|---|---|
| **Unit — no database** (`Common/LocalDaySpineTests.cs`) | The day spine: 7/14/30 lengths, boundary instants, a DST-observing zone, the first and last day of the range | Pure `TimeZoneInfo` arithmetic. The DST case is the one that would never be caught by a test written against `Asia/Riyadh`, which has no DST — so the test uses a zone that does |
| **Unit — no database** (`DashboardRange`, `DashboardScope`) | Range parsing and its rejections; role → scope | Pure functions with the interesting inputs at the edges |
| **Integration** (`Testcontainers.MsSql`) | Everything else — see the table below | Every claim here is a property of the real engine or of the real pipeline |
| **Frontend** (Vitest + RTL) | Range↔URL sync, zero rendered muted, `null` median rendered as "—", no team card when `teamLoad` is absent, Latin digits under `ar`, `localDate` rendered without `new Date()` | The states most often skipped, plus the two silent bugs a component can cause on its own |
| **Manual, and a listed deliverable** | The Arabic pass on `/dashboard`, and the accessibility pass on the bar blocks | RTL and screen-reader defects are not assertable here. Calling them "covered by tests" would be false |

Why each integration test is an integration test and not a unit test:

| Test | The thing only a real engine proves |
|---|---|
| `DashboardQueryCountTests` | How many commands EF actually issued. This is the whole feature's load-bearing claim (AC-8, AC-17) |
| `DashboardTimeZoneTests` | That a 19:00 UTC instant lands in the 10 August local bucket, through the real `OPENJSON` join |
| `DashboardDateSpineTests` | That the empty day survives the join. A unit test of the spine proves the spine, not the join |
| `DashboardMedianTests` | `PERCENTILE_CONT … OVER ()` parses and interpolates. It is a syntax risk as much as a maths one (`research.md` R-4) |
| `DashboardResolvedFromHistoryTests` | A reopened-and-resolved ticket counted once, across two real history rows |
| `DashboardRoleScopeTests` | Real tokens for both roles through the real authorization pipeline. A faked user proves nothing about the policy |
| `DashboardAuditTests` | The **absence** of a row on success and its presence on `403` — a real transaction and a real table |
| `DashboardLocalizationTests` | That `Accept-Language: ar` translates sentences and leaves `type`, property names, and digits byte-identical. Needs the real localization middleware, which is where the ADR-007 ordering defect lives |
| `DashboardContractShapeTests` | The serialised JSON: `localDate` with no `T`, `teamLoad` absent, `Cache-Control: no-store` |

### Deliberately not tested, with reasons

| Not tested | Reason |
|---|---|
| That EF Core executes SQL, that `OPENJSON` shreds JSON, that SQL Server computes a percentile | Testing the engine. What **is** tested is that our query returns the number we claim |
| Load or performance at volume | No stated requirement (`test-strategy.md`). The 300ms threshold is a **trigger for a measurement**, not a gate. If it is ever measured, the number goes in `tests.md` |
| The visual correctness of a bar — width, colour, ramp | No assertion catches a bar sized wrong. Covered by the preview (`FE-020-00`) and the Arabic pass |
| Screen-reader output verbatim | Covered by the accessibility pass. AC-21 asserts the hidden table **exists and carries every value**, which is the part a test can hold |
| Every combination of range × role × empty/populated | Twelve cases for one shape. Ranges are covered once each for length; role is covered on the populated set; empty is covered once. Combinatorial coverage here buys nothing over the boundary cases |

## Dependencies

| Depends on | For | If it is not there yet |
|---|---|---|
| `001-solution-skeleton` | `WaslDbContext`, the UTC converter, `TimeProvider`, the container fixture | Hard block |
| `002-error-contract` | `ProblemDetails`, `traceId`, the `type` URIs this contract cites | Hard block on AC-12 and every failure row |
| `004-auth-and-roles` | The role claim, the two policies, and the `401`/`403` audit rows | Hard block on AC-3, AC-4, AC-20 |
| `005-localization-core` | `Content-Language`, the catalogues, the key-parity test | Hard block on AC-14 |
| `006-design-system` | Tokens, `Button`, `Badge`, `Table` | Hard block on the frontend |
| `009-create-ticket`, `010-ticket-list-and-detail` | Tickets to aggregate, and the `CommandCountingInterceptor` (`research.md` R-7) | A dashboard over an empty `Tickets` table renders the first-run panel and proves nothing. **This is the dependency that decides whether the feature is worth starting** |
| `012-change-ticket-status` | `TicketHistory` rows for `Resolved`, without which the resolved series is structurally always zero | AC-19 is unverifiable. Seed data can fabricate history rows for a test, but the *screen* means nothing |
| `013-ticket-timeline-and-comments` | Comments, without which the first-reply median is always `null` | The median tile is honest but empty |
| `016-escalate-ticket` | A writer for `IsEscalated` | **Not a block.** The tile reads `0`, correctly (`research.md` R-11) |

## Risks and trade-offs

### The honest one: this is the most tempting thing on the board and close to the least valuable

A dashboard is the best-looking screen in any CRM and it is the one to build last. Three
things are true about this feature at once:

- **It demonstrates nothing the ticket list does not.** The list already proves the schema,
  the query, the API contract, the localization pipeline, and the RTL layout. The dashboard
  re-proves all five and adds a bar chart.
- **It is entirely parasitic on other features.** Every number is zero until `009`, `010`,
  `012`, and `013` are real. Built early, it is seven queries over an empty table, a screen
  of muted zeros, and no way to tell a correct query from a broken one — which is worse than
  not having it, because a green test suite over an empty table looks like evidence.
- **It is where a schedule goes.** Bars, spacing, colour ramps, and "just one more tile"
  have no natural stopping point, and the work is enjoyable, which is exactly why
  `PHASES.md` puts it fourth in Phase 6 — after the login animation, which is listed as
  *the most fun, and that is why it is last*.

**So the risk is not that this feature fails. It is that it succeeds early**, at the cost of
`012`'s 36 transition tests or `013`'s timeline paging. `specs/README.md` is unambiguous:
cut from Phase 5, never from tests. Written here rather than left as a feeling, because a
feeling does not survive a Friday afternoon.

The counter-argument, stated fairly: it is the only screen that answers *what should I do
first*, and a support tool without one is a queue people scroll. That value is real —
**and it is real only once the queue has something in it.**

### Considered and rejected: six or seven separate endpoints

`GET /api/dashboard/attention`, `/trend`, `/status`, and so on. Genuinely attractive — each
loads independently, each card gets its own skeleton and its own error, and a slow block
cannot hold up the rest.

Rejected for three reasons:

1. **Six authorization checks instead of one**, and six chances for the role filter to be
   applied in five places and forgotten in the sixth. AC-4 becomes six tests.
2. **The numbers stop agreeing.** Blocks fetched a second apart on a live queue disagree,
   and a dashboard whose tiles contradict each other is worse than a slower one.
3. **AC-8 becomes unassertable.** "Roughly six queries" across six requests cannot be
   counted in one place, and the waterfall ADR-011 §4 forbids is exactly what six
   route-level fetches produce.

The per-card skeleton that this alternative was reaching for is kept anyway (AC-11) — it is
a rendering decision, not a fetching one.

### Considered and rejected: a materialised summary table refreshed on write

A `DashboardDaily` table updated by the ticket write path, or by a nightly job. Reads become
one cheap `SELECT`, and the trend survives any volume.

Rejected:

- It puts dashboard logic in `012`'s and `013`'s write paths — a Release 2 feature reaching
  into two Release 1 features, and their handlers acquiring a reason to know about a screen.
- Two sources of the same number, and the stale one is the one on the screen. Every
  "the dashboard is wrong" report then costs a reconciliation.
- It solves a performance problem nobody has measured. The threshold that would justify it
  is ~300ms at realistic volume, and crossing it costs an ADR — in which case the first
  answer is an index (`data-model.md` candidate 2), not a second copy of the truth.

### Considered and rejected: `AT TIME ZONE` in the query

The obvious translation of the screen spec's PostgreSQL, and it keeps all the date logic in
one language. Rejected on three independent grounds — non-sargable predicates, a timezone
identifier that resolves differently on Windows and Linux hosts, and a compatibility-level
dependency for `GENERATE_SERIES`. Full reasoning in [`research.md`](research.md) R-2 and R-3.

The third ground is the one that decided it: the integration suite runs on a Linux container
and a developer may run Windows SQL Server, so the query would be **green in CI and red
locally, or the reverse**, depending on which host the engine sat on. A defect that depends
on the operating system under the database is close to the worst kind to debug, and the
chosen design makes it impossible rather than documented.

### Considered and rejected: add `Tickets.ResolvedAtUtc`

One column, and every resolved query becomes trivial. Rejected — [`research.md`](research.md)
R-5. It changes `012`'s write path, it denormalises a fact `TicketHistory` already holds,
and one screen is not a reason for two features to keep a timestamp in step.

### Accepted risk: seven raw SQL strings

Seven queries that the compiler cannot check. A column rename in a future feature breaks
them at runtime, not at build time, and EF's LINQ provider would have caught it.

Accepted because none of the seven is expressible in LINQ (`research.md` R-6), and contained
three ways: each query object has exactly one caller and one integration test that executes
it against a real schema; the tests run in CI on every push, so a rename breaks the build on
the commit that made it; and each query lives in its own file named after the block it
serves, so the failure names itself.

### Accepted risk: `LocalDaySpineTests` in the integration test project

`001` created two test projects. `LocalDaySpine` is a pure, BCL-only class that wants fast
unit tests, and it lives in `Wasl.Api` — which has no unit-test project of its own.

Rather than create a third project for one class, its tests live in
`Wasl.Api.IntegrationTests/Common/` and touch no container. **The risk is concrete:** if the
Testcontainers fixture is registered at assembly scope rather than per-collection, these
"unit" tests pay a container start and stop being fast, which is the only reason they were
put there. `TEST-020-08` verifies the fixture is per-collection and records the observed run
time, so the compromise is measured rather than assumed.

### Accepted risk: A-2 — one scope predicate for every block

An Agent's figures are scoped by `AssignedToUserId`, including the *created* series. So a
ticket an Agent created but was never assigned is absent from "their" created bar.

Accepted because one predicate applied uniformly is comprehensible and two predicates are
not: a screen where "created" means one population and "resolved" means another needs a
sentence of explanation on the card. If the product owner wants created-by-me, it is one
clause in `DailySeriesQuery` — and the sentence goes on the card.

### Accepted risk: A-5 — the seven reads may not be one snapshot

If `003`'s transaction behaviour wraps commands only, a ticket created between query 3 and
query 5 appears in one block and not another. Accepted deliberately: a serializable
transaction would take locks on `Tickets` across seven aggregate scans, penalising every
writer to buy a consistency nobody asked for. The screen says "updated a minute ago", which
is the honest promise. [`research.md`](research.md) R-13.
