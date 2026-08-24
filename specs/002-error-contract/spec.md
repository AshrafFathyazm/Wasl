# 002 — Error Contract

**Phase:** 0 · Foundation · **Story:** — (infrastructure, not a user story) ·
**Status:** Specified, awaiting review

## Understanding

Principle IV of the constitution says one error shape everywhere, produced by a single
middleware. That is a claim about **every** endpoint, and it is only cheap while the
number of endpoints is one.

Retrofitting an error contract is not a refactor of one file. It is: find every place
that returns a failure, decide which of eleven `type` values it is, move the sentence out
of the endpoint into a catalogue, add the `traceId`, remove the ad-hoc shape the client
already parses, and then fix the client. Multiply by the nineteen endpoints in
`docs/sdd/05-api-conventions.md`. So it lands here, at one endpoint, where it costs one
folder.

Three things in this feature are not "error handling" in the ordinary sense, and they are
why it is a feature rather than a task inside `001`:

1. **The `type` registry is a shared vocabulary.** `docs/sdd/05-api-conventions.md` names
   four distinct `409` causes precisely so a client can tell a duplicate from a stale
   version. That distinction is worth nothing if `012` invents
   `errors/status-conflict` locally while `016` invents `errors/escalation-conflict`. One
   file owns the vocabulary, and a new failure mode is a row added to it.
2. **The message seam for `005`.** `005-localization-core` must be able to translate every
   server-authored sentence by swapping a string source, not by touching eleven call
   sites. That is a design constraint on *this* feature: no sentence is written anywhere
   except one catalogue-shaped file, and no sentence reaches a response except through one
   interface.
3. **`traceId` is the join key for three systems.** BR-9.9 requires the value in the
   response, the value in the log, and the value on the audit row (`003`) to be one
   identifier. Three subsystems each deriving "the trace id" produce three
   plausible-looking opaque strings that do not match, and nobody finds out until an
   incident — the worst possible moment.

The most valuable content below is the list of ways this feature fails **silently**. A
developer exception page in Development, a FluentValidation rule that forgot
`.WithMessage(key)` and emits fluent English no catalogue will ever translate, a `404`
that never reaches the middleware because no exception was thrown, a `traceId` sitting in
`extensions` instead of at the top level — each looks like success. AC-3, AC-9, AC-13,
AC-14, AC-17, AC-26, and AC-28 exist for exactly that reason.

## In scope

- **`Wasl.Api/Common/Errors/`** — one exception handler, one factory that is the only code
  allowed to construct a `ProblemDetails`, and one writer that gives the envelope to
  statuses the framework produces *without* an exception (`404`, `405`, `415`, and later
  `401`/`403`)
- **The domain exception hierarchy in `Wasl.Domain`** — invariant violations only, carrying
  a machine-readable `ErrorCode` and a symbolic message key. **No HTTP type, no status
  code, and no `type` URI in `Wasl.Domain`** (Principle III, ADR-010)
- **The `type` URI registry** — code to URI, status, whether `errors` is permitted, and the
  title key. Plus the guard that makes an *unregistered* code loud rather than a `500`
  indistinguishable from a real bug
- **FluentValidation as a MediatR pipeline behaviour** producing the `400` field-level
  shape. A behaviour, not per-handler discipline (Principle V)
- **The `traceId` seam** — one accessor, read by the response, by the log scope, and by
  `003`'s audit row, so BR-9.9 is structural rather than coincidental
- **The message seam** — the single point at which a human sentence enters a response, so
  `005` swaps one implementation and changes nothing else
- **Swashbuckle**, with the shared `ProblemDetails` schema and the failure-response
  declarations every later endpoint reuses
- **The frontend shared error utilities** — a typed parser, `problemCode()`, the
  branch-on-`type`-never-on-`title` rule, and the mapping from a field-level error onto a
  React Hook Form field. See Q-D on *when* those files are written

## Out of scope

