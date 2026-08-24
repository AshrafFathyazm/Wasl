# 006 — Plan

**Phase:** 0 · **Role:** Architecture · **Agent:** `feature-dev:code-architect` ·
**Skill:** `speckit-plan` · **Timebox:** one day, hard stop (ADR-009)

## Backend design

**None.** No `.cs` file is created or changed, no migration is added, no endpoint is
mapped. See [`contracts/README.md`](contracts/README.md) for who owns the theme surface
this feature implies, and [`data-model.md`](data-model.md) for why nothing is stored.

Recorded rather than omitted, so the empty lane is visibly a decision. One thing is
carried forward rather than left implied: ADR-007's ordering constraint —
`UseRequestLocalization()` after `UseAuthentication()` — belongs to `004` and `005`, and
this feature's `[lang]`/`dir` work on the client is the other half of the same
requirement. If the server-side ordering is wrong, every AC in this feature still passes
while the product is silently English-only for Arabic users with English browsers.

## Frontend design

This is the whole of the feature. Every file it creates or changes is named below,
because a plan that does not name its files is a description.

```text
src/wasl-web/
  package.json                       react · react-dom · react-router-dom. Nothing else runtime
  package-lock.json
  vite.config.ts                     react plugin; CSS Modules are built in, no config
  tsconfig.json                      strict: true
  tsconfig.node.json
  eslint.config.js                   flat config: @typescript-eslint, react-hooks,
                                     no-restricted-syntax on JSXText under components/
  .stylelintrc.json                  property-disallowed-list (physical properties),
                                     declaration-property-value-disallowed-list
  index.html                         ← the pre-paint inline theme script lives HERE
  public/
    fonts/IBMPlexSans-{400,500,700}.woff2
    fonts/IBMPlexSansArabic-{400,500,700}.woff2
  scripts/
    check-token-provenance.mjs       every custom property carries (A)|(B)|(C)|(D)   AC-4
    check-token-drift.mjs            diff against docs/sdd/design/tokens.css          AC-4
    check-semantic-tokens.mjs        no primitive token under src/components/         AC-18
    check-no-literals.mjs            no colour/px/radius/font-size under components/  AC-17
    check-no-barrels.mjs             no re-export-only index.ts                       AC-3
  src/
    main.tsx                         createRoot; imports the four stylesheets in order
    routes.tsx                       the route table; every element lazy()            AC-2
    styles/
      tokens.css                     adopted from docs/sdd/design/tokens.css + labels
      theme.css                      the brand/fixed split, the oklab ramp, fallbacks
      base.css                       element defaults — the degradation floor + rule 17
      locale.css                     [lang="ar"] leading; tracking 0; no cap trim
    lib/
      theme/contrast.ts              srgb · luminance · ratio                        AC-6
      theme/onBrand.ts               the computed foreground + the rejection          AC-7
      theme/applyTheme.ts            writes --brand and --on-brand to :root          AC-25
    components/
      Button/Button.tsx
      Button/Button.module.css
      Button/Button.test.tsx
      Input/Input.tsx
      Input/Input.module.css
      Input/Input.test.tsx
      Badge/Badge.tsx
      Badge/Badge.module.css
      Badge/statusTokens.ts          the twelve-variant map, keyed on raw enum values
      Badge/Badge.test.tsx
    dev/
      PreviewPage.tsx                every state, dir toggle, lang toggle             Q-G
      PreviewPage.module.css
.github/workflows/ci.yml             CHANGED — a web job: install, lint, test, build
```

**No `index.ts` anywhere.** ADR-011 §7, enforced by `check-no-barrels.mjs` rather than by
memory (AC-3).

### The four stylesheets, and why they are four

Import order in `main.tsx` is load-bearing, so it is written down rather than discovered.

