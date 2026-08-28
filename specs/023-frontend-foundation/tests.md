# 023 — Test evidence

Every line below was **observed**. Nothing is written here that was not seen. Where a
thing could not be exercised it says so and says why, rather than being omitted.

Environment: Chrome via `chrome-devtools`, viewport emulated at **1440 × 1024 × 1** —
the design frame — unless a row says otherwise. Dev server `vite --port 5199`.

---

## 1 · Repository gates

Run from `src/wasl-web`, from a clean `dist/`.

| Command | Result |
|---|---|
| `npx tsc -b` | `EXIT=0` |
| `npx eslint .` | `EXIT=0` |
| `npx stylelint "src/**/*.css"` | `EXIT=0` |
| `npm run lint:i18n` | `Locale parity OK — ar, en · 4 namespaces · 15 keys compared.` |
| `npx prettier --check .` | `All matched files use Prettier code style!` |
| `npm run build` | `EXIT=0` · `✓ built in 479ms` |
| `npm run dev` | `HTTP 200` on `/` and on `/src/main.tsx` |
| `npm audit` | `found 0 vulnerabilities` |

Production build output:

```text
dist/index.html                     3.20 kB │ gzip:  1.48 kB
dist/assets/index-Bp1SG2_9.css     22.91 kB │ gzip:  4.82 kB
dist/assets/HomePage-DDMStrwX.js    0.12 kB │ gzip:  0.13 kB
dist/assets/index-d7zcOCdX.js     297.14 kB │ gzip: 96.14 kB
```

One entry chunk plus one chunk per page — the shape ADR-011 §7 asks for.

---

## 2 · Every gate was made to fail before it was trusted

A gate nobody has seen fail is a gate nobody knows works. Each violation was introduced
deliberately, the failure observed, then the violation removed and the gate re-run green.

| Violation | Observed |
|---|---|
| `<div>New ticket</div>` in `src/features/` | `error no-restricted-syntax` — “No user-facing literal in JSX (BR-8.8)…” |
| `(p: any)` | `error @typescript-eslint/no-explicit-any` — “Unexpected any” |
| `margin-left: 4px` in a stylesheet | `property-disallowed-list` — “Unexpected property "margin-left"” |
| `text-align: left` | `declaration-property-value-disallowed-list` — “Unexpected value "left"” |
| Key removed from `ar/common.json` | `EXIT=1` — “ar/common.json: missing 'nav.myTickets' (present in en).” |
| Key added to `ar` with no `en` counterpart | `EXIT=1` — “ar/common.json: 'nav.somethingNew' has no en counterpart.” |
| Correct Arabic 6-category plural against English 2-category | `EXIT=0` — **not** a false positive |
| `Button` with `withText={false}` and no `aria-label` | `Uncaught Error: Button: withText={false} makes this an icon-only button, which has no accessible name.` |

The plural row is the one that makes the parity gate usable: English has two CLDR
categories and Arabic six, so a literal comparison would fail correct translations and
train everyone to ignore the script.

---

## 3 · The primitives

Measured in the browser, not asserted from the source.

### Button

| Claim | Observed |
|---|---|
| Width does not change between default and loading | All six cells `93.99px`; later pass at a different zoom, all six `240.85px` — equal within each pass |
| Height is 40 on every cell | `40` |
| Hover is **lighter**, active is **darker** | oklab L: default `0.250` → hover `0.340` → active `0.205` |
| `color-mix(in oklab, …)` resolves | `oklab(0.340203 0.0175287 -0.0821418)` — a parsed colour, not the literal string |
| Loading keeps its Type's colours | primary loading `rgb(29, 23, 77)` / `rgb(255,255,255)`; disabled `oklab(0.94…)` / `rgb(159,171,181)` — distinct |
| Icon slots are logical | LTR `iconStart` x `20.8`, `iconEnd` x `231.8`; RTL exactly mirrored, same button width `252.6` |
| Focus ring is visible under real keyboard focus | Tab → `:focus-visible` matched, `box-shadow: oklab(0.250231 … / 0.22) 0 0 0 3px` |