| Excluded | Where it lives |
|---|---|
| Localization of `title`, `detail`, and validation messages | `005-localization-core`. This feature is **built so that `005` swaps one implementation of the message source** and touches nothing else in `Common/Errors/` — AC-18 is that constraint, tested |
| Culture resolution, `UseRequestLocalization`, `Content-Language` | `005`. The ordering comment block `005` slots into is written here — see `plan.md`, Program.cs order |
| The audit row for a denied action (BR-9.2, BR-9.4) | `003-audit-trail`. This feature supplies the `traceId` accessor that row reads |
| The transaction pipeline behaviour | `003`. Its ordering relative to validation is asserted here (AC-20) so `003` cannot quietly insert itself first |
| `401` and `403` — the middleware that *raises* them and the policies behind them | `004-auth-and-roles`. Enveloping them is in scope here (AC-10); producing them is not |
| Any business endpoint, command, validator, or DTO | The feature that owns it. `007` is the first |
| The React application scaffold, tokens, primitives | `006-design-system` |
| `errors/duplicate-customer` being *raised* | `007`. Its **registry row** is written here, because the registry is the vocabulary |
| Structured logging sinks (Serilog) | No requirement. `001` R-7 deferred it "to `002`"; Q-G answers it — BR-9.9 needs a correlation scope, and a sink is not one |
| Retry, circuit breaking, rate limiting | No requirement in `docs/sdd/01-product-spec.md` |

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | .NET 10 keeps `IExceptionHandler`, `AddProblemDetails()`, and `IProblemDetailsWriter` with .NET 8/9 semantics | The handler becomes a hand-written `try/catch` middleware. Registry, factory, message source, and every AC are unchanged — one file differs. `research.md` R-1 |
| A-2 | A malformed JSON body in a Minimal API surfaces as `BadHttpRequestException` before the handler runs | AC-7 is the test that tells us. If it surfaces differently, the handler maps one more exception type; if it short-circuits with no exception, the status-code writer catches it — which is why both mechanisms exist rather than one |
| A-3 | `Activity.Current` is non-null under default hosting, so the W3C trace id is available | The accessor falls back to `HttpContext.TraceIdentifier`. Correlation still holds, because the response, the log scope, and `003` read the **same accessor** instead of each deriving its own — which is the actual requirement in BR-9.9 |
| A-4 | There is one host in the `type` URI in every environment | Any client comparing the full URI breaks on a host change. Contained rather than prevented: the base is a compile-time constant (AC-16) and the frontend compares the last path segment (AC-25) |
| A-5 | Swashbuckle supports .NET 10 Minimal APIs adequately | Swap to the built-in `AddOpenApi()`. Only `Common/OpenApi/` changes; no contract and no AC moves. This is the live technical risk in the feature — `research.md` R-7 |
| A-6 | MediatR arriving here with no production handler is acceptable, because the behaviour *is* its consumer | If a reviewer applies `001` R-7's own no-consumer test, the fallback is validation called explicitly per endpoint at `007` and converted later — the retrofit this feature exists to avoid. Argued in `plan.md`, Risks |

## Open questions

