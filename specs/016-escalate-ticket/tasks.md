# 016 — Task Breakdown · Escalate Ticket

**Phase:** 5 · **Story:** US-009 · **Feature:** `016-escalate-ticket` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

Agents are **named** here and **not dispatched** until the plan is approved. Naming is
the plan.

**What this migration changed.** The source at
`docs/sdd/story-artifacts/US-009-escalate-ticket/tasks.md` was an unfilled template — one
empty row per lane and no reasoning to preserve. So the tasks below are authored, not
renumbered from prior content, and they were written against three decisions the template
predates:

| # | Change | Why |
|---|---|---|
| 1 | IDs are `BE-016-*` / `FE-016-*` / `TEST-016-*` / `DOC-016-*` / `REV-016-*` | The task ID names the feature folder, so an ID says where it lives without a lookup (`specs/README.md`) |
| 2 | `Agent` and `Skill` columns on every row | The dispatch table in `specs/README.md` |
| 3 | ADR-010: no `Wasl.Application`, no `Wasl.Infrastructure`, no controller, no `ITicketRepository`. One slice folder plus the domain | ADR-010 was accepted after the template was written |
| 4 | ADR-013: SQL Server. Column verification is a `sys.columns` query, not `\d+`; integration tests use `Testcontainers.MsSql`; the reason column is `nvarchar(500)` | ADR-013 supersedes ADR-001 |
| 5 | **`BE-016-06`, `BE-016-07`, `TEST-016-10`, and `TEST-016-11` are new.** The template predates ADR-008, so no task carried the audit obligation | Without `IAuditableCommand` on the command, NFR-10's architecture test **fails the build**. And a `403` denied at the boundary writes no row at all unless the denial path is audited separately (BR-9.2, BR-9.4) — an invisible hole in exactly the endpoint whose whole authorization story is "Manager only" |
| 6 | `FE-016-00`, a screen-preview task in Phase 3b | Rendering a screen costs minutes; changing one that already has tests, translation keys, and query wiring costs hours (ADR-009) |
| 7 | A `Review` section with `REV-016-03`, comparing the generated OpenAPI against `contracts/ticket-escalate-api.md` | `specs/README.md`, "The contract between the lanes" |

## Critical path

```text
BE-016-02 → BE-016-03 → BE-016-04 → BE-016-05 → BE-016-06 → FE-016-02
```

`BE-016-02` is `TicketPriorityFloor` — BR-3.6, the rule this whole feature exists to get
right. Everything else on the list improves the story; these make it exist and make it
correct.

