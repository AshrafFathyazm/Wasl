# 003 — Task Breakdown

**Phase:** 0 · **Role:** Story Planner · **Skill:** `speckit-tasks`

Every task has one owner, one verification, and something it serves. A task that cannot be
verified on its own is too big and is split.

Agents named here are **not dispatched until the plan is approved**. Naming is the plan;
dispatching without recording the result in `ai-notes.md` is what turns evidence back into a
claim.

## Critical path

```text
BE-003-01 → BE-003-04 → BE-003-05 → BE-003-08 → BE-003-11 → BE-003-12 → BE-003-13
   → BE-003-14 → TEST-003-08 → TEST-003-09 → TEST-003-10 → TEST-003-12 → DOC-003-03
```

Everything else hardens it. `TEST-003-10` and `TEST-003-12` are on the critical path rather
than after it: they are the two halves of BR-9.4, and a pipeline that passes `TEST-003-09`
while failing either of them is worse than no pipeline, because it looks finished.

## Backend

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| BE-003-01 | `AuditEntry`, `AuditOutcome`, `AuditTarget`, `AuditFieldChange` exist in `Wasl.Domain/Audit/` with private setters and one factory | — | `dotnet build`, and `TEST-001-01` still green — the domain gained no package reference | BR-9.6, ADR-010 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-003-02 | `AuditRedaction` implements the BR-9.7 deny-list with case-insensitive **exact** name matching plus the entity-qualified `TicketComments.Body` | BE-003-01 | `dotnet test tests/Wasl.Domain.Tests --filter AuditRedaction` | AC-17, BR-9.7 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` + `superpowers:test-driven-development` |
| BE-003-03 | `ICommand` and `IAuditableCommand<TResponse>` exist in `Common/Messaging/`; the latter declares `AuditAction` and `DescribeTarget(TResponse?)` | BE-003-01 | `dotnet build` | NFR-10, AC-14 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-003-04 | `AuditEntryConfiguration` + `DbSet<AuditEntry> AuditLog`; migration `AddAuditLog` creates the table, `CK_AuditLog_ChangesIsJson`, and all four indexes | BE-003-01 | `dotnet ef migrations add AddAuditLog` then `dotnet ef database update`; the generated SQL matches `data-model.md` column for column | AC-1, AC-3, AC-4, AC-5 | `voltagent-lang:sql-pro` | — |
| BE-003-05 | The same migration creates the `wasl_app` role idempotently and applies `GRANT INSERT, SELECT` / `DENY UPDATE, DELETE` | BE-003-04 | `dotnet ef database update` twice — second run applies nothing, exits 0; then `SELECT * FROM sys.database_permissions` shows one `DENY` for `UPDATE` and one for `DELETE` | AC-12, BR-9.5 | `voltagent-lang:sql-pro` | — |
| BE-003-06 | `ConnectionStrings:Migrations` (owner) and `ConnectionStrings:Default` (member of `wasl_app`) exist as placeholders only; `AddDbContextFactory<WaslDbContext>` registered | BE-003-05 | `git grep -iE "password|Pwd=" -- src/` returns only placeholders; the API starts on the least-privileged string | AC-13, A-7 | `comprehensive-review:security-auditor` | — |
| BE-003-07 | `ICurrentActor`, `HttpContextCurrentActor`, `ActorClaimTypes`; all values null when unauthenticated | BE-003-01 | An integration write with no token produces a row with null `ActorUserId`, `ActorEmail`, `ActorRole` | BR-9.6, edge case | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-003-08 | `AuditDiffAccumulator` (scoped) and `AuditDiffInterceptor` capture `Added`/`Modified`/`Deleted` property diffs **before** `SaveChanges` accepts them, excluding `AuditEntry`, merging across multiple saves | BE-003-04 | A probe that calls `SaveChanges` twice yields one merged `Changes` document, asserted on content | AC-18, AC-25, BR-9.8 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-003-09 | `AuditChangeSerializer` produces the `data-model.md` shape: ordered by entity → id → field, redaction applied, empty diff serialised as `null` and never `[]` | BE-003-02, BE-003-08 | Two runs of one probe produce byte-identical `Changes`; a no-op write produces `NULL` | AC-19, AC-17, AC-18 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-003-10 | `AuditOutcomeClassifier` maps a `forbidden`-coded `DomainException` (`002`) → `Denied`, any other exception → `Failed`, request-token cancellation → not audited | BE-003-01, `002` | Unit-level table of exception → outcome, asserted per row | AC-8, AC-9, Q-4, Q-5 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-003-11 | `AuditWriter`: `WriteInTransactionAsync` uses the request `DbContext`; `WriteIndependentAsync` uses `IDbContextFactory` with `CancellationToken.None`, catches its own failure, logs in English, and rethrows nothing | BE-003-06, BE-003-09 | A `Failed` probe run with a pre-cancelled request token still leaves exactly one row | AC-8, AC-9, AC-10, AC-11 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` + `superpowers:test-driven-development` |
| BE-003-12 | `TransactionBehavior` opens one transaction per `ICommand` request, commits on success, rolls back on exception, and does **not** run for queries | BE-003-03 | A query probe observes `Database.CurrentTransaction == null`; a command probe observes it non-null | AC-16, BR-9.3 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-003-13 | `AuditBehavior` composes the row from the command, the actor, `TimeProvider`, `002`'s `TraceContext` accessor, and the serializer; writes in-transaction on success and independently on failure; rethrows the original exception | BE-003-07, BE-003-10, BE-003-11, BE-003-12 | `TEST-003-09` through `TEST-003-15` all green | AC-6..AC-11, AC-20..AC-23 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` + `superpowers:test-driven-development` |
| BE-003-14 | `Program.cs` registers the behaviours in one place, in the order `Validation → Transaction → Audit`, against a single ordered list that the order test reads | BE-003-12, BE-003-13 | `TEST-003-05` green; reordering the list by hand turns it red | AC-15 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |

## Frontend

**None.** No screen, no route, no component, no i18n key — every audit-log screen belongs to
`019-audit-log-access`. See [`frontend-spec.md`](frontend-spec.md).

Recorded rather than omitted, so the empty lane is visibly a decision.

## Tests

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| TEST-003-01 | `AuditRedactionTests`: every deny-list entry redacted, `TicketComments.Body` redacted, and the near-misses `TokenCount` / `SecretaryName` **not** redacted | BE-003-02 | `dotnet test tests/Wasl.Domain.Tests` | AC-17, BR-9.7 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-003-02 | `AuditEntryTests`: missing `Action`, `Outcome`, or `TraceId` rejected; a 500-character `UserAgent` truncated to 400 rather than throwing | BE-003-01 | `dotnet test tests/Wasl.Domain.Tests` | Edge cases | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-003-03 | `CommandAuditScanner` plus the NFR-10 rule test: no type in `Wasl.Api` implements `ICommand` without `IAuditableCommand`. Runs with **no fixture**, so it needs no container | BE-003-03 | `dotnet test tests/Wasl.Api.IntegrationTests --filter CommandsAreAuditable` with Docker stopped | AC-14a, NFR-10 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-003-04 | The scanner self-test: run the scanner over `UnauditableProbeCommand` and assert it is reported. This is what proves TEST-003-03 can fail at all | TEST-003-03 | Delete the violator type and watch the self-test go red | AC-14b, A-5 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-003-05 | `PipelineOrderTests`: the resolved `IPipelineBehavior` sequence equals the declared list, and the audit behaviour resolves for a command and **not** for a query — which also settles assumption A-3 | BE-003-14 | `dotnet test --filter PipelineOrderTests`; if the constrained generic does not resolve, apply the `research.md` R-3 fallback and re-run | AC-15, A-3 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-003-06 | `DatabaseFixture` provisions a least-privileged login per run (generated password, never committed), adds it to `wasl_app`, and `WaslApiFactory` points the API under test at it | BE-003-06 | The suite runs green; `git grep` finds no password; the API's own connection reports `IS_SRVROLEMEMBER('sysadmin') = 0` | AC-13, A-8 | `voltagent-lang:sql-pro` | — |
| TEST-003-07 | `AuditSchemaTests`: columns and types from `INFORMATION_SCHEMA.COLUMNS`; `sys.foreign_keys` count is 0; four indexes present; `IX_AuditLog_NotSuccess.filter_definition` is not null; no `rowversion` column; a non-JSON `Changes` insert is rejected | BE-003-05 | `dotnet test --filter AuditSchema` | AC-1..AC-5 | `voltagent-lang:sql-pro` | — |
| TEST-003-08 | The probe commands and `POST /__test/probe` exist in the test project only, registered on the test host; MediatR discovers handlers in both assemblies | BE-003-14 | `git grep -rn "__test" src/` returns nothing; the probe returns 200 through the real pipeline | Exit condition, `specs/README.md` | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-003-09 | One successful probe writes **exactly one** row with `Outcome = 'Success'`; `COUNT(*)` asserted as `1`, not `> 0` | TEST-003-08 | `dotnet test --filter AuditSuccessPath` | AC-6, AC-25, BR-9.1 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-003-10 | A rolled-back transaction leaves **neither** the business row nor the audit row | TEST-003-08 | Test run: probe mutates, forces rollback, both `COUNT(*)` are 0 | AC-6, BR-9.3 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-003-11 | An audit insert that violates `CK_AuditLog_ChangesIsJson` prevents the business change from committing | TEST-003-10 | Test run with a serializer stub emitting `"not json"`; the customer row is absent afterwards | AC-7 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-003-12 | A **denied** probe writes exactly one `Denied` row and that row **survives** the rollback of the business transaction | TEST-003-08, `002` | Test run: `403` returned, business change absent, one `Denied` row present | AC-8, BR-9.4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-003-13 | A probe that mutates and then throws leaves one `Failed` row and no business change | TEST-003-08 | Test run | AC-9, BR-9.4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-003-14 | The independent write survives a cancelled request token | TEST-003-13 | Test run with a token cancelled before the throw; one `Failed` row still present | AC-10 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-003-15 | An independent write that itself fails does not mask the original exception, and logs in English | TEST-003-13 | Test run with the factory pointed at a dead connection; the response is the original error, and the log line is English | AC-11, BR-9.10 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-003-16 | `AuditPermissionTests`: on the application's own connection, `INSERT` and `SELECT` succeed; `UPDATE` and `DELETE` fail with error 229; `IS_SRVROLEMEMBER('sysadmin')`, `IS_ROLEMEMBER('db_owner')`, and `HAS_PERMS_BY_NAME(...,'UPDATE')` all return 0 | TEST-003-06 | `dotnet test --filter AuditPermission` | AC-12, AC-13, BR-9.5 | `voltagent-lang:sql-pro` | — |
| TEST-003-17 | A query probe opens no transaction and writes no audit row | TEST-003-08 | Test run asserting `Database.CurrentTransaction == null` and `COUNT(*) = 0` | AC-16, Q-2 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-003-18 | A probe changing a `PasswordHash`-named field stores `"[redacted]"` for both values, and the real value appears nowhere in the row | TEST-003-09 | Test run asserting the row's full text does not contain the secret literal | AC-17, BR-9.7 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-003-19 | A write that sets a property to the value it already had produces no entry for it; two identical runs produce byte-identical `Changes` | TEST-003-09 | Test run comparing `Changes` strings directly | AC-18, AC-19, BR-9.8 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-003-20 | Changing the stubbed `ICurrentActor`'s role after the write does not change the stored `ActorRole` | TEST-003-09 | Test run | AC-20, BR-9.6 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-003-21 | `TraceId` on the row is byte-identical to `traceId` in the `ProblemDetails` body of the same failed request | TEST-003-13, `002` | Test run reading the response body and the row | AC-21, BR-9.9 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-003-22 | The same probe with `Accept-Language: ar` produces a row whose `Action`, `EntityType`, `Outcome`, and `Changes` are byte-identical to the `en` run | TEST-003-09 | Test run comparing the two rows field by field | AC-22, BR-9.10 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-003-23 | `OccurredAtUtc` equals a fake `TimeProvider`'s value and reads back with `DateTimeKind.Utc` | TEST-003-09 | Test run with a fake clock set to a fixed instant | AC-23 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-003-24 | Arabic text in a changed field round-trips byte-identical through `Changes` | TEST-003-09 | Test run — `varchar(max)` would return `????` | AC-24, ADR-013 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |

## Documentation

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| DOC-003-01 | `docs/sdd/documentation/development/setup.md` records the two connection strings, how the `wasl_app` login is created locally, and why the application must not run as `sa` | BE-003-06 | Follow it on a clean database and confirm the API starts and `AC-13` holds | AC-13, NFR-7 | main session | — |
| DOC-003-02 | Each SQL query in `contracts/README.md` runs against the real table and returns rows for seeded probe data | TEST-003-09 | Paste each query into `sqlcmd` and record the output | FR-6.7 | main session | — |
| DOC-003-03 | `tests.md` and `ai-notes.md` completed with **observed** output; board and delivery log updated | All | The `verify-story` gate | DoD | main session | `verify-story` |

## Review

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| REV-003-01 | Layer boundaries, `CancellationToken` threading — including the one deliberate `CancellationToken.None` and its written reason — and the behaviour order reviewed; verdict recorded | All BE, all TEST | `review.md` verdict is `Approved` | DoD | `comprehensive-review:code-reviewer` | `code-review:code-review` |
| REV-003-02 | Security review: the `DENY` is effective on the connection the application actually uses, no generated password is committed, and nothing in `Changes` is sensitive | TEST-003-16, TEST-003-18 | `review.md` names the query it ran for each of the three | BR-9.5, BR-9.7 | `comprehensive-review:security-auditor` | — |
| REV-003-03 | The generated OpenAPI document is **unchanged** — this feature adds no endpoint, and `/__test/probe` does not appear | BE-003-14 | Diff the generated document against `002`'s; any new path is a defect | Contract changes: none | main session | — |

