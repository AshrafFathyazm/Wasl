# 029 — The Loader System · FRONTEND

**Phase:** 4 · **Lane:** Frontend only · **Status:** spec, awaiting review
**Extends:** `006-design-system` · `docs/sdd/design/brand.md` §2 · `docs/sdd/design/motion.md`
**Source:** `Loaders.dc.html` — a canvas design document, authored in Arabic, supplied
2026-08-30. **It is not in the repository yet** and this feature vendors it.

---

## 1 · What this is

One waiting vocabulary for the whole product, and the rule for which shape goes where.

Today `Loader` is one shape at two sizes, used in three places, while `Table` carries a
private skeleton of its own and `Input`, `Select` and every dropdown have no waiting
state at all. The design document supplies **nine shapes from one geometry**, a
placement table, four timing gates, and the direction mechanics — and it replaces the
current Converge with a measurably different one.

The ask is *shared at system level, every component uses them*. That makes this a
design-system feature, not a screen feature: it changes two frozen primitive contracts
(`Input`, `Select`), rewrites one primitive (`Loader`), reconciles a fourth (`Table`),
adds the first motion tokens the system has ever had, and **edits `brand.md` §2**, which
is the source `Loader.module.css` claims to copy verbatim.

## 2 · Why this is not "add nine components"

ADR-009 caps the system at eight primitives and `component-inventory.md` requires a
written reason for a ninth. The cap survives here, and the reason it survives is
structural rather than a promise:

**Nine shapes are nine variants of one primitive, not nine primitives.** `Loader` gains
a `variant` prop the way `Badge` has a `tone` and `Button` has a `type`. One file, one
accessibility contract, one reduced-motion fallback path, one direction mechanism.

`component-inventory.md` already lists *a generic spinner* under **Not built** and names
the converge loader as what stands in its place. That line is what this feature is
executing, at the size the product actually needs.

The **one** genuinely new export is `Skeleton`, and it is proposed only because `Table`
already implements one privately and `Input`, `Select` and the ticket detail all need the
same shape. Whether that is a ninth primitive or a second export of the loader module is
**Q-1**.

## 3 · The nine shapes, and what each one is for

Verbatim from the source document's §03 table, with the durations it specifies.

| Shape | Geometry | Duration | Use |
|---|---|---|---|
| **Converge Pro** | 3 dots → node, 52×18 | 1.4s | **The default.** Saving a ticket, sending a reply, signing in — with text beside it. 0.5–5s |
| **Mark** | The brand mark draws itself | 1.6s | Big moments only: a full screen, or a switch between work areas. Never repeated inside a screen. >1.5s |
| **Path** | A line drawing itself to the node, 64×24 | 1.6s linear | Medium waits: escalating a ticket, syncing a channel. 2–15s |
| **Chain** | Nodes lighting one after another, 86×12 | 1.6s, 60ms stagger | A named multi-step operation (transform → assign → notify). **Never for a single operation.** 3–20s |
| **Orbit** | A dot orbiting a fixed node, 28×28 | 900ms | Inside a button while it submits; inside a field before its content appears. 0.3–3s |
| **Bars** | Four 3×18 bars | 1.1s | The smallest loader in the system. Table cells, chips, anywhere under 32px. Any duration |
| **Bar** | A 28% segment sweeping a 3px track | 1.3s | Background loading that does not block interaction: page transition, ticket-list refetch. Any duration |
| **Skeleton** | 8px rows, opacity pulse, **no shimmer gradient** | 1.5s | First load of a list or a record. **Always better than a spinner in a table.** 0.3–3s |
| **Satellites** | Two dots orbiting at two speeds | 1.5s | Waiting on an external channel. The teal here means *alive*, not *succeeded*. >10s |

**Green `#2E7D32` never appears in any loader.** It is an outcome, not a wait — the rule
is already in `brand.md` §4 and the source document restates it.

## 4 · Converge Pro replaces the current loader, and `brand.md` must move with it

