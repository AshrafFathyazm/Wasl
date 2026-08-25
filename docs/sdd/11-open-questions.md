# Open Questions

Questions that genuinely block a decision, and the working assumption used until they
are answered. Guessing silently is the failure mode this file exists to prevent.

Each question records: what is unclear, why it matters, what is assumed in the
meantime, and who can resolve it.

---

## Q-1 · What does the Productivity criterion measure?

**Status:** Open — for the evaluator

The assessment sheet allocates 10 points to a *Productivity* axis, but the criterion
name and the "what is measured" description are both blank in the sheet.

**Why it matters:** the behaviour that maximises this criterion differs sharply
depending on the answer. Delivery speed rewards taking on more scope; percentage of
committed scope completed rewards committing to less; rework volume rewards slower,
more careful first passes.

**Working assumption:** it measures completed committed scope and low rework, not
raw output volume. `12-delivery-log.md` is maintained on that basis, recording what
was committed, what was delivered, and what was reworked.

---

## Q-2 · How is the Quality & Understanding gate calculated?

**Status:** Open — for the evaluator

The gate is stated as a minimum of 24 out of 40 on the Quality & Understanding axis,
but the weights listed for that axis in the same sheet sum to 20 (10 + 5 + 5).

**Why it matters:** the denominator changes what "passing the gate" requires. If the
raw score is out of 20, the threshold cannot be 24. If the axis is scored 1–5 per
criterion before weighting, the maximum may be computed differently.

**Working assumption:** the gate is real and strict regardless of the arithmetic.
Quality is treated as a pass/fail condition, not as points to be traded away.

---

## Q-3 · Is the database choice constrained?

**Status:** **RESOLVED — SQL Server** (2026-08-23, by the product owner)

The program deck lists *SQL Server integration* under the .NET backend track. The CRM
requirements do not require any SQL Server-specific feature, so the blueprint originally
defaulted to PostgreSQL and recorded the switch cost rather than guessing.

**Answer:** SQL Server 2022. The house platform (`AzmFormBuilder`) also runs
`Microsoft.EntityFrameworkCore.SqlServer`, so this is both the specified answer and the
familiar one.

**What changed as a result:** `decisions/ADR-013-database-sql-server.md` supersedes
ADR-001 and amends ADR-006. The four provider-coupled points are specified there:
`rowversion` for the concurrency token, filtered unique indexes for the duplicate rule,
an explicit case-insensitive collation on `Email`, and `nvarchar` for anything a human
writes. `03-domain-model.md`'s physical shape is rewritten in SQL Server types.

**Worth noting at review:** ADR-001 said *"if the reviewer expects SQL Server, the
decision should be revisited rather than defended."* It was, and this is the record of
it. The original PostgreSQL reasoning is kept in ADR-001 rather than deleted.

## Q-4 · Is the frontend framework constrained?

**Status:** RESOLVED — React

The Week 3 exercise specifies Angular or Vue.js. The final assignment brief lists
"frontend screen" without naming a framework, and React appears in the program's
target technologies.

**Why it matters:** framework choice affects how much of the score reflects
engineering judgement versus framework familiarity.

**Working assumption:** React + TypeScript. See `decisions/ADR-003-frontend-stack.md`
for the reasoning and the conditions under which Angular is the better answer.

---

## Q-5 · Is there a session time limit, and what is it?

**Status:** **RESOLVED — three calendar days, deadline Wednesday 26 August, about nine
hours of realistic working time.**

**Why it mattered:** the cut line in `08-board.md` between Release 1 and Release 2
depended on it. This question said: *under four hours, only US-001, US-005, US-007, and
US-008 are realistic at full quality.*

**The answer landed almost exactly there.** Nine hours across three sessions, with the
skeleton still to build, commits to US-005, US-007, US-008, and US-001 **seeded rather
than built through the UI**. The estimate was written before the deadline was known and it
held, which is worth more than an estimate being generous.

