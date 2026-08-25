# 003 — Summary

**`003` core, implemented 2026-08-25. Build clean, 93 tests, 93 passed, 0 skipped** — 60 of
them new. Evidence in [tests.md](tests.md); AI usage in [ai-notes.md](ai-notes.md).

**The `·b` least-privilege block is not built.** So, stated plainly and not left to be
inferred: **the audit log is append-only by application convention, not by database
permission.** No `wasl_app` role, no `GRANT`, no `DENY`, no restricted connection string, and
AC-12/AC-13 unverified. `003b` owns that block whole.

---

## What was built

| Task | What exists now |
|---|---|
| `BE-003-01` | `Wasl.Domain/Audit/` — `AuditEntry` (private setters, one factory, no mutator), `AuditOutcome`, `AuditTarget`, `AuditFieldChange`. Still zero package references in that project |
| `BE-003-02` | `AuditRedaction` — BR-9.7's deny-list, exact and case-insensitive, plus the entity-qualified `TicketComments.Body` |
| `BE-003-03` | `ICommand` and `IAuditableCommand<TResponse>` in `Wasl.Application/Common/Messaging/` |
| `BE-003-04` | `dbo.AuditLog` — 14 columns, `bigint IDENTITY`, no foreign keys, `CK_AuditLog_ChangesIsJson`, four indexes including the filtered one. Migration `AddAuditLog` |
| `BE-003-07` | `ICurrentUser` · `IRequestContext` · `IAuditWriter` declared in `Wasl.Application`; `HttpCurrentUser` · `HttpRequestContext` · `ActorClaimTypes` implemented in `Wasl.Api` |
| `BE-003-08` | `AuditDiffAccumulator` (scoped, spans the request) + `AuditDiffInterceptor` (captures before the save, decides nothing) |
| `BE-003-09` | `AuditChangeSerializer` — redacted, ordered deterministically, `null` and never `[]` |
| `BE-003-10` | `AuditOutcomeClassifier` — `forbidden` → `Denied`, else `Failed`, client cancellation → not audited |
| `BE-003-11` | `AuditWriter` — two methods, and the difference between them is BR-9.4 |
| `BE-003-12/13` | `TransactionBehaviour` and `AuditBehaviour` in `Wasl.Infrastructure/Persistence/Behaviours/` |
| `BE-003-14` | `WaslPipeline.DeclaredOrder` in `Wasl.Api` — the single ordered list AC-15 asserts against |

Three things are now structural rather than remembered: a handler cannot forget to write an
audit row, cannot forget to open a transaction, and cannot add a command without declaring what
to audit — the last enforced by a build failure.

---

## Trade-offs

**Two of three behaviours live in a different project from the third.** `TransactionBehaviour`
and `AuditBehaviour` are in `Wasl.Infrastructure` because both need a real transaction, and
`IApplicationDbContext` deliberately exposes no EF Core type. The alternative was an
`IUnitOfWork`/`ITransaction` pair in `Wasl.Application` — two interfaces wrapping something EF
Core already provides. The product owner chose the move. The cost is a line of `CLAUDE.md`'s
project-structure block and one asymmetry a reader has to be told about; the gain is that the
architecture boundary keeps **no exemption**, and a guard with one exception is a guard that
needs a policy.

**`002`'s registration site moved.** `AddApplication()` no longer registers
`ValidationBehaviour`. That is an edit to a delivered feature, and it was not optional:
`Program.cs` calls `AddInfrastructure` first, so behaviours registered per project came out
`Transaction → Audit → Validation` — validation last. The cheaper fix, swapping two lines in
`Program.cs`, was rejected because it makes execution order depend on the relative position of
two calls that look independent.

**English sentences still live in C#, inherited from `002`.** `003` adds one more: the
`AuditWriter` failure log message. BR-9.10 says audit and log content is always English, so
unlike `002`'s `StaticProblemMessageSource` this one is correct where it is and `005` does not
touch it.

**Reflection in the test project to mutate `Customer`.** The entity is a shell until `007`
gives it a factory, so there is no legitimate way to populate or change one. Confined to two
test-project classes. The alternative was a public setter on a domain entity for a test's
benefit.

**The probes are the only consumer.** MediatR's pipeline currently carries test traffic only.
Building it now is the `PHASES.md` rule — add a cross-cutting concern when there is exactly one
consumer; zero is speculative, seven is a retrofit — and `009` is that consumer. It is still
fair to say nothing in `src/` dispatches a command yet.

---

## Deviations from the plan

Seven. Two of them add work that was not planned.

| Deviation | Why |
|---|---|
| **`DomainErrorCodes.Forbidden` was added to `Wasl.Domain`** — not in any task | `spec.md` Q-4 assumed the code existed. It did not: `002` reserved a `forbidden` *registry row* for `004`, on the understanding that a `403` comes from auth middleware — true for a role-only check, and it means the middleware throws nothing so MediatR never sees it. BR-6's data-dependent checks are raised in the handler and *are* classifiable. Without the code, every in-handler denial would be recorded as `Failed`, losing the distinction AC-8 exists for |
| **`"forbidden"` was removed from `reservedByLaterFeatures` in `002`'s `ProblemRegistryTests`** | It is raisable now. Leaving it listed as reserved would be that test asserting something that had stopped being true |
| **`WaslPipelineBehaviours` — a public type list — was added to `Wasl.Infrastructure`** | Not in the plan. `Wasl.Api` needs the two behaviour `Type`s to register them in one ordered list, and the behaviours themselves stay `internal`. An `AddAuditPipeline()` extension would have been tidier and would have put the registration back in the project whose ordering was the defect |
| **`AddWaslPipeline` registers behaviours directly, not through `AddMediatR`** | MediatR requires an assembly per `AddMediatR` call and threw `"No assemblies found to scan"` at startup. This call contributes no handlers; supplying an assembly anyway would re-scan one `AddApplication` already scanned to satisfy a validation rather than a need |
| **`AC-3` was strengthened mid-implementation** to assert all four indexes **by name** | The generated migration had three. See below |
| **The `AC-4` test was rewritten over ADO.NET** rather than EF's `ExecuteSqlRaw` | `ExecuteSqlRaw` performs `{n}` placeholder substitution, so the deliberately malformed `{not json` threw `FormatException` in C# and the test never reached the database |
| **`TEST-003-10` not written** (validator message keys) | `003` adds no validator, so it would guard nothing. Stays with `002b` |

