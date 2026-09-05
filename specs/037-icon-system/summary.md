# 037 — Icon system · summary

**Delivered 2026-09-05.** Frontend only. 1000 frontend tests pass, of which **338 are
this feature's**. `npm run lint` clean, `npm run build` clean.

---

## 1 · What was asked, and what it turned out to be

*"Add these icons to the system so they are shared and every component uses them."*

That reads additive. **The document was not additive.** It is a complete second icon
system — 63 glyphs, most of them redrawing something already built, on a 20-unit keyline
instead of the house 16, with a filled *node* as its stated signature, and a
stroke that thickens at small sizes. Three of its rules contradict written decisions in
`design/icons.md`.

Nothing was assumed. Both readings were put to the product owner and ruled on before any
code:

| | Ruling |
|---|---|
| **R-1** | **Full adopt, house rules win.** All 63 metaphors and the document's geometry, normalised to the house rules |
| **R-2** | **Keep the 18px default.** The document's 24/20/16 scale is advisory |
| **Q-1** | `IconWhatsapp` **kept**, as a documented exception to the document's own vendor-logo rule |
| **Q-6** | Proceed with the document's `settings` and `filter`; AC-11 narrowed to one measurable question |

---

## 2 · What shipped

**One module** — `src/wasl-web/src/icons/icons.tsx`, **73 exports**:

- **62** from the document (`mark` excluded — it is the brand, and lives in
  `src/brand/Mark.tsx`),
- **11** labelled **(D)**, ours, each kept for a stated reason the document cannot supply:
  `IconClosed` `IconWhatsapp` `IconSignOut` `IconEyeOff` `IconAlert` `IconTriangleAlert`
  `IconCircleX` `IconArrowUp` `IconArrowRight` `IconReassign` `IconChevronDown`.

**`icons-added.tsx` is deleted.** Its 8 import sites were repointed and merged.

**Four guards**, in the same folder: `iconKeyline` · `iconRules` · `iconRtl` ·
`iconCoverage`. Each was broken on purpose and seen to fail (`tests.md` §4).

**Mirroring is one CSS rule** — `[dir='rtl'] [data-flip]` in `styles/base.css`. Before
this, it was each consumer's job and exactly **one** consumer ever did it.

### The three normalisations

| | Rule | Effect |
|---|---|---|
| **N-1** | scale about (12,12) by `s = min(1, 8/R)` | 22 of 63 untouched; the rest 0.80 – 0.99 |
| **N-2** | stroke 1.5 at every size | the document's 1.75-at-16 not adopted |
| **N-3** | no fills | **all 12 filled circles stroked** |

---

## 3 · The trade-offs, stated as trade-offs

**The document's signature does not ship.** The *node* — a filled circle at a stroke's end,
on seven icons, the thing the document names as what makes the set its own — is a stroked
ring here, because `icons.md` forbids fills and R-1 said house rules win. What Wasl keeps
is the signature `icons.md` already claimed: the tighter keyline and the derived radius,
*felt, not seen*. That is a coherent outcome, not a compromise — but the document was
offering something and it was declined, and the person who reads this later should know it
was a choice.

**`IconStatus` changed meaning slightly.** A ring with a solid centre says *this is the
current state*; two concentric rings say *target*. Legible, and not what was drawn.

**`IconTrack` lost an asymmetry.** Its tail circle was already stroked and its head was a
node; after N-3 both are rings, so the head no longer reads as the destination.

**Nine consumers see a different glyph in the same slot** — `IconSms` was a handset and is
now the document's bubble; the handset survives, honestly named, as `IconMobile`. Seven see
a new `IconEscalate`. Accepted by the product owner in advance.

**Icons at 16px read very slightly lighter** than the document intends, because N-2
refused its 1.75.

---

## 4 · What this fixed on the way past

- **`IconEye` was declared in BOTH icon files** with different geometry — `r 2.4` and
  `r 2.5` — so `TicketListPage.tsx` and `Input.tsx` had been rendering two different
  drawings under one import name for several features. One `IconEye` now, and AC-6 fails
  on a recurrence.
- **`icons.md` Rule 2 had drifted with nothing watching.** Measured rather than read,
  **9 of the 39** icons then in the set were outside the 16-unit keyline, build green
  throughout.
- **The two-file split's stated reason was already false.** `icons-added.tsx`'s header
  said `icons.tsx` was a byte-for-byte copy of the vendored `index.tsx` and that adding to
  it would break a drift check. `026` had already changed `IconFilter` and appended four
  icons, and **there is no drift check.** The split cost a duplicated `base()` and the
  duplicate `IconEye`, and bought nothing.
- **`IconPending` was a second name for the same clock face** as the document's `history`.
  Zero consumers, so removing it cost nothing.
- Nineteen directional icons that should have mirrored under RTL and did not, now do.

---

## 5 · Deviations from the approved spec

