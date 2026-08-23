# Agent Map

Eight roles, one artifact each. The count is deliberate: earlier drafts of this
process had thirteen, which produced more paperwork than the build could justify.
Roles that consumed the same context were merged.

| # | Role | Responsibility | Artifact |
|---|---|---|---|
| 1 | **Specification** | Restate the story precisely, surface ambiguity, produce testable acceptance criteria and edge cases | `spec.md` |
| 2 | **Architecture** | Technical design, data changes, contract changes, risks, trade-offs | `plan.md` |
| 3 | **Story Planner** | Split the plan into ordered, independently verifiable tasks with dependencies | `tasks.md` |
| 4 | **Backend** | .NET implementation, including schema and migration | `backend.md` |
| 5 | **Frontend** | React implementation | `frontend.md` |
| 6 | **Verification** | Test strategy, execution, evidence, and audit of AI-produced work | `tests.md`, `ai-notes.md` |
| 7 | **Review** | Correctness, boundaries, security, missing tests, scope creep | `review.md` |
| 8 | **Summary** | What changed, why, trade-offs, limitations, documentation updates | `summary.md` |

## What each role receives

Every role is given, in this order:

1. `00-project-context.md` and the relevant sections of `01`–`05`
2. The user story being worked
3. Every artifact already produced for that story
4. The ADRs that constrain the decision
5. The explicit constraint list for this piece of work
6. The expected output format

## Rules that apply to all roles

- No role invents a requirement that is not in the approved specification. If a
  requirement appears to be missing, it goes in `spec.md` under **Open Questions**,
  not into the code.
- No role marks work complete without evidence that can be inspected.
- The Verification role's audit is not optional. It exists because AI-assisted work
  fails in a specific way — plausible code that references APIs which do not exist —
  and that failure mode is invisible to a reader who is only checking style.
- Nothing in a role's output is accepted because "the AI wrote it". Every accepted
  output must be explainable by the human who accepted it.

---

## Which agent and which skill — per role

The eight roles above are responsibilities. This table binds each one to the **actual
Claude Code agent** that carries it and the **skill** that drives it, so "who did this
and how" is answerable for every task rather than being a general claim about using AI.

Every task in a feature's `tasks.md` carries an `Agent` and a `Skill` column. A task
with neither is a task nobody owns.

| # | Role | Agent | Skill |
|---|---|---|---|
| 1 | **Specification** | main session (no subagent — the spec needs the full conversation) | `speckit-specify` → `speckit-clarify` |
| 2 | **Architecture** | `feature-dev:code-architect` | `speckit-plan` |
| 3 | **Story Planner** | main session | `speckit-tasks` |
| 4 | **Backend** | `voltagent-lang:dotnet-core-expert` | `speckit-implement` + `superpowers:test-driven-development` |
| 4b | **Database** | `voltagent-lang:sql-pro` | — (works from `data-model.md`) |
| 5 | **Frontend** | `voltagent-lang:react-specialist` | `frontend-design` + `superpowers:test-driven-development` |
| 5b | **Design / preview** | `ui-ux-pro-max:ui-styling` | `frontend-design` (Phase 3b preview) |
| 6 | **Verification** | `voltagent-qa-sec:test-automator` | `superpowers:verification-before-completion` |
| 6b | **RTL / accessibility** | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |
| 7 | **Review** | `comprehensive-review:code-reviewer` + `comprehensive-review:security-auditor` | `code-review:code-review` |
| 8 | **Summary** | main session | — |
| — | **Debugging** (not a phase; invoked when something breaks) | `debugging-toolkit:debugger` | `superpowers:systematic-debugging` |

### Why some roles have no subagent

Specification, task breakdown, and summary stay in the main session on purpose. All
three depend on the whole conversation — the questions that were asked, the answers
that came back, what was rejected and why. A subagent starts fresh and would produce a
plausible document that does not reflect any of it.

Implementation, testing, and review are the opposite: they take a written artifact as
input and produce a bounded output, which is exactly what a subagent is good at.

### The dispatch rule

An agent is **named in `tasks.md` before it is dispatched**, and its output is recorded
in `ai-notes.md` with what was accepted, what was modified, and what was rejected.

Naming the agent without dispatching it is fine — it is the plan. Dispatching one and
not recording what came back is not, because then the artifact claims a verification
that has no evidence behind it.

### What the roles receive, in agent terms

The list under **What each role receives** above is the subagent's prompt contract. In
practice that means every dispatch carries:

1. The feature's `spec.md` and the relevant `BR-*` rules by ID
2. `contracts/<feature>-api.md` — frozen before either lane starts
3. `plan.md`, and every artifact already produced for this feature
4. The ADRs that constrain the decision, named explicitly
5. The `.specify/memory/constitution.md` gates that apply
6. The expected output format

A subagent given less than this produces work that has to be redone, which costs more
than the context would have.
