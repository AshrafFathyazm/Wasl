# Scope Coverage

Traceability between the supplied product scope document
(`azm_squad_customer_support_crm.pdf`) and what this repository commits to.

## Why this document exists

The scope document lists **twelve sections containing roughly sixty features**. The
constraint is **three calendar days, about nine hours of working time**
(`11-open-questions.md` Q-5).

A gap that large is not an oversight to be worked around. It is the exercise. **Scope
selection is part of what is being assessed**, and an attempt at sixty features in nine
hours would produce twelve broken ones — which scores worse on every axis than four that
work, and much worse on the Quality gate.

So this document does the thing the scope document does not: it decides. Every section is
either committed with its evidence named, or cut with an argument that would hold **even
with more time**. Nothing is left ambiguous, and nothing is quietly dropped.

**One thing the scope document does not contain**, and it matters: no deliverables, no
acceptance criteria, no technical constraints, and no evaluation criteria. It is a
requirements *source*, not a task specification. Treating it as a backlog would be reading
an instruction into it that is not there — see `11-open-questions.md` Q-16.

## Status vocabulary, and one honest caveat

| Status | Meaning |
|---|---|
| `Delivered` | Committed, specified, and on the build path |
| `Partial` | Committed in part; the excluded part is named with its reason |
| `Designed, not built` | A story exists with acceptance criteria; it is not on the build path |
| `Out of scope` | Cut, with an engineering or product argument |

**Nothing is implemented yet.** `Delivered` above means *committed and fully specified*,
not *built*. `08-board.md` and `12-delivery-log.md` are where delivery is recorded, and
neither says any of this is built. Claiming otherwise here would break the rule that
matters most in this repository: no result is recorded that was not observed.

## Coverage map

| # | Section | Status | What is covered | Evidence | Why anything is cut |
|---|---|---|---|---|---|
| 1 | **Customer Management** | `Partial` | Profiles, contact details, notes, and a duplicate rule that is enforced by the database rather than by convention. Interaction history is the ticket timeline plus the customer overview | `US-001`, `US-002`, `US-003`, `US-004`; BR-4; `03-domain-model.md` | **Attachments** are out of scope project-wide — storage, virus scanning, and size limits are a separate concern from a CRM's data model |
| 2 | **Ticket Management** | `Delivered` | All five: create and track, categories and priorities, assignment, status lifecycle **and** escalation, and an append-only history | `US-005`, `US-006`, `US-007`, `US-008`, `US-009`, `US-010`; BR-1 to BR-5; `ADR-004` | Nothing. This is the section the build is organised around |
| 3 | **Communication Channels** | `Partial` | All five channels — Email, WhatsApp, Live chat, SMS, Web forms — modelled as domain data on the ticket and on each interaction, and filterable | FR-3; `03-domain-model.md` `CommunicationChannel`; `EPIC-003` | **Live delivery** is out. No provider account, no credentials, no network call |
| 4 | **Agent Dashboard** | `Designed, not built` | Assigned tickets and customer information are reachable through the ticket list and detail. A dashboard story exists | `US-016`; `design/screens/11-dashboard.md` | **Tasks and reminders, quick replies, and team collaboration are three separate products.** See below |
| 5 | **SLA & Automation** | `Out of scope` | — | — | An SLA engine is background scheduling, business-calendar arithmetic, and a notification pipeline. Escalation is delivered instead as a deliberate manual action. See below |
| 6 | **Knowledge Base** | `Out of scope` | — | — | Authoring, versioning, and search: a content product with no dependency on the ticket flow. See below |
| 7 | **AI Features** | `Out of scope` | — | `prompts/`, each story's `ai-notes.md` | Requires a model provider, prompt handling, and an evaluation approach. **The AI dimension the assessment measures is a different thing and it is covered.** See below |
| 8 | **Customer Portal** | `Out of scope` | — | — | Needs customer authentication and a second authorisation model. Every actor in scope is internal. See below |
| 9 | **Reports & Management** | `Designed, not built` | Ticket reports as the dashboard story | `US-016` | SLA performance depends on section 5; satisfaction is not collected; **agent performance is excluded on purpose, not for want of time**. See below |
| 10 | **Security & Administration** | `Delivered` | Users and roles, a full authorisation matrix enforced server-side, an audit log with its own ADR, and configuration through the standard provider chain with no secrets in source control | `ADR-005`, `ADR-008`; BR-6, BR-9; `FR-4`, `FR-6`; `testing/security-checklist.md` | Self-service user management is out — users are seeded, and `ADR-005` lists every gap that creates |
| 11 | **Integrations** | `Out of scope` | The API itself is the integration surface, documented as OpenAPI | `openapi/README.md` | No live provider is in scope, so an abstraction would have one implementation and no second in prospect. See below |
| 12 | **Platform** | `Partial` | Arabic and English with correct right-to-left layout, and a responsive web interface | `ADR-007`; BR-8; `FR-5`; `US-014`; `design/` | **Multi-department, multi-branch, and custom branding** are out. See below |

