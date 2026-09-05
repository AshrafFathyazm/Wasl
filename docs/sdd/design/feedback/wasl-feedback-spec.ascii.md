# WASL FEEDBACK LAYERS - IMPLEMENTATION SPEC
# Toast / Modal / Side Panel
#
# THIS FILE IS PURE 7-BIT ASCII ON PURPOSE.
# No byte in this file is above 0x7F, so it cannot be corrupted by a
# channel that reads UTF-8 as Latin-1 and drops bytes 0x80-0x9F.
# Arabic UI copy is carried at the end as \uXXXX escapes only.
#
# Direction: the product UI is RTL (dir="rtl") with LTR islands for
# code, IDs, numbers and latin text. Use logical CSS properties
# everywhere (inline-start / inline-end), never left / right.


## 0. TOKENS (consume these, never raw hex, in component code)

Brand / ink
  --brand:            #1D174D    (navy - action color, NOT a state color)
  --on-brand:         #FFFFFF
  --ink:              #0D2626

Neutrals
  --neutral-25:       #F9FAFB
  --neutral-50:       #F5F8F8
  --neutral-75:       #EDF1F2
  --neutral-200:      #DEE5E7
  --neutral-300:      #CAD3D7
  --neutral-400:      #9FABB5
  --neutral-500:      #76818C
  --neutral-700:      #606873

Semantic / state
  --green-700:        #2E7D32   success
  --amber-500:        #FFAF36   warning (bar/icon fill)
  --red-600:          #E54545   danger
  --blue-500:         #1570EF   info + link
  --teal-600:         #4A9E96   presence ONLY, never a state

Surfaces / text / borders
  --surface-card:     #FFFFFF
  --surface-content:  #F9FAFB
  --surface-sunken:   #EDF1F2
  --text-primary:     #0D2626
  --text-secondary:   #606873
  --text-muted:       #76818C
  --text-placeholder: #9FABB5
  --text-link:        #1570EF
  --state-warning-text: #8A5A00   (amber is not readable as text; use this)
  --border-subtle:    #DEE5E7
  --border-default:   #CAD3D7
  --border-focus:     #1570EF

Geometry
  --radius-sm: 4px   --radius-md: 8px   --radius-lg: 12px   --radius-pill: 999px
  --space-1: 4px  --space-2: 8px  --space-3: 12px  --space-4: 16px
  --space-6: 24px  --space-8: 32px
  --field-height-sm: 39px   --field-height-md: 47px   --field-height-lg: 51px
  --button-height-md: 40px
  --chip-height: 20px       --checkbox-size: 23px
  --list-row-height: 48px   --badge-dot-size: 7px
  --icon-stroke-width: 1.5

Layers
  --z-drawer: 100   --z-flyout: 200   --z-modal: 300   --z-tooltip: 400

Type
  toast title:  14px / 600
  toast body:   12px / line-height 1.55
  modal title:  16px / 700
  modal body:   14px / line-height 1.65
  arabic body line-height: 1.75 (leading-ar-normal)
  font stack: 'IBM Plex Sans Arabic', 'IBM Plex Sans', system-ui, sans-serif
  monospace islands (IDs, codes, sizes): 'IBM Plex Mono', monospace
    -> always with dir="ltr" and unicode-bidi: isolate

NOT YET IN tokens.css - ADD THESE BEFORE BUILDING, do not measure from
a screenshot:
  --toast-width: 360px
  --modal-w-sm: 420px   --modal-w-md: 560px   --modal-w-lg: 720px
  --panel-w-sm: 360px   --panel-w-md: 480px   --panel-w-lg: 640px

Color rule, non-negotiable: one color = one meaning.
  green = result, teal = presence, red = error, blue = information,
  navy = action. Never use navy to mean a state.


## 1. TOAST - transient message, does not block work

Anatomy (inline-start to inline-end in RTL: bar, icon, text, close)
  [3px type bar] [16px pad] [18px icon] [12px gap] [text col] [14px close]

Geometry
  width:        360px, max-width 90vw
  padding:      16px (space-4)
  type bar:     3px, on the inline-start edge, full height
  icon:         18px, stroke-width 1.5, margin-top 1px
  close icon:   14px, stroke #9FABB5, margin-top 3px
  radius:       8px (radius-md)
  shadow:       0 4px 12px rgba(13,38,38,.08)
  border:       1px solid #DEE5E7
  text gap:     3px between title and body; 5px above an action link
  enter:        180ms ease-out, opacity 0->1, translateY -8px -> 0
  exit:         120ms
  placement:    top inline-end, 24px offset (configurable per app)

