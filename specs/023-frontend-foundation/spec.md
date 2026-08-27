# 023 — Frontend Foundation

**Phase:** 0 · **Story:** — (infrastructure, not a user story) ·
**Status:** Specified, awaiting review · **Lane:** Frontend only

Nothing in `src/Wasl.Api`, `src/Wasl.Application`, `src/Wasl.Domain`,
`src/Wasl.Infrastructure`, or `tests/` is created, changed, or read as a source of truth
by this feature. The only directories it writes are `src/wasl-web/` and
`specs/frontend-foundation/`.

---

## 0 · Source of truth, and the one thing that was corrected

### The reference

[`docs/sdd/design/`](../../docs/sdd/design/) is the **only** design reference. Every
value, geometry, rule, and state table in this specification resolves there.

**[`specs/006-design-system/`](../006-design-system/) is disregarded.** Its values were
taken from screens rather than from layers, and it was authored without sight of the
Abyan design. It is read for **one** thing and nothing else: the *shape* of its
TypeScript props tables — the convention of declaring a primitive's contract as an
`interface` with a comment per prop. Where 006 and `docs/sdd/design/` give different
values, `docs/sdd/design/` wins without discussion, and 006's value does not appear in
this document.

### The conflicts, as resolved by the product owner

| Conflict | Resolved as |
|---|---|
| Corner radius | `--radius-sm: 4px` |
| Button height vs field height | Button **40**, field-md **47**. Deliberate — the button is shorter than the field beside it. No `--button-height-field` is invented |
| Focus-ring intensity | `--brand-ring` at **22%**, not the 10% in `10-shared-patterns.md` |
| Badge height | **20px** (`--chip-height`), not the "h22" in `10-shared-patterns.md` |
| Label gap | **8px**, honouring the 8pt grid, not the measured 7 |
| Sidebar | **288** expanded · **68** collapsed · **956** tall · nav item **48** |
| Timebox | No one-day hard stop. [`16-three-day-plan.md`](../../docs/sdd/16-three-day-plan.md) governs: **~30 min scaffold**, the rest is build |
| i18n | **In scope**, delivered in Stage 3. Not deferred |

### Changes made to `docs/sdd/design/tokens.css`

The one authorised exception to "do not edit shared files". Seventeen declarations added,
one corrected. `152 → 169`. Nothing else in `docs/sdd/design/` was touched.

| Change | Value | Why |
|---|---|---|
| **New** `--brand` + `--on-brand` | `var(--navy-900)` · `var(--Main-White-White)` | ADR-012. `--on-brand` carries a static default and is computed at runtime |
| **New** `--brand-hover` `-active` `-subtle` `-border` `-ring` | `color-mix(in oklab, …)` at 88 / 82 / 8 / 24 / 22% | The ADR-012 ramp. One variable changes, five follow |
| **Repointed** `--action-primary-bg` `-border` `-text` | were `--navy-900` ×2 and `--Main-White-White` → now `--brand` ×2 and `--on-brand` | **Beyond the literal instruction, and stated as such.** A `--brand` that nothing points at is a dead token: theming would silently do nothing. Three lines, reversible |
| **New** `--focus-ring` + `--focus-ring-width` | `color-mix(in oklab, var(--action-primary-bg) 22%, transparent)` · `3px` | One ring intensity everywhere |
| **New** `--sidebar-width-collapsed` | `68px` | Was prose only |
| **New** `--nav-item-height` · `--nav-child-height` | `48px` · `40px` | Were prose only |
| **New** `--badge-dot-size` | `7px` | The dot is the status token; the pill is its container |
| **New** `--z-drawer` `--z-flyout` `--z-modal` `--z-tooltip` | `100` · `200` · `300` · `400` | Four layers, ordered by what may cover what. A modal sits above a flyout because a flyout can open one; a tooltip sits above everything because it never takes focus |
| **Corrected** `--avatar-size` | `27px` → **`32px`** | 27 is measured off a vector export; `02-app-shell.md` reads 32 off the layer. Note 1: never sample geometry off a picture. Recorded as note 10 in the file |
| **New** notes 10 and 11 | — | Note 11 records that no shadow token and no motion token exists, and what is done instead |

**Deliberately not done:** no per-declaration provenance pass (the group-level `(A)`/`(B)`/
`(C)`/`(D)` labels stand); no shadow tokens; no motion tokens; no other file in
`docs/sdd/design/` edited.

---

## 1 · Folder structure

```text
src/wasl-web/
├── index.html                    the pre-paint dir/lang script lives here, not in a useEffect
├── package.json
├── tsconfig.json                 strict: true
├── tsconfig.node.json            the Vite config's own compilation target
├── vite.config.ts
├── eslint.config.js              flat config; the no-literal-string rule is scoped here
├── .prettierrc.json
├── .stylelintrc.json             logical-properties rule; native-control rule
├── .env.example                  committed. .env.local is not
├── public/                       served verbatim; favicon only for now
└── src/
    ├── main.tsx                  createRoot; the four stylesheet imports, in order
    ├── routes.tsx                the route table. Every element lazy()
    ├── styles/
    │   ├── tokens.css            copied verbatim from docs/sdd/design/tokens.css
    │   ├── base.css              element defaults — the DESIGN-BRIEF rule 17 block
    │   └── locale.css            [lang="ar"] leading, tracking 0, no cap-height trim
    ├── components/               the primitives. Domain-agnostic, never fetch (ADR-011 §4)
    │   ├── Button/
    │   ├── Input/
    │   └── Badge/
    ├── shell/                    the app shell and the parts only it uses
    ├── features/
    │   └── home/HomePage.tsx     one placeholder route
    ├── lib/
    │   ├── api.ts                the fetch wrapper. Zero endpoints, zero domain types
    │   ├── i18n.ts               i18next init
    │   └── direction.ts          the single place `dir` and `lang` are written
    ├── locales/
    │   ├── en/{common,auth,tickets,customers}.json
    │   └── ar/{common,auth,tickets,customers}.json
    ├── icons/icons.tsx           copied from docs/sdd/design/icons/index.tsx
    ├── brand/Mark.tsx            copied from docs/sdd/design/brand/Mark.tsx
    └── dev/PreviewPage.tsx       every primitive state in isolation. Not in production builds
```

