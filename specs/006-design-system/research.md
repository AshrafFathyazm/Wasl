# 006 — Research

Questions that had to be answered before the plan could be written, what was checked,
and what each one settled. A question that turned out not to matter is recorded as such,
because "we looked and it did not matter" is information too.

Four of these ended in a **disagreement between blueprint documents**. Those are the
most valuable entries here: each one is a place where a plan written from memory of one
document would have quietly contradicted another.

---

## R-1 · Has the token extraction already been done, or is it work for this feature?

**Checked:** `docs/sdd/design/tokens.css` in full, against
`docs/sdd/design/design-tokens.md`'s extraction status table and ADR-009's
*Status of the extraction* section.

**Settled: the extraction is done.** `tokens.css` carries ~90 custom properties across
primitives, semantics, typography, spacing, geometry, components, and shell geometry —
every one already labelled `(A)` vector export, `(B)` shipped-app screenshot,
`(C)` Figma layer inspect, or `(D)` our decision, plus nine notes explaining the
non-obvious ones.

**Consequence for the plan, and it is a large one:** the day is not spent extracting.
It is spent on three things the file does *not* yet contain:

| Missing | Why it matters |
|---|---|
| The `--brand-*` ramp | ADR-012's cost table says "Token restructure into brand versus fixed — **already done**". It is not. There is no `--brand` token in `tokens.css`; `--action-primary-bg` points directly at `--navy-900`. The restructure is real work and it is in this feature |
| `--on-brand` | Not present. `--action-primary-text` points at `--Main-White-White`, which is the hard-coded white ADR-012 §2 names as the single most common failure in configurable theming |
| Any interaction state | `design/design-tokens.md` records "Interaction states — **Not extracted**", and the source's own notes list hover as unresolved. Every hover, active, focus, and disabled value in `frontend-spec.md` is therefore ours, and is labelled `(D)` |

**Rejected:** treating ADR-012's "already done" as accurate and skipping the
restructure. Reading the file settles it in thirty seconds, and the cost of believing
the ADR would have been discovering it while wiring the first Primary button.

---

## R-2 · Is `color-mix(in oklab, …)` actually usable, and what happens when it is not?

**The whole brand ramp depends on it.** ADR-012 §1 specifies five derivations in
`oklab`, with the argument that a fixed percentage in a perceptual space steps
consistently across every hue while the same percentage in HSL does not.

**What was checked:** the failure mode, not the support table — because the support
table changes and the failure mode does not.

**What was found, and it is the important part:** an unsupported or malformed
`color-mix()` in a custom property does not fall back to the previous value. The
declaration is invalid at computed-value time, the property resolves to `unset`, and a
`background: var(--brand-hover)` therefore resolves to **transparent**. A Primary button
with no background reads as a page that failed to load, not as a browser that lacks a
CSS feature.

**Settled:**

1. Every brand-derived token is declared **twice** — a static hex first, the
   `color-mix()` second. A browser that cannot parse the second keeps the first; one
   that can, overrides it. This is the standard progressive-enhancement form for custom
   properties and it costs six lines.
2. **AC-8 tests the resolution rather than trusting it**: read `--brand-hover` from
   `getComputedStyle` and require a parsed colour, not the literal `color-mix(...)`
   string and not an empty string.

**Rejected:** computing the ramp in TypeScript and writing six hex values to `:root`.
It removes the browser dependency entirely and it was genuinely tempting. Rejected
because it moves the derivation out of the cascade — a component can no longer override
a single step, `currentColor` inheritance on icons stops working the way ADR-012 relies
on, and the ramp then has to be recomputed and re-applied on every theme change instead
of following one variable. The fallback pair gets the safety without the loss.

---

## R-3 · Which three primitives, and why not `Select`?

**Checked:** `design/component-inventory.md`'s *Used by* column against the Phase 0–2
feature list in `specs/README.md`.

| Primitive | First consumer | Verdict |
|---|---|---|
| `Button` | `007` — every form and every action | **Build.** Nothing renders without it |
| `Input` | `007` — the customer form | **Build.** `007` needs five of them, one multiline |
| `Badge` | `010` — the ticket list | **Build.** Nearly free: a pill, a dot, and a label. And it is the only primitive that encodes domain meaning, so getting the twelve-variant map into one file early stops it being re-derived per screen |
| `Select` | `009` — category, priority, channel | **Do not build.** The largest of the eight: open/close, keyboard traversal, type-ahead, a portal for the popup, an RTL popup anchor, and a mobile fallback. It cannot be finished well inside the remaining hours, and ADR-009 names exactly this outcome — "half-built custom controls look broken" |
| `Checkbox` `Table` `Modal` `Toast` | `013` `008` `012` `007` | Do not build. Each arrives with the screen that needs it |

