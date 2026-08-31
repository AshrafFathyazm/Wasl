# Loaders

Nine shapes, one geometry, and the rule for which goes where.

**Source.** `Loaders.dc.html` — a canvas design document, authored in Arabic, supplied
2026-08-30 and reviewed as the design for this system. This file is the English
translation of it, and the repository language rule (`CLAUDE.md`) makes **this** file the
one the code is measured against.

> **The HTML source is not in the repository.** It reached the build through a channel
> that damaged its encoding, and a vendored copy with corrupted Arabic is worse than
> none — it would be read as the source and it would be wrong. The design owner commits
> it to `docs/sdd/design/loaders/`. Until then this document is the whole source of
> truth, which is why every number below is written down rather than referenced.

Everything here derives from the mark in `brand.md`: **three threads arriving at one
node**. Nothing new is invented. A loader that does not come from the mark is a second
identity, and the loader is the most-seen brand asset in the product — it appears far
more often than the logo does.

---

## 1 · Converge Pro — the default, and what changed

The original converge shipped in `006`. Converge Pro is the same idea executed more
precisely, and it **replaces** it. `brand.md` §2 carries the authoritative keyframes;
this section explains them.

```css
@keyframes ldConv {
  0%        { transform: translateX(0)                             scale(.7); opacity: 0 }
  16%       { transform: translateX(calc( 5px * var(--ld-dir, 1))) scale(1);  opacity: 1 }
  70%       { transform: translateX(calc(30px * var(--ld-dir, 1))) scale(1);  opacity: 1 }
  86%, 100% { transform: translateX(calc(36px * var(--ld-dir, 1))) scale(.3); opacity: 0 }
}
@keyframes ldNode { 0%, 52%, 100% { transform: translateY(-50%) scale(1)    }
                    66%           { transform: translateY(-50%) scale(1.22) } }
@keyframes ldRing { 0%, 56% { transform: translateY(-50%) scale(.6);  opacity: 0  }
                    68%     {                                         opacity: .4 }
                    100%    { transform: translateY(-50%) scale(2.1); opacity: 0  } }
```

Container 52 × 18. Dots 5px at 24 / 50 / 76%, all starting at the inline-start, delays
0 / .11s / .22s. Node 9px at the inline-end. Ring 20px, 1.5px stroke, offset −5.5px.
Duration 1.4s, easing `cubic-bezier(.45, 0, .35, 1)`; the ring uses
`cubic-bezier(.2, .6, .3, 1)`.

### The five differences from the original, each with its reason

| # | Change | Why |
|---|---|---|
| 1 | **Absorption by scale, not opacity.** The dot shrinks to `.3` entering the node | It reads as being *absorbed*, not as fading out. Fading is a dot that gave up |
| 2 | **Node pulse 1.22×**, was 1.32× | The node receives. It does not demand attention |
| 3 | **An absorption ring** — 1.5px circle expanding to 2.1× and fading at arrival | Explains what happened without noise |
| 4 | **Spacing 24 / 50 / 76%**, was 22 / 50 / 78 | Tighter, so the three read as one line and the slant comes from the delay |
| 5 | **Full opacity at 16%** with a 5px push, was 12% | Removes the empty first frame of the cycle |

### The slant comes from the delay, not from the positions

All three dots start at `inset-inline-start: 0` — same x, different y. The staggered
delay puts the first ahead and the third behind, so they describe a diagonal **while
moving**. Do not "fix" the start positions to make the slant; that freezes it into a
static comma.

---

## 2 · The nine, and when each is right

| Shape | Geometry | Duration | Use | Expected wait |
|---|---|---|---|---|
| **Converge Pro** | 52 × 18 | 1.4s | The system default: saving a ticket, sending a reply, signing in — with text beside it | 0.5 – 5s |
| **Mark** | 70 × 44 | 1.6s | Big moments only: a full screen, or a switch between work areas. **Never repeated inside a screen** | > 1.5s |
| **Path** | 64 × 24 | 1.6s linear | Medium waits: escalating a ticket, syncing a channel, generating a report | 2 – 15s |
| **Chain** | 86 × 12 | 1.6s, 60ms stagger | A **named** multi-step operation (transform → assign → notify). Never for a single operation | 3 – 20s |
| **Orbit** | 28 × 28 | 900ms | Inside a button while it submits; inside a field before its content appears | 0.3 – 3s |
| **Bars** | 27 × 18 | 1.1s | The smallest in the system. Table cells, chips, anywhere under 32px | any |
| **Bar** | 100% × 3 | 1.3s | Background loading that does not block interaction: page transition, list refetch | any |
| **Skeleton** | 8px rows | 1.5s | First load of a list or a record. **Always better than a spinner in a table** | 0.3 – 3s |
| **Satellites** | 32 × 32 | 1.5s, −500ms offset | Waiting on an external channel. The teal means *alive*, not *succeeded* | > 10s |

