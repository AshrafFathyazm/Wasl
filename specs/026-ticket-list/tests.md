# 026 — Evidence

Only what was observed. Nothing here is asserted from memory.

---

## 1 · `FE-026-00` — the preview, in Arabic first

Rendered at `/_preview/tickets`, Chrome, viewport 1266 CSS px (a 1280 window less the
scrollbar). Both frames, both languages, all five states. Every number below was read off
the render with `getBoundingClientRect()`, not computed on paper.

### 1.1 — A-3 answered: **nine columns do not fit at 880px**

The shell leaves the table `1280 − 288 (sidebar) − 2×56 (content padding) = 880px`.

| Measured | First render | After the fix |
|---|---|---|
| Table width | 878 | 1016 (floor) |
| **Subject column** | **30px** | **224px** |
| Fixed columns, total | 848 | 792 |
| Wrapper scrolls by | 0 | 138px |

At 880px with the columns as first drawn, the subject — the only column anyone reads —
was **30 pixels**. The header label "الموضوع" overlapped "العميل" and every subject cell
showed a single glyph. `table-layout: fixed` did exactly what it was told; nothing threw,
nothing warned, and an English preview at a full-bleed 1280 would have looked fine.

**What changed, and each is a measurement, not a preference:**

| Change | From | To | Freed |
|---|---|---|---|
| Channel became an icon column — one asset per channel already exists, label to `title` + sr-only | 104 | 36 | 68 |
| Created became `dd/MM/yyyy` numeric rather than a short month name | 104 | 92 | 12 |
| Customer | 132 | 120 | 12 |
| Assignee | 132 | 124 | 8 |
| Status | 112 | **156** | −44 |
| Priority | 88 | 96 | −8 |

Net 792px of fixed columns, and the table carries a **1016px floor** with the wrapper
scrolling under it. Scrolling 138px is honest; a 30px subject column is not.

At `--content-width` (1152, the 1440 frame) the subject gets **410px** and nothing
scrolls.

### 1.2 — The status column: I sized it on the wrong language

The first CSS comment said the Arabic label was the longest and sized the column at 112px
on that basis. Measured pill widths:

| Status | English | Arabic |
|---|---|---|
| **Pending customer** | **129px** | 92px |
| In progress | 92px | 78px |
| Resolved | 80px | 66px |
| Closed | 67px | 57px |

English is wider in **every** status — two English words carry a space, and the Arabic
labels are short or single-word. At 112px the English pill **overflowed into the priority
column and the two collided.**

**The Arabic-first rule is not a rule that English can be skipped.** The preview is built
in Arabic first because Arabic is the one that usually loses; this column is the case
where it wins, and the only thing that found it was rendering both. `cellsOverflowing` is
now `0` in both languages.

### 1.3 — The date was rendering as `292026/08/`, and `dir="ltr"` could not fix it

Under any `ar` locale, `Intl.DateTimeFormat` returns the date with **U+200F RIGHT-TO-LEFT
MARK inside the string**:

```text
code points: 32 39 200f 2f 30 38 200f 2f 32 30 32 36
as text:     "29‏/08‏/2026"
rendered:    292026/08/
```

The `dir="ltr"` attribute creates an isolate around the span — `unicode-bidi: isolate`,
confirmed from computed style — which isolates the cell from the paragraph and does
nothing about control characters *inside* it.

**Every automated check would have passed.** The text content is right, the digits are
Latin, the year is Gregorian, and `expect(cell).toHaveTextContent('29/08/2026')` fails on
a string that is indistinguishable in a terminal. Only the render is wrong, and only in
Arabic. Found by looking at the screen.

Fixed by stripping `U+200E`, `U+200F` and `U+061C` from the formatted output, so the
column is byte-identical in both locales. The marks exist for dates inside running text; a
date in a fixed-width table column is a field.

### 1.4 — `spec.md` §6 was wrong about the formatter, and the measurement says so

The spec claimed two silent failures. Measured in this engine (V8 / Chrome):

| Locale | Output | `resolvedOptions()` | Spec claim |
|---|---|---|---|
| `ar-u-ca-gregory-nu-latn` | `29/08/2026` | gregory · latn | the rule ✓ |
| `ar` | `29/08/2026` | **gregory · latn** | claimed Arabic-Indic — **false** |
| `ar-EG` | `٢٩/٠٨/٢٠٢٦` | gregory · arab | digits flip ✓ |
| `ar-SA` | `٢٩/٠٨/٢٠٢٦` | **gregory** · arab | claimed Islamic calendar — **false** |

So `-nu-latn` **is** load-bearing, but only once the locale string carries a region —
which is what `navigator.language` supplies and what a stored preference could become.
`-ca-gregory` changed nothing here; it stays as defence, because the ICU default for
`ar-SA` is version-dependent and a Hijri year reads as bad ticket data rather than as a
formatting bug.

`spec.md` §6 is corrected to say this instead of what I assumed it would say.

### 1.5 — Pagination: shape corrected against the house reference

Product owner supplied the house pattern mid-build. It is `‹ 1 2 … last ›` — **not**
`1 2 3 4 5`. Only the active page is filled navy; the ellipsis carries the outline box;
the numbers are plain text. `Rows Per Page` sits at the opposite inline edge.

The reference also settles a question the spec did not ask: in Arabic the house app
renders **page numbers in Arabic-Indic digits** (`١٠`, `٢`, `١٩٥`) while rendering **dates
in Latin digits** (`27/08/2026`). That is BR-8.13 read exactly — Latin digits are pinned
to *identifiers and timestamps*, and a page number is neither. Two formatters, two
reasons: `ar-u-ca-gregory-nu-latn` for dates, `ar-u-nu-arab` for counts. `-nu-arab` is
explicit because V8 resolves plain `ar` to `latn`, which would have silently made the
pager agree with the dates instead of with the reference.

### 1.6 — Confirmed from the reference, and confirmed out of scope

The reference screens carry per-column sort arrows, per-column `⋯` menus, status tabs with
counts, a search box, and a filter panel. All are `015`. Rendering any of them here would
have been a filter feature arriving inside a list feature.

### 1.7 — Measured and correct on the first render

| Property | Value |
|---|---|
| Row height | 61px — `--table-row-height` |
| Header height | 40px — `--table-header-height` |
| Skeleton row height | 61px, so nothing shifts when data lands |
| Longest Arabic subject | 213 characters, truncating with an ellipsis at the correct end |
| Cells overflowing, Arabic | 0 |
| Cells overflowing, English | 0 |

### 1.8 — Token gaps resolved, not invented

`--table-header-height: 40px` and `--table-avatar-size: 24px`. Both values are already
named in `docs/sdd/design/screens/03-tickets-list.md`; neither had a token. Added to
`docs/sdd/design/tokens.css` **first**, then mirrored to `src/wasl-web/src/styles/tokens.css`
(DESIGN-BRIEF rule 3). `--table-avatar-size` is separate from `--avatar-size` (32px)
because note 10 scopes that one to the sidebar user block.

---

## 2 · Still to record

`FE-026-01` onward. Nothing below this line has been run.

---

## 1b · `FE-026-00` — the canvas restyle

The product owner supplied the look as a Design Canvas export (`Wasl Tickets Table.html`)
and directed that it become the shape of Wasl tables. Two questions were put back and
answered before any code: **scope** — "everything including search + tabs + chips" — and
**column model** — the hybrid, which folds the ticket number and the escalation marker
into the subject cell but keeps the channel column an icon.

Verified with `npx tsc -b --force`, `npm run lint`, `npm run lint:css`, `npm run lint:i18n`,
`npm run lint:types`, `npm run build`, `npm test`. **83 tests pass** (76 before, 7 new).
The production build emits **no** `TicketListPreview` chunk — `/_preview` is still stripped.

### 1b.1 — §1.6 is overridden, deliberately, and here is the record

Section 1.6 above recorded that status tabs, a search box and a filter panel "are `015`.
Rendering any of them here would have been a filter feature arriving inside a list
feature." That reasoning still stands and **the product owner overrode it**, choosing
"everything" when asked. So they are now in the preview.

What that does and does not mean:

- It is **design evidence**, not delivery. The `026` Definition of Done must not claim
  search, tabs, or filtering. They remain `015`'s to build, own, and test.
- The date picker is the sharpest case: it is a `DatePicker` with **no feature owner at
  all**. It exists because the canvas specifies it and because it settles two real
  questions cheaply (below). When `015` lands it moves out of `src/dev/` and becomes a
  component; leaving it here permanently would be a primitive hiding in a preview.

### 1b.2 — Column model: three floors, and the last one is the canvas

**Superseded once already.** This section first recorded 904px, on a column model that kept
channel as a 36px icon and hid the actions heading. The product owner sent the design a
third time, as screenshots, and both of those were wrong against it. The 904 column is left
in the table because deleting it would hide that the width argument was made and lost.

| | 9-column original | This file at 904 | **Now (canvas)** |
|---|---|---|---|
| Columns | 9 | 8 | 8 |
| Ticket number | own column, 132px | line 2 of the subject cell | line 2 of the subject cell |
| Escalated | own column, 36px | line 2 of the subject cell | line 2 of the subject cell |
| Customer | 120 | 120 | **124** |
| Channel | 104px label | 36px icon | **150px labelled, tinted pill** |
| Status | 156 | 156 | **160** |
| Priority | 104 | 104 | **92** |
| Assignee | 124 | 124 | **150** |
| Created | 92 | 92 | **96** |
| Actions | absent | 48, `sr-only` header | **88, heading VISIBLE** |
| Fixed columns, total | 792 | 680 | **860** |
| Subject floor | 224 | 224 | 260 |
| **Table floor** | **1016** | **904** | **1120** |
| Overflow at the 880 frame | 136px | 24px | **240px** |

