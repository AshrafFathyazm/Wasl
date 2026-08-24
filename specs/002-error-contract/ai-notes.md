# 002 — AI Usage Notes

**State: specification phase only. No implementation has run and no test has been executed.**

Everything below describes AI use on the *planning* artifacts. The Implementation and Testing
sections are headings with nothing under them, and they stay that way until code exists — an
empty section is honest, a pre-filled one is a false statement.

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
| Swashbuckle works on .NET 10 Minimal APIs | `spec.md` A-5, `research.md` R-7 | Generator-specific code confined to two files; `AddOpenApi()` is the named fallback |

No API, package, or method named in `plan.md` was confirmed to exist by running anything.
That confirmation is part of `BE-002-01` onward and belongs in the Implementation section
below, which is empty.

**Not put into any prompt:** no credentials, no connection strings, no tokens, no customer
data. Nothing in this feature touches a secret; the only environment-dependent value it
discusses — the `type` base URI — is deliberately a compile-time constant rather than
configuration (AC-16).

---

## Implementation

*Empty. No code has been written for this feature.*

To be filled per task with: what the agent was given, what came back, what was accepted,
what was modified and how, what was rejected and why, and — for each accepted output — the
command that was **run** to verify it. Reading is not verifying, and this feature has five
unverified framework assumptions (above) that only a build can close.

---

## Testing

*Empty. No tests have been run.*

`tests.md` records the commands and their real output. Nothing is written there that was not
observed, which is the one rule in this process a reviewer can check in about ten seconds.

Two of this feature's tests will only mean something if they are watched **failing** first,
and that observation belongs here when it happens:

- `TEST-002-03` — move `traceId` under `extensions` and confirm it goes red. A shape
  assertion that has never failed may be asserting the wrong shape
- `TEST-002-10` — remove `.WithMessage(key)` from the fixture validator and confirm it goes
  red. It guards nothing today; if it cannot fail today it will not fail at `007` either
