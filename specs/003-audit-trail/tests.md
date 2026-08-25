# 003 — Test Evidence

**`003` core implemented and run on 2026-08-25.** Every command below was executed and every
result pasted from its output. Nothing here was asserted from memory.

Scope: **`003` core only.** The `·b` half — the `wasl_app` role, `DENY`, the restricted
connection string, AC-12 and AC-13 — is not implemented and not tested. It is listed in the
Gaps section rather than left to be inferred from an absence.

---

## Build

```text
$ dotnet build --no-incremental
Build succeeded.
    0 Warning(s)
    0 Error(s)
```

## Tests

```text
$ dotnet test
Passed!  - Failed: 0, Passed: 40, Skipped: 0, Total: 40 - Wasl.Domain.Tests.dll
Passed!  - Failed: 0, Passed:  8, Skipped: 0, Total:  8 - Wasl.Application.Tests.dll
Passed!  - Failed: 0, Passed: 45, Skipped: 0, Total: 45 - Wasl.Api.IntegrationTests.dll
```

**93 tests, 93 passed, 0 skipped.** `003` added **60** to the 33 that `001` and `002` left:

```text
$ dotnet test tests/Wasl.Domain.Tests --filter FullyQualifiedName~Audit
Passed!  - Failed: 0, Passed: 37, Total: 37

$ dotnet test tests/Wasl.Application.Tests --filter CommandsAreAuditableTests
Passed!  - Failed: 0, Passed:  3, Total:  3

$ dotnet test tests/Wasl.Api.IntegrationTests --filter "FullyQualifiedName~Audit|FullyQualifiedName~PipelineOrder"
Passed!  - Failed: 0, Passed: 20, Total: 20
```

**`002`'s 25 integration tests still pass**, and that is the load-bearing number rather than
the 60. `003` moved `ValidationBehaviour`'s registration out of `AddApplication()` and into a
single ordered list in `Wasl.Api` — a change to a delivered feature. The error contract, the
`500` envelope, the `traceId`-appears-once assertion and the Development-environment test all
still hold across it.

## Migration

```text
$ dotnet ef migrations add AddAuditLog -p src/Wasl.Infrastructure -s src/Wasl.Api
Build succeeded.
Done.

$ grep -n 'name: "IX_AuditLog' src/Wasl.Infrastructure/Persistence/Migrations/*AddAuditLog.cs
41:  name: "IX_AuditLog_Actor",
47:  name: "IX_AuditLog_Entity",
53:  name: "IX_AuditLog_NotSuccess",
60:  name: "IX_AuditLog_Time",

$ grep -c 'ForeignKey' src/Wasl.Infrastructure/Persistence/Migrations/*AddAuditLog.cs
0
```

---

## Acceptance criteria — core only

| AC | Verified by | Result |
|---|---|---|
| AC-1 **·C** | `The_table_has_exactly_the_documented_columns` + `The_key_is_an_identity_column` — `INFORMATION_SCHEMA.COLUMNS` and `sys.identity_columns`, not the migration file | **Pass** |
| AC-2 **·C** | `The_table_has_no_foreign_key` — `sys.foreign_keys` count is 0 | **Pass** |
| AC-3 **·C** | `All_four_indexes_exist_and_the_filtered_one_kept_its_filter` — `sys.indexes`, by name | **Pass**, after finding a real migration defect (finding 1) |
| AC-4 **·C** | `The_changes_column_rejects_invalid_json_and_accepts_null` | **Pass**, after the test was found to be testing nothing (finding 2) |
| AC-5 **·C** | `The_table_has_no_rowversion_and_no_updated_timestamp` (database) + `The_entity_has_no_concurrency_token_and_no_updated_timestamp` and `No_property_can_be_set_from_outside_the_entity` (CLR) | **Pass** |
| AC-6 **·C** | `A_successful_command_writes_exactly_one_row_inside_the_transaction` | **Pass** |
| AC-7 **·C** | `The_success_path_writes_through_the_request_context_so_a_failed_audit_fails_the_change` | **Partial** — asserted by construction, not by fault injection. See Gaps |
| AC-8 **·C** | `A_denied_command_leaves_a_denied_row_that_survives_the_rollback` | **Pass** |
| AC-9 **·C** | `A_failing_command_leaves_its_row_and_rolls_back_its_change` | **Pass** |
| AC-10 **·C** | `WriteIndependentAsync` takes no `CancellationToken` — the signature is the guarantee | **Partial** — enforced by the API shape; no test cancels mid-failure. See Gaps |
| AC-11 **·C** | `A_failing_command_...` asserts the response is `002`'s `500` envelope, so the original exception reached the middleware unchanged | **Pass** |
| AC-12 **·b** | — | **`003b`** |
| AC-13 **·b** | — | **`003b`** |
| AC-14 **·C** | `Every_command_in_the_application_layer_declares_an_audit_action` (a) + `The_scanner_reports_a_command_that_does_not_declare_an_audit_action` (b) + `The_scanner_does_not_report_a_command_that_does_declare_one` | **Pass**, and (a) was **watched failing** — see below |
| AC-15 **·C** | `The_resolved_behaviour_order_is_validation_then_transaction_then_audit` + `The_declared_order_in_source_matches_what_the_container_resolves` | **Pass**, against the real container |
| AC-16 **·C** | `A_query_opens_no_transaction_and_writes_no_audit_row` (runtime) + `A_query_resolves_validation_only` (registration) | **Pass** |
| AC-17 **·C** | `AuditRedactionTests` — 22 cases including the near-misses | **Pass** |
| AC-18 **·C** | `A_no_op_write_produces_no_change_entry` | **Pass**, and **watched failing** — see below |
| AC-19 **·C** | `A_successful_command_...` asserts `before`/`after` content; `Two_saves_in_one_request_merge_into_one_row_and_one_document` | **Pass**, and **watched failing** |
| AC-20 **·C** | `The_actor_columns_hold_what_the_current_user_returned_at_write_time` | **Partial** — proves the columns hold what `ICurrentUser` returned (null). The role-change half needs `004`. See Gaps |
| AC-21 **·C** | `The_row_trace_id_matches_the_problem_details_trace_id` — byte-identical | **Pass** |
| AC-22 **·C** | `The_same_command_under_arabic_produces_identical_machine_readable_content` | **Pass, and weak** — see Gaps |
| AC-23 **·C** | `A_successful_command_...` asserts `DateTimeKind.Utc` on read | **Partial** — the injected clock is used, but no test substitutes a fake one. See Gaps |
| AC-24 **·C** | `Arabic_text_round_trips_through_the_changes_document` | **Pass** |
| AC-25 **·C** | Three tests assert `COUNT(*)` as exactly `1`, never `> 0` | **Pass** |

