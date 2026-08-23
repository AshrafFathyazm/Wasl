---
name: verify-story
description: Use after /speckit-implement finishes a feature, before calling it done. Runs the Definition of Done gate for a spec-kit feature — executes the real commands, records observed output in tests.md, completes ai-notes.md, compares the generated OpenAPI against the frozen contract, and updates the board and delivery log. Also use when the user says "verify the story", "is this done?", "run the DoD", or asks to close out a feature.
---

# Verify Story

Spec Kit ends at `/speckit-implement`. `docs/sdd/09-definition-of-done.md` requires
evidence that Spec Kit does not collect. This skill is that gap.

## The one rule

**Nothing is written down that was not observed.**

Every line this skill adds to `tests.md` is pasted from a command that actually ran.
"Tests pass" without a run is a false statement and it is the easiest thing for a
reviewer to catch. If a command cannot be run — no Docker, no database, a broken
harness — that is recorded as *not run, and why*, never as a pass.

## Inputs

The feature folder: `specs/NNN-slug/`. Read all of it before running anything —
`spec.md` for the acceptance criteria, `tasks.md` for what was supposed to happen,
`contracts/` for what was promised.

## Steps

Create a todo per step. Do not skip a step because it "obviously passes".

### 1. Build

```bash
dotnet build
```

Record the exact command and the result line. Warnings are errors in this repository,
so a warning is a failure — do not report it as a pass with a note.

### 2. Unit tests

```bash
dotnet test tests/Wasl.Domain.Tests
```

Record the command, the **count**, and the result. A count of zero for a feature whose
`tasks.md` lists `TEST-` tasks is a finding, not a pass.

### 3. Integration tests

```bash
dotnet test tests/Wasl.Api.IntegrationTests
```

Needs Docker. If Docker is unavailable, record *not run — Docker unavailable* and say
which acceptance criteria are therefore unverified. Do not substitute the unit suite.

### 4. Frontend tests, if the feature has a frontend lane

```bash
cd src/wasl-web && npm run test && npm run lint && npm run build
```

### 5. Acceptance criteria traceability

Build the table. Every `AC-*` in `spec.md` gets a row:

| AC | Test name | Result |
|---|---|---|

An AC with no test is a **gap**. Write it in the gap list with a reason; do not quietly
leave the row out.

### 6. The rules that fail silently

These five are why this skill exists. Each is checked explicitly:

| Check | How |
|---|---|
| Filtered indexes kept their filter | `SELECT name, is_unique, filter_definition FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.<Table>')` — `filter_definition` must be non-null |
| Every mutation wrote one audit row, in-transaction | The integration test for it ran and passed. If the feature has a command and no such test, that is a gap |
| i18n key parity | The parity test ran. Every new key exists in `en` **and** `ar` |
| The Arabic pass | Was the screen actually opened in Arabic? Record what was found, including "nothing". Not a checkbox — findings |
| Generated OpenAPI matches `contracts/*-api.md` | Compare them. A difference is a defect in one of the two; fix both, never one silently |

### 7. Complete `ai-notes.md`

Per task: what the agent was given, what came back, what was accepted, what was
modified and how, what was rejected and why, and **the command that was run** to verify
each accepted output. Reading is not verifying.

An empty implementation section on a feature that shipped code is a gap.

### 8. Run the Definition of Done

Walk `docs/sdd/09-definition-of-done.md` section by section. For each item, name the
artifact that evidences it. An item with no artifact is not satisfied — regardless of
whether the thing itself was done.

### 9. Update the record

- `docs/sdd/08-board.md` — the feature's phase
- `docs/sdd/12-delivery-log.md` — a dated row: what was committed, what was delivered,
  what was reworked
- `specs/README.md` — the status table

### 10. Report

State plainly, in this order:

1. **Not done** — what is missing, with the evidence that shows it missing
2. **Done with gaps** — the gaps, each with its reason
3. **Done** — only when every applicable DoD item has an artifact behind it

Then the ownership question, which no checklist replaces:

> **Can every file in this diff be explained, and changed, without help?**

If the answer is no for any file, the feature is not done regardless of whether the
tests pass. Say so.

## What this skill does not do

- It does not fix failures. It finds and reports them; fixing is a task with an owner.
- It does not mark anything Done on its own. It produces the evidence and the verdict;
  the product owner closes the feature.
- It does not re-run a passing suite to make a report look fuller.
