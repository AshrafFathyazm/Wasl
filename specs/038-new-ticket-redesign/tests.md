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

## What has not been seen yet

**The running screen has not been walked, in either language.** The dev server started and
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
