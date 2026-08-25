# 002 — Plan

**Phase:** 0 · **Role:** Architecture · **Agent:** `feature-dev:code-architect` ·
**Skill:** `speckit-plan`

## Backend design

Every file this feature creates or changes is named. A plan that does not name its files is
a description.

```text
src/
  Wasl.Domain/
    Wasl.Domain.csproj                    UNCHANGED — still zero PackageReference
    Common/
      DomainException.cs                  NEW  abstract. ErrorCode · MessageKey · MessageArgs · FieldKeys
      InvariantViolationException.cs      NEW  the aggregate refuses the operation
      DuplicateValueException.cs          NEW  a value that must be unique is not
      DomainErrorCodes.cs                 NEW  const strings — the vocabulary, no URI, no status
  Wasl.Api/
    Wasl.Api.csproj                       CHANGED  + MediatR, FluentValidation.DependencyInjectionExtensions,
                                                   Swashbuckle.AspNetCore
    Program.cs                            CHANGED  handler first · AddProblemDetails · behaviour · Swagger
    Common/
      Errors/
        ProblemTypes.cs                   NEW  the registry: code → URI · status · errorsAllowed · titleKey
        ProblemTypeRegistry.cs            NEW  lookup + the unregistered-code guard (AC-14)
        ProblemDetailsFactory.cs          NEW  the ONLY type that constructs a ProblemDetails (AC-2)
        GlobalExceptionHandler.cs         NEW  IExceptionHandler — exception → factory
        StatusCodeProblemWriter.cs        NEW  404/405/415/401/403 short-circuits → factory
        RequestValidationException.cs     NEW  field → message keys, thrown by the behaviour
        IProblemMessageSource.cs          NEW  the 005 seam. The ONLY path a sentence takes
        StaticProblemMessageSource.cs     NEW  002's only implementation
        ProblemMessages.cs                NEW  key → English. The ONLY file in src/ with a sentence
        TraceContext.cs                   NEW  one accessor for the traceId (BR-9.9 seam)
        ProblemResults.cs                 NEW  ProducesProblem<…> helpers for endpoint declarations
      Behaviors/
        ValidationBehavior.cs             NEW  MediatR IPipelineBehavior + FluentValidation
      OpenApi/
        SwaggerRegistration.cs            NEW  AddSwaggerGen + the shared failure responses
        ProblemDetailsSchemaFilter.cs     NEW  one schema, camelCase, traceId declared
tests/
  Wasl.Domain.Tests/
    Common/DomainExceptionTests.cs        NEW  codes are non-empty, unique, and key-shaped
  Wasl.Api.IntegrationTests/
    Errors/ErrorContractTests.cs          NEW  the envelope at every status
    Errors/InternalErrorBodyTests.cs      NEW  the 500 property set, Production and Development
    Errors/StatusCodeEnvelopeTests.cs     NEW  404 route miss · 405 · 415, and /health excluded
    Errors/TraceIdCorrelationTests.cs     NEW  response traceId == log correlation id
    Errors/ValidationBehaviorTests.cs     NEW  400 shape · two rules one field · handler not reached
    Errors/ProblemTypeRegistryTests.cs    NEW  registry closure over the Wasl.Api assembly (AC-14, AC-15)
    Errors/ValidatorMessageKeyTests.cs    NEW  every validator message is a symbolic key (AC-17)
    Errors/MessageSourceSeamTests.cs      NEW  substitute a stub source, observe the title (AC-18)
    Errors/OpenApiDocumentTests.cs        NEW  one shared schema · Development only
    TestHost/ThrowingEndpoints.cs         NEW  test-host-only routes. NEVER in src/
    TestHost/ProbeCommands.cs             NEW  a command + validator to exercise the pipeline
    TestHost/CapturingLoggerProvider.cs   NEW  captures log scopes so AC-4 can compare strings
src/wasl-web/                             see Frontend design — files land at 006 (spec Q-D)
```

### Where each decision is enforced

