# `002b-error-contract-completion` — test evidence

**Run:** 2026-08-30, Windows 11, .NET 10.0.200 SDK, SQL Server 2022 via `Testcontainers.MsSql`
(one container for the whole integration suite) plus one `docker compose` container for the
manual probes.

```text
dotnet build --no-incremental      0 Warning(s)   0 Error(s)
dotnet test --no-build

Wasl.Domain.Tests            Failed: 0   Passed: 177   Total: 177     408 ms
Wasl.Application.Tests       Failed: 0   Passed:  17   Total:  17     644 ms
Wasl.Api.IntegrationTests    Failed: 0   Passed: 301   Total: 301      48 s
                                         ─────────────────────────
                                         Passed: 495   Total: 495
```

Before `002b`: 472.

---

## Acceptance criteria → named tests

| AC | Test | Result |
|---|---|---|
| AC-1 | `StatusCodeEnvelopeTests.An_unmatched_route_is_enveloped` | pass |
| AC-2 | `StatusCodeEnvelopeTests.An_undeclared_method_is_enveloped` | pass |
| AC-3 | `StatusCodeEnvelopeTests.An_unsupported_media_type_carries_our_type_and_not_an_rfc_uri` | pass |
| AC-4 | `StatusCodeEnvelopeTests.The_three_are_localized` | pass |
| AC-6 | `StatusCodeEnvelopeTests.Every_status_that_already_had_an_envelope_is_unchanged` | pass |
| AC-7 | `StatusCodeEnvelopeTests.Health_still_returns_the_health_report_shape` | pass |
| AC-8 | `ContentLanguageTests.Both_ways_of_failing_with_a_400_carry_the_header` | pass |
| AC-9 | `ContentLanguageTests.Every_error_status_carries_the_header` (7 statuses) | pass |
| AC-10 | `ContentLanguageTests.An_unspoken_locale_reports_the_one_that_was_actually_applied` | pass |
| AC-11 | `MiddlewareOrderTests.Request_localization_is_registered_before_authorization` | pass — **closes `005` AC-2** |
| AC-12 | `SupportedCulturesConfigurationTests.A_third_culture_is_answered_with_no_code_change`, plus `The_configured_list_reaches_the_options_and_english_stays_the_default` and `The_unconfigured_host_refuses_french_and_answers_in_english` | pass — **closes `005` AC-19** |
| AC-13 | `StatusCodeEnvelopeTests.No_newly_enveloped_response_names_anything_internal` | pass |
| AC-15, AC-16 | `MalformedRequestTests.An_unreadable_body_is_malformed_and_names_no_field` (3 payloads) | pass |
| AC-17 | `MalformedRequestTests.No_parser_diagnostic_reaches_the_client` **and** `A_field_that_could_not_be_parsed_names_the_field_and_nothing_internal` (2 payloads) | pass |
| AC-18 | `StatusCodeEnvelopeTests.An_anonymous_caller_cannot_distinguish_a_real_route_from_an_invented_one` | pass |
| — | `MalformedRequestTests.A_readable_body_with_bad_fields_is_still_a_validation_error` | pass |
| — | `MalformedRequestTests.The_malformed_response_is_localized` | pass |
| AC-5 | — | **not claimed.** See below |
| AC-14 | — | **not claimed.** See below |

---

## AC-18 — the criterion whose stated reason was WRONG, and the correction is the finding

The spec argued that registering `UseStatusCodePages` before `UseAuthorization` would leak the
route table: `404` for an invented path, `401` for a real one, one guess at a time. It said so in
capital letters, in `Program.cs`, and in a source-level guard written to enforce it.

**Control A moved the registration above `UseAuthorization` and this test still passed.**

```text
dotnet test --filter "…StatusCodeEnvelopeTests|…MiddlewareOrderTests"
Failed: 1

  MiddlewareOrderTests.The_status_code_envelope_is_registered_after_authorization
      Expected Position("app.UseAuthorization()") to be less than 4580 … but found 4681
```

**The only failure was the guard failing on its own premise.** The behaviour never changed,
because the `401` is produced *inside* the wrapped section and short-circuits before routing
resolves anything — so the middleware never sees the request whatever its position. The property
belongs to `RequireAuthenticatedUser`, and it is `004`'s.

Three things were done about it rather than one:

1. The `Program.cs` comment was rewritten to say what is true, with the disproof in it.
2. **The source guard was deleted, not reworded.** It could only ever fail on the premise it was
   built from, never on behaviour — the definition of a guard that guards nothing.
3. AC-18's behavioural test stays, because it asserts the property itself and would catch a real
   regression from any cause.

`CLAUDE.md` says a guard that has never been seen to fail has not been verified. This one was
seen to fail, and failing is what showed it was worthless.

---

## Negative controls — four, each reverted, each rebuilt with `--no-incremental`

### Control A — the envelope registered before authorization

Above. **One failure, and it was the guard's own premise.** Recorded as a disproof.

### Control B — `UseStatusCodePages` removed entirely

```text
Failed: 3, Passed: 5, Total: 8

  StatusCodeEnvelopeTests.An_unmatched_route_is_enveloped
  StatusCodeEnvelopeTests.An_undeclared_method_is_enveloped
  StatusCodeEnvelopeTests.The_three_are_localized
```

Exactly the `404` and `405` criteria. **AC-3 stayed green**, which is the shape that proves the
`415` is fixed by a different mechanism — `UseStatusCodePages` never sees it, because it already
has a body.

### Control C — the MVC factory substitution removed

```text
Failed: 2, Passed: 14, Total: 16

  An_unsupported_media_type_carries_our_type_and_not_an_rfc_uri
      Expected …type… to be "https://wasl.local/errors/unsupported-media-type",
      but found "https://tools.ietf.org/html/rfc9110#section-15.5.16".
  The_three_are_localized
      Expected …title… but found "Unsupported Media Type".
```

The mirror image of control B: only the `415` breaks, and it breaks back into the exact body that
`002` recorded as *empty*. Two mechanisms, two controls, neither covering the other.

### Control D — the parser-text filter disabled

```text
Failed: 2, Passed: 12, Total: 14

  A_field_that_could_not_be_parsed_names_the_field_and_nothing_internal
      (truncated mid-value)
      (unconvertible enum)
```

Both AC-17 cases, and nothing else. Restored, rebuilt, whole suite: **495 / 495.**

---

## What the measurements changed, before any code was written

`002`'s `summary.md` recorded the three statuses as *"still returns an empty body"*. Probing said
otherwise, and the spec was rewritten before implementation rather than after.

| Request | Recorded | Measured |
|---|---|---|
| `GET /api/nope` | empty | empty ✓ |
| `DELETE /api/tickets` | empty | empty ✓ |
| `POST` with `text/plain` | empty | **the framework's own envelope, with an RFC section URI** |
| `POST` with `{not json` | "unverified — a `400` with no envelope, or a `500`" | **our envelope, carrying a parser diagnostic** |

### The `415` was plausible, which is worse than empty

An empty body breaks a client's parser loudly — `002` registered a client-side
`unparseable-response` code for exactly that. A well-formed envelope with a foreign `type` passes
every parser and every shape assertion, and `code === 'unsupported-media-type'` is false forever.
Same family as `CLAUDE.md`'s *verify a measurement with something below it*: `002`'s AC-2 grep
over `src/` was green while the framework built its envelope inside itself.

### The leak was bigger than the spec's example

Q-A quoted the `{not json` case. Probing an **unconvertible enum** found worse:

```json
"$.category": ["The JSON value could not be converted to
  Wasl.Application.Features.Tickets.CreateTicket.CreateTicketCommand.
  Path: $.category | LineNumber: 0 | BytePositionInLine: 102."]
```

A fully-qualified internal type name — namespace, feature folder, command class — plus a byte
offset, under a key that is a JSON path rather than a form field.

**`002` already has a test for that exact request.**
`ModelBindingEnvelopeTests.An_unparseable_guid_or_enum_returns_our_validation_envelope` asserts
the response is `errors/validation` — and passes, because it reads the status and never reads the
message. The shape-not-content trap, sitting in the suite since `002`.

---

## The detection rule took three attempts, and each was measured

