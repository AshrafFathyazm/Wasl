# Role Prompts

One prompt per role in `06-agent-map.md`. They exist so that the context given to AI
is deliberate and repeatable rather than improvised, and so that what was asked for
can be inspected alongside what came back.

## How to use them

1. Open the prompt for the phase you are in.
2. Attach the context it lists — the project files, the story, and the artifacts
   already produced for that story.
3. Run it.
4. Read the output before doing anything else with it.
5. Record what you accepted, changed, or rejected in the story's `ai-notes.md`.

## Rules that apply to every prompt

- Never paste secrets, connection strings, tokens, or real customer data.
- Never accept output that references a package, API, or method without confirming it
  exists.
- Never record a test result that was not observed.
- If the output invents a requirement, the requirement goes into `spec.md` as an open
  question. It does not go into the code.

## Prompt index

| File | Role | Produces |
|---|---|---|
| `00-specification-agent.md` | Specification | `spec.md` |
| `01-architecture-agent.md` | Architecture | `plan.md` |
| `02-story-planner.md` | Story Planner | `tasks.md` |
| `03-backend-agent.md` | Backend | `backend.md` |
| `04-frontend-agent.md` | Frontend | `frontend.md` |
| `05-verification-agent.md` | Verification | `tests.md`, `ai-notes.md` |
| `06-review-agent.md` | Review | `review.md` |
| `07-summary-agent.md` | Summary | `summary.md` |
| `08-story-orchestrator.md` | Orchestrator | Runs the pipeline |
