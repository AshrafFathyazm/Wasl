# 003 — Audit Trail

**Phase:** 0 · Foundation · **Story:** — (infrastructure, not a user story) ·
**Status:** Specified, awaiting review

## Understanding

BR-9 is a set of rules that every future mutation must obey. There are two ways to make
that true: write it in a document and hope, or make the pipeline do it. This feature does
the second one, and it does it now because an audit log added after the handlers exist has
invisible holes — nobody can tell by looking at a passing test suite that one of eleven
commands never wrote a row.

Three things are made structural here, and each replaces a thing a developer would
otherwise have to remember:

| Remembered discipline | Replaced by |
|---|---|
| "write an audit row in this handler" | `AuditBehavior`, a MediatR pipeline behaviour that runs for every `IAuditableCommand` |
| "open a transaction so the audit row and the change commit together" (BR-9.3) | `TransactionBehavior`, one transaction per request, opened outside the handler |
| "declare an audit action on the new command" (NFR-10) | An architecture test that fails the build when a type implements `ICommand` without `IAuditableCommand` |

And one thing is made the database's problem rather than the application's: BR-9.5.
`DENY UPDATE, DELETE ON dbo.AuditLog` cannot be forgotten by a future developer, because
it does not depend on them knowing about it.

**The part to read twice is BR-9.4.** A successful mutation's audit row is written *inside*
the business transaction, so a rollback takes it with it. A denied or failed action has no
business transaction to join and is written *independently*, on its own connection, so it
survives the rollback of the thing that failed. Both halves are invisible when wrong: the
first fails by leaving orphan rows describing changes that never happened, the second fails
by silently losing exactly the rows an incident investigation is looking for. AC-6, AC-8,
and AC-9 exist for that asymmetry and nothing else.

This feature has **no HTTP surface and no UI**. It is the mechanism, not a view of it.

## In scope

- `dbo.AuditLog` exactly as `docs/sdd/03-domain-model.md` specifies it: `bigint IDENTITY(1,1)`
  primary key, **no foreign keys at all** (BR-9.12, ADR-008), actor email and role
  snapshotted onto the row (BR-9.6), `nvarchar(max)` + `CHECK (ISJSON(...))` for `Changes`,
  and the four indexes including the filtered one on `Outcome <> 'Success'`
- `AuditEntry` in `Wasl.Domain/Audit/` — the entity, immutable after construction
- `ICommand` and `IAuditableCommand` marker interfaces (`docs/sdd/02-architecture.md`,
  *Audit and history*)
- `AuditBehavior` — composes and writes the row for every `IAuditableCommand`, on both the
  success and the failure path, with the BR-9.4 asymmetry
- `TransactionBehavior` — one explicit transaction per state-changing request, opened by the
  pipeline, so BR-9.3 is a property of the pipeline (ADR-010, *Supporting decisions*)
- `AuditDiffInterceptor` — captures the field-level diff from the EF change tracker before
  `SaveChanges` accepts it, so BR-9.8 records what actually changed
- Redaction (BR-9.7), as a pure function in `Wasl.Domain/Audit/` with a unit test
- `ICurrentActor` — the actor snapshot source, anonymous until `004` populates it
- The architecture test for NFR-10, **plus a self-test proving the scanner bites** — see
  AC-14 and A-5
- The database role `wasl_app` with `GRANT INSERT, SELECT` and `DENY UPDATE, DELETE`
  (BR-9.5), and a second, least-privileged connection string for the running application
- Migration `AddAuditLog`

## Out of scope

