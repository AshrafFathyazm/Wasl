# The Feedback Layer

Toast, modal, side panel — and the rule for which one carries which message.

**Source.** `wasl-feedback-spec.ascii.md`, supplied 2026-09-05, together with
`Toasts Modals Panels.dc.html` and eight rendered screenshots of it. This file is the
design of record: the repository language rule (`CLAUDE.md`) makes **this** the document
the code is measured against.

> **The `.dc.html` is not in the repository, and this is the second document that could
> not be vendored.** It reached the build twice through a channel that reads UTF-8 as
> Latin-1 and drops every byte in `0x80–0x9F` — which is `ف ق ك ل م ن ه و ي` and every
> Arabic diacritic. A vendored copy with corrupted Arabic is worse than none: it would be
> read as the source and it would be wrong. `loaders.md` records the same thing about
> `Loaders.dc.html`.
>
> **The fix was a format, not a channel.** The ASCII re-issue is pure 7-bit — measured at
> 18,206 bytes, maximum byte `0x7c`, zero above `0x7F` — with the Arabic copy carried as
> `\uXXXX` escapes that decode through `JSON.parse`. All 18 strings were decoded and
> checked against the screenshots. **Documents supplied to this repository should use that
> format.** It is the only one of the three deliveries that survived intact.

Provenance marker in `tokens.css` is **(G)**.

---

## 1 · The decision matrix — event → surface

**This is the foundational rule, and it is first because everything else is only the
geometry of a surface that this section has already chosen.** Sections 2 to 4 do not
decide anything; they draw what this decides.

`030`'s spec recorded this matrix as *"not recoverable at all"* from the corrupted paste.
It was recovered from the screenshots, and then the ASCII re-issue **expanded it** from
five rows to six subsections. What follows is authored content, not a transcription — it
answers questions the original five rows did not reach.

### 1.1 · Results of a completed action

| Event | Surface | Not |
|---|---|---|
| Reply sent | toast success 4s | modal |
| Ticket status changed | toast success 4s | modal |
| Customer created or edited | close the panel, **then** toast success 4s | a toast inside the panel |
| Filter applied | **no surface at all** — the list changing is the feedback | toast |
| Background sync finished | toast info 5s | modal |
| Settings or rules updated | toast info 5s | modal |
| Bulk action finished | toast success 4s, with the count in the text | modal |

### 1.2 · Failures — the surface follows the SCOPE of the failure

| Scope | Surface | Not |
|---|---|---|
| One specific field (bad email, missing name) | inline under the field, 12px `#C4362F` | toast |
| The whole request (network, channel down, 5xx) | toast error, **no auto-dismiss**, with a retry action | inline |
| Permission denied | toast error, **no retry**, a plain statement of who to ask | modal |
| Session expired | **modal** — it blocks, and it must block | toast |
| `409` conflict, someone else edited the record | inline banner inside the open panel or form, with a compare and a reload | toast |
| Partial bulk failure (7 of 10) | toast warning 6s + a link to the failed rows | toast success |
| Upload failed | inline in the composer, beside the file row | toast |

**This is the row that changes shipped code.** `TicketDetailPage` answers a `403` with an
inline banner and a `409` with an inline banner. The matrix says the `409` is right and
the `403` is wrong: a permission denial is request-wide, not attached to any field the
reader can correct. See §7.

### 1.3 · Things the user must decide

| Event | Surface | Not |
|---|---|---|
| Delete a ticket or customer | modal sm 420px, red primary, cancel first | toast with undo |
| Bulk delete N rows | modal sm, with N stated in the title | inline confirm |
| Escalate (needs a team and a reason) | modal md 560px — exactly two fields | side panel |
| Close a form with unsaved input | modal sm, asked **before** the close completes | silent close |
| Irreversible export or purge | modal sm, destructive button not default-focused | modal lg |
| A step that must be finished now (2FA, terms) | modal — that is what blocking is for | side panel |

### 1.4 · Things the user wants to inspect or try

| Event | Surface | Not |
|---|---|---|
| Open a ticket from the list | side panel md 480px, **no scrim** | modal |
| Open a customer profile | side panel md 480px, **no scrim** | modal |
| Add or edit a customer | side panel md 480px, form inside, **scrim ONLY here** | modal |
| Filter the list | side panel sm 360px, no scrim, explicit apply | modal |
| More than 3 form fields | side panel, or a full page | modal |
| Compare or preview an attachment | modal lg 720px if read-only; side panel if it has actions | — |
| A long multi-step task | full page with its own URL | modal |
| Content shared by link | full page — a link must open it | panel |

