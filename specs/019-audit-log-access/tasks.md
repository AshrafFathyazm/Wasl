# 019 — Task Breakdown

**Phase:** 5 · **Story:** US-015 · **Feature:** `019-audit-log-access` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

Agents named here are **not dispatched until the plan is approved**. Naming is the plan.

> ## What this migration changed
>
> | Change | Why |
> |---|---|
> | The source `tasks.md` was an **unfilled template** — four placeholder rows (`BE-015-01`, `FE-015-01`, `TEST-015-01`, `DOC-015-01`) with every cell empty. There was no task list to renumber, so the tasks below are authored, already in the `019` namespace | Renumbering `BE-015-*` → `BE-019-*` is stated as the rule; here there was nothing carrying the old numbers, and no other artifact cites them |
> | `Agent` and `Skill` columns added to every row, with values from the table in [`specs/README.md`](../README.md) | Naming the owner is part of the plan |
> | **Audit obligations added: `BE-019-01`, `BE-019-06`, `BE-019-08`, `TEST-019-05` – `TEST-019-07`, `TEST-019-14`** | The source predates ADR-008, so no task carried the audit obligation. For this feature that omission is not a gap but an inversion: BR-9.11 makes the **read itself** an audited event, so a task list without it describes an endpoint that violates the rule it exists to serve. And the `403` path (BR-9.2 / BR-9.4) writes a row **outside** any transaction — the asymmetry ADR-008 says gets implemented backwards by accident. Without `BE-019-01` the marker split does not happen and NFR-10's architecture test is left asserting something the new code has quietly changed |
> | Layering repaired where the copied templates carried it: `tests/Wasl.Application.Tests` removed from `tests.md`, and `summary.md`'s `Application` / `Infrastructure` rows replaced by `Api — slice` and `Api — common`. Every path in `plan.md` and in the rows below is a slice path under `src/Wasl.Api/Features/Audit/ListAuditEntries/` or `src/Wasl.Api/Common/…`, and the endpoint is a minimal API, not a controller | ADR-010 is Accepted. `Wasl.Application` and `Wasl.Infrastructure` do not exist, and a task list naming them would send an agent to create them |
> | Every verification below is SQL Server: `Testcontainers.MsSql`, `sys.indexes` for the index definitions, `sys.database_permissions` for the append-only grant, `DENY` rather than `REVOKE`. No `\d+`, no `Testcontainers.PostgreSql` | ADR-013 supersedes ADR-001. The story artifacts were written while ADR-001 still stood, and those habits do not transfer |
> | `FE-019-00` screen-preview task added (Phase 3b) | Rendering a screen costs minutes; changing one that already has tests, translation keys and query wiring costs hours. It matters more here than usual — **no design exists for this screen**, so the preview *is* the design review (`frontend-spec.md`) |
> | A `Review` section added, including `REV-019-03`, which compares the generated OpenAPI against [`contracts/audit-api.md`](contracts/audit-api.md) | A contract nobody diffs is a document, not an agreement |

## Critical path

```text
BE-019-01 → BE-019-03 → BE-019-04 → BE-019-05 → BE-019-08 → BE-019-06
```

Everything else improves the story. These make it exist — and `BE-019-08` is on the path,
not beside it: an audit-log reader that does not record the read is not this feature.

