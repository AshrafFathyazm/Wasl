# Icons

## The decision

**Adopt an open-source stroke set at 1.5px, apply a two-rule signature to all of them,
and draw by hand only the logo and the two or three icons that genuinely do not exist.**

Not a bespoke set. The reasoning is worth stating because the instinct runs the other
way.

### Why not a custom set

- **Icons are read, not admired.** In a support tool the icon's job is instant
  recognition. A novel trash icon is a worse trash icon. Distinctiveness is a cost here,
  not a feature.
- **A set is a project.** Forty icons drawn consistently, at one optical weight, on one
  grid, with matching terminals, is days of work — against a one-day design timebox
  (ADR-009) and a rubric that awards nothing for it.
- **Consistency is what reads as "ours", not novelty.** Same stroke width, same
  terminals, same grid, same optical size. Those are inherited free from a good set.

### What actually carries the identity

| Carries it | Does not |
|---|---|
| The logo / wordmark — **one** mark, drawn properly | Forty redrawn generic icons |
| Stroke weight matching the rest of the UI | Unusual metaphors |
| A handful of **domain** icons no library has | A bespoke "settings" gear |

## The set to use

The house stroke is **1.5px with round caps and round joins** — confirmed on every
stroked path in every export, without exception (`design/tokens.css`, note 5).

Any set whose stroke width is configurable works. Lucide, Tabler, and Phosphor are all
stroke-based with adjustable weight and permissive licences — **verify the licence in
the repository before shipping**, do not take it on trust from here.

```tsx
// Lucide, matched to the house stroke
<Ticket size={18} strokeWidth={1.5} />
```

Set `strokeWidth={1.5}` **globally** via the icon provider, not per usage. One usage
that forgets it renders at a different weight, and the mismatch is visible without
being nameable.

## The icons worth drawing

Only where no library has the concept, and only three:

| Icon | Why no library has it |
|---|---|
| **Escalate** | Libraries have "arrow up" and "alert". Neither says "raised, with a reason, by a manager". This is the one action in the product with no standard glyph |
| **Channel composite** | A ticket's origin — Email, WhatsApp, LiveChat, SMS, WebForm — shown as one slot. Either five brand-adjacent glyphs drawn to one weight, or one abstract mark with a variant per channel |
| **Ticket number / reference** | Optional. Only if the reference needs a visual anchor in the header |

Plus the product mark — see `design/brand.md`. That is four drawings, not forty, and the
mark is the one worth spending real time on.

## Giving a familiar set a signature

Keep the metaphor exactly as everyone recognises it; change one or two **style
parameters** consistently across every icon. That is what makes a set read as drawn for
this product without costing recognition.

### The levers available

| Lever | Visible? | Cost |
|---|---|---|
| Corner radius on joins | Slightly | None |
| Keyline ratio — how much air inside the box | Felt, not seen | None |
| Interior inset — inner details further from the edge | Felt, not seen | Small |
| Terminal style — round, butt, extended | Slightly | None |
| Detail level — one detail removed from every icon | Yes | Small |
| Angle discipline — every diagonal at 45° | Slightly | Medium |
| **Open aperture — a deliberate gap in a contour** | **Very** | Small |

### The aperture was tried and rejected

An earlier version of this document made aperture one of the two rules. It was built,
rendered at 18px in a real nav, and dropped. The reasoning is worth keeping.

**Where aperture works:** logos and marks. Viewed once, large, deliberately, and
remembered. The eye enjoys closing the contour.

**Where it fails:** functional UI icons at 18px, in a dense interface, scanned
peripherally rather than looked at.

Three specific failures:

- **It reads as a defect.** At 18px an interrupted contour is indistinguishable from a
  rendering artifact, a badly exported asset, or a disabled state. The viewer's first
  question is "is something wrong with this?" — and a functional icon that raises a
  question has already failed.
- **It taxes the eye across a set.** Closure is effortless once. Twenty times, in a nav
  beside a table, it becomes low-grade visual noise. A support agent looks at these
  screens for eight hours.
- **It can collide with meaning.** An open padlock is not a closed padlock. A ticket
  whose outline is broken can read as void or torn. Style must never be able to change
  semantics, and aperture can.

**Rule for choosing a lever, learned from this:** if the signature is visible enough to
be noticed as a choice, it is too visible for a functional icon. For a mark, that is
exactly the point.

### The pair chosen instead

**Rule 1 — corner radius 2 on every join.**

Derived, not chosen: the UI radius token is 4px on a 40px control, a ratio of 0.1. On a
24px canvas that is 2.4, rounded to 2. "The icon radius comes from the same ratio as the
button radius" answers *why*; "it looked better" does not.

**Rule 2 — a 16-unit keyline inside the 24 box.**

Stock sets typically fill 18–20 of the 24. Drawing to 16 gives every icon more air. The
set reads lighter and more precise than a library set sitting next to it, and no one can
point at what changed.

