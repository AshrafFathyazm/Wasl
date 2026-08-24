# 006 — Frontend Spec

**This is the primary artifact of this feature.** There is no HTTP surface and no
schema; the component specification *is* the deliverable.

**Scope:** the application bootstrap, the token layer, and three primitives — `Button`,
`Input`, `Badge` — each with every state. No screen is built here. The screen specs live
in `docs/sdd/design/screens/` and each names the primitives it composes from.

**Frozen.** The props tables below are the contract `007` builds against. A change goes
through **Contract changes** in [`plan.md`](plan.md) first, exactly as an endpoint change
would.

---

## 1 · Application bootstrap

### Route table

One real route and one development route. Route-level code splitting only (ADR-011 §7),
which means every element is `lazy()` and nothing below a route is.

| Route | Element | Lazy | Exists because |
|---|---|---|---|
| `/` | `HomePage` — a placeholder naming the feature that will replace it | yes | A route table with no routes cannot demonstrate AC-2, and an application with no route does not run |
| `/_preview` | `PreviewPage` | yes | `spec.md` Q-G. Every state of all three primitives, with a direction toggle and a language toggle |

`/_preview` is **not** registered in production builds. The leading underscore is the
signal, and the guard is a build-time condition in `routes.tsx`, not a comment.

### Component kinds — ADR-011 §4

| Component | Kind | Fetches? | Knows the domain? |
|---|---|---|---|
| `HomePage`, `PreviewPage` | Route / page | No — there is nothing to fetch | No |
| — | Feature component | — | None exists in this feature |
| `Button`, `Input`, `Badge` | **Primitive** | **Never** | **No** — except `Badge`, and only through `statusTokens.ts` |

`Badge` is the exception `design/component-inventory.md` already flags: *"Badge is where
the domain leaks in."* It is the only primitive that knows a ticket has six statuses. The
leak is contained in one file, `statusTokens.ts`, keyed on **raw enum values** — never on
a displayed label, because a label is translated and an enum value is not (ADR-007 §3).

### Stylesheet import order — load-bearing

```ts
// main.tsx — this order, and no other
import './styles/tokens.css';   // 1. values
import './styles/theme.css';    // 2. the brand ramp, derived from those values
import './styles/base.css';     // 3. element defaults, consuming the semantics
import './styles/locale.css';   // 4. [lang="ar"] overrides, last so they win
```

### `base.css` — the degradation floor

The file that makes ADR-009's fallback real rather than aspirational. Two jobs:

**Job one: a bare element is already token-styled**, so if the timebox is hit with
`Input` half-built, the component is deleted and `<input>` is used directly. This is why
`plan.md`'s drop order can end in "use plain elements" without the result looking broken.

**Job two: DESIGN-BRIEF rule 17, discharged once.** Every native control gets all three
declarations, each with `!important`:

```css
button, input, select, textarea {
  background-color: var(--field-fill) !important;
  color: var(--text-primary) !important;
  -webkit-text-fill-color: var(--text-primary) !important;
}
```

`color-scheme: light` alone is not enough and an explicit hex alone is not enough — a
host stylesheet can win on specificity. The rule has been violated twice **after** being
written down, which is why a stylelint assertion on these three declarations is part of
AC-14 rather than a review item. `-webkit-text-fill-color` is not redundant: without it
Safari fades disabled input text regardless of `color`.

`base.css` also carries the global reduced-motion block from `design/motion.md` verbatim
(AC-23), and `box-sizing: border-box` on `*`.

### `locale.css` — per-locale metrics

`tokens.css` note 4 and `design/design-tokens.md` both record the defect: the source's
line height is 100% with cap-height vertical trim, which is tidy for single-line Latin
labels and **clips Arabic** — glyphs sit well below the baseline (final ي ج ع) and marks
sit above cap height (ث ض). It presents as a font rendering fault rather than a missing
token, which is precisely why it would survive review.

| Under `[lang="ar"]` | Value | Label |
|---|---|---|
| `line-height` (body) | `var(--leading-ar-normal)` — 1.75 | `(D)` |
| `line-height` (headings) | `var(--leading-ar-heading)` — 1.45 | `(D)` |
| `line-height` (single-line labels) | `var(--leading-ar-tight)` — 1.3 | `(D)` |
| Cap-height vertical trim | **Not applied at all** | `(D)` |
| `letter-spacing` | `0`, permanently | `(C)` + note 4 |
| `font-family` | `var(--font-ar)` | `(D)` — `spec.md` Q-15 |

Letter spacing stays 0 for Arabic **permanently**: Arabic is cursive, and positive
tracking breaks the joins between letters, producing text that is harder to read rather
than merely uglier. Any future tracking adjustment applies to Latin only.

---

## 2 · The token layer

### The two sets

ADR-012 §3 is the important architectural line, and the reason it matters is one
sentence: **status colour is meaning, not branding.** A tenant who sets "success" to red
has a product that lies to its users.

| Themeable — a tenant can change these | Fixed — a tenant cannot, and is told why |
|---|---|
| `--brand` | `--state-success-*` `--state-warning-*` `--state-danger-*` `--state-info-*` `--state-neutral-*` |
| `--brand-hover` `--brand-active` `--brand-subtle` `--brand-border` `--brand-ring` | The entire neutral ramp, `--text-*`, `--border-*`, `--surface-*` |
| `--on-brand` (computed) | Every status and priority colour in `statusTokens.ts` |
| `--action-primary-*`, via `--brand` | `--action-danger-*` — red means "needs attention now" (DESIGN-BRIEF rule 15), which is a state |
| `--action-secondary` hover tint, via `--brand-subtle` | `--teal-600` — teal marks presence, never state (`design/brand.md` §4) |

