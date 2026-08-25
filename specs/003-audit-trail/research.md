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

**The trap.** The obvious implementation catches the exception in `AuditBehaviour` and adds
the audit row to the same `DbContext`. That `DbContext` is enrolled in the transaction
`TransactionBehaviour` is about to roll back, so the row is created and then destroyed. The
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
`AuditBehaviour<TRequest, TResponse> where TRequest : IAuditableCommand<TResponse>` so the
compiler, not a runtime `if`, decides which requests are audited. If the container cannot
close a constrained open generic, registration throws at startup for every non-auditable
request — or worse, silently resolves nothing.

**Status: SETTLED BY RUNNING IT, 2026-08-25.** It was recorded as assumption A-3 and left
unverified because there was nothing to run it against. The product owner required the
verification before implementation, so it was run.

**How.** `dotnet test --filter PipelineOrderTests` — the command this note originally named —
could not be the answer: that test is part of `003` and does not exist yet. So the check was a
throwaway console spike, outside the repository, modelling the three real behaviours with the
three real constraints against MediatR **14.2.0**, the version `Wasl.Application` declares.

```text
MediatR assembly: 14.0.0.0

AuditableCommand   (ICommand + IAuditableCommand<string>)
  pipeline: Transaction -> Audit(Probe.Audited) -> Validation

PlainCommand       (ICommand only)
  pipeline: Transaction -> Validation

PlainQuery         (neither marker)
  pipeline: Validation
```

**The constraint resolves, and it filters correctly.** Three things were in question and all
three are answered:

| Question | Observed |
|---|---|
| Does the container close a constrained open generic at all? | Yes. `AuditBehaviour` ran for `AuditableCommand` |
| Does it apply **only** where the constraint holds? | Yes. `PlainCommand` implements `ICommand` but not `IAuditableCommand<T>`, and `AuditBehaviour` did not run for it. `PlainQuery` implements neither and got `Validation` alone |
| Does registration **throw at startup** for requests that do not satisfy the constraint — this note's stated fear? | **No.** Nothing threw. The non-matching behaviour is simply absent from the resolved list |

**So the fallback is not needed and is not built.** It stays written down below, because the
constraint is a property of a package version: if MediatR is upgraded and the constrained
behaviour stops resolving, the fallback is the decision already taken rather than one made
under pressure.

**Fallback, if that day comes:** one unconstrained `AuditBehaviour<TRequest, TResponse>` with
`if (request is not IAuditableCommand) return await next(ct);` at the top. Identical
semantics, less compile-time help, and the architecture test in AC-14 already covers the gap
the constraint would have closed.

**A second finding, not asked for and worth more than the first was.** The spike's bare
`ServiceCollection` threw before it could resolve anything:

```text
System.InvalidOperationException: MediatR requires ILoggerFactory to be registered.
Call services.AddLogging() before services.AddMediatR().
```

MediatR 14 requires `ILoggerFactory` at registration. `WebApplicationBuilder` adds logging by
default, so `Wasl.Api` and anything booted through `WaslApiFactory` are fine — and `002`'s 33
green tests are the evidence. But **a pipeline-order test written against a hand-built
`ServiceCollection` will throw**, and the exception names a logging problem rather than the
thing being tested. `TEST-003-05` should resolve the behaviour list from the real host, or call
`AddLogging()` first. Recorded because the failure message points away from the cause.

**Where the spike lives:** the session scratchpad, not the repository —
`scratchpad/r3-spike/`. It is deleted with the session. What survives is this note and the
output above, which is the point: the artefact is disposable, the observation is not.

---

## R-4 · `DENY` is on the table — but does it apply to the connection the application uses?

> **Deferred to `003b`, 2026-08-25, by product-owner decision.** Everything in this note
> stands; none of it is built in `003`. The audit log is append-only by application
> convention until `003b` lands the `wasl_app` role, the restricted connection string, and
> AC-12/AC-13. Deferred whole rather than halved, because `DENY` without AC-13 is precisely
> the decorative case this note identifies. **And one thing this note did not consider:**
> local development runs against the local named instance `SQLEXPRESS` over Windows auth,
> where the developer is almost certainly `sysadmin` — so the same code passes AC-13 in the
> container and fails it locally, or is never run locally and is believed. `003b` owns that too.

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
`dbo.AuditLog`. ADR-010's project sketch — rejected, but not on this point — names the domain type `Audit/AuditEntry`.

