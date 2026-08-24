# 020 — Requirements Checklist

A check on the **specification**, not on the code. Run before [`plan.md`](../plan.md) is
trusted, and again before the feature closes.

## Completeness

| ✓ | Item | Where |
|---|---|---|
| ☑ | Scope and out-of-scope are both explicit | `spec.md` |
| ☑ | Every excluded item names the feature that owns it instead | `spec.md`, Out of scope — 12 rows, each naming a feature or "nothing" with a reason |
| ☑ | Assumptions are written down, each with what happens if it is wrong | `spec.md`, A-1 – A-7 |
| ☑ | Open questions carry a working assumption rather than blocking | `spec.md`, Q-A – Q-F |
| ☑ | Every acceptance criterion is testable as written | `spec.md`, AC-1 – AC-22 |
| ☑ | US-016's AC numbering is preserved unchanged; additions start at AC-15 | AC-1 – AC-14 are US-016's, verbatim in meaning |
| ☑ | Edge cases include failure and permission cases, not only happy variations | `spec.md`, Edge cases — 22 rows including `401`, `403`, `500`, a bad `range`, a repeated `range`, and an Agent inspecting the raw body |
| ☑ | Referenced rules are cited by ID, not restated at length | `spec.md`, Rules referenced |
| ☑ | The contract names every status code and every `type` | `contracts/dashboard-api.md`, Failures |
| ☑ | The plan names every file it creates or changes | `plan.md`, Backend design and Frontend design |
| ☑ | At least two real alternatives were considered and rejected with reasons | `plan.md`, Risks — six endpoints, a materialised summary table, `AT TIME ZONE` in the query, a `ResolvedAtUtc` column |
| ☑ | A feature with no schema change says so explicitly and says why | `data-model.md`, first line and first section |
| ☑ | Every state on the screen is enumerated, including the ones usually skipped | `frontend-spec.md`, States — nine rows |
| ☑ | i18n keys are tabulated, in both catalogues | `frontend-spec.md`, Localization — 44 keys |

## Testability

Every AC maps to at least one task. `Verified by` on every task row in
[`tasks.md`](../tasks.md) is a command, a test, or an observation someone else could repeat
— never "it works".

| AC | Tasks |
|---|---|
| AC-1 | BE-020-06, TEST-020-16 |
| AC-2 | BE-020-05, FE-020-04 |
| AC-3 | BE-020-05, TEST-020-02, REV-020-03 |
| AC-4 | BE-020-11, TEST-020-03, TEST-020-21 |
| AC-5 | BE-020-03, BE-020-04, TEST-020-04, TEST-020-08 |
| AC-6 | BE-020-01, BE-020-03, TEST-020-05, TEST-020-08 |
| AC-7 | BE-020-09, TEST-020-06, TEST-020-17 |
| AC-8 | TEST-020-01, TEST-020-02 |
| AC-9 | FE-020-07, TEST-020-16 |
| AC-10 | FE-020-04, TEST-020-19 |
| AC-11 | FE-020-00, FE-020-07 |
| AC-12 | FE-020-07 |
| AC-13 | FE-020-03, TEST-020-18 |
| AC-14 | FE-020-08, FE-020-10, TEST-020-22 |
| AC-15 | BE-020-12, TEST-020-10 |
| AC-16 | BE-020-14, FE-020-09, TEST-020-12, TEST-020-20 |
| AC-17 | BE-020-11, TEST-020-02, TEST-020-16 |
| AC-18 | BE-020-14, TEST-020-03 |
| AC-19 | BE-020-04, TEST-020-07 |
| AC-20 | TEST-020-11, TEST-020-13 |
| AC-21 | FE-020-05, FE-020-08 |
| AC-22 | BE-020-13, TEST-020-14 |

| ✓ | Item | Note |
|---|---|---|
| ☑ | No AC needs a follow-up question to turn into a test | Each names a command, a status code, an assertable string shape, or an observation |
| ☑ | Nothing is verified by "it works" | Every `Verified by` cell in `tasks.md` is a command, a test id, or a named observation |
| ☑ | Every AC that fails **silently** has its own criterion | AC-5 (the vanishing day), AC-6 (UTC bucketing), AC-8 / AC-17 (forty round trips render perfectly), AC-16 (the one-column shift), AC-19 (`ClosedAtUtc` undercounts pessimistically), AC-18 (`null` the client happens not to render), AC-20 (an audit row nobody asked for), AC-21 (bars that convey nothing), AC-22 (a cache added as an optimisation) |
| ☑ | Two ACs assert an **absence** rather than a presence | AC-18 (`teamLoad` not in the document) and AC-20 (no audit row on success). Absences are the ones review is worst at catching |
| ☑ | The exact-count criterion is exact, not "roughly" | AC-17 pins 7 / 6 per role. "Roughly six" passes at eleven queries, and passing is what a test is for |
| ☑ | Manual verification is named as a deliverable, not implied as covered | FE-020-08. RTL and screen-reader defects are not assertable here |
| ☑ | Frontend tests are narrow and named | TEST-020-18 … TEST-020-22, per `test-strategy.md`'s "applied narrowly" |