### The derivation

```css
--brand:        #1D174D;                                          /* (D) themeable */
--brand-hover:  color-mix(in oklab, var(--brand) 88%, white);
--brand-active: color-mix(in oklab, var(--brand) 82%, black);
--brand-subtle: color-mix(in oklab, var(--brand)  8%, white);
--brand-border: color-mix(in oklab, var(--brand) 24%, white);
--brand-ring:   color-mix(in oklab, var(--brand) 22%, transparent);
```

`oklab`, not HSL: a fixed percentage in a perceptual space steps consistently across
every hue, and the same percentage in HSL does not — which is why hand-tuned palettes
exist (ADR-012 §1).

**Each of the five is declared twice** — a static hex first, the `color-mix()` second.
An unsupported `color-mix()` in a custom property does not fall back to the previous
value; the declaration is invalid at computed-value time, the property resolves to
`unset`, and `background: var(--brand-hover)` therefore resolves to **transparent**. A
Primary button with no background reads as a page that failed to load. AC-8 asserts the
resolution rather than trusting it (`research.md` R-2).

The same two mixes are applied to `--action-danger-bg` to produce
`--action-danger-hover` and `--action-danger-active`, because no darker red exists in the
palette. Reason and justification: [`plan.md`](plan.md), *One generalisation of ADR-012*.

### The computed foreground

White text on a light yellow brand is unreadable. Hard-coding `--on-brand: white` means
the first tenant who picks a pale colour gets an unusable product — and it fails for only
*some* tenants, which is why it ships (ADR-012 §2).

```ts
// lib/theme/onBrand.ts
export const onBrand = (brand: string): string =>
  ratio(brand, '#FFFFFF') >= ratio(brand, '#0D2626') ? '#FFFFFF' : '#0D2626';
```

`ratio` and `luminance` are the WCAG relative-luminance formulas in
`lib/theme/contrast.ts`, roughly fifteen lines, taken from `design/theming.md`.

**A brand colour reaching 4.5:1 against neither candidate is rejected** with a named
reason (AC-7). Refusing a colour is better than rendering text nobody can read. The
function refuses here; the *screen* that shows the refusal is `022`.

**The test fixture is the point.** At least twelve candidates including a light yellow, a
pale mint, and a near-white grey — because theming fails for some tenants and not all,
and a fixture of dark blues proves nothing (AC-6, `TEST-006-01`).

### Provenance — why every token carries a label

```text
(A) Vector exports — 7 SVGs. Colours exact, geometry exact at 1:1
(B) Shipped app screenshots — indicative only; every value measured this way that was
    later checked against a layer turned out wrong
(C) Figma layer inspect — exact, and authoritative wherever it disagrees
(D) Our decision, because the source system has no answer
```

A token whose provenance is unrecorded gets "corrected" later by whoever compares it
against whichever source they happened to open (ADR-009). An unlabelled property fails
`npm run lint:tokens` (AC-4).

The `(C)`-over-`(B)` precedence in that legend is what resolves the four blueprint
contradictions in `research.md` R-5, R-6, and R-7 — and it is why the corner radius here
is 4px and not ADR-009's 8px, which was measured off a picture.

### Picking a token

Two rules, and the second is the one that gets broken:

1. **A component consumes semantic tokens only.** `var(--action-primary-bg)`, never
   `var(--navy-900)`. The primitive is the value; the semantic is the meaning, and only
   the meaning belongs in a component (DESIGN-BRIEF rule 2). Enforced by AC-18 — a
   separate gate from AC-17, because a primitive token passes a no-literals check and
   still silently breaks theming.
2. **Brand tokens and status tokens are different categories.** Needing a brand colour
   means `--brand` or a derived token; needing a status colour means a fixed one. Getting
   this backwards is the only way to break theming from inside a component
   (`design/theming.md`).
3. **If a needed token does not exist, stop and say so.** Do not invent one. An invented
   token is indistinguishable from a real one until someone tries to change it upstream,
   and then it silently does not change (DESIGN-BRIEF rule 3). This rule was applied
   twice in this feature: `spec.md` Q-B (no `--button-height-field`) and the `Badge` dot
   size, which is added to `tokens.css`'s COMPONENTS block as `--badge-dot-size` `(D)`
   rather than written as `7px` in a component.

---

## 3 · `Button`

### Props

```ts
type ButtonType = 'primary' | 'secondary' | 'danger';

interface ButtonProps {
  buttonType?: ButtonType;        // default 'primary'
  text?: string;                  // the label. Already translated by the caller
  withText?: boolean;             // default true. false ⇒ icon-only ⇒ aria-label required
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
  disabled?: boolean;
  loading?: boolean;              // implies disabled
  type?: 'button' | 'submit';     // native. default 'button'
  onClick?: () => void;
  'aria-label'?: string;          // REQUIRED when withText is false
}
```

**Three deliberate divergences from the upstream component contract**, each with its
reason, because `design/component-inventory.md` says this component is *matched* rather
than designed and a silent divergence would look like carelessness:

| Upstream | Here | Reason |
|---|---|---|
| `With left icon` / `With Right Icon` | `iconStart` / `iconEnd` | The upstream names encode a physical direction this product cannot honour. A prop called `leftIcon` that renders on the right under `dir="rtl"` is a name that lies, and someone will eventually "fix" it by flipping the CSS |
| `Type: Primary \| Secondary - Outline` | plus `danger` | `012` closes a ticket and `016` escalates; both are destructive or terminal, and `design/layout-patterns.md` reserves red for them. Adding it now costs one CSS block; adding it later means touching the component during a story about state transitions |
| `Status: Default` (other states as Figma variants) | `disabled` and `loading` as props | DESIGN-BRIEF rule 8: disabled and loading are states of a component, never separate components. The variant axis stays `buttonType`; status is orthogonal — which matches the upstream API's own separation |

