# 030 — The Feedback Layer · FRONTEND

**Phase:** 4 · **Lane:** Frontend only
**Status:** **APPROVED FOR SPEC · NOT APPROVED FOR IMPLEMENTATION** — product owner,
2026-08-31. Q-2, Q-4, Q-5, Q-6, Q-8, Q-9 ruled and closed below; **every row of §3 is
resolved**, which is AC-2. Q-3 carries a working assumption. **Q-1 is the gate**: no
implementation until `Toasts Modals Panels.dc.html` is in `docs/sdd/design/` byte-exact
and §04 has been read against it.
**Extends:** `006-design-system` · `docs/sdd/design/screens/10-shared-patterns.md` ·
`docs/sdd/design/motion.md`
**Depends on:** `029-loader-system` — for the motion tokens and the `Skeleton` shape
**Source:** `Toasts Modals Panels.dc.html` — a canvas design document, authored in
Arabic, supplied 2026-08-30. **It is not in the repository yet** and this feature
vendors it. See §2 — the copy supplied was lossy and the Arabic could not be read.

---

## 1 · What this is

The three surfaces that tell the user what just happened, and the rule for which one
carries which message.

`Toast` exists as a primitive with three tones, rendered inline by two callers. `Modal`
is inventoried and **not built**. A side panel is **neither built nor inventoried** —
`10-shared-patterns.md` calls the same idea a *Drawer* and specifies it differently.

The source document supplies all three at a level of detail the house documents do not:
four tones with per-tone timing, three modal sizes, three panel widths, four panel
variants, a stacking and de-duplication rule, and the accessibility split between
`role="status"` and `role="alert"`.

**It also disagrees with the frozen house documents in nine places.** That is §3, and it
is the part of this spec that needs a ruling before anything is built.

## 2 · What could not be read from the source, and why that is recorded here

The document was supplied by paste rather than as a file. The channel is **lossy on
non-ASCII**: UTF-8 Arabic arrived as cp1252 mojibake with the C1 bytes (`0x84`, `0x88`)
stripped and replaced by spaces. An `iconv` round-trip recovers one glyph and then
fails. The same corruption is visible in `support.js`, where an em-dash arrived as `â`.

| Readable | Not readable |
|---|---|
| Every measurement, duration, colour, easing, `z-index`, ARIA role, breakpoint | Every rule that lives **only** in Arabic prose |
| The complete CSS, all five `@keyframes`, every inline style | The §04 decision matrix — five rows × two columns, entirely Arabic |
| The document structure, all six sections, every table's shape | The connective reasoning in the §01/§02/§03 rule lists |

**So the rules below were reconstructed from the Latin anchors inside the Arabic
sentences** — `4s`, `10s`, `×2`, `role="alert"`, `focus trap`, `70vh`, `768px`,
`z-modal 300`, `dasharray 3 5`. Those anchors are dense enough that the rules are
recoverable with high confidence, and each is marked below with the anchor it rests on.
**The §04 matrix is not recoverable at all** and is **Q-1**.

`029` set the precedent (its Q-5): the `.dc.html` is vendored as the reviewed artefact
and an English `.md` is authored beside it. That cannot happen for this document until a
byte-exact copy reaches the repository, and **no acceptance criterion below is satisfied
by the pasted copy**.

## 3 · Nine disagreements with the frozen house documents

The authority today is `10-shared-patterns.md` (confirm modal, drawer, toast) and
`motion.md` (the duration scale). Every row is measured against those two, not inferred.