The current `Loader.module.css` carries this, in capitals:

> The `@keyframes` are **COPIED VERBATIM** from `design/brand.md` §2. Do not tidy the
> percentages — 12 / 78 / 92 are the arrival shape.

Converge Pro changes exactly those percentages. Five deliberate differences, each named
in the source:

| # | Change | Why the source gives |
|---|---|---|
| 1 | Absorption by **scale**, not opacity — the dot shrinks to `.3` as it enters the node | It reads as being absorbed rather than as fading out |
| 2 | Node pulse **1.22×**, was 1.32× | The node receives; it does not demand attention |
| 3 | A new **absorption ring** — a 1.5px circle expanding and fading at the moment of arrival | Explains what happened without noise |
| 4 | Vertical spacing **24 / 50 / 76%**, was 22 / 50 / 78 | Tighter, so the slant comes from the delay and the three read as one line |
| 5 | Full opacity at **16%** with a 5px push, was 12% | Removes the empty first frame of the cycle |

Duration moves 1.45s → **1.4s**; the easing moves `cubic-bezier(.4,0,.5,1)` →
`cubic-bezier(.45,0,.35,1)`.

**So `brand.md` §2 is edited in this feature, in the same commit as the CSS.** Shipping
Converge Pro while §2 still shows the old keyframes turns a load-bearing comment into a
false one, and the next person to read the file would "restore" it.

## 5 · The timing gates — the part that is code, not CSS

The source's §04 is the only section that cannot be expressed in a stylesheet, and it is
the one with the highest chance of making things *worse*:

| Wait | Behaviour |
|---|---|
| **< 200ms** | No loader at all |
| **200ms – 1s** | Appear after a **150ms** delay, so it cannot flash |
| Once visible | Stay **at least 400ms** before being replaced by content |
| **> 10s** | Add a line of text naming the current step. **Not a bigger loader** |

A 400ms minimum adds up to 400ms of latency to a response that arrived in 160ms. That is
the correct trade — a flash is worse than a beat — but it is a deliberate slow-down and
it must be written down, not discovered.

This needs one hook in `src/lib/`, not a copy per call site. Naming and API in **Q-4**.

## 6 · Direction — the source proposes a different mechanism from the one in the file

`Loader.module.css` today pins its internal frame to `direction: ltr` and mirrors the
whole assembly with `scaleX(-1)`, and its comment records a **measurement**: mixing
logical positioning with physical transforms gave two mirrors that cancelled, and in RTL
the dots ran *away* from the node.

The source document solves the same problem differently:

```css
:root       { --ld-dir:  1; --ld-origin: left  }
[dir="rtl"] { --ld-dir: -1; --ld-origin: right }
/* logical properties for LAYOUT; --ld-dir inside calc() for TRANSFORMS;
   scaleX(var(--ld-dir)) on an <svg>, which has no logical properties */
```

Both are correct. **Two mechanisms in one module is not**, and Converge Pro is a rewrite
anyway. The proposal is to adopt `--ld-dir` / `--ld-origin` for all nine and retire the
`scaleX(-1)` container flip — with the negative control that found the original defect
re-run against the new mechanism and **recorded in `tests.md`**, because the failure mode
is silent: it still animates, it just animates backwards.

**The brand mark never mirrors.** `--ld-dir` applies to abstract shapes and travel only;
the Mark and Brand loaders keep the mark's own orientation in both directions, which is
`brand.md`'s existing rule.

## 7 · Reduced motion — the source and `brand.md` disagree, and `brand.md` wins

The source says the static fallback is *the node alone at 100% opacity*.
`brand.md` §2 says *the three dots and the node render statically*, and the current CSS
implements that with a long comment explaining that gating on `no-preference` alone would
leave the dots at their declared `opacity: 0` — two thirds of the mark silently missing,
for exactly the people who cannot ask for the motion back.

**`brand.md` wins.** Every one of the nine gets an explicit static frame — not an absent
one. This is the single easiest thing in the feature to get wrong, because the build
stays green and the defect is only visible to a reader who has the OS setting on.