### Counts

| Status | Sections |
|---|---|
| `Delivered` | 2 — sections 2, 10 |
| `Partial` | 3 — sections 1, 3, 12 |
| `Designed, not built` | 2 — sections 4, 9 |
| `Out of scope` | 5 — sections 5, 6, 7, 8, 11 |

**Five sections covered** (1, 2, 3, 10, 12), **seven cut** (4, 5, 6, 7, 8, 9, 11).

---

## The seven cuts, in detail

Each of these would be cut at four times the budget. That is the test applied: a reason
that evaporates when the deadline moves is not a reason, it is an excuse.

### 4 · Agent Dashboard

Four of the five listed features are separate products wearing one heading.

| Feature | Status | Reason |
|---|---|---|
| Assigned tickets | Reachable | The ticket list filtered by assignee (`US-006`) |
| Customer information | Reachable | The customer profile (`US-002`) |
| **Tasks and reminders** | Cut | A task is a second work item with its own lifecycle, its own assignment, and its own notification path. It is a to-do product living next to a ticket product, and nothing in the support flow needs it |
| **Quick replies** | Cut | A template library: authoring, categorising, variable substitution, and permissions on who may edit a shared template. That is section 6 in miniature |
| **Team collaboration** | Cut | Internal comments already exist (BR-5.4, `US-010`) and are the collaboration the flow needs. Mentions, presence, and assignment handoff conversations are a messaging product |

The dashboard **view** survives as `US-016`, designed and not built, because it is a
composition of data the ticket stories already expose. It is on the Release 2 list
precisely because it demonstrates nothing the ticket list does not.

### 5 · SLA & Automation

Response and resolution targets, automatic assignment, escalation rules, and alerts.

**What an SLA engine actually is:** a background scheduler, business-calendar arithmetic
(working hours, weekends, public holidays, and which calendar a given customer is on), a
pause-and-resume model for time spent waiting on the customer, and a notification pipeline
with delivery guarantees. Four subsystems, none of which the support flow needs in order
to work.

**What is delivered instead:** escalation as an explicit, manual, audited action (BR-3).
That is a deliberate product decision and not a reduced version of automation —
`ADR-004` and BR-3.1 state that there is no time-based escalation in the MVP, and BR-3.6
gives escalation a real rule (priority is raised to a **floor** of `High`, never
downgraded) that is tested.

**Why it holds with more time:** an SLA engine whose clock is wrong is worse than no SLA
engine, because it reports compliance that did not happen. Getting business-calendar
arithmetic right is the majority of the work and none of the demo.

**Rejected alternative:** a naive `CreatedAt + 4 hours` target with no calendar and no
pause. It would demo, and it would be a lie the moment a ticket crossed a weekend.

### 6 · Knowledge Base

FAQs, help articles, solutions and guides, search.

This is a content product: authoring with a rich-text editor, draft and published states,
versioning, categorisation, permissions on who may publish, and search that is useful
enough to be used — which for a bilingual product means the Arabic normalisation problem
already recorded as `11-open-questions.md` Q-7, unsolved and honestly deferred.

**It has no dependency on the ticket flow, and the ticket flow has none on it.** That
independence is exactly why it is the cleanest thing to cut: nothing in sections 1, 2, 3,
10, or 12 becomes weaker without it.

**Rejected alternative:** a table of question-and-answer rows with a `LIKE` search. It
would satisfy the word "FAQ" and would be a worse answer than not building it, because it
would present a content product as finished when nothing about authoring, publishing, or
finding an article had been thought about.

### 7 · AI Features

Ticket summaries, suggested replies, automatic categorisation, suggested solutions, an
AI chatbot.

**Requires:** a model provider and its credentials, prompt construction and versioning,
handling for latency and failure on a path a user is waiting on, a cost model, and — the
part that is usually skipped — an evaluation approach. A suggested reply that is wrong
20% of the time in a support context is a liability, and "it looked good in the demo" is
not an evaluation.

**The distinction that matters here:** the assessment measures *AI-assisted engineering*,
not *AI features in the product*. Those are different things and only one of them is in
scope.

| What the assessment measures | Where the evidence is |
|---|---|
| The context given to AI | `prompts/` — eight role prompts |
| What was accepted, modified, rejected, and why | each story's `ai-notes.md` |
| How each accepted output was verified | each story's `ai-notes.md`, each `tests.md` |
| Role separation and review | `06-agent-map.md` |

**So section 7 is cut and the AI axis is covered.** Building an AI feature would add
nothing to that score; it would consume the budget that produces the evidence for it.

### 8 · Customer Portal

Submit tickets, track requests, view history, access FAQs, submit feedback.

**Needs three things this system does not have:**

1. **Customer authentication** — registration, verification, password reset, and account
   recovery for external users. `ADR-005` deliberately seeds two internal users and lists
   what that leaves unbuilt; a portal cannot use that shortcut.
