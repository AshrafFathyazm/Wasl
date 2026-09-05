# 037 — Icon system · evidence

Every figure here was observed. Nothing is asserted from memory.

---

## 1 · The runs

| Command | Result | When |
|---|---|---|
| `npx vitest run` (whole frontend suite) | **42 files, 1000 tests, all passed** — 32.66s | 2026-09-05 |
| `npm run lint` | clean, no output | 2026-09-05 |
| `npm run build` (`tsc -b && vite build`) | `✓ built in 1.03s` | 2026-09-05 |
| `npx tsc -p tsconfig.app.json --noEmit` | clean | 2026-09-05 |

`037` adds **338** of those 1000, across four files:

```text
✓ src/icons/iconCoverage.test.ts     (5 tests)
✓ src/icons/iconKeyline.test.ts     (80 tests)
✓ src/icons/iconRtl.test.tsx        (26 tests)
✓ src/icons/iconRules.test.tsx     (227 tests)
```

**No backend file was touched**, so no `dotnet` run is claimed. `037` is frontend-only by
scope (§8).

---

## 2 · TEST-037-01 first, and it was RED against the set as it stood

The build order the product owner set was the measuring tool before the icons. Run against
`icons.tsx` + `icons-added.tsx` as they were, with no icon changed:

```text
 Tests  9 failed | 37 passed (46)
```

The nine, verbatim from the failure messages:

```text
IconAlert          reaches 1.00 units outside the keyline — x 3.00…21.00, y 3.00…21.00
IconAssign         reaches 0.50 units outside the keyline — x 4.00…20.00, y 4.80…20.50
IconCircleInfo     reaches 1.00 units outside the keyline — x 3.00…21.00, y 3.00…21.00
IconClosed         reaches 0.50 units outside the keyline — x 4.50…19.50, y 3.50…20.00
IconCopy           reaches 1.00 units outside the keyline — x 3.00…20.00, y 3.00…20.00
IconFilter         reaches 0.50 units outside the keyline — x 3.50…20.50, y 7.00…17.00
IconSms            reaches 1.00 units outside the keyline — x 6.50…17.50, y 3.00…21.00
IconTriangleAlert  reaches 0.50 units outside the keyline — x 3.50…20.50, y 4.00…19.00
IconWhatsapp       reaches 0.08 units outside the keyline — x 4.00…20.08, y 3.92…20.00
```

`icons.md` Rule 2 — the 16-unit keyline — is one of the two rules the set's whole
signature rests on, and nearly a quarter of the set had been violating it with a green
build. **A rule with no guard is a preference.**

---

## 3 · The tool lied once, and the correction is the useful part

### 3.1 The defect

The first version of the bbox tool tokenised path arguments with a plain number regex.
**SVG elliptical-arc flags are single characters and may be glued to the number after
them:**

```text
a2.5 2.5 0 003.5 6      is   rx=2.5 ry=2.5 rot=0 laf=0 sf=0 x=3.5 y=6
```

A number regex reads `003.5` as **one** token, so the command yields five arguments
instead of seven and every coordinate after it lands in the wrong slot.

| Icon | v1 said | Truth |
|---|---|---|
| `copy` | begins at x = 6 | x = 3.5 |
| `trash` | inside the keyline | 0.5 units outside |
| `bell` | inside the keyline | 0.45 units outside |
| doc set total | 39 outside | **41 outside** |

Nothing errored. The report was well-formed and about nothing — the failure mode CLAUDE.md
names: *a measurement that names the wrong thing is worse than no measurement, because it
is believed.*

### 3.2 The controls that now run before any figure is read — AC-2

Rewritten with real cubic/quadratic extrema (derivative roots) and centre-parameterised
arcs sampled at 1°. Four controls, all observed passing:

| Control | Expected | Observed |
|---|---|---|
| full r8 circle at 12,12 as two arcs | `4, 4, 20, 20` | `4, 4, 20, 20` |
| **the compact-flag path — the exact v1 defect** | `x0 = 3.5` | `3.5` |
| `M4 4H20V20H4Z` | `4, 4, 20, 20` | `4, 4, 20, 20` |
| `M4 12C4 2 20 2 20 12`, a cubic bulging past both endpoints | `y0 = 4.5` | `4.5` |

