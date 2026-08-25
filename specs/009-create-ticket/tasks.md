# 009 — Task Breakdown

**Phase:** 2 · **Story:** US-005 · **Feature:** `009-create-ticket` ·
**Status:** Reconciled and implemented 2026-08-26

Agents are **named** here and **not dispatched until the plan is approved**. Naming is
part of the plan; dispatching is not. **No subagent was dispatched for this feature** — see
`ai-notes.md`.

## The split — what ran, what moved, what is owned elsewhere

Decided 2026-08-25/26 by the product owner; the reasoning is in `spec.md`'s split note.

### Moved **into** `009`

| Task | From | Why |
|---|---|---|
| `TicketStatusTransitions` + **all 36 transition tests** | `012` | AC-10 returns `allowedTransitions`, and `CLAUDE.md` allows the map to exist once. Shipping it with 35 unverified cells would put an untested rule behind an API the screen renders buttons from |
| `GET /api/tickets/{id}` | `010` | The frozen contract promises `Location` resolves and `TEST-009-03` fetches from it. `010` lands after `012`, so the alternative was a `201` whose `Location` returned `404` for the whole demo |

`012` keeps `PUT /status` and optimistic concurrency. `010` keeps the list and both screens.

### Deferred, with the owner named

| Task / AC | Owner | Why |
|---|---|---|
| AC-12, AC-13 · `BE-009-10` (the `Auth.Unauthenticated` row) · `TEST-009-09`, `TEST-009-11` | **`004-auth-and-roles`** | `009` ships without authentication: `004` comes after this feature *and* after `012` in the plan. `createdByUserId` stays in the response as `null`, nullable in the DTO — removing a field and adding it back is a breaking change for a client, a null it handles from day one is not. The frozen contract does not change |
| The four foreign keys to `dbo.SupportUsers` | **`004`** | That table does not exist. `data-model.md` claimed `001` had created it; `001` created `Customers` alone |
| AC-14, AC-15 · all `FE-009-*` | **`024-frontend-create-ticket-form`** | `src/wasl-web/` belongs to the parallel frontend lane. `009` closes as a complete backend feature, which is the mechanism `CLAUDE.md` describes — the contract is frozen and `FRONTEND-API-GUIDE.md` is its input. **Not `023`**: that folder is the frontend *foundation*, and a feature screen there would make it grow with every screen and lose its definition of done |
| `REV-009-03` — OpenAPI compared against the contract | **`002b`** | Swashbuckle is `002b`. Until then the comparison is manual, and `tests.md` records it as such rather than as passing |

### What ran

Everything else. The backend end to end: the domain types and the BR-1 map, the sequence, the
migration, the command with its validator and handler, `POST /api/tickets`,
`GET /api/tickets/{id}`, and the tests for all of it.

**Budget.** `docs/sdd/16-three-day-plan.md` allotted 50 minutes to Session 1 item 6. With the
two moved items, `TicketHistory`, and the sequence it is closer to two hours — amended in that
file rather than absorbed, and Session 2 item 1 struck through because it moved here.

### What this migration changed