`withText` is **kept** from upstream deliberately. It is how an icon-only button is
expressed without a second component, and it is the hook that lets the component
*require* an `aria-label` when text is absent — a rule the design cannot enforce and the
component can (AC-11).

### Geometry — `MD`, the only size

| Property | Token | Value | Source |
|---|---|---|---|
| Height | `--button-height-md` | 40px | `(C)` |
| Padding-inline | `--button-padding` | 12px | `(C)` |
| Gap, icon to label | `--button-gap` | 4px | `(C)` |
| Radius | `--button-radius` → `--radius-sm` | 4px | `(C)` — and `spec.md` Q-A |
| Border | `--button-border` | 1px, on **all three types** including Primary | `(C)` |
| Width | hug content, `white-space: nowrap` | — | `(C)` |
| Font | `--text-ui` / `--weight-medium` | 14px / 500 | `(C)` |

Primary carries a 1px border of its own background colour. That is not decoration — it
is what keeps Primary and Secondary the same total height so they align in a button row.

`white-space: nowrap` and the parent owns the overflow: an Arabic label is frequently
longer than its English counterpart, and a 40px button that wraps breaks the row height
for everything beside it.

### Primary — state × token

| State | Background | Border | Label | Ring |
|---|---|---|---|---|
| Default | `--action-primary-bg` → `--brand` | same | `--action-primary-text` → `--on-brand` | — |
| Hover | `--brand-hover` | `--brand-hover` | `--on-brand` | — |
| Active | `--brand-active` | `--brand-active` | `--on-brand` | — |
| Focus-visible | `--brand` | `--brand` | `--on-brand` | 3px `--brand-ring` |
| Disabled | `--brand-subtle` | `--border-subtle` | `--text-placeholder` | — |
| Loading | `--brand` | `--brand` | replaced by the indicator, at `--on-brand` | — |

### Secondary-Outline — state × token

| State | Background | Border | Label | Ring |
|---|---|---|---|---|
| Default | `--action-secondary-bg` | `--action-secondary-border` | `--action-secondary-text` | — |
| Hover | `--brand-subtle` | `--brand-border` | `--action-secondary-text` | — |
| Active | `--surface-sunken` | `--border-default` | `--action-secondary-text` | — |
| Focus-visible | `--action-secondary-bg` | `--brand` | `--action-secondary-text` | 3px `--brand-ring` |
| Disabled | `--surface-sunken` | `--border-subtle` | `--text-placeholder` | — |
| Loading | `--action-secondary-bg` | `--action-secondary-border` | indicator at `--text-primary` | — |

### Danger — state × token

| State | Background | Border | Label | Ring |
|---|---|---|---|---|
| Default | `--action-danger-bg` | same | `--Main-White-White` (fixed — see below) | — |
| Hover | `--action-danger-hover` | same | fixed white | — |
| Active | `--action-danger-active` | same | fixed white | — |
| Focus-visible | `--action-danger-bg` | same | fixed white | 3px `--action-danger-ring` |
| Disabled | `--state-danger-bg` | `--border-subtle` | `--text-placeholder` | — |
| Loading | `--action-danger-bg` | same | indicator, fixed white | — |

Danger's foreground is **fixed white, not `--on-brand`**. `--action-danger-bg` is a fixed
token, so its foreground is fixed too. Using `--on-brand` here would make a destructive
button's label depend on the tenant's brand colour, which is the exact category error
ADR-012 §3 and DESIGN-BRIEF rule 2b exist to prevent.

Danger's ring is `color-mix(in oklab, var(--action-danger-bg) 22%, transparent)` — the
brand ring on a red button would be two competing signals.

### Decisions taken here, labelled

`design/design-tokens.md` records interaction states as **not extracted**, and the
source's own notes list hover as unresolved. So every hover, active, focus, and disabled
value above is ours. DESIGN-BRIEF: *"Where upstream has not decided, decide and write it
down."*

| Decision | `(D)` because | The alternative, and why not |
|---|---|---|
| Disabled Primary is `--brand-subtle` with `--text-placeholder` | The shipped app's disabled primary is a muted brand at roughly 40% (`design/layout-patterns.md`, login note). At 40% the control still reads as **actionable**; at 8% with placeholder text it reads as unavailable | A 40% mix, matching the shipped app more closely. Rejected: `--on-brand` is computed for the *base* brand and does not necessarily hold on the mixed colour, so the label's contrast would become unpredictable per tenant. `--brand-subtle` already exists in the ramp and needs no new token |
| No `opacity` for the disabled state | `opacity` also fades the focus ring and any icon, inconsistently, and a faint focus ring is an accessibility defect that looks like a style choice | `opacity: .5`, the common shortcut |
| Secondary's hover is `--brand-subtle`, not a neutral | It is the cheapest place for a theme change to be visible on a control the user touches constantly, and ADR-012's promise is that "the interface follows" | `--surface-subtle`, a neutral. Defensible; rejected because a fully neutral secondary means a brand change is invisible on two thirds of the buttons in the product |
| One ring intensity, `--brand-ring` at 22%, on Button and Input alike | `spec.md` Q-C. ADR-012 defines a token; `10-shared-patterns.md`'s "10%" is prose with nothing behind it | Two intensities. Rejected — that is exactly the inconsistency a token layer exists to remove |
| The ring is `box-shadow`, not `outline` | `box-shadow` follows `border-radius`; `outline` does not on every engine, and a square ring around a 4px-rounded button looks like a rendering fault. `outline-offset` is set anyway so a forced-colours mode still shows something | `outline: 3px` |

