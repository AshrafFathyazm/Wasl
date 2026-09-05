# 037 — Icon system · FRONTEND

**Phase:** 4 · **Lane:** Frontend only · **Status:** **APPROVED 2026-09-05**, implementing
**Source design:** `Wasl Icon System_last.dc.html` — supplied by the product owner
2026-09-05. **Not in the repository**; vendoring it is DOC-037-01 below.
**Supersedes in part:** `docs/sdd/design/icons.md` — see §2.
**Touches:** every screen. 33 import sites, 39 exports today.

---

## 0 · What the request was, and what the document turned out to be

The instruction was *"add these icons to the system so they are shared and every
component uses them."* That reads additive. **The document is not additive.** It is a
second, complete icon system that redraws most of what is already built, on a different
grid, with a different signature, under rules that contradict four written decisions in
`design/icons.md`.

That was measured before anything was designed, and the numbers are in §3. The two
readings — *import the missing glyphs* versus *replace the system* — produce materially
different work, so both were put to the product owner rather than assumed.

---

## 1 · The two rulings

Asked and answered 2026-09-05, before any code:

| # | Question | Ruling |
|---|---|---|
| R-1 | The document's rules contradict `icons.md` on fills, stroke scaling and keyline. How far does adoption go? | **Full adopt, house rules win.** Take all 63 metaphors and the document's geometry; normalise to the current rules — 16-unit keyline, stroke 1.5 at every size, no fills. One system. The document is not followed literally |
| R-2 | The document specifies a 24 / 20 / 16 size scale. The set's default is 18, which is not on it | **Keep 18.** No existing screen changes size. The document's scale is advisory |

**R-1 has a consequence that has to be said out loud, because it is the document's own
headline:** the *node* — a filled circle at the end of a stroke, on 7 of the 63 icons, the
thing the document names as the set's signature — **does not survive.** `icons.md` says
*"Fills: None. Do not mix filled and stroked in one set"*, and the measurement in §3 shows
that rule is currently honoured without exception. Under R-1 every filled shape becomes a
stroked one. The set keeps the signature `icons.md` already claims — the 16-unit keyline
and the derived radius, *felt, not seen* — and does not gain the one the document
proposes.

**R-2 has a smaller one.** The document's stroke rule is *1.5 at 24 and 20, 1.75 at 16*,
to compensate optically at the small size. R-1 rejects the 1.75, and `icons.md` states the
reason it rejects it: *"Stroke stays 1.5 at every size, because scaling the stroke with
the box is what makes an icon set look inconsistent across contexts."* So icons rendered
at 16 will read very slightly lighter than the document intends. Accepted, not overlooked.

---

## 2 · What this supersedes in `design/icons.md`, and what it does not

`icons.md` is the design of record and stays so. Two of its statements stop being true and
are **recorded as superseded at the foot of that file, not edited away** — the shape
`error-contract.md` uses for its `429` change:

| Statement in `icons.md` | After this feature |
|---|---|
| *"The set as built — **twenty** icons in `design/icons/`"* | ~72. The twenty are a subset |
| *"Only where no library has the concept, and only three"* (escalate · channel composite · ticket reference) | The product owner supplied a bespoke 63-icon document. That decision is theirs and it is now made |

**Three of its rules are reaffirmed by R-1, not superseded** — the 24 box, stroke 1.5 at
every size, and no fills. They become *enforced* for the first time; see AC-1 … AC-4.

---

## 3 · The measured state — both sets, one method

A bbox is computed per icon from its path data: real extrema for cubic and quadratic
segments (derivative roots), and endpoint-parameterised elliptical arcs sampled at one
degree. The tool and its output live in `tests.md` on delivery.

**The first version of that tool was wrong and its output was believed for one pass.**
SVG arc flags are single characters and may be glued to the next number — `a2.5 2.5 0
003.5 6` is `rx ry rot laf sf x y`, not five numbers — and a plain number regex reads
`003.5` as one token, mis-slotting every coordinate after it. It reported `copy` starting
at x = 6 when it starts at x = 3.5, and it missed `trash` and `bell` entirely. The
rewrite carries four controls that must pass before any figure below is read:

| Control | Expected | Got |
|---|---|---|
| Full circle r8 at 12,12 drawn as two arcs | `4,4,20,20` | `4,4,20,20` |
| The compact-flag path above | `x0 = 3.5` | `3.5` |
| `M4 4H20V20H4Z` | `4,4,20,20` | `4,4,20,20` |
| `M4 12C4 2 20 2 20 12` — a cubic that bulges past both endpoints | `y0 = 4.5` | `4.5` |