**What changed as a result:** `08-board.md` gains a three-day constraint section above its
release tables, and `16-three-day-plan.md` is the nine-hour cut of `PHASES.md` — three
sessions of three hours, with every cut pointing at where its design already lives.

**One consequence, and it was resolved rather than left open.** `08-board.md`'s compression
section says localization and the audit behaviour are never cut; the nine-hour budget
cannot afford them in full. The answer was neither — both are **reduced to their minimum
useful form**: the catalogue and the Arabic strings without the switcher screen, the table
and the pipeline behaviour without the read endpoint. Roughly 1h45 rather than three hours,
and **US-007 stays in the committed scope**.

The reasoning is that the expensive half of each was never the capability, it was the
retrofit — and the retrofit is only expensive if the discipline is skipped at the start.
Detail in `16-three-day-plan.md`; the decision is recorded in `12-delivery-log.md`, which
supersedes the "never cut" line rather than contradicting it. **A changed constraint
producing a changed decision is what the delivery log is for.**

---

## Q-6 · Is the demo live or recorded?

**Status:** Open — for the evaluator

**Why it matters:** `14-demo-script.md` is written as a live walkthrough. A recorded
demo needs a different structure and a seeded dataset prepared in advance.

**Working assumption:** live, with a seed script available so the flow can be shown
from a known state.

---

## Q-7 · Arabic search normalisation

**Status:** Deferred, with a known fix — not open

Arabic names are written inconsistently. `أحمد`, `احمد`, and `إحمد` are the same name
with different hamza forms; `ة` and `ه` are interchanged at word endings; `ى` and `ي`
likewise; and optional diacritics may or may not be typed. A literal substring search
matches none of these against each other.

**Why it matters:** customer search (US-002 AC-7) is the preventive half of the
duplicate rule. If an agent searches `احمد` and the record was saved as `أحمد`, they
will not find it, and they will create the duplicate that BR-4 exists to prevent —
for a customer with a phone number and no email, BR-4 will not catch it either.

**Why it is deferred rather than solved:** the fix is real work — a persisted
`SearchName` column holding the normalised form, a normaliser applied on write, an
index on it, and the same normaliser applied to the search term. That is a story, not
a task, and it is not needed to demonstrate the flow.

**The intended fix, written down so it is not reinvented:** normalise `أإآٱ` → `ا`,
`ة` → `ه`, `ى` → `ي`, strip tashkeel and tatweel, then store the result alongside the
original. Search the normalised column and display the original. Applied to
`Customer.FullName` and `Ticket.Subject`.

**Current behaviour:** literal case-insensitive substring matching in both languages.
This is a stated limitation, not an oversight.

## Q-8 · Who writes the Arabic translation?

**Status:** Open — for the evaluator

The catalogues need Arabic copy that reads as though a support tool wrote it. Machine
translation of interface strings produces text that is technically correct and
obviously not human, which in a support product reads as carelessness.

**Working assumption:** the Arabic copy is written by a person who reads Arabic, and
reviewed. If it will not be reviewed, that is worth knowing before the catalogue is
filled.

## Q-9 · What is the audit log retention period?

**Status:** Open — for the evaluator, and ultimately for whoever owns compliance

The audit log grows without bound and contains personal data: customer emails and
phone numbers appear in change diffs.

**Why it matters:** indefinite retention of personal data is a liability in most
regimes, and deleting too early destroys the record an investigation would need. The
two failure modes point in opposite directions, so this cannot be split the difference.

**Why it is not an engineering decision:** the answer comes from legal or regulatory
requirement, not from what is convenient to implement.

**Working assumption:** retained indefinitely for the MVP, with no purge job. Recorded
as a liability rather than presented as a feature. Nothing in the application deletes
audit rows (BR-9.13), so adding a retention job later is additive.

## Q-10 · Should reads of customer data be audited, not just writes?

**Status:** Open — for the evaluator

FR-6.1 covers state changes. Reading a customer's contact details changes nothing and
is currently not recorded, so "who looked at this customer" has no answer.

