# 002 — Task Breakdown

**Phase:** 0 · **Role:** Story Planner · **Skill:** `speckit-tasks`

Every task has one owner, one verification, and something it serves. A task that cannot be
verified on its own is too big and is split.

Agents named here are **not dispatched until the plan is approved**. Naming is the plan;
dispatching without recording the result in `ai-notes.md` is what turns evidence into a
claim.

## Critical path

```text
BE-002-01 → BE-002-02 → BE-002-03 → BE-002-04 → BE-002-05 → BE-002-06
  → BE-002-08 → TEST-002-01 → DOC-002-04
```

The domain vocabulary, the registry that maps it, the one factory, the trace accessor, the
handler, the status-code writer, the validation behaviour, and the test that proves the
envelope exists. Everything else hardens it.

The order inside the path is not arbitrary: **BE-002-03 before BE-002-05** because the
factory is what makes there be one producer, and a handler written first would grow its own
construction code that then has to be taken out. **BE-002-06 immediately after BE-002-05**
because the two together are the whole surface — a handler alone leaves the empty-bodied
`404` that is the most common failure a client sees (`research.md` R-6).

## Backend

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| BE-002-01 | `DomainException`, `InvariantViolationException`, `DuplicateValueException`, `DomainErrorCodes` exist in `Wasl.Domain/Common/` carrying a code, a message key, args, and optional field keys — and **no** HTTP type | — | `dotnet build`; `grep -rn "Microsoft\.\|System.Net\|StatusCode" src/Wasl.Domain/` returns nothing; `001`'s `DomainHasNoDependenciesTests` still green | AC-14, ADR-010 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-002-02 | `ProblemTypes` holds every row of `contracts/error-contract.md` (code · status · `errors` allowed · title key); `ProblemTypeRegistry` looks a code up and returns `internal` **plus a `Critical` log** for an unregistered one | BE-002-01 | Row-by-row diff of `ProblemTypes.cs` against the registry table in the contract, recorded in `tests.md`; `grep -rn "wasl.local/errors" src/` returns exactly one hit | AC-14, AC-15, AC-16 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-002-03 | `ProblemDetailsFactory` is the only type that constructs a `ProblemDetails`; it emits `type`, `title`, `status`, `instance`, `traceId`, optional `detail` and `errors` per the registry row | BE-002-02 | `grep -rn "new ProblemDetails" src/` returns hits only in `ProblemDetailsFactory.cs` | AC-1, AC-2, AC-3 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-002-04 | `TraceContext.For(httpContext)` returns `Activity.Current?.Id ?? ctx.TraceIdentifier`, and the request log scope is opened with **that same call** | BE-002-01 | `grep -rn "TraceIdentifier\|Activity.Current" src/` returns hits only in `TraceContext.cs` — three consumers, one derivation | AC-4, BR-9.9 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-002-05 | `GlobalExceptionHandler` registered via `AddExceptionHandler` + `AddProblemDetails`, with `app.UseExceptionHandler()` as the **first** pipeline call; a domain exception and an unhandled exception both come out of the factory | BE-002-03, BE-002-04 | `curl -i` against a test-host throwing route returns `application/problem+json`; the handler is line 1 of the pipeline in `Program.cs`, checked by reading it | AC-1, AC-12 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-002-06 | `StatusCodeProblemWriter` wired through `UseStatusCodePages`, envelopes `404`/`405`/`415`/`401`/`403`, and **excludes `/health` by path** | BE-002-05 | `curl -i {{baseUrl}}/api/does-not-exist` returns `404` with `type` and `traceId`; `curl -i {{baseUrl}}/health` with the database stopped still returns the `001` health shape | AC-9, AC-10, AC-11 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-002-07 | `IProblemMessageSource` with exactly one implementation and one registration; `ProblemMessages.cs` is the only file in `src/` containing an English sentence; the culture comes from `HttpContext`, never `CultureInfo.CurrentUICulture` | BE-002-03 | `grep -rn "CultureInfo.Current" src/` returns nothing; `grep -c` for registrations of the interface returns 1 | AC-18, AC-28 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-002-08 | `ValidationBehavior<,>` runs every `IValidator<TRequest>`, merges failures per field, throws `RequestValidationException`, and passes the request's `CancellationToken` to each validator | BE-002-03 | Test-host `/__test/validate` with an invalid body returns `400` with the field shape from the contract | AC-5, AC-6, AC-19, AC-21 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` + `superpowers:test-driven-development` |
| BE-002-09 | Behaviour registration order is explicit and commented, with the `003` transaction and audit slots reserved **after** validation | BE-002-08 | Read `Program.cs`; `TEST-002-12` fails if the order changes | AC-20 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-002-10 | A malformed JSON body and a malformed `Guid` route value both map to `400` `errors/malformed-request` with the full envelope | BE-002-05, BE-002-06 | `curl -X POST -d '{oops' ...` returns `400` with `type` and `traceId`, not `500` and not an empty body | AC-7, AC-8 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-002-11 | Swashbuckle registered; one shared `ProblemDetails` schema; `ProblemResults` helpers declare the failure responses; `/swagger` mapped **only** in Development | BE-002-03 | `curl -s {{baseUrl}}/swagger/v1/swagger.json \| jq '.components.schemas.ProblemDetails'` is non-null in Development; the same call returns `404` with `ASPNETCORE_ENVIRONMENT=Production` | AC-22, AC-23 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-002-12 | An `OperationCanceledException` caused by client disconnect writes no response and is **not** logged as a fault | BE-002-05 | Cancel a request mid-flight; the log shows no `Error`-level entry and no `500` | Edge case, NFR-1 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |

**No `voltagent-lang:sql-pro` tasks.** This feature has no schema change — see
[`data-model.md`](data-model.md), which says so explicitly and says why. Recorded as a line
rather than an absence, so the empty lane is visibly a decision.

## Frontend

**Specified and frozen here; executed inside `006-design-system`.** `006` creates the React
scaffold and runs after this feature; the IDs stay `FE-002-*` so the dependency is visible in
both task lists (`spec.md` Q-D). Every row below carries `006 scaffold` as a dependency for
that reason.

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| FE-002-01 | `shared/api/problemDetails.ts`: the `ProblemDetails` type marked **PROVISIONAL**, plus `parseProblem` which never throws and synthesises `errors/unparseable-response` | `006` scaffold, contract frozen | `npm run test -- problemDetails`; `npx tsc --noEmit` | AC-24 | `voltagent-lang:react-specialist` | `frontend-design` + `superpowers:test-driven-development` |
| FE-002-02 | `shared/api/problemCodes.ts`: `PROBLEM_CODES` mirroring the registry, and `problemCode()` returning the last path segment | FE-002-01 | `npm run test -- problemCodes`; a row-by-row diff of `PROBLEM_CODES` against the contract registry, recorded in `tests.md` | AC-25, AC-27 | `voltagent-lang:react-specialist` | `frontend-design` + `superpowers:test-driven-development` |
| FE-002-03 | `shared/api/fieldErrors.ts`: `applyFieldErrors` sets known fields and **returns** the keys it could not place | FE-002-02 | `npm run test -- fieldErrors` | AC-26 | `voltagent-lang:react-specialist` | `frontend-design` + `superpowers:test-driven-development` |
| FE-002-04 | The provisional `ProblemDetails` interface is replaced by the type generated from the OpenAPI document, and the PROVISIONAL comment is deleted | BE-002-11, FE-002-01 | `npx tsc --noEmit` passes against the generated type; `grep -rn "PROVISIONAL" src/wasl-web/src/shared/api/` returns nothing | ADR-011 §6 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-002-05 | The `problemCode` → screen-state table and the accessibility obligations from `frontend-spec.md` are handed to `006` as its input, not rediscovered | FE-002-03 | `006`'s own spec cites this feature's table; every row has a home | `frontend-spec.md` | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |
| FE-002-06 | The seven client-authored failure keys exist in `en` **and** `ar` | `006` scaffold | The key-parity test passes; deleting one `ar` key turns it red | BR-8.11 | `voltagent-lang:react-specialist` | `frontend-design` |

## Tests

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| TEST-002-01 | Every status in the contract's table returns `application/problem+json` with `type`, `title`, `status`, `traceId` | BE-002-06 | `dotnet test --filter ErrorContractTests` | AC-1 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-002-02 | A `400` carries `errors` keyed by the **payload** field names in camelCase; one field breaking two rules yields two array entries | BE-002-08 | `dotnet test --filter ValidationBehaviorTests` | AC-5, AC-6 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-002-03 | `traceId` appears **once**, at the JSON top level — asserted against the raw response text, not a deserialized object | BE-002-04 | `dotnet test --filter TraceIdShape`; moving `traceId` under `extensions` turns it red | AC-3 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-002-04 | The response `traceId` is byte-identical to the correlation id captured from the logging pipeline for that request | BE-002-04 | `dotnet test --filter TraceIdCorrelationTests`; swapping one consumer to `HttpContext.TraceIdentifier` turns it red | AC-4, BR-9.9 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-002-05 | A `500` body's JSON property names are **exactly** `{type, title, status, instance, traceId}` — set equality, not a substring search | BE-002-05 | `dotnet test --filter InternalErrorBodyTests` | AC-12, NFR-4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-002-06 | TEST-002-05 holds with `ASPNETCORE_ENVIRONMENT=Development`: no developer exception page, no HTML body | BE-002-05 | `dotnet test --filter DevelopmentEnvironment`; the test boots a second host with the Development environment set | AC-13 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-002-07 | A malformed JSON body and a malformed `Guid` route value each return `400` `errors/malformed-request` with the full envelope | BE-002-10 | `dotnet test --filter MalformedRequest` | AC-7, AC-8 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-002-08 | An unmatched route gives `404` `errors/not-found`; `405` and `415` are enveloped; **`/health`'s `503` is byte-identical to `001`'s contract** | BE-002-06 | `dotnet test --filter StatusCodeEnvelopeTests`; the health assertion runs with the container stopped, because the `200` path hides the defect | AC-9, AC-10, AC-11 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-002-09 | Every domain-exception subtype's code is registered; every registry row's `type` is unique and its status is in the table; the base URI is a compile-time constant | BE-002-02 | `dotnet test --filter ProblemTypeRegistryTests`; adding an unregistered subtype turns it red | AC-14, AC-15, AC-16 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-002-10 | Every message returned by every registered `IValidator` matches the symbolic-key shape — a rule that forgot `.WithMessage(key)` fails the build | BE-002-08 | `dotnet test --filter ValidatorMessageKeyTests`; removing `.WithMessage` from the fixture validator turns it red | AC-17, ADR-007 §5 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-002-11 | Substituting a stub `IProblemMessageSource` changes the `title` with no other production file altered; the culture read is the one on `HttpContext` | BE-002-07 | `dotnet test --filter MessageSourceSeamTests` | AC-18, AC-28 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-002-12 | An invalid request returns `400` **and the handler never ran**; the behaviour registration order is asserted with validation first | BE-002-09 | `dotnet test --filter PipelineOrder`; the handler under test throws if invoked | AC-19, AC-20 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-002-13 | The Development OpenAPI document has exactly one `#/components/schemas/ProblemDetails`, it declares `traceId`, and every failure response references it; the document is absent outside Development | BE-002-11 | `dotnet test --filter OpenApiDocumentTests` | AC-22, AC-23 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-002-14 | The envelope's `title` resolves in the **request's** culture even though the handler runs outside `RequestLocalizationMiddleware` | BE-002-07, **`005`** | Deferred to `005`, where a second culture exists. Recorded here so `005` inherits the test rather than the surprise (`spec.md` Q-E, `research.md` R-11) | AC-28, BR-8.6 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-002-15 | A cancelled `CancellationToken` aborts validation rather than completing it, and every validator receives the request's token | BE-002-08 | `dotnet test --filter ValidationCancellation` | AC-21 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-002-16 | `parseProblem` returns a synthetic problem — and never throws — for an HTML body, an empty body, valid JSON with no `type`, and a `204` | FE-002-01 | `npm run test -- problemDetails` | AC-24 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| TEST-002-17 | Changing the base host in the fixture leaves every `problemCode` branch matching; no utility reads `title` | FE-002-02 | `npm run test -- problemCodes`; `grep -rn "\.title" src/wasl-web/src/shared/api/` returns nothing in a branch | AC-25, AC-27 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| TEST-002-18 | An `errors` key matching no known field is returned as unplaced, not dropped | FE-002-03 | `npm run test -- fieldErrors` | AC-26 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| TEST-002-19 | A client disconnect produces no `Error`-level log entry and no `500` | BE-002-12 | `dotnet test --filter ClientDisconnect` | Edge case | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |

## Documentation

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| DOC-002-01 | `FRONTEND-API-GUIDE.md` matches the frozen contract row for row; any contract movement during the build appears under **Contract changes** in `plan.md` and the guide is regenerated | Contract frozen | Diff the registry table in the contract against the `PROBLEM_CODES` block and the response table in the guide | `docs/sdd/openapi/README.md` | main session | — |
| DOC-002-02 | The inheritance convention is written down: features from `009` onward **reference** `contracts/error-contract.md` instead of restating the envelope. `007`'s frozen contract is left alone | BE-002-06 | The note exists in `summary.md`; `009`'s contract, when written, cites this file | NFR-1 | main session | — |
| DOC-002-03 | A **proposed** amendment to `docs/sdd/05-api-conventions.md` is written into this feature's folder: add the `405`/`415` rows, and correct "`errors` only for `400`" to per-`type`. **The blueprint is not edited from inside a feature** — the edit is a product-owner action | TEST-002-08, contract frozen | The proposal names the exact lines and the replacement text; `summary.md` records that it is awaiting the product owner | `spec.md` Q-A, Q-C | main session | — |
| DOC-002-04 | `tests.md` and `ai-notes.md` completed with **observed** output; `dotnet ef migrations list` recorded as unchanged from `001`; board and delivery log updated | All | The `verify-story` gate | DoD | main session | `verify-story` |

