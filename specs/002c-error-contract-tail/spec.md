# `002c` — Error Contract Tail

**Phase:** 0 · Foundation · **Story:** — (infrastructure) · **Status:** Specified, awaiting review

The four items `002b` did not take, plus two it raised. Named as its own feature by ruling, so
nothing stays open under a closed feature's name.

---

## Measured first

### There is no OpenAPI document at all

```text
GET /openapi/v1.json   401
GET /swagger           401
```

`401` because the fallback policy refuses an unmatched route — not because the document is
protected. Neither `Swashbuckle` nor `Microsoft.AspNetCore.OpenApi` is referenced by
`Wasl.Api.csproj`.

**`CLAUDE.md`'s Commands section says `dotnet run --project src/Wasl.Api` gives `/health` and
`/swagger`.** The first is true. The second has never been true.

That matters beyond a wrong line in a file: the Definition of Done says *"the generated OpenAPI
matches `contracts/`"*, and **that item has never been satisfiable for any feature.** There are
17 contract files and 12 controller actions, and nothing has ever compared them.

### The framework's English messages are narrower and sharper than `002b` described

`002b` recorded `"description": ["The Description field is required."]` inside an Arabic response
and stopped there. Probed across endpoints with `Accept-Language: ar`:

```text
POST /api/tickets    {"subject":"s"}
    description = The Description field is required.          ← the framework

POST /api/customers  {"fullName":"x"}
    email = أدخل بريدًا إلكترونيًا أو رقم هاتف.
    phone = أدخل بريدًا إلكترونيًا أو رقم هاتف.               ← the catalogue
```

**The difference is not the endpoint. It is whether the request binds at all.**

`CreateTicketCommand` is a positional record with non-nullable reference-type parameters:

```csharp
public sealed record CreateTicketCommand(
    Guid CustomerId, string Subject, string Description, …)
```

With nullable reference types enabled, ASP.NET Core's model binder treats a non-nullable
reference type as **implicitly required** and reports it missing *before* the MediatR pipeline
runs — so `ValidationBehaviour` never executes and FluentValidation's symbolic key is never
reached. `CreateCustomerCommand`'s contact fields are nullable, the request binds, and the
catalogue answers.

So: **every command whose message reaches a user in English is one with a required
reference-type member**, and the fix is one setting plus a verification that nothing then slips
through. That is Q-A.

---

## In scope

1. **An OpenAPI document**, and an automated comparison against the frozen `contracts/` —
   `002`'s `BE-002-11` and `REV-002-02`.
2. **The framework's validation messages**, replaced by catalogue keys (`002b`'s raised item).
3. **`TEST-002-10`** — every registered validator uses a symbolic key, not a sentence.
4. **`TEST-002-15`** — a cancelled `CancellationToken` is honoured by `ValidationBehaviour`.
5. **`002` AC-4 / `002b` AC-5** — the `traceId` in a response equals the one in the log.
6. **`002b` AC-14** — `ResourceKeyLeakTests` extended to the three newly-enveloped statuses.
7. **`CLAUDE.md`'s `/swagger` line**, corrected either way by the outcome of (1).

## Out of scope

| Excluded | Where it lives |
|---|---|
| A published, styled API explorer for humans | Nowhere. The document is for the contract comparison; whether a UI ships is a separate call — see Q-B |
| Generating TypeScript clients from the document | The frontend lane. `CLAUDE.md` already says hand-written client types are provisional and replaced from OpenAPI once the endpoint is real; this makes that possible and does not do it |
| Changing any contract | Forbidden. A difference between the document and `contracts/` is a defect in one of the two and is fixed deliberately, never absorbed |
| Localizing the OpenAPI document | Nowhere. It is machine-read (BR-8.7) |

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | `Microsoft.AspNetCore.OpenApi` (built into .NET 10) can produce a document without annotating every action | It needs per-action attributes, which is a much larger change — and would be a reason to scope (1) down to the paths and statuses rather than full schemas. Q-B |
| A-2 | Suppressing the implicit-required binding rule leaves every affected field covered by a FluentValidation rule | A missing field then arrives as `null` in a non-nullable property and reaches the domain. **AC-4 is written to fail loudly if any command has an uncovered member**, because this is the one change here that can make things worse |
| A-3 | The response `traceId` and the log's come from one accessor, so they agree by construction | They do — `TraceContext.For` — which is an argument. AC-9 is the evidence, and `002` recorded its absence as a gap rather than claiming it |
| A-4 | The comparison can be mechanical: paths, methods and statuses, not prose | A contract file is Markdown written for humans. If the paths and statuses cannot be parsed reliably, the comparison becomes a hand-maintained list, which is a second source of truth. Q-C |

## Open questions

