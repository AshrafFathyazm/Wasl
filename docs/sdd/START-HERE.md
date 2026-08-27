# Start Here

The day-one runbook. Everything else in this repository is reference; this is the
order to actually do things in.

> **`PHASES.md` is the plan.** `16-three-day-plan.md` is superseded — see below.

## The schedule, first

**Three additional days were granted on 2026-08-27.** The nine-hour constraint this file
opened with is gone.

**`PHASES.md` governs.** It totals 21–25 hours and is now simply the schedule rather than
the reference a schedule was cut from. `16-three-day-plan.md` is marked superseded and kept
as history: the cuts in it were argued, and the argument is worth more than the plan was.

| Read this | For |
|---|---|
| **`PHASES.md`** | **The plan.** Phases, task by task |
| `16-three-day-plan.md` | **Superseded 2026-08-27.** The nine-hour cut, kept as the record of what was deferred under a hard constraint and why |
| **`15-scope-coverage.md`** | The twelve sections of the supplied scope document mapped to `Delivered` / `Partial` / `Designed, not built` / `Out of scope`, with a real argument for each of the seven cuts |

**Committed scope:** US-005 create ticket, US-007 assign, US-008 change status, and US-001
customer **seeded** rather than built through the UI. That is Ticket Management end to end
— the whole of section 2 of the scope document.

Two things worth knowing before reading further:

- **The scope document lists roughly sixty features and specifies no deliverables.** So
  scope selection is part of what is being assessed, not an obstacle to it
  (`11-open-questions.md` Q-16).
- ~~**The nine-hour plan cuts localization and the audit log**, and the compression section
  of `08-board.md` says neither is ever cut.~~ **Resolved twice.** First by reducing both to
  their minimum useful form rather than cutting them, which is what shipped: `dbo.AuditLog`
  and the audit behaviour are built, and every server-authored message is a symbolic key
  rather than a sentence. Then by the constraint being lifted on 2026-08-27, which makes the
  deferred halves — `005`'s catalogues, `019`'s read endpoint — buildable rather than cut.

---

## Before you write a line: four questions, five minutes

Three go to the evaluator, one to whoever owns the design file. Ask them together.

| Ask | Why it matters now | If no answer comes |
|---|---|---|
| ~~How long is the session?~~ (Q-5) | **ANSWERED, then extended: three days, about nine hours — plus three more days granted 2026-08-27.** `PHASES.md` is the plan | — |
| ~~Is SQL Server expected?~~ (Q-3) | **ANSWERED: SQL Server.** See `decisions/ADR-013-database-sql-server.md` | — |
| **Is the demo live or recorded?** (Q-6) | `14-demo-script.md` is written for live | Assume live, seed a dataset anyway |
| **Is reusing the house design system fine, and does that exclude client branding?** (Q-11) | You are about to build on their tokens | Tokens yes, no client logo or product name |

Two more are worth asking but do not block: what the Productivity criterion measures
(Q-1), and which Arabic typeface (Q-15).

**Asking a specific question raises your score on Requirement & Specification. Guessing
silently lowers it.** That is the criterion, in one sentence.

---

## Then: follow the phases

`PHASES.md` breaks the build into seven phases, each ending in something that works. If
time runs out you stop at a boundary with a demonstrable product rather than mid-story.

The ordering principle there replaces the "put everything in the skeleton" advice below:
**add a cross-cutting concern at the moment there is exactly one consumer.** Zero is
speculative, seven is a retrofit, one is free.

## The skeleton, in outline

Under the nine-hour constraint this was **roughly the first session and a half**, not two
days — see `16-three-day-plan.md`. It is not a story. Nothing can be verified before it
exists, and three of its parts cost almost nothing now and a rewrite later.

| # | Piece | Why first |
|---|---|---|
| 1 | Solution structure, `DbContext`, migrations, health endpoint, CI | Nothing runs without it |
| 2 | JWT auth with two seeded users (ADR-005) | Every authorization test depends on it |
| 3 | `ProblemDetails` middleware + the error contract (`05-api-conventions.md`) | Retrofitting an error contract means touching every endpoint |
| 4 | **Localization infrastructure, both sides** (ADR-007) | Retrofitting means revisiting every string and every stylesheet. `UseRequestLocalization()` **after** `UseAuthentication()` — this fails silently |
| 5 | **Audit pipeline behaviour + architecture test** (ADR-008) | An audit log added after the handlers exist has invisible holes |
| 6 | **Design tokens + three primitives** — Button, Input, Badge (ADR-009). The other five are added when a screen needs one | Every component built before the tokens exist has to be revisited |
| 7 | Integration test harness: `WebApplicationFactory` + Testcontainers | "Tests pass" needs somewhere to run |