| # | File | Owns | Why it is separate |
|---|---|---|---|
| 1 | `tokens.css` | Every primitive and semantic value, with its provenance label | It is a **refreshed artifact**. A token refresh must be a readable diff against the blueprint's copy (`design/design-tokens.md`, *Refresh*), and that is only true if nothing else lives in the file |
| 2 | `theme.css` | The brand/fixed split, the six oklab derivations, their static fallbacks, `color-scheme: light` | It is the only file a theme change touches. Keeping it out of `tokens.css` means a token refresh cannot silently overwrite the ADR-012 architecture |
| 3 | `base.css` | `button` `input` `select` `textarea` defaults, `*` box-sizing, the reduced-motion block | This is ADR-009's degradation path made real: a bare element is already token-styled, so a half-built primitive can be **deleted** rather than shipped. It is also where DESIGN-BRIEF rule 17 is discharged once instead of per component |
| 4 | `locale.css` | `[lang="ar"]` leading and the absence of cap-height trim | Per-locale metrics are not per-component. One block, and every primitive inherits it |

### The token restructure — what actually changes

`docs/sdd/design/tokens.css` has no `--brand` token. `--action-primary-bg` points
directly at `--navy-900` and `--action-primary-text` at white. The restructure is the
work ADR-012's cost table calls "already done" and which
[`research.md`](research.md) R-1 found is not.

```text
BEFORE   --action-primary-bg     → --navy-900          (a primitive; not themeable)
         --action-primary-text   → --Main-White-White  (hard-coded white: ADR-012 §2)

AFTER    --brand                 = #1D174D             (D) themeable, one value
         --on-brand              = computed at runtime  AC-6
         --brand-hover  --brand-active  --brand-subtle  --brand-border  --brand-ring
                                 = color-mix(in oklab, …)  ADR-012 §1
         --action-primary-bg     → var(--brand)
         --action-primary-text   → var(--on-brand)
         --action-primary-border → var(--brand)
```

Everything else stays pointed where it points now. The **fixed** set is unchanged and
must stay unchanged, and AC-5 asserts that by reading every fixed token's computed value
before and after a brand change.

| Themeable | Fixed |
|---|---|
| `--brand` and the six derived from it | `--state-success-*` `--state-warning-*` `--state-danger-*` `--state-info-*` `--state-neutral-*` |
| `--action-primary-*` (via `--brand`) | The whole neutral ramp, `--text-*`, `--border-*`, `--surface-*` |
| `--action-secondary` hover tint | Every status and priority colour in `statusTokens.ts` |
| — | `--action-danger-*` — red means "needs attention now" (DESIGN-BRIEF rule 15), and it is a state, not a brand |

**Status colour is meaning, not branding.** A tenant who sets "success" to red has a
product that lies to its users (ADR-012 §3).

### One generalisation of ADR-012, with its reason

ADR-012 enumerates five derivations and applies them to `--brand` only. `Button`'s
`Danger` type needs a hover and an active step, and no darker red exists in the
palette — `--red-600` and `--red-500` are a pair, not a ramp.

**Decision: the derivation is a function, applied to any base colour; only `--brand`'s
input is themeable.** `--action-danger-hover` and `--action-danger-active` are the same
oklab mixes applied to `--action-danger-bg`.

Why this is not "inventing a token" under DESIGN-BRIEF rule 3: rule 3 forbids a
*component* reaching for a token that does not exist. This adds two tokens to
`theme.css` — the file that owns derivations — using the derivation already specified,
and it is recorded here because extending an ADR's enumeration needs a written reason.
The alternative, hard-coding `--red-500` as the danger hover, was rejected: `#F04438` is
*lighter* than `#E54545`, so a hover would brighten a destructive button, which reads as
the opposite of pressing it.

### The pre-paint application point

```html
<!-- index.html, before the module script. NOT a useEffect — that runs after paint -->
<script>
  (function () {
    var brand = /* literal today; the bootstrap/auth response at 022 */ '#1D174D';
    var r = document.documentElement;
    r.style.setProperty('--brand', brand);
    r.style.setProperty('--on-brand', /* onBrand(brand), inlined at build */ '#FFFFFF');
  })();
</script>
```

Inline and synchronous, because ADR-012 is explicit that a separate fetch renders the
default theme first and then snaps — a flash of unbranded interface on every load, which
everyone sees and nobody files. `applyTheme.ts` is the same logic as a module, used by
tests and by `022`; the inline copy exists because a module cannot run before first
paint.

AC-25 verifies the **mechanism**, not the wiring. The value is a literal until `022`.

### The primitives