### Loading

| Requirement | Detail | AC |
|---|---|---|
| The indicator | The converge loader from `design/brand.md` §2 at reduced travel: three dots, 1.45s, `cubic-bezier(.4,0,.5,1)`. `brand.md` says it replaces the spinner **everywhere**; the 34px travel does not fit a 40px button, so the distance shrinks and nothing else does | `spec.md` Q-F |
| Width invariant | The button's rendered width **does not change** between default and loading. The label is hidden with `visibility: hidden` and the indicator absolutely positioned over it, so the label continues to reserve its own width | AC-10 |
| Disabled while loading | `loading` implies `disabled`, so a double-click sends one request. This is the component half of `007` AC-17 | — |
| Announcement | `aria-busy="true"`; the accessible name is **unchanged**. No "Loading…" string is introduced, because a primitive holds no strings | AC-24 |
| Reduced motion | The three dots and the node render statically | AC-23 |

### RTL

| Concern | Behaviour |
|---|---|
| `iconStart` | Renders at the inline-start. Under `dir="rtl"` that is the right-hand side, with no CSS change — the flex order does the work |
| Padding and gap | `padding-inline`, `gap`. No physical property appears anywhere (AC-19) |
| Which icons mirror | Chevrons and arrows mirror because they are directional; check marks, the escalate glyph, and the channel glyphs do not. That is the icon set's job (`design/icons.md`) and not the Button's. The Button's contract is only that the **slot** is logical |
| Label direction | `dir="auto"` is **not** set. A Button label is interface copy from the catalogue, not user content, so its direction follows the document. Setting `dir="auto"` on interface copy is how a mixed-script label ends up aligned against the page |

### Accessibility

| Requirement | How | Verified by |
|---|---|---|
| Native `<button>` | Keyboard activation, form participation, and the accessibility tree come free. This is why no headless library is needed for this primitive | — |
| Focus ring under `:focus-visible` | 3px ring, present in a light host **and** a dark host. `outline: none` without a replacement fails review | AC-20, `TEST-006-13` |
| Icon-only requires `aria-label` | `withText === false` and no `aria-label` throws in development and fails a test. The design cannot enforce this; the component can | AC-11 |
| Disabled is conveyed, not only styled | The native `disabled` attribute, so it is in the accessibility tree | AC-9 |
| Target size | 40px tall clears WCAG 2.2 SC 2.5.8 (24px minimum). It does not reach the 44px AAA target, and that is recorded rather than claimed | — |
| Contrast | Every enabled state pair measured and recorded in `tests.md`. The **disabled** pairs are exempt under WCAG 1.4.3; the exemption is recorded with the measured ratio so it is a decision and not an oversight | `TEST-006-13` |

### Not in `Button`

| Excluded | Where |
|---|---|
| A second or third size | The screen that needs one. Only `MD` is confirmed by inspect |
| A dropdown / split button | `012` — `design/layout-patterns.md`'s *Take Action* menu, rendered from `allowedTransitions` |
| A link that looks like a button | Nowhere. An anchor and a button have different keyboard and context-menu behaviour, and conflating them is a common accessibility defect |
| An icon set | `design/icons.md`, at its first consumer. `iconStart`/`iconEnd` take a `ReactNode`; nothing fills them in this feature |
| A `reason` prop for a forbidden action | Nowhere. `spec.md`'s permission edge case: a disabled control receives no focus, so an explanation attached to it is unreachable by keyboard. The forbidden case renders the control **enabled with the explanation inline beside it** (`10-shared-patterns.md`), and that is the screen's composition |

---

## 4 · `Input`

### Props

```ts
interface InputProps {
  id?: string;                    // generated with useId when absent
  label: string;                  // REQUIRED. Already translated by the caller
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  required?: boolean;             // renders the marker; does NOT validate
  placeholder?: string;
  helperText?: string;
  error?: string;                 // presence ⇒ the error state. Replaces helperText
  disabled?: boolean;
  multiline?: boolean;            // renders a <textarea>
  rows?: number;                  // multiline only. default 4
  size?: 'sm' | 'md' | 'lg';      // default 'md'
  inputMode?: 'text' | 'email' | 'tel' | 'numeric';
  maxLength?: number;             // native attribute only; not a validator
}
```

**`label` is required, not optional.** A placeholder standing in for a label is the most
common form accessibility defect and it disappears the moment the user types.

**`error` is a `string`, not a `boolean`.** The component **renders** validity; it never
**decides** it. There is no validation inside this primitive — no regex, no length
check, no required check. `required` renders the marker and nothing else. The mirror rule
in [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md) is the same rule stated for a
feature with no API: the client may mirror a rule to tell the user sooner, and it is
never the authority (constitution principle III).

### Geometry

| Property | Token | Value | Source |
|---|---|---|---|
| Height `sm` / `md` / `lg` | `--field-height-sm` / `-md` / `-lg` | 39 / 47 / 51px | `(A)` |
| Radius | `--field-radius` → `--radius-sm` | 4px | `(C)` |
| Fill | `--field-fill` | `#F9FAFB` | `(A)` |
| Border | `--field-border` | 1px `--Neutral-200` | `(A)` |
| Padding-inline | `--space-3` | 12px | `(C)` — matches the Button's, so a field and a button in one row align on their text |
| Label gap | `--space-2` | 8px | `(C)` |
| Label | `--text-label` / `--weight-medium` | 14px / 500 | `(C)` |
| Helper / error | `--text-helper` | 12px | `(C)` |
| Required marker | `*` in `--state-danger-text`, **after** the label | — | `(B)`, and `10-shared-patterns.md` |

