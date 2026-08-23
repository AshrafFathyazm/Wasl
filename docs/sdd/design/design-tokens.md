# Design Tokens

The contract between the design source and the code. Tokens are extracted once,
committed, and consumed everywhere — no component hard-codes a colour or a spacing
value.

## Naming

Two layers, and the distinction matters more than the names.

### One consequence of the scale as it stands

Four styles sit at 16px — Heading H5, Title 3, Body Medium, Label Large — and three sit
at 12px. The role differs even where the size does not, which is normal in a real
system but means **a size is not enough information to pick a token**. Always reach for
the semantic role.

**Primitive tokens** describe a value: `color-blue-600`, `space-4`, `radius-md`.
**Semantic tokens** describe a use: `color-text-primary`, `color-border-danger`,
`space-field-gap`.

Components consume **semantic** tokens only. A component that references
`color-blue-600` has hard-coded a decision that belongs to the design system; when the
brand colour changes, that component does not.

```text
color-blue-600            primitive   the value
  └── color-action-bg     semantic    what it is for
        └── Button        component   what uses it
```

## What has actually been extracted

From `Abyan_UI_Structure_-_All_Requests_Module.svg`, artboards at 1:1 (1440×1024).
Values are in `design/tokens.css`.

| Group | Status | Note |
|---|---|---|
| Colour | **Extracted, exact** | 42 distinct values, reduced to a primitive ramp plus semantic aliases |
| Radius | **Extracted** | 3px small, 4px medium, 8px large. Tight corners — an enterprise look, not a consumer one |
| Control heights | **Extracted** | 24 / 30 / 44px; 30px is by far the most common |
| Layout | **Extracted** | 1440px frame, 226px sidebar, 60px header, 44px table row |
| Typography — sizes and weights | **Known (C)** | Read from the Figma Text styles panel. Five families of style — Heading, Title, Body, Label, Caption — across 12–36px, in Bold / Medium / Regular |
| Typography — family | **IBM Plex Sans (C)** | Confirmed on layers. Open source, on Google Fonts |
| Typography — metrics | **Known, and a gap for Arabic (C)** | Line height 100%, vertical trim cap height, letter spacing 0%. See below |
| Spacing | **8pt grid (C)** | Gaps and padding of 8 and 16 confirmed on layers; 1px borders |
| Colour token names | **In Variables (C)** | `Text/Primary`, `Neutral/800` confirmed and matching the extracted values |
| Spacing scale | **Not extracted** | Gaps are measurable but the underlying scale is not inferable from a drawing |
| Interaction states | **Not extracted** | The export is static, and their own notes list hover states as unresolved |

Two derived values are marked as such in `tokens.css`: a readable text colour for the
amber state, and an info background. Neither existed in the source. They are labelled
`DERIVED` rather than quietly mixed in with the extracted ones.

## What is extracted

| Group | Tokens | Notes |
|---|---|---|
| **Colour** | Full ramps, plus semantic aliases for text, surface, border, and the four states | The largest group and the one that carries most of the resemblance |
| **Typography** | Family, size scale, line heights, weights | Arabic and Latin may need different families and different line heights — Arabic script typically needs more leading at the same size |
| **Spacing** | The base scale | Consumed as logical properties, never as `margin-left` (ADR-007) |
| **Radius** | Corner scale | |
| **Border** | Widths, and default border colour | |
| **Elevation** | Shadow levels | Extract only the levels actually used; enterprise systems tend to define more than they use |
| **Motion** | Durations and easing | Only if the source defines them; inventing them defeats the purpose |
| **Breakpoints** | Layout thresholds | |

## What is deliberately not tokenised

| Not a token | Why |
|---|---|
| One-off values used by a single component | A token used once is a variable with extra steps |
| Layout dimensions specific to a screen | Composition, not a system value |
| Anything invented rather than extracted | The point is to inherit an existing language. An invented token looks like the system and is not part of it, which is worse than an obvious one-off |

## Output format

Tokens land as CSS custom properties on `:root`, with a framework-level mapping on top
(Tailwind theme extension, or Angular Material theming, depending on how Q-12 resolves).

CSS variables as the base layer because they are framework-neutral: if the framework
decision changes, the tokens survive it.

## Direction and locale

Two rules that only matter because this product is bilingual (ADR-007):

- **Spacing tokens are consumed logically.** `padding-inline`, not `padding-left`. The
  token is a value; the property is what makes it direction-aware.
- **Typography needs per-locale metrics, and the source's metrics are wrong for
  Arabic.** Every inspected layer is line height 100%, vertical trim cap height, letter
  spacing 0%.

  100% leading means the line box equals the font size exactly. Cap-height trim removes
  everything above cap height and below the baseline. Together they are tidy for
  single-line Latin labels and clip Arabic — whose glyphs sit well below the baseline
  (final ي، ج، ع) and carry marks above cap height (ث، ض).

  It will present as a font rendering fault, not as a missing token, which is precisely
  why it would survive review. **Decisions taken here:** explicit line heights per role,
  Arabic roughly 15% looser, and cap-height trim not applied to Arabic at all. Recorded
  in US-014 with the rest of the bilingual work.

- **Letter spacing stays 0 for Arabic, permanently.** Arabic is cursive; positive
  tracking breaks the joins between letters and produces text that is harder to read,
  not just uglier. Any future adjustment to tracking applies to Latin only.

## Refresh

Extraction is repeatable — see `design/figma-workflow.md`. Tokens are committed to the
repository rather than fetched at build time, so a build never depends on network
access or on the design file being in a particular state.

A refresh is a normal commit with a normal diff. If the diff is large, that is
information: something changed upstream and the effect is visible before it ships.