## Backend

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| BE-016-01 | The four escalation columns are confirmed present with the right SQL Server types — no migration in this feature | `009` | `SELECT c.name, t.name AS type_name, c.max_length, c.is_nullable FROM sys.columns c JOIN sys.types t ON t.user_type_id = c.user_type_id WHERE c.object_id = OBJECT_ID('dbo.Tickets') AND c.name IN ('IsEscalated','EscalatedAtUtc','EscalatedByUserId','EscalationReason')` — `EscalationReason` must be **`nvarchar`**, not `varchar` | AC-7, ADR-013 | `voltagent-lang:sql-pro` | — |
| BE-016-02 | `TicketPriorityFloor.RaiseTo(current, floor)` returns the higher value by an explicit rank map. `Low`/`Normal` → `High`; `High`/`Critical` → unchanged | `009` | `dotnet test tests/Wasl.Domain.Tests --filter "TicketPriorityFloor"` | **AC-6**, BR-3.6 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-016-03 | `Ticket.Escalate(reason, byUserId, TimeProvider)` enforces BR-3.3 then BR-3.4, applies the floor, sets all four BR-3.7 fields, stamps `UpdatedAtUtc`, and returns `EscalationResult` with `PriorityChanged` | BE-016-02 | Unit tests including both refusals and the `Critical` case | AC-3, AC-4, AC-6, AC-7 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-016-04 | `Ticket.IsEscalatable` — status and flag only, no role. `EscalateTicketCommand`, `Handler`, and `Validator` in one slice folder; the handler writes the `Escalated` history row and the `PriorityChanged` row **only when `PriorityChanged` is true** | BE-016-03 | Unit tests, plus an integration test asserting one history row for a `Critical` ticket and two for a `Normal` one | AC-5, AC-8, AC-15 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-016-05 | `POST /api/tickets/{id}/escalate` returns `200` with the updated ticket, matching the frozen contract | BE-016-04 | Integration test asserting the body against `contracts/ticket-escalate-api.md` | AC-1 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-016-06 | The command implements `IAuditableCommand` with action `Ticket.Escalated`; the row is written by the pipeline behaviour in the **same transaction** (BR-9.3), `Changes` carrying `IsEscalated` and — only when it moved — `Priority`, and **not** the reason text | `003`, BE-016-04 | Integration test asserting one audit row on success and **none** after a forced rollback | AC-13, BR-9.1, BR-9.3, BR-9.8 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-016-07 | The `CanEscalate` policy denies a non-Manager at the boundary with `403`, and that denial writes an `Auth.Forbidden` audit row **outside any transaction** (BR-9.4) | `004`, BE-016-05 | Integration test with an Agent token asserting the `403` **and** the audit row. The handler must not have run | AC-2, AC-14, BR-9.2 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-016-08 | `TicketNotEscalatableException` → `409 errors/ticket-not-escalatable`; `TicketAlreadyEscalatedException` → `409 errors/already-escalated`; BR-3.3 evaluated before BR-3.4 | `002`, BE-016-03 | Integration tests for `Resolved`, `Closed`, already-escalated, and closed-**and**-escalated | AC-3, AC-4 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-016-09 | `expectedVersion` is required and honoured; a stale value returns `409 errors/concurrency-conflict`. The endpoint requires authentication; a missing token returns `401`; an unknown id returns `404` | BE-016-05 | Integration tests: two writes on one version give one `200` and one `409`; a call with no token; an unknown `Guid` | AC-10, AC-11, AC-12 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-016-10 | The ticket read projection exposes `isEscalated`, `escalatedAtUtc`, `escalatedBy`, `escalationReason`, and `canEscalate`, where `canEscalate` = `IsEscalatable && caller is Manager` | BE-016-04, `010` | Integration test: `canEscalate` is `false` for an Agent, for an escalated ticket, and for a `Resolved` ticket, and `true` for a Manager on an open unescalated one | AC-15 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-016-11 | Four server messages resolve through `IStringLocalizer` and exist in both `.resx` catalogues; `Error.TicketNotEscalatable` interpolates the status rather than concatenating it | `005`, BE-016-08 | Key-parity test, plus an `Accept-Language: ar` integration test asserting the sentence changed and `type` and the `errors` keys did not | AC-17, BR-8.6, BR-8.7 | `voltagent-lang:dotnet-core-expert` | — |
| BE-016-12 | OpenAPI metadata declares `200`, `400`, `401`, `403`, `404`, and `409` with their `type` values | BE-016-09 | `/swagger` inspected, then compared against `contracts/ticket-escalate-api.md` | Contract | `voltagent-lang:dotnet-core-expert` | — |

## Frontend