### Why each folder exists

| Folder | One line |
|---|---|
| `styles/` | The **only** directory where a literal colour, pixel, radius, or font size may appear. That is what makes the "no literals in components" gate enforceable rather than aspirational |
| `components/` | ADR-011 §4's third kind of component: never fetches, never knows the domain. The eight-primitive cap (`component-inventory.md`) applies to this directory and nowhere else |
| `shell/` | The shell is not a primitive and it is not a feature — it wraps every authenticated route. Its internal parts (`Tooltip`, `NavFlyout`) live here **precisely so they are not primitives**; see §3.4 |
| `features/home/` | ADR-011 §3's feature-folder convention needs one real instance so the next feature copies a shape that exists rather than reading a description of one |
| `lib/` | Cross-cutting machinery with no UI: the fetch wrapper, i18next's init, and the direction writer. Nothing here renders |
| `locales/` | ADR-007 §2: strings the client authors are translated where the client lives. One file per namespace per language, so a namespace can be diffed for parity |
| `icons/` | The set is drawn at 1.5px stroke (`tokens.css` note 5). Kept out of `components/` because it is an asset module, not a primitive with states |
| `brand/` | The product mark. Same reason as `icons/` |
| `dev/` | `component-inventory.md`'s definition of done requires every state "visible in isolation". This is where. Excluded from production builds by a build-time condition, not a comment |
| `public/` | Vite's verbatim-copy directory. Empty of fonts — they come from a CDN, see §2 |

### Two naming decisions

- **`icons/icons.tsx`, not `icons/index.tsx`.** The source file is `index.tsx`, but ADR-011
  §7 bans barrel files and a lint rule that checks for `index.ts(x)` cannot tell a barrel
  from a real module. The file is **not** a barrel — it declares twenty components inline —
  so it is renamed rather than exempted. Same for `brand/Mark.tsx`, which already has a
  real name.
- **No `index.ts` anywhere under `src/`.** ADR-011 §7.

---

## 2 · Dependencies

**Three logical dependencies. Five `package.json` entries.** Under the four-dependency
line, so no stronger argument is owed — but each still carries its reason and the built-in
it beats.

### Runtime

| # | Package | Version | Why | The built-in that is not enough |
|---|---|---|---|---|
| 1 | `react` + `react-dom` | `^18.3` | ADR-003. The framework. Two entries, one dependency | — |
| 2 | `react-router-dom` | `^6` | The shell wraps every authenticated route and the nav must show an active item. That needs a router that owns the URL, and ADR-011 §2 makes the URL the state container for anything shareable | The History API gives `pushState` and nothing else — no matching, no nested layout route, no active state, no `lazy()` boundary. Writing that is writing a router |
| 3 | `i18next` + `react-i18next` | `^26` / `^17` | ADR-007 §9 needs the six CLDR Arabic plural categories (`_zero _one _two _few _many _other`) and §5 needs symbolic keys with a real `en` catalogue. Two entries, one dependency | `Intl.PluralRules` gives the *category* for a number and no way to select a string by it, and there is no built-in catalogue, no namespace, no fallback chain, and no interpolation. ADR-007 §9 also bans `t('tickets') + ' ' + n`, which is the shape a hand-rolled lookup produces |

**`i18next-browser-languagedetector` is deliberately not taken.** Detection is four lines
in `lib/direction.ts` — `localStorage` first, then `navigator.language`, then `en` — and
taking a package for four lines makes the resolution order invisible in a config object
instead of readable in a function. ADR-007 §4 fixes that order for the server; the client
mirror is short enough to read.

### Not taken, and each is named because its absence will otherwise read as an omission

| Not taken | Why not, now |
|---|---|
| **TanStack Query** | There is no API to consume. ADR-011 §1 is emphatic that it owns server state — and this feature has none. It arrives with the first endpoint |
| **React Hook Form + Zod** | No form exists. `Input` is a controlled primitive that renders validity and never decides it |
| Any component library, headless or styled | ADR-009 and DESIGN-BRIEF: *"it would look like that library, not like this product, which defeats the reason for having tokens"*. `<button>` and `<input>` already give keyboard behaviour, form participation, and a correct accessibility tree |
| Tailwind or any utility CSS | A utility layer gives every token a second name, so `bg-navy-900` becomes as valid as `var(--navy-900)` and the "no primitive token in a component" gate stops being checkable by a script over CSS |
| A state store | ADR-011 §1. There is nothing to put in it |
| Storybook | ADR-011. `dev/PreviewPage.tsx` is one route with no build step |
| An icon package | The set exists, at 1.5px stroke, and is being copied in |

### Tooling (devDependencies)

`vite` · `@vitejs/plugin-react` · `typescript` · `eslint` + `typescript-eslint` +
`eslint-plugin-react-hooks` · `prettier` · `stylelint` + `stylelint-config-standard`.

Tooling is listed apart from dependencies because none of it ships to a browser, and the
four-dependency line is about what the product carries, not what builds it.

### On version pinning

Major versions are committed above and are the decision. The exact patch is whatever
`npm install` resolves at scaffold time and is recorded in `package-lock.json`, which is
committed. Inventing a patch number here that may not exist would be a fabricated fact in
a specification. → **Q-6** if exact pins are wanted instead.

---

## 3 · The three primitives

Common to all three, from `component-inventory.md`'s *Requirements every primitive must
meet*:

- Focus-visible is not optional; a ring removed for aesthetics is a defect
- No hard-coded value — semantic tokens only, never a primitive token
- Logical CSS properties throughout
- **No user-facing string inside the component.** Every label arrives as a prop, already
  translated by the caller
- Loading and disabled are **states**, never separate components

### 3.1 · `Button`

The API is matched from upstream, not designed (`component-inventory.md`).