**Corrected during the run:** loading first rendered in the *disabled* palette, because
`loading` sets the native `disabled` attribute. `[aria-busy='true']` now restores the
Type's colours after the `:disabled` rule.

### Input

| Claim | Observed |
|---|---|
| `aria-invalid` in the error state | `"true"` |
| `aria-describedby` points at the rendered message | resolves to `"Enter a valid email address"` |
| The error **replaces** the helper | exactly `1` message element under the error field; helper text present on a non-error field |
| The label is a real `<label>` | `input.labels.length > 0` |
| `dir="auto"` on the control | `"auto"` |

### Badge

| Claim | Observed |
|---|---|
| Every badge carries a label | `15` badges, `everyBadgeHasALabel: true` |
| Not focusable | `0` badges with `tabIndex >= 0` |
| Greyscale still readable | `filter: grayscale(1)` applied; every variant still labelled |

### Loader — “Converge”

| Claim | Observed |
|---|---|
| Container fits the full travel | `46 × 16` |
| Dot / node | `5px` / `9px`, node at x `37` (`inset-inline-end: 0`) |
| Travel | `0 → 34` for all three dots |
| Delays | `0s · 0.13s · 0.26s` |
| Block offsets | `3.51 / 8 / 12.48px` = 22% / 50% / 78% of 16 |
| The slant is real, mid-flight | one frame: `(20.8, 1) · (14.6, 5.5) · (8.3, 10)` — x descending, y ascending |
| Node pulses | `9px → 11.87px` = 1.32× |

**Corrected twice during the run.** First version was three static dots — a default
spinner, which `design/brand.md` §2 names as the thing that must not ship. Second version
travelled correctly but staggered the delays by a third of the cycle, which separates the
dots into a queue and loses the slant entirely.

---

## 4 · The app shell

| Claim | Observed |
|---|---|
| Sidebar expanded / collapsed | `288` / `68` |
| Sidebar animates between them | `68 → 204.3 → 288` sampled mid-transition |
| Header | height `68`, padding block `16px`, inline-start `24px`, **inline-end `56px`** |
| Content | padding `56px`, gap `24px` |
| Two surfaces, content is the sunken one | sidebar/header `rgb(255,255,255)`, content `rgb(249,250,251)` |
| Nav item / child | `48` / `40` |
| Active bar | `3px`, `inset-inline-start` `0` expanded → `2px` collapsed |
| Avatar | `32` |
| CTA square in the collapsed rail | `40 × 40` (was `51.2 × 40`); expanded `239.2 × 40` |
| Collapsed rail items all fill the rail | `51.2` each, icon centred at `16.6` |
| RTL | `dir=rtl`; sidebar at x `1372`, width `68` → right edge `1440` |
| Flyout opens on **focus** | `visibility: visible`, `z-index: 200`, heading `التذاكر`, children `كل التذاكر · تذاكري · غير المسندة` |
| Tooltip | `rgb(29,23,77)`, vertically centred on its row (`Δ 0.0px`), `4px` from it |
| Keyboard reach | `34` interactive elements, `0` unreachable |
| The shell makes no request | `grep -rn "fetch(\|axios\|XMLHttpRequest" src/shell` → only a comment |

Every route has a distinct active item **and** a distinct breadcrumb:

| Path | Active | Breadcrumb |
|---|---|---|
| `/` | Dashboard | Dashboard |
| `/tickets` | All tickets | Tickets |
| `/tickets/mine` | My tickets | Tickets › My tickets |
| `/tickets/unassigned` | Unassigned | Tickets › Unassigned |
| `/customers` | Customers | Customers |

`breadcrumbsAllDistinct: true` · `activeStatesAllDistinct: true`.

**Four defects found by measuring, not by reading:**

1. The nav **group** rendered as a filled navy button. It is a `<button>`, and `base.css`
   gives a bare button the Primary appearance with `!important`; the class did not
   override it.
