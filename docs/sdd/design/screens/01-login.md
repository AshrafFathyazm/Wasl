# Screen — Login

**Route** `/login` · **Stories** Auth (ADR-005), US-014 · **Reachable by** anyone

## Purpose

Exchange credentials for a token, and let someone who cannot read English change the
language before they do it.

It is also the only expressive surface in the product (`design/motion.md`): seen once
per session, before any work starts, with nothing to get in the way of.

---

## Desktop — from 780px

```text
┌──────────────────────────────┬──────────────────── [EN] ┐
│                              ║                          │
│      ○ Email                 ║   [mark]                 │
│  ○         ○ WhatsApp        ║   Sign in                │
│      ◆ hub  (draggable)      ║   …                      │
│  ○         ○                 ║   [email]                │
│                              ║   [password]             │
│  ▸ Wasl · وصل                ║   ☑ remember   forgot?   │
│  Every conversation,         ║   [    Sign in    ]      │
│  in one place.               ║   © 2026                 │
│  Five channels, one thread.  ║                          │
└──────────────────────────────┴──────────────────────────┘
        50%              seam            50%
```

**50 / 50.** One half loud, one half quiet. That relationship is what creates the
hierarchy — the eye knows where to look first, then where to act.

### The left half — an interactive neural mesh

Not a ray burst. Rays were decoration pointing at a centre; **the mesh is the idea
itself** — connected points, everything reaching one place. It draws the product name
(وصل = connection) and the headline at once.

| Layer | z | What |
|---|---|---|
| Base | — | `#12121F` |
| Aurora | 0 | Desaturated conic, `blur(80px)`, 96s rotation |
| Halo | 1 | Soft glow that **follows the hub** |
| Mesh | 2 | Canvas: ~46 drifting particles, links under 88px, links to the hub under 145px |
| Nodes | 3 | Five channel tiles + hub, DOM, positioned by the simulation each frame |
| Vignette | 5 | Radial, centred on the network |
| Grain | 6 | `feTurbulence`, overlay, 15% |
| Scrim | 7 | Linear, bottom 34%, for text legibility only |
| Text | 8 | Chip, headline, subtitle |

### Drag physics

**The hub can be dragged. So can any tile.** Everything springs back.

| Body | Spring `k` | Damping | Behaviour |
|---|---|---|---|
| Hub | 0.055 | 0.80 | Heavy — returns slowly |
| Channel node | 0.075 | 0.78 | Lighter — arrives before the hub and waits |
| Mesh particle | 0.060 | 0.86 | Warps toward its home plus the hub's displacement |

Two details that make it feel physical rather than animated:

- **Nodes return faster than the hub.** If the centre were faster, the whole thing
  would read as jelly. A heavy centre with light branches is what reads as mass.
- **The field warp uses a Gaussian falloff** (σ = 150px) from the hub's home. Without
  it the web drags like a fishing net pulled from one corner; with it, it deforms like
  cloth.

Dragging a node pulls the hub back with a much weaker force (0.010 against 0.42), so
the relationship is asymmetric — the centre holds.

### The right half — light, and no card

White. **The form sits directly on the surface; there is no card.**

An elevated card on a dark background was separating the form from nothing, and it
added a shadow, a radius, and a border for no reason. The house login does the same —
dark panel, plain white form area.

### The seam — a contact shadow, not a gradient

```css
.form-side { box-shadow: inset 16px 0 26px -14px rgba(13, 20, 38, .18); }
```

Three options were rendered and compared:

| | Result |
|---|---|
| Hard edge | Clean, but reads as two colours meeting |
| **Contact shadow** | **Chosen.** Reads as one plane in front of another |
| Blended gradient | A dead grey band in the middle — a colour that exists nowhere else in the system, and it lets the panel's noise bleed into the calm half |

> **When two colours are far apart, do not put a gradient between them — put a shadow.**
>
> A gradient asks "what colour is in the middle?" and usually there is no good answer.
> A shadow asks "which one is in front?" — which always has one, and adds depth without
> introducing a colour.

### Desaturation

The palette was pulled back deliberately. It had drifted to `#5A4AE2` and `#6E5BE8` —
near-neon violet.

| | Before | After |
|---|---|---|
| Hub gradient | `#5A4AE2` → `#251D6E` | `#3B3577` → `#211C4C` |
| Aurora stops | Saturated violet and teal | `#1B1838` `#2A2657` `#20423F` `#332E63` |
| Mesh lines | 20% opacity | 13% |
| Hub glow at rest | 52px | none — appears on hover only |

**High saturation everywhere, glow on everything, glass on every surface, and no
hierarchy is what makes an interface read as machine-generated.** The fix is subtraction,
not a different colour.

Grain stays, and is worth keeping for the same reason: perfectly smooth gradients are
the generated look. Grain adds measured imperfection.

---

## Mobile — below 780px

**Redesigned, not scaled.** The first attempt shrank the desktop layout: the radius
collapsed to 86px around 46px tiles, the nodes overlapped into a cross, the rays became
larger than the network they were meant to frame, and the headline was hidden entirely —
leaving a panel that said nothing.

```text
┌────────────────────────── [EN] ┐
│ aurora · floating glow · grain │
│                                │
│ [✉][◇][💬][▭][▤]               │  five tiles, one row, 36px
│                                │
│ Every conversation,            │
│ in one place.                  │
│ Five channels, one thread.     │
├────────────────────────────────┤
│ [mark]                         │
│ Sign in …                      │
└────────────────────────────────┘
```