### 3.1 The set as it stands today

39 exports across two files.

| Measured | Result |
|---|---|
| Inside the 16-unit keyline (4 … 20) | **29 of 39** |
| Outside it | **9** — `IconAssign` `IconClosed` `IconSms` `IconFilter` `IconCopy` `IconAlert` `IconTriangleAlert` `IconCircleInfo` at 0.5 to 1.0 units, and **`IconWhatsapp` at 0.081**. A tenth, `IconRetry`, reaches 0.013 and is absorbed by the 0.05 tolerance |
| `fill="currentColor"` anywhere | **none.** The no-fill rule holds without exception |
| Duplicate export names | **one — `IconEye` is defined in BOTH files**, with different geometry (`r 2.4` in `icons.tsx`, `r 2.5` in `icons-added.tsx`). Three consumers import it; `Input.tsx` gets one drawing and `TicketListPage.tsx` gets the other |

**The keyline rule has drifted because nothing enforces it.** Eight icons violate a rule
`icons.md` states as Rule 2 of two, and the build is green. That is `001`'s false-negative
architecture test in another costume: a rule with no guard is a preference.

**And the stated reason for the two-file split is already false.** `icons-added.tsx`'s
header says `icons.tsx` is *"a byte-for-byte copy of `docs/sdd/design/icons/index.tsx`"*
and that adding to it would break a drift check. It is not a copy — `026` changed
`IconFilter` from a funnel to three lines and appended `IconClose`, `IconCalendar`,
`IconEye` and `IconCheck` — and **there is no drift check.** Both files diverge from the
vendored source, nothing notices, and the split now costs a duplicated `base()` and a
duplicated `IconEye` while buying nothing.

### 3.2 The document

63 icons.

| Measured | Result |
|---|---|
| Inside the house 16-unit keyline | **22 of 63** |
| Outside it | **41.** Overhang: 18 icons at 0.5 units, 8 at 1.0, 4 at 1.5, and `assign` at 2.0 |
| `fill="currentColor"` | **12 icons.** Seven the document calls *nodes* (`mark` `chat` `escalate` `settings` `assign` `merge` `track`) and five it does not (`more` `status` `info` `faq` `livechat`) |
| Its own keyline | 20 units — a 2-unit safe area inside the 24 box, against the house 16 |

**Correction, 2026-09-05.** An earlier revision of this section called `IconWhatsapp`'s
0.08 and `IconRetry`'s 0.01 *"arc-sampling noise, not violations"*. **Both are real ink**,
and each was settled by solving the arc's centre in closed form rather than by sampling it
again:

| Icon | Arc centre, solved | Consequence |
|---|---|---|
| `IconWhatsapp` | (12.081, 11.919) — not (12, 12) | Its rightmost point is x = **20.081**, and the sweep of 5.783 rad covers it. A genuine violation, and it fails AC-1 |
| `IconRetry` | (12, 12.013) | Its lowest point is y = **20.013**. Genuine, and **the 0.05 tolerance absorbs it** — which is what a tolerance does, and is not the same as the overhang being imaginary |

Sampling can only ever UNDER-report a curve's extreme, never invent one, so "the tool is
being imprecise" was never available as an explanation for an overhang it *found*. The
claim was reasoned, not measured, and it was wrong in the direction that makes a rule
look cleaner than it is.

---

## 4 · The four normalisation rules

Each is mechanical, each is one line, and each is guarded by a test that has been seen to
fail.

### N-1 · Keyline — scale about (12,12), do not recentre

For each icon let `R = max(|x₀−12|, |x₁−12|, |y₀−12|, |y₁−12|)` and scale every coordinate
about (12,12) by **`s = min(1, 8 / R)`**.

`s = 1` leaves an icon untouched. Otherwise the result is guaranteed inside 4 … 20 —
which a span-based factor is not: `key` spans 15.5 units and still breaks the keyline
because its ink sits low, and `min(1, 16/span)` would leave it there.

Measured over the 63: **22 untouched**, 41 scaled, every factor between **0.80 and 0.99**
— 6 at ≈0.80, 12 at ≈0.85, 20 at ≈0.90, 3 at ≈0.95. Nothing collapses.

