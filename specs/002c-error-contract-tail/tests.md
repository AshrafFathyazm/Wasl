# `002c-error-contract-tail` — test evidence

**Run:** 2026-08-30, Windows 11, .NET 10.0.200 SDK, SQL Server 2022 via `Testcontainers.MsSql`
(one container for the whole integration suite) plus one `docker compose` container for the
manual probes.

```text
dotnet build --no-incremental      0 Warning(s)   0 Error(s)
dotnet test --no-build

Wasl.Domain.Tests            Failed: 0   Passed: 177   Total: 177     365 ms
Wasl.Application.Tests       Failed: 0   Passed:  26   Total:  26     753 ms
Wasl.Api.IntegrationTests    Failed: 0   Passed: 318   Total: 318    1 m 6 s
                                         ─────────────────────────
                                         Passed: 521   Total: 521
```

Before `002c`: 501.

---

## Acceptance criteria → named tests

| AC | Test | Result |
|---|---|---|
| AC-1 | `OpenApiContractTests.The_document_is_generated_and_describes_every_controller_action` | pass |
| AC-2 | `Every_built_endpoint_appears_in_a_frozen_contract` (strict, no exceptions) and `Every_contracted_endpoint_is_built_or_named_as_pending` | pass |
| AC-2 | `No_pending_entry_names_an_endpoint_that_now_exists` — the exception list cannot outlive its reason | pass |
| AC-2 | `The_contract_scanner_reads_real_endpoints_and_ignores_prose` | pass |
| AC-4 | `RequiredMemberCoverageTests.Every_non_nullable_command_member_has_a_validator_rule` — **the gate** | pass |
| AC-4 | `The_scanner_finds_commands_and_non_nullable_members` | pass |
| AC-5, AC-7 | Live, and `ResourceKeyLeakTests` over ten error responses | pass |
| AC-6 | `ResourceKeyLeakTests` extended, and the live sweep below | pass |
| AC-8 | `ValidatorMessageKeyTests.Every_registered_validator_message_is_a_key_and_not_a_sentence` (+ 2 guards) | pass |
| AC-9 | `TraceAndCancellationTests.The_response_trace_id_is_the_one_in_the_log` | pass |
| AC-10 | `TraceAndCancellationTests.A_cancelled_request_is_abandoned_rather_than_answered_with_a_500` | pass |
| AC-11 | `ResourceKeyLeakTests` — `404` unmatched, `405`, `415`, `400` malformed added | pass |
| AC-12 | `CLAUDE.md`'s Commands block corrected | done |
| AC-3 | `OpenApiContractTests.Every_operation_declares_its_statuses_and_errors_are_problem_json` | **pass — closed 2026-08-30 by `5dedb62`, after this file first recorded it not claimed. See below** |

---

## The gate did its job, and its first failure was its own

AC-4 ran before anything else and **went red**:

```text
Expected uncovered to be empty … but found at least one item
{"AddTicketCommentCommand.AuditAction"}
```

**A false positive.** `AuditAction` is `IAuditableCommand`'s computed property —
`=> "Ticket.CommentAdded"` — with no set accessor, never bound from a request.

Fixed **structurally**, not by name: a record's positional parameters compile to `{ get; init; }`
and are writable; an expression-bodied property is not. `CanWrite` separates them.

> A list of properties to ignore is a list somebody extends until the gate stops guarding
> anything.

The sanity test now asserts the filter both ways — `Subject` is in scope, `AuditAction` is not —
so the fix cannot silently become an over-filter.

**With the gate green, and only then, `SuppressImplicitRequiredAttributeForNonNullableReferenceTypes`
was set.** The product owner made that literal: *if AC-4 is red, do not touch it at all.*

### Before and after, measured live under `Accept-Language: ar`

```text
before   POST /api/tickets {"subject":"s"}
             description = The Description field is required.

after    POST /api/tickets {"subject":"s"}
             customerId  = اختر عميلًا.
             description = اشرح المشكلة.

         POST /api/tickets {}
             customerId  = اختر عميلًا.
             subject     = أدخل موضوعًا.
             description = اشرح المشكلة.

         POST /api/tickets/{id}/comments {}
             body        = اكتب شيئًا قبل النشر.
```

Still `400`, still naming the field — AC-7 — and now from the catalogue.

**Why the two endpoints differed** was the whole diagnosis: `CreateCustomerCommand`'s contact
fields are nullable, so its request **binds** and FluentValidation speaks;
`CreateTicketCommand` is a positional record with non-nullable reference parameters, which the
binder treats as implicitly required and refuses **before** the MediatR pipeline runs — so
`ValidationBehaviour` never executed and the key was never reached.

