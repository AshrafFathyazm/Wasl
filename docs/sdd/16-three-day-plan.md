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
| **Localization — the switcher screen only** | `US-014`, `specs/014-language-preference-and-rtl` | **Reduced, not cut.** See below: the catalogue and the Arabic strings are in; `PUT /api/me/language` and the settings screen are out |
| **Audit — the read endpoint only** | `US-015`, `specs/019-audit-log-access` | **Reduced, not cut.** See below: the table and the pipeline behaviour are in; `GET /api/audit` and the architecture test are out |
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

## Localization and audit: reduced, not cut

`08-board.md` says, in its compression section: *"Never cut: the localization
infrastructure, the Arabic pass over whatever screens do exist, the audit pipeline
behaviour, or the state machine tests."*

That was written assuming 20–25 hours, where localization and audit are roughly a tenth of
the budget. At nine hours they are a third — and a third of the budget spent on
infrastructure produces an application with no features in it.

**The constraint changed, so the decision changes.** That is what `12-delivery-log.md`
exists to record. It is not a contradiction to be reconciled.

But cutting them outright loses two things the product scope document explicitly asks for
— section 10 (audit logs) and section 12 (Arabic and English). So neither option is taken.
Both are reduced to their **minimum useful form**:

| | What is built | What is not | Estimate |
|---|---|---|---|
| **Localization** | No hard-coded user-facing string, from the first line of code · a catalogue with a key for every string · roughly 30 keys translated to Arabic · `dir` on the document root · RTL verified on the two screens that exist | `PUT /api/me/language`, the switcher UI, the key-parity test in CI, plural-category coverage beyond what the 30 keys need | **~1h** |
| **Audit** | `dbo.AuditLog` and the MediatR `AuditBehaviour`, writing in the same transaction as the change | `GET /api/audit`, the `IAuditableCommand` architecture test, the denied-action rows for `401`/`403` | **~45m** |

**Why this is affordable and cutting was not necessary.** The expensive half of both was
never the capability — it was the retrofit.

- **The discipline is free if applied from the start.** Resolving a string through
  `IStringLocalizer` costs nothing more than typing a literal; it costs an afternoon once
  seven screens exist. A 30-key `ar.json` is twenty minutes of typing.
- **The audit behaviour is cheapest at one consumer.** That is `PHASES.md`'s own ordering
  rule — zero consumers is speculative, seven is a retrofit, one is free. At three command
  handlers it is 45 minutes; the architecture test that guards against forgetting is what
  goes, because with three handlers you can see all three.

**`US-007` stays in the committed scope.** Total is ~1h45 rather than the ~3h a full
implementation would take, and both capabilities are demonstrably present rather than
absent — which is the difference between a limitation and a gap.

### What this does to the arithmetic

It takes the plan from about nine hours to about **ten and three-quarters**. That is
stated rather than absorbed, because a plan whose numbers do not add up has stopped being
a plan.

It is not re-planned around, and it does not need to be: every session below is **priority
ordered, and work leaves from the bottom**. If the ninth hour turns out to be the last
one, the bottom of Session 2 is where it comes from — and the bottom of Session 2 is a
form and a button, not a rule.

The two items that will not leave, at any budget: the BR-1 transition test set, and the
`403` tests for BR-2 and BR-6. Those are the ones that prove a rule rather than
demonstrate a screen.

## Session 1 — a running system with one endpoint

**Three hours.** Ends with a ticket created through the API against a seeded customer.

