# 003 — Plan

**Phase:** 0 · **Role:** Architecture · **Agent:** `feature-dev:code-architect` ·
**Skill:** `speckit-plan`

## Backend design

Every file this feature creates or changes is named below. Anything not in this list is
scope creep.

```text
src/
  Wasl.Domain/
    Audit/
      AuditEntry.cs                  NEW  entity: private setters, one factory, no mutator
      AuditOutcome.cs                NEW  enum Success | Denied | Failed
      AuditTarget.cs                 NEW  readonly record struct (type, id, label)
      AuditFieldChange.cs            NEW  record: one element of the Changes array
      AuditRedaction.cs              NEW  BR-9.7 deny-list + Redact(). Pure, no packages
  Wasl.Api/
    Common/
      Messaging/
        ICommand.cs                  NEW  marker: this request changes state
        IAuditableCommand.cs         NEW  AuditAction + DescribeTarget(TResponse?)
      Audit/
        IAuditWriter.cs              NEW  two methods, and the difference is BR-9.4
        AuditWriter.cs               NEW  in-transaction write + independent write
        AuditDiffAccumulator.cs      NEW  scoped; merges diffs across multiple SaveChanges
        AuditDiffInterceptor.cs      NEW  SaveChangesInterceptor — CAPTURES only, writes nothing
        AuditChangeSerializer.cs     NEW  ordering + redaction + System.Text.Json
        AuditOutcomeClassifier.cs    NEW  exception → Denied | Failed | not audited
      Auth/
        ICurrentActor.cs             NEW  Id, Email, Role, IpAddress, UserAgent
        HttpContextCurrentActor.cs   NEW  reads ClaimsPrincipal; all nulls until 004
        ActorClaimTypes.cs           NEW  one place for the claim names (assumption A-1)
      Behaviors/
        TransactionBehavior.cs       NEW  one transaction per ICommand request
        AuditBehavior.cs             NEW  the row, both paths, and the BR-9.4 asymmetry
      Persistence/
        WaslDbContext.cs             CHANGE  DbSet<AuditEntry> AuditLog; interceptor wired
        Configurations/
          AuditEntryConfiguration.cs NEW  table, types, check constraint, four indexes
        Migrations/
          *_AddAuditLog.cs           NEW  generated + migrationBuilder.Sql for role/grants
    Program.cs                       CHANGE  registrations; behaviour order; DbContextFactory
    appsettings.json                 CHANGE  ConnectionStrings:Migrations placeholder
    appsettings.Development.json     CHANGE  same
tests/
  Wasl.Domain.Tests/
    Audit/
      AuditRedactionTests.cs         NEW  BR-9.7 as a pure unit test
      AuditEntryTests.cs             NEW  required fields, UserAgent truncation
  Wasl.Api.IntegrationTests/
    WaslApiFactory.cs                CHANGE  probe assembly for MediatR; least-privileged conn
    DatabaseFixture.cs               CHANGE  provision the wasl_app login per run
    Architecture/
      CommandAuditScanner.cs         NEW  the reflection scan, callable on any assembly
      CommandsAreAuditableTests.cs   NEW  the NFR-10 rule test AND the scanner self-test
      PipelineOrderTests.cs          NEW  registered behaviour order equals the declared list
    Audit/
      Probe/
        ProbeCommand.cs              NEW  succeeds; mutates one Customer
        FailingProbeCommand.cs       NEW  mutates, then throws
        DeniedProbeCommand.cs        NEW  throws a forbidden-coded DomainException (002)
        UnauditableProbeCommand.cs   NEW  deliberate NFR-10 violator, for the scanner self-test
        ProbeQuery.cs                NEW  proves a query opens no transaction (AC-16)
        ProbeEndpoints.cs            NEW  POST /__test/probe — TEST HOST ONLY
      AuditSchemaTests.cs            NEW  AC-1..AC-5 from sys.* and INFORMATION_SCHEMA
      AuditSuccessPathTests.cs       NEW  AC-6, AC-7, AC-18..AC-20, AC-22..AC-25
      AuditFailurePathTests.cs       NEW  AC-8..AC-11, AC-21
      AuditPermissionTests.cs        NEW  AC-12, AC-13
docs/sdd/documentation/development/
  setup.md                           CHANGE  the two connection strings and the wasl_app login
```

### The pipeline, and why the order is the design

`docs/sdd/02-architecture.md` states the conceptual order. This feature makes it real and
asserts it (AC-15):

```text
HTTP → Minimal API endpoint → MediatR
   → ValidationBehavior      (002)   outermost: a 400 never opens a transaction  ─┐
   → TransactionBehavior     (003)   BEGIN TRAN                                   │ order
   → AuditBehavior           (003)   compose + write the row                      │ is
   → handler                         domain + EF Core, SaveChanges allowed       ─┘ load-bearing
```