---

## Watched failing — the three that matter

A test that has never been seen to fail has not been verified. `001` shipped an architecture
test that was a false negative until someone tried to break it, and `002` found three defects
in tests that looked like they were passing for the right reason. These were broken on purpose.

### 1. The diff, read too late — `research.md` R-1's exact failure

The interceptor was temporarily moved from `SavingChanges` to `SavedChanges`, so it captured
**after** `SaveChanges` had accepted the changes:

```text
Expected entry.Changes not to be <null> because the interceptor must have captured the change.
Failed!  - Failed: 4, Passed: 7, Total: 11 - Wasl.Api.IntegrationTests.dll
```

**Four tests red, and the row was still there.** `SELECT COUNT(*)` returned 1, the outcome was
`Success`, the business change committed — and `Changes` was `null` on every command.

This is the whole argument for AC-18 and AC-19 asserting on **content**. Had the tests checked
that a row exists, or that `Changes` is present, all four would have stayed green and the
feature would have shipped with an audit trail that records that something happened and never
what.

The interceptor was restored and the suite returned to green.

### 2. The NFR-10 rule test, on a real violator

AC-14a passes today by iterating an empty sequence — there are no commands in
`Wasl.Application` until `004`. A temporary `TemporaryViolator : ICommand` was added to that
project:

```text
Expected offenders to be empty because NFR-10: an audit gap is a build failure, not a review
finding. ..., but found at least one item {Wasl.Application.Common.Messaging.TemporaryViolator}.
Failed!  - Failed: 1, Passed: 0, Total: 1
```

It named the violator. So the test points at the right assembly and the right interface, which
is what an empty result had to mean before it could mean anything. The file was deleted
immediately.

AC-14b — the scanner self-test — covers the same ground permanently, from inside the test
assembly. Both exist because either alone can pass while proving nothing.

### 3. Not watched failing, and named as such

`TEST-003-10`'s equivalent — a test over every registered validator asserting no English
sentence — was **not written**. `003` adds no validator, so it would guard nothing. It stays
with `002b`, which already owns AC-17's equivalent for the error contract.

---

## What the tests found

Three defects. **Two were in the tests and one was in the migration**, and the migration one
would have shipped.

### 1. A missing index, and AC-3 would have passed anyway

`IX_AuditLog_Time` and `IX_AuditLog_NotSuccess` both cover `OccurredAtUtc`. Written with the
**unnamed** `HasIndex` overload, EF Core identifies an index by its property set — so the
second configuration replaced the first, silently. The generated migration:

```text
name: "IX_AuditLog_Actor"
name: "IX_AuditLog_Entity"
name: "IX_AuditLog_NotSuccess"
```

**Three indexes where `data-model.md` specifies four**, and the one that vanished was the
*unfiltered* one. A check that asserted only "the filter is present" would have passed —
`IX_AuditLog_NotSuccess` survived intact.

Fixed with the named `HasIndex(expression, name)` overload, which creates a distinct index.
AC-3 now asserts **all four by name**, and the reason is written at the configuration site so
the next person to add a second index over one column meets it.

