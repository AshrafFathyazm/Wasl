# Design Brief

**This is the file to give an AI assistant before it generates any screen.**

Not a screenshot. Not "make it look like this image". A screenshot has to be
re-interpreted every time, and it gets re-interpreted slightly differently every time —
which is exactly how six screens end up with five button heights.

## How to use it

Point the assistant at three files, in this order, at the start of any UI task:

```text
1. design/tokens.css              the values
2. design/DESIGN-BRIEF.md         this file — the rules
3. design/layout-patterns.md      the structures
```

Then give it the story's `spec.md` for what the screen must actually do.

Once one screen exists and is right, add a fourth item: **"match the conventions in
`<that screen's file>`"**. A worked example constrains an assistant far harder than
prose does.

---

## Rules

### Values

1. **No literal colour, spacing, radius, or font size in any component.** Semantic
   tokens from `tokens.css` only.
2. **Never a primitive token in a component.** `var(--action-primary-bg)`, not
   `var(--abyan-indigo-900)`. The primitive is the value; the semantic is the meaning,
   and only the meaning belongs in a component.
2b. **Brand tokens and status tokens are different categories.** A component needing a
    brand colour uses `--brand` or a derived token; one needing a status colour uses a
    fixed one. Status colour is meaning, not branding, and is never themeable. This
    distinction is what makes tenant theming possible — see `design/theming.md`.

3. **If a needed token does not exist, stop and say so.** Do not invent one. An invented
   token is indistinguishable from a real one until someone tries to change it upstream,
   and then it silently does not change.

### Structure

4. **Compose from the eight primitives** in `design/component-inventory.md`. A ninth
   requires a written reason in the story's `frontend.md`.
5. **Follow the patterns in `design/layout-patterns.md`** for shell, list, detail,
   modal, and drawer. Do not invent a new page skeleton.
6. **Secondary detail opens in a drawer; a decision opens in a modal.** Drawers keep the
   record visible, modals demand an answer.

### States

7. **Four states or it is not finished:** default, loading, error, empty. A screen that
   only handles the happy path is a mockup.
8. **Disabled and loading are states of a component**, never separate components.
9. **Every interactive element is keyboard reachable with a visible focus ring.** A
   focus ring removed for aesthetics is a defect, not a style choice.

### Text

10. **No user-facing literal in a component.** Every string comes from the translation
    catalogue, with the key added to both `en` and `ar` in the same commit (BR-8.8).
11. **Sentence case.** Never Title Case, never ALL CAPS.

### Colour scheme

16. **Set `color-scheme: light` on the app root.** This product has one appearance. The
    tokens define light surfaces, and there is no dark palette to switch to.

17. **Never leave a native form control to inherit its colours.** `input`, `button`,
    `select`, `textarea`, and `input[type=checkbox]` all get their `background`, `color`,
    and `border` set explicitly, as literal hex or via a token — never left to the user
    agent. In a dark-mode browser or host, an unstyled control renders with a dark
    canvas: black inputs, white-on-white buttons. It looks like a broken design rather
    than a missing rule, so it survives review.

    **`color-scheme: light` alone is not enough, and neither is an explicit hex.** A
    host stylesheet can win on specificity. The reliable form is
    `background-color`, `color`, and `-webkit-text-fill-color` all with `!important`.

    Caught in a preview three times — twice after this rule was already written down.
    The first two diagnoses were correct but partial ("dark mode"), and a partial
    diagnosis produces a partial fix that fails again. **A written rule is not a
    control.** Add an ESLint
    rule or a stylelint check that fails on a `button`, `input`, `select`, or `textarea`
    without an explicit `background` and `color`, and put it in CI. Rules that depend on
    someone remembering them get forgotten by the person who wrote them.

### Restraint

21. **When two colours are far apart, put a shadow between them, not a gradient.** A
    gradient asks what colour belongs in the middle and usually there is no good answer;
    a shadow asks which plane is in front, and that always has one.

22. **"Matching" means the same system, not the same treatment.** Two halves of a screen
    match through shared type, radius, spacing grid, and one shared colour — not by both
    being dark, or both being animated. If both halves are loud, neither is.