That is the correct kind of signature for something functional: **felt, not seen.**
Distinctiveness that announces itself belongs in the mark, where it is looked at on
purpose. See `design/brand.md`.

### Judge at the smallest size, always

The mark went through two rejected iterations, both of which looked fine at 48px and
failed at 20 — one resembled the "insert hyperlink" glyph, the other a star. See
`design/brand.md`.

> **Ask "what does this look like?" before "is this good?", and ask it at 20px.**

Applies to icons as much as to the mark. 20px is where these live: the nav, the table,
the favicon.

### How to check you got it right

Put your icon beside the original **at 18px**, in a real nav row, and squint.

- **Does anything look broken, unfinished, or disabled?** If yes, stop.
- **Does the set feel calmer or lighter than the stock one?** That is the signature working.
- **Do both still read as the same word?** If no, you changed the metaphor, not the style.

Judging an icon at 40px is what produced the aperture idea in the first place. Details
that look considered at 40px look like faults at 18px.

## The set as built

Twenty icons in `design/icons/` — one SVG each, plus `index.tsx` with a typed React
component per icon.

| Group | Icons |
|---|---|
| Navigation | dashboard · customer |
| Domain | ticket · escalate · assign · comment |
| Status | pending · resolved · closed |
| Channels | email · whatsapp · livechat · sms · webform |
| Toolbar | search · filter · sort · add · chevronDown · more |

```tsx
import { IconTicket, IconEscalate } from '@/design/icons';

<IconTicket />            // 18px, inherits currentColor
<IconEscalate size={24} />
```

`currentColor` throughout, so an icon takes the colour of the text it sits beside. Size
defaults to 18 — the nav and table size. Stroke stays 1.5 at every size, because scaling
the stroke with the box is what makes an icon set look inconsistent across contexts.

### What still needs a human

Two are drawn to be correct rather than to be good, and would benefit from half an hour
each in Figma:

- **whatsapp** — recognisable, but the tail geometry is approximate.
- **assign** — the plus and the figure are not optically balanced; the plus sits heavy.

Optical balance cannot be computed. Everything else here is geometry.

## Rules for anything drawn by hand

These are what make a hand-drawn icon sit beside a library icon without looking wrong.

| Rule | Value |
|---|---|
| Canvas | 24×24, always — even when displayed at 18 |
| Safe area | 2px padding; nothing touches the edge |
| Keyline shapes | Square 18×18 · circle ⌀20 · rect 20×16 — pick one and build on it |
| Stroke | 1.5px, **centred**, aligned to the pixel grid |
| Terminals | Round cap, round join |
| Corners | ~2px radius on stroke corners |
| Fills | None. Do not mix filled and stroked in one set |
| Sizing | **Optical, not mathematical.** A circle at 20 and a square at 18 read as the same size; at equal dimensions the circle looks smaller |

The optical rule is the one that separates a set that feels drawn by one hand from a set
that feels assembled. It cannot be checked by measuring.

## Do these need Figma at all?

**No.** The source of truth for a React application's icons is the code, not the design
file. The SVGs and the components already exist in `design/icons/` and can ship as they
are.

Figma is worth opening for exactly one thing here: **fixing the three icons that need
optical judgement**. Paste the SVG onto a 24 frame (`Cmd+V` works on any seat — it is
ordinary editing, not Dev Mode), nudge the curves, copy the path data back.

That round trip needs no MCP, no Dev Mode, and no seat upgrade.

## If you do want MCP in the loop

MCP is good at the repeatable part and bad at the drawing.

| Do with MCP (`use_figma`) | Do by hand |
|---|---|
| Create the 24×24 frames and the keyline grid | Draw the paths |
| Turn drawings into components with variants | Judge optical weight |
| Apply naming conventions across the set | Decide the metaphor |
| Configure export settings in bulk | Balance the curves |
| Generate the React components and Code Connect mappings | — |

Two things to know before trying:

- **`use_figma` writes to the canvas and needs the remote server.** The read tools that
  failed earlier failed on a View-seat rate limit, so writes may be blocked the same
  way. Worth one attempt; not worth planning around.
- **Load the `figma-use` skill before calling `use_figma`.** It is a stated prerequisite
  and skipping it produces failures that are hard to diagnose.

A reasonable MCP-assisted flow: scaffold the grid frames with `use_figma` → draw the
four marks by hand → use `use_figma` again to componentise, name, and set exports →
`add_code_connect_map` to wire each to its React component.

## What to say about this at review

"I took an open-source stroke set at the system's 1.5px weight and applied two rules
to all of it: corner radius 2, derived from the same ratio as the button radius, and one
open aperture per contour at a consistent edge. The metaphors stay standard, so nothing
loses recognition, but the set reads as drawn for this product. I hand-drew only the
product mark and the icons the domain needed — escalate has no standard glyph."

Stronger than a bespoke set, because it is a decision with a derivation behind it rather
than effort with a result.