2. Avatar initials were invisible and the email was the wrong colour.
   `-webkit-text-fill-color` **inherits**, and it beats a descendant's `color`. Fixed once,
   in `base.css`, by making the fill track `currentcolor` inside a control.
3. **The sidebar never actually reached 68px.** It applied every other collapsed
   declaration — padding, centred icons — and left the width at 288. Proven by killing the
   transition from the console, at which point it resolved to `68px` instantly:
   `transition: inline-size` does not interpolate in Chrome. Now `transition: width`.

4. **The collapsed brand tile sat 10px off the rail axis.** Measured centres from the
   rail edge: tile `44`, CTA `34.4`, nav icon `34.4`, avatar `34.4` — rail centre `34`.
   It was reported as "the button is far from the logo"; the vertical gaps were a uniform
   `16 · 16 · 16` and always had been, and the eye was reading the horizontal offset as
   distance. `justify-content: center` on the collapsed lockup fixed 6px of it and left
   4 — the flex `gap` after the wordmark still occupies space once the wordmark's width
   goes to zero. With `gap: 0` as well: all four on `34.4`.

The group button also collapsed to `18px` in the rail (an `<a>` with `display:flex` is
block-level and fills; a `<button>` shrinks to fit), which put the 3px active bar on top
of the icon and clipped it — the “broken glyph” in the review screenshot.

---

## 5 · The API client

`lib/api.ts` was exercised through the app's own module graph with a stubbed `fetch`, then
the probe was removed.

| Case | Observed |
|---|---|
| `200` + JSON | body parsed; URL `http://localhost:5000/api/tickets?page=1&status=Open&status=InProgress&flag=true` — array repeated, `undefined` dropped; `Accept-Language: en`; no body on GET |
| `204` | resolves `undefined`; the PUT sent `Content-Type: application/json` and `{"status":"Open"}` |
| `409` with real `ProblemDetails` | `ApiError`, status `409`, `type` verbatim `https://wasl.local/errors/duplicate-customer`, `traceId`, `errors.email`, `contentLanguage: en` |
| `500` with an **HTML** body | `ApiError`, status **`500`**, `type: errors/unknown` — the parse error did not hide the status |
| Transport failure | `ApiError`, status `0`, `type: errors/network` |
| Abort | re-thrown unchanged — **not** an `ApiError`, `name: AbortError` |
| `Accept-Language` follows the language | `ar → ar`, `en → en` |

`grep` for `getTickets|createCustomer|/api/tickets|interface Ticket|TicketStatus|Role` in
`api.ts` matches **only the comment that says they are absent**. `api.ts` is the only file
in `src/` containing `fetch(`.

---

## 6 · Localization

| Claim | Observed |
|---|---|
| `dir`/`lang` before first paint | with `wasl.lang=ar` preset: first animation frame `dir=rtl`; **0 of 40 frames rendered LTR**; earliest `readystatechange` saw `interactive=rtl` |
| `[lang="ar"]` reaches `body` | `font-family: "IBM Plex Sans Arabic", …`, `line-height: 28px` (16 × 1.75), `letter-spacing: normal` |
| Both faces actually load | `IBM Plex Sans 400/500/700` and `IBM Plex Sans Arabic 400` reported loaded |
| Switching updates everything | `ar → lang=ar dir=rtl stored=ar`; `en → lang=en dir=ltr stored=en` |
| No Arabic label is clipped | all seven nav strings `clipped: false` |

**A defect found here:** `body` carries an explicit `font-family` in `base.css`, so the
inherited value from `<html lang="ar">` lost to it — a direct declaration beats
inheritance. Any Arabic not itself tagged `lang="ar"` rendered in `--font-sans`, which has
no Arabic glyphs: the Q-15 defect reproduced by a specificity gap. Fixed with
`[lang='ar'] body`.

---

## 7 · Dev surface is not in the production build

