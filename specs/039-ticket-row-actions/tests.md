# 039 — Reassign and Close from the row · evidence

Every figure here was observed. Nothing is asserted from memory.

---

## 1 · The runs

All 2026-09-06, from `src/wasl-web`.

| Command | Result |
|---|---|
| `./node_modules/.bin/vitest run` (whole frontend suite) | **49 files, 1147 tests, all passed** |
| `npx tsc -b` | clean, no output |
| `npm run lint` (eslint) | clean, no output |
| `npm run lint:css` (stylelint) | clean, no output |
| `npm run lint:i18n` | `Locale parity OK — ar, en · 5 namespaces · 457 keys compared.` |
| `npm run lint:tokens` | `check-semantic-tokens: clean across src/components, src/shell` |
| `npm run lint:types` | `✓ no hand-written domain types outside src/lib/api-types.provisional.ts` |
| `npm run lint:select` | `check-no-native-select: clean across src/components, src/features, src/shell` |

`039` adds **68** of those 1147, across five files — measured by running exactly those five:

```text
Test Files  5 passed (5)
     Tests  68 passed (68)
```

| File | Tests |
|---|---|
| `src/features/tickets/AssigneePanel.test.tsx` | 20 |
| `src/features/tickets/CloseTicketModal.test.tsx` | 14 |
| `src/features/tickets/rowActions.guards.test.ts` | 15 |
| `src/features/tickets/rowActions.test.tsx` | 8 |
| `src/components/Dropdown/menuSurfaceCap.test.tsx` | 11 |

**No backend file was touched.** No `dotnet` run is claimed. `039` is frontend-only by
scope, and it adds no endpoint and no contract change — every request it makes was already
frozen by `009`, `011` and `012`.

---

## 2 · The mock-up, measured in Chrome

`spec.md` §2 is the report; this is what produced it. Opened at 1443 × 900 and again at
1443 × 620 CSS px, driven through `evaluate_script`.

```text
panel, settled              { w: 308, h: 429 }        ← 305 mid-animation, taModal ends on scale(.99)
cap, viewport 622           max-height 278.254px, panel bottom 602, fold 622
flip, trigger top 470       bottom:40px, top:auto, panel 34…464, flippedAbove true
                            coversTrigger false at all four sampled positions
menu width                  214
close item colour           rgb(13, 38, 38)   = #0D2626
escalate                    disabled, title present
modal                       440 wide, max-height 435 vs 70vh = 435
modal children              86 / 280 / 69, only the middle overflow-y:auto
scrim                       position fixed, z-index 300, inset 0, parent #ta-modal-layer
scrim click                 stillOpenAfterScrimClick true
Escape                      closedByEsc true
duplicate field             before false · after «مكرّرة» true · after another reason false
notify checkbox             { inDialog: false, labelDisplay: "none", visible: false }
toast host                  fixed, top 24px, inset-inline-end 24px (computed left 24 under rtl), z 400, card 360
toast stack, 4 fired        [B, C, D] — oldest evicted, cap 3
toast roles                 success → status · info → status · warning → alert · error → alert
```

**The upward flip needed a taller document to reach.** At the shipped page height the whole
scroll range is 162px, so the trigger can never sit low enough in the viewport:

```text
scrollTo(0,   0) → scrollY 0     … scrollTo(0, 1400) → scrollY 162
```

Every sample reported `flippedAbove: false` with `maxHeight: "none"` or a downward cap. The
branch was reached only after injecting 1400px of padding, and then it worked. Recorded so
nobody reports "the flip works, I saw it" from a session that never ran it.

**The encoding.** The attachment arrived UTF-8-through-cp1252. Re-encoded through a reverse
cp1252 map: `chars: 31082 bytes: 31082 unmapped: 0`. Zero unmapped and the Arabic still has
holes — cp1252 has no code point for `0x81 0x8D 0x8F 0x90 0x9D`, and `0x81` is the second
byte of `ف`. Same class as `038` M-4. **The Arabic copy in this feature is written, not
transcribed.**

