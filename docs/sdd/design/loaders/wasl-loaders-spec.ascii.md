# WASL LOADERS - IMPLEMENTATION SPEC
#
# THIS FILE IS PURE 7-BIT ASCII ON PURPOSE.
# No byte is above 0x7F, so a channel that reads UTF-8 as Latin-1 and
# drops bytes 0x80-0x9F cannot corrupt it.
# Arabic UI copy is carried at the end as \uXXXX escapes only.
#
# Idea: a Wasl loader is not a spinner. It is the brand mark in motion -
# three lines converging into one node. Every loader below is pure CSS,
# no libraries, and respects prefers-reduced-motion.


## 0. GLOBAL SETUP

Direction variables (declare once, at the app root):

  :root      { --ld-dir:  1; --ld-origin: left  }
  [dir="rtl"]{ --ld-dir: -1; --ld-origin: right }

  --ld-dur: 1.4s   (default loader duration, overridable per instance)

Why: transform does not know about writing direction. Any translateX
must be written as calc(<px> * var(--ld-dir, 1)), and any
transform-origin as var(--ld-origin, left).

Color
  loader color is ALWAYS currentColor. One implementation then works on
  white and on navy with no second copy.
  --brand navy   #1D174D
  --teal-600     #4A9E96  means "alive" only (waiting on an external
                          party). Never a fixed color inside a loader.
  --green-700    #2E7D32  NEVER appears in a loader. Green is a result,
                          not a waiting state.
  track / skeleton grey  #EDF1F2
  muted stroke           #DEE5E7


## 1. CONVERGE PRO - the system default loader

Structure (a 52x18 inline-block, position:relative, color inherited)
  3 dots, 5px, position:absolute, inset-inline-start:0,
    top 24% / 50% / 76%, margin-top:-2.5px, border-radius:50%,
    background:currentColor, opacity:0
  1 absorb ring, 20px, inset-inline-end:0, top:50%,
    margin-inline-end:-5.5px, border:1.5px solid currentColor,
    transform:translateY(-50%), opacity:0
  1 node, 9px, inset-inline-end:0, top:50%,
    background:currentColor, transform:translateY(-50%)

Keyframes

  @keyframes ldConv {
    0%        { transform:translateX(0)                             scale(.7); opacity:0 }
    16%       { transform:translateX(calc( 5px * var(--ld-dir, 1))) scale(1);  opacity:1 }
    70%       { transform:translateX(calc(30px * var(--ld-dir, 1))) scale(1);  opacity:1 }
    86%, 100% { transform:translateX(calc(36px * var(--ld-dir, 1))) scale(.3); opacity:0 }
  }
  @keyframes ldNode {
    0%,52%,100% { transform:translateY(-50%) scale(1)    }
    66%         { transform:translateY(-50%) scale(1.22) }
  }
  @keyframes ldRing {
    0%,56% { transform:translateY(-50%) scale(.6);  opacity:0  }
    68%    {                                        opacity:.4 }
    100%   { transform:translateY(-50%) scale(2.1); opacity:0  }
  }

Animation assignment
  dots: ldConv var(--ld-dur,1.4s) cubic-bezier(.45,0,.35,1) infinite
        delays 0 / .11s / .22s
  ring: ldRing var(--ld-dur,1.4s) cubic-bezier(.2,.6,.3,1) infinite
  node: ldNode var(--ld-dur,1.4s) cubic-bezier(.45,0,.35,1) infinite

The five decisions behind these numbers (do not "simplify" them away)
  1. Absorption by SIZE, not opacity. The dot shrinks to 0.3 entering
     the node, so it reads as having joined it.
  2. Calmer pulse: 1.22x, not 1.32x. The node receives; it does not ask
     for attention. A stronger pulse out-shouts the convergence itself.
  3. Absorb ring: a 1.5px circle expands and fades at the moment of
     arrival - it explains what happened without noise.
  4. Tighter vertical spread: 24 / 50 / 76%. The slant comes from the
     delays, so the trio still reads as one line.
  5. Faster entry: full opacity at 16% with a 5px push, so there is no
     empty moment at the start of the loop.

Inline usage
  wrapper: display:flex, align-items:center, gap:12px, and a 13px/500
  label next to it. On navy: same markup, color:#fff.