| Decision | Enforced by | Not by |
|---|---|---|
| One producer of the envelope | `ProblemDetailsFactory` is the only type that constructs one; `grep` in `tests.md` | Everyone remembering to call it |
| `Wasl.Domain` holds no HTTP concept | The exception carries a **string** code; the registry that turns it into a status lives in `Wasl.Api` | A comment saying not to add one |
| An unmapped failure is visible | Build-time closure test over the assembly + a `Critical` log at runtime (AC-14) | A `default:` case that guesses `409` |
| No English sentence outside one file | A test over every registered `IValidator`'s messages (AC-17) | Code review reading validators |
| `005` changes one line here | A stub message source substituted in a test today (AC-18) | An intention recorded in a comment |
| `traceId` is one identifier in three places | One accessor, and a test that compares the response against the captured log (AC-4) | Three callers each doing the obvious thing |
| Validation cannot be skipped | A MediatR pipeline behaviour | Each endpoint calling a validator |
| `003` cannot get ahead of validation | A registration-order assertion (AC-20) | `003` reading this file |
| No stack trace escapes | Set equality on the `500` body's property names (AC-12) | Asserting the body does not contain "Exception" |

### `Program.cs` order

This is the file where two of the project's named silent-failure hazards live. It is written
out in full, including the lines this feature does **not** add, so `004` and `005` slot in
rather than guess.

```csharp
// ── services ──
builder.Services.AddProblemDetails();                       // 002
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddSingleton<IProblemMessageSource, StaticProblemMessageSource>();  // 005 swaps THIS LINE and nothing else
builder.Services.AddMediatR(c => c.RegisterServicesFromAssemblyContaining<Program>());
builder.Services.AddValidatorsFromAssemblyContaining<Program>();

// Behaviour order is the pipeline order. Validation is FIRST, deliberately:
// a request that fails validation must not have opened a transaction (003, AC-20).
builder.Services.AddTransient(typeof(IPipelineBehavior<,>), typeof(ValidationBehavior<,>));
// builder.Services.AddTransient(typeof(IPipelineBehavior<,>), typeof(TransactionBehavior<,>));  // 003
// builder.Services.AddTransient(typeof(IPipelineBehavior<,>), typeof(AuditBehavior<,>));        // 003

builder.Services.AddSwaggerGen(SwaggerRegistration.Configure);   // 002

// ── pipeline ──
app.UseExceptionHandler();          // FIRST. Outermost, so it wraps everything below.
app.UseStatusCodePages(StatusCodeProblemWriter.Write);   // envelopes 404/405/415/401/403

// app.UseAuthentication();          // 004
// app.UseRequestLocalization();     // 005 — MUST be AFTER UseAuthentication. ADR-007 §4.
// app.UseAuthorization();           // 004 — AFTER localization, so a 403 title is translated.

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();               // Development ONLY. AC-23.
    app.UseSwaggerUI();
}

app.MapHealthChecks("/health", new() { ResponseWriter = HealthReportWriter.Write });   // 001
```

Four ordering facts, each with a reason, because ordering is the thing that fails silently:

| Order | Reason |
|---|---|
| `UseExceptionHandler` **first** | It only catches what runs inside it. Registered after authentication, an exception thrown *in* authentication returns whatever the framework does — usually an empty `500` — and the shape is broken exactly where nobody looks |
| `UseStatusCodePages` **second** | It has to be inside the exception handler (so a fault while writing the envelope is still caught) and outside everything that short-circuits |
| `UseRequestLocalization` **after** `UseAuthentication` | ADR-007 §4: the culture provider reads a claim, and before authentication there is no claim. It fails **quietly** — the app just always uses `Accept-Language`. ADR-007 calls this the single most likely defect in the whole build |
| `UseAuthorization` **after** `UseRequestLocalization` | A `403` has a localized `title`. Authorizing before the culture is resolved returns an English title to an Arabic user, and only on the denial path |