| Excluded | Where it lives |
|---|---|
| Any endpoint that reads the audit log | `019-audit-log-access` (US-015, FR-6.7). Until then the log is queried with SQL — the four queries are in [`contracts/README.md`](contracts/README.md) |
| Auditing the read of the audit log as `Audit.Read` (BR-9.11) | `019` — there is nothing to read yet |
| Retention and purge | Open question **Q-9** in `docs/sdd/11-open-questions.md`. Not an engineering decision; see Q-1 below |
| Auditing reads of customer data | Open question **Q-10**. Working assumption: writes and auth events only |
| `Auth.LoginSucceeded`, `Auth.LoginFailed`, `Auth.Forbidden`, `Auth.Unauthenticated` rows (BR-9.2) | `004-auth-and-roles`. A `401`/`403` rejected by middleware never reaches MediatR, so a pipeline behaviour cannot see it. `003` provides `IAuditWriter.WriteIndependentAsync`; `004` calls it from the auth pipeline |
| The BR-9.6 test that promotes a real user and checks past rows | `004`, which owns `SupportUsers` and tokens. `003` proves the copy-at-write mechanism with a stubbed `ICurrentActor` — AC-20 |
| `ValidationBehavior` and the `ProblemDetails` middleware | `002-error-contract`. `003` requires both and asserts the registration order (AC-15); it does not create them |
| `TicketHistory` | `009-create-ticket`. It is a product projection, not the audit log — ADR-008 |
| Real audit actions for customers and tickets | `007`, `009`, `011`, `012`, `013`. Each declares its own `Action` string from the naming table in `docs/sdd/04-business-rules.md` |
| A frontend of any kind | `019`. See [`frontend-spec.md`](frontend-spec.md) |

**Why the table lands with no production consumer.** The exit condition in
`specs/README.md` for this feature is *"one command produces one audit row in the same
transaction"*. At Phase 0 there are no production commands — `001` ships only `/health`,
`002` ships error mapping, and the first real command is `004`'s sign-in. So the one
consumer here is a **probe command defined in the integration test assembly**, dispatched
through a test-host-only endpoint. That is the honest reading of "cheapest moment": the
mechanism is proven against something real before there are seven handlers to retrofit,
and the probe is deleted by nothing because it never existed in `Wasl.Api`. The
consequence for NFR-10 is real and is handled — see A-5 and AC-14.

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | The actor's identity is readable from `ClaimsPrincipal` via `ClaimTypes.NameIdentifier`, `ClaimTypes.Email`, and `ClaimTypes.Role` | `004` owns the token shape and may name claims differently. One file changes — `HttpContextCurrentActor.cs` — and `ActorClaimTypes.cs` is where the names live so it is one edit, not a search |
| A-2 | `TraceId` is read from `002`'s single accessor (`Common/Errors/TraceContext.cs`) — **not** re-derived from `Activity.Current` here. `002` A-3 already handles the fallback to `HttpContext.TraceIdentifier` | BR-9.9 is satisfied by the response, the log scope, and this row reading the *same* accessor; three callers each doing the obvious thing is how they diverge. If `003` derived its own value, AC-21 would fail intermittently — only when `Activity.Current` happened to be null — which is the worst possible failure schedule |
| A-3 | MediatR resolves **constrained** open-generic pipeline behaviours, so `AuditBehavior<TRequest, TResponse> where TRequest : IAuditableCommand<TResponse>` applies only to auditable commands | Fall back to one unconstrained behaviour with a runtime `is IAuditableCommand` check. Same semantics, less compile-time help. `research.md` R-3 carries the verification command; this is verified before `BE-003-05` is written, not after |
| A-4 | No handler dispatches another `ICommand` through MediatR — commands are not nested | Two rows for one request, which breaks BR-9.1 *quietly*: the count is wrong, nothing throws. Guard is a depth counter on the scoped audit context. AC-25 asserts exactly one row, so the day nesting appears the suite goes red |
| A-5 | At this feature's close, `Wasl.Api` contains **zero** types implementing `ICommand`, so the NFR-10 rule test has an empty population and passes vacuously | A rule test that passes because it found nothing is the exact failure mode this feature exists to prevent. Handled, not assumed away: AC-14 requires a second test that runs the scanner over a deliberate violator and asserts it is reported. The rule test becomes load-bearing at `004` |
| A-6 | The independent failure write on a second connection does not deadlock with the doomed business transaction | It cannot on the success-then-fail path, because the business transaction never inserts into `AuditLog` before failing, so the two connections touch disjoint objects. If a future command writes an audit row and then fails, this stops being true — and BR-9.1's "exactly one row" already forbids that |
| A-7 | The application connects as a principal that is a member of `wasl_app` and of nothing more privileged | If it connects as `sa` or a `db_owner` member, `DENY` is **decorative** — `DENY` does not restrict a sysadmin, and every test still passes. AC-13 is the assertion that makes this visible instead of assumed |
| A-8 | `Testcontainers.MsSql` connects as `sa`, so the test fixture must create the least-privileged login itself, with a password generated per run | If the fixture reuses the `sa` connection for the API under test, AC-12 passes for the wrong reason. The password is generated, never committed (constitution, *No secrets*) |

