# US-002 — Task Breakdown

**Phase:** 1 · **Story:** US-002 · **Feature:** `008-customer-list-and-profile` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

Agents named here are **not dispatched until the plan is approved**. Naming is the plan.

What this migration changed, task by task:

| Change | Reason |
|---|---|
| Every ID renumbered `BE-002-nn` → `BE-008-nn`, and every `Depends on` updated | Task IDs carry the feature folder's number (`specs/README.md`) |
| `Agent` and `Skill` columns added to every row | The dispatch table in `specs/README.md` |
| `BE-008-04` added: the `IX_Customers_FullName` migration | The original said "no data changes — the index was created in US-001". It was not: `007` deliberately deferred it to the feature whose query needs it, which is this one |
| `BE-008-02` added: the malformed-id `400` as `ProblemDetails` | AC-3 was one third of a combined task. On SQL Server or off it, the two wrong implementations both look correct — one returns `404`, the other a `400` with an empty body |
| `BE-008-09` added: the audit obligation | ADR-008 postdates this artifact, so **no task carried it**. See the note under Backend |
| `BE-008-06` now names the explicit collation and the escaping | The original said `ILIKE`. SQL Server has no `ILIKE` (ADR-013) |
| Original `BE-002-06` split into `BE-008-08` (auth) and `BE-008-10` (OpenAPI) | One row, two unrelated verifications. A task that cannot be verified on its own gets split |
| `FE-008-00` added: screen preview before any wiring | Two screens, one of them a table — the highest-RTL-risk layout in Phase 1 (ADR-009) |
| `FE-008-01` now depends on the frozen contract, not on the backend endpoint | The frontend lane starts from `FRONTEND-API-GUIDE.md` |
| `FE-008-05` added: provisional types replaced by generated types | ADR-011 §6. Hand-written types are provisional by decision, and the swap is a task so it is not forgotten |
| A `Review` section added, including the OpenAPI-versus-contract comparison | `specs/README.md` gates |
| All `src/Wasl.Application/...` and `src/Wasl.Infrastructure/...` paths replaced | ADR-010: two projects, vertical slices, minimal APIs |

> **Status 2026-08-28 — the backend is delivered.** 408 tests, 0 warnings, run twice. See
> [tests.md](tests.md) for the AC-to-test map and the two negative controls.
>
> **One criterion is recorded UNMET rather than ticked:** AC-3 wants `400` for a malformed id and
> the delivered behaviour is `404`, because `{id:guid}` fails the route match before any action
> runs. Q-A ruled for consistency across the API — dropping the constraint would leave two
> resources answering the same malformed input differently — and `002b` fixes every route at once.
>
> **Beyond this feature's scope, on the product owner's ruling:** `008` built the
> `DbCommandInterceptor` the whole project needed and used it to close `013` AC-14 and `010`
> AC-12's second half in the same commit. Both had shipped as *argued from the LINQ*.
>
> **Not done:** every `FE-008-*` task — the list and profile screens, with loading, error,
> not-found and empty states. The frontend lane owns them.
>
> No agent was dispatched — every task was implemented inline, recorded in
> [ai-notes.md](ai-notes.md).

## Critical path

```text
BE-008-01 → BE-008-03 → BE-008-04 → BE-008-05 → FE-008-00 → FE-008-02
```

`GET` by id is what `007`'s `Location` header points at, so `BE-008-01` unblocks that
feature's AC-14 as well. Everything else improves the story; these make it exist.

