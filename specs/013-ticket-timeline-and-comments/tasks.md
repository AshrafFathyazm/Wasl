# 013 — Task Breakdown

**Phase:** 3 · **Story:** US-010 · **Feature:** `013-ticket-timeline-and-comments` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

Agents named here are **not dispatched until the plan is approved**. Naming is the plan.

## Migration note

Migrated from `docs/sdd/story-artifacts/US-010-ticket-timeline-comments/tasks.md`. Same
tasks, same reasoning, same critical path. What changed:

| Change | Why |
|---|---|
| `BE-010-nn` → `BE-013-nn`, and every "Depends on" reference with it | The task id names the feature folder (`specs/README.md`) |
| `Agent` and `Skill` columns added to every row | From the table in `specs/README.md`; a task with no owner is a task nobody starts |
| `BE-013-10` and `TEST-013-13`/`-14` are **new**: the audit obligation | The original predates ADR-008, so **no task carried it**. NFR-10's architecture test fails the build when a state-changing command does not implement `IAuditableCommand`, so the original task list would not have compiled a green build. `BR-9.7` also makes the redaction its own assertion, because a generic command serialiser would put the comment body into the one table nothing deletes |
| `BE-013-11` and `TEST-013-15` are **new**: the `401` audit row | BR-9.2 covers `401` as well as `403`, and BR-9.4 means it is written **outside** any transaction. There is **no `403`** on either endpoint — BR-6 permits both roles — so no denial task exists, and that absence is stated rather than left looking like an omission |
| `TEST-013-12` is **new**: the captured SQL | A `Concat` that EF cannot translate falls back to client evaluation. Every functional test still passes and the application reads the whole ticket. Nothing else in the suite catches it |
| `TEST-013-16` … `TEST-013-19` are **new** | One entry per comment (not two), Arabic sentences with no Latin enum tokens, an Arabic body round-tripping through `nvarchar`, and a deactivated author still appearing |
| `FE-013-00` is **new**: the screen preview | Phase 3b, ADR-009. Rendering a screen costs minutes; changing one that already has tests, translation keys and query wiring costs hours |
| Schema tasks now verify with `sys.indexes` and `sys.check_constraints` | ADR-013. There is no `psql`, so no `\d+` |
| `TicketsController` tasks became one endpoint file per slice | ADR-010: minimal APIs, no controllers, no `Wasl.Application`, no `Wasl.Infrastructure` |
| `REV-013-01` … `REV-013-03` are **new** | The original had no review lane. `REV-013-03` is the OpenAPI-versus-contract comparison the DoD requires |
| `DOC-013-04` is **new** | Two blueprint documents need a row each because of decisions made here — see **Contract changes** in `plan.md` |

## Critical path

```text
BE-013-01 → BE-013-02 → BE-013-04 → BE-013-05 → FE-013-02 → FE-013-03
```

`FE-013-00` gates `FE-013-02`. Everything else improves the story; these make it exist.

