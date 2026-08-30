# `002b` — Error Contract Completion

**Phase:** 0 · Foundation · **Story:** — (infrastructure) · **Status:** Specified, awaiting review

Completes the half of `002-error-contract` that was deferred with a reason per task, plus the
two gaps `005` handed over. `002` owns the contract; this makes the statuses **the framework
produces without anyone throwing** obey it.

---

## Measured first, and it changed the spec

`002`'s `summary.md` records these as *"a `404` on an unmatched route still returns an empty
body, as do `405` and `415`"*. **That is not what the API does today.** Probed against the
running API with `Accept-Language: ar`, 2026-08-29:

| Request | Status | Body | Verdict |
|---|---|---|---|
| `GET /api/nope` | `404` | **empty**, no content type | as recorded |
| `DELETE /api/tickets` | `405` | **empty** | as recorded |
| `GET /api/tickets/not-a-guid` | `404` | **empty** | as recorded (`008` AC-3, `011` D-2) |
| `POST /api/tickets` with `Content-Type: text/plain` | `415` | **the framework's own `ProblemDetails`** | **not empty — wrong** |
| `POST /api/tickets` with `{not json` | `400` | **our envelope, carrying a parser diagnostic** | **worse than either** |

### The `415` is not empty, it is *plausible*

```json
{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.16",
 "title":"Unsupported Media Type","status":415,"traceId":"00-3759…"}
```

The `type` is an RFC section URI, not `https://wasl.local/errors/unsupported-media-type` which
the **frozen contract registers**. There is no `instance`. The `title` is English inside a
response that asked for Arabic.

**An empty body and this are not the same defect, and this one is worse.** An empty body breaks
the client's parser loudly — `002` even registered a client-side `unparseable-response` code for
it. A well-formed envelope with a foreign `type` passes every parser, satisfies every shape
assertion, and branches nowhere: `errorCode === 'unsupported-media-type'` is simply false
forever. This is the exact failure `CLAUDE.md` records under *verify a measurement with something
below it* — `002`'s AC-2 grep over `src/` was green while three request shapes returned the
framework's envelope, because the framework builds it inside itself where a grep cannot see.

### The malformed-JSON `400` leaks internals

```json
{"type":"https://wasl.local/errors/validation",
 "title":"حدث خطأ أو أكثر في البيانات المُدخلة.","status":400,
 "instance":"/api/tickets","traceId":"00-6128…",
 "errors":{
   "$":["'n' is an invalid start of a property name. Expected a '\"'. Path: $ | LineNumber: 0 | BytePositionInLine: 1."],
   "command":["The command field is required."]}}
```

Three faults in one response:

1. **A `System.Text.Json` parser diagnostic is served to the client**, under a field named `$`.
   `CLAUDE.md`'s rule says `detail` never carries a stack trace, an exception type name, or SQL;
   this is the same family arriving through `errors` instead, and it names byte positions in a
   payload the client sent.
2. **`type` is `errors/validation`.** The contract registers `errors/malformed-request` for a
   body that could not be parsed, and distinguishes them deliberately: `validation` means *fix
   these fields*, `malformed-request` means *your request was not readable at all*. A client that
   renders field errors will try to place `$` and `command` on a form.
3. **`command` is the action method's parameter name.** An internal identifier, presented as a
   form field.

`002` recorded this as *"unverified — may be a `400` with no envelope, or a `500`"*. It is
neither. **See Q-A: it was listed under `002b` but not in the scope given for this feature.**

### And `005` handed over one more

**AC-11 of `005` is unmet:** any response produced by **throwing** loses `Content-Language`.
`RequestLocalizationMiddleware` writes the header eagerly on the way down;
`ExceptionHandlerMiddleware` calls `Response.Clear()` before invoking any `IExceptionHandler`.
Measured with one probe on a single endpoint:

```text
400 model binding    (customerId absent, no exception)   Content-Language: ar
400 FluentValidation (binds, subject empty — throws)     Content-Language: (absent)
```

Same endpoint, same status, same headers sent. The only difference is whether an exception was
raised. **The bodies are correctly localized on both paths** — `005` made sure of that by reading
`IRequestCultureFeature` off the context rather than ambient culture. Only the header is lost.

---

## In scope

### 1 · Envelope the statuses nobody throws

`404` on an unmatched route, `404` on a route-constraint miss, `405`, and `415` must return the
same `ProblemDetails` shape as every other failure: our `type`, a localized `title`, `status`,
`instance`, and a `traceId` that matches the log.

`research.md` R-1 calls this `002`'s most important finding, and it is still true: **no exception
handler in any framework sees these.** Routing short-circuits without throwing, so
`UseExceptionHandler` is never entered. They need a different mechanism.

### 2 · `Content-Language` survives the exception path

`005` AC-11. The header must be present on every response, thrown or not.

### 3 · Two guards `005` left unwritten, closed here rather than in a feature of their own

