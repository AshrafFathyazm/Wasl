# 030 — The Feedback Layer · evidence

**Run 2026-09-05.** Everything below is pasted from a command that actually ran. Where a
command was not run, it says so and says which criteria are therefore unverified.

---

## 1 · The runs

| Command | Result |
|---|---|
| `dotnet build` | `Build succeeded. 0 Warning(s) 0 Error(s)` · 7.31s |
| `dotnet test tests/Wasl.Domain.Tests` | `Passed! Failed: 0, Passed: 189, Skipped: 0, Total: 189` |
| `dotnet test tests/Wasl.Api.IntegrationTests` | `Passed! Failed: 0, Passed: 457, Skipped: 0, Total: 457` · 2m |
| `npm run test` | `Test Files 38 passed (38)` · `Tests 655 passed (655)` |
| `npm run build` | `✓ built in 1.21s` |
| `npm run lint` | clean (eslint, no output) |
| `npm run lint:tokens` | `check-semantic-tokens: clean across src/components, src/shell` |
| `npm run lint:i18n` | `Locale parity OK — ar, en · 5 namespaces · 392 keys compared` |
| `npm run lint:select` | `check-no-native-select: clean across src/components, src/features, src/shell` |

**The backend commands are recorded but they do not measure this feature.** `030` is
frontend-only; they ran because the working tree also carries another lane's in-flight
`036b` work, and a green backend is what says this feature did not break it.

**`npm run lint:css` is RED, with 17 errors, and none of them are this feature's.** They
sit in `TicketList.module.css`, `TicketDetail.module.css`, `TicketFilterBar.module.css`,
`Customers.module.css`, `TablePager.module.css` and `base.css` — all pre-existing, and a
count over this feature's own files returns **0**. Recorded rather than fixed: it is
someone's task, not a silent pass.

**`npm run lint:types` is RED, with 4 findings, and none of them are this feature's** —
`customers.api.ts` ×3 and `TicketListPage.tsx` ×1, files this feature did not touch.

### The intermittent that was found and then removed

The frontend suite went **red exactly once in five runs**, and the reporter did not name
the failing test. Six runs of `ToastHost.test.tsx` alone never reproduced it — the
signature of a load-dependent flake rather than a defect.

The cause was in the harness, not the product. `ToastHost.test.tsx` ran under
`vi.useFakeTimers({ shouldAdvanceTime: true })`, which lets **wall-clock time advance the
fake clock**: the real milliseconds burned by every `await` accumulate on top of each
`advanceTimersByTime`, so a margin like *alive at 3900, gone at 4100* around a 4000ms
timer becomes a question about how busy the machine is.

`shouldAdvanceTime` was there because `userEvent` inserts real timers between the parts of
a click, and under a frozen clock every click hung to the 20s timeout — fifteen did on the
first run, reading as a deadlock in the host. `delay: null` was tried and **did not fix
it**: fourteen still hung. The file now uses `fireEvent`, which is synchronous and uses no
timers at all, so the clock only moves through `tick()`.

Five consecutive full-suite runs after the change:

```
run 1: Tests 653 passed (653)
run 2: Tests 653 passed (653)
run 3: Tests 653 passed (653)
run 4: Tests 653 passed (653)
run 5: Tests 653 passed (653)
```

---

## 2 · Acceptance criteria