`Toast` is the near-miss: `007` needs one, and `design/screens/10-shared-patterns.md`
already specifies it down to the auto-dismiss timings. It is excluded anyway because a
toast is a *system* — a portal, a stack, a queue, a timer per item, and a manual-dismiss
path for errors — not a component, and `007` can report a mutation result inline until
it exists.

**Settled: Button, Input, Badge.** The brief's three, and the reasoning independently
lands on the same three, which is worth recording because it means the cap is defensible
rather than inherited.

---

## R-4 · Do the sidebar presets and the theme endpoint belong here?

**Checked:** ADR-012's recommendation and `design/theming.md`'s preset table against
what exists in Phase 0.

**Settled: no, and this question turned out not to matter — which is itself the
answer.** The three sidebar presets are specified in `design/theming.md` and there is no
sidebar to apply them to until the app shell exists (`008`). Building them now would
produce three token sets with no consumer, which `design/component-inventory.md`'s own
definition of done calls speculative work.

**What *does* belong here** is narrower and is the part with a retrofit cost: the split
between themeable and fixed, the derivation, and `onBrand()`. ADR-012's own
recommendation says so — *"build the architecture in the skeleton, defer the settings
screen"* — and the Brand preset is correct by construction once `--on-brand` exists,
because that is the only value it needs.

**Recorded because it was checked and dismissed:** the theme HTTP surface. ADR-012 says
the theme ships in the bootstrap or auth response. There is no auth response until
`004` and no bootstrap endpoint anywhere yet, so freezing a shape here would freeze a
guess. `contracts/README.md` says this rather than inventing an endpoint.

---

## R-5 · Radius: 4px or 8px? The blueprint says both

**The disagreement, stated exactly:**

| Source | Value | How it was obtained |
|---|---|---|
| ADR-009, *Two sources and they disagree* | "~8px on inputs and buttons" for the shipped app, and **the shipped app wins** | Measured from a screenshot |
| `tokens.css` note 7 | `--radius-sm: 4px`; inspect reports the named token `Radius: SM`; exports measure 3.5–4.5 | Figma layer inspect, plus vector exports at 1:1 |

Both are house rules and they contradict each other on this value.

**Settled: 4px.** Two rules are in play, and the second is stronger than the first:

- ADR-009's rule is about **which product** is authoritative — shipped over Figma.
- `tokens.css` note 1's rule is about **which method** is authoritative — *"Never sample
  geometry off a picture"*, written immediately after the sidebar width was wrong twice
  for exactly that reason (226 and 320 both measured from renderings; the layer says
  288).

The 8px figure is a measurement off a picture. The 4px figure is a layer value. A rule
about method beats a rule about source when the source rule is being applied through the
method it forbids.

**Containment, and this is why it is a cheap thing to be wrong about:** if 8px is
correct it is **one line** — `--radius-sm` — and every primitive follows, because no
component contains a radius literal (AC-17).

**Recorded as `spec.md` Q-A** rather than settled silently, because a reviewer looking
at ADR-009 will reach for 8px and should find the reasoning already written down.

---

## R-6 · The 7px gap between a Button and the field beside it

**Found while building the geometry table, not looked for.**

`--button-height-md` is 40px `(C)`. `--field-height-md` is 47px `(A)`. In a form, a
submit button next to a text field is 7px shorter than it, and in a filter toolbar a
Button next to a search Input is 7px shorter than it. Both numbers are from real
sources; neither is a mistake.

**What was checked:** whether any token reconciles them. None does. `layout-patterns.md`
puts the login page's inputs at "~48px" `(B)` — a third number, measured from a picture,
which R-5's rule discards.

**Settled: 40px, and stop there.** DESIGN-BRIEF rule 3 is explicit — *"If a needed token
does not exist, stop and say so. Do not invent one. An invented token is
indistinguishable from a real one until someone tries to change it upstream, and then it
silently does not change."* So no `--button-height-field` is created here.

The decision belongs to the first screen that places a Button inline with a field, it
will be visible in that screen's Phase-3b preview, and the preview is the cheapest place
for it to be noticed. Recorded as `spec.md` Q-B.

