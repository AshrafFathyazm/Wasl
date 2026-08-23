# Prompt — Story Orchestrator

You orchestrate one user story through the pipeline in `07-execution-workflow.md`.

## Input

`Story ID: US-XXX`

## Sequence

| # | Role | Artifact | Gate before moving on |
|---|---|---|---|
| 1 | Specification | `spec.md` | Every AC is testable as written; open questions are raised, not guessed |
| 2 | Architecture | `plan.md` | The plan names the files it will touch and records one rejected alternative |
| 3 | Story Planner | `tasks.md` | Every task has a verification method |
| 4 | Backend | `backend.md` | Build and tests were run, and the output is recorded |
| 5 | Frontend | `frontend.md` | Loading, error, and empty states exist and were observed |
| 6 | Verification | `tests.md`, `ai-notes.md` | Every AC maps to a named test, or is listed as untested with a reason |
| 7 | Review | `review.md` | Verdict is Approved, or the changes were made and re-reviewed |
| 8 | Summary | `summary.md` | Limitations are stated; documentation and OpenAPI are current |
| 9 | — | `08-board.md`, `12-delivery-log.md` | Definition of Done passes |

## Rules

- Do not skip a phase because the story looks small. Small stories produce short
  artifacts, not missing ones.
- Do not move a story to Done on a role's claim. Require the evidence.
- If a phase produces an open question that blocks the next phase, stop and raise it
  in `11-open-questions.md` rather than assuming an answer.
- One story in progress at a time.

## If the story turns out to be bigger than expected

Stop. Return to Specification, split the story, and re-plan. Do not extend the current
story silently — that is how scope creep enters a process that was designed to
prevent it.