| # | Thing | House document | The source | Kind |
|---|---|---|---|---|
| 1 | Toast visual model | tinted fill, `--state-*-bg` | **white card + 3px inline-start stripe** | **contradiction** |
| 2 | Toast placement | **bottom** inline-end | **top** inline-end (the prop's default) | **contradiction** |
| 3 | Modal radius | `--radius-lg` · 12px | **`--radius-md` · 8px** | **contradiction** |
| 4 | Scrim | `rgba(13,38,38,.45)` | **`rgba(13,38,38,.4)`** | **near-match** |
| 5 | Drawer header | h56, `--surface-inverse` navy, white title | **white header**, 18/20 padding | **contradiction** |
| 6 | Modal enter | 250ms (`motion.md` scale) | **180ms** | **contradiction** |
| 7 | Drawer enter | 250ms (`motion.md` scale) | **220ms** | **contradiction** |
| 8 | Easing | `--ease-out: cubic-bezier(.22,.80,.30,1)` | **`cubic-bezier(.2,.7,.3,1)`** | **near-match** |
| 9 | Modal confirm icon | 48px circle, `--state-*` fill and glyph | **absent** | **omission** |

And four where the source is a **superset** rather than a contradiction — additive, and
cheap to accept:

| Thing | House document | The source |
|---|---|---|
| Toast tones | three | **four** — adds warning |
| Toast timing | success 4s, info 4s | success 4s · info **5s** · warning **6s** · with an action **10s** |
| Modal width | one, max 440 | **three** — 420 / 560 / 720 |
| Panel width | one, 480 | **three** — 360 / **480** / 640 |

**Rows 4 and 8 are the dangerous ones.** `tokens.css` already carries the rule, written
about a different near-match: the tickets-table canvas drew the status tints a shade off
the tokens, and *"a near-match is a second palette, not a refinement"* — the token won.
`.4` against `.45`, and `.2,.7,.3,1` against `.22,.80,.30,1`, are that failure exactly.
Neither is visible in review; both leave two values in the system where one belongs.

**Where the source and the house documents already agree**, and no ruling is needed: an
error toast never self-dismisses; a drawer carries no scrim by default; three toasts
stacked at most; focus trap, `Escape`, and focus returned to the opener; a decision
belongs in a modal and secondary detail in a panel.

### Ruling status per row — product owner, 2026-08-31

**Two rules, and they must be read together.** The first was ruled alone and then bounded
by the second on the same day, because the first on its own licenses exactly the defect
the second forbids.

> **1 · A value extracted from the feature's own source is not swapped for the house
> document's merely because the house document is more general.** The source is the nearer
> authority for the component it draws; the house document is edited to match.
>
> **2 · But that governs a CONTRADICTION, not a difference of 0.02.** A source is adopted
> when it says something *different*. **A number saying the same thing at another
> precision is rounded to the value already there.**

Rule 1 without rule 2 produces a seventh easing curve differing from the sixth by `0.02`
— imperceptible, and precisely what `tokens.css` names as the failure and AC-3 forbids.
Rule 2 without rule 1 hands every decision to whichever document is older. **Neither is
the governing rule; the pair is.** They are recorded in one place for that reason: a
reader who finds only the first will adopt the seventh curve.

The test rule 2 asks is *does this value mean something new, or the same thing at another
precision?* Row 1 changes the model. Row 3 changes the shape. Rows 6 and 7 change the
feel. **Rows 4 and 8 change nothing a person can see.**

| Row | Status |
|---|---|
| 1 · toast visual model | **Source wins** — the stripe model. `10-shared-patterns.md` edited. Direct application of the principle |
| 2 · toast placement | **Source wins** — top inline-end. Ruled explicitly, Q-4 |
| 3 · modal radius | **Source wins** — 8px. Direct application |
| 5 · drawer header | **Source wins** — white header. Direct application |
| 6 · modal enter | **Source wins** — 180ms. Ruled explicitly, Q-2 |
| 7 · drawer enter | **Source wins** — 220ms. Ruled explicitly, Q-2 |
| 9 · confirm icon | Working assumption stands — **Q-3**, unruled |
| 4 · scrim | **House value wins** — `rgba(13,38,38,.45)`. Rule 2, Q-8 |
| 8 · easing | **House value wins** — `--ease-out` stays and is **not** retired. The source's curve is not adopted and no seventh is added. Ruled explicitly, Q-8 |

**Every row in §3 is now resolved, which is AC-2.** Six to the source, two to the house
document, one working assumption outstanding (Q-3). The split is not a compromise between
two authorities — it is rules 1 and 2 applied to nine values, and each row's cell names
which rule decided it.

## 4 · This feature owns the other half of note 11

`tokens.css` note 11 says **no shadow tokens and no motion tokens exist**, and forbids
inventing either, because an invented token is indistinguishable from a real one.

`029` closes the motion half and **explicitly declines the shadow half** — its §9 lists
shadow tokens out of scope, *"Note 11's other half. Unrelated, and this feature should
not smuggle it in."*

**Verified against the delivered file on 2026-08-31**, not taken from the spec. `029`
landed a fifth provenance `(E)` and eleven `--motion-loader-*` tokens, and wrote the
boundary into the file itself:

> Still absent: shadow tokens, and durations for the two app-shell transitions. Both stay
> literals with their TODOs. This feature extracted loaders and only loaders; sweeping the
> rest in on the same commit is how a token layer acquires values nobody sourced.

So the shadow half is unclaimed by construction, and `--shadow-md` / `--shadow-lg` are the
first two values in the system with a floating surface to justify them.

This feature is where they belong, because it is the first one with a surface that
floats:

```css
--shadow-md: 0 4px 12px rgba(13, 38, 38, .08);   /* toast, side panel */
--shadow-lg: 0 12px 32px rgba(13, 38, 38, .12);  /* modal */
```

Both are **extracted from the vendored document**, not chosen — which is the condition
note 11 sets. Note 11 is then rewritten to record both halves closed.

## 5 · Toast — the measured specification

Existing: `src/wasl-web/src/components/Toast/Toast.tsx`. Three tones, rendered inline
where the caller puts it, `role="status"` unconditionally, no stack, no queue. Consumed
by `TicketCreatedPage.tsx` and `CreateCustomerPreview.tsx`.

| Property | Value | Anchor |
|---|---|---|
| Width | `360px`, max `90vw` | measured |
| Padding | `--space-4` · 16 | measured |
| Type stripe | **3px, inline-start**, tone-coloured | measured |
| Icon | 18px, `--icon-stroke-width` 1.5 | measured |
| Geometry | `--radius-md` 8px · `--shadow-md` | measured |
| Stack | max **3**, newest at top, **8px** gap, a fourth displaces the oldest | `8px` |
| Offset | 24px from the edge | `24px` |
| Enter / exit | **180ms / 120ms** | measured |
| Duplicate | updates the existing toast with a **`×2`** counter — never a new toast | `×2` |
| Pause | the countdown pauses on pointer-over **and** on focus | — |

| Tone | Stripe | Auto-dismiss | Role |
|---|---|---|---|
| Success | `--green-700` | 4s | `status` |
| Info | `--blue-500` | **5s** | `status` |
| Warning | `--amber-500`, glyph `--state-warning-text` | **6s** | **`alert`** |
| Error | `--red-600` | **never** | **`alert`** |

With an action link, any tone extends to **10s**. The optional countdown bar is
**success and info only** — its `transform-origin` follows `--fb-origin`, so it drains
toward the reading start in both directions.

Two structural additions the current primitive has no room for: a **title + helper**
two-line body, and an **action slot** (a link, plus an optional `dir="ltr"` trace id).
The error example in the source carries both — *retry*, and `trace 9f2c41`.

`role="alert"` on error and warning is a **change** to the current primitive, whose
comment argues for `status` on every tone. That argument was written for one screen
where the errors were attached to their fields; it does not survive a toast that is now
the only report of a failed background write.

## 6 · Modal

Not built. `component-inventory.md:49` lists it with *"Open, closing, focus trap, escape
and backdrop dismissal"* and names its two consumers: the close-ticket dialog and the
escalation reason. **The source's `md` example is the escalation form** — a team select
plus a reason textarea — which is `016`'s screen, drawn.

| Property | Value |
|---|---|
| Sizes | **sm 420** confirm · **md 560** short form · **lg 720** small table |
| Geometry | 8px radius · `--shadow-lg` (§3 row 3 — the house document says 12px) |
| Scrim | `rgba(13,38,38,.4)` at `--z-modal` 300 (§3 row 4) |
| Padding | `--space-6` 24 · fields `--field-height-md` 47 |
| Enter | 180ms, `+6px`, `scale .99 → 1` (§3 row 6) |
| Body | caps at **`70vh`** then scrolls; header and footer stay fixed |

Rules, each on its anchor:

- Dismissal by `Escape`, the close button, and the scrim — **except** a form holding
  unsaved input, which asks first. (`Esc`)
- Focus trapped; returned to the element that opened it. (`focus trap`)
- `role="dialog" aria-modal="true"`, `aria-labelledby` on the title. (verbatim)
- **One modal on screen.** A modal never opens a modal — steps go inside the same
  window. (`z-modal 300`)
- One focus ring for the whole system: `--focus-ring` at `3px`. No second intensity
  inside a dialog. (`--focus-ring`, `3px`)
- **No success message inside a modal** — close it and show a toast.
- Footer buttons align to the **inline-start**, the destructive action first and cancel
  second, so cancel sits earlier in the reading direction. The destructive action is
  **not** the default focus.

The source omits the house document's 48px state-tinted icon (§3 row 9). That is an
omission rather than a disagreement, and it is **Q-3**.

## 7 · Side panel

Neither built nor inventoried. `10-shared-patterns.md` specifies a *Drawer* at one width
with a navy header; this is a different component wearing the same idea (§3 rows 5, 7).

| Property | Value |
|---|---|
| Widths | **sm 360** filters · **md 480** record detail · **lg 640** long form |
| Side | inline-end — the left edge in Arabic |
| Motion | **220ms `cubic-bezier(.2,.7,.3,1)`** (§3 rows 7, 8) |
| Edge | 1px inline-start border · `--shadow-md` |
| Layer | `--z-drawer` 100 without a scrim, `--z-modal` 300 with one |

- **No scrim by default.** The panel narrows the context; it does not block it, and the
  list behind stays interactive. A scrim appears only for a form that does not warrant a
  modal. (`z-drawer 100`, `z-modal 300`)
- Header and footer fixed; the body alone scrolls.
- `Escape` closes, and **the panel has its own URL** — a deep link opens it. (`URL`)
- **No panel opens a panel.** Internal tabs, or promote to a full page.
- **Below `768px` it becomes a full page**, never a narrow panel. (`768px`)
- Tooltips stay above everything at `--z-tooltip` 400.

### Four variants (source §03ب)

| Variant | Rule |
|---|---|
| **Filters** | 360px. Applied by an **explicit button**, never live as the reader types. Active-filter count in the header; *clear* appears only when at least one filter is set |
| **Loading** | The **same skeleton as the final layout** — header, body, footer — so nothing moves when data arrives. **No spinner in the middle of the panel.** This is `029`'s `Skeleton`: 8px rows, opacity pulse `1.5s`, staggered `.15s` / `.3s`, no shimmer |
| **Tabs** | The answer to *no panel opens a panel*. **Three at most**, the active tab underlined `2px` in `--brand`, and the tab persisted in the URL with the panel |
| **Empty** | The brand mark drawn dashed — `stroke-dasharray 3 5`, `--neutral-400`, *a connection with no traffic*. One line naming the emptiness, one line saying what to do |

The loading variant is why this feature depends on `029` rather than duplicating a
skeleton, and the empty variant borrows `brand.md` §3's vocabulary, which `029` §9
explicitly leaves alone.

## 8 · Tokens this feature adds

Everything else in the source already resolves to `tokens.css` — verified on twelve
values: the four `z-index` layers, `--badge-dot-size` 7, `--checkbox-size` 23, the three
field heights, `--button-height-md` 40, `--icon-stroke-width` 1.5, all four radii, the
spacing scale, `--state-warning-text` `#8a5a00`, `--leading-ar-normal` 1.75, and the
`text-ui` / `text-helper` / `text-card-title` roles. **The document was drawn from the
token file, not against it.**

Genuinely new, and named by the source's §05 as *add them as tokens before implementing,
so they are not measured off the picture*:

```css
--toast-width:  360px;
--modal-sm: 420px;  --modal-md: 560px;  --modal-lg: 720px;
--panel-sm: 360px;  --panel-md: 480px;  --panel-lg: 640px;
--shadow-md: 0 4px 12px rgba(13,38,38,.08);
--shadow-lg: 0 12px 32px rgba(13,38,38,.12);
--scrim: rgba(13,38,38,.45);   /* the HOUSE value — .4 in the source, §3 rule 2 */
```

That instruction is note 1's rule arriving from the other direction, and it is the reason
`--modal-sm` is `420` and not the `440` a screenshot would give.

**Two values in the source are deliberately not tokenised here** (§3 rule 2, Q-8): its
scrim `.4` rounds to the existing `.45`, and its `cubic-bezier(.2,.7,.3,1)` is dropped in
favour of the existing `--ease-out`. **The comment on `--scrim` is load-bearing** — without
it the next reader compares the token to the vendored document, finds `.4`, and "corrects"
it. That is the exact mechanism `tokens.css`'s own preamble was written to prevent: *a
token whose provenance is unrecorded gets "corrected" later by whoever compares it against
a different source.*

## 9 · In scope

**Design source**
- `Toasts Modals Panels.dc.html` vendored to `docs/sdd/design/`, byte-exact, and
  converted to `docs/sdd/design/feedback.md` **in English** — the repository language
  rule. The Arabic copy becomes catalogue keys, not documentation prose
- `10-shared-patterns.md` reconciled with §3 — **whichever side loses is edited**, not
  left to disagree silently
- `motion.md` gains **180** and **220** as scale entries naming their surfaces (Q-2),
  plus the line that separates the two duration kinds **by name** (Q-9): *a loader
  duration is a cycle length; a transition duration is a wait.* `029`'s eleven sit outside
  the 300ms ceiling's remit and `030`'s two sit inside it — **without that line the two
  features read as a contradiction**, and the reader cannot tell which durations were
  argued against the scale and which were exempted from it
- `component-inventory.md` gains **Side panel**, and its `Toast` row moves to four tones

**Tokens**
- The eleven above. `tokens.css` note 11 rewritten — `029` closes the motion half, this
  closes the shadow half

**Primitives**
- `Toast` rewritten: four tones, the stripe model, title + helper, an action slot, the
  `status` / `alert` split
- `ToastViewport` — the stack: placement, max 3, 8px gap, newest first, de-duplication
  with the `×2` counter, pause on hover and on focus. Portalled
- `useToast()` in `src/lib/` — one queue for the application, so no screen owns its own
- `Modal` — three sizes, focus trap, scrim, `70vh` body
- `SidePanel` — three widths, four variants, URL-bound open state and tab

**Consumers**
- `TicketCreatedPage` and `CreateCustomerPreview` moved onto the viewport
- `027`'s `409 errors/concurrency-conflict` message becomes a toast (its AC-4)

**The rest**
- `/_preview/feedback` — the Phase 3b gate, **in Arabic first** (ADR-009)
- Every string in `en` and `ar`, parity-gated. The primitives hold no string
- The Arabic pass, recorded in `tests.md`

## 10 · Out of scope

| Excluded | Why |
|---|---|
| Escalation, close-ticket, and every other dialog's **content** | `016`, `012`. This builds the container; the screens fill it |
| The nine loader shapes | `029`. The panel's loading variant **consumes** its `Skeleton` |
| Tooltip and popover | `--z-flyout` 200 already has a consumer in the collapsed sidebar. Different feature |
| The empty-state vocabulary generally | `brand.md` §3, and `029` §9 leaves it alone for the same reason |
| A toast that survives navigation | Nothing in the product needs it, and a queue that outlives its route is a leak wearing a feature's name |
| Motion tokens | `029` adds them. This one consumes them |

## 11 · Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | The source document is in the repository **byte-exact**, with readable Arabic, and `feedback.md` is authored from it. §2's reconstruction is replaced by the document, not blessed by it |
| AC-2 | Every row in §3 is **resolved in writing** — house document edited, or source amended. A row left in disagreement fails this criterion; agreeing to build the source is not the same as recording it |
| AC-3 | The codebase holds exactly **one** scrim — `rgba(13,38,38,.45)` — and exactly **one** arriving easing, `--ease-out`. Asserted by a test that greps for the **near-miss forms the source supplies**: `.4)` as a scrim alpha, and `cubic-bezier(.2,.7,.3,1)` anywhere. Rows 4 and 8 are invisible in review, the vendored document contains both losing values in plain sight, and this is what catches a later "correction" back to them |
| AC-4 | Error and warning toasts carry `role="alert"`; success and info carry `role="status"`. **All four asserted** — asserting only one pair passes on a component that uses one role everywhere, which is today's behaviour |
| AC-5 | An error toast never auto-dismisses. Asserted with a fake timer advanced well past 10s |
| AC-6 | A fourth toast displaces the oldest and the stack never exceeds three. Asserted by **identity**, not by count — a count of 3 passes while the wrong one was dropped |
| AC-7 | A duplicate message updates the existing toast to `×2` and does **not** mount a second. Asserted on node identity |
| AC-8 | The countdown pauses on pointer-over and on **focus**. Both asserted; keyboard users are the ones who cannot hover |
| AC-9 | A modal traps focus and returns it to the opener. Asserted by which element holds focus after close, not by the trap's presence |
| AC-10 | A modal with unsaved input asks before `Escape` or a scrim click closes it. Asserted on both dismissal paths — one guarded and one not is the likely half-fix |
| AC-11 | The panel's open state and active tab round-trip through the **URL**: a deep link opens the panel on the right tab, and closing it leaves a clean URL |
| AC-12 | Below `768px` the panel renders as a full page. Asserted at the breakpoint, both sides |
| AC-13 | The panel's loading skeleton has the **same header/body/footer geometry** as its loaded state — asserted by comparing measured heights, not by the skeleton's presence |
| AC-14 | No primitive contains a user-facing string. Labels arrive as props from the catalogue, `en` and `ar`, parity-gated |
| AC-15 | No raw colour, duration, shadow, or width literal in any of the three modules. `tokens.css` note 11 is updated to record both halves closed |
| AC-16 | Under `prefers-reduced-motion: reduce` all four animations reduce to ≈0 **and every surface still renders** — asserted per surface. `006` AC-23 is the general rule; a toast that animates in from `opacity:0` disappears entirely when the animation is removed |
| AC-17 | `/_preview/feedback` renders all four tones, three modal sizes, four panel variants, both directions, and is reviewed **before** any consumer is rewired |
| AC-18 | The Arabic pass over the preview and every rewired consumer, recorded in `tests.md` |

## 12 · Open questions

| # | Question | Why it blocks | Working assumption |
|---|---|---|---|
| **Q-1** | The source's **§04 decision matrix** — five rows (toast · inline field error · modal · side panel · full page) × *use when* / *do not use if* — is unreadable in the supplied copy | It is the document's whole point: which surface carries which message. Everything else is measurements | **THE GATE. No assumption, and none is permitted** — product owner, 2026-08-31: *"لا يجوز تخمينه… جزء جوهري من المصدر، وليس مجرد content يمكن إعادة بنائه من الـLatin anchors."* `10-shared-patterns.md` already carries two of the five rules — *a decision opens in a modal, secondary detail opens in a drawer*, and *forbidden goes inline beside the control, never a toast*. The other three stay unknown. Closed by reading §04 against the vendored file, never by a working assumption. Blocks AC-1 and blocks implementation |
| ~~Q-2~~ | ~~`motion.md`'s scale names 250 for both modal and drawer enter; the source uses 180 and 220~~ | **CLOSED 2026-08-31 — source wins, 180 / 220ms.** Extracted values are not swapped for the more general document; `motion.md` gains the two scale entries rather than the feature losing fidelity | — |
| Q-3 | The house confirm modal has a **48px state-tinted icon**; the source's has none | A confirm dialog for a destructive action reads differently with and without it, and `012` and `016` will both use it | **Keep the icon, as an option on the `sm` size.** The house document gives it a real job — *icon and confirm colour follow the action: green to resolve, amber to pend, red to close* — and the source simply does not draw a confirm at that fidelity. An omission is not a deletion |
| ~~Q-4~~ | ~~Toast placement is a prop with three options in the source; `10-shared-patterns.md` says bottom inline-end~~ | **CLOSED 2026-08-31 — top inline-end, and not a prop.** The feature's own source is the nearer authority for the component it draws; placement is not made configurable to accommodate a conflict. `10-shared-patterns.md` is edited | — |
| ~~Q-5~~ | ~~Does `Modal` count against ADR-009's eight-primitive cap, and does `SidePanel` make it ten?~~ | **CLOSED 2026-08-31 — no, neither counts.** Both are containers, not independent primitives: they take no input, hold no value, and compose other primitives. Recorded in `component-inventory.md` with that reason | — |
| ~~Q-6~~ | ~~`027` needs a toast for its AC-4 and is spec-awaiting-review; the WIP limit is one feature~~ | **CLOSED 2026-08-31 — `030` before `027`.** `027` depends on `Toast`, `016` on `Modal`. Dependency order governs | — |
| ~~Q-8~~ | ~~Rows 4 and 8 are near-matches: scrim `.4` against `.45`, panel easing `cubic-bezier(.2,.7,.3,1)` against `--ease-out`~~ | **CLOSED 2026-08-31 — snap to what exists, add no seventh.** `--ease-out` stays and is not retired; the source's curve is not adopted. The no-swap rule governs a **contradiction**, not a difference of `0.02`, and that difference is imperceptible. **The ruling added rule 2 to §3** — *a source is adopted when it says something different; a number saying the same thing at another precision is rounded* — recorded beside rule 1 because rule 1 read alone licenses the seventh curve | — |
| ~~Q-9~~ | ~~`029`'s cycle-length carve-out does not cover `030`, whose 180 and 220 are real transitions~~ | **CLOSED 2026-08-31 — assumption confirmed.** Both are added as scale entries, and `motion.md` gains a line separating the two kinds **by name**: a loader duration is a cycle length, a transition duration is a wait. Read together without that line, `029` and `030` look like a contradiction | — |
| Q-7 | The source's toast is a **white card with a 3px stripe**; the house document's is a **tinted fill**. Beyond §3, does the stripe model apply to anything else carrying a tone — `Badge`, the inline field error? | A second tone-expression model in one system is the near-match problem at component scale | **No — the stripe belongs to the toast alone**, and that is written into `feedback.md`. A toast floats over arbitrary content and needs an opaque surface; a badge sits in a row, where a tint is what makes it scannable. Two models with a stated boundary, not two models by accident |