```ts
type ButtonType = 'primary' | 'secondary-outline';

interface ButtonProps {
  /** The Type axis, exactly as upstream defines it. `danger` does not exist yet. */
  buttonType?: ButtonType;            // default 'primary'

  /** The label. Already translated by the caller — this component holds no strings. */
  text?: string;

  /** Upstream's `With Text`, kept as a SEPARATE boolean from `text`.
   *  false ⇒ icon-only ⇒ `aria-label` is required and the component enforces it. */
  withText?: boolean;                 // default true

  /** Logical, not physical. Under dir="rtl" `iconStart` renders on the right, and
   *  no CSS changes — the flex order does the work. */
  iconStart?: ReactNode;
  iconEnd?: ReactNode;

  /** The Status axis. Kept orthogonal to Type, as upstream keeps it. */
  disabled?: boolean;
  loading?: boolean;                  // implies disabled

  type?: 'button' | 'submit';         // native. default 'button'
  onClick?: () => void;
  'aria-label'?: string;              // REQUIRED when withText is false
}
```

**Three notes on the contract:**

- **`buttonType`, not `type`.** The native `<button type>` attribute owns `type`, and a
  prop that shadows a native attribute of the same element is a collision someone will
  eventually resolve the wrong way. The axis is still upstream's `Type`; only the prop
  name avoids the clash. *(Prop-table shape borrowed from 006, per the one permitted use.)*
- **`Status` stays separate from `Type`** — expressed as `disabled` and `loading`, two
  booleans, not folded into `buttonType`. That is both upstream's own separation and
  DESIGN-BRIEF rule 8.
- **`iconStart` / `iconEnd`, not `leftIcon` / `rightIcon`.** A prop called `leftIcon` that
  renders on the right under RTL is a name that lies, and someone will eventually "fix" it
  by flipping the CSS.

**No `danger` type.** `016-escalate-ticket` and `012-change-ticket-status` are out of
scope, so no destructive action exists to need it. Adding it later is one CSS block.

#### States — 6, over 2 types = 12 cells

| State | Trigger | Primary | Secondary-Outline |
|---|---|---|---|
| Default | — | bg `--action-primary-bg` · border same · label `--action-primary-text` | bg `--action-secondary-bg` · border `--action-secondary-border` · label `--action-secondary-text` |
| Hover | `:hover` | bg + border `--brand-hover` | bg `--brand-subtle` · border `--brand-border` |
| Active | `:active` | bg + border `--brand-active` | bg `--surface-sunken` · border `--border-default` |
| Focus-visible | `:focus-visible` | Default, plus a `--focus-ring-width` ring in `--focus-ring` | Default, plus the same ring; border `--brand` |
| Disabled | `disabled` | bg `--brand-subtle` · border `--border-subtle` · label `--text-placeholder` | bg `--surface-sunken` · border `--border-subtle` · label `--text-placeholder` |
| Loading | `loading` | Default colours; the label is hidden and an indicator sits over it | Same |

**Loading holds the width.** The label is hidden with `visibility: hidden` and the
indicator absolutely positioned over it, so the label keeps reserving its own width. A
button that shrinks while loading moves everything after it in the row.
`loading` implies `disabled`, so a double-click sends one action.

**Disabled is not `opacity`.** `opacity` also fades the focus ring and any icon, and a
faint focus ring is an accessibility defect that reads as a style choice.

**The ring is `box-shadow`, not `outline`.** `box-shadow` follows `border-radius`;
`outline` does not on every engine, and a square ring around a 4px-rounded button looks
like a rendering fault. `outline-offset` is still set so forced-colours mode shows
something.

#### Tokens consumed

`--action-primary-bg` · `--action-primary-text` · `--action-secondary-bg` ·
`--action-secondary-border` · `--action-secondary-text` · `--brand-hover` ·
`--brand-active` · `--brand-subtle` · `--brand-border` · `--brand` · `--focus-ring` ·
`--focus-ring-width` · `--border-subtle` · `--border-default` · `--surface-sunken` ·
`--text-placeholder` · `--button-height-md` · `--button-padding` · `--button-gap` ·
`--button-radius` · `--button-border` · `--text-ui` · `--weight-medium`

**Geometry** — height 40 · width hug · radius 4 · padding-inline 12 · gap 4 · border 1px
**on both types**, so Primary and Secondary are the same total height and align in a row ·
`white-space: nowrap`, and the parent owns the overflow, because an Arabic label is
frequently longer than its English counterpart and a wrapping 40px button breaks the row
height for everything beside it.

**Accessibility** — native `<button>` · `aria-busy="true"` while loading, with the
accessible name unchanged (no "Loading…" string is introduced; a primitive holds no
strings) · `withText === false` with no `aria-label` throws in development · 40px clears
WCAG 2.2 SC 2.5.8's 24px minimum and does not reach the 44px AAA target, recorded rather
than claimed.

**No `dir="auto"` on the label.** It is interface copy from the catalogue, not user
content. `dir="auto"` on interface copy is how a mixed-script label ends up aligned
against the page.

---

### 3.2 · `Input`

```ts
interface InputProps {
  id?: string;                        // generated with useId when absent
  label: string;                      // REQUIRED. Already translated by the caller
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;

  required?: boolean;                 // renders the marker. Does NOT validate
  placeholder?: string;
  helperText?: string;

  /** A string, not a boolean. Presence ⇒ the error state, and it REPLACES helperText. */
  error?: string;

  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';          // default 'md'
  inputMode?: 'text' | 'email' | 'tel' | 'numeric';
  maxLength?: number;                 // native attribute only, not a validator
}
```

**`label` is required, not optional.** A placeholder standing in for a label is the most
common form accessibility defect and it disappears the moment the user types.

**The component renders validity; it never decides it.** No regex, no length check, no
required check. `required` renders the marker and nothing else.

#### States — the six from `component-inventory.md`, plus the two CSS states a control has anyway

| State | Fill | Border | Text | Ring | Message |
|---|---|---|---|---|---|
| Default | `--field-fill` | `--border-subtle` | `--text-primary` | — | helper, `--text-muted` |
| Hover | `--field-fill` | `--border-default` | `--text-primary` | — | helper |
| Focus | `--surface-card` | `--brand` | `--text-primary` | `--focus-ring` | helper |
| Disabled | `--surface-sunken` | `--border-subtle` | `--text-placeholder` | — | helper, muted |
| Error | `--field-fill` | `--state-danger-text` | `--text-primary` | — | error, `--state-danger-text` |
| Error + focus | `--surface-card` | `--state-danger-text` | `--text-primary` | danger-tinted ring | error |
| With helper text | — | — | — | — | helper rendered |
| With error text | — | — | — | — | error rendered, helper suppressed |