## Backend

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| BE-008-01 | `GET /api/customers/{id}` returns the projection; an unknown id returns `404` with the shared `ProblemDetails` shape | `007` | `dotnet test tests/Wasl.Api.IntegrationTests --filter GetCustomer` | AC-1, AC-2 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-008-02 | A malformed id returns `400` with `type: errors/validation` and a body. No `{id:guid}` route constraint; `BadHttpRequestException` is mapped in the shared middleware | `002`, BE-008-01 | Integration test asserting status **and** `type`, then `curl /api/customers/not-a-guid` | AC-3 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-008-03 | `PagingParameters` in `Wasl.Domain/Common` clamps page and page size per BR-7.2 | — | `dotnet test tests/Wasl.Domain.Tests --filter PagingParameters` at every boundary | AC-5, AC-6 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-008-04 | Migration `AddCustomerFullNameIndex` creates `IX_Customers_FullName ON dbo.Customers (FullName)` | `001` | `dotnet ef database update`, then `SELECT name, is_unique, filter_definition FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.Customers')` — the row exists, `is_unique = 0`, `filter_definition` **null** | AC-15, DoD | `voltagent-lang:sql-pro` | — |
| BE-008-05 | `GET /api/customers` returns the paged envelope with defaults, ordered `FullName ASC, Id ASC` | BE-008-03, BE-008-04 | Integration test: envelope shape, defaults, and a full traversal at `pageSize=1` over duplicate names | AC-4, AC-9, AC-10, AC-15 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-008-06 | Search matches `FullName`, `Email`, and `PhoneE164` case-insensitively via an explicit `COLLATE`, with `%`, `_`, and `[` escaped as `[%]`, `[_]`, `[[]` before the term reaches `LIKE` | BE-008-05 | Integration tests including `%`, `_`, `[`, and a quote; plus an assertion that the generated SQL contains `COLLATE` | AC-7, AC-8, AC-16 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-008-07 | The list is one projection plus one count — no query per row | BE-008-05 | Executed-command count assertion: **exactly 2** commands for a list request | AC-11 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-008-08 | Both endpoints require authentication | `004`, BE-008-05 | Integration test without a token on each endpoint | AC-14 | `voltagent-lang:dotnet-core-expert` | — |
| BE-008-09 | Neither `GET` writes an audit row; the queries are not `ICommand`, so the architecture test passes and the transaction behaviour skips them; the `401` writes one `Auth.Unauthenticated` row **outside** any transaction | `003`, `004`, BE-008-08 | Integration test: `AuditLog` row count unchanged after 200 and after 404; exactly one row after the 401 | BR-9.2, BR-9.4, NFR-10 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-008-10 | OpenAPI metadata declares `200`, `400`, `401`, `404` on detail and `200`, `400`, `401` on the list, with the paged envelope schema | BE-008-06 | `/swagger` inspected, then compared against `contracts/customers-read-api.md` | Contract | `voltagent-lang:dotnet-core-expert` | — |

`BE-008-09` is **new in this migration.** The original `tasks.md` predates ADR-008, so
no task carried the audit obligation. This feature is read-only, so the obligation is
unusual and worth stating precisely rather than skipping:

- There is **no state-changing command here**, so nothing implements `IAuditableCommand`
  and no row is written on success (BR-9.1 governs state changes).
- The queries must therefore **not** be typed as `ICommand`. If one is, NFR-10's
  architecture test fails the build with a message about a missing audit action, which
  reads as an audit bug and is a typing mistake. Naming it in a task is cheaper than
  debugging it.
- The `401` path **does** write a row (BR-9.2), and it is written outside any
  transaction because there is no business transaction to join (BR-9.4).
- There is no `403` path: BR-6 permits both roles to view a customer.
- The verification is the **negative** — that a read writes nothing. An unasserted
  negative is the one that rots as the pipeline grows.

## Frontend

Starts as soon as [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md) exists. It does not
wait for `BE-008-05`.

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| FE-008-00 | Screen preview of **both** screens: real tokens, real copy, plausible name and company lengths, all states, both languages. **Approved before any wiring** | `006` | Rendered and reviewed (Phase 3b) | AC-12, AC-13 | `ui-ux-pro-max:ui-styling` | `frontend-design` |
| FE-008-01 | Query hooks and keys for detail and list, plus request/response types. Types marked **provisional** until generated from OpenAPI | Contract frozen | `npm run typecheck` | — | `voltagent-lang:typescript-pro` | — |
| FE-008-02 | `CustomerProfilePage` with distinct loading, error, and not-found states | FE-008-00, FE-008-01 | Component test; then a manual run with the API stopped, and one with a valid-but-unknown id | AC-12 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-008-03 | `CustomerListPage` with pagination and **two** empty states — nothing exists, and nothing matched | FE-008-00, FE-008-01 | Component test covering both empty states separately | AC-13 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-008-04 | Debounced (300 ms) search bound to the URL query string, and the parsed params used as the query key | FE-008-03 | Manual: search, navigate away, use the back button, reload, share the URL | AC-7 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-008-05 | Provisional types replaced with types generated from the OpenAPI document | BE-008-10 | `npm run typecheck` after regeneration | ADR-011 §6 | `voltagent-lang:typescript-pro` | — |
| FE-008-06 | Every string from a catalogue, present in `en` and `ar`; both screens viewed in Arabic; column order reverses, pagination sits at the correct inline edge, and email and phone stay LTR | `005`, FE-008-02, FE-008-03 | Key-parity test, plus the Arabic pass recorded in `tests.md` | BR-8.8, BR-8.11, BR-8.13 | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |

## Tests

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| TEST-008-01 | Unit: clamping at every boundary — `0`, `-1`, `1`, `100`, `101`, `pageSize=0` | BE-008-03 | Test run | AC-5, AC-6 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-008-02 | Integration: `200` and `404` on detail, including every field in the contract | BE-008-01 | Test run | AC-1, AC-2 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-008-03 | Integration: malformed id gives `400` with `type: errors/validation` and a non-empty body | BE-008-02 | Test run | AC-3 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-008-04 | Integration: envelope shape, `page`/`pageSize`/`totalCount`/`totalPages`, and the defaults | BE-008-05 | Test run | AC-4, AC-5 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-008-05 | Integration: search across all three fields, each in a case that differs from the stored value | BE-008-06 | Test run | AC-7 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-008-06 | Integration: search containing `%`, `_`, `[`, and a quote returns the literal match and does not error | BE-008-06 | Test run | AC-8 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-008-07 | Integration: empty result, and a page beyond the last, both `200` with a correct `totalCount` | BE-008-05 | Test run | AC-9, AC-10 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-008-08 | Integration: executed-command count is exactly 2 for a list request | BE-008-07 | Test run | AC-11 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-008-09 | Integration: full traversal at `pageSize=1` over three customers sharing a `FullName` returns each exactly once | BE-008-05 | Test run | AC-15 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-008-10 | Integration: the generated list SQL contains an explicit `COLLATE` | BE-008-06 | Test run | AC-16 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-008-11 | Integration: `401` without a token on both endpoints, and exactly one `Auth.Unauthenticated` audit row from it | BE-008-08, BE-008-09 | Test run | AC-14, BR-9.2 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-008-12 | Integration: `AuditLog` row count is unchanged by a successful read and by a `404` | BE-008-09 | Test run | BR-9.1, NFR-10 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-008-13 | Integration: an Arabic `fullName` and `companyName` round-trip byte-identical, and are findable by an exact-form Arabic search | BE-008-06 | Test run | ADR-013, AC-7 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-008-14 | Component: loading, error, not-found on the profile; both empty states on the list | FE-008-02, FE-008-03 | Test run | AC-12, AC-13 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |

`TEST-008-13` also stands as the negative for Q-7: searching `احمد` for a record stored
as `أحمد` returns nothing, and the test asserts that **on purpose**, so the limitation is
pinned rather than remembered. If a later feature implements the normalisation, that
assertion is the one that must be changed — which is how the deferred work announces
itself.

## Documentation

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| DOC-008-01 | `docs/sdd/documentation/api/overview.md` lists both endpoints and the paged envelope | BE-008-10 | Read it | DoD | main session | — |
| DOC-008-02 | `summary.md` written: what changed, trade-offs, known limitations — Q-7 named as a limitation | All | DoD checklist | DoD | main session | — |
| DOC-008-03 | `tests.md` and `ai-notes.md` completed with **observed** output; board and delivery log updated | DOC-008-02 | The `verify-story` gate | DoD | main session | `verify-story` |

## Review

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| REV-008-01 | Layer boundaries, correctness against every AC, scope creep. Specifically: no query inside a loop, `CancellationToken` on every async path, `AsNoTracking` on both reads, and no `ICommand` on a query | All | `review.md` verdict `Approved` | DoD | `comprehensive-review:code-reviewer` | `code-review:code-review` |
| REV-008-02 | Security: the search term is parameterised and never concatenated; `404` and `400` leak no SQL, no id, and no stack trace; no PII in logs | BE-008-06 | `review.md` | DoD | `comprehensive-review:security-auditor` | — |
| REV-008-03 | Generated OpenAPI compared against `contracts/customers-read-api.md`, field by field and status code by status code | BE-008-10 | Any difference fixed in one of the two before closing | DoD | main session | — |
| REV-008-04 | The index in the migration matches `data-model.md`, and the query plan for the default page actually uses it | BE-008-04, BE-008-05 | `sys.indexes` row plus an actual execution plan on a seeded table | DoD | `voltagent-lang:sql-pro` | — |

`REV-008-04` exists because an index in a migration and an index a query uses are two
different claims. `IX_Customers_FullName` is justified by the `ORDER BY`, and the only
thing that confirms it is the plan.

## Droppable if time runs short

| Task | What is lost |
|---|---|
| FE-008-04 URL-bound search | Search still works; the result set is not shareable and the back button loses the term |
| BE-008-06 phone matching, specifically | Name and email search cover most real use. Drop the third column, not the escaping and not the collation — those are correctness, not coverage |
| FE-008-05 generated types | The provisional types stay. They are correct today and silently wrong the first time the contract moves, so this is a debt entry, not a saving |
| TEST-008-10 the `COLLATE` assertion | The behaviour is still right on a `CI_AS` server. What is lost is the only thing that would catch it going wrong on any other server |

**Not droppable:** `BE-008-01`. `007`'s `Location` header points at it, and the demo
flow cannot continue past step one without it.

**Not droppable:** `BE-008-04`. Without the index the default list sorts the whole table
on every request, and `data-model.md` would be describing a schema that does not exist.

**Not droppable:** `BE-008-02`. AC-3 is a one-line change with two plausible wrong
answers, and both wrong answers look like correct behaviour from the outside.

**Not droppable:** `BE-008-09`. It is the feature's only audit work, it is a negative
assertion, and NFR-10's architecture test fails the build if a query is typed as a
command.
