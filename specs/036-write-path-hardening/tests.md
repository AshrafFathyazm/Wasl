# 036 — Test evidence

**Run on** 2026-09-05 · SQL Server 2022 in Testcontainers · Docker 29.5.3
**Every number below was observed.** Nothing here is asserted from memory.

---

## 1 · The final run

```
dotnet build --no-incremental
  Build succeeded.  0 Warning(s)  0 Error(s)

dotnet test --no-build
  Passed!  - Failed: 0, Passed: 189, Skipped: 0, Total: 189  Wasl.Domain.Tests.dll
  Passed!  - Failed: 0, Passed:  26, Skipped: 0, Total:  26  Wasl.Application.Tests.dll
  Passed!  - Failed: 0, Passed: 454, Skipped: 0, Total: 454  Wasl.Api.IntegrationTests.dll
```

**669 tests, 0 failures.** `036` added 16 (454 up from 438).

The whole suite, never `--filter`. Filtered runs appear below only as **diagnosis** and as
**negative controls**, which is the only use `CLAUDE.md` permits.

## 2 · AC → test

| AC | Test | Result |
|---|---|---|
| AC-1 | `TagRaceTranslationTests.Two_simultaneous_attaches_of_one_tag_answer_200_and_409_and_never_500` | pass |
| AC-2 | `TagRaceTranslationTests.The_raced_409_and_the_sequential_409_are_the_same_body` | pass |
| AC-3 | `TagRaceTranslationTests.A_unique_violation_on_an_unnamed_index_is_not_translated` | pass · **control run, §4.2** |
| AC-4 | `ConcurrencyAndDeadlockTests.A_rowversion_mismatch_at_SaveChanges_is_a_concurrency_conflict_not_a_500` | pass |
| AC-5 | folded into AC-2's comparison and AC-4 | pass |
| AC-6 | `ConcurrencyAndDeadlockTests.A_stale_version_wins_over_a_forbidden_transition` | pass · **control run, §4.3** |
| AC-7 | not re-asserted — `003`'s audit suite covers it and was unchanged | see note |
| AC-8 | `ConcurrencyAndDeadlockTests.A_deadlock_victim_is_a_transient_conflict_not_a_500` | pass |
| AC-9, AC-10 | **N/A** — route B was declined (Q-3) | not applicable |
| AC-11 | `WriteRateLimitTests.Past_the_limit_a_write_is_refused_with_429_and_a_Retry_After` | pass |
| AC-12 | `WriteRateLimitTests.Sign_in_is_exempt_from_the_general_write_limit` | pass |
| AC-13 | `WriteRateLimitTests.Health_is_never_limited` | pass |
| AC-14 | `WriteRateLimitTests.The_429_is_enveloped_and_localized` | pass |
| AC-15 | `IdempotencyKeyTests.Two_deliveries_of_one_key_create_one_ticket_and_replay_the_first_response` | pass |
| AC-16 | same test — `ticketNumber` and `Location` compared | pass |
| AC-17 | `IdempotencyKeyTests.The_same_key_with_a_different_body_is_a_409` | pass |
| AC-18 | `IdempotencyKeyTests.Two_simultaneous_deliveries_of_one_key_produce_one_ticket` | pass |
| AC-19 | `IdempotencyKeyTests.Without_a_key_two_identical_requests_still_create_two_tickets` | pass |
| — | `IdempotencyKeyTests.A_key_is_scoped_to_the_user_who_spent_it` | pass |
| — | `IdempotencyKeyTests.A_key_spent_on_a_failed_request_can_be_reused` | pass |
| AC-20 | `CLAUDE.md` corrected; `grep -rn ICommunicationProvider src/` returns **0** | done |

**AC-7 is not claimed as newly tested.** It asserts that a rolled-back conflicting command
writes no audit row — which is `003`'s behaviour, unchanged by this feature, and already
covered. Adding a duplicate assertion would have implied `036` verified something it did not
touch.

## 3 · Defects found by running, not by reading