**The field lightens to white on focus.** A second, non-colour signal that this is the
active field, which matters for anyone who cannot distinguish the border change.

**Error + focus keeps the red border and tints the ring red.** A brand ring around a red
border is two competing signals; the user needs to know both where they are and that it
is wrong.

**The error replaces the helper, never stacks.** Two messages under one field means the
user reads the wrong one.

#### Tokens consumed

`--field-fill` · `--field-border` · `--field-radius` · `--field-height-sm` `-md` `-lg` ·
`--border-subtle` · `--border-default` · `--brand` · `--focus-ring` ·
`--focus-ring-width` · `--surface-card` · `--surface-sunken` · `--text-primary` ·
`--text-placeholder` · `--text-muted` · `--state-danger-text` · `--text-label` ·
`--text-helper` · `--weight-medium` · `--space-2` (label gap, 8) · `--space-3`
(padding-inline, 12 — matching the Button's, so a field and a button in one row align on
their text)

**Accessibility** — `htmlFor`/`id` with `useId()` when no `id` is given, never a
placeholder as the label · `aria-invalid="true"` in the error state ·
`aria-describedby` pointing at whichever of helper or error is currently rendered · no
`aria-live` region, because the error appears on blur when the user is already moving to
the next field and a live region would interrupt them mid-field.

**`dir="auto"` on the control, always.** An Arabic name typed into an English form is
normal, and without it the punctuation lands at the wrong end and reads as a typo
(ADR-007 §8).

**Disabled text in Safari** — `-webkit-text-fill-color` set explicitly, or Safari fades
it regardless of `color`. One browser, silently.

**Not in `Input`:** no `multiline`, no character counter, no prefix/suffix icon, no clear
button, no password reveal, no read-only state, no masking, no validation. Each belongs to
the screen that first needs it; none is in scope.

---

### 3.3 · `Badge`

`component-inventory.md` says Badge is where the domain leaks in — six statuses, four
priorities, escalated, internal. **The leak is deferred, not taken.** This feature defines
no domain type, so the primitive is specified on its *visual* axes and the
status-to-tone map belongs to the ticket feature that first renders one.

```ts
type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

interface BadgeProps {
  /** The visual axis. Not a status, not a priority — a tone. */
  tone: BadgeTone;

  /** filled = tinted background + coloured text. outline = transparent + 1px border. */
  appearance?: 'filled' | 'outline';   // default 'filled'

  /** REQUIRED, always, with no way to omit it. Already translated by the caller. */
  label: string;

  /** The dot IS the tone token; the pill is only its container. */
  dot?: boolean;                       // default true
}
```

**`label` is required and cannot be omitted — a `Badge` without one is a TypeScript
error.** DESIGN-BRIEF rule 14: never convey meaning by colour alone. Colour fails for
colour-blind users and in a monochrome print of a report.

**Why `tone` and not `status`.** Five tones × two appearances covers all twelve variants
`component-inventory.md` enumerates, without this feature declaring that a ticket has six
statuses. The mapping from a raw enum value to a tone is a **product** decision
(`component-inventory.md` says so explicitly) and it is made by the feature that owns the
ticket list. That feature will key it on the **raw, untranslated enum value** — keying it
on a displayed label renders neutral for every Arabic user and nothing fails: no
exception, no test failure, no visible error in English. → **Q-3**.

#### States

| Cell | Renders |
|---|---|
| `filled` × 5 tones | bg `--state-{tone}-bg` · text and dot `--state-{tone}-text` · no border |
| `outline` × 5 tones | transparent bg · text and dot `--state-{tone}-text` · 1px border in the same |
| `dot: false` | Label only, same tones |
| Unknown tone | Not representable — `tone` is a closed union, so this is a compile error rather than a runtime fallback |

**Not interactive.** A `<span>`, no `tabIndex`, no focus ring. A badge that is not a filter
chip must not look focusable.

**No `dir="auto"`.** Interface copy from the catalogue, same rule as the Button's label.

#### Tokens consumed

`--state-neutral-bg` `-text` · `--state-info-bg` `-text` · `--state-success-bg` `-text` ·
`--state-warning-bg` `-text` · `--state-danger-bg` `-text` · `--chip-height` ·
`--chip-radius` · `--badge-dot-size` · `--border-width` · `--space-1` (dot gap) ·
`--space-2` (padding-inline) · `--type-label-sm` · `--weight-medium`

**No brand token, ever.** Status colour is meaning, not branding (DESIGN-BRIEF rule 2b). A
tenant able to set "success" to red would have a product that lies. Red stays reserved for
"needs attention now" — never "this ended badly" (rule 15).

---

### 3.4 · `Tooltip` and `NavFlyout` — why they are not primitives

`component-inventory.md` lists tooltip and popover under **Not built**: *"No screen needs
them."* The app shell needs three of them: a tooltip on every collapsed leaf nav item, a
flyout for the nav group that has children, and the user popover.

**They are built inside `src/shell/`, not in `src/components/`.** The eight-primitive cap
applies to `components/`, and putting them there would spend three of the eight slots on
something with exactly one consumer — which `component-inventory.md`'s own definition of
done calls speculative work from the other direction.

Consequence, stated so it is a decision rather than a discovery: they are **not general
purpose**. No portal, no collision detection, no arbitrary placement. They anchor to the
sidebar, in one direction, and they mirror under RTL. The first screen outside the shell
that wants a tooltip promotes one of them to `components/` with a written reason — which
is the same rule a ninth primitive follows.

**Both open on `focus` as well as `hover`**, or a collapsed sidebar becomes unusable by
keyboard. The flyout carries a **140ms close delay** so the pointer can travel from the
icon to the panel without it vanishing; without that delay it is unusable with a mouse.