**Settled:** the CLR type is `AuditEntry`, the table is `AuditLog`, mapped with
`ToTable("AuditLog")`, and the `DbSet` is named `AuditLog`. One row is an entry; the table
is the log. Recorded because two names for one thing is how a "missing" file gets recreated
alongside the one that already exists.

---

## R-7 · Where do `ICommand` and `IAuditableCommand` live?

**The constraint:** `Wasl.Domain` has zero package references, ever (ADR-002, constitution
III). Both markers derive from or are consumed by MediatR types, so neither can live there.

**Settled:** `src/Wasl.Application/Common/Messaging/`. Under ADR-002 the commands themselves
live in `Wasl.Application/Features/`, so their markers belong in the same project — a marker
in `Wasl.Api` would be referenced by every slice in a project that sits *above* them in the
dependency direction, which does not compile. One new folder beyond the set named in
`docs/sdd/02-architecture.md`, justified: the markers are consumed by two behaviours and by
every future use case, so putting them inside `Behaviours/` would make every use case depend
on a folder named after infrastructure it does not use.

**Reconciled 2026-08-25.** This research note previously said `Wasl.Api/Common/Messaging/`,
which was correct only under the two-project sketch ADR-010 proposed and which was rejected.

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

`docs/sdd/02-architecture.md` names the files `ValidationBehaviour.cs`,
`TransactionBehaviour.cs`, `AuditBehaviour.cs` in a folder called `Behaviours/`. Every prose
document says "behaviour". Checked in case a folder was being created twice under two
spellings.

**Settled:** code and file names follow the blueprint exactly — `Behaviours/`,
`AuditBehaviour`. Prose keeps "behaviour". No decision rides on it, and it is written down
only so nobody creates `Behaviours/` next to `Behaviours/`.

---

## R-13 · What does `002` actually expose, and does anything in this design assume something it does not?

**Checked:** `specs/002-error-contract/spec.md` and `plan.md` as specified, rather than
guessing at the seam. Three findings, two of which changed this feature's design.