Items 4, 5, and 6 are the ones that look skippable and are not. 6 is the only one with
a hard timebox, because it is the only one that degrades gracefully — tokens with plain
controls looks intentional, whereas a partial audit log just has holes.

---

## Then: stories, one at a time

Build order is in `08-board.md`. WIP limit is one.

For each story, the loop is in `07-execution-workflow.md`:

```text
spec → plan → tasks → [preview, for any screen] → build → verify → review → summarise
```

`spec.md`, `plan.md`, and `tasks.md` are **already written** for all seven Release 1
stories plus US-014. Read them; do not rewrite them. The remaining artifacts fill in as
you build.

Phase 3b — the preview — is not optional for a screen. Rendering it costs minutes;
changing a screen that already has tests, translation keys, and query wiring costs
hours.

---

## Where the marks actually are

| Axis | Weight | Where it is earned |
|---|---|---|
| Planning & Task Breakdown | **20** | Already done, in `specs/*/plan.md` and `tasks.md`, plus `15-scope-coverage.md` and `16-three-day-plan.md` |
| Requirement & Specification | 10 | Already done, plus how you handle the four questions above |
| AI Usage & Verification | 10 | `ai-notes.md` per story — specific, not "AI helped and I reviewed" |
| Engineering Foundations | 10 | The skeleton |
| Backend / API / Database | 10 | US-001, US-005, US-008 |
| Frontend & End-to-End | 10 | The demo flow working, with Arabic strings present and RTL verified on the screens that exist |
| Correctness, Testing, Ownership | 20 + **gate** | Tests, and being able to say why for every decision |

**Thirty points are already earned before you open an editor.** That is why the specs
and plans were written first, and it is the single strongest argument for not skipping
the process under time pressure.

The Quality axis is a **gate**, not just points. When time runs short, cut scope from
`08-board.md` — do not cut quality from the stories that remain.

---

## Three rules that will be tested in the walkthrough

1. **Never write a test result you did not observe.** It is the easiest thing for a
   reviewer to catch, and the most expensive to be caught on.
2. **"The AI wrote it" is not an answer to "why?"** Every accepted output must be
   explainable by you. If you cannot explain a file in the diff, the story is not done.
3. **State the limitations first.** "Here is what I did not build and why" is a stronger
   opening than being asked.

---

## Still open, and that is fine

| # | Question | Status |
|---|---|---|
| Q-1 | What Productivity measures | Blank in the assessment sheet — ask |
| Q-2 | The 24/40 gate arithmetic | Inconsistent in the sheet — ask |
| Q-3 | PostgreSQL or SQL Server | **RESOLVED — SQL Server** (ADR-013) |
| Q-5 | Session length | **RESOLVED, then extended — three days at ~9 hours, plus three more granted 2026-08-27.** `PHASES.md` is the plan |
| Q-6 | Demo live or recorded | Ask |
| Q-16 | The scope document specifies no deliverables | Ask — the Week 4 brief is the working assumption |
| Q-7 | Arabic search normalisation | Deferred with the fix written down |
| Q-8 | Who writes the Arabic copy | Ask |
| Q-9, Q-10 | Audit retention, read auditing | Not engineering decisions |
| Q-11 | Design asset permission | Ask |
| Q-15 | The Arabic typeface | Ask — it may never have been chosen |

An open question that is written down is evidence of judgement. An open question that
was quietly guessed is a defect waiting to surface in the walkthrough.

---

## The map

| Need | File |
|---|---|
| What we are building | `01-product-spec.md` |
| **What is covered and what is cut, section by section** | **`15-scope-coverage.md`** |
| **The plan** | **`PHASES.md`** |
| The rules, as testable propositions | `04-business-rules.md` |
| Schema, ERD, indexes | `03-domain-model.md` |
| Why anything is the way it is | `decisions/` — nine ADRs |
| What to build next | `08-board.md` |
| How a story moves | `07-execution-workflow.md` |
| Whether a story is done | `09-definition-of-done.md` |
| Design values and rules | `design/tokens.css`, `design/DESIGN-BRIEF.md` |
| What to hand an AI before a UI task | `design/DESIGN-BRIEF.md` |
| What to say in the walkthrough | `14-demo-script.md` |
| What to check before saying it | `13-self-review-checklist.md` |
