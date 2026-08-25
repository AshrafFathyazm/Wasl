# 002 — AI Usage Notes

**State: `002` core implemented and run on 2026-08-25. The `·b` and `·FE` halves are not.**

The Specification and planning section below was written before any code existed and is left
as it was — including the five framework assumptions it could not verify. Four of them are
now closed by the Implementation section, and saying so there rather than editing the earlier
claim is the point: what was unverified at planning time stays visible as having been
unverified.

---

## Specification and planning

**Used for:** reading the error-contract surface of the blueprint end to end and reconciling
it against itself and against the two already-specified features. Specifically:
`.specify/memory/constitution.md`, `specs/README.md`, `docs/sdd/00-project-context.md`,
`docs/sdd/01-product-spec.md` (NFR table), `docs/sdd/04-business-rules.md` (BR-8, BR-9),
`docs/sdd/05-api-conventions.md`, `docs/sdd/09-definition-of-done.md`,
`docs/sdd/documentation/api/error-handling.md`, `docs/sdd/openapi/README.md`,
`docs/sdd/testing/test-strategy.md`, `docs/sdd/testing/edge-cases.md`,
`docs/sdd/testing/security-checklist.md`, `docs/sdd/decisions/ADR-007-localization.md`,
`docs/sdd/decisions/ADR-011-react-architecture.md`, `CLAUDE.md`, and all of
`specs/001-solution-skeleton/` and `specs/007-create-customer/`.

### Accepted as-is

- The `type` registry in `docs/sdd/documentation/api/error-handling.md`. All eleven rows were
  taken unchanged; nothing was renamed and nothing was dropped
- The status-code table in `docs/sdd/05-api-conventions.md`, and its "`200` is never returned
  with an error in the body"
- BR-8.6 / BR-8.7's split between localized sentences and machine-readable values, and
  ADR-007 §5's symbolic-key rule. Both were already written as testable propositions
- BR-9.9's requirement that one identifier joins the response, the log, and the audit row
- `007-create-customer`'s frozen contract shape, including the `409`-carries-`errors`
  decision, which this feature adopted rather than overruled — a frozen contract is the
  tie-break when the blueprint disagrees with itself
- `001`'s document structure, tone, and task-table format, copied rather than reinvented

### Modified, and why

| What | Change | Reason |
|---|---|---|
| "A single exception-handling middleware" (constitution IV) | Implemented as **two mechanisms, one factory** | An exception handler never sees a `404` on an unmatched route, a `405`, a `415`, or an auth short-circuit. The literal reading ships an empty-bodied `404` — the most common failure a client receives — and the frontend's shared parser throws on it. One *shape* and one *producer* are preserved exactly. `research.md` R-1, and flagged in `checklists/requirements.md` as a deliberate divergence |
| The status table | Added `405` and `415` rows | ASP.NET Core returns both whether or not a table lists them. `DOC-002-03` proposes the amendment; the blueprint is not edited from inside a feature |
| "`errors` is present only for `400`" | `errors` is declared **per `type`** | The same file contradicts itself in its own Arabic example, and `007`'s frozen contract plus `CLAUDE.md` both say `400` and `409`. `research.md` R-9 |
| `001` R-7's Swashbuckle justification | Kept the decision, replaced the reason | "More than one endpoint to document" is not true of this feature — it adds none. The real reason is the shared failure schema every later endpoint declares against. `research.md` R-7 |
| `001` R-7's deferral of Serilog "to `002`" | Not adopted | BR-9.9 needs a correlation **scope**, not a sink. `spec.md` Q-G |
| Where the status code lives | On a registry in `Wasl.Api`, keyed by a string code the domain exception carries | An `int Status` property on the domain exception is "just an integer", and that is exactly how ADR-010's rule erodes — and `001`'s architecture test cannot catch it, because `int` is in the BCL. `research.md` R-2 |

### Rejected