| # | Spec said | Built | Why |
|---|---|---|---|
| D-1 | AC-8: the `data-flip` set equals the document's 20-icon list **"exactly — no more, no fewer"** | doc's 20 **∪ `{IconSignOut}`**, and the test pins **both halves separately** | A strict reading removes `IconSignOut`'s flip — an arrow leaving a frame, which mirrored before `037` via `Sidebar.module.css`. That is a regression, not compliance. The document cannot speak to an icon it does not contain. **Not a loosening:** the doc list and the retained list are two literals, each asserted exact |
| D-2 | ~72 exports; §5.1 headed "24"; §5.3 headed "Ten" | **73**; §5.1 is **26**; §5.3 is **11** | Spec arithmetic. §5.1's own list always had 26 entries and §5.3's table always had 11 rows, `IconChevronDown` among them |
| D-3 | `IconPending` has 1 consumer | **0** | The earlier count included the declaration line |
| D-4 | AC-13 — vendor the source document | **PARTIALLY MET** | §7 below |
| D-5 | Negative control C3: a second `IconEye` in the module → AC-6 red | **Invalid; replaced by C3b** | A duplicate `const` in one file is a compile error, so the file never loaded and the assertion never ran. C3b plants the icon in *another* file — the real historical shape — and AC-6 goes red naming it. `tests.md` §4 |
| D-6 | §3.1 called `IconWhatsapp`'s 0.08 and `IconRetry`'s 0.01 arc-sampling noise | **Both are real ink** | Solved each arc's centre in closed form. Corrected in the spec in place with the disproof beside it |

---

## 6 · Acceptance criteria

| # | Status |
|---|---|
| AC-1 keyline | **Met.** 73/73 inside 4 … 20 |
| AC-2 tool verified before believed | **Met.** Four controls + three refusals |
| AC-3 no fills | **Met** |
| AC-4 stroke 1.5 at every size | **Met**, rendered at 16/18/20/24 |
| AC-5 `viewBox` and default 18 | **Met** |
| AC-6 one declaration per name, one module | **Met**, with the C3 caveat in D-5 |
| AC-7 imports resolve, build and lint clean | **Met** |
| AC-8 flip set exact | **Met as refined** — see D-1 |
| AC-9 RTL mirrors, nothing overrides it | **Met**, rendered + source scan |
| AC-10 every export used or named | **Met.** 35 consumed, 38 named with a reason |
| AC-11 viewed at 18px, both languages | **Met.** Q-6 resolved on the **ring** branch; fallback not triggered |
| AC-12 `icons.md` carries the supersessions | **Met** |
| AC-13 source document vendored | **PARTIALLY MET** — §7 |

---

## 7 · Known limitations

**AC-13 · the source document is not in the repository.** It arrived as a conversation
attachment, never as a file, and its Arabic was **mis-decoded** — UTF-8 read as Latin-1, so
`وصل` came through as `ÙˆØµÙ„`. Writing that out would have committed corrupted Arabic
under a filename claiming to be the source, which is worse than an absence: a corrupted
copy still gets read and cited. `docs/sdd/design/icons/wasl-icon-system.md` carries the
half that is ASCII and verifiably intact — all 63 icons' geometry, the node list, the flip
list, the numeric rules, the "do not" panel — and states the boundary at the top. **The
original HTML still needs committing by the product owner**, and until it is, the Arabic
rationale per icon exists only in their copy.

**AC-6's first assertion cannot be seen to fail** for the reason it was written — the
compiler catches a same-file duplicate first (D-5). The load-bearing half is the cross-file
scan, and that one has been seen red.

**AC-9 runs in jsdom**, which does no layout. It injects the real `base.css` and jsdom does
resolve the attribute selector — observed both ways — but a lost cascade is invisible to
it. The paired source scan is the mitigation, not a substitute.

**38 of 73 exports have no consumer.** Expected: the set is the deliverable. Each is named
in `iconCoverage.test.ts` with its owning feature or an explicit "no feature", and the test
fails in both directions so the list cannot become a dumping ground.

**The set was judged at DPR 1.** `icons.md` says judge at the smallest size and that was
done, but a high-DPI screen renders these differently and no one has looked at one.

---

## 8 · Open questions this feature raises

| # | Question |
|---|---|
| **Q-8** | **`IconRetry` and `IconReopen` mirror under RTL, and that overrode an argument we had written down.** The previous `IconRetry` refused to flip: a rotation points *around* the reading axis, not along it, so mirroring reverses a physical action rather than a direction. The document lists both among its twenty and won, because R-1 adopted its metaphors. The Arabic nav was looked at and neither reads as wrong — but that is not the same as right, and an Arabic reader should settle it |
| **Q-9** | **The trademark point is flagged and unresolved.** The document says WhatsApp, Telegram and the rest are registered marks and must not enter the set. `IconWhatsapp` was kept by ruling for a product reason. Whether a redrawn approximation of a registered mark is acceptable is a legal question, not a design one, and `037` does not answer it |
| **Q-10** | **`IconSettings` at 16px.** The ring survives at 18 and is nearly gone at 16. It renders at 18 in the sidebar today and never at 16, so nothing is affected — but the first call site that puts it in a table cell or chip needs a look |
| **Q-11** | **Does `design/icons/*.svg` stay?** Twenty SVGs and an `index.tsx` that is no longer the source of anything. Kept as the historical record by `037` §8, but they now describe a set that is not the one in the product, and the next person to open that folder will not know that without reading `icons.md`'s footer |