---

## 4 · The app shell

Geometry from [`02-app-shell.md`](../../docs/sdd/design/screens/02-app-shell.md) and
`tokens.css`. The arithmetic closes exactly: `288 + 1152 = 1440` · `68 + 956 = 1024`.

```text
┌──────────────┬──────────────────────────────────────┐
│ sidebar      │ header 68 · border-block-end 1px     │
│ 288 × 956    │ padding 16 / 56 / 16 / 24            │
│ padding      ├──────────────────────────────────────┤
│ 16 / 24      │ content 1152 × 956                   │
│ gap 16       │ padding 56 · gap 24                  │
│ border-      │ surface --surface-content            │
│ inline-end   │                                      │
└──────────────┴──────────────────────────────────────┘
```

### Regions and their values

| Region | Value | Token |
|---|---|---|
| Sidebar width | 288 | `--sidebar-width` |
| Sidebar width, collapsed | 68 | `--sidebar-width-collapsed` |
| Sidebar height | 956 | `--content-height` |
| Sidebar padding | block 16 · inline 24 | `--sidebar-padding-block` / `-inline` |
| Sidebar gap | 16 | `--sidebar-gap` |
| Header height | 68 | `--header-height` |
| Header padding | block 16 · inline-start 24 · **inline-end 56** | `--header-padding-*` |
| Content | 1152 × 956 · padding 56 · gap 24 | `--content-*` |
| Borders | 1px `--Neutral-200` | `--shell-border` |
| Nav item / nav child | 48 / 40, child inset 32 | `--nav-item-height` / `--nav-child-height` |
| Brand tile | 32, `--navy-900`, `--radius-md` | `--space-8` / `--radius-md` |
| Avatar | 32 circle, `--avatar-fill` | `--avatar-size` |
| Collapse toggle | 26px circle on the sidebar's outer edge, half-overlapping the border | **literal, TODO** |
| Active-child bar | 3px `--navy-900` on `inset-inline-start`; inset 0 → 2px when collapsed | **literal, TODO** |

**The header's inline-end padding is 56, matching the content's, so right edges align all
the way down the page. Inline-start is 24, matching the sidebar. The asymmetry is
considered — preserve it.**

**Only two surfaces, and the content is the sunken one.** Sidebar and header are
`--surface-page` (white); content is `--surface-content` (`Neutral/00`). Most people assume
the reverse (`tokens.css` note 3).

### The three collapse states

| State | Width | When |
|---|---|---|
| Expanded | 288 | Default above 1100px |
| Collapsed | 68 | User toggled, or automatically below 1100px |
| Drawer | Overlay, `--z-drawer` | Below 780px — the sidebar leaves the flow entirely |

Collapsed: the wordmark fades and its width collapses · the CTA becomes icon-only and
**needs an `aria-label`** · the `MAIN` caption is hidden · the active indicator's inset
moves 0 → 2px so it does not touch the edge · the user block shows the avatar only, name
in a tooltip.

**Persistence:** `localStorage`, per user, not per session — someone who collapses it means
it. Restored **before first paint**, in the same inline script that sets `dir`; otherwise
the sidebar renders expanded and snaps narrow on every load.

**Animating `width` is the one documented exception to DESIGN-BRIEF rule 19.** One
container, once, on a deliberate action, over 220ms. Transforming a fixed-width panel would
overlay the content instead of letting it reclaim the space, which is the wrong behaviour
for a persistent sidebar. Any other place wanting to animate `width` needs the same written
argument.

### What is static data now

**Everything.** The shell makes no request. `git grep -nE "fetch\(|axios|XMLHttpRequest"
src/wasl-web/src/shell` returns nothing.

| Thing | Now | Becomes |
|---|---|---|
| Nav items | A literal array in `shell/navItems.ts` — icon, i18n key, route, children | Stays static. Navigation is not server-driven; ADR-011 §2 puts the URL in charge |
| Nav badge counts | **Absent.** No count is rendered | The ticket list feature, from a real aggregate |
| Breadcrumb trail | Derived from the matched route, not fetched | Same |
| User name, email, role | Hard-coded placeholders in one file, marked `TODO — 004-auth-and-roles` | The auth response |
| Sign out | Navigates to `/`; clears nothing, because nothing is stored | Clears the token, redirects to `/login` |

### Nav structure

```text
MAIN
  Dashboard              IconDashboard
  Tickets                IconTicket      ⌄
    All tickets
    My tickets
    Unassigned
  Customers              IconCustomer
```

The primary CTA (`New ticket`, `IconAdd`) sits **at the top of the sidebar, above the
nav** — not in the page header. It is the one create action for the whole section. The user
block is pinned to the bottom with a `border-block-start`.

**Settings is deliberately not in the nav.** It lives in the user popover. A destination
used monthly costs the same vertical space as one used hourly.

**Not in the shell:** global search · notification bell · workspace switcher · help widget ·
theme toggle (one appearance only).

### RTL

The sidebar moves to the inline-end. Breadcrumb separators reverse. The active-item bar is
`inset-inline-start`, so it follows automatically. The collapse chevron mirrors and the
direction of collapse mirrors with it; the brand mark does not mirror.

### Routes

| Route | Element | Lazy | Why it exists |
|---|---|---|---|
| `/` | `HomePage` | yes | A placeholder naming what will replace it. An app with no route does not run |
| `/_preview` | `PreviewPage` | yes | Every primitive state in isolation, with `dir`, `lang`, and greyscale toggles. Excluded from production by a build-time condition |

Route-level code splitting only. Anything finer is optimisation without a measurement
(ADR-011 §7).

---

## 5 · The API client contract

`src/lib/api.ts`. **Zero endpoints. Zero domain types.** Nothing in this feature calls it;
it exists so the first feature that needs a request does not invent its own error handling
in a component.

### Signature

