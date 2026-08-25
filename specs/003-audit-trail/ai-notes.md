# 003 — AI Usage Notes

**State: `003` core implemented and run on 2026-08-25. The `·b` least-privilege block is not.**

The planning section below was written before any code existed, and is left as it was.
The Reconciliation section records what changed when it met `001` and `002`; the
Implementation and Testing sections record what running it actually found.

---

## Reconciliation, 2026-08-25 — before implementation, after `001` and `002`

`003` was specified while `src/` was almost empty and while ADR-010 was still on the table.
Reading it against the delivered code found five things. They are recorded here rather than
edited in silently, because the difference between a spec that was reconciled and a spec that
was always right is the whole point of keeping this file.

**Three were stale facts.** No judgement involved — the world moved.

| Was | Is | Where it was fixed |
|---|---|---|
| ADR-010 cited as authority in six places, including "two projects" | ADR-002; ADR-010 is rejected | `spec.md`, `plan.md`, `data-model.md`, `research.md` R-7, `tasks.md`, `checklists/requirements.md` |
| `ICommand` / `IAuditableCommand` in `Wasl.Api/Common/Messaging/` | `Wasl.Application/Common/Messaging/` — a marker in `Wasl.Api` sits *above* its implementers and does not compile | `research.md` R-7, amended in place with a note saying what it used to say |
| The NFR-10 scanner running over `Wasl.Api` | Over `Wasl.Application`, where commands live — and it moves to `Wasl.Application.Tests`, so it needs no Docker at all | `spec.md` AC-14, `plan.md`, `tasks.md` TEST-003-03 |

**Two were real decisions, and both went to the product owner** rather than being resolved by
whoever happened to be typing. Options and reasons are in `research.md` R-14 and R-15; the
answers were (b) and *defer whole*.

| Question | Answer | Cost that was accepted with it |
|---|---|---|
| `TransactionBehaviour` needs a transaction, and `IApplicationDbContext` exposes no EF Core type by design. Wrap it, move the behaviour, or exempt the rule? | **Move it.** Both behaviours go to `Wasl.Infrastructure` | One line of `CLAUDE.md`'s structure block; MediatR added to `Wasl.Infrastructure.csproj`; one of three behaviours in a different project from the other two |
| Least privilege — `DENY`, the role, the second connection string — in `003` or deferred? | **Deferred whole to `003b`** | `003` says outright that the audit log is append-only by application convention. Weaker than BR-9.5 asks for, and named rather than implied |
| Two interfaces or one, and does `ICurrentActor` survive? | **Two — `ICurrentUser` and `IRequestContext`** — split on subject rather than on feature. `ICurrentActor` is deleted | `004` gets `ICurrentUser` with no user-agent string attached to it |

**And one thing the reconciliation itself produced, which nobody had asked about.** It is the
most valuable finding here, and it exists only because moving the behaviours forced a look at
the registration site:

MediatR orders behaviours by registration order. `002` registers `ValidationBehaviour` inside
`AddApplication()`, and `Program.cs` calls `AddInfrastructure()` **first**. So had the two new
behaviours simply been registered where they were built, the order would have become
`Transaction → Audit → Validation` — and `spec.md` Q-3's guarantee, that a `400` writes no
audit row, would have inverted **without anything throwing**. The audit table would have
collected a row for every mistyped form, and the suite would have stayed green.

Settled by putting all three registrations in one ordered list in `Wasl.Api`, which AC-15 was
already written to assert against. `research.md` R-15 carries the rejected cheaper fix —
swapping two lines in `Program.cs` — and why it is worse.

**How this was verified, and where it was not.** Every claim above came from reading the file:
`src/Wasl.Application/Common/Abstractions/IApplicationDbContext.cs` for the four members,
`src/Wasl.Application/DependencyInjection.cs` for the registration site,
`src/Wasl.Api/Program.cs` for the call order, the three `.csproj` files for what
`Wasl.Infrastructure` does and does not reference, and the five methods in
`tests/Wasl.Application.Tests/Architecture/LayerDependencyTests.cs` to confirm **no test
constrains `Wasl.Infrastructure`**. None of it was recalled.

**Verified by running it, on the product owner's instruction before implementation.** Two
claims in this file were reasoning rather than evidence, and both were checked with a
throwaway console spike in the session scratchpad against MediatR 14.2.0. Full output in
`research.md` R-3 and R-15.