23. **Subtract before adding.** High saturation everywhere, glow on every element, glass
    on every surface, and no hierarchy is what makes an interface read as
    machine-generated. When something looks generic, the fix is almost always removal —
    lower the saturation, remove a glow, delete a container.

24. **Keep the grain.** Perfectly smooth gradients are the generated look. A 13–15%
    noise overlay kills banding on 8-bit displays and adds measured imperfection. It is
    the cheapest signal that a person made this.

### Motion

18. **Nothing on a working surface animates for longer than 300ms**, and nothing delays
    information the user is waiting for. Full scale in `design/motion.md`.
19. **`transform` and `opacity` only.** Animating `width`, `height`, or `margin` forces
    a layout pass per frame and is visible as jank on a table.

    One documented exception exists — the sidebar collapse — because it is a single
    container, once, on a deliberate action. See `design/screens/02-app-shell.md`. Any
    further exception needs the same written argument, not a quiet break.
20. **`prefers-reduced-motion` is honoured globally.** For some people motion is nausea,
    not taste.

### Direction

12. **Logical CSS properties only.** `margin-inline-start`, never `margin-left`.
    `text-align: start`, never `left`. Every screen renders in both directions (ADR-007).
13. **`dir="auto"` on every element rendering content a user typed.** An Arabic comment
    inside an English interface is normal, and without this its punctuation lands in the
    wrong place — and if the element also truncates, the ellipsis appears at the wrong
    end and the visible fragment is the wrong half of the string.

    This is also enforceable rather than remembered: a lint rule on any JSX element whose
    children include an interpolated value from an API model.

### Meaning

14. **Never convey meaning by colour alone.** Every badge carries a label.
15. **Red means "needs attention now"** — `Critical` priority, escalated, destructive
    actions. It never means "this ended badly". `Closed` is gray.

---

## What the assistant must not do

| Don't | Why |
|---|---|
| Copy a layout from the Abyan screens | ADR-009. Abyan has no support-queue screens; a borrowed layout imports assumptions this CRM does not share |
| Paste CSS from Figma's inspect panel | Produces absolute pixels and hard-coded colours — the exact thing tokens exist to prevent |
| Add a component library | It would look like that library, not like this product, which defeats the reason for having tokens at all |
| Pick a font | See the gap below. Ask, do not choose |
| Generate a whole module in one pass | One screen, reviewed, then the next. The second screen is cheap once the first is right |

---

## Known gaps — ask, do not fill

Four things are genuinely unknown. An assistant asked to produce a screen will fill any
gap it finds with something plausible, and plausible is the problem: the result looks
deliberate and is not.

| Gap | Why it is unknown | How to close it |
|---|---|---|
| **The Arabic typeface** | An Arabic layer reports IBM Plex Sans, which has no Arabic glyphs — so it is rendering through a fallback nobody chose | Ask. Q-15 |
| **Weight 500** | Named in the scale, not yet seen on a layer | Inspect a layer using it |
| **The full colour Variables collection** | Two tokens confirmed by inspect; the rest not yet pulled | `get_variable_defs` on the tokens page |
| **Hover, focus, and disabled states** | The export is static. Their own notes list "Tables component hover state" as unresolved | Figma prototype, or decide and document |
| **Login page** | Not in this export. It is a different module | Ask for it, or design it from the tokens and record that it is original |

Until each is closed, `tokens.css` carries a placeholder and the placeholder is labelled
as one.

---

## The source is explicitly unfinished

The export's own notes panel is headed **"To be completed"** and lists as open:

> Set Coloring & Typography · Tables component hover state · Icons coloring ·
> Input Fields · Modals · Adding approval/reject button types

Their design system is a work in progress by their own admission. Two consequences:

- **Do not treat the extracted colours as canonical.** They are the current state of a
  moving file. Get the variables from Figma, where a change is versioned.
- **Some decisions are yours to make**, because upstream has not made them. Input field
  states and table hover are on that list. Making them and writing them down is the
  correct response — inventing them and staying quiet is not.

This is worth saying out loud in the walkthrough. "I inherited the palette, and here are
the four things their system had not settled yet, and here is what I decided and why" is
a stronger position than a screen that merely looks right.