`10-shared-patterns.md` gives the label gap as 7. **8px is used**, and the divergence is
deliberate: Q-13 confirms the 8pt grid holds all the way up (8, 16, 24, 56 all verified on
layers), and 7 came from a measurement. One pixel, and honouring the grid keeps the field
on the same rhythm as everything beside it.

`multiline` resizes on the block axis only. Horizontal resize breaks the form's column
width, and a user dragging a textarea wider than its container is a layout defect they
caused and will report.

### State × token

| State | Fill | Border | Text | Ring | Message |
|---|---|---|---|---|---|
| Default | `--field-fill` | `--border-subtle` | `--text-primary` | — | helper, `--text-muted` |
| Placeholder shown | `--field-fill` | `--border-subtle` | `--text-placeholder` | — | helper |
| Hover | `--field-fill` | `--border-default` | `--text-primary` | — | helper |
| Focus | `--Main-White-White` | `--brand` | `--text-primary` | 3px `--brand-ring` | helper |
| Disabled | `--surface-sunken` | `--border-subtle` | `--text-placeholder` | — | helper, muted |
| Error | `--field-fill` | `--state-danger-text` | `--text-primary` | — | error, `--state-danger-text` |
| Error + focus | `--Main-White-White` | `--state-danger-text` | `--text-primary` | 3px danger-tinted | error |
| Read-only | — | — | — | — | **not built** — see *Not in `Input`* |

The field **lightens to white on focus** — from `--field-fill` to
`--Main-White-White`. Taken from `10-shared-patterns.md`, and worth keeping: it is a
second, non-colour signal that this is the active field, which matters for anyone who
cannot distinguish the border colour change.

**Error + focus keeps the red border and tints the ring red.** A brand ring around a red
border is two competing signals, and the user needs to know both *where they are* and
*that it is wrong*.

### Behaviour

| Rule | Detail | AC |
|---|---|---|
| The error **replaces** the helper | Never stacked. Two messages under one field means the user reads the wrong one | AC-12 |
| Errors appear on **blur** | Not on each keystroke. Validating as someone types tells them they are wrong before they have finished being right (`10-shared-patterns.md`). The component does not decide this — it renders whatever `error` holds, and the **caller** supplies it on blur. The primitive's obligation is to expose `onBlur` so a caller can | AC-12 |
| `aria-invalid` and `aria-describedby` | `aria-invalid="true"` in the error state; `aria-describedby` points at the message element, whichever of helper or error is currently rendered. Queried in tests by accessible description, never by class name | AC-13 |
| No live region | `aria-describedby` only. The error appears on blur, when the user is already moving to the next field; an `aria-live` region would interrupt them mid-field. Rejected alternative recorded so the omission is a decision |  |
| Label association | `htmlFor` / `id`, with `useId()` when no `id` is given. Never a placeholder as the label | AC-13 |
| `dir="auto"` on the control | Always. An Arabic name typed into an English form is normal, and without it the punctuation lands at the wrong end and reads as a typo (ADR-007 §8) | AC-21 |
| Disabled text in Safari | `-webkit-text-fill-color` set explicitly. Without it Safari fades disabled input text regardless of `color` — one browser, silently | AC-14 |
| Native colours never inherited | `background-color`, `color`, and `-webkit-text-fill-color` all `!important`, from `base.css` | AC-14 |

### Not in `Input`

| Excluded | Where |
|---|---|
| A character counter | Droppable scope. `10-shared-patterns.md` specifies one appearing at 90% of the maximum; the field that needs it is `007`'s `notes`, and it can carry it as a sibling element until a second field wants one (ADR-011 §3) |
| Prefix / suffix icons, a clear button | The screen that needs one. `015`'s search field is the likely first |
| A password reveal toggle | The login screen, Phase 6 |
| Any validation | Nowhere in this primitive. Zod in the form (`007`), FluentValidation at the boundary, invariants in the domain. Three places, and none of them is a `<span>` |
| A read-only state | Not built. `component-inventory.md` does not list one and no screen needs one; a disabled field is not a substitute and the distinction is recorded so it is not conflated later |
| Masking or formatting as you type | Nowhere. `007` establishes that E.164 normalisation is the **server's** (BR-4.3), and a client-side mask would be a second implementation of one rule |
| `Select`, `Checkbox` | `009`/`015` and `013`. An `Input` is not a `Select` with a different `type` |

---

## 5 · `Badge`

The only primitive that encodes domain meaning: six statuses, four priorities,
escalated, internal — twelve variants (`design/component-inventory.md`).

### Props

```ts
type BadgeVariant =
  | 'status'      // value is a TicketStatus enum value
  | 'priority'    // value is a TicketPriority enum value
  | 'escalated'
  | 'internal';

interface BadgeProps {
  variant: BadgeVariant;
  value?: string;    // the RAW, untranslated enum value. Required for status/priority
  label: string;     // REQUIRED, always. Already translated by the caller
}
```

**`label` is required and there is no way to omit it.** Never convey meaning by colour
alone: colour fails for colour-blind users and in a monochrome print of a report
(DESIGN-BRIEF rule 14). A `Badge` with no label is a TypeScript error, and AC-15 asserts
it (AC-15).

**`value` is the raw enum value, never the displayed label.** Enum values are not
translated (ADR-007 §3), so keying the colour map on the value is locale-independent.
Keying it on the label would render neutral for every Arabic user and nothing would
fail — no exception, no test failure, no visible error in English.

