# 002 — Requirements Checklist

A check on the **specification**, not on the code. Run before `/speckit-plan` is trusted, and
again before the feature closes.

## Completeness

| ✓ | Item | Where |
|---|---|---|
| ☑ | Scope and out-of-scope are both explicit | `spec.md` |
| ☑ | Every excluded item names the feature that owns it instead | `spec.md`, Out of scope — eleven rows, each naming a feature or the reason there is none |
| ☑ | Assumptions are written down, each with what happens if it is wrong | `spec.md`, A-1 – A-6 |
| ☑ | Open questions carry a working assumption rather than blocking | `spec.md`, Q-A – Q-G |
| ☑ | Every acceptance criterion is testable as written | `spec.md`, AC-1 – AC-28 |
| ☑ | Edge cases include failure **and permission** cases, not only happy variations | `spec.md`, Edge cases — includes `401`, `403`, a validator that throws, a fault while writing the response, and a client disconnect |
| ☑ | Referenced rules are cited by ID, not restated at length | `spec.md`, Rules referenced |
| ☑ | The contract is frozen before either lane starts | `contracts/error-contract.md`, FROZEN 2026-08-23 |
| ☑ | The feature's data position is stated even though there is no schema change | `data-model.md` — says none, and says why the error path deliberately reads nothing |
| ☑ | The frontend position is stated even though there is no screen | `frontend-spec.md` — names the five features that own the screens consuming these utilities |

## Testability

| ✓ | Item | Note |
|---|---|---|
| ☑ | Every AC maps to at least one task in `tasks.md` | AC-1→TEST-002-01, AC-2→REV-002-01, AC-3→TEST-002-03, AC-4→TEST-002-04, AC-5→TEST-002-02, AC-6→TEST-002-02, AC-7→TEST-002-07, AC-8→TEST-002-07, AC-9→TEST-002-08, AC-10→TEST-002-08, AC-11→TEST-002-08, AC-12→TEST-002-05, AC-13→TEST-002-06, AC-14→TEST-002-09, AC-15→TEST-002-09, AC-16→TEST-002-09, AC-17→TEST-002-10, AC-18→TEST-002-11, AC-19→TEST-002-12, AC-20→TEST-002-12, AC-21→TEST-002-15, AC-22→TEST-002-13, AC-23→TEST-002-13, AC-24→TEST-002-16, AC-25→TEST-002-17, AC-26→TEST-002-18, AC-27→TEST-002-17, AC-28→TEST-002-11 (behaviour deferred to TEST-002-14 at `005`) |
| ☑ | No AC needs a follow-up question to become a test | Each names a command, a `grep`, a status code, or a comparison of two observable strings |
| ☑ | Nothing is verified by "it works" | Every `Verified by` cell is a command, a `curl`, a `grep`, or an inspection someone else could repeat |
| ☑ | Each AC is independently testable | Confirmed by reading them as a list: none says "and" in a way that needs two mechanisms to be true at once. AC-14 is the closest — a build-time test **and** a runtime log — and both are asserted separately in `TEST-002-09` |
| ☑ | The silent failures each have their own criterion | AC-3, AC-4, AC-9, AC-13, AC-14, AC-17, AC-26, AC-28 — listed again as a table at the end of `spec.md` |
| ☑ | Every negative assertion is written so it cannot pass for the wrong reason | AC-12 is **set equality on property names**, not a substring search for "Exception". A substring search passes when the leak is a file path, which is one of the leaks NFR-4 is actually about |
| ☑ | An AC whose behaviour cannot be observed yet says so | AC-28 asserts the **seam** and `TEST-002-14` defers the behaviour to `005`. Claiming the behaviour here would be a false statement |

## Consistency with the blueprint

| ✓ | Item | Source |
|---|---|---|
| ☑ | RFC 7807 `ProblemDetails` for every non-2xx; `200` never carries an error | `docs/sdd/05-api-conventions.md`, constitution IV |
| ☑ | Every status code in the convention table is accounted for | `docs/sdd/05-api-conventions.md`, plus two rows it does not have — see the gap below |
| ☑ | All five `409` `type` values are registered, including the reserved one | `docs/sdd/documentation/api/error-handling.md`; `spec.md` Q-B |
| ☑ | `type`, `errors` keys, enum values, `TicketNumber`, `traceId` are never localized | BR-8.7, ADR-007 §3 |
| ☑ | `title`, `detail`, and `errors` messages are server-localized, from symbolic keys | BR-8.6, ADR-007 §5 |
| ☑ | Server logs stay English at every locale | BR-8.9 |
| ☑ | `traceId` joins the response, the log, and the audit row | BR-9.9 |
| ☑ | Nothing leaks a stack trace, exception name, SQL, path, or configuration value | NFR-4, `docs/sdd/testing/security-checklist.md` |
| ☑ | `Wasl.Domain` gains no HTTP type and no package reference | ADR-010, constitution III; enforced by `001`'s architecture test plus a `grep` in BE-002-01 |
| ☑ | Validation is a pipeline behaviour, not per-handler discipline | Constitution V; MediatR's stated justification in Technology Constraints |
| ☑ | `UseRequestLocalization` after `UseAuthentication` is recorded for whoever adds them | ADR-007 §4; written out in `plan.md`'s `Program.cs` block |
| ☑ | Integration tests use the real host and a real engine, never EF `InMemory` | `docs/sdd/testing/test-strategy.md` |
| ☑ | The frontend branches on `type`, mirrors rules, and is never the authority | ADR-003, ADR-011 §5, §6 |
| ☑ | Fetching stays at route level and no global store is introduced | ADR-011 §4 — this feature adds three pure functions and no component |
| ☑ | `/health` remains outside the error contract and its `001` shape is unchanged | `specs/001-solution-skeleton/contracts/health-api.md`, AC-11 |

