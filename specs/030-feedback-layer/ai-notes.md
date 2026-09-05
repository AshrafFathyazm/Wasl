# 030 — AI notes

**No agents were dispatched for this feature.** `tasks.md` was never written — `030` went
from an approved spec straight to implementation on 2026-09-05, when the product owner
ruled the nine disagreements and authorised the build in one sitting. That is a deviation
from the working agreement and it is recorded here rather than backfilled: a `tasks.md`
written after the fact is a description of what happened wearing the clothes of a plan.

What follows is the same accounting applied to the assistant's own output, because the
rule the section exists for — **reading is not verifying** — does not depend on who wrote
the code.

---

## Accepted, with the command that verified each

| Output | Verified by | Result |
|---|---|---|
| `Toast` restyle — white card, 3px stripe, four tones, `role` per tone | `npm run test -- ToastHost` | 18 passed |
| `ToastHost` — stack, timing table, `×2`, `useToast()` | same, plus 4 negative controls | each control produced a distinct red |
| `Modal` | `npm run test -- Modal` | 10 passed, plus 2 controls |
| `nearMatch.test.ts` | `npm run test -- nearMatch`, then both values reintroduced into `SideSheet.module.css` | 4 passed; each reintroduction red; restored green |
| `SideSheet` `size` / `scrim` props | `npm run test -- SideSheet` | 13 passed — 9 for the blocking variant, 4 new for the non-blocking one |
| The eight wired §1 rows | `npm run test` | 655 passed (38 files) |
| The ASCII specs, after vendoring | `node` byte scan on the copied files | `18206 / max 0x7c / 0 above 7F` and `15709 / max 0x7d / 0 above 7F` |
| The 18 Arabic strings | `JSON.parse` on each `\uXXXX` value, compared to the screenshots | all 18 decoded and matched |

---

## Rejected, and why

| Proposed | Rejected because |
|---|---|
| Rendering the `403` toast inline on `TicketDetailPage`, before the host existed | It would have been a second placement implementation that `030` deletes. Deferred until the host was approved — and said so at the time rather than half-building it |
| A `danger` colour passed to `Button` as a prop | The destructive button also carries a rule the caller must not opt out of. A `ButtonType` can be paired with `Modal`'s `destructive`; a colour cannot |
| Sharing `focusableIn` between `Modal` and `SideSheet` | Two callers is not a library, and the roving-tabindex case is subtle enough that a shared helper would grow options. Duplicated with the reason written in both |
| Guessing AC-10's reading | The source contradicts itself. Recorded as a gap needing a ruling |
| Changing `Input`'s label→field gap from 8px to 6px | The spacing ruling was about the sheet; `Input` is a shared primitive used by every form in the product. Product-wide change, not this feature's call |

---

## Corrected after being written, not before

Four things were written, run, and found wrong. Each is recorded because the correction is
the useful part:

1. **`Modal`'s destructive focus.** *Focus the last focusable control* — and in a
   `[cancel, delete]` footer the last is **delete**. Caught by the test, not by review.
2. **`nearMatch`'s own scanner control.** It asserted `.45` vanishes from the stripped
   `tokens.css`, and failed against correct code: four unrelated tokens legitimately
   contain `.45`. Changed to a prose sentence.
3. **The toast tests' clock.** `shouldAdvanceTime: true` made the margins load-dependent;
   one red run in five. `delay: null` did not fix it either. `fireEvent` did.
4. **`onError: onWriteError` passed bare to react-query.** It hands `(error, variables)`,
   so `variables` landed in the new `retry` parameter — and because `onError` constrains
   the mutation's variable type, the inference poisoned three unrelated `mutate()` calls.
   Six type errors from two lines, all caught by `tsc`.

---

## What was not verified

- **Nothing was seen drawn.** jsdom has no layout and applies no media queries.
- **The Arabic pass is by screenshot**, and none of the three new surfaces appears in one.
- **`npm run lint:css` and `npm run lint:types` are red**, entirely on files this feature
  did not touch. Counted and named in `tests.md` rather than reported as a pass.