```ts
/** The RFC 7807 envelope, exactly as docs/sdd/05-api-conventions.md defines it.
 *  This is a transport shape, not a domain type. */
export interface ProblemDetails {
  type: string;                              // machine-readable. NEVER localized
  title: string;                             // localized by the server
  status: number;
  detail?: string;                           // localized. Never a stack trace or SQL
  instance?: string;
  traceId?: string;                          // always present; matches the server log
  errors?: Record<string, string[]>;         // KEYS are field names — never localized
}

export class ApiError extends Error {
  readonly problem: ProblemDetails;
  readonly status: number;
  /** The locale the server actually applied, from Content-Language. */
  readonly contentLanguage: string | null;
}

export interface ApiRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;                            // JSON.stringify'd; undefined ⇒ no body
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined | string[]>;
}

/** T is supplied by the CALLER. This module declares no response shape. */
export function apiFetch<T>(path: string, request?: ApiRequest): Promise<T>;
```

### Behaviour

| Concern | Rule |
|---|---|
| Base URL | `import.meta.env.VITE_API_BASE_URL`, defaulting to `http://localhost:5000`. `.env.example` is committed; `.env.local` is git-ignored. **No Vite dev proxy** — one URL, visible in the network tab, the same in dev and in a build |
| Path | Appended to the base. The caller passes `/api/…`; the wrapper does not prepend `/api`, because `/health` is deliberately outside it |
| `Accept-Language` | Sent on **every** request, from i18next's current language. This is the client half of ADR-007 §4's resolution order |
| `Content-Language` | Read off the response and carried on `ApiError`, so a caller can tell that its request for one locale produced another |
| `Content-Type` | `application/json` when there is a body, and never otherwise |
| Success | `2xx` with a body ⇒ parsed JSON as `T`. `204`, or `2xx` with an empty body ⇒ resolves `undefined as T` |
| Failure | **Any non-2xx throws `ApiError`.** It never resolves. `200` is never returned with an error in the body, so a resolved promise is unambiguously a success |
| Malformed error body | A non-2xx whose body is not JSON, or is JSON without a `type`, is **synthesised** into a `ProblemDetails` carrying the real status and a `type` of `errors/unknown`. The wrapper never throws a parse error over a transport error, because the parse error hides the status the caller needed |
| Network failure / abort | Synthesised the same way: `status: 0`, `type: 'errors/network'`. An abort is re-thrown as-is so a caller can distinguish a cancelled request from a failed one |
| Retries | **None.** A `409` is information, not a transient fault, and retrying a `POST` blindly is how a duplicate gets created |
| Auth | **None yet.** No token is attached, no `401` is intercepted, no refresh exists. One `TODO — 004-auth-and-roles` comment marks the insertion point |

### What the wrapper does not do

- **It declares no endpoint.** No `getTickets`, no `createCustomer`, no path constant
- **It declares no domain type.** `Ticket`, `Customer`, `TicketStatus` do not appear.
  ADR-011 §6 requires client API types to be **generated from the OpenAPI document**, never
  hand-written, so that a contract change becomes a compile error rather than a runtime
  surprise. Hand-writing one here would be the exact defect that rule prevents
- **It does not render an error.** It throws a typed object. Turning a `409` into a
  sentence is the screen's job, and `type` is what the screen branches on — never `title`,
  never `detail`, both of which are translated
- **It does not localize.** `type`, the keys of `errors`, enum values, `TicketNumber`, and
  `traceId` pass through untouched (ADR-007 §3)

→ **Q-4** and **Q-5** are open against this section.

---

## 6 · i18n

### Namespaces

Four, from the keys the shell and the primitives actually need. No namespace is created
speculatively.

| Namespace | Holds | Filled now with |
|---|---|---|
| `common` | Product name, nav labels, roles, generic actions | `productName` · `nav.main` · `nav.dashboard` · `nav.tickets` · `nav.tickets.all` · `nav.tickets.mine` · `nav.tickets.unassigned` · `nav.customers` · `nav.settings` · `nav.collapse` · `nav.expand` · `role.agent` · `role.manager` · `cancel` · `back` · `lang.current` |
| `auth` | Identity and session | `signOut` |
| `tickets` | The CTA the shell renders | `new` |
| `customers` | Created empty-but-present | — |

`customers` exists with a matching empty object in both languages so the fourth namespace
is registered once rather than added under time pressure later. → **Q-2**.

### Key structure

`namespace:section.key` — `common:nav.tickets`, `auth:signOut`. Symbolic, never the English
text as the key (ADR-007 §5): using the source text means a missing Arabic entry renders a
plausible English sentence that looks deliberate, and editing the English copy silently
orphans the translation.

**Every key exists in `en` and `ar` in the same commit** (BR-8.8). Runtime falls back to
`en`, but the fallback is the safety net, not the control.

**Plurals:** `react-i18next` suffixes with the full CLDR set for Arabic — `_zero` `_one`
`_two` `_few` `_many` `_other` (ADR-007 §9). No key in this feature is a plural yet, and
the configuration is in place so the first one does not need a config change.

**String concatenation around a value is banned.** `t('tickets') + ' ' + n` is
grammatically wrong for Arabic and is caught by lint, not by review.

### How `dir` and `lang` are set

One place: `src/lib/direction.ts`, writing `dir` and `lang` on `<html>`.

**Applied before first paint**, by an inline synchronous script in `index.html` — never in
a `useEffect`, which runs *after* paint. Getting this wrong produces a visible flash of
LTR on every load for every Arabic user: everyone sees it and nobody files it.

```text
resolution order, client side
  localStorage 'wasl.lang'  →  navigator.language starts with 'ar'  →  'en'
```

The same inline script restores the sidebar's collapsed state, for the same reason.

`lang="ar"` also triggers `locale.css`: `--leading-ar-*` instead of `--leading-*`, tracking
stays 0 permanently, and cap-height trim is **not applied at all**. Arabic glyphs sit well
below the baseline (final ي ج ع) and carry marks above cap height (ث ض); line-height 1.0
with cap-height trim clips them, and it presents as a font rendering fault rather than a
missing token.

**Digits stay Latin in Arabic** — the locale is configured `ar-u-ca-gregory-nu-latn`
(ADR-007 §7). A ticket number is read aloud on the phone, pasted into an email, and searched
for; `TCK-٢٠٢٦-٠٠٠٠٤٢` is unsearchable against the stored value.