### Two places this specification does **not** match the blueprint literally

Both are deliberate, both are argued, and both would otherwise look like errors.

| Divergence | Reason |
|---|---|
| The constitution says "a single exception-handling middleware". This feature ships **two mechanisms, one factory** | An exception handler cannot see a `404` on an unmatched route, a `405`, a `415`, or an auth short-circuit — no exception is thrown for any of them. A literal reading ships an empty-bodied `404`, the most common failure a client receives, and the frontend's shared parser throws on it. The requirement — one *shape*, one *producer* — is preserved exactly (AC-2). `research.md` R-1, `plan.md` Risks |
| The registry adds `errors/method-not-allowed` and `errors/unsupported-media-type`, which are not in `docs/sdd/05-api-conventions.md`'s status table | ASP.NET Core returns `405` and `415` whether or not a table lists them. Specifying them is the alternative to them arriving undocumented. `DOC-002-03` proposes the amendment; the blueprint is not edited from inside a feature. `spec.md` Q-C |

### Contradictions found **inside** the blueprint, and how each was resolved

Recorded here rather than resolved silently, because each is a place two documents disagree
and a reviewer may read them in either order.

| Contradiction | Resolution |
|---|---|
| `05-api-conventions.md` says "`errors` is present only for `400` validation failures" and then shows a `409` **with** `errors` in its own Arabic example | `errors` is a property of the `type`, not of the status. Consistent with `007`'s **frozen** contract and `CLAUDE.md`, which is the tie-break. `research.md` R-9, `spec.md` Q-A |
| `05-api-conventions.md` names four `409` types; `documentation/api/error-handling.md` names five | Register all five; `errors/ticket-closed` is reserved for `012` and raised by nobody yet. `spec.md` Q-B |
| `05-api-conventions.md`: a `500` carries "a trace id and nothing else". `error-handling.md`: "a title, a status, and a `traceId`" | They agree on intent. "Nothing else" means no `detail` and no `errors`; it cannot mean no `type`, because that would make `500` the one status the shared client parser cannot read. `research.md` R-8, `spec.md` Q-F |
| `001` R-7 deferred Swashbuckle to `002` "when there is more than one endpoint to document" — and `002` adds no endpoint | The stated reason does not hold; the real one is the shared failure **schema** that every endpoint from `007` must declare against. Recorded rather than glossed over, because the justification changed even though the decision did not. `research.md` R-7 |
| `001` R-7 deferred Serilog to `002` | Not adopted. BR-9.9 needs a correlation **scope**, which `Microsoft.Extensions.Logging` provides; Serilog is a sink with no requirement behind it. `spec.md` Q-G |

## Gaps accepted, with reasons

| Gap | Reason |
|---|---|
| No Arabic error response is asserted in this feature | There is no `ar` catalogue until `005`. AC-28 asserts the **seam**; `TEST-002-14` asserts the behaviour, at `005`. Claiming coverage now would be the kind of false statement Principle II exists to catch |
| `401` and `403` are enveloped against **synthetic** short-circuits, not real policies | `004` owns the policies and re-asserts the envelope with real tokens — `docs/sdd/testing/test-strategy.md` already lists that test in `004`'s scope. Testing it twice against a fake would prove less, not more |
| The frontend files are not written in this feature | `006` creates the React application and runs after this one. The utilities are specified and frozen here and the tasks keep their `FE-002-` identifiers so the dependency is visible in both task lists. `spec.md` Q-D |
| No test proves the developer exception page is absent in **Production** | It is off by default in Production, and asserting a framework default is testing the framework. AC-13 tests **Development**, which is where it is on by default and where the demo runs |
| The `errors/ticket-closed` row has no producer | Reserved for `012`. A registry row nothing raises looks like dead code; the alternative is `012` inventing a local code, which is the failure the registry exists to prevent. `plan.md` Risks |
| The culture-at-unwind question is unresolved | `research.md` R-11 could not be settled without running the framework, and no `src/` exists. The design is written not to depend on the answer (AC-28), and the empirical check is a named task. An unresolved question with a pessimistic design beats a resolved-looking one built on a guess |
| Nothing here was verified by running .NET | No `src/` exists; this is the specification phase. `research.md` says so at the top rather than implying observation |
| No load, throughput, or performance verification of the error path | No stated requirement. `docs/sdd/testing/test-strategy.md` lists load and performance as deliberately untested project-wide |
| MediatR arrives with no production handler | The behaviour is the consumer, and the guarantee is structural — the sole reason MediatR is in the technology table. `research.md` R-10, `spec.md` A-6 |

## Sign-off

| Gate | State |
|---|---|
| Specification reviewed by the product owner | **Pending** — this feature is awaiting approval before implementation |
| Open questions carry a working assumption, and none blocks the plan | ☑ `spec.md` Q-A – Q-G |
| Plan names every file it will create or change | ☑ `plan.md`, Backend design and Frontend design |
| At least one real alternative considered and rejected, with the reason | ☑ `plan.md` — four rejected alternatives and four accepted risks |
| Contract frozen before either lane starts | ☑ `contracts/error-contract.md` |
| Every AC maps to a task, and every task has an owner, a verification, and something it serves | ☑ `tasks.md`, and the AC map in Testability above |
| Droppable and not-droppable both stated with reasons | ☑ `tasks.md` |
| Blueprint contradictions recorded rather than resolved silently | ☑ this file, above |
| Implementation and testing sections of `ai-notes.md` are empty | ☑ — no code has been written and no test has run |