Compact variant (inside a field, in place of a value)
  34x12 box, dots 4px, node 7px, duration 1.2s, color #76818C.


## 2. THE NINE OTHER LOADERS

Mark   70x44 (svg viewBox 0 0 64 40), 1.6s
  the mark draws itself then withdraws into the node.
  @keyframes ldDraw { 0%{stroke-dashoffset:46} 42%,66%{stroke-dashoffset:0}
                      88%,100%{stroke-dashoffset:-46} }
  @keyframes ldMarkNode { 0%,50%,100%{transform:scale(1)} 64%{transform:scale(1.18)} }
  paths: stroke-width 4, stroke-dasharray 46, dashoffset 46,
  delays 0 / .1s / .2s, cubic-bezier(.45,0,.35,1)
  node circle: r 5.5, transform-box:fill-box, transform-origin:center
  Heaviest, most on-brand. Big moments only. NEVER mirrored (see 6).

Path   64x24, 1.6s linear
  two identical polylines: d="M3 18h11l8-12h13l7 8h8"
  base stroke #DEE5E7 2px, overlay stroke #1D174D 2px with
  stroke-dasharray:20 58, stroke-dashoffset:78
  @keyframes ldDash { to { stroke-dashoffset:0 } }
  end node: circle r 3.5 at (58,14)
  RTL: the whole svg gets transform:scaleX(var(--ld-dir,1)).

Chain   86x12, 1.6s, stagger 60ms
  dots 8px (last one 12px) with 14x2 links between them; grey base
  #DEE5E7, navy fill layered on top.
  @keyframes ldFill { 0%,8%{opacity:0} 24%,68%{opacity:1} 84%,100%{opacity:0} }
  @keyframes ldGrow { 0%,8%{transform:scaleX(0)} 30%,68%{transform:scaleX(1)}
                      84%,100%{transform:scaleX(0)} }
  links use transform-origin: var(--ld-origin, left). ease-out.

Orbit   28x28, 900ms
  ring: inset:0, border:2px solid #EDF1F2, border-top-color:#1D174D
  centre dot: 8px solid navy
  @keyframes ldSpin { to { transform:rotate(360deg) } }
  timing cubic-bezier(.5,.1,.4,.9) - NOT linear; the ease gives it a
  heartbeat instead of a machine spin.

Bars   27x18, 1.1s
  4 bars, 3x18px, radius 2, gap 4px
  @keyframes ldBar { 0%,100%{transform:scaleY(.3);opacity:.45}
                     42%{transform:scaleY(1);opacity:1} }
  ease-in-out, delays 0 / .1 / .2 / .3s
  Smallest loader in the system.

Bar   100% x 3px, 1.3s
  track #EDF1F2, segment width 28% navy
  @keyframes ldSweep { 0%  {transform:translateX(calc(-110% * var(--ld-dir, 1)))}
                       100%{transform:translateX(calc( 420% * var(--ld-dir, 1)))} }
  cubic-bezier(.55,0,.45,1)

Brand   64x40, 1.4s ease-in-out
  the whole mark, opacity pulse only, no drawing.
  @keyframes ldLogo { 0%,100%{opacity:.4;transform:scale(.98)}
                      50%{opacity:1;transform:scale(1)} }

Skeleton   rows 8px, 1.5s
  radius 2, background #EDF1F2, widths e.g. 100% / 72% / 48%
  @keyframes ldSkel { 0%,100%{opacity:1} 50%{opacity:.4} }
  ease-in-out, delays 0 / .15s / .3s
  Opacity pulse only - NO shimmer gradient.

Satellites   32x32, 1.5s, delay -500ms
  centre node 9px navy; two nested rotating wrappers:
    outer inset:0  -> dot 5px #4A9E96
    inner inset:5px -> dot 4px navy at opacity .4
  @keyframes ldOrbitDot { to { transform:rotate(360deg) } }
  cubic-bezier(.4,0,.6,1); the -.5s delay keeps them from ever aligning.
  This is the ONE loader where teal is correct: it means "alive".


## 3. WHICH LOADER, WHERE, FOR HOW LONG

Converge Pro   system default: saving a ticket, sending a reply,
               signing in - always with a text label.        0.5 - 5s