And one consequence that follows from the first row, recorded because it is not obvious: the
exception handler runs on the way **out**, after `RequestLocalizationMiddleware` has already
returned. Whether the ambient culture is still the request's at that moment is framework
behaviour this feature cannot verify (`research.md` R-11). So the message source reads the
culture recorded on `HttpContext`, never `CultureInfo.CurrentUICulture` (AC-28). The design
does not depend on the answer.

### How a failure becomes a response

```text
Wasl.Domain throws                Wasl.Api validates             framework short-circuits
InvariantViolationException       RequestValidationException      404 · 405 · 415 · 401 · 403
  ErrorCode = "invalid-             errors = { field → keys }       (no exception thrown)
  status-transition"                        │                              │
        │                                   │                              │
        └───────────────┬───────────────────┘                              │
                        ▼                                                  ▼
              GlobalExceptionHandler                          StatusCodeProblemWriter
                        │                                                  │
                        └──────────────────┬───────────────────────────────┘
                                           ▼
                            ProblemTypeRegistry.Lookup(code)
                              → URI · status · errorsAllowed · titleKey
                              → unregistered? Critical log + "internal"   (AC-14)
                                           ▼
                            IProblemMessageSource.Get(key, args, culture)   ← 005 swaps this
                                           ▼
                            ProblemDetailsFactory.Create(...)               ← the only constructor
                              + TraceContext.For(httpContext)               ← BR-9.9
                                           ▼
                            application/problem+json
```

Two entry points, one path from the registry onwards. That single path is what makes
"one shape everywhere" a property of the code rather than of everyone's discipline.

### The four types worth describing in prose

**`DomainException`** — abstract, in `Wasl.Domain`, with `string ErrorCode`,
`string MessageKey`, `object[] MessageArgs`, and an optional
`IReadOnlyDictionary<string, string[]> FieldKeys`. No status, no URI, no `HttpStatusCode`,
no `using Microsoft.*`. It says which rule broke and how to name it; it does not know HTTP
exists. Two concrete subclasses ship here — `InvariantViolationException` (the aggregate
refuses the operation) and `DuplicateValueException` (a value that must be unique is not) —
and features derive rule-specific types from them: `007` adds
`DuplicateCustomerException : DuplicateValueException`, `012` adds
`InvalidStatusTransitionException : InvariantViolationException`.

**`ProblemTypes`** — a `static readonly` array of rows: code, status, whether `errors` is
permitted, title key. It is the executable form of the registry table in
[`contracts/error-contract.md`](contracts/error-contract.md), and the two are compared by
`REV-002-02`. `ProblemTypeRegistry` wraps it with the lookup and the guard.

**`IProblemMessageSource`** — `string Get(string key, object[] args, string culture)`. One
method, one implementation, one registration. Its only job is to be the seam `005` replaces.
An interface with one implementation and no second in prospect is normally ceremony under
the constitution's own rule — this one is justified because the second implementation is
already scheduled, by name, in the next-but-one feature.

**`TraceContext`** — `static string For(HttpContext ctx)` returning
`Activity.Current?.Id ?? ctx.TraceIdentifier`. Eight lines whose entire purpose is that
three subsystems cannot each choose differently (`research.md` R-5).

### Test-host-only endpoints, not Development-only endpoints

The middleware needs something that throws in order to be tested, and this feature is
forbidden from adding a business endpoint.

`tests/Wasl.Api.IntegrationTests/TestHost/ThrowingEndpoints.cs` registers routes
(`/__test/throw/domain/{code}`, `/__test/throw/unhandled`, `/__test/validate`) through
`WebApplicationFactory.WithWebHostBuilder`. They exist **only** in the test host. Nothing in
`src/` references them, so there is no production surface to secure, to document, or to
remember to remove.

**Rejected: `if (app.Environment.IsDevelopment()) app.MapGet("/__diagnostics/error/...")`.**
It is less code and it is demonstrable in a browser. Rejected because a route that exists in
one environment and not another is the kind of thing that gets promoted by accident, and
because a diagnostic endpoint's absence in Production means the Production path is the one
never exercised. The test host exercises the real composition root with no production
surface at all — strictly better on both counts.

