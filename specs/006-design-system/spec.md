# 006 — Design System

**Phase:** 0 · Foundation · **Story:** — (infrastructure, not a user story) ·
**Timebox:** ONE DAY, HARD STOP (ADR-009) · **Status:** Specified, awaiting review

## Understanding

Two things do not exist yet and everything in Phases 1–5 needs both: a React
application, and a visual language for it to render with. This feature produces the
smallest version of each that a later screen can build on without being rewritten.

The value is concentrated in one layer. ADR-009 puts roughly 80% of "this looks like
our product" in the tokens, for a fraction of the effort — and the tokens have already
been extracted. `docs/sdd/design/tokens.css` exists, with every value labelled
`(A)`/`(B)`/`(C)`/`(D)` for its source. So the work here is **adoption and
restructuring**, not extraction: copy the file into the application, re-point the
`--action-primary-*` semantics at a themeable brand ramp per ADR-012, and build the
three primitives that the first two phases actually consume.

The risk is not that this goes badly. It is that it goes well and consumes the week. An
enterprise design system has depth in every direction, and the assessment weights
end-to-end flow, not pixel fidelity. So the degradation order is written down before the
work starts (`plan.md`, *Risks and trade-offs*): if the timebox is hit with the tokens
extracted and the primitives incomplete, **ship the tokens and use plain elements for
the rest**. A consistent palette and type scale over unstyled controls looks
intentional; half-built custom controls look broken.

The other reason this is not "just CSS": ADR-012's split between **themeable** and
**fixed** tokens is expensive to retrofit, for the same reason localization is. A
component that reaches for `--navy-900` instead of `--brand` is not wrong today and does
not fail any test — it fails the first time a tenant changes their colour, in whichever
screen happens to have done it. That is why AC-18 is a build gate rather than a review
note.

## In scope

- **The React application bootstrap** at `src/wasl-web`: Vite, TypeScript `strict`,
  no barrel files, route-level code splitting only (ADR-011 §7)
- **`tokens.css` adopted** into the application, with **every** custom property carrying
  its provenance label — colours from the Figma export, geometry and layout from the
  shipped app, and **the shipped app wins where they disagree** (ADR-009)
- **The ADR-012 token architecture**, accepted in part:
  - the split between **themeable** (`--brand-*` and everything derived from it) and
    **fixed** (state colours, the neutral ramp, every status and priority colour)
  - the `color-mix(in oklab, …)` derivation of the brand ramp
  - the **computed** `--on-brand` foreground, with rejection of a brand colour that
    cannot reach 4.5:1 against either candidate
  - the pre-paint application point, wired to a static value now
- **Three primitives — Button, Input, Badge** — each with **all** its states: default,
  hover, active, focus-visible, disabled, loading, error. The remaining five are added
  when a screen needs them
- **`base.css`**: element-level defaults so that a bare `<button>`, `<input>`,
  `<select>`, or `<textarea>` is already token-styled. This is what makes ADR-009's
  degradation path work, and it is where DESIGN-BRIEF rule 17 is discharged
- The `[lang="ar"]` typography block: per-locale leading, no cap-height trim, tracking 0
- The lint and script gates that make the token rules structural rather than remembered
- One preview route rendering every state of all three primitives, in both directions

## Out of scope

