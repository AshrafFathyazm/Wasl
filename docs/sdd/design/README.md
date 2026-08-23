# Design

How this CRM's interface gets its visual language, and where that language comes from.

The decision and its reasoning are in `decisions/ADR-009-design-system-source.md`.
This folder is the working detail.

## Contents

```text
design/
├── tokens.css              The token set — consolidated and complete enough to build on
├── DESIGN-BRIEF.md         The file to give an AI assistant before any UI task
├── design-tokens.md        The token contract — what is extracted and how it is named
├── layout-patterns.md      Shell, list, detail, modal, drawer — the structures to inherit
├── preview-first-workflow.md  Render the screen before building it
├── component-inventory.md  The eight primitives, and the states each must support
├── icons.md                Which set, what to draw, and the rules for drawing it
├── brand.md                Product name, the mark, lockups, and the 20px rule
├── brand/                  Seven mark treatments + Mark.tsx with all variants
├── icons/                  20 SVGs + a typed React component per icon
├── screens/                One spec per screen — elements, actions, states, RTL
├── theming.md              Tenant brand colour: ramp, contrast, sidebar presets
├── settings-and-uploads.md Branding storage, logo and avatar — planned
├── motion.md               Durations, easing, and where animation belongs
├── figma-workflow.md       How to pull from Figma, and how to refresh
└── figma-extraction-plan.md  Which calls to spend a limited Figma budget on
```

## Current state — enough to build on

`tokens.css` is consolidated from seven vector exports, a set of layer-inspect
readings, and screenshots of the shipped app. Every value carries its source.

**Known and exact:** the full colour palette with four complete state pairs, the
typography (IBM Plex Sans, 400/700, the whole size scale), the 8pt spacing grid, the
app-shell geometry, the Button component API, and the geometry of every other
primitive.

**Decided by us, because the source has no answer:** per-locale line heights, the
Arabic family, and a readable text colour for amber backgrounds. Each is labelled `(D)`.

**Still open:** the Arabic typeface needs confirming rather than assuming (Q-15), and
weight 500 is named in the scale but has not been seen on a layer.

That is a workable token set. The remaining gaps are decisions to confirm, not
measurements to take.

## The short version

Take the **tokens** and rebuild **eight primitives**. Do not copy screens.

Tokens carry no domain assumptions — a spacing scale is equally correct for a support
queue as for anything else. Screens carry every assumption of the domain they were
designed for, and Abyan has no support-queue screens to borrow.

## Before starting

Two questions must be answered first. Both are cheap to ask and expensive to get wrong
after a day of work:

- **Q-11** — is reusing these assets permitted, and does that include client branding?
- **Q-12** — does an implemented component library exist, or only Figma files?

Q-12 in particular decides the framework. See `11-open-questions.md`.

## Timebox

One day, hard stop. If the timebox is reached with tokens done and primitives
unfinished, ship the tokens and use plain elements for the rest — a consistent palette
over unstyled controls reads as intentional, whereas half-finished custom controls read
as broken.
