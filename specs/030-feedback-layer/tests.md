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
| AC-10 | *does NOT close on a scrim click over unsaved input* | **PARTIAL — see gaps** |
| AC-11 | — | **Not met** — no panel URL round-trip |
| AC-12 | — | **Not met** — `SideSheet` breaks at 480px, not 768 |
| AC-13 | — | **Not met** — no loading panel variant |
| AC-14 | `lint:i18n` · every primitive takes labels as props | **Met** |
| AC-15 | `lint:tokens` clean · three undeclared fallbacks removed | **Met**, see below |
| AC-16 | *still renders every tone when the animation is gone* | **PARTIAL — see gaps** |
| AC-17 | — | **Not met** — no `/_preview/feedback` |
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
| A scrollbar on a form that fits | Traced to spacing, not to width. Header ~100px → 64, `--sheet-padding` 24 → 20, divider margins removed |
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
