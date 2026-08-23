# Component Inventory

Eight primitives, capped (ADR-009). Every screen in this CRM composes from these.

A ninth requires a written reason. "We need one more component" is how a one-week build
becomes a component-library project.

## The states that matter

For each primitive, the **states** are the work — not the default appearance. A button
that looks right at rest and wrong when disabled is not finished, and the disabled and
error states are the ones that get skipped.

### Button — the API is already defined upstream

Layer inspect gives the real component contract, so this one is not designed, it is
matched:

| Property | Values |
|---|---|
| `Type` | `Primary` · `Secondary - Outline` |
| `Size` | `MD` (others presumably exist) |
| `Status` | `Default` (the other states exist as variants) |
| `With left icon` | boolean |
| `With Right Icon` | boolean |
| `With Text` | boolean |
| `Text` | string |

MD geometry: height 40, width hug, radius `SM`, border 1px, padding 12, gap 4.
Primary is filled and bordered `#1D174D`; Secondary-Outline is white with a border.

Two things worth copying rather than reinventing:

- **`With Text` is a separate boolean from `Text`.** That is how an icon-only button
  is expressed without a second component. Our `Button` should do the same, and an
  icon-only button then requires an `aria-label` — a rule the design cannot enforce
  but the component can.
- **The variant axis is `Type`, and status is separate.** Loading and disabled are
  statuses, not types. That matches the rule below about states not being components.

| Primitive | States required | Used by |
|---|---|---|
| **Button** | Default, hover, active, focus-visible, disabled, loading; types Primary / Secondary-Outline / danger | Every form and every action |
| **Input** | Default, focus, disabled, error, with helper text, with error text | Customer form, ticket form, comment composer |
| **Select** | Default, open, focus, disabled, error, empty option, multi-select | Category, priority, channel, assignee, filters |
| **Checkbox** | Default, checked, indeterminate, focus, disabled | Internal-comment toggle, filters |
| **Badge** | The six ticket statuses, four priorities, escalated, internal | Ticket list, ticket detail, timeline |
| **Table** | Header, row, hover, empty state, loading skeleton, pagination footer | Customer list, ticket list |
| **Modal** | Open, closing, focus trap, escape and backdrop dismissal | Close-ticket dialog, escalation reason |
| **Toast** | Success, error, info; auto-dismiss and manual dismiss | Every mutation result |

### Table column rules, learned from the preview

- Identifier columns are **fixed width**, `white-space: nowrap`, and
  `font-variant-numeric: tabular-nums`. A wrapped ticket number is unreadable, and
  tabular figures make a column of them align. `TCK-2026-000042` at 14px needs about
  132px — 96px wraps it.
- Any column rendering user content carries **both** `dir="auto"` **and** an ellipsis
  truncation. One without the other cuts the wrong end of the string and shows the
  wrong half.
- Give a fixed column the longest real value plus a couple of characters, not the
  longest value in the mock data.

### Geometry already known for the others

Measured across the exports, so these are matched rather than chosen:

| Primitive | Spec |
|---|---|
| Field / bordered row | Height 39 / 47 / 51 by size · radius SM · fill `Neutral/00` · border 1px `Neutral/200` |
| Chip / tag | Height 20 · full pill · subtle fill · 1px grey border |
| Checkbox | 23px square · radius SM · 1px border |
| Avatar | 27px circle · navy fill |
| Progress track | 6px tall · radius SM · `#EDF1F2` track |
| List row | 48px |
| Table row | 61px |

## Requirements every primitive must meet

- **Focus-visible is not optional.** Keyboard navigation is the accessibility floor, and
  a focus ring removed for aesthetics is a defect.
- **No hard-coded values.** Semantic tokens only (`design/design-tokens.md`).
- **Logical CSS properties throughout.** Every one of these renders in both directions
  (ADR-007).
- **No user-facing string inside the component.** Labels arrive as props and come from
  the translation catalogue (BR-8.8).
- **Loading and error are states, not separate components.** A separate
  `LoadingButton` guarantees the two drift apart.

## Badge is where the domain leaks in

`Badge` is the only primitive that encodes domain meaning: six statuses, four
priorities, escalated, internal. Twelve variants.

The colour mapping is a **product** decision, not a design-system one — the design
system supplies the ramps, but which status is which colour depends on what the support
team needs to notice first. Two rules:

- Map to semantic tokens, not to raw ramps, so a brand change carries through.
- Never encode meaning by colour alone. Every badge carries a label, because colour
  alone fails for colour-blind users and in a monochrome print of a report.

## Not built

| Not built | Instead |
|---|---|
| A generic spinner | The converge loader — three threads to a node. See `design/brand.md` |
| Stock empty-state illustrations | The node-and-thread vocabulary. See `design/brand.md` |
| A bespoke icon set | An open-source stroke set at 1.5px, plus three domain icons and the product mark. See `design/icons.md` |
| Date picker | Native `<input type="date">`; locale formatting comes from `formatters.ts` |
| Rich text editor | Plain textarea (ADR-007: rich text is a sanitisation surface) |
| File upload | Attachments are out of scope project-wide |
| Charts | No reporting in scope |
| Tabs, accordion, tooltip, popover | No screen needs them. Each would be a real component with real accessibility requirements |
| Autocomplete | `CustomerPicker` composes Input plus a result list; a generic autocomplete is a much larger commitment |

## Definition of done for a primitive

- [ ] Every state in the table above is implemented and visible in isolation
- [ ] Keyboard reachable, with a visible focus ring
- [ ] Rendered and checked in both directions
- [ ] No hard-coded colour, spacing, or radius
- [ ] No literal user-facing string
- [ ] Used by at least one real screen — a primitive with no consumer is speculative work
