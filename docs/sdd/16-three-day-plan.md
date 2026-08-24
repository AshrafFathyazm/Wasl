# The Three-Day Plan

Deadline **Wednesday 26 August**. Realistic working time: **about nine hours**, in three
sessions of three.

`PHASES.md` is the plan for the unconstrained build and assumes 21–25 hours. This file is
the nine-hour cut of it. Under this constraint, **follow this file**; `PHASES.md` remains
the reference for what the full build would be, and every cut below points at where its
design already lives.

Scope selection at the *product* level is `15-scope-coverage.md`. This file is the
*schedule*. The two are different in kind: those cuts are decisions, these are deferrals.

## The committed scope

`US-005` create ticket · `US-007` assign ticket · `US-008` change status · plus `US-001`
customer **seeded rather than built through the UI**.

That is Section 2 of the scope document — Ticket Management — end to end, from a React
screen through the API and the domain to SQL Server and back.

**It is also exactly what `11-open-questions.md` Q-5 predicted.** That question was
opened before the deadline was known and it said: *"Under four hours, only US-001,
US-005, US-007, and US-008 are realistic at full quality."* Nine hours across three
sessions with the skeleton still to build lands in the same place. The estimate was made
in advance and it held, which is worth more than the estimate being generous.

## What is cut to reach nine hours

Each of these is Release 1 in the fuller plan. **Nothing here is undesigned — every line
points at where its design is**, so this is deferral, not loss.

| Cut | Where its design lives | What is lost |
|---|---|---|
| **Localization and RTL** | `ADR-007`, BR-8, `US-014`, `specs/005-localization-core`, `specs/014-language-preference-and-rtl` | The interface ships English-only. See the conflict recorded below — this is the most expensive cut on the list |
| **Audit log** | `ADR-008`, BR-9, `specs/003-audit-trail` | No forensic record. `TicketHistory` still records every ticket event, so the *timeline* survives; what is lost is the record that outlives its ticket |
| **Escalation** | BR-3, `US-009`, `specs/016-escalate-ticket` | The state machine and priority stand; the one-click escalate action does not |
| **Ticket filters and search** | BR-7.3–7.5, `US-006`, `specs/015-ticket-filters-and-search` | A plain paginated list with the default sort. Already first on `08-board.md`'s compression order |
| **Timeline and comments** | BR-5, `US-010`, `specs/013-ticket-timeline-and-comments` | Handover context. `TicketHistory` rows are still written, so the data exists before the screen does |
| **Dashboard** | `US-016`, `specs/020-dashboard` | Six aggregates and a screen. Demonstrates nothing the ticket list does not |
| **Login screen and its animation** | `design/screens/01-login.md`, `specs/004-auth-and-roles` | See the auth note below — the server-side half is **in**, the screen is not |
| **Create-customer UI** | `US-001`, `specs/007-create-customer` | Customers arrive from the seed script. The endpoint's spec is written and unbuilt |
| **Customer list and profile** | `US-002`, `specs/008-customer-list-and-profile` | A ticket shows its customer's name from the seeded record |

### Authentication: the server half is in, the screen is out

This is the one item on that list that is split rather than cut, and the reason is
`ADR-005`:

> A trusted `X-User-Role` header was rejected. It is trivially forgeable, which means
> every authorization test would pass while proving nothing. Untestable security is worse
> than absent security, because it looks like it works.

`US-007` and `US-008` both carry role rules (BR-2, BR-6) with `403` acceptance criteria.
Faking the user would make those criteria unverifiable, so the cheap half stays and the
expensive half goes:

| In | Out |
|---|---|
| `POST /api/auth/token`, two seeded users (one `Agent`, one `Manager`), PBKDF2 hashing, role claim, authorisation policies | The login screen, the app shell, route protection, the animation |
| Integration tests that acquire a real token per role and assert `403` | — |

The client holds a development token. **That is a stated limitation in the README, not a
security design** — and it is recorded here so it is not discovered at review.

## A conflict this plan creates, recorded rather than resolved quietly

`08-board.md` says, in its compression section:

> **Never cut:** the localization infrastructure, the Arabic pass over whatever screens do
> exist, the audit pipeline behaviour, or the state machine tests.

**This plan cuts two of those four.** That is a real contradiction between two documents
in this repository and it should not be papered over.