| # | Question | Working assumption |
|---|---|---|
| Q-A | `docs/sdd/05-api-conventions.md` says "`errors` is present only for `400` validation failures" and then shows a `409` **with** an `errors` object in its own Arabic example. `007`'s frozen contract and `CLAUDE.md` both say `400` and `409`. Which holds? | `errors` is permitted on `400` and on a `409` whose cause is attributable to a named request field. It is decided **per type** in the registry, not per status — so `errors/concurrency-conflict` carries none and `errors/duplicate-customer` does. Recorded because it is a contradiction inside one blueprint file, not a gap |
| Q-B | `docs/sdd/05-api-conventions.md` names **four** `409` types; `docs/sdd/documentation/api/error-handling.md` names **five**, adding `errors/ticket-closed` | Register all five. `errors/ticket-closed` is marked *reserved by `012`* and is not raised here. A registry that omitted it would force `012` to invent one locally, which is the failure the registry exists to prevent |
| Q-C | `405`, `415`, and `406` are absent from the status table in `docs/sdd/05-api-conventions.md`, but ASP.NET Core returns all three | Register `errors/method-not-allowed` and `errors/unsupported-media-type`. `406` is unreachable — the API produces only `application/json` and `application/problem+json`. `DOC-002-03` *proposes* the amendment to `05-api-conventions.md` rather than editing the blueprint from inside a feature |
| Q-D | The frontend utilities have no application to live in: `006-design-system` creates the React scaffold and it runs **after** this feature | The `FE-002-*` tasks are **specified and frozen here** and **executed inside `006`**, keeping their `FE-002-` identifiers so the dependency is visible in both task lists. Scaffolding Vite here would duplicate `006` and put two features in progress at once, which the WIP limit forbids |
| Q-E | Does `RequestLocalizationMiddleware` restore the ambient culture before the outermost exception handler runs on the way out? | Assume it does — assume the worst. The message source therefore reads the culture recorded on `HttpContext` by `005`, never `CultureInfo.CurrentUICulture` (AC-28). If the assumption is wrong the design is merely belt-and-braces; if it is right and we had relied on ambient state, every Arabic error would silently return English |
| Q-F | Should a `500` carry `instance`? `05-api-conventions.md` says the body carries "a trace id and nothing else"; `error-handling.md` says "a title, a status, and a `traceId`" | Yes: `type`, `title`, `status`, `instance`, `traceId`. "Nothing else" means no `detail` and no `errors`. `instance` is the caller's own request path and leaks nothing they did not send, and a body without `type` would make `500` the one status the shared client parser cannot read |
| Q-G | `001` R-7 deferred Serilog "to `002`, where the error contract creates the first real log entry" | Not adopted. BR-9.9 needs a **correlation scope**, which `Microsoft.Extensions.Logging` gives with `BeginScope`; Serilog is a sink and enrichment story with no stated requirement behind it. Revisit when something needs to read logs off-machine |

## Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | Every non-2xx response from any route returns `Content-Type: application/problem+json` and a body carrying at minimum `type`, `title`, `status`, and `traceId` |
| AC-2 | Exactly one type constructs the envelope. `grep -rn "new ProblemDetails" src/` returns hits only inside `Common/Errors/ProblemDetailsFactory.cs` |
| AC-3 | `traceId` appears **once**, as a top-level JSON property — not nested under an `extensions` object. Asserted against the raw JSON text, not a deserialized object, because a deserializer hides the difference |
| AC-4 | The `traceId` in a response is byte-identical to the correlation id in the server log entry for that same request. Asserted by an integration test that captures the log and compares the two strings (BR-9.9) |
| AC-5 | A request failing validation returns `400`, `type` `errors/validation`, and an `errors` object whose keys are the **request field names as they appear in the payload** — camelCase, no prefix, no type name |
| AC-6 | A single field breaking two rules yields **two** entries in that field's message array. Not one, and not two responses |
| AC-7 | A malformed JSON body returns `400` with `type` `errors/malformed-request` and the full envelope. Never `500`, and never a `400` with an empty body |
| AC-8 | A malformed `Guid` in a route value returns `400` `errors/malformed-request` with the full envelope |
| AC-9 | A request to an unmatched route returns `404` `errors/not-found` with the full envelope and a `traceId` — **although no exception was thrown**, so the exception handler was never invoked |
| AC-10 | `405` and `415` carry the envelope, as does any `401`/`403` short-circuit. Re-verified in `004` against real policies |
| AC-11 | `GET /health` is **excluded** from the envelope. Its `503` still matches `specs/001-solution-skeleton/contracts/health-api.md`, byte for byte |
| AC-12 | An unhandled exception returns `500` `errors/internal` whose body property names are **exactly** `type`, `title`, `status`, `instance`, `traceId`. Asserted as set equality on the JSON property names — not as a substring search for "Exception", which passes for the wrong reason (NFR-4) |
| AC-13 | AC-12 holds with `ASPNETCORE_ENVIRONMENT=Development`. The developer exception page never renders for a request under `/api`, and never returns HTML in place of the envelope |
| AC-14 | A domain exception whose `ErrorCode` is not in the registry produces `500` `errors/internal` **and** a `Critical` log entry naming the missing code; and a test over the `Wasl.Api` assembly fails the build if any domain-exception subtype declares a code the registry does not contain |
| AC-15 | Every registry row has a unique `type` URI, and every row's status appears in the status table in `contracts/error-contract.md` |
| AC-16 | The `type` base URI is a compile-time constant appearing once in `src/`. `grep -rn "wasl.local/errors" src/` returns one hit, and it is not in a configuration file |
| AC-17 | No human sentence exists in `src/Wasl.Domain/` or in any validator. A test instantiates every registered `IValidator`, runs it against a default request, and asserts every returned message matches the symbolic-key shape `^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)+$`. A rule that forgot `.WithMessage(key)` therefore fails the build instead of shipping FluentValidation's own English (ADR-007 §5) |
| AC-18 | The message source is the only path by which a sentence enters a response, and it has exactly one implementation and one registration. A test substitutes a stub implementation and observes a changed `title` with no other production file altered — which is the whole of `005`'s change to this feature |
| AC-19 | The validation behaviour runs **before** the handler. Asserted with a handler that throws if invoked at all: an invalid request returns `400` and the handler never ran |
| AC-20 | The pipeline behaviour registration order is asserted by a test naming the expected sequence, so `003` cannot insert the transaction behaviour ahead of validation without going red. A request failing validation must not have opened a transaction |
| AC-21 | Every validator is invoked with the request's `CancellationToken`. A cancelled token aborts validation rather than completing it |
| AC-22 | `/swagger/v1/swagger.json` in Development contains exactly one `#/components/schemas/ProblemDetails`, that schema declares `traceId`, and every declared failure response references it rather than an inline schema |
| AC-23 | `/swagger` and `/swagger/v1/swagger.json` return `404` when the environment is not Development |
| AC-24 | The frontend parser returns a typed `ProblemDetails` for a contract-shaped body and a **synthetic** one with `type` `errors/unparseable-response` for a non-JSON body, an empty body, or a body missing `type`. It never throws — a gateway returning an HTML `502` must not crash the caller |
| AC-25 | `problemCode(problem)` returns the last path segment of `type`. A test changes the base host in the fixture and every branch still matches, proving no client compares the full URI |
| AC-26 | `applyFieldErrors` maps each `errors` key onto the form field of that exact name. A key with **no matching field** surfaces as a form-level message and is never dropped — a server error the user cannot see is worse than no validation at all |
| AC-27 | No frontend utility branches on `title`, and none branches on `status` alone for a status that has more than one registered `type`. Enforced by a test over the utilities plus a recorded review rule |
| AC-28 | The message source resolves using the culture recorded on `HttpContext` by the localization layer, never `CultureInfo.CurrentUICulture`. In this feature it always resolves `en`; the criterion is that the seam exists and is the one used (Q-E) |

## Edge cases

