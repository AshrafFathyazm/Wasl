# 005 — Requirements Checklist

A check on the **specification**, not on the code. Run before `/speckit-plan` is trusted,
and again before the feature closes.

## Completeness

| ✓ | Item | Where |
|---|---|---|
| ☑ | Scope and out-of-scope are both explicit, split by lane | `spec.md`, In scope / Out of scope |
| ☑ | Every excluded item names the feature that owns it, or says "nowhere" and why | `spec.md`, Out of scope — eleven rows, four of them "nowhere" |
| ☑ | Assumptions are written down, each with what happens if it is wrong | `spec.md`, A-1 – A-6 |
| ☑ | Open questions carry a working assumption rather than blocking | `spec.md`, Q-A – Q-F |
| ☑ | Every acceptance criterion is testable as written | `spec.md`, AC-1 – AC-32 |
| ☑ | Edge cases include failure and permission cases, not only happy variations | `spec.md`, Edge cases — includes unauthenticated, expired token, `403`, malformed claim, malformed header |
| ☑ | Referenced rules are cited by ID and not restated at length | `spec.md`, Rules referenced |
| ☑ | The contract is frozen before either lane starts | `contracts/localization-contract.md`, `DOC-005-01` |
| ☑ | The data-model file states explicitly that there is no schema change, and why | `data-model.md` |
| ☑ | A feature with no screen still has a real `frontend-spec.md` | `frontend-spec.md` — no screen, substantial frontend, and the difference is stated |

## Testability

| ✓ | Item | Note |
|---|---|---|
| ☑ | Every AC maps to at least one task | See the map below |
| ☑ | No AC needs a follow-up question to turn into a test | Each names a header, a status code, a byte comparison, a character range, or an exit code |
| ☑ | Nothing is verified by "it works" | Every `Verified by` cell in `tasks.md` is a command, a test run, or a deliberate-breakage observation |
| ☑ | The silent failures each have their own criterion | AC-1, AC-2 (pipeline order) · AC-11 (`Content-Language` off by default) · AC-16 (`ResourcesPath` trap) · AC-15 (neutral-catalogue fallback) · AC-17 (invariant globalization) · AC-18 (log language) · AC-21 (`compatibilityJSON: 'v3'`) · AC-25 (inline `Intl`) |
| ☑ | Every build-failing control can run where the build runs | `spec.md` Q-E: TEST-005-03, -10, -16, and TEST-005-02 take no database fixture, so they run with Docker stopped (`001/research.md` R-8) |
| ☑ | Each lint rule has been watched to fail | `TEST-005-11` — a rule nobody has seen fire may be misconfigured |

### AC → task map

| AC | Task | AC | Task |
|---|---|---|---|
| AC-1 | TEST-005-01 | AC-17 | TEST-005-16 |
| AC-2 | TEST-005-02 | AC-18 | TEST-005-17 |
| AC-3 | TEST-005-03 | AC-19 | TEST-005-18 |
| AC-4 | TEST-005-04 | AC-20 | TEST-005-14 |
| AC-5 | TEST-005-04, BE-005-04 | AC-21 | TEST-005-19 |
| AC-6 | TEST-005-04 | AC-22 | TEST-005-11, FE-005-09 |
| AC-7 | TEST-005-04 | AC-23 | TEST-005-11, FE-005-09 |
| AC-8 | TEST-005-05 | AC-24 | TEST-005-11, FE-005-10 |
| AC-9 | TEST-005-05 | AC-25 | TEST-005-11, FE-005-09 |
| AC-10 | TEST-005-05 | AC-26 | TEST-005-20 |
| AC-11 | TEST-005-07 | AC-27 | TEST-005-20 |
| AC-12 | TEST-005-08 | AC-28 | TEST-005-12, FE-005-08 |
| AC-13 | TEST-005-09 | AC-29 | TEST-005-12 |
| AC-14 | TEST-005-10 | AC-30 | TEST-005-21 |
| AC-15 | TEST-005-15 | AC-31 | TEST-005-22 |
| AC-16 | TEST-005-10, BE-005-03 | AC-32 | TEST-005-23, BE-005-08 |

Thirty-two criteria, twenty-three test tasks. No AC is unmapped, and no test task exists
without an AC or a rule ID in its **Serves** column.

## Consistency with the blueprint

