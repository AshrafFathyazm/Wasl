# 038 — tests and evidence

Everything below was **run**. Nothing here is asserted from memory.

## The runs

| Command | Observed |
|---|---|
| `npx tsc --noEmit -p tsconfig.app.json` | clean (after one fix — see *Compiler findings*) |
| `npm run lint` | clean |
| `npm run lint:tokens` | `check-semantic-tokens: clean across src/components, src/shell` |
| `npm run lint:i18n` | `Locale parity OK — ar, en · 5 namespaces · 416 keys compared.` |
| `npx stylelint src/features/tickets/CreateTicket.module.css` | clean, exit 0 |
| `npx vitest run` (whole suite) | **`Test Files 44 passed (44)` · `Tests 1063 passed (1063)`** — see the attribution note below |

Before this feature the suite was 42 files / 1030 tests. **+2 files, +33 tests** — 1063.

**A LATER RUN OF THE SAME COMMAND RETURNED 1068, AND FIVE OF THOSE ARE NOT THIS
FEATURE'S.** `039-ticket-row-actions` is building in the same working tree and added
tests while this one was being verified. The number to attribute to `038` is **+33**,
measured at 11:42; the shared tree read 1068 at 11:53. Recorded rather than rounded,
because a count claimed for the wrong feature is exactly the attribution error
`20d7785` already made once in this repository with a bare `git commit`.

### The full run needed more heap than the default, and that is worth recording

The first whole-suite run died with a V8 out-of-memory inside a worker
(`ERR_IPC_CHANNEL_CLOSED`, `Channel closed`), not a test failure. The run that counts is:

```
NODE_OPTIONS=--max-old-space-size=6144 npx vitest run --pool=forks --poolOptions.forks.maxForks=2
Test Files  44 passed (44)
     Tests  1063 passed (1063)
  Duration  93.19s
```

This is the frontend's version of the lesson already in CLAUDE.md about seven SQL Server
containers: **the failure lands nowhere near the cause.** A crashed worker reports a
serialized IPC error, and the natural reading is that the last file touched broke
something.

## Acceptance criteria → the test that proves each

| AC | Test | File |
|---|---|---|
| AC-1 | *has every field enabled on first paint, with no customer selected* | `CreateTicketPage.test.tsx` |
| AC-1 | *renders no fieldset and no "select a customer first" note* | same |
| AC-2 | *shows no error when a required field is touched and left empty* | same |
| AC-3 | *clears one field's error as it is corrected, without a second submit* | same |
| AC-4 | *declares the 316px rail inside a 1100px media query, in the stylesheet* | `newTicketLayout.test.ts` |
| AC-4 | *sets NO grid property in an inline style anywhere on the page* | same |
| AC-6 | *renders one option per contract enum member, in contract order* | `newTicketControls.test.tsx` |
| AC-7 | *checks exactly one, and holds exactly one tab stop* | same |
| AC-7 | *moves the SELECTION with the arrow keys, not just focus* | same |
| AC-7 | *keeps a tab stop when NOTHING is selected* | same |
| AC-8 | *names the selected channel in words underneath* | same |
| AC-12 | *asks once per selection, for the four open statuses and five rows* | `CreateTicketPage.test.tsx` |
| AC-13 | *renders NO banner when the customer has none open* | same |
| AC-13 | *renders nothing at all when the count is zero* | `newTicketControls.test.tsx` |
| AC-14 | *says how many there are from totalCount, not from the rows it lists* | `CreateTicketPage.test.tsx` |
| AC-15 | *lists nothing until asked, and says so on the toggle* | `newTicketControls.test.tsx` |
| AC-16 | *links each listed ticket to its own route* | same |
| AC-17 | *is advisory — a failed check blocks nothing* | `CreateTicketPage.test.tsx` |
| AC-18 | *names every missing field and issues no request* | same |
| AC-19 | *moves focus to the CUSTOMER search, which is the first missing field* | same |
| AC-20 | *counts down as fields are filled, in the singular at one* | same |
| AC-23 | *uses no physical inset or margin side* | `newTicketLayout.test.ts` |
| AC-27 | *sends ONE request when submit is clicked twice in a row* | `CreateTicketPage.test.tsx` |
| AC-28 | *preserves subject, description, category and channel* | same |
| AC-29 | *renders all four, none checked, with Normal marked as the default* | `newTicketControls.test.tsx` |
| AC-30 | *omits `priority` entirely when it was never touched* | `CreateTicketPage.test.tsx` |
| AC-31 | *never imports or calls getSupportUsers* | `newTicketLayout.test.ts` |
| AC-33 | *asks once per selection, for the four open statuses and five rows* | `CreateTicketPage.test.tsx` |
| AC-34 | *offers «view all» when the count exceeds what it listed* | `newTicketControls.test.tsx` |
| AC-35 | *reads the created customer back and selects it, keeping the ticket fields* | `CreateTicketPage.test.tsx` |
| AC-37 | *renders WhatsApp from the shared module and defines no svg of its own* | `newTicketLayout.test.ts` |
| AC-39 | *carries an Idempotency-Key, keeps it on an identical retry, remints it after an edit* | `CreateTicketPage.test.tsx` |
| AC-40 | *asks TWO questions per selection — the open ones, and the previous ones* | `CreateTicketPage.test.tsx` |
| AC-41 | *shows previous tickets when there are no open ones — the closed-yesterday case* | same |
| AC-42 | *is NOT a status region — the warning owns that role* | `newTicketControls.test.tsx` |
| AC-43 | *shows the status on each row, because Resolved and Closed differ* | same |
| AC-44 | *makes no claim about WHEN a ticket was closed* | same |
| RTL | *reverses the horizontal arrows under RTL* | `newTicketControls.test.tsx` |