The fold of the ticket number and the escalation marker into the subject cell is **kept** —
it is what stops 1120 being 1288. The 240px of overflow is the design's own consequence and
is reported here rather than absorbed by squeezing the subject below reading width. `--table-header-height` (40px) and `--table-avatar-size` (24px) are
unchanged — the canvas draws a 44px header row and the token came from a layer, so the
token won.

### 1b.3 — Where the canvas was refused, and why

| Canvas | Kept | Reason |
|---|---|---|
| Status tints `#EFF6FE` / `#EAF5EB` / `#FFF8E6` | `--blue-50` / `--green-50` / `--amber-50` | A near-match is a second palette, not a refinement |
| `New` and `Open` both blue; `PendingCustomer` neutral | The BR-1 map from `03-tickets-list.md` | Two distinct states with one appearance, and a waiting ticket weighted like a closed one. A mock that never shows both side by side is not evidence they can share a colour |
| ~~Channel as a 150px labelled, tinted pill~~ | ~~36px icon~~ | **REFUSAL WITHDRAWN — the design was right.** The argument was "114px to repeat what the glyph says", and it answered the wrong question: the label is not what the tint repeats. Colour is how sixty rows are scanned for one channel, and a 36px monochrome glyph carries neither the colour nor the word. It is also the argument the status column already lost — status is a labelled, coloured pill for exactly this reason, and channel is the same kind of fact about a row. Now 150px and tinted; see 1b.9 |
| Header row 44px | `--table-header-height: 40px` | The token came from a vector export (A) |
| Radius `6px`; badge height `26px` | `--radius-sm` (4px); padding + line-height | A third radius earns nothing. `--chip-height` (20px) is an (A) export and was not moved; height now comes from padding, which is what a badge should have done from the start |
| ~~Hard-coded Arabic weekday names~~ | ~~Derived per locale~~ | **REFUSAL WITHDRAWN.** No ICU width produces the design's form at all — see the corrected 1b.5. Derivation was choosing between two wrong answers |

Three values genuinely had no token: `--border-divider` `#E8EDEF`, `--surface-row-hover`
`#FAFCFC`, `--surface-chip` `#F1F4F5`. Per DESIGN-BRIEF rule 3 they are in
`docs/sdd/design/tokens.css` **and** `src/wasl-web/src/styles/tokens.css`, identical, with
the citation. **The order was inverted** — the app file was written first and the blueprint
mirrored after. Recorded because it is a deviation.

**"`diff` shows the two agree" was written here, and it was a false measurement.** The two
files differ on **307 lines**: prettier runs on the app copy and not on the blueprint, so
one has lowercase hex and no alignment and the other has both. `diff` on the files reports
a wall of noise and proves nothing about the values. The check that means something
compares **declarations** — comments stripped, whitespace collapsed, hex lowercased:

| | Blueprint | App |
|---|---|---|
| Declarations | **191** | **191** |
| Only in blueprint | — | none |
| Only in app | — | none |
| Same name, different value | `--leading-tight: 1.0` vs `1` | prettier normalising a decimal; same CSS value |

So the mirror does hold, including all ten channel tokens — but it holds on a comparison
nobody had run, and the sentence that claimed it was checking file bytes. **DESIGN-BRIEF
rule 3 currently has no automated guard at all**; a normalised declaration comparison is
the shape one should take, and it belongs to whichever feature owns the token layer, not to
this preview.

No `--shadow-*` or motion tokens were invented (tokens.css note 11). The four elevations
the canvas draws are **local** custom properties on `.page` (`--pop-sm` through `--pop-xl`)
with a `TODO(FE-026-01)`: a local name cannot be mistaken for the system, and that block is
the exact list a real elevation scale must absorb.

### 1b.4 — Two defects found by MOUNTING it, not by reading it

The preview had never been rendered in a test. The first run failed twice:

1. **The date field was a `<button>` inside a `<label>`.** A button is not a labelable
   control, so the `<label>` contributed nothing and the field announced as an *unnamed
   button*. The same bug sat in the footer's rows-per-page — a `<label>` wrapping no
   control at all, and it had been there since the original preview. Both replaced; the
   date button now carries `aria-labelledby` over **both** the label and the value,
   because "created from" alone does not say whether a date is already set.
2. **Two buttons named `تطبيق` on screen at once** — the filter panel's and the
   calendar's — with no named container between them. The calendar is now
   `role="dialog"` named after its field, which also makes the trigger's
   `aria-haspopup="dialog"` true.

Neither is visible in the JSX. Both are what `src/dev/TicketListPreview.test.tsx` now
guards, and that file exists **only** because it has already been seen to fail.

### 1b.5 — CORRECTED: the design's weekday form is one ICU does not have

The measurement below is still accurate. **The conclusion drawn from it was wrong.**

| | `narrow` | `short` | `long` |
|---|---|---|---|
| `ar-u-ca-gregory-nu-latn` | `ن ث ر خ ج س ح` | `الاثنين … الأحد` | `الاثنين … الأحد` |
| `en-GB` | `M T W T F S S` | `Mon … Sun` | `Monday … Sunday` |

ICU returns the **same string** for `short` and `long` under `ar`, and `narrow` is a single
letter. The design asks for **إثنين ثلاثاء أربعاء خميس جمعة سبت أحد** — the clipped *word*,
which is neither of them. No locale data produces it, so no choice of width was ever going
to reach it; the code was picking the least-bad of two wrong forms and calling the asymmetry
honest.

They are transcribed now, into `WEEKDAY_NAMES`, as **catalogue copy** — the same status as
every other string in `COPY`, bound for `ar` and `en` in FE-026-05, where a translator can
shorten them without touching this file. "A hard-coded name is a second catalogue" was the
argument against transcribing; it is answered by putting them *in* the catalogue, not by
deriving a different word than the one the design specifies.

Both facts are asserted rather than only written here: one test reads the rendered row, and
a second asserts that `ar` `short` equals `ar` `long` and that `ar` `narrow` is one
character — so a future "simplification" back to `Intl` with a different width goes red on
the reason, not only on the result.

### 1b.6 — The Hijri toggle, measured in this engine

| | Title | Day cells |
|---|---|---|
| Gregorian | `أغسطس 2026` | `27 28 29 30 31 1 2 …` |
| Hijri | `ربيع الأول 1448 هـ` | `13 14 15 … 30 1 2 …` |

`ar-SA-u-ca-islamic-umalqura-nu-latn`. **Latin digits on both**, which BR-8.13 requires: a
picker writing `١٤٤٨` into a field whose column shows `29/08/2026` is two numeral systems
in one flow. The toggle changes **display only** — the value produced is always the ISO
Gregorian day, because that is what `?createdFrom=` carries and what the API compares.
Construction is wrapped in `try`/`catch`: `islamic-umalqura` is not guaranteed, and a
locale gap should degrade to "no toggle", not take the screen down.

### 1b.7 — Negative controls, watched failing

| Break | Expected | Observed |
|---|---|---|
| Drop `-nu-latn` from `HIJRI_LOCALE` | the Hijri-digits test only | **1 failed, 6 passed** — that test, on Arabic-Indic digits |
| `WEEKDAY_WIDTH.ar` `narrow` → `short` *(that code is gone; see the row below)* | the weekday test only | **1 failed, 6 passed** — `expected ['الاثنين','الثلاثاء',…] to deeply equal ['ن','ث',…]` |
| `WEEKDAY_NAMES.ar` back to the narrow letters | the weekday row test only | **1 failed, 9 passed** — `expected ['ن','ث','ر','خ','ج','س','ح'] to deeply equal ['إثنين','ثلاثاء','أربعاء',…]` |
| Channel label back into an `sr-only` span | both channel tests | **2 failed, 8 passed** — `expected null not to be null` (the svg), and `expected 1 to be 5` (one class for five channels) |
| Both channel **and** actions back to `sr-only` | all three | **3 failed, 7 passed** — the third: `expected <span class="_srOnly_c34037"></span> to have a length of +0 but got 1` |

Each broke exactly the tests it should, with a message naming the real cause. Restored and
re-run green after every one.

**One of these controls found a FALSE NEGATIVE, and that is why it was run.** The
actions-heading guard was first written as `expect(head).toBeVisible()`, which reads as the
strongest possible assertion. Reverting the heading to `sr-only` left it **green**: the
utility hides with `clip-path` and a 1px box, and jsdom computes neither. A guard written
for exactly that defect would not have caught exactly that defect. Both assertions are
structural now — the `<th>` must have **no element child** (sr-only text needs a span to
carry the class), and the channel label must resolve to the node that *also* holds the
glyph. Re-measured, and both go red.

This is the fifth tool in this repository to produce a well-formed report about nothing —
after the `grep` over `src/`, the wrong-table regex, the preview toggle, and MSBuild. It
belongs on that list in CLAUDE.md.

### 1b.9 — The channel pill, and the ten tokens it needed

Adopted from the canvas after the design was supplied a third time. The column carries the
icon **and** the label inside one tinted pill: 150px, `--radius-pill`, 24px tall,
`--text-helper` at `--weight-medium`.

| Channel | Background | Foreground | New value? |
|---|---|---|---|
| WhatsApp | `#F0EFF9` | `--purple-700` (`#4D46AF`) | bg only |
| SMS | `--purple-50` (`#F3F3FB`) | `--purple-600` (`#5250C0`) | **neither** |
| Web form | `#EFF3FA` | `#1F5FA8` | both |
| Email | `--surface-chip` (`#F1F4F5`) | `--neutral-800` (`#4A5567`) | **neither** |
| Live chat | `#EDF6F5` | `#2A7A72` | both |

