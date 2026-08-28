# Feature Specifications

> **The nine-hour constraint was lifted on 2026-08-27** — three additional days.
> [docs/sdd/PHASES.md](../docs/sdd/PHASES.md) governs; `16-three-day-plan.md` is superseded and
> kept as the record of what was cut under the constraint and why. What was cut from the **product
> scope** — a separate question, and unchanged by the clock — is
> [docs/sdd/15-scope-coverage.md](../docs/sdd/15-scope-coverage.md).

## Delivery order — set by the product owner 2026-08-28

Ten backend features are delivered: `001` · `002` core · `003` core · `004` backend half · `008` ·
`009` · `010` · `011` · `012` · `013`. `006` was delivered **inside `023`** — see its row below.

013-ticket-timeline-and-comments    DONE 2026-08-28
008-customer-list-and-profile       DONE 2026-08-28
007-create-customer                 NEXT
004b · 002b · 003b                  the deferred halves
005-localization-core               LAST
```

**Why this order, in the product owner's terms.**

| # | Feature | Reason it is here |
|---|---|---|
| ✅ | `013` | **Done.** It makes a ticket read as a conversation rather than a row in a table. `dbo.TicketHistory` is already written and correct — `Created`, `StatusChanged`, `Assigned`, `Unassigned`, each with both values and now with an actor — so this is the read surface over data that exists. `CLAUDE.md` names `TicketTimelineQuery` as one of only two sanctioned named query classes |
| ✅ | `008` | **Done — and it removed the stub.** `024-frontend-create-ticket-form` has a finished customer picker running on hard-coded data because `GET /api/customers` does not exist. This makes a built screen work on real data, which is the cheapest remaining unit of visible progress |
| 1 | `007` | **NEXT.**  Closes the circle `008` opens: a customer created from the screen instead of by `--seed` |
| 2 | `004b` (the audit row on a denial — the `401` body half is **done**) · `002b` · `003b` | The deferred halves. Each is named with its reason in the README's *Deferred halves* table, and none of them unblocks another feature |
| 3 | `005` | **Last, deliberately: it opens nothing.** The seam is already built — every server-authored message is a symbolic key rather than a sentence, and `023` shipped the client catalogues in `en` and `ar`. What remains is `PUT /api/me/language` and the switcher screen |

The ordering rule visible in that list is not "hardest first" or "most valuable first" — it is
**what unblocks something else, first.** `011` was chosen over `004b` on the same grounds: it was
the only thing that would attach `ManagerOnly` to a real endpoint. `005` is last for the mirror
image of that reason.

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

### The exception: a folder owned by one lane carries the lane in its name

The rule above is the default and stays the default. It assumes a feature has two halves.
Some do not.

**When a feature is one lane end to end, the folder says so: `NNN-frontend-<name>`.**
There is no `## Backend` section to write, no contract between two lanes to freeze, and
no second set of tasks — so a shared folder would be a shared folder with one occupant,
and the name would give a reader no way to tell.

| Folder | Why it carries the lane |
|---|---|
| `023-frontend-foundation` | Scaffold, tokens, primitives, shell, i18n. No endpoint, no migration, no `.cs` file |
| `024-frontend-create-ticket-form` | The screen for `009`. `009` is the backend feature and owns the frozen contract; this consumes it |
| `025-frontend-auth` | The login screen and route guard for `004`. Same relationship: `004` owns the contract, this consumes it |

Two conditions, and both must hold:

1. **The feature is purely one lane.** If it grows a backend half, it stops qualifying —
   and the answer then is to move that half into its own numbered feature with a frozen
   contract between them, not to rename this one back.
2. **The other lane's feature is named in the spec's first paragraph**, so the pair is
   findable from either side. `024`'s first line points at `009`; `009`'s *Out of scope*
   points back.

A folder with **no** lane word is shared, and `plan.md` splits into `## Backend` /
`## Frontend` as above. The absence of the word is information, which only works if the
word is used consistently when it applies.


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

All 22 features are **specified**, and 23 and 24 are named. Four are implemented:
**`001-solution-skeleton`** (2026-08-25 — 17 tests, CI green), the **core of
`002-error-contract`** (33 tests), the **core of `003-audit-trail`** (93 tests) and the
**backend of `009-create-ticket`** (2026-08-26 — 214 tests, 0 warnings). `002b` and `003b` are
deferred with a reason per task; `009`'s two auth criteria belong to `004` and its form to
`024-frontend-create-ticket-form`. The other 18 are awaiting review.