| AC | Test | Result |
|---|---|---|
| AC-1 | — | **Met by substitution, recorded.** See below |
| AC-2 | `design/feedback-layer.md` §7 — 11 rows, each ruled | **Met** |
| AC-3 | `styles/nearMatch.test.ts` (4 tests) | **Met**, value changed by ruling |
| AC-4 | `ToastHost.test.ts` *gives success and info role=status* / *gives error and warning role=alert* | **Met** — both pairs |
| AC-5 | *NEVER dismisses an error on its own* (60s advanced) | **Met** |
| AC-6 | *shows three and evicts the OLDEST when a fourth arrives* | **Met** — asserts identity |
| AC-7 | *refreshes the existing card with ×2 instead of stacking a copy* | **Met** — one node, `×2`, then `×3` |
| AC-8 | *pauses the countdown while the pointer is on the card* · *pauses on FOCUS too* | **Met** — both |
| AC-9 | `Modal.test.tsx` *keeps Tab inside it* · *returns focus to whatever opened it* | **Met** |
| AC-10 | *does NOT close on a scrim click…* · *does NOT close on Escape either* · *asks, when the caller supplies the question* · *LEAVES A WAY OUT* | **Met** — 2026-09-06, see §8 |
| AC-11 | `customerSheet.test.tsx` — *030 AC-11 — the quick view is deep-linkable* (4 tests) | **Met in part** — open/close round-trips; the tab half has no tabs to assert |
| AC-12 | `SideSheet.test.tsx` — *030 AC-12* (3 tests, source scan) | **Met** |
| AC-13 | — | **Not met** — no loading panel variant |
| AC-14 | `lint:i18n` · every primitive takes labels as props | **Met** |
| AC-15 | `lint:tokens` clean · three undeclared fallbacks removed | **Met**, see below |
| AC-16 | *still renders every tone when the animation is gone* | **PARTIAL — see gaps** |
| AC-17 | `/_preview/feedback` exists | **Not met** — built AFTER the consumers were rewired, which is the half the criterion is about |
| AC-18 | §4 below | **Partial** — findings recorded |

### AC-1 — met by substitution, and the substitution is the finding

The criterion asks for `Toasts Modals Panels.dc.html` in the repository **byte-exact with
readable Arabic**. That did not happen and cannot: the file was supplied twice and arrived
identically corrupted both times, because the channel reads UTF-8 as Latin-1 and drops
every byte in `0x80–0x9F` — which is `ف ق ك ل م ن ه و ي` and every diacritic.

What was vendored instead:

- **`docs/sdd/design/feedback/wasl-feedback-spec.ascii.md`** — the same document re-issued
  as pure 7-bit ASCII. Measured after the copy: `bytes: 18206  max: 0x7c  above7F: 0`.
  Arabic rides as `\uXXXX`; all 18 strings were decoded through `JSON.parse` and compared
  against the screenshots.
- **Eight rendered screenshots** of the original, §01 through §05, which is what made §04
  readable at all.
- **`docs/sdd/design/feedback-layer.md`**, authored from both.

**The fix was a format, not a channel** — and the same delivery closed the identical note
that had been open in `loaders.md` since 2026-08-31.

### AC-3 — met, and the value it names was superseded

AC-3 says the one scrim is `.45`. The ruling on 2026-09-05 made it **`.40`**, on evidence
AC-3's author did not have: `Sidebar.module.css` had been painting `40%` since the sidebar
learned to collapse, so `.40` was never a fifth answer — it was the one already shipping.
The criterion was right about the *shape* (one value, guarded by a test) and the ruling
only moved which value it is.

`nearMatch.test.ts` guards both halves, **broken deliberately in the real tree and
restored**:

| Control | Result |
|---|---|
| `rgba(13, 38, 38, 0.45)` put back into `SideSheet.module.css` | `× holds exactly ONE scrim` — `expected [ Array(1) ] to deeply equal []` |
| `cubic-bezier(0.2, 0.7, 0.3, 1)` put back into `SideSheet.module.css` | `× holds no copy of the source document's easing` — same shape |
| both restored | `Tests 4 passed (4)` |

Its own scanner control failed first and was fixed: it asserted `.45` vanishes from the
stripped `tokens.css`, and **that failed against correct code** —
`--motion-loader-ease`, `--motion-loader-ease-sweep`, `--ease-in` and
`--leading-ar-heading` all legitimately contain `.45`. The control is a prose *sentence*
now, which is unambiguously a comment.

### AC-15 — met, and it found three fallbacks that always won

`lint:tokens` was clean *before* this check and still missed them, because a fallback is a
raw value wearing a token's clothes and it passes any grep for `var(--`:

| Written | Declared anywhere? |
|---|---|
| `var(--modal-shadow, 0 12px 32px rgb(13 38 38 / 12%))` | **no** |
| `var(--sheet-shadow, 0 0 40px rgb(13 38 38 / 18%))` (`035`'s) | **no** |
| `var(--type-card-title, 16px)` | **no** |

All three literals were the real values on every render. `--shadow-lg`, `--sheet-shadow`
and `--type-card-title` are now declared, and `tokens.css`'s *"one elevation,
deliberately"* note is answered in place rather than contradicted silently.

---

## 3 · The negative controls

**Nine, each producing a distinct red, each restored.** A guard that has never been seen
to fail has not been verified.

| # | What was broken | Red |
|---|---|---|
| 1 | `TOAST_MS.error: null` → `4000` | 1 — *NEVER dismisses an error on its own* |
| 2 | `interrupts` → `false` (one role for every tone) | **4** — the `status`/`alert` split |
| 3 | de-duplication disabled (`existing = -1`) | 1 — the `×2` assertion |
| 4 | `MAX_VISIBLE` 3 → 99 | 1 — the eviction |
| 5 | `onFocusCapture` → no-op | 1 — *pauses on FOCUS too* |
| 6 | destructive focus → the footer's **second** control | 1 — *opens with focus on CANCEL* |
| 7 | scrim closes over unsaved input | 1 — *does NOT close on a scrim click* |
| 8 | `.45` scrim reintroduced | 1 — *holds exactly ONE scrim* |
| 9 | `.2,.7,.3,1` easing reintroduced | 1 — *holds no copy of the source's easing* |

Control 6 is the one that mattered: **it was not a control, it was a real defect the test
caught.** `Modal` focused the last focusable control in the panel, on the reasoning that
cancel sits at the far end — and in a `[cancel, delete]` footer the far end is **delete**.
It would have shipped a confirmation dialog that opens with the destructive action under
the Return key, which is the precise thing the prop exists to prevent and which looks
identical on screen to the correct behaviour. It asks the **footer** now, because position
in the panel does not identify a button.

---

## 4 · The Arabic pass — AC-18

**Partial, and by screenshot rather than by a session at the keyboard.** What was observed,
from the product owner's own captures of `/customers` with the add sheet open:

| Finding | Outcome |
|---|---|
| The sheet renders at the **inline-end** edge under `dir="rtl"` — the left of the screen | Correct, and `035` records shipping it on the wrong side once |
| The duplicated contact rule appeared **three times** on one failing form | Removed; §1.6, *never two surfaces for one event* |
| A scrollbar on a form that fits | Traced to spacing, not to width. Header ~100px → 64, `--sheet-padding` 24 → 20, divider margins removed. **The 64 is now 72** — see below |
| «الاسم الكامل مطلوب» under an **untouched** empty field | `mode: 'onSubmit'` + `reValidateMode: 'onBlur'` |
| Latin runs (`+966 5X XXX XXXX`, `#4821`) | Isolated `dir="ltr"`, as the primitives already did |

**Not observed, and therefore not claimed:** no toast, no modal and no dismissal path was
seen rendered in Arabic. jsdom paints nothing, so the suite cannot stand in for it. The
`×2` counter and the toast's 3px stripe both flip with the reading direction and **both
are unverified on screen**.

---

## 5 · The five that fail silently

| Check | Result |
|---|---|
| Filtered indexes kept their filter | **N/A** — this feature adds no schema |
| Every mutation wrote one audit row | **N/A** — no command; the wiring only re-routes existing writes' failures |
| i18n key parity | **Ran.** `392 keys compared`, 11 new keys, `en` and `ar` |
| The Arabic pass | §4 above — **partial, findings recorded** |
| Generated OpenAPI matches `contracts/` | **N/A** — `030` has no `contracts/`, and it touches no endpoint |

---

## 6 · Gaps

| # | Gap | Why |
|---|---|---|
| G-1 | **AC-10 is half-met.** A modal over unsaved input refuses the scrim; **`Escape` still closes it**, and a test asserts that it does | AC-10 warns this is "the likely half-fix" and it is exactly what shipped. The two source statements disagree: §3's behaviour line puts the *except* on all three dismissal paths, while §8 rule 6 names **only** the scrim. Not resolved by guessing — **it needs a ruling** |
| G-2 | AC-11, AC-12, AC-13 unmet | The three **panel** criteria. `SideSheet` exists but has no URL round-trip, no tabbed variant, no loading variant, and breaks at 480px rather than 768. §5 of the design of record specifies all four variants; none is built |
| G-3 | AC-16 is half-met | Every surface carries a `prefers-reduced-motion` block, and one test asserts the toast still renders when nothing animates. **jsdom applies no media queries**, so the CSS branch itself is unasserted on all three surfaces |
| G-4 | AC-17 unmet | There is no `/_preview/feedback`, and the consumers were rewired without one. `027` VOIDed its own preview criterion for a different reason; this one is simply not done |
| G-5 | `Modal` sizes `md` and `lg` have **no consumer** | Proven by tests, which is honest and is not the same as proven in the product |
| G-6 | The 70vh cap and every measurement | jsdom has no layout. **Nothing in this suite has seen any of these three surfaces drawn** |

---

## 7 · Second pass — 2026-09-05, after the first report

Three criteria were closed and one guard was answered. Re-measured:

| Command | Result |
|---|---|
| `npm run test -- --exclude "**/iconKeyline.test.ts"` | `Test Files 38 passed (38)` · `Tests 662 passed (662)` |
| `npm run lint` · `lint:tokens` · `lint:i18n` | clean |

### AC-12 — closed, and the number it had was not a breakpoint

`SideSheet` broke at **480px**, and 480 is the smallest rung of the width ladder
(`--panel-w-sm`), not a breakpoint. The two were unrelated numbers spelled the same, and
the sheet spent the whole **481–768 band** rendering as a 480px column against a viewport
barely wider than itself — on a tablet in portrait, a panel with a 288px strip of dimmed
list beside it.

Asserted from the source, because jsdom applies no media queries: `matchMedia` is a stub
and a test that mounted the sheet at a pretend width would be asserting the stub. Three
tests, with a stripper control.

**One comment in that test was wrong and was corrected before it shipped.** It said the
media query beats the ladder classes on *specificity*; they are all single-class selectors
at identical specificity, and it wins on **source order** (line 287 against 94–102).
Recorded because it is fragile in a way specificity would not be — reordering the file, or
a bundler that hoists media queries, changes the answer silently.

### AC-11 — closed in part

The quick view lived in `useState`, so it could not be linked to, could not survive a
reload, and closed on a Back press the reader had every reason to expect would close it.
It is `?open=<id>` now — a search parameter and not a route segment, because
`/customers/:id` is the full profile and a segment here would be a second URL for the same
record showing less of it.

Four tests: opens from a URL with no click, writes the id on open, leaves a **clean** URL
on close (asserted as empty, not as "does not contain the id" — the second passes on
`?open=`), and keeps the reader's filters across an open/close.

**The control ran by accident and is the more convincing for it.** A `git checkout --` to
undo a deliberate break also reverted the change itself, and the four tests went red
together: *opens straight from a URL*, *writes the row into the URL*, *leaves a CLEAN
url*, *keeps the filters*.

**The tab half of AC-11 is not asserted and is not claimed.** This sheet has no tabs; §5's
tabbed variant is unbuilt, and a test for a tab that does not exist would be a green row
standing for nothing.

### AC-17 — still unmet, and the preview exists anyway

`/_preview/feedback` renders the five tones statically side by side, the live host with
its three stack rules on their own controls (`×2`, the eviction, the 10s hold), the three
modal sizes and the destructive variant, under an `rtl`/`ltr` toggle.

**It does not close AC-17.** The criterion is *"reviewed before anything is wired"*, and
the consumers were rewired first. It also draws no panel variants, because none are built
and `027` established that a preview must never draw a component that does not exist.

**It was built for AC-18.** The Arabic pass has no other way to happen: jsdom paints
nothing, and 662 green tests have not seen a stripe, a `×2` counter or a modal in either
direction.

### A third lane appeared in the tree, and its guard found a real defect in this feature

`specs/037-icon-system/`, `iconGeometry.ts` and `iconKeyline.test.ts` are untracked work
in progress from another lane. Its guard measures every icon against the 16-unit keyline
(4…20), and it caught **both icons this feature added**:

```
IconTriangleAlert reaches 0.50 units outside the keyline — x 3.50…20.50
IconCircleInfo    reaches 1.00 units outside the keyline — x 3.00…21.00, y 3.00…21.00
```

Both fixed: the triangle redrawn to `M12 4.5L4 19h16L12 4.5z`, and the circle to `r="8"`,
which is what `IconCircleX` and `IconResolved` already use. **`IconCircleInfo` was drawn at
`r="9"` to mirror `IconAlert` exactly — and `IconAlert` is one of the icons that guard
finds outside the keyline, so mirroring it copied the defect.** Half a unit is invisible
next to a 1.5 stroke; reading the path would not have found either.

**Seven icons still fail that guard and none of them is this feature's** — `IconCopy`,
`IconAlert`, `IconAssign`, `IconClosed`, `IconWhatsapp`, `IconSms`, `IconFilter`. They are
`037`'s to resolve.

**`npm run build` is RED, and not on this feature's code.** `iconGeometry.ts` — untracked,
`037`'s — carries 14 type errors. Counted: `tsc` reports 14, and **0** outside that file.
Not fixed here; it is another lane's file mid-build.

---

## 8 · Third pass — 2026-09-06. What other lanes changed under this feature

Four lanes are in the tree now: this one (committed at `4392790`), `037-icon-system`
(committed at `0ea888f`), `038-new-ticket-redesign` and `039-ticket-row-actions` (both
untracked). Re-measured against what they left:

| Command | Result |
|---|---|
| `npm run test` | `Tests 1145 passed (1145)` on a clean run |
| `npm run test -- nearMatch` | `4 passed` — AC-3's guard still holds |
| `--scrim` · `--toast-width` · `--modal-w-*` · `--panel-w-*` · `--shadow-lg` · `--sheet-shadow` · `--type-card-title` · `--state-warning-fill` · `--sheet-padding` | all present, one declaration each |

**One test fails across runs and it is not this feature's:** *renders view, reassign, a
disabled escalate, a rule and close*, in `rowActions.test.tsx` — `039`'s untracked work in
progress. `customerSheet.test.tsx` failed once under full-suite load and has not recurred
in three subsequent runs; it passes 20/20 in isolation.

### The badge is 40px again, and this file's 64 was stale

`037` moved `.badge` from **32 back to 40** on 2026-09-06, with the reason written in
`SideSheet.module.css`: the icon instruction specifies a 40px circle carrying a 20px
glyph, and at 32 a 20px glyph leaves 6px of ring and stops reading as a badge.

**That partly reverses this feature's own change and it is right.** The header complaint
of 2026-09-05 was ~100px of chrome, and the badge was never the main cause — 36px of that
came from `--space-4` block padding on both sides. `--sheet-head-padding-block` (18px) is
what fixed it and is untouched; the badge buys back 8px, not the 36.

So the recorded number moves: **~100 → 64 → 72.** Left as a correction rather than an edit,
because the 64 was measured and true when written.

**Nothing else of this feature's was disturbed.** `icons-added.tsx` was deleted and folded
into `icons.tsx`; both icons this feature added came across, and `Toast.tsx`'s import was
re-pointed by that lane rather than left broken.

### AC-10 — closed 2026-09-06, and a consumer settled it rather than an argument

The gap recorded as **G-1** is closed. It was left open because the source contradicts
itself — §3's behaviour line puts the *except* on all three dismissal paths, §8 rule 6
names only the scrim — and guessing between two readings of a design document is not a
ruling.

**What settled it was `039` building on the component.** `CloseTicketModal` holds a
500-character close reason in a `Textarea` and sets `unsavedInput`, with a comment reading
the flag exactly as shipped: *"it is exactly 'the scrim does not close it'"*. Their tests
contain **zero** occurrences of `Escape`. So a reader typed a note, pressed Escape by
reflex, and lost it with no question asked.

That is not a partial protection, it is the wrong half: **Escape is the more reflexive of
the two.** A stray click on a scrim takes aim; a reflex keypress does not.

| | |
|---|---|
| Guarded | `Escape`, scrim click — the two a reader triggers without meaning to |
| Not guarded | the ×, the footer — controls the reader had to aim at |
| With no `onDismissAttempt` | **inert**, never a silent close |

Both paths route through one function now, because the half-fix happened precisely by
their being written in two places and only one getting the guard.

**The old test asserted the defect.** *"still closes on Escape and on the × over unsaved
input"* — with a comment arguing it separated *"the scrim does not close it"* from
*"nothing does"*. The argument was sound and the test was pointed at the wrong path; the
replacement keeps it by asserting the **×** still closes, which is the real "there is a way
out" claim.

| Control | Result |
|---|---|
| Escape allowed to close over unsaved input again | 2 red — *does NOT close on Escape either*, *asks, when the caller supplies the question* |
| restored | `12 passed` |
| `039`'s own suite, against the change | `14 passed` — nothing of theirs breaks |