Four types
  success  bar --green-700  icon stroke #2E7D32  circle + check
  warning  bar --amber-500  icon stroke #8A5A00  triangle + bang
  error    bar --red-600    icon stroke #E54545  circle + x
  info     bar --blue-500   icon stroke #1570EF  circle + i

Timing
  success 4s    info 5s    warning 6s
  error: NEVER auto-dismisses.
  any toast containing an action: 10s.
  countdown PAUSES on hover and on focus entering the toast.

Stacking
  max 3 visible at once; a 4th evicts the oldest.
  gap between toasts 8px; newest on top.
  a duplicate does NOT create a second toast - it refreshes the existing
  one and shows an "x2" counter.

Accessibility
  container role="status"  for success and info
  container role="alert"   for error and warning
  close button is a real <button> with an accessible label.
  optional 2px countdown bar, success and info only, transform-origin
  follows the reading direction (right in RTL).

Do not use a toast when
  the message needs careful reading, or carries data the user must not
  miss. Field-level errors belong under the field, not in a toast.


## 2. MODAL - blocks work, therefore only for decisions

Sizes
  sm 420px   confirm, warning, short message
  md 560px   short form, pick-from-list
  lg 720px   compact table, attachment preview

Geometry
  radius:   8px
  shadow:   0 12px 32px rgba(13,38,38,.12)
  scrim:    rgba(13,38,38,.4)   layer z-modal 300
  padding:  24px (space-6) body; footer 16px 24px; header 20px 24px
  header/footer dividers: 1px solid #EDF1F2
  fields:   field-height-md 47px
  enter:    180ms, translateY +6px -> 0, scale .99 -> 1

Body height
  grows to 70vh then scrolls. Header and footer stay fixed.

Buttons
  footer buttons are justified to the START of the reading direction.
  destructive primary = solid --red-600.
  normal primary = solid --brand.
  secondary = white, 1px solid --border-default.
  cancel comes FIRST in reading order.
  the destructive button is NEVER the default focus target.

Behavior
  closes on Esc, on the close button, and on scrim click - EXCEPT when
  it holds unsaved input, which must ask first.
  focus is trapped inside; focus returns to the opening element on close.
  role="dialog" aria-modal="true" aria-labelledby=<title id>
  one modal on screen at a time. A modal never opens a modal - use
  steps inside the same window.
  a single focus ring for the whole system: --focus-ring, 3px. No second,
  stronger ring inside modals.
  NO success message inside a modal - close it and fire a toast.

Form-in-modal limit
  3 fields or fewer. Longer goes to a side panel or a full page.


## 3. SIDE PANEL - details and filters, context stays visible

Sizes
  sm 360px   filters, properties, quick settings
  md 480px   ticket detail, customer profile
  lg 640px   long form, rule editor

Geometry
  side:     enters from the END of the reading direction
  motion:   220ms cubic-bezier(.2,.7,.3,1), translateX(100% * dir) -> 0
  border:   1px solid #DEE5E7 on the inline-start edge
  shadow:   0 4px 12px rgba(13,38,38,.08)
  header:   18px 20px, divider 1px #EDF1F2
  body:     20px
  footer:   14px 20px, divider 1px #EDF1F2
  layer:    z-drawer 100

Behavior
  NO scrim by default. The panel completes the context, it does not hide
  it, and the list behind stays interactive. Add a scrim ONLY when the
  panel holds a form that must not be lost - and then it rises to
  z-modal 300.
  header and footer fixed; only the body scrolls.
  Esc closes.
  the panel has its OWN URL and is deep-linkable.
  a panel never opens a panel - use tabs inside it, or go full page.
  below 768px it becomes a full page, not a narrow panel.
  tooltips alone sit above everything (z-tooltip 400).

Selected row
  the list row that owns the open panel keeps a persistent highlight and
  must not be overridden by row hover.


## 4. THE THREE PANEL VARIANTS

Filter panel (360px)
  applied by an EXPLICIT apply button, never on every click.
  active-filter count as a pill in the header:
    min-width 20px, height chip-height 20px, padding 0 6px,
    background --brand, color --on-brand, radius-pill, 12px.
  a Reset action appears only when at least one filter is set.
  checkbox: 23px, radius-sm; checked = --brand fill + 13px white check,
  stroke-width 1.5.
  footer: primary apply (flex 1) + secondary reset.