| # | Rule | Result |
|---|---|---|
| 1 | `error.Exception is JsonException` | Matched nothing. `SystemTextJsonInputFormatter` wraps the failure in `InputFormatterException`, and `TryAddModelError` special-cases that type by storing its **message** and leaving `Exception` null |
| 2 | `error.Exception is not null` | Matched nothing, for the same reason |
| 3 | key `$` or `$.` prefix | **Too broad** — `002`'s `ModelBindingEnvelopeTests` went red on four cases, correctly: `$.category` means one FIELD failed to parse, and the client can fix that field |
| 4 | key `$` exactly, plus `ContentLength is 0` | Correct. `$` is the document root; a zero-length body never reaches the reader at all |

Attempt 4 also had a false start: `ContentLength is 0 or null`. A null length means chunked
transfer, which is what `HttpClient` uses for perfectly valid JSON — so every ordinary validation
failure became "your request was unreadable". Caught by
`A_readable_body_with_bad_fields_is_still_a_validation_error`, which exists for exactly that
over-reach.

**Every one of the four was measured against the running API. All three failures read correctly.**

`$.field` keys now stay `errors/validation` — `002`'s status choice, unchanged — with the field
name stripped of its path and the message replaced by `Validation.Request.FieldUnreadable`, a
catalogue key that resolves in both languages. The parser's own sentence never could.

---

## Live verification

Before:

```text
404 unmatched       404  CL=''  (no body)
405 wrong verb      405  CL=''  (no body)
415 text/plain      415  {"type":"https://tools.ietf.org/html/rfc9110#section-15.5.16", …}
400 bad JSON        400  errors: {"$": ["…LineNumber: 0 | BytePositionInLine: 1."],
                                  "command": ["The command field is required."]}
```

After:

```text
404 unmatched   404 CL='ar' {"type":".../errors/not-found","title":"العنصر المطلوب غير موجود.",
                             "status":404,"instance":"/api/nope","traceId":"00-92b3…"}
405 wrong verb  405 CL='ar' {"type":".../errors/method-not-allowed",
                             "title":"هذه العملية غير مسموح بها على هذا المسار.", …}
415 text/plain  415 CL='ar' {"type":".../errors/unsupported-media-type",
                             "title":"يجب أن يكون محتوى الطلب بصيغة JSON.", …}
400 bad JSON    400 CL='ar' {"type":".../errors/malformed-request","title":"تعذّرت قراءة الطلب.",
                             "detail":"تعذّرت قراءة محتوى الطلب كـ JSON."}   ← no `errors`
```

---

## Closed elsewhere

| What | Was | Now |
|---|---|---|
| `005` AC-11 | **unmet** — exception-path responses lost `Content-Language` | closed, AC-9 |
| `005` AC-2 | gap — no source guard on the new ordering constraint | closed, AC-11 |
| `005` AC-19 | implemented, unproven | closed, AC-12 |
| `008` AC-3 | **KNOWINGLY UNMET** — a malformed id returns `404`, the criterion asked for `400` | closed **answered differently**, Q-B. The `404` stands, enveloped, and is now a decision |
| `011` D-2 | the same finding, recorded a second time | same ruling |
| `README.md` | "a malformed `{id}` returns `404` … `002b` owns it" | closed in place |

**A numbering error was corrected on the way:** this feature's spec attributed the unmet
criterion to `007`. It is `008` AC-3. Nothing in `007` was involved, and the wrong number had
already been repeated once before it was checked.

---

## Not claimed

| What | Why |
|---|---|
| **AC-5** — the response `traceId` equals the log's | Not tested. One accessor makes it true by construction, which is an argument rather than evidence — and it is `002`'s own `AC-4`, already listed under Q-C's deferral to `002c`. Recorded rather than quietly satisfied by the `traceId`-is-present assertions that AC-1 … AC-3 do make |
| **AC-14** — `ResourceKeyLeakTests` extended to the three new statuses | Not done. The guard covers six error responses and none of the three; a key-shaped title on a `405` would not be caught by it today. **`002c`** |
| The four items Q-C deferred | OpenAPI comparison, validator-key test, cancellation test, `traceId`-equals-log. **`002c`**, a named board row, so `002b` does not close with four of its own items open under its name |
| That every framework-produced message is now localized | **It is not.** A plain binding failure still returns the framework's English sentence — `"description": ["The Description field is required."]` — inside an Arabic response. Pre-existing, outside the approved scope, and **raised** rather than fixed or ignored. See `summary.md` |
| The Arabic of the two new strings | Written by this agent like `005`'s 63, and unreviewed for the same reason. Q-8 |
