# ADR-009 — Where the visual design comes from

**Status:** Accepted, with two open questions · **Supersedes:** the styling line in
ADR-003 · **Related:** ADR-003, ADR-007

## Context

An in-house enterprise platform (Abyan) already has a designed interface in Figma:
colours, typography, spacing, component states, and — because it serves an
Arabic-speaking market — a solved right-to-left layout.

Building this CRM's interface from scratch would produce something that looks like a
default, next to a product that already has a settled visual language. Reusing that
language is the obvious move. *How much* of it to reuse is the actual decision.

## Decision

**Adopt the design system by extracting tokens and rebuilding a small set of
primitives. Do not copy screens.**

Four levels exist; the first two are in scope, the third is partial, the fourth is not.

| Level | What it is | In scope | Why |
|---|---|---|---|
| 1 — **Tokens** | Colour ramps, type scale, spacing scale, radii, borders, elevation | **Yes** | Roughly 80% of "this looks like our product" for a fraction of the effort. Mechanical, low risk, and it is the layer that makes everything above it consistent |
| 2 — **Primitives** | Button, input, select, checkbox, badge, table, modal, toast | **Yes, capped at eight** | Everything in this CRM is built from these. Getting their states right is what separates a coherent interface from a themed one |
| 3 — **Patterns** | App shell, page header, filter bar, data-table conventions, empty states | **Partial** | Adopt the *conventions* — where the page title sits, how a filter bar behaves — without rebuilding the full components |
| 4 — **Screens** | Pixel-matching an existing Abyan screen | **No** | Abyan has no customer-support screens to match. Matching a screen from a different domain would be imitation without meaning |

## Why tokens rather than screens

A screen is a solution to a specific problem. Abyan's screens solve Abyan's problems;
this CRM has different ones. Copying a layout that was designed for another domain
produces an interface that looks right and works wrong.

Tokens are different — they carry no domain assumptions. A colour ramp and a spacing
scale are equally correct for a support queue as for anything else.

The test to apply: *would a designer recognise this as ours?* That question is answered
by tokens and component states, not by layout.

## The eight primitives

Capped deliberately. Each one is listed in `design/component-inventory.md` with the
states it must support, and nothing is built that no screen needs.

```text
Button   Input   Select   Checkbox   Badge   Table   Modal   Toast
```

Anything a screen needs beyond these is composed from them, or the screen is redesigned
to use them. A ninth primitive requires a written reason, because "we need one more
component" is how a one-week build turns into a component-library project.

## This is an argument for Angular

ADR-003 chose React and left the choice flagged as an open question. This ADR changes
the balance of that argument, and the change should be stated plainly rather than
buried.

If Abyan's design system exists as **implemented Angular components**, then choosing
Angular means inheriting working components — including their states, their
accessibility handling, and their right-to-left behaviour. Choosing React means
reimplementing all of that from a Figma reference, which is the same visual outcome for
several times the work.

If the design system exists only as **Figma files with no component implementation**,
the argument is neutral: tokens extract to either framework equally well, and ADR-003's
reasoning stands.

**So the framework decision now depends on a fact nobody has checked.** That fact is
`11-open-questions.md` Q-12, and it should be checked before any frontend work starts —
it is cheap to answer and expensive to be wrong about on day three.

## Right-to-left comes with the tokens

Abyan serves an Arabic-speaking market, so its design system has already solved
direction: which spacing is logical rather than physical, which icons mirror and which
must not, how numerals are treated.

Inheriting that is worth more than the colours. ADR-007 specifies logical CSS
properties and `dir="auto"` from first principles; if the design system already encodes
those decisions, US-014's right-to-left pass gets substantially cheaper and — more
importantly — consistent with a product people already use.

**Check this before writing ADR-007's rules again by hand.** If Abyan's system
disagrees with ADR-007 on anything, Abyan wins and ADR-007 is amended, because a
shipped and used system beats a reasoned one.

## Two sources, and they disagree

Two references now exist, and they are not the same product:

| | Figma export | Shipped app |
|---|---|---|
| Sidebar | 226px | 320px, with a primary CTA inside it |
| Corner radius | 3-4px | ~8px on inputs and buttons; badges are full pills |
| Status badge | Solid filled block | Tinted pill with a leading coloured dot |
| Table row | 44px | ~61px |
| Page header | Title plus primary action | Breadcrumb plus title; the action moved to the sidebar |

**The shipped app wins.** It is what people recognise, and the Figma file's own notes
panel is headed "To be completed" — it is a system still being settled, whereas the
shipped app is a decision already made and lived with.

The Figma export remains useful for the exact colour values, which a screenshot cannot
give precisely. So: **colours from the export, geometry and layout from the shipped
app**, and `design/tokens.css` labels every value with which source it came from.

That labelling matters more than it looks. A token whose provenance is unrecorded gets
"corrected" later by someone comparing it against whichever source they happened to
open.

## Preview before build

A third practice belongs with this decision: **render a screen before building it**.

A preview using the real tokens takes minutes and answers the questions that are
expensive to answer later — does the longest realistic value fit, does the Arabic
version genuinely reverse, does the empty state look intentional. Once a screen carries
tests, translation keys, and query wiring, changing its layout means redoing all three.

The gate sits in `07-execution-workflow.md` as Phase 3b. Detail in
`design/preview-first-workflow.md`.

## Status of the extraction

Colours, radii, and control heights have been extracted from the "All Requests" module
export and are in `design/tokens.css`. Typography has not been, and cannot be from that
source — the text is outlined to paths.

Two facts about the source change how it should be treated:

- **Its own notes panel is headed "To be completed"**, and lists colouring, typography,
  input fields, modals, table hover, and button types as open. This is a system being
  settled, not a published contract.
- **Some decisions are therefore ours to make.** Where upstream has not decided, decide
  and write it down. That is a stronger position at review than a screen that merely
  looks right, and it is honest about what was inherited versus authored.

## Timebox

**One day for levels 1 and 2, hard stop.**

The risk here is not that this goes badly, it is that it goes well and consumes the
week. An enterprise design system has depth in every direction, and the assessment
weights end-to-end flow and engineering judgement — not pixel fidelity.

If the timebox is hit with tokens extracted and primitives incomplete, ship the tokens
and use plain elements for the rest. A consistent palette and type scale over unstyled
controls looks intentional. Half-built custom controls look broken.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Build a visual language from scratch | Slower, and the result would look like a default next to a product with a settled identity |
| A third-party component library (MUI, Ant, PrimeNG) | Solves the component problem and loses the point. It would look like that library, not like our product — and the reason for reaching for the design system was to look like ours |
| Copy Abyan screens directly | Imitation without meaning; Abyan has no support-queue screens, and a borrowed layout carries assumptions from a domain this CRM does not share |
| Import the design system as a package dependency | The right answer if it is published and versioned. Depends on Q-12; if it is, this ADR simplifies to "take the dependency" |
| Unstyled headless components plus tokens | A reasonable middle path and the fallback if the timebox is hit |

## Consequences

- The walking skeleton grows again, by roughly a day. This is the third addition after
  localization and audit, and the estimate should say so rather than absorb it.
- ADR-003's "not a design exercise, utility CSS, no component library" line no longer
  holds and is superseded here.
- Design tokens become a build input, so they need a documented extraction and refresh
  path — `design/figma-workflow.md`.
- Two questions must be answered before frontend work starts: permission (Q-11) and
  whether an implementation exists (Q-12).
- If Q-12 comes back as "yes, Angular components exist", ADR-003 should be revisited
  rather than defended.
