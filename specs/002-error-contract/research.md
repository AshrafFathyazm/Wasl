# 002 — Research

Questions that had to be answered before the plan could be written, what was checked, and
what each one settled. A question that turned out not to matter is recorded as such,
because "we looked and it did not matter" is information too.

Nothing here was verified by running .NET — no `src/` exists yet and no build has run.
Where a claim depends on framework behaviour, the question is settled **in a way that does
not depend on the answer**, and the empirical check is a named task. That is the honest
version; asserting observed behaviour that was not observed is the one thing Principle II
does not forgive.

---

## R-1 · Which mechanism produces the response: `IExceptionHandler`, custom middleware, or a package?

**Checked:** what `docs/sdd/05-api-conventions.md` requires of the mechanism (one shape,
one producer, no hand-built error responses), and what each candidate can and cannot catch.

| Candidate | Catches an exception | Catches a framework short-circuit (`404`, `405`, `415`, `401`, `403`) | Third-party |
|---|---|---|---|
| `IExceptionHandler` + `UseExceptionHandler` | yes | **no** | no |
| Hand-written `try/catch` middleware | yes | **no** | no |
| `Hellang.Middleware.ProblemDetails` | yes | partly | yes |
| `UseStatusCodePages` + an `IProblemDetailsWriter` | no | yes | no |

**Settled: two mechanisms, deliberately, not one.** `IExceptionHandler` for anything that
throws, plus a status-code writer for anything the framework short-circuits without
throwing. Both call the same factory, so there is still exactly one producer of the
envelope (AC-2).

This is the single most important finding in this document. "A single exception-handling
middleware" — the constitution's own words — is necessary and **not sufficient**, because
the most common failure a client sees is a `404` on a mistyped path, and no exception is
ever thrown for it. An implementation that reads the constitution literally ships a `404`
with an empty body, and the client's shared parser throws on it. AC-9 is that hole.

**Rejected: `Hellang.Middleware.ProblemDetails`.** It was the right answer before .NET 7.
`AddProblemDetails()` and `IExceptionHandler` are now first-class, and a package whose job
the framework does is a dependency with nothing behind it.

**Rejected: hand-written `try/catch` middleware.** It works, and it makes the ordering
obvious, but it bypasses `IProblemDetailsService` — so the shape produced by *our* code and
the shape produced by the framework's own paths would be two shapes. One producer or two;
the whole feature is about it being one.

**Not verified here:** that .NET 10 keeps these APIs (spec A-1). If it has not, the handler
becomes the hand-written middleware and nothing else in the design moves — the registry,
the factory, the message source, and all 28 acceptance criteria are unaffected. That
containment is why the question is answerable now.

---

## R-2 · Where does the status code live, if not in the domain exception?

**The constraint:** `Wasl.Domain` has zero package references, ever (ADR-002, Principle
III). `Microsoft.AspNetCore.Http.StatusCodes` is a package reference. So a domain exception
cannot say `409`.

**Options weighed:**

| Option | Cost |
|---|---|
| An `int HttpStatus` property on the domain exception | Puts an HTTP concept in a project whose entire claim is that it has none. It is *technically* just an integer, which is exactly how this rule erodes |
| A `switch` on exception **type** in the handler | Every new rule adds a `case`. Works, but the vocabulary is then implicit in a switch statement, and nothing prevents `012` from adding a case with a `type` URI it invented on the spot |
| A stable string `ErrorCode` on the exception, mapped by a registry in `Wasl.Api` | Two files change when a rule is added: the exception and one registry row. The vocabulary is a table a reviewer can read |

**Settled: the string code plus the registry.** The domain says *what rule was broken*; the
API says *what that means over HTTP*. That is the layer boundary, stated as a mechanism
rather than as an intention.

**The consequence that makes it safe:** a code with no registry row is a real possibility,
and it degrades into `500 errors/internal` — indistinguishable from a genuine bug. So the
mapping is closed twice: at runtime a `Critical` log names the missing code, and at build
time a test over the assembly enumerates every domain-exception subtype and asserts its
code is registered (AC-14). Without that test the registry is a convention, and
`docs/sdd/testing/test-strategy.md` is explicit that a rule depending on somebody
remembering it is not a rule.

