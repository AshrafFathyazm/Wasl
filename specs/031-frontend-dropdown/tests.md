# 031 — Dropdown · tests and evidence

Every command below was run. Output is pasted, not summarised from memory.

---

## 1 · The run

```text
### npx tsc -b
  (no output = clean)

### npx vitest run
 Test Files  19 passed (19)
      Tests  289 passed (289)
   Duration  29.00s

### npx eslint .
  (no output = clean)

### check-locale-parity
Locale parity OK — ar, en · 5 namespaces · 164 keys compared.
### check-semantic-tokens
check-semantic-tokens: clean across src/components, src/shell
### check-no-native-select
check-no-native-select: clean across src/components, src/features, src/shell
```

**289 tests, 21 of them new.** The suite was 217 when this feature started; the other 51
arrived from `029-loader-system` building in parallel in the same working tree.

### 1.1 · A full-suite run failed completely, twice, and it was not this feature

```text
 Test Files  16 failed (16)
      Tests  no tests
```

Sixteen files failing at COLLECT, with `no tests` — not one assertion ran. Running any one
of them alone passed immediately:

```text
 ✓ src/lib/formatters.test.ts (14 tests) 56ms
 Test Files  1 passed (1)
```

Cause: **two `vitest` processes on one machine**, mine and the other lane's, each spawning
a worker pool. This is the `--filter`-is-not-proof lesson from `CLAUDE.md` with the
polarity reversed — there, seven containers made a filtered run lie about the suite; here,
resource exhaustion made the SUITE lie about the code. The tell was identical in both:
*the failures did not match the change.* A collection failure in `formatters.test.ts`
cannot be caused by a dropdown.

**Recorded because the next person to see it will believe it.** The full run above was
taken when the machine was quiet, and it is the one that counts.

---

## 2 · Acceptance criteria → named tests

| AC | Test | Result |
|---|---|---|
| AC-1 | `scripts/check-no-native-select.mjs` | clean |
| AC-2 | `TEST-031-04` ×3 (sm/md/lg) | pass |
| AC-3 | `scripts/check-semantic-tokens.mjs` | clean — **after it found one** |
| AC-4 | `check-locale-parity` + `npx eslint .` | 164 keys, both locales |
| AC-5 | `TEST-031-01` — nine tests, one per binding plus the two Space cases | pass |
| AC-6 | `TEST-031-03` | pass |
| AC-7 | `TEST-031-01` — *Escape closes … AND returns focus* | pass |
| AC-8 | `TEST-031-07` + stylelint `property-disallowed-list` | pass |
| AC-9 | `TEST-031-02` | pass |
| AC-10 | **NOT TESTED — see §5** | open |
| AC-11 | `TEST-031-05` | pass |
| AC-12 | `CreateTicketPage.test.tsx`, `TicketListPage.test.tsx` | pass, assertions unchanged |
| AC-13 | `CustomerPicker` untouched; its tests pass unedited | pass |
| AC-14 | `tokens.css` note 11 | edited in the same change |
| AC-15 | §4 | recorded |
| AC-16 | **DEVIATION — see §5** | not met as written |

---

## 3 · Both gates were seen to FAIL before they were seen to pass

*A guard that has never been seen to fail has not been verified.* Neither of these was
broken on purpose to produce the failure — **both failed on their first run, against real
code, and each failure was a different kind.**

### 3.1 · `check-no-native-select` — a false positive, on its own changelog

```text
NATIVE <select> FOUND — 2.

  src\components\Dropdown\Dropdown.tsx:32
  src\features\tickets\TicketListPage.tsx:100
```

Both hits were **prose**: the sentences explaining that the native element had been
removed, with `` `<select>` `` inside backticks. A gate that fails on its own explanation
is a gate somebody disables within a week. Fixed by stripping backticked spans and comment
lines before matching — the same treatment the token script already had.

**This is the fifth tool in this project to produce a well-formed report about nothing**
(`CLAUDE.md`: the grep, the regex, the preview toggle, the measurement block, the build).
It is on the list because it was caught in the first minute rather than the fifth feature.

### 3.2 · `check-semantic-tokens` — a true positive, and the fix was a missing name

```text
PRIMITIVE TOKEN IN A COMPONENT — 1 found.

  src\components\Loader\Loader.module.css:588  --teal-600
```

One hit across the whole tree, in a file `029` had rewritten hours earlier. The line was
not careless — it is commented *"THE ONE TEAL IN THE SYSTEM. brand.md §4 — presence,
never outcome"* — and there was **no semantic token for "presence" to reach for.**