Loading panel
  skeletons mirror the FINAL panel structure - header, body, footer - so
  nothing shifts when data arrives.
  NO centered spinner.
  skeleton bars: height 8px (10px for a title line), radius-sm,
  background --surface-sunken.
  pulse: opacity 1 -> .4 -> 1, 1.5s ease-in-out infinite,
  stagger delays 0 / .15s / .3s.
  footer skeleton keeps the real button heights (button-height-md 40px).

Tabbed panel
  the answer to "a panel opening a panel". 3 tabs maximum.
  active tab: 2px bottom border --brand, 13px / 600, color --brand.
  inactive: 13px, color --text-muted.
  the active tab is stored in the URL along with the panel.

Empty state (inside any of them)
  the mark is drawn with a dashed stroke (stroke-dasharray "3 5") in
  --neutral-400.
  one line stating the fact, one line stating what to do.
  centered, gap space-2, padding space-6 space-4.


## 5. THE DECISION MATRIX - EVENT -> SURFACE

THIS IS THE FOUNDATIONAL RULE OF THE WHOLE SPEC. Sections 1-4 are only
the geometry of each surface; this section decides WHICH surface an
event gets. Implement this table before any pixel of 1-4.

Read it as: given the event in column 1, the surface in column 2 is the
only correct answer. Column 3 is the wrong answer people reach for.

5.1 RESULTS OF A COMPLETED ACTION

  event                          | surface                       | NOT
  -------------------------------+-------------------------------+---------------
  reply sent                     | toast success 4s              | modal
  ticket status changed          | toast success 4s              | modal
  customer created / edited      | close the panel, THEN toast   | toast inside
                                 | success 4s                    | the panel
  filter applied                 | no surface at all - the list  | toast
                                 | changing IS the feedback      |
  background sync finished       | toast info 5s                 | modal
  settings / rules updated       | toast info 5s                 | modal
  bulk action finished           | toast success 4s with the      | modal
                                 | count in the text             |

5.2 FAILURES - the surface depends on the SCOPE of the failure

  scope of failure               | surface                       | NOT
  -------------------------------+-------------------------------+---------------
  one specific field             | inline message under the      | toast
  (bad email, missing name)      | field, 12px #C4362F           |
  the whole request              | toast error, NO auto-dismiss, | inline
  (network, channel down, 5xx)   | with a retry action           |
  permission denied              | toast error, no retry, plain  | modal
                                 | statement of who to ask       |
  session expired                | modal - it blocks, and it     | toast
                                 | must block                    |
  409 conflict, someone else     | inline banner inside the open | toast
  edited the record              | panel or form, with a compare |
                                 | and a reload action           |
  partial bulk failure           | toast warning 6s + a link to  | toast success
  (7 of 10 succeeded)            | the failed rows               |
  upload failed                  | inline in the composer, next  | toast
                                 | to the file row               |

5.3 THINGS THE USER MUST DECIDE

  event                          | surface                       | NOT
  -------------------------------+-------------------------------+---------------
  delete a ticket / customer     | modal sm 420px, red primary,  | toast with
                                 | cancel first                  | undo
  bulk delete N rows             | modal sm with N stated in the | inline
                                 | title                         | confirm
  escalate (needs a team and a   | modal md 560px - exactly two  | side panel
  reason)                        | fields                        |
  close a form with unsaved      | modal sm, asked BEFORE the    | silent close
  input                          | close completes               |
  irreversible export / purge    | modal sm, and the destructive | modal lg
                                 | button is not default-focused |
  a step that must be finished   | modal - that is what blocking | side panel
  now (2FA, accept terms)        | is for                        |

5.4 THINGS THE USER WANTS TO INSPECT OR TRY

  event                          | surface                       | NOT
  -------------------------------+-------------------------------+---------------
  open a ticket from the list    | side panel md 480px, no scrim | modal
  open a customer profile        | side panel md 480px, no scrim | modal
  add / edit a customer          | side panel md 480px, form     | modal
                                 | inside, scrim ONLY here       |
  filter the list                | side panel sm 360px, no       | modal
                                 | scrim, explicit apply         |
  more than 3 form fields        | side panel, or a full page    | modal
  compare / preview an           | modal lg 720px if read-only;  | -
  attachment                     | side panel if it has actions  |
  a long multi-step task         | full page with its own URL    | modal
  content that gets shared by    | full page - a link must open  | panel
  link                           | it                            |

