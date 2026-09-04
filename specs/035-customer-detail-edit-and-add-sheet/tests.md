# `035` — measurements

Browser numbers were taken with Chrome driven over CDP against the live dev server,
signed in as the seeded Manager, at 1500×1000 with the sidebar expanded, in Arabic **and**
English.

---

## §7 — Row hover · delivered

Specified 2026-09-03 as CSS plus five constraints. It lands in the `Table` primitive, so
it applies to `/tickets`, `/customers`, and every table after them.

### Measured, both directions

```text
ar   dir rtl   border-collapse collapse   row height 62   cursor pointer
     hover     bg rgb(214,228,232)   rail rgb(159,180,188)  -3px 0 0 inset
     selected  bg rgb(243,243,251)   rail rgb(29,23,77)     -3px 0 0 inset
en   dir ltr   border-collapse collapse   row height 62   cursor pointer
     hover     bg rgb(214,228,232)   rail rgb(159,180,188)   3px 0 0 inset
     selected  bg rgb(243,243,251)   rail rgb(29,23,77)      3px 0 0 inset
both cells rgba(0,0,0,0) — transparent, so the ROW's fill is what shows through
```

Screenshots in both directions, third row hovered and fifth row given `aria-selected` by
hand: the rail lands on the **leading** edge — right in Arabic, left in English — on the
hovered row and on the selected one, and neither row changes height.

### The requirement contained one factual error, and it is load-bearing

> «الشريط inset 3px 0 0 بيظهر على الحافة البادئة (يمين في RTL **تلقائياً** لما الاتجاه
> مضبوط على الجدول)»

**`box-shadow` offsets are physical.** There is no logical form, and a shadow does not
flip with `direction` the way `inset-inline-start` does — a single `inset 3px 0 0` paints
the rail on the LEFT of an RTL table, at the row's **trailing** edge. So the sign is a
custom property set once per direction:

```css
.row              { --row-rail-x:  3px; }
[dir='rtl'] .row  { --row-rail-x: -3px; }
```

It is the only physical value in that stylesheet, and the reason is written beside it.

### `--surface-row-hover` was NOT repurposed — §7 said to, and §7 was wrong

The spec said to rewrite `--surface-row-hover` from `#FAFCFC` to the product owner's
`#D6E4E8`, on the assumption it was the table row's token. **Counting the call sites found
eleven:**

```text
1  the table row                      components/Table/Table.module.css
9  faint hovers on the ticket detail  menu items, panel rows, sibling rows
1  the segmented tab track            features/tickets/TicketFilterBar.module.css
```

Ten of them want the near-white. Rewriting the token would have restyled nine surfaces
nobody asked about — a change that looks like a bug in the ticket detail and traces back
to a table. The row got **four tokens of its own** (`--surface-table-row-hover`,
`--border-table-row-rail`, and the selected pair) and the old one keeps its value with an
honest description. **AC-18 and §7 are corrected in `spec.md`, not quietly worked
around.** Renaming `--surface-row-hover` is a separate cleanup with eleven call sites.