---

## The comparison found two endpoints nobody had counted

AC-2 is the Definition of Done item — *"the generated OpenAPI matches `contracts/`"* — that has
been in the list since `001` and **has never been satisfiable, because there was no document.**

On its first green-ish run it named:

```text
POST /api/tickets/{ticketId}/messages     specs/021-.../communications-api.md
PUT  /api/settings/branding               specs/022-.../
```

Both are in frozen contracts. Neither had ever been listed anywhere as pending. They join
`NotBuiltYet` with the feature that owns each — **thirteen entries now, every one named**, per
the ruling that *an exception is named with a reason, never resolved by loosening the comparison.*

A fourth test asserts no entry names an endpoint that **is** built, so the list cannot outlive its
reason. `007`'s guard was inverted rather than deleted for the same reason.

### And the spec was wrong about probes

`002c`'s own edge-case table said a test probe *"is never in the document — mapped by the fixture,
not by `src/`"*. **The first run said otherwise:**

```text
Expected … to be empty … but found at least one item {"GET /__probe/auth/whoami"}
```

The fixture maps probes into the **real** pipeline through an `IStartupFilter`, so they are
genuine endpoints and OpenAPI sees them. Excluded by path prefix — and the exclusion is checkable
rather than asserted: `grep -rn "__probe" src/` returns **0**, so `/__probe/` is a prefix `src/`
cannot produce.

---

## Two tools that needed measuring rather than reading

**`IOpenApiDocumentProvider` is registered KEYED by document name.** An ordinary resolve throws:

```text
System.InvalidOperationException : No service for type
'Microsoft.AspNetCore.OpenApi.IOpenApiDocumentProvider' has been registered.
```

`GetRequiredKeyedService<IOpenApiDocumentProvider>("v1")` works. Found by running the test, not
by reading a guide.

**FluentValidation's descriptor yields a tuple, not a rule.**
`GetMembersWithValidators()` enumerates `(IPropertyValidator Validator, IRuleComponent Options)`,
so the message comes from `rule.Options.GetUnformattedErrorMessage()`. A compile error rather than
a silent wrong answer, which is the good kind.

---

## Not claimed

| What | Why |
|---|---|
| ~~**AC-3** — the document declares `application/problem+json` and `401`/`403` per endpoint~~ | **CLOSED 2026-08-30 by `5dedb62`.** The twelve actions were annotated and `ProblemJsonDocumentTransformer` rewrites every 4xx/5xx content type, measured `GET /api/customers -> 401: text/plain, application/json, text/json` before and `application/problem+json` after; removing the transformer reproduces the original string, which is the negative control. 538 tests. **This row and the AC table above said `not claimed` until 2026-08-31 — the fix commit touched `src/`, the test project and `12-delivery-log.md`, and left the feature's own evidence file behind. A criterion recorded unmet while a green test asserts it is the same failure mode as a criterion recorded met by something else, and it is easier to miss.** What the row originally said, and it was true when written: The generated document describes what the actions *return*, and none of them is annotated with `[ProducesResponseType]`, so the document has no statuses to compare. Making it complete means annotating twelve actions, which is a real change to `src/` for a documentation property — **larger than this feature's approved scope, and named rather than quietly folded in.** The paths-and-methods comparison, which is what the Definition of Done item is about, is done |
| That the document is fit to generate a client from | **Changed 2026-08-30 by `5dedb62`** — it carries statuses and `application/problem+json` now, which is what `028` was blocked on. Was: *"It is not. Without response annotations it carries paths, methods and request schemas only."* The frontend lane's hand-written types stay provisional until `028` replaces them |
| That every contract file is machine-readable | Sixteen of twenty-one use the `## \`METHOD /path\`` heading form. The other five declare **no `/api` endpoint at all** — `/health` is outside `/api`, and the rest are the error envelope, the localization contract and two pointer READMEs. Checked, not assumed |
| That `LogCapture` isolates one test's entries | It cannot — the suite shares one host. AC-9 asserts the trace id is **present** among the entries rather than that the buffer holds only its own, because a stricter assertion would be flaky for a reason unrelated to the property |
| That cancellation is honoured *inside* `ValidationBehaviour` specifically | AC-10 asserts the observable: the request is abandoned and no `500` envelope is produced. Which layer noticed the cancellation is not distinguishable from outside, and inventing a way to see it would be verifying the criterion with something else |