| Claim | Was | Is |
|---|---|---|
| MediatR resolves a constrained open-generic behaviour, and applies it only where the constraint holds (A-3) | Assumption, with a fallback designed in case it was wrong | **Observed true.** `AuditBehaviour` ran for the auditable command, was absent for a plain `ICommand`, and absent for a query. Nothing threw. The fallback is not built, and stays written down against a future package upgrade |
| Cross-`AddMediatR`-call registration order inverts when Infrastructure registers first (R-15) | Reasoned, and described as "moot because the single list is now the design" | **Observed true**, and calling it moot was the wrong instinct: the resolved order came back `Transaction → Audit → Validation`, with validation last. The defect the single list prevents is real and needs no unusual configuration to trigger |

**And one finding neither claim anticipated:** MediatR 14 throws
`InvalidOperationException: MediatR requires ILoggerFactory to be registered` if `AddLogging()`
has not been called. `WebApplicationBuilder` supplies it, so `002`'s 33 green tests never saw
it — but a pipeline-order test built on a bare `ServiceCollection` will, and the message names
logging rather than the thing under test. Written into `research.md` R-3 so `TEST-003-05` does
not lose twenty minutes to it.

**Still not verified, and it no longer matters:** whether DI would preserve order across three
or more registration calls. The design has one call site, so there is nothing to preserve.

## Specification and planning

**Used for:** reading the blueprint for this feature and reconciling it into one design.
Read in full, not from memory: `docs/sdd/decisions/ADR-008-audit-log.md`,
`docs/sdd/04-business-rules.md` (BR-9.1 – BR-9.13 and the action-naming table),
`docs/sdd/03-domain-model.md` (the `AuditLog` entity, its physical shape, the query-to-index
map, and the notes on `DENY`), `docs/sdd/01-product-spec.md` (FR-6, NFR-10),
`docs/sdd/testing/test-strategy.md` (the audit rows and the architecture-test section),
`docs/sdd/02-architecture.md` (the pipeline order and the `Behaviours/` file names),
`docs/sdd/05-api-conventions.md`, `docs/sdd/09-definition-of-done.md`,
`docs/sdd/11-open-questions.md` (Q-9, Q-10), ADR-010 (read, then rejected), ADR-013, and the constitution. Tone
and structure were taken from `specs/001-solution-skeleton/` and the contract and frontend
formats from `specs/007-create-customer/`.

**Accepted as-is:**

- ADR-008's reasoning end to end — two tables, no foreign keys, snapshot the actor, explicit
  writes rather than an interceptor choosing the action, the `bigint` key, and the
  same-transaction exception. None of it needed changing, and the alternatives it already
  rejected (application logs, triggers, temporal tables, event sourcing, a separate database)
  were not re-litigated here
- The physical shape of `dbo.AuditLog`, column for column, including which columns stay
  `varchar` because they are ASCII by definition
- The four indexes and the filtered one's justification, plus the blueprint's own instruction
  to verify `filter_definition` rather than trust it
- `docs/sdd/02-architecture.md`'s pipeline order, `Validation → Transaction → Audit → handler`
- Q-9 and Q-10 left open, with the blueprint's own working assumptions

**Modified, and why:**