| # | Question | Working assumption |
|---|---|---|
| **Q-A** | **Suppressing the implicit-required rule moves required-field validation from the binder to FluentValidation. Is every affected member covered by a rule today?** If not, a missing field reaches a handler as `null` in a non-nullable property | **Assume NOT, and find out before flipping the switch.** AC-4 enumerates every `ICommand`'s non-nullable members and requires a matching validator rule — so the suppression cannot ship ahead of the coverage. **Flipping it without that check would trade an English message for a `NullReferenceException`,** which is a worse defect wearing a localization fix |
| **Q-B** | Does the OpenAPI document get **served** at an endpoint, or only generated in a test? | **Assume generated in a test and NOT served.** A served document is an unauthenticated description of every endpoint, and this API's fallback policy is deliberately closed; adding `AllowAnonymous` to a document endpoint would make it the third anonymous endpoint after `/health` and `/api/auth/token`, which `004` AC-10 counts and asserts. **A ruling is wanted**, because a demo may want the explorer |
| **Q-C** | How is a Markdown contract compared to a generated document? | **Assume paths, methods and status codes only** — extracted from the contract's tables, compared to the document's. Request and response *schemas* are prose in those files and cannot be parsed without inventing a format. Narrow and mechanical beats broad and hand-maintained |
| **Q-D** | `002` AC-4 wants the response `traceId` to equal the log's. Asserting that needs the test to capture log output | **Assume an `ILoggerProvider` registered in the test host**, capturing entries in memory — the same shape as the query counter `008` built. If that proves unreliable, the criterion stays **unmet and recorded**, as it has been since `002` |

## Acceptance criteria

### The document, and the comparison that is the point of it

| # | Criterion |
|---|---|
| AC-1 | A test generates the OpenAPI document from the running application and it contains every controller action — **12 today**, and the count is derived, not written down |
| AC-2 | Every path and method in the document appears in a file under `specs/*/contracts/`, and every path and method in those files appears in the document. **A difference fails the test and names both sides** |
| AC-3 | The document declares `application/problem+json` for every non-2xx it describes, and `401`/`403` on every endpoint that is not one of the two anonymous ones — which is `004` AC-10's list, read rather than restated |

### The framework's messages

| # | Criterion |
|---|---|
| AC-4 | **Before the binder rule changes:** a test enumerates every `ICommand` implementation, finds every non-nullable member, and asserts a FluentValidation rule exists for it. **This runs first and must pass first** — see Q-A |
| AC-5 | `POST /api/tickets` with `{"subject":"s"}` under `Accept-Language: ar` returns Arabic for the missing `description`, from the catalogue |
| AC-6 | No response anywhere contains a framework validation sentence. Asserted by searching every error body in the suite for `field is required`, `The value`, and `could not be converted` |
| AC-7 | A missing required field still returns `400` and still names the field. **The fix must not turn a validation error into a `500`** — which is what an uncovered member would do |

### The three inherited tests

| # | Criterion |
|---|---|
| AC-8 | `TEST-002-10` — every registered `IValidator` produces messages that match the message-key shape, and none is a sentence. `004b`'s `MessageKeyCoverageTests` scans **source literals**; this reads the **registered validators**, which is the other end |
| AC-9 | `002` AC-4 — for one request, the `traceId` in the response body equals the `TraceId` on the log entry the request produced |
| AC-10 | `TEST-002-15` — a `CancellationToken` cancelled before `ValidationBehaviour` runs stops the request, and does **not** produce a `500` envelope |
| AC-11 | `002b` AC-14 — `ResourceKeyLeakTests` covers the `404`, `405` and `415` bodies `002b` created |

### Documentation

| # | Criterion |
|---|---|
| AC-12 | `CLAUDE.md`'s Commands block matches reality — `/swagger` either exists or the line goes |

## Edge cases

| Case | Expected |
|---|---|
| A contract file describing an endpoint that is not built yet | AC-2 fails. **Correct**: `contracts/` is frozen before either lane starts, so a documented-but-absent endpoint is a real gap and the test naming it is the point. Any deliberate exception is listed by name with a reason, never by loosening the comparison |
| The `/health` endpoint | Outside `/api` and not `ProblemDetails`. Excluded from AC-3 by name, the way `002` AC-11 excludes it |
| A probe endpoint from a test project | Never in the document — they are mapped by the fixture, not by `src/` |
| A command with a nullable member and no rule | Fine. AC-4 asks about non-nullable members only; a nullable one is optional by declaration |
| An enum member missing from a request | Already `errors/validation` with a symbolic key from `002b`'s `ModelStateEnvelope` — the `$.` path handling. AC-6 must not regress it |

## Rules referenced

- **BR-8.6, BR-8.8** — the server localizes what it authors; `type` and `errors` keys never
- **BR-9.9** — the response `traceId` matches the log
- **`002` AC-2** — one producer of `ProblemDetails`
- **`002` AC-4, `BE-002-11`, `REV-002-02`, `TEST-002-10`, `TEST-002-15`** — the four inherited
- **`002b` AC-5, AC-14** — the two raised
- **`004` AC-10** — exactly two anonymous endpoints, which Q-B would change
- **Definition of Done** — *"the generated OpenAPI matches `contracts/`"*, never satisfiable until now