## Frontend design

**Specified and frozen here. Executed inside `006-design-system`, keeping the `FE-002-*`
identifiers.** `006` creates the React scaffold and runs after this feature; scaffolding
Vite here would duplicate `006` and put two features in progress at once. See `spec.md` Q-D.

```text
src/wasl-web/src/shared/api/
  problemDetails.ts        the ProblemDetails type · parseProblem() · isProblemDetails()
  problemCodes.ts          PROBLEM_CODES const · problemCode() → the last path segment
  fieldErrors.ts           applyFieldErrors(problem, setError, knownFields)
  index.ts                 (no barrel elsewhere in the app; this folder is the exception, and
                           the reason is written in frontend-spec.md)
src/wasl-web/src/shared/api/__tests__/
  problemDetails.test.ts   AC-24 — every malformed body a proxy can produce
  problemCodes.test.ts     AC-25 — a changed base host does not change a branch
  fieldErrors.test.ts      AC-26 — an unknown key becomes a form-level message
```

Three utilities, no UI. There is no screen in this feature —
[`frontend-spec.md`](frontend-spec.md) states that and says which features have the screens
that consume these functions.

The design rules, each with the failure it prevents:

| Rule | Prevents |
|---|---|
| `parseProblem` never throws; a non-conforming body becomes `errors/unparseable-response` | A mistyped URL surfacing as a JavaScript error instead of a not-found state (`research.md` R-6) |
| Branch on `problemCode(p)`, never on `p.title` | Every branch breaking the moment the user switches to Arabic (BR-8.7) |
| Never branch on `status` alone where a status has several codes | A `409` from a stale version being handled as a duplicate |
| Every consumer has a default branch | A new registry row breaking a deployed client |
| `applyFieldErrors` returns the keys it could **not** place, and the caller must render them | A server message the user never sees (AC-26) |
| Zod schemas mirror server rules and are never the authority (ADR-003) | Two implementations of one rule, diverging |

`ADR-011 §6` says client types are generated from OpenAPI, not hand-written. The
`ProblemDetails` interface in `problemDetails.ts` is therefore marked **PROVISIONAL** in the
file that declares it and is replaced from the generated document — `FE-002-04`, so the swap
is a task rather than something forgotten.

## Data changes

**None.** No table, no column, no index, no migration. See
[`data-model.md`](data-model.md), which also records *why* the error path deliberately
reads nothing from the database: it is the path that runs when the database is the thing
that is broken.

## Contract changes

**New contract, frozen:** [`contracts/error-contract.md`](contracts/error-contract.md).

No prior error contract file exists, so nothing is broken. What *is* new, and worth naming:

| Change | Effect on existing artifacts |
|---|---|
| The registry gains `errors/method-not-allowed` and `errors/unsupported-media-type` (`spec.md` Q-C) | Two rows not in `docs/sdd/05-api-conventions.md`'s status table. `DOC-002-03` proposes the amendment; this feature does not edit the blueprint |
| `errors` is declared **per `type`**, not per status (`spec.md` Q-A, `research.md` R-9) | Resolves a contradiction inside `docs/sdd/05-api-conventions.md`. Consistent with `007`'s frozen contract, which is the tie-breaker |
| `errors/ticket-closed` is registered but not raised (`spec.md` Q-B) | Reserved for `012`. A registry row with no producer is deliberate, so `012` does not invent one |
| `errors/unparseable-response` is client-only | Reserved so a future server code cannot collide with it |
| Every later feature's contract inherits this file by reference | `007`'s contract already restates the envelope inline. It stays as it is — it is frozen — and features from `009` onward reference this file instead of restating it. `DOC-002-02` records that transition rather than leaving two conventions in play |

## Test strategy