Three consequences of that exact order, each of which is wrong in a way nothing announces if
the order changes:

| Order fact | What breaks if it is wrong |
|---|---|
| `ValidationBehavior` is **outside** `TransactionBehavior` | A `400` would open and roll back a transaction, and — per open question Q-3 — would start writing an audit row for every mistyped form |
| `TransactionBehavior` is **outside** `AuditBehavior` | The audit row would commit in its own transaction while the business change rolled back: BR-9.3 inverted, leaving orphan rows describing changes that never happened |
| `AuditBehavior` is **inside** nothing else that catches exceptions | The classifier would never see the exception, so every denial and failure would be recorded as a success or not at all |

Registration lives in one place in `Program.cs` and is asserted against one ordered list, so
inserting a behaviour is a deliberate edit rather than a silent reordering.

### Success path, step by step

1. `TransactionBehavior` sees `ICommand` and opens
   `await db.Database.BeginTransactionAsync(ct)`.
2. `AuditBehavior` calls `await next()`. The handler mutates entities and calls
   `SaveChangesAsync` — allowed, and necessary so `rowversion` is populated for responses
   like `007`'s (`research.md` R-1).
3. `AuditDiffInterceptor.SavingChangesAsync` fires on that save, reads `Added`, `Modified`,
   and `Deleted` entries excluding `AuditEntry`, and appends the changed properties to the
   scoped `AuditDiffAccumulator`. It writes nothing and decides nothing.
4. `AuditBehavior` resumes: asks the command for `DescribeTarget(response)`, the actor for
   its snapshot, `TimeProvider` for the timestamp, `002`'s `TraceContext` accessor for the
   trace id — the same accessor the response and the log scope read, which is what BR-9.9
   actually requires —
   and `AuditChangeSerializer` for the redacted, ordered JSON.
5. `IAuditWriter.WriteInTransactionAsync` adds the `AuditEntry` to the **request's**
   `DbContext` and saves. Same connection, same open transaction.
6. `TransactionBehavior` commits. The business change and its audit row become visible in one
   atomic step — which is what BR-9.3 actually means.

If step 5 throws, step 6 never commits: a mutation that cannot be audited does not happen
(AC-7).

### Failure and denial path — the BR-9.4 asymmetry

1. The handler throws. `AuditBehavior` catches.
2. `AuditOutcomeClassifier` maps the exception on `002`'s `DomainException.ErrorCode`: a
   `forbidden`-coded exception → `Denied`; any other exception → `Failed`;
   `OperationCanceledException` on the request's own token → **not audited** (open question
   Q-5). `002` produces middleware-level `401`/`403` with no exception at all, so those never
   reach this behaviour and are `004`'s to record through `WriteIndependentAsync`.
3. `IAuditWriter.WriteIndependentAsync` opens a **second** `DbContext` from
   `IDbContextFactory<WaslDbContext>` — its own connection, its own implicit transaction —
   and inserts the row with `CancellationToken.None`.
4. `AuditBehavior` rethrows the **original** exception, untouched.
5. `TransactionBehavior` rolls back. The business change is gone. The audit row is not.

Two details that are the entire reason this path gets its own tests:

- **The second context is not optional.** Adding the row to the request's `DbContext` puts it
  inside the transaction that is about to roll back, so it is created and destroyed. Nothing
  fails, nothing logs, and the row that an investigation is looking for is the one that is
  missing (AC-8, AC-9).
- **`CancellationToken.None`, deliberately.** The request's token is already cancelled when a
  client disconnects mid-failure. Threading it here would drop exactly the rows produced by
  the messiest requests. This is the one place in the codebase where the constitution's
  "`CancellationToken` on every async path" is answered with a token that is deliberately
  not the request's, and it is called out in `AuditWriter.cs` with the reason (AC-10).

If the independent write itself throws, it is caught, logged in English (BR-9.10, BR-8.9),
and the original exception is rethrown unchanged. An audit failure must not replace the
failure it is recording (AC-11).

### Actor snapshot

`ICurrentActor` is resolved per request from `HttpContext.User`, and its values are **copied
onto the row** — never resolved by a join (BR-9.6, ADR-008). Until `004` lands there is no
authentication, so every value is null, which the nullable columns already permit: BR-9.2's
anonymous events need exactly that shape.

`ActorClaimTypes.cs` exists so that when `004` names its claims, this is one edit rather than
a search (assumption A-1).

### What is deliberately not built here