### Recorded as NOT MET

| AC | Why |
|---|---|
| **AC-5, AC-9, AC-10, AC-11, AC-21, AC-22** | **Rendered, not asserted.** These are paint and order claims — rail order, the company on a row, `<bdi>` isolation, the `0/200` counter, the fixed footer. jsdom computes no layout, so a passing test would prove the element exists, not that it is where the design puts it. They are checked by eye on the running screen, which is the honest instrument, and that check is **owed** — see *What has not been seen yet*. |
| **AC-24** | Same: the Arabic walk has not been performed on the running screen. The catalogue parity IS proven (`lint:i18n`, 416 keys), and that is a different claim from "it reads correctly in Arabic". |
| **AC-25, AC-26** | Proven only in the negative — no `<svg>` in this feature's files, and `Dropdown` is imported. That the *right* icon sits in each of the five channel cells is a visual claim. |
| **AC-32** | The counter's presence is not asserted; `maxLength={200}` is in the source. The number matters more than the element and it is right in the code. |
| **AC-36** | **Half met.** The sheet opens and the ticket fields survive it (asserted). The `getCustomer` read-back path is NOT driven end to end: reaching `onCreated` means submitting `035`'s own form inside the sheet, which is `035`'s test. The callback's body is read, not run. |

## Negative controls — every new guard was broken on purpose

A guard that has never been seen to fail has not been verified.

| # | What was broken | Observed | Restored |
|---|---|---|---|
| **C1** | Added `style={{ gridTemplateColumns: '1fr' }}` to the page's grid — the mock-up's own defect, planted | **2 failed**: *sets NO grid property in an inline style anywhere on the page*, *has no inline style attribute on the page at all* | ✅ |
| **C2** | Imported `getSupportUsers` into the page | **2 failed**: *never imports or calls getSupportUsers*, and the stripper control | ✅ |
| **C3** | `DuplicateWarning` counted `tickets.length` instead of `totalCount` | **1 failed**: *says how many there are from totalCount…* — `Unable to find … /This customer has 9 open tickets/` | ✅ |
| **C4** | `RadioGroup` made direction-blind (`const rtl = false`) | **1 failed**: *reverses the horizontal arrows under RTL* | ✅ |
| **C6** | `PRIOR_STATUSES` widened with `Open` | **1 failed**: *asks TWO questions per selection* — `expected [ Array(2) ] to deep equally contain ObjectContaining{…}` | ✅ |
| **C7** | The English copy changed to *"1 ticket closed in the last 14 days"* — the claim the API cannot support | **1 failed**: *makes no claim about WHEN a ticket was closed* | ✅ |