Four of the five sections were wrong on their first attempt. All four are recorded because
each was **invisible to a green build**.

### 3.1 · The rate limiter failed 174 unrelated tests

```
Failed!  - Failed: 174, Passed: 280, Total: 454
  Expected response.StatusCode to be HttpStatusCode.BadRequest {400},
  but found HttpStatusCode.TooManyRequests {429}.
```

A fixed 60-writes-per-minute limit is right for a person and wrong for this suite, which
drives every write in the product as two seeded users inside one minute. **The failures landed
on unrelated assertions** — `ChangeMyLanguageTests` expecting a `400`, `AssigneeProjectionTests`
throwing `KeyNotFoundException` because a `429` body has no `assignee` — so it reads as the
feature under test being broken.

Fixed by making the limit **configuration** (`RateLimit:WritesPerWindow`), raising it in
`WaslApiFactory`, and giving `WriteRateLimitTests` its own host with a limit of 5 via
`WithWebHostBuilder`. `036` §3.4's spec text was amended in the code comments rather than
quietly conformed to.

### 3.2 · Every keyed create returned `500`

```
fail: Wasl.Api.Common.Errors.GlobalExceptionHandler[0]
  System.NotSupportedException: Serialization and deserialization of 'System.IntPtr'
  instances is not supported. Path: $.WaitHandle.Handle.
     at Wasl.Api.Common.Idempotency.IdempotencyFilter.HashOf(...)
```

`HashOf` serialized **every** bound action argument — including the action's
`CancellationToken`, which System.Text.Json walks to an `IntPtr`. Excluded by TYPE, not by the
parameter name `cancellationToken`, because that name is a convention a controller may not
follow.

### 3.3 · The deadlock translation did not fire — EF re-wraps the exception

This is the most valuable finding in the feature.

```
Expected failures to contain at least one element assignable to type
"TransientConflictException", but found {System.InvalidOperationException}.
```

with, in the log:

```
System.InvalidOperationException: An exception has been raised that is likely due to a
transient failure. Consider enabling transient error resiliency by adding
'EnableRetryOnFailure' to the 'UseSqlServer' call.
 ---> Microsoft.EntityFrameworkCore.DbUpdateException: ...
 ---> Microsoft.Data.SqlClient.SqlException (0x80131904): Transaction (Process ID 91) was
      deadlocked on lock resources ... chosen as the deadlock victim. Rerun the transaction.
   at SqlServerExecutionStrategy.ExecuteAsync[TState,TResult](...)
```

**A deadlock does not arrive as a `DbUpdateException`.** `SqlServerExecutionStrategy` catches
the transient failure and rethrows it inside an `InvalidOperationException`. The original catch
— `catch (DbUpdateException) when (IsDeadlockVictim(...))` — matched nothing, so §3.3
translated nothing while the code read as though it did.

Corrected to match on the **inner chain**, not on the wrapper's type: the wrapper belongs to EF
and can change, error number 1205 belongs to SQL Server and cannot.

Two earlier attempts at this test are also recorded, because each was a different wrong
measurement:

| Attempt | Observed | Why it proved nothing |
|---|---|---|
| Ticket + customer, `Assign(null)` | — | `Assign(null)` on an unassigned ticket raises `AssigneeUnchanged` before any lock is taken |
| Read-then-update inside the contended block | `found {SqlException}` | The **`SELECT`** was the victim, so the failure came from the query, not from `SaveChangesAsync` |
| **Both rows read up front, only the UPDATEs contend** | `TransientConflictException` | Exercises the path the fix covers, and the path production takes |

The second row is a **real limitation**, not a test artefact — see `summary.md`.

### 3.4 · A stale binary produced a fabricated result

One diagnostic run reported a 30-second lock timeout and no deadlock. The build had failed:

```
error MSB3027: Could not copy "...\Wasl.Api.dll" ... Exceeded retry count of 10.
  The file is locked by: "testhost (36512)"
```