Plus three refusals, all observed: `pathPoints('')` throws `no points`, `bboxOf` with no
geometry throws `nothing to measure`, `extractIcons` on a file with no icons throws
`matched nothing`. This is `008`'s query-counter rule — **a measurement that reports
nothing satisfies every "must be inside the box" assertion ever written.**

### 3.3 A second claim of mine was wrong, and solving it beat sampling it

The spec's first revision called `IconWhatsapp`'s 0.08 and `IconRetry`'s 0.01
*"arc-sampling noise, not violations"*. **Both are real ink.** Each arc's centre was solved
in closed form rather than sampled again:

| Icon | Centre, solved | Extreme | Verdict |
|---|---|---|---|
| `IconWhatsapp` | (12.081, 11.919) — not (12, 12) | rightmost x = **20.081**, and the 5.783 rad sweep covers it | real; **fails AC-1** |
| `IconRetry` | (12, 12.013) | lowest y = **20.013** | real; the 0.05 tolerance absorbs it |

**Sampling can only ever under-report a curve's extreme, never invent one**, so "the tool
is imprecise" was never available as an explanation for an overhang it *found*. The claim
was reasoned rather than measured. Corrected in the spec in place, with the disproof kept
beside it.

---

## 4 · The negative controls — every guard seen to fail

| # | What was broken | Guard | Observed |
|---|---|---|---|
| C1 | `IconSearch` pushed 0.2 units past the keyline (`r 6.25 → 6.5`, `cy 10.5 → 10.3`) | AC-1 | **RED**, and only that icon: `× 'IconSearch' ('icons.tsx')`, every other icon green |
| C2 | `fill="currentColor"` put back on `IconEscalate`'s node | AC-3 | **RED** twice — the module-wide attribute scan and `IconEscalate carries no fill of its own`. Every other icon green |
| C3 | second `export const IconEye` appended to `icons.tsx` | AC-6 | **INVALID — see below** |
| C3b | `src/components/Badge/StrayIcon.tsx` declaring `IconEye` | AC-6 | **RED**, naming the file: `icons declared outside the module: components\Badge\StrayIcon.tsx` |
| C4 | `IconTag` removed from the documented flip list | AC-8 | **RED** twice — the set comparison, and `names twenty in the document's own list` |

All four restored; the suite returned to `4 files, 338 tests, all passed`.

### C3 did not prove what it was written to prove, and that is a finding

Appending a second `export const IconEye` to the same file produced:

```text
 Test Files  1 failed (1)
      Tests  no tests
```

**The file never loaded.** A duplicate `const` in one module is a compile error, so the
test's import failed at transform time and the assertion never ran. AC-6's first
assertion — *declares no name twice* — therefore **cannot be seen to fail for the reason
it was written**, because the compiler gets there first. It is kept as a statement of
intent, and the compiler is the actual enforcer.

**The assertion that matters is the second one**, and C3b is its control: the real defect
`037` found was `IconEye` declared in **two different files**, which compiles happily and
served two different drawings — `r 2.4` to `TicketListPage.tsx`, `r 2.5` to `Input.tsx` —
under one import name for several features. C3b reproduces exactly that shape and goes
red.

### The comment strippers carry their own control

`029` and `027` each shipped a guard that went red on its own prose. Both source scans here
strip comments first, and a test asserts the stripper actually ran — it removes a planted
`fill="currentColor"` from a comment, keeps the code either side, and leaves the module
with icons still in it. A green scan of nothing is the thing being prevented.

---

## 5 · The normalisation, measured on the OUTPUT

N-1 scales each icon about (12,12) by `s = min(1, 8 / R)`.

**The check that matters is on the emitted geometry, not the input.** Re-measuring all 74
generated icons (63 document + 11 retained) after transformation:

```text
icons emitted: 74 | still outside keyline: 0
```

| N-1 over the document's 63 | Count |
|---|---|
| untouched, `s = 1` | **22** |
| `s ≈ 0.80` | 6 |
| `s ≈ 0.85` | 12 |
| `s ≈ 0.90` | 20 |
| `s ≈ 0.95` | 3 |

Extremes: `assign` 0.800 (its ink ran x 2 → 21.7), `article` 0.988. Nothing collapses.

**Why `min(1, 8/R)` and not `min(1, 16/span)`:** `key` spans 15.5 units — inside a 16-unit
keyline by span — and still breaks it, because its ink sits low (y 5.5 … 21). A span-based
factor leaves it there. Measured, not argued.