Mark           big moments only: full screen, workspace switch.
               Never repeated inside one screen.             > 1.5s
Path           medium waits: escalating a ticket, syncing a
               channel, generating a report.                 2 - 15s
Chain          a process with KNOWN steps (verify -> assign ->
               notify). Not for a single operation.          3 - 20s
Orbit          inside a button while sending, and inside a
               modal before its content appears.             0.3 - 3s
Bars           a table cell, a chip, a field computing its
               value - any space under 32px.                 any
Bar            background load that does not block input:
               page navigation, list filtering.              any
Skeleton       first load of the ticket list or the log.
               Always better than a spinner in tables.       0.3 - 3s
Satellites     waiting on an external channel, with text
               explaining what is happening.                 > 10s
Brand          full screen on first entry. Once per session. > 1s


## 4. TIMING RULES

  under 200ms      show NO loader at all.
  200ms - 1s       show it after a 150ms delay, so it cannot flash and
                   vanish.
  once shown       keep it at least 400ms before swapping in content.
  over 10s         add text explaining the current step - not a bigger
                   loader.
  search input     debounce 300ms from the last keystroke before the
                   request even starts.


## 5. DIRECTION AND ACCESSIBILITY

  use inset-inline-start / inset-inline-end, never left / right; in RTL
  the loader then flips by itself.
  transform is direction-blind: set the sign with
  --ld-dir: 1 | -1 inside calc(). The node always sits at the END of the
  reading direction - right in LTR, left in RTL.
  wrap all motion in @media (prefers-reduced-motion: no-preference).
  static fallback: the node alone at 100% opacity.
  container gets role="status" and aria-live="polite"; the visible label
  is sufficient as the accessible name.
  color is always currentColor.


## 6. THE NODE - WHEN IT IS TEAL AND WHEN IT IS NOT

Three legal marks
  Primary       all navy on a light background.  #1D174D on #FFFFFF
                default for documents, print, signatures, light headers.
  Reversed      white node on navy.              #FFFFFF on #1D174D
                default on navy and anywhere the mark is FUNCTIONAL:
                top bar, loader, buttons, dark email.
  Reversed teal teal node, white strokes.        node #4A9E96
                only where the mark REPRESENTS the product rather than
                operating it: app icon, favicon, product avatar, login
                screen, full-screen loading screen.

Size floor
  48px OK, 32px OK, 16px -> make the node WHITE.
  teal against navy is close to 3:1 - fine for a graphic element, but
  under 32px the node washes out and loses its shape.
  stroke-width scales up as the mark shrinks: 5 at 88px, 6 at 34px,
  7 at 23px, 9 at 12px.

DO NOT
  teal node on a light background - navy and teal side by side on white
    read as two logos; the primary mark is one color.
  teal node inside a loader - there the node is currentColor, always. A
    fixed teal loses the meaning "alive".
  teal node in print or contracts - one color version, plus a mono
    version for fax and stamps.
  gradient or shadow on the node - a solid circle only, at the original
    logo radius.
  MIRRORING THE MARK. --ld-dir flips motion and abstract shapes only;
  the mark loader keeps the logo's own orientation in both LTR and RTL.


## 7. FIELD LOADERS (four waiting states inside an input)