**It scales rather than recentres, and that is deliberate.** `assign` is a person on one
side and a node on the other; its ink is off-centre because the glyph is. Recentring would
fit the box more efficiently and move the optical centre of every asymmetric icon in the
set. The cost is accepted: an off-centre icon gets slightly more air on its short side.

### N-2 · Stroke — 1.5 at every size

`base()` sets it; no icon overrides it; no size changes it. The document's 1.75-at-16 is
not adopted (R-2).

### N-3 · Fills — none

Every `fill="currentColor"` shape becomes stroked. Two forms, chosen by radius, because a
stroked ring and a dot are not interchangeable at 18px:

| Doc shape | Becomes | Why |
|---|---|---|
| Filled circle **r > 1.2** — the 7 nodes, `status`, `livechat`'s presence dot | A stroked circle at the same radius | At r ≥ 1.6 with a 1.5 stroke the inner hole is visible, so it reads as a ring. That *is* the loss R-1 accepts |
| Filled circle **r ≤ 1.2** — `more`'s three dots, `info`'s and `faq`'s bang | A round-capped zero-length stroke, `M12 16v.5` | Already the house solution — `IconAlert` and `IconCircleInfo` draw their dot exactly this way. A stroked r1.15 circle has an inner radius of 0.4 and renders as a blob with a pinhole |

### N-4 · Box and default — `viewBox="0 0 24 24"`, `size = 18`

Unchanged from today (R-2). Every consumer renders identically unless it opts into a size.

---

## 5 · The inventory

**Sixty-three in the document, minus one.** `mark` is the product mark and already lives in
`src/brand/Mark.tsx` and `design/brand.md`; an icon set is not where the logo goes, and the
document itself says *"do not use it as an ordinary interface icon."*

### 5.1 Existing exports that take the document's geometry — 24

The export name survives so no consumer changes. The drawing changes.

`IconSearch` ← `search` · `IconFilter` ← `filter` · `IconCalendar` ← `calendar` ·
`IconEmail` ← `mail` · `IconComment` ← `chat` · `IconEscalate` ← `escalate` ·
`IconCustomer` ← `user` · `IconSettings` ← `settings` · `IconRetry` ← `refresh` ·
`IconClose` ← `close` · `IconAdd` ← `plus` · `IconCheck` ← `check` · `IconMore` ← `more` ·
`IconEdit` ← `edit` · `IconCopy` ← `copy` · `IconEye` ← `eye` · `IconCircleInfo` ← `info` ·
`IconSort` ← `sort` · `IconTicket` ← `ticket` · `IconAssign` ← `assign` ·
`IconResolved` ← `resolve` · `IconSms` ← `sms` · `IconWebform` ← `webform` ·
`IconLivechat` ← `livechat` · `IconDashboard` ← `dashboard` · `IconGlobe` ← `language`

Two of these are worth naming individually:

- **`IconFilter` and `IconEscalate` change the most.** The filter goes from a 17-unit span
  to the document's 16 — which *fixes* one of the eight keyline violations in §3.1. The
  escalate goes from an arrow inside a rounded square to the document's rising swoosh, and
  it has 7 consumers.
- **`IconSms` and the phone.** Today `IconSms` draws a *handset* (`rect 6.5,3 11×18`). The
  document draws that shape as **`mobile`** and gives `sms` a bubble with two lines. The
  channel column takes the document's `sms`; the handset becomes a new `IconMobile`. Nine
  consumers see a different glyph in the same slot, and it is the correct one.

### 5.2 New exports — 37

`IconMobile` `IconAttachment` `IconTrash` `IconDownload` `IconUpload` `IconExternal`
`IconPriority` `IconStatus` `IconHistory` `IconMerge` `IconReopen` `IconCompany`
`IconNote` `IconTag` `IconCustomers` `IconCall` `IconTasks` `IconBell` `IconQuickReply`
`IconMention` `IconHandoff` `IconArticle` `IconFaq` `IconSolution` `IconGuide`
`IconPortal` `IconSubmit` `IconTrack` `IconRating` `IconShield` `IconKey` `IconAudit`
`IconRole` `IconDepartment` `IconBranding` `IconChevron`

`IconChevron` is the document's `chevron`, which points **right**. See Q-4.

### 5.3 Existing exports the document has no counterpart for — kept, still labelled (D)

Ten, and each is kept for a stated reason rather than because it is already there:

| Export | Uses | Why the document does not replace it |
|---|---|---|
| `IconClosed` | 2 | A padlock. The document has `resolve` and `status` and no lock. `Closed` is a terminal ticket state (BR-1) and needs a glyph the other statuses do not share |
| `IconSignOut` | 3 | The document has no exit glyph. `02-app-shell.md` specifies the row |
| `IconEyeOff` | 6 | The document has `eye` and no struck-through eye. `025`'s password toggle needs both states |
| `IconAlert` | 5 | Circle + bang. The document's `info` is circle + `i`, which is the other tone. `030`'s four toast tones need four glyphs |
| `IconTriangleAlert` | 3 | `feedback-layer.md` §2 gives warning a triangle. The document has no triangle |
| `IconCircleX` | 5 | The destructive *action*. `IconClosed` is the *state* |
| `IconArrowUp` | 8 | A bare vertical arrow. The document's `escalate` is the swoosh, which is the branded form, not the primitive |
| `IconArrowRight` | 3 | A bare horizontal arrow — the `from → to` diagram on `027`'s status rows |
| `IconReassign` | 5 | Two-headed diagonal. The document's `handoff` is two opposed horizontals and means a shift change; see Q-2 |
| `IconChevronDown` | **33** | See Q-4 |

### 5.4 The one that has to be asked about, not decided

**`IconWhatsapp` — 7 consumers, and the document forbids it.** The document's *"do not"*
panel says vendor logos do not enter the set — *"WhatsApp, Telegram and the rest are
registered marks; use the neutral «chat», and the real logo only on the integrations
page."* The set has `IconWhatsapp` today and the channel column renders it. This is Q-1.

---

## 6 · Where it lives, and how RTL works

### 6.1 One module

`src/wasl-web/src/icons/icons.tsx` holds all of it. **`icons-added.tsx` is deleted**, and
its own stated reason for existing is void (§3.1): the file it was protecting from
divergence has already diverged, and no drift check exists to break. Merging removes the
duplicated `base()` and resolves the duplicate `IconEye`.

This is not a barrel file. It declares components; it re-exports nothing. The `no barrel
files` rule in CLAUDE.md is untouched.

### 6.2 Mirroring is one rule, not twenty

The document lists **20 directional icons** that mirror under RTL with `scaleX(-1)`, and
one that never does (`mark`). Today the repo does this per consumer in CSS — there is
exactly one such rule, `.signOut` in `Sidebar.module.css`, and nineteen icons that should
have one and do not.

Each directional icon carries `data-flip` on its `<svg>`, and one rule in the icon
stylesheet does the work:

```css
[dir='rtl'] [data-flip] { transform: scaleX(-1); }
```

**The flip list is data, and a test compares it to the document's** (AC-8), because a list
maintained by hand in twenty components is a list that goes stale in one.

The three glyphs the current set deliberately does **not** mirror keep their reasons —
`IconEyeOff`'s slash, `IconGlobe`, `IconRetry`'s rotation (ADR-007 §6). None is on the
document's list, so the two agree.

---

## 7 · Acceptance criteria

Every one names a test. Every guard is broken on purpose once and the red run recorded —
`icons.md` Rule 2 has been violated by eight icons for several features precisely because
no guard existed.