## Consistency with the blueprint

| ✓ | Item | Source |
|---|---|---|
| ☑ | One endpoint on `/api`, `GET`, JSON, UTC `Z` timestamps, string enums | `docs/sdd/05-api-conventions.md`; the endpoint inventory already lists `GET /api/dashboard` for US-016 |
| ☑ | Every error is `ProblemDetails` with a `traceId`; `200` never carries an error | `05-api-conventions.md`, constitution IV |
| ☑ | `type`, `errors` keys, enum values, `TicketNumber`, `traceId` never localized | BR-8.7, ADR-007 §3 |
| ☑ | Latin digits and the Gregorian calendar in Arabic | BR-8.13, ADR-007 §7 |
| ☑ | Arabic plurals use all six CLDR categories; no string concatenation around a count | BR-8.14, ADR-007 §9 |
| ☑ | `UseRequestLocalization()` after `UseAuthentication()` — recorded, and not disturbed by this feature | ADR-007 §4, `plan.md` |
| ☑ | Vertical slice at `Features/Dashboard/GetDashboard/`; two projects only; `Wasl.Domain` untouched | ADR-010 |
| ☑ | The one exception to ADR-010 is named, contained to a single line, and justified | `plan.md`, "The exception to ADR-010, named rather than absorbed"; `research.md` R-6 |
| ☑ | No `IRepository`; non-trivial queries are named query objects with one caller each | Constitution, Technology Constraints |
| ☑ | `TimeProvider` injected; no inline `DateTime.UtcNow`; `ageHours` computed server-side | Constitution V |
| ☑ | `CancellationToken` on every async path | `09-definition-of-done.md`, Backend |
| ☑ | SQL Server types and dialect only; `nvarchar` for every human-written column | ADR-013, rows 1–4 |
| ☑ | Integration tests use `Testcontainers.MsSql` against a real engine, never EF `InMemory` | `testing/test-strategy.md`, ADR-013 |
| ☑ | Executed-command-count assertion, the same guard the list and timeline use | `testing/test-strategy.md`; `specs/README.md` (`010` ends when "the list costs one query, asserted") |
| ☑ | Test naming follows `MethodOrEndpoint_Condition_ExpectedResult` and names the rule | `testing/test-strategy.md`, Naming |
| ☑ | No global store; filters and range live in the URL; fetching at the route only | ADR-011 §1, §2, §4 |
| ☑ | Expected states inline, unexpected states at the boundary | ADR-011 §5 |
| ☑ | Types generated from the contract; the hand-written set is marked `PROVISIONAL` with a task to replace it | ADR-011 §6, FE-020-01 |
| ☑ | No barrel files; route-level code splitting only | ADR-011 §7 |
| ☑ | Eight primitives, no ninth; charts composed inside the feature folder | ADR-009, `design/component-inventory.md`, `spec.md` A-6 |
| ☑ | Preview before build | ADR-009, `design/preview-first-workflow.md`, FE-020-00 |
| ☑ | Status colour semantics respected: zero muted, red reserved for critical and escalated, channel bars on the navy ramp | `design/layout-patterns.md`, Status colour semantics |
| ☑ | A read writes no audit row; denials do | BR-9.1, BR-9.2, `research.md` R-8 |
| ☑ | BR-1.4 respected — "waiting on customer" is shown so it can be excluded from judgement, not counted against the team | `04-business-rules.md`, `11-dashboard.md` |
| ☑ | No leaderboard, and the reason is recorded rather than the omission | US-016 Notes, `frontend-spec.md` Not on this screen |
| ☑ | Constitution: "cut scope, never quality" — the whole feature is marked droppable and the cut order is written | `specs/README.md` Phase 5, `tasks.md` |

## Blueprint gaps found while writing this specification

Recorded rather than filled in. `docs/sdd/**` is outside this feature's write scope, and a
rule invented inside a feature folder is the one thing `00-project-context.md` says must not
happen. `DOC-020-02` raises all four.

