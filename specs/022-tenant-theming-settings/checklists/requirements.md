# 022 — Requirements Checklist

A check on the **specification**, not on the code. Run before `/speckit-plan` is trusted,
and again before the feature closes.

## Completeness

| ✓ | Item | Where |
|---|---|---|
| ☑ | Scope and out-of-scope are both explicit | `spec.md` |
| ☑ | Every excluded item names the feature or file that owns it instead | `spec.md`, Out of scope — eleven rows, each naming an owner or stating "nowhere, deliberately" with the reason |
| ☑ | The feature states which part of a partially-accepted ADR it is | `spec.md`, Understanding — ADR-012 is Accepted in part and this is the deferred part |
| ☑ | Assumptions are written down, each with what happens if it is wrong | `spec.md`, A-1 – A-6 |
| ☑ | Open questions carry a working assumption rather than blocking | `spec.md`, Q-A – Q-G |
| ☑ | Each of ADR-012's four hard parts has at least one acceptance criterion | Ramp/oklab → AC-13; computed foreground → AC-10, AC-11, AC-12; fixed tokens said in the UI → AC-16, AC-20; sidebar as a mode → AC-14, AC-15, AC-24 |
| ☑ | The no-flash constraint has its own criterion | AC-17, AC-18, AC-19 |
| ☑ | Every acceptance criterion is testable as written | `spec.md`, AC-1 – AC-27 |
| ☑ | Edge cases include failure and permission cases, not only happy variations | `spec.md`, Edge cases — `403`, `409`, both `400`s, corrupt cache, unsupported `color-mix` |
| ☑ | Referenced rules are cited by ID | `spec.md`, Rules referenced |
| ☑ | The data model states its migration name and its types in SQL Server terms | `data-model.md` — and records that `settings-and-uploads.md`'s types are PostgreSQL-era |
| ☑ | The contract names every status code and every `ProblemDetails` `type` | `contracts/theming-api.md` |
| ☑ | The plan names every file it creates or changes | `plan.md`, Backend design and Frontend design |
| ☑ | The plan records at least two real alternatives rejected with reasons | `plan.md` — five rejected, plus two accepted risks and one unresolved tension |

## Testability — the full AC → task map

| AC | Task |
|---|---|
| AC-1 | BE-022-04, TEST-022-04 |
| AC-2 | TEST-022-04 |
| AC-3 | BE-022-11, TEST-022-03 |
| AC-4 | BE-022-06, TEST-022-05 |
| AC-5 | BE-022-06, FE-022-08, TEST-022-07 |
| AC-6 | BE-022-08, TEST-022-08 |
| AC-7 | BE-022-01, TEST-022-02 |
| AC-8 | BE-022-07, BE-022-10, TEST-022-06, TEST-022-09 |
| AC-9 | TEST-022-01 |
| AC-10 | BE-022-02, TEST-022-01 |
| AC-11 | TEST-022-01 |
| AC-12 | BE-022-07, TEST-022-06, REV-022-03 |
| AC-13 | BE-022-02, TEST-022-06 |
| AC-14 | BE-022-06, FE-022-06, TEST-022-10 |
| AC-15 | FE-022-06, TEST-022-15 |
| AC-16 | FE-022-06, TEST-022-13 |
| AC-17 | FE-022-02, FE-022-03, TEST-022-14 |
| AC-18 | FE-022-03, TEST-022-14 |
| AC-19 | FE-022-02, DOC-022-04 |
| AC-20 | FE-022-00, FE-022-06, DOC-022-01 |
| AC-21 | FE-022-05, TEST-022-16 |
| AC-22 | FE-022-05 |
| AC-23 | FE-022-02, TEST-022-16 |
| AC-24 | FE-022-06, TEST-022-15 |
| AC-25 | BE-022-04, TEST-022-12 |
| AC-26 | BE-022-09, TEST-022-11 |
| AC-27 | BE-022-10, FE-022-07, TEST-022-17 |

| ✓ | Item | Note |
|---|---|---|
| ☑ | Every AC maps to at least one task | Table above — 27 criteria, no gaps |
| ☑ | Every task serves an AC or a named rule | `tasks.md`, Serves column. No task serves nothing |
| ☑ | No AC needs a follow-up question to turn into a test | Each names a command, a `curl`, a query, or a `performance` entry to read |
| ☑ | Nothing is verified by "it works" | Every `Verified by` cell is a command, a query, or an observation someone else could repeat |
| ☑ | The silent failures each have their own criterion | AC-11 (a fixture that never refuses), AC-13 (hover contrast), AC-16 (a status colour drifting), AC-17 (a `useEffect` that passes everything else), AC-24 (a light scrollbar on a dark sidebar), AC-25 (a second settings row) |
| ☑ | The AC that catches an otherwise-passing implementation is named as such | AC-17, in `spec.md` and again in `tasks.md`'s not-droppable list |
| ☑ | The band arithmetic is verified by recomputation, not by a hard-coded number | AC-9. `research.md` states its own figures are hand-derived and not the specification |

## Consistency with the blueprint

