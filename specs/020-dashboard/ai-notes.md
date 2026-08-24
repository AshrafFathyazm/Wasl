# 020 — AI Usage and Audit

**Phase:** Specification only · **Status:** Specification written; nothing implemented

Be specific. "AI helped and I reviewed it" is worthless. Name the artifact, the suggestion,
and what was wrong with it.

The **Implementation** and **Testing** sections at the end of this file are headings with
nothing under them. That is deliberate and it is the honest state: no code has been written,
no test has been run, and Docker is not running on this machine. A pre-filled section would
be a false statement (constitution II).

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

*(Nothing implemented. `src/` does not exist. This section is filled in during
`/speckit-implement`, from observed output.)*

---

## Testing

*(No test has been run. Docker is not running on this machine — `docker info` reports the
daemon unreachable — so the integration suite cannot execute. This section is filled in from
real command output, with the commands themselves recorded, per constitution II.)*