| # | Gap | Handled here by | Who should decide |
|---|---|---|---|
| 1 | `docs/sdd/design/screens/11-dashboard.md` is written in **PostgreSQL** — `generate_series`, `count(*) FILTER`, `percentile_cont` as an aggregate, `extract(epoch …)`. It predates ADR-013 and was not revised when ADR-001 was superseded | Treating its **intent** as authoritative and its **syntax** as obsolete. Every translation is a numbered research item (`research.md` R-1 – R-4) rather than a silent rewrite | Whoever owns `docs/sdd/design/` |
| 2 | **BR-6's authorization matrix has no dashboard row.** Nothing in `04-business-rules.md` says who may read this screen | US-016 AC-3 and AC-4 taken as the authority: both roles, one route, different content (`spec.md` Q-B, `research.md` R-12) | Whoever owns `04-business-rules.md` |
| 3 | `00-project-context.md` lists **"Analytics, reporting, and dashboards"** as explicitly out of scope, reason: *"No requirement in the core flow"* — while US-016 exists, `08-board.md` schedules it, and `specs/README.md` gives it feature number `020`. The constitution's wording differs: *"analytics and dashboards **beyond the committed scope**"* | Treating the constitution's wording as the reconciliation: US-016 **is** the committed scope, and everything beyond it stays excluded. Every US-016 exclusion is repeated in `spec.md` Out of scope so the boundary is visible | Whoever owns `00-project-context.md` |
| 4 | `design/component-inventory.md` lists **"Charts — no reporting in scope"** under *Not built*, while `11-dashboard.md` specifies four bar blocks | Bars composed from `div`s and tokens inside `features/dashboard/`. No chart library, no ninth primitive (ADR-009). `research.md` R-9 records what was rejected; AC-21 records the accessibility obligation this shape creates | Whoever owns `design/component-inventory.md` |

Gap 3 is the one worth a decision rather than a note: this feature exists because the board
schedules it, and the project-context document says it does not exist.

## Gaps accepted, with reasons

| Gap | Reason |
|---|---|
| No load or performance verification | No stated requirement (`testing/test-strategy.md`). The ~300ms figure from `11-dashboard.md` is a **trigger for a measurement**, not a gate. If it is ever measured the number goes in `tests.md`, and the first answer is an index (`data-model.md` candidate 2), not a cache |
| No index added, though five could be named | Two already exist by EF convention, one is the textbook case for *not* indexing, one is probably owned by `010`, and one waits for a measurement. Speculative indexes are what `001`'s ordering exists to avoid. All five are written down with their thresholds |
| The seven queries are raw SQL the compiler cannot check | None is expressible in LINQ (`research.md` R-6). Contained: one caller each, one integration test each executing against a real schema, CI on every push, and one file per block so a failure names itself. `plan.md`, accepted risks |
| `LocalDaySpineTests` lives in the integration test project | A third test project for one pure BCL class costs more than it returns. The concrete risk — an assembly-scoped container fixture making these tests slow — is measured by `TEST-020-08`, not assumed away |
| A-5: the seven reads may not be one snapshot | `003-audit-trail` is not yet specified, so what its transaction behaviour wraps could not be checked. Two blocks disagreeing by one ticket for one second is not a defect a support dashboard has, and a serializable transaction would penalise every writer to fix it (`research.md` R-13) |
| A-2: one scope predicate for every block | An Agent's *created* series is scoped by assignee, so a ticket they created and were never assigned is absent. One predicate is comprehensible; two need a sentence on the card. If the owner wants created-by-me, it is one clause and the sentence goes on the card |
| Visual RTL correctness, and screen-reader output verbatim | Not assertable (`testing/test-strategy.md`). Covered by FE-020-08 as a **listed deliverable**. AC-21 holds the part a test can hold: the hidden table exists and carries every value |
| Combinatorial coverage of range × role × populated/empty | Twelve cases for one shape. Each range is covered once for length, role once on populated data, empty once — and `TEST-020-16` proves the command count does not depend on the data, which is what the combinations would have been checking |
| `escalatedOpenCount` cannot be tested against real escalations until `016` ships | The column exists from the initial schema, so the query is testable with a directly-seeded `IsEscalated`. `research.md` R-11: the tile reading `0` in a system where nothing was escalated is the correct answer, not a stub |
| Whether EF Core 10's `Database.SqlQuery<T>` accepts these shapes | Could not be verified — no code exists and Docker is not running. Keyless query types are the specified default *because* they are the established pattern; `BE-020-02` runs the alternative before anything depends on it. This is constitution VI applied deliberately: a plausible API is confirmed by execution, not by recall |

## Sign-off

| Gate | State |
|---|---|
| Specification reviewed by the product owner | **Pending** — awaiting approval before implementation |
| Plan names every file it will create or change | ☑ `plan.md` |
| At least two real alternatives considered and rejected with reasons | ☑ `plan.md` — four |
| Contract frozen | ☑ `contracts/dashboard-api.md`, 2026-08-23 |
| Frontend guide derived from the frozen contract | ☑ `FRONTEND-API-GUIDE.md` |
| Tasks have an owner, a verification, and something they serve | ☑ `tasks.md` |
| Droppable and not-droppable both stated with reasons | ☑ `tasks.md` |
| Blueprint gaps raised rather than silently filled | ☑ four, above; `DOC-020-02` |
| Dependencies stated, including the one that decides whether to start | ☑ `plan.md`, Dependencies — `009`, `010`, `012`, `013` |
| Implementation and testing sections of `ai-notes.md` left empty | ☑ `ai-notes.md` — nothing has been implemented, so nothing is recorded |