**The scrim column is a behaviour, not a finish.** Two rows of this table ask one
component for two different behaviours, which is why `SideSheet` takes a `scrim` prop —
see §4.

### 1.5 · Tie-breaks, applied in this order

1. Must the user decide something before anything else can happen? → **modal**. Nothing
   else blocks.
2. Does the user need to see the list or context while doing it? → **side panel**. Never a
   modal.
3. Is it only the outcome of something already finished? → **toast**. Never a modal.
4. Does the error belong to one field? → **inline under the field**. Never a toast.
5. Is the visible change its own feedback — filtering, sorting, search? → **no surface at
   all**. A toast here is noise.
6. Wider than 640px, or needs full attention? → **full page**.
7. Will the user come straight back to where they were? → then it is **not** a full page.

### 1.6 · One event, one surface

- **Never two surfaces for one event.** A toast *and* an inline error for the same failure
  is a bug, not thoroughness.
- No success message inside a modal — close it, then fire the toast.
- No success message inside a side panel that is closing — close it, then fire the toast.
- A modal never opens a modal; a panel never opens a panel.
- A toast never carries information the user cannot afford to miss. **If losing it hurts,
  it is not a toast.**
- If an action is undoable, prefer toast + undo over a confirm modal. Reserve the modal
  for what cannot be taken back.

---

## 2 · Toast

A transient message that does not block work.

### Anatomy

Inline-start to inline-end: `[3px type bar] [16px pad] [18px icon] [12px gap] [text] [14px close]`

| | |
|---|---|
| Width | `--toast-width` 360px, `max-inline-size: 90vw` |
| Padding | `--space-4` 16px |
| Type bar | 3px, **inline-start** edge, full height |
| Icon | 18px, `--icon-stroke-width` 1.5, `margin-block-start: 1px` |
| Close icon | 14px, `--neutral-400`, `margin-block-start: 3px` |
| Radius · shadow | `--radius-md` 8px · `--shadow-md` |
| Border | `--border-width` solid `--neutral-200` |
| Text gap | 3px title→body; 5px above an action link |
| Enter · exit | 180ms `--ease-out`, opacity 0→1, `translateY(-8px)` → 0 · 120ms |
| Placement | **top inline-end, 24px offset** |

### The four tones

| Tone | Bar | Icon stroke | Glyph |
|---|---|---|---|
| success | `--green-700` | `#2E7D32` | circle + check |
| warning | `--amber-500` | `#8A5A00` | triangle + bang |
| error | `--red-600` | `#E54545` | circle + × |
| info | `--blue-500` | `#1570EF` | circle + i |

**Amber is a fill, never text.** `#FFAF36` as text fails contrast; warning text is
`--state-warning-text` `#8A5A00`.

### Timing and stacking

- success **4s** · info **5s** · warning **6s**
- **An error never auto-dismisses.**
- Any toast carrying an action: **10s**.
- The countdown **pauses** on hover and when focus enters the toast.
- Maximum **three** visible; a fourth evicts the oldest.
- Gap 8px, newest at the top.
- **A duplicate does not create a second toast** — it refreshes the existing one and shows
  an `×2` counter.

### Accessibility

`role="status"` for success and info; **`role="alert"` for error and warning**. The
existing primitive uses `status` for every tone and its own comment argues for it — that
argument was made for one screen's summary, and this document overrides it for the two
tones that interrupt on purpose.

The close control is a real `<button>` with an accessible name. The optional 2px countdown
bar is for success and info only, with `transform-origin` following the reading direction
(right in RTL).

---

## 3 · Modal

Blocks work — therefore only for decisions.

| Size | Width | For |
|---|---|---|
| sm | `--modal-w-sm` 420px | confirm, warning, short message |
| md | `--modal-w-md` 560px | short form, pick-from-list |
| lg | `--modal-w-lg` 720px | compact table, attachment preview |

