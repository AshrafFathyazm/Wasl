# 006 — Task Breakdown

**Phase:** 0 · **Role:** Story Planner · **Skill:** `speckit-tasks` ·
**Timebox:** one day, hard stop (ADR-009)

Every task has one owner, one verification, and something it serves. A task that cannot
be verified on its own is too big and is split.

Agents named here are **not dispatched until the plan is approved**. Naming is the plan;
dispatching without recording the result in `ai-notes.md` is what turns evidence into a
claim.

**This list is longer than one day.** That is deliberate and it is the point of the
*Droppable* section: the drop order is fixed now, while nobody is attached to the work.
The critical path below is what one day must produce.

## Critical path

```text
FE-006-01 → FE-006-02 → FE-006-03 → FE-006-04 → FE-006-06 → FE-006-07 → FE-006-10
```

Scaffold, tokens, the brand/fixed split, the computed foreground, the element floor, one
primitive, and something to look at it in. Everything else hardens it. If the day ends
here the feature is honest and complete at what it claims.

## Backend

**None.** No `.cs` file, no migration, no endpoint. See
[`plan.md`](plan.md) *Backend design*, [`data-model.md`](data-model.md), and
[`contracts/README.md`](contracts/README.md).

Recorded rather than omitted so the empty lane is visibly a decision. No `BE-006-*` task
exists.

## Frontend

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| FE-006-01 | `src/wasl-web` scaffolded — Vite, React 18, TS `strict`, flat ESLint config, stylelint. The template's `index.css`, `App.css`, counter demo, and assets are **deleted** | — | `npm ci && npm run build` with zero TS errors and zero ESLint warnings; `git grep -nE "#[0-9a-fA-F]{3,8}" src/wasl-web/src --include=*.css` returns matches only under `src/styles/` | AC-1 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-006-02 | `src/styles/tokens.css` adopted from `docs/sdd/design/tokens.css`, every custom property carrying an `(A)`/`(B)`/`(C)`/`(D)` label; `--badge-dot-size: 7px` `(D)` added to the COMPONENTS block | FE-006-01 | `node scripts/check-token-provenance.mjs` exits 0; `node scripts/check-token-drift.mjs` exits 0 after deliberately changing one `(A)` value and watching it exit 1 | AC-4 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-006-03 | `src/styles/theme.css`: `--brand` `(D)`, the five oklab derivations plus the two danger derivations, each declared **twice** — static hex then `color-mix()`. `color-scheme: light` on the root | FE-006-02 | `getComputedStyle(document.documentElement).getPropertyValue('--brand-hover')` returns a parsed colour, not the literal `color-mix(...)` string | AC-8, ADR-012 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-006-04 | `lib/theme/contrast.ts` and `lib/theme/onBrand.ts`: relative luminance, contrast ratio, the computed foreground, and the refusal when neither candidate reaches 4.5:1 | FE-006-01 | `npm run test -- onBrand` green against the ≥12-colour fixture | AC-6, AC-7 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-006-05 | `lib/theme/applyTheme.ts`, plus the inline pre-paint script in `index.html` calling the same logic. **Not** a `useEffect` | FE-006-04 | `--brand` and `--on-brand` are set on `:root` at the first paint frame; no frame renders with the default brand | AC-25 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-006-06 | `src/styles/base.css`: `button`/`input`/`select`/`textarea` with `background-color`, `color`, and `-webkit-text-fill-color` all `!important`; `box-sizing`; the global `prefers-reduced-motion` block from `design/motion.md` | FE-006-02 | Render the preview page with the host browser in dark mode — every control keeps its intended colours. `npm run lint:css` fails on a control rule set missing any of the three declarations | AC-14, AC-23, DESIGN-BRIEF 17 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-006-07 | `Button` — all 18 type × state cells, `iconStart`/`iconEnd`, `withText`, the width-invariant loading state, the converge indicator at reduced travel | FE-006-03, FE-006-06 | Every cell visible on `/_preview`; `npm run test -- Button` green | AC-9, AC-10, AC-11 | `voltagent-lang:react-specialist` | `frontend-design` + `superpowers:test-driven-development` |
| FE-006-08 | `Input` — all 7 states at 3 sizes, `multiline`, label/helper/error with the error **replacing** the helper, `aria-invalid` + `aria-describedby`, `dir="auto"` on the control | FE-006-06 | Every state visible on `/_preview`; `npm run test -- Input` green | AC-12, AC-13 | `voltagent-lang:react-specialist` | `frontend-design` + `superpowers:test-driven-development` |
| FE-006-09 | `Badge` — 12 variants plus the unknown-value fallback; `statusTokens.ts` exporting the map keyed on **raw enum values**; `escalated` renders a visually-hidden label rather than relying on `title` | FE-006-02 | Every variant visible on `/_preview`; `npm run test -- Badge` green | AC-15, AC-16 | `voltagent-lang:react-specialist` | `frontend-design` + `superpowers:test-driven-development` |
| FE-006-10 | `/_preview` route: every state of all three primitives, a `dir` toggle, a `lang` toggle, a greyscale toggle, a brand-colour input calling `applyTheme()`, the type scale in both families, and every semantic token as a labelled swatch | FE-006-07 | Open it; every cell in `frontend-spec.md` §6's region table is present | AC-9, AC-12, AC-15, Q-G | `ui-ux-pro-max:ui-styling` | `frontend-design` |
| FE-006-11 | `routes.tsx` with `lazy()` on every element; `/_preview` excluded from production builds by a build-time condition, not a comment | FE-006-01 | `ls dist/assets` shows one entry chunk plus one chunk per route and no more; a production build contains no `PreviewPage` chunk | AC-2 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-006-12 | Both font families self-hosted as `woff2` in `public/fonts` at weights 400/500/700; `src/styles/locale.css` with the `[lang="ar"]` leading block, tracking 0, and no cap-height trim. The licence file in each distributed package is **read** before shipping | FE-006-02 | `npm run build` succeeds with the network unavailable; the licence path and terms are recorded in `ai-notes.md` | AC-22, Q-15, Q-H, NFR-7 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-006-13 | The five enforcement scripts in `scripts/`, wired to `npm run lint:tokens`, plus the stylelint rules for physical properties and the ESLint `no-restricted-syntax` rule on `JSXText` under `components/` | FE-006-02 | Introduce one violation of each rule deliberately, watch each script exit non-zero and name the file and line, then remove it | AC-3, AC-4, AC-17, AC-18, AC-19, AC-24 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-006-14 | `.github/workflows/ci.yml` gains a `web` job: `npm ci`, `npm run lint`, `npm run lint:css`, `npm run lint:tokens`, `npm run test`, `npm run build` | FE-006-13 | A green run visible on the first push, and a red one when a violation is pushed deliberately | AC-1, AC-3, AC-14, AC-17–19, AC-24 | `voltagent-lang:react-specialist` | — |