Starts as soon as [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md) exists. It does not
wait for `BE-016-05`.

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| FE-016-00 | Screen preview of the escalate dialog and the escalated rail callout on `/tickets/:id`: real tokens, real copy, a 500-character reason, all states, both languages. **Approved before any wiring** | `006`, `010` | Rendered and reviewed (Phase 3b) | AC-16 | `ui-ux-pro-max:ui-styling` | `frontend-design` |
| FE-016-01 | Zod schema and request/response types matching the contract. Types marked **provisional** until generated from OpenAPI | Contract frozen | `npm run typecheck` | AC-16 | `voltagent-lang:typescript-pro` | — |
| FE-016-02 | `EscalateDialog` submits `{ reason, expectedVersion }` and, on `200`, invalidates the ticket and timeline queries. No optimistic priority update | FE-016-01, BE-016-05 | Manual run against the API, both a `Normal` and a `Critical` ticket | AC-1, AC-6, AC-16 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-016-03 | The Escalate menu item renders **only when `canEscalate` is true**. No client-side status or role check anywhere in the tickets feature folder | FE-016-01, BE-016-10 | Component test across the `canEscalate` matrix, plus `grep` for `'Resolved'`/`'Closed'`/`'Manager'` in `features/tickets/` returning nothing outside the label catalogue | AC-15, AC-16 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-016-04 | Confirm is disabled at 0 characters and above 500; the counter appears at 450; the message is a translated key with an interpolated maximum | FE-016-01 | Component test at 0, 1, 500, and 501 characters | AC-5, AC-16 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-016-05 | `403` and all three `409`s render **inline beside the control**, never as a toast. `concurrency-conflict` offers Reload and never auto-retries | FE-016-02 | Component tests with each mocked failure | AC-16, ADR-006 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-016-06 | `EscalatedCallout` renders on the rail after success: who, when, and the reason with `dir="auto"`. Icon plus label, never colour alone | FE-016-02 | Component test, plus a manual run | AC-9, AC-16 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-016-07 | Provisional types replaced with types generated from the OpenAPI document | BE-016-12 | `npm run typecheck` after regeneration | ADR-011 §6 | `voltagent-lang:typescript-pro` | — |
| FE-016-08 | Every string from a catalogue, present in `en` and `ar`; `/tickets/:id` walked in Arabic with the dialog open and the callout visible; the escalate glyph confirmed **not** mirrored | `005`, FE-016-06 | Key-parity test, plus the Arabic pass recorded in `tests.md` | AC-17, BR-8.8, BR-8.11 | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |
| FE-016-09 | The dialog traps focus, returns focus to the trigger on close, `Escape` and backdrop cancel, the reason field has a programmatic label, and the error is announced via `aria-describedby` | FE-016-02 | Keyboard-only walkthrough and a screen-reader pass | AC-16 | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |

## Tests

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| TEST-016-01 | `TicketPriorityFloor.RaiseTo` over all four current values against the `High` floor, from a **separately written** table — not driven from the production rank map | BE-016-02 | Test run | AC-6, BR-3.6 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-016-02 | `Escalate_WhenPriorityIsCritical_LeavesPriorityUnchanged` — the named test for the rule most likely to be got wrong | BE-016-03 | Test run | **AC-6**, BR-3.6 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-016-03 | The rank order `Low < Normal < High < Critical` asserted explicitly, so reordering `TicketPriority` fails a build instead of silently changing a business rule | BE-016-02 | Test run | AC-6, spec A-3 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-016-04 | A `Critical` ticket produces **exactly one** history row (`Escalated`); a `Normal` ticket produces **two**, with `OldValue` `Normal` and `NewValue` `High` on the `PriorityChanged` row | BE-016-04 | Test run | AC-8, BR-3.8 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-016-05 | `Escalate_AsAgent_ReturnsForbidden` | BE-016-07 | Test run | AC-2, BR-3.2 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-016-06 | `409` from `Resolved`, from `Closed`, and from already-escalated, each with the correct `type`; and the closed-**and**-escalated case returning `errors/ticket-not-escalatable` | BE-016-08 | Test run | AC-3, AC-4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-016-07 | Each `400` variant: missing `reason`, whitespace-only, 501 characters, missing `expectedVersion`. 500 characters and 500-plus-trailing-space are accepted | BE-016-04 | Test run | AC-5 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-016-08 | All four BR-3.7 fields set, with `EscalatedAtUtc` from an injected `TimeProvider`; `401` with no token; `404` for an unknown id; `403` for an Agent with an unknown id | BE-016-09 | Test run | AC-7, AC-10, AC-11 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-016-09 | Two escalations on one `expectedVersion` give one `200` and one `409`; two concurrent escalations leave exactly one `Escalated` history row | BE-016-09 | Test run against `Testcontainers.MsSql` | AC-12, ADR-006 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-016-10 | One `Ticket.Escalated` audit row per successful escalation; **none** after a forced rollback — and no history row and no change to the ticket either | BE-016-06 | Test run | AC-13, BR-9.1, BR-9.3 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-016-11 | The `403` writes an `Auth.Forbidden` row with `Outcome` not `Success`, **outside any transaction**, and the ticket is untouched | BE-016-07 | Test run | AC-14, BR-9.2, BR-9.4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-016-12 | An Arabic `reason` round-trips byte-identical through escalate and read; an `ar` error response translates the sentence and leaves `type` and the `errors` keys byte-identical | BE-016-11 | Test run | AC-17, BR-8.7, ADR-013 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-016-13 | `canEscalate` across the matrix: role × `isEscalated` × the six statuses | BE-016-10 | Test run | AC-15 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-016-14 | The audit row's `Changes` contains `IsEscalated`, contains `Priority` only when it moved, and contains **no** reason text and nothing else sensitive | BE-016-06 | Test run and a read of the row | BR-9.7, BR-9.8 | `comprehensive-review:security-auditor` | — |