So the finding was the gap in the semantic layer, and the fix is the name:
`--accent-presence: var(--teal-600)`, with `Loader.module.css:588` pointed at it. Not an
allowlist entry, not a weakened regex. Re-run: clean.

### 3.3 · What the token gate does NOT cover, measured

```text
src/components/Input/Input.module.css:208    rgb(2…
src/components/Table/Table.module.css:30     rgb(1…
src/shell/Anchored.module.css:41             rgb(1…
src/shell/Sidebar.module.css:77              rgb(1…
src/shell/Sidebar.module.css:492             rgb(1…
```

Five raw colour literals, all older than this feature, in four files owned by others.
Widening the gate to catch them means either editing four files this feature has no
business in, or shipping a gate that is red on day one. Scope stated in the script's own
header and in AC-3 rather than narrowed quietly. **Finding, for whoever owns those files.**

---

## 4 · The Arabic pass — AC-15

`/_preview`, `lang=ar` `dir=rtl`, all twelve tiles plus the three sizes and the two
direction tiles.

| Checked | Result |
|---|---|
| Caret at the inline-end | Correct in both. It is a chevron-**down** rotated 180°, and a rotation is direction-agnostic — a chevron-end would have needed mirroring |
| Selected check mark | Inline-end in both |
| Chip `×` and the clear control | Inline-end in both |
| Menu aligned to the trigger | Correct in both, and **it takes no mirroring code** — the menu's width IS the trigger's width, so aligning the physical left edges aligns inline-start in `ltr` and inline-end in `rtl`. The one line that looks like a missing RTL branch is the one that makes it work |
| Arabic label inside an English interface | `<bdi>` holds it; no reordering |
| `+N` counter in `ar` | `+1`, Latin, via `formatNumber`. Asserted as well as looked at (`TEST-031-05`) |
| Option with a description | Two lines, both start at the inline-start edge |

---

## 5 · What is NOT met, stated plainly

**AC-16 — "the preview is rendered and reviewed BEFORE anything is wired" — was not met
in that order.** The component was built, migrated and tested first, and the `/_preview`
tiles were added after. The mitigation is real but it is not the same thing: the Abyan
design document is itself a rendered, interactive canvas that the product owner supplied
and approved, so the *design* was reviewed before any code. The *implementation* was not
reviewed in isolation before it was wired into three screens. Recorded rather than
back-dated.

**AC-10 — the flip above the trigger — has no test.** The logic is written and commented
(`useMenuSurface`, `FLIP_THRESHOLD`, and the deliberate second condition that refuses to
flip into the smaller of two cramped spaces). jsdom computes no layout: every rect is
zero, `window.innerHeight` is a constant, and `offsetHeight` is `0`. An assertion here
would pass against a function that always returns `flipped: false`, which is worse than no
assertion — it is `010`'s stable-sort problem exactly. Needs a real engine.

**One bug was found by a test rather than by reading, and it is the useful one.**
`TEST-031-03` — focus moving into the search field — failed while the menu was visibly on
screen with a visible search field. The effect that focuses it ran on the render where
`open` flipped true, and on that render the portal does not exist yet because
`useMenuSurface` has not measured. `searchRef.current` was `null`, the deps never changed
again, and nothing ever refocused. Fixed by adding `position` to the dependency list.
Nothing looked wrong; a keyboard user typed into the page.

---

## 6 · Two failures left behind, both in another lane's file

`npx stylelint` and `node scripts/check-no-domain-types.mjs` are **red**, and neither is
this feature's:

```text
src/dev/TicketDetailPreview.module.css
  38:3  ✖  Unexpected empty line before custom property

✗ ADR-011 §6 — 6 hand-written domain type(s):
  src/dev/TicketDetailPreview.tsx:102  [R1]  `type TicketStatus` …
  src/dev/TicketDetailPreview.tsx:109  [R1]  `type TicketPriority` …
  src/dev/TicketDetailPreview.tsx:110  [R2]  `type Channel` restates a contract enum …
  src/dev/TicketDetailPreview.tsx:111  [R1]  `type UserRole` …
  src/dev/TicketDetailPreview.tsx:123  [R1]  `interface Ticket` …
```

`TicketDetailPreview` is `027`'s, created by the other lane during this session. This
feature touched four lines of it — the `Select` import and the control that used it,
because deleting `Select` would otherwise have broken their build. The CSS file was never
opened here and the six type declarations are theirs.

**Not fixed, on purpose.** Reaching into another lane's in-flight file to satisfy a gate is
how two people produce one conflict; and the domain-type finding is a real one their
feature should answer, not one this feature should silence.