Five of the ten resolved to a primitive that already existed, **exactly** — not near — so
they alias rather than repeat, and no second palette is created. Five values are genuinely
new. All ten are named `--channel-*-bg` / `--channel-*-fg`, and they went into
`docs/sdd/design/tokens.css` **first** this time, then mirrored — DESIGN-BRIEF rule 3, the
ordering 1b.3 records getting backwards on the first three.

The five hexes had been parked in the TSX under a comment reading *"if that day comes they
become tokens FIRST — none of these is a literal that gets to reach a stylesheet."* It came,
and they did. No literal reached the stylesheet.

A test asserts the five pills carry five **distinct** class strings: one tint reused across
two channels defeats the only thing the tint is for.

### 1b.10 — Still refused, and now it needs a ruling rather than my judgement

**`New` and `Open` share one blue in the canvas.** The BR-1 map in
`docs/sdd/design/screens/03-tickets-list.md` gives them different tones, and `STATUS_TONE`
still follows the blueprint. Two distinct states with one appearance loses information in
the column an agent scans first.

That is the same shape of argument as the channel column, and that one was wrong. The
difference is that the channel column was a *width* decision inside this preview, whereas
the status colour map is a **product rule with a source of record**, and changing it is not
a preview's call. So it is not being changed silently in either direction:

- If the screenshots are the authority here too, `STATUS_TONE` and
  `03-tickets-list.md` both change, in one commit, and BR-1's colour row moves with them.
- If the blueprint stands, the canvas is the thing that is out of date.

**Open question for the product owner.** Nothing else in 1b is blocked on it.

### 1b.11 — What RENDERING it found, that reading it did not

The preview had never been opened in a browser. Four defects, and the first is the
largest single defect in the feature.

**1. Every button in the preview was solid navy — twenty-five controls, one missing rule.**

`base.css` rule 17 paints every `<button>` with `--action-primary-bg` using `!important`, so
a dark-mode host stylesheet cannot repaint a native control. That file states the contract
for overriding it, in its own comment:

> a component repeats the same three properties **with `!important`**, because a class
> (0,1,0) beats an element (0,0,1) … Omitting `!important` in the component does NOT win.

This module never did. Tabs, filter chips, the pager, the kebab, calendar cells, menu rows
— all navy pills with white text. Two of them were worse than cosmetic: `.pageBtn` had a
navy background against `--text-secondary` grey text, and `.tab` made every one of the
seven segments look selected.

| | Computed before | Computed after |
|---|---|---|
| `.tab` (inactive) | `rgb(29,23,77)` / white | `rgba(0,0,0,0)` / `rgb(96,104,115)` |
| `.tabOn` | `rgb(29,23,77)` / white | `rgb(255,255,255)` / `rgb(13,38,38)` |
| `.filterBtn` | `rgb(29,23,77)` / white | `rgb(255,255,255)` / `rgb(29,23,77)` |
| `.emptyCta` | `rgb(29,23,77)` / white | `rgb(255,255,255)` / `rgb(29,23,77)` |

The fix is one low-specificity reset — `.page :where(button)`, which weighs exactly `.page`
(0,1,0) because `:where()` contributes nothing — plus the `!important` repeat on all 26
button classes. **The reset must stay first in the file**: it ties every class below and so
loses to them on order; moved lower it wins and repaints every button transparent.

**This could not have been caught by a render test.** vitest does not apply CSS Modules, so
`getComputedStyle` reports nothing and the assertion would pass on the broken build. The
guard therefore READS the stylesheet — the same shape as the message-key scanners. Two
negative controls: dropping `!important` from one class fails that class's row
(`.linkBtn`), and moving the reset to the end fails both that row and the ordering test
(`expected 40241 to be less than 3728`).

**2. The tooltip was clipped by its own scroll container.** `.scroller` carries
`overflow-x: auto`, and CSS makes `overflow-y` compute to `auto` the moment `overflow-x` is
not `visible` — there is no "scroll horizontally, overflow vertically". An absolutely
positioned tooltip above the first rows had its top cut off by the table edge. It is
`position: fixed` now, which leaves the ancestor clip chain entirely; the coordinates come
from the effect that already measures `scrollWidth`, including a flip to BELOW the row when
there is no room above. Measured after the fix: tooltip top **234**, scroller top **258** —
24px outside the container and fully drawn.

**3. The search field drew its focus ring inside itself.** `base.css` puts
`box-shadow: 0 0 0 Npx var(--focus-ring)` on `:focus-visible`, and the focusable element is
the bare `<input>` inside the bordered box — so the ring drew a second rounded rectangle
*within* the control. `.searchInput:focus { outline: none }` was already there and was
hiding the problem rather than fixing it: it removes the outline and leaves the box-shadow.
Removing the ring outright is a defect, not a style choice (DESIGN-BRIEF rule 9), so the
ring is suppressed on the input and drawn on `.searchBox:focus-within` instead — the
element a sighted user thinks of as the control.

**4. The on-screen measurement block was two revisions stale.** It read
`table floor: 904px (fixed columns 680 + subject 224)` while the table was 1120. A
measurement that names the wrong thing is worse than no measurement, because it is
believed — and this one was printed on the screen being reviewed.

### 1b.12 — The status colours, taken from the design (1b.10 resolved in part)

The product owner supplied the status column directly. **Every status is a filled tint;
there is no outline variant in the design at all.**

| Status | Tone | Was |
|---|---|---|
| `New` | info, filled | neutral, filled |
| `Open` | info, filled | info, filled |
| `InProgress` | warning, filled | warning, filled |
| `PendingCustomer` | **neutral, filled** | warning, **outline** |
| `Resolved` | success, filled | success, filled |
| `Closed` | **neutral, filled** | neutral, **outline** |

The two outlines were the loudest things on the row — a heavy amber ring around a waiting
ticket, drawing more attention than a critical one.

**`New` and `Open` do share the blue, and that remains the weak point.** Two distinct
states carry one appearance in the column an agent scans first. It is adopted because the
status map is a product decision with a source of record and the owner has now supplied it
three times; a preview is not the place to overrule that. **`BR-1` and
`docs/sdd/design/screens/03-tickets-list.md` now disagree with the screen** and must be
updated deliberately — that is the part of 1b.10 still open.

Four labels were also wrong against the design: `تم الحل` → **`محلولة`**, `رسالة نصية` →
**`رسائل نصية`**, `بريد إلكتروني` → **`بريد`**, `غير مُسنَدة` → **`غير مُعيَّنة`**.

### 1b.13 — The second render pass

| Reported | Cause | Fix |
|---|---|---|
| Filter icon wrong | `IconFilter` drew a funnel; the design uses the lines form | Geometry replaced in place. Only the preview consumes it, so a second icon was not added — two filter icons in one set is how a screen ends up with both |
| Empty-state pattern wrong | A radial mask faded the whole tiling into a vignette | Mask removed, colour moved from brand navy at 13% to `--border-default`. A faint tint of the action colour is a background competing with the button |
| Logos not laid out in parallel | Tile was 144x144, then 96x172 — columns fixed, rows left nearly 4x too sparse | Measured off the supplied screen rather than estimated. **The row pitch is what makes it a weave and not a scatter** |

**Five tiles before it was right, and each was wrong differently** — recorded because the
sequence is the finding:

| Tile | What was wrong |
|---|---|
| `144 x 144` | Sparse polka dots |
| `96 x 172` | Columns right, rows nearly 4x too far apart |
| `88 x 90` | Correct pitch, too busy behind a paragraph of text |
| `132 x 136` | Thinned by scaling **both** axes 1.5x — fixed density, broke the columns again |
| **`90 x 176`** | Columns 90, rows 88. **The two axes were never the same number**, which is why every single-factor scale missed |
| Pattern covered only a corner | The `<svg>` had no `width`/`height` **attributes**. `position:absolute; inset:0` sizes the BOX, but an svg with no attributes and no `viewBox` keeps its default 300x150 viewport — and `<rect width="100%">` is a percentage of that | Explicit `width="100%" height="100%"`. Measured after: rect 878x287, exactly the svg box |
| Too dense to read behind | Scaling BOTH axes 1.5x (132x136) thinned it and pulled the columns apart again | **The two axes are not the same number.** Columns 90, rows 88 — a close weave across, an airy one down. Final tile **90 x 176**: two rows tall, because the stagger needs the second mark at half of each step and a one-row tile cannot express that |
| Writing sits on the pattern | — | A radial-gradient **background** on a new `.emptyContent` wrapper, not a mask on the pattern. As a background it is sized by the box it paints, so the error state (457px, it carries the trace id) clears a wider area than the empty state (336px) automatically. A hand-set shape would have fitted one of the three |
| Search field: ring on click, and the input overflowing | Two separate defects in one control | See below |

**The search field, in two parts.**

`:focus-visible` did **not** solve the ring, and that is worth recording before someone
tries it again: the spec has browsers match `:focus-visible` on a **text input even for a
mouse click**, because the control accepts keyboard input the moment it is focused. So it
fired exactly as `:focus-within` had. The ring is now a border tint only — ruled by the
product owner twice. DESIGN-BRIEF rule 9 says a ring removed for looks is a defect; this is
the ring traded for a quieter indicator on **one** field, and every other control still
carries the `base.css` ring untouched.

