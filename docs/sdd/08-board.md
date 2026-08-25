# Delivery Board

Last updated: *(update this line with every board change)*

## Legend

| Phase | Meaning |
|---|---|
| `Backlog` | Not planned for this release |
| `Drafted` | Story defined with acceptance criteria in `user-stories/`; no artifacts yet |
| `Specified` | `spec.md` complete |
| `Planned` | `plan.md` and `tasks.md` complete |
| `In Progress` | Implementation started |
| `In Review` | Implementation and tests complete, awaiting review |
| `Done` | Definition of Done satisfied with evidence |
| `Deferred` | Consciously cut, with a recorded reason |

## Three-day constraint

**Deadline Wednesday 26 August. About nine hours of working time.** This answers
`11-open-questions.md` Q-5, which had been open since before the deadline was known.

The tables below are unchanged and remain the plan for the unconstrained build. Under nine
hours the committed scope is narrower:

| Committed under nine hours | Note |
|---|---|
| **US-005** Create Ticket | |
| **US-007** Assign Ticket | |
| **US-008** Change Ticket Status | With the full BR-1 transition test set |
| **US-001** Create Customer | **Seeded**, not built through the UI. The endpoint's spec is written and unbuilt |

**Everything else in Release 1 moves to Release 2** — US-002, US-006, US-010, US-014, and
the localization and audit infrastructure. Authentication is split: the token endpoint,
seeded users, and authorisation policies are **in**, because BR-2 and BR-6 have `403`
acceptance criteria and a faked user would make them unverifiable (`ADR-005`). The login
screen is out.

The session-by-session plan is `16-three-day-plan.md`. It also records a real conflict
this creates with the compression section further down this file, which says localization
and the audit behaviour are never cut — under nine hours, two of those four are cut, and
that contradiction is documented there rather than quietly resolved.

Product-level scope selection against the twelve sections of the supplied scope document
is a separate question and lives in `15-scope-coverage.md`. Those are decisions; these are
schedule.

## Release 1 — the core flow

These eight stories are the committed scope. Every one of them goes through the full
pipeline.

Localization made this list longer, and pretending otherwise would be the kind of
planning that looks tidy and then misses. The infrastructure moves into step 1 of the
build order and US-014 is added at the end. If the session is short, US-006 leaves
Release 1 before anything else does — see the compression note below.

| Story | Title | Phase | Depends on |
|---|---|---|---|
| US-001 | Create Customer | Planned | — |
| US-002 | View Customer | Planned | US-001 |
| US-005 | Create Ticket | Planned | US-001 |
| US-006 | List and Filter Tickets | Planned | US-005 |
| US-007 | Assign Ticket | Planned | US-005 |
| US-008 | Change Ticket Status | Planned | US-005, US-007 |
| US-010 | Ticket Timeline and Comments | Planned | US-005 |
| US-014 | Language Preference and RTL Support | Planned | Skeleton, and every Release 1 screen |

## Release 2 — valuable, not essential

Drafted only — acceptance criteria exist in `user-stories/`, but no story artifacts
have been produced. Promoted into Release 1 only if the core flow is complete and
reviewed with time to spare.

| Story | Title | Phase | Reason for ordering |
|---|---|---|---|
| US-003 | Update Customer | Drafted | Create + view proves the write and read path; update adds concurrency handling but no new concept |
| US-004 | Customer Overview | Drafted | A composition of data the other stories already expose |
| US-009 | Escalate Ticket | Drafted | Rules are fully defined in BR-3; implementation is small once the state machine exists |
| US-016 | Dashboard | Drafted | Depends on the ticket stories being real. Valuable, and not on the critical demo path |
| US-015 | Audit Log Access | Drafted | The audit *writing* is in the skeleton and is where the value is. The read endpoint can wait — until it exists, the log is queryable with SQL |

## Deferred

| Story | Title | Reason |
|---|---|---|
| US-011 | Channel Classification | Absorbed into US-005 and US-010 — channel is a field on the ticket and the comment, not a separate feature. Keeping it as a story would have inflated the board without adding work. |
| US-012 | Provider Abstraction | No live provider is in scope, so an abstraction would have no second implementation to justify it. Adding it now would be speculative design. |
| US-013 | Incoming Interaction Registration | Requires an inbound endpoint and a provider webhook contract that is out of scope. |

## Recommended build order

