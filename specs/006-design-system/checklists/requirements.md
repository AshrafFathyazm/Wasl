# 006 — Requirements Checklist

A check on the **specification**, not on the code. Run before `/speckit-plan` is trusted,
and again before the feature closes.

## Completeness

| ✓ | Item | Where |
|---|---|---|
| ☑ | Scope and out-of-scope are both explicit | `spec.md` |
| ☑ | Every excluded item names the feature that owns it instead | `spec.md`, Out of scope — 13 rows, each naming an owner or stating "Nowhere" with a reason |
| ☑ | Assumptions are written down, each with what happens if it is wrong | `spec.md`, A-1 – A-6 |
| ☑ | Open questions carry a working assumption rather than blocking | `spec.md`, Q-11, Q-15, Q-A – Q-H |
| ☑ | Every acceptance criterion is testable as written | `spec.md`, AC-1 – AC-25 |
| ☑ | Edge cases include failure cases, not only happy variations | `spec.md`, Edge cases — 17 rows, including the browser, the offline, the timebox, and the permission cases |
| ☑ | A permission case is covered | `spec.md`, *A permission-driven disabled Button*: the primitive exposes `disabled` and does not model the reason, because a disabled control receives no focus |
| ☑ | Referenced rules are cited by ID | `spec.md`, Rules referenced |
| ☑ | The feature with no HTTP surface says so in a contract file | `contracts/README.md` |
| ☑ | The feature with no schema change says so, and says why | `data-model.md` |
| ☑ | The primary artifact is identified and is the longest file | `frontend-spec.md`, stated in its first line |

## Testability

| ✓ | Item | Note |
|---|---|---|
| ☑ | Every AC maps to at least one task | Map below — all 25 |
| ☑ | No AC needs a follow-up question to turn into a test | Each names a command, a measurement, or a specific observation |
| ☑ | Nothing is verified by "it works" | Every `Verified by` cell in `tasks.md` is a command, a deliberate-violation exercise, or a written-down finding |
| ☑ | The silent failures each have their own criterion | `spec.md`, *What fails silently here* — 12 rows, each mapped to an AC |
| ☑ | Things that cannot be asserted are named as observations, not disguised as tests | AC-20, AC-21, AC-22 are `TEST-006-13`'s recorded findings. A focus ring's *visibility* and an RTL layout defect are visual; no assertion catches a container sized to English text |
| ☑ | The gates are tested by being made to fail | `TEST-006-12`: six deliberate violations, six non-zero exits. A gate nobody has seen fail is a gate nobody knows works |

### AC → task map

| AC | Task |
|---|---|
| AC-1 | FE-006-01, FE-006-14 |
| AC-2 | FE-006-11 |
| AC-3 | FE-006-13, TEST-006-12 |
| AC-4 | FE-006-02, FE-006-13, TEST-006-12 |
| AC-5 | FE-006-03, TEST-006-03 |
| AC-6 | FE-006-04, TEST-006-01 |
| AC-7 | FE-006-04, TEST-006-02 |
| AC-8 | FE-006-03, TEST-006-04 |
| AC-9 | FE-006-07, FE-006-10 |
| AC-10 | FE-006-07, TEST-006-06 |
| AC-11 | FE-006-07, TEST-006-05 |
| AC-12 | FE-006-08, FE-006-10, TEST-006-07 |
| AC-13 | FE-006-08, TEST-006-07 |
| AC-14 | FE-006-06, TEST-006-12, TEST-006-13 |
| AC-15 | FE-006-09, FE-006-10, TEST-006-08 |
| AC-16 | FE-006-09, TEST-006-09 |
| AC-17 | FE-006-13, TEST-006-12 |
| AC-18 | FE-006-13, TEST-006-12, REV-006-02 |
| AC-19 | FE-006-13, TEST-006-12 |
| AC-20 | TEST-006-13 |
| AC-21 | TEST-006-13 |
| AC-22 | FE-006-12, TEST-006-13 |
| AC-23 | FE-006-06, TEST-006-11 |
| AC-24 | FE-006-13, TEST-006-12 |
| AC-25 | FE-006-05, TEST-006-10 |

Two ACs are served by `REV-` or by a recorded observation rather than by an automated
test, and that is stated rather than papered over: AC-18's *semantic token used for the
wrong meaning* is only catchable by a reader (REV-006-02), and AC-20/21/22 are visual.

