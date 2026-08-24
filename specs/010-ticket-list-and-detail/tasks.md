# 010 — Task Breakdown

**Phase:** 2 · **Story:** US-006 · **Feature:** `010-ticket-list-and-detail` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

Agents named here are **not dispatched until the plan is approved**. Naming is the plan.

## What this migration changed

| Change | Reason |
|---|---|
| IDs renumbered `BE-006-nn` → `BE-010-nn`, and every `Depends on` updated with them | The task ID says which feature folder it lives in (`specs/README.md`) |
| The story's tasks split across two folders | `docs/sdd/08-board.md`: the list is not droppable, the filters are cut first. Filter, search, `me`/`unassigned`, and URL-state tasks moved to `015`; see its `tasks.md` |
| `Agent` and `Skill` columns added to every row | From the table in `specs/README.md` |
| Paths corrected from `src/Wasl.Application/...` to slices under `src/Wasl.Api/Features/...` | ADR-010 accepted. There is no `Wasl.Application` and no `Wasl.Infrastructure` |
| `TicketsController.List` became a minimal-API endpoint per slice | ADR-010. A controller would collect six unrelated ticket slices |
| PostgreSQL assumptions removed | ADR-013 supersedes ADR-001. `Testcontainers.MsSql`, `sys.indexes` instead of `\d+`, `datetime2(3)` — which is what makes AC-22's tie-breaker reachable |
| `BE-010-05` and `BE-010-06` added: `TicketStatusTransitions` and `allowedTransitions` on the detail response | The source story has no criterion for `GET /api/tickets/{id}`, though `docs/sdd/05-api-conventions.md` lists it under US-006 and ADR-004 requires the array. AC-17 – AC-20 and AC-23 are the new criteria |
| `BE-010-09` added: the audit row on the `401` path | **The originals predate ADR-008.** This feature has no state-changing command, so BR-9.1 and BR-9.3 do not apply and the NFR-10 architecture test has no `IAuditableCommand` here to assert — that is correct, and it is stated so the absence reads as a decision rather than an omission. What does apply is BR-9.2: a `401` writes a row, **outside any transaction** (BR-9.4), because a denied read has no transaction to join. There is no `403` path, because BR-6 grants list and view to both roles |
| `BE-010-10` added: the ordering index | The blueprint justifies `IX_Tickets_Status_Created` as the "default list query", which describes `015`'s filtered query, not this unfiltered one |
| `FE-010-00` added: screen preview before any wiring | Rendering a screen costs minutes; changing one that already has tests, translation keys, and query wiring costs hours (ADR-009, `docs/sdd/design/preview-first-workflow.md`) |
| `REV-010-*` section added, including the OpenAPI-versus-contract comparison | `specs/README.md` gates |

## Critical path

```text
BE-010-01 → BE-010-02 → BE-010-03 → BE-010-05 → BE-010-06 → FE-010-02
```

Everything else improves the feature. These make it exist.

## Backend

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| BE-010-01 | `PagingParameters` / `PagedResult<T>` clamp `page` to ≥ 1, default `pageSize` to 20, cap it at 100, and floor `pageSize < 1` to the default. **Reused from `008`** — if `008` has not landed, it is created there, not duplicated here | `008` | `dotnet test tests/Wasl.Api.IntegrationTests --filter Paging` plus unit tests at 0, 1, 20, 100, 101, 1000 | AC-3 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-010-02 | `ListTicketsHandler` projects straight to `TicketListItemResponse` with `customerName` and `assigneeName` joined in, ordered `CreatedAtUtc DESC, Id DESC` | BE-010-01, `009` | Integration test asserting the column set and the order | AC-1, AC-2, AC-12, AC-13, AC-22 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-010-03 | `GET /api/tickets` minimal-API endpoint returns the envelope; an empty result is `200` with `items: []`; the echoed `pageSize` reports the **clamped** value | BE-010-02 | Integration test asserting all five envelope fields | AC-1, AC-3, AC-11, AC-21 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-010-04 | The executed-command count stays constant as the page size grows — 2 (count + page), never 2 + n | BE-010-02 | `CommandCountingInterceptor` assertion over 50 rows at `pageSize` 10 and 50 | AC-12 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| BE-010-05 | `TicketStatusTransitions` in `Wasl.Domain/Tickets/` — the static BR-1 map with `PermittedFrom(status)`, and no dependency on anything | `009` | `dotnet test tests/Wasl.Domain.Tests --filter TicketStatusTransitions` over all 36 cells | AC-18 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-010-06 | `GET /api/tickets/{id:guid}` returns the detail shape with names, escalation fields, `version`, and `allowedTransitions` | BE-010-05 | Integration test against the frozen contract shape | AC-17, AC-18 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-010-07 | An unmatched id returns `404` `errors/not-found`; a non-`Guid` segment is rejected by the route constraint as `404`, never `500` | BE-010-06 | Integration tests for both, asserting `ProblemDetails` and a `traceId` | AC-19, AC-20 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-010-08 | Both endpoints require authentication and return `401` `errors/unauthenticated` | `004` | Integration test with no `Authorization` header | AC-16 | `voltagent-lang:dotnet-core-expert` | — |
| BE-010-09 | The `401` on both endpoints writes one `Auth.Unauthenticated` audit row with `Outcome = Denied`, **outside any transaction** (BR-9.2, BR-9.4). No `IAuditableCommand` exists in this feature and none is added | `003`, `004`, BE-010-08 | Integration test asserting exactly one row, and that it survives when no business transaction was ever opened | BR-9.2, BR-9.4 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-010-10 | Migration `AddTicketListSortIndex` creates `IX_Tickets_CreatedAtUtc_Id` on `(CreatedAtUtc DESC, Id DESC)` | `009` | `dotnet ef database update` on a clean database, then `SELECT name, is_unique, filter_definition FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.Tickets')` — the new row must be present and `is_unique` must be **0** | AC-2, AC-22 | `voltagent-lang:sql-pro` | — |
| BE-010-11 | A malformed `page` or `pageSize` produces the contract's `ProblemDetails`, not the framework's bare `400` body | BE-010-03 | Integration test asserting `type`, `status`, and a `traceId` on `?page=abc` | AC-3, Contract | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-010-12 | OpenAPI metadata declares `200`, `400`, `401` for the list and `200`, `401`, `404` for the detail, with the enum values named | BE-010-07 | `/swagger` inspected, then compared against `contracts/tickets-list-api.md` | Contract | `voltagent-lang:dotnet-core-expert` | — |