**Why it matters:** in a support context, inappropriate *access* is a more common
problem than inappropriate *modification*. An agent browsing records they have no
reason to open leaves no trace today.

**Why it is not simply switched on:** auditing every read multiplies the table's volume
by roughly the read-to-write ratio, which in a CRM is large. It also makes the retention
question in Q-9 considerably sharper.

**Working assumption:** writes and auth events only. If read auditing is required, the
proportionate version is auditing reads of a single customer record — not list queries —
and that is a story of its own.

## Q-13 · What is the typography, and what is the spacing scale?

**Status:** RESOLVED, except the Arabic family (now Q-15)

| | Answer | Source |
|---|---|---|
| Family | **IBM Plex Sans** | Layer inspect. Open source, on Google Fonts — no licence question |
| Weights | 400 and 700 confirmed on layers; 500 named in the scale but not yet seen | Layer inspect |
| Sizes | Heading 36/30/24/20/16/14 · Title 22/18/16 · Body 18/16/12 · Label 16/14/12 · Caption 12 | Text styles panel |
| Line height | **100%** | Layer inspect. The styles list abbreviates it as "Auto"; the inspector is per-layer and resolved, so it wins |
| Vertical trim | **Cap height** | Layer inspect |
| Letter spacing | 0% | Layer inspect |
| Spacing scale | **8pt grid, and it holds all the way up** — 8, 16, 24, 56 all confirmed; 56 = 7×8. 1px borders | Layer inspect |
| Shell geometry | Sidebar **288px**, header **68px**, content 1152×956 padded 56 with gap 24. Arithmetic closes exactly against a 1440×1024 frame | Layer inspect |
| More colour tokens | `Neutral/00` = `#F9FAFB`, `Neutral/200` = `#DEE5E7`, `Main/White&White` = `#FFFFFF` | Layer inspect |
| Colour tokens | In **Variables**, slash-namespaced: `Text/Primary` = `#0D2626`, `Neutral/800` = `#606873` | Layer inspect |

**Correcting an earlier reading:** the colour system is not missing. The Color *styles*
panel was mostly scratch entries, but layer inspect shows proper namespaced variables.
Both confirmed values match what was already extracted from the vector export — the
extraction was right, it just lacked the names. Pull the full Variables collection when
the Figma budget allows and rename the primitives in `tokens.css` to match theirs, so a
future handover needs no translation table.

**The finding that matters most:** 100% line height combined with cap-height vertical
trim. For single-line Latin labels that is tidy. For Arabic it clips — Arabic glyphs sit
well below the baseline and carry marks above cap height. It will present as a font
rendering fault rather than a missing token, which is exactly why it would survive
review. The fix is in `design/tokens.css` as `--leading-ar-*`, plus not applying
cap-height trim to Arabic at all.

**Original status:** Open

**Answered from the Figma Text styles panel:** five style families — Heading (36 / 30 /
24 / 20 / 16 / 14), Title (22 / 18 / 16), Body (18 / 16 / 12), Label (16 / 14 / 12),
Caption (12) — each in Bold, Medium, and Regular. All now in `design/tokens.css` with a
semantic mapping onto this product's surfaces.

**Still unknown, and each needs one action:**

| Gap | How to close it |
|---|---|
| The typeface | Click into any text style, or select a text layer and read the type panel |
| The Arabic face | Same, on an Arabic text layer if one exists |
| Spacing scale | The Properties panel does report padding and gap on a selected element — the screenshot shows 16 padding, 8 inline, 1 border. Select a few representative elements and see whether the numbers land on a 4pt or 8pt grid |

**Two findings worth more than the numbers:**

- **Every text style is set to `Auto` line height.** Nothing in the system pins
  leading. That is fine for Latin and wrong for Arabic, which needs more at the same
  size. The source has no answer to inherit, so this becomes our decision — see
  `design/tokens.css`, note 2.