### Shape

| Property | Token | Value | Source |
|---|---|---|---|
| Height | `--chip-height` | 20px | `(A)` — and `spec.md` Q-D, against `10-shared-patterns.md`'s "h22" |
| Radius | `--chip-radius` → `--radius-pill` | 999px | `(A)` |
| Padding-inline | `--space-2` | 8px | `(C)` |
| Dot size | `--badge-dot-size` | 7px | `(D)` — **new**, added to `tokens.css`'s COMPONENTS block, not written as a literal in the component (DESIGN-BRIEF rule 3) |
| Dot gap | `--space-1` | 4px | `(C)` |
| Label | `--type-label-sm` / `--weight-medium` | 12px / 500 | `(C)` |
| Border, outline tone | `--border-width` | 1px | `(A)` |

**The dot is the status token; the pill is only its container** — taken directly from the
shipped app (ADR-009, `design/layout-patterns.md`). In the ticket list's status tab bar
the dot appears bare beside a count; in a table cell it sits inside a tinted pill with a
label. One idea, two presentations.

`statusTokens.ts` exports the map so `010`'s tab bar reuses the mapping **without a
`dotOnly` Badge variant existing before there is a caller** — ADR-011 §3: move something
when the second consumer appears, not when one is imagined.

### The twelve variants

Two tones. `filled` is a *tinted* background with coloured text and a coloured dot —
not a solid block, because the shipped app uses a tinted pill and the Figma export's solid
block lost that comparison (ADR-009). `outline` is transparent with a 1px coloured border.

| Variant | Value | Tone | Background | Text + dot | Decided by |
|---|---|---|---|---|---|
| Status | `New` | filled | `--state-neutral-bg` | `--state-neutral-text` | `layout-patterns.md` — untriaged is the absence of a state, not a state |
| Status | `Open` | filled | `--state-info-bg` | `--state-info-text` | `layout-patterns.md` — accepted, waiting |
| Status | `InProgress` | filled | `--state-warning-bg` | `--state-warning-text` | `layout-patterns.md`, matching theirs |
| Status | `PendingCustomer` | **outline** | transparent | `--state-warning-text` | `layout-patterns.md` — waiting, but not on us |
| Status | `Resolved` | filled | `--state-success-bg` | `--state-success-text` | `layout-patterns.md`, matching theirs |
| Status | `Closed` | **outline** | transparent | `--state-neutral-text` | `layout-patterns.md` — terminal and quiet |
| Priority | `Low` | **outline** | transparent | `--state-success-text` | `layout-patterns.md` risk mapping + `10-shared-patterns.md` tone rule |
| Priority | `Normal` | **outline** | transparent | `--state-warning-text` | same |
| Priority | `High` | filled | `--state-warning-bg` | `--state-warning-text` | same |
| Priority | `Critical` | filled | `--state-danger-bg` | `--state-danger-text` | same. Red means "needs attention now" |
| `escalated` | — | icon + label | transparent | `--state-danger-text` | `10-shared-patterns.md` |
| `internal` | — | **outline** | transparent | `--state-neutral-text` | `(D)` — see below |
| *(fallback)* | anything unmapped | filled | `--state-neutral-bg` | `--state-neutral-text`, label = the raw value | AC-15 |

**Red is reserved.** `Critical` priority, the escalated flag, and destructive actions —
never "this ended badly". `Closed` is grey (DESIGN-BRIEF rule 15). That is what makes red
on a ticket always mean "attention now".

**`internal` is `(D)`.** Upstream has no equivalent. It is a *property* of a comment, not
a state of a ticket, so it must not compete with a status colour for attention — neutral
outline, and it reads as metadata rather than as a signal.

**`escalated` diverges from `10-shared-patterns.md`, deliberately.** That document
specifies "icon only, `--red-600`, with a `title`". A `title` attribute is not reliably
reachable by keyboard and is not announced consistently, so an icon-only badge whose only
label is a `title` conveys nothing to a screen reader user. Here it renders the icon
**plus a visually-hidden text label**. Same appearance, and the meaning is actually
available. Recorded as a divergence with its reason.

### Behaviour

| Rule | Detail | AC |
|---|---|---|
| Unknown value | Neutral tokens, and the **raw value** as the label. Never blank, never the i18n key, never an exception. A new status added server-side then renders legibly and looks unstyled, which is a visible prompt rather than a silent gap | AC-15 |
| Not interactive | A `<span>`, no `tabIndex`, no focus ring. A badge that is not a filter chip must not look focusable | — |
| No brand token, ever | AC-16 asserts it by setting `--brand` to an unmissable colour and reading every variant's computed background, colour, and border | AC-16 |
| Greyscale | Every variant remains distinguishable by its label under `filter: grayscale(1)`, observed on the preview page | AC-15 |
| No `dir="auto"` | A Badge label is interface copy from the catalogue, not user content. `dir="auto"` on interface copy is how a mixed-script label ends up aligned against the page | AC-21 |
| Counts stay Latin | Where a Badge sits beside a count, the digits are Latin in both locales — `ar-u-ca-gregory-nu-latn` (ADR-007 §7, BR-8.13). The formatter is `007`'s `lib/formatters.ts`; the Badge only must not fight it | — |
| Dot position | Inline-start, by `margin-inline-end`. It moves side under `dir="rtl"` with no CSS change | AC-21 |

### Not in `Badge`

