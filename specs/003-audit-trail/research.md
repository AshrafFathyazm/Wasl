# 003 — Research

Questions that had to be answered before the plan could be written, what was checked, and
what each one settled. Two of them turned out not to matter, and they are recorded as such
— "we looked and it did not matter" is information, and it stops the same question being
re-opened during implementation.

---

## R-1 · Where does the field diff come from, if the handler has already saved?

**The problem.** BR-9.8 requires `Changes` to hold the fields that actually changed, before
and after. The EF change tracker knows that — `EntityEntry.OriginalValues` versus
`CurrentValues` — but only **until** `SaveChanges` accepts the changes. After that, every
entry is `Unchanged` and the two collections are equal. A behaviour that reads the tracker
after `await next()` therefore produces an empty diff on every command.

It produces an **empty diff, not an error.** `Changes` comes back `{}` or `null`, the row
still exists, `SELECT COUNT(*)` still returns 1, and every test that only counts rows stays
green. This is the single most likely way this feature ships broken.

**Options weighed:**

| Option | Cost |
|---|---|
| The pipeline owns `SaveChanges`; handlers never call it. The behaviour then reads the tracker before saving | Structurally clean and gives one `SaveChanges` for the business change and the audit row together. **But** a handler can no longer read a database-generated value for its response — and `007`'s frozen contract returns `version`, the base64 `rowversion`, which SQL Server only produces on save. Every command that returns a version would need a second round trip anyway |
| A `SaveChangesInterceptor` that **captures** the diff into a scoped accumulator, merging across multiple saves. The behaviour composes and writes the row afterwards | One extra type. Handlers keep calling `SaveChanges` and keep their generated values. Multiple saves in one request merge instead of overwriting |

**Settled: the interceptor, as a capturer only.**

ADR-008 rejects a `SaveChangesInterceptor` explicitly — worth quoting the objection rather
than paraphrasing it: *"An interceptor sees `UPDATE tickets SET status = 'Open'`. It cannot
see whether that was a triage, a reopen, or a correction — and the business action is the
thing an auditor needs."*

That objection is about **which action is recorded**, and it still holds: the action comes
from `IAuditableCommand.AuditAction`, the outcome from the classifier, the entity from the
command. The interceptor decides nothing and writes nothing. It answers one narrow
question — *which properties changed value on this save* — which is the one question the
change tracker is the only correct source for.

**Consequence for the plan:** `AuditDiffInterceptor` is registered on the `DbContext`, and
`AuditDiffAccumulator` is scoped so it spans the whole request. AC-18 and AC-19 are the
tests that this is real, and they assert on content, never on presence.

---

## R-2 · How does a `Denied` or `Failed` row survive the rollback of the thing that failed?

**The trap.** The obvious implementation catches the exception in `AuditBehavior` and adds
the audit row to the same `DbContext`. That `DbContext` is enrolled in the transaction
`TransactionBehavior` is about to roll back, so the row is created and then destroyed. The
request still returns the right status code, the log still shows the error, and the audit
row — the only durable record that someone was denied — is gone. BR-9.4 exists because of
exactly this.

**Checked:** how EF Core scopes a transaction, and whether a second connection inside an
open transaction escalates to a distributed transaction.

**Settled:** the failure path writes through a **second, short-lived `DbContext`** obtained
from `IDbContextFactory<WaslDbContext>`, which opens its own connection and its own
implicit transaction. `Database.BeginTransactionAsync` is connection-scoped, not ambient —
there is no `TransactionScope` in this design, so nothing enlists automatically and no
MSDTC promotion can occur. The second connection commits while the first rolls back.

**Rejected:** rolling back first and then writing on the original context. It works, but it
puts the ordering constraint in two behaviours instead of one, and "roll back before you
audit" is precisely the kind of ordering that survives review and dies in a refactor.

**Rejected:** writing the failure row to a log file and reconciling later. Logs rotate away
and are not queryable by entity — ADR-008's first rejected alternative, for the same reason.

**Lock contention** was the residual worry and it does not arise: on the failure path the
business transaction has never inserted into `AuditLog`, so the two connections touch
disjoint objects. That is assumption A-6, and BR-9.1's "exactly one row" is what keeps it
true.

---

## R-3 · Does MediatR resolve **constrained** open-generic pipeline behaviours?