**Rejected:** quietly setting Button to 47px to match. It contradicts an inspected value
for the sake of a screen that does not exist yet, and it makes every standalone button in
the product 7px taller than the design says.

---

## R-7 · Two focus-ring specifications, and one chip height

Two smaller contradictions found by reading the documents against each other:

| Value | Source A | Source B | Settled |
|---|---|---|---|
| Focus ring | ADR-012 §1: `--brand-ring` = `color-mix(in oklab, var(--brand) 22%, transparent)` | `screens/10-shared-patterns.md`, form field: "3px ring at 10%" | **22%, one token, everywhere.** The ADR defines a token; the shared-patterns figure is prose with nothing behind it and predates the ramp. Two ring intensities in one interface is the inconsistency the token layer exists to remove |
| Badge height | `tokens.css` `--chip-height: 20px` `(A)` | `screens/10-shared-patterns.md`: "Pill h22" | **20px, from the token.** A component that hard-codes 22 to match a sentence has hard-coded a decision belonging to the token layer, and it is then invisible to a token refresh |

Both recorded in `spec.md` (Q-C, Q-D). Both are one value in one file if the other
answer turns out to be right.

---

## R-8 · Where does the frontend's i18n scaffolding live — `005`, `006`, or `007`?

**Checked:** ADR-007 §1 (*"the infrastructure is built in the walking skeleton, before
the first story"*) against `specs/README.md`, which gives `005-localization-core` a
server-side exit condition and `014-language-preference-and-rtl` the switch.

**The tension:** ADR-007 says build i18n infrastructure early. This feature is early.
But `react-i18next` with no catalogue and no string is scaffolding with nothing in it.

**Settled by looking at what the primitives actually contain:** nothing. Every label,
placeholder, helper, and error arrives as a **prop** — that is `design/component-inventory.md`'s
rule (*"No user-facing string inside the component"*), and it is enforced here by AC-24.
So this feature introduces **zero i18n keys**, and there is nothing for a catalogue to
hold.

The split that follows:

| Piece | Owner | Reason |
|---|---|---|
| `react-i18next`, the catalogues, the parity test | `007` | The first user-facing string exists there |
| The switch and the Arabic walk | `014` | Its story |
| `dir` and `lang` **on the document root**, and the `[lang="ar"]` typography block | **`006`** | AC-21 and AC-22 cannot be verified without them, and the leading values are token work, not string work |

So ADR-007's "early" is honoured for the part that is CSS and skipped for the part that
is strings. Recorded because an auditor comparing this feature against ADR-007 will
otherwise read the absence of `react-i18next` as an omission.

---

## R-9 · Tailwind, CSS Modules, or plain CSS?

**Checked:** ADR-003's superseded styling line ("not a design exercise, utility CSS, no
component library"), ADR-009's supersession of it, and ADR-011's file layout.

**Settled: CSS Modules, colocated with each component. No preprocessor.**

| Option | Why not |
|---|---|
| Tailwind + a token plugin | A second naming system on top of the tokens, and every semantic token then has a utility class alias — so a component can express the same decision two ways and the "semantic tokens only" rule (AC-18) becomes unenforceable. It also adds a build step. ADR-009 superseded the utility-CSS line, so there is nothing to honour |
| Plain global CSS with a `wasl-` prefix | Works, and depends on everyone remembering the prefix. Constitution principle V: where a rule can be made structural, make it structural |
| Sass / PostCSS nesting | A preprocessor to solve a problem three components do not have |
| **CSS Modules** | **Chosen.** Zero configuration in Vite, scoping without a convention to remember, and it leaves the values in plain CSS where a token refresh diff is readable |

---

## R-10 · Storybook, or a preview route?

**Checked:** ADR-011's *deliberately not done* table, `design/component-inventory.md`'s
definition of done for a primitive (*"every state implemented and visible in
isolation"* **and** *"used by at least one real screen"*), and
`design/preview-first-workflow.md`.

**The tension:** the two halves of the primitive DoD cannot both hold in Phase 0. There
is no real screen yet.

**Settled: one preview route**, `/_preview`, not registered in the production route
table, rendering every state of all three primitives with a direction toggle and a
language toggle.

It satisfies "visible in isolation" now, and it becomes the Phase-3b preview harness
that `007` and `008` reuse — which is the difference between throwaway scaffolding and
something the workflow already requires. `preview-first-workflow.md` says a preview is
"static HTML or a single throwaway component" and is thrown away; this one is kept
because the *harness* is reused and only the screen inside it is disposable.

**Storybook rejected**, per ADR-011: genuinely useful for a design system, and
disproportionate for three primitives in one week. It also brings its own build, its own
config, and its own set of addons to keep current, all of which is time that ADR-009's
timebox does not have.

---

## R-11 · Fonts: CDN or self-hosted, and does the Arabic family exist?

**Checked:** `tokens.css`'s `--font-sans` and `--font-ar`, and `11-open-questions.md`
Q-13/Q-15.

**Two separate questions, and only one is settled here.**

**Delivery — settled: self-hosted `woff2` under `public/fonts`.** A CDN link fails
silently offline, and the failure substitutes a fallback face nobody chose — which is
*exactly* the Q-15 defect, reproduced by an infrastructure decision rather than a design
one. NFR-7 also asks that the system runs from a clean clone in documented steps, and a
font that needs the network is a step that is not in the document.

**The Arabic family — not settled, and deliberately not.** `IBM Plex Sans Arabic` is the
working assumption (`spec.md` Q-15): a separate family by the same designers, and the
obvious pairing for `IBM Plex Sans`. Two honesty notes:

- **The licence was not verified in this session.** No package was fetched and no
  `OFL.txt` was read. `design/icons.md` sets the rule for exactly this situation —
  *"verify the licence in the repository before shipping, do not take it on trust"* — and
  that verification is `FE-006-12`, not something this document may assert.
- The design's Arabic layer reports `IBM Plex Sans`, which has no Arabic glyphs. So the
  Arabic in the source designs is a fallback nobody chose. Setting `--font-ar` here is
  therefore a **decision being made for the first time**, labelled `(D)`, and it must not
  be presented as an inheritance.

---

## R-12 · What does the Vite React-TS template ship that has to be removed?

**Checked:** what a fresh `react-ts` scaffold contains, against the rules this feature
has to satisfy on day one.

**Found — three things that are defects here rather than defaults:**

| Template item | Why it must go |
|---|---|
| `index.css` and `App.css` | They carry literal colours, a `prefers-color-scheme: dark` block, and a `.logo` animation. Left in place they are the **first hard-coded colour in the repository**, they contradict DESIGN-BRIEF rule 16 (`color-scheme: light`, one appearance), and they would be the first thing AC-17's script trips over |
| The `App.tsx` counter demo and its assets | Dead code in the first commit |
| `react` vs `react-swc` plugin choice | **Turned out not to matter.** Both produce the same output for this codebase; SWC is faster on a large tree and there is no large tree. Recorded so the question is not re-opened |

**Settled:** the scaffold is generated and then stripped in the same task
(`FE-006-01`), and `AC-1`'s zero-warning build plus AC-17's literal check are what prove
the strip was complete. Deleting template CSS is the kind of task that gets 90% done.

---

## R-13 · How are the token rules enforced — a plugin, or a script?

**The rules needing enforcement:** no literals in components (AC-17), no primitive
tokens in components (AC-18), no physical direction properties (AC-19), no barrel files
(AC-3), no JSX literal strings in primitives (AC-24), every token labelled (AC-4).

**Checked:** what can be enforced with a rule that is certain to exist, versus what
needs a plugin whose current API would have to be confirmed.

**Settled: prefer a twenty-line script over a plugin whose surface has to be
verified.** Constitution principle VI requires every referenced package, API, and method
to be confirmed to exist, and confirming six plugin configurations costs more of the
timebox than writing the checks does.

| Rule | Enforced by |
|---|---|
| AC-17, AC-18, AC-4, AC-3 | `scripts/*.mjs`, run by `npm run lint:tokens` and in CI. Each is a regex over a file list, each prints the offending file and line, each exits non-zero |
| AC-19 | stylelint `property-disallowed-list` plus `declaration-property-value-disallowed-list` — built-in rules, no plugin |
| AC-24 | ESLint `no-restricted-syntax` on `JSXText` under `src/components/` — a built-in rule |
| AC-14 | stylelint, asserting the three declarations on every control selector in `base.css` |

**Rejected:** relying on review for any of them. DESIGN-BRIEF rule 17 records that its
own rule was violated twice *after* being written down, and concludes: *"A written rule
is not a control."* That sentence is the reason this row exists at all.