## Consistency with the blueprint

| ✓ | Item | Source |
|---|---|---|
| ☑ | Levels 1 and 2 only; no screens copied; the one-day timebox honoured and its degradation path written down | ADR-009 |
| ☑ | Colours from the export, geometry and layout from the shipped app; every token labelled with its source | ADR-009, `tokens.css` legend |
| ☑ | The themeable/fixed split, the oklab derivation, the computed `--on-brand`, pre-paint application | ADR-012 §1–§3, *Applying it without a flash* |
| ☑ | No status or priority colour is themeable | ADR-012 §3, `design/theming.md` |
| ☑ | Sidebar presets and the settings screen deferred | ADR-012's own recommendation; `specs/README.md` row 022 |
| ☑ | Three primitives, not eight; a fourth needs a written reason | ADR-009, `design/component-inventory.md` |
| ☑ | Every primitive specified with **all** its states | `design/component-inventory.md`, *The states that matter* |
| ☑ | Components consume semantic tokens only; no invented token | DESIGN-BRIEF rules 2, 2b, 3 |
| ☑ | Native controls never inherit the host appearance | DESIGN-BRIEF rule 17 |
| ☑ | `color-scheme: light`; no dark mode | DESIGN-BRIEF rule 16 |
| ☑ | Colour never the only channel; every badge carries a label; red reserved | DESIGN-BRIEF rules 14, 15 |
| ☑ | Logical properties only; `dir="auto"` on user content and **not** on interface copy | ADR-007 §6, §8 |
| ☑ | Latin digits and the Gregorian calendar under `ar` | ADR-007 §7, BR-8.13 |
| ☑ | Per-locale leading; no cap-height trim for Arabic; tracking permanently 0 | `tokens.css` note 4, `design/design-tokens.md` |
| ☑ | No barrel files; route-level splitting only; `strict`; no `any`; no fetching outside a route | ADR-011 §4, §7 |
| ☑ | No global store, no component library, no Storybook | ADR-011, *deliberately not done* |
| ☑ | Motion ≤300ms on a working surface; `transform`/`opacity` only; `prefers-reduced-motion` honoured | `design/motion.md` |
| ☑ | The converge loader replaces the spinner | `design/brand.md` §2 |
| ☑ | Teal never carries state; green never carries brand | `design/brand.md` §4 |
| ☑ | Preview before build, with real tokens, real copy, all states, both languages | `design/preview-first-workflow.md`; `FE-006-10` |
| ☑ | Q-11 and Q-15 recorded with working assumptions rather than assumed resolved | `11-open-questions.md` |
| ☑ | No styling, layout, or snapshot tests | `docs/sdd/testing/test-strategy.md` |
| ☑ | Task IDs, lanes, and the Agent/Skill values match the map | `specs/README.md` |

### Where the blueprint contradicts itself, and what was chosen

Recorded here because a checklist that ticks "consistent with the blueprint" when the
blueprint disagrees with itself is the least useful line in the document.

| Value | The two answers | Chosen | Reasoning |
|---|---|---|---|
| Corner radius | ADR-009 "~8px, shipped app wins" vs `tokens.css` `--radius-sm: 4px` `(C)` | **4px** | `research.md` R-5, `spec.md` Q-A. The 8px was measured off a picture, which `tokens.css` note 1 forbids by name |
| Button height beside a field | `--button-height-md` 40 `(C)` vs `--field-height-md` 47 `(A)` | **40, and stop** | `research.md` R-6, `spec.md` Q-B. DESIGN-BRIEF rule 3: do not invent a token; the screen that needs the reconciliation owns it |
| Focus ring intensity | ADR-012 `--brand-ring` 22% vs `10-shared-patterns.md` "3px at 10%" | **22%, one token** | `research.md` R-7, `spec.md` Q-C. The ADR defines a token; the other is prose |
| Badge height | `--chip-height` 20 `(A)` vs `10-shared-patterns.md` "h22" | **20, from the token** | `research.md` R-7, `spec.md` Q-D |
| Label gap | `10-shared-patterns.md` "gap 7" vs the confirmed 8pt grid | **8** | Q-13 confirms the grid holds all the way up; 7 came from a measurement |
| Is the brand/fixed restructure done? | ADR-012's cost table says "already done"; `tokens.css` has no `--brand` token at all | **Not done — it is work in this feature** | `research.md` R-1. Reading the file settles it in thirty seconds; believing the ADR would have meant discovering it while wiring the first button |