Separately the input was **47px tall inside a 40px box** and pushed through its own border.
`base.css` gives every `<input>` `--field-height-md` and inline padding, because normally
the input *is* the field; here it is a bare control inside a bordered box that is already
`--button-height-md` tall. Both are reset on `.searchInput`. This read as "the field is
half-drawn", not as an inherited height — the same shape of confusion as the button
colours in 1b.11.

### 1b.15 — One clipping ancestor, two defects, reported a week apart

The row menu opened **below the table** on the last rows and had to be scrolled to. Same
cause as the tooltip in 1b.13: `.scroller` carries `overflow-x: auto`, CSS forces
`overflow-y` to `auto` with it, and an absolutely positioned flyout cannot leave that box.

**The tooltip was fixed and the sweep was not done.** One clipping ancestor produces the
same defect in *every* overlay inside it, and fixing them one bug report at a time is how
the third one ships. The sweep has now been run:

| Overlay | Clipping ancestor | State |
|---|---|---|
| Subject tooltip | `.scroller` | fixed in 1b.13 |
| Row menu | `.scroller` | fixed here |
| Filter panel | **none** — it lives above the table | no change needed |
| Calendar | **none** | no change needed |

The last two were measured, not assumed: an ancestor walk from each open overlay looking
for any computed `overflow` other than `visible` returned `null` for both.

`position: fixed` again, with the coordinates written by the trigger on click rather than
by a layout effect inside the menu — the effect would paint once at `0,0` and jump. Two
placement rules, both from the report:

- **Flip up when it would fall past the viewport.** That is the last-rows case exactly.
- **Grow inward, not outward.** Actions is the last column, so the kebab sits at the OUTER
  edge of the row — far left under RTL. Hanging the menu from the trigger's leading edge
  put 188px of it outside the card on the side with nothing in it. The menu's outer edge
  now aligns with the trigger's, so it opens across the row it belongs to, both directions.

| Measured | First row | Last row |
|---|---|---|
| Flips up | no | **yes** |
| Fully within the viewport | yes | yes |
| Within the card horizontally | yes | yes |

`MENU_H` is a constant rather than a measurement, deliberately: the menu is four fixed rows
and a separator, and measuring it would mean mounting it first — which is the flash this
avoids. It is commented as changing if a row is ever added.

**No test guards this.** jsdom has no layout, so `getBoundingClientRect` is all zeroes and a
placement assertion would pass on any build. Recorded as unguarded rather than covered by a
test that proves nothing — the same call as the CSS guard in 1b.11, which went the other
way because a stylesheet can be read.

### 1b.16 — The table gets a fixed viewport, and the flyout rules that follow from it

**Ten rows tall, header pinned, rows pass under it.** A hundred rows in a card that grows
to a hundred rows pushes the pager off the page and takes the column headings with it — by
row forty nobody knows which column they are reading.

| | Measured |
|---|---|
| Visible height | `740` = 40 header + 10 x 70 |
| Scroll height at 100 rows | `7020` |
| `thead th` computed position | `sticky`, pinned to the scroller top through a 900px scroll |

`--row-h` is **measured, not derived** — 62 / 70 / 78 for dense / default / roomy, read off
the rendered rows. It cannot be computed from `--row-pad`, because the subject cell is two
lines and its own line-heights are part of the total. It sits beside `--row-pad` in each
density block so the two cannot drift apart.

Ten is the page size the footer reports, which is the point: the card shows exactly one
page, and scrolling inside it never crosses a page boundary.

**A fixed viewport changes what a `position: fixed` flyout has to do**, and both rules came
from the same report:

- **The floor is the table, not the window.** Flipping only at the viewport edge let the
  last rows open downward *through the pager* — the menu cleared the screen and covered the
  controls under the table, which is worse than being off-screen because it looks
  deliberate. The floor is now whichever comes first: the scroller's bottom, or the window.
- **Scroll closes it.** A fixed flyout is anchored to the viewport, so the row it belongs to
  slides out from under it and the menu ends up over an unrelated ticket, still offering to
  escalate the one that has gone. Re-anchoring each scroll frame is worse — the menu would
  ride the table and disappear under the sticky header. **Blocking the scroll was
  considered and rejected**: a page that stops scrolling because a menu is open reads as
  frozen, and the wheel is how most people dismiss a menu they opened by accident.
  `capture: true`, because scroll does not bubble to `document`.

| Measured | Result |
|---|---|
| Menu on row 9, opening down | bottom stays inside the table |
| Menu on the last row | flips up, fully on screen, inside the card |
| Menu after a 900px table scroll | **closed** |

**Scrollbars hidden, scrolling kept** — ruled by the product owner. The native bars are
heavy, and under RTL the vertical one lands on the **left** with stepper arrows, reading as
a second border down the wrong side of the card. Measured after: scrollbar width and height
both `0`, `scrollHeight 7020 > clientHeight`, wheel and keyboard unaffected.

**What that costs, stated rather than buried:** nothing now tells a mouse user that two
more columns exist past the inline end at the 880 frame. That is the same 240px already
open in 1b.8 — hiding the bar does not create the problem, it removes the one thing that
was reporting it. It makes the 880 overflow question more urgent, not less.

### 1b.14 — I MEASURED THE WRONG AXIS, and the measurement was believed

Reported: *"the customer names are not on the same level across rows."* I read "level" as
vertical, measured vertical alignment four ways, found it exact, and reported the build
correct. **The defect was real and it was horizontal.**

`dir="auto"` sat on the customer, assignee and subject cells. It isolates the run - which
was never the problem - but it also sets the ELEMENT direction from the first strong
character, and `text-align: start` resolves against *that*. So Arabic names aligned to the
right edge and `Sara Khan` aligned to the **left**, in the same column. The column reads as
broken, and on the subject - the widest column on the row - an English subject would start
hard against the opposite edge.

The fix is `<bdi>`: the same isolation, without the direction change. The cell keeps the
table direction, every name starts on the same edge, and a mixed-script name still orders
correctly inside itself.

**`text-align: start` is not the fix on its own** — it resolves against the element's own
direction, which is exactly what `dir="auto"` had rewritten.

| Measured after | Result |
|---|---|
| Gap from the cell's **right** edge, 8 rows, Arabic and Latin | `16` on every row |
| Computed `direction` | `rtl` on every row, `Sara Khan` included |

**This is the failure this repository already has a rule about**, from the other side:
*a measurement that names the wrong thing is worse than no measurement, because it is
believed.* Four consistent measurements, a drawn guide, 26 rows and two densities - all
correct, all answering a question nobody had asked. The evidence was strong enough that it
closed the report instead of opening it. **The tell was available and I did not use it:**
the reporter cropped a single column and pointed at one Latin name among Arabic ones.

The vertical findings below are still true and still worth keeping — they just were not the
answer.

#### The vertical measurements, which were correct

**"The customer names are not on the same level across rows."** They are. Measured three
ways, and the third is the one that settles it:

| Measurement | Result |
|---|---|
| Line box top, relative to row top | `24` on every row |
| Ink box top / height | `26` / `18` on every row |
| Font, size, line-height | `IBM Plex Sans Arabic` / `12px` / `21px` — identical, Arabic and Latin |
| **Content centre minus row centre, 26 rows across all six tables, both densities** | **one distinct value: `0`** |

A red guide drawn at each row centre passes through the middle of every name, every status
pill, every channel pill and every priority — `Sara Khan` included, which is the row that
looks wrong and is not.

**What is actually different is the subject cell, and it is by design.** It carries two
lines, so its first line sits ~11px *above* the row centre that everything else is aligned
to. Scanning a row left to right, the eye takes the subject as the row's baseline and reads
the centred columns as low. The supplied design has the same arrangement — subject on line
one, ticket number under it, every other column centred — so this is not a deviation, but
it is the thing being seen, and it is recorded here so the next report of it is not
re-measured from scratch.

Changing the vertical alignment would have moved 26 correct rows and still not fixed the
defect, so the measurement did earn its place - it stopped a wrong edit. It just should not
have been allowed to close the report.

## 1c — `FE-026-01`, the `Table` primitive

Built 2026-08-30 against `table-primitive.md`, approved with three rulings. 20 tests in
`src/components/Table/Table.test.tsx`; suite 114 to 134.

### 1c.1 — The three rulings, and what each changed

| | Ruling | Effect |
|---|---|---|
| **Q-T-3** | `Table` owns the header, `aria-sort` and the toggle; `015` owns the query and the URL. Build the API now, leave it unused | `sortable` defaults false and `026` passes it nowhere. A sort control is header-shaped, and `015` could not inject one without reopening this interface — a breaking change |
| **Q-T-1** | BR-1 wins. `New` and `Open` do **not** share a colour | `New` back to `neutral filled`. I had adopted the canvas **twice**, on the argument that a design supplied three times outranks my reading of the blueprint. The ruling was the reverse |
| **Q-T-2** | No scrollbar anywhere. Not hidden — **not needed** | See 1c.2. The ruling that changed the most |

On Q-T-1 the blueprint moved too, on the rows that were genuinely stale:
`PendingCustomer` from `Warning outline` to `Neutral filled`, and `Closed` from
`Neutral outline` to `Neutral filled`. Rendered against real rows the two outlines were the
loudest thing on the table — a heavy amber ring around a waiting ticket drew more attention
than a `Critical` priority two columns away, which inverts the ranking the map exists to
express. `03-tickets-list.md` carries both changes **and the refusal**, in the same commit.

### 1c.2 — "No scrollbar" turned out to mean "no overflow", and it cost nothing

The instruction went through three positions in one session — hide them, keep them with a
stable gutter, then remove the need — and only the third is a design.