| What | Change | Reason |
|---|---|---|
| ADR-013's `GRANT ... TO wasl_app` read as a database **user** | Specified as a database **role**, created idempotently by the migration. **`003b` builds it; `003` does not** | The same grant with one fewer coupling: the login name varies per environment, and a user would put a password in a migration file. `research.md` R-4 |
| One connection string (`001`'s shape) | Specified as two: `Migrations` (owner) and `Default` (member of `wasl_app`). **`003b` builds them; `003` keeps `001`'s single `ConnectionStrings:Wasl`** | A least-privileged principal cannot run DDL, and `DENY` does not restrict `sysadmin`. Without the split, BR-9.5 is implemented and ineffective. `research.md` R-4, AC-13 |
| ADR-008's blanket rejection of a `SaveChangesInterceptor` | Narrowed: an interceptor that **captures the field diff** and decides nothing | The ADR's objection is that an interceptor cannot see business intent. Intent still comes from `IAuditableCommand`. The change tracker is the only correct source for "which properties changed value", and it is destroyed by `SaveChanges`. `research.md` R-1, with the ADR's objection quoted rather than paraphrased |
| `AuditLog` as the CLR type name (`03-domain-model.md`) vs `AuditEntry` (ADR-010, since rejected — but not on this point) | Type `AuditEntry`, table `AuditLog` | Two names for one thing is how a duplicate file gets created. `research.md` R-6 |
| A handler-called `IAuditContext.Describe(...)`, the first design | `IAuditableCommand<TResponse>.DescribeTarget(TResponse?)` | A handler that forgets to call it produces a row with a null `EntityId` and nothing announces it. Moving the obligation onto the interface makes it the compiler's problem. `research.md` R-8 |
| A single NFR-10 architecture test | Two tests: the rule, plus a scanner self-test over a deliberate violator | The rule test has an **empty population** at Phase 0 and passes vacuously — which is the exact failure mode this feature exists to prevent. `research.md` R-5, AC-14 |
| `TraceId` derived here from `Activity.Current?.Id` | Read from `002`'s single `TraceContext` accessor | Checked against `specs/002-error-contract/` as specified rather than assumed. BR-9.9 wants one identifier in three places; a locally derived value is valid and simply not *the* value, and it would diverge only when `Activity.Current` was null. `research.md` R-13 |
| `AuditOutcomeClassifier` keyed on an `IDeniedException` marker | Keyed on `002`'s `DomainException.ErrorCode`, with middleware-level `401`/`403` reassigned to `004` | `002` produces `401`/`403` with **no exception thrown**, so the marker interface this design first assumed does not exist and a middleware denial never reaches MediatR. `research.md` R-13, `spec.md` Q-4 |

**Rejected:**

| Suggestion | Why it was rejected |
|---|---|
| Have the pipeline own `SaveChanges` so handlers never call it | The cleanest design on paper, and it breaks `007`'s **frozen** contract: `version` is the base64 `rowversion`, which SQL Server produces only on save. The first handler needing a generated value would call `SaveChanges` anyway and silently lose its diff. `plan.md`, second rejected alternative |
| Write the audit row after the commit, on every path, for uniformity | Inverts BR-9.3. A commit with a failed audit write leaves an unrecorded change; a rollback with a successful write leaves a record of something that never happened. ADR-008: *"a log recording things that did not happen is worse than no log"* |
| Keep the single `sa` connection string and document the `DENY` as "enforced in production" | `DENY` does not restrict a `sysadmin` member, so this ships a claim with no evidence behind it and a green suite. AC-13 makes the difference observable |
| Add a `Development`-only probe endpoint to `Wasl.Api` so the pipeline has a production consumer | A real HTTP surface that has to be excluded from the contract, the OpenAPI document, and the auth policy — and an endpoint that dispatches an arbitrary command survives into the environment where `ASPNETCORE_ENVIRONMENT` was set wrong. Test-assembly only. `research.md` R-12 |
| Infer the audit action from the command's type name | `CreateCustomerCommand` → `Customer.Created` works right up to `ChangeStatusCommand`. A convention that is correct most of the time is worse than a declared string, because the exceptions are invisible |
| Add a retention window (90 days was suggested) so the table does not grow unbounded | Q-9 is open and the answer comes from legal. An invented number in a migration is an invented requirement, and the constitution says it goes to Open Questions instead |
| Redact by substring match on property names containing `token`, `key`, or `secret` | It would silently redact a future `TokenCount` or `SecretaryName`. A field redacted that nobody intended is a hole that looks like a feature. Exact, case-insensitive matching plus a unit test on the near-misses |
| Skip the NFR-10 rule test until `004` gives it something to check | A skipped test is the silent hole with a label on it. `001` AC-9 already refuses a skipped suite without a reason, and this would be one |
| Add `rowversion` to `AuditLog` "for consistency" with the other tables | Append-only; there is no second writer. ADR-006 as amended scopes the token to entities two people edit at once, and AC-5 asserts the absence so re-adding it has to be argued for |

**How each accepted output was verified:** every rule, column, type, index, and ADR claim in
these documents was checked by opening the blueprint file and reading the line, not by
recalling it — including the ones that turned out to disagree with each other (`AuditLog` vs
`AuditEntry`, the `Behaviours`/`behaviour` spelling split, `TO wasl_app` as user or role), all
three of which are recorded in `research.md` rather than silently resolved. The task-table
format, the `Agent` and `Skill` strings, and the task-ID scheme were copied from
`specs/001-solution-skeleton/tasks.md` and `specs/README.md`'s *Who builds what* table rather
than invented.

**What was deliberately left unverified, and how:** assumption A-3 (MediatR resolving
constrained open-generic pipeline behaviours) is a property of a package version and cannot be
confirmed by reading. It is recorded as an assumption, given a verification command and a
designed fallback in `research.md` R-3, and it is checked by `TEST-003-05` **before**
`BE-003-05` is written. No document here claims it works.

**Not put into any prompt:** no credentials, no connection strings, no customer data. The
least-privileged login the test fixture creates uses a password generated per run against a
throwaway container; it is never committed and never appears in a prompt (constitution,
*No secrets*).

---

## Implementation

**Ran on 2026-08-25. `003` core only** — the `·b` least-privilege block is not built, by
product-owner decision.

No subagent was dispatched. Everything was written in the main session, so "what the agent
returned" is "what I wrote", and the verification column is the part that carries weight.

### What was written, and what verified it

| Task | Output | Verified by |
|---|---|---|
| `BE-003-01` | `AuditEntry`, `AuditOutcome`, `AuditTarget`, `AuditFieldChange` in `Wasl.Domain/Audit/` | `dotnet build` clean; `LayerDependencyTests` confirms `Wasl.Domain` still declares **zero** package references |
| `BE-003-02` | `AuditRedaction` — exact case-insensitive names plus the entity-qualified comment body | 22 cases in `AuditRedactionTests`, including the near-misses `TokenCount` and `SecretaryName` |
| `BE-003-03` | `ICommand`, `IAuditableCommand<TResponse>` in `Wasl.Application/Common/Messaging/` | `dotnet build`; `LayerDependencyTests` still green with MediatR in the layer and no EF Core |
| `BE-003-04` | `AuditEntryConfiguration`, `DbSet<AuditEntry> AuditLog`, migration `AddAuditLog` | `AuditSchemaTests` (6) reading `INFORMATION_SCHEMA` and `sys.*` against a real engine — **and reading the generated migration, which is where the index defect was found** |
| `BE-003-07` | `ICurrentUser`, `IRequestContext`, `IAuditWriter` (Application); `HttpCurrentUser`, `HttpRequestContext`, `ActorClaimTypes` (Api) | `The_actor_columns_hold_what_the_current_user_returned_at_write_time`; `The_row_trace_id_matches_the_problem_details_trace_id` |
| `BE-003-08` | `AuditDiffAccumulator` (scoped) + `AuditDiffInterceptor` (captures only) | `A_successful_command_...` asserts `before`/`after` content, and the interceptor was **watched failing** when moved to `SavedChanges` |
| `BE-003-09` | `AuditChangeSerializer` — ordered, redacted, `null` never `[]` | `A_no_op_write_produces_no_change_entry`; `Arabic_text_round_trips_...` |
| `BE-003-10` | `AuditOutcomeClassifier` — `forbidden` → `Denied`, else `Failed`, cancellation → not audited | `A_denied_command_leaves_a_denied_row_that_survives_the_rollback` |
| `BE-003-11` | `AuditWriter` — the two methods that are BR-9.4 | `A_failing_command_leaves_its_row_and_rolls_back_its_change` |
| `BE-003-12` | `TransactionBehaviour` in `Wasl.Infrastructure` | `A_query_opens_no_transaction_and_writes_no_audit_row` |
| `BE-003-13` | `AuditBehaviour` in `Wasl.Infrastructure` | `AuditPipelineTests` (11) |
| `BE-003-14` | `WaslPipeline.DeclaredOrder` in `Wasl.Api`; `AddApplication()` loses its `AddOpenBehavior` | `PipelineOrderTests` (3), resolved from the real host |

### The three assumptions this feature could close

| Assumption | Outcome |
|---|---|
| A-3 — MediatR resolves constrained open generics | **Closed before implementation** by the R-3 spike, on the product owner's instruction. Confirmed again by `A_query_resolves_validation_only` against the real container: a query resolves `ValidationBehaviour` alone |
| A-4 — commands are not nested | **Held, and guarded.** `TransactionBehaviour` joins an existing transaction rather than opening a second, so the audit write commits with the outer scope and BR-9.1's "exactly one row" survives if nesting ever appears |
| A-6 — no deadlock between the two connections | **Held.** Every failure-path test passed on the first run; nothing hung. The reasoning was that the business transaction never inserts into `AuditLog` before failing, and that is what the tests exercise |
| A-1 — claim types | **Not exercised.** There is no authentication, so no claim is ever read. `ActorClaimTypes` exists so `004` changes one file |

### Rejected during implementation

| Rejected | Why |
|---|---|
| Making `TransactionBehaviour` and `AuditBehaviour` `public` so `Wasl.Api` could name them | Composition needs their `Type`, not their API — MediatR closes the generic by reflection. `WaslPipelineBehaviours` hands out two `Type` properties instead, and the behaviours stay `internal`, so nothing outside the pipeline can resolve or invoke one |
| An `AddAuditPipeline()` extension in `Wasl.Infrastructure` | Registering them there is precisely the defect R-15 found. An extension method would have looked tidier and put the ordering decision back in two places |
| Widening AC-3 to "the filtered index exists" once three indexes appeared | The migration was wrong, not the criterion. Widening it would have hidden the missing index permanently, and the missing one was the unfiltered index every time-ordered read depends on |
| Adding a public setter to `Customer` so the probes could mutate it | `Customer` is a shell until `007`. Reflection confined to one test-project class was the smaller cost; a public mutator on a domain entity for a test's benefit is how an entity becomes a bag |
| Including `rowversion` in the diff | It changes on every write, so every diff would carry a meaningless entry. Byte arrays are formatted as `null`, which the AC-18 value comparison then drops |

### The defect that would have shipped

**A missing index that AC-3 would have passed anyway.** `IX_AuditLog_Time` and
`IX_AuditLog_NotSuccess` both cover `OccurredAtUtc`; with the unnamed `HasIndex` overload EF
Core identifies an index by its property set, so the second silently replaced the first. The
migration came out with three indexes, and **the one that vanished was the unfiltered one** —
so a check asserting "the filter is present" would have been satisfied.

Found by reading the generated migration, not by a test — because no test existed yet that
could have caught it: the test was going to be written against the same wrong assumption.
Fixed with the named overload; AC-3 now asserts all four **by name**; the reason is written at
the configuration site.

**Not put into any prompt:** no credentials, no connection strings, no tokens, no customer
data. The probes seed a synthetic customer with a generated email.

---

## Testing

`tests.md` holds the commands and their real output: **93 tests, 93 passed, 0 skipped**, and
`0 Warning(s) 0 Error(s)`. `003` added 60.

**The number that matters is 25, not 60.** `002`'s integration suite still passes after `003`
moved `ValidationBehaviour`'s registration site — the error envelope, the single `traceId`, and
the Development-environment assertion all held across a change to a delivered feature.

### Watched failing

Three, and the first is the reason this feature was specified before there was anything to
audit.

- **The diff, read too late.** The interceptor was moved from `SavingChanges` to
  `SavedChanges` — `research.md` R-1's exact failure. **Four tests went red and the row was
  still there**: `COUNT(*)` returned 1, the outcome was `Success`, the business change
  committed, and `Changes` was `null` on every command. Had AC-18 and AC-19 asserted presence
  instead of content, all four would have stayed green
- **The NFR-10 rule test.** A `TemporaryViolator : ICommand` was added to `Wasl.Application`
  and the test went red naming it, which is what an empty result had to mean before it could
  mean anything. Deleted immediately
- **Not watched failing, and named:** the validator-message test. `003` adds no validator, so
  it would guard nothing. It stays with `002b`

### What is not tested, and why

The full list is `tests.md`'s Gaps table. Four entries are honest weaknesses rather than
deferrals, and none of them is smoothed over:

- **AC-7** is asserted by construction. Injecting a failing audit insert needs a seam that does
  not exist, and adding one to make a test possible would weaken the guarantee
- **AC-10** is enforced by a signature — `WriteIndependentAsync` takes no token, so there is
  nothing to cancel. Uncompilable to get wrong, and unproven against a real disconnect
- **AC-22** cannot currently fail: no localisation middleware exists, so the header changes
  nothing. It acquires teeth at `005`
- **AC-23**'s fake clock is not substituted; `TimeProvider` is injected and the read-back
  `Kind` is asserted, which is the wiring but not the value