**Why it matters.** The design wants
`AuditBehavior<TRequest, TResponse> where TRequest : IAuditableCommand<TResponse>` so the
compiler, not a runtime `if`, decides which requests are audited. If the container cannot
close a constrained open generic, registration throws at startup for every non-auditable
request — or worse, silently resolves nothing.

**Status: NOT SETTLED HERE.** This is a property of the MediatR version and the container,
and it is verified by running it, not by recalling it. Recorded as assumption A-3.

**How it gets verified, before `BE-003-05` is written:**

```bash
dotnet test tests/Wasl.Api.IntegrationTests --filter FullyQualifiedName~PipelineOrderTests
```

The order test (AC-15) resolves `IEnumerable<IPipelineBehavior<TRequest, TResponse>>` for
both an auditable probe command and a non-auditable probe query. If the constrained
behaviour appears for the query, or is missing for the command, the test fails and the
fallback applies.

**Fallback, decided now so it is not designed under pressure:** one unconstrained
`AuditBehavior<TRequest, TResponse>` with `if (request is not IAuditableCommand) return
await next();` at the top. Identical semantics, less compile-time help, and the
architecture test in AC-14 already covers the gap the constraint would have closed.

---

## R-4 · `DENY` is on the table — but does it apply to the connection the application uses?

**Checked:** what `DENY` does and does not restrict, and what `Testcontainers.MsSql`
connects as.

**Found, and it is the whole point of AC-13:**

- `DENY` does **not** restrict a member of `sysadmin`, and permission checks are skipped
  entirely for `db_owner` on its own objects. A `DENY UPDATE` against a connection running
  as `sa` is decorative.
- `Testcontainers.MsSql` gives you `sa`. So does most local development. So does the
  default connection string in a hurry.

The consequence is that BR-9.5 can be fully implemented, fully tested, and completely
ineffective, with a green suite. That is worse than not implementing it, because the
document now claims a guarantee the database is not making.

**Settled, three parts:**

1. The grant targets a **database role** named `wasl_app`, created idempotently by the
   migration (`IF DATABASE_PRINCIPAL_ID('wasl_app') IS NULL`). ADR-013's `TO wasl_app`
   reads as a user; a role is the same grant with one fewer coupling — the login name can
   change per environment without touching the migration, and no password ever enters a
   migration file.
2. **Two connection strings.** `ConnectionStrings:Migrations` is an owner and runs
   `dotnet ef database update`. `ConnectionStrings:Default` is a member of `wasl_app` and
   is what the running application uses. A least-privileged principal cannot run DDL, so
   one connection string cannot do both jobs.
3. The integration fixture **creates** the least-privileged login itself after migrating,
   with a password generated per run, and points the API under test at it. Nothing is
   committed, and every integration test in the suite then runs against the same
   permissions production has.

**Rejected:** one `sa` connection string with the `DENY` in place anyway, documented as
"enforced in production". That is a claim with no evidence behind it, and AC-13 exists to
make it impossible to make accidentally.

**`DENY` over `REVOKE`** was already decided in ADR-013 row 10 and is not re-litigated here:
`DENY` outranks a grant inherited from role membership, so adding the login to
`db_datawriter` later cannot quietly undo it.

---

## R-5 · Does the NFR-10 architecture test mean anything at Phase 0?

**Checked:** how many types implement `ICommand` at the end of this feature. **Zero.**
`001` ships `/health`, `002` ships error mapping, and the first production command is
`004`'s sign-in.

So the test that is supposed to fail the build when a command is not auditable will pass —
by iterating an empty sequence. It will keep passing for as long as nobody notices, and if
the scanner is subtly wrong (wrong assembly, wrong interface, generic variants missed) that
is discovered at `007` or later, when the retrofit this feature exists to avoid is already
needed.

**Settled: two tests, and the second one is the load-bearing one at this phase.**

| Test | Asserts |
|---|---|
| `CommandsAreAuditableTests.EveryCommandInWaslApi_ImplementsIAuditableCommand` | The rule (NFR-10). Population is 0 today, 1+ from `004` |
| `CommandsAreAuditableTests.Scanner_WhenGivenACommandWithoutIAuditableCommand_ReportsIt` | The **scanner** finds a deliberate violator defined in the test assembly. This is what proves the first test can fail at all |