| Level | What | Why there |
|---|---|---|
| Unit — `Wasl.Domain.Tests` | Domain exception codes are non-empty, unique, and key-shaped | Pure. Needs no host and no database |
| Unit — inside `Wasl.Api.IntegrationTests` | Registry closure over the assembly (AC-14, AC-15); validator message shape (AC-17) | Both need the `Wasl.Api` assembly. `Wasl.Domain.Tests` must not reference `Wasl.Api` — that would invert the dependency the architecture test in `001` exists to protect. Placed here as plain unit test classes, not as HTTP tests |
| Integration | The envelope at every status; the `500` property set in Production **and** Development; `404` on a route miss; `405`; `415`; `/health` untouched; `traceId` equal to the log's; the `400` field shape; the handler not reached on an invalid request; behaviour order; the OpenAPI document | Every one is a property of the **real pipeline**. Middleware order, model binding, routing short-circuits, and status-code pages have no meaning outside a real host, and getting the order wrong is this feature's headline risk |
| Frontend — Vitest | The three utilities, including every malformed body a proxy can produce | Pure functions with many edge inputs — the cheapest tests in the project and the ones covering an entire class of runtime crash |
| **Deliberately not tested** | That `IExceptionHandler` is invoked by ASP.NET Core; that `System.Text.Json` serializes; that Swashbuckle generates a document | Testing the framework |
| **Deliberately not tested** | That the Arabic `title` differs from the English one | There is no `ar` catalogue until `005`. AC-28 asserts the **seam**; `005` asserts the behaviour. Claiming coverage here would be a false statement |
| **Deliberately not tested** | `401` and `403` against real policies | `004` owns them. The status-code envelope is tested here with synthetic short-circuits; `004` re-asserts it with real tokens (`docs/sdd/testing/test-strategy.md` already lists that test under `004`'s scope) |
| **Deliberately not tested** | Log **sink** output, formatting, or persistence | AC-4 compares the correlation id captured from the logging pipeline. What a sink does with it is Q-G, and there is no sink |

The one that matters most, stated plainly: **AC-13 is an integration test that boots the
host with `ASPNETCORE_ENVIRONMENT=Development`.** Every other test in the suite runs in the
test environment, where the developer exception page is off, so every other test would pass
with the defect present. Development is the environment the demo runs in.

## Dependencies

| Depends on | For |
|---|---|
| `001-solution-skeleton` | The solution, `Wasl.Api`, `WaslApiFactory`, `Testcontainers.MsSql`, warnings-as-errors, `/health` |
| Nothing else | This feature is a prerequisite for `003`, `004`, `005`, and every business endpoint |

New packages, and the consumer each has **in this feature**:

| Package | Consumer here | Why not later |
|---|---|---|
| `MediatR` | `ValidationBehavior` plus a test-host command | Deferring it means calling validators per endpoint at `007` and converting every slice later — the retrofit this feature exists to avoid (`research.md` R-10, `spec.md` A-6) |
| `FluentValidation.DependencyInjectionExtensions` | `AddValidatorsFromAssemblyContaining` in the behaviour | Same |
| `Swashbuckle.AspNetCore` | The shared `ProblemDetails` schema and the `ProducesProblem` helpers | If they do not exist when `007` is written, `007` declares its own inline schema and `009` declares another (`research.md` R-7) |

Depended on by, and what each takes:

| Feature | Takes |
|---|---|
| `003-audit-trail` | `TraceContext` (BR-9.9), the behaviour registration slot, the ordering assertion |
| `004-auth-and-roles` | `errors/unauthenticated` and `errors/forbidden` already registered and already enveloped |
| `005-localization-core` | One line: the `IProblemMessageSource` registration |
| `006-design-system` | The `FE-002-*` tasks, executed inside its scaffold |
| `007` onward | The registry, the `ProducesProblem` helpers, and the client utilities |

## Risks and trade-offs

### Considered and rejected: one mechanism instead of two

The constitution says "a single exception-handling middleware", and the obvious reading is
one component. Rejected after checking what an exception handler can see
(`research.md` R-1): a `404` on an unmatched route, a `405`, a `415`, and later a `401` and
a `403` are **short-circuits, not exceptions**. No handler is ever invoked for them.

An implementation that reads the constitution literally therefore ships an empty-bodied
`404` — the single most common failure a client actually receives — and the frontend's
shared parser throws on it. Two mechanisms, one factory: the constitution's requirement is
that there is one *shape* and one *producer*, and that is preserved exactly (AC-2).

Recorded prominently because it is the one place this plan does something the governing
document's literal wording does not.

### Considered and rejected: `Result<T>` instead of exceptions for expected failures

A `Result<T>` makes the failure path visible in the signature, and a `409` from the BR-1
matrix is an *expected* outcome rather than an exceptional one, so the argument is real.

Rejected for three reasons, in order of weight:

1. `CLAUDE.md` forbids mixing the two, and mixing is what happens in practice — a
   `Result<T>` returned from the domain, an exception thrown from EF Core, and two mapping
   sites instead of one
2. The mapping table would move **into every endpoint**. Each endpoint would translate its
   own `Result.Failure` into a status and a `type`, which is precisely the hand-built error
   response Principle IV forbids
3. It buys nothing the registry does not already provide. The failure modes are enumerated
   in a table either way; the only question is whether they are enumerated once or per
   endpoint

### Considered and rejected: the status code on the domain exception

An `int Status` or an `HttpStatusCode` property on `DomainException` removes the registry
lookup and one indirection.

Rejected: it puts an HTTP concept in the project whose entire claim is that it has none
(ADR-002, Principle III). The counter-argument — "it is just an integer" — is exactly how
the rule erodes, and the architecture test from `001` would not catch it, because `int` is
in the BCL. It would be a real violation that no test can see.

The registry costs one lookup and gives back a reviewable table plus the build-time closure
check (AC-14). Details in `research.md` R-2.

### Considered and rejected: `.WithErrorCode(key)` and leave the English in `.WithMessage`

More semantically correct — FluentValidation's `ErrorCode` is the machine-readable field.
Rejected because it leaves an English sentence in the validator **and** in the `en`
catalogue: two copies of one string, and the one in the validator is the copy that drifts.
ADR-007 §5 rejected English-as-key for the same reason. `research.md` R-4.

### Accepted risk: Swashbuckle on .NET 10

The live technical risk in this feature (`spec.md` A-5, `research.md` R-7). Swashbuckle has
historically trailed .NET releases, and .NET 9 shipped `Microsoft.AspNetCore.OpenApi`
in-box.

Contained by keeping every generator-specific line in `Common/OpenApi/` (two files) and by
[`contracts/error-contract.md`](contracts/error-contract.md) naming *the document*, not the
generator. If Swashbuckle does not work, `AddOpenApi()`/`MapOpenApi()` replaces it and no
acceptance criterion moves. The fallback is named now so it is a decision rather than a
discovery at `BE-002-11`.

### Accepted risk: MediatR arrives with no production handler

`001` R-7 set a rule — a package with no consumer is speculative — and a reviewer applying
it mechanically lands here. The answer is that the **behaviour is the consumer** and the
guarantee is structural, which is the sole reason MediatR is in the technology table at all
(`research.md` R-10). Written down rather than improvised in review.

### Accepted risk: `errors/ticket-closed` is registered with no producer

A registry row nothing raises looks like dead code, and someone will offer to delete it.
Contained by the `Owning feature` column reading `012 — reserved, not yet raised` and by
`spec.md` Q-B recording why: the alternative is `012` inventing a local code, which is the
exact failure the registry exists to prevent. The row is cheaper than the coordination.

### Known unresolved: the culture in force while the envelope is built

`research.md` R-11, `spec.md` Q-E. Not resolvable without running the framework, and no
`src/` exists yet. The design is written not to depend on the answer (AC-28), and
`TEST-002-14` is the empirical check, run at `005` when there is a second culture to
observe.

If the design had instead read `CultureInfo.CurrentUICulture` and the assumption were
wrong, every Arabic error response would silently return English — an error path, in a
second language, which is the least-walked corner of any product. That asymmetry is why the
open question is closed pessimistically rather than left to the test.