Retained (D) icons that needed scaling: `IconAlert` 0.889, `IconClosed` 0.941,
`IconTriangleAlert` 0.941, `IconWhatsapp` 0.990.

---

## 6 · AC-11 — rendered and looked at, in both languages

A harness page was generated from the **built module's own markup**, parsed out of
`icons.tsx` rather than retyped, and rendered in Chrome at DPR 1: all 73 at 18px, all 73 at
16px, a real nav row in `dir=ltr` and `dir=rtl` with Arabic labels, and the 21 mirrored
glyphs shown in both directions.

**Observed:**

- Nothing reads as broken, unfinished, or disabled at 18px — `icons.md`'s own acceptance
  question, and the answer is no.
- The RTL nav row places icons on the right and `IconSignOut`'s arrow points **left**;
  the same icon points **right** in LTR. The one CSS rule replaces nineteen that were
  never written.
- The 21-glyph mirror strip differs visibly between the two directions, glyph for glyph.
- `IconStatus` reads as a **target** — two concentric rings — exactly the change of
  character N-3 was predicted to cause. It is legible; it is not what the document drew.

### Q-6 — the specific question, answered by magnifying the real raster

The product owner narrowed AC-11 for `settings` vs `filter` to one question: **at 18px
with stroke 1.5, does an r2 node read as a RING, or fill in and read as a solid dot?**

Scaling the SVG would re-render the vector and answer a different question, so each icon
was rasterised at its true 16 / 18 / 24px into a canvas and that **raster** magnified ×10
with `imageSmoothingEnabled = false`.

| Size | Observed |
|---|---|
| 24px | ring, hole unambiguous |
| **18px** | **RING** — a distinctly lighter core survives inside a near-black annulus |
| 16px | borderline; the core is still lighter but close to filled |

Arithmetic agrees: at 18px one unit is 0.75px, so an r2 ring with a 1.5-unit stroke has an
outer radius of 2.06px and an inner radius of 0.94px — a hole about 1.9px across.

**Outcome: the RING branch. The pre-authorised fallback is NOT triggered and
`IconSettings` keeps the document's slider form.**

Two things worth recording beyond the question as asked:

1. **The two glyphs do not converge even on the losing branch.** The premise was that if
   the nodes filled in, *"the only remaining difference is bar length"*. Rendered, that
   understates it: `settings` is three **full-width** tracks with marks at three different
   x positions, `filter` is three **centred** bars at 16 / 11 / 5 with no marks at all. The
   silhouettes differ in width, in symmetry, and in mark count. Had the ring filled, they
   would still not have read as one mark — so the fallback would have been the wrong
   remedy for a problem that was not going to occur.
2. **16px is the size to watch, not 18.** The core is nearly gone there. `IconSettings`
   renders in the sidebar at 18 and never at 16 today, so nothing is affected — but a
   future call site that puts it in a table cell or a chip is the one to look at.

---

## 7 · What is NOT proven here

- **AC-9's rendered half runs in jsdom.** It injects the real `base.css` and reads
  `getComputedStyle`, and jsdom does resolve the `[dir='rtl'] [data-flip]` attribute
  selector — observed, both directions. It still does no layout, so it cannot see a
  cascade being lost. That is why the paired **source scan** exists: it fails if any
  `*.module.css` sets a `transform` on an icon selector. `shellLayout.test.ts` was written
  after exactly that class of defect and no rendered test could have caught it.
- **`IconRetry` and `IconReopen` mirroring is a live disagreement, not a settled fact.**
  The document lists both among its twenty; the previous `IconRetry` carried a written
  argument refusing it — a rotation points *around* the reading axis, not along it, so
  mirroring reverses a physical action rather than a direction. The document won because
  the ruling adopted its metaphors. The Arabic nav was looked at (§6) and neither reads as
  wrong, but **"does not look wrong to me" is not the same as right**, and Q-8 in the
  summary hands it back.
- **AC-13 is PARTIALLY MET.** The source HTML never reached disk — it arrived as a
  conversation attachment with its Arabic mis-decoded (UTF-8 read as Latin-1: `وصل` came
  through as `ÙˆØµÙ„`). Vendoring that would have put corrupted Arabic in the repository
  under a filename claiming to be the source. `design/icons/wasl-icon-system.md` carries
  the half that is ASCII and verifiably intact — all 63 icons' geometry, the node list,
  the flip list, the numeric rules — and says so at the top. The original still needs
  committing by the product owner.