### The keyframes

```css
/* Mark — the mark draws itself, then withdraws into the node */
@keyframes ldDraw     { 0%{stroke-dashoffset:46} 42%,66%{stroke-dashoffset:0}
                        88%,100%{stroke-dashoffset:-46} }
@keyframes ldMarkNode { 0%,50%,100%{transform:scale(1)} 64%{transform:scale(1.18)} }

/* Path — two identical polylines, one static track, one drawn overlay */
@keyframes ldDash  { to { stroke-dashoffset:0 } }   /* dasharray 20 58, offset 78 */

/* Chain — dots light, links grow away from the dot that just lit */
@keyframes ldFill  { 0%,8%{opacity:0} 24%,68%{opacity:1} 84%,100%{opacity:0} }
@keyframes ldGrow  { 0%,8%{transform:scaleX(0)} 30%,68%{transform:scaleX(1)}
                     84%,100%{transform:scaleX(0)} }

/* Orbit — NOT linear. The easing is what gives it a heartbeat */
@keyframes ldSpin  { to { transform:rotate(360deg) } }

/* Bars */
@keyframes ldBar   { 0%,100%{transform:scaleY(.3);opacity:.45}
                     42%{transform:scaleY(1);opacity:1} }

/* Bar — a 28% segment crossing a 3px track */
@keyframes ldSweep { 0%  {transform:translateX(calc(-110% * var(--ld-dir, 1)))}
                     100%{transform:translateX(calc( 420% * var(--ld-dir, 1)))} }

/* Skeleton — opacity pulse. NO shimmer gradient */
@keyframes ldSkel  { 0%,100%{opacity:1} 50%{opacity:.4} }

/* Satellites — two nested rotating wrappers, delay -.5s so they never align */
@keyframes ldOrbitDot { to { transform:rotate(360deg) } }
```

---

## 3 · The timing gates

The only part of this system that is code rather than CSS, and the only part that can
make the product measurably **slower**. All four are deliberate.

| Wait | Behaviour |
|---|---|
| **< 200ms** | No loader at all |
| **200ms – 1s** | Appear after a **150ms** delay, so it cannot flash |
| Once visible | Stay **at least 400ms** before content replaces it |
| **> 10s** | Add a line of text naming the current step. **Not a bigger loader** |

The 400ms floor adds up to 400ms of latency to a response that arrived in 160ms. That is
the correct trade — a flash reads as a glitch and costs more attention than the wait it
saved — but it is a deliberate slow-down, written down here so it is not discovered as a
performance regression.

Implemented once, in `lib/useDeferredBusy.ts`. Never per call site.

---

## 4 · Direction

CSS has no logical `transform`. Layout uses logical properties; travel uses an explicit
sign.

```css
:root       { --ld-dir:  1; --ld-origin: left  }
[dir="rtl"] { --ld-dir: -1; --ld-origin: right }
```

- **Layout** — `inset-inline-start` / `inset-inline-end`. Flips on its own.
- **Travel** — `calc(30px * var(--ld-dir, 1))` inside the keyframe.
- **Growth origin** — `transform-origin: var(--ld-origin, left)`, so a Chain link grows
  away from the dot that just lit, in both directions.
- **SVG** — has no logical properties at all. `transform: scaleX(var(--ld-dir, 1))` on
  the `<svg>` element.

**The node is always the destination in reading order.** LTR: node at the right, dots
travel left → right. RTL: node at the left, dots travel right → left.

> **The brand mark never mirrors.** `--ld-dir` applies to abstract shapes and to travel.
> The Mark and Brand loaders keep the mark's own orientation in both directions, which is
> `brand.md`'s existing rule and the reason the mark is drawn directional in the first
> place.

### The mechanism this replaced, and why it is recorded

`006` pinned the loader's internal frame to `direction: ltr` and mirrored the whole
assembly with `scaleX(-1)`. That was correct, and it was arrived at by measurement:
mixing logical positioning with physical transforms inside one assembly gave two mirrors
that cancelled, and in RTL the dots ran **away** from the node.

`--ld-dir` solves the same problem without pinning the frame, which the eight new shapes
need — several of them position logically *and* travel physically in the same element.
One mechanism, not two.

**The failure mode is silent: it still animates, it just animates backwards.** The
negative control from `006` is re-run against this mechanism and recorded in
`029/tests.md`.

---

## 5 · Reduced motion

Wrap every animation in `@media (prefers-reduced-motion: no-preference)`.

**Then give every shape an explicit static frame.** Gating the animation alone is not
enough and it is the easiest mistake in this system to make: the dots declare
`opacity: 0` and would simply be absent — two thirds of the mark silently missing, for
exactly the people who cannot ask for the motion back.