so the run used the **previous** test assembly. `CLAUDE.md` warns about exactly this. Strays
killed, `--no-incremental`, re-measured — and the real answer (§3.3) was different.

**The earlier build failure in this session had the same cause**: a `Wasl.Api` process from
2026-09-03 holding the DLLs.

## 4 · Negative controls

**Every guard below was broken on purpose and watched go red.** A guard that has never been
seen to fail has not been verified.

### 4.1 · Remove the tag index from `TranslateDuplicate` — §3.1

```
[FAIL] TagRaceTranslationTests.Two_simultaneous_attaches_of_one_tag_answer_200_and_409_and_never_500
[FAIL] TagRaceTranslationTests.The_raced_409_and_the_sequential_409_are_the_same_body
Failed!  - Failed: 2, Passed: 1, Total: 3
```

AC-3 stayed **green**, which is the shape that matters: the control proves AC-1 and AC-2 detect
the missing translation without AC-3 being sensitive to it.

### 4.2 · Widen the match past the index name — AC-3's own control

`TranslateDuplicate` returning `TagUnchangedException` for any unmatched 2601/2627:

```
[FAIL] TagRaceTranslationTests.A_unique_violation_on_an_unnamed_index_is_not_translated
Failed!  - Failed: 1, Passed: 2, Total: 3
```

**Exactly one test red, and it is AC-3.** This is what makes the name-matching rule a rule and
not a comment.

### 4.3 · Delete the explicit version check — AC-6

Removing the `rowversion` comparison from `ChangeTicketStatusCommandHandler`, relying on the
new `SaveChanges` catch instead:

```
[FAIL] ConcurrencyAndDeadlockTests.A_stale_version_wins_over_a_forbidden_transition
Failed!  - Failed: 1, Passed: 2, Total: 3
```

**AC-4 and AC-8 stayed green.** That is the whole point of AC-6: the "simplification" of
deleting the explicit check in favour of the catch leaves every other concurrency test passing
while `012`'s frozen check ordering is silently gone.

### 4.4 · Controls that ran themselves

Three more were observed without being staged, in §3.1, §3.2 and §3.3 above. Each is a
negative control in the only sense that matters — the guard was absent, and a test said so.

**Every control was reverted and the full suite re-run: 669 passed, 0 failed.**
`grep -c CONTROL` returns `0` in both touched files.

## 5 · Two pre-existing defects this feature surfaced

Neither was caused by `036`. Both were latent and are fixed here, because a feature that
uncovers a defect and leaves it is a feature that hid it.

### 5.1 · `TagReadTests` compared SQL collation order with a .NET ordinal comparer

```
Expected names to be in ascending order ... but found
{"control-429530", "race-121894", ..., "Refund-246434", "tag-163538", ...}
where item at index 0 is in wrong order.
```

`dbo.Tags.Name` carries an explicit **case-insensitive** collation, so SQL sorts `race` before
`Refund`; `StringComparer.Ordinal` puts every capital first. The two agreed only while every
tag in the database shared a case. `036`'s lowercase test tags broke the coincidence.

The comparer was wrong; the `ORDER BY` never was. Now
`StringComparer.Create(InvariantCulture, ignoreCase: true)`.

### 5.2 · The documented status table had drifted from its own guard

`ProblemRegistryTests.Every_registered_status_is_in_the_documented_table` went red on `503` —
**the guard working as designed**. Correcting it revealed that `405`, `415` and `429` were in
the test's list and **absent from `docs/sdd/05-api-conventions.md`'s table**, so the "second,
independent statement" had become one statement plus a copy. All four rows are in the table
now.

## 6 · What was NOT run

- **`--seed` / `--provision` end to end.** No schema change beyond the new table, which the
  integration fixture migrates on every run.
- **Any frontend check.** `036` is backend-only and adds no screen.
- **A multi-instance rate-limit test.** The limiter is in-process, like `004b`'s throttle, and
  the limit is therefore per instance. Stated in `summary.md`, not measured.