| Excluded | Where |
|---|---|
| A `dotOnly` variant | `010`, if the tab bar wants it. The **map** is exported now; the variant waits for its caller |
| A removable / dismissible chip | `015`'s filter chips, if that screen needs them. A dismissible chip is interactive and has a focus ring, a keyboard affordance, and a click target — a different component wearing the same shape |
| A count bubble | Nowhere yet. The status tab bar composes the exported dot with its own count |
| An avatar or an icon slot | Nowhere. `escalated` carries the one icon this primitive knows about |
| The status→colour decision itself | Already made, in `design/layout-patterns.md`. This file cites it; it does not re-decide it. The mapping is a **product** decision (which status the team must notice first), not a design-system one |

---

## 6 · The preview route

`/_preview`, not registered in production builds. `spec.md` Q-G, `research.md` R-10.

| Region | Contents |
|---|---|
| Controls | `dir` toggle (`ltr` / `rtl`), `lang` toggle (`en` / `ar`), a greyscale toggle, and a brand-colour input |
| Button | All 18 type × state cells, plus icon-start, icon-end, and icon-only |
| Input | All 7 states at all 3 sizes, plus `multiline`, plus a long Arabic value and a long English value in the same field |
| Badge | All 12 variants, plus the unknown-value fallback |
| Type scale | Every `--text-*` role rendered in both families, so the Arabic clipping check (AC-22) has something to look at |
| Palette | Every semantic token as a labelled swatch, so a missing or mis-pointed token is visible rather than inferred |

The brand-colour input is the demonstration ADR-012 recommends — *"change three
variables in dev tools and watch the interface retint, which proves the architecture more
convincingly than a settings page proves anything"* — with the input making it one
gesture instead of three. It calls the same `applyTheme()` that `022` will call, and
refusing an unreadable colour there is AC-7 visible rather than asserted.

It is **not** Storybook: one route, no build, no addons (ADR-011).

It is also the Phase-3b preview harness `007` and `008` reuse, which is what makes it
worth keeping rather than throwing away. `design/preview-first-workflow.md`'s checklist —
do the native controls render with the intended colours, does the longest realistic value
fit in both languages, is the Arabic genuinely right-to-left, is every element reachable
by keyboard with a visible focus ring, does a badge still carry meaning in greyscale — is
the same checklist AC-14, AC-20, AC-21, AC-22, and AC-15 encode, and the preview page is
where they are answered.

---

## 7 · Localization

### This feature introduces zero i18n keys

Not "few" — zero. Every label, placeholder, helper, and error arrives as a **prop**,
already translated by the caller, because `design/component-inventory.md` forbids a
user-facing string inside a primitive and AC-24 enforces it with a lint rule on JSX text
content.

So there is no keys table to fill in, and the honest artifact is the table of what this
feature **owes** and what it **requires of its callers**:

| Item | Owner | Note |
|---|---|---|
| `react-i18next`, the `en`/`ar` catalogues, the parity test | **`007`** | The first user-facing string exists there. Scaffolding a catalogue with nothing in it is scaffolding (`research.md` R-8) |
| The language switch, and the Arabic walk of every screen | **`014`** | Its story |
| `dir` and `lang` on the document root | **`006`** — here | AC-21 and AC-22 cannot be verified without them |
| The `[lang="ar"]` typography block | **`006`** — here | Token work, not string work. Without it, `014`'s Arabic pass would open by discovering every Arabic line in the product is clipped |
| Every string these primitives render | **The caller** | `Button.text`, `Button['aria-label']`, `Input.label` / `placeholder` / `helperText` / `error`, `Badge.label`. Each is a required-or-optional prop in the tables above, and each must come from the caller's catalogue in both `en` and `ar` (BR-8.8, BR-8.11) |
| Server-authored messages | The server | Already translated on arrival (BR-8.6). `Input.error` renders what it is given; it never re-translates or maps |

### What must never be translated, and what these primitives do about it

| Never translated (BR-8.7, ADR-007 §3) | Consequence here |
|---|---|
| Enum values | `Badge.value` is the raw enum value. `statusTokens.ts` keys on it. A map keyed on a **label** would render neutral for every Arabic user, silently |
| `ProblemDetails.type`, the keys of `errors` | Not consumed in this feature; recorded so `007` does not start mapping them |
| `TicketNumber`, `traceId` | Not consumed here. When they are, they carry `font-variant-numeric: tabular-nums` and Latin digits (`component-inventory.md`, BR-8.13) |

---

## 8 · Right-to-left obligations

Every one of these is a rule the primitives must satisfy, and most of them look correct
in English forever.

| Concern | Requirement | Verified by |
|---|---|---|
| Direction | `dir` on the document root, set once (ADR-007 §6). No component reads or sets it | AC-21 |
| Logical properties only | `margin-inline-start`, `padding-inline`, `inset-inline-start`, `text-align: start`. Never `margin-left`, `padding-right`, bare `left`/`right`, or `text-align: left`. stylelint fails the build | AC-19 |
| No mirrored stylesheet, no auto-flipping tool | Rejected by ADR-007 §6: it doubles what is maintained and flips things that must not flip — code, phone numbers, and the ticket number among them | — |
| `Button` icon slot | `iconStart` / `iconEnd`, resolved by flex order. Renaming from the upstream `left`/`right` is the point: a prop name that encodes a physical side will eventually be "fixed" by flipping the CSS | AC-21 |
| `Badge` dot | Inline-start, by `margin-inline-end`. Moves side with no CSS change | AC-21 |
| `Input` label, helper, and error | `text-align: start`. They stay on the reading-start edge in both directions | AC-21 |
| `Input` value | `dir="auto"`, always. An Arabic name in an English form is normal; without it the punctuation lands at the wrong end and reads as a typo (ADR-007 §8) | AC-21 |
| Interface copy | **No** `dir="auto"` on `Button.text` or `Badge.label`. They are catalogue strings and follow the document; `dir="auto"` on interface copy is how a mixed-script label ends up aligned against the page | AC-21 |
| Which icons mirror | Chevrons and arrows mirror; check marks, the escalate glyph, and channel glyphs do not. The icon set owns this (`design/icons.md`); the Button's contract is only that its slot is logical | — |
| Digits | Latin in both locales — `ar-u-ca-gregory-nu-latn`. A ticket number rendered `TCK-٢٠٢٦-٠٠٠٠٤٢` is unsearchable against the stored value and unusable read aloud (ADR-007 §7, BR-8.13) | — |
| Arabic vertical metrics | `--leading-ar-*` under `[lang="ar"]`; cap-height trim **not applied** there at all. Verified with ث ض above cap height and final ي ج ع below the baseline | AC-22 |
| Arabic tracking | `0`, permanently. Arabic is cursive; positive tracking breaks the joins between letters | AC-22 |