| Changed | Why |
|---|---|
| Circle → row | A circular network needs space to read as a network. At 190px of height there is no circle |
| Canvas stopped | Not hidden — the loop exits. No battery cost on a phone |
| Tilt removed | Pointer parallax is meaningless on touch |
| Headline kept | Otherwise the panel is pure decoration |
| "Hover" → "Tap" | Detected via `(hover: none)` |

Motion that remains: the aurora rotates, the glow floats, tiles enter staggered, the
headline mask-reveals, and the row breathes once every nine seconds — a 4px lift that
says the surface is alive without asking for attention.

Tapping a tile behaves as hovering does on desktop.

**Breakpoint is a `@container` query, not a media query.** The panel responds to its own
width, so the component works wherever it is placed.

---

## Elements

| Region | Element | Component | Tokens | i18n key |
|---|---|---|---|---|
| Panel | Chip | — | `rgba(255,255,255,.08)`, 1px border, pill | `auth:panel.chip` |
| Panel | Headline | — | `--type-h2` / 700 / white, line-by-line mask reveal | `auth:panel.headline` |
| Panel | Subtitle | — | `--type-label-md` / `--neutral-400`, swaps on channel hover | `auth:panel.body` |
| Panel | Channel tile | — | 46px (36 mobile), `--radius-lg`, frosted, 1px border | `channels:*` |
| Panel | Hub | — | 62px, brand gradient, `translateZ(46px)` | — |
| Form | Language switch | Button, Secondary-Outline, sm | h34, `inset-inline-end`, **above the card** | `common:lang.current` |
| Form | Card | — | white, `--radius-lg`, max-width 340, deep shadow | — |
| Form | Mark tile | `MarkTile` | 38px, `--navy-900` | — |
| Form | Title / subtitle | — | `--type-title-1` / `--type-label-md` | `auth:signIn.*` |
| Form | Error | — | `--state-danger-bg`, **`role="alert"`** | `auth:error.invalid` |
| Form | Email | Input | h45, `autocomplete="email"`, `name="email"` | `auth:field.email` |
| Form | Password | Input | h45, `autocomplete="current-password"`, `name="password"` | `auth:field.password` |
| Form | Caps Lock hint | — | `--state-warning-bg`, `--type-caption` | `auth:capsLock` |
| Form | Remember me | Checkbox | row is `flex-wrap` | `auth:rememberMe` |
| Form | Forgot | Link | `--navy-900`, underlined | `auth:forgotPassword` |
| Form | Submit | Button, Primary | full width, h44, spinner slot | `auth:signIn.submit` |

---

## The form is a `<form>`

Not a `<div>` with a button. Four things follow from that and each is a defect if missed:

| Requirement | Why |
|---|---|
| `<form onSubmit>` with `type="submit"` | **Enter submits.** People feel its absence without being able to name it |
| `autocomplete="email"` / `"current-password"` and `name` | **Password managers fill.** Without these, every sign-in is manual — the single largest UX loss on this screen, and it costs two attributes |
| `role="alert"` on the error | A screen reader hears the failure |
| Focus returns to email after a failure | The user can retype immediately |

## Accessibility

- **The entire brand panel is `aria-hidden="true"` and holds no focusable elements.**
  An earlier version gave the five tiles `tabindex="0"`, which meant a keyboard user
  tabbed through five decorative nodes before reaching the email field. Decorative
  things do not belong in the tab order.
- Caps Lock detection via `getModifierState` on `keyup`. One failed sign-in from Caps
  Lock convinces someone they forgot the password.
- Every control keyboard reachable with a visible focus ring.
- `prefers-reduced-motion`: no parallax, no tilt, no entrance, no pulse. The panel stays
  handsome and still, and hover still yields its information.

## Actions

| # | Trigger | Guard | Request | Success | Failure |
|---|---|---|---|---|---|
| 1 | Submit | Both fields non-empty | `POST /api/auth/token` | Store token, apply returned `preferredLanguage`, redirect to `returnUrl` or `/tickets` | `401` → one message above the submit, never field-level, and it never reveals whether the email exists |
| 2 | Change language | — | `localStorage` only, no user yet | Re-render; `dir` and `lang` update on `<html>` | — |
| 3 | Channel tile | — | — | Panel subtitle changes | — |
| 4 | Forgot password | — | — | Message: an administrator must reset it (ADR-005) | — |

## States

| State | Renders |
|---|---|
| Default | As above |
| Submitting | Spinner in the button, button width unchanged, inputs read-only |
| Invalid credentials | Error block, inputs get the danger border, focus to email |
| Server unreachable | Same block, different message, retry available |
| Caps Lock on | Hint under the password field |
| Already signed in | Redirect before render — the login screen never flashes |

## Performance

**This is the heaviest surface in the product**: a canvas redrawing every frame,
`blur(85px)` on the aurora, and `backdrop-filter` on six tiles.

Acceptable **only because it is the login screen** — seen once per session, then
unmounted. `design/motion.md` forbids anything like it on a working surface.

The canvas loop exits below the container breakpoint. Worth measuring on a low-end
device: if a 800px tablet struggles, raise the threshold or gate on
`navigator.hardwareConcurrency`.

## RTL

Panel and form swap sides — `flex` order, not a second layout. The language switch is
`inset-inline-end` and follows. The mark's threads arrive from the inline-start, which
in Arabic is the right, which is correct.

The aurora, rays, and particles do **not** mirror. They are abstract and have no reading
direction; mirroring them would be work with no meaning.

## Not on this screen

Registration · password reset · social sign-in · captcha · MFA · marketing copy beyond
one headline and one line. Each is out of scope per ADR-005, listed there with its
consequence.