## Open questions

| # | Question | Working assumption |
|---|---|---|
| Q-1 | What is the audit log retention period? (`docs/sdd/11-open-questions.md` Q-9) | Retained indefinitely, no purge job, no purge code in this feature. The answer comes from legal, not from engineering, and inventing 90 days would be an invented requirement |
| Q-2 | Are reads audited? (Q-10) | No. Writes and auth events only. Queries do not implement `ICommand`, so they never enter the audit path — the exclusion is structural rather than a convention |
| Q-3 | Does a `400` validation failure write an audit row? BR-9.1 scopes to operations that *change state*; BR-9.2 enumerates auth events only. Neither covers a malformed request | **No.** `ValidationBehavior` runs outside `TransactionBehavior` and `AuditBehavior`, so a `400` never reaches the audit path. This makes the pipeline order load-bearing, which is why AC-15 asserts it. If the answer becomes yes, the change is one line of registration order and the table then also collects every mistyped form |
| Q-4 | What makes an outcome `Denied` rather than `Failed`? `002` produces `401` and `403` **with no exception thrown**, so no exception type marks a denial and a middleware-level denial never reaches MediatR at all | Two paths, and only one of them is this feature's. (a) A denial raised *inside* a handler — `011`'s "an Agent assigning someone else's ticket" — arrives as a `DomainException` (`002`), so `AuditOutcomeClassifier` maps on its `ErrorCode`: a `forbidden`-coded code → `Denied`, any other exception → `Failed`, a cancelled request → not audited (Q-5). (b) A denial produced by the auth middleware throws nothing and is `004`'s to record through `IAuditWriter.WriteIndependentAsync`. If `002`'s codes are renamed, the classifier's mapping table is one file |
| Q-5 | Is a request the client abandoned audited? | No. `OperationCanceledException` on the request's own token means the transaction rolled back and nothing happened; a disconnect is not an actor's action. Recorded because "nothing happened" and "we lost the record" look identical in the table, and this decides which one it is |
| Q-6 | Does `EntityLabel` carry a customer's name — personal data — into a table with indefinite retention? | Yes for tickets (`TCK-2026-000042`, an identifier) and yes for customers (the label is the only thing that makes the row readable without a join, ADR-008). This sharpens Q-1 rather than resolving it, and it is why `Changes` is redacted while the label is not |

## Acceptance criteria

Each is independently testable as written. The `Verified by` for each is in
[`tasks.md`](tasks.md).