---

## 3 · A defect the tests did not have, reported from the running app

> «الـ reassign في جدول التيكت بيفتح خارج الجدول بعيد» — in the **English** interface, with
> a screenshot: the panel hanging off the right edge of the page, clipped.

**Cause.** `useMenuSurface` measures twice — once before the menu exists, once after. The
second pass is a `useLayoutEffect` with `[open, menuRef.current]` in its dependency array,
and **a dependency array is built at RENDER time while a ref attaches at COMMIT time**. On
the render that mounts the menu the dependency is still `null`, unchanged, so the effect
does not re-run and the geometry stays the one measured with no menu — `menuWidth` falls
back to `rect.width`, the trigger's 34px, against a real panel of 308.

**Why only English.** Under `rtl` the aligned edge is `rect.left`, which does not involve
the menu's width at all; under `ltr` it is `rect.right - menuWidth`, which is entirely
width. The RTL half was correct by arithmetic rather than by anything the code got right —
which is exactly why one language looked fine and the tests, all written in Arabic fixtures,
saw nothing.

**Why `031` never met it.** A `Dropdown` menu takes the trigger's width, so only the flip
depended on the second pass, and a flip is rare.

**The fix** is a third effect with no dependency array, guarded by a ref so it measures once
and stops. **The control:**

| | Result |
|---|---|
| `if (true) return;` in the new effect | **RED** — `expect(element).toHaveAttribute("data-left", "326")`, got the unfixed value |
| restored | 11 passed |

**And the first version of that test was worthless.** It used `renderHook`, assigned
`menuRef.current` by hand and called `rerender()` — which re-evaluates the dependency array
with the node in place, the one thing a real mount never does. It **passed with the fix
removed**. It is a real component now, mounting its menu only once `position` exists.
*The bug lives in an ORDER, so a test that supplies its own order measures nothing.*

---

## 4 · Negative controls — nine, each broken on purpose

Automated: patch, run `rowActions.guards.test.ts`, restore. Output verbatim.

```text
C1  AC-3   the danger class back on the close item          RED (1 failed)
C2  AC-17  a BR-1 transition map in the client              RED (1 failed)
C3  AC-28  the feature reaches for the toast timing table   RED (1 failed)
C4  AC-30  an inline svg                                    RED (1 failed)
C5  AC-31  a hex literal in the feature css                 RED (1 failed)
C6  AC-32  a physical property                              RED (1 failed)
C7  AC-34  the notify checkbox comes back                   RED (2 failed)
C8  AC-35  a second AssigneePanel in another file           RED (1 failed)
C9  control the comment stripper is neutered                STILL GREEN
```

**C9 is the one worth reading.** Replacing `stripComments` with `() => ''` left the whole
guard file green. The control that was supposed to catch that read:

```ts
expect(read('CloseTicketModal.tsx')).toContain('checkbox');
expect(stripComments(read('CloseTicketModal.tsx'))).not.toContain('checkbox');
```

Both halves are satisfied by an empty string, which is also what a broken stripper returns.
A second control was added — the stripped source must still contain `changeTicketStatus`,
`allowedTransitions`, and more than a third of the file's length — and C9 re-run:

```text
C9  RED (6 failed)
```

Then restored: **15 passed**. Every guard in that file has now been seen to fail.

**C8 is the cross-file scan, deliberately.** `037` C3 established why: a second `const` of
one name in ONE file is a compile error, so the compiler gets there first and an in-file
assertion can never fail. The defect that actually happened — `IconEye` in two files — is
the shape C8 reproduces.

---

## 5 · A pre-existing test-isolation leak, found by the workaround and not by the feature

The suite's first run this session died before any test executed:

```text
Test Files  44 failed (44)
     Tests  no tests
Error: The service was stopped: write EOF   (vite:esbuild)
```