| Marker | Files in `dist/` |
|---|---|
| `data-preview-state` | `0` |
| `PreviewPage` | `0` |
| `greyscale` | `0` |

The component state rules survive the strip (`brand-hover` present 3×), and the dev server
still forces the states: default / hover / active resolve to three different colours on
`/_preview`.

`/_preview` shipped in the production bundle on the first attempt — `import.meta.env.DEV`
around the *route* is not enough, because a top-level `lazy(() => import(…))` is always
reachable and Rollup emits the chunk regardless. The `import()` is now inside the branch.

---

## 8 · Copy fidelity

| File | Check |
|---|---|
| `src/styles/tokens.css` vs `docs/sdd/design/tokens.css` | `diff -q` → identical |
| `src/icons/icons.tsx` vs `docs/sdd/design/icons/index.tsx` | `diff -q` → identical |
| `src/brand/Mark.tsx` vs `docs/sdd/design/brand/Mark.tsx` | `diff -q` → identical |

The two icons this feature authored are in `src/icons/icons-added.tsx`, deliberately not in
the copy.

---

## 9 · Not verified, and why

Stated rather than omitted. Each is a real gap.

| Not verified | Why |
|---|---|
| `prefers-reduced-motion: reduce` | The browser tool cannot emulate that media feature. The CSS exists — `base.css` collapses durations, and `Loader.module.css` has a `reduce` block that places the dots statically along the path so they are not left invisible at `opacity: 0`. **It has not been seen.** |
| The drawer below 780px | Implemented and typechecked; never rendered at that viewport |
| Contrast ratios of the state pairs | Not measured. `--brand-subtle` on the active nav row and the disabled pairs are the ones worth measuring first |
| Any automated test | There is no test runner in this feature. Every result above is an observation, and it is repeatable only by hand |
| ~~The Arabic in a real Arabic reading pass~~ | **Done — see §11.** The strings were reviewed and corrected by the product owner (§10), and the running interface was walked end to end on 2026-08-26 |

---

## 10 · Arabic copy — reviewed

The fifteen strings were written by the developer, put to the product owner, and four were
changed on their instruction.

| Key | Was | Now | Reason given |
|---|---|---|---|
| `common:nav.main` | الرئيسية | **التنقّل** | It is a section caption, not a page. “الرئيسية” reads as *the home page* |
| `common:nav.dashboard` | لوحة المتابعة | **لوحة التحكم** | The settled term wins in navigation labels — people scan, they do not read |
| `common:nav.unassigned` | غير المسندة | **تذاكر غير مسندة** | The described noun belongs inside the value, so the key is self-contained and cannot be wrong if it is reused in a filter or a badge |
| `common:role.agent` | موظف دعم | **موظف الدعم** | `design/brand.md` §5 settles the glossary term; consistency with it beats brevity |

`role.agent` was also the one where “وكيل” was rejected: it reads as a commercial or
shipping agent before it reads as a support agent, and ambiguity in a **role name** is
worse than a longer line.

After the change: `npm run lint:i18n` → `Locale parity OK — ar, en · 4 namespaces · 15
keys compared.`

---

## 11 · The Arabic walk

`docs/sdd/testing/test-strategy.md` calls this a **deliverable, not a check**: RTL defects
are visual, and no assertion catches a container sized to English label text. Walked
2026-08-26 at 1440 × 1024, `lang=ar` `dir=rtl`, across the expanded shell, the collapsed
rail, the flyout, the tooltip, the user popover, every route, and `/_preview`.

**Three defects found and fixed. Everything else held.** Both are recorded, because a walk
that only reports what it fixed is a walk nobody can judge the coverage of.

### Found and fixed — a machine-readable identifier mangled by bidi

`--surface-page` rendered as `surface-page--`.

A hyphen is directionally **neutral**, so the two leading hyphens of a custom-property
name are laid out on the visual right of an `rtl` paragraph. Measured, not inferred: the
range covering the two hyphens sat at x `1365.6` inside a box spanning `1224.9 → 1380`,
and `leadingHyphensOnVisualRight` was `true` for both the swatch names and the type-scale
row labels.

