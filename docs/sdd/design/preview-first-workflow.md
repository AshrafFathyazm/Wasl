# Preview-First UI Workflow

**Show the screen before building it.**

A rendered preview takes minutes. A built screen takes hours, and once it is built it
carries tests, translation keys, and query wiring — all of which have to be redone if
the layout was wrong. The cheapest moment to disagree about a layout is before any of
that exists.

This inserts one gate into Phase 4 of `07-execution-workflow.md`, between the task
breakdown and the implementation.

---

## The gate

```text
tasks.md complete
      ↓
  ┌─────────────────────────────────────────┐
  │  PREVIEW                                │
  │  A static rendering of the screen:      │
  │  real tokens, real copy, real states.   │
  │  No API, no routing, no state.          │
  └─────────────────────────────────────────┘
      ↓
  Approved? ──no──> revise the preview, not the code
      ↓ yes
  frontend.md — build it for real
```

## The spec comes first

Before the preview, read the screen's spec in `design/screens/`. It names every element,
every action with its endpoint and failure paths, and every state.

The preview then renders what the spec describes. Two artifacts, two questions: the spec
answers *what goes here*, the preview answers *does it work at 18px in two directions*.

## What a preview is

- **Static HTML or a single throwaway component.** It is thrown away afterwards; it is
  not the first commit of the screen.
- **Real tokens from `design/tokens.css`.** A preview using approximate colours proves
  nothing about whether the tokens work.
- **Real copy**, in both languages if the layout is direction-sensitive. Lorem ipsum
  hides the two problems previews exist to catch: text that is longer than the space,
  and text that reads wrong.
- **All four states side by side** — default, loading, error, empty. The empty state is
  the one that gets skipped, and it is the one a reviewer notices first.
- **Plausible data volumes.** A table with three rows tells you nothing about a table
  with fifty. A name field with "Ali" tells you nothing about a 90-character company
  name.

## What a preview is not

| Not | Why |
|---|---|
| Wired to the API | The point is the layout, and wiring is the expensive part |
| Routed into the app | It is disposable |
| Committed as the screen | It has no tests, no translation keys, and no error handling |
| A screenshot of a design | The whole point is to see it rendered with the real tokens at a real width |

## What to check while looking at it

- Do native form controls render with the intended colours? An unstyled `input` or
  `button` inherits the user agent's dark-mode appearance and comes out black, or white
  on white. This has already happened once here.

- Does the longest realistic value fit, in both languages?
- Is the Arabic version genuinely right-to-left, or only translated?
- Does the empty state look intentional, or like something failed?
- Is every interactive element reachable by keyboard, with a visible focus ring?
- Does a badge still carry meaning in greyscale?
- Is anything here a new component that should have been a composition?

## Recording it

The approved preview is referenced in the story's `frontend.md`:

```markdown
## Preview
Reviewed on <date>. Changes requested: <list>. Approved after revision.
```

If the built screen later diverges from the approved preview, that divergence is a
deviation and goes in the deviations table with its reason — same rule as a deviation
from `plan.md`.

## Why this earns its place in the process

Two reasons beyond saving time.

**It separates two arguments that otherwise happen at once.** "Is this the right
layout?" and "is this code correct?" are different questions with different reviewers,
and mixing them means the layout question gets answered by whoever is looking at a
pull request.

**It makes the design decisions explicit while they are still cheap.** Every question
in the checklist above has a right answer that costs nothing at preview time and costs
a rewrite after the screen is wired.

**It has already paid for itself.** The first login preview rendered with black inputs
and an invisible primary button — the host was in dark mode and the native form controls
inherited its appearance. Every `div` was correct; only the controls were wrong, which
is exactly the shape of defect that reads as "this design looks bad" rather than "this
CSS is missing a rule". Caught in a preview it cost one revision. Caught after the
screen was built, translated, and tested, it would have been read as a design problem
and someone would have started changing colours.