## Review

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| REV-002-01 | One producer of the envelope; nothing under `Common/Errors/` touches `WaslDbContext`; `CancellationToken` on every async path; layer boundaries intact | All BE | `review.md` verdict is `Approved`, with the three `grep` outputs pasted into it | AC-2, DoD | `comprehensive-review:code-reviewer` | `code-review:code-review` |
| REV-002-02 | The generated OpenAPI document is compared against `contracts/error-contract.md`, row by row on the registry table | BE-002-11 | Any difference is fixed in one of the two before closing — never one silently | DoD | main session | — |
| REV-002-03 | No `title`-based branch and no second barrel file in `src/wasl-web`; every consumer has a default branch | All FE | `review.md`, with the `grep` output | AC-27, `frontend-spec.md` | `comprehensive-review:code-reviewer` | `code-review:code-review` |
| REV-002-04 | Security pass: nothing leaks on a `500`; a `403` enumerates no role; `/swagger` is off outside Development; no configuration value reaches a body | BE-002-11, TEST-002-05 | `review.md` against `docs/sdd/testing/security-checklist.md`, "Output and error handling" | NFR-4 | `comprehensive-review:security-auditor` | — |

## Droppable if time runs short

| Task | What is lost |
|---|---|
| BE-002-12 / TEST-002-19 (client disconnect) | Cancelled requests appear in the log as `500`s. Nothing user-facing breaks; what is lost is the log's signal-to-noise, and a `500` count nobody trusts is a `500` count nobody reads. Drop it, and note it |
| BE-002-11 / TEST-002-13 (Swashbuckle) | `/swagger` and the OpenAPI comparison in `REV-002-02`. This is the **most** droppable item here: the contract file still exists and both lanes still work from it. What is lost is the automated check that the contract and the code agree — replaced, if dropped, by a manual comparison recorded in `tests.md`. Also the largest single technical risk in the feature (`research.md` R-7), so dropping it removes risk as well as value |
| FE-002-04 (generated types) | The provisional hand-written types stay. Acceptable for exactly one feature; unacceptable as a habit, because ADR-011 §6 exists to make a contract change a compile error. If dropped, the PROVISIONAL comment stays in place and the task moves to `007` |
| TEST-002-19, TEST-002-15 | Two edge assertions. `CancellationToken` threading is still reviewed by `REV-002-01` |

