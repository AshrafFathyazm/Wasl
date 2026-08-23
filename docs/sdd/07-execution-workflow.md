# Execution Workflow

Artifact paths in this document are the real paths in this repository:
`story-artifacts/US-XXX-slug/<artifact>.md`.

---

## Phase 1 — Specify

**Role:** Specification · **Artifact:** `spec.md`

Input: the user story, project context, related stories, existing ADRs.

Output sections:

- **Understanding** — the story restated precisely
- **In scope / Out of scope** — explicit, both halves
- **Assumptions** — anything believed but not stated in the story
- **Open questions** — anything that genuinely blocks a decision
- **Acceptance criteria** — numbered, each independently testable
- **Edge cases** — including failure and permission cases
- **Referenced rules** — the BR-* identifiers this story implements

Exit condition: every acceptance criterion could be handed to someone else and
turned into a test without asking a follow-up question.

---

## Phase 2 — Plan

**Role:** Architecture · **Artifact:** `plan.md`

Output sections:

- Backend design — which classes in which layer, and why there
- Data changes — entities, columns, indexes, migration name
- API contract changes — endpoint, request, response, status codes
- Frontend design — routes, components, state, query keys
- Test strategy — what is unit, what is integration, what is not tested and why
- Dependencies — which stories or tasks must land first
- Risks and trade-offs — at least one real alternative considered and rejected

Exit condition: the plan names every file that will be created or changed.

---

## Phase 3 — Break down

**Role:** Story Planner · **Artifact:** `tasks.md`

Each task has an ID, a dependency list, and a verification method. A task that
cannot be verified on its own is too big and must be split.

Task ID convention: `BE-{story}-{nn}`, `FE-{story}-{nn}`, `TEST-{story}-{nn}`,
`DOC-{story}-{nn}`.

Exit condition: no task is larger than roughly one focused hour, and the order
respects the dependency list.

---

## Phase 3b — Preview (frontend only)

**Role:** Frontend · **Artifact:** a disposable rendering, referenced in `frontend.md`

Before building a screen, render it: real tokens, real copy, plausible data volumes,
all four states, both languages. No API, no routing, no state.

Approve the layout here, where changing it costs minutes. After the screen is wired,
tested, and translated, the same change costs hours.

Full detail and the review checklist: `design/preview-first-workflow.md`.

Exit condition: the preview is approved, or the requested changes were made to the
**preview** and it was reviewed again.

---

## Phase 4 — Implement

**Roles:** Backend, Frontend · **Artifacts:** `backend.md`, `frontend.md`

Work task by task. For each task: write or generate, read, run, test, commit.

Each artifact records: files created or changed, the acceptance criteria the task
serves, and anything that had to deviate from the plan — with the reason.

A deviation from `plan.md` is not a failure. An **undocumented** deviation is.

---

## Phase 5 — Verify

**Role:** Verification · **Artifacts:** `tests.md`, `ai-notes.md`

`tests.md` records:

- Build result
- Unit test run: command, count, result
- Integration test run: command, count, result
- Acceptance criteria traceability: AC → test name → pass/fail
- Edge cases exercised
- Anything known to be untested, and why

`ai-notes.md` records, for this story:

- What AI was used for
- What context it was given
- What was accepted as-is
- What was modified, and how
- What was rejected, and why
- How each accepted output was verified

Rule: no result is written down that was not observed. "Tests pass" without a run
is a false statement, and it is the single easiest thing for a reviewer to catch.

---

## Phase 6 — Review

**Role:** Review · **Artifact:** `review.md`

Checks: layer boundaries, correctness against acceptance criteria, security basics,
API consistency against `05-api-conventions.md`, database impact, missing tests,
scope creep.

Output sections: **Blocking issues**, **Non-blocking improvements**, **Missing
tests**, **Acceptance criteria status**, **Verdict** (`Approved` / `Changes required`).

Review scope is the story's blast radius, not the whole system.

---

## Phase 7 — Summarise and document

**Role:** Summary · **Artifact:** `summary.md`

What was built, why it was built that way, the trade-offs, and the known limitations.
Project documentation, `documentation/api/`, and the OpenAPI contract are updated in
the same pass when they are affected.

---

## Phase 8 — Definition of Done

Run `09-definition-of-done.md` against the story. Update `08-board.md` and add a row
to `12-delivery-log.md`.

A story is not Done because a phase produced a document. It is Done because the
documents contain evidence and the checklist passes.

---

## When time runs short

Phases are not dropped; scope is. Cut a story out of the release, finish the
remaining stories completely, and record the cut in `08-board.md` with a reason.
A half-implemented story with a complete artifact set is worse than an honestly
deferred one.
