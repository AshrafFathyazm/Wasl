# 029 — Tests and measurements

Every line below was **run**. Where something was not run, it says so and says why.

Commands, from `src/wasl-web/`:

```bash
./node_modules/.bin/tsc -b
./node_modules/.bin/vitest run
./node_modules/.bin/eslint .
./node_modules/.bin/stylelint "src/**/*.css"
node scripts/check-locale-parity.mjs
```

---

## 1 · Observed output

```text
tsc -b                       exit 0
vitest run                   Test Files  20 passed (20)
                             Tests      314 passed (314)
eslint .                     exit 0, no output
stylelint src/**/*.css       1 error — src/dev/TicketDetailPreview.module.css 38:3
                             custom-property-empty-line-before  (027's file, not this
                             feature's; see §4)
check-locale-parity.mjs      Locale parity OK — ar, en · 5 namespaces · 164 keys compared
```

This feature adds **76 tests** in three files: `loaderSystem.test.ts` (43),
`LoadersPreview.test.tsx` (25), `useDeferredBusy.test.ts` (8).

**The suite total does not reconcile to 217 + 76, and the difference is not this
feature's.** The run measured at the start of this work reported 217; the run above
reports 314, which is 21 more than 217 + 76. `031-frontend-dropdown` and `030` were being
written in the same tree at the same time and added tests of their own between the two
runs — see §6, which records what else moved underfoot. The 76 figure is the one this
feature is accountable for; the 314 is simply what the tree reports today.

---

## 2 · AC coverage

| AC | Test | Result |
|---|---|---|
| AC-1 | `component-inventory.md` carries the written reason; nine variants ship as one `Loader` | Met — reviewed, not automated |
| AC-2 | `loaderSystem.test.ts` › *the converge keyframe stops are identical in both files* | Pass, control 1 red |
| AC-3 | `loaderSystem.test.ts` › *AC-3* — one case per animated selector, plus the exemption-rot guard | Pass (14 cases), control 2 red |
| AC-4 | `loaderSystem.test.ts` › *every physical travel carries an explicit sign* | Pass, control 3 red |
| AC-5 | `loaderSystem.test.ts` › *the mark and the brand pulse never mirror* | Pass, control 4 red |
| AC-6 | `useDeferredBusy.test.ts` › *a 90ms round trip never renders the loader* | Pass |
| AC-7 | `useDeferredBusy.test.ts` › *a 160ms answer keeps the loader up past 400ms* | Pass |
| AC-8 | `check-locale-parity.mjs`; `LoadersPreview.test.tsx` › *an empty label is decorative* | Pass |
| AC-9 | `loaderSystem.test.ts` › *AC-9*, two cases | Pass, controls 6 + 7 red. **Partially met — see §4** |
| AC-10 | `Table` renders `Skeleton`; `Table.module.css` keeps no private one | Met |
| AC-11 | — | **Not met. Belongs to `031` — see §4** |
| AC-12 | `loaderSystem.test.ts` › *AC-12*, one case per shipped stylesheet | Pass, control 5 red. **Scope narrowed — see §4** |
| AC-13 | `LoadersPreview.test.tsx` (25) | **Automated half only. The human review is OPEN — see §3** |
| AC-14 | — | **Open. Depends on AC-13** |

---

## 3 · What was NOT run, and why

**The browser pass.** `/_preview/loaders` was never opened in a real browser from
this session. `chrome-devtools` refused to attach:

```text
The browser is already running for
C:\Users\lap-tech\.cache\chrome-devtools-mcp\chrome-profile.
Use --isolated to run multiple browser instances.
```

Another lane held the profile. The dev server itself was confirmed serving the route —
`curl -s -o /dev/null -w "%{http_code}" http://localhost:5175/_preview/loaders` → `200` —
so the route resolves, but **nothing was looked at**.

This matters more than usual here, because three of this feature's claims are
*visual* and no test in the repository can see them:

- that each shape reads as motion rather than as a static comma;
- that under `prefers-reduced-motion: reduce` each shape is *visibly present*, not
  merely un-animated — the reduce block was verified by reading the stylesheet, which
  proves a rule exists and not that it looks like anything;
- that in RTL the dots travel **toward** the node. `translateX` carrying
  `var(--ld-dir)` is asserted; the resulting direction on screen is not.

`AC-13` is a person looking at the page, and it stays open. `AC-14`, the Arabic pass,
depends on it and is open with it. **Neither is claimed.**

---

## 4 · Criteria recorded as partially met or reassigned

### AC-9 — colour and duration are tokenised, geometry is not

Asserted and controlled: zero colour literals in either loader stylesheet, and every
`animation` shorthand draws its duration from a `--motion-loader-*` token.

**Per-shape geometry stays literal.** `.mark` is 70×44, `.orbit` 28×28, `.bars` 27×18.
Each number belongs to one shape and appears once. Twenty tokens with one consumer each
is a token layer that documents nothing, and `tokens.css` note 11's own argument — an
invented token is indistinguishable from a real one — cuts the same way. The converge
geometry *was* tokenised, because four of its values are interdependent: the travel, the
overshoot, the container and the node all move together, and that relationship is worth a
name.

### AC-11 — the menu loader's ten-second end

**Not built, and it is not this feature's.** The criterion was written when `Select` was
a native `<select>`; `031` replaced it with a real `Dropdown` mid-flight. The ten-second
failure state needs a new prop and new behaviour on a component another lane is actively
writing. Specified in `design/loaders.md` §8 rows ③–⑥ for `031` to build against.

