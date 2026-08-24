# 005 — Task Breakdown

**Phase:** 0 · **Role:** Story Planner · **Skill:** `speckit-tasks`

Every task has one owner, one verification, and something it serves. A task that cannot be
verified on its own is too big and is split. **Verified by** is a command or an
observation, never "it works".

Agents named here are **not dispatched until the plan is approved**. Naming is the plan;
dispatching without recording the result in `ai-notes.md` is what turns evidence into a
claim.

## Critical path

```text
BE-005-01 → BE-005-03 → BE-005-04 → BE-005-05 → BE-005-06 → TEST-005-01 → TEST-005-07
```

`BE-005-06` is the one line of this feature that ADR-007 says is most likely to be wrong,
and `TEST-005-01` is the only observation that can tell whether it is. Everything else
hardens what those two establish.

The frontend path is independent and can run in parallel from the first day:

```text
FE-005-01 → FE-005-02 → FE-005-03 → FE-005-09 → TEST-005-11
```

## Backend

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| BE-005-01 | `SharedResource.cs` (marker type, no members), `SharedResource.resx` with the eight keys in the contract, and `[assembly: NeutralResourcesLanguage("en")]` in `AssemblyInfo.cs` | 001 | `dotnet build`; the generated `SharedResource.resources` appears in the assembly's manifest resource names (`dotnet-ildasm` or a one-line reflection test) | AC-15, AC-16 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-005-02 | `SharedResource.ar.resx` with the same seven keys, Arabic values, `Diagnostics.FallbackProbe` deliberately absent | BE-005-01 | Open both files side by side; the parity test in TEST-005-10 is the real check | AC-14, BR-8.11 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-005-03 | `AddLocalization()` registered with **no** `ResourcesPath`; `SupportedLocales.cs` reading `Localization:DefaultCulture` and `Localization:SupportedCultures`; the section added to `appsettings.json` | BE-005-01 | `IStringLocalizer<SharedResource>` resolved from DI in a test returns the English sentence for `Error.Validation.Title`, with `ResourceNotFound == false` | AC-16, AC-19, NFR-9 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-005-04 | `LocalizationClaims.cs` and `PreferredLanguageCultureProvider.cs`: returns `null` when unauthenticated or when the claim is blank; never validates the value itself | BE-005-03 | Unit test over the provider with four `ClaimsPrincipal` shapes: authenticated+`ar`, authenticated+blank, authenticated+`de`, anonymous | AC-5, BR-8.4 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` + `superpowers:test-driven-development` |
| BE-005-05 | `LocalizationRegistration.cs`: `RequestCultureProviders.Clear()` then query string, claim, `Accept-Language`; `DefaultRequestCulture = en`; `ApplyCurrentCultureToResponseHeaders = true` | BE-005-04 | `IOptions<RequestLocalizationOptions>` resolved from the test host: the list has exactly three entries in that order and contains no `CookieRequestCultureProvider` | AC-3, AC-11 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-005-06 | `Program.cs` pipeline: `UseAuthentication()` → `UseWaslLocalization()` → `UseAuthorization()`, in that order, with the ADR-007 reference in a comment | BE-005-05, 004 | TEST-005-01 and TEST-005-02. Nothing else can tell | AC-1, AC-2, AC-12 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-005-07 | `002`'s `ProblemDetails` mapper takes `IStringLocalizer<SharedResource>`; the seven generic titles resolve from keys instead of literals; `type`, `errors` keys, and `traceId` untouched | BE-005-03, 002 | `git grep -n "One or more validation errors"` under `src/` returns only the `.resx` | AC-13, BR-8.6 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-005-08 | CI runs the frontend job (`npm run lint`, `npm run test`) and the container-free localization tests; both are required checks | FE-005-09, TEST-005-10 | A green run on push, and a red run on the deliberate divergence in TEST-005-23 | AC-32, NFR-8 | `voltagent-lang:dotnet-core-expert` | — |