| | The board's position | This plan's position |
|---|---|---|
| Localization | Never cut — retrofitting touches every string and every stylesheet (`ADR-007`) | Cut. The retrofit cost is accepted |
| Audit | Never cut — an audit log added after the handlers exist has invisible holes (`ADR-008`) | Cut. Added later means auditing three handlers, not seven |
| State machine tests | Never cut | **Not cut.** They are the centre of Session 2 |
| The Arabic pass | Never cut | Moot — there are no Arabic screens to pass over |

**Both positions are defensible and they were written under different assumptions.** The
board assumed 20–25 hours, where localization is roughly 10% of the budget. At nine hours
it is roughly a third, and a third of the budget spent on infrastructure produces a
bilingual application with no features in it.

The honest framing: **`ADR-007`'s argument is about cost, not correctness.** Retrofitting
localization is expensive — it is not impossible, and the price is paid by whoever adds
it, in a known amount of mechanical work over a known number of files. The same is true
of the audit log at three handlers rather than seven.

**This needs the product owner's confirmation, and it is `Q-16`'s neighbour rather than a
decision this plan may take alone.** If the answer is that bilingual is non-negotiable,
the honest consequence is that `US-007` leaves the committed scope — not that the estimate
shrinks.

## Session 1 — a running system with one endpoint

**Three hours.** Ends with a ticket created through the API against a seeded customer.

| Order | Task | Budget | Done when |
|---|---|---|---|
| 1 | Solution + four projects + three test projects, references pointing the right way | 25m | `dotnet build` succeeds, and a reference from `Wasl.Application` to EF Core would not compile |
| 2 | `docker compose` with SQL Server 2022 | 15m | `docker compose ps` shows healthy. **Hard time-box — see the rule below** |
| 3 | `IApplicationDbContext`, `WaslDbContext`, `Customer` and `Ticket` entities, `InitialCreate` | 40m | `dotnet ef database update` applies to an empty database |
| 4 | `ProblemDetails` middleware + `ValidationBehaviour` | 35m | A `400` returns field-level errors in the documented shape; nothing returns `200` with a failure in the body |
| 5 | `Ticket` domain type, `CreateTicketCommand`, validator, `POST /api/tickets` | 50m | `201` with `Location`, and a ticket exists against a seeded customer |
| 6 | `GET /health`, one integration test through it, CI on push | 25m | Green run visible on the repository |

**Customers are seeded, not created.** The seed script is Session 3's first task; until
then a single hard-coded `Guid` in the migration is enough to attach a ticket to.

**Why the error contract is item 4 and not later:** retrofitting it means touching every
endpoint. At one endpoint it is thirty-five minutes. It is the same argument `ADR-007`
makes about localization, applied to the thing that fits the budget.

**Item 6 is last and not dropped.** CI is one file and it is direct evidence for
*Engineering Foundations*. Adding it after twenty commits means fixing twenty commits'
worth of drift at once.

## Session 2 — the state machine and the screen

**Three hours.** Ends with the flow clickable in a browser.

Listed in priority order. **If the session runs out, work leaves from the bottom.**

| Order | Task | Budget | Done when |
|---|---|---|---|
| 1 | `TicketStatusTransitions` static map + the full BR-1 transition test set | 40m | Every one of the 36 cells covered, forbidden transitions included |
| 2 | `PUT /api/tickets/{id}/status`, `allowedTransitions` on reads, optimistic concurrency | 35m | A forbidden transition returns `409` naming what is permitted; two writes on one version give one `200` and one `409` |
| 3 | `POST /api/auth/token` + two seeded users + policies | 30m | A token carries the role; a wrong-role call returns `403`, proven by test |
| 4 | `PUT /api/tickets/{id}/assignee` + BR-2 | 25m | An `Agent` assigning someone else's ticket returns `403`, proven by test |
| 5 | React app, `tokens.css`, `Button` / `Input` / `Badge` | 25m | They render from the real token values |
| 6 | Ticket list + ticket detail, wired to the real API | 30m | The list renders from `GET /api/tickets`; no hard-coded data |
| 7 | Create-ticket form | 25m | A ticket can be created in a browser |
| 8 | Status action rendering **only** `allowedTransitions` | 20m | The button set changes as the status changes |