| Change | Reason |
|---|---|
| Every ID renumbered `BE-005-nn` → `BE-009-nn`, and every `Depends on` updated with it | The ID says which folder the task lives in (`specs/README.md`) |
| `Agent` and `Skill` columns added to every row | Who does what is part of the plan, not a decision made in the moment |
| `BE-009-09` and `BE-009-10` added — the audit obligation | The original predates ADR-008, so **no task carried it**, and `NFR-10`'s architecture test (every `ICommand` implements `IAuditableCommand`) would have failed the build on the first commit of `CreateTicketCommand`. That prediction was correct and `003` built the scanner; `CreateTicketCommand` is its first real population. `BE-009-10` exists because BR-9.2 and BR-9.4 make the `401` row a *separate* mechanism, written outside any transaction — and it is `004`'s, because there is no `401` to record yet |
| `FE-009-00` added — screen preview before any wiring | Rendering a screen costs minutes; changing one that already has tests, translation keys and query wiring costs hours (ADR-009, `docs/sdd/design/preview-first-workflow.md`) |
| `FE-009-01` split into a provisional-types task and `FE-009-05`, the swap to generated types | The frontend lane starts from the frozen contract and does not wait for `BE-009-08`. The swap is a deliberate task rather than something to forget (ADR-011 §6) |
| `FE-009-06` added — the Arabic and accessibility pass | A DoD gate with no task is a gate nobody owns |
| `TEST-009-10` … `TEST-009-12` added | Audit in-transaction, the `401` row, and an Arabic subject round-tripping byte-identical through `nvarchar` (ADR-013 row 4 — `varchar` yields `????` and reads as a font bug) |
| A `Review` section added, including `REV-009-03` | The generated OpenAPI is compared against `contracts/tickets-api.md`; a difference is a defect in one of the two |
| **Paths corrected again, 2026-08-26** | The previous correction targeted ADR-010's two projects and minimal APIs. **ADR-010 is rejected** — four-project Clean stands (ADR-002), so `src/Wasl.Application/Features/Tickets/…` and `src/Wasl.Infrastructure/Persistence/…` are exactly where these files go, and the endpoint is a **controller** (`CLAUDE.md`), not a minimal API |
| Verification for the indexes rewritten | `psql \d+` became a `sys.indexes` query, and the count was made per-table — four indexes on `dbo.Tickets` plus its primary key, one on `dbo.TicketHistory` (ADR-013) |

## Critical path

```text
BE-009-01 → BE-009-02 → BE-009-03 → BE-009-05 → BE-009-06 → FE-009-03
```

Everything else improves the story. These make it exist.

## Backend

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| BE-009-01 | `Ticket` aggregate, `TicketHistory`, `TicketNumber`, and the enums in `Wasl.Domain` — zero package references | `007` | `dotnet build`; the ADR-010 architecture test still passes | AC-2 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-009-02 | `Ticket.Create` sets `New`, leaves the assignee null, and appends the `Created` history row | BE-009-01 | Unit test asserting all three | AC-2, AC-9, BR-1.1, BR-1.8 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-009-03 | Migration `AddTicketsAndHistory`: both tables, `CREATE SEQUENCE dbo.TicketNumberSeq AS bigint START WITH 1 INCREMENT BY 1`, `rowversion`, all six foreign keys `NO ACTION` except `TicketHistory → Tickets`, and the five indexes | BE-009-02 | `dotnet ef database update` on a clean database, then `SELECT name, is_unique, filter_definition FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.Tickets')` — four indexes plus the primary key, `UX_Tickets_Number` unique; and the same query against `dbo.TicketHistory` for `IX_TicketHistory_Ticket_Time` | AC-3 | `voltagent-lang:sql-pro` | works from `data-model.md` |
| BE-009-04 | `TicketNumberSequence` reads the sequence and `TicketNumber.Format` produces `TCK-{yyyy}-{000000}` | BE-009-03 | Unit test on the formatting; integration test on the sequence read | AC-3 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-009-05 | `CreateTicketCommand`, handler, and FluentValidation validator in one slice folder; an unknown `customerId` yields `404 errors/not-found` naming `customerId`, never `500` | BE-009-02 | Unit tests on the validator, integration tests on the handler | AC-4 – AC-8 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-009-06 | `POST /api/tickets` minimal-API endpoint returns `201` with a correct `Location` and `allowedTransitions: ["Open","Closed"]` | BE-009-05 | Integration test asserting the header, then a `GET` on it | AC-1, AC-10 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-009-07 | `createdByUserId` is read from the token and any body value ignored | BE-009-06 | Integration test supplying a false id in the body and asserting the persisted row | AC-12 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-009-08 | OpenAPI metadata declares `201`, `400`, `401`, `404`, and every enum's value list | BE-009-06 | `/swagger` inspected, then compared against `contracts/tickets-api.md` | Contract | `voltagent-lang:dotnet-core-expert` | — |
| BE-009-09 | `CreateTicketCommand` implements `IAuditableCommand` with action `Ticket.Created`; the row is written by the pipeline behaviour in the **same transaction** as the insert, with `EntityLabel` = the `TicketNumber` and no `Description` in `Changes` | `003`, BE-009-05 | Integration test asserting one audit row on success and **none** after a forced rollback | BR-9.1, BR-9.3, BR-9.7 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-009-10 | A `401` on this endpoint writes `Auth.Unauthenticated` with outcome `Denied`, **outside** any transaction | `003`, `004`, BE-009-06 | Integration test asserting the row exists after an unauthenticated call | BR-9.2, BR-9.4 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |

`BE-009-09` and `BE-009-10` are new in this migration, and the asymmetry between them is
the point: the success row must vanish with a rollback, and the denial row must survive
one. A single mechanism cannot do both, which is why BR-9.3 and BR-9.4 are separate
rules and why they are separate tasks.

## Frontend

Starts as soon as [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md) exists. It does not
wait for `BE-009-06`.

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| FE-009-00 | Screen preview: real tokens, real copy, plausible data lengths, every state including *no customer selected*, both languages. **Approved before any wiring** | `006` | Rendered and reviewed (Phase 3b) | AC-14, AC-15 | `ui-ux-pro-max:ui-styling` | `frontend-design` |
| FE-009-01 | Provisional request/response types, the Zod schema, and enum constants, all from the frozen contract and marked provisional | Contract frozen | `npm run typecheck` | AC-5, AC-15 | `voltagent-lang:typescript-pro` | — |
| FE-009-02 | `CustomerPicker` with debounced search (≥2 chars, 300ms) and single selection; the ticket section is disabled with an explanation until a customer is chosen, not hidden | `008` list endpoint, FE-009-01 | Component test plus a manual run | AC-14 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-009-03 | `TicketForm` submits and navigates to the created ticket using the `Location` header; the toast carries the `TicketNumber` | FE-009-01, FE-009-02, BE-009-06 | Manual run against the API | AC-1, AC-15 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-009-04 | Validation, submitting, `400` field-level, `404` customer-gone, and `401` states; submit disabled while pending so a double-click sends one request | FE-009-03 | Component tests, one per state | AC-15 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-009-05 | Provisional types and enum constants replaced with types generated from the OpenAPI document | BE-009-08 | `npm run typecheck` after regeneration | ADR-011 §6 | `voltagent-lang:typescript-pro` | — |
| FE-009-06 | Every string from a catalogue, present in `en` and `ar`; the screen walked in Arabic; keyboard reachable with a visible focus ring; the counter and the select chevron on the inline-end | `005`, FE-009-04 | Key-parity test, plus the Arabic pass recorded in `tests.md` | BR-8.8, BR-8.11, BR-8.13 | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |

## Tests

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| TEST-009-01 | Unit: initial status `New`, null assignee, and the `Created` history row | BE-009-02 | Test run | AC-2, AC-9 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-009-02 | Unit: ticket number formatting, including the six-digit pad and the year boundary | BE-009-04 | Test run | AC-3 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-009-03 | Integration: happy path, then a `GET` on the `Location` returns the same ticket | BE-009-06 | Test run | AC-1 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-009-04 | Integration: missing `customerId` is `400`, unknown `customerId` is `404`, malformed `Guid` is `400` — none is a `500` | BE-009-05 | Test run | AC-4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-009-05 | Integration: each `400` variant — invalid enum listing the accepted values, over-length and whitespace-only `subject` and `description` | BE-009-05 | Test run | AC-5 – AC-7 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-009-06 | Integration: `priority` defaults to `Normal` when omitted | BE-009-05 | Test run | AC-8 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-009-07 | Integration: the `Created` history row is persisted with the ticket and has the same `PerformedAtUtc` source | BE-009-06 | Test run | AC-9, BR-1.8 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-009-08 | Integration: two concurrent creations produce two distinct ticket numbers | BE-009-04 | Test run against `Testcontainers.MsSql` | AC-11 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-009-09 | Integration: `401` without a token | BE-009-06 | Test run | AC-13 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-009-10 | Integration: exactly one `Ticket.Created` audit row per success; **none** after a forced rollback; no `Description` anywhere in `Changes` | BE-009-09 | Test run | BR-9.1, BR-9.3, BR-9.7 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-009-11 | Integration: the `401` writes `Auth.Unauthenticated` and the row survives, because it was never in a transaction | BE-009-10 | Test run | BR-9.2, BR-9.4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-009-12 | Integration: an Arabic `subject` and `description` round-trip byte-identical through create and read; `ticketNumber` comes back in Latin digits under `Accept-Language: ar` | BE-009-06 | Test run | ADR-013, BR-8.13 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-009-13 | The `404` body names no customer detail beyond the id that was sent | BE-009-05 | Test run | BR-9.7, NFR-4 | `comprehensive-review:security-auditor` | — |