## Tests

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| TEST-006-01 | `onBrand` returns a foreground reaching ≥4.5:1 for every colour in a fixture of at least twelve, **including** a light yellow, a pale mint, and a near-white grey | FE-006-04 | Test run. Replace `onBrand` with a hard-coded `'#FFFFFF'` and watch the pale cases go red | AC-6 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-006-02 | A brand colour reaching 4.5:1 against neither candidate is refused with a named reason, not given a foreground anyway | FE-006-04 | Test run | AC-7 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-006-03 | Changing `--brand` changes **no** fixed token: every `--state-*`, neutral, `--text-*`, `--border-*`, and `--surface-*` computed value is identical before and after | FE-006-03 | Test run. Point one `--state-*` token at `--brand` deliberately and watch it go red | AC-5, ADR-012 §3 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-006-04 | `--brand-hover` and the other four derivations resolve to parsed colours, not to the literal `color-mix(...)` string and not to empty | FE-006-03 | Test run | AC-8 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-006-05 | A `Button` with `withText={false}` and no `aria-label` throws in development and fails a test | FE-006-07 | Test run | AC-11 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-006-06 | A `Button`'s rendered width is unchanged between default and loading; `loading` implies `disabled`, so two clicks fire one handler | FE-006-07 | Test run measuring the element's width in both states | AC-10 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-006-07 | `Input`: the error **replaces** the helper; `aria-invalid="true"` in the error state; the control is queryable **by accessible description**, never by class name | FE-006-08 | Test run | AC-12, AC-13 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-006-08 | `Badge`: an unknown status value renders neutral tokens with the **raw value** as its label; every variant renders a label; omitting `label` is a TypeScript error | FE-006-09 | Test run, plus `npx tsc --noEmit` on a fixture that omits `label` | AC-15 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-006-09 | With `--brand` set to an unmissable colour, no `Badge` variant's computed background, colour, or border equals it | FE-006-09 | Test run | AC-16 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-006-10 | `--brand` and `--on-brand` are present on `:root` at the first paint frame | FE-006-05 | Test run, or an observation recorded with the method used | AC-25 | `voltagent-qa-sec:test-automator` | `superpowers:verification-before-completion` |
| TEST-006-11 | Under `prefers-reduced-motion: reduce`, every transition in the three primitives resolves to ≈0 and the loading indicator is static | FE-006-06, FE-006-07 | Test run with the media query emulated | AC-23 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-006-12 | Each of the six repository gates fails on a deliberately introduced violation and passes once it is removed, naming the file and line each time | FE-006-13 | Six deliberate violations, six non-zero exits, recorded in `tests.md` | AC-3, AC-4, AC-14, AC-17, AC-18, AC-19, AC-24 | `voltagent-qa-sec:test-automator` | `superpowers:verification-before-completion` |
| TEST-006-13 | The manual pass, recorded in `tests.md`: every state of all three primitives at `dir="rtl"` with Arabic copy; Arabic not clipped (ث ض above cap height, final ي ج ع below the baseline); the dark-host render; the greyscale render; a keyboard walk confirming a visible focus ring on every interactive element; the measured contrast ratio of every enabled state pair | FE-006-10 | The findings written down. **Not** "it works" — a list of what was looked at and what was found | AC-14, AC-20, AC-21, AC-22 | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |

## Documentation

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| DOC-006-01 | `frontend.md`: the eight `(D)` decisions taken in this feature, each with its reason and the alternative rejected — the disabled treatment, the secondary hover tint, the ring mechanism, `iconStart`/`iconEnd`, the `escalated` visually-hidden label, the `internal` variant, `--badge-dot-size`, and the two danger derivations | FE-006-09 | Read against `frontend-spec.md`'s *Decisions taken here* tables; every `(D)` in the code appears in one of them | ADR-009, DESIGN-BRIEF | main session | — |
| DOC-006-02 | The **divergence register**: every place this feature departs from a blueprint document, with which document, which value, and why. Radius (Q-A), Button vs field height (Q-B), the ring percentage (Q-C), badge height (Q-D), the label gap of 8 rather than 7, `escalated`'s label, the upstream `left`/`right` prop rename, and ADR-012's "restructure already done" being false | FE-006-09 | A reviewer can go from any of the four contradicting documents to the reasoning without asking | `research.md` R-1, R-5, R-6, R-7 | main session | — |
| DOC-006-03 | `tests.md` and `ai-notes.md` completed with **observed** output; the board and the delivery log updated; the timebox outcome recorded — what shipped, what was dropped, and against which line of the drop order | All | The `verify-story` gate | DoD | main session | `verify-story` |

## Review

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| REV-006-01 | Code review: component boundaries per ADR-011 §4, no fetching anywhere, no barrel files, no `any`, the props tables matching the built signatures. Verdict recorded | All FE, all TEST | `review.md` verdict is `Approved` | DoD | `comprehensive-review:code-reviewer` | `code-review:code-review` |
| REV-006-02 | **Token discipline review**, specifically and separately: every token reference in `src/components/` is semantic; the brand/fixed split is intact; no status colour is themeable; every token carries a provenance label | FE-006-09, FE-006-13 | Reviewed by hand **as well as** by script. The scripts catch a primitive token by name; only a reader catches a *semantic* token used for the wrong meaning — a status colour standing in for a brand one passes every gate here | AC-5, AC-16, AC-18 | `comprehensive-review:code-reviewer` | `code-review:code-review` |
| REV-006-03 | The timebox call: at the stop, record what shipped, what was dropped, and which line of the drop order was reached. A feature that quietly ran to two days is worse evidence than one that stopped and said so | All | An entry in `summary.md` and `docs/sdd/12-delivery-log.md` | ADR-009 | main session | — |