ADR-007 §3 says machine-readable values — `type`, the keys of `errors`, enum values,
`TicketNumber` — are never localized. It does not say they are safe to *render*: an
identifier still has to be pinned with `dir="ltr"`, or bidi reorders it and the reader
copies a string that does not exist.

Fixed with `dir="ltr"` on both. After: `direction: ltr`,
`leadingHyphensOnVisualRight: false` for both.

It is in a dev-only page, and it is recorded anyway — **the first product consumer of the
same rule is the ticket-number column**, where the value is quoted on the phone and pasted
between systems.

### Found and fixed — the loader ran AWAY from its node under RTL

Reported from a screenshot, then measured in both directions before anything was touched:

| | Node | Dots travel | Toward the node? |
|---|---|---|---|
| LTR | RIGHT | left → right | yes |
| RTL, before | **RIGHT** | right → left | **no** |
| RTL, after | LEFT | right → left | yes |

**Two mirrors cancelled.** `.node` used `inset-inline-end`, which is logical and moved it
to the left under `rtl`; then `[dir='rtl'] .loader { transform: scaleX(-1) }` moved it back
to the right. The dots' travel is `translateX(+34px)` — **physical**, because the keyframes
are copied verbatim from `design/brand.md` §2 and CSS has no logical transform — so it was
flipped only once. The node ended up where it started and the dots ran away from it.

Fixed with `direction: ltr` on the loader container: the internal frame is authored in one
direction, and the single `scaleX(-1)` mirrors the whole assembly at once. `brand.md`: *"the
threads arrive from the inline-start, which in Arabic is the right."*

**A blueprint contradiction surfaced by this, and left unresolved:** `brand.md` says the mark
*"mirrors correctly under RTL"*, while `screens/02-app-shell.md` §RTL says *"the collapse
chevron mirrors; the brand mark does not"*. Applied per scope — the **loader** mirrors,
because `brand.md` is explicit about which side the threads arrive from; the **static lockup
tile** does not, because that is the line `02-app-shell.md` is about. Recorded rather than
reconciled: one of the two documents needs a correction, and it is not the frontend's to make.

### Found and fixed — one field, two edges

A field's label hugged the inline-start while its own message hugged the opposite edge.

`dir="auto"` was on the message span itself. The message text is Latin, so the SPAN
computed `ltr` and its content aligned left, while the label — interface copy following
the document — aligned right.

**This is not a hypothetical.** BR-8.12 falls back to English when an Arabic key is
missing, so an Arabic user reaches this state by a documented path, not by an edge case.

The fix is **bidi isolation**, and it splits two concerns that `dir="auto"` conflates:

- the **container** keeps the interface direction, so `text-align: start` puts the message
  under the start of its own field;
- a `<bdi>` isolates the **text**, so its own direction still decides the ordering and
  where the full stop lands (ADR-007 §8).

The decisive measurement, because the real string is as wide as the field and would look
left-aligned either way: a short probe inserted into the same span landed at x `125.9` of
a `155.1` box — hugging the **right** edge, with the label.

Applied to the `Input` message and to the user's name and email in both the sidebar block
and the popover. **The `Input` control keeps `dir="auto"` on itself, deliberately** — an
Arabic name typed into an English form should flip the whole field, not sit as an island
inside it. That is the one place the attribute is still correct, and it is the only place
it remains.

### Checked and correct

