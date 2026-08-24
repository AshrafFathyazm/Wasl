# Build Phases

Ordered so that **every phase ends in something that works**. If time runs out, you stop
at a phase boundary with a demonstrable product — never mid-story with half a feature.

Read `START-HERE.md` first for the questions to ask before any of this.

> **Under the three-day constraint, follow `16-three-day-plan.md` instead.**
>
> These phases total 21–25 hours. The actual budget is about nine (`11-open-questions.md`
> Q-5, resolved). `16-three-day-plan.md` is the nine-hour cut: three sessions of three
> hours, committing to US-005, US-007, US-008, and a seeded US-001, with every cut pointing
> at where its design lives.
>
> This file stays as written. It is the plan for the unconstrained build, the reference the
> cut was made *from*, and the thing that makes the cut auditable — a compressed plan with
> no full plan behind it is indistinguishable from a small plan.

---

## The principle that decides the order

**Not "easiest first" — "cheapest to do now, most expensive to do later" first.**

Some things are easy and must wait because they depend on something. Some are harder and
must come first because retrofitting them means editing every file written since.

And one rule resolves most of the tension:

> **Add a cross-cutting concern at the moment there is exactly one consumer.**
>
> Zero consumers is speculative design. Seven is a retrofit. One is free, and it proves
> the mechanism on something real.

That is why audit lands in Phase 1 (one command handler exists) and localization lands
in Phase 2 (one screen exists) rather than both being piled into an empty skeleton.

---

## Phase 0 · Make something run — 3h

The cheapest phase and the one that de-risks everything else.

| # | Task | Done when |
|---|---|---|
| 0.1 | Solution + four projects (`Wasl.Domain`, `Wasl.Application`, `Wasl.Infrastructure`, `Wasl.Api`) + three test projects, with the project references pointing the right way | `dotnet build` succeeds, and a reference from `Wasl.Application` to EF Core would not compile |
| 0.2 | `docker compose` with SQL Server | `docker compose up -d db` works |
| 0.3 | `IApplicationDbContext` in Application, `WaslDbContext` in Infrastructure, `Customer` entity, first migration | `dotnet ef database update` applies to an empty database |
| 0.4 | `GET /health` | Returns 200, no auth |
| 0.5 | Integration test project with Testcontainers, one test hitting `/health` | Green |
| 0.6 | **CI: build + test on push** | Badge is green on the repo |

**Stop here and you have:** a repository someone else can clone and run in two commands.

**The estimate moved from 2–3h to 3h**, and it is 0.1 that moved it. Four projects plus
three test projects instead of two plus two is four extra `dotnet new`, six extra
`dotnet add reference`, and one decision that has to be got right the first time: the
reference direction. That is roughly half an hour, and it is stated rather than absorbed
because a silently adjusted estimate is how a plan stops being a plan.

Getting the references right *is* the task. `Wasl.Application` must not be able to see EF
Core — if it can, the layering is decorative and the `IApplicationDbContext` in 0.3 buys
nothing. That is why 0.1's "done when" is a compile failure rather than a compile success.

**Do 0.6 now, not later.** CI is direct evidence for *Engineering Foundations*, it costs
one file, and adding it after twenty commits means fixing twenty commits' worth of drift
in one go.

---

## Phase 1 · One feature, end to end — 4–5h

The single most important phase. It proves the whole pipeline on the smallest feature.

| # | Task | Done when |
|---|---|---|
| 1.1 | `Customer` domain: `EmailAddress`, `PhoneNumber`, the contact invariant | Unit tests pass (BR-4.1–4.3) |
| 1.2 | Filtered unique indexes for email and phone | `sys.indexes` on `dbo.Customers` shows both, `filter_definition` non-null |
| 1.3 | `ProblemDetails` middleware + the error contract | Every error matches `05-api-conventions.md` |
| 1.4 | MediatR + validation behaviour | `400` returns field-level errors |
| 1.5 | **Audit: table + pipeline behaviour + architecture test** | One command, one audit row, in one transaction |
| 1.6 | `POST /api/customers` | `201`, `400`, `409` all tested |
| 1.7 | React app, `tokens.css`, three primitives — Button, Input, Badge | They render with the real tokens |
| 1.8 | Create-customer form wired to the real API | You can create a customer in a browser and see the duplicate `409` |

**Stop here and you have:** a working feature, end to end, with tests and an audit trail.

**1.5 goes here on purpose.** With one handler it is an hour. With seven it is seven
edits and one that gets missed.

**Three primitives, not eight.** Add the rest when a screen needs them.

---

## Phase 2 · Auth, shell, and language — 3–4h