## Frontend

Starts as soon as [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md) exists. It does not
wait for `BE-010-03`.

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| FE-010-00 | Screen preview of **both** screens: real tokens, real copy, 100 plausible rows, a 200-character Arabic subject, all five states, both languages. **Approved before any wiring** | `006` | Rendered and reviewed (Phase 3b) | AC-15 | `ui-ux-pro-max:ui-styling` | `frontend-design` |
| FE-010-01 | Request and response types plus TanStack Query keys, matching the contract. Types marked **provisional** until generated from OpenAPI | Contract frozen | `npm run typecheck` | AC-13, AC-17 | `voltagent-lang:typescript-pro` | — |
| FE-010-02 | `TicketTable` renders all nine AC-13 columns; skeleton rows at the real row height so there is no layout shift; the "no tickets" empty state with its create CTA | FE-010-01 | `npm run test -- TicketTable` | AC-13, AC-15 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-010-03 | Pagination and rows-per-page, both held in the URL; a request above 100 is clamped and the control reflects what the server returned | FE-010-02 | Component test plus a manual run across three pages | AC-1, AC-3, AC-21 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-010-04 | `TicketDetailPage` renders the header, summary strip, rail, and description. `dir="auto"` on subject and description; `TicketNumber` in Latin digits, `tabular-nums`, laid out left-to-right in both locales | FE-010-01 | Component test plus the Arabic render | AC-17 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-010-05 | `TicketActionMenu` renders **only** what `allowedTransitions` contains; an empty array renders no control at all | FE-010-04 | Component test with a stubbed array, including `[]` | AC-18, AC-23 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-010-06 | A `404` renders a full-page not-found with a route back to the list, not a thrown boundary error | FE-010-04 | Component test with a mocked `404` | AC-19 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-010-07 | Error state when the API is unreachable: message, the `traceId`, and a retry | FE-010-02 | Manual run with the API stopped | AC-15 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-010-08 | Provisional types replaced with types generated from the OpenAPI document | BE-010-12 | `npm run typecheck` after regeneration | ADR-011 §6 | `voltagent-lang:typescript-pro` | — |
| FE-010-09 | Every string from a catalogue, present in `en` and `ar`; **both** screens viewed in Arabic and rendering RTL correctly, including column order, mirrored pagination chevrons, and the rail on the inline-end | `005`, FE-010-04 | Key-parity test, plus the Arabic pass recorded in `tests.md` | BR-8.8, BR-8.11, BR-8.13 | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |

## Tests

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| TEST-010-01 | Paging clamp at every boundary: `page` 0 and −1, `pageSize` 0, 1, 20, 100, 101, 1000 | BE-010-01 | Test run | AC-3 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-010-02 | Envelope fields and default sort against a fixture with known timestamps | BE-010-03 | Test run | AC-1, AC-2 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-010-03 | An empty table returns `200` with `items: []`, `totalCount: 0`, `totalPages: 0` — never `404` | BE-010-03 | Test run | AC-11 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-010-04 | A `page` beyond the last returns `200`, an empty array, and the correct total | BE-010-03 | Test run | AC-21 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-010-05 | Three tickets sharing one `CreatedAtUtc` (controlled `TimeProvider`) appear exactly once each across two `pageSize=2` pages | BE-010-02 | Test run | AC-22 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-010-06 | Executed-command count is 2 at `pageSize=10` and 2 at `pageSize=50` over 50 rows | BE-010-04 | Test run | AC-12 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-010-07 | Detail shape: names present, escalation fields present when escalated and `null` when not, `version` non-empty | BE-010-06 | Test run | AC-17 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-010-08 | `allowedTransitions` for each of the six statuses matches BR-1's row; `Closed` returns `[]` | BE-010-05, BE-010-06 | Test run | AC-18 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-010-09 | `404` for an unmatched `Guid`; `404` for `/api/tickets/not-a-guid`; `404` for a customer's id | BE-010-07 | Test run | AC-19, AC-20 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-010-10 | `401` without a token on both endpoints | BE-010-08 | Test run | AC-16 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-010-11 | Exactly one `Auth.Unauthenticated` audit row per denied request, present with no business transaction in play | BE-010-09 | Test run | BR-9.2, BR-9.4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-010-12 | An Arabic subject and an Arabic customer name round-trip byte-identical through both endpoints | BE-010-06 | Test run | ADR-013 row 4, BR-8.10 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-010-13 | A ticket with a `null` assignee is listed, not dropped, and renders `—` | BE-010-02 | Test run | AC-13 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-010-14 | Keyboard order through the table and the detail rail, visible focus rings, both screens in Arabic | FE-010-09 | Recorded in `tests.md` | AC-15, BR-8.11 | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |

## Documentation

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| DOC-010-01 | `docs/sdd/documentation/api/` lists both endpoints and their status codes | BE-010-12 | Read it | DoD | main session | — |
| DOC-010-02 | `summary.md` written: what changed, the sort tie-breaker, the index decision, known limitations | All | DoD checklist | DoD | main session | — |
| DOC-010-03 | `tests.md` and `ai-notes.md` completed with **observed** output; `08-board.md` and `12-delivery-log.md` updated | DOC-010-02 | The `verify-story` gate | DoD | main session | `verify-story` |

## Review

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| REV-010-01 | Layer boundaries, correctness against every AC, no query inside a loop, `CancellationToken` on every async path, no scope creep | All | `review.md` verdict `Approved` | DoD | `comprehensive-review:code-reviewer` | `code-review:code-review` |
| REV-010-02 | Security: the list and detail expose nothing beyond the screen's needs, no internal comment content leaks into either shape, no PII in logs, `detail` carries no SQL or exception type | BE-010-07 | `review.md` | DoD | `comprehensive-review:security-auditor` | — |
| REV-010-03 | The generated OpenAPI document compared field by field and status code by status code against `contracts/tickets-list-api.md` | BE-010-12 | Any difference fixed in one of the two before closing — a difference is a defect in one of them, never accepted silently | DoD | main session | — |
| REV-010-04 | The audit position re-checked: no state-changing command was introduced, so BR-9.1 / BR-9.3 still do not apply, and the `401` row still fires. Any of those becoming false is a blocking finding | BE-010-09 | `review.md` | DoD | `comprehensive-review:security-auditor` | — |

## Droppable if time runs short

| Task | What is lost | Still true |
|---|---|---|
| FE-010-03 rows-per-page selector | The page size is fixed at 20 in the UI | The API still clamps, and TEST-010-01 still proves it |
| FE-010-06 dedicated not-found page | A `404` falls to the generic error boundary, which says less | The `404` is still correct on the wire, proven by TEST-010-09 |
| BE-010-10 the ordering index | The default list is a scan plus a sort. Immaterial at demo volume, and it is the first thing to hurt at real volume | The order itself is still correct and deterministic — the index is performance, the `ORDER BY` is the contract |
| FE-010-05's menu **items** | The action menu is not rendered at all until `011` / `012` | Only if `011` and `012` are also cut. The array is still returned and still tested (TEST-010-08), so nothing has to be re-decided |

**Not droppable:** `BE-010-02` and `TEST-010-06`. A list that issues a query per row is
the defect this feature is most likely to ship, and it is invisible until someone counts.

**Not droppable:** `BE-010-05` and `BE-010-06`. Without `allowedTransitions` the client
has to derive the permitted set, which means a second copy of BR-1 in TypeScript. ADR-004
forbids exactly that, and the two copies agree on the day they are written.

**Not droppable:** `TEST-010-05`. The tie-breaker is the one defect here that survives
review, passes every single-page test, and reaches a user as "the list skipped one".

**Not droppable:** `BE-010-09`. It is the only audit obligation this feature has, and an
audit gap is invisible by construction.