### The RTL rule

**Logical CSS properties only. There is no mirrored stylesheet and no flipping tool.**

- `margin-inline-start`, never `margin-left` · `padding-inline`, never `padding-left` ·
  `inset-inline-start`, never `left` · `text-align: start`, never `left`
- `border-inline-end`, never `border-right`
- Enforced by **stylelint** `property-disallowed-list` in CI, not by everyone remembering.
  A physical property is correct in English forever and wrong in Arabic, and only visually
- `dir="auto"` on **every** element rendering content a user typed, and on the `Input`
  control always. Not on interface copy from the catalogue
- Any element that both renders user content and truncates carries both `dir="auto"` and
  the ellipsis, or the ellipsis appears at the wrong end and the visible fragment is the
  wrong half of the string

### Fonts

**Google Fonts CDN, not self-hosted.** `IBM Plex Sans` for Latin, `IBM Plex Sans Arabic`
for Arabic, weights 400 / 500 / 700, preconnected in `index.html`.

Stated cost: the CDN fails silently offline into a fallback face, and for Arabic that
reproduces the Q-15 defect exactly — a face nobody chose, looking settled. The fallback
stack in `--font-sans` / `--font-ar` is therefore documented so the substitution is
recognisable rather than mysterious. Time is the reason; it is not the better engineering
answer. → **Q-1**.

### No user-facing string in JSX — enforced, not remembered

ESLint flat config, `no-restricted-syntax` on `JSXText` whose content is not whitespace,
scoped to `src/components/`, `src/shell/`, and `src/features/`. A literal sentence in JSX
fails the build.

DESIGN-BRIEF's own words on the native-control rule apply here too: *a written rule is not
a control.*

---

## 7 · Out of scope — deliberately

| Excluded | Where it belongs |
|---|---|
| **Any ticket screen** — list, detail, create, status change | `009`–`013` |
| **Any customer screen** — list, profile, create | `007`, `008`, `017`, `018` |
| **The login screen**, its dark panel, the orbs, the neural mesh | Its own feature. `design/screens/01-login.md` |
| **Any API endpoint.** No path constant, no fetcher, no query key | The feature that owns each endpoint. Contracts are frozen there, by the backend |
| **Any domain type** — `Ticket`, `Customer`, `TicketStatus`, `TicketPriority`, `Role` | Generated from the OpenAPI document (ADR-011 §6), never hand-written |
| **The status → tone map for `Badge`** | The first ticket feature. It is a product decision, keyed on raw enum values |
| **Authentication** — token storage, `401` interception, route protection | `004-auth-and-roles` |
| `Select` · `Checkbox` · `Table` · `Modal` · `Toast` | The screen that first needs each. Five primitives with no consumer is speculative work by `component-inventory.md`'s own rule |
| **TanStack Query** | The first endpoint. There is no server state to own |
| **React Hook Form + Zod** | The first form |
| The tenant settings screen, sidebar presets, the logo upload | `022-tenant-theming-settings`. Only the token architecture is here |
| Dark mode | Nowhere. `color-scheme: light`; this product has one appearance (DESIGN-BRIEF rule 16) |
| Storybook | Nowhere. `dev/PreviewPage.tsx` is one route (ADR-011) |
| Visual regression testing, component snapshots | Nowhere. `docs/sdd/testing/test-strategy.md` excludes styling, layout, and snapshots by name — they break on every change and catch nothing |
| The converge **page** loader, the empty-state vocabulary | Their first consumer. `design/brand.md` |
| A generic tooltip or popover primitive | See §3.4 — the shell builds its own, deliberately not general |

---

## 8 · Open questions

Nothing here blocks; each carries a working assumption. **This section being short would
mean guesses were made and not written down.**

| # | Question | Working assumption |
|---|---|---|
| **Q-1** | Fonts are on the Google CDN for time. Is that acceptable for the demo, given NFR-7 asks the system to run from a clean clone in documented steps, and a CDN needs a network? | **CDN, as instructed.** The failure mode is documented above, and self-hosting later is six `woff2` files plus one `@font-face` block — no component changes |
| **Q-2** | Which namespaces should exist? Four are created (`common`, `auth`, `tickets`, `customers`) but only three carry a key. The blueprint's screen files also reference a **`settings`** namespace | **Four, `customers` empty-but-registered, no `settings` yet.** The settings screen is out of scope, so its namespace has nothing to hold. → adding it later is one file per language |
| **Q-3** | `Badge` is specified on tone, not on status, to keep domain types out of the foundation. `component-inventory.md` specifies it as twelve domain variants. Is deferring the map to the ticket feature the intended reading of "no domain types"? | **Yes, defer.** Five tones × two appearances covers all twelve without this feature declaring what a ticket status is. If the map is wanted here instead, it is one file — but it would be the only domain knowledge in the foundation |
| **Q-4** | `apiFetch` sends `Accept-Language` on every request. Does the backend already read it, and is the base URL really `http://localhost:5000`? I did not read the backend's launch settings — **this needs an answer from the backend lane, not a guess** | `http://localhost:5000` via `VITE_API_BASE_URL`, overridable in `.env.local` without a code change. If the port is wrong it is one line in one untracked file |
| **Q-5** | Does `errors` appear on `409` as well as `400`? [`CLAUDE.md`](../../CLAUDE.md) says *"`errors` appears only on `400` and `409`"*; [`05-api-conventions.md`](../../docs/sdd/05-api-conventions.md) says *"only for `400` validation failures"* — and then shows a `409` carrying one. **A question for the backend lane** | `errors` is optional on any status. The wrapper does not branch on its presence, so either answer costs nothing here — but a screen written against the wrong one would |
| **Q-6** | Major versions are committed; exact patch versions are left to `npm install` and recorded in `package-lock.json`. Are exact pins in `package.json` wanted instead? | Caret ranges plus a committed lockfile. Writing a patch number I have not verified exists would be a fabricated fact in a specification |
| **Q-7** | Is `/_preview` in scope? It is not on the instruction list, but `component-inventory.md`'s definition of done for a primitive requires every state *"implemented and visible in isolation"*, and there is no other surface where that is true | **In scope, and first on the drop list.** Without it the states are checked in dev tools, and the check is not repeatable |
| **Q-8** | The collapse toggle (26px circle) and the active-item bar (3px) have no token, and the shell's two durations (220ms collapse, 140ms flyout close) have none either. Per instruction these are literals marked `TODO`. Should they become `(D)` tokens once the shell is proven? | Literals now, `TODO` comments naming this question. DESIGN-BRIEF rule 3 forbids inventing a token, so nothing is invented — the debt is visible instead of hidden |
| **Q-9** | `--brand` was repointed so `--action-primary-*` derives from it. That is three lines beyond the literal instruction. Correct? | **Kept.** A `--brand` nothing points at is a dead token and theming would silently do nothing. Three lines, reversible |
| **Q-10** | `docs/sdd/design/layout-patterns.md` still reads `288 × 896` for the sidebar and `~46px` for a nav item, contradicting the 956 / 48 now settled. I was told not to edit any other file in `design/` | **Left as-is.** `tokens.css` now carries 956 and 48 as tokens, so a component reading tokens gets the right answer. The stale prose is recorded here so it is not read as a second opinion |
| **Q-11** | Is reusing the house tokens, spacing, typography, and component specifications permitted? (Q-11 in `11-open-questions.md`, still open with the evaluator) | Tokens, spacing, typography, and component specs are in scope; no client logo, no client product name, no client-specific imagery. If wrong, the palette re-derives from one hex value plus a contrast re-check |
| **Q-12** | Is `IBM Plex Sans Arabic` an acceptable Arabic face? (Q-15 in `11-open-questions.md`) | Yes, and it is labelled `(D)` — **our** decision, not an inheritance. The design's Arabic layer reports IBM Plex Sans, which has no Arabic glyphs, so it currently renders through a fallback nobody chose. If wrong: one token, plus a re-check of `--leading-ar-*`, because a different face has different vertical metrics. No component changes |

