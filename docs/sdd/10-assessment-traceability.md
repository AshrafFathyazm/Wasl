# Assessment Traceability

This file maps the evaluation criteria to the artifacts in this repository, so that
a reviewer can find the evidence for each criterion without searching.

**Source of the criteria and weights:** the `AI_FullStack_Assessment_Sheet`
(Assessment and Scoring Guide tabs). The weights below are reproduced from that
sheet. If the sheet has changed, this table is stale and must be corrected before it
is relied on.

## Weight map

| Axis | Criterion | Weight |
|---|---|---|
| **AI & SDD Application** (40) | Requirement & Specification | 10 |
| | Planning & Task Breakdown | 20 |
| | AI Usage & Verification | 10 |
| **Software Engineering & Full-Stack** (30) | Engineering Foundations | 10 |
| | Backend / API / Database | 10 |
| | Frontend & End-to-End Flow | 10 |
| **Productivity** (10) | *Criterion and description are blank in the sheet* | 10 |
| **Quality & Understanding** (20) | Correctness & Maintainability | 10 |
| | Testing, Security & Edge Cases | 5 |
| | Technical Understanding & Ownership | 5 |
| | **Total** | **100** |

A gating rule applies to the Quality & Understanding axis: falling below the minimum
returns a final classification of *Foundation Improvement Required* regardless of the
total. The exact arithmetic of that threshold is ambiguous in the sheet — see
`11-open-questions.md`, item Q-2.

## Evidence map

| Criterion | Where the evidence lives |
|---|---|
| **Requirement & Specification** (10) | `01-product-spec.md` (numbered FR/NFR), `04-business-rules.md` (BR-* rules stated as testable propositions), each story's `spec.md` with acceptance criteria and edge cases, `11-open-questions.md` for the questions raised rather than guessed |
| **Planning & Task Breakdown** (20) | Each story's `plan.md` (design, data changes, contract changes, rejected alternatives) and `tasks.md` (ordered, dependency-aware, individually verifiable tasks); `08-board.md` for the sequencing and the explicit deferral decisions |
| **AI Usage & Verification** (10) | `prompts/` for the context given to AI; each story's `ai-notes.md` for accepted, modified, and rejected output plus how each was verified; `06-agent-map.md` for the role separation |
| **Engineering Foundations** (10) | `02-architecture.md` (layers and dependency direction), `documentation/development/git-workflow.md`, `documentation/api/error-handling.md`, `documentation/development/setup.md` |
| **Backend / API / Database** (10) | `03-domain-model.md` (ERD, physical schema, delete behaviour, query-to-index map, ticket-number strategy), `05-api-conventions.md` (status codes, error contract, pagination, concurrency), `openapi/README.md`, each story's `backend.md` |
| **Frontend & End-to-End Flow** (10) | `design/screens/` (a full spec per screen: elements, actions with endpoints and failure paths, all states, RTL notes), `design/` (tokens, design brief, layout patterns, component inventory, icon set), each story's `frontend.md`, `14-demo-script.md` (the full flow, end to end, in both languages), `testing/test-strategy.md` (E2E section), `documentation/development/localization.md` (RTL and direction rules) |
| **Productivity** (10) | `12-delivery-log.md` — a dated record of what was delivered, what was cut, and why. Pending clarification of what this criterion measures (Q-1). |
| **Correctness & Maintainability** (10) | Each story's `review.md`, `09-definition-of-done.md`, `02-architecture.md` |
| **Testing, Security & Edge Cases** (5) | `testing/test-strategy.md` (including the architecture tests), `testing/test-matrix.md`, `testing/edge-cases.md`, `testing/security-checklist.md`, `04-business-rules.md` BR-9 and `decisions/ADR-008-audit-log.md` for the audit trail, each story's `tests.md` |
| **Technical Understanding & Ownership** (5) | `decisions/` (twelve ADRs, each with the rejected alternative), each story's `summary.md` trade-off section, `13-self-review-checklist.md`, `14-demo-script.md` |

## Where the effort goes

Planning and specification together carry 30 of the 100 points and require no code.
They are produced first, in full, and they are the reason this repository exists in
its current state before implementation begins.

The Quality & Understanding axis is a gate, not just 20 points. When time is
constrained, scope is cut from `08-board.md` rather than quality being cut from the
remaining stories — a narrower feature set fully owned scores higher than a wide one
partially understood.
