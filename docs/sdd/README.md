# Customer Support CRM — Spec-Driven Development Blueprint

A Spec-Driven Development (SDD) workspace for building a Customer Support CRM as a
small set of Epics and User Stories, with AI used as a reviewed collaborator rather
than an unreviewed code generator.

## Why this repository exists

Two goals, in this order:

1. **Deliver a working CRM** covering the core support flow end to end.
2. **Make the engineering process visible and defensible** — every decision has a
   written reason, every claim of "done" has evidence.

The product ships in English and Arabic, right-to-left included. The repository
itself is written in English so any reviewer can read it.

## The core loop

```text
User Story
  → spec.md        What exactly are we building, and what is out of scope?
  → plan.md        How will we build it, and what did we trade off?
  → tasks.md       Ordered, independently verifiable units of work
  → backend.md     What was implemented, and where
  → frontend.md    What was implemented, and where
  → tests.md       What was verified, and the evidence
  → ai-notes.md    What AI produced, what was accepted, changed, or rejected
  → review.md      Blocking issues, missing tests, AC status
  → summary.md     What changed, why, and the known limitations
  → Done
```

A story moves to Done only when the Definition of Done in `09-definition-of-done.md`
is satisfied **and** the evidence exists in the artifacts above.

## Start here

`START-HERE.md` — the day-one runbook: what to ask before writing anything, and where
the marks are.

`PHASES.md` — the build order. Seven phases, each ending in something that works.

## Reading order

| Order | File | Purpose |
|---|---|---|
| 0 | `START-HERE.md` | The day-one runbook |
| 0b | `PHASES.md` | The build order, phase by phase |
| 1 | `00-project-context.md` | Scope, out of scope, quality rules |
| 2 | `01-product-spec.md` | Actors, functional and non-functional requirements |
| 3 | `02-architecture.md` | Stack, layers, solution structure |
| 4 | `03-domain-model.md` | ERD, entities, relationships, physical schema, indexes |
| 5 | `04-business-rules.md` | State machine, escalation, duplicates, authorization, localization |
| 6 | `05-api-conventions.md` | Status codes, error contract, pagination, concurrency |
| 7 | `07-execution-workflow.md` | How a story moves through the pipeline |
| 8 | `08-board.md` | Current board state and delivery order |
| 9 | `09-definition-of-done.md` | The gate for every story |
| 10 | `10-assessment-traceability.md` | Which artifact evidences which criterion |

## Repository map

```text
.
├── 00–14 *.md              Project-level specification and process
├── decisions/              ADRs — one file per significant decision
├── epics/                  Epic definitions
├── user-stories/           Story definitions (the "what")
├── story-artifacts/        Per-story SDD artifacts (the "how" and the evidence)
├── templates/user-story/   Blank artifact set to copy for a new story
├── prompts/                Role prompts used when working with AI
├── design/                 Tokens, design brief, layout patterns, component inventory
├── openapi/                API contract strategy
├── testing/                Test strategy, matrix, edge cases, security checklist
└── documentation/          Documentation that describes the built system
```

## Status of this repository

This is the **planning baseline**, produced before implementation starts.

- Specification, plan, and task breakdown are written for every in-scope story.
- Implementation, test, review, and summary artifacts are filled in as each story
  is built. They are structured templates until then, and the board records which
  stories have reached which phase.
- `12-delivery-log.md` is the running record of what was actually delivered when.

Nothing in this repository claims to be implemented until `08-board.md` says so and
the corresponding artifacts contain evidence.
