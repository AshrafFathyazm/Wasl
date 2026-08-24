# 015 — Task Breakdown

**Phase:** 5 · **Story:** US-006 · **Feature:** `015-ticket-filters-and-search` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

Agents named here are **not dispatched until the plan is approved**. Naming is the plan.

## What this migration changed

| Change | Reason |
|---|---|
| IDs renumbered `BE-006-nn` → `BE-015-nn`, and every `Depends on` updated with them | The task ID says which feature folder it lives in (`specs/README.md`) |
| The story's tasks split across two folders | `docs/sdd/08-board.md`: the list is not droppable, the filters are cut first. The envelope, sort, clamping, projection, N+1 assertion, detail view, and table tasks moved to `010`; see its `tasks.md` |
| `Agent` and `Skill` columns added to every row | From the table in `specs/README.md` |
| Paths corrected from `src/Wasl.Application/...` to slices under `src/Wasl.Api/Features/...` | ADR-010 accepted. There is no `Wasl.Application` and no `Wasl.Infrastructure` |
| `TicketsController.List` became a minimal-API endpoint in `010`'s existing slice | ADR-010. This feature extends that slice rather than adding a controller action |
| `BE-015-02` reshaped: enum parameters bind as `string[]` and are parsed in the slice | Binding them as enum arrays makes an unparseable value a **framework** `400`, outside the `ProblemDetails` contract and with no accepted-values list. AC-10 and constitution IV both require otherwise (`research.md` R-1) |
| `BE-015-04` extended to escape `[` | **ADR-013.** The original was written against PostgreSQL, whose `LIKE` has no character classes. T-SQL's does, so AC-7's list of `%`, `_`, and a quote is incomplete on this engine. AC-24 is the new criterion |
| `BE-015-03` no longer says `ILIKE` | SQL Server has none. Case-insensitivity **is** the column collation, which means it is a schema property and can silently disappear (`research.md` R-2) |
| `BE-015-07` added: `escalated` binds as `bool?` | A plain `bool` binds `false` when absent, silently hiding every escalated ticket from an unfiltered list. The source story's edge case is the symptom; this is the cause |
| `BE-015-01` extended: the empty-collection case is part of the task, not a footnote | `Contains` over an empty array translates to `WHERE 1 = 0`, so a trailing `&status=` returns nothing for a user who filtered nothing. The highest-risk silent defect here (`research.md` R-9) |
| `BE-015-08` added: filtering must not add a round trip | `010`'s AC-12 guarantee has to survive a `WHERE` clause, and nothing else would notice if it did not |
| PostgreSQL assumptions removed | ADR-013 supersedes ADR-001. `Testcontainers.MsSql`, and no trigram index — the SQL Server equivalents are named and rejected in `research.md` R-4 |
| `FE-015-00` added: screen preview before any wiring | Rendering a screen costs minutes; changing one that already has tests, translation keys, and query wiring costs hours (ADR-009, `docs/sdd/design/preview-first-workflow.md`) |
| `FE-015-08` added: the result count with plural forms | BR-8.14. This is the first place in the build where the Arabic `_two`, `_few`, and `_many` categories matter, and concatenation here looks fine to an English reviewer |
| `REV-015-*` section added, including the OpenAPI-versus-contract comparison | `specs/README.md` gates |
| **Audit obligation stated rather than added** | **The originals predate ADR-008.** This feature adds **no state-changing command** — it adds query parameters to a read — so BR-9.1 and BR-9.3 have nothing to attach to and the NFR-10 architecture test has no `IAuditableCommand` here to assert. That is correct, and it is written down because "no audit task" is otherwise indistinguishable from "audit task forgotten". The BR-9.2 `401` row is already proven on this endpoint by `BE-010-09` and adding parameters adds no path. A `400` for an invalid filter is **not** an audit event — BR-9.2 covers authentication and authorization events, and a malformed query is neither. There is no `403` path, because BR-6 grants list access to both roles. `REV-015-02` re-checks all four statements, because each becoming false is a blocking finding |

## Critical path

```text
BE-015-01 → BE-015-02 → FE-015-02 → FE-015-03
```

This is the feature the compression order cuts first (`docs/sdd/08-board.md`). The critical
path above is what must survive if it is built at all; everything below it is improvement.