## Backend

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| BE-013-01 | `TicketComment` entity, configuration, and migration `AddTicketComments`: `dbo.TicketComments` with `nvarchar(4000)` body, `bit`, `datetime2(3)`, `IX_TicketComments_Ticket_Time`, `CK_TicketComments_Body`, FK cascade to `Tickets` and `NO ACTION` to `SupportUsers` | `009` | `dotnet ef database update`, then `SELECT name, type_desc FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.TicketComments')` and `SELECT name, definition FROM sys.check_constraints WHERE parent_object_id = OBJECT_ID('dbo.TicketComments')` — both non-empty | AC-1 | `voltagent-lang:sql-pro` | — |
| BE-013-02 | `Ticket.AddComment` validates the body, rejects a closed ticket, appends **both** the comment and the `CommentAdded` history row carrying the comment id in `NewValue` and **not** the body | BE-013-01 | `dotnet test tests/Wasl.Domain.Tests --filter TicketComment` | AC-2 – AC-4, AC-8 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-013-03 | `POST /api/tickets/{id}/comments` as a minimal-API endpoint; author taken from the token; `channel` bound as `string?` and validated by FluentValidation so an unknown value produces a `400` that **names the field** | BE-013-02 | Integration test supplying a false `authorUserId` in the body and asserting the token's user won | AC-1, AC-7, AC-15, AC-16 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-013-04 | `TicketTimelineQuery` unions comments and history into the common projection, joining `SupportUsers` once per branch with **no `IsActive` predicate**, and excluding `CommentAdded` rows from the history branch | BE-013-01 | Integration test on ordering; the projection reviewed against `plan.md`'s column-shape table | AC-9, AC-11 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-013-05 | Timeline pagination correct across the union boundary. `Concat` first, then `OrderBy`/`ThenBy`/`Skip`/`Take`. Omitted `page` returns the **last** page and the envelope says which one it was | BE-013-04 | Integration test on a page spanning both sources, plus a request with no `page` | AC-12 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-013-06 | Deterministic tie-break for same-instant entries: `(OccurredAtUtc, EntryTypeRank, Id)` | BE-013-04 | Integration test repeating the same request and comparing the sequences | AC-10 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-013-07 | Actor names resolved in the same query, not per entry | BE-013-04 | Executed-command count assertion | AC-14 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-013-08 | `GET /api/tickets/{id}/timeline` with full OpenAPI metadata: `200`, `400`, `401`, `404`, the paged envelope, and the discriminated entry shape | BE-013-05 | `/swagger` inspected, then compared against `contracts/ticket-timeline-api.md` | AC-9, Contract | `voltagent-lang:dotnet-core-expert` | — |
| BE-013-09 | Confirm no edit or delete surface exists for a comment anywhere: no endpoint, no domain mutator, no `DbSet` update path | BE-013-03 | `PUT`/`PATCH`/`DELETE` on the comments route return `405`; grep the slice for a setter on `TicketComment` | AC-13, BR-5.3 | `comprehensive-review:code-reviewer` | `code-review:code-review` |
| BE-013-10 | `AddCommentCommand` implements `IAuditableCommand` with action `Ticket.CommentAdded`; `EntityLabel` is the `TicketNumber`; `Changes` carries `commentId`, `isInternal`, and `channel` and **never** `body`; the row is written by the pipeline behaviour in the same transaction | `003`, BE-013-03 | Integration test asserting one row, none after a forced rollback, and the body string absent from the whole row | BR-9.1, BR-9.3, BR-9.7 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-013-11 | Both endpoints require authentication, and the `401` writes an `Auth.Unauthenticated` audit row **outside** any transaction | `004`, BE-013-03, BE-013-08 | Integration test with no token: `401`, and the row present | BR-9.2, BR-9.4 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-013-12 | Server messages `Validation.CommentBody.Required`, `Validation.CommentBody.TooLong`, `Validation.Channel.Invalid`, `Error.TicketClosed` in both `.resx` catalogues | `005`, BE-013-03 | Key-parity test; an `Accept-Language: ar` request returns an Arabic `title` with an identical `type` | BR-8.6, BR-8.7 | `voltagent-lang:dotnet-core-expert` | — |

`BE-013-10` and `BE-013-11` are new in this migration. The original `tasks.md` predates
ADR-008, so no task carried the audit obligation — and an audit gap is exactly the kind
of omission `NFR-10`'s architecture test exists to catch. It would have failed the
build.

## Frontend