---

## R-3 · How does `005` translate these messages without touching this feature?

**Checked:** ADR-007 §2 and §5 — the server owns `ProblemDetails.title`, `detail`, and
validation messages, in `.resx`, under symbolic keys.

**The failure mode being designed against:** `005` arrives and finds eleven places that
concatenate an English sentence. It then has to visit each one, invent a key, add the key
to two catalogues, and hope none was missed. The ones missed return plausible English
forever, which ADR-007 §5 already names as the reason for symbolic keys.

**Settled:** nothing in the pipeline carries a sentence. A domain exception carries a
`MessageKey` and its arguments; a validator's message *is* a key; the registry carries a
title key. Exactly one interface turns a key into a sentence, and exactly one
implementation exists in this feature — a static table.

`005` then: adds a `.resx`-backed implementation, changes one registration line, deletes
the static table. AC-18 makes that testable *now*, before `005` exists, by substituting a
stub implementation and observing the `title` change with no other production file altered.

**Rejected: return the key and let the client translate.** It moves server-authored
sentences into the client catalogue, which contradicts ADR-007 §2, and it means the API's
`title` field is not a title.

**Rejected: `IStringLocalizer` injected directly into the handler now.** It is where `005`
ends up, but adopting it here would mean adding `.resx` infrastructure — the thing `005`
owns — inside `002`, and the two features would then both be half-done.

---

## R-4 · FluentValidation emits English by default. Does that matter?

**Checked:** how a FluentValidation rule produces its message. `RuleFor(x => x.FullName)
.NotEmpty()` with no `.WithMessage()` produces `'Full Name' must not be empty.` — a
grammatical English sentence, generated from the property name.

**Why it matters more than it looks:** that sentence is not in any catalogue and never will
be. It renders correctly in English, so review passes; it renders in English inside an
Arabic interface, so only an Arabic reader finds it, and only if they happen to trigger
that rule. This is precisely the failure ADR-007 §5 rejected English-text-as-key for, and
it arrives by omission rather than by decision.

**Settled: `.WithMessage("<symbolic key>")` on every rule, enforced by a test rather than a
convention.** The test instantiates every registered `IValidator`, runs it against a
default-constructed request so every rule fails, and asserts each returned message matches
the symbolic-key shape. A sentence contains a space; a key does not. That is a one-line
assertion and it closes the whole class.

**Considered and rejected: `.WithErrorCode("<key>")`, leaving `.WithMessage` as English.**
FluentValidation's `ErrorCode` is the more semantically correct field for a key. Rejected
because it leaves an English sentence living in the validator *and* in the `en` catalogue —
two copies of one string, which is the duplication ADR-007 §5 exists to prevent, and the
copy in the validator is the one that will drift.

**Recorded honestly:** in this feature there are no validators, so the test runs against a
fixture validator and finds nothing else. It starts catching real defects at `007`. A test
that guards zero things today and everything from the next feature onward is the cheapest
it will ever be to write.

---

## R-5 · Is the `traceId` in the response the same string as the one in the log?

**Checked:** the two candidate sources, and what each is.

| Source | What it is |
|---|---|
| `Activity.Current?.Id` | The W3C trace context id, `00-<32 hex>-<16 hex>-01`. What distributed tracing propagates, and what the sample bodies in `docs/sdd/05-api-conventions.md` show |
| `HttpContext.TraceIdentifier` | Kestrel's per-connection-and-request identifier, `0HN7...:00000001`. Always present |

Both are opaque strings of similar length. **They are not the same value**, and a response
carrying one while the log scope carries the other looks entirely correct in both places.
That is the failure BR-9.9 exists to prevent, and it cannot be found by reading either
side alone.

**Settled: one accessor, three consumers.** `TraceContext.For(httpContext)` returns
`Activity.Current?.Id ?? httpContext.TraceIdentifier` — and the response, the logging
scope, and `003`'s audit row all call it. The requirement in BR-9.9 is not "use W3C ids";
it is that the three are one identifier. An accessor makes that true by construction, and
it stays true if A-3 turns out to be wrong.