## 8 · In scope

**Design source**
- `Loaders.dc.html` vendored to `docs/sdd/design/` and converted to
  `docs/sdd/design/loaders.md` **in English** — the repository language rule. The Arabic
  copy in it becomes catalogue keys, not documentation prose
- `brand.md` §2 rewritten to Converge Pro (§4 above)
- `brand.md` §4 gains the loader half of the accent rule: **teal in a loader means
  waiting on an external party**, never "loading" generally
- `motion.md` gains the loader durations and the four timing gates

**Tokens**
- The first **motion tokens** in `tokens.css` — durations and easings for the nine.
  Note 11 forbids inventing a token because an invented one is indistinguishable from a
  real one; these are **extracted**, from the document this feature vendors, so the
  objection does not apply. Loader geometry (46×16 → 52×18, dot 5, node 9) resolves the
  same file's standing TODO
- Every raw hex in the source mapped to a semantic token. `#1D174D` → `--brand`,
  `#4A9E96` → the teal accent, `#EDF1F2` / `#DEE5E7` → the existing sunken and border
  tokens. **No new colour**

**The primitive**
- `Loader` rewritten: nine variants, one accessibility contract, one direction
  mechanism, an explicit static frame per variant
- `Skeleton` (see **Q-1**)
- `Table`'s private skeleton reconciled against the system one — one implementation, or a
  written reason for two

**The two contract changes**
- `Input` gains a loading state — four patterns from the source §07: async validation,
  debounced search, a server-computed value, and the field's own first load
- `Select` gains loading states — five from the source §08: trigger resolving its value,
  menu loading its options, search inside the menu, loading-more at the menu foot, and
  the chip awaiting confirmation. Plus the **failure** state: a menu loader needs an end,
  and after 10s it shows a retry, never an indefinite pulse

**Every consumer moved onto the system**
- `Button` · `CustomerPicker` · `LocalizationPage` · `Table` · `guards.tsx` ·
  `TicketListPage` — each to the shape the placement table names for it (**Q-2** covers
  the two that change shape rather than keeping theirs)

**The rest**
- The `useDeferredBusy` hook and its tests (§5, **Q-4**)
- `/_preview/loaders` — the Phase 3b gate, in **Arabic first** (ADR-009)
- Every string in `en` and `ar`, parity-gated. The loaders themselves hold no string; the
  labels beside them do
- The Arabic pass, recorded in `tests.md`

## 9 · Out of scope

| Excluded | Why |
|---|---|
| A motion library | `motion.md`: start with zero. Nine CSS loaders is not the reason to add 30KB |
| A progress bar with a real percentage | Nothing in the product knows its own progress. `Bar` is indeterminate by construction |
| The empty-state vocabulary (`brand.md` §3) | Same geometry, different feature — an empty state is an outcome, not a wait |
| Login's neural mesh | `motion.md` names it the one permitted physics simulation and it is already built |
| Shadow tokens | Note 11's other half. Unrelated, and this feature should not smuggle it in |
| A skeleton **shimmer** | The source forbids it by name: opacity pulse only |

