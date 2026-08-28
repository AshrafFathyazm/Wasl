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

## The schedule constraint — lifted 2026-08-27

**Three additional days were granted.** The nine-hour constraint this section used to carry
is gone, and with it the narrowed commitment it described: `US-005` · `US-007` · `US-008`
plus `US-001` seeded rather than built.

**`PHASES.md` governs from here.** `16-three-day-plan.md` is marked superseded and kept as
history — the cuts in it were argued, and the argument is the record.

The tables below were always the plan for the unconstrained build, so they now stand
without a caveat above them.

**What does not change:** product-level scope selection against the twelve sections of the
supplied scope document lives in `15-scope-coverage.md`. Those cuts are **decisions**, not
deferrals — seven of twelve sections are out for reasons that would hold at four times the
budget, and a longer clock is not an argument against any of them. The schedule moved; the
scope document did not.

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

> **Superseded for the nine-hour build — and the constraint was lifted 2026-08-27.**
>
> Read in order: the paragraph above assumed 20–25 hours; the nine-hour cut below replaced
> it; three extra days then restored the budget. So the paragraph above is the standing
> position again, and the note below is the record of what was delivered under the
> constraint — reduced form, which is what shipped and is still what exists today. The
> deferred halves (`005`'s catalogues, `019`'s read endpoint) are now buildable rather than
> cut. See `12-delivery-log.md` 2026-08-27.
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
| | `002-error-contract` | — | **✅ Core done 2026-08-25** — 33 tests, 0 warnings. Domain exception hierarchy, the 13-row `ProblemTypes` registry, one `ProblemDetailsFactory`, one `traceId` accessor, `ValidationBehaviour`. **`002b`** — status-code envelope (`404`/`405`/`415`), malformed request, Swashbuckle — deferred with a reason per task |
| | `003-audit-trail` | — | **✅ Core done 2026-08-25** — 93 tests, 0 warnings. `dbo.AuditLog`, the capture-only diff interceptor, BR-9.7 redaction, `TransactionBehaviour` + `AuditBehaviour` in `Wasl.Infrastructure`, one ordered registration in `Wasl.Api`, NFR-10 scanner with its self-test. **`003b`** — the `wasl_app` role, `DENY`, the restricted connection, AC-12/AC-13 — deferred whole: **append-only is an application property until then** |
| | `004-auth-and-roles` | Auth | **✅ Backend half done 2026-08-27** — 303 tests, 0 warnings. `dbo.SupportUsers` + the four FKs `009` deferred, two seeded users, `POST /api/auth/token` (HS256, role claim, 8h), real `ICurrentUser`, `ManagerOnly` + `RequireAuthenticatedUser` as the **fallback**, and `UseAuthentication` before `UseRequestLocalization` (ADR-007). **Named as open, not done:** AC-17/AC-18 — no audit row on a `401`/`403` — is a gap in BR-9.4, deferred to `004b`; no rate limit or lockout on the token endpoint. Login screen, route guard, `401` interceptor and sign-out belong to the frontend lane |
| | `005-localization-core` | — | PHASES 2.3–2.4. Culture resolution, `.resx`, key-parity test |
| | `006-design-system` | — | PHASES 1.7. Tokens + Button, Input, Badge. One day, hard stop (ADR-009) |
| **1 · Customers** | `007-create-customer` | **US-001** | First write path end to end |
| | `008-customer-list-and-profile` | **US-002** | |
| **2 · Ticket core** | `009-create-ticket` | **US-005** | **✅ Backend done 2026-08-26** — 214 tests, 0 warnings. `Ticket` + `TicketHistory` + the sequence, `POST /api/tickets`, `GET /api/tickets/{id}`, the BR-1 map with all 36 cells. No auth (`004`), form is `024-frontend-create-ticket-form`. Gained two pieces by decision: the **BR-1 transition map + all 36 tests** (from `012`) because AC-10 consumes it, and **`GET /api/tickets/{id}`** (from `010`) because the frozen contract promises `Location` resolves. Four FKs to `SupportUsers` deferred to `004` — that table never existed |
| | `010-ticket-list-and-detail` | **US-006** (read half) | **✅ Backend done 2026-08-26** — 263 tests, 0 warnings. `GET /api/tickets` with BR-7.2 clamping, newest-first, names projected in one query. `GET /api/tickets/{id}` shipped in `009`. Filters and search are `015`; both screens are the frontend lane's |
| | `011-assign-ticket` | **US-007** | **✅ Backend done 2026-08-28** — 340 tests, 0 warnings. `PUT /api/tickets/{id}/assignee`, `GET /api/support-users`, BR-2 in full, two history event types, no migration. **BR-2's data-dependent half is in the handler, not a policy, and that was measured:** moving it into `ManagerOnly` makes the denial's audit row cease to exist (`found 0: {empty}`) — a handler denial is audited, a policy denial is not, which is `004` AC-18 still being open. Exposed and fixed a defect two releases old: `TicketHistory.PerformedByUserId` was NULL on every row ever written. Picker UI is the frontend lane's |
| | `012-change-ticket-status` | **US-008** | **✅ Backend done 2026-08-26** — 250 tests, 0 warnings. `PUT /status`, three distinct `409` codes, optimistic concurrency, the two ordering decisions asserted. The map and its 36 tests were built in `009`, which consumes `allowedTransitions`. No auth (`004`) |
| **3 · Collaboration** | `013-ticket-timeline-and-comments` | **US-010** | **✅ Backend done 2026-08-28** — 378 tests, 0 warnings, run twice. `dbo.TicketComments`, `POST /comments`, `GET /timeline` with a **cursor** (not `010`'s envelope — `CLAUDE.md` records both shapes as deliberate), `TicketTimelineQuery`. **First feature able to prove two older claims:** `003`'s `TicketComment.Body` redaction had never fired, and `010`'s stable-sort guard was unprovable — here every comment produces a byte-identical timestamp pair, so deleting the tie-break turns a test red. Caught a cursor that repeated an entry across pages: SQL Server orders `uniqueidentifier` by its own byte order, not lexically. Timeline UI is the frontend lane's |
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