| | |
|---|---|
| Radius | `--radius-md` 8px |
| Shadow | `0 12px 32px rgb(13 38 38 / 12%)` |
| Scrim · layer | **`--scrim`** · `--z-modal` 300 |
| Padding | body `--space-6`; footer 16px 24px; header 20px 24px |
| Dividers | `--border-width` solid `--neutral-75` |
| Fields | `--field-height-md` 47px |
| Enter | 180ms, `translateY(+6px)` → 0, `scale(.99)` → 1 |
| Body | grows to `70vh` then scrolls; header and footer stay fixed |

### Button order — the rule is two rules

The source document's prose says *"cancel comes first in reading order"* while both of its
own drawn examples put the primary first. **They are not in conflict; the prose was
over-generalised.** Ruled by the product owner 2026-09-05:

| Modal | Order in reading direction |
|---|---|
| **Ordinary** (escalate, save) | primary action **first**, then cancel — the drawing is right |
| **Destructive** (delete, purge) | cancel **first**, then the red action — the drawing is wrong here and is corrected |

**In both cases the destructive button is never the default focus target. Focus starts on
cancel.**

Destructive primary is solid `--red-600`; ordinary primary is solid `--brand`; secondary is
white with `--border-default`.

### Behaviour

- Closes on `Esc`, on the close button, and on scrim click — **except** when it holds
  unsaved input, which must ask first.
- Focus is trapped inside and returns to the opening element on close.
- `role="dialog"` `aria-modal="true"` `aria-labelledby=<title id>`.
- **One modal on screen.** A modal never opens a modal — use steps inside the same window.
- One focus ring for the whole system: `--focus-ring`, `--focus-ring-width` 3px. **No
  second, stronger ring inside a modal.**
- **No success message inside a modal** — close it and fire a toast.
- **Three fields or fewer.** Longer goes to a side panel or a full page.

---

## 4 · Side panel

Details and filters, with the context still visible.

| Size | Width | For |
|---|---|---|
| sm | `--panel-w-sm` 360px | filters, properties, quick settings |
| md | `--panel-w-md` 480px | ticket detail, customer profile |
| lg | `--panel-w-lg` 640px | long form, rule editor |

**`035` shipped the sheet at 600px, measured off a single frame.** That is a sample, not a
rule, and the ladder exists so that the next screen does not measure a second one. Ruled
2026-09-05: **480 wins, 600 is deleted, and the component takes a `size` prop against the
three tokens — it does not take a number.**

| | |
|---|---|
| Side | enters from the **end** of the reading direction |
| Motion | 220ms `cubic-bezier(.2,.7,.3,1)`, `translateX(100% × --ld-dir)` → 0 |
| Border | `--border-width` on the inline-start edge |
| Shadow | `--shadow-md` |
| Header · body · footer | 18px 20px · 20px · 14px 20px, dividers `--neutral-75` |
| Layer | `--z-drawer` 100 without a scrim; `--z-modal` 300 with one |

### The scrim is conditional, and the difference is behavioural

| | `scrim={false}` | `scrim` |
|---|---|---|
| For | customer profile, ticket detail, filters | the add / edit form |
| Why | the panel **completes** the context; the list behind stays interactive | the input must not be lost |
| Layer | `--z-drawer` 100 | `--z-modal` 300 |
| Scrim click | — | **asks before closing** |

This is not cosmetic. Without a scrim the list behind is a live target, so the panel does
not lock body scroll, does not trap Tab, and does not claim `aria-modal="true"` — claiming
it while the document behind is genuinely reachable tells a screen-reader user something
false.

### Behaviour

- Header and footer fixed; only the body scrolls.
- `Esc` closes.
- **The panel has its own URL and is deep-linkable.**
- A panel never opens a panel — use tabs inside it, or go full page.
- Below `768px` it becomes a full page, not a narrow panel.
- Tooltips alone sit above everything (`--z-tooltip` 400).
- **The list row that owns the open panel keeps a persistent highlight**, and row hover
  must not override it.

---

## 5 · The three panel variants

### Filter panel — 360px

Applied by an **explicit apply button**, never on every click. The active-filter count is a
pill in the header: `min-inline-size: 20px`, `--chip-height` 20px, padding `0 6px`,
`--brand` on `--on-brand`, `--radius-pill`, 12px. A reset action appears **only** when at
least one filter is set. Checkbox `--checkbox-size` 23px, `--radius-sm`; checked is a
`--brand` fill with a 13px white check at stroke 1.5. Footer: primary apply (`flex: 1`) +
secondary reset.

