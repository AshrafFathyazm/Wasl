# 002 — Test Evidence

**Core implemented and run on 2026-08-25.** Every command below was executed and every
result pasted from its output. Nothing here was asserted from memory.

Scope: **`002` core only.** The `·b` and `·FE` halves of `spec.md` are not implemented and
not tested — see the Gaps section, which lists them rather than leaving the absence to be
inferred.

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
Passed!  - Failed: 0, Passed:  3, Skipped: 0, Total:  3 - Wasl.Domain.Tests.dll
Passed!  - Failed: 0, Passed:  5, Skipped: 0, Total:  5 - Wasl.Application.Tests.dll
Passed!  - Failed: 0, Passed: 25, Skipped: 0, Total: 25 - Wasl.Api.IntegrationTests.dll
```

**33 tests, 33 passed, 0 skipped.** `002` added 16 (5 registry, 11 envelope) to `001`'s 17.

`Wasl.Application.Tests` still passing at 5 is the load-bearing one: `002` added MediatR,
FluentValidation, and `FluentValidation.DependencyInjectionExtensions` to
`Wasl.Application`, and `LayerDependencyTests` confirms none of them is EF Core or
ASP.NET Core. The boundary held while the layer gained three packages.

---

## Acceptance criteria — core only

| AC | Verified by | Result |
|---|---|---|
| AC-1 **·C** | `DomainRuleViolation_Returns400_WithTheEnvelope` — `application/problem+json`, all five fields | **Pass** |
| AC-2 **·C** | `OnlyTheFactory_ConstructsProblemDetails` — regex over `src/` | **Pass**, after the test itself was wrong (finding 2) |
| AC-3 **·C** | `TraceId_AppearsExactlyOnce_AtTheTopLevel` — raw JSON, not a deserialised object | **Pass** |
| AC-5 **·C** | `ValidationFailure_Returns400_WithFieldKeyedErrors` | **Pass** |
| AC-6 **·C** | `OneFieldBreakingTwoRules_YieldsTwoMessages` | **Pass** |
| AC-11 **·C** | `Health_IsExcludedFromTheEnvelope` — `application/json`, `checks` present, no `type` | **Pass** |
| AC-12 **·C** | `UnhandledException_Returns500_LeakingNothing` — exactly five properties | **Pass** |
| AC-13 **·C** | `The500Envelope_HoldsInDevelopment_NoDeveloperExceptionPage` | **Pass**, and it found a real DI defect (finding 3) |
| AC-14 **·C** | `UnregisteredErrorCode_DegradesTo500_NotAGuessedStatus` + `Every_domain_error_code_is_registered` | **Pass** |
| AC-15 **·C** | `Every_type_uri_is_unique`, `Every_registered_status_is_in_the_documented_table` | **Pass** |
| AC-16 **·C** | `The_type_base_uri_appears_exactly_once_in_source` | **Pass** |
| AC-18 **·C** | `IProblemMessageSource` has one implementation; every title and detail resolves through it | **Pass** by construction; the stub-substitution test is `002b` |
| AC-19 **·C** | `InvalidRequest_NeverReachesTheHandler` — the handler's flag stays false | **Pass** |
| AC-20 **·C** | Registration order is explicit and commented in `Wasl.Application/DependencyInjection.cs`, with the `003` slot named | **Partial** — written down, not yet asserted by a test. See Gaps |
| AC-4 · AC-17 · AC-21 · AC-28 **·C** | — | **Not verified.** See Gaps |

### The `500` body, observed

```json
{"type":"https://wasl.local/errors/internal","title":"An unexpected error occurred.",
 "status":500,"instance":"/__probe/validated",
 "traceId":"00-4f132d7d6f1af9c93ea8e4c53e419599-135b23b6dd6dcf76-00"}