```text
 1. Walking skeleton    Solution, DbContext, auth, error middleware, health, CI,
                        the localization infrastructure on both sides,
                        the audit log table, pipeline behaviour, and
                        architecture test,
                        AND design tokens plus the eight primitives (1 day, capped)
 2. US-001              Create Customer
 3. US-002              View Customer
 4. US-005              Create Ticket
 5. US-007              Assign Ticket
 6. US-008              Change Ticket Status
 7. US-010              Timeline and Comments
 8. US-006              List and Filter Tickets
 9. US-014              Language Preference and RTL Support
10. ── core demo flow complete and demonstrable in both languages here ──
11. US-004              Customer Overview
12. US-003              Update Customer
13. US-009              Escalate Ticket
```

Step 1 is not a story, but it is the largest single risk in the plan: authentication,
the error contract, and the test harness all have to work before any story can be
verified. It is built first, deliberately, and thin.

The localization infrastructure belongs in step 1 for a specific reason: retrofitting
it means revisiting every string and every stylesheet already written. Building each
screen with translation from the start costs almost nothing per screen; converting
seven finished screens costs a day and misses things. This is the reasoning in
`decisions/ADR-007-localization.md`, and it is the one place in this plan where doing
work early is unambiguously cheaper than doing it late.

US-014 sits at step 9 rather than step 2 because the switcher and the right-to-left
review need screens to act on. The *infrastructure* is early; the *story* is late.
They are deliberately not the same thing.

The audit log follows the same pattern for the same reason. Adding a `SaveChanges`-time
audit row to seven existing command handlers is seven edits and one that gets missed;
having the pipeline behaviour in place first means every handler is audited by
construction and the architecture test catches the exception. The read endpoint
(US-015) is Release 2, because writing the log is where the value is and reading it can
be done with SQL until the endpoint exists.

Design tokens are in the skeleton for a third instance of the same reason: retrofitting
a design system means revisiting every component already written. Extracting tokens
first means every component is built against them from the start.

**Three rounds of scope have now been added to the skeleton — localization, audit, and
design tokens.** Each was the right call, and each was cheap at the start and expensive
later. But the skeleton is no longer thin, and the honest position is that it is now
roughly two days of work before the first story begins. The estimate should say that
rather than absorb it.

The design work is the only one of the three with a **hard timebox**: one day, stop
where it stops. The other two fail badly if left incomplete — a partial audit log has
invisible holes, and partial localization means shipping English. Partial design work
degrades gracefully: tokens with plain controls looks intentional.

US-006 sits after US-010 because the list becomes far more useful once tickets have
real state to filter by, and because it is the safest story to compress if time runs
out — a list with fewer filters still demonstrates the flow.

## Compression order

If the session is shorter than the plan assumes, scope leaves Release 1 in this order:

| # | What leaves | What is lost | Why it goes first |
|---|---|---|---|
| 1 | US-006 filters, reduced to a plain paginated list | Filtering by status and assignee from the UI | The flow still demonstrates end to end; see the compression plan in its own `tasks.md` |
| 2 | US-010 pagination on the timeline | Only the most recent 50 entries are reachable | Cosmetic on a demo dataset |
| 3 | US-014 cross-device persistence of the language preference | The choice lives on one device | The switcher and the Arabic interface still work |
| 4 | Design primitives beyond Button, Input, and Badge | Modal, Toast, and Table fall back to plain elements | Tokens carry most of the resemblance; the rest is polish (ADR-009) |

**Never cut:** the localization infrastructure, the Arabic pass over whatever screens
do exist, the audit pipeline behaviour, or the state machine tests. An audit log added
after the handlers exist is an audit log with holes in it, and the holes are invisible. Cutting the first two means shipping an
English-only product against a stated requirement. Cutting the third means the central
business rule is unproven.

> **Superseded for the nine-hour build — see `16-three-day-plan.md`.**
>
> The paragraph above was written assuming 20–25 hours, where localization and audit are
> roughly a tenth of the budget. At nine hours they are a third, and the answer is neither
> "keep in full" nor "cut": both are **reduced to their minimum useful form** — the
> catalogue and the Arabic strings without the switcher screen, the table and the pipeline
> behaviour without the read endpoint. Roughly 1h45 rather than three hours, and both
> capabilities are demonstrably present rather than absent.
>
> The state machine tests are not reduced. They stay as written.
>
> This is a changed constraint producing a changed decision, recorded in
> `12-delivery-log.md`. It is not a contradiction of the paragraph above; it is what that
> paragraph would have said at nine hours.

## Work-in-progress limit

One story in `In Progress` at a time. The cost of a half-finished second story is
paid twice: once in context switching, and once in a review that cannot conclude.

---

## Spec-kit feature mapping

**Added 2026-08-23.** The work is executed through GitHub Spec Kit, which numbers
features sequentially in `specs/NNN-slug/`. The `US-*` identifiers in this repository
do not disappear — they stay as the requirement identity that acceptance criteria and
tests cite. This table is the join between the two.