**Rejected:** skipping the rule test until `004`. A skipped test is the silent hole with a
label on it — `001`'s AC-9 already refuses a skipped suite without an explicit reason, and
this would be one.

**Rejected:** asserting the population is non-empty. It would be red for the whole of
Phase 0, and a permanently red test trains people to ignore the suite.

**Where it lives:** `Wasl.Api.IntegrationTests`, because that is the only test project
referencing `Wasl.Api`, and a third test project for one reflection test is not warranted.
It is a plain class with **no fixture**, so it does not start a container — a reflection
test that needs Docker to run is a reflection test nobody runs.

---

## R-6 · `AuditLog` or `AuditEntry`? The blueprint uses both

**Checked:** `docs/sdd/03-domain-model.md` names the entity `AuditLog` and the table
`dbo.AuditLog`. ADR-010's project sketch names the domain type `Audit/AuditEntry`.

**Settled:** the CLR type is `AuditEntry`, the table is `AuditLog`, mapped with
`ToTable("AuditLog")`, and the `DbSet` is named `AuditLog`. One row is an entry; the table
is the log. Recorded because two names for one thing is how a "missing" file gets recreated
alongside the one that already exists.

---

## R-7 · Where do `ICommand` and `IAuditableCommand` live?

**The constraint:** `Wasl.Domain` has zero package references, ever (ADR-010, constitution
III). Both markers derive from or are consumed by MediatR types, so neither can live there.

**Settled:** `src/Wasl.Api/Common/Messaging/`. One new folder beyond the set named in
`docs/sdd/02-architecture.md`, justified: the markers are consumed by two behaviours and by
every future slice, so putting them inside `Behaviors/` would make every slice depend on a
folder named after infrastructure it does not use.

`AuditEntry`, `AuditOutcome`, `AuditTarget`, `AuditFieldChange`, and `AuditRedaction` all
**do** live in `Wasl.Domain/Audit/` — they reference nothing but the BCL, and BR-9.7 is a
business rule, which the constitution puts in the domain, once.

---

## R-8 · How does the audit row learn the entity id when the id only exists after the handler runs?

**Checked:** the three shapes this can take.

| Shape | Problem |
|---|---|
| The handler calls `auditContext.Describe(id, label)` | A handler that forgets produces a row with a null `EntityId`. "Everything that touched this record" then misses it, and nothing announces it |
| The behaviour infers the entity from the change tracker | It cannot tell the aggregate from the incidental — a comment write touches `TicketComments` and `Tickets`, and only one of them is what the action is about |
| `IAuditableCommand<TResponse>.DescribeTarget(TResponse? response)` on the command itself | The compiler requires it. Nothing to forget |

**Settled: the third.** The command describes its own target, from the response when there
is one and from its own fields when there is not — which is also what makes the failure path
work, since a denied command has no response but does know which ticket it was refused
against.

The consequence is that a command's response must carry the id and the label. `007`'s
frozen contract already returns `id` and `fullName`; `009`'s returns `ticketNumber`. No
contract changes.

---

## R-9 · Can EF Core express all four indexes and the check constraint in fluent configuration?

**Checked:** what the migration needs to produce, against what the fluent API covers.

| Needed | Fluent |
|---|---|
| Descending index key (`OccurredAtUtc DESC`) | `HasIndex(...).IsDescending(...)` |
| Filtered index (`WHERE Outcome <> 'Success'`) | `HasIndex(...).HasFilter("[Outcome] <> 'Success'")` |
| `CHECK (Changes IS NULL OR ISJSON(Changes) = 1)` | `ToTable(t => t.HasCheckConstraint(...))` |
| `bigint IDENTITY(1,1)` | `ValueGeneratedOnAdd()` on a `long` key — the SQL Server default |
| `GRANT` / `DENY` / `CREATE ROLE` | Not expressible. `migrationBuilder.Sql(...)`, in the same migration |

**Settled:** all of it in one migration, `AddAuditLog`, with the permission statements as
raw SQL at the end. Nothing here needs a hand-edited migration body beyond that.

**Not trusted, tested:** the filter is the part that goes missing silently, so AC-3 reads
`sys.indexes.filter_definition` rather than the migration file. `docs/sdd/03-domain-model.md`
already says why: a filtered index whose `filter_definition` is `NULL` was created without
its `WHERE` clause.