| Suggestion | Why it was rejected |
|---|---|
| `Hellang.Middleware.ProblemDetails` | The right answer before .NET 7. `AddProblemDetails()` and `IExceptionHandler` are first-class now, and a package whose job the framework does is a dependency with nothing behind it |
| A hand-written `try/catch` middleware as the only mechanism | Bypasses `IProblemDetailsService`, so our shape and the framework's paths become two shapes. The whole feature is about it being one |
| `Result<T>` for expected failures instead of exceptions | `CLAUDE.md` forbids mixing, and mixing is what happens in practice. Worse, the mapping table would move into every endpoint — the hand-built error response Principle IV forbids. `plan.md` Risks |
| An `HttpStatusCode` or `int Status` property on `DomainException` | Puts an HTTP concept in the project whose entire claim is that it has none (ADR-010). Undetectable by any existing test, which makes it worse rather than more convenient |
| `.WithErrorCode(key)` with an English sentence left in `.WithMessage` | Leaves one string in two places — the validator and the `en` catalogue — and the validator's copy is the one that drifts. ADR-007 §5 rejected English-as-key for the same reason. `research.md` R-4 |
| A `Development`-only diagnostic endpoint to exercise the middleware | A route that exists in one environment and not another gets promoted by accident, and its absence in Production means the Production path is never exercised. Test-host-registered routes exercise the real composition root with no production surface. `plan.md` |
| Reading `CultureInfo.CurrentUICulture` in the message source | The handler is outermost, so it runs after `RequestLocalizationMiddleware` has returned. If the ambient culture does not survive that, **every Arabic error silently returns English** — an error path in a second language, the least-walked corner of any product. `research.md` R-11 |
| Storing the message catalogue or the registry in the database | ADR-007 rejected database translations outright. Worse here specifically: the error path is the path that runs when the database is what is broken, so it would turn every diagnosable `409` into an undiagnosable `500` at the worst moment. `data-model.md` |
| Asserting the `500` body "does not contain 'Exception'" | Passes when the leak is `System.Data.SqlClient`, a file path, or a connection string — which are the leaks NFR-4 is actually about. Replaced with set equality on property names (AC-12) |
| Scaffolding Vite here so the frontend utilities could be written in this feature | Duplicates `006-design-system` and puts two features in progress at once, against the WIP limit. The tasks keep `FE-002-` identifiers and execute inside `006`. `spec.md` Q-D |
| Filling in "expected" test results for the ACs so the feature would look complete | Principle II. Nothing has run |

### How each accepted output was verified

Every claim about the blueprint was checked by **reading the file**, not by recalling it,
and the specific line was located before it was cited:

| Claim | How it was checked |
|---|---|
| The eleven `type` values and their statuses | Read the table in `docs/sdd/documentation/api/error-handling.md` in full |
| Four `409` types vs five | Compared `05-api-conventions.md`'s prose against `error-handling.md`'s table, line by line. The discrepancy is real, not a misreading |
| `errors` only on `400` — and the counter-example | Both passages are in `05-api-conventions.md`; the Arabic example is in its Localization section, forty lines below the sentence it contradicts |
| BR-8.6, BR-8.7, BR-8.9, BR-8.12, BR-9.2, BR-9.4, BR-9.9 | `grep` for each identifier in `docs/sdd/04-business-rules.md`, then read the surrounding rows |
| NFR-2, NFR-4, NFR-10 | Read the NFR table in `docs/sdd/01-product-spec.md` |
| The `UseRequestLocalization` ordering hazard, and that it fails silently | Read ADR-007 §4 in full, including the sentence naming it the most likely defect in the work |
| ADR-011 §4, §5, §6 | Read all three sections; the component-kind table and the "expected states inline" split are quoted from them |
| `/health`'s response shape, including its `503` | Read `specs/001-solution-skeleton/contracts/health-api.md`. This is where the collision with a blanket status-code envelope was found |
| `001` created no `Common/Errors/` or `Common/Behaviors/` folder | Read `specs/001-solution-skeleton/plan.md`'s file tree; both folders are named in `CLAUDE.md`'s project structure but not created by `001` |
| No `src/` exists yet | `ls d:/Projects/Wasl` — the repository is `CLAUDE.md`, `README.md`, `docs`, `specs`. This is why nothing in `research.md` claims an observed .NET behaviour |
| The exact agent and skill strings in `tasks.md` | Copied from the table in `specs/README.md`, not from memory |
| The task-table column set and the AC-map format | Copied from `specs/001-solution-skeleton/tasks.md` and `checklists/requirements.md` |

**Where verification was not possible, it says so.** Four framework behaviours are load-bearing
and none was executed, because there is no solution to execute:

| Unverified | Where it is recorded | How the design contains it |
|---|---|---|
| .NET 10 keeps `IExceptionHandler` / `AddProblemDetails` semantics | `spec.md` A-1, `research.md` R-1 | The handler becomes hand-written middleware; the registry, factory, message source, and all 28 ACs are unchanged |
| A malformed JSON body surfaces as `BadHttpRequestException` | `spec.md` A-2 | Both mechanisms are in place, so whichever path it takes is enveloped. AC-7 is the test that tells us which |
| `Activity.Current` is non-null under default hosting | `spec.md` A-3 | One accessor with a fallback. Correlation holds either way, because all three consumers call the same accessor |
| Whether the ambient culture survives to the outermost handler | `spec.md` Q-E, `research.md` R-11 | The culture is read from `HttpContext`, never from ambient state. The design does not depend on the answer |
| Swashbuckle works on .NET 10 controllers — **verified** | `spec.md` A-5, `research.md` R-7 | Generator-specific code confined to two files; `AddOpenApi()` is the named fallback |

No API, package, or method named in `plan.md` was confirmed to exist by running anything.
That confirmation is part of `BE-002-01` onward and belongs in the Implementation section
below.

**Not put into any prompt:** no credentials, no connection strings, no tokens, no customer
data. Nothing in this feature touches a secret; the only environment-dependent value it
discusses — the `type` base URI — is deliberately a compile-time constant rather than
configuration (AC-16).

---

## Implementation

**Ran on 2026-08-25. `002` core only** — the six items the product owner approved: domain
exception hierarchy, the registry, `IExceptionHandler` + one `ProblemDetailsFactory`, one
`traceId` accessor, MediatR `ValidationBehaviour`, and the core tests.

No subagent was dispatched for this feature. Everything below was written in the main session,
so "what the agent returned" is "what I wrote" — and the verification column is the part that
carries any weight.

### The five planning assumptions, revisited

The planning section names five framework behaviours it could not verify. Three are now closed
by a build and a test run, one is closed by design, and one is still open:

| Assumption | Outcome |
|---|---|
| A-1 — .NET 10 keeps `IExceptionHandler` / `AddProblemDetails` semantics | **Holds.** `AddExceptionHandler<GlobalExceptionHandler>()` + `app.UseExceptionHandler()` behave as documented. The hand-written-middleware fallback was not needed |
| A-3 — `Activity.Current` is non-null under default hosting | **Holds.** Every observed `traceId` is a W3C trace-context id (`00-4f13…-135b…-00`), never the `HttpContext.TraceIdentifier` fallback. The fallback stays, because it costs one `??` and its absence would be discovered in a hosting configuration nobody tested |
| A-5 — Swashbuckle on .NET 10 controllers | Verified during planning, unchanged. Not exercised here — `002` core adds no OpenAPI |
| Q-E — whether the ambient culture survives to the outermost handler | **Still unanswered, and now deliberately unanswerable.** `IProblemMessageSource` never reads `CultureInfo.CurrentUICulture`, so there is nothing to observe. `005` answers it against a real `RequestLocalizationMiddleware` |
| A-2 — malformed JSON surfaces as `BadHttpRequestException` | **Not verified.** It is `002b`'s AC-7, and the mechanism that would catch it — `UseStatusCodePages` — is not registered yet |

### What was written, and what verified it

| Task | Output | Verified by |
|---|---|---|
| `BE-002-01` | `DomainErrorCodes`, `DomainException`, `InvariantViolationException`, `DuplicateValueException` | `dotnet build` clean; `LayerDependencyTests` confirms `Wasl.Domain` still declares **zero** package references |
| `BE-002-02` | `ProblemTypes` — 13 rows, the `TypeBase` constant, `All` / `UriFor` / `Find` | `ProblemRegistryTests` (5), including registry ↔ `DomainErrorCodes` completeness in **both** directions |
| `BE-002-03` | `ProblemDetailsFactory` — the only constructor of `ProblemDetails` in `src/` | `OnlyTheFactory_ConstructsProblemDetails`, asserted over the source tree |
| `BE-002-04` | `TraceContext` — `Activity.Current?.Id ?? context.TraceIdentifier` | `TraceId_AppearsExactlyOnce_AtTheTopLevel`, asserted on raw JSON |
| `BE-002-05` | `GlobalExceptionHandler`, registered via `AddExceptionHandler` with `app.UseExceptionHandler()` as the first pipeline call | `ErrorEnvelopeTests` (11), through the real middleware via an `IStartupFilter` |
| `BE-002-07` | `IProblemMessageSource` + `StaticProblemMessageSource`, 14 entries | Every title in every observed response is a sentence, and the source is the only place a sentence exists |
| `BE-002-08` | MediatR + `ValidationBehaviour` + `AddApplication()` | `InvalidRequest_NeverReachesTheHandler` — the handler's flag stays false |
| `BE-002-09` | Behaviour registration order explicit and commented, with the `003` slots reserved after validation | **Not asserted.** `TEST-002-12`'s order half needs a second behaviour to be meaningful — deferred to `003`, and recorded in `tests.md` |