**And it is asserted anyway** (AC-4), by capturing the log during an integration test and
comparing strings. An accessor that two of three consumers happen to call is still a
defect, and only a test that reads both sides can see it.

---

## R-6 · What does the `404` on an unmatched route return today, and what should it?

**Checked:** `docs/sdd/testing/edge-cases.md`, which lists many `404` cases but not the
unmatched-route case, and `docs/sdd/documentation/api/error-handling.md`, which registers
`errors/not-found` without saying who raises it.

**Found: a genuine gap in the blueprint.** Every documented `404` is a *resource* that does
not exist, raised by a handler. Nothing says what `GET /api/typo` returns. ASP.NET Core's
answer is `404` with a zero-length body.

**Why that is not a cosmetic problem:** the frontend has one shared parser. A `404` with an
empty body makes `response.json()` throw, so a mistyped URL surfaces in the UI as a
JavaScript error rather than as a not-found state. Two defects for the price of one, and
the second is louder and more confusing than the first.

**Settled:** the status-code writer envelopes it as `errors/not-found` (AC-9), and the
frontend parser is additionally written never to throw on a non-conforming body (AC-24).
Belt and braces on purpose: the server guarantee covers our own responses, and the client
guarantee covers a proxy, a gateway, or a load balancer we do not control.

---

## R-7 · Swashbuckle on .NET 10 — and does `002` really have "more than one endpoint"?

**Checked:** `001` R-7, which deferred Swashbuckle to `002` "when there is more than one
endpoint to document", and the endpoint count this feature actually produces.

**Found: the stated reason does not hold.** This feature adds no product endpoint. After it
there is still exactly one, `GET /health`. Recorded rather than glossed over, because the
justification changes even though the decision does not.