| Excluded | Where it lives |
|---|---|
| `Select`, `Checkbox`, `Table`, `Modal`, `Toast` | The screen that first needs each: `Select` → `009`/`015` filters · `Checkbox` → `013` internal-comment toggle · `Table` → `008`/`010` · `Modal` → `012` · `Toast` → `007`. Five primitives with no Phase-0 consumer is speculative work by `design/component-inventory.md`'s own rule |
| The tenant settings **screen** | `022-tenant-theming-settings`. Only the token architecture is here — ADR-012's own recommendation |
| The theme's HTTP surface and persistence | `022`. The theme arrives in the bootstrap or auth response; which response, and its shape, is not frozen here |
| Sidebar presets (Light / Dark / Brand) | `008`, with the app shell that has a sidebar. Specified in `design/theming.md`; nothing renders one yet |
| Dark mode | Nowhere. A different axis and a much larger surface; `color-scheme: light` stands (DESIGN-BRIEF rule 16) |
| The login screen and its animation | Phase 6. Visual spec is `design/screens/01-login.md`; the drifting orbs and the neural mesh are the one place expressive motion is permitted (`design/motion.md`) and no Phase-0 screen has them |
| Storybook | Nowhere. Disproportionate for three primitives in one week (ADR-011, *What is deliberately not done*) |
| Any third-party component library, headless or styled | Nowhere. It would look like that library, not like this product (ADR-009). Reconsidered — and still rejected — in `plan.md` |
| Adoption of the icon set | `design/icons.md`, at its first consumer. `Button` exposes an icon slot; nothing fills it in this feature |
| i18n catalogues and `react-i18next` wiring | `007` — the first user-facing string. This feature introduces **zero** i18n keys; see `frontend-spec.md` |
| TanStack Query, React Hook Form, Zod | `007`. An unused dependency in `package.json` is a claim the build does not check |
| The app shell, sidebar, header, page header | `008`, or its own feature. `design/layout-patterns.md` has the geometry |
| Visual regression testing | Nowhere. `docs/sdd/testing/test-strategy.md` excludes styling, layout, and component snapshots — they break on every change and catch nothing |

The **token architecture** ships here while the **settings screen** does not, because
the two have opposite retrofit costs. The architecture is a restructure of every token
reference in the codebase; the screen is one route reading and writing one value.

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | Reusing the house tokens, spacing, typography, and component specifications is permitted; no client logo, product name, or client-specific imagery is used (Q-11) | The palette is re-authored from a single chosen brand hue. Because ADR-012's ramp is **derived** rather than hand-picked, that is one hex value plus a re-run of the contrast test — the geometry is measurement rather than an asset and is unaffected. This containment is the main practical benefit of the derivation |
| A-2 | `IBM Plex Sans Arabic` is an acceptable Arabic face (Q-15) | One token changes (`--font-ar`) plus a re-check of `--leading-ar-*`, because a different face has different vertical metrics. No component changes |
| A-3 | `color-mix()` and the `oklab` colour space are available in every browser this is demonstrated in | The brand ramp resolves to nothing and a Primary button renders with **no background at all** — an invalid custom property falls back to `unset`, not to the previous value. AC-8 exists for exactly this, and `plan.md` names the static fallback ramp |
| A-4 | Three primitives are enough for Phases 0–1 | The screen that needs a fourth builds it, with a written reason in that feature's `frontend.md` — the same rule ADR-009 applies to a ninth |
| A-5 | `tokens.css` is **copied** into the application, not imported from `docs/sdd/` | Two copies drift, and the drift is invisible. `FE-006-02` ships a script that diffs them and fails CI, so drift is a build failure rather than a discovery |
| A-6 | Nobody consumes these primitives before `007` | If `007` starts in parallel, the props tables in `frontend-spec.md` are the contract and are frozen the way an API contract is |

## Open questions

Each carries a working assumption, so nothing here blocks. Six of them are genuine
disagreements **between blueprint documents**, which is why they are recorded rather
than quietly resolved in the CSS.

