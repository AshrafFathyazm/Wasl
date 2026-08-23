# 001 — Requirements Checklist

A check on the **specification**, not on the code. Run before `/speckit-plan` is
trusted, and again before the feature closes.

## Completeness

| ✓ | Item | Where |
|---|---|---|
| ☑ | Scope and out-of-scope are both explicit | `spec.md` |
| ☑ | Every excluded item names the feature that owns it instead | `spec.md`, Out of scope |
| ☑ | Assumptions are written down, each with what happens if it is wrong | `spec.md`, A-1 – A-4 |
| ☑ | Open questions carry a working assumption rather than blocking | `spec.md`, Q-A, Q-B |
| ☑ | Every acceptance criterion is testable as written | `spec.md`, AC-1 – AC-12 |
| ☑ | Edge cases include failure cases, not only happy variations | `spec.md`, Edge cases |
| ☑ | Referenced rules are cited by ID | `spec.md`, Rules referenced |

## Testability

| ✓ | Item | Note |
|---|---|---|
| ☑ | Every AC maps to at least one task in `tasks.md` | AC-1→BE-001-02, AC-2→BE-001-03, AC-3→BE-001-05, AC-4→TEST-001-06, AC-5→TEST-001-07, AC-6→TEST-001-02, AC-7→TEST-001-01, AC-8→TEST-001-03, AC-9→BE-001-10, AC-10→BE-001-09, AC-11→BE-001-02, AC-12→TEST-001-04/05, AC-13→BE-001-11 |
| ☑ | No AC needs a follow-up question to turn into a test | Each names a command or an observable result |
| ☑ | Nothing is verified by "it works" | Every `Verified by` cell is a command or an inspection |
| ☑ | The silent failures each have their own criterion | AC-5, AC-7, AC-8, AC-9, AC-12 |

## Consistency with the blueprint

| ✓ | Item | Source |
|---|---|---|
| ☑ | Project layout matches the accepted architecture | ADR-010 |
| ☑ | Database provider and every type match | ADR-013, `docs/sdd/03-domain-model.md` |
| ☑ | The concurrency token is `rowversion`, not `xmin` or a manual counter | ADR-006 as amended |
| ☑ | Integration tests use a real engine, never EF `InMemory` | `docs/sdd/testing/test-strategy.md` |
| ☑ | `/health` is unauthenticated and outside `/api` | `docs/sdd/05-api-conventions.md` |
| ☑ | Middleware ordering constraint recorded for whoever adds the second one | ADR-007, noted in `plan.md` |

## Gaps accepted, with reasons

| Gap | Reason |
|---|---|
| The CI workflow has no test of its own | Verified by observing a green run (AC-9). A test that tests a workflow file needs a runner to run it, which is the thing being verified |
| `Customer` has no behaviour and therefore no unit tests | Its specification belongs to `007`. Writing tests here would test the compiler |
| No load or performance verification | No stated requirement. `docs/sdd/testing/test-strategy.md` lists this as deliberately untested |
| ~~Divergence from the house platform's `net8.0`~~ | **No longer a gap** — the product owner confirmed .NET 10 on 2026-08-23. It is a recorded decision with a one-sentence defence (`research.md` R-3), and `global.json` closes the SDK-resolution risk that came with it |
| Docker is not currently running on this machine | `research.md` R-8. Every container-dependent AC is unverifiable until Docker Desktop is started. Stated rather than discovered by a red suite |

## Sign-off

| Gate | State |
|---|---|
| Specification reviewed by the product owner | **Pending** — this feature is awaiting approval before implementation |
| Plan names every file it will create | ☑ `plan.md` |
| Contract frozen | ☑ `contracts/health-api.md` |
| Tasks have an owner, a verification, and something they serve | ☑ `tasks.md` |