## Backend

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| BE-019-01 | `IAuditableRequest` split out of `IAuditableCommand`; the audit behaviour writes a row for any `IAuditableRequest`, and the transaction behaviour stays keyed on `ICommand` so a query opens none | `003` | `dotnet test tests/Wasl.Api.IntegrationTests --filter "Architecture"` — NFR-10's test still fails the build when an `ICommand` is not auditable | BR-9.1, BR-9.11, NFR-10 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-019-02 | `AuditEntityType` known values live in `Wasl.Domain/Audit` (added if `003` did not), and the validator reads them from there rather than holding its own list | `003` | `dotnet test tests/Wasl.Domain.Tests --filter "AuditEntityType"` | AC-16 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-019-03 | `ListAuditEntriesQuery` and its FluentValidation validator: enum membership, date parsing, inverted range names both fields, `entityId` requires `entityType`, numeric `cursor`, `action` ≤ 80, `pageSize` clamped to 100 and defaulted to 20 | BE-019-02 | Unit tests over the validator, one case per `400` in the contract | AC-15, AC-16, BR-7.2 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-019-04 | `AuditEntryQuery` — the named query object: `ORDER BY Id DESC`, keyset `Id < @cursor`, `Take(pageSize + 1)`, `AsNoTracking`, projection to the response DTO, `LIKE` prefix with `%`/`_`/`[` escaped via an explicit `ESCAPE`, `CancellationToken` threaded | BE-019-03 | Unit test on the escaping helper (`action=%` must not become "match everything"), plus integration tests for each filter | AC-2, AC-3, AC-12 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-019-05 | `GET /api/audit` returns `200` with `{ items, pageSize, nextCursor, hasMore }` exactly as the frozen contract states, `id` and `nextCursor` serialised as **strings**, under `.RequireAuthorization(Policies.ManagerOnly)` | BE-019-04, `004` | Integration test asserting the envelope and that `id` deserialises as a string, then a second page fetched with the returned cursor | AC-1, AC-11, AC-12 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-019-06 | An `Agent` gets `403` with `errors/forbidden`, the handler never runs, and an `Auth.Forbidden` row exists **outside any transaction** | BE-019-05, `004` | Integration test asserting the `403`, the row, and that **no** `Audit.Read` row was written for the denied attempt | AC-5, AC-13, BR-9.2, BR-9.4 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-019-07 | `outcome=Denied` is served by `IX_AuditLog_NotSuccess`: the handler adds a redundant `Outcome <> 'Success'` when the requested set excludes `Success`, and the plan is checked. **Decide from the plan** whether the conditional `INCLUDE (Outcome)` migration in `data-model.md` is needed | BE-019-04 | The captured **execution plan** names `IX_AuditLog_NotSuccess`; and `SELECT name, has_filter, filter_definition FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.AuditLog')` shows `filter_definition` **non-null** | AC-4 | `voltagent-lang:sql-pro` | — |
| BE-019-08 | The query implements `IAuditableRequest` with action `Audit.Read`; the row is written by the behaviour **after** the page is materialised, so it is never inside its own response | BE-019-01, BE-019-05 | Integration test: exactly one new row per read; the row's `id` is greater than every `id` in the response; a second read returns the first read's row | AC-6, AC-14, BR-9.11 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-019-09 | The `Audit.Read` row records the normalised filter and the row count in `Changes`, as valid JSON, with nothing sensitive in it | BE-019-08 | Integration test asserting `ISJSON` passes and the payload contains the filter and no token, header, or connection string | BR-9.7, Q-019-3 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-019-10 | An unauthenticated request returns `401` before the role check, and writes `Auth.Unauthenticated` — **not** `Auth.Forbidden` | `004`, BE-019-05 | Integration test without a token, asserting the status, the action name, and the absence of an `Auth.Forbidden` row | AC-18, BR-9.2 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-019-11 | Confirmed on a clean database that this feature needs **no migration**: all four `AuditLog` indexes exist with their definitions, and `UPDATE`/`DELETE` are `DENY`-ed to the application principal | `003` | `dotnet ef database update` on a clean database, then `sys.indexes` for the four indexes and `SELECT permission_name, state_desc FROM sys.database_permissions` showing `DENY` on `UPDATE` and `DELETE` | AC-9, BR-9.5, A-1 | `voltagent-lang:sql-pro` | — |
| BE-019-12 | The five validation messages exist in `Resources.en.resx` **and** `Resources.ar.resx`; every field of the `200` body stays English under `Accept-Language: ar` | `005`, BE-019-03 | Key-parity test, plus an integration test asserting `Content-Language: ar` with English `action`/`outcome`/`entityLabel` | AC-17, BR-9.10, BR-8.9 | `voltagent-lang:dotnet-core-expert` | — |
| BE-019-13 | OpenAPI metadata declares `200`, `400`, `401`, `403`, and documents every query parameter including the repeatable `outcome` | BE-019-05 | `/swagger` inspected, then compared against `contracts/audit-api.md` | Contract | `voltagent-lang:dotnet-core-expert` | — |

`BE-019-01`, `BE-019-06`, `BE-019-08`, `BE-019-09` and `BE-019-10` are new in this
migration. The original predates ADR-008, so no task carried the audit obligation — and
here the obligation is not incidental: BR-9.11 is the story. Without `BE-019-01` the
pipeline cannot audit a query at all, and NFR-10's architecture test would be asserting a
marker the new code had quietly changed the meaning of.

## Frontend

Starts as soon as [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md) exists. It does not
wait for `BE-019-05`.

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| FE-019-00 | Screen preview: real tokens, real copy, plausible volumes (a 400-char `userAgent`, an Arabic `entityLabel`, a `changes: null` row, an unrecognised `changes` shape), **all six states**, both languages. **Approved before any wiring** | `006` | Rendered and reviewed (Phase 3b). **This is the design review, not a formality — no screen spec exists for this screen** | AC-19, Q-019-1 | `ui-ux-pro-max:ui-styling` | `frontend-design` |
| FE-019-01 | Provisional TS types and the Zod filter schema, matching the contract. `id`/`cursor` typed as `string`; `changes` typed loosely with a guard. Marked **provisional** until generated from OpenAPI | Contract frozen | `npm run typecheck` | AC-19 | `voltagent-lang:typescript-pro` | — |
| FE-019-02 | `AuditLogPage` fetches at route level, binds every filter and the cursor to the URL, and sets `refetchOnWindowFocus: false`, `refetchInterval: false`, `staleTime: 5m` with an explicit Refresh | FE-019-01 | Component test asserting the URL round-trip and that **no** refetch occurs on window focus | AC-19, BR-9.11 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-019-03 | `AuditTable`: nine columns per `frontend-spec.md`, `dir="auto"` **and** ellipsis together on Actor and Label, `Outcome` as a labelled `Badge`, copy-trace, snapshot tooltip on Role | FE-019-02 | Component test, plus the preview compared side by side | AC-8, AC-19 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-019-04 | `AuditChangesCell` renders the `{field:{from,to}}` diff, falls back to raw JSON for any other shape, and shows no expander when `changes` is null | FE-019-01 | Component test with all three inputs | AC-19, A-2 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-019-05 | Newer/Older over a cursor stack; rows-per-page resets the stack; **no numbered pager and no total** | FE-019-02 | Component test paging forward twice and back once | AC-12, AC-15 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-019-06 | All six states render distinctly: loading skeletons at row height, refetch dimming, the **two different** empty states, error with `traceId` and Retry, forbidden inline | FE-019-02 | Component tests, one per state, with mocked responses including a `403` | AC-5, AC-11, AC-19 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-019-07 | Entry point in the user popover beside `Settings`, hidden for an `Agent`; the route still renders the forbidden state on a deep link | FE-019-06 | Manual run as both roles, plus a component test for the hidden entry | AC-5, Q-019-2 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-019-08 | Provisional types replaced with types generated from the OpenAPI document | BE-019-13 | `npm run typecheck` after regeneration | ADR-011 §6 | `voltagent-lang:typescript-pro` | — |
| FE-019-09 | Every string from a catalogue, present in `en` and `ar`; the screen walked in Arabic; table semantics, focus rings, `aria-expanded` on the expander, and the labelled badge all verified | `005`, FE-019-06 | Key-parity test, plus the Arabic and a11y pass recorded in `tests.md` | AC-17, BR-8.8, BR-8.11 | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |

## Tests

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| TEST-019-01 | `200`, newest-first ordering, envelope shape, `id` as a string | BE-019-05 | Test run | AC-1, AC-12 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-019-02 | Every filter individually, and three combined with AND | BE-019-04 | Test run | AC-2 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-019-03 | `action=Auth.` returns every `Auth.*` row; `action=%` returns **none**, not everything | BE-019-04 | Test run | AC-3 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-019-04 | `outcome=Denied` and `outcome=Failed` return only those rows **and** the captured execution plan names `IX_AuditLog_NotSuccess` | BE-019-07 | Test run plus the plan captured in `tests.md` | AC-4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-019-05 | An Agent gets `403`; an `Auth.Forbidden` row exists; no `Audit.Read` row was written | BE-019-06 | Test run | AC-5, AC-13 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-019-06 | One `Audit.Read` row per successful read, and its `id` is greater than every `id` in that response | BE-019-08 | Test run | AC-6, AC-14 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-019-07 | **Reading the log appears in the log**: read, then read again, and the first read is in the second response | BE-019-08 | Test run | AC-6, BR-9.11 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-019-08 | A user promoted from `Agent` to `Manager` after acting still shows `Agent` on the old row | BE-019-05 | Test run | AC-8, BR-9.6 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-019-09 | A row whose `EntityId` refers to a deleted customer still returns, with its snapshotted `entityLabel` | BE-019-05 | Test run | AC-7, BR-9.12 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-019-10 | A `traceId` taken from a `ProblemDetails` response locates its audit row | BE-019-05 | Test run | AC-10, BR-9.9 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-019-11 | Cursor stability: insert a row between page 1 and page 2; no row is skipped and none repeats | BE-019-05 | Test run | AC-12 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-019-12 | `pageSize` defaults to 20, clamps at 100, and `0` falls back — the response reports what was **applied** | BE-019-03 | Test run | AC-15, BR-7.2 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-019-13 | Every `400` variant in the contract, each naming the right field; the inverted range names both | BE-019-03 | Test run | AC-16 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-019-14 | No token → `401` and `Auth.Unauthenticated`, with **no** `Auth.Forbidden` row | BE-019-10 | Test run | AC-18 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-019-15 | `Accept-Language: ar` returns `Content-Language: ar` with every data field still English | BE-019-12 | Test run | AC-17, BR-9.10 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-019-16 | `POST`, `PUT`, `PATCH`, `DELETE` on `/api/audit` all return `405` — no write route is mapped | BE-019-05 | Test run | AC-9 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-019-17 | An Arabic `entityLabel` and Arabic values inside `changes` round-trip byte-identical through the read | BE-019-05 | Test run | ADR-013 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-019-18 | Nothing sensitive appears in an `Audit.Read` row's `Changes`: no token, no `Authorization` header, no connection string | BE-019-09 | Test run | BR-9.7 | `comprehensive-review:security-auditor` | — |

## Documentation

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| DOC-019-01 | `docs/sdd/documentation/api/overview.md` lists `GET /api/audit`, including that it is Manager-only and that reading is audited | BE-019-13 | Read it | DoD | main session | — |
| DOC-019-02 | `summary.md` written: what changed, the trade-offs, and **Q-9 and Q-10 restated as known limitations** — retention is unanswered and the table holds personal data | All | DoD checklist | DoD, Q-9, Q-10 | main session | — |
| DOC-019-03 | `tests.md` and `ai-notes.md` completed with **observed** output; board and delivery log updated | DOC-019-02 | The `verify-story` gate | DoD | main session | `verify-story` |
| DOC-019-04 | If `BE-019-07` needed the `INCLUDE (Outcome)` migration, `03-domain-model.md` and `003`'s data model are updated to match what now exists | BE-019-07 | The DDL in the doc matches `sys.indexes` on a clean database | A-1 | main session | — |

## Review

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| REV-019-01 | Layer boundaries (no EF type escapes the slice, `Wasl.Domain` still has zero package references), correctness against every AC, `CancellationToken` on every async path, no scope creep | All | `review.md` verdict `Approved` | DoD | `comprehensive-review:code-reviewer` | `code-review:code-review` |
| REV-019-02 | Security: `Manager`-only enforced server-side and not merely hidden in the UI; the `403` body leaks nothing; `LIKE` input escaped; the personal data in `changes` reaches no log; Q-9 recorded rather than assumed | BE-019-06, BE-019-09 | `review.md` | DoD, BR-9.7 | `comprehensive-review:security-auditor` | — |
| REV-019-03 | Generated OpenAPI compared against `contracts/audit-api.md`, parameter by parameter and status code by status code | BE-019-13 | Any difference fixed in one of the two before closing | DoD | main session | — |
| REV-019-04 | The built screen compared against the `FE-019-00` preview, in both languages, with every divergence recorded and a reason given | FE-019-09 | `frontend.md` | DoD, Q-019-1 | `ui-ux-pro-max:ui-styling` | `frontend-design` |

`REV-019-04` exists because this screen has **no inherited design** to review against.
The preview is the only reference, so comparing the build to it is the whole design gate.

## Droppable if time runs short

| Task | What is lost |
|---|---|
| The entire `FE-019-*` lane | The endpoint remains, queryable with a REST client, which is already better than the SQL-only status quo this feature replaces. US-015 excludes a UI anyway (`Q-019-1`), so dropping it returns the feature to its stated scope rather than shrinking it. **This is the first cut** |
| FE-019-04 rich `changes` rendering | Fall back to raw JSON in a `<pre>` for every row. Readable, ugly, and correct |
| FE-019-05 Newer | Older-only paging. A manager pages forward and re-runs the query to go back — one extra `Audit.Read` row per attempt, which is annoying rather than wrong |
| TEST-019-17 Arabic round-trip | Covered indirectly by `007`'s equivalent test on `nvarchar`; the risk is a repeat of a mapping already proven, not a new one |
| BE-019-09 filter recorded in `Changes` | The `Audit.Read` row still exists and still names the actor and time; only *what they searched for* is lost. That is the least valuable field and the only optional one |

## Not droppable

**`BE-019-08`.** Without it this is a read endpoint over the audit log that does not record
being used — a direct violation of BR-9.11, and the one rule this feature exists to
implement. It is also the harder half to retrofit: adding the row later means deciding the
ordering question (`research.md` R-2) under time pressure, and getting it wrong produces a
response containing its own audit row.

**`BE-019-06`.** A `403` that is not recorded loses exactly the signal an auditor came for:
who tried to read the log and was refused. BR-9.2 and BR-9.4 both land on this one task,
and the asymmetry they describe — written outside a transaction — is the part ADR-008
says gets implemented backwards by accident.

**`BE-019-01`.** The marker split is what makes the two tasks above possible without a
hand-written audit row. Skip it and either the read is unaudited or someone writes the row
inside the handler, which is the one thing ADR-008's mitigation exists to prevent.

**`BE-019-07`.** `AC-4` names the filtered index in the criterion. A row assertion passes
whether or not the index is touched, so without the plan check the acceptance criterion is
satisfied on paper while the query that matters after an incident scans the whole table.