| Found in `002` | Effect here |
|---|---|
| One accessor — `Wasl.Api/Common/Errors/TraceContext.cs`, `internal` to that project — read by the response body **and** the log scope, with the `Activity.Current` → `HttpContext.TraceIdentifier` fallback handled there (`002` A-3) | **Changed twice.** `003` reads that derivation rather than re-deriving from `Activity.Current`. BR-9.9 asks for one identifier in three places; three callers each computing the obvious thing is exactly how they end up differing, and the divergence would appear only when `Activity.Current` happened to be null — an intermittent AC-21 failure is worse than a constant one. **And it cannot be read directly:** the accessor sits in `Wasl.Api`, which is *above* the behaviours in the dependency direction. It is reached through `IRequestContext` — see R-14 |
| `401`, `403`, `404`, `405`, and `415` are produced **with no exception thrown** | **Changed.** There is no denial exception type to key on, and a middleware-level `403` never reaches MediatR, so `AuditBehaviour` cannot see it at all. The classifier keys on `DomainException.ErrorCode` for denials raised *inside* a handler (`011`'s case), and BR-9.2's middleware denials are `004`'s to write through `WriteIndependentAsync`. `spec.md` Q-4 |
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

---

## R-14 · Where can a transaction behaviour live, given `IApplicationDbContext` exposes no EF Core type?

**Decided by the product owner, 2026-08-25.** Recorded here because the alternatives are
all defensible and the reason for the choice is the useful part.

**The constraint, checked against the code rather than the plan:**
`src/Wasl.Application/Common/Abstractions/IApplicationDbContext.cs` as `001` shipped it has
four members — `IQueryable<Customer>`, `Add`, `Remove`, `SaveChangesAsync`. There is nothing
that opens a transaction, and `BeginTransactionAsync()` returns `IDbContextTransaction`,
which is an EF Core type. `tests/Wasl.Application.Tests/Architecture/LayerDependencyTests.cs`
reads the **declared** `PackageReference` set of `Wasl.Application`, so putting that type on
the interface fails the build rather than merely being untidy.

**Three options were put to the product owner:**

| Option | Cost |
|---|---|
| (a) Declare `IUnitOfWork` / `ITransaction` in `Wasl.Application`, implement in `Wasl.Infrastructure` | Two interfaces wrapping something EF Core already provides. The same objection raised against `IApplicationDbContext` at `001`, arriving a second time |
| **(b) Put `TransactionBehaviour` and `AuditBehaviour` in `Wasl.Infrastructure`** | One line of `CLAUDE.md`'s project-structure block moves; `MediatR` is added to `Wasl.Infrastructure.csproj`; one of three behaviours sits in a different project from the other two |
| (c) Relax the rule — expose `IDbContextTransaction`, exempt it from the architecture test | Rejected before it was offered as equal. The first exception in a guard whose stated purpose is "the whole return on four projects" is what makes the second one cheap |

**Settled: (b).** Infrastructure may see EF Core, so the behaviours use `WaslDbContext`
directly with no wrapper. The boundary stays strict with **no exemption**, which is the part
that matters — a guard with one exception is a guard that needs a policy, and this project
has nine hours.

**Verified, not assumed:** `LayerDependencyTests` constrains `Wasl.Domain` (zero packages)
and `Wasl.Application` (no EF Core, no ASP.NET Core). **No test constrains
`Wasl.Infrastructure`**, so adding MediatR there breaks nothing. Checked by reading the five
test methods, not by inferring from the file's name.

---

## R-15 · Does the behaviour order survive being registered in two projects?

**No, and it fails silently. This is the finding R-14 created.**

**Checked:** `src/Wasl.Api/Program.cs` and
`src/Wasl.Application/DependencyInjection.cs` as `002` shipped them.

MediatR resolves `IEnumerable<IPipelineBehavior<,>>` from the container, so **registration
order is execution order**. `002` registers `ValidationBehaviour` inside `AddApplication()`,
and `Program.cs` calls:

```csharp
builder.Services.AddInfrastructure(builder.Configuration);   // line 14
builder.Services.AddApplication();                           // line 18
```

Infrastructure **first**. So if `AddInfrastructure` gained the two new behaviours, the
resulting order would be `Transaction → Audit → Validation`.

**That is not a deduction any more. It was observed, 2026-08-25**, by the same spike that
settled R-3 — registering the two behaviours in a first `AddMediatR` call and
`ValidationBehaviour` in a second, exactly as `Program.cs` orders them today:

```text
Resolved IPipelineBehavior<AuditableCommand,string> order:
  TransactionBehaviour -> AuditBehaviour -> ValidationBehaviour
```

Validation last. The inversion is real, it needs no unusual configuration to trigger, and it
is what the obvious implementation produces. This note previously closed by saying that if the
cross-call ordering ever mattered it would need a test and not a paragraph — so it got one, and
the paragraph was wrong to be comfortable.

**What that breaks:** `spec.md` Q-3 — a `400` would open a transaction and write an audit
row, so the table would collect a row for every mistyped form. And AC-15. Neither throws.
The suite stays green, the log fills with rows describing changes that never happened, and
the defect is found by someone reading the audit table months later.

**Settled:** all three behaviours are registered **once, in declared order, in `Wasl.Api`**.
`AddApplication()` keeps its validator and handler scanning and loses its
`AddOpenBehavior` line. AC-15 asserts against that single list.

**Rejected: swapping the two `Add*` calls in `Program.cs`.** It is two lines and it works.
It also makes execution order depend on the relative position of two calls that look
independent, so the next person to tidy `Program.cs` alphabetically reintroduces the defect —
and reintroduces it silently. The comment `002` already left at its registration site
reserves the slot, which was the right instinct under one-project registration and is not
enough across two.

**Consequence recorded rather than absorbed:** this edits a delivered feature. It is one
deleted line in `Wasl.Application/DependencyInjection.cs`, and it belongs in `003`'s
`summary.md` as a deviation.