## Documentation

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| DOC-009-01 | `docs/sdd/documentation/api/` lists `POST /api/tickets` with every status code | BE-009-08 | Read it | DoD | main session | — |
| DOC-009-02 | `docs/sdd/03-domain-model.md` confirmed to match the generated migration — types, index names, delete behaviour | BE-009-03 | Compare, and correct the document if they differ | DoD | main session | — |
| DOC-009-03 | `summary.md` written: what changed, trade-offs, known limitations | All | DoD checklist | DoD | main session | — |
| DOC-009-04 | `tests.md` and `ai-notes.md` completed with **observed** output; board and delivery log updated | DOC-009-03 | The `verify-story` gate | DoD | main session | `verify-story` |

## Review

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| REV-009-01 | Layer boundaries (`Wasl.Domain` still has zero package references), correctness against every AC, `CancellationToken` on every async path, no scope creep | All | `review.md` verdict `Approved` | DoD | `comprehensive-review:code-reviewer` | `code-review:code-review` |
| REV-009-02 | Security: `createdByUserId` cannot be spoofed, the `404` leaks nothing, no user free text in the audit `Changes`, no PII in logs | BE-009-07, BE-009-09 | `review.md` | DoD | `comprehensive-review:security-auditor` | — |
| REV-009-03 | Generated OpenAPI compared against `contracts/tickets-api.md` — paths, status codes, every `ProblemDetails.type`, and every enum value list | BE-009-08 | Any difference fixed in one of the two before closing, and recorded under **Contract changes** in `plan.md` | DoD | main session | — |
| REV-009-04 | The approved `FE-009-00` preview compared against the built screen; any divergence recorded with a reason | FE-009-04 | `frontend.md` | DoD | `ui-ux-pro-max:ui-styling` | `frontend-design` |

## Droppable if time runs short

| Task | What is lost |
|---|---|
| `FE-009-02` debounced search in the picker | Falls back to a plain select of recent customers; fine for a demo, poor at scale. AC-14 degrades to "cannot submit without a selection", which still holds |
| `TEST-009-08` concurrency test | Weakens the AC-11 evidence, though the sequence still guarantees it. Drop the *test*, never the sequence |
| `TEST-009-12` Arabic round-trip | The column type is still `nvarchar`; what is lost is the proof. Drop last of the three, because the failure it catches looks like a font problem and would otherwise survive review |
| `FE-009-05` swap to generated types | The provisional types stay, and a contract change becomes a runtime surprise rather than a compile error. Record it if dropped |

## Not droppable

| Task | Why |
|---|---|
| `BE-009-02` | If the `Created` history row is not written by the factory, every later ticket feature inherits an audit trail with a hole at its start — and nothing announces it |
| `BE-009-03` | Without the sequence there is no unique number, and AC-3 and AC-11 cannot pass at all |
| `BE-009-09` | An audit row added after the handler exists is an audit row with an invisible hole, and `NFR-10`'s architecture test fails the build without `IAuditableCommand` |
| `FE-009-00` | The gate exists because reordering a wired, tested, translated screen costs hours. Skipping the preview is how that bill is incurred |