**Column widths are RATIOS, normalised to percentages summing to 100.** The caller still
supplies the canvas pixels, so the proportions the design fixes survive; the primitive
divides them. A table sized that way fits every frame, and narrow frames truncate — which is
already the pattern, and **a truncated cell says "there is more here" where a column clipped
behind a hidden bar says nothing.**

| Frame | Before | After |
|---|---|---|
| 880, 100 rows | 1120 wide, 242px behind a horizontal scroll, ten-row cap with a vertical one | `scrollWidth === clientWidth`, `scrollHeight === clientHeight` |
| 1152 | fitted | fitted |
| All six preview tables | — | **`anyBar: false`** |

**Q-T-2 offered three candidates and every one gave something up** — the 150px channel pill,
the 260px subject floor, or an affordance that is not a native bar. The ratio answer gives
up none of them: all eight columns are visible at 880, including the two that used to sit
past the edge. The 1016 / 904 / 1120 floors were each a better number than the last, and
none of them was the right **kind** of number.

### 1c.3 — The isolation preview found a defect in the primitive on its first render

`/_preview/table` renders **customers** — different columns, a different flexible column,
sorting on — through the same component. That is AC-T-11, and it exists because a component
used by exactly one screen and shaped by that screen is indistinguishable from that screen
private layout.

It earned its place immediately. `widthPercents` took `flyoutWidth?: number`, so `undefined`
meant two different things — *no flyout column* and *a flyout column with no width* — and
the second produced one fewer entry than there were columns. The actions `<th>` got no width
at all, fell outside the normalisation, took its content width **on top of** a full 100%,
and the table overflowed by exactly that column.

Measured: `scrollerScroll 1346` against `scrollerClient 1319`, with the actions header
reporting an empty declared width. After the fix, `1319 / 1319` and seven percentages
summing to `99.9999`. The guard asserts both — every column carries a percentage, and they
sum to 100.

### 1c.4 — A guard that passed on the defect it was written for. Again.

AC-T-08 asserted that a rule matched `background-color` **or** `color` with `!important`.
Dropping `!important` from the **colour** of `.sortBtn` left it **green** — the background
declaration alone satisfied it. Losing it on either property is enough for the navy to win
on that property.

It is per-declaration now: **every** colour declaration in those rules carries `!important`.

**The same hole was in the preview guard**, which this one was copied from, and it was
closed in the same pass — a guard with a known hole left in one of two places is a guard
nobody trusts in either. Re-measured: dropping `!important` from one preview class now
fails, naming `.searchClear`.

**Third time in this feature** a guard needed a negative control to reveal it was inert —
after `toBeVisible` on `sr-only`, and `diff` on the token files. The pattern is identical
each time: the assertion is *about* the right thing and *satisfied by* the wrong one.

### 1c.5 — Negative controls

| Break | Observed |
|---|---|
| `!important` off the `.sortBtn` colour | 1 failed — and **green under the loose version**, which is why the control was run |
| Reset moved below the control classes | 1 failed — `declares the low-specificity reset BEFORE any control class` |
| `unicode-bidi: isolate` removed from `.td` | 1 failed — `isolates cell text without rewriting the cell direction` |
| Flyout column dropped from the width list | **2 failed** — one naming `الإجراءات` with an empty width, one `expected NaN to be greater than 99.9` |
| `!important` off a preview class | 1 failed — naming `.searchClear` |

Each named the real cause. Restored and re-run green after every one.

### 1c.6 — Open

- **The ticket preview still has its own table**, now carrying the same ratio widths and no
  cap. Migrating it onto the primitive is the honest proof against the reference screen and
  belongs to `FE-026-06`. Until then the geometry lives in two places — exactly the
  duplication the primitive exists to end. Stated, rather than left to be discovered.
- **Eight files fail `prettier --check`** — `Input.tsx`, five under `features/auth`, and
  `lib/api.test.ts`. All are unmodified in git, so they were already unformatted before this
  work. Left alone: reformatting eight unrelated files inside this change would hide what
  this change did.

## 1d — `FE-026-02` … `05`

The four independent tasks that feed `FE-026-06`. Built 2026-08-30.

### 1d.1 — A gate I claimed and had not run

`a6cdb0c` was committed with **`npm run lint:types` failing.** The pre-commit run listed six
checks — prettier, tsc, eslint, stylelint, lint:i18n, test, build — and that was not one of
them, while the report said "every gate green".

What it caught, one command later: `interface Customer` in `TablePreview.tsx`. A
domain-shaped name in a component file is exactly what `check-no-domain-types.mjs` exists to
stop, and it cannot tell a fixture from a real shape.

Renamed to `SampleRow` rather than added to the ALLOWED list, because the shape genuinely is
not a customer — `kind` appears nowhere in `customers-read-api.md`. It is arbitrary data
whose only job is to be UNLIKE a ticket.

**The rule this breaks is the repo's own: the run output is recorded, never asserted from
memory.** A gate omitted from the command is not a gate that passed.

### 1d.2 — `FE-026-02`, and a negative control that failed by being right

`lib/formatters.ts`. Two silent locale defaults, both of which produce a plausible screen:

| Default | What it does | Pin |
|---|---|---|
| Numbering system | `ar` may render `٢٩/٠٨/٢٠٢٦` beside a Latin-digit `TCK-2026-001042` | `-nu-latn` |
| Calendar | `ar-SA` returns a **different year** — 1448, not 2026. Nothing throws | `-ca-gregory` |

**The control asserting the first one failed on its first run, and the failure was the
finding.** It asserted that bare `ar` renders Arabic-Indic digits. In this ICU build it does
not — it returns `29‏/08‏/2026`: Latin digits with RLM marks embedded. So
`-nu-latn` is doing nothing *here*, and a test written to prove it was needed would have
proved the reverse.

The risk is real and `ar-EG` is where it shows: same language, same code, Arabic-Indic
digits. **That is the actual argument for pinning** — not that today's engine flips, but
that the numbering system is a locale default, and a different build or a regional
preference changes it under a screen nobody re-tested. Both halves are asserted now: that
the platform really does flip, and that our formatter does not, whichever locale it is given.

Unpinning both extensions turns two tests red with `expected '٢٩/٠٨/٢٠٢٦' to be
'29/08/2026'` — the wrong digits and the wrong calendar in one string.

### 1d.3 — `FE-026-03` / `04` / `05`

| Task | Built | Note |
|---|---|---|
| `FE-026-03` | `TicketListItem` | Transcribed from the **field table** of the frozen `tickets-list-api.md`, not the JSON example — an example shows one populated row and cannot express which fields are nullable. `assigneeId` and `assigneeName` are null **together**; the row is still returned, because the join is a left join |
| `FE-026-04` | `TicketStatusBadge`, `TicketPriorityText` | The domain leak `Badge` refused, taken where the inventory says it belongs |
| `FE-026-05` | 33 keys × 2 | Suite-wide parity now 135 keys |

`STATUS_TONE` is asserted **by value**, because a colour map is the kind of thing that gets
tidied — and the tidy actually proposed, twice, was giving `New` and `Open` the same blue.
Making that change turns `gives New and Open DIFFERENT tones` red.

**The more valuable control is the second one.** Re-keying the tone on the *translated*
label instead of the wire value fails `renders Open with the same tone in ar and en` — and
nothing else. That is the silent failure the map is arranged to prevent: every badge goes
neutral for an Arabic user, with no exception, no error, and nothing visibly wrong in
English.

## 1e — `FE-026-06`, `TicketListPage`

The screen, wired to the real endpoint. `/tickets` now resolves to it instead of the `023`
placeholder.

### 1e.1 — A comment that asserted a library rule I had not checked

`/tickets` is in `NAV_PATHS`, and `NAV_PATHS` is spread into the route table as `023`
placeholders. I declared the real route **after** that spread and wrote a comment saying
react-router takes the last of two identical paths.

**It does not.** `matchRoutes` returned the first — the placeholder. So `/tickets` rendered
the `023` page while **every `TicketListPage` test still passed**, because they mount the
component directly and never go through the router. The screen was wired and unreachable.

The fix is to filter rather than shadow: `OWNED_PATHS` removes a path from the placeholder
spread once a real screen exists. `NAV_PATHS` is untouched — deleting `/tickets` there would
delete the nav item with it.

**A second guard in the same file was passing for the wrong reason.** It asserted that
`/tickets` and `/customers` had different `element` values — and `<HomePage />` is a fresh
object on every `.map()` call, so two placeholders compare unequal by identity. It compared
component TYPES after the fix, and it now also asserts that two placeholders DO share a
component, which is what makes the first half meaningful rather than trivially true.

| Break | Observed |
|---|---|
| Restore the shadowing (two `/tickets` entries) | **2 failed** — `expected [ … ] to have a length of 1 but got 2`, and the component-type comparison |

### 1e.2 — `lint:types` fired again, and again it was right

`interface TicketListParams` in `tickets.api.ts`. It is **not** a contract shape — it is the
request parameters this feature sends, and the object the query key is built from — but the
domain prefix claims it came from `tickets-list-api.md`. Renamed `ListParams`.

Second time this session the guard has caught something (after `interface Customer` in the
table preview), and both were the same mistake: a domain-shaped NAME on a local shape. Both
were renamed rather than allow-listed, because in both cases the shape genuinely was not the
domain type it was claiming to be.

### 1e.3 — What the screen holds, and what it refuses to