| # | Criterion |
|---|---|
| AC-1 | `dbo.AuditLog` exists with exactly the columns, types, nullability, and lengths in [`data-model.md`](data-model.md), verified by querying `INFORMATION_SCHEMA.COLUMNS` — not by reading the migration. `Id` is `bigint` with `IDENTITY(1,1)` |
| AC-2 | `SELECT COUNT(*) FROM sys.foreign_keys WHERE parent_object_id = OBJECT_ID('dbo.AuditLog')` returns **0**. No foreign key, deliberately (BR-9.12) |
| AC-3 | All four indexes exist. For `IX_AuditLog_NotSuccess`, `sys.indexes.filter_definition` is **not null** and equals `([Outcome]<>'Success')`. A filtered index created without its filter is a migration defect that reads as a performance problem |
| AC-4 | `CK_AuditLog_ChangesIsJson` rejects an `INSERT` whose `Changes` is not valid JSON, and accepts `NULL` |
| AC-5 | `AuditLog` has no `rowversion` column and no `UpdatedAtUtc`. It is append-only; there is nothing to conflict over and nothing to update |
| AC-6 | One successful command through the pipeline produces **exactly one** row with `Outcome = 'Success'`. When the same command's transaction is rolled back, **neither** the business row **nor** the audit row exists (BR-9.3) |
| AC-7 | If the audit insert itself fails, the business change does **not** commit. A mutation that cannot be audited must not happen |
| AC-8 | A **denied** command produces exactly one row with `Outcome = 'Denied'`, and that row **survives** the rollback of the business transaction (BR-9.4). This is the half that is invisible when wrong |
| AC-9 | A command that mutates an entity and then throws produces exactly one row with `Outcome = 'Failed'`, the row survives, and the mutation is absent from its table |
| AC-10 | The independent write on the failure path is **not** cancelled by the request's `CancellationToken`. A client that disconnects mid-failure still leaves the audit row |
| AC-11 | If the independent write itself fails, the original exception reaches the error middleware unchanged — the audit failure is logged (in English, BR-9.10) and does not replace or mask it |
| AC-12 | The application's database principal can `INSERT` and `SELECT` on `dbo.AuditLog`, and an attempted `UPDATE` or `DELETE` fails with SQL Server error 229 (BR-9.5) |
| AC-13 | On the application's own connection, `IS_SRVROLEMEMBER('sysadmin')` and `IS_ROLEMEMBER('db_owner')` both return 0, and `HAS_PERMS_BY_NAME('dbo.AuditLog','OBJECT','UPDATE')` returns 0. Without this, AC-12 can pass on a connection where `DENY` does nothing |
| AC-14 | Two tests, both required. (a) The **rule** test: no type in `Wasl.Api` implements `ICommand` without also implementing `IAuditableCommand` (NFR-10). (b) The **scanner** test: run the same scanner over a type that deliberately violates the rule and assert it is reported. Without (b), (a) passes on an empty population and proves nothing |
| AC-15 | The registered `IPipelineBehavior` sequence equals the declared order `ValidationBehavior → TransactionBehavior → AuditBehavior`, asserted against a single ordered list. Inserting or reordering a behaviour then requires editing that list — a deliberate act rather than an accident (`docs/sdd/02-architecture.md`) |
| AC-16 | A **query** opens no transaction: inside a query handler, `DbContext.Database.CurrentTransaction` is null, and no audit row is written |
| AC-17 | Redaction (BR-9.7): a change to a field named `PasswordHash`, `Password`, `Token`, `RefreshToken`, `SigningKey`, or `Secret`, or to `TicketComments.Body`, stores the **field name** with `"[redacted]"` for both `before` and `after`. The real value appears nowhere in the row |
| AC-18 | A field whose value did not change is absent from `Changes` (BR-9.8), including a write that sets a property to the value it already had |
| AC-19 | `Changes` is valid JSON in the shape documented in [`data-model.md`](data-model.md), with entries ordered deterministically by entity then field, so two runs of the same command produce byte-identical `Changes` |
| AC-20 | `ActorEmail` and `ActorRole` are snapshots: change the current actor's role after the row is written and re-read the row — it still carries the role held at write time (BR-9.6) |
| AC-21 | `TraceId` on the row is byte-identical to `traceId` in the `ProblemDetails` body of the same failed request (BR-9.9) |
| AC-22 | The same command sent with `Accept-Language: ar` produces a row whose `Action`, `EntityType`, `Outcome`, and `Changes` are byte-identical to the `en` run (BR-9.10, BR-8.9). Audit content is never localized |
| AC-23 | `OccurredAtUtc` comes from the injected `TimeProvider` — a fake clock's value appears in the row — and reads back with `DateTimeKind.Utc` |
| AC-24 | Arabic text in a changed field round-trips byte-identical through `Changes`. `varchar(max)` would return `????`, and it would look like a font problem |
| AC-25 | One request produces **exactly one** audit row. `SELECT COUNT(*)` is asserted as `1`, not as `> 0` |

## Edge cases