5.5 TIE-BREAK RULES (apply in this order)

  1. Does the user have to decide something before anything else can
     happen? -> modal. Nothing else blocks.
  2. Does the user need to see the list / context while doing it?
     -> side panel. Never a modal.
  3. Is it just the outcome of something already finished? -> toast.
     Never a modal.
  4. Does the error belong to one field? -> inline under the field.
     Never a toast.
  5. Is the visible change its own feedback (filtering, sorting,
     search)? -> no surface at all. Adding a toast is noise.
  6. Wider than 640px or needs full attention? -> full page.
  7. Will the user come straight back to where they were? -> then it is
     NOT a full page.

5.6 COMBINATION RULES - one event, one surface

  never two surfaces for one event. A toast AND an inline error for the
    same failure is a bug, not thoroughness.
  no success message inside a modal - close the modal, fire a toast.
  no success message inside a side panel that is closing - close it,
    then fire the toast.
  a modal never opens a modal; a panel never opens a panel.
  a toast never carries information the user cannot afford to miss. If
    losing it hurts, it is not a toast.
  if an action is undoable, prefer toast + undo over a confirm modal.
    Reserve the modal for what cannot be taken back.


## 6. STATE COLOR PAIRS (background / text)

  success   bg #E8F5E9   text #2E7D32
  warning   bg #FFFAE8   text #8A5A00
  danger    bg #FDE9EB   text #E54545
  info      bg #F1F7FD   text #1570EF

Presence dot: --teal-600 #4A9E96, size badge-dot-size 7px, border-radius 50%.
Presence is not a state - it appears only in the dot.


## 7. RTL / BIDI RULES

  root container dir="rtl".
  every inset, padding, margin, border and radius that differs by side
  uses the logical property: padding-inline-start, border-inline-end,
  inset-inline-end, margin-inline, etc.
  panel slide direction: translateX(calc(100% * var(--dir))) with
  --dir: -1 in RTL and 1 in LTR.
  countdown / progress bars: transform-origin: right in RTL, left in LTR.
  any latin run - IDs (#4821), codes (trace 9f2c41), sizes (360px),
  emails, phone numbers, CSS snippets - must be wrapped:
    <span dir="ltr" style="unicode-bidi: isolate">...</span>
  phone and numeric columns: font-variant-numeric: tabular-nums.


## 8. THINGS THAT BREAK EASILY - CHECK THESE

  1. Skeleton height must equal the final row/section height. A mismatch
     produces a visible jump when data lands.
  2. Amber #FFAF36 as text fails contrast. Warning TEXT is #8A5A00.
  3. inset box-shadow on a table row requires border-collapse: collapse.
  4. Hover must not change padding, height or border - any size change
     makes the row jump.
  5. If rows carry an inline background from JS, CSS :hover cannot win.
     Set hover in the same JS layer and skip the selected row.
  6. A modal with unsaved input must not close on scrim click.
  7. Do not put a second focus ring inside a modal.
  8. line-height 1.5 minimum on table cells; 1.75 for Arabic prose.


## 9. ARABIC COPY - \uXXXX ESCAPES (ASCII-SAFE)

Decode with any JSON parser or JS: JSON.parse('"<escape>"').
These are sample strings only; final copy comes from the content owner.

toast.success.title
  "\u062A\u0645 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0631\u062F\u0651."
toast.warning.title
  "\u0627\u0644\u062A\u0630\u0643\u0631\u0629 \u062A\u062C\u0627\u0648\u0632\u062A \u0632\u0645\u0646 \u0627\u0644\u0627\u0633\u062A\u062C\u0627\u0628\u0629."
toast.error.title
  "\u062A\u0639\u0630\u0651\u0631 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0631\u062F\u0651."
toast.info.title
  "\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0642\u0648\u0627\u0639\u062F \u0627\u0644\u062A\u0635\u0639\u064A\u062F."
action.retry
  "\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629"
action.apply
  "\u062A\u0637\u0628\u064A\u0642"
action.reset
  "\u062A\u0635\u0641\u064A\u0631"
action.cancel
  "\u0625\u0644\u063A\u0627\u0621"
action.delete
  "\u062D\u0630\u0641"
action.escalate
  "\u062A\u0635\u0639\u064A\u062F"
action.reply
  "\u0631\u062F\u0651"
label.filters
  "\u0627\u0644\u0641\u0644\u0627\u062A\u0631"
label.details
  "\u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644"
label.log
  "\u0627\u0644\u0633\u062C\u0644"
label.attachments
  "\u0627\u0644\u0645\u0631\u0641\u0642\u0627\u062A"
label.status
  "\u0627\u0644\u062D\u0627\u0644\u0629"
label.channel
  "\u0627\u0644\u0642\u0646\u0627\u0629"
label.customer
  "\u0627\u0644\u0639\u0645\u064A\u0644"

# END OF SPEC