### Loading panel

Skeletons **mirror the final panel structure** — header, body, footer — so nothing shifts
when the data lands. **No centred spinner.** Bars 8px (10px for a title line),
`--radius-sm`, `--surface-sunken`; pulse opacity 1 → .4 → 1 over 1.5s `ease-in-out`, with
0 / .15s / .3s stagger. The footer skeleton keeps the real `--button-height-md` 40px.

This is `loaders.md`'s Skeleton, not a second mechanism.

### Tabbed panel

The answer to *"a panel opening a panel"*. **Three tabs maximum.** Active tab: 2px bottom
border `--brand`, 13px/600, `--brand`. Inactive: 13px `--text-muted`. **The active tab is
stored in the URL alongside the panel.**

### Empty state, inside any of them

The mark drawn with `stroke-dasharray="3 5"` in `--neutral-400` — *Wasl with no
connection*. One line stating the fact, one line stating what to do. Centred, gap
`--space-2`, padding `--space-6` `--space-4`.

---

## 6 · Colour, direction, and the things that break

### One colour, one meaning

green = result · teal = presence · red = error · blue = information · **navy = action**.
**Navy is never a state.**

| | Background | Text |
|---|---|---|
| success | `#E8F5E9` | `#2E7D32` |
| warning | `#FFFAE8` | `#8A5A00` |
| danger | `#FDE9EB` | `#E54545` |
| info | `#F1F7FD` | `#1570EF` |

The presence dot is `--teal-600` at `--badge-dot-size` 7px, and **presence is not a
state** — it appears only in the dot.

### RTL and bidi

Everything that differs by side uses the logical property. Panel slide is
`translateX(calc(100% * var(--ld-dir)))`; countdown bars use `transform-origin: right` in
RTL. **Every latin run** — ids `#4821`, codes `trace 9f2c41`, sizes `360px`, emails, phone
numbers — is wrapped `dir="ltr"` with `unicode-bidi: isolate`. Numeric columns get
`font-variant-numeric: tabular-nums`.

### Eight things that break quietly

1. **Skeleton height must equal the final height.** A mismatch is a visible jump when data
   lands.
2. **`#FFAF36` as text fails contrast.** Warning text is `#8A5A00`.
3. `inset box-shadow` on a table row needs `border-collapse: collapse`.
4. **Hover must not change padding, height or border** — any size change makes the row
   jump.
5. If rows carry an inline background from JS, CSS `:hover` cannot win. Set hover in the
   same JS layer and skip the selected row.
6. **A modal with unsaved input must not close on scrim click.**
7. No second focus ring inside a modal.
8. `line-height` 1.5 minimum on table cells; **1.75 for Arabic prose**.

---

## 7 · What is built, what disagrees, and what is not built

### Built