| # | Question | Working assumption |
|---|---|---|
| Q-11 | Is reusing the house design assets permitted, and how far? | Tokens, spacing, typography, and component specifications are in scope; no client logo, no client product name, no client-specific imagery. This CRM is its own product wearing the house style (`11-open-questions.md` Q-11) |
| Q-15 | Which Arabic typeface, and was the current one ever deliberately chosen? | `IBM Plex Sans Arabic`, set in `--font-ar` and labelled `(D)` — **our** decision, not an inheritance. The design's Arabic layer reports IBM Plex Sans, which has no Arabic glyphs, so it renders through a fallback nobody chose. The licence file is verified in the distributed package before shipping, on the same rule `design/icons.md` applies to icon sets |
| Q-A | Corner radius: ADR-009 says the shipped app wins and puts it at ~8px; `tokens.css` commits `--radius-sm: 4px` from layer inspect | **4px.** ADR-009's rule is *shipped app wins*; `tokens.css` note 1's rule is *never sample geometry off a picture* — and the 8px came from a screenshot while the 4px came from a layer. The method rule is the stronger of the two. If 8px is right it is **one token value**, and every primitive follows without touching a component |
| Q-B | `Button` MD is 40px (inspect); `--field-height-md` is 47px. A submit button beside a field is 7px shorter | **40px, and stop there.** DESIGN-BRIEF rule 3 forbids inventing a token, so no `--button-height-field` is created. The first screen placing a Button inline with a field owns the decision, and it will be visible in that screen's preview |
| Q-C | The focus ring: ADR-012 defines `--brand-ring` at 22%; `design/screens/10-shared-patterns.md` says "3px ring at 10%" | **One ring, `--brand-ring` at 22%, on Button and Input alike.** The token is defined in an ADR; the 10% is prose with no token behind it and predates the ramp. Two focus-ring intensities in one interface is exactly the inconsistency a token layer exists to prevent |
| Q-D | `Badge` height: `--chip-height` is 20px `(A)`; shared patterns says "Pill h22" | **20px, from the token.** A component that hard-codes 22 to match a sentence has hard-coded a decision belonging to the token layer |
| Q-E | Does `--brand` come from a server response in this feature? | **No.** `--brand` is a static value in `tokens.css`. The derivation, the `onBrand()` computation, and the pre-paint `applyTheme()` entry point all ship and are tested; the value passed in is a literal until `004`/`022` supply a real one. AC-25 verifies the mechanism, not the wiring |
| Q-F | Does the `Button` loading indicator use the converge loader (`design/brand.md` §2)? | **Yes, at reduced travel.** `brand.md` says the converge loader replaces the spinner everywhere; at 40px of button height the 34px travel does not fit, so: the same three dots, the same 1.45s, the same easing, a shorter distance. If the reduced-scale version reads as noise rather than progress it falls back to opacity-pulsing dots, recorded as a deviation |
| Q-G | How is "every state visible in isolation" satisfied when no screen exists? `design/component-inventory.md` requires both that **and** "used by at least one real screen" | **One preview route**, not routed in production, rendering every state of all three primitives with a direction toggle and a language toggle. It is also the Phase-3b preview harness `007` and `008` reuse, which is what turns it from throwaway scaffolding into something the workflow already asks for. It is **not** Storybook, which stays out of scope |
| Q-H | Fonts from a CDN or self-hosted? | **Self-hosted `woff2` in `public/fonts`.** A CDN link fails silently offline into a fallback face — the Q-15 failure mode reproduced by an infrastructure choice — and NFR-7 asks that the system runs from a clean clone in documented steps |

## Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | `npm ci && npm run build` in `src/wasl-web` succeeds with zero TypeScript errors and zero ESLint warnings, with `strict: true` in `tsconfig.json`. A committed `any` fails the build |
| AC-2 | The production build emits one entry chunk plus one lazily-loaded chunk **per route**, and no finer split — verified by listing `dist/assets` against the route table in `routes.tsx` (ADR-011 §7) |
| AC-3 | No barrel file exists: no `index.ts`/`index.tsx` under `src/` whose body is only re-exports. A script asserts it and fails CI (ADR-011 §7) |
| AC-4 | **Every** custom property in the application's `tokens.css` carries a provenance label — `(A)` vector export, `(B)` shipped app, `(C)` layer inspect, `(D)` our decision. An unlabelled property fails `npm run lint:tokens`. A second check diffs the file against `docs/sdd/design/tokens.css` and fails on drift in any value that came from it |
| AC-5 | Setting `--brand` to a different colour on `:root` retints the Primary button, every focus ring, and every brand-derived surface, and changes **no** status, priority, neutral, text, or border token. Asserted by reading the computed value of every token in the fixed set before and after the change and requiring them to be identical |
| AC-6 | `--on-brand` is **computed**. Over a fixture of at least twelve candidate brand colours including pale ones — a light yellow, a pale mint, a near-white grey — the chosen foreground reaches ≥ 4.5:1 against the brand in every case |
| AC-7 | A brand colour reaching 4.5:1 against **neither** `#FFFFFF` nor `#0D2626` is **rejected** by the validator with a named reason, rather than a foreground being returned anyway |
| AC-8 | `color-mix(in oklab, …)` actually resolves: reading `--brand-hover` from `getComputedStyle` returns a parsed colour, not the literal `color-mix(...)` string and not an empty string. In a browser without support, a Primary button renders with the static fallback ramp — never with no background |
| AC-9 | `Button` renders every combination of type × state: `Primary` / `Secondary-Outline` / `Danger` × default, hover, active, focus-visible, disabled, loading. Eighteen cells, all present on the preview route, none falling back to another cell's appearance |
| AC-10 | `Button` in its loading state has the **same rendered width** as in its default state, measured. A button that shrinks while loading moves everything after it |
| AC-11 | A `Button` rendered with no text and no `aria-label` fails: a development-mode error and a failing test. The design cannot enforce this; the component can |
| AC-12 | `Input` renders default, focus, disabled, error, error-with-focus, with-helper-text, and with-error-text. The error message **replaces** the helper text rather than stacking below it, and appears on **blur**, not on each keystroke |
| AC-13 | An `Input` in its error state carries `aria-invalid="true"` and an `aria-describedby` pointing at the message, asserted by querying the control by its accessible description rather than by class name |
| AC-14 | Every `button`, `input`, `textarea`, and `select` has an explicit `background-color`, `color`, and `-webkit-text-fill-color`, each with `!important`, set by `base.css`. Rendered with the host browser in dark mode, every control keeps its intended colours. A stylelint rule fails the build on a control rule set missing any of the three (DESIGN-BRIEF rule 17) |
| AC-15 | `Badge` renders all twelve variants — six statuses, four priorities, escalated, internal — and **every one carries a text label**. A `Badge` with no label is a TypeScript error; an unknown status value renders neutral with the raw value as its label, never blank, never the translation key, never a crash |
| AC-16 | No `Badge` variant resolves to a brand token. Asserted by reading each variant's computed background, colour, and border while `--brand` is set to a deliberately unmissable colour, and requiring none of them to equal it |
| AC-17 | No file under `src/wasl-web/src/components/` contains a literal colour, pixel spacing, radius, or font size. A script asserts it; `styles/` is the only directory where a literal value may appear |
| AC-18 | No file under `src/components/` references a **primitive** token — `--navy-900`, `--neutral-*`, `--red-600`, `--blue-500`, and the rest. Semantic tokens only. This is a **separate** gate from AC-17, because a primitive token passes the no-literal check and still silently breaks theming (DESIGN-BRIEF rule 2) |
| AC-19 | No stylesheet under `src/wasl-web` uses a physical direction property: `margin-left`, `margin-right`, `padding-left`, `padding-right`, `border-left`, `border-right`, bare `left`/`right`, or `text-align: left`/`right`. stylelint fails the build (ADR-007 §6) |
| AC-20 | Every interactive element in all three primitives is reachable by keyboard and shows a visible focus ring under `:focus-visible`, in a light host **and** a dark host. `outline: none` with no replacement ring fails review |
| AC-21 | Every state of all three primitives is rendered with `dir="rtl"` on the document root and the result recorded in `tests.md`: the Button's icon slot moves to the inline-start, the Badge's dot moves to the inline-start, the Input's helper and error stay start-aligned, and nothing overlaps or clips |
| AC-22 | Arabic text is not clipped in any primitive. Verified with a string carrying marks above cap height (ث ض) and descenders below the baseline (final ي ج ع): `--leading-ar-*` applies under `[lang="ar"]`, and cap-height trim is not applied there at all |
| AC-23 | Under `prefers-reduced-motion: reduce`, every transition in the three primitives is reduced to effectively zero and the loading indicator renders statically |
| AC-24 | No user-facing literal string appears inside any primitive. Every label, placeholder, helper, and error arrives as a prop. A lint rule fails on JSX text content under `src/components/` |
| AC-25 | `--brand` and `--on-brand` are written to `:root` by an inline script in `index.html`, before first paint — not in a `useEffect`. Verified by asserting the computed value at the first paint frame, or by observing that no frame renders with the default brand |