---

## The defect that would have shipped

`IX_AuditLog_Time` and `IX_AuditLog_NotSuccess` both cover `OccurredAtUtc`. Written with the
**unnamed** `HasIndex` overload, EF Core identifies an index by its property set — so the second
configuration silently replaced the first. The generated migration had **three indexes where
`data-model.md` specifies four**, and the one that vanished was the **unfiltered** one.

An AC-3 that asserted only "the filtered index kept its filter" would have passed:
`IX_AuditLog_NotSuccess` survived intact. Every time-ordered read — the "what happened
recently" query, the one an incident starts with — would have run without its index, and the
only symptom would have been slowness.

Found by reading the generated migration. No test could have caught it, because the test was
going to be written against the same wrong assumption. Fixed with the named overload, AC-3 now
asserts four by name, and the reason sits at the configuration site so the next person adding a
second index over one column meets it there.

---

## Watched failing

**The interceptor was deliberately broken**, moved from `SavingChanges` to `SavedChanges` so it
read the change tracker after the save had accepted it — `research.md` R-1's exact failure:

```text
Expected entry.Changes not to be <null> because the interceptor must have captured the change.
Failed!  - Failed: 4, Passed: 7, Total: 11
```

Four tests red, **and the row was still there.** `COUNT(*)` returned 1, the outcome was
`Success`, the business change committed — and `Changes` was `null` on every command.

That is the whole argument for AC-18 and AC-19 asserting content. Tests checking that a row
exists, or that `Changes` is present, would all have stayed green, and the feature would have
shipped an audit trail that records that something happened and never what.

The NFR-10 rule test was also proved red, against a temporary `ICommand` in
`Wasl.Application`, and it named the violator — which is what an empty result had to mean
before it could mean anything.

---

## Known limitations

| Limitation | Owner |
|---|---|
| **No database-enforced least privilege.** Append-only is an application property; a `db_owner` connection can update or delete a row | `003b` — `BE-003-05`, `BE-003-06`, `TEST-003-06`, `TEST-003-16`, `DOC-003-01`, deferred as one unit. Also owns the local-development wrinkle: `SQLEXPRESS` over Windows auth is `sysadmin`, where `DENY` is decorative and AC-13 would fail locally while passing in the container |
| **AC-7 asserted by construction, not by fault injection.** The success-path write is inside the transaction, so an audit failure fails the change — a property of the code path rather than an observed outcome | Injecting a failing audit insert needs a seam that does not exist. Adding one to make a test possible would weaken the guarantee |
| **AC-10 enforced by a signature.** `WriteIndependentAsync` takes no `CancellationToken`, so there is nothing to cancel — uncompilable to get wrong, unproven against a real client disconnect | `002b`, with the client-disconnect work |
| **AC-20's role-change half is untested.** The mechanism is proven — the columns hold what `ICurrentUser` returned at write time, which is null. Changing a role and re-reading a past row needs tokens | `004` |
| **AC-22 cannot currently fail.** No `RequestLocalizationMiddleware`, so `Accept-Language: ar` changes nothing. Written and passing vacuously | `005` — `TEST-003-14` |
| **AC-23's fake clock is not substituted.** `TimeProvider` is injected and the read-back `Kind` is asserted; the stored value is not compared against a fake | Needs per-test service override in `WaslApiFactory` |
| **`Down` drops the table and revokes nothing** | Correct today — there is nothing to revoke. Revisit with `003b` |
| **Q-1 and Q-6 remain open.** Retention is unanswered, and `EntityLabel` carries a customer's name into a table with indefinite retention | Q-1 is legal, not engineering. `spec.md` carries both with working assumptions |

---

## What the next feature inherits

- **`004-auth-and-roles`** gets `ICurrentUser` with one file to fill (`HttpCurrentUser`), one
  place for the claim names (`ActorClaimTypes`), `IAuditWriter.WriteIndependentAsync` for the
  auth events a pipeline behaviour cannot see, and `DomainErrorCodes.Forbidden` already
  registered. It also inherits AC-20's second half and the constraint that anything scoped must
  be passed to `002`'s singleton factory, never injected
- **`007-create-customer`** gets a pipeline where its command is audited by implementing an
  interface, and a build failure if it forgets. Its response already carries `id` and
  `fullName`, which is what `DescribeTarget` needs — no contract change
- **`009-create-ticket`** becomes the first production consumer of both behaviours
- **`005-localization-core`** inherits `TEST-003-14` and an AC-22 that acquires teeth the moment
  a second culture exists
- **`019-audit-log-access`** gets a queryable table with four indexes, each justified by one of
  the four SQL queries in [contracts/README.md](contracts/README.md), and a `Changes` document
  whose keys are stable and whose Arabic is readable without decoding