## Gaps accepted, with reasons

| Gap | Reason |
|---|---|
| Five of the eight primitives are not built | Each arrives with the screen that needs it. `design/component-inventory.md`'s own definition of done: *"a primitive with no consumer is speculative work"* |
| `Toast` is excluded although `007` wants one | A toast is a system — portal, stack, per-item timer, manual-dismiss path for errors — not a component. `007` reports a mutation result inline until it exists |
| `--brand` is a static literal; tenant theming is not demonstrable end-to-end | `spec.md` Q-E. The architecture ships and is tested; the value is `022`'s. AC-25 proves the mechanism, and the honest claim is "the architecture makes this a settings screen rather than a rewrite", not "theming works" |
| Sidebar presets are specified upstream and not built | No sidebar exists until `008`. Three token sets with no consumer is the speculative work above, in a different costume |
| The Arabic typeface licence was **not** verified in this session | `research.md` R-11. No package was fetched and no `OFL.txt` was read. `design/icons.md` sets the rule — verify in the repository, do not take it on trust — and that verification is `FE-006-12`, not an assertion this document may make |
| No visual regression testing | `docs/sdd/testing/test-strategy.md` excludes styling, layout, and snapshots by name: they break on every change and catch nothing |
| The converge indicator's animation is not asserted | An animation's appearance is not assertable, and a test that only checks a class name is present tests the class name. What **is** asserted is that reduced motion stops it (AC-23), because that has a user consequence |
| The preview route has no tests | It is a development artifact. If it breaks, it breaks in front of the person using it |
| Contrast of the **disabled** state pairs is not required to reach 4.5:1 | Exempt under WCAG 1.4.3. The measured ratios are recorded in `tests.md` so the exemption is a decision rather than an oversight |
| Button does not reach the 44px AAA target size | It clears SC 2.5.8's 24px minimum. Recorded rather than claimed, because 40px is the inspected house value and changing it would diverge from the design for a level nothing in the requirements asks for |
| `Badge`'s twelve variants are a **product** decision this feature does not re-make | Already decided in `design/layout-patterns.md`, *Status colour semantics*. This feature cites it. Re-deciding it inside a component spec is how a mapping ends up in two places |
| This feature introduces zero i18n keys, so NFR-8's parity test has nothing to check here | `research.md` R-8. Every string arrives as a prop; the catalogues and the parity test are `007`'s. Stated so the absence is not read as an omission |
| No `read-only` `Input` state | Not in `component-inventory.md` and no screen needs one. Recorded so it is not later conflated with `disabled`, which is a different meaning |
| The task list is longer than the timebox | Deliberate. `tasks.md`'s drop order is fixed before the work starts, precisely so the cut is a decision rather than an accident at 6pm |

## Sign-off

| Gate | State |
|---|---|
| Specification reviewed by the product owner | **Pending** — this feature is awaiting approval before implementation |
| Q-11 (permission to reuse the house design assets) answered | **Pending.** A working assumption is in force and A-1 records what changes if it is wrong: one hex value plus a re-run of the contrast test |
| Q-15 (the Arabic typeface) answered | **Pending.** Working assumption `IBM Plex Sans Arabic`, labelled `(D)` — a decision being made here for the first time, not an inheritance |
| Plan names every file it will create or change | ☑ `plan.md`, *Frontend design* |
| At least one real alternative considered and rejected | ☑ `plan.md` — five, with mechanisms rather than preferences |
| Contract state recorded | ☑ `contracts/README.md` — no HTTP surface; the props tables in `frontend-spec.md` are frozen instead |
| Schema state recorded | ☑ `data-model.md` — no migration; `dotnet ef migrations list` unchanged |
| Tasks have an owner, a verification, and something they serve | ☑ `tasks.md` |
| The drop order is fixed before work starts | ☑ `tasks.md`, *Droppable if time runs short* — seven lines, in order |
| Not-droppable items each carry a reason | ☑ `tasks.md`, *Not droppable* — eight, each naming the defect it prevents |