| # | Criterion | Test |
|---|---|---|
| AC-1 | Every export's ink lies inside 4 … 20 in the 24 box, tolerance 0.05 | `iconKeyline.test.ts` — the §3 bbox tool, run over the module |
| AC-2 | The bbox tool passes its four controls (§3) before any assertion reads its output, and throws rather than returning an empty box when it parses nothing | `iconKeyline.test.ts` — `008`'s query-counter rule: a measurement that reports nothing must fail, not pass |
| AC-3 | No `fill` other than `none` appears anywhere in the module | `iconRules.test.ts` |
| AC-4 | Every export renders `stroke-width="1.5"`, at every size it is given | `iconRules.test.ts` — rendered, not grepped |
| AC-5 | Every export renders `viewBox="0 0 24 24"` and defaults to `size={18}` | `iconRules.test.ts` |
| AC-6 | No export name is declared twice, and `src/` contains no `Icon*` component outside the module | `iconRules.test.ts` — source scan. This is the guard that would have caught the duplicate `IconEye` |
| AC-7 | Every one of the 33 existing import sites resolves; `npm run build` and `npm run lint` are clean | `tsc` + build |
| AC-8 | The `data-flip` set equals the document's 20-icon list exactly — no more, no fewer | `iconRtl.test.ts`, with the list as a literal |
| AC-9 | Under `dir="rtl"` a flipped icon computes `scaleX(-1)` and a non-flipped one does not | `iconRtl.test.ts`. **jsdom cannot see a lost cascade** (`shellLayout.test.ts`'s finding), so this is paired with a source scan asserting no consumer sets its own transform on an icon |
| AC-10 | Every export is consumed, or is named in a documented not-yet-consumed list with its owning feature | `iconCoverage.test.ts` — `002c`'s contract comparison in miniature: an unconsumed export is named individually, never resolved by loosening the check |
| AC-11 | The set is viewed at 18px in a real nav row, in both `en` and `ar`, and nothing reads as broken, unfinished or disabled | Manual, recorded in `tests.md`. `icons.md`'s own acceptance question, and it is the one no test can answer |
| AC-12 | `icons.md` carries the two superseded statements from §2 at its foot, with dates | Review |
| AC-13 | The source document is vendored into `docs/sdd/design/icons/` | Review |

**Negative controls to run and record** (`tests.md`): move one icon 0.2 units past the
keyline → AC-1 red; restore a `fill="currentColor"` on one node → AC-3 red; add a second
`IconEye` → AC-6 red; drop one name from the flip list → AC-8 red. A guard that has never
been seen to fail has not been verified.

---

## 8 · Out of scope

- **Any change to a screen's layout, spacing or copy.** Icons change shape; nothing moves.
- **The 24 / 20 / 16 size scale** (R-2). Call sites keep the sizes they pass today.
- **The node as a filled shape** (R-1). If it is ever wanted, that is a change to
  `icons.md` Rule "Fills: None" and a feature of its own.
- **`docs/sdd/design/icons/*.svg`** — the twenty vendored SVGs stay as the historical
  record. They are not regenerated and they are no longer the source.
- **A Figma round trip.** `icons.md` says the source of truth is the code.
- **Any backend file.** No `.cs`, no endpoint, no migration.

---

## 9 · Open questions — these are for the product owner

Per the working agreement, none of these is guessed into the design.

| # | Question | Working assumption if unanswered |
|---|---|---|
| Q-1 | **`IconWhatsapp`.** The document forbids vendor logos in the set and directs channels to the neutral `chat` glyph, with real logos only on an integrations page. `IconWhatsapp` has 7 consumers in the channel column | **RULED 2026-09-05 — keep it, as a documented exception.** The channel column's only job is telling channels apart, and collapsing WhatsApp into the neutral `chat` defeats that. The document's vendor-logo rule is quoted beside the export in the module, so the exception is visible rather than silent. **The trademark point the document raises is FLAGGED, not resolved here** — it is not a design call and this spec does not make it |
| Q-2 | **`IconReassign` vs the document's `handoff`.** Both mean "this moves to someone else". Two glyphs for one act, or does `handoff` replace `IconReassign`'s 5 consumers? | **Keep both.** `IconReassign` is a ticket changing owner; `handoff` in the document sits under «لوحة الموظف» beside `tasks` and `bell`, which is a shift change. Different acts |
| Q-3 | **`IconPending` and the document's `history` are the same drawing** — a clock face in a circle. One glyph under two names is how a screen ends up meaning two things by one mark | **`IconHistory` is canonical; `IconPending` is not added a second time** and keeps that geometry. One drawing, and the status name is the alias |
| Q-4 | **`IconChevronDown` has 33 consumers and the document's `chevron` points RIGHT.** | Ship **both**: `IconChevronDown` is the document's chevron rotated 90°, so its 33 consumers are unaffected; `IconChevron` is the document's, points right, and carries `data-flip`. Ruled here rather than assumed silently because a rotation is a redraw |
| Q-5 | **`IconAttachment`.** CLAUDE.md states attachments are out of scope, and `docs/sdd/00-project-context.md` says so explicitly. Ship the glyph with no consumer, or omit it? | **Ship it**, listed under AC-10's not-yet-consumed set. It is an icon, not a control — `027`'s rule bites on data regions and inert actions, and an unrendered export promises nothing |
| Q-6 | **`settings` vs `filter` at 18px.** **This spec's first description of the two was wrong and is corrected here** — it said "three equal lines with nodes" against "three lines of decreasing length", which implies two near-identical marks separated only by length. Measured against the source: `settings` is a **slider** form — three FULL-WIDTH tracks (`M4 7h16 M4 12h16 M4 17h16`), each carrying one node at a **different position along its own track** (x = 15.5 · 8.5 · 13.5), and the document's note says the gear chokes at 16px, which is why this form was chosen. `filter` is three **centred bars of decreasing length** — 16 · 11 · 5, the document's own label — with **no nodes at all**. At full size they do not resemble each other, and the risk is narrower than first stated | **RULED 2026-09-05 — proceed with the document's drawings.** AC-11 for these two is one specific question, not an open judgement: **at 18px with stroke 1.5, does an r2 node read as a RING, or does it fill in and read as a solid dot?** Ring → the two stay clearly distinct and this passes. Solid dot → the only remaining difference is bar length and they converge. Rendered in the sidebar AND the list toolbar, same frame, `en` and `ar`. **Pre-authorised fallback, no further approval needed:** if the nodes fill in and the two read as one mark, `IconSettings` keeps today's gear, which is already drawn to house rules. Whichever way it goes is recorded in `tests.md`, naming which of the two outcomes was observed |
| Q-7 | Does the document supersede `design/icons.md`'s *decision* section — "adopt an open-source stroke set, draw only three" — or only its inventory? §2 assumes **only the inventory**, and that the decision is now historical rather than wrong | As written in §2 |

---

## 10 · Task outline — not yet the task list

`/speckit-tasks` produces the real one after approval. The shape:

1. `DOC-037-01` — vendor the source document; revise `icons.md` per AC-12.
2. `TEST-037-01` — the bbox tool and its four controls, **first**, red against today's set.
3. `FE-037-01` — the module: 62 document icons under N-1 … N-4, plus the ten retained.
4. `FE-037-02` — delete `icons-added.tsx`; repoint its 6 import sites.
5. `FE-037-03` — `data-flip` and the single stylesheet rule; remove `.signOut`'s local one.
6. `TEST-037-02` … `TEST-037-05` — AC-3 … AC-10, each with its negative control.
7. `REV-037-01` — AC-11, both languages, at 18px.

---

## 11 · Approval

**Gate 3 and Gate 4 cleared 2026-09-05.** Q-1 and Q-6 ruled above; Q-2, Q-3, Q-4, Q-5 and
Q-7 accepted as written. Two consequences acknowledged by the product owner as decisions
rather than surprises:

- **R-1 kills the node on 7 icons.** Filled circles become stroked rings and the
  document's headline signature does not ship.
- **§5.1 `IconSms`** — the handset moves to `IconMobile` and `sms` becomes the document's
  bubble. Nine consumers see a different glyph in the same slot, and it is the correct one.

Build order is §10: **`TEST-037-01` red against today's set before `FE-037-01`.** Negative
controls recorded, not assumed.

---

## 12 · Follow-ups after delivery — 2026-09-05 / 06

Five instructions arrived after `037` closed. The first two are the same kind — places
still drawing a glyph from before the document existed — and are recorded here rather than
in a new feature folder, because neither changes the ruling: they apply it where it had
been missed.

**The third (§12.3) is not an icon change and is recorded here because it arrived in the
same breath as §12.2, not because it belongs to `037`.** It is a layout ruling about the
shell and the table primitive, and if it needs to be cited later it should be cited as
that.

### 12.1 · The row and action menus — 2026-09-05

*«غير دول بما يتوافق مع الايكونز الجديده»*, against the ticket row menu.

Three of its four rows were still (D) glyphs, and the ticket detail page's action menu was
worse — two of its three were stand-ins that said the wrong thing:

| Where | Was | Now | Why |
|---|---|---|---|
| Row menu · view | `IconEye` | `IconEye` | already the document's |
| Row menu · reassign | `IconReassign` (D) | **`IconAssign`** | the document's assignment glyph |
| Row menu · escalate | `IconArrowUp` (D) | **`IconEscalate`** | the document's swoosh |
| Row menu · close | `IconCircleX` (D) | **`IconClosed`** | the padlock — `Closed` is terminal under BR-1, and the lock is the act |
| Detail · priority pill | `IconArrowUp` | **`IconPriority`** | it was drawing an *escalate* arrow on a **priority** pill |
| Detail · escalate | `IconArrowUp` | **`IconEscalate`** | |
| Detail · merge | `IconTicket` | **`IconMerge`** | it was drawing a *ticket* |
| Detail · extend-due | `IconEscalate` | **`IconCalendar`** | **actively wrong** — the escalate swoosh on a due-date row |
| Timeline · `Escalated` | `IconArrowUp` | **`IconEscalate`** | |

`IconArrowUp` and `IconReassign` have no consumer now and are listed in
`iconCoverage.test.ts` with that reason; `IconClosed`, `IconPriority` and `IconMerge` came
off the list. The test fails in both directions, which is what caught each move.

### 12.2 · The table header's sort control — 2026-09-06

The product owner supplied paths for `sort-asc`, `sort-desc` and `clear`, three header
states, the menu's metrics, and a hit-target floor.

**Two new icons**, `IconSortAsc` and `IconSortDesc`, labelled (D) — the document has only
the neutral `sort`. **`clear` is `IconClose`** and **`sort` is `IconSort`**, both already
in the set at the document's own geometry.

**The supplied paths were adjusted by 0.5 in x, and nothing else.** As given they ran
x 3.5 … 20.5 — half a unit outside the house keyline on each side, which fails AC-1.
`N-1`'s scale factor (8/8.5 = 0.941) was the wrong tool here: it would have moved the three
bars off the **7 / 12 / 17 grid the same instruction specifies**, breaking one house rule
to keep another. So the arrow moved +0.5 and the bars −0.5. Nothing was resized — the
arrowhead, the stem, and the bar lengths 4 · 6.5 · 9 are exactly as supplied.

**Stroke is 1.5, not the 1.75 the instruction names at 16px.** That is `N-2` and `R-1`
applied consistently; three icons at 1.75 beside seventy at 1.5 is the inconsistency
`icons.md` names. Changing it is a change to `R-1` for the whole set.

**Three header states, replacing a two-state toggle.** Unsorted shows **no glyph at rest**
— the neutral `sort` appears on hover, on focus, and while the menu is open. Sorted shows
`IconSortAsc`/`IconSortDesc` in `--brand` with the label at 600.

**The control changed shape, not just its icons.** It was a click-through cycle
(asc → desc → unsorted on one button). It is a three-row menu now: nothing on screen had
said what the next click would do, and "back to the server's order" was reachable only by
cycling past it. Both tests that drove the cycle were **rewritten, not loosened**, and the
old one was deleted rather than skipped.

**Mirroring.** `IconSortAsc` and `IconSortDesc` carry `data-flip`; `IconSort` and
`IconClose` are symmetric and do not. `RETAINED_FLIP_LIST` in `iconRtl.test.tsx` grew from
one name to three, each asserted exact — the same refinement shape as D-1.

**Where it is enabled, and where it cannot be.** `/customers` sorts, and this is its
control. **`/tickets` does not, and could not:** `GetTicketsQueryHandler.cs:45` orders
`CreatedAtUtc DESC` unconditionally and the endpoint takes no `sort` parameter. Putting the
menu on that table would be a data control that silently does nothing — the failure mode
CLAUDE.md names, and worse than `027`'s inert menu rows because a sort that does not sort
looks exactly like one that does. **`015` delivered filters and search, not sorting.**
Enabling it there is a backend change and a feature of its own.

### 12.3 · The page stops scrolling — 2026-09-06

*«الهيدر يكون ثابت والبودي الروز بس الي بتتحرك، يتشال من جنب الصفحة»*, with two
reference screens, followed by *«ولازم ميكونش فيه scroll في جنب الجدول»*.

| Layer | Change |
|---|---|
| `.shell` | `block-size: 100dvh` + `overflow: hidden` — the **window** never scrolls. `dvh` not `vh`: on mobile Safari `100vh` is the tallest the viewport ever gets, so a fixed-height shell would hide its own last rows behind the URL bar |
| `.main` | `min-block-size: 0` |
| `.content` | `min-block-size: 0` + `overflow-y: auto` — the fallback scroller, so every page that does **not** fill the box behaves exactly as before |
| `.page` (both lists) | `display: flex; flex-direction: column; block-size: 100%; min-block-size: 0` |
| `<Table fill>` | the card becomes a flex column, the scroller takes the remaining height, and the footer — which is where the pager already lived — stays pinned |

**`min-block-size: 0` in three places is the load-bearing half, and it fails silently.** A
flex item defaults to `min-height: auto` and refuses to shrink below its content, so
without it the card grows past the page, the window scrollbar comes straight back, and
nothing reports an error.

**The scrollbar beside the rows is hidden** — `scrollbar-width: none` plus
`::-webkit-scrollbar { display: none }`, both needed because they cover different engines.
Scrolling is untouched: wheel, trackpad, touch and keyboard all work, and `overflow: auto`
stays. **The cost is stated in the stylesheet rather than glossed:** a hidden scrollbar is a
missing affordance. Two things already on screen carry it — the last row is visibly cut by
the card's edge, and the pager names the page and the total. The rule is scoped to
`.scrollerFill` so it cannot be inherited by a container that has neither.

**Only the two list pages opt in.** `fill` is a prop, not a default: a `Table` with no
bounded parent has nothing to fill and would grow to its content, so every other caller
keeps `visibleRows` and the old behaviour.

### 12.4 · The side panel's header badge — 2026-09-06

Two icons supplied for the panel header, replacing a bare `+` and a lone Arabic initial:
**`IconAddCustomer`** and **`IconCustomerProfile`**, both labelled (D) — the document
contains neither.

**Both were scaled by N-1, and unlike §12.2 there was no alternative.** `add-customer` ran
x 3 … 20.75 (17.75 units) and `customer-profile`'s card alone was 18.5 units wide. Both
exceed the 16-unit keyline in *width*, so a shift could not fit them — only a scale could.
Factors 0.889 and 0.865.

**Every stated constraint survives a uniform scale, which is why it was the right tool
here and the wrong one for the sort icons:**

| Constraint | After scaling |
|---|---|
| the shoulder arc breaks at x 12.5 and must not close | breaks at x 12.44 — the gap is intact |
| the plus is 6.5 units, "not 15" | 5.78 units; still small, still not a standalone plus |
| the two profile lines are 3.5 and 2.5, **unequal on purpose** | 3.03 and 2.16 — ratio 1.4 before and after |
| no node on either | none |

The sort icons named an **absolute grid** (7 / 12 / 17) that scaling would have broken;
these name **ratios and a gap**, which scaling preserves. That is the whole difference.

**Both mirror under RTL.** `RETAINED_FLIP_LIST` is five names now, still asserted exact.

**The badge grew 32 → 40px, and that partly reverses a ruling from the previous day.**
`design/feedback-layer.md` had cut it 44 → 32 on 2026-09-05 because ~100px of chrome sat
above a form that then had to scroll. The instruction specifies a 40px circle with a 20px
glyph, and 40 is what lets an icon read — at 32 a 20px glyph leaves 6px of ring. **The
recorded cause of the original complaint was the block padding, not the badge**, and
`--sheet-head-padding-block` is untouched, so the header regains 8px rather than the 12 the
complaint was about.

Circle fills map to existing tokens exactly: `#F1F4F5` is `--surface-chip`, `#F3F3FB` is
`--purple-50`. The glyph is `--brand` in both, because the badge's own `--text-secondary`
on a tinted disc reads as disabled. The badge is not clickable, so it carries no
`cursor: pointer` and no `:hover` — §6 already held.

**`IconCustomerProfile` is NOT a default avatar**, and the code says so where it is used.
It stands in only while the row is unresolved — no photo and no name yet. A real initial
always wins, because a letter that is present says *which* customer this is and a generic
card says nothing.

### 12.5 · A guard that had to be narrowed, and was not deleted

Hiding the table's vertical scrollbar (§12.3) turned **AC-T-04** red:

```
× removes the need for a scrollbar rather than hiding one
```

It forbade `scrollbar-width: none` and `::-webkit-scrollbar` **anywhere** in
`Table.module.css`. Its own comment says what it protects: *"no scrollbar, because nothing
overflows"* — the **horizontal** axis, where columns are ratios normalised to percentages
so the table fits any frame. Hiding that bar would paper over columns that genuinely do
not fit.

**Vertical overflow in `fill` mode is not that.** It is intended — the body is meant to
scroll — so nothing is being faked. The guard's assertion over-reached its own stated
purpose.

It now asserts the two declarations appear in **exactly one rule**, `.scrollerFill`, counts
the occurrences rather than trusting the first one found, and additionally forbids
`overflow-x: hidden`. **Narrower in scope, not weaker:** the horizontal case it was written
for is still caught, and a second hidden scrollbar anywhere would fail it.

**It also had to strip comments first** — the stylesheet's note explains why both
declarations are needed and therefore contains both names, so counting the raw file failed
on prose. `029` and `027` each shipped a guard that went red on its own comment; this is
the third, and the stripper carries a control assertion like theirs.