`#D6E4E8` and `#9FB4BC` were **not** in `tokens.css`. The nearest existing values are
`--neutral-200` (#dee5e7) and `--neutral-400` (#9fabb5), and the file's own note about
`--amber-50` already rules that a near-match is a second palette rather than a
refinement. They read as a desaturated teal and sit in that ramp as `--teal-100` and
`--teal-300`.

### The guard

`src/components/Table/tableRowHover.test.ts` — 12 assertions, one per constraint plus the
controls. jsdom draws no boxes, so the browser numbers above are **recorded**, not
asserted.

| Assertion | The defect it prevents |
|---|---|
| The hover is on `.row`, and `.row:hover .td` is gone | Eight cells lighting instead of one row |
| `border-collapse: collapse` on `.table` | The inset rail silently not painting |
| `--row-rail-x` is `3px`, and `-3px` under `[dir='rtl']` | The rail on the trailing edge in Arabic |
| **No** `padding`, size or `border` under **any** `:hover` in the file | The row jumping under the cursor. Scanned over every `:hover` rule, not just the row's |
| `transition: background-color`, not `background` | Animating a shorthand that includes `background-position` |
| `cursor: pointer` only on `.rowClickable` | A pointer promising a click that does nothing |
| The selected row's rule covers `:hover` too | Hover overriding the open row |
| No inline `style` or `backgroundColor` in `Table.tsx` | The requirement's last constraint: CSS cannot win against an inline background, and the fallback would be `mouseenter`/`mouseleave` |
| The two new hexes are in `tokens.css` and nowhere else | Colour loose in a component stylesheet |
| `--surface-row-hover` still reads `#fafcfc` | The repurposing above |

**Seen to fail — twice, on two different causes:**

1. **The guard's own helper was wrong.** `rule(css, '.row')` searched for the selector as
   a substring and took the next `{`, so it returned the body of `.row:last-child .td` —
   the rule that happens to mention `.row` first. Two assertions went red against a
   stylesheet that was correct. The selector now has to end where the brace begins. *A
   measurement that names the wrong thing is worse than none.*
2. **A deliberate control:** the hover was moved back to `.row:hover .td` with a
   `padding-block: 20px` added. **Four** assertions went red, including the size guard and
   the comment-stripping control. Restored, green again.

---

## §5 — `PUT /api/customers/{id}` · delivered

`017`'s frozen contract, built without changing it. `Customer` gains its second mutator
(`SupportUser.ChangeLanguage` was the first, in `014`).

```text
dotnet test tests/Wasl.Api.IntegrationTests --filter UpdateCustomerTests
  Passed!  Failed: 0, Passed: 18
```

**Two negative controls, both seen to fail:**

| Control | Result |
|---|---|
| Remove `c.Id != request.Id` from the duplicate pre-check | **2 failed**, including *"re-saving a customer with its own contacts is not a duplicate"*. Without it the endpoint answers `409` to every no-op save — the most common request it will ever get — and the failure is indistinguishable from a real conflict |
| Move the version check AFTER the duplicate rule | **1 failed** — *"a request that is both stale and duplicate answers stale"*. The other order tells a stale client to change its email; it does, and the next request is refused for being stale anyway. Two round trips to learn the first fact (`012`'s measurement) |

**The OpenAPI gate caught the thing it exists for.** `PUT /api/customers/{id}` was listed
in `OpenApiContractTests.NotBuiltYet` against `017-update-customer`; building it made
that entry stale, and the full run failed with *"this endpoint is built now, so its entry
in NotBuiltYet is stale and must be deleted — otherwise the comparison stops covering it
and nobody notices"*. **A filtered run would not have found it** — one more case of
`--filter` proving nothing about the suite.

```text
dotnet build --no-incremental   0 warnings, 0 errors
dotnet test                     189 + 26 + 438 = 653 passed
```

---

## §4.3 — the side sheet · delivered

One `SideSheet` shell, two contents: the row's quick view and the create form. It also
closes `030`'s recorded contradiction — a navy header at h56 in `10-shared-patterns.md`
against a **white** one in the newer spec, 250ms against 220ms — by ruling that the frame
wins.

**The row click reversed `033`'s choice**, and the quick view is what finally gives
`aria-selected` a producer: `035` §7 specified that state as *dead CSS on arrival*.

### It found a defect that had shipped and was invisible

**The customer list's name cell had no link.** `033` navigated with `onRowClick` alone,
and the `Table` primitive's own contract forbids that in words:

> `onRowClick` is a MOUSE convenience… The caller **MUST** put a real link in one cell —
> that is what a keyboard and a screen reader use.

So **a keyboard could not reach a customer profile at all**, and after the sheet landed
it would have been worse: the mouse gets a quick view and the keyboard gets nothing. The
name is a `<Link>` now, and a plain left click is taken over to open the sheet while
⌘/ctrl-click, middle-click, Enter and "open in new tab" all follow the `href`.

**Found by writing the assertion, not by reading the file** — the test that says "keeps
the name cell a real link" went red on its first run.

### Three things the screenshots caught that the tests could not

| Reported | Cause |
|---|---|
| Two stacked headers in the sheet | `chrome={false}` was never passed, so the form drew its own «رجوع» link and `<h2>` under the sheet's own title. **jsdom found both headings and no assertion cared which** |
| The panel opened on the wrong side | Both frames are Arabic and draw the panel at the **left** of the screen — which in an RTL page is `inset-inline-end`, not `inset-inline-start`. I read "left" as "start" |
| The slide flew across the screen | `translateX(-100%)` enters from the left in both directions. It is `100% * var(--ld-dir)` now, so the panel always enters from off its own edge |

### The field order was wrong, and presence assertions passed on it

Reported: *"دا الشكل الصحيح لاضافة عميل عكس الي انت عامله"*. `032` ordered the fields
name · email · phone · company · notes; the frame orders them **name · company · email ·
phone · notes**, which also puts the BR-4.1 hint immediately above the pair it governs
instead of three fields away from one of them.

**Every one of those fields was already on screen**, so a presence assertion passed on
the wrong layout — which is exactly what shipped. The new test asserts **DOM order**.

Helper text is page-only now: the routed screen has room to explain where a name shows
up, and the sheet is a fast path where five helper lines sit between the reader and
«حفظ». **The BR-4.1 hint stays in both** — it is the only thing on screen telling a
reader that one of the two contact fields is required, and the server refuses the form
without one.

### The catalogue had two shapes in one file

`customers.json` is **nested**, and keys added earlier in this session landed as flat
top-level entries beside the nested objects. They resolved — i18next falls back to a
joined lookup — but two shapes in one file is how the next person adds a key that
silently does not. Renested; parity 373 keys.

### Suites

```text
npx vitest run       33 files, 594 tests, all passed
npx tsc --noEmit     clean
npx eslint src       clean
npm run lint:i18n    ar, en · 5 namespaces · 373 keys
npx stylelint        clean on every file this feature touched
```

**Two guards went red and were right both times:** AC-12 refused `margin-block: 4px` on
the new divider (it is `var(--space-1)` now), and three tests were looking a field up by
its hard-coded English or Arabic label — they read the catalogue now, because a test that
hard-codes copy asserts the copy rather than the behaviour.

---

## Measured once Docker came back — and it found the `+966` defect

Five layout changes had accumulated with no browser behind them. All of it measured at
1500×900, Arabic, signed in as the seeded Manager.

```text
add sheet      panel x 0..600 (w 600, h 900)   dir rtl   docScrollsX false
               scrollers: 3, and NONE overflows — overflowsY false,
                          overflowsX false, scrollHeight − clientHeight = 0
               footer visible inside the panel, submit inside the footer
quick view     panel x 0..600                  1 scroller, no overflow
               rows marked aria-selected: 1
profile        switcher segments -> /customers/{id} and /customers/{id}/edit
               Edit button present and enabled
edit           prefilled from the read, id chip present, «حفظ التغييرات»
console errors none, on every screen
```

**The scrollbar reports are settled by that `by: 0`** — not by an argument. The
structural rewrite (flush flex body, one scroller, plain flex footer) holds.

### The `+966` order was a real defect, and the cause was not where I looked

A screenshot showed `5X XXX XXXX 966+` three times and I could not measure it. The
element **did** carry `dir="ltr"`, `Input` **did** forward it, and the placeholder string
was correct — I checked all three from the source and reported it as unverified rather
than guessing. Measured: **`phoneDir: "rtl"` on an element whose attribute said `ltr`.**

The cause is one rule in `Input.module.css`:

```css
.control:placeholder-shown { direction: inherit; }
```

Added deliberately, with a measurement behind it — an empty `dir="auto"` field falls back
to `ltr` and puts an Arabic placeholder against the wrong edge of an RTL form. But it was
**unscoped**, and **an author `direction` declaration beats the `dir` attribute**: `dir`
is a presentational hint and sits below author CSS in the cascade. So it also overrode
every field that pins its direction on purpose.

Scoped to `.control[dir='auto']:placeholder-shown`, which keeps both intents. Re-measured:
`phoneDir: "ltr"`, and the placeholder renders `+966 5X XXX XXXX`.

**`032` had already written the `dir="ltr"` and its reason on that field.** The attribute
was right the whole time and a rule two files away was quietly winning — which is why
reading the source could not find it and one measurement did.

### The save round trip, through the real UI

```text
PUT 200  {"fullName":"مُعدَّل 46585", …}
GET 200  {"fullName":"مُعدَّل 46585", …}   <- the refetch
GET 200  {"fullName":"مُعدَّل 46585", …}
landed on /customers/{id}   heading «مُعدَّل 46585»
```

`PUT` → invalidate → navigate → the profile shows the new name. Nothing seeded from the
write response.

## Still NOT verified, and not claimed
- **The frames draw a fixed `+966` prefix box.** `032` ruled against one with a reason: a
  static prefix makes a non-Saudi number unenterable while `POST /api/customers` accepts
  any parseable E.164 — a client narrowing its own API. Building it reverses that ruling,
  so it is the product owner's call.
- **The frame marks البريد الإلكتروني with a required asterisk.** BR-4.1 requires *one
  of* email or phone, and the server accepts phone-only. An asterisk the server does not
  enforce blocks a phone-only customer at the client. Left optional; raised.
- Nothing on any of these screens has been measured below 1500px.

---

## §4.2 — the edit screen, and the switcher · delivered

`/customers/:id/edit` on `017`'s frozen contract, plus the switcher Q-1 turned out to be
real, plus «تعديل» on the profile.

**It reuses the create form's Zod schema**, and that is a decision rather than a
shortcut: BR-4.1, BR-4.2 and BR-4.3 are the same rules on both endpoints and the server
enforces them from the same `ContactNormalisation`. A second schema would be a second
opinion about the same business rules, and the drift shows up as a form that refuses what
the server accepts — which is worse than the other way round, because nothing on the
server ever hears about the attempt.

**`expectedVersion` is deliberately NOT in the schema.** It is not something a reader
types; it comes from the READ, and it is re-read after every save because the contract
guarantees the response's `version` is immediately usable as the next one.

`409 concurrency-conflict` gets its own banner and its own control — **load the current
copy**, not retry — because it is the one failure on this screen that retyping cannot
fix. The client branches on `type`, never on `title` or `detail` (BR-8).

### Q-1 was answered, and my working assumption was wrong

The spec recorded the centred pill above the breadcrumb as *"the canvas's switcher — not
built"*, reasoning from `027`, whose frames carried a similar element that genuinely was
the design tool's artboard switcher. **It is product chrome.** Corrected in the spec with
the quotation that settled it, rather than quietly rewritten.

Built as **two segments with real targets** — details ⇄ edit. The frames show a third
label, «إضافة عميل», and it is **not** built: from `/customers/new` the other segment
would read «تفاصيل العميل» and have no customer to point at. A segment that leads nowhere
is the thing this feature refuses everywhere else. Raised as **Q-5**.

### Three guards went red, and all three were the guard being wrong

| Guard | What it caught | Resolution |
|---|---|---|
| AC-12 · undeclared token | `var(--font-mono, …)` in the new id chip | **The token does not exist**, and `032` had already ruled on it: index.html loads Plex Sans and Plex Sans Arabic only, and referencing a token that is not there "reads as though the system had a mono face when it does not". Now `font-family: monospace`, with `032`'s reason quoted |
| AC-8 · the fetcher list | `updateCustomer` broke an exact-list assertion | **The comment above it already argued for deleting the list** — *"a change detector rather than a guard… the shape is refused rather than the count fixed"* — and the list was still there. It failed on a feature that added a legitimate write, exactly as predicted. The list is gone; the shape refusal stays |
| `032` AC-1 · no Edit control | *"renders no Edit control — 017 is not built"* | The reason is gone, so the test asserts the **opposite** now: the control is real, so it must be enabled and must actually navigate. The rule it protected — *a disabled button is a promise about an endpoint* — is quoted in both the test and the view |

`AC-12` also refused `border-radius: 0` and `calc(var(--space-6) * -1)`. Both were the
guard, not the CSS — `0` is the absence of a radius and a `calc()` over tokens is
token-derived — and it was widened with a written reason, then **a control armed with
three real literals (one inside a `calc()`) caught all three.**

### The stale-comment sweep

`CreateCustomer.module.css` had grown **four duplicated comment blocks** — every rewrite
this session added a note without removing the one it replaced, so the file carried both
the superseded reasoning and the current one. Removed. A stale comment beside a correct
rule is the same defect as a stale test.

### Suites

```text
npx vitest run       34 files, 604 tests, all passed
npx tsc --noEmit     clean
npx eslint src       clean
npm run lint:i18n    ar, en · 5 namespaces · 381 keys
npx stylelint        clean on every file this feature added; the 2 remaining in
                     Customers.module.css predate it
```

---

## Still to do in this feature

- §4.1 — `/customers/:id` **is not rebuilt to the frame.** The switcher and «تعديل» are
  on it, and the regions the frame draws are the ones `032` already built — but the
  three-card contact strip, the two-column notes/record split, and the ticket history
  block (Q-2) have not been laid out to the frame's geometry
- The browser has verified **none** of this: Docker Desktop's Linux engine answers `500`
  to `docker start`, so there is no database, no API and no sign-in. Every layout claim
  in §4.2 and §4.3 is reasoned from the CSS, not measured
- `tasks.md` and `summary.md`
- **Q-5** — the switcher's third segment