## Droppable if time runs short

The drop order is fixed **now**, in this order, while nobody is attached to the work.
Each line degrades to a token-styled native element that looks intentional; none leaves a
half-built control in the product (ADR-009).

| # | Task | What is lost |
|---|---|---|
| 1 | `Badge`'s `escalated` and `internal` variants (part of FE-006-09) | Two of twelve. The ten status and priority variants cover everything Phases 1–2 render. `016` needs `escalated`, and `016` is Release 2 |
| 2 | `Input`'s `multiline` (part of FE-006-08) | `007`'s `notes` field uses a bare `<textarea>`, already styled by `base.css`. One field, one element, indistinguishable to a user |
| 3 | `Button`'s `Danger` type (part of FE-006-07) | No destructive action exists before `012`. Adding it later is one CSS block, and the two danger derivations in `theme.css` can stay so the block is all that is missing |
| 4 | FE-006-10's toggles — `dir`, `lang`, greyscale, brand colour | Use dev tools instead. The states are still all on the page; only the convenience of switching goes. The brand input is the last of the four to drop, because it is the ADR-012 demonstration |
| 5 | `Badge` entirely (FE-006-09, TEST-006-08, TEST-006-09) | Its first consumer is `010`, not `007`. `statusTokens.ts` ships anyway — it is a map, it costs minutes, and it stops the mapping being re-derived per screen |
| 6 | `Input` entirely (FE-006-08, TEST-006-07) | `base.css` already styles a bare `<input>` from the tokens. `007` builds its form from elements and adds the component when there is time. **This is the ADR-009 fallback**, and the reason `base.css` is not droppable |
| 7 | FE-006-12's self-hosted fonts | The system font stack renders. Recorded as a known limitation, because for Arabic it means an undeliberate face — exactly the Q-15 defect. Drop this only after line 6 |

## Not droppable

| Task | Reason |
|---|---|
| FE-006-02 — tokens with provenance labels | The feature is the tokens. ADR-009: *"ship the tokens and use plain elements for the rest"* — there is no version of this feature without them. And the labels are the tokens: an unlabelled value gets "corrected" later against whichever source someone happened to open |
| FE-006-03 — the brand/fixed split | The same argument as localization. A component that reaches for `--navy-900` is not wrong today and fails no test; it fails the first time a tenant changes colour, in whichever screen happened to do it. Retrofitting means revisiting every token reference in the codebase. It costs nothing now and a sweep later |
| FE-006-04 — the computed `--on-brand` | ADR-012 §2 calls hard-coding it *"the single most common failure in configurable theming"*, and it fails for only **some** tenants — so it is invisible in a demo and unavoidable in production. Fifteen lines |
| FE-006-06 — `base.css` | Two reasons, either sufficient. It is the DESIGN-BRIEF rule 17 block, and that rule has been violated **twice after being written down** — *"a written rule is not a control"*. And it is what makes lines 2, 3, and 6 of the drop order safe: without it, dropping `Input` means shipping an unstyled control instead of a token-styled one |
| The focus rings in FE-006-07 and FE-006-08 | A ring removed for aesthetics is a defect, not a style choice (DESIGN-BRIEF rule 9). It affects only keyboard users, who are not in the room |
| Logical properties throughout | They look correct in English forever. `014`'s Arabic pass would otherwise open by finding every one of them |
| FE-006-13 and FE-006-14 — the gates and the CI job | Six rules that fail by **omission**, which is what review is worst at catching. A rule nobody enforces is not a rule, and adding the gates after the first screen means fixing a screen's worth of violations in one sitting |
| DOC-006-02 — the divergence register | Four blueprint documents contradict each other on values this feature had to choose (`research.md` R-1, R-5, R-6, R-7). Without the register, a reviewer reading ADR-009 finds 8px, sees 4px, and concludes the extraction was careless. The reasoning is the artifact |
| REV-006-03 — the timebox call | The timebox is the feature's main risk. Recording that it was honoured, or that it was not, is the only evidence either way |