### Rejected during implementation

Three moves that looked obvious at the keyboard and were not:

| Rejected | Why |
|---|---|
| Having `ProblemTypes.Find` infer a status for an unknown code from the code's shape | A code containing "duplicate" is not necessarily a `409`, and a guess produces a response the client branches on incorrectly. `Find` returns `null`, the factory logs `Critical` naming the code, and the response is `500`. A wrong-looking answer that is honest beats a right-looking one that is invented |
| Registering the probe routes in `src/` behind an environment check | Rejected at planning time and it came up again when the `IStartupFilter` needed writing. A route that exists in one environment is a route promoted by accident |
| Loosening AC-2's assertion to "at most two files" once `GlobalExceptionHandler` matched | The test was wrong, not the rule. Fixing the pattern kept the rule at exactly one producer; widening the assertion would have made the next *real* second producer invisible |

### The defect worth naming

`ProblemDetailsFactory` was registered **scoped** and consumed by a **singleton** —
`AddExceptionHandler<T>` registers the handler as one. .NET validates scopes only in
Development, so the test environment started cleanly and Development refused to build.

Fixed to `AddSingleton`, which is correct rather than convenient: the factory holds no
per-request state, every request-specific value arrives as an `HttpContext` parameter. The
constraint is written at the registration site in `Program.cs`, because `004` will want to
inject scoped `ICurrentUser` there and would reintroduce it exactly.

It was found by AC-13, a criterion written for an entirely different reason — no developer
exception page. That is the argument for writing criteria down before knowing what they catch.

**Not put into any prompt:** no credentials, no connection strings, no tokens, no customer
data. The one string in this feature that looks like a secret — `Password=hunter2` in the
probe — is a fake, and it exists so the leak test asserts the absence of a *real* leak rather
than an absence in principle.

---

## Testing

`tests.md` holds the commands and their real output: **33 tests, 33 passed, 0 skipped**, and
`0 Warning(s) 0 Error(s)`. Nothing is recorded there that was not observed.

### Watched failing first

The planning section asks for two of these. One changed shape and one was not done:

- **`TEST-002-03` — `traceId` under `extensions`.** Not run as a deliberate mutation, because
  it was observed failing for real: the first version of the factory put `traceId` into
  `Extensions` and the serialiser flattened it. That is why the test asserts on raw JSON text
  and greps for `"extensions"` instead of deserialising — the assertion has the shape it has
  because of what was seen, not what was imagined
- **`TEST-002-10` — a validator carrying an English sentence.** **Not done.** It guards nothing
  today; the only validators in the solution are the probe's. It belongs with `002b`'s sweep
  over every registered validator, and until then AC-17 is a convention — which `tests.md` says
- **Three tests failed for real**, and one of the three was the code's fault rather than the
  test's: the captive dependency above. The other two were a missing handler registration and
  an imprecise grep, both recorded in `tests.md` with their output

### What is not tested, and why

The full list is `tests.md`'s Gaps table. One entry there is a genuine defect rather than a
deferral: **`errors` keys come back PascalCase** (`FullName`), because FluentValidation reports
the CLR property name while the contract's field names are camelCase. The test asserts the
current behaviour so the mismatch is visible rather than hidden, and the fix belongs with
`002b`'s contract work.

Framework behaviour is deliberately untested: that MediatR dispatches, that FluentValidation
validates, that ASP.NET Core routes. A test over any of those asserts that a package was
installed.
