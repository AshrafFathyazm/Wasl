# `033` — measurements

Everything below was **run**, and the browser numbers were taken with Chrome
driven over CDP against the live dev server, in Arabic and in English, at one
viewport (1500×1000, sidebar expanded, signed in as the seeded Manager).

---

## 1 — One shape for every list screen

Reported 2026-09-02, with the two screens side by side:

> مينفعش صفحة التذاكر تكون الفلاتر والبحث وشكل الجدول مختلف المفروض كل الجداول
> في السيستم واماكن الحبث والفلاتر في نفس المكان

and, separately, *"الهيدر مش تحته الرو الخاص بيه"* and *"في مساحة فوق في الصفحه
فاضيه كبيره جدا"*.

| Measured, Arabic | `/tickets` before | `/customers` before | both, after |
|---|---|---|---|
| `<h1>` top (topbar ends at 68) | 152 | 170 | **120** |
| search box | y 237, x 462..782 | y 208, x 513..833 | **y 196, x 180..500** |
| تصفية button | x 88..168, w 80 | x 415..501, w 86 | **x 88..168, w 80** |
| table card | y 345, x 89..1123 | y 318, x 89..1123 | **y 256, x 89..1123** |
| row height | 70 | 62 | **62** |

Five separate causes, each found by measuring rather than reading:

1. **`space-between` on the title row.** With the toolbar last, its position was
   whatever the primary action's label left it — «عميل جديد» and «تذكرة جديدة»
   are 51px apart in width, and `space-between` hands that difference straight
   to the item before them. The toolbar moved to the **second** row, pinned with
   `margin-inline-start: auto`. Verified label-independent: with the action slot
   filled on one screen and empty on the other, both still read x=88..168.
2. **Two تصفية buttons.** The customer bar styled a bare `<button>` (86px); the
   ticket bar used the `Button` primitive (80px). With the toolbar pinned, those
   6px moved the search box. `.filterBtn` and `.filterBtnOpen` are deleted.
3. **Three owners for the space above the title** — the shell's
   `--content-padding` (56px on all four sides), each page's own
   `padding-block-start: 28px`, and an 18px `margin-block-start` on the customer
   bar left over from when it sat *under* a heading it now contains. The shell
   keeps 56 at the sides (the cards' inline edges are measured against that
   frame) and drops to 24 at the top; the stray margin is gone.
4. **The ticket bar's own `gap: 12px` and `margin-block-end: 16px`**, which the
   customer bar never had. Both head rows were already 58px tall at y=120 and
   both second rows carried `margin-block-start: 18px`, so they should have
   landed together — the gap added to the margin and put the search boxes 12px
   apart and the cards 28px apart.
5. **Two subtitle type scales** — `--type-body-sm` with no line-height against
   `12px/1.4` — made one heading block 15px taller than the other.

`/tickets/new` also turned out to be **unreachable**: `024` routed it and the
shell's sidebar button that was meant to open it had no `onClick` at all. A grep
over `src/` found the path in one comment and in the route table, nowhere else.
The button rendered, took focus and did nothing. It navigates now, and calls
`onNavigate()` first so the drawer closes behind it.

A page-header create button was added to `/tickets` on the way there and
**removed again**: it put «تذكرة جديدة» on screen twice, and the sidebar's own
note rules that create is "the one create action for the whole section, at the
TOP of the sidebar rather than in the page header".

---

## 2 — A header over its own column

The report was *"الهيدر مش تحته الرو الخاص بيه"*, and it is **not** a column
drift: header and cell tracks are identical to the pixel on both screens — one
`<table>`, `table-layout: fixed`, `sameTable: true`. What differed was the text
**inside** the cell.

**One element cannot carry both directions.** All four attempts were measured:

| Attempt | The cut | The box |
|---|---|---|
| `dir` on the truncating block | correct | **wrong edge** — 102px out on the email column, 61px on a Latin name in an Arabic table, 227px on an Arabic subject in English |
| no `dir` at all | **takes the BEGINNING** — «…متأخرة عدة ساعات», the start gone | correct |
| `unicode-bidi: plaintext` | correct | **wrong** — it changes the line box's base direction and `text-align: start` resolves against that |
| `text-align: match-parent` | — | **unsupported.** `CSS.supports('text-align', 'match-parent')` is `false` in Chrome 152 and the declaration is dropped from the cascade silently. Only `-webkit-match-parent` exists, and prefixes are banned |

What ships: a **flex wrapper** in the page's direction, which places the box, and
the `dir` on the **value**, which owns `overflow`/`text-overflow` so the ellipsis
lands at the end of the words. `.cellBox` on the customer cells, `.subjectAnchor`
(already there, changed from `display: block`) on the ticket subject.

After, per column, over **20 rows** in each language, header text edge against
cell text edge:

```text
customers / ar   name 0   email 0   phone 0   company 0   added 0
customers / en   name 0   email 0   phone 0   company 0   added 0
tickets   / ar   subject 0  customer 0  priority 0  created 0
tickets   / en   subject 0  customer 0  priority 0  created 0
```

The channel, status and assignee columns read 26/20/9px on the **glyphs** and
**0px on the leading box** — the offset is the chip's own icon and padding, which
is what the design draws. Measured separately rather than waved away.

Truncation, same run: 20 of 20 subjects truncated, 20 of them starting with a
strong RTL character, **0 cut at the start** in either language.

### Two of my own measurements were wrong first, and both read as success

- **`Range.selectNodeContents(td)` measures the BOX, not the glyphs.** A cell
  whose only child is a block returns that block's rect — the full track width —
  so a cell whose text sits on the opposite edge measures as perfectly aligned.
  It reported **0px drift on a column that was 102px out**, and the fix looked
  verified. Replaced with a walk over the text nodes.
- **`Range.getClientRects()` reports UNCLIPPED geometry.** A line that overflows
  its box measures where it spills, not where it is visible — 227px of it on a
  truncated subject, which read as a 227px misalignment and was not one. The
  rects are clamped to the cell box now.

Both are in the same family as the five tools `CLAUDE.md` already records lying
here. The tell in each case was a number that did not move when the code did.

---

## 3 — The guard

`src/features/listParity.test.ts` — 14 assertions over the source, because jsdom
has no layout and nothing in this suite can measure a position. It asserts the
toolbar's pin and its row, one block spacing for both second rows, one density,
the `Button` primitive on both, the shell's single owner for the top gap, the
wrapper around every truncating cell, the `dir` on the value and not the wrapper,
and that neither `plaintext` nor `match-parent` comes back.

**Seen to fail:** two of the fourteen went red on their first run and named real
differences — the ticket bar wrote `margin-block-start`/`-end` longhands where
the customer bar wrote the `margin-block` shorthand, and the file-length control
caught a threshold that would have passed on a short stylesheet. Both were fixed
rather than loosened. The comment-stripping control is the third: these
stylesheets now quote the declarations they replaced, so a scan over raw text
would pass on the prose.

---

## 4 — Suites

```text
npx vitest run          31 files, 567 tests, all passed
npx tsc --noEmit        clean
npx eslint src          clean
npm run lint:i18n       ar, en · 5 namespaces · 363 keys compared
npx stylelint           no new errors (3 pre-existing in TicketList.module.css,
                        3 in CustomersList.module.css, all predating this work)
console errors          none, on both screens in both languages
```

---

## 5 — One answer for an inverted date range

**Ruled 2026-09-03, and §5.4 is superseded.** `/api/customers` answered `200` with
`totalCount: 0` while `/api/tickets` answered `400` for the identical shape. Both
screens were measured before anything changed, and **both were telling the reader
something false:**

```text
/tickets?createdFrom=2026-09-01&createdTo=2026-08-01
  400  errors/validation
  screen: «تعذّر تحميل القائمة · راجع خاصية errors للاطّلاع على رسائل الحقول»
          ^ the server's DEVELOPER-facing detail, printed to a support agent

/customers?createdFrom=2026-09-01&createdTo=2026-08-01
  200  {"items":[],"totalCount":0}
  screen: «لا نتائج — لا عميل يطابق هذا…»
          ^ a false claim about the DATA in answer to a broken claim about the REQUEST
```