After all four, `git status` showed no stray modification and `npx vitest run
src/features/tickets` returned **223 passed (223)**.

### C5 — a control that ran itself, before it was written

AC-19 **failed on the first run of the new test file**, and the cause is worth keeping:

```
× moves focus to the CUSTOMER search, which is the first missing field
  → expect(element).toHaveFocus()
```

The page focused the customer search correctly, and React Hook Form then moved focus to
**subject** — `shouldFocusError` defaults to `true`, runs after the invalid callback, and
walks fields in REGISTRATION order. **That is spec M-3, the mock-up's own bug, arriving by
a completely different route**: the summary names the customer first and the caret lands
somewhere else. `shouldFocusError: false` is the fix, and it is load-bearing rather than
tidy-up — the criterion goes red without it.

Recorded here rather than counted as a passing control, because it was not planted.

## Compiler and guard findings during the build

| Finding | Detail |
|---|---|
| **A CSS-module class is `string \| undefined` in this project** | `Record<TicketPriority, string>` for the priority dots did not compile. Widened to `string \| undefined`, matching `TicketBadges`' own map — the property that matters is that the record is **exhaustive over the union**, so a new priority is a build error rather than a missing dot |
| **`IconChevron` came off `NOT_YET_CONSUMED`** | `iconCoverage.test.ts` went red naming it: *these are rendered somewhere and must come off the list*. That is the second half of `037`'s guard doing exactly its job, and the second icon to come off the list in two days |
| **`IconChevron` points FORWARD and mirrors** | So it is wrong as a back arrow in both languages — right is forward in English, and the RTL mirror makes it left, which is forward in Arabic. The head is a **breadcrumb** instead, with the chevron between the link and the title, where the mirror is correct. It also deleted the mock-up's separate vertical rule |
| **`stylelint` requires range notation** | `@media (min-width: 1100px)` → `@media (width >= 1100px)`. Same query |
| **`lint:css` is red on `main` and this feature did not make it so** | 19 errors, **18 of them in `TicketDetail.module.css`, `TicketFilterBar.module.css` and `TicketList.module.css`**, all pre-existing and owned elsewhere. One was mine and is fixed. Recorded rather than silently worked around: a gate that is red before you start is a gate everybody has learned to ignore, which is precisely the state `031` found `lint:tokens` in |

## Contract differences observed

None new. `POST /api/tickets` still returns an absolute `Location`
(`http://localhost:5272/api/tickets/{id}`) where the contract promises a relative one —
`024` recorded it and `toAppPath` still parses both. Unresolved, and not resolved here.

## What had not been seen yet — CLOSED, see *The visual walk* below

~~**The running screen has not been walked, in either language.**~~ **Walked 2026-09-06.** The dev server started and
the browser session used to measure the mock-up was gone by then, so every paint criterion
in the *NOT MET* table above is owed. This is stated rather than glossed: the last thing
this repository learned about measurement is that **a well-formed report about nothing is
worse than no report**, and a green unit suite is exactly that for a layout claim.

## The amendment run — R-4b, 2026-09-06

Added after the feature was otherwise complete, on a question from the product owner:
*why can a closed ticket not change status again?*

| Command | Observed |
|---|---|
| `npx tsc --noEmit -p tsconfig.app.json` | clean |
| `npx eslint` over this feature's files | clean |
| `npm run lint:i18n` | `Locale parity OK — ar, en · 5 namespaces · 453 keys compared.` |
| `npx stylelint src/features/tickets/CreateTicket.module.css` | clean, exit 0 |
| whole suite | **`Test Files 49 passed (49)` · `Tests 1145 passed (1145)`** |

**The 1145 is NOT this feature's number.** `039-ticket-row-actions` landed several files
in the same tree between the two runs — `CloseTicketModal.tsx`, `menuSurfaceCap.test.tsx`,
`AssigneePanel.tsx`, `Avatar.tsx` and their tests. `038` accounts for **+39** over the
1030 baseline: 33 at first delivery and 6 more here.