| Not built | Why |
|---|---|
| A `IAuditContext.Describe(...)` that handlers call | A handler that forgets produces a row with a null `EntityId` and nothing announces it. `IAuditableCommand<TResponse>.DescribeTarget` puts the obligation on the compiler instead (`research.md` R-8) |
| Automatic action naming from the command type name | `CreateCustomerCommand` → `Customer.Created` works until `ChangeStatusCommand`, and a convention that is right most of the time is worse than a declared string |
| Any purge, archive, or retention job | Q-9 is open and the answer is legal, not engineering |
| A `Development`-only probe endpoint in `Wasl.Api` | `research.md` R-12 |

## Frontend design

**None.** No screen, no route, no component, no i18n key — see
[`frontend-spec.md`](frontend-spec.md). Every audit-log screen belongs to `019`.

Recorded rather than omitted so the empty lane is visibly a decision.

## Data changes

[`data-model.md`](data-model.md). One table (`dbo.AuditLog`), one check constraint, four
indexes including the filtered one, one database role, two permission statements. Migration
`AddAuditLog`.

One change that is not schema and is easy to miss: **a second connection string**. Migrations
run as an owner; the application runs as a member of `wasl_app`. A least-privileged principal
cannot execute DDL, so one string cannot do both jobs — and without the split, BR-9.5's
`DENY` is decorative (`research.md` R-4).

## Contract changes

**None.** No endpoint is added, no request or response shape changes, and no new status code
becomes possible. [`contracts/README.md`](contracts/README.md) records that and names `019`
as the owner of the read surface.

One shape *is* frozen by this feature without being an HTTP contract: the JSON in
`AuditLog.Changes`. `019` will project it, so its envelope keys are fixed in
[`data-model.md`](data-model.md) now rather than negotiated later.

## Test strategy

| Level | What | Why there |
|---|---|---|
| Unit — `Wasl.Domain.Tests` | `AuditRedaction`: every deny-list entry, the entity-qualified comment body, and the near-misses that must **not** be redacted (`TokenCount`, `SecretaryName`) | A pure function with many inputs. BR-9.7 is a business rule, so it lives in the domain and is tested without a database |
| Unit — `Wasl.Domain.Tests` | `AuditEntry.For`: required fields rejected, `UserAgent` over 400 truncated rather than thrown | The truncation matters: an audit write that throws on its own input fails the mutation it is recording |
| Architecture — `Wasl.Api.IntegrationTests` | The NFR-10 rule test **and** the scanner self-test; the pipeline order test | Both fail by omission, and omission is what review is worst at catching (`docs/sdd/testing/test-strategy.md`). No fixture, so they run without Docker |
| Integration — `Wasl.Api.IntegrationTests` | AC-1..AC-5 read from `sys.*` and `INFORMATION_SCHEMA`; AC-6..AC-13 and AC-17..AC-25 through the real pipeline against a real engine | Every one is a property of the real engine or the real transaction. A filtered index, a `DENY`, a rollback, and an `nvarchar(max)` round trip are all things EF `InMemory` would report as fine |
| **Not tested** | That MediatR dispatches, that EF Core saves, that SQL Server honours `IDENTITY` | Testing the framework |
| **Not tested** | Audit volume, index selectivity, or query plans on a large table | No stated requirement. `docs/sdd/testing/test-strategy.md` lists load and performance as deliberately untested; the four indexes are justified by named queries, not by measurement |
| **Not tested here, and named** | BR-9.2's `401`/`403` rows, BR-9.6 across a real role promotion, BR-9.11's `Audit.Read` | They need `SupportUsers`, tokens, or the read endpoint. `004` and `019` own them, and this is written down so a reviewer does not read the gap as an oversight |

**The two tests that carry the most weight** are `AuditFailurePathTests` (AC-8, AC-9) and
`CommandsAreAuditableTests` (AC-14). The first is the only proof that the BR-9.4 asymmetry
was implemented and not merely described; the second is the only thing standing between this
feature and the retrofit it exists to avoid.

**Test data:** the probe commands mutate a `Customer` row, because `Customers` is the only
table that exists at Phase 0 (`001`). One deliberate consequence: `AuditSuccessPathTests`
proves that Arabic text in a changed field round-trips through `Changes` (AC-24), reusing the
same argument `001` AC-12 made for the column itself.

## Dependencies