| # | Task | Done when |
|---|---|---|
| 2.1 | JWT, two seeded users, `POST /api/auth/token` | A token comes back and carries the role |
| 2.2 | Authorization policies + `ICurrentUser` | A wrong-role call returns `403`, proven by test |
| 2.3 | **Localization infrastructure, both sides** | An `ar` request returns an Arabic message |
| 2.4 | `UseRequestLocalization()` **after** `UseAuthentication()` + the claim provider | The stored preference beats `Accept-Language`, proven by test |
| 2.5 | Login screen — **plain version**, no animation | Sign in works, `401` shows, Enter submits |
| 2.6 | App shell: sidebar + header + route protection | Signed out cannot reach `/tickets` |

**Stop here and you have:** a real application you sign into, in two languages.

**2.5 says plain deliberately.** Build the login that works; the mesh is Phase 6. The
temptation is to build the beautiful thing first because it is more fun, and it is the
single easiest way to lose a day.

**2.4 is the silent failure.** Wrong middleware order and the stored preference is
ignored for every user, forever, with no error. That is why it has its own test.

---

## Phase 3 · The ticket core — 6–8h

The heaviest phase, and where most of the marks are.

| # | Task | Done when |
|---|---|---|
| 3.1 | `Ticket` + `TicketHistory`, number from a sequence | Two concurrent creations get different numbers |
| 3.2 | `POST /api/tickets` + the create form | A ticket exists, created against a customer |
| 3.3 | **The state machine + all 36 transition tests** | Every cell of BR-1 covered, forbidden ones included |
| 3.4 | `PUT /status` with `allowedTransitions` on reads | Invalid transition returns `409` naming what is permitted |
| 3.5 | `PUT /assignee` + the BR-2 policy | Agent-assigns-other returns `403`, proven by test |
| 3.6 | Optimistic concurrency on both | Two writes on one version: one `200`, one `409` |
| 3.7 | `GET /api/tickets` list + `GET /{id}` detail | The list costs one query, asserted |
| 3.8 | Ticket list and detail screens | The flow is clickable |

**Stop here and you have:** the demo. Create customer → create ticket → assign →
progress. This is the thing you walk someone through.

**Do 3.3 before 3.4.** The specification is already a table; turning it into a `[Theory]`
takes twenty minutes and then the implementation has somewhere to fail.

---

## Phase 4 · Timeline and comments — 3h

| # | Task | Done when |
|---|---|---|
| 4.1 | `TicketComment` + `POST /comments` | Comment appears, closed ticket returns `409` |
| 4.2 | Timeline union query + pagination | A page spanning both sources is correct |
| 4.3 | Timeline drawer + composer | Handover context is visible |

**Stop here and you have:** the full committed scope of Release 1.

---

## Phase 5 · Finish the language pass — 2h

| # | Task | Done when |
|---|---|---|
| 5.1 | Every string in a catalogue, both locales | The lint rule passes |
| 5.2 | Key-parity test in CI | A missing key fails the build |
| 5.3 | Language switcher + `PUT /api/me/language` | The choice survives a reload |
| 5.4 | **Walk the whole flow in Arabic, screen by screen** | Findings recorded in `tests.md` |

**5.4 is a deliverable, not a check.** Right-to-left defects are visual; no assertion
catches a container sized to English text.

---

## Phase 6 · Everything that is not required — as time allows

In this order, and each one is droppable:

| Order | Item | Why this position |
|---|---|---|
| 1 | Filters on the ticket list (US-006) | Genuinely useful; the list works without them |
| 2 | Escalate (US-009) | Rules are fully specified; small once the state machine exists |
| 3 | **The login animation** | Nothing depends on it, and it is the most fun — which is exactly why it is last |
| 4 | Dashboard (US-016) | Six aggregate queries and a screen |
| 5 | Customer overview (US-004), update (US-003) | Composition of things that already exist |
| 6 | Audit read endpoint (US-015) | The log is already being written; SQL suffices until then |
| 7 | The remaining five primitives | Add each when a screen needs it |

---

## Before you call it done

| # | Task |
|---|---|
| 7.1 | `13-self-review-checklist.md`, honestly |
| 7.2 | Seed script, so the demo starts from a known state |
| 7.3 | `README.md`: setup, run, what was built, what was not, and why |
| 7.4 | Fill in each story's `ai-notes.md` — specific, not generic |
| 7.5 | Rehearse `14-demo-script.md` once, out loud, with a timer |
| 7.6 | Verify a clean clone runs in the documented steps |

**7.6 catches more than it looks like it will.** Something always depends on a file that
was never committed.

---

## Two rules for the whole build

**Never leave a phase half-finished to start the next.** A phase boundary is a place you
can stop and still have something. The middle of one is not.

**When you are behind, cut from Phase 6, not from tests.** The Quality axis is a gate, not
points. Fewer features fully owned beats more features partly understood — and the
walkthrough will find the difference in about a minute.