`brand.md` §2 is the rule: *the three dots **and** the node render statically.* Where the
canvas source proposes "the node alone at 100% opacity", `brand.md` wins.

For some people motion is not a preference. It is nausea and migraine.

---

## 6 · Colour

| Colour | Token | Role in a loader |
|---|---|---|
| Navy `#1D174D` | `--brand` | The loader. Everywhere, by default |
| Teal `#4A9E96` | `--teal-600` | **Only** the Satellites shape — waiting on an external party. It means *alive* |
| Green `#2E7D32` | `--green-700` | **Never appears in a loader.** It is an outcome, not a wait |

The fill is always `currentcolor`, so one loader works on white and on navy without a
second copy. The container sets `color`; the shape does not.

> Teal never carries state; green never carries brand. Confusing them is how "resolved"
> and "online" come to look the same, and once they do neither means anything.

---

## 7 · Loaders inside a field

Four waiting states a text field actually has. The rules under them matter more than the
shapes.

| State | Shape | Placement |
|---|---|---|
| Async validation (is this email taken?) | **Orbit** 16px | The field's inline-end affix |
| Debounced search | **Bars** | The field's inline-start, in the search icon's footprint |
| A value the server computes | **Converge Pro**, reduced | Inside the value's own slot, not beside it |
| The field's own first load | **Skeleton** | Label row + a control-height block |

- **Never disable a field while it waits.** Disabling clears focus and stops typing.
  Say it with the loader.
- **Never shift the layout.** The loader takes the size of what it replaces: affix 16px,
  row 40px, field `--field-height-md` 47px.
- **Debounce 300ms** before the request; loader after 150ms; visible at least 400ms.
- **One loader per field.** Never a spinner on the trigger and another in the menu at the
  same moment.
- `aria-busy="true"` on the field.

---

## 8 · Loaders in a menu

The canvas source specifies five menu states plus a failure, and **all six are now
buildable**. They were not when this feature's spec was written: `Select` was a native
`<select>`, whose `<option>` list cannot hold a skeleton, a search row or a load-more
row, and the spec routed three of the six to `CustomerPicker` for that reason.

`031` replaced `Select` with `Dropdown` — a real listbox with a portal menu, search, and
multi-select chips — while `029` was being built. **The constraint that shaped this
section is gone, and the section is rewritten rather than left standing**, because a
design document that describes a control the product no longer has is worse than one
with a gap in it.

| Source state | Home | Built by |
|---|---|---|
| ① Trigger resolving its stored value | `Dropdown` — a skeleton across the trigger, not openable, **no spinner** | `029` |
| ② Menu loading its options | `Dropdown` — three skeleton rows at the option's own height | `029` |
| ③ Search inside the menu | `Dropdown` — Bars in the search row; previous results stay at 40% | **`031`, open** |
| ④ Loading more at the foot | `Dropdown` — a fixed row, options above it do not move | **`031`, open** |
| ⑤ Chip awaiting confirmation | `Dropdown` — a dashed chip with an 11px Orbit until the server confirms | **`031`, open** |
| ⑥ Failure | `Dropdown` — after 10s, the reason and a retry | **`031`, open** |

**Four of the six are open, and they are `031`'s, not this feature's.** ③–⑥ each need a
new prop and new behaviour on a component another lane is actively writing; adding them
from here would be two agents editing one file. `029` supplied the vocabulary and
converted the two states that already existed. The rows above are the specification
`031` builds against.

- Previous results stay visible at **40% opacity** while a new search runs. The menu does
  not flicker.
- **A menu loader needs an end.** After 10s: the reason, and a retry. Never a pulse
  forever.
- A load-more row is **fixed at the foot** and does not move the options above it, and it
  does not change the menu's max height (320px).
- `aria-live="polite"` announcing the result count when it lands.

---

## 9 · One primitive, nine variants

Nine shapes are nine variants of one component, the way `Badge` has a tone. One
accessibility contract, one direction mechanism, one reduced-motion path.
`component-inventory.md` caps the system at eight primitives; that cap is not touched.

```tsx
<Loader variant="converge" />          // the default
<Loader variant="orbit" size="sm" />
<Loader variant="satellites" label={t('tickets:awaitingChannel')} />
<Skeleton shape="text" />
```

- **`label` is already translated, and its presence is the accessibility switch.** With
  one, the loader is `role="status"`. Without one it is `aria-hidden` and decorative —
  which is correct inside a `Button`, whose accessible name must not change while it is
  busy.
- **No user-facing string inside the loader**, ever. The label is a prop.
- Sizes are `sm` and `md`. `sm` scales the container so there is one set of keyframes
  rather than a second, divergent copy.