| Depends on | For | If it is not ready |
|---|---|---|
| `001-solution-skeleton` | `WaslDbContext`, the UTC value converter, `TimeProvider` in DI, `Testcontainers.MsSql`, the `Customers` table the probes mutate | Hard blocker. Nothing here is buildable without it |
| `002-error-contract` | `DomainException` and its `ErrorCode`, the `ProblemDetails` middleware, and the single `TraceContext` accessor — AC-21 compares the row against the response body | AC-21 and the `Denied` half of AC-8 cannot be verified. The rest of the feature can be built; the classifier's mapping table is one file (Q-4). `002` produces `401`/`403` with **no exception thrown**, so middleware-level denials are `004`'s to record and not a gap here |
| `002-error-contract` | `ValidationBehavior`, which AC-15 asserts is registered outermost | The order test compares against the declared list, so the list simply has two entries instead of three, and gains the third when `002` lands |
| `004-auth-and-roles` | A non-null actor. Not a blocker: nullable columns are the designed shape for anonymous events | Rows written before `004` carry null actor fields, which is legal and tested (AC-20 uses a stubbed `ICurrentActor`) |

**Depended on by:** `004`, `007`, `009`, `011`, `012`, `013`, `017`, `019` — every feature
that changes state. That is the argument for its position in Phase 0.

## Risks and trade-offs

### Considered and rejected: an EF Core `SaveChangesInterceptor` that writes the audit row

The shortest possible implementation, and it needs no marker interface, no behaviour, and no
architecture test — the audit row is written for every tracked change automatically, so
nothing can be forgotten.

Rejected, and ADR-008 rejected it first: an interceptor sees `UPDATE tickets SET status =
'Open'` and cannot tell a triage from a reopen from a correction. **The business action is
the thing an auditor needs**, and it exists only in the application layer. An interceptor
also records every incidental column touch as an event, filling the table with noise that
buries the entries someone is actually looking for.

**What was kept from it:** the interceptor, stripped down to capturing the field diff and
nothing else (`research.md` R-1). The action, the entity, the outcome, and the write all stay
in the behaviour, so the ADR's objection does not apply to what remains.

### Considered and rejected: the pipeline owns `SaveChanges`, handlers never call it

Genuinely attractive. It gives one `SaveChanges` per request covering the business change and
the audit row together, makes the diff trivially available before the save, and removes the
interceptor entirely — the "same transaction" guarantee becomes "the same `SaveChanges`",
which is stronger than what BR-9.3 asks for.

Rejected on a concrete cost: a handler could then never read a database-generated value for
its response, and `007`'s **frozen** contract returns `version`, the base64 `rowversion`,
which SQL Server produces only on save. Every command returning a version would need an extra
round trip, and the first handler that needs one would quietly call `SaveChanges` anyway — at
which point its diff is silently lost and the design has become a convention.

**Contained instead of adopted:** the accumulator merges diffs across multiple saves, so a
handler calling `SaveChanges` twice produces one merged `Changes` and one row (AC-25).

### Considered and rejected: one `sa` connection string, with the `DENY` in place anyway

Simplest to run, matches `001`'s single connection string, and needs no login provisioning in
the fixture.

Rejected because `DENY` does not restrict a member of `sysadmin`. BR-9.5 would be
implemented, documented, tested, and **completely ineffective**, with a green suite and a
document claiming a guarantee the database is not making. That is worse than not implementing
it, because the claim would be believed.

**The cost of rejecting it is real** and is accepted: two connection strings, a role created
by a migration, and a login provisioned per test run. AC-13 is what makes the difference
observable rather than asserted.

### Considered and rejected: write the audit row after the transaction commits, on every path

Uniform — one code path, no asymmetry to get wrong, and the BR-9.4 special case disappears.

Rejected because it inverts BR-9.3. A commit followed by a failed audit write leaves a change
with no record; a rollback followed by a successful audit write leaves a record of a change
that never happened. ADR-008 is explicit that *"a log recording things that did not happen is
worse than no log"*, and both failures are silent.

The asymmetry is the price of the guarantee, which is exactly why it gets AC-6, AC-8, AC-9,
and its own test file rather than a comment.

### Accepted risk: the NFR-10 rule test has an empty population at this phase

`Wasl.Api` contains zero `ICommand` implementations when this feature closes, so the rule test
passes by iterating nothing. Contained by the scanner self-test (AC-14b), which runs the same
scanner over a deliberate violator, and by `004` populating the real set. Named as assumption
A-5 rather than left to be discovered at `007`.

### Accepted risk: `Changes` puts personal data in a table with indefinite retention

Customer emails and phone numbers appear in diffs, `EntityLabel` carries names, and Q-9 leaves
retention open. ADR-008 already lists this as a consequence. This feature reduces it where a
rule exists (BR-9.7 redaction) and does not invent a retention period where none was given —
`spec.md` Q-1 and Q-6 carry it forward rather than resolving it quietly.

### Accepted risk: MediatR constrained open generics are unverified at planning time

Assumption A-3. The verification command and the fallback design are both in
`research.md` R-3, so the fallback is a decision already made rather than one taken under
pressure mid-task.