Found by reading the generated migration rather than by a test. Which is the argument for
reading generated code: no test existed yet that could have caught it, because the test was
going to be written against the same wrong assumption.

### 2. AC-4 was testing nothing at all

The check-constraint test failed with the wrong exception:

```text
Expected a <Microsoft.Data.SqlClient.SqlException> to be thrown, but found
<System.FormatException>: Input string was not in a correct format. Failure to parse near
offset 155. Expected an ASCII digit.
```

Two causes, one after the other. First `string.Format` treated the deliberately malformed
value `{not json` as a format placeholder. Removing the format call did not fix it: **EF Core's
`ExecuteSqlRaw` performs the same `{n}` substitution on the SQL it is handed.**

So a test that read as "assert the database rejects malformed JSON" **never reached the
database**. It threw in C# and reported a missing `SqlException`. Rewritten over ADO.NET
directly, and it now fails with `CK_AuditLog_ChangesIsJson` in the message — which is the
constraint doing its job.

### 3. `DomainErrorCodes.Forbidden` did not exist

`spec.md` Q-4 says the classifier maps a `forbidden`-coded `DomainException` to `Denied`. That
code was not in `Wasl.Domain`: `002` reserved a `forbidden` **registry row** for `004`, on the
understanding that a `403` comes from auth middleware.

That is true for a role-only check — and it means the middleware throws nothing, so MediatR
never sees it. But BR-6 also has data-dependent checks ("is this user the assignee?"), which
`CLAUDE.md` puts in the handler, and those *are* exceptions the pipeline can classify. Without
the code, every in-handler denial would have been recorded as `Failed` — losing exactly the
distinction AC-8 exists for.

Added to `DomainErrorCodes`, and removed from the `reservedByLaterFeatures` list in `002`'s
`ProblemRegistryTests`: it is raisable now, so listing it as reserved would be the test
asserting something that had stopped being true.

### And one thing that was not a defect

`AddWaslPipeline` initially wrapped its registrations in `AddMediatR`, and every integration
test failed at startup:

```text
System.ArgumentException : No assemblies found to scan. Supply at least one assembly to scan
for handlers.
   at Wasl.Api.Common.WaslPipeline.AddWaslPipeline(IServiceCollection services)
```

MediatR requires an assembly per `AddMediatR` call, and this call contributes no handlers.
Supplying one anyway would re-scan an assembly `AddApplication` already scanned, to satisfy a
validation rather than a need. The behaviours are registered directly as open-generic
`IPipelineBehavior<,>` services — which is what `AddOpenBehavior` does internally, so the
ordering guarantee is the container's and is unchanged. AC-15 then passed against the real
container.

---

## Gaps, each with a reason

| Gap | Reason |
|---|---|
| **AC-7 is asserted by construction, not by injection** | The success-path write goes through the request's own `DbContext` inside the open transaction, so an audit insert failure fails the whole transaction. That is a property of the code path, and the test asserts the path rather than the outcome. Injecting a failing audit insert needs a seam that does not exist — and adding one to make a test possible would weaken the thing being tested |
| **AC-10 is enforced by a signature, not a test** | `WriteIndependentAsync` takes no `CancellationToken`, so there is no token to cancel. Stronger than a test in one sense — the failure mode is uncompilable — and weaker in another: nothing proves the row lands when a client actually disconnects mid-failure. That test needs a client that aborts a request, and it belongs with `002b`'s client-disconnect work |
| **AC-20's role-change half needs `004`** | The mechanism is proven: the columns hold what `ICurrentUser` returned at write time, which is null because there is no authentication. Changing a role and re-reading a past row needs `SupportUsers` and tokens. `spec.md` Out of scope names `004` as the owner, and this is the same statement with a test result behind it |
| **AC-22 cannot currently fail** | No `RequestLocalizationMiddleware` is registered, so `Accept-Language: ar` changes nothing. The test is written and passes vacuously. It acquires teeth at `005`, and `spec.md` labels it weak rather than counting it |
| **AC-23's fake clock is not substituted** | `TimeProvider` is injected and the read-back `Kind` is asserted, so the wiring is real. A test replacing it with a fake and asserting the stored value needs a per-test service override, which `WaslApiFactory` does not currently support per test method. Deferred rather than faked |
| **`TEST-003-10` — no validator message test** | `003` adds no validator, so it would guard nothing. Stays with `002b` |
| **All `·b` criteria — AC-12, AC-13** | `003b`, deferred whole. **The audit log is append-only by application convention, not by database permission**, and no test claims otherwise |
| **`DOC-003-01`** | Documents the two connection strings and the `wasl_app` login. Both are `003b` |
| **Deliberately untested** | That MediatR dispatches, that EF Core saves, that SQL Server honours `IDENTITY`. Audit volume, index selectivity, query plans — no stated requirement, and `docs/sdd/testing/test-strategy.md` lists load and performance as deliberately untested |