| Case | Expected |
|---|---|
| The handler succeeds but `SaveChanges` throws on a constraint | `Failed` row, written independently, survives; the business change is absent (AC-9) |
| The handler throws before touching any entity | One `Failed` row with `Changes` = `null`. An empty diff is not an error |
| A command declares `AuditEntityType` but the entity is created and rolled back | No row at all on the success path (AC-6). On the failure path, `EntityId` comes from `DescribeTarget(null)` — the command's own fields, not the response |
| The request is cancelled by the client mid-handler | Transaction rolls back; no row (Q-5). Recorded so a missing row is diagnosable as intended rather than lost |
| The audit insert violates `CK_AuditLog_ChangesIsJson` | On the success path the whole transaction fails, so a malformed diff surfaces as a failed mutation rather than a silently missing row (AC-7) |
| The independent write throws (database unreachable) | Logged in English, original exception rethrown unchanged (AC-11). The request's own failure is not replaced by an audit failure |
| Two concurrent requests each write a row | Both rows exist; `bigint IDENTITY` allocates without contention. Nothing in the audit path takes a lock another request needs |
| A handler calls `SaveChanges` twice | Diffs from both saves are merged by the accumulator into one `Changes` document, and one row is written (AC-25) |
| A command is dispatched with no `HttpContext` (a background call) | `ICurrentActor` returns nulls; `TraceId` is whatever `002`'s accessor yields outside a request, and if that is empty the write fails loudly rather than storing an empty string — `TraceId` is `NOT NULL` by design |
| Kestrel reports the client IP as `::ffff:127.0.0.1` | Normalised to `127.0.0.1` before storage. `varchar(45)` fits IPv6, and mixed forms of the same address make "everything from this address" wrong |
| `UserAgent` is longer than 400 characters | Truncated to 400 at write time. A truncation exception on an audit write would fail the mutation it is recording |
| A row is written before `004` exists | `ActorUserId`, `ActorEmail`, `ActorRole` are all null. Legal — the columns are nullable precisely because BR-9.2 has anonymous events |
| Someone adds the application login to `db_datawriter` later | `DENY` still wins, which is why ADR-013 chose `DENY` over `REVOKE`. AC-12 keeps proving it |
| A migration is run by the application's own least-privileged principal | It fails on `CREATE TABLE`. Migrations use `ConnectionStrings:Migrations` (owner); the running application uses `ConnectionStrings:Default` (member of `wasl_app`) — see [`plan.md`](plan.md) |

## Rules referenced

- **BR-9.1** – **BR-9.13** — in full. BR-9.2 and BR-9.11 are partially deferred, and the
  owning feature is named in *Out of scope*
- **BR-8.9** — logs and audit content are always English
- **FR-6.1** – **FR-6.5** — implemented here. FR-6.6 and FR-6.7 belong to `019`
- **NFR-5** — significant changes are auditable, in the same transaction as the change
- **NFR-10** — an audit gap is a build failure, not a review finding
- **ADR-008** — the whole of it. Two tables, no foreign keys, snapshot the actor, explicit
  writes rather than an interceptor deciding the action, `bigint` key, and the
  same-transaction exception
- **ADR-010** — two projects; MediatR retained for exactly these three behaviours; one
  transaction per request opened by a behaviour
- **ADR-013** — `nvarchar(max)` + `ISJSON` in place of `jsonb`, and `DENY` in place of
  `REVOKE`
- **ADR-006** (as amended by ADR-013) — cited to say `AuditLog` deliberately has **no**
  concurrency token
- **Q-9**, **Q-10** — carried forward as open, with working assumptions

## Why this is not one task called "add an audit table"

Six of the criteria above fail silently and each has its own reason to exist:

| Silent failure | Caught by |
|---|---|
| A filtered index created without its `WHERE` clause | AC-3 |
| A `Denied` row enrolled in the transaction that is about to roll back | AC-8 |
| An audit row lost because the client disconnected | AC-10 |
| `DENY` applied to a connection it cannot restrict | AC-13 |
| An architecture test that passes because it found nothing to check | AC-14 |
| The diff read after `SaveChanges` has accepted it, so `Changes` is always empty | AC-18, AC-19 |

Every one of those looks like success in a green suite. That is the whole argument for
specifying this feature before there is anything to audit.