Async validation
  field height 47px (field-height-md), border 1px #1D174D (focused).
  Orbit 16px at the END of the field: border 1.5px solid #EDF1F2,
  border-top-color #1D174D, ldSpin .9s cubic-bezier(.5,.1,.4,.9).
  The field stays TYPEABLE during validation.
  The loader must be replaced by a result - a green check (#2E7D32,
  14px, stroke 1.75) or an error line (#E54545) - never disappear with
  no outcome.

Debounced search
  Bars, 3 x (2x14px), gap 3px, take the search icon's exact place, so
  nothing shifts. Request starts 300ms after the last character.

Server-computed value
  field is read-only while computing; background #EDF1F2.
  compact Converge (34x12, dots 4px, node 7px, 1.2s, #76818C) sits IN
  the value's own position, not beside it, with a short label.

Form first load
  skeleton with the FINAL field height (47px) and the label in its final
  place: label bar 8px x 96px, then a 47px block, ldSkel 1.5s with a
  .15s stagger. No spinner for a field that has not appeared yet.


## 8. DROPDOWN LOADERS (five states, each in its own layer)

1. Trigger loading its own value
   a saved value whose label is being fetched: skeleton bar 8px x 104px
   in the text position, chevron faded (#CAD3D7), trigger not openable.
   NO spinner.

2. Menu loading its options
   3 skeleton rows at the real option height (40px), bars 9px at
   68% / 44% / 56%, ldSkel with 0 / .15s / .3s delays.
   menu: border 1px #DEE5E7, radius 8px,
   shadow 0 4px 12px rgba(13,38,38,.08), padding 4px, row gap 2px.
   NEVER a spinner in the middle of the menu - it makes the menu height
   jump when data arrives.

3. Searching inside the menu
   search row: padding 8px 12px, divider below.
   Bars 3 x (2x12px) at the END of the search row.
   PREVIOUS results stay visible at opacity .4 - the list is not emptied.

4. Loading more (infinite scroll)
   a fixed row at the end of the menu: height 40px, centered, top
   divider, margin-top 4px, compact Converge 34x12 (#76818C) + label.
   It must not displace options or change the menu's max height (320px).

5. Chip being saved
   the pick appears IMMEDIATELY as a chip: chip-height 20px, padding
   0 8px, radius pill, 1px DASHED #CAD3D7, muted text, with an 11px
   orbit inside it, until the server confirms.
   On failure the chip is REMOVED with a message - it never hangs there.

Failure end state (every menu loader needs one)
  after 10s show the failure and a retry button: 32px tall, 1px solid
  #1D174D, radius 4, 13px/500 navy, with a 14px refresh icon.
  Do not leave skeletons pulsing forever.


## 9. WHICH LOADER IN WHICH SLOT

  inside a field        orbit 16px at the field end - the ONLY loader
                        allowed inside a field's frame
  in an icon's place    bars 2px at the icon's own size (16px) and
                        exact position
  in a value's place    compact converge 34x12 with text saying what is
                        being computed
  a whole menu          3-row skeleton at 40px - no spinner
  menu end row          compact converge + "loading more"
  a chip                orbit 11px inside a 20px chip with a dashed
                        pill border, until confirmed


## 10. HARD RULES

  Do NOT disable the field while waiting. Disabling clears focus and
  interrupts typing - the loader alone is enough.
  NOTHING may jump. The loader takes the exact size of what it replaces:
  icon 16px, row 40px, field 47px (field-height-md).
  300ms debounce for search; the loader appears only after 150ms and
  then stays at least 400ms.
  ONE loader per field. Never a spinner in the trigger and another in
  the menu at the same time.
  Screen reader: the field gets aria-busy="true"; the menu is
  aria-live="polite" and announces the result count on arrival.
  EVERY wait needs an ending - success, or failure with retry. No
  skeleton pulses forever.


## 11. ARABIC COPY - \uXXXX ESCAPES (ASCII-SAFE)

Decode with any JSON parser: JSON.parse('"<escape>"').

loading.tickets   ("Loading tickets...")
  "\u062C\u0627\u0631\u064D \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u062A\u0630\u0627\u0643\u0631\u002E\u002E\u002E"
loading.signin
  "\u062C\u0627\u0631\u064D \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644\u002E\u002E\u002E"
loading.more
  "\u062C\u0627\u0631\u064D \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0645\u0632\u064A\u062F\u002E\u002E\u002E"
loading.sla
  "\u064A\u064F\u062D\u0633\u0628 \u0632\u0645\u0646 \u0627\u0644\u0627\u0633\u062A\u062C\u0627\u0628\u0629\u002E\u002E\u002E"
validate.email.available
  "\u0627\u0644\u0628\u0631\u064A\u062F \u0645\u062A\u0627\u062D"
validate.email.taken
  "\u0645\u0633\u062A\u062E\u062F\u0645 \u0628\u0627\u0644\u0641\u0639\u0644"
error.channels.load
  "\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0642\u0646\u0648\u0627\u062A"
action.retry
  "\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629"
placeholder.channel
  "\u0627\u062E\u062A\u0631 \u0642\u0646\u0627\u0629"

# END OF SPEC