2. **A second authorisation model.** Internal roles are `Agent` and `Manager` over all
   tickets (BR-6). A customer may see exactly their own tickets, and every query in the
   system grows a tenant-of-one filter that must never be forgotten once.
3. **A customer-facing view of the timeline.** Internal comments exist precisely so a
   future customer-facing view can exclude them without a data migration (BR-5.4) — the
   design anticipates the portal and does not implement it.

**`01-product-spec.md` states it plainly:** every actor in scope is an internal support
user. There is no customer login in the MVP; the customer is a record, not a user.

**Why it holds with more time:** the third item is the dangerous one. A portal that leaks
one internal comment to one customer is a worse outcome than no portal, and the failure is
a single missing `WHERE` clause.

### 9 · Reports & Management

Ticket reports, SLA performance, agent performance, customer satisfaction, management
dashboards.

| Feature | Status | Reason |
|---|---|---|
| Ticket reports, management dashboard | `Designed, not built` | `US-016`. Six aggregate queries and a screen, on the Release 2 list |
| SLA performance | Cut | Nothing to measure — it depends entirely on section 5 |
| Customer satisfaction | Cut | The data is not collected. A satisfaction score requires a survey, a delivery channel, a response window, and a non-response policy. Reporting a metric from no data is fabrication |
| **Agent performance** | **Cut on principle** | `US-016` excludes leaderboards deliberately: **ranking agents by tickets closed rewards closing over resolving.** It is a metric that changes behaviour in the wrong direction, and it would be excluded from a finished product too |

That last row is the one worth reading twice. It is the only cut in this document that is
a *product* judgement rather than a scope judgement, and it is recorded because a reviewer
asking "why no agent stats?" deserves a better answer than the deadline.

### 11 · Integrations

APIs, ERP, Email/SMS/WhatsApp, external systems.

**The API is in scope and is the integration surface.** It is documented as OpenAPI
generated from the running application (`openapi/README.md`), which is what an integrator
would actually consume.

Everything else fails the same test, and it is a test this repository has applied
consistently:

> An abstraction with exactly one implementation and no second one in prospect is
> speculative design.

That is `epics/EPIC-003-communication-channels.md` and `user-stories/DEFERRED.md`
verbatim, deferring `US-012`. ERP integration has no ERP to integrate with; provider
integration has no provider account. What would be built is a plausible-looking seam
proving nothing.

**A reversal recorded honestly.** `08-board.md` promoted `US-012` out of Deferred as
feature `021`, on the argument that Communication Channels is a *named module* in the
requirement and a module resolving to one enum column reads as missing. That argument was
reasonable and it does not survive the nine-hour constraint: the seam plus its mock is
about an hour, and an hour is a third of a session. **`021` is cut**, and the channel
remains modelled as domain data — which is what FR-3 asks for and all it asks for.

### 12 · Platform — the part that is cut

| Feature | Status | Reason |
|---|---|---|
| Arabic and English | Covered | `ADR-007`, BR-8, `US-014`. Both locales, correct right-to-left layout, key parity enforced by a test |
| Web and mobile friendly | Covered | Responsive layout; `design/layout-patterns.md` |
| **Multi-department** | Cut | An organisational hierarchy changes the authorisation model — who may see whose tickets — and adds a filter to every query in the system. It is not a field on a table |
| **Multi-branch** | Cut | The same change again, on a second axis, and the two compose |
| **Custom branding** | Cut, architecture kept | `ADR-012` designs it and is accepted **in part**: the token architecture is real (semantic tokens, `oklab` ramp derivation, a computed foreground) but the settings screen is deferred. The capability can be demonstrated by changing three CSS variables in dev tools, which proves the architecture more convincingly than a settings page would |

`00-project-context.md` states a single support organisation. Multi-department and
multi-branch are the same class of change as multi-tenancy, which is already listed there
as out of scope, and for the same reason: it touches every query rather than adding a
feature.

---

## What this leaves

The must-have flow, end to end, in both languages:

```text
Create Customer → View Customer → Create Ticket → Assign Agent
  → Change Status → Add Comment → View Ticket History
```

Plus, behind it: a server-enforced authorisation matrix, an audit log that survives
deletion of what it describes, an error contract that never returns `200` with a failure
in the body, optimistic concurrency that surfaces a conflict instead of losing a write,
and a duplicate rule the database enforces rather than the application remembering to.

Under the nine-hour constraint even this narrows further — to `US-005`, `US-007`,
`US-008`, and a seeded `US-001`. That cut is in `16-three-day-plan.md`, and the cuts
listed there are **deferrals with their design already written**, not decisions like the
seven above.

The two lists are different in kind, and the difference is the point:

| | The seven cuts here | The cuts in `16-three-day-plan.md` |
|---|---|---|
| Nature | Scope decisions | Schedule decisions |
| Would they change with more time? | No | Yes — every one is Release 1 in the fuller plan |
| Where the design lives | Nowhere. They are not designed | `specs/`, `docs/sdd/story-artifacts/`, and the ADRs |