| | Where | Against this document |
|---|---|---|
| `Toast` | `components/Toast/Toast.tsx` | The card. Restyled from a tinted fill to the white card + 3px stripe (#1), four tones with their own glyphs, `role` following the tone, and a countdown that pauses on hover and focus |
| `ToastHost` | `components/Toast/ToastHost.tsx` | The system `006` deferred: the stack (3, newest first, a fourth evicts the oldest), the timing table, the `×2` de-duplication, and `useToast()`. Mounted once in `AppShell` |
| `Modal` | `components/Modal/Modal.tsx` | Three sizes, the 70vh body, focus trap and restore, `aria-labelledby`, the scrim guard over unsaved input, and the destructive focus rule |
| `SideSheet` | `components/SideSheet/` | Built by `035` from frames. Was 600px with an unconditional scrim at 34% on `--z-modal`. Corrected to the `size` / `scrim` props above |

Two icons were added for the tones — `IconTriangleAlert` and `IconCircleInfo`. The set
had `IconAlert`, a bang in a *circle*, and reusing it for warning would have left the four
tones separable by colour alone. Colour alone is not a distinction for the readers who
most need one.

`--state-warning-fill` was added at the same time, and the gap is worth recording: warning
is the only tone whose solid mark is not its own text colour, because `--state-warning-text`
is *derived* — amber has no readable text form. The other three paint their 3px stripe with
their own `-text` value. `lint:tokens` is what surfaced it, by refusing `--amber-500` in a
component, which is exactly what that guard says it is for.

**`030`'s spec says the side panel is "neither built nor inventoried". That is stale** —
it was true when the spec was written on 2026-08-31 and `035` built the sheet on
2026-09-03 from a later set of frames. `SideSheet.module.css` already records settling two
of `030`'s nine disagreements from those frames: a white header, and 220ms.

### Wired

| Row | Where | Surface |
|---|---|---|
| §1.1 reply sent | `TicketDetailPage` | toast success 4s |
| §1.1 ticket status changed | `TicketDetailPage` | toast success 4s |
| §1.1 customer created | `CustomersListPage` | sheet closes, **then** toast success |
| §1.1 customer edited | `EditCustomerPage` | navigates, **then** toast success |
| §1.2 permission denied | `TicketDetailPage` | toast error, **no retry** |
| §1.2 whole request failed | `TicketDetailPage` | toast error, no auto-dismiss, **with** retry |
| §1.2 `409` conflict | `TicketDetailPage` | inline banner — unchanged |
| §1.3 close a form with unsaved input | `CustomersListPage` | **modal sm, destructive** |

**The `403` is the one that overturned a house rule.** `10-shared-patterns.md` said
*"forbidden goes inline beside the control, never a toast"* — and it was one of only two
rules recoverable before §04 arrived. Guessing from the two known rules would have
preserved exactly the wrong one. The `409` beside it stays inline, which is the same rule
read the other way: it is about this record, it offers a reload, and the reader has to see
it next to what changed.

**The retry is on exactly one write, and the reason is `expectedVersion`.** A retry on the
status or assignee write would re-send a version that the refetch behind the error may
already have replaced — turning a network failure into a `409` on the reader's second
press. Only the tag writes carry no version, so only they can honestly offer to try again.

### Deliberately no surface

**Assignment and tag writes fire nothing**, and the absence is §1.5's tie-break 5 rather
than an omission: *is the visible change its own feedback? → no surface at all. Adding a
toast is noise.* The rail's assignee block and the tag row are what the reader is looking
at, and they change under them. §1.1 does not list either.

### Not wired yet

§1.1's bulk actions and background sync, §1.2's partial bulk failure and upload failure,
and §1.3's session expired and delete confirmations. **None of those flows exist in the
product yet** — they are rows waiting for features, not call sites waiting for a surface.

### The nine disagreements — ruled 2026-09-05

`030` §3 recorded nine differences against `10-shared-patterns.md` and `motion.md`. All
are settled here:

| # | Thing | Ruling |
|---|---|---|
| 1 | Toast visual model | **Source** — white card + 3px inline-start stripe |
| 2 | Toast placement | **Source** — top inline-end, 24px. `10-shared-patterns.md` said bottom |
| 3 | Modal radius | **Source** — `--radius-md` 8px, not `--radius-lg` |
| 4 | Scrim | **Token** — `--scrim` 40%. See below |
| 5 | Drawer header | **Frames** — white, already shipped by `035` |
| 6 | Modal enter | **Source** — 180ms. `motion.md`'s 250ms row is amended, not duplicated |
| 7 | Panel enter | **Source** — 220ms, already shipped by `035` |
| 8 | Easing | **Token** — `--ease-out`. `.2,.7,.3,1` is a near-match to `.22,.80,.30,1` |
| 9 | Modal confirm icon | **Source** — absent. The house document's 48px circle is dropped |
| — | Modal width | **Source** — three sizes replace `max-width: 440` |
| — | Panel width | **Source** — three sizes; the house 480 is the md |

**Rows 4 and 8 go the other way from the rest, and the reason is written in `tokens.css`
already:** a near-match is a second scale, not a refinement. `.4` against `.45` and
`.2,.7,.3,1` against `.22,.80,.30,1` are invisible in review and leave two values in the
system. Rows 6 and 7 are **not** that case — 180ms against 250ms is perceptible and is a
real design intent, so the losing document is amended rather than both being kept.

### The scrim had four values

| Where | Value |
|---|---|
| `10-shared-patterns.md` | `.45` |
| The (G) document | `.4` |
| `SideSheet.module.css` | `34%` |
| **`Sidebar.module.css`** | **`40%`** |

The fourth is the one nobody had counted, and it was already the ruled value. So `--scrim`
is not a new fifth answer — it is what the shell has been painting since the sidebar
learned to collapse. **No inline `rgb(...)` for a scrim after this.**
