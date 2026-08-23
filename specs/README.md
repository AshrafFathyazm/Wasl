# Feature Specifications

Every feature in Wasl is specified before it is built, in a numbered folder here.

This file is the plan: what gets built, in what order, who builds each part, and what
"done" means. The requirement identities (`FR-*`, `BR-*`, `US-*`, `NFR-*`) live in
[`docs/sdd/`](../docs/sdd/) and are cited by ID from every spec — they are not restated.

---

## The loop

```text
/speckit-specify   → spec.md              what, and what is out of scope
/speckit-clarify   → spec.md (revised)    ambiguity removed before any design
/speckit-plan      → plan.md              design, files, trade-offs
                     data-model.md        entities, columns, indexes, migration name
                     research.md          what was investigated, and what it settled
                     contracts/*-api.md   ← FROZEN HERE. both lanes read it
                     FRONTEND-API-GUIDE.md
                     frontend-spec.md     screens, states, RTL, i18n keys
/speckit-tasks     → tasks.md             ordered, verifiable, one owner each
/speckit-checklist → checklists/*.md      requirement completeness
/speckit-analyze   → cross-artifact consistency
/speckit-implement → build, task by task
verify-story       → tests.md + ai-notes.md + the Definition of Done gate
```

One feature in progress at a time. The WIP limit is not a preference; a half-finished
second feature costs the context switch and then costs a review that cannot conclude.

`verify-story` is a project skill, not part of Spec Kit. Spec Kit ends at
`/speckit-implement`, and `docs/sdd/09-definition-of-done.md` requires evidence that
nothing in Spec Kit collects.

---

## Folder shape

```text
specs/007-create-customer/
├── spec.md                     acceptance criteria, edge cases, BR-* cited by ID
├── research.md                 questions investigated; what each one settled
├── data-model.md               entities, columns, indexes, migration name
├── contracts/
│   └── customers-api.md        the agreement — frozen before either lane starts
├── plan.md                     ## Backend  /  ## Frontend  /  ## Contract changes
├── frontend-spec.md            screens, elements, actions, states, RTL, i18n keys
├── FRONTEND-API-GUIDE.md       handoff: base path, auth, endpoints, failures
├── tasks.md                    BE-/FE-/TEST-/DOC-/REV- with Agent and Skill columns
├── checklists/
│   └── requirements.md         completeness check on the spec itself
├── tests.md                    commands run, real output, AC → test name
├── ai-notes.md                 accepted / modified / rejected, and how each was verified
└── summary.md                  what changed, trade-offs, known limitations
```

`spec.md`, `plan.md`, and `tasks.md` carry those exact names because
`.specify/scripts/bash/*.sh` looks for them by name. The rest is ours.

Backend and frontend share one folder and one `spec.md`, and split inside `plan.md`
and `tasks.md`. They are the same feature — one set of acceptance criteria, one
contract between them. Two folders would mean two specs that have to be kept in step
by hand.

---

## Phases

Ordered by **cheapest to do now, most expensive to do later** — not by easiest. A
cross-cutting concern lands when there is exactly one consumer: zero is speculative,
seven is a retrofit, one is free and proves the mechanism on something real.

Every phase ends in something that runs. If time runs out you stop on a boundary with
a demonstrable product, never mid-feature.

### Phase 0 · Foundation — nothing can be verified before this exists

| # | Feature | Story | Ends when |
|---|---|---|---|
| 001 | `solution-skeleton` | — | `dotnet build` and `dotnet ef database update` both succeed on a clean clone; `GET /health` returns 200; CI is green |
| 002 | `error-contract` | — | Every error response is `ProblemDetails` with a `traceId`; a `400` carries field-level errors |
| 003 | `audit-trail` | — | One command produces one audit row in the same transaction; the architecture test fails the build without `IAuditableCommand` |
| 004 | `auth-and-roles` | Auth | A token carries the role; a wrong-role call returns `403`, proven by test |
| 005 | `localization-core` | — | An `ar` request returns an Arabic message; the key-parity test runs in CI |
| 006 | `design-system` | — | Tokens plus Button, Input, Badge render from the real values. **One day, hard stop** (ADR-009) |

### Phase 1 · Customers — the first write path, end to end

| # | Feature | Story | Ends when |
|---|---|---|---|
| 007 | `create-customer` | US-001 | A customer is created in a browser and a duplicate shows the server's `409` |
| 008 | `customer-list-and-profile` | US-002 | The list and the profile are reachable and paginated |

### Phase 2 · Ticket core — where most of the marks are

| # | Feature | Story | Ends when |
|---|---|---|---|
| 009 | `create-ticket` | US-005 | A ticket exists against a customer, with a number and a `Created` history row |
| 010 | `ticket-list-and-detail` | US-006 (read) | List and detail render; the list costs one query, asserted |
| 011 | `assign-ticket` | US-007 | An Agent assigning someone else's ticket gets `403`, proven by test |
| 012 | `change-ticket-status` | US-008 | All 36 BR-1 transitions covered, forbidden ones included; two writes on one version give one `200` and one `409` |

### Phase 3 · Collaboration — the end of the committed flow

| # | Feature | Story | Ends when |
|---|---|---|---|
| 013 | `ticket-timeline-and-comments` | US-010 | The timeline spans comments and history correctly across a page boundary |

**Stop here and the demo is complete:** create customer → create ticket → assign →
change status → comment → view timeline.

### Phase 4 · Language pass — the requirement, finished