| | Rule |
|---|---|
| `page` / `pageSize` | In the **URL**, not state (ADR-011 §1). Back moves between pages, a link to page 4 is a link to page 4, a refresh lands where you were |
| A malformed `?page=abc` | Falls back to 1. `NaN` in a query key is a cache entry nothing can ever match — no request, no error, a permanent skeleton |
| `pageSize` control | Renders what the **server returned**, never what was sent. BR-7.2 clamps, so asking 500 shows 100 |
| Changing page size | Returns to page 1. Page 7 of 20-row pages is not page 7 of 100-row pages, and on a short list it lands past the end |
| Sorting / filtering | **Never client-side.** The order is a contract (`CreatedAtUtc DESC, Id DESC`); sorting one page is right on the page you are reading and wrong across pages |
| Error copy | The **server's** `detail` when it authored one, ours otherwise. A transport failure has no ProblemDetails, and an empty string says nothing |

### 1e.4 — AC-026-16, asserted at the source

Spec §5 forbids seeding the cache from a write response: a body a write returns is what the
server HAD, not what it STORED, and the two already differ by four digits of a timestamp.

**The defect is a call that is ABSENT, so only reading the source can prove it.** Every
non-test file under `features/tickets/` is scanned for `setQueryData` / `setQueriesData`,
comments stripped. The sweep asserts it read **more than three files** first — a guard that
silently scanned nothing would be green forever, which is the failure mode three other
guards in this feature already had.

The other half is a render: the date on screen comes from the `GET` payload the cache holds,
asserted by changing `createdAtUtc` in the fixture and reading the formatted result.

## 1f — `FE-026-09`, and a spec decision I overrode without noticing

### 1f.1 — The deviation

Spec **Q-7** ruled, before any code: *"No row menu. Open is the row click, and copy the
number is one action behind two clicks. It arrives with the first action that changes
something (`011`/`012`)."*

`FE-026-06` shipped a row menu holding a single **View ticket** item — which duplicated the
row click — **and no row click at all.** The exact thing Q-7 called "an empty menu", with
one thing in it.

**Nothing caught it, because no test asked what a row does.** Twenty tests covered the
query, the URL, the clamping, the five states and the cache rule, and not one of them asked
whether clicking a row went anywhere. The screen was green and wrong.

That is a gate failure, not a coding one: the working agreement says a decision already made
is not re-decided, and this re-decided one silently. It is recorded here rather than
quietly fixed, and it was named in `0ef201a`'s own commit message before the fix landed.

### 1f.2 — What replaced it

| | |
|---|---|
| Row menu | **Removed.** `Table` keeps the capability — the customer preview uses it, and `011`/`012` earn it back here |
| Row click | `onRowClick` on the primitive. Mouse convenience only: **no tabindex, no role** |
| The keyboard path | A real `<Link>` in the subject cell |

**The primitive deliberately does not make the row itself focusable.** A `<tr>` given
`role="button"` announces the whole row as one control and swallows every cell inside it;
a `<tr>` given `tabindex` puts a stop in the tab order that leads nowhere for a screen
reader. So the row handler ignores clicks that originate inside an `<a>` or `<button>` —
the link does not fire twice, and a future row action is not hijacked — and the anchor is
the accessible affordance.

**Without that anchor the row is reachable by mouse only, and the failure is invisible to
anyone testing with a mouse.** AC-T-07-adjacent, and asserted: removing the `<Link>` turns
`gives the subject a real link` red; removing `onRowClick` turns `navigates when the row
itself is clicked` red. One each, neither overlapping.

### 1f.3 — A test that asserted an absence, and could not

The navigation test first asserted the ticket list was *gone* after a row click. It failed:
the page is mounted on its own, so navigating away unmounts nothing. "The list is gone" was
never going to be true, and had the route not changed at all the assertion would have
failed identically — right result, no information.

A `LocationProbe` reports `useLocation().pathname` instead, so the assertion names the
destination: `/tickets/{id}`.

### 1f.4 — Q-1, the placeholder that lied

`/tickets/:id` renders `024`'s placeholder, headed **"Ticket created"**. True when the
create flow navigates there; a lie when a list row does — it reads as the app having created
something the reader did not ask for.

Retitled to *"Ticket detail — not built yet"*, in both catalogues. **The toast needed no
change**: it already keys on navigation state that only the create flow supplies, so it stays
correct without a second condition. One key, as Q-1 predicted.

## 1g — `FE-026-08`, the two states that look like one

### 1g.1 — Past-the-end is not empty, and only the contract separates them

Both arrive as `items: []`. The contract clamps `page` **UP** to 1 and never **DOWN**, so
`?page=99` on a three-page list returns page 99, zero items, and a `totalCount` of 137.

`totalCount` is the only thing that tells them apart — and the screen was rendering
**"No tickets yet"** over a list holding 137 of them. It is the one state on this screen
reachable by editing the address bar, which is how it will actually be met, and it tells the
reader their data is gone.

| | `items` | `totalCount` | Renders |
|---|---|---|---|
| Genuinely empty | `[]` | `0` | "No tickets yet" |
| Past the end | `[]` | `137` | "That page is past the end" + a way back to the last page |

The tests assert the **absence of the wrong copy**, not only the presence of the right one —
the defect was the wrong copy showing, and a test that checks only for the right string
passes on a screen that shows both.

### 1g.2 — A negative control that stayed silent, and what it exposed

`refreshing` was added to `Table` — the rows dim and stay, `aria-busy` carries it to a reader
who cannot see a dim — with four tests on the primitive. All green.

**Then the control: swap `isPending` for `isFetching` on the page, which re-skeletons on
every refetch. All 27 page tests stayed green.** The primitive was covered; the caller
handing it the right flag was not. Nothing asserted what the page does.

The test written to close that gap **failed against the real screen** — and the reason was
not the flag at all:

> A page change is a **different query key**. The new entry is genuinely pending and there
> is nothing in the cache to show, so the table collapses to a skeleton and back on every
> click of Next. React Query was behaving correctly; the screen was asking the wrong
> question.

`placeholderData: keepPreviousData` is the fix: the previous page stays on screen, dimmed,
until the next arrives. `refreshing` now reads `isPlaceholderData || (isFetching &&
!isPending)` — the rows belong to the previous page, or the same key is being refetched.
Both mean "these rows are not fresh"; neither is a first load.

**The assertion was written before the behaviour existed, and it is what found the gap.**
Reading the code would not have: `refreshing` was wired, correct, and irrelevant.

| Break | Observed |
|---|---|
| `pastEnd` forced to `false` | **3 failed** — past-end copy, the way back, and the headings |
| `isPending` → `isFetching` (before the new test) | **0 failed** — the hole |
| `placeholderData` removed (after) | **1 failed** — `does not return to the skeleton when moving page` |

## 1h — `TEST-026-12`, the Arabic walk

Run 2026-08-30 against the **real screen and the real API** — `dotnet run` on :5099, a dev
server proxied to it on :5180, signed in as the seeded Manager, eight tickets from the
database. Not the preview.

`lang="ar"`, `dir="rtl"` on load, with no toggle touched.

### 1h.1 — What was correct

| Checked | Result |
|---|---|
| Column order, right to left | الموضوع · العميل · القناة · الحالة · الأولوية · المسؤول · تاريخ الإنشاء — matches `03-tickets-list.md` |
| Pagination chevrons mirrored | `التالي` at x=105, `السابق` at x=202 — next is to the LEFT of previous, which is forward in RTL |
| Dates | `30/08/2026` — Gregorian, Latin digits (BR-8.13) |
| Page counter | `1 من 1` — Latin digits, and the separator is a WORD, not a slash |
| Actions column | Absent, per Q-7 |

### 1h.2 — Two defects, both invisible in the preview

**The date column was one digit short.** `30/08/2026` rendered as `0/08/2026`. The 96px came
from the preview, which drew the date with its own cell padding; `Table` pads 16px each side,
so 96 left 64px for a string needing 73. Measured on the real screen: cell 97, content 105.
Now 116.

**It reads as a data error, not a width one** — a date starting with a single digit looks
like a bad value, and the table also overflowed by exactly those 8px, which is what a
*width* problem looks like. The two symptoms pointed in different directions.

**Every subject was a blue underlined link.** The `<a>` exists so a keyboard and a screen
reader can reach the ticket — the row click adds no tabindex — but `base.css` gives every
`<a>` the link colour and the browser underlines it. Sixty links in a column the design
draws as plain text. Colour and decoration overridden; **the focus ring is untouched**,
because it is the only thing telling a keyboard user where they are.

### 1h.3 — Open, and it is a ruling, not a fix

**An LTR subject in an RTL cell truncates from its START.** `Least privilege live probe`
renders as `… privilege live probe`: the ellipsis is on the left and the first word — the
part that identifies the ticket — is what is cut. Seven of eight rows truncate; all report
`direction: rtl`.

This is the direct consequence of the ruling that fixed the name column. `unicode-bidi:
isolate` gives every cell the same start edge without rewriting direction, which is what
stopped `Sara Khan` aligning against the opposite edge of a column of Arabic names. The
same property is what puts the overflow — and so the ellipsis — on the physical left,
whatever direction the content reads in. **Arabic subjects truncate correctly; Latin ones
do not.**

| Option | Cost |
|---|---|
| Leave it | A Latin subject loses its opening words. In an Arabic-dominant product this is the minority case, and the seed data is unrepresentative — its subjects are English probe strings |
| `dir="auto"` on the subject line only | Truncation follows the text and keeps the head. The subject column then aligns per row by content language — the jumpiness the name ruling was about, in a column it did not cover |
| Truncate in JS at the string's own end | Correct in both directions, and the only option that keeps a uniform edge. Costs a measurement per row |