`TEST-006-13` walks every state of all three primitives in Arabic at `dir="rtl"` and
records what it found in `tests.md`. **RTL defects are visual** — no assertion catches a
container sized to English label text, which is why the Arabic pass is a deliverable and
not a check (`docs/sdd/testing/test-strategy.md`).

---

## 9 · Accessibility

| Requirement | Applies to | How | Verified by |
|---|---|---|---|
| Keyboard reachable, with a **visible** focus ring under `:focus-visible` | Button, Input | 3px `box-shadow` ring plus `outline-offset` so a forced-colours mode still shows something. `outline: none` with no replacement is a defect, not a style choice (DESIGN-BRIEF rule 9) | AC-20, `TEST-006-13` |
| A ring visible in a **dark** host as well as a light one | Button, Input | The ring is a brand-derived colour on a token-set background, not a colour that happens to contrast with white | AC-20 |
| Programmatic label, never a placeholder standing in for one | Input | `label` is a required prop; `htmlFor`/`id` with `useId()` | AC-13 |
| Error associated with the control | Input | `aria-invalid="true"` + `aria-describedby`. Queried in tests by accessible description, never by class name | AC-13 |
| Icon-only control has an accessible name | Button | `withText === false` without `aria-label` throws in development and fails a test | AC-11 |
| Disabled conveyed, not only styled | Button, Input | The native `disabled` attribute | AC-9 |
| Busy conveyed | Button | `aria-busy="true"` while loading; the accessible name unchanged | AC-10 |
| Meaning never carried by colour alone | Badge | `label` is required and cannot be omitted; every variant readable in greyscale | AC-15 |
| Not-interactive elements are not focusable | Badge | A `<span>`, no `tabIndex` | — |
| Motion respects the user | All three | `prefers-reduced-motion: reduce` reduces every transition to ≈0 and renders the loading indicator statically. For some people motion is nausea, not taste | AC-23 |
| Contrast | All three | Every enabled state pair measured and recorded. The disabled pairs are exempt under WCAG 1.4.3, and the exemption is recorded with its ratio so it is a decision | `TEST-006-13` |
| Target size | Button | 40px clears SC 2.5.8's 24px minimum; it does not reach the 44px AAA target, and that is recorded rather than claimed | — |
| No motion on a working surface over 300ms | All three | 100ms for hover/focus/colour, 150ms for anything appearing (`design/motion.md`). `transform` and `opacity` only — animating `width` forces a layout pass per frame | AC-23 |

---

## 10 · Not in this feature

| Excluded | Where it lives |
|---|---|
| `Select` | `009` / `015`. The largest of the eight, and a half-built one is exactly what ADR-009 says looks broken |
| `Checkbox` | `013` — the internal-comment toggle |
| `Table` | `008` / `010`. Its column rules are already written in `design/component-inventory.md` |
| `Modal` | `012`. Tokens and behaviour already in `10-shared-patterns.md` |
| `Toast` | `007`. A toast is a system — a portal, a stack, a timer per item, a manual-dismiss path for errors — not a component |
| Any screen | `docs/sdd/design/screens/`, built by the feature that owns each |
| The app shell, sidebar, header, breadcrumb, page header | `008`. Geometry in `design/layout-patterns.md`, and it is exact — the arithmetic closes at 288 + 1152 = 1440 |
| Sidebar presets Light / Dark / Brand | `008` / `022`. Specified in `design/theming.md`; nothing renders a sidebar yet |
| The tenant settings screen | `022`. ADR-012: build the architecture in the skeleton, defer the screen |
| Dark mode | Nowhere. `color-scheme: light`; this product has one appearance (DESIGN-BRIEF rule 16) |
| The login screen, its dark panel, the orbs, the neural mesh | Phase 6. `design/screens/01-login.md`; `design/motion.md` confines expressive motion there and nowhere else |
| The icon set | `design/icons.md`, at its first consumer. Any set adopted must be drawn at 1.5px stroke or it reads as a different weight beside everything else |
| The product mark and the empty-state vocabulary | `design/brand.md`, at their first consumer |
| The converge **page** loader | `design/brand.md` §2, at its first consumer. Only the reduced-travel button variant ships here |
| Storybook | Nowhere (ADR-011) |
| A component library, headless or styled | Nowhere. Reconsidered and re-rejected in `plan.md` |
| Visual regression testing | Nowhere. `docs/sdd/testing/test-strategy.md` excludes styling, layout, and snapshots by name |
| `react-i18next`, TanStack Query, React Hook Form, Zod | `007`. Each arrives with its first consumer |