## 10 · Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | Nine variants ship as **one** `Loader` primitive. The eight-primitive cap is not exceeded, and if `Skeleton` lands as a ninth it carries a written reason in `component-inventory.md` |
| AC-2 | `brand.md` §2 and `Loader.module.css` agree, asserted by a test that reads the keyframe percentages out of both. **The current file claims to be verbatim and a change to one silently breaks that** |
| AC-3 | Every variant renders a **visible static frame** under `prefers-reduced-motion: reduce` — asserted per variant, not once. An assertion that "the animation is off" passes on a loader that has vanished |
| AC-4 | Every variant renders correctly in RTL: travel runs toward the node, not away. Measured with the negative control from §6 re-run and **recorded**, because the wrong direction still animates |
| AC-5 | The brand mark does **not** mirror in either the Mark or the Brand loader, while abstract shapes do — both asserted in the same test, since asserting only one is satisfied by mirroring everything |
| AC-6 | A response under 200ms renders **no** loader. Asserted with a fake timer, on a real component, not on the hook alone |
| AC-7 | A loader once shown stays ≥400ms. Asserted by a response resolving at 160ms and the loader still mounted at 500ms |
| AC-8 | No loader contains a user-facing string. Labels arrive as props from the catalogue, in `en` and `ar`, parity-gated |
| AC-9 | No raw colour, duration, or geometry literal in any loader CSS. The motion tokens exist in `tokens.css` and note 11 is updated to say so |
| AC-10 | `Table` renders the system skeleton, or `component-inventory.md` records why it keeps its own. **Two implementations with no reason is the failure this AC exists to catch** |
| AC-11 | `Select`'s menu loader terminates: after 10s it shows a retry affordance, asserted — never an indefinite pulse |
| AC-12 | Every consumer named in §8 uses a system loader. Asserted by a lint rule or a test that no component declares its own `@keyframes` for a waiting state |
| AC-13 | `/_preview/loaders` renders all nine, both directions, both motion preferences, and is reviewed **before** any consumer is rewired |
| AC-14 | The Arabic pass over the preview and over every rewired consumer, recorded in `tests.md` |

## 11 · Open questions

| # | Question | Why it blocks | Working assumption |
|---|---|---|---|
| Q-1 | Is `Skeleton` a ninth primitive, or a second export of the loader module? | ADR-009's cap is a real gate and a ninth needs a written reason before it is written, not after | **A second export of the loader module.** It is a waiting shape from the same vocabulary, it shares the reduced-motion and direction contract, and `Table` already proves the need. The cap counts interactive primitives, and a skeleton takes no input |
| Q-2 | Two consumers change **shape**, not just implementation: `Button` goes `Converge sm` → **Orbit**, `CustomerPicker` goes `Converge sm` → **Bars**. Confirm? | Both are visible changes to shipped screens the product owner has already reviewed | **Yes, per the placement table.** Orbit is the source's named button loader; Bars is its named debounced-search loader and it holds the search icon's exact footprint, so nothing shifts. Recorded as a deliberate change, not a refactor |
| Q-3 | Does retiring the `scaleX(-1)` container flip need its own negative control, or does AC-4 cover it? | The original defect was found by measurement, and the comment recording it would be deleted with the code | **Its own control**, run and recorded. Deleting the measurement that produced a rule without repeating it is how the rule comes back as a bug |
| Q-4 | What is the hook called, and does it wrap the query or the boolean? | Every consumer imports it, so a rename later is a sweep | **`useDeferredBusy(isBusy: boolean): boolean`** — it takes the boolean, not the query. TanStack Query's `isPending` is already the boolean, and a hook that wraps the query cannot be used by `Button`, which never sees one |
| Q-5 | The source is a canvas HTML document in Arabic. Does the repository keep it, or only the English `loaders.md`? | The repository language rule is unambiguous about docs; a design source is arguably an asset | **Keep both.** The HTML is the artefact the design was reviewed in — the same standing the Figma exports have — and `loaders.md` is the English document the repository rule governs. The HTML is referenced, never read as spec |
| Q-6 | Nine variants each with a static frame, both directions, both motion settings, is 36 rendered states in the preview. Is the Phase 3b review one pass over all of them? | It decides whether AC-13 is one gate or four | **One pass, one preview page**, four toggles on it. Splitting it into four reviews is how three get done |
| Q-7 | `Chain` is specified for "a named multi-step operation" and **no operation in the product currently has named steps** | A loader with no consumer is speculative work, which the primitive Definition of Done forbids by name | **Build it, mark it unused, and say so.** It is ~10 lines of CSS inside a variant that already exists, the vocabulary is incomplete without it, and `016` escalation is the named consumer coming. Recorded in `summary.md` as the one shape with no caller |