| ✓ | Item | Source |
|---|---|---|
| ☑ | The feature is the deferred half of a partially-accepted decision, and says so | ADR-012, Status and Recommendation |
| ☑ | The ramp is derived in oklab, not HSL, and is not re-derived on the wire | ADR-012 part 1, `design/theming.md`, `research.md` R-6 |
| ☑ | The foreground is computed from relative luminance against two candidates | ADR-012 part 2, `design/theming.md` |
| ☑ | Status, priority, and neutral tokens are excluded permanently and the UI says so | ADR-012 part 3, `DESIGN-BRIEF.md` rule 2b |
| ☑ | The sidebar is three presets, never a colour picker | ADR-012 part 4 |
| ☑ | The theme reaches `:root` before first paint, from the auth response or a pre-paint read | ADR-012, `design/theming.md`, and the precedent in `screens/02-app-shell.md` |
| ☑ | Every ADR-012 exclusion is repeated as an exclusion here | Per-user theming, custom palettes, dark mode, themeable status colours, the logo |
| ☑ | The logo is excluded and its owner named, with the Release-2-or-later note | `design/settings-and-uploads.md` |
| ☑ | Types are SQL Server types; the PostgreSQL leftovers were translated, not copied | ADR-013, `research.md` R-7 |
| ☑ | The concurrency token is `rowversion`, exposed as `expectedVersion`, `409` on mismatch | ADR-006 as amended by ADR-013 |
| ☑ | Errors are `ProblemDetails` from the shared middleware; `200` never carries an error | Constitution IV, `05-api-conventions.md` |
| ☑ | `type`, `errors` keys, enum values, and the ratio numbers are never localized | BR-8.7 |
| ☑ | The state change writes one in-transaction audit row; the denial writes one outside | BR-9.1, BR-9.3, BR-9.4, BR-9.8 |
| ☑ | Fetching at route level only; no global store; the theme is CSS, not React state | ADR-011 §4, decision 1 |
| ☑ | The rule lives in the domain once; the client mirrors and is never the authority | Constitution III, ADR-003 |
| ☑ | `TimeProvider` injected; `CancellationToken` on every async path | Constitution V, `09-definition-of-done.md` |
| ☑ | Middleware order untouched, and this feature is a witness to it | ADR-007, `research.md` R-11 |
| ☑ | No new abstraction: no `IThemeProvider`, no `IRepository`, no palette table | Constitution, "no new abstraction without a second implementation" |
| ☐ | BR-6's matrix carries a "Change branding" row | **Not yet** — it has no such row. `DOC-022-02` adds it; the Manager rule currently exists only in `design/settings-and-uploads.md` |
| ☐ | The endpoint inventory in `05-api-conventions.md` lists these two endpoints | **Not yet** — `DOC-022-03` |
| ☐ | ADR-012 records the surface-contrast gate | **Not yet, and it is an addition rather than an implementation.** Q-E, `REV-022-03`. AC-12 is labelled as resting on it |

## Gaps accepted, with reasons

| Gap | Reason |
|---|---|
| The `@supports` fallback for a browser without `color-mix(in oklab, …)` is not tested here | The ramp is `006`'s stylesheet. Testing a fallback this feature did not write would mean owning it in two places. `REV-022-02` raises it where it belongs (`research.md` R-4) |
| Whether the ramp *looks* right is not asserted | An aesthetic judgement. It belongs to the Phase 3b preview (`FE-022-00`, `design/preview-first-workflow.md`), and an assertion would encode one browser's rounding as a requirement |
| The sign-in screen is not branded | Q-A. ADR-005's blanket auth rule outranks a cosmetic gain on one screen. Stated, not discovered |
| A stale brand can paint for one frame on a device where the colour was changed elsewhere | AC-19. The alternative is blocking first paint on a fetch, which trades a one-frame colour change for a blank screen on every load (`plan.md`, rejected alternatives) |
| The refusal set is wider than a tenant will expect — orange and amber brands are refused | Q-F. ADR-012 authorises refusal; the better answer is a derived darkened action colour and it belongs to `006`'s ramp. Recorded rather than resolved inside a settings screen |
| No load or performance verification | No stated requirement. The read is one row and the write is one row |
| `localStorage` itself is untested | Testing the platform |
| The logo's absence leaves the screen thinner than the house platform's Branding page | Deliberate. `settings-and-uploads.md` puts the logo later than this feature, and `DOC-022-01` records the screen as it was actually built |

## Sign-off

| Gate | State |
|---|---|
| Specification reviewed by the product owner | **Pending** — and two questions need an answer before implementation, not after: Q-E (the surface gate) and Q-F (the width of the refusal set) |
| `006-design-system` has shipped the brand token layer | **Unverified — the blocking dependency.** `REV-022-01`. Today `docs/sdd/design/tokens.css` has no `--brand` and points `--action-primary-bg` at a primitive (`research.md` R-1) |
| Plan names every file it will create | ☑ `plan.md` |
| Contract frozen | ☑ `contracts/theming-api.md` |
| Tasks have an owner, a verification, and something they serve | ☑ `tasks.md` |
| Frontend can start without the backend | ☑ `FRONTEND-API-GUIDE.md`, subject to `REV-022-01` |