### AC-12 — scope is the shipped surface

The guard scans `src/components`, `src/shell`, `src/features` — the same scope the BR-8.8
literal-string lint rule uses. `src/dev` is excluded, and the exclusion is named rather
than silent: **two preview files currently declare their own waiting keyframes**, and one
of them is a `shimmer`, which `design/loaders.md` forbids by name.

```text
src/dev/TicketDetailPreview.module.css:798   @keyframes shimmer
src/dev/TicketListPreview.module.css:784     @keyframes sweep
src/dev/TicketListPreview.module.css:794     @keyframes sweep-rtl
src/dev/TicketListPreview.module.css:1340    @keyframes pulse
```

They belong to `026` and `027`, they are stripped from the production bundle, and they
are **follow-up, not silently in scope**. `sweep-rtl` is worth naming on its own: it is a
second hand-written copy of an animation for the other direction, which is exactly the
duplication `--ld-dir` exists to remove.

---

## 5 · Negative controls

**A guard that has never been seen to fail has not been verified.** Seven were run. Each
was applied, the suite was run, the failure was read, and the file was restored from a
backup taken immediately before.

| # | What was broken | Expected | Observed |
|---|---|---|---|
| 1 | `16%` → `12%` in the converge keyframe | AC-2 red | `× the converge keyframe stops are identical in both files` — 1 failed, 42 passed |
| 2 | Deleted the `.sweep` rule from the `reduce` block | AC-3 red | `× .sweep is given a resting state` — `.sweep animates but has no reduce rule and no exemption` |
| 3 | `translateX(calc(var(--loader-travel) * var(--ld-dir,1)))` → `translateX(30px)` | AC-4 red | `× every physical travel carries an explicit sign` |
| 4 | Added `transform: scaleX(var(--ld-dir,1))` to `.mark` | AC-5 red | `× the mark and the brand pulse never mirror` |
| 5 | Appended `@keyframes table-pulse` to `Table.module.css` | AC-12 red | `× Table.module.css declares no waiting keyframes` — `expected [ '@keyframes table-pulse' ] to deeply equal []` |
| 6 | `var(--accent-presence)` → `#4a9e96` | AC-9 red | `× Loader.module.css names no colour literal` |
| 7 | `var(--motion-loader-bars)` → `1.1s` | AC-9 red | `× every animation duration comes from a motion token` |

### Control 6 failed to fail on its first attempt, and that is the useful part

The first run of control 6 replaced `background-color: var(--teal-600);` — and the suite
stayed green at 43 passed.

The guard was not broken. **The control was.** Another lane had introduced
`--accent-presence: var(--teal-600)` and repointed the loader at it while this feature was
being built, so the string being replaced no longer existed, `String.replace` matched
nothing, and the file was never modified. A control that changes nothing passes, and it
reads exactly like a guard that works.

Re-run against the current text — with an explicit `if (n === s) throw` so a no-op control
can never again be mistaken for a passing one — it went red as designed.

**Every control since asserts that it actually changed the file before running the suite.**

### And the guard caught two defects in itself before it caught any in the CSS

The first run of `loaderSystem.test.ts` reported four failures. Two were real and two were
the test reading prose as code:

- `.sweep` was reported as having no static frame. It had one; the comment above it was
  being swallowed into the selector match and the whole rule discarded — **a false fail**.
- `Table.module.css` was reported as declaring `@keyframes table-pulse`. That string
  appears in a comment *saying the file no longer declares it* — **and this one was a
  false PASS waiting to happen**: a file that genuinely declared the keyframe and also
  mentioned it in prose would have been indistinguishable.

Both were one bug: regexing raw CSS. `stripComments()` now runs before either parse.
Recorded because it is the failure `12-delivery-log` names — *a measurement that names the
wrong thing is worse than no measurement, because it is believed* — and it happened inside
the guard written to prevent exactly that class of thing.

### One more measurement, verified rather than assumed

`useDeferredBusy.test.ts` needs `Date.now()` to advance with the fake timers, or the
400ms floor never expires and AC-7 passes for the wrong reason. Rather than assert this
from memory, it was probed:

```text
vi.useFakeTimers(); const a = Date.now();
vi.advanceTimersByTime(5000);  Date.now() - a
→ DATE_ADVANCED_BY: 5000
```

vitest's default `toFake` includes `Date` here, so no extra configuration is needed. The
header comment in that file originally described a configuration this project does not
use; it was corrected to the measured fact.

---

## 6 · What moved underfoot while this was being built

Three lanes were writing this tree at once, and two of the changes below invalidated
something this feature had already measured or written.

| What changed | Found how | Consequence |
|---|---|---|
| `Select/` deleted, `Dropdown/` added (`031`) | An edit failed with `ENOENT` on a file read an hour earlier | `loaders.md` §8 rewritten; `AC-11` reassigned to `031`; the `Select` half of this feature's contract change never shipped because the component ceased to exist |
| `var(--teal-600)` repointed to a new `--accent-presence` token | Negative control 6 passed when it should have failed | Control rewritten with a no-op assertion. The token itself is an improvement and was kept |
| ~21 tests added by other lanes | Suite total did not reconcile to 217 + 76 | Both figures reported separately in §1 |

None of these is a defect. They are recorded because **each one made a measurement say
something that was not true**, and in two cases the measurement still looked correct.