| Feature | Phase | Origin |
|---|---|---|
| `001-solution-skeleton` | 0 | Authored — **✅ implemented 2026-08-25**, 17 tests, CI green |
| `002-error-contract` | 0 | Authored — **✅ core implemented 2026-08-25**, 33 tests. `002b` deferred |
| `003-audit-trail` | 0 | Authored — **✅ core implemented 2026-08-25**, 93 tests. `003b` deferred |
| `004-auth-and-roles` | 0 | **✅ Backend half implemented 2026-08-27**, 303 tests. `SupportUsers` + the four FKs `009` deferred, two seeded users, the token endpoint, real `ICurrentUser`, the two policies. `004b` owns the audit row on a `401`/`403` (a gap in BR-9.4) and rate limiting; the frontend half is the frontend lane's |
| `005-localization-core` | 0 | Authored. **The seam is built** — every server-authored message is a symbolic key and `023` shipped the client catalogues, so what remains is `PUT /api/me/language` and the switcher screen. **Deliberately last: it opens no other feature** |
| `006-design-system` | 0 | **✅ Built — inside `023-frontend-foundation`, not here.** The folder exists and is empty of delivery artifacts, which reads as "not done" and is wrong: the tokens, the primitives and the layout patterns were designed and shipped as part of the frontend foundation, and their evidence lives in `023`'s `summary.md` and in `docs/sdd/design/`. This row exists so nobody re-opens it looking for missing work. ADR-012 accepted the token architecture **in part** — the tenant-theming settings screen is `022` and is out of the release |
| `008-customer-list-and-profile` | 1 | Migrated from `US-002-customer-list`. **Next after `013`.** It removes a stub: `024-frontend-create-ticket-form` has a built customer picker running on hard-coded data because `GET /api/customers` does not exist, so this feature makes a finished screen work on real data — the cheapest remaining unit of visible progress |
| `010-ticket-list-and-detail` | 2 | Migrated from `US-006-list-tickets` — **✅ backend implemented 2026-08-26**, 263 tests. Filters and search deferred to `015` |
| `007-create-customer` | 1 | Migrated from `US-001-create-customer` |
| `012-change-ticket-status` | 2 | Migrated from `US-008-change-status` — **✅ backend implemented 2026-08-26**, 250 tests |
| `009-create-ticket` | 2 | Migrated from `US-005-create-ticket` — **✅ backend implemented 2026-08-26**, 214 tests. Gained the BR-1 map + 36 tests (from `012`) and `GET /api/tickets/{id}` (from `010`). No auth (`004`); form is `024-frontend-create-ticket-form` |
| `011-assign-ticket` | 2 | Migrated from `US-007-assign-ticket` — **✅ backend implemented 2026-08-28**, 340 tests. BR-2 in full, `GET /api/support-users`, no migration. `data-model.md` had four false statements and `plan.md` rested on the rejected ADR-010; both corrected in tables before implementation. Picker UI is the frontend lane's |
| `013-ticket-timeline-and-comments` | 3 | **✅ Backend implemented 2026-08-28**, 378 tests. `dbo.TicketComments`, `POST /comments`, `GET /timeline` with a cursor, `TicketTimelineQuery`. AC-18 proved `003`'s comment-body redaction fires — it never had. **AC-14 is open with an argument and no test**: nothing counts query round trips. Timeline UI is the frontend lane's |
| `014-language-preference-and-rtl` | 4 | Migrated from `US-014-language-preference` |
| `015-ticket-filters-and-search` | 5 | Migrated from `US-006-list-filter-tickets` (filter half) |
| `016-escalate-ticket` | 5 | Migrated from `US-009-escalate-ticket` |
| `017-update-customer` | 5 | Migrated from `US-003-update-customer` |
| `018-customer-overview` | 5 | Migrated from `US-004-customer-overview` |
| `019-audit-log-access` | 5 | Migrated from `US-015-audit-log-access` |
| `020-dashboard` | 5 | Authored from `US-016-dashboard` — no prior artifacts existed |
| `021-communication-provider-abstraction` | 5 | Authored — promoted out of `DEFERRED.md` |
| `022-tenant-theming-settings` | 5 | Authored from ADR-012 |
| `023-frontend-foundation` | — | **✅ Delivered by the frontend lane.** Scaffold, design tokens, primitives, shell, i18n catalogues in `en` and `ar`, RTL. No endpoint, no migration, no `.cs` file. **`006-design-system` was delivered inside this feature** |
| `024-frontend-create-ticket-form` | — | The screen for `009`. In progress in the frontend lane. Its customer picker runs on a **stub** until `008` ships `GET /api/customers` |
| `025-frontend-auth` | — | The login screen, route guard, `401` interceptor and sign-out — `004`'s frontend half (AC-24 … AC-30). In progress in the frontend lane |