Starts as soon as [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md) exists. It does not
wait for `BE-013-03`.

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| FE-013-00 | Screen preview of the timeline drawer and the composer: real tokens, real copy, a 137-entry ticket, every state, both languages. **Approved before any wiring** | `006`, `010` | Rendered and reviewed (Phase 3b) | AC-17 | `ui-ux-pro-max:ui-styling` | `frontend-design` |
| FE-013-01 | Timeline and comment types plus the Zod composer schema, matching the contract. Types marked **provisional** until generated from OpenAPI | Contract frozen | `npm run typecheck` | AC-17 | `voltagent-lang:typescript-pro` | — |
| FE-013-02 | `TimelineEntry` narrows on `entryType` and renders each distinctly, with an exhaustive switch that fails to compile on an unhandled entry type | FE-013-00, FE-013-01 | Component test with both types | AC-17 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-013-03 | `CommentComposer` posts and refreshes the timeline. Optimistic **append** at the newest end, replaced on success, rolled back on failure; send disabled while pending | FE-013-02, BE-013-03 | Component test plus a manual run against the API | AC-1 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-013-04 | Internal comments visually distinct — badge plus a token-driven surface, never colour alone | FE-013-02 | Component test | AC-5, BR-5.4 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-013-05 | Load-older action. The drawer opens on the newest page; older pages prepend without moving the reader's scroll anchor | BE-013-05, FE-013-02 | Component test plus a manual run on a ticket with over 50 entries | AC-12 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-013-06 | Composer hidden on a closed ticket; the `409 errors/ticket-closed` still handled, and the optimistic entry rolled back when it fires | FE-013-03 | Component test with a mocked `409`, plus a manual run on a closed ticket | AC-4 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-013-07 | Loading and error states inside the drawer; the comments-section empty state; the whole-timeline empty branch documented as unreachable by invariant and rendered as a diagnostic, not as a friendly "nothing here yet" | FE-013-02 | Component test per state | AC-17 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-013-08 | Drawer is a real dialog: focus trapped, labelled, `Escape` closes, focus returns to the trigger. Feed is an ordered list. Every entry carries `dir="auto"`; the feed does not | FE-013-02 | Keyboard walk-through recorded in `tests.md` | AC-17 | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |
| FE-013-09 | Every string from a catalogue, present in `en` and `ar`. Enum values inside a translated sentence go through the enum-label keys, never interpolated raw. The screen viewed in Arabic and rendering RTL correctly | `005`, FE-013-02 | Key-parity test, plus the Arabic pass recorded in `tests.md` | BR-8.7, BR-8.8, BR-8.11 | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |
| FE-013-10 | Provisional types replaced with types generated from the OpenAPI document | BE-013-08 | `npm run typecheck` after regeneration | ADR-011 §6 | `voltagent-lang:typescript-pro` | — |

## Tests

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| TEST-013-01 | Unit: body validation — empty, whitespace, tab-only, exactly 4000, 4001 | BE-013-02 | Test run | AC-2, AC-3 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-013-02 | Unit: comment rejected on a closed ticket | BE-013-02 | Test run | AC-4, BR-5.2 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-013-03 | Unit: both the comment and the history row appended, and the history row's `NewValue` is the comment id, not the body | BE-013-02 | Test run | AC-8, BR-5.5 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-013-04 | Integration: `201`, each `400` variant, `409 errors/ticket-closed`, `404` unknown ticket | BE-013-03 | Test run | AC-1 – AC-4, AC-16 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-013-05 | Integration: `isInternal` and `channel` round-trip; an unknown `channel` returns `400` naming `channel` and listing the permitted values | BE-013-03 | Test run | AC-5 – AC-7 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-013-06 | Integration: the history row excludes the comment body | BE-013-02 | Test run | AC-8 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-013-07 | Integration: merged order across both sources | BE-013-04 | Test run | AC-9 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-013-08 | Integration: same-instant entries order identically on repeat. Asserted as **stability**, not against a C#-computed `Guid` order — SQL Server does not sort `uniqueidentifier` the way `Guid.CompareTo` does | BE-013-06 | Test run | AC-10 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-013-09 | Integration: a page spanning the union boundary is correct and complete; concatenating every page reproduces the full feed exactly once, with nothing dropped or repeated | BE-013-05 | Test run | AC-12 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-013-10 | Integration: executed-command count for the timeline is constant as the entry count grows | BE-013-07 | Test run | AC-14 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-013-11 | Component: a body containing a script tag renders as text; no `dangerouslySetInnerHTML` anywhere in the slice | FE-013-02 | Test run plus a grep | Security | `comprehensive-review:security-auditor` | — |
| TEST-013-12 | Integration: the captured SQL for one timeline request is **one statement** containing `UNION ALL` and `OFFSET … FETCH NEXT` | BE-013-05 | Test run against the EF log | AC-12, AC-14 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-013-13 | Integration: one audit row per accepted comment, action `Ticket.CommentAdded`; **no row** after a forced rollback | BE-013-10 | Test run | BR-9.1, BR-9.3 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-013-14 | Integration: the comment body appears nowhere in the audit row — not in `Changes`, not in `EntityLabel` | BE-013-10 | Test run asserting on a distinctive body string | BR-9.7 | `comprehensive-review:security-auditor` | — |
| TEST-013-15 | Integration: `401` on both endpoints without a token, and the `Auth.Unauthenticated` row present with no transaction to join | BE-013-11 | Test run | BR-9.2, BR-9.4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-013-16 | Integration: adding one comment produces exactly **one** timeline entry, not two | BE-013-04 | Test run | AC-9, spec Q-1 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-013-17 | Component: an Arabic render of a `StatusChanged` entry contains no Latin enum token | FE-013-09 | Test run | BR-8.7 | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |
| TEST-013-18 | Integration: an Arabic comment body round-trips byte-identical through `POST` and the timeline | BE-013-03 | Test run | ADR-013 row 4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-013-19 | Integration: a comment and a history row authored by a **deactivated** user still appear, with the name resolved | BE-013-04 | Test run | AC-11, spec edge case | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |

## Documentation

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| DOC-013-01 | `docs/sdd/documentation/api/` lists both endpoints and the timeline entry shape | BE-013-08 | Read it | DoD | main session | — |
| DOC-013-02 | The union decision, the paging direction, and the `CommentAdded` exclusion recorded in `summary.md` | BE-013-04, BE-013-05 | Read it | DoD | main session | — |
| DOC-013-03 | `tests.md` and `ai-notes.md` completed with **observed** output; board and delivery log updated | DOC-013-02 | The `verify-story` gate | DoD | main session | `verify-story` |
| DOC-013-04 | Two blueprint rows added: `errors/ticket-closed` in `05-api-conventions.md`'s `409` list, and the prepend/append correction in `design/screens/04-ticket-detail.md` action 5 | BE-013-03, FE-013-03 | Both files read back | Contract | main session | — |

## Review

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| REV-013-01 | Layer boundaries (`Wasl.Domain` has zero package references; the union is a query object with one caller and no interface; no repository), `CancellationToken` on every async path, `TimeProvider` and not `DateTime.UtcNow`, correctness against every AC, scope creep | All | `review.md` verdict `Approved` | DoD | `comprehensive-review:code-reviewer` | `code-review:code-review` |
| REV-013-02 | Security: the body is rendered as text and never as HTML; the audit row carries no body; internal comments are marked and not filtered, and that is the stated rule rather than an oversight; no PII in logs | BE-013-10, FE-013-02 | `review.md` | DoD | `comprehensive-review:security-auditor` | — |
| REV-013-03 | Generated OpenAPI compared against `contracts/ticket-timeline-api.md`, field by field and status code by status code | BE-013-08 | Any difference fixed in one of the two before closing | DoD | main session | — |

## Droppable if time runs short

| Task | What is lost |
|---|---|
| FE-013-05 load-older | The timeline shows the most recent 50 with no way back. Acceptable in a demo, incomplete as a feature |
| BE-013-06 tie-break | Same-instant ordering becomes non-deterministic — rare in production, and cosmetic when it happens. Note that it is **not** rare in the test suite: a frozen `TimeProvider` gives the comment and its history row the same `datetime2(3)` value, so dropping this makes `TEST-013-08` flaky rather than absent |
| FE-013-04 internal styling | Internal comments still store correctly and are still distinguishable in the payload |
| TEST-013-19 deactivated author | The join is small and reviewable by eye. Drop the test, not the review |

**Not droppable:** `BE-013-04` and `TEST-013-09`. The merge is the substance of this
story, and a merge whose pagination is wrong is worse than two separate lists, because
it silently drops entries.

**Not droppable:** `TEST-013-12`. Without it, a `Concat` that EF could not translate
looks exactly like one it could — correct results, every test green, and the whole
ticket read from disk for every page. It is the only assertion that distinguishes the
design that was chosen from the one that was rejected.

**Not droppable:** `BE-013-10`. An audit row added after the handler exists is an audit
row with an invisible hole, and the architecture test fails the build without it.