Full specification — props, every state, every token per cell, RTL, accessibility — is
[`frontend-spec.md`](frontend-spec.md), which is the primary artifact of this feature and
is the longest file in it. Only the architectural decisions are here.

| Decision | Reason |
|---|---|
| Native elements, no headless library | `<button>` and `<input>` already give keyboard behaviour, form participation, and the accessibility tree. A library earns its place at `Select` and `Modal`, and that is `009`/`012`'s decision to make, not this one's |
| Props `iconStart` / `iconEnd`, **not** the upstream `With left icon` / `With Right Icon` | The upstream component API encodes a physical direction this product cannot honour. A prop called `leftIcon` that renders on the right under `dir="rtl"` is a name that lies, and someone will eventually "fix" it by flipping the CSS. Recorded as a deliberate divergence from the inspected component contract |
| `withText` kept as a separate boolean from `text` | Copied from upstream deliberately (`design/component-inventory.md`) — it is how an icon-only button is expressed without a second component, and it is the hook that lets the component *require* an `aria-label` when text is absent (AC-11) |
| One size, `MD` | The only size confirmed by inspect. A second size arrives with the screen that needs it |
| `disabled` and `loading` are props, never separate components | DESIGN-BRIEF rule 8. A `LoadingButton` guarantees the two drift apart |
| `Badge`'s map exported from `statusTokens.ts` | The ticket list's status **tab bar** needs the same status→colour mapping with a bare dot and no pill (`design/layout-patterns.md`). Exporting the map lets `010` reuse it without a `dotOnly` Badge variant existing before there is a caller — ADR-011 §3: move something when the second consumer appears, not when one is imagined |
| No `reason` prop for a forbidden action | The forbidden case renders the control **enabled with an inline explanation** (`screens/10-shared-patterns.md`), because a disabled control receives no focus and an explanation attached to it is unreachable by keyboard |

### Where each rule is enforced

| Rule | Enforced by | Not by |
|---|---|---|
| Components use semantic tokens only (DESIGN-BRIEF 2) | `check-semantic-tokens.mjs` in CI | The reviewer noticing `--navy-900` in a diff |
| No literal colour, spacing, radius, font size | `check-no-literals.mjs` in CI | A convention |
| Logical properties only (ADR-007 §6) | stylelint `property-disallowed-list` | Everyone remembering `margin-inline-start` |
| Native controls never inherit the host appearance | `base.css` + a stylelint assertion on the three declarations | DESIGN-BRIEF rule 17, which was violated twice *after* being written down. "A written rule is not a control" |
| Every token labelled with its source | `check-token-provenance.mjs` | The author being careful |
| The app's tokens have not drifted from the blueprint's | `check-token-drift.mjs` | Nobody comparing them |
| No barrel files, route-level splitting only | `check-no-barrels.mjs`; `dist/assets` inspected against `routes.tsx` | ADR-011 being read |
| No user-facing literal in a primitive | ESLint `no-restricted-syntax` on `JSXText` | Review |
| Focus ring present on every interactive element | `FE-006-10`'s preview page plus `TEST-006-13`'s keyboard walk | An assertion — a ring's *visibility* is not assertable, which is why it is a recorded observation |

## Data changes

**None.** See [`data-model.md`](data-model.md). No table, no migration, no `DbContext`
change. `dotnet ef migrations list` is identical before and after.

## Contract changes

**None.** No HTTP surface exists to change; see
[`contracts/README.md`](contracts/README.md).