Read it as: *the board decides what to build and in what order; `specs/` is where the
artifacts for it live.*

| Phase | Feature folder | Story | Notes |
|---|---|---|---|
| **0 · Foundation** | `001-solution-skeleton` | — | **✅ Done 2026-08-25** — 17 tests, CI green (run 32828391167). Four projects, `IApplicationDbContext`, UTC converter, `Customers` + `InitialCreate`, `GET /health` |
| | `002-error-contract` | — | PHASES 1.3–1.4. `ProblemDetails` middleware + validation behaviour |
| | `003-audit-trail` | — | PHASES 1.5. `AuditLog`, audit behaviour, architecture test |
| | `004-auth-and-roles` | Auth | PHASES 2.1–2.2. JWT, two seeded users, policies, `ICurrentUser` |
| | `005-localization-core` | — | PHASES 2.3–2.4. Culture resolution, `.resx`, key-parity test |
| | `006-design-system` | — | PHASES 1.7. Tokens + Button, Input, Badge. One day, hard stop (ADR-009) |
| **1 · Customers** | `007-create-customer` | **US-001** | First write path end to end |
| | `008-customer-list-and-profile` | **US-002** | |
| **2 · Ticket core** | `009-create-ticket` | **US-005** | |
| | `010-ticket-list-and-detail` | **US-006** (read half) | The list and detail screens, unfiltered. See the split note below |
| | `011-assign-ticket` | **US-007** | |
| | `012-change-ticket-status` | **US-008** | The state machine and its 36 transition tests |
| **3 · Collaboration** | `013-ticket-timeline-and-comments` | **US-010** | End of the committed demo flow |
| **4 · Language pass** | `014-language-preference-and-rtl` | **US-014** | Includes the manual Arabic pass as a deliverable |
| **5 · Release 2** | `015-ticket-filters-and-search` | **US-006** (filter half) | First to be cut |
| | `016-escalate-ticket` | **US-009** | |
| | `017-update-customer` | **US-003** | |
| | `018-customer-overview` | **US-004** | |
| | `019-audit-log-access` | **US-015** | |
| | `020-dashboard` | **US-016** | |
| | `021-communication-provider-abstraction` | **US-012** | Promoted from Deferred — see below |
| | `022-tenant-theming-settings` | — | ADR-012, settings screen only. The token architecture ships in `006` |

### Why US-006 is split into two features

`PHASES.md` puts the ticket list in Phase 3 and its filters in Phase 6; this board
treats US-006 as one Release 1 story. Both are right about something and the
disagreement was real: the **list** is on the critical demo path — you cannot show a
ticket without a screen that lists it — while the **filters** are the first thing the
compression order cuts.

Keeping them as one feature would mean a feature that is half critical and half
droppable, which makes "is it done?" unanswerable. So:

- `010-ticket-list-and-detail` — Release 1, not droppable. Paginated list, default sort,
  detail view, `allowedTransitions` on read.
- `015-ticket-filters-and-search` — Release 2, first to go. Status, priority, assignee,
  channel, escalated, free-text search, and the URL as the state container (ADR-011).

Both cite US-006 acceptance criteria, split between them explicitly in each `spec.md`.
No criterion belongs to both, and none is dropped in the split.

### Why US-012 is promoted out of Deferred

`user-stories/DEFERRED.md` rejected the provider abstraction as speculative: no live
provider is in scope, so an interface would have exactly one implementation and no
second one in prospect. That reasoning is sound in general and it is answering the wrong
question here.

**Communication Channels is a named module in the requirement**, alongside Customer
Management and Ticket Management. A module that resolves to one enum column reads as
missing rather than as scoped, and "we modelled the channel as data" is a weaker answer
than a working seam with one implementation behind it.

Scope: `ICommunicationProvider` with `Channel` and `SendAsync`, one
`MockCommunicationProvider` that records what it was asked to send, and DI registration
keyed by channel. **No real provider account, no credentials, no network call** — that
part of the original exclusion stands unchanged.

It sits in Release 2 because the core flow comes first, and it is small enough that it
does not compete with the stories above it.

### Attachments — excluded, and said so

The source requirement lists "Notes and attachments" under Customer Management.
`00-project-context.md` excludes attachments: storage, virus scanning, and size limits
are a separate concern, and notes plus comments carry the demo flow.

That exclusion stands. What changes is that it is stated in the affected feature's
`spec.md` under **Out of scope** with the reason, rather than only in the project-level
context file — because a reviewer reading one feature should not have to go looking for
why half a requirement line is missing.

`design/settings-and-uploads.md` already designs a bounded upload (a single ≤200KB
image from an authenticated internal user, per ADR-012). That is the shape an
attachments story would take if it were ever in scope, and it is written down.
