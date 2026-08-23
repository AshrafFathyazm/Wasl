# User Story Artifact Template

Copy this folder to `story-artifacts/US-XXX-slug/` when a new story enters the
pipeline.

```text
US-XXX-slug/
├── spec.md        Phase 1 — Specification
├── plan.md        Phase 2 — Architecture
├── tasks.md       Phase 3 — Story Planner
├── backend.md     Phase 4 — Backend
├── frontend.md    Phase 4 — Frontend
├── tests.md       Phase 5 — Verification
├── ai-notes.md    Phase 5 — Verification
├── review.md      Phase 6 — Review
└── summary.md     Phase 7 — Summary
```

Nine artifacts, one per phase output. Earlier versions of this process had twelve;
`database.md`, `openapi.md`, and `documentation.md` were folded into `backend.md` and
`summary.md` because they were being filled with the same content twice.

The completion flow is:

```text
spec → plan → tasks → implementation → tests → review → summary → done
```

A phase is not started until the previous one is complete. Artifacts for phases that
have not run yet carry a `Status: Not started` header, so that "empty" and
"incomplete" are never confused.