## Backend

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| BE-015-01 | `TicketFilterSpecification` composes all seven filters: AND across dimensions, OR within one, and **an empty or absent collection contributes no clause at all** | `010` | `dotnet test tests/Wasl.Api.UnitTests --filter TicketFilterSpecification` — one case per filter, one per pair, and one asserting an empty array produces no `WHERE` | AC-4, AC-5 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-015-02 | `GET /api/tickets` binds the eight parameters; the four enum parameters bind as `string[]` and are parsed in the validator, so an unparseable value stays inside the error contract | BE-015-01 | Integration test with repeated keys, mixed case, and a bad value | AC-4, AC-5, AC-10 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-015-03 | `search` matches `TicketNumber`, `Subject`, and the joined customer name, case-insensitively through the columns' CI collation — no `LOWER()` and no `ILIKE` | BE-015-01 | Integration tests: one match per field, plus a mixed-case term | AC-6 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-015-04 | `SearchTerm` escapes `%`, `_`, `[`, and the escape character itself, emitted with an explicit `ESCAPE` clause. A term of only `%` matches **nothing** | BE-015-03 | Unit tests per character, plus integration tests for `%`, `_`, `[`, and a single quote | AC-7, AC-24 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-015-05 | `AssigneeFilter` resolves `me` from `ICurrentUser`, `unassigned` to `AssignedToUserId IS NULL`, and a `Guid` to equality | BE-015-02, `004` | Integration tests as two different users, so `me` demonstrably differs | AC-8, AC-9 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-015-06 | An invalid filter value returns `400` `errors/validation`, keyed by the parameter name, **listing every accepted value** | BE-015-02 | Integration test per enum parameter, asserting all accepted values are present in the message | AC-10 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-015-07 | `escalated` binds as `bool?`: absent means "any", `true` means escalated, `false` means **not** escalated | BE-015-02 | Integration tests for all three cases, asserting the counts differ | AC-4 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-015-08 | Filtering and searching add **no** round trip: the executed-command count with every filter set equals the count with none | BE-015-02, BE-015-03 | `CommandCountingInterceptor` from `010`, asserting 2 in both cases | BR-7.3, AC-12 (inherited) | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| BE-015-09 | A filter that matches nothing returns `200` with an empty array — not `404`, not `400`, including a non-existent assignee id | BE-015-02 | Integration test | BR-7.6 | `voltagent-lang:dotnet-core-expert` | — |
| BE-015-10 | The generated query plan is inspected once against the existing indexes, and the finding recorded — **no index is added** | BE-015-02 | `SET STATISTICS IO ON` on the filtered query, plus `SELECT name FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.Tickets')` confirming nothing new was created | `data-model.md` | `voltagent-lang:sql-pro` | — |
| BE-015-11 | OpenAPI metadata documents every filter parameter, its accepted values, its repeatability, and the new `400` cause | BE-015-06 | `/swagger` inspected, then compared against `contracts/tickets-filter-api.md` | Contract | `voltagent-lang:dotnet-core-expert` | — |

## Frontend

