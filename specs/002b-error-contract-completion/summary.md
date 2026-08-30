# `002b-error-contract-completion` — summary

**Delivered 2026-08-30.** 495 tests, 0 warnings, 23 new.

## What was built

| # | What | Where |
|---|---|---|
| 1 | `StatusCodeEnvelope` + `UseStatusCodePages` — gives `404` and `405` an envelope | `Api/Common/Errors`, `Program.cs` |
| 2 | `MvcProblemDetailsFactory` — routes MVC's own `ProblemDetails` through ours, which is what finally fixes the `415` | `Api/Common/Errors` |
| 3 | `ModelStateEnvelope` — splits an unreadable body from a body with bad fields, and strips every parser diagnostic | `Api/Common/Errors` |
| 4 | `Content-Language` re-applied in `GlobalExceptionHandler` | `Api/Common/Errors` |
| 5 | Two catalogue keys in both languages: `Error.MalformedRequest.Detail`, `Validation.Request.FieldUnreadable` | `Api/Common/Localization` |
| 6 | `Request_localization_is_registered_before_authorization` — the source guard `005` left unwritten | test project |
| 7 | `SupportedCulturesConfigurationTests` — NFR-9's claim, finally tested | test project |

## The one thing worth reading

**A criterion in this spec had a reason that was wrong, and the control proved it wrong rather
than proving it right.**

`002b` argued that registering `UseStatusCodePages` before `UseAuthorization` would leak the
route table — `404` for an invented path, `401` for a real one. It was written in capital letters
in `Program.cs`, given an acceptance criterion, and given a source-level guard.

Control A moved the registration. **The behavioural test passed.** The `401` is produced inside
the wrapped section and short-circuits before routing resolves anything, so the middleware never
sees the request whatever its position. The property belongs to `RequireAuthenticatedUser`; it is
`004`'s and always was.

So: the comment was rewritten to carry the disproof, **the source guard was deleted rather than
reworded** — it could only ever fail on its own premise, never on behaviour — and AC-18's
behavioural test stayed, because it asserts the property itself.

The measurement was run because the criterion said to run it. Had it been skipped, an
impressive-sounding and false claim would have shipped in three places.

## What measuring changed before any code was written

`002`'s summary recorded `404`, `405` and `415` as *"still returns an empty body"*. Two of three
were right.

- **The `415` was never empty — it was plausible.** MVC's own envelope, carrying
  `https://tools.ietf.org/html/rfc9110#section-15.5.16` instead of the registered `type`, with no
  `instance` and an English title in an Arabic response. That is worse than empty: an empty body
  breaks a client's parser loudly, and `002` even registered `unparseable-response` for it. A
  well-formed envelope with a foreign `type` passes every parser and branches nowhere.
- **The malformed-body `400` leaked more than the spec's example.** Q-A quoted the `{not json`
  case. An unconvertible enum was worse: `$.category` carried
  `"…could not be converted to Wasl.Application.Features.Tickets.CreateTicket.CreateTicketCommand.
  Path: $.category | LineNumber: 0 | BytePositionInLine: 102."` — a fully-qualified internal type
  name and a byte offset. **`002` has a passing test for that exact request**, because it asserts
  the status and never reads the message.

## Deviations

| # | Spec says | Built | Reason |
|---|---|---|---|
| D-1 | AC-18 holds because the envelope is registered after authorization | AC-18 holds because of the fallback policy | Control A disproved the stated cause. Corrected in three places rather than quietly left |
| D-2 | Detection of an unreadable body is "on the exception, not on the message" | on the JSON path key, plus a zero-length body | Two structural rules were written, read correctly, and matched nothing: MVC wraps the parse failure in `InputFormatterException` and stores its **message**, leaving `Exception` null. The third rule was too broad and `002`'s own tests caught it. Four attempts, all measured |
| D-3 | AC-15/AC-16 imply a truncated body is `malformed-request` | it is `errors/validation`, with the field named and the parser text replaced | A truncated document reports at `$.subject`, not `$`. `002` chose `validation` for a field that fails to parse and that choice stands; what changed is that the message is now a catalogue key instead of a parser diagnostic |
| D-4 | `MvcProblemDetailsFactory` builds a fallback `ProblemDetails` | it delegates; `ProblemDetailsFactory` gained `Passthrough` and `PassthroughValidation` | `ErrorEnvelopeTests.OnlyTheFactory_ConstructsProblemDetails` went red — correctly. A second constructor is a second shape, and `002` AC-2 says one producer |

## Raised, not fixed — outside the approved scope

**A plain binding failure still returns the framework's English sentence.**

```json
"errors": { "description": ["The Description field is required."] }
```

Inside a response whose `title` and `detail` are Arabic, naming the C# property in PascalCase.
Same family as the seventeen raw keys `004b` found: an unlocalized message under a form field,
which no server test notices because each asserts the field is *present*.

Q-A widened this feature to cover the malformed-JSON leak. It did **not** cover framework
messages on a readable body, and this is not smuggled in under it. Fixing it means either
suppressing MVC's own validation messages in favour of FluentValidation's (which run later, on a
command that never bound) or supplying a catalogue key per binding failure — a design decision,
not a patch. **Recommended for `002c`.**

## Known limitations

- **AC-5 is not tested.** The response `traceId` equals the log's by construction, which is an
  argument. It is `002`'s own AC-4 and already deferred to `002c`.
- **AC-14 is not done.** `ResourceKeyLeakTests` does not yet cover the three newly-enveloped
  statuses, so a key-shaped title on a `405` would go unnoticed. `002c`.
- **Four `002b` items were deferred again**, by ruling, to `002c` — a named board row rather
  than a list under a closed feature's name.
- **The two new Arabic strings are unreviewed**, like `005`'s 63. Q-8.
- **`GET /api/tickets/not-a-guid` stays `404`**, ruled. A `400` would tell an unauthenticated
  prober that the id *shape* was wrong. `008` AC-3 and `011` D-2 are closed as *answered
  differently*, and a numbering error was corrected on the way: this spec first attributed that
  criterion to `007`, and nothing in `007` was involved.