- **Colour is not in Styles.** The Color styles panel holds about ten entries, several
  named `Test`, `test`, `Trial`, `background`. Only `Abyan - Dark Blue` and the two
  website gradients read as real tokens; there is no grey ramp and no success /
  warning / danger set. Either the colour system lives in the **Variables** panel — a
  different panel from Styles, and the one `get_variable_defs` reads — or it does not
  exist as tokens. The file's own note listing "Set Coloring & Typography" as open
  makes the second possibility real.

**Original status:** Open — blocks finishing the token set

The design export supplied has its text outlined to paths, so the font family, sizes,
weights, line heights, and the Arabic font are all unrecoverable from it. The spacing
scale is likewise not inferable — gaps are measurable, but whether the system is 4pt or
8pt is a fact about the design file, not about the drawing.

**Why it matters:** typography is most of what makes an interface feel like a specific
product. Colours alone get part of the way; the wrong type at the right colours still
reads as a different application.

**How to close it:** the Figma text styles and variables panels, or `get_variable_defs`
via the connector. One pass, a few minutes.

**Working assumption:** `tokens.css` carries a labelled placeholder. It is marked as a
placeholder rather than filled with something plausible, because a plausible font looks
deliberate and is wrong in a way nobody catches.

## Q-14 · Where is the login page design?

**Status:** Partially answered — a screenshot of the shipped login page is available

The shipped login is a split layout: dark navy brand panel with a dot grid and blurred
blue-to-teal gradient orbs on one side, form on the other, language switcher top-right,
filled inputs, full-width primary button, footer copyright.

Enough to build against. Two things still unknown: the exact gradient stops and blur
radius of the orbs, and whether the panel artwork is an image asset or CSS. Both are
answerable from Figma or from the running app's stylesheet.

**One trap worth recording:** in the screenshot the primary button renders muted purple
because the captcha is unchecked — that is the **disabled** state. The brand primary is
the navy used by the sidebar CTA and the active pagination page. Reading a disabled
state as a brand colour is an easy mistake and an expensive one, because it then
propagates to every button in the product.

**Original status:** Open

The supplied export covers the All Requests module only. There is no authentication
screen in it.

**Why it matters:** it is the first screen anyone sees in the walkthrough, and it is the
one screen with no functional equivalent elsewhere to borrow conventions from.

**Working assumption:** if a design is not supplied, the login screen is built from the
tokens as original work — centred card, brand mark, the standard Input and Button
primitives, error state on failed sign-in — and `frontend.md` records that it is
original rather than inherited. Claiming it matches a design that was never seen is the
one thing not to do.

## Q-15 · Which Arabic typeface, and was the current one ever chosen?

**Status:** Open — and the answer may be that nobody has decided yet

An Arabic layer in the design (`الصفحة 01`) reports its font as **IBM Plex Sans**.
IBM Plex Sans contains no Arabic glyphs, so that layer is rendering through a fallback —
whatever typeface the machine happened to supply. Which means the Arabic in the designs
is very likely not a choice anybody made.

**Why it matters:** the Arabic face is half the typography of a bilingual product, and
it is the half nobody reviews because the reviewers read English. Inheriting an
accidental fallback is worse than choosing deliberately, because it looks settled.

**Working assumption:** `IBM Plex Sans Arabic` — a separate family by the same
designers, open source, and the obvious pairing. Set in `--font-ar`.

**Ask before committing.** If the Arabic was never deliberately set, this is a decision
being made here for the first time and should be visible as one rather than presented as
inherited.

## Q-11 · Is reusing the existing design assets permitted, and how far?

**Status:** Open — must be answered before any frontend work

The assignment is internal, and reusing the company's own visual language for it is the
natural thing to do. Two distinctions are worth confirming rather than assuming:

- **Tokens and component specs** versus **client branding**. A colour ramp and a
  spacing scale are internal design language. A client's logo, product name, or
  distinctive brand marks are a different category, and the platform is built for an
  external client.
- **Where the work is stored and who sees it.** An internal repository reviewed by the
  team is not the same as a public portfolio.