### `IconHistory` came off `NOT_YET_CONSUMED`

The whole-suite run went red on one test, by design:

```
× AC-10 — the coverage list is exact in both directions > lists nothing that is actually consumed
  → these are rendered somewhere and must come off the list: IconHistory
```

**Third icon to come off that list in two days** — `IconSort`, `IconChevron`, now
`IconHistory` — and none of the three was noticed by a person. The guard went red and
named the icon each time. This is `037`'s second-half assertion earning its place three
times over.

### Two lint errors that are not this feature's

`npm run lint` reports two `no-restricted-syntax` (BR-8.8) failures, both in `039`'s new
files: `src/components/Dropdown/menuSurfaceCap.test.tsx:240` and
`src/features/tickets/CloseTicketModal.tsx:218`. Running `eslint` over this feature's own
files is clean. Recorded rather than fixed — they belong to the lane that wrote them.

---

## The visual walk — performed 2026-09-06, against the running app

Chrome over CDP, dev server on `:5181`, API on `:5272`, signed in as
`manager@wasl.local`, real seeded data (99 customers). **This closes the seven criteria
recorded NOT MET above.** Every figure below was read out of the live DOM, not from a
screenshot.

### Layout — AC-4, AC-5, AC-22

| At 1443px (Arabic, `dir=rtl`) | Observed |
|---|---|
| `gridTemplateColumns` | **`696px 316px`** — two tracks, rail exactly 316 |
| Rail physical position | `left: 71`, main `left: 403` → **rail is on the physical LEFT**, which is inline-start under RTL |
| `position` of the rail | `sticky` |
| Rail block order | «التوجيه» → القناة → التصنيف → الأولوية → الإسناد — **channel, category, priority, assignment** |
| Footer | `footer.top === scroller.bottom` and the scroller scrolls → **the form scrolls under a fixed footer** |

| At 1002px | Observed |
|---|---|
| `gridTemplateColumns` | **`806.4px`** — one track |
| Rail | `position: static`, `top: 850` against main's `152` → **stacked below** |
| `document.body.scrollWidth > innerWidth` | **false** — no horizontal overflow |

**A worry that measurement dismissed.** The rail is 544px against a 458px visible
scroller — taller than the viewport, which is the classic broken sticky sidebar whose
bottom can never be scrolled to. Measured rather than assumed: at `scrollTop = max` the
rail's bottom is 595 against the scroller's 611, so **it is reachable**. The clipping
visible in a mid-scroll screenshot is a scroll position, not a defect.

### Content — AC-9, AC-10, AC-11, AC-21, AC-32

| Claim | Observed |
|---|---|
| Result row carries company | `LLina Farah ec7 · cec7d05d8@example.com · Northwind Logistics` |
| A customer with **no email** | `ahmed · +201092940946` — the phone fills in, and **no empty separator** |
| A customer with **no company** | renders without a trailing dot |
| Selected card | name · email · company · «Change» |
| `<bdi>` in the card | **3** — name, email, company each isolated |
| Counter and cap | `0/200`, `maxlength="200"` |

### The two history regions — AC-13, AC-14, AC-34, AC-40, AC-41

Driven against real data rather than fixtures.

| Customer | open / prior | Rendered |
|---|---|---|
| **Layla Hassan** | 28 / 4 | Amber banner «لدى هذا العميل **28** تذكرة مفتوحة…», 5 rows + «عرض الكل»; quiet line «**4** تذاكر سابقة», 3 rows + «عرض الكل» |
| **ahmed** | 0 / 2 | **No banner at all**, quiet line only: «لدى هذا العميل **تذكرتان سابقتان** — راجعهما قبل إنشاء ثالثة» |

**The second row is the whole reason R-4b exists**, seen working: a customer with nothing
open and two closed tickets. Before the amendment this screen showed that customer
nothing at all.

`28` renders the Arabic `_many` form («تذكرة»), `4` the `_few` («تذاكر»), `2` the **dual**
(«تذكرتان»). Three different plural categories, all correct, which is what
`lint:i18n`'s parity check cannot tell you.

### The failed submit — AC-18, AC-19, AC-20, AC-24

Submitted empty, in Arabic:

```
summary  «5 حقول ناقصة: العميل، الموضوع، الوصف، القناة، التصنيف»
focus    document.activeElement.id === "nt-customer-search"   ✅
```

**AC-19 confirmed on the real screen**, in the language it matters most in: the summary
names the customer first and the caret goes there. The mock-up names it first and focuses
the subject.

### Result

| Was | Now |
|---|---|
| AC-5, AC-9, AC-10, AC-11, AC-21, AC-22, AC-24 — **NOT MET** | **MET**, by the walk above |

**AC-10 was RE-OPENED the same day** — see *A second, independent walk* at the foot of
this file. Only its first clause (the card shows name, email, company and «تغيير») was
exercised; the second («تغيير» returns to the search **with the term empty**) is false,
measured and confirmed at the source. The row above is left as written, with the
disproof beside it.
| AC-25, AC-26, AC-32 — *proven only in the negative* | **MET** — five channel icons render, `Dropdown` renders for category and assignment, counter reads `0/200` |

Still not met: **AC-36** (the `getCustomer` read-back after a sheet create is still not
driven end to end — unchanged).

**AC-36 was CLOSED the same day**, by the second walk — `POST /api/customers` followed
by `GET /api/customers/{id}`, read off the network.

### One weakness found, and it is copy rather than code

With no channel chosen the hint line reads **«اختر…» / "Choose…"** — it reuses
`tickets:new.choose`, the generic dropdown placeholder. It is not wrong, but the line's
job is to name the channel, and before a choice is made it says nothing specific. A key of
its own would read better. Not fixed here: it is a copy decision, and the product owner
writes the Arabic (Q-8).

## A second, independent walk — 2026-09-06, later the same day

Run without knowledge of the section above, which was written into this file by
another session while this one was working in the same tree. It reproduces that walk
almost exactly, which is worth having: two instruments, two operators, one screen. It
also **closes AC-36** and **reopens AC-10**.

Playwright over Chrome, dev server on `:5182`, API on `:5272` (already running,
`/health` `200`, database `Healthy`), signed in through the real login form as
`manager@wasl.local`, real seeded data. `preferredLanguage` for that user is `ar`, so
the screen came up in Arabic and RTL without any switch — `014`'s rule that the login
switcher does not survive sign-in is why that matters.

### The instrument had to be fixed before it measured anything

The first version selected on `[class*="CreateTicket_"]` — the production CSS-Modules
shape. **Vite in dev emits `_name_hash_line`**, so every selector matched zero elements
and every geometry came back `null` while the script ran green to completion. It would
have produced a well-formed report about nothing, which is the failure this repository
has recorded five times.

The hash is derived at runtime now, and the run **throws** if it cannot be found rather
than continuing with empty selectors — `008`'s query-counter rule. Four further
controls, each answering a question the claim beside it cannot answer alone:

| Control | Why it exists | Observed |
|---|---|---|
| **A** — a selector that must not resolve | the tool must be able to report absence | `null` |
| **B** — the stylesheet's own hash | see above; the run aborts without it | `1xv97` |
| **C** — no `CreateTicketPreview` class on the page | `/_preview/create-ticket` is `024`'s hand-written copy, own `COPY_AR`, native `<select>`, untouched since `c5c7376`. Walking it would measure the superseded design — the defect `027` deleted its v2 preview for | `previewModulePresent: false` |
| **D** — the counter must **change** | «renders `0/200`» is satisfied by a hard-coded string | `0/200` → `200/200` |
| **E** — the scroller must **move** | «the footer did not move» is trivially true on a page that never scrolled | `scrollTop` `0` → `303` |

### What it measured