| ✓ | Item | Source | Note |
|---|---|---|---|
| ☑ | Resolution order is exactly the four levels, in order | BR-8.4, BR-8.5 | AC-4 – AC-7. The cookie provider is removed because it is not one of the four (`research.md` R-6) |
| ☑ | `ar-EG` → `ar`; `fr` → `en` with a `200` | BR-8.2, BR-8.3, FR-5.8 | AC-8, AC-9 |
| ☑ | Only server-authored sentences are localized | BR-8.6 | AC-13 |
| ☑ | The never-localized list is exhaustive and reasoned | BR-8.7, BR-8.9, BR-9.10 | Thirteen rows in the contract, each with its reason |
| ☑ | Key parity is enforced by a test, not by discipline | BR-8.11, NFR-8 | AC-14, AC-28, AC-32 |
| ☑ | A missing translation falls back to English, never the key | BR-8.12 | AC-15, AC-29 — and `research.md` R-3 shows the naive file layout makes this impossible |
| ☑ | Gregorian calendar and Latin digits in Arabic | BR-8.13, ADR-007 §7 | AC-26, AC-27 |
| ☑ | Six CLDR plural categories, no concatenation | BR-8.14, ADR-007 §9 | AC-21, AC-23 |
| ☑ | Middleware order per ADR-007 §4 | ADR-007 §4 | AC-1, AC-2 — **narrowed** to "between authentication and authorization" (`research.md` R-5) |
| ☑ | Symbolic keys with an explicit English catalogue | ADR-007 §5 | AC-14, AC-15. The file is the neutral `.resx`; the substance of the decision is unchanged |
| ☑ | CSS logical properties, no mirrored stylesheet | ADR-007 §6 | AC-24 |
| ☑ | `dir="auto"` on user content | ADR-007 §8 | AC-30 |
| ☑ | A third locale is a resource file plus configuration | NFR-9 | AC-19 |
| ☑ | Two projects; nothing added to `Wasl.Domain` | ADR-010 | The `.resx` live in `Wasl.Api/Common/Localization/` (`research.md` R-1) |
| ☑ | No repository, no new abstraction without a second implementation | Constitution | Nothing abstract is introduced. One provider, one registration extension, one formatter module |
| ☑ | Structural over remembered | Constitution V | Parity tests, lint rules, and `UserText` replace four things that would otherwise be review items |
| ⚠ | ADR-007 §2 names `Wasl.Application/Resources` | ADR-007 §2 | **Divergence, deliberate and recorded.** That project does not exist under ADR-010. `DOC-005-03` corrects the documentation; the ADR's reasoning is untouched |
| ⚠ | `001/spec.md` assigns "the React application" to `006` | `001/spec.md` | **Divergence, needing sign-off.** This feature takes the scaffold; `006` keeps tokens and primitives (`spec.md` Q-B, `research.md` R-10) |
| ⚠ | `006` owns the primitives | `specs/README.md` | **Narrowed.** `UserText` ships here because ADR-007 §8 is only structural if the easy path exists before the first screen (`spec.md` Q-C) |

## Gaps accepted, with reasons

| Gap | Reason |
|---|---|
| `dir="auto"` is not enforced by lint | Deciding whether an expression is user content requires knowing where the value came from, which ESLint cannot. Enforced structurally by `UserText` being the documented and shortest path, plus review. Stated in `frontend-spec.md` rather than claimed as automated |
| No RTL visual verification | There is no screen. `014` owns the Arabic walk, and `specs/README.md` calls it a deliverable rather than a check because no assertion catches a container sized to English text |
| No test that the Arabic copy is good Arabic | No automated test can. `spec.md` A-4 records it as a delivery risk; a human reads it in `014` |
| The `Program.cs` source guard is crude | It reads a `.cs` file as text and will annoy a reformatter. Accepted because the alternative — reflection over `ApplicationBuilder` internals — breaks on a framework patch and teaches people to delete tests (`research.md` R-11) |
| No plural key ships in the client catalogue | Every count belongs to a screen that does not exist. The six-category **configuration** is proven with an in-test bundle (AC-21); the first real plural arrives with `010` |
| `Diagnostics.FallbackProbe` ships in production | One English-only key, documented in the contract and exempt from parity by name. It is the only way to demonstrate BR-8.12, because the parity test guarantees no real key is ever missing. One documented exemption beats an untested safety net |
| The language claim has no producer yet | `spec.md` Q-A. The provider is tested with a token minted in the test, and `DOC-005-04` raises the claim as a written requirement against `004` rather than assuming it |
| The Stylelint host may change | `research.md` R-13: if `006` picks a utility framework or CSS-in-JS, the physical-property ban moves host. The intent is fixed and the AC is unchanged; only the config file differs |
| `002`'s mapper is named by role, not by file | `002` is not specified yet. Declared as a cross-feature change in `plan.md` under **Contract changes**, so it is a known edit rather than a surprise |
| No load or performance verification | No stated requirement. Culture resolution reads a claim and costs no query, which is what TEST-005-06 asserts |

## Sign-off

| Gate | State |
|---|---|
| Specification reviewed by the product owner | **Pending** — and two items need a decision, not just approval: `spec.md` Q-B (who scaffolds the React app) and Q-C (`UserText` shipping here) |
| Plan names every file it will create or change | ☑ `plan.md`, both lanes |
| Contract frozen | ☑ `contracts/localization-contract.md` |
| Tasks have an owner, a verification, and something they serve | ☑ `tasks.md` |
| Droppable and not-droppable both stated with reasons | ☑ `tasks.md` |
| Every framework API named in the plan was verified to exist | ☑ `research.md` preamble — checked against the .NET 10 reference assembly on this machine, not recalled |