Starts as soon as [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md) exists. It does not wait
for `BE-015-02`.

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| FE-015-00 | Screen preview of the filter bar, the status tabs, the search box, the result count, and **both** empty states — real tokens, real copy, six checked filters at once, both languages. **Approved before any wiring** | `006`, `010` | Rendered and reviewed (Phase 3b) | AC-25 | `ui-ux-pro-max:ui-styling` | `frontend-design` |
| FE-015-01 | Filter parameter types and the Zod filter schema, matching the contract. Types marked **provisional** until generated from OpenAPI | Contract frozen | `npm run typecheck` | AC-4, AC-26 | `voltagent-lang:typescript-pro` | — |
| FE-015-02 | `useTicketFilters` parses `useSearchParams` into a typed filter object and serialises it back — the only place either direction happens. The parsed object is the TanStack Query key | FE-015-01 | `npm run test -- useTicketFilters` — a parse ⇄ serialise round-trip, including an empty value and an unknown parameter | AC-14, AC-26 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-015-03 | `TicketFilterBar`: multi-select for status, priority, category, and channel; assignee select including `me` and `unassigned`; customer picker; escalated tri-state; `Clear` and explicit `Apply` | FE-015-02 | Component test asserting the URL after Apply, and after Clear | AC-4, AC-5 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-015-04 | `TicketSearchInput` debounced at 300ms, writing to the URL; at least one character | FE-015-02 | Component test with fake timers asserting one request per pause, not one per keystroke | AC-6, AC-14 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-015-05 | `TicketStatusTabs` as one-click status filters, **without counts** (`spec.md` Q-3) | FE-015-02 | Component test asserting the URL parameter, plus the divergence from the screen spec recorded in `frontend.md` | AC-4 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-015-06 | The "no matches" empty state: a different message from "no tickets", plus a `Clear filters` action | FE-015-03, `010` FE-010-02 | Component test asserting the two states render **different** copy | AC-25 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-015-07 | A `400` on an invalid filter renders inline, naming the accepted values from the server's message — not a toast, not a generic error | FE-015-03 | Component test with a mocked `400` | AC-10 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-015-08 | `TicketResultCount` uses `t('tickets:list.resultCount', { count })` with all six Arabic CLDR plural categories. **No concatenation anywhere** | `005`, FE-015-03 | Component test in `ar` at counts 0, 1, 2, 3, 11, and 100, asserting six distinct forms | AC-27 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-015-09 | Filters survive a reload, the back button, and being pasted into a fresh tab | FE-015-02 | Manual: filter, reload, go back, then paste the URL into a new tab | AC-14 | `voltagent-lang:react-specialist` | — |
| FE-015-10 | Provisional types replaced with types generated from the OpenAPI document | BE-015-11 | `npm run typecheck` after regeneration | ADR-011 §6 | `voltagent-lang:typescript-pro` | — |
| FE-015-11 | Every new string present in `en` and `ar`; the filter bar viewed in Arabic and rendering RTL correctly — chip removal affordance, tab dividers, the search icon inside its input, and the tri-state control | `005`, FE-015-03 | Key-parity test, plus the Arabic pass recorded in `tests.md` | BR-8.8, BR-8.11 | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |

## Tests

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| TEST-015-01 | Unit: each of the seven filters in isolation | BE-015-01 | Test run | AC-4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-015-02 | Unit: AND across dimensions, OR within one, and the two composed together | BE-015-01 | Test run | AC-4, AC-5 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-015-03 | Unit: an empty or absent collection produces **no** predicate — never `WHERE 1 = 0` | BE-015-01 | Test run | AC-4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-015-04 | Integration: repeated query-string keys produce OR; a duplicated value behaves as a set | BE-015-02 | Test run | AC-5 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-015-05 | Integration: search matches on ticket number, on subject, and on customer name, and a mixed-case term matches | BE-015-03 | Test run | AC-6 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-015-06 | Integration: a term containing `%`, `_`, `[`, or a single quote is literal; a term of only `%` returns nothing | BE-015-04 | Test run | AC-7, AC-24 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-015-07 | Integration: `me` as two different users, and `unassigned` | BE-015-05 | Test run | AC-8, AC-9 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-015-08 | Integration: an invalid value on each enum parameter returns `400` with **all** accepted values listed, and a `traceId` | BE-015-06 | Test run | AC-10 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-015-09 | Integration: `escalated` absent, `true`, and `false` return three different result sets | BE-015-07 | Test run | AC-4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-015-10 | Integration: a filter matching nothing, and a non-existent assignee id, both return `200` with `[]` | BE-015-09 | Test run | BR-7.6 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-015-11 | Integration: the executed-command count with every filter and a search set equals the count with none | BE-015-08 | Test run | AC-12 (inherited) | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-015-12 | Integration: an Arabic search term matches an Arabic subject and an Arabic customer name | BE-015-03 | Test run | AC-6, ADR-013 row 4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-015-13 | Unit: `useTicketFilters` parse ⇄ serialise round-trip, including an empty parameter, an unknown parameter, and a canonical-casing normalisation | FE-015-02 | Test run | AC-14, AC-26 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-015-14 | Component: "no matches" and "no tickets" render different copy and different actions | FE-015-06 | Test run | AC-25 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-015-15 | Component: the result count in `ar` at 0, 1, 2, 3, 11, and 100 produces six distinct strings | FE-015-08 | Test run | AC-27 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-015-16 | RTL and a11y: the filter bar in Arabic — chip removal, tab dividers, the search icon's side, keyboard reach into every multi-select, and a visible focus ring | FE-015-11 | Recorded in `tests.md` | BR-8.11 | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |

## Documentation

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| DOC-015-01 | `docs/sdd/documentation/api/` lists every filter parameter and its accepted values | BE-015-11 | Read it | DoD | main session | — |
| DOC-015-02 | The search scaling limit recorded in `summary.md`: a leading-wildcard `LIKE` is a scan, at what volume it stops being acceptable, and what the fix would be | BE-015-04, BE-015-10 | Read it | DoD | main session | — |
| DOC-015-03 | `summary.md` written: what changed, trade-offs, known limitations, including the tabs-without-counts divergence | All | DoD checklist | DoD | main session | — |
| DOC-015-04 | `tests.md` and `ai-notes.md` completed with **observed** output; `08-board.md` and `12-delivery-log.md` updated | DOC-015-03 | The `verify-story` gate | DoD | main session | `verify-story` |

## Review

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| REV-015-01 | Layer boundaries, correctness against every AC, no query inside a loop, `CancellationToken` on every async path, no scope creep beyond the eight parameters | All | `review.md` verdict `Approved` | DoD | `comprehensive-review:code-reviewer` | `code-review:code-review` |
| REV-015-02 | Security **and** the audit position: the search term reaches the database only as a parameter and never as concatenated SQL; the `400` message leaks no schema detail; and all four audit statements still hold — no state-changing command, BR-9.2's `401` row still fires, a `400` is not an audit event, and no `403` path exists. Any of those becoming false is a **blocking** finding | BE-015-04, BE-015-06 | `review.md` | DoD | `comprehensive-review:security-auditor` | — |
| REV-015-03 | The generated OpenAPI document compared parameter by parameter against `contracts/tickets-filter-api.md`, **and** `010`'s contract re-checked to confirm nothing in it changed | BE-015-11 | Any difference fixed in one of the two before closing — a difference is a defect in one of them, never accepted silently | DoD | main session | — |
| REV-015-04 | The AC split table in this `spec.md` compared against the one in `010`'s. They must be identical | — | `review.md` | DoD | main session | — |

## Droppable if time runs short

This is the designated feature to compress — position 1 in `docs/sdd/08-board.md`'s
compression order. **The whole feature is droppable**, and `010` is complete without it:
`010`'s contract is unchanged, no dead parameters are left on the endpoint, and the screen has
no filter bar, which looks deliberate rather than unfinished.

If it is being built but has to be trimmed, this is the order things are given up — carried
from the original story's compression plan:

| # | Cut | What is lost | Still true |
|---|---|---|---|
| 1 | `FE-015-03` multi-select, reduced to single-select | OR within a dimension is unreachable from the UI | The API still supports it, and `TEST-015-04` still proves it |
| 2 | `BE-015-03` / `BE-015-04` search | Finding a ticket requires filtering rather than typing its number | Filters still work. **Do not drop `BE-015-04` while keeping `BE-015-03`** — an unescaped search is a correctness defect that looks like a feature |
| 3 | `BE-015-05` `me` and `unassigned` | The most common filter needs an explicit user selection | The assignee filter still works with an id |
| 4 | `FE-015-05` status tabs | Filtering by status takes two clicks instead of one | The filter panel still does it |
| 5 | `FE-015-02` URL binding | Filters reset on reload, the back button stops working, and a filtered view stops being shareable | Filtering still works within a session. This is last because AC-14 is the criterion the whole design was arranged around, and putting filters in component state means re-deriving the query key |

**Not droppable, if the feature is built at all:**

`BE-015-01`'s AND/OR semantics **and its empty-collection case**. A wrong operator makes the
list grow as you filter; an empty collection translated to `WHERE 1 = 0` makes a user who
filtered nothing see "no matches". Both are silent, and both are indistinguishable from a UI
bug.

`BE-015-04`'s escaping. A search box where `%` matches everything is a correctness defect that
presents as a feature, and it is the closest thing in this feature to a security finding.

`FE-015-08`'s plural forms. Concatenating a count is grammatically wrong in Arabic for most
values and looks perfectly fine to an English reviewer — which is why BR-8.14 exists and why
this is a criterion rather than polish.