- **`005` AC-2** — a source-level assertion that `Program.cs` registers
  `UseAuthentication()` → `UseRequestLocalization()` → `UseAuthorization()` in that order.
  `004`'s `MiddlewareOrderTests` asserts the first pair only; the second is `005`'s addition and
  is currently protected by a negative control that was run once, not by a test.
- **`005` AC-19** — NFR-9 claims a third locale is a resource file plus a configuration entry
  with no code change. The list *is* read from configuration and **nothing proves it**.

Both are tests rather than behaviour, which is why they belong to a feature that is already
opening this area rather than to one of their own.

### 4 · A `404` for a malformed `{id}` — decide, do not inherit

**Numbering corrected 2026-08-30:** this spec first attributed the unmet criterion to `007`. It is
**`008` AC-3**, and `011` D-2 is the same finding recorded a second time. Both are closed by Q-B's
ruling; nothing in `007` was involved.

`008` AC-3 was recorded **unmet**: `GET /api/tickets/not-a-guid` returns `404`, and the criterion
asked for `400`. Once item 1 envelopes it, it is still a `404` with a `type`. **Whether the status
should change is Q-B**, because the answer interacts with BR-4.4's rule that "not found" and "not
permitted" must be indistinguishable.

## Out of scope

| Excluded | Where it lives |
|---|---|
| The **OpenAPI document** and the automated comparison against `contracts/` (`BE-002-11`, `REV-002-02`) | Still `002b`'s on paper, and **not in the scope given for this pass.** Q-C |
| `002`'s `TEST-002-10` (every registered validator uses a symbolic key), `TEST-002-15` (a cancelled `CancellationToken`), `AC-4`'s log-vs-response `traceId` | Same. Q-C |
| The six `FE-002-*` tasks | The frontend lane |
| Anything about *thrown* domain errors | `002` core, delivered. This feature touches only what the framework produces on its own — plus one header on the thrown path |
| Changing any `type` a client already branches on | Forbidden. `415` gains our registered `type`; nothing loses one |

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | `UseStatusCodePages` can produce a body for a short-circuited status without disturbing the responses that already have one | It re-runs on responses that already carry an envelope and double-writes. AC-6 asserts the enveloped statuses are unchanged, which is what would catch it |
| A-2 | The `415` body can be replaced rather than merely supplemented | ASP.NET Core's `ApiBehaviorOptions` may own it. Then the fix is a different seam, not a different outcome — AC-3 is written on the observable |
| A-3 | Re-applying `Content-Language` after the exception handler clears it is a supported operation, not a fight with the framework | If the header cannot be restored there, the alternative is writing it in `OnStarting` instead of eagerly, which changes `005`'s mechanism rather than this one. Q-D |
| A-4 | `005`'s catalogue is where the new titles live, and both files get every key | The parity test fails the build. It is `005`'s and it already works |

## Open questions

| # | Question | Working assumption |
|---|---|---|
| **Q-A** | **The malformed-JSON `400` leaks a parser diagnostic and uses the wrong `type`.** It is a `002b` item (`BE-002-10`) and it is **not** in the scope given for this feature. It is also, on the measurement above, the most serious thing in this area — an internal message and an internal parameter name served to a client. In or out? | **Assume IN, and say so rather than smuggle it.** It is the same mechanism as items 1 and 2 — a response the framework composes before any handler runs — and fixing the neighbouring statuses while leaving a parser diagnostic in the payload would be a strange place to stop. **But it widens the approved scope, so it needs a yes** |
| **Q-B** | Should `GET /api/tickets/not-a-guid` become `400`, or stay `404` with a proper envelope? `008` AC-3 asks for `400`; BR-4.4 wants "not found" and "not permitted" indistinguishable | **Assume it stays `404`, enveloped.** A malformed id and an absent one are both "no such resource" from the client's position, and a `400` tells an unauthenticated prober that the id *shape* was wrong — a small oracle, but the same kind BR-4.4 closes. `008` AC-3 would then be **closed as "answered differently"**, not as met |
| **Q-C** | The other four `002b` items — OpenAPI comparison, validator-key test, cancellation test, `traceId`-equals-log — were named as `002b`'s and are not in this scope | **Assume deferred again, to a `002c` named on the board**, so they do not become a list nobody owns. `002b` closing while four of its items stay open under its name is how work gets lost |
| **Q-D** | Where does the `Content-Language` fix go — re-apply it in `GlobalExceptionHandler`, or change `005` to write it in `OnStarting` so the clear cannot reach it? | **Assume `GlobalExceptionHandler`.** It is one place, it is already the single producer of error bodies, and it leaves `005`'s middleware ordering untouched. Changing `005`'s mechanism would mean re-running its two negative controls to prove nothing else moved |
| **Q-E** | Do the new titles need Arabic now, given Q-8 is open and `005`'s 63 strings are unreviewed? | **Assume yes, written the same way, and added to the same list of unreviewed Arabic.** The alternative is a catalogue where some keys are bilingual and some are not, which the parity test would fail anyway |

## Acceptance criteria

### The statuses nobody throws