## Edge cases

| Case | Expected |
|---|---|
| `--brand` set to a pale yellow | `--on-brand` computes to the ink `#0D2626`, not white. The failure that affects only *some* tenants, which is precisely why it ships (ADR-012 §2) |
| `--brand` set to a colour failing 4.5:1 against both candidates | Rejected with a stated reason. Refusing a colour beats rendering text nobody can read. The **screen** that refuses is `022`; the function that refuses is here |
| `color-mix()` unsupported by the browser | The static fallback ramp applies. Without it, an invalid custom property resolves to `unset` and the Primary button renders transparent — which reads as a broken page, not a missing feature |
| A Button label much longer in Arabic than in English | The button hugs its content and does not wrap (`white-space: nowrap`); the **parent** owns the overflow. A wrapping 40px button breaks the row height for everything beside it |
| A loading Button clicked a second time | Ignored — `disabled` is set while loading, so a double-click sends one request. This is the component half of `007` AC-17 |
| An icon-only Button with no `aria-label` | Development-mode error, and a failing test. Invisible to a sighted reviewer and to the design |
| An `Input` given both helper text and an error | The error replaces the helper. Two messages under one field means the user reads the wrong one |
| An `Input` given Arabic text in an otherwise English form | Renders correctly: `dir="auto"` is always on the control. Without it the punctuation lands at the wrong end and reads as a typo (ADR-007 §8) |
| A **disabled** `Input`'s text in Safari | Stays at the specified colour. Safari fades disabled input text unless `-webkit-text-fill-color` is set explicitly — silent, and in one browser only |
| A `Badge` given a status value the map does not know | Neutral tokens, raw value as the label. Never blank, never the i18n key, never an exception. Enum values are not translated (ADR-007 §3), so the raw value is a legitimate fallback label |
| A `Badge` rendered in greyscale, or printed monochrome | Still readable, because every badge carries a label (DESIGN-BRIEF rule 14) |
| A screen passes a brand token into a `Badge` to "make it match" | Caught by AC-16 and AC-18. This is the only way to break theming from inside a component (`design/theming.md`, last section) |
| The host browser is in dark mode | Native controls keep their intended colours, because `base.css` sets background, colour, and `-webkit-text-fill-color` with `!important`. `color-scheme: light` alone is not enough — a host stylesheet can win on specificity. Caught in a preview three times already, twice **after** the rule was written down (DESIGN-BRIEF rule 17) |
| Fonts fail to load — offline, or the files are missing | The fallback stack renders. For Arabic this reproduces the Q-15 defect exactly: a face nobody chose, looking settled. Self-hosting is the mitigation; the fallback stack is documented so the substitution is recognisable rather than mysterious |
| `prefers-reduced-motion: reduce` | Every transition ≈0; the converge dots render statically. For some people motion is nausea, not taste |
| The one-day timebox is reached with `Input` half-built | `base.css` already styles a bare `<input>` from the tokens, so the half-built component is deleted and the element used directly. This is ADR-009's degradation path, and `base.css` is what makes it available rather than aspirational |
| A **permission**-driven disabled Button | The primitive cannot distinguish "not permitted" from "form incomplete", and must not try. A disabled button receives no hover and no focus, so an explanation attached to it is unreachable by keyboard — the forbidden case therefore renders the control **enabled, with the explanation inline beside it**, per `design/screens/10-shared-patterns.md`. The primitive exposes `disabled`; the *reason* belongs to the screen, and no `reason` prop is added here |
| A ninth primitive, or a fourth in Phase 1 | Requires a written reason in that feature's `frontend.md`. Recorded here so the cap is enforced by process rather than by memory |