## Frontend

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| FE-005-01 | `src/wasl-web/` scaffold: `package.json`, `vite.config.ts`, `tsconfig.json` (strict, no `any`), `index.html`, `main.tsx`, `App.tsx` containing no copy | `spec.md` Q-B answered | `npm run build` succeeds; `npm run dev` serves a page | Q-B, prerequisite | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-005-02 | `lib/i18n/index.ts`: static catalogue imports, `fallbackLng: 'en'`, `returnEmptyString: false`, **no** `compatibilityJSON`, initialised in `main.tsx` before `render` | FE-005-01 | TEST-005-19 (plural categories) and TEST-005-12 (missing-key fallback) both pass | AC-21, AC-29 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-005-03 | `locales/en/common.json` and `locales/ar/common.json` with the eleven keys in `frontend-spec.md`, identical key sets | FE-005-02 | TEST-005-12 | AC-28, BR-8.11 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-005-04 | `LocaleProvider.tsx` and `useLocale.ts` writing `lang` and `dir` on `<html>`; switching back leaves no residual attribute | FE-005-02 | TEST-005-14 | AC-20, FR-5.4 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-005-05 | `formatters.ts` (`ar-u-ca-gregory-nu-latn`, the only place an `Intl` formatter is constructed) and `cldr.ts` (the six category names, one source) | FE-005-02 | TEST-005-20 | AC-26, AC-27, BR-8.13 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-005-06 | `components/UserText.tsx` rendering `dir="auto"`, with a comment naming ADR-007 decision 8 | FE-005-01 | TEST-005-21 | AC-30, BR-8.10 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-005-07 | `lib/api/client.ts`: `Accept-Language` from the active locale on every request; `Content-Language` read back; dev-only warning on a mismatch | FE-005-04 | TEST-005-22 | AC-31 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-005-08 | The catalogue parity checker: **stem-aware**, reducing CLDR plural suffixes to a stem and requiring the category set valid for each locale (two for `en`, six for `ar`); empty string counts as absent | FE-005-03 | Run it against a catalogue with a correct `ar` plural — it must report **no** divergence (`research.md` R-9) | AC-28 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-005-09 | `eslint.config.js`: `react/jsx-no-literals` with its allow-list, the `no-restricted-syntax` selectors for concatenation, and the `Intl`/`toLocale*` ban with an override for `formatters.ts` | FE-005-01 | TEST-005-11 | AC-22, AC-23, AC-25 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-005-10 | `.stylelintrc.json` banning physical properties and `text-align: left\|right` | FE-005-01 | TEST-005-11 | AC-24, ADR-007 §6 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-005-11 | `tests/lint-fixtures/` — four files, each violating exactly one rule, excluded from the build | FE-005-09, FE-005-10 | Each file, linted alone, exits non-zero with the expected rule id | AC-22 – AC-25 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |

## Tests

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| TEST-005-01 | **The ordering proof.** Token with claim `ar` + header `Accept-Language: en` returns an Arabic body and `Content-Language: ar`. The token is minted inside the test, so this does not wait on `004` | BE-005-06 | Test run. Then move `UseWaslLocalization()` above `UseAuthentication()` and watch it go red — recorded in `tests.md` | AC-1, ADR-007 §4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-005-02 | Source guard: `Program.cs` line indices of `UseAuthentication` < `UseRequestLocalization` < `UseAuthorization`, with a failure message citing ADR-007 decision 4 | BE-005-06 | Reorder the two lines, watch it go red, restore | AC-2 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-005-03 | The configured provider list is exactly three entries in order, and asserts `CookieRequestCultureProvider` is absent **by type name** | BE-005-05 | Test run over `IOptions<RequestLocalizationOptions>` — no container needed | AC-3 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-005-04 | Resolution matrix: `?culture=` beats claim beats header beats default, as a four-case theory | BE-005-06 | Test run | AC-4 – AC-7, BR-8.4, BR-8.5 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-005-05 | `ar-EG` and `?culture=ar-SA` → `ar` with `200`; `fr` → `en` with **`200`**; `!!!`, `;q=`, `?culture=` empty, claim `de`, claim `AR`, claim `""` all fall through without a `400` | BE-005-06 | Test run, one case per row of the edge-case table | AC-8, AC-9, AC-10, BR-8.2, BR-8.3 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-005-06 | Resolving a culture issues **zero** database commands, asserted with an EF Core command interceptor in the test host | BE-005-06 | Test run | ADR-007 §4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-005-07 | `Content-Language` present and correct on `200`, `400`, `401`, `403`, `404`, `409`, `500`, using test-only probe endpoints registered by the test host and **never** by `Program.cs` | BE-005-05, BE-005-07 | Test run, one case per status code | AC-11 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-005-08 | A `401` and a `403` carry `Content-Language` and an Arabic `title` under `Accept-Language: ar` | BE-005-06, BE-005-07 | Test run. Move localization after `UseAuthorization()` and watch only these two go red | AC-12 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-005-09 | The same request in `en` and `ar`: `type`, every `errors` **key**, every enum value, `traceId`, and `TicketNumber` byte-identical; `title`, `detail`, and `errors` **values** different | BE-005-07 | Test run diffing two response bodies | AC-13, BR-8.7 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-005-10 | Resource parity: every key in `SharedResource.resx` is in `SharedResource.ar.resx` and vice versa, empty values count as absent, `Diagnostics.FallbackProbe` is the one named exemption; plus `ResourceNotFound == false` for every key in both cultures. **No database fixture** | BE-005-02 | Delete one `ar` entry, watch the build fail, restore. Runs with Docker stopped | AC-14, AC-16, NFR-8 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-005-11 | ESLint and Stylelint each exit non-zero on their fixture, with the expected rule id in the output | FE-005-11 | `npx eslint tests/lint-fixtures/*.tsx; echo $?` — non-zero, with the rule named | AC-22 – AC-25 | `voltagent-qa-sec:test-automator` | `superpowers:verification-before-completion` |
| TEST-005-12 | Client catalogue parity fails the build on a divergence; a key missing from both catalogues renders the English fallback, never the raw key; an empty value does not render as blank | FE-005-08 | Delete one `ar` key, `npm run test` goes red, restore | AC-28, AC-29, BR-8.12 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-005-13 | This feature adds no migration | BE-005-07 | `dotnet ef migrations list` output identical before and after the feature's commits, pasted into `tests.md` | `data-model.md` | `voltagent-lang:sql-pro` | — |
| TEST-005-14 | `<html lang>` and `<html dir>` follow the locale, and switching back leaves no residual attribute | FE-005-04 | Vitest with `@testing-library/react`, asserting on `document.documentElement` | AC-20, FR-5.4 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-005-15 | `Diagnostics.FallbackProbe` requested under `ar` returns the **English sentence**, not the key | BE-005-02 | Test run | AC-15, BR-8.12 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-005-16 | `CultureInfo.GetCultureInfo("ar").Name == "ar"` and the Arabic name of month 8 is Arabic text. **No database fixture** | 001 | Test run. Set `InvariantGlobalization=true` locally, watch it go red, revert | AC-17 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-005-17 | A request under `Accept-Language: ar` that logs a warning writes it in **English**, captured by a test `ILoggerProvider` | BE-005-07 | Test run | AC-18, BR-8.9 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-005-18 | A test host configured with `en`, `ar`, `fr` answers `?culture=fr` with `Content-Language: fr` and English text — **no code change** | BE-005-03 | Test run with configuration overridden in the factory | AC-19, NFR-9 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-005-19 | Counts 0, 1, 2, 3, 11, 100 select `zero`, `one`, `two`, `few`, `many`, `other` in `ar`, using a resource bundle defined inside the test | FE-005-02 | `npm run test`. Add `compatibilityJSON: 'v3'` and watch it go red | AC-21, BR-8.14 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-005-20 | `formatDate`/`formatNumber` under `ar` contain no character in `U+0660–U+0669` or `U+06F0–U+06F9`; `2026-08-23` renders as the Gregorian date; `TCK-2026-000042` is byte-identical in both locales | FE-005-05 | `npm run test` with a regex assertion on the output | AC-26, AC-27, BR-8.13 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-005-21 | `UserText` renders `dir="auto"`; Arabic inside an `ltr` document and English inside an `rtl` document each resolve their own direction | FE-005-06 | Vitest assertion on the rendered attribute | AC-30, BR-8.10 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-005-22 | Every request from `client.ts` carries `Accept-Language` matching the active locale; a mismatched `Content-Language` warns in development only | FE-005-07 | Vitest with a stubbed `fetch`, asserting the outgoing header and the captured warning | AC-31 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-005-23 | A deliberate catalogue divergence — one on each side — fails the CI pipeline, **observed on a real run**, then reverted | BE-005-08, TEST-005-10, TEST-005-12 | Two commits, two red runs, the job URLs recorded in `tests.md` | AC-32, NFR-8 | `voltagent-qa-sec:test-automator` | `superpowers:verification-before-completion` |