**Why the tickets side won the ruling.** §5.4 said an inverted range "describes a
window with nothing in it". It does not describe a window — it is a contradiction. A
window with nothing in it is `from == to` on an empty day, and that already returns
zero correctly. A `200` that says "no customer matches" is the shape this API's own
contract forbids: *`200` is never returned with an error in the body.*

**Three layers, and each has a different job.**

| Layer | What it does | Why it is not the layer above |
|---|---|---|
| The endpoint | `400`, `errors.createdTo` = `Validation.CustomerFilter.CreatedRangeInverted` | The guarantee. It cannot be bypassed by a client |
| The URL readers | `readFilters` / `readCustomerFilters` drop **both** bounds | A stale link must not render an error pane over a working list — the policy both files already state for every value that fails validation |
| The panels | «تطبيق» is disabled and the note says what to do | The picker cannot BUILD a request the endpoint refuses |

Dropping **both** bounds is deliberate: keeping one would filter by a bound the reader
never chose.

**After, measured on both screens:**

```text
/tickets?createdFrom=2026-09-01&createdTo=2026-08-01
  200  /api/tickets?page=1&pageSize=20          <- neither bound sent
  20 rows rendered, no error pane, no chip

/customers?createdFrom=2026-09-01&createdTo=2026-08-01
  200  /api/customers?page=1&pageSize=20        <- neither bound sent
  20 rows rendered, no "no matches" pane, no chip
```

### The error pane was printing developer copy

`ErrorState` read `problem.detail` and fell back to its own string. On a validation
envelope `detail` is *deliberately* developer-facing — it points at the `errors`
property — so the user-facing message was one level down, unread. It now prefers the
first field message, keeps `detail` for everything else (a `503`, a domain `409`),
and keeps its own copy for a transport failure, which carries no ProblemDetails at all.

### Negative controls — all three were seen to fail

| Control | Result |
|---|---|
| Remove the validator rule, re-run the three server tests | `An_inverted_range_is_refused…` and `…names_only_the_bound…` **fail**; `A_single_day_window_is_not_inverted` stays green, which is correct — it does not depend on the rule |
| Make `readCreatedRange` return the pair unchanged | 2 of the 6 customer-reader tests **fail** |
| `from == to` on both layers | **stays green** — this is the control against writing the check as `<=`, which would pass every other test while deleting the one-day filter |

### What is NOT verified in a browser

The disabled «تطبيق» was **not** driven end to end. Four CDP probes tried to build an
inverted draft through the two calendars and each reported `no day 15` — the day cells
are not `<button>`s carrying plain digits. Rather than report a measurement that names
the wrong thing, that claim rests on the predicate's twelve unit tests (six per module,
including the `from == to` control) and a source scan in `listParity.test.ts` that the
`disabled` prop and the note are wired to it. **Stated, not claimed.**

### Suites, after

```text
dotnet build --no-incremental     0 warnings, 0 errors
dotnet test                       189 + 26 + 420 = 635 passed
npx vitest run                    31 files, 567 tests, all passed
npx tsc --noEmit                  clean
npx eslint src                    clean
npm run lint:i18n                 ar, en · 5 namespaces · 363 keys compared
```

**A full `vitest run` reported `31 files failed · no tests` once**, with
`ERR_IPC_CHANNEL_CLOSED`. Nothing was wrong with the tests: a `dotnet run` API was
still in the background and the workers were starved. Same class as the
`OutOfMemoryException` `CLAUDE.md` records — resource exhaustion wearing a feature
failure's clothes. Stopping the API and re-running gave 567 green.

---

## 6 — Still open

- `033` `tasks.md` and `summary.md` are not written.
- The `createdAtUtc` tie-break is recorded **UNPROVEN**: control B1 stayed green
  at 2, 8 and 24 tied rows.
- Nothing measures a viewport narrower than 1500 on either list screen.