| Order | Task | Budget | Done when |
|---|---|---|---|
| 1 | Solution + four projects + three test projects, references pointing the right way | 25m | `dotnet build` succeeds, and a reference from `Wasl.Application` to EF Core would not compile |
| 2 | `docker compose` with SQL Server 2022 | 15m | `docker compose ps` shows healthy. **Hard time-box — see the rule below** |
| 3 | `IApplicationDbContext`, `WaslDbContext`, `Customer` and `Ticket` entities, `InitialCreate` | 40m | `dotnet ef database update` applies to an empty database |
| 4 | `ProblemDetails` middleware + `ValidationBehaviour`, with every message resolved through `IStringLocalizer` from the first line | 35m | A `400` returns field-level errors in the documented shape; no message is a literal |
| 5 | `dbo.AuditLog` + `AuditBehaviour` in the same transaction as the change | 45m | One command produces one audit row; a forced rollback leaves none |
| 6 | `Ticket` domain type, `CreateTicketCommand`, validator, `POST /api/tickets` | 50m | `201` with `Location`, and a ticket exists against a seeded customer |
| 7 | `GET /health`, one integration test through it, CI on push | 25m | Green run visible on the repository |

**Customers are seeded, not created.** The seed script is Session 3's first task; until
then a single hard-coded `Guid` in the migration is enough to attach a ticket to.

**Why the error contract is item 4 and not later:** retrofitting it means touching every
endpoint. At one endpoint it is thirty-five minutes. It is the same argument `ADR-007`
makes about localization — which is why localization is not a task in this session but a
constraint on item 4: **every server-authored message resolves through a key from the
first one written.** No later pass over the strings, because there is no later pass.

**Why the audit behaviour is item 5 and not deferred:** `PHASES.md`'s ordering rule says
add a cross-cutting concern when there is exactly one consumer — zero is speculative,
seven is a retrofit, one is free. Item 6 is that one consumer, and it is the cheapest
moment this table will ever contain.

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
| 5 | React app, `tokens.css`, `Button` / `Input` / `Badge`, and `react-i18next` with the `en` catalogue wired before the first component | 30m | They render from the real token values, and no component contains a literal string |
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
| 2 | Translate the catalogue to Arabic — roughly 30 keys — and set `dir` from the active locale | 20m | Every key in `en` exists in `ar`. Typing, not design work: the keys already exist because Sessions 1 and 2 never wrote a literal |
| 3 | Walk both screens in Arabic and record what was found | 20m | Findings in `tests.md`, including "nothing found" if that is the truth. RTL defects are visual — no assertion catches a container sized to English label text |
| 4 | `README.md`: setup, run, **what was built, what was not, and why** | 30m | The "what was not" section points at `15-scope-coverage.md` and this file |
| 5 | `ai-notes.md` per story built — specific, not "AI helped and I reviewed" | 30m | Accepted, modified, rejected, and how each accepted output was **run** |
| 6 | `tests.md` per story: the commands and their **observed** output | 20m | No result written down that was not seen |
| 7 | Demo rehearsal, out loud, with a timer | 25m | `14-demo-script.md` walked once end to end |
| 8 | Clean-clone verification: delete the clone, follow the README | 30m | It runs. Anything that had to be guessed is a defect in the README |
| 9 | Buffer | 20m | — |

**Item 8 catches more than it looks like it will.** Something always depends on a file
that was never committed.

**The buffer is real and it is not optional.** A nine-hour plan with no slack is a
seven-hour plan that overruns. If the buffer is untouched, item 5 gets it — `ai-notes.md`
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
- **No hard-coded user-facing string**, and every key present in `en` and `ar`
- **The Arabic pass on the two screens that exist**, with its findings written down —
  including "nothing found" if that is the truth
- **One audit row per state-changing command, in the same transaction**, and none after a
  forced rollback

The last three are required because localization and audit were reduced rather than cut.
The reduction removed the *screen* and the *read endpoint*, not the guarantee.

Explicitly **not** required, because those parts were the reduction: the key-parity test in
CI, the `IAuditableCommand` architecture test, the audit rows for denied `401`/`403`
actions, and `PUT /api/me/language`.

**One of those absences is worth naming.** Without the architecture test, nothing fails
the build when a new command forgets `IAuditableCommand` — the guard is gone and only the
three handlers in front of you are covered. At three handlers that is visible by reading;
at seven it would not be. It is the first thing to restore when the constraint lifts.

**And the question no checklist replaces:** can every file in the diff be explained and
changed without help? At nine hours that is easier to be true, not harder — which is the
one advantage of a narrow scope and it should be used.