**Item 1 before item 2, deliberately.** The specification is already a table in
`04-business-rules.md`, so turning it into an xUnit `[Theory]` takes twenty minutes — and
then the implementation has somewhere to fail. Writing the endpoint first means testing it
afterwards against the same table, with the endpoint's assumptions already baked in.

**Item 8 is the smallest and most valuable thing in the session.** It is the visible proof
that the state machine lives in one place: the client renders what the API returned rather
than reimplementing BR-1 in TypeScript.

## Session 3 — make it defensible

**Three hours.** Ends with something a stranger can clone, run, and be walked through.

| Order | Task | Budget | Done when |
|---|---|---|---|
| 1 | Seed script: two users, four customers, a spread of tickets across every status | 25m | The demo starts from a known state, repeatably |
| 2 | `README.md`: setup, run, **what was built, what was not, and why** | 30m | The "what was not" section points at `15-scope-coverage.md` and this file |
| 3 | `ai-notes.md` per story built — specific, not "AI helped and I reviewed" | 30m | Accepted, modified, rejected, and how each accepted output was **run** |
| 4 | `tests.md` per story: the commands and their **observed** output | 20m | No result written down that was not seen |
| 5 | Demo rehearsal, out loud, with a timer | 25m | `14-demo-script.md` walked once end to end |
| 6 | Clean-clone verification: delete the clone, follow the README | 30m | It runs. Anything that had to be guessed is a defect in the README |
| 7 | Buffer | 20m | — |

**Item 6 catches more than it looks like it will.** Something always depends on a file
that was never committed.

**The buffer is real and it is not optional.** A nine-hour plan with no slack is a
seven-hour plan that overruns. If the buffer is untouched, item 3 gets it — `ai-notes.md`
is 10 of the 100 assessment points and it is the artifact most often written thinly.

## The infrastructure time-box

> **If the database is not accepting connections within twenty minutes, stop and switch
> to LocalDB. Record the switch in the README.**

At this scale an hour lost to infrastructure setup costs a feature, and the failure modes
are well known: the container exits silently without `ACCEPT_EULA`, or it starts and
refuses every connection because the `sa` password fails the complexity policy, or the
port is already held by a local instance. All three are in
`specs/001-solution-skeleton/quickstart.md` with their fixes — twenty minutes is enough to
work through that list once.

**The fallback is LocalDB, not SQLite**, and the difference matters:

| Fallback | Verdict |
|---|---|
| **SQL Server LocalDB** | **Use this.** It is SQL Server. `rowversion`, filtered unique indexes, collations, and `nvarchar` all behave exactly as they will in the container. One connection-string change (`Server=(localdb)\MSSQLLocalDB`), no Docker, and the integration tests still test the real engine |
| SQLite | **Rejected.** `ADR-013` and `testing/test-strategy.md` both reject it for the same reason: weak type affinity, limited `ALTER TABLE`, no `rowversion`, and constraint behaviour that differs from any production engine. The tests would pass against behaviour that does not exist, which is worse than having no tests — it is having tests that lie |
| EF `InMemory` | **Rejected.** It enforces no unique constraints, no foreign keys, and no concurrency tokens — which are precisely what BR-4.8 and `ADR-006` need proving |

**A note on the brief that produced this rule:** it named PostgreSQL and SQLite. Both are
stale by two decisions — `ADR-013` supersedes `ADR-001`, and the database is SQL Server,
confirmed by the product owner. The *rule* is right and is adopted as written; the
fallback target is corrected to the one that keeps the test suite honest, and LocalDB was
already the documented no-Docker path in `specs/001-solution-skeleton/quickstart.md`.

## What "done" means under this plan

Unchanged from `09-definition-of-done.md` for **the stories that are built**. The scope is
smaller; the bar is not.

Specifically still required:

- Every acceptance criterion of `US-005`, `US-007`, and `US-008` mapped to a named test,
  with the run output recorded
- The full BR-1 transition matrix tested, forbidden transitions included
- Integration tests against a real engine, never `InMemory`
- Every `403` in BR-2 and BR-6 proven with a real token
- No secret in a committed file
- `README.md` stating what was not built and why

Explicitly **not** required, because it was cut: the Arabic pass, the audit assertions,
the key-parity test.

**And the question no checklist replaces:** can every file in the diff be explained and
changed without help? At nine hours that is easier to be true, not harder — which is the
one advantage of a narrow scope and it should be used.