## Documentation

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| DOC-005-01 | `contracts/localization-contract.md` frozen, and `FRONTEND-API-GUIDE.md` handed to the frontend lane before either lane starts | — | Both files exist and the frontend lane confirms it can start without the backend | Contract gate | main session | `speckit-specify` |
| DOC-005-02 | "How to add a translated string" written for what was actually built: the two commands that run the parity tests, and the two file paths | BE-005-02, FE-005-03 | Follow it to add one throwaway key on each side, then remove it | DoD, NFR-8 | main session | — |
| DOC-005-03 | `docs/sdd/documentation/development/localization.md` corrected: the `.resx` path is `Wasl.Api/Common/Localization/`, not `Wasl.Application/Resources/`, and the English catalogue is the neutral file. **Touches a blueprint file — needs product-owner sign-off** | BE-005-01 | The path in the doc opens to a real file | `research.md` R-1, R-3 | main session | — |
| DOC-005-04 | The `preferred_language` claim raised as a **written requirement against `004`'s spec**, with the name, the two legal values, and the reason (ADR-007 §4). Not assumed | BE-005-04 | The requirement appears in `004`'s spec or its open questions before `004` closes | `spec.md` A-1, Q-A | main session | — |
| DOC-005-05 | `tests.md` and `ai-notes.md` completed with **observed** output; board and delivery log updated | All | The `verify-story` gate | DoD | main session | `verify-story` |

## Review

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| REV-005-01 | Reviewed: pipeline order, `ResourcesPath` unset, the provider list, no identifier anywhere passing through a localizer or a formatter, no localized string reaching a logger | All BE, all TEST | `review.md` verdict is `Approved` | DoD | `comprehensive-review:code-reviewer` | `code-review:code-review` |
| REV-005-02 | Accessibility pass on what exists: `lang` and `dir` on the document root, `UserText`, and the visually-hidden skip link being a key rather than a literal | FE-005-06 | Findings written down, including "nothing found" | FR-5.4, DoD | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |
| REV-005-03 | Generated OpenAPI compared against `contracts/localization-contract.md`; `Content-Language` documented as a response header on **every** operation | BE-005-05, TEST-005-07 | Any difference fixed in one of the two before closing | DoD | main session | — |
| REV-005-04 | Security review: `?culture=` cannot select anything outside the supported list; no resource key or culture value is reflected into a response body unescaped | BE-005-05 | `review.md` records the two checks and their result | `spec.md` Q-F | `comprehensive-review:security-auditor` | `code-review:code-review` |

## Droppable if time runs short

| Task | What is lost |
|---|---|
| TEST-005-18 (third culture by configuration) | The **proof** of NFR-9. The mechanism still reads configuration; what is lost is the evidence that it does, which matters only when someone adds a third locale. Drop first |
| TEST-005-13 (no migration added) | A negative claim about the diff. A reviewer can see the diff. Cheapest thing here |
| TEST-005-06 (zero database commands) | The proof of ADR-007 decision 4's stated benefit. The claim moves from tested to asserted, and would be worth re-adding the day someone is tempted to look the language up from the user row |
| The `?culture=ar-SA` half of TEST-005-05 | One redundant case: `ar-EG` already proves parent-culture fallback. Keep the `fr` and malformed cases — those are BR-8.3 and the never-a-`400` rule |
| REV-005-04 | A security pass over a feature whose entire attack surface is choosing between two supported locales (`spec.md` Q-F). Drop before dropping any test |

## Not droppable

**BE-005-06, TEST-005-01, TEST-005-02.** ADR-007 names the middleware ordering as the
single most likely defect in this piece of work, and it fails **silently** — the
application simply serves everyone the language their browser guessed, forever, with no
error anywhere. Without TEST-005-01 nothing distinguishes the correct pipeline from the
default template's, and without TEST-005-02 nothing catches a reordering later.

**TEST-005-10 and FE-005-08/TEST-005-12.** Without the two parity tests, BR-8.11 is a
convention, and ADR-007's consequences section says it out loud: *"the key-parity test must
run in CI. Without it, this decision degrades into a convention, and conventions are not
enforced."*

**FE-005-09 and FE-005-10.** The bans on literal strings, concatenated counts, and physical
CSS properties are worth exactly as much as their enforcement. Every screen from `006`
onward is written against these rules; adding them after seven screens is the retrofit this
whole feature's ordering exists to avoid.

**BE-005-01 with the neutral English catalogue.** Getting the file names wrong here —
`.en.resx` instead of the neutral `.resx` — means every missing Arabic key renders as a raw
symbolic key in front of a user, and BR-8.12 is silently unimplementable
(`research.md` R-3).

**TEST-005-11.** A lint rule nobody has watched fail may be misconfigured, and a
misconfigured lint rule is worse than no rule, because it is believed.