### What "migrated" means

The `spec.md`, `plan.md`, and `tasks.md` in a migrated feature were **already written**
before implementation began — that is the whole point of the blueprint, and it is why
thirty of the hundred assessment points are earned before an editor is opened. Migration
preserved their content and their acceptance-criteria numbering, and did four things:

1. **Repaired what they predate.** They were written against PostgreSQL (ADR-001), a
   four-project layout (ADR-002), and before the audit log existed (ADR-008). Every
   `uuid`, `timestamptz`, `xmin`, `varchar`, `Wasl.Application` path, and controller is
   now what ADR-013 and ADR-010 actually say.
2. **Added the audit obligation.** Most originals carry no audit task, because they are
   older than ADR-008 — and `NFR-10`'s architecture test would have failed the build.
3. **Added the artifacts spec-kit needs and story-artifacts did not have:** the frozen
   contract, the frontend handoff guide, the frontend spec, the data model, the research
   record, and the requirements checklist.
4. **Added `Agent` and `Skill` to every task row**, so who does what is part of the plan
   rather than decided in the moment.

`tests.md`, `ai-notes.md`, `review.md`, `summary.md`, `backend.md`, and `frontend.md` are
deliberately **unfilled templates** in every feature. They are evidence artifacts; filling
one before the work happens would make it a false statement.

Nothing here claims to be implemented. `docs/sdd/08-board.md` and
`docs/sdd/12-delivery-log.md` are where delivery is recorded, and neither says so yet.

---

## A cross-feature test utility — **BUILT in `008`**, 2026-08-28

**A `DbCommandInterceptor` that counts round trips per request** — recorded here, in the plan that
owns the delivery order, because **four features have an acceptance criterion it would close and
each of them is currently arguing the criterion by inspection instead of asserting it.**

| Feature | The criterion | Its current status |
|---|---|---|
| `013` | AC-14 — the timeline query must not issue a query per entry to resolve actor names | **✅ Measured 2026-08-28.** Was: The name is resolved by a `JOIN` in both branches of the union and no code path can loop, so it is almost certainly met — and nothing proves it. Recorded in `013/tests.md` under *Not claimed* |
| `010` | The list projects the customer name in the same query rather than per row | **✅ Measured 2026-08-28.** Was: asserted only that the name arrived, which a lazy load would also satisfy |
| `008` | The customer list must not fetch a ticket count per customer — the classic N+1 in this product's shape | **✅ Measured 2026-08-28**, and the same N+1 was used as the negative control |
| `020` | The dashboard aggregates in one query per widget, not one per row | Not built. `DashboardAggregatesQuery` is the second sanctioned named query class and this is the criterion that justifies it |

**Why one utility and not four assertions.** Each feature could count queries its own way — a
logger scan, a stopwatch, a hand-rolled interceptor in one test class — and then there are four
mechanisms measuring the same property, of which the ones written later agree with the earlier ones
until they do not. `003` learned the same thing about audit writers: the second way to do something
is where the drift lives.

**What it has to be, to be worth building.** A `DbCommandInterceptor` registered only in the test
host, accumulating a per-scope count, exposed as something a test can read after a request:

```text
using var probe = factory.CountQueries();
await client.GetAsync($"/api/tickets/{id}/timeline");
probe.Count.Should().BeLessThanOrEqualTo(2);   // the existence check, then the union
```

**And it must fail loudly when it measures nothing** — `023`'s §12 rule and `001`'s false-negative
architecture test both point at the same failure: a counter that is never wired reports zero, and
zero passes every "no more than N queries" assertion ever written. So the utility asserts its own
lower bound (`Count > 0`) before any test reads it.

**Built in `008` on the product owner's ruling, and it did what it was supposed to.** `013` AC-14
and `010` AC-12's second half were both retired in the same commit, and the negative controls
proved two things rather than one: removing the seam makes all three tests fail **loudly** with a
message naming what to check, and adding the exact N+1 the `Tickets` count column would have
caused makes the counter report *twelve rows cost 14 round trips and one row cost 3*.

**The lower bound is the part that matters.** `Count` throws when it observed no commands, because
`BeLessThan(3)` is satisfied by zero and an unattached interceptor would have made all three tests
green no-ops — `001`'s false negative, prevented by design.

Remaining consumer: **`020`'s per-widget aggregate**, which can now assert its criterion on
delivery instead of arguing it.
whether that is worth it is a scheduling decision, not a technical one.