---

## 9 · What fails silently here, and where each is caught

The rows below are defects that look like success — for months, or in one browser, or in
one language.

| Silent failure | Why nobody notices | Caught by |
|---|---|---|
| A native control inherits a dark host's appearance | Reads as "this design is bad", not "this CSS is missing a rule", so it survives review. Has already happened three times, twice **after** the rule was written down | `base.css` setting `background-color`, `color`, and `-webkit-text-fill-color` all `!important` on `button` `input` `select` `textarea`, plus a stylelint rule that fails on a control rule set missing any of the three. **`color-scheme: light` alone is not enough** — a host stylesheet can win on specificity |
| `margin-left` instead of `margin-inline-start` | Correct in English forever. Wrong in Arabic, and only visually | stylelint `property-disallowed-list`, in CI |
| A component reaching for `--navy-900` instead of a semantic token | Renders correctly forever. Fails the first time a tenant changes colour, in whichever screen happened to do it | A script over `src/components/` and `src/shell/`, in CI. A primitive token passes a "no literal" check and still breaks theming |
| `outline: none` for aesthetics | Only keyboard users are affected, and they are not in the room | The keyboard walk on `/_preview`, recorded. A ring's *visibility* is not assertable |
| `dir` applied in a `useEffect` | A flash of LTR on every load for every Arabic user. Everyone sees it; nobody reports it | The inline pre-paint script in `index.html` |
| A literal sentence in JSX | Renders fine in English. The Arabic pass finds it, weeks later, once | ESLint `no-restricted-syntax` on `JSXText` |
| `line-height: 1` plus cap-height trim under `[lang="ar"]` | Presents as a font rendering fault, not a missing token | `locale.css`, checked with a string carrying ث ض above cap height and final ي ج ع below the baseline |
| A collapsed sidebar whose nested children become unreachable | The sidebar looks fine — narrow, tidy, and two thirds of the navigation is gone | The flyout, opening on **focus** as well as hover |
| A badge whose colour is its only signal | Fine for most readers; meaningless in greyscale and for colour-blind users | `label` being required with no way to omit it |
| The API wrapper resolving a non-2xx | A screen renders an error object as if it were data | `apiFetch` throwing on every non-2xx, so a resolved promise is unambiguously a success |
| The Vite React-TS template ships a `tsconfig.app.json` with `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, and `noFallthroughCasesInSwitch` — and **no `"strict": true`** | The file has a `/* Linting */` heading and four strictness flags, so it READS as strict at a glance. Every `any` and every implicit `null` would then pass a build that appears to enforce them | Found by reading the template rather than trusting it, at scaffold time. `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, and `exactOptionalPropertyTypes` are set explicitly, and the omission is recorded in the file itself so nobody re-accepts the template default |
| A dev-only route left in the production bundle | `import.meta.env.DEV` around the ROUTE is not enough: a top-level `lazy(() => import(...))` is always reachable, so Rollup emits the chunk and preloads it while the guard reads as if it does not. It shipped on the first attempt | The `import()` moved INSIDE the branch, and `ls dist/assets` plus a grep of the bundle — an inspection, not an assertion |
| A barrel file | Breaks tree-shaking and seeds an import cycle that is painful to unpick two features later | No `index.ts(x)` under `src/`; `icons.tsx` renamed rather than exempted |

---

## 10 · Stages and their stop points

Per the working agreement, each stage ends in a mandatory stop.

| Stage | Produces | Stops when |
|---|---|---|
| **1 — Spec** | This document | It is read in full and approved. **No code, no scaffold, no package installed** |
| **2 — Scaffold** | Vite + React + TS `strict` — set **explicitly**, because the template omits it · the folder tree above · `tokens.css` copied verbatim · ESLint · Prettier · stylelint · the no-literal-string rule · `npm run dev` and `npm run build` both working. **No UI** | Approval |
| **3 — Build** | The three primitives with every state · the shell with sidebar, header, and routing on static nav data · `lib/api.ts` · i18n with `en` and `ar` and `dir`/`lang` on `<html>` | Approval. **No commit without permission** |

**No `git commit`, no `git add`, no `dotnet build`, no `dotnet test` at any stage.** The
working tree is shared with the backend lane.