| # | Checked | Observed |
|---|---|---|
| 1 | Document root | `dir=rtl` `lang=ar` |
| 2 | Sidebar on the inline-end | `1152 → 1440` in a 1440 viewport |
| 3 | Header's asymmetric padding follows the direction | logical start `24px` / end `56px` → **physical left `56px` / right `24px`** |
| 4 | Nothing clipped anywhere in the shell | `clippedInSidebar: []` — every label, at every nav level |
| 5 | The active bar is on the inline-start | `inset-inline-start: 0` → **physical `right: 0`**, width `3px` |
| 6 | Arabic typography | `IBM Plex Sans Arabic`, line-height `28px` (16 × 1.75), letter-spacing `normal` |
| 7 | The `MAIN` caption's tracking is off under Arabic | `normal`, not the `0.84px` it carries in English — cursive joins intact (tokens.css note 4) |
| 8 | Breadcrumb reads parent → child, right to left | `التذاكر` at x `1096`, `تذاكر غير مسندة` at x `980.5` |
| 9 | User content carries `dir="auto"` | name and email both `auto`; the Latin name computes to `ltr` inside the `rtl` panel |
| 10 | Interface copy does **not** carry `dir="auto"` | nav labels have no `dir` attribute |
| 11 | The long email keeps its full value in `title` | `sara.alotaibi@example.com` |
| 12 | User popover opens upward and stays inside the sidebar | `1196 → 1416` against a sidebar of `1152 → 1440` |
| 13 | The sign-out arrow mirrors; the gear does not | `matrix(-1, 0, 0, 1, 0, 0)` on the arrow, `none` on the gear |
| 14 | Sign out is the only red item | `rgb(229, 69, 69)`; the other rows `rgb(13, 38, 38)` |
| 15 | Collapsed rail sits on the inline-end | `1372 → 1440`, width `68` |
| 16 | Flyout opens **toward the content**, on focus | `opensTowardContent: true`, heading `التذاكر`, items `كل التذاكر · تذاكري · تذاكر غير مسندة`, active child marked |
| 17 | Tooltip mirrors, and stays centred on its row | `العملاء`, `visible`, `rgb(29,23,77)`, `Δ 0.0px` vertically, `4px` from the row |
| 18 | The collapsed CTA is still square | `40 × 40` |
| 19 | `aria-describedby` resolves to a real element | `true` |
| 20 | Every type-scale size renders Arabic without vertical clipping | 30 / 22 / 16 / 16 / 14 / 14 / 12px — `clippedV: false` at all seven, leading `1.75` throughout |
| 21 | Mixed script in one page | Arabic value → `direction: rtl`; Latin value in the same RTL page → `direction: ltr`. Both `dir="auto"` |
| 22 | `text-align` on the control | `start` — never `left` or `right` |

### Observed, not changed

| Observation | Why it was left |
|---|---|
| The Latin name and email in the user popover are left-aligned while the Arabic rows are right-aligned | This is `dir="auto"` doing exactly its job: a Latin name is an LTR island, and forcing it to the RTL edge is the defect the attribute exists to prevent (ADR-007 §8). If the block should hug the panel's inline-start while the text still runs LTR, that is `text-align: start` on the element — a design decision, not a defect |
| A long Arabic button label overflows its **preview cell** | `Button` is `white-space: nowrap` and the parent owns the overflow — the documented behaviour. The preview row scrolls in its own container. The English sample in the same cell is short (“New ticket”), so the two locales are not showing the same string length; that is preview data, not a product defect |
| The required marker `*` sits to the left of an English label under RTL | Logically correct — `::after` with `margin-inline-start` places it *after* the label, which under RTL is the left. It only looks odd because the preview's labels are English; against an Arabic label it reads normally |
| The user popover stays open across a collapse and extends past the 68px rail | It remains on screen, anchored and usable. Reproduced only by collapsing with the popover already open |

### Not covered by this walk

The drawer below 780px, and `prefers-reduced-motion` — both still unseen, for the reasons
in §9.

---

## 12 · The measurement tools lied — six times, one pattern

Recorded as a **category**, not as separate incidents. Each on its own reads as a slip; together
they are a rule about how anything in this document was established.

**Count kept current across both lanes**, because the category is the point and a count that
stops being maintained stops being evidence. Three were found building `023`, two more building
`024`, and the sixth came from the backend lane on 2026-08-28 — listed at the end.