**Forty-four failures and zero tests is not a red suite — it is a dead toolchain.** The
cause was resource contention (a leftover automation Chrome holding the machine); the
workaround was `--pool=forks --poolOptions.forks.singleFork`, one process for every file.

That workaround then produced failures that moved between identical runs: `iconCoverage`
once, `CustomerProfilePage` (21 tests, a screen neither lane had touched) on another,
`Modal` + `SideSheet` on both. **A failure set that moves between identical runs is the
environment, not the code.** Instrumented `src/test/setup.ts` with a temporary per-test
probe and the answer was one line:

```text
OVERFLOW-LEAK  src/features/customers/customerSheet.test.tsx :: «عميل جديد» opens the create sheet …
               (and every other test in that file)
```

`customerSheet.test.tsx` (`035`) leaves `document.body.style.overflow = 'hidden'` behind, so
in a shared process every later `Modal` and `SideSheet` captures `'hidden'` as the value to
restore and the page never unlocks — `expected 'hidden' not to be 'hidden'`.

**Not this feature's, and not fixed here.** It is invisible under the project's own
isolated `vitest run`, which is what CI uses and what §1 records green. Handed to the
customers lane as a finding rather than patched across a lane boundary mid-flight; the real
fix is either that file restoring what it changed, or `Modal`/`SideSheet` counting nested
locks.

**Two things in this file WERE mine and are fixed:** `menuSurfaceCap.test.tsx` blanked
`document.documentElement.dir` and wiped `document.body.innerHTML` in `afterEach`. Blanking
`dir` is not "putting it back" — `lib/direction.ts` writes `ar`/`en` there and the product
reads it — and wiping the body removes Testing Library's containers. Both restore now.

---

## 6 · A flake, and why the wait was raised rather than the parallelism lowered

`rowActions.test.tsx` failed once in a full parallel run and never alone:

```text
TestingLibraryElementError: Unable to find role="button" and name "Ticket actions"
```

The row had not arrived — not the trigger being absent. This file drives the whole list
screen and is the slowest in the suite (~15s alone); under the default pool it shares a
machine with eight other workers, and Testing Library's default `findBy` wait is one second.
Raised to five on that one query. Nothing here measures how fast a mock resolves.

Three consecutive full runs after the change: **49 files, 1147 tests, passed**.

---

## 7 · Two more assertions that were passing for the wrong reason

Both found while writing, both corrected in place:

**`AC-17`'s first version waited on `expect(confirm()).toBeDisabled()`.** The confirm is
disabled while the ticket is still *loading*, so that wait resolved on the pending state and
asserted nothing about the refusal — it passed against a modal that had not yet been told
the transition was illegal. It is `await screen.findByText(<the status>)` now.

**`menuSurfaceCap`'s "does NOT flip into the smaller of two bad options" never reached the
branch it named.** It placed the trigger at the top of an 800px viewport, where 706px remain
below, so the flip was never considered. Both halves have to be cramped: a 300px viewport,
166px below (under the threshold) and 100px above (less than below).

---

## 8 · What is NOT claimed

- **AC-13's cap is verified as arithmetic, not as paint.** jsdom performs no layout, so the
  rects and `offsetHeight`/`offsetWidth` are stubbed. That the panel actually renders inside
  the ceiling is CSS — `min(70vh, var(--menu-max-block-size, 100vh))` — and the source scan
  in `menuSurfaceCap.test.tsx` is what holds that half.
- **AC-29's Arabic was not reviewed by a native writer.** Q-8 in `11-open-questions.md` is
  still open — who writes and reviews the Arabic copy. The keys exist in both catalogues and
  parity passes; the *wording* is this lane's.
- **No screen was viewed in Arabic in a browser for this feature.** The mock-up was; the
  built screen was not. The Definition of Done asks for it and it is recorded unmet here
  rather than claimed.
- **The open-ticket count was never seen against a real server.** `countTickets` is mocked in
  every test. The fan-out's shape is verified; the numbers it would produce are not.