**Not decided here.** The name ruling covered NAMES, and a subject is content rather than a
label, so this is a column the ruling did not reach — but it is close enough to it that
choosing unilaterally would be re-deciding something already settled.

### 1h.4 — Not verified, and why

**The escalation marker.** No seeded ticket has `isEscalated: true`, so the red `مُصعَّدة`
text under the ticket number never rendered. It is covered by no assertion on the real
screen — the preview draws it, which is not the same thing. `016` creates the first real one.

## 1i — The cells that were rebuilt instead of carried over

The wired screen was reported as *"not the table we agreed on"*, and it was not. `026`
implemented the spec text and rebuilt each cell from it, rather than carrying across the
design `FE-026-00` had already proven. Four things were missing; one was a defect, not a
style gap.

### 1i.1 — A class name is not a style

`TicketPriorityText` shipped with `className="priority priority-high"` as **plain global
strings that no stylesheet defined.** Computed colour on every priority was
`rgb(13, 38, 38)` — the default text colour. High and Critical were not coloured at all and
the BR-1 map was inert.

**The test passed.** It asserted `className.includes('priority-')`, which is true of a class
that styles nothing.

`getComputedStyle` cannot close this: vitest applies no CSS Modules, so it reports nothing
either way. The guard now requires **two** facts — the class must come from the CSS module
(hashed, so a hand-written global fails the assertion) **and** the stylesheet is read to
confirm the matching rule sets a colour. Restoring the exact bug turns **3** tests red.

**Third guard this session satisfied by the wrong thing**, after `toBeVisible` on `sr-only`
and the `background-color` *or* `color` check. The shape is identical every time: the
assertion is about the right thing and satisfied by something adjacent to it.

| | Before | After |
|---|---|---|
| Priority | one colour for all four | حرجة `rgb(229,69,69)` · مرتفعة `rgb(138,90,0)` · عادية / منخفضة muted |
| Channel | one grey chip, no glyph | icon + per-channel tint, **4 distinct tints** across the channels present |
| Assignee | plain text | initials circle (Q-4) |

### 1i.2 — Rulings, 2026-08-30

Asked, and answered. Recorded here so none of them is re-opened by the next person who
compares the screen to the design.

| # | Ruling |
|---|---|
| **Actions column** | **Follow the spec, not the screenshots.** No kebab, no row menu; opening a ticket is the row click. The supplied design shows `الإجراءات` with a kebab — that is a **design/spec discrepancy, documented and left standing.** The column is not added unless Q-7 is explicitly revised |
| **Search · filters · tabs** | **Stay in `015`.** `026` remains the table, pagination, and the five table states. The preview carries them because the canvas was drawn whole; the screen does not |
| **Subtitle (`count · updated`)** | **Left out.** It needs a counted noun, and `FE-026-05` rules those out — Arabic plural agreement makes `{{count}} تذكرة` wrong for 2, and for 3–10, and again above 10. **Flagged as an unresolved copy decision**, not as a missing feature |
| **Escalation marker · assignee avatar** | Implementation stays. **No seed data is manufactured to verify them** — that is dressing the demo. Covered by fixture tests instead |
| **The priority guard** | Keep the stronger form. Not to be weakened back to a class-name assertion |

### 1i.3 — What fixtures can prove that the database cannot

No seeded ticket is escalated, and every one is unassigned, so the Arabic walk exercised
neither branch. Both are now asserted **in both directions** — a test that only renders the
true case passes on a component that renders the marker unconditionally.

| Break | Observed |
|---|---|
| `row.isEscalated ?` → `true ?` | 1 failed — the marker appears on a row that is not escalated |
| `[...name][0]` → `name.slice(0, 2)` | 1 failed — the circle must hold ONE character, and an Arabic letter is multi-byte, so a byte-indexed slice renders the wrong glyph |

## 1j — `TEST-026-11`, the accessibility walk

Run 2026-08-30 on the **real screen**, Arabic, against the API. Keyboard events dispatched
through the browser, not `element.focus()` — `:focus-visible` does not match a programmatic
focus, so a ring check done that way reports nothing and looks like a pass.

### 1j.1 — Structure

| Checked | Result |
|---|---|
| Table accessible name | `قائمة التذاكر` |
| `<th scope="col">` | **all seven** |
| `aria-sort` | absent on every heading — correct, `026` has no sortable column (Q-T-3) |
| `<tr>` `tabindex` / `role` | **none**, by design — a row with either announces the whole row as one control |
| Page heading | `<h1>التذاكر</h1>` |

### 1j.2 — Keyboard

**Eight rows, eight focus stops, one per row** — the subject link. Tabbing runs rows 1→8 in
document order and then leaves the table for the rows-per-page control. No dead stop, no
trap, nothing focusable that does nothing.

Every stop matched `:focus-visible` and carried a visible ring: `box-shadow 0 0 0 3px` plus
a 2.67px outline. **This is the ring that the search field gave up**, and it is why that
trade was scoped to one field rather than removed globally.

### 1j.3 — Nothing is said by colour alone

Asserted across all eight rows: status, priority and channel each carry a **word**, not only
a tint. `Badge` makes `label` a required prop with no way to omit it, priority is text, and
the escalation marker is the word `مُصعَّدة` — colour is redundant in all four, which is
DESIGN-BRIEF rule 14.

### 1j.4 — TWO CONTRAST FAILURES, and they are token-level

Measured on the rendered screen, WCAG 2.1 contrast against the actual composited background:

| Element | Colour | Ratio | AA (4.5:1 at this size) |
|---|---|---|---|
| Priority `عادية` / `منخفضة`, 16px | `--text-muted` → `rgb(118,129,140)` | **3.97** | **fails** |
| Priority `حرجة`, 16px | `--state-danger-text` → `rgb(229,69,69)` | **3.99** | **fails** |
| Ticket number, 12px | `--text-muted` | **3.97** | **fails** |
| `غير مُعيَّنة`, 16px | `--text-muted` | **3.97** | **fails** |
| Channel pill, 12px | `--channel-email-fg` on `--channel-email-bg` | 6.82 | passes |

**The `حرجة` one is the worst of them**, and not because the number is lower: it is the
highest-priority signal on the row, the one thing a reader is scanning for, and it is the
least legible text in the table.

None of this is `026`'s to fix. `--text-muted` is `--neutral-500` and `--state-danger-text`
is `--red-600`, both from the `023` token layer, both used on every screen in the product.
Changing either here would fix one table and leave the rest — and changing a semantic token
is a design-system decision, not a feature one.

**Raised, not patched.** It belongs to whichever feature owns the token layer, and the
measurement above is what it needs: real ratios, at the real sizes, on the real background.

### 1j.5 — Not verified, and one claim here was wrong

**CORRECTED 2026-08-30, and the correction is the finding.** This section said *"no seeded
row is escalated or assigned."* The assigned half was **false**, and it was false because it
was read off the API — the same API that is dropping the value.

Measured after the backend lane reported it: **3 of 5 tickets carry an `assigneeId`**, and
`assigneeName` is `null` on every one of them. They are assigned. The list renders
`غير مُعيَّنة` over three assigned tickets, which is a visible lie to a user, and the avatar
branch is unverifiable on the real screen for that reason — **not** because the data lacks
assignees.

This is the repository's own rule, met from the wrong side: *verify a measurement with
something below it.* The API was treated as ground truth about the database, and it is not —
it is the thing under test. Nothing here was checked against the row.

It is also a **contract violation**, not merely a missing join. `tickets-list-api.md` states
`assigneeId` and `assigneeName` are *"both null when unassigned"* — together. One set and one
null is a shape the contract does not describe, and `002c`'s OpenAPI comparison cannot catch
it: that compares **shapes**, and this shape is legal. Only a value can show it.

**FIXED THE SAME DAY, `62af3cc`.** Verified independently after the fix: 3 of 3 assigned rows
carry the name, the 2 unassigned rows are still returned with both fields `null` — an inner
join would have dropped them — and the detail carries the nested object, with the key present
rather than absent.

**Nothing was built around it while it was open** — no fallback, no lookup, no "unknown"
placeholder. That was the right call for a reason stronger than patience: `026` §5 forbids
rendering a ticket from a write response, and the write response was the only place the name
existed. A workaround would have had to break that rule, and it would have survived the fix.

**The cause was sharper than the report.** Not a join missing twice: `Map` takes `assignee`
as a parameter defaulting to `null` — correct for creation, since `009` AC-2 says a ticket is
never assigned at creation. The write call passed it, the two reads did not. One mapper,
three call sites, one right.

The **escalation marker** has no seeded row, so its ring, its contrast and its position were
not measured on the real screen. Its conditional rendering is covered by fixture tests
(1i.3), and its meaning is a word rather than a colour by construction — but the rendered
checks above were not run against it.

### 1b.8 — Open, and recorded rather than smoothed over

- **`.colPriority` is now 92px, and it is the canvas's number, not a render.** This was
  104px of arithmetic — 69px (`منخفضة`) + 2x16 cell padding = 101, rounded up — and the
  canvas draws 92. The canvas number is taken because every other width in the row came
  from it, but that means the column got *narrower* than the one figure this file had
  computed. **First thing to check in the next Arabic pass**, and the one width on this
  table not read off a screen.
- **The 880 frame now overflows by ~240px.** That is the design's own arithmetic (1b.2) and
  it is deliberately not hidden: the horizontal scroll is what reports that eight columns
  at canvas widths do not fit the shell. If the product owner wants it to fit, something in
  the column model gives — and the honest candidates are the 150px channel pill and the
  260px subject floor, in that order.