**What happened, in one line each.**

| The tool | What it reported | What was true |
|---|---|---|
| The preview's language toggle | Arabic copy under an `en` toggle, so the English column was "verified" | The toggle switched the strings and not the direction — the page never left RTL |
| The preview's measurement block | Token values attached to the wrong swatch | It walked the swatches by index and read the labels by a separate index. One insertion desynchronised them |
| The enum verification script | `DIFFER` on three enums, three separate times, for three unrelated reasons | It matched the request-fields table instead of the enum table; then `\r` from CRLF broke the line split; then `indexOf('---')` stopped at a markdown table separator |

**The pattern.** Every one of these failed by producing a *confident, well-formatted, wrong*
answer. None threw. None printed a warning. A tool that crashes is a tool that has told you
something; these told us something false in the same voice they use for the truth.

**The rule that came out of it, in the product owner's words:**

> أدوات القياس لازم تتفحص بحاجة أقل منها في المستوى — وإلا بتفحص نفسها.
>
> *A measurement tool has to be checked against something at a lower level than itself —
> otherwise it is checking itself.*

In practice: the browser probe was checked against raw bytes (`cat -A`), the enum script
against the contract file read by eye, the preview's readout against `getComputedStyle` in a
separate console call. In every case the disagreement was resolved in favour of the **lower**
level, and in every case the higher-level tool was the one that was wrong.

**Why this is a defect record and not a note about tidiness.** The enum script reported
`DIFFER` on `CommunicationChannel`. Stopping there and filing it would have been a **false
accusation against the backend lane** — the frozen contract was correct and the script was
not. That is the mirror image of the case `024`'s spec §11 is built around, where a
hand-written `'SMS'` on our side produces a `400` that reads as a backend defect. The two
failures point in opposite directions and both end with the wrong lane investigating its own
code.

**Two later instances, same shape, caught by the same habit** — added while building `024`:

- A browser probe counted `document.querySelectorAll('[role="option"]')` and found **one**
  option. Testing Library's `findByRole('option')` found **sixteen**: a native `<option>`
  carries the role implicitly, and this form has three `<select>` elements. The attribute
  query and the role query are not the same question, and the attribute query is the one
  that was wrong.
- The first run of the ADR-011 §6 gate reported a violation at
  `CreateTicketPage.tsx:17` — a line inside `import { …, type CustomerListItem } from …`.
  The gate's first output was an accusation against the one call site using the provisional
  file correctly. It now requires what *follows* the name, and skips import spans outright.

**What was built so the next one is louder.** `scripts/check-no-domain-types.mjs` refuses to
report success if it cannot find the declarations it is *required* to find in
`api-types.provisional.ts`, and throws rather than passing when the contract enum list comes
back empty. A gate that matches nothing otherwise reports a clean tree.

**The sixth, from the backend lane — 2026-08-28, feature `013`.**

A manual check with PowerShell's `Invoke-RestMethod` posted an Arabic comment body, and the
database came back holding `?????`. That is the exact signature of ADR-013's most expensive
defect: a `varchar` column under a non-Arabic collation, which presents as a font or encoding
problem rather than a schema one. In a table created that same hour, it read as a real fault in
brand-new code.

**The tool was the liar.** PowerShell 5.1 encodes a string request body as ASCII unless a charset
is named, so the mangling happened before the request left the machine. The column is
`nvarchar(4000)` and was always correct.

**The evidence was already on screen, which is the part worth keeping.** The author's Arabic name
`منى العتيبي` rendered correctly in the *response*, from the same console, in the same request.
One tool, two directions, one of them working — so the tool could not be trusted about either.
Settled by asserting the round-trip through `PostAsJsonAsync`, which sends UTF-8; that assertion
is now a permanent test in `TicketTimelineTests`.

Same shape as the other five: confident, well-formatted, wrong, and pointing at the wrong lane.
Had it been filed rather than checked, it would have been a defect report against a column that
does not have the defect.