## Rules referenced

- **ADR-009** — where the visual design comes from; levels 1 and 2; the one-day
  timebox; colours from the export, geometry from the shipped app; preview before build
- **ADR-012** — accepted in part: the themeable/fixed split, the oklab ramp, the
  computed `--on-brand`, pre-paint application. The settings screen is `022`
- **ADR-011** — §4 the three kinds of component and which one fetches; §7 no barrel
  files, route-level splitting only, `strictNullChecks`, no `any`; and its rejection of
  Storybook and of a component library
- **ADR-007** — §6 logical properties and `dir` on the root; §7 Latin digits and the
  Gregorian calendar under `ar`; §8 `dir="auto"` on user content; §9 CLDR plurals
- **ADR-003** — its "utility CSS, no component library" line, superseded by ADR-009
- **NFR-1** maintainability over cleverness · **NFR-7** runs from a clean clone ·
  **NFR-8** catalogue parity (nothing owed by this feature — it has no keys)
- **BR-8.8** no hard-coded user-facing string · **BR-8.11** key parity ·
  **BR-8.13** Latin digits in identifiers under `ar`
- **Q-11** permission · **Q-15** the Arabic typeface · **Q-12** resolved: React
  regardless, so no Angular component library is inheritable
- **DESIGN-BRIEF** rules 1, 2, 2b, 3 (do not invent a token — *stop and say so*), 4,
  7, 8, 9, 10, 11, 12, 13, 14, 15, 16, **17** (native controls), 18, 19, 20, 23
- **`design/component-inventory.md`** — the eight-primitive cap, the per-primitive
  state tables, the definition of done for a primitive
- **`design/theming.md`** · **`design/design-tokens.md`** ·
  **`design/layout-patterns.md`** · **`design/motion.md`** ·
  **`design/preview-first-workflow.md`** ·
  **`design/screens/10-shared-patterns.md`**

## What fails silently here, and where each is caught

The most valuable thing in this specification. Every row is a defect that looks like
success — for months, or for one browser, or for one tenant.

| Silent failure | Why nobody notices | Caught by |
|---|---|---|
| A component reaches for `--navy-900` instead of `--brand` | Renders correctly forever. Fails the first time a tenant changes colour, in one screen | AC-18, a script in CI |
| `--on-brand` hard-coded to white | Correct for every dark brand. Unreadable for a pale one | AC-6, a twelve-colour fixture |
| A native control inherits the host's dark-mode appearance | Reads as "this design is bad", not "this CSS is missing a rule" — so it survives review. Has already happened three times | AC-14, stylelint |
| `color-mix()` unsupported | The button has no background at all, which looks like a load failure rather than a CSS fallback | AC-8 |
| `margin-left` instead of `margin-inline-start` | Correct in English forever. Wrong in Arabic, and only visually | AC-19, stylelint |
| `outline: none` for aesthetics | Only keyboard users are affected, and they are not in the room | AC-20 |
| A provenance label dropped from a token | The value gets "corrected" later against whichever source someone happened to open | AC-4 |
| `line-height: 1` plus cap-height trim under `ar` | Presents as a font rendering fault, not a missing token | AC-22 |
| A status colour made themeable | The product becomes able to lie about state, and only for the tenant who changed it | AC-5, AC-16 |
| The theme applied in a `useEffect` | A flash of unbranded interface on every load, which everyone sees and nobody reports as a bug | AC-25 |
| A barrel file | Breaks tree-shaking and seeds an import cycle that is painful to unpick two features later | AC-3 |
| A `Badge` whose colour is its only signal | Fine for most readers; meaningless in greyscale and for colour-blind users | AC-15 |
