# 020 — AI Usage and Audit

**Phase:** Delivered · **Status:** Both lanes built and verified 2026-09-07

Be specific. "AI helped and I reviewed it" is worthless. Name the artifact, the suggestion,
and what was wrong with it.

The **Implementation** and **Testing** sections below were empty headings until 2026-09-07,
with a note saying so — no code had been written and Docker was not running. That note was the
honest state at the time and it is what this file replaces, rather than pretending the sections
were always filled (constitution II).

---

## Specification phase

### What AI was used for

| Task | Input |
|---|---|
| Author the nine artifacts in `specs/020-dashboard/` | `docs/sdd/user-stories/US-016-dashboard.md`, `docs/sdd/design/screens/11-dashboard.md`, `docs/sdd/04-business-rules.md`, `05-api-conventions.md`, `09-definition-of-done.md`, `00-project-context.md`, `03-domain-model.md`, `testing/test-strategy.md`, ADR-007 / 009 / 010 / 011 / 013, `design/component-inventory.md`, `design/design-tokens.md`, `design/layout-patterns.md`, `.specify/memory/constitution.md`, `specs/README.md`, and `specs/001-solution-skeleton/` plus `specs/007-create-customer/` as the format reference |
| Translate the screen spec's PostgreSQL into SQL Server dialect | The screen spec's queries, read against ADR-013's provider-coupled surface |
| Cross-check the story's acceptance criteria against the schema | `03-domain-model.md`'s `Ticket` field table, read column by column |

### Context provided

Only files inside this repository, all of them committed documentation. **No secrets, no
connection strings, no tokens, and no production or customer data** were included in any
prompt. Nothing was fetched from the network.

### Machine facts, verified rather than assumed

| Checked | Result |
|---|---|
| `dotnet --version` (bare machine) | `10.0.400-preview.0.26322.102` — the preview, which is why `001`'s `global.json` exists (`001` R-3) |
| `dotnet ef --version` | `10.0.10` |
| `docker info` | Client 29.5.3 present; **daemon not running** — `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`. Same state as `001` R-8 |
| `ls src`, `ls tests` | Neither exists. **No code has been written in this repository yet** |

The last row is the reason every SQL claim in [`research.md`](research.md) names the task
that will execute it. Nothing in these documents has been run against a database.

### Accepted after verification against a source file

"Verified" here means *checked against a named file in this repository*, since nothing is
runnable yet. Verification by **execution** happens at implementation and is recorded below,
in the empty section.

| Output | How it was verified |
|---|---|
| One endpoint filtered by role rather than two endpoints | `11-dashboard.md`, "Two audiences, one route", read directly. Not inferred |
| Median rather than mean, with `PERCENTILE_CONT` | US-016 AC-7 read verbatim; the reasoning cross-checked against `11-dashboard.md`, "Median, not average" |
| A date spine, with the empty-day trap as its justification | `11-dashboard.md`, "The empty-day trap" |
| Local-day bucketing with the zone stated in the header | US-016 AC-6, and `11-dashboard.md`'s "Time zone — a real trap" |
| No caching, with a ~300ms revisit threshold and an ADR requirement | `11-dashboard.md`, "Caching" — quoted, not invented |
| An executed-command-count assertion as the AC-8 mechanism | `testing/test-strategy.md`: *"Absence of N+1 in the list and timeline queries — assert the executed command count"*, plus `specs/README.md`'s exit condition for `010` |
| No leaderboard, and the reason | US-016 **Notes**, read verbatim |
| The task table's `Agent` and `Skill` strings | Copied from `specs/README.md` "Who builds what", string by string, not from memory |
| `TicketStatus`, `TicketPriority`, `CommunicationChannel` membership in the contract | `03-domain-model.md`, Enums block |
| Column names and types in `data-model.md` | `03-domain-model.md`, entity tables, field by field |
| The eight primitives, and that a ninth needs a written reason | ADR-009, "The eight primitives"; `component-inventory.md` |

### Modified