| # | Feature | Story | Ends when |
|---|---|---|---|
| 014 | `language-preference-and-rtl` | US-014 | The choice survives a reload; every screen has been walked in Arabic and the findings are written down |

The Arabic walk is a **deliverable, not a check**. RTL defects are visual — no
assertion catches a container sized to English text.

### Phase 5 · Release 2 — droppable, in this order

| # | Feature | Story | Cut first? |
|---|---|---|---|
| 015 | `ticket-filters-and-search` | US-006 (filters) | Yes — first out |
| 016 | `escalate-ticket` | US-009 | |
| 017 | `update-customer` | US-003 | |
| 018 | `customer-overview` | US-004 | |
| 019 | `audit-log-access` | US-015 | The log is already being written; SQL suffices until the endpoint exists |
| 020 | `dashboard` | US-016 | |
| 021 | `communication-provider-abstraction` | US-012 | Promoted from Deferred — see `docs/sdd/08-board.md` |
| 022 | `tenant-theming-settings` | — | ADR-012. The token architecture ships in `006`; only the settings screen is here |

**When behind, cut from Phase 5 — never from tests.** Quality is a gate, not points.
A narrower scope fully owned beats a wider one partly understood, and a walkthrough
finds the difference in about a minute.

---

## Task identifiers

`{LANE}-{feature}-{nn}` — the number is the feature folder's number, so a task ID says
where it lives without a lookup.

| Lane | Meaning | Example |
|---|---|---|
| `BE` | Backend: domain, slice, persistence, endpoint | `BE-007-03` |
| `FE` | Frontend: component, form, query, screen | `FE-007-02` |
| `TEST` | A test that exists to prove a named rule or AC | `TEST-007-08` |
| `DOC` | Contract, documentation, board, delivery log | `DOC-007-01` |
| `REV` | Review and verification gates | `REV-007-01` |

Every task row carries: **ID · Outcome · Depends on · Verified by · Serves · Agent · Skill**.

- **Verified by** is a command or an observation, never "it works".
- **Serves** is an `AC-*` or a `BR-*`. A task serving nothing is scope creep.
- A task that cannot be verified on its own is too big and gets split.

---

## Who builds what

| Lane | Agent | Skill |
|---|---|---|
| Specification, task breakdown, summary | main session | `speckit-specify` · `speckit-clarify` · `speckit-tasks` |
| Architecture and planning | `feature-dev:code-architect` | `speckit-plan` |
| Backend | `voltagent-lang:dotnet-core-expert` | `speckit-implement` + `superpowers:test-driven-development` |
| Database and indexes | `voltagent-lang:sql-pro` | works from `data-model.md` |
| Frontend | `voltagent-lang:react-specialist` | `frontend-design` + `superpowers:test-driven-development` |
| Screen preview (Phase 3b) | `ui-ux-pro-max:ui-styling` | `frontend-design` |
| Tests and evidence | `voltagent-qa-sec:test-automator` | `superpowers:verification-before-completion` |
| RTL and accessibility | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |
| Review | `comprehensive-review:code-reviewer` + `security-auditor` | `code-review:code-review` |
| Debugging | `debugging-toolkit:debugger` | `superpowers:systematic-debugging` |

Specification, task breakdown, and summary stay in the main session because all three
depend on the whole conversation — what was asked, what came back, what was rejected.
A subagent starts fresh and would write a plausible document reflecting none of it.

Full reasoning, and the dispatch rule, in
[`docs/sdd/06-agent-map.md`](../docs/sdd/06-agent-map.md).

---

## The contract between the lanes

The frontend does not wait for the backend, and it does not guess either.

```text
spec.md                       one set of acceptance criteria
   ↓
contracts/<name>-api.md       FROZEN. endpoints · shapes · every status code · every type
   ↓                    ↓
BE implements it       FE reads FRONTEND-API-GUIDE.md and starts
   ↓                    ↓
Swashbuckle generates OpenAPI  →  compared against the contract before Done
                                   a difference is a defect in one of the two
```

A frozen contract can still change — requirements do. What it cannot do is change
silently: the change is recorded under **Contract changes** in `plan.md`, the guide is
regenerated, and both lanes are told. See
[`docs/sdd/openapi/README.md`](../docs/sdd/openapi/README.md).

---

## Gates

Before a feature closes, all of these hold **and** the artifact evidencing each exists.
The full list is [`docs/sdd/09-definition-of-done.md`](../docs/sdd/09-definition-of-done.md);
these are the five that get skipped:

| Gate | Evidence |
|---|---|
| Every AC maps to a named test, and the run output is recorded | `tests.md` |
| Every state-changing operation writes an audit row, in-transaction | `tests.md` |
| Every new i18n key exists in `en` and `ar`; every touched screen viewed in Arabic | `frontend-spec.md`, `tests.md` |
| The generated OpenAPI matches `contracts/` | `summary.md` |
| Every accepted AI output was **run**, not just read | `ai-notes.md` |

And one question that no checklist replaces: **can this be explained and changed
without help?** If not, it is not done, regardless of whether the tests pass.

---

## Status

| Feature | Phase | State |
|---|---|---|
| `001-solution-skeleton` | 0 | **Specified** — awaiting review |
| `007-create-customer` | 1 | **Specified** — migrated from `docs/sdd/story-artifacts/US-001-create-customer/` |
| everything else | — | Planned above; folders created as each is specified |

Nothing here claims to be implemented. `docs/sdd/08-board.md` and
`docs/sdd/12-delivery-log.md` are where delivery is recorded, and neither says so yet.