**The reason that does hold:** what OpenAPI needs from this feature is not endpoints, it is
the **shared failure schema**. Every endpoint from `007` onward must declare `400`, `401`,
`403`, `404`, and `409` against one `ProblemDetails` schema
(`docs/sdd/openapi/README.md`: "An endpoint documenting only its success path is documented
wrongly"). If that schema and the `ProducesProblem` helpers do not exist when `007` is
written, `007` declares its own — and then `009` declares another. The retrofit argument for
Swashbuckle is the same as for the error contract itself, one layer up.

**The live risk:** Swashbuckle's release cadence has historically trailed .NET's, and .NET
9 shipped `Microsoft.AspNetCore.OpenApi` as the in-box alternative. If Swashbuckle does not
support .NET 10 controllers cleanly, the fallback is `builder.Services.AddOpenApi()` and
`app.MapOpenApi()`.

**Contained by:** all Swashbuckle-specific code living in `Common/OpenApi/`, and the
contract naming *the document* rather than the generator. Swapping generators changes two
files and no acceptance criterion. This is spec A-5.

### Checked on 2026-08-25, before adding the package

`001` removed `Microsoft.AspNetCore.OpenApi` because the build gate flagged a
high-severity advisory in its transitive `Microsoft.OpenApi 2.0.0`. Adding a *different*
OpenAPI generator without checking whether it drags in the same package would have been
the same defect wearing a different name, so it was checked in a throwaway project first:

```text
$ dotnet add package Swashbuckle.AspNetCore
info : PackageReference for package 'Swashbuckle.AspNetCore' version '10.2.3' added

$ dotnet list package --include-transitive
   > Swashbuckle.AspNetCore              10.2.3
   > Microsoft.OpenApi                    2.7.5      ← not the vulnerable 2.0.0
   > Swashbuckle.AspNetCore.Swagger      10.2.3
   > Swashbuckle.AspNetCore.SwaggerGen   10.2.3
   > Swashbuckle.AspNetCore.SwaggerUI    10.2.3

$ dotnet list package --vulnerable --include-transitive
The given project has no vulnerable packages given the current sources.
```

**Settled: Swashbuckle 10.2.3 is safe to add**, and it has a .NET 10 release, so the
"cadence trails .NET" half of the risk has not materialised either. A-5 stands, but it is
no longer the most likely assumption in this feature to be wrong.

`dotnet list package --vulnerable --include-transitive` belongs in CI — the build gate
only fails on an advisory NuGet already knows about at restore time, and this command asks
the question directly. Not added here: it is a change to `001`'s workflow, and it needs its
own decision about whether a newly-published advisory should turn an unchanged build red.

**Also settled: `/swagger` is Development-only** (AC-23). An OpenAPI document is an
enumeration of every endpoint and every field, which is reconnaissance
(`docs/sdd/testing/security-checklist.md`: "vague enough not to enumerate").

---

## R-8 · Does the `500` body contradict itself between two blueprint files?

**Checked:** both statements, word for word.

- `docs/sdd/05-api-conventions.md`: "`500 Internal Server Error` | Unhandled fault; body
  carries a trace id **and nothing else**"
- `docs/sdd/documentation/api/error-handling.md`: "A `500` returns **a title, a status, and
  a `traceId`**. Everything else goes to the log."

**Settled:** they agree on intent and differ on wording. "Nothing else" means no `detail`
and no `errors` — no *information about the fault*. It cannot mean no `type`, because a
body without `type` is the one response the client's shared parser cannot read, which would
make `500` the least parseable status in the contract.

So: `type`, `title`, `status`, `instance`, `traceId`, and AC-12 asserts that set **exactly**
— as set equality on the property names, not as a substring search for "Exception". A
substring search passes when the leak is `System.Data.SqlClient` or a file path, which are
the leaks NFR-4 is actually about.

Recorded as spec Q-F rather than resolved silently, because it is a difference between two
files a reviewer may read in either order.

---

## R-9 · Does `errors` appear on a `409`? The blueprint says both.

**Checked:** three sources.

| Source | Says |
|---|---|
| `docs/sdd/05-api-conventions.md`, Error contract | "`errors` is present only for `400` validation failures" |
| `docs/sdd/05-api-conventions.md`, Localization — its own Arabic example | Shows a `409 duplicate-customer` **with** an `errors` object |
| `specs/007-create-customer/contracts/customers-api.md` (FROZEN) and `CLAUDE.md` | `errors` appears on `400` **and** `409` |

**Found: a contradiction inside one file**, resolved against it by two other documents, one
of which is frozen.

**Settled: `errors` is a property of the `type`, not of the status.** The registry declares
it per row. `errors/duplicate-customer` carries `errors` because the cause is attributable
to a named request field and the UI must attach the message to that input, not to a banner
(`007`'s FRONTEND-API-GUIDE). `errors/concurrency-conflict` carries none, because no field
is at fault — the answer is to refetch (ADR-006).

Per-status would have forced one of two wrong outcomes: a duplicate the UI cannot place, or
a concurrency conflict pretending a field caused it.

`DOC-002-03` proposes the wording correction to `05-api-conventions.md`. This feature does
not edit the blueprint from inside itself.

---

## R-10 · MediatR with no handler: does the "no consumer" test from `001` R-7 apply?

**Checked:** `001` R-7's own rule — a package with zero consumers is speculative — and what
the alternative costs.

**Found: the behaviour is the consumer.** The MediatR pipeline is not being added for a
handler that does not exist; it is being added because Principle V requires validation to
be *structural*. A behaviour that cannot be skipped is a different guarantee from a
validator each endpoint remembers to call, and the difference is the whole reason MediatR is
in the technology table at all — "justified solely by three cross-cutting pipeline
concerns" (constitution, Technology Constraints).

**The alternative, weighed:** call FluentValidation explicitly in each endpoint at `007`,
convert to a behaviour later. That is a retrofit across every slice, i.e. the thing this
feature exists to avoid, applied to the second cross-cutting concern instead of the first.

**Settled: MediatR lands here**, with the behaviour and a test-host command as its
consumers, and `003` adds the second and third behaviours into a pipeline whose ordering is
already asserted (AC-20). Recorded as spec A-6 because a reviewer applying `001`'s test
mechanically will land on it, and the answer should be written down rather than improvised.

### Confirmed by the product owner, 2026-08-25 — and given a boundary

The question was put explicitly, because the same rule had been applied in the **opposite**
direction two days earlier: `001` used "no abstraction without a consumer" to *defer* the
async materialisation abstraction. One rule applied in two directions inside one week is
not a rule, it is a preference.

The distinction that separates the two cases:

| | An abstraction between a caller and a callee | A pipeline behaviour |
|---|---|---|
| What it does | Replaces a direct call with an indirect one | Applies a concern to every call, by construction |
| Cost of adding it late | One call site changes | Every handler written in the meantime changes |
| Who notices if it is missing | The next caller, immediately | **Nobody** — the concern is simply absent |

`IAsyncQuery` deferred cheaply because the first handler writes it while looking at a real
call site, and nothing written before then depends on its absence. A behaviour is the other
column: defer it and every handler written first has to be revisited, and the one that is
missed is the one that matters.

**And BR-9.3 is not reachable without it.** `003` requires the audit row to be inside the
same transaction as the change and absent when it rolls back. Without a pipeline that is a
`using var transaction` in every handler plus a discipline about where the audit write
goes — exactly the "somebody remembering" ADR-008 exists to replace. The architecture test
for `IAuditableCommand` has nothing to hook into if there is no pipeline.

**So the exception has an edge rather than a mood:**

> The no-consumer rule does not apply to a **cross-cutting concern applied by construction
> to a pipeline**, where deferring it means retrofitting every participant written in the
> meantime. It applies to everything else, including this feature's own message source and
> trace-id accessor — both of which do have a consumer here.

**What it costs, admitted:** MediatR is registered, one behaviour runs, and the only thing
passing through it in this feature is a test request. A reviewer applying `001` R-7's test
literally will flag it, and the answer is the paragraph above rather than a denial that the
rule was bent.

---

## R-11 · Which culture is in force when the envelope is built? (Turned out to matter more than expected)

**The question:** the exception handler is the **outermost** middleware, so on the way out
it runs *after* every inner middleware has returned — including
`RequestLocalizationMiddleware`, which `005` will add.

**Checked:** what `RequestLocalizationMiddleware` does with the ambient culture around its
`await next(context)`.

**Not settled — and deliberately left unsettled.** Whether the ambient
`CultureInfo.CurrentUICulture` is still the request's culture at that point depends on
framework behaviour this feature cannot verify without running it (no `src/` exists).

**Why it is answerable anyway:** the design is written not to depend on it. `005` records
the resolved culture on `HttpContext` when it resolves it, and the message source reads
*that*, never ambient state (AC-28). If the ambient culture survives, the design is
belt-and-braces. If it does not, the design is the only thing standing between us and
**every Arabic error silently returning English** — an error path, in a second language,
which is the least-walked corner of any product.

Note where this sits: ADR-007 §4 already names middleware ordering as "the single most
likely defect in this piece of work" and says it fails quietly. This is a second, adjacent
instance of the same hazard, on the unwinding side rather than the ordering side. Recorded
as spec Q-E with `TEST-002-14` as the empirical check, to be run at `005` when there is a
second culture to observe.

---

## R-12 · Does anything in `001` have to change?

**Checked:** `specs/001-solution-skeleton/plan.md`, its `Program.cs` order, and
`contracts/health-api.md`.

| Found | Consequence |
|---|---|
| `001` reserved the `UseAuthentication` → `UseRequestLocalization` ordering in a comment | This feature adds the exception handler **above both** and writes the full ordering block, so `004` and `005` slot in rather than guess. No change to `001`'s decisions |
| `/health` has its own non-`ProblemDetails` response shape, including a `503` | A collision: a status-code writer that envelopes every non-2xx would rewrite `/health`'s `503` and break a frozen contract. `/health` is excluded by path (AC-11), and it is asserted, because a passing health check hides the defect — only the `503` path reveals it |
| `001` created no `Common/Errors/` or `Common/Behaviors/` folder | Both are created here. `CLAUDE.md`'s project structure already names them, so this feature fills in a shape that was already declared |
| `001` registered `TimeProvider.System` | Reused. Nothing in the error path needs a timestamp — the log entry carries its own — so no new clock dependency |

**Nothing in `001` is modified.** Its `Program.cs` gains lines; none of its lines change
meaning. Worth checking explicitly, because "the foundation feature had to be edited" is
the signal that a phase boundary was drawn in the wrong place.

---