| Output | What was changed | Why |
|---|---|---|
| "Roughly six queries" (US-016 AC-8) | Kept AC-8 verbatim; **added AC-17** pinning exactly 7 for a Manager and 6 for an Agent | "Roughly" is not a test. An assertion that passes at eleven queries protects nothing. Counting the blocks gave seven, not six — the screen spec's own table lists six aggregate blocks and omits the needs-attention list, which is a query too. Recorded as seven rather than forced to six |
| `GROUP BY date` joined to `generate_series` | Replaced with a spine computed in C# and shredded with `OPENJSON` | Three independent reasons in `research.md` R-2. The decisive one: `AT TIME ZONE` resolves names from the **host OS**, so the query would be green in CI (Linux container) and red on a Windows engine, or the reverse |
| `percentile_cont(0.5) WITHIN GROUP (…)` as an aggregate | Rewritten as `… OVER ()` with `TOP (1)` | It is an **analytic** function in SQL Server, not an aggregate. The PostgreSQL form is a parse error, and the difference is invisible to anyone reading the two side by side |
| `count(*) FILTER (WHERE …)` | `SUM(CASE WHEN … THEN 1 ELSE 0 END)` | No `FILTER` clause in SQL Server. Mechanical; the count is identical |
| "created vs resolved" sourced from the ticket row | Sourced from `TicketHistory`, first `StatusChanged → Resolved` per ticket | **There is no `ResolvedAtUtc` column.** Found by reading `03-domain-model.md`'s `Ticket` table looking for it. AC-19 exists for this alone |
| A single set of four attention tiles | Six counts returned, four rendered per scope | US-016 AC-2 names the Manager's four; `11-dashboard.md` gives the Agent a different four. Both are right about their own role, so the response carries both sets and the client picks (`spec.md` Q-C) |
| Every count scoped by role | `unassignedCount` deliberately **not** scoped | An unassigned ticket has no owner, so there is no "mine" version of it. Scoping it would show every Agent `0` forever and break the most actionable number on the screen (`spec.md` A-3) |
| `teamLoad: []` for an Agent | `teamLoad` **absent from the JSON document** | AC-4's "not hidden client-side" is only checkable if the property is not there. AC-18 asserts the raw body |
| `localDate` as an ISO timestamp | A bare `"YYYY-MM-DD"` string, with AC-16 asserting the shape | `new Date("2026-08-10")` parses as UTC midnight and renders as 9 August for a viewer west of the zone. The chart shifts one column, nothing throws, and it still looks like a plausible fortnight |

### Rejected

| Output | Why rejected |
|---|---|
| A charting library — Recharts, Chart.js, D3 | `component-inventory.md` lists *"Charts — no reporting in scope"*. Each is a real dependency with its own RTL, accessibility, and colour opinions, on a droppable Release 2 screen. Four bar blocks are roughly forty lines of CSS (`research.md` R-9) |
| A ninth primitive for the bar | ADR-009 caps primitives at eight; ADR-011 §3 moves something to `components/` *when the second consumer appears*. The dashboard is the only consumer |
| A `Tickets.ResolvedAtUtc` column | Changes `012`'s write path, denormalises a fact `TicketHistory` already holds, and one screen is not a reason for two features to keep a timestamp in step (`research.md` R-5) |
| Six or seven separate endpoints, one per card | Six authorization checks, blocks whose numbers disagree with each other, and AC-8 becomes unassertable. `plan.md`, Risks |
| A materialised `DashboardDaily` summary table | Dashboard logic in two Release 1 write paths, two sources of one number, and it solves a performance problem nobody has measured |
| `Task.WhenAll` across the seven queries | One `DbContext` is not thread-safe. Seven contexts would buy latency nobody asked for and cost a lifetime rule that is easy to break later |
| An `IDashboardRepository` | The constitution forbids it: `DbSet<T>` is already one, and an interface with one implementation and no second in prospect is ceremony. Named query objects, one caller each |
| Dapper alongside EF for the raw queries | A second data-access library for one screen |
| `aria-label` on the bar container as the accessibility answer | A summary sentence is not the data. AC-21 requires a hidden table carrying every plotted value |
| Auto-refresh / polling | No requirement, and a stale live-looking number is worse than "updated a minute ago" |
| Filling BR-6's missing dashboard row from this spec | A rule invented inside a feature folder is the one thing `00-project-context.md` says must not happen. Raised as a gap instead (`DOC-020-02`) |
| Rewriting `docs/sdd/design/screens/11-dashboard.md` to fix its PostgreSQL | Outside this feature's write scope. Raised as a gap |
| Relying on `Database.SqlQuery<T>` for non-scalar shapes | Documented for **scalar** types. Whether EF Core 10 accepts these shapes must be confirmed **by running it** — this is exactly the failure mode constitution VI names. Keyless query types are the specified default until `BE-020-02` proves otherwise (`research.md` R-6) |

### Hallucination risks caught during specification

Nothing was executed, so nothing could be *caught failing*. What follows is the class of
claim that would have been a hallucination had it been written down unchecked, and how each
was handled instead.