## Not droppable

**BE-002-06 and TEST-002-08 (the status-code writer, and `/health` staying intact).**
Without the writer, a mistyped URL returns a `404` with an empty body and the frontend's
shared parser throws — so the most common failure in the product surfaces as a JavaScript
error. And without the `/health` assertion, the writer silently rewrites a frozen contract
from `001`. Two defects, one task, and both invisible on the happy path.

**BE-002-03 (the one factory).** It is the whole of Principle IV. Every later feature that
builds an error response by hand is a feature that had nowhere to call, and the retrofit is
across nineteen endpoints — which is the cost this feature exists to avoid paying.

**BE-002-02 and TEST-002-09 (the registry and its closure test).** Without the registry each
feature invents its own `type` and the four distinct `409` causes stop being distinguishable,
which is the specific guarantee `docs/sdd/05-api-conventions.md` gives clients. Without the
closure **test** the registry is a convention, and an unregistered code degrades into a `500`
indistinguishable from a real bug.

**TEST-002-10 (validator messages are keys).** It guards nothing today — there are no
validators — and from `007` onward it is the only thing standing between the product and
FluentValidation's own English shipping into the Arabic interface. Writing it now costs one
test; writing it after five features means fixing five features first.

**TEST-002-06 (the Development `500`).** Every other test in the suite runs in the test
environment, where the developer exception page is off, so every other test passes with the
defect present. Development is the environment the demo runs in.