- **Seven tab segments do not fit one line at 880px.** All, plus the six BR-1 statuses. The
  canvas quietly avoids this by drawing five. The strip is allowed to *wrap* rather than
  scroll or truncate, deliberately: looking wrong is how the 880 frame reports that the
  status set is too wide for the shell. `015` decides what to do about it.
- **Nothing in 1b has been reviewed by the product owner in a rendered browser yet.** The
  design has been supplied three times — two HTML canvases and one set of screenshots — and
  the screenshots are what corrected 1b.2, 1b.3 and 1b.5. ADR-009 still makes the review
  the gate, and no screenshots of *our* render are attached to this file. Chrome DevTools
  could not be driven this session: `The browser is already running for
  C:\Users\lap-tech\.cache\chrome-devtools-mcp\chrome-profile` on both
  `navigate_page` and `new_page`. The corrections above were made from the screenshots and
  the code, and verified by tests — **not** by looking at the running page.
- **`STATUS_TONE` awaits a ruling — see 1b.10.**
- The subject tooltip fires only when `scrollWidth > clientWidth`, measured by one
  `ResizeObserver` on the `<tbody>` — not one per row. It doubles as a live readout of A-3:
  if it starts firing on *short* subjects, the column has become too narrow.

---

## 1k — The two scoped queues, `/tickets/mine` and `/tickets/unassigned`

**Asked for 2026-09-01**, in the product owner's words: *"فيه صفحتين تانين نفس صفحة كل
التذاكر بالظبط بس الاختلاف انه فيه فلتر بيبتعت للباك اند واحده لليوزر الحالي وواحده للي
مفيش يوزر معمول ليه اسناد للتذاكر ظبطهم."* Two nav destinations that had been `023`
placeholders since the shell was built.

### 1k.1 — One component, and the reason a second one was refused

Both are `TicketListPage` with a `queue` prop. A second component was the obvious shape: the
table, the five chip counts, the numbered pager, the row menu and an eight-report design pass
would then exist twice, and the copy that drifts first is the one nobody is looking at.

**The scope is not a filter, and every difference in the diff follows from that one
sentence.** Written out because each one reads like an inconsistency until the reason is
stated:

| The scope… | …because |
|---|---|
| never reaches the URL | the path already says it; one fact stated twice drifts |
| draws no applied chip | a chip has an `×`, and removing this one leaves the nav highlighting *My tickets* over everybody's |
| survives `مسح الكل` | same reason |
| is not in the `تصفية` badge count | the badge counts questions the reader asked, and this one has no control to find |
| scopes the five chip counts | otherwise *My tickets* heads a four-row table with `31` beside **All** |
| is not `isFiltering` | so an empty personal queue reads *"nothing assigned to you"*, not *"no matches"* under a Clear-filters button |

`assignee=me` is resolved from the **token** server-side (`015`), so the client never sends
the signed-in user's own id — verified on the wire in 1k.4, and the reason it matters is that
a client which sent an id would put another agent's queue one URL edit away.

### 1k.2 — The tests, and what each one would catch

Twelve added to `TicketFilterBar.test.tsx` (it already mounts through the page with a URL
probe) and four to `routes.test.tsx` — sixteen, which is the whole difference in the suite
tally. Every one of them can fail on a build where the screen
still looks correct, which is why they are tests and not comments.

| Test | The defect it refuses |
|---|---|
| `/tickets/mine` asks for `assignee=me` | the whole team's queue under a personal heading — it renders perfectly |
| `/tickets/unassigned` asks for `assignee=unassigned` | same |
| `/tickets` sends **no** assignee | the control: the two above pass on a build that scopes everything |
| the path outranks a stale `?assignee=` | a shared link showing a different queue from the one the nav highlights |
| all five counts carry the scope | a header describing another queue — and it is *every* call, not the first, because a scope applied to some of five is a header that mixes two |
| the scope stays out of the URL when a facet is applied | a query string that survives a click to another queue |
| `تصفية` shows no count for the scope | a badge pointing at a filter with no control |
| a facet the reader **did** apply still counts | the control for the row above |
| no removable chip for the scope | — |
| `/tickets?assignee=me` **does** draw one | the control: the row above passes if the chip was deleted outright |
| `مسح الكل` keeps the queue | the nav highlighting one queue over another's rows |
| an empty personal queue says so | *"nothing has arrived on any channel"* — false while the team's queue holds work |
| routes pass `queue`, and `/tickets` does not | the placeholder, or the list with no scope |
| `/tickets/mineral` still resolves to `:id` | a static segment matching as a prefix |

### 1k.3 — Eight negative controls, all red on exactly the intended test

The suite was green on the first run, which is the state this file distrusts. Baseline before
each control: **33 passed** across the two files.

| Control | Broken on purpose | Observed |
|---|---|---|
| C1 | the scope is not applied to the list's filters | **4 red** — both queue tests, the URL test, `مسح الكل` |
| C2 | the chip counts left unscoped | **1 red** — the counts test |
| C3 | the scope not stripped on the way into the URL | **1 red** — the URL test |
| C4 | the bar not told the assignee is locked | **1 red** — the chip test only. *See 1k.6* |
| C5 | the empty state counts the scope as the reader's filter | **1 red** — the empty-queue test |
| C6 | `/tickets/mine` resolves to the list but passes no `queue` | **1 red** — the route test |
| C7 | the two filter sources spread in the other order | **5 red** — including the stale-link test |
| C8 | the badge counts the locked assignee again | **2 red** — the badge test *and* its control |

C8 is the one worth reading twice: it turned **both** badge tests red, which is what
distinguishes "the count is right" from "the count stopped counting".

### 1k.4 — Measured in the browser, against the running API

Manager session, seeded data, `localhost:5177` → `localhost:5272`.

```text
/tickets/unassigned   heading تذاكر غير مسندة · nav تذاكر غير مسندة · chips []
                      counts  الكل 31 · جديدة 31 · قيد التنفيذ 0 · بانتظار العميل 0 · محلولة 0
                      rows    20, المسؤول = «غير مُعيَّنة» on every one
/tickets/mine         heading تذاكري · counts الكل 49 · 12 · 12 · 12 · 13
                      rows    20, المسؤول = «منى العتيبي» on every one
requests              /api/tickets?page=1&pageSize=20&assignee=me
                      /api/tickets?page=1&pageSize=1&status=New&assignee=me   (+4 more)
                      — twelve calls, `assignee=me` on all twelve, no user id anywhere
click جديدة           URL /tickets/mine?status=New          ← no assignee in the query string
                      GET  ?page=1&pageSize=20&status=New&assignee=me
                      chips ["الحالة: جديدة"]               ← one chip, and it is not the scope
مسح الكل              URL /tickets/mine · GET ?page=1&pageSize=20&assignee=me · 20 rows
English (LTR)         "Unassigned tickets" · breadcrumb Tickets › Unassigned · Filter, no badge
                      geometry identical to /tickets — h1 top 152, search 152, Filter 211 on
                      both, so the longer title wraps nothing that was not already wrapping
```

### 1k.5 — The browser found the one thing fourteen tests missed

`/tickets/unassigned` rendered **`تصفية 1`** — a badge counting the scope as an applied
filter, over a panel that contains no assignee control. Fourteen scoped-queue tests existed
at that point and not one of them looked at the badge: every assertion was about the
request, the URL, the chips, or the empty state.

**The lesson is the one this file keeps re-learning.** Tests written from the design decision
covered the decision, not the screen — and the badge is a *derived* number, so it picked up
the scope from the same `filters` object everything else was reading deliberately. Two tests
cover it now, one of them the control.

### 1k.6 — Open, and recorded rather than smoothed over

- **`TicketFilterBar`'s `مسح الكل` guard is belt-and-braces today, and C4 measured it.**
  With `lockedAssignee` false the request still comes back scoped, because the page strips
  the assignee on the way to the URL and re-applies it from the path either way. The line
  stays — it is the component's own half of the contract, and a caller that locks the
  assignee without that strip needs it — but **the green suite is not evidence for it**, and
  the comment beside it now says so.
- **The scoped empty state was not seen in a browser.** No seeded queue is empty: the Manager
  has 49 and 31 are unassigned. It is covered by test (and by C5), and the copy —
  *«لا توجد تذاكر مسندة إليك»* / *«كل التذاكر مسندة»* — has been read, not rendered. The
  first agent account with an empty queue is its first real look.
- **The queue is not in `activeFilterCount`'s own contract**, only in the bar's call. A
  second caller of `activeFilterCount` would have to remember the same thing. One caller
  today; if a second appears, the exclusion belongs in `ticketFilters.ts` with the lock as a
  parameter.
- **`GET /api/tickets` is asked six times per queue view** — the list plus five counts, and
  the counts are cached for 60s. Unchanged by this work and stated again here because scoping
  them multiplied nothing: it is still six, now with one more query-string parameter. The
  aggregate endpoint that collapses it is `020-dashboard`'s `DashboardAggregatesQuery`, still
  unbuilt.

### 1k.7 — Run output

```text
frontend suite   27 files · 472 passed        (456 before this work, +16)
                 TicketFilterBar.test.tsx      28 passed
                 routes.test.tsx                8 passed
tsc -b           exit 0
eslint .         clean
vite build       built in 1.47s
```

**One tool lied and is recorded:** the first full-suite run was launched in the background
and exited **code 0** having printed `Serialized Error: { code: 'ERR_IPC_CHANNEL_CLOSED' }`
and no tally at all. A zero exit with no test count is not a pass. Re-run in the foreground
for the numbers above.