| AC | Observed | Verdict |
|---|---|---|
| **AC-5** | rail, in document order: القناة → التصنيف → الأولوية → الإسناد, the last one's control `disabled` («بلا إسناد») | agrees |
| **AC-9** | with company `أ · أروى الدوسري 344 · c344591bb@example.com · مجموعة النخيل`; without company `K · Karim Fouad 90a · c90ae7713@example.com` — **no dangling separator on either** | agrees |
| **AC-11** | 3 `<bdi>`; the Latin address computes `direction: ltr`, `unicode-bidi: isolate` inside the RTL line | agrees |
| **AC-21 / AC-32** | `0/200` → `200/200`, exactly **200** characters accepted from a 250-character paste | agrees |
| **AC-22** | footer `top` **499 before and 499 after** while the scroller moved 0 → 303 | agrees |
| **AC-24** | `dir=rtl`, `lang=ar`, **zero** key-shaped strings in the rendered text, **zero** console errors across the whole walk | agrees |
| **AC-25** | 5 cells, 5 `aria-label`s (بريد إلكتروني · واتساب · محادثة مباشرة · رسالة نصية · نموذج ويب), 5 icons, **5 distinct geometries** | agrees |
| **AC-26** | `document.querySelectorAll('select').length === 0`; 2 dropdowns, 2 radiogroups | agrees |
| layout | 1440 → `708px 316px`, main and rail tops within 40px → side by side; 1024 → `844px`, stacked. **`grid.getAttribute('style')` is `null` at both** | agrees |

The `708` against the other walk's `696` is the viewport: 1440 here, 1443 there.

**One mechanism is described differently and both descriptions are right.** The footer's
computed `position` is **`static`**, not `fixed`. It does not scroll because it sits
outside `.scroll` and `AppShell` moves the scrolling inside — which is what the code
comment says. The behaviour AC-22 asks for is present; the word *fixed* describes the
result, not the property.

### AC-36 — CLOSED

Left open by the earlier walk. Driven end to end, with a CSPRNG discriminator rather
than a slice of a time-ordered id (`008` matched the wrong row and `007` collided on a
unique index doing the latter).

Created `مقياس cec69ff7` / `walk-cec69ff7@example.com` / `شركة cec69ff7` through
«عميل جديد» → «حفظ العميل». **The proof is the network, not the card** — a card showing
the right email is equally consistent with the create response being reused:

```
POST /api/customers
GET  /api/customers/01a076b2-b176-7d8a-8e33-7183362f130b
GET  /api/tickets?…&customerId=01a076b2-…&status=New&status=Open&…
GET  /api/tickets?…&customerId=01a076b2-…&status=Resolved&status=Closed
```

The `GET` by id follows the `POST`, and the card then renders the three values as three
`<bdi>`s. **AC-36 is met.** (This wrote one customer row to the local demo database.)

### AC-10 — REOPENED, and it is a real defect

The section above records AC-10 as **MET** on this evidence:

> Selected card | name · email · company · «Change»

That is the criterion's **first clause**. The whole of AC-10 is:

> The selected card shows name, email, company and «تغيير»; **«تغيير» returns to the
> search with the term empty**

The second clause was not exercised. Driven here — clicking the button **by its text**,
because the first attempt clicked `customerHead button` and hit «عميل جديد», opened the
create sheet, and reported the search box missing, which is what a covering sheet looks
like:

| After «تغيير» | Observed | Expected |
|---|---|---|
| search returns | `true` | `true` |
| `#nt-customer-search` value | **`أروى الدوسري 344`** | empty |

Confirmed at the source, so it is not an artefact of the driver:

- `CustomerPicker.tsx:157` — «تغيير» is `onClick={onClear}`.
- `CreateTicketPage.tsx:488` — `onClear` runs `setSelected(null)` and
  `form.setValue('customerId', '')`. **It never calls `setTerm('')`.**
- `CustomerPicker.tsx:189` — `onTermChange('')` exists and is wired to **Escape only**.

So the mechanism is built and one path does not call it. **No test covers this**: a grep
for «تغيير», `AC-10` and `onClear` across `CreateTicketPage.test.tsx` and
`newTicketControls.test.tsx` returns nothing.

**This is the repository's own recorded failure mode, one level up.** `CLAUDE.md` puts it
as *«`errors[field]` with one entry is not a content assertion — it is a shape
assertion»*: counting the entry proves the envelope, only reading the string proves the
message. Here a criterion with two clauses was marked met on the first, and the first is
the one a screenshot answers.

AC-10 is **NOT MET**. The fix is one line in `onClear`, and it needs a test in the same
change, or the next walk finds it again.