| Claim that would have been plausible | What was done | Status |
|---|---|---|
| "`percentile_cont` is an aggregate in SQL Server, like in PostgreSQL" | Written down as an **analytic** function requiring `OVER ()`, with `BE-020-09`'s verification being that it *parses* against the container | To be confirmed by execution — `BE-020-09` |
| "`generate_series` works the same way" | Written down as SQL Server 2022 + **compatibility level 160**, integer series only, and rejected for the spine on three grounds | To be confirmed by execution if anyone revisits it |
| "`AT TIME ZONE 'Asia/Riyadh'` works everywhere" | Written down as host-OS dependent — Windows names on Windows, IANA on Linux — and designed out entirely | To be confirmed by execution — `TEST-020-05` proves the chosen design |
| "`Database.SqlQuery<T>` returns any shape" | **Not relied on.** Keyless query types specified instead | To be confirmed — `BE-020-02` |
| "The global UTC converter applies to raw-SQL projections" | Written as an assumption with `TEST-020-09` asserting it, not as a fact | To be confirmed — `TEST-020-09` |
| "`010` already has a command-counting interceptor" | Written as assumption A-7 with both branches specified in `TEST-020-01` | To be confirmed when `010` exists |

Every row above is a place where a confident sentence would have read exactly like a correct
one. Each is a task with a verification instead.

### Human decisions and trade-offs

Decisions made by a person, not by the model:

| Decision | Reasoning |
|---|---|
| Keep US-016's AC numbering and add from AC-15 | The task instruction, and it keeps traceability from the story to the tests intact |
| Report the four blueprint contradictions rather than resolve them | `docs/sdd/**` is not this feature's to edit, and gap 3 — the project-context document excluding dashboards while the board schedules one — needs an owner's answer, not a spec's workaround |
| State plainly that this feature is the most tempting and least valuable on the board | It is true and it is the most useful sentence in `plan.md`. A dashboard demonstrates nothing the ticket list does not, and every number is zero until `009`, `010`, `012`, and `013` are real |
| Make the whole feature droppable and write the internal cut order anyway | "Cut scope, never quality" only works if the cut order exists before the Friday it is needed |
| Specify no schema change and no index, with five candidates and their thresholds | The constitution requires an index to be justified by a named query; none is justified at this volume, and a written candidate list makes the later decision cheap |
| Accept that the seven reads may not be one snapshot (A-5) | A serializable transaction would take locks on `Tickets` across seven aggregate scans to fix a one-ticket, one-second discrepancy nobody asked about |

---


## Implementation

Written 2026-09-07, both lanes, against the two design canvases the product owner supplied
that day. Every figure below is from a run; nothing is recalled.

### What AI wrote, and what a person changed

| Artifact | AI produced | Changed after review |
|---|---|---|
| `DashboardAggregatesQuery.cs` (7 SQL commands) | All of it | The class was **collapsed from `plan.md`'s seven types into one**, because `CLAUDE.md` sanctions two named query classes and seven would need five written reasons. The deviation is documented in the type itself, not just here |
| `LocalDaySpine.cs` | All of it | The invalid-midnight walk was `AddHours(1)`; changed to quarter-hours, because not every zone's transition is 60 minutes (Lord Howe moves 30) and a hard-coded hour leaves the loop standing on an invalid instant |
| `DashboardSnapshot.cs` DTOs | All of it | `localDate` was `DateOnly`; changed to `string`, so it cannot acquire a time component through a converter change made elsewhere |
| `DashboardController.cs` | All of it | `range` bound as `string?` and was **wrong** — see Testing below |
| `DashboardView.tsx` / `DashboardPage.tsx` | All of it | Split from one file into view + page after the preview was written, because five states cannot be reached from a wired screen |
| `DashboardPreview.tsx` | All of it | `teamLoad: undefined` refused by `exactOptionalPropertyTypes`; the property is now deleted, which is also the truer model of the wire |
| The four test suites | All of it | Four assertions were wrong and the runs corrected them; each is recorded in `tests.md` rather than quietly fixed |

### Accepted, after verification against a source file

| Claim | Verified against |
|---|---|
| Enums are stored as `nvarchar`, so raw SQL compares against `N'Closed'` | `TicketConfiguration.cs` lines 41–63 — `HasConversion<string>()` on Category, Priority, Channel, Status |
| `TicketHistoryEntry` and `TicketComment` are not `IAuditableEntity`, so their timestamps are not stamped | Both types' declarations, and `WaslDbContext.Stamp()` |
| `Ticket` IS `IAuditableEntity`, so a fixture's `CreatedAtUtc` is overwritten on insert | `WaslDbContext` lines 216–224 — the `Added` branch assigns unconditionally, unlike `Customer`'s which guards on `== default` |
| `base.css` scopes its `!important` control fill to `:not([class])` and documents the escape hatch | `styles/base.css` lines 62–98, including the paragraph recording the four defects that produced the scoping |
| `formatNumber` keeps Latin digits in Arabic | `lib/formatters.ts`, and `026`'s existing use of `{{formatted}}` beside `count` |
| `OpenApiContractTests` names unbuilt contracted endpoints individually | `Contracts/OpenApiContractTests.cs` line 51, which is the row this feature deleted |

