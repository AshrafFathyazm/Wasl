# Motion

## The distinction that decides everything

A marketing site and a working tool have **opposite** motion requirements.

| | Marketing site | Wasl |
|---|---|---|
| Visits | Once, maybe twice | 400 times, eight hours a day |
| Motion's job | Hold attention | Get out of the way |
| A 600ms reveal is | Delightful | 600ms of waiting, 400 times |
| Success | Someone remembers it | Nobody notices it |

Motion that impresses on visit one is friction on visit four hundred. That is not an
argument against animation; it is an argument for putting it where it belongs.

## Where expressive motion belongs here

**Login.** It is the marketing surface of the product — seen once per session, before
any work starts, with nothing to be in the way of. The drifting orbs live here and
nowhere else.

**Empty states.** Seen rarely, and a moment where a little life reads as care rather
than delay.

**Nowhere else.** Every other surface is worked, not viewed.

### The one place a physics simulation is allowed

The login's neural mesh runs a spring simulation and can be dragged. That is the single
heaviest thing in the product, and it is permitted for exactly the reasons above: seen
once per session, unmounted afterwards, and nothing is waiting behind it.

**Never on a working surface.** A canvas redrawing at 60fps behind a ticket queue is
battery cost with no user benefit.

## The scale

| Duration | Use |
|---|---|
| **100ms** | Hover, focus ring, colour change. Below perception |
| **150ms** | The default for anything appearing or disappearing |
| **200ms** | Accordion, dropdown, tooltip |
| **250ms** | Drawer and modal enter |
| **300ms** | The ceiling for anything on a working surface |
| **>300ms** | Login only |

Easing:

```css
--ease-out:   cubic-bezier(.22, .80, .30, 1);   /* things arriving  */
--ease-in:    cubic-bezier(.55, 0, 1, .45);     /* things leaving   */
--ease-spring: cubic-bezier(.34, 1.4, .64, 1);  /* login only       */
```

Arriving is slower than leaving. Something the user dismissed should go immediately;
something appearing needs a moment to be tracked.

### Loaders are outside the scale, and here is the boundary

The table above governs a transition — something with a start, an end, and a known
duration. A loader has no end: it runs until an answer arrives. Its duration is a **cycle
length**, not a wait the user is paying for, so the 300ms ceiling does not apply and
never did.

Nine cycle lengths, 900ms to 1.6s, in `design/loaders.md` §2. They are the only durations
in the product above 300ms outside login.

**What the scale still governs is when a loader is allowed to appear.** Four gates, and
the third of them deliberately makes the product slower:

| Wait | Behaviour |
|---|---|
| **< 200ms** | No loader at all |
| **200ms – 1s** | Appear after a **150ms** delay, so it cannot flash |
| Once visible | Stay **at least 400ms** before content replaces it |
| **> 10s** | A line of text naming the current step. **Not a bigger loader** |

A 400ms floor adds latency to a response that arrived in 160ms. That is the trade: a
flash reads as a glitch and costs more attention than the wait it saved. It is a
deliberate slow-down, and it lives in `lib/useDeferredBusy.ts` so it is one decision
rather than one per call site.

## What animates, and what must not

| Animates | Never animates |
|---|---|
| `transform` | `width`, `height`, `top`, `left` |
| `opacity` | `margin`, `padding` |
| `filter` (sparingly) | `box-shadow` on a large surface |
| — | Anything during a scroll |

`transform` and `opacity` are composited — the GPU handles them without recalculating
layout. Animating `width` forces a layout pass per frame, and on a table of fifty rows
that is visible as jank.

## Rules for the working surface

- **Never delay information.** A skeleton appears instantly. A toast appears instantly.
  A fade-in on data the user is waiting for adds latency to something already slow.
- **No entrance animation on table rows.** Fifty rows staggering in is a second of
  waiting dressed as polish. This is the most common mistake in admin interfaces.
- **No scroll-triggered reveals.** A working screen is scrolled to find something. Making
  the thing fade in as it arrives makes finding it slower.
- **Animate state, not arrival.** A row highlighting because its status just changed is
  useful. A row fading in because it exists is not.
- **Interruptible.** Every transition can be reversed mid-flight. A drawer half-open must
  close from where it is, not finish opening first.

## The one thing that is not optional

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
}
```

For some people motion is not a preference, it is nausea and migraine. Vestibular
disorders are common enough that any product with real users has some.

Worth noting: **the reference site does this too** — a "Pause scrolling" control on its
testimonial marquee, and "Pause Animations" in its accessibility panel. The site whose
motion is being admired ships an off switch for it.

## What to build with

No connector, no service. It is CSS plus, at most, one library.

| Tool | Use | Verdict for Wasl |
|---|---|---|
| **CSS transitions / keyframes** | Hover, focus, accordion, fade | **Yes.** Roughly 90% of what is needed |
| **CSS scroll-driven** — `animation-timeline: view()` | Scroll reveals with no JS | Not needed — no scroll reveals on a working surface |
| **Motion** (ex Framer Motion) | Enter/exit, layout animation, springs, gestures | **Only if** list reorder or drawer choreography needs it. ~30KB gzipped, so it needs a reason |
| **GSAP + ScrollTrigger** | Complex scroll timelines | No. Built for the marketing case |
| **Lottie** | Designer-authored After Effects animation | No. Large payload, needs a motion designer |
| **Three.js / WebGL shaders** | The "wow" gradient backgrounds | No. The login orbs are CSS gradients and blur — a few hundred bytes against hundreds of kilobytes |

**Start with zero libraries.** The login already achieves its effect with CSS gradients,
`blur()`, and three keyframes. If a real need appears — animating a list as it reorders,
where CSS genuinely cannot — add Motion then, for that reason, recorded.

## And the honest note

The assessment awards nothing for animation. *Frontend & End-to-End Flow* is about the
feature working from screen to API to database and back.

A restrained, fast interface with correct empty and error states scores better than an
animated one with a missing loading state — and takes less time to build.