| Case | Expected |
|---|---|
| Malformed JSON body | `400` `errors/malformed-request`, full envelope (`docs/sdd/testing/edge-cases.md`) |
| Empty body where one is required | `400` `errors/malformed-request`, not `500` |
| Valid JSON of the wrong shape — an array where an object is expected | `400` `errors/malformed-request` |
| Body contains an unknown field | Ignored. Not an error; the DTO binds what it declares (`007` contract) |
| Route value `id` is `not-a-guid` | `400` `errors/malformed-request` |
| `GET /api/nothing-here` | `404` `errors/not-found` with a `traceId`, produced with no exception in play |
| `DELETE` on a route that declares only `GET` | `405` `errors/method-not-allowed`, enveloped |
| `Content-Type: text/xml` on a `POST` | `415` `errors/unsupported-media-type`, enveloped |
| `GET /health` while the database is down | `503` in the **health** shape, not the error shape (AC-11). Two contracts meet on one response and the health one wins |
| A handler throws `OperationCanceledException` because the client disconnected | No response written, and the fault is **not** logged as a `500`. A cancelled request is not an error, and logging it as one trains people to ignore real `500`s |
| A validator itself throws | `500` `errors/internal`. A broken validator is a defect, not a `400` |
| Two `IValidator<T>` registered for one request, both failing | One `400`, messages merged per field, no duplicates |
| A domain exception raised inside `003`'s transaction scope | The transaction rolls back **and** the envelope is returned. Ordering asserted by AC-20 |
| An exception thrown while *writing* the error response, after the response started | The connection is aborted and the fault is logged. The envelope cannot be written over a started response, and pretending otherwise produces a corrupt body |
| A domain error code absent from the registry | `500` plus a `Critical` log naming the code (AC-14). Never a `409` guessed by default — guessing turns an unhandled case into a plausible one |
| `Accept: application/xml` | `application/problem+json` regardless. The API produces JSON only |
| Missing token (once `004` exists) | `401` `errors/unauthenticated`, enveloped. The audit row for it is `003`/`004`, not here |
| Authenticated but wrong role (once `004` exists) | `403` `errors/forbidden`, enveloped, and the body says nothing about which role would have worked — "specific enough to act on and vague enough not to enumerate" (`docs/sdd/testing/security-checklist.md`) |
| `Accept-Language: ar` on any error, before `005` exists | English sentences, with `type` and every `errors` key byte-identical to the English response. Asking for a language the system does not yet speak is not a client error (BR-8.3) |
| The frontend receives an HTML error page from a proxy | Synthetic `errors/unparseable-response`; the UI shows a generic failure with a retry, not a blank screen (AC-24, ADR-011 §5) |
| The frontend receives `204` and calls the parser | Returns the synthetic problem rather than throwing on an empty body |
| A `409` arrives with an `errors` key naming a field the form does not have | Form-level message (AC-26) |

## Rules referenced

- **NFR-2** — every endpoint returns a correct and documented status code
- **NFR-4** — errors never leak stack traces, SQL, or internal identifiers
- **NFR-1** — maintainability over cleverness: one shape, one place
- **BR-8.3** — an unsupported locale falls back to `en` with a success status
- **BR-8.6** — the server localizes `title`, `detail`, and every validation message
- **BR-8.7** — `type`, the keys of `errors`, enum values, `TicketNumber`, and any
  identifier are **never** localized
- **BR-8.9** — log messages are always English regardless of request locale
- **BR-8.12** — a missing translation falls back to English, never to the raw key
- **BR-9.2, BR-9.4** — `401`/`403` write an audit row, outside any transaction (`003`)
- **BR-9.9** — the `traceId` on the audit row, in the response, and in the request log are
  one identifier
- **ADR-007 §3** — machine-readable values are never translated; **§4** — the
  `UseRequestLocalization` ordering hazard; **§5** — symbolic resource keys
- **ADR-010** — two projects; `Wasl.Domain` holds no HTTP type
- **ADR-011 §4** — three kinds of component, one of them fetches; **§5** — expected states
  inline, unexpected at the boundary; **§6** — types generated, not hand-written
- **ADR-006** — `errors/concurrency-conflict` is the client's signal to refetch
- **Constitution IV** — one uniform contract; **V** — structural over remembered

## Why this is not one task called "add error handling"

Every acceptance criterion above can fail on its own, and seven of them fail while looking
like success:

| Silent failure | Caught by |
|---|---|
| The developer exception page renders HTML in Development — the environment the demo runs in | AC-13 |
| `traceId` lands inside `extensions`, so `problem.traceId` is `undefined` in the client | AC-3 |
| The response `traceId` and the log correlation id are two different opaque strings | AC-4 |
| A `404` never reaches the middleware, so it returns an empty body the client's parser throws on | AC-9 |
| A validator forgot `.WithMessage(key)` and ships FluentValidation's English, which no catalogue will ever translate | AC-17 |
| An unregistered domain error code becomes a `500` indistinguishable from a real bug | AC-14 |
| The frontend drops an `errors` key that matches no form field | AC-26 |