```

Exactly five properties. The probe that produces it throws an exception whose **message
contains `Password=hunter2` and `Server=.\SQLEXPRESS`**, so the test asserts the absence of
a real leak rather than an absence in principle — no credential, no connection string, no
exception type name, no stack frame.

---

## The probe endpoints, and why they exist

`002` adds no product endpoint. Asserting the envelope through the real pipeline therefore
needed something that throws, so `tests/Wasl.Api.IntegrationTests/Errors/ErrorContractProbe.cs`
maps five test-only routes via an `IStartupFilter`.

**An `IStartupFilter`, not a second host.** The probes sit behind the real
`UseExceptionHandler`, the real factory, and the real behaviour pipeline. A separate
`WebApplication` would assert a *copy* of the middleware rather than the middleware, which
is the failure mode that makes an integration test worthless.

They are in the test project and never in `src/`. And they are the honest answer to "MediatR
has no consumer in this feature": it has one, and it is a test consumer — `research.md` R-10
says so rather than pretending otherwise.

---

## What the tests found

Four things. **Three of the four were defects in the tests, not in the code** — which is
worth stating plainly, because a test suite that only ever confirms the implementation is
not testing it.

### 1. The probe's handler was never registered — and it looked like a broken contract

Three tests failed with `500` where `400` was expected. The `500` body was a correct,
well-formed `errors/internal` envelope, which made it read as "validation is not producing
a `400`".

It was not. `AddApplication` scans `Wasl.Application`, and `ProbeCommandHandler` and
`ProbeCommandValidator` live in the **test** assembly — so `ISender.Send` found no handler
and threw, and the handler did exactly its job by turning that into a `500`.

```text
STATUS 500
{"type":"https://wasl.local/errors/internal", ... }
```

Fixed by registering the test assembly's handlers and validators in `ConfigureTestServices`.
**The error contract was working the whole time**, and the only way to tell was to look at
the body rather than the status.

### 2. AC-2's own grep is imprecise

AC-2 states the check as `grep -rn "new ProblemDetails"`. `GlobalExceptionHandler`
legitimately constructs a `new ProblemDetailsContext` to hand the envelope to
`IProblemDetailsService` — and that contains the AC's string as a substring.

```text
Expected files to contain exactly one item ...
but found one extraneous item at index 0: "GlobalExceptionHandler.cs"
```

The test failed and the code was right. Fixed by requiring a word boundary —
`new\s+ProblemDetails\s*[({]` — because what AC-2 is about is who constructs the
**envelope**, not who mentions a type whose name starts the same way.

### 3. A captive dependency, and only Development could see it

**The most valuable failure in this feature.**

`AddExceptionHandler<T>` registers the handler as a **singleton**. `ProblemDetailsFactory`
was registered as **scoped**. A singleton consuming a scoped service captures it from the
root scope and holds it forever.

.NET validates scopes **only in Development**. So under the test environment the app started
cleanly and the capture went unnoticed; under Development it refused to build at all:

```text
Cannot consume scoped service 'Wasl.Api.Common.Errors.ProblemDetailsFactory'
from singleton 'Microsoft.AspNetCore.Diagnostics.IExceptionHandler'.
```

Fixed by registering the factory as a singleton, which is correct rather than convenient: it
holds no per-request state — every request-specific value arrives as an `HttpContext`
parameter.

**And that is now a constraint, not a coincidence.** `004` will want `ICurrentUser`, which is
scoped. Injecting it into the factory reintroduces exactly this defect, and the fix then is
to pass it as a parameter. Written into the comment at the registration site, because this is
the kind of thing that gets reintroduced by someone being helpful.

AC-13 exists because a developer exception page in Development means the shape a developer
sees is not the shape a client gets. It caught something better: a DI defect that the test
environment was configured to ignore.

### 4. `errors` keys are PascalCase, not camelCase

Observed while writing the assertion: FluentValidation's `PropertyName` is the CLR property
name, so the keys arrive as `FullName` and `Email` rather than `fullName` and `email`.

The contract says the keys of `errors` "map to request field names, which are part of the
contract". The request field names are camelCase — that is how the JSON arrives.

**Not fixed here, and recorded as a defect rather than adjusted away.** The test asserts the
current behaviour (`FullName`) so it is visible, and this is listed in the Gaps below as the
one contract deviation in the core. Fixing it means a camelCase conversion in the
validation handler, and it should be fixed in `002b` alongside the other contract work
rather than quietly patched now — but it is a real mismatch and a client written against the
contract would not find its field.

---

## Gaps, each with a reason

| Gap | Reason |
|---|---|
| **`errors` keys are PascalCase; the contract implies camelCase** | Finding 4. A real deviation, recorded rather than smoothed over. It needs a property-name transform in the validation path and belongs with `002b`'s contract work. Until then a client mapping `errors` onto form fields by exact name will miss |
| **AC-20 is written, not asserted** | The behaviour registration order is explicit and commented, with the `003` slot named. A test naming the expected sequence needs a second behaviour to be meaningful, and `003` adds two. Deferred to `003` rather than asserted against a single-element list |
| **AC-4 not verified** — response `traceId` identical to the log's | Needs a log sink captured in the test host. `TraceContext` is a single accessor read by both, so the property holds by construction; that is an argument, not evidence, and it is recorded as such |
| **AC-17 not verified** — no sentence in any validator | The rule is followed: every probe validator message is a symbolic key. The *test over every registered validator* is `002b`, and until it exists the rule is a convention |
| **AC-21 not verified** — validators receive the request's `CancellationToken` | The token is threaded through `ValidationBehaviour`. The cancellation test is `002b` |
| **AC-28 not verified** — culture read from `HttpContext`, not ambient state | Nothing to assert against until `005` exists. The design already reads the context, which is the belt-and-braces position spec Q-E argues for |
| **All `·b` criteria** — AC-7, AC-8, AC-9, AC-10, AC-22, AC-23 | `002b`. `AC-9`'s `404`-with-an-empty-body case is the one that matters most, and `research.md` R-1 says so |
| **All `·FE` criteria** — AC-24 to AC-27 | Frozen for the first screen built |
| **Deliberately untested** | That MediatR dispatches, that FluentValidation validates, that ASP.NET Core routes. Testing the framework |