## Documentation

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| DOC-016-01 | `errors/ticket-not-escalatable` added to the type registry in `docs/sdd/documentation/api/error-handling.md`, and the endpoint listed in `documentation/api/overview.md` | BE-016-08 | Read both files | Contract, DoD | main session | — |
| DOC-016-02 | `summary.md` written: what changed, the trade-offs, the known limitations — including no de-escalation (BR-3.9) and AC-9's filter clause if `015` was dropped | All | DoD checklist | DoD | main session | — |
| DOC-016-03 | `tests.md` and `ai-notes.md` completed with **observed** output; `08-board.md` and `12-delivery-log.md` updated | DOC-016-02 | The `verify-story` gate | DoD | main session | `verify-story` |

## Review

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| REV-016-01 | Layer boundaries, correctness against every AC, scope creep. Specifically: BR-3.6 is a floor and not an assignment; no BR-3 logic in the client; `CancellationToken` on every async path; `TimeProvider` injected, never `DateTime.UtcNow` inline | All | `review.md` verdict `Approved` | DoD | `comprehensive-review:code-reviewer` | `code-review:code-review` |
| REV-016-02 | Security: the `403` path is audited, nothing sensitive in `Changes`, no reason text in a log line, no PII in the `409` bodies, no secret in the diff | BE-016-07, TEST-016-14 | `review.md` | DoD | `comprehensive-review:security-auditor` | — |
| REV-016-03 | Generated OpenAPI compared against `contracts/ticket-escalate-api.md`, field by field and status code by status code, including the five new fields on the ticket read shape | BE-016-12 | Any difference fixed in one of the two before closing | DoD | main session | — |
| REV-016-04 | Every new `en` key has an `ar` counterpart; the Arabic pass findings from `FE-016-08` are recorded and either fixed or listed as known | FE-016-08 | `review.md` | DoD | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |

## Droppable if time runs short

| Task | What is lost |
|---|---|
| FE-016-04 client-side length and empty checks | The server still returns `400` correctly; the user finds out one round trip later, with the reason they typed still in the field |
| FE-016-09 focus trap and screen-reader pass | The dialog still works with a mouse. Keyboard-only users cannot dismiss it cleanly. Drop only with the gap recorded in `tests.md` |
| BE-016-11 Arabic server messages | The English message is returned in an Arabic interface. Visible, honest, and one `.resx` entry away from fixed — unlike a wrong priority, it is not silent |
| TEST-016-13 the full `canEscalate` matrix | Reduce to the four rows that change behaviour: Manager/open, Agent/open, Manager/escalated, Manager/`Closed` |

## Not droppable

**`BE-016-02` and `TEST-016-02`.** BR-3.6 is the reason this feature exists as its own
story. An escalation that assigns `High` instead of raising to a floor of `High`
**downgrades a `Critical` ticket** — no exception, no failed request, no log line, and the
ticket that most needed attention becomes less visible because someone escalated it.
`docs/sdd/testing/test-strategy.md` already names this as the rule most likely to be
implemented wrongly, which means it will be read as the test of whether this codebase
reads its own rules.

**`TEST-016-04`.** The `Critical`-produces-one-history-row assertion is the only thing that
catches an unconditional `PriorityChanged` write, and that row is what a reviewer reads to
decide whether the floor was implemented correctly. A false history row is worse than a
missing one.

**`BE-016-06` and `BE-016-07`.** An audit row added after the handler exists is an audit
row with an invisible hole, and NFR-10's architecture test fails the build without
`IAuditableCommand`. `BE-016-07` is the half that is easy to miss: the policy denies at the
boundary, so the MediatR pipeline never opens and a pipeline-only audit mechanism records
nothing — for the one endpoint whose entire authorization story is "only a Manager may
call this".

**`BE-016-10`.** Without `canEscalate` on the read shape, the client has to derive BR-3
from `status`, `isEscalated`, and the role. That is the rule re-implemented in TypeScript,
and it drifts into a menu item that produces a `403` for something the interface offered.
