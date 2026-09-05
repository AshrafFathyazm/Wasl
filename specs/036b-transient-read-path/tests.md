# 036b — Test evidence

**Run on** 2026-09-05 · SQL Server 2022 in Testcontainers · Docker 29.5.3
**Every number below was observed.**

---

## 1 · The final run

```
dotnet build --no-incremental
  Build succeeded.  0 Warning(s)  0 Error(s)

dotnet test --no-build
  Passed!  - Failed: 0, Passed: 189, Skipped: 0, Total: 189  Wasl.Domain.Tests.dll
  Passed!  - Failed: 0, Passed:  26, Skipped: 0, Total:  26  Wasl.Application.Tests.dll
  Passed!  - Failed: 0, Passed: 457, Skipped: 0, Total: 457  Wasl.Api.IntegrationTests.dll
```

**672 tests, 0 failures.** `036b` added 3 (457 up from 454).

## 2 · AC → test

| AC | Test | Result |
|---|---|---|
| AC-1 | `ReadPathDeadlockTests.A_deadlock_resolved_on_a_read_is_a_transient_conflict` | pass · control §4.1 |
| AC-2 | `ReadPathDeadlockTests.The_read_side_refusal_carries_the_same_code_and_retry_hint_as_the_write_side` | pass |
| AC-3 | same test — `RetryAfterSeconds >= 1` | pass |
| AC-4 | **NOT MET — see §3** | not met, with a reason |
| AC-5 | `ReadPathDeadlockTests.The_deadlocked_command_still_writes_its_failure_audit_row` | pass · **but not what it claimed, §4.2** |
| AC-6 | `PipelineOrderTests.The_resolved_behaviour_order_…` + `…matches_what_the_container_resolves` | pass, updated not loosened |
| AC-7 | `PipelineOrderTests.A_query_resolves_validation_only` | pass, expectation widened to two behaviours |
| AC-8 | `ConcurrencyAndDeadlockTests.A_deadlock_victim_is_a_transient_conflict_not_a_500` — `036`'s, unchanged | pass |
| AC-9 | §4 | half met, half **disproved** |

## 3 · AC-4 is NOT met, and the reason is the engine

AC-4 asked for a deadlock victim on a **query** — no command, no transaction of ours.

**It cannot be induced without changing the query.** Under READ COMMITTED a `SELECT` takes a
shared lock and releases it as soon as the row is read, so a pure reader holds nothing another
session could wait on. A deadlock needs a cycle, and a cycle needs both parties to hold
something. A read-only request can be *blocked* indefinitely; it cannot be a *victim*.

Making it one would need `HOLDLOCK`/`REPEATABLE READ` on the query under test — i.e. changing
the thing being measured, which is the definition of a useless measurement.

**What is asserted instead**, honestly and at the registration level:
`PipelineOrderTests.A_query_resolves_validation_only` now expects
`["TransientFailureBehaviour", "ValidationBehaviour"]`, proving the behaviour **is** in the
pipeline for a query and would translate if the engine ever did pick one. That is a weaker claim
than AC-4 made and it is the true one.

**Recorded as not met** rather than quietly satisfied by an easier test — `008` AC-3 and `002c`
AC-3 are recorded the same way.

## 4 · Negative controls

### 4.1 · Remove the behaviour from `DeclaredOrder` — AC-9's first half

```
[FAIL] ReadPathDeadlockTests.A_deadlock_resolved_on_a_read_is_a_transient_conflict
[FAIL] ReadPathDeadlockTests.The_read_side_refusal_carries_the_same_code_and_retry_hint_as_the_write_side
Failed!  - Failed: 2, Passed: 4, Total: 6
```

**AC-8 stayed green** — `036`'s write-path deadlock test passed throughout, which is the half
that matters: the new behaviour is what covers the read path, and `036`'s `SaveChangesAsync`
catch is still independently covering the write path. Two mechanisms, each with its own control.

### 4.2 · Register it innermost instead of outermost — **THE CONTROL THAT DID NOT FAIL**

```
DeclaredOrder = [Validation, Transaction, Audit, TransientFailure]

Passed!  - Failed: 0, Passed: 3, Total: 3
```

**Nothing went red.** The spec claimed AC-5 would: that translating inside `AuditBehaviour`
would make BR-9's failure row record `transient-conflict` instead of the fault.

It does not, and the reason is one line of `AuditOutcomeClassifier`:

```csharp
return exception is DomainException domain && IsDenial(domain.ErrorCode)
    ? AuditOutcome.Denied
    : AuditOutcome.Failed;
```

`TransientConflictException` is a `DomainException` whose code is not a denial, so it classifies
`Failed` — **exactly what the raw engine exception classifies as.** The audit row is
byte-identical from either position. The claim was plausible, was written into a spec, into two
code comments and into a test's remarks, and was wrong.

**What this leaves:** the outermost placement now rests on a single argument — a behaviour
registered inside `TransactionBehaviour` has already returned by the time the `COMMIT` runs, so
a deadlock resolved there would go untranslated. **That argument is unproven**: a COMMIT-time
deadlock could not be induced. So **no test goes red if someone moves that line**, and this file
says so rather than the comments implying a guard that does not exist.

`010` recorded its stable-sort guard as unproven for the same reason. `CLAUDE.md`'s rule is the
one being followed here: *a measurement that names the wrong thing is worse than no measurement,
because it is believed.*

### 4.3 · Both controls reverted

`grep -c "TransientFailure," src/Wasl.Api/Common/WaslPipeline.cs` → 1, in position 1.
Full suite re-run after restoring: **672 passed, 0 failed.**

## 5 · Guards updated, never loosened

`PipelineOrderTests` asserts a literal list *and* compares that literal against
`WaslPipeline.DeclaredOrder`, so the expectation cannot be edited to match a mistake without the
second test noticing. Both were updated to four behaviours in the same change as the
registration — AC-6.

`A_query_resolves_validation_only` was widened from one name to two. **This is the one place
`036b` weakened an assertion**, and it is deliberate: the behaviour is unconstrained on purpose,
so its presence for a query is the feature, not a leak. The rest of that test's claim — that a
query drags in neither `Transaction` nor `Audit` — is unchanged and still asserted (AC-7).

## 6 · What was NOT run

- **A COMMIT-time deadlock** — §4.2. Could not be induced.
- **A query-side deadlock** — §3. Cannot exist under READ COMMITTED without lock hints.
- **`--seed` / `--provision`** — no schema change; `036b` adds no table, no key, no migration.