**Why it matters:** it is a one-question conversation now and an awkward one later.

**Working assumption:** tokens, spacing, typography, and component specifications are
in scope. No client logo, no client product name, no client-specific imagery. This CRM
is presented as its own product wearing the house style.

## Q-12 · Does an implemented component library exist, or only Figma files?

**Status:** RESOLVED as a framework question — React is chosen regardless

The question existed to decide the framework. With React confirmed, an Angular
component library could not be reused even if it exists, so the answer no longer
changes any decision. The cost of that is recorded in ADR-003.

What remains useful is narrower: knowing whether Code Connect mappings exist tells you
whether `get_design_context` will return mapped components or raw layout. Worth one
call when the Figma budget allows, not worth blocking on.

**Original status:** Open — must be answered before any frontend work

**Why it matters:** this decides the framework.

- **Implemented Angular components exist** → Angular means inheriting working
  components with their states, accessibility, and right-to-left behaviour already
  solved. React means reimplementing all of it from a Figma reference for the same
  visual result. Angular becomes the clear answer and ADR-003 should change.
- **Only Figma files** → tokens extract to either framework equally well, the argument
  is neutral, and ADR-003's original reasoning stands.

**How to answer it cheaply:** `get_code_connect_map` on the design file reports whether
Figma components are already mapped to code. Failing that, one question to whoever owns
the frontend.

**Working assumption:** unknown, therefore ADR-003 stands unchanged until checked. This
is an assumption held only because the question has not been asked, which is the worst
reason to hold one — ask it first.

## Q-16 · The scope document specifies no deliverables — what is the definition of done?

**Status:** Open — for the evaluator. **Needs confirming, and it is cheap to confirm.**

The supplied product scope document (`azm_squad_customer_support_crm.pdf`) lists twelve
sections and roughly sixty features. It specifies **no deliverables, no acceptance
criteria, no technical constraints, and no evaluation criteria**.

That is not a gap in the document — it is a product scope list, and a product scope list is
not supposed to contain any of those. But it means the definition of *submitted* has to
come from somewhere else.

**Why it matters:** the two candidate readings produce different work.

| Reading | What it asks for |
|---|---|
| The scope document is a **backlog** | Attempt sixty features. In nine hours that produces twelve broken ones |
| The scope document is a **requirements source** | Select a coherent slice, deliver it end to end at full quality, and document what was cut and why |

**Working assumption: the second**, and the deliverables list is taken from the programme
deck's Week 4 brief, which does specify them:

> Backend endpoint · data model or persistence · frontend screen · API integration · form
> validation · error handling · a basic test or documented manual testing evidence ·
> `README` with setup and run steps · AI usage notes · a short demo or walkthrough.

Every one of those is on the build path in `16-three-day-plan.md`, and each maps to an
artifact this repository already produces.

**Why the second reading is the safer bet even if wrong:** the assessment sheet weights
*Planning & Task Breakdown* at 20 — the highest single weight — and *Requirement &
Specification* at 10. Both reward a defended scope decision. Neither rewards breadth. And
the Quality axis is a gate, so twelve half-features fail it outright regardless of the
total.

**What confirming it would change:** nothing about the plan, and everything about the
confidence with which it is presented. `15-scope-coverage.md` exists to make the selection
auditable either way.

---

## Resolved

*(Move questions here with the answer and the date once they are settled.)*

| ID | Question | Answer | Resolved on |
|---|---|---|---|
| Q-4 | Is the frontend framework constrained? | No. React confirmed. See ADR-003 | This session |
| Q-12 | Does an implemented component library exist? | Moot as a framework question once React was chosen. See ADR-003 | This session |
| Q-3 | Is the database choice constrained? | **Yes — SQL Server.** See ADR-013 | 2026-08-23 |
| Q-5 | Is there a session time limit? | **Three days, deadline 26 August, about nine hours.** See `16-three-day-plan.md` | 2026-08-24 |
