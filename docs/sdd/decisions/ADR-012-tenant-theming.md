# ADR-012 — Tenant theming

**Status:** **Accepted in part** (2026-08-23) — the token architecture is built in the skeleton; the tenant settings screen is deferred to Release 2 · **Related:** ADR-009, ADR-007

## Context

The house platform has a Branding page under Workspace Experience. The same capability
is wanted here: an organisation picks a primary colour and the interface follows —
buttons, icons, the sidebar.

## Is the foundation ready?

**Yes, and that is not luck.** Three decisions already made are exactly what this needs:

- Every colour is a CSS custom property on `:root` (`design/tokens.css`).
- Components consume **semantic** tokens only, never primitives (`design/DESIGN-BRIEF.md`
  rule 2). A component referencing `--navy-900` would break theming; none does.
- Icons use `currentColor`, so they follow their context with no extra work.

Swapping the brand colour at runtime is one assignment. **The swap is not the hard part.**

## The four things that are hard

### 1. A brand is a ramp, not a colour

A tenant picks one hex. The interface needs default, hover, active, focus ring, subtle
background, and border — six values, all of which must relate correctly.

Lightening and darkening in HSL is the obvious approach and produces muddy or
oversaturated results, differently for different hues. **Derive in a perceptual space
instead:**

```css
--brand-hover:  color-mix(in oklab, var(--brand) 88%, white);
--brand-active: color-mix(in oklab, var(--brand) 82%, black);
--brand-subtle: color-mix(in oklab, var(--brand)  8%, white);
--brand-border: color-mix(in oklab, var(--brand) 24%, white);
--brand-ring:   color-mix(in oklab, var(--brand) 22%, transparent);
```

A fixed percentage in oklab produces a visually consistent step across every hue. The
same percentage in HSL does not, which is why hand-tuned palettes exist.

### 2. The foreground on the brand must be computed, not fixed

White text on a light yellow brand is unreadable. Hard-coding `--on-brand: white` means
the first tenant who picks a pale colour gets an unusable product.

Compute relative luminance, compare against white and against the ink, take the higher
contrast:

```ts
const onBrand = ratio(brand, '#FFFFFF') >= ratio(brand, '#0D2626')
  ? '#FFFFFF' : '#0D2626';
```

Roughly fifteen lines. Skipping it is the single most common failure in configurable
theming, and it fails only for *some* tenants — so it ships.

**Reject a colour that cannot reach 4.5:1 against either foreground** at selection time,
with an explanation. Better to refuse a colour than to render text nobody can read.

### 3. Most tokens must NOT be themeable

The important architectural line. Tokens split into two sets:

| Themeable | Fixed |
|---|---|
| `--brand-*` and everything derived | `--state-success-*`, `--state-warning-*`, `--state-danger-*`, `--state-info-*` |
| Sidebar surface (as a preset, see below) | Neutral ramp, text, borders |
| — | Every status and priority colour |

**Status colour is meaning, not branding.** A tenant who sets "success" to red has a
product that lies to its users. Green-means-resolved and red-means-attention are
semantics, and semantics are not a preference.

This is worth stating to the tenant in the UI, not just enforcing silently — otherwise
the first question is "why can't I change these?"

### 4. The sidebar is a mode, not a colour

A free colour picker on a 288px surface goes wrong quickly: text contrast, icon
contrast, hover states, and the active indicator all have to work against it.

Offer **three presets** instead — Light, Dark, Brand — each shipping a matched set of
foreground, muted, border, and hover values. Brand mode reuses the computed `--on-brand`,
so it is correct by construction for any brand colour.

Three presets that always work beat a colour picker that sometimes does.

## Applying it without a flash

The theme ships in the **bootstrap or auth response**, not as a separate request, and is
written to `:root` before first paint.

A separate fetch means the default theme renders first and then snaps — a flash of
unbranded interface on every load, which looks broken and is the thing tenants notice
immediately.

## What is out of scope

- **Logo upload — moved to planned, not excluded.** The original exclusion reasoned
  from attachments being out of scope, which was too broad: a single ≤200KB image
  uploaded by an authenticated internal user is a different risk from arbitrary files
  from outside. Schema, endpoints, and validation are designed in
  `design/settings-and-uploads.md`; the build is Release 2 or later.
- **Per-user theming.** This is an organisation setting. Per-user would mean screenshots
  in a support conversation not matching what the other person sees.
- **Full custom palettes.** One brand colour plus a sidebar mode. A tenant who wants to
  set nine values wants a design system, not a settings page.
- **Dark mode.** A different axis and a much larger surface. `color-scheme: light` stands
  (`design/DESIGN-BRIEF.md` rule 16).

## Cost, and the recommendation

| Work | Estimate |
|---|---|
| Token restructure into brand versus fixed | Already done |
| Ramp derivation and contrast computation | ~2 hours |
| Bootstrap injection, no-flash | ~1 hour |
| Persistence and endpoint | ~1 hour |
| The settings screen | ~half a day |

**Recommendation: build the architecture in the skeleton, defer the settings screen to
Release 2.**

The value is in the token structure — and it is already there. The capability can be
demonstrated in a walkthrough by changing three variables in dev tools and watching the
interface retint, which proves the architecture more convincingly than a settings page
proves anything.

**This is the fourth scope addition.** Localization, audit, design tokens, and now
theming. Each was the right call and each was cheap because of the one before it — but
Release 1 is already eight stories and the skeleton is already two days. The settings
screen is the part to say no to.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Precompiled themes, one CSS file per tenant | Needs a build per tenant; impossible for a runtime colour picker |
| Sass variables | Compile-time. The whole point is runtime |
| Inline styles from a theme object in JS | Loses the cascade, breaks `currentColor` on icons, and re-renders the tree on change |
| A full palette editor | More configuration than any tenant will use correctly, and every extra field is another contrast pair to validate |
| Let tenants theme status colours | The product would be able to lie about state |