| # | Criterion |
|---|---|
| AC-1 | `GET /api/nope` returns `404` with a `ProblemDetails` body: `type` = `https://wasl.local/errors/not-found`, a localized `title`, `status`, `instance` = the requested path, and a `traceId` |
| AC-2 | `DELETE /api/tickets` returns `405` with `type` = `https://wasl.local/errors/method-not-allowed` and the same five fields |
| AC-3 | `POST /api/tickets` with `Content-Type: text/plain` returns `415` with `type` = `https://wasl.local/errors/unsupported-media-type` — **asserted as an exact string**, because the current body is well-formed, plausible, and carries an RFC URI instead. A shape assertion passes today |
| AC-4 | Each of the three carries `Content-Language` matching the negotiated culture, and the `title` is Arabic under `Accept-Language: ar` |
| AC-5 | The `traceId` in each body equals the one in the server log for that request |
| AC-6 | **Every status that already had a correct envelope is byte-identical before and after.** `400`, `401`, `403`, `404`-from-a-handler, `409`, `429`, `500` — asserted by comparing full bodies, because A-1's failure mode is double-writing onto a response that was already right |
| AC-7 | `GET /health` still returns the health report shape, not `ProblemDetails`, and still answers anonymously. It is the one documented exception (`002` AC-11, `004` AC-20) |

### `Content-Language` on the thrown path

| # | Criterion |
|---|---|
| AC-8 | A `400` raised by FluentValidation carries `Content-Language`. **This is the exact probe that found the defect** — the same endpoint, the same status, one path through model binding and one through a throw |
| AC-9 | `Content-Language` is present on `400`, `401`, `403`, `404`, `409`, `415`, `429` and `500`, thrown or not. This is `005` AC-11 restated in full, and closing it here is what lets `005`'s record change from *unmet* to *closed by `002b`* |
| AC-10 | The header names the culture that was **actually applied**, not the one requested: `Accept-Language: fr` on a failing request answers `Content-Language: en` |

### The two guards handed over

| # | Criterion |
|---|---|
| AC-11 | A source-level test fails the build if `Program.cs` does not register `UseAuthentication()`, then `UseRequestLocalization()`, then `UseAuthorization()`, in that order. **It must be seen to fail**: moving the registration back is `005`'s control 1, and the test is not verified until that run is recorded here |
| AC-12 | A test host configured with `Localization:SupportedCultures = en, ar, fr` answers `?culture=fr` with `Content-Language: fr` and English text, **with no code change** — which is what NFR-9 claims and nothing currently proves |

### Nothing leaks

| # | Criterion |
|---|---|
| AC-13 | No response produced by this feature contains an exception type name, a stack frame, a file path, a byte offset, or a line number |
| AC-14 | `ResourceKeyLeakTests` is extended to cover the three newly-enveloped statuses, so a missing catalogue entry on them is caught by the same guard that caught seventeen keys in `004b` |

### If Q-A is answered yes

| # | Criterion |
|---|---|
| AC-15 | `POST /api/tickets` with `{not json` returns `type` = `https://wasl.local/errors/malformed-request`, **not** `errors/validation` |
| AC-16 | That response carries **no** `errors` object. Nothing about the payload is a field the client can fix, and `$` is not a form field |
| AC-17 | Its `detail` is a localized sentence from the catalogue, and contains no parser text, no byte position, and no internal parameter name — asserted by searching the whole body for `LineNumber`, `BytePositionInLine`, `$` and `command` |

## Edge cases

| Case | Expected |
|---|---|
| An unmatched route **outside** `/api` | Same envelope. The contract is the API's, and a client that mistypes a path gets one shape wherever it lands |
| `HEAD` on a `GET` endpoint | `200` with no body — not a `405`. The framework maps it, and it is not an error |
| `OPTIONS` | Whatever routing decides. No CORS policy exists (recorded, deliberate), so this is not a case this feature creates |
| A `415` on an endpoint that takes no body | Still `415`, still enveloped. The check is on the request, not on the action |
| `Accept: application/xml` | Not a `406` — the API produces JSON only, and `406` is registered as *not produced* in the contract |
| An unmatched route while unauthenticated | The fallback policy makes it `401`, not `404` — the route never matches so no endpoint metadata exists. **Verify rather than assume**; if it is `404`, that leaks route existence to an anonymous caller and is worth naming |
| A `500` under `Accept-Language: ar` | Arabic `title`, English log, no stack trace, and `Content-Language: ar` — AC-9 |

## Rules referenced

- **BR-8.6, BR-8.8** — the server localizes what it authors; `type` and `errors` keys are never
  localized
- **BR-9.9** — the `traceId` in a response matches the log
- **ADR-007** — the middleware order AC-11 guards
- **NFR-8, NFR-9** — catalogue parity in CI; a third locale with no code change
- **`002` AC-2** — one producer of `ProblemDetails`. This feature adds a second *entry point*
  and must not add a second producer
- **`005` AC-11, AC-2, AC-19** — the three handed over
- **`008` AC-3, `011` D-2** — the malformed-id `404`, Q-B