---

## R-10 · Does `AuditLog` need a concurrency token? — *it does not, and that is settled quickly*

Recorded because the omission looks like a mistake next to `Customers`, `Tickets`, and
`SupportUsers`, all of which have one.

`AuditLog` is append-only and nothing ever updates a row, so there is no second writer to
conflict with. ADR-006 as amended by ADR-013 scopes `rowversion` to *"the entities that two
people edit at once"*, and `docs/sdd/03-domain-model.md` names `TicketComments`,
`TicketHistory`, and `AuditLog` as the exceptions. AC-5 asserts the absence so that
"add `rowversion` to be safe" is a change someone has to argue for.

---

## R-11 · Did the American/British spelling split in the blueprint matter? — *no*

`docs/sdd/02-architecture.md` names the files `ValidationBehavior.cs`,
`TransactionBehavior.cs`, `AuditBehavior.cs` in a folder called `Behaviors/`. Every prose
document says "behaviour". Checked in case a folder was being created twice under two
spellings.

**Settled:** code and file names follow the blueprint exactly — `Behaviors/`,
`AuditBehavior`. Prose keeps "behaviour". No decision rides on it, and it is written down
only so nobody creates `Behaviours/` next to `Behaviors/`.

---

## R-13 · What does `002` actually expose, and does anything in this design assume something it does not?

**Checked:** `specs/002-error-contract/spec.md` and `plan.md` as specified, rather than
guessing at the seam. Three findings, two of which changed this feature's design.

| Found in `002` | Effect here |
|---|---|
| One accessor — `Common/Errors/TraceContext.cs` — read by the response body **and** the log scope, with the `Activity.Current` → `HttpContext.TraceIdentifier` fallback handled there (`002` A-3) | **Changed.** `003` reads that accessor instead of re-deriving from `Activity.Current`. BR-9.9 asks for one identifier in three places; three callers each computing the obvious thing is exactly how they end up differing, and the divergence would appear only when `Activity.Current` happened to be null — an intermittent AC-21 failure is worse than a constant one |
| `401`, `403`, `404`, `405`, and `415` are produced **with no exception thrown** | **Changed.** There is no denial exception type to key on, and a middleware-level `403` never reaches MediatR, so `AuditBehavior` cannot see it at all. The classifier keys on `DomainException.ErrorCode` for denials raised *inside* a handler (`011`'s case), and BR-9.2's middleware denials are `004`'s to write through `WriteIndependentAsync`. `spec.md` Q-4 |
| `DomainException` is abstract, lives in `Wasl.Domain`, and carries a **string** `ErrorCode` — deliberately no HTTP status, because the domain holds no HTTP concept | **Confirmed, no change.** Keying the classifier on a string code rather than on a status keeps `003` out of the HTTP vocabulary too, and it is one file when the codes are renamed |

**Why this is recorded rather than just applied:** both changed items are places where the
obvious local implementation is correct in isolation and wrong in the system.
`Activity.Current?.Id` produces a valid trace id; it is simply not *the* trace id. That is
the class of defect BR-9.9 exists to prevent, so the reasoning belongs next to the design
rather than in a commit message.

---

## R-12 · Should the probe command that proves the pipeline live in `Wasl.Api`?

**Checked:** what the exit condition in `specs/README.md` actually requires — *"one command
produces one audit row in the same transaction"* — and what a production probe would cost.

**Settled: no.** The probe commands and the `/__test/probe` endpoint that dispatches them
are defined in `Wasl.Api.IntegrationTests` and registered only on the test host through
`WaslApiFactory`. `Wasl.Api` gains no endpoint, no command, and no dead type.

**Rejected:** a `Development`-only endpoint in `Wasl.Api`. It is a real HTTP surface that
has to be excluded from the contract, from the OpenAPI document, and from the auth policy —
and an endpoint that dispatches an arbitrary command is the kind of thing that survives into
an environment where `ASPNETCORE_ENVIRONMENT` was set wrong.

**Consequence:** MediatR must discover handlers in the test assembly, so `WaslApiFactory`
calls `RegisterServicesFromAssemblies` with both. That is one line in the factory and it is
named in [`plan.md`](plan.md) rather than discovered.