## Droppable if time runs short

| Task | What is lost |
|---|---|
| TEST-003-22 (Arabic locale produces an identical row) | BR-9.10 goes unproven until `005` lands localization and gives the test something that could actually differ. Lowest cost to defer, because before `005` there is no localization to leak into a row |
| TEST-003-24 (Arabic text through `Changes`) | Covered in spirit by `001` TEST-001-04, which proves `nvarchar` round-trips on `Customers.FullName`. `Changes` is `nvarchar(max)`, a different type, so this is a real gap — but a narrow one |
| DOC-003-02 (running each documented SQL query) | The queries stay plausible rather than verified. Drop only with the note that `019` will find any error the moment it needs them |
| TEST-003-19's determinism half | Ordering still exists in the code; what is lost is the guarantee that a future refactor cannot make `Changes` unstable, which turns every content assertion flaky later |

**Not droppable:** TEST-003-10 and TEST-003-12. They are the two halves of BR-9.4, and both
failure modes are silent — the first leaves rows describing changes that never happened, the
second loses exactly the rows an incident investigation looks for. A green suite without them
is a claim, not evidence.

**Not droppable:** TEST-003-03 **with** TEST-003-04. The rule test alone passes on an empty
population at this phase and therefore proves nothing (`research.md` R-5). Shipping (a)
without (b) would leave a test named after NFR-10 that cannot fail — worse than having
neither, because it would be believed.

**Not droppable:** BE-003-05 and TEST-003-16. `DENY` is what makes BR-9.5 a property of the
database rather than of everyone remembering. Without the test on the application's own
connection, the `DENY` may be applied to a principal it cannot restrict, and every other test
still passes.

**Not droppable:** BE-003-06. The two connection strings are the only reason the `DENY` means
anything. Collapsing them back to one `sa` string turns AC-12 into a test that proves nothing
about how the application actually connects.