One contract is nevertheless **frozen** by this feature and must be treated as such: the
props tables in [`frontend-spec.md`](frontend-spec.md). `007` builds against them. A
change to a prop name, a required/optional flag, or a state's meaning is recorded under
this heading and both `frontend-spec.md` and
[`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md) are regenerated — the same process an
endpoint change follows. A prop change discovered by `007` failing to compile is the
failure this heading exists to prevent.

## Test strategy

| Level | What | Why there |
|---|---|---|
| **Unit** (Vitest) | `contrast.ts` and `onBrand.ts` over a ≥12-colour fixture including pale ones; the rejection path; `applyTheme` writing to `:root` | Pure functions with a numeric answer. This is the code whose failure is per-tenant and therefore invisible in a demo, so it is the code that gets a fixture rather than an example |
| **Component** (Vitest + React Testing Library) | Button: icon-only without `aria-label` fails; width invariant across default/loading; `disabled` while loading. Input: error replaces helper; `aria-invalid` + `aria-describedby`; error on blur not on keystroke. Badge: unknown status renders neutral with the raw value; a label is always present | The behaviour that a screen would otherwise re-implement. Queried by role and accessible description, never by class name — a test that queries a CSS class breaks on every refactor and asserts nothing a user experiences |
| **Computed-style assertions** | AC-5 no-leakage; AC-8 `color-mix` resolves to a parsed colour; AC-16 no brand token reaches a Badge | These are the *architecture*, and they are the three failures that look exactly like success. They are not "styling tests" in the sense `test-strategy.md` excludes — they assert token wiring, not appearance |
| **Repository gates** (scripts + stylelint + ESLint, in CI) | AC-3, AC-4, AC-14, AC-17, AC-18, AC-19, AC-24 | Seven rules that fail by **omission**, and omission is what review is worst at catching. Same argument as the two architecture tests in `docs/sdd/testing/test-strategy.md` |
| **Manual, recorded** | The RTL pass, the Arabic clipping check, the dark-host render, the greyscale render, the keyboard walk, the focus-ring visibility | Visual, and no assertion catches them. `docs/sdd/testing/test-strategy.md` says the Arabic pass is a **deliverable, not a check**; the findings go in `tests.md` |

**Deliberately not tested, with reasons:**

| Not tested | Why |
|---|---|
| Component snapshots, layout, appearance | `docs/sdd/testing/test-strategy.md` excludes them by name: they break on every change and catch nothing |
| That the converge indicator animates | An animation's *appearance* is not assertable and a test that only checks the class name is present tests the class name. What **is** tested is that `prefers-reduced-motion` stops it (AC-23), because that one has a user consequence |
| That Vite code-splits | Testing the bundler. AC-2 is an inspection of `dist/assets` against the route table, not a test |
| That CSS Modules scope class names | Testing the framework |
| The preview route | It is a development artifact. If it breaks, it breaks in front of the person using it |
| Contrast of the **disabled** state pairs | Exempt under WCAG 1.4.3. The pairs are recorded in `frontend-spec.md` with their measured ratios so the exemption is a decision rather than an oversight |

## Dependencies

| On | Why |
|---|---|
| `001-solution-skeleton` | The repository, `.gitignore`, and `.github/workflows/ci.yml`, which this feature adds a job to |
| Nothing else | No backend feature is a prerequisite. This is why it can be built in parallel with `002`–`005`, and why it is the one Phase-0 feature that can be dropped without stopping the others |

**Depended on by:** `007` (every form control), `008` (`Badge`, and the shell), `010`
(`Badge`, `statusTokens.ts`), `012` (`Badge`, `Modal` built on these tokens), `014` (the
`[lang="ar"]` block and the `dir` mechanism), `022` (the whole token architecture).

`014` is the non-obvious one: the per-locale leading tokens and the absence of
cap-height trim are shipped here, and without them the Arabic pass in `014` would open
by discovering that every line of Arabic in the product is clipped.

## Risks and trade-offs

### Considered and rejected: a headless component library plus these tokens

Radix, React Aria, or Headless UI, styled entirely by the tokens. This is ADR-009's own
named fallback — *"Unstyled headless components plus tokens: a reasonable middle path
and the fallback if the timebox is hit."*

Rejected **for this feature**, and the qualifier matters. For `Button`, `Input`, and
`Badge` a library buys nothing: a native `<button>` and `<input>` already provide
keyboard behaviour, form participation, and a correct accessibility tree, and a `Badge`
is a `<span>`. The dependency's value is concentrated in `Select`, `Modal`, and the
`Toast` stack — focus trapping, popup positioning, RTL anchoring, escape handling,
portals — none of which is in scope.

So taking the dependency now means paying for it in bundle size and API surface across
three components that do not need it, and pre-committing `009` and `012` to a library
they have not evaluated. **The decision is deferred to the feature that first needs a
`Select`**, and this plan records that deferring it is deliberate rather than an
oversight.

### Considered and rejected: Tailwind, or any utility CSS layer

ADR-003's original line said "utility CSS", and ADR-009 superseded it — so there is no
standing instruction to honour.

Rejected on a specific mechanism, not on taste: a utility layer gives every semantic
token a second name, so a component can express the same decision two ways. AC-18's
gate — "no primitive token in a component" — becomes unenforceable the moment
`bg-navy-900` is as valid as `var(--navy-900)`, because a regex over CSS files no longer
sees the class names in the TSX. The enforcement mechanism is the thing that makes
theming survive, and the utility layer costs it.

It also adds a build step and a config file to a codebase with three components.

### Considered and rejected: build all eight primitives

They are all specified. `design/component-inventory.md` gives each one its state table,
`10-shared-patterns.md` gives `Modal` and `Toast` their tokens and behaviour, and the
work is well understood.

Rejected on the timebox, and on `component-inventory.md`'s own definition of done: *"Used
by at least one real screen — a primitive with no consumer is speculative work."* Five of
the eight have no Phase-0 or Phase-1 consumer. Building them would consume the day that
ADR-009 says is the entire budget, and it is the specific failure ADR-009 predicts: *"the
risk is not that this goes badly, it is that it goes well and consumes the week."*

### Considered and rejected: import `tokens.css` directly from `docs/sdd/design/`

One copy, no drift, no script. Tempting and briefly attractive.

Rejected: `docs/sdd/` is the blueprint, not a build input path — making the application
compile against a documentation directory means a documentation edit can break the build,
and it inverts the direction the repository is organised in. **Chosen instead:** a copy,
plus `check-token-drift.mjs` which fails CI when a value carrying an `(A)`, `(B)`, or
`(C)` label differs between the two. Drift becomes a build failure rather than a
discovery, and values labelled `(D)` are allowed to differ because the application is
where our own decisions are made.

### Considered and rejected: compute the brand ramp in TypeScript and write six hex values

It removes the `color-mix()` browser dependency entirely — see `research.md` R-2.

Rejected because it takes the derivation out of the cascade. A component could no longer
override one step, `currentColor` inheritance on icons stops behaving the way ADR-012
depends on, and a theme change becomes "recompute six values and re-apply them" instead
of "set one variable". The static-fallback pair gets the safety at a cost of six lines.

### Accepted risk: the timebox, and the order things are dropped

The single largest risk in this feature is that it is enjoyable. The stop is at the end
of the day regardless of state, and the drop order is fixed **now**, while nobody is
attached to the work:

```text
1. Badge's `escalated` and `internal` variants   (10 of 12 cover Phases 1–2)
2. Input's `multiline`                           (007's notes field uses a bare textarea)
3. Button's `Danger` type                        (no destructive action exists before 012)
4. The preview page's dir/lang toggles           (use dev tools instead)
5. Badge entirely                                (its first consumer is 010, not 007)
6. Input entirely                                (base.css already styles a bare input)
```

Everything above line 6 degrades to a token-styled native element that looks
intentional. Nothing above line 6 leaves a half-built control in the product.

**Not droppable, and why**, in [`tasks.md`](tasks.md). The short version: the tokens, the
brand/fixed split, `base.css`'s rule-17 block, the focus rings, logical properties, and
the CI gates. Every one of them is either the point of the feature or a defect that looks
like success.

### Accepted risk: four blueprint contradictions resolved by judgement

`research.md` R-5, R-6, R-7 record four places where two house documents give different
answers — radius, control height, ring intensity, badge height. Each is resolved with a
written reason and recorded as an open question in `spec.md`, and each is **one value in
one file** if the other answer is right, because no component contains a literal
(AC-17).

The risk is not that a value is wrong. It is that a reviewer reading ADR-009 finds 8px
and concludes the extraction was careless. That is why Q-A states the reasoning rather
than just the number.

### Accepted risk: `--brand` is not yet real

`spec.md` Q-E. The derivation, the computation, and the pre-paint application all ship
and are tested; the value they operate on is a literal. So AC-25 proves the mechanism and
not the delivery, and the demonstration of theming is what ADR-012 recommends — change
three variables in dev tools and watch the interface retint.

Stated plainly because "tenant theming works" would be a false claim. What works is the
architecture that makes it a settings screen rather than a rewrite.