### Rejected

| Suggestion | Why |
|---|---|
| Compute the tiles' `vs prev` deltas from "created last period vs this period" | It is a different population from the one the tile shows. A plausible arrow pointing at the wrong thing is worse than no arrow — the rule `027` applied to its SLA regions |
| Approximate `2 breaching` from tickets older than some threshold | That invents an SLA. `CLAUDE.md`: a countdown drawn from nothing is indistinguishable from a working one |
| Serve the channel percentages from the server | A second number that can disagree with the first. The client already has the count and the total |
| Add a `staleTime` so returning to a cached range issues no request | The endpoint is `Cache-Control: no-store` by decision; suppressing the revalidation is the caching this feature refused |
| Abbreviate agent names to "Ashraf F." as the canvas shows | The canvas's sample data, not a rule. Abbreviating is lossy on user content and the first Arabic name would be shortened at the wrong end |
| Use `[ResponseCache(NoStore = true)]` for the header | Its emitted directives depend on the interaction between `NoStore` and `Location`. The header is what the test asserts, so the code sets the header |

### Hallucination risks caught during implementation

| Risk | Caught by |
|---|---|
| `TicketComment.Create(ticketId, authorUserId, body, …)` — an `authorUserId` parameter that does not exist | Reading the factory: the signature is `(ticketId, body, createdAtUtc, isInternal, channel, authorCustomerId)` and the author is stamped by the context |
| `AuditEntry.EntityName` — a column that does not exist (it is `EntityType`) | The compiler, on the first build of the test project |
| `QueryCountProbe` being `IDisposable` and usable in a `using` | The compiler — CS1674. The house pattern reads `.Count` directly |
| `factory.ManagerUserId` — a fixture property that does not exist | The compiler; the id is now read from `dbo.SupportUsers` by email |

---

## Testing

Every command and every figure is in [`tests.md`](tests.md). What belongs here is what the
runs corrected, because a test that was written wrong and then fixed is the most useful thing
this file can record.

### Four assertions the AI wrote that were WRONG, and what each turned out to be

| Assertion | What the run said | What it actually was |
|---|---|---|
| `?range=` (empty) is a `400` | `200` | **The test was wrong.** An empty parameter is an absent one — `015` ruled the same for `?status=`. Replaced with a test asserting the `200` and the reason |
| A 22:00-local ticket proves AC-6 | Green **with the timezone offset deleted from the spine** | **The criterion's example cannot catch the criterion's defect** in a UTC+3 zone: 22:00 local is 19:00Z on the same date. Rewritten to 01:00 local, which is where local and UTC bucketing disagree |
| Returning to a cached range issues no request | Three requests, not two | **The test was wrong.** React Query's default `staleTime` is 0, so a cached entry revalidates — correct for a `no-store` endpoint. Now asserts the three-request sequence and that the card never re-skeletons |
| A 21-day-old ticket answered today moves the median | `firstReplySampleSize` unchanged | **The test was wrong.** The population is *tickets created in the range*, so a three-week-old ticket never enters a 14-day median. Changed to 13 days, and the reason is in the test |

### One defect the runs found in the PRODUCT

`?range=7d&range=30d` answered **`200` with a seven-day body** — first-wins, which the contract
forbids. Found by measuring the running API, not by reading the code: MVC hands a repeated
parameter's first value to a scalar parameter and discards the rest, so nothing downstream could
see the second one. The parameter binds as `string[]?` now, with its own message key.

### Negative controls

Six, all run, all reported as observed in `tests.md` — including **one that did not fail** (the
22:00 case above) and **one that fired for a reason other than the one it was written for** (the
fixture's read-back guard, which found that `datetime2(3)` rounds rather than truncates).

### Three defects that no test could have caught

jsdom computes neither cascade nor flex layout, so 1148 green frontend tests said nothing about
any of them. All three were found by opening the page in a browser and measuring computed style
and bounding boxes — the range buttons losing their pressed state to `base.css` rule 17's
`!important`, the chart's axis labels drawn inside the bars, and every progress track collapsing
to a hairline in a flex column. Before-and-after figures are in `tests.md`.

`dashboardGuards.test.ts` was written for the first of those, because a source scan is the only
guard that can see it, and it was verified by deleting the real `className` and watching it name
the offending tag.

### Context provided

Only files inside this repository, plus the two design canvases the product owner supplied in
the session. **No secrets, no connection strings, no tokens, no customer data.** The Manager
password needed to sign the browser session in was read from `dotnet user-secrets` into a file
and never printed; the short-lived token it produced was written to a file under
`src/wasl-web/public/` for the page to read and **deleted immediately afterwards**.
