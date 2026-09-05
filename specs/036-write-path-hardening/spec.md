# 036 — Write-Path Hardening · BACKEND

**Phase:** 5 · **Lane:** Backend only · **Status:** spec, awaiting review
**Driven by:** a concurrency and abuse audit of `src/Wasl.Api` on 2026-09-05
**Consumer:** nobody is blocked. Every item below is a defect or an absent guard in code
that is already delivered

---

## 1 · What this is

`CLAUDE.md` carries a checklist headed *Correctness under concurrency and abuse — check
these on every write*, and states its own rule for it: **every row is a defect this
codebase has already had, or that the shape of a feature makes likely.** An audit walked
that checklist against nine named failure modes. This feature closes what it found.

It is one feature rather than five because the five share one property that decides how
they are reviewed together: **each of them is invisible until it is not.** Four produce a
`500` where a documented status exists, and the fifth produces no error at all. None of
them fails a build, and none of them fails an existing test.

**Two of the five were already solved once, for one table, and not generalised.** `007`
translated a unique-index violation into the pre-check's own `409` and wrote down why —
Q-D, *a client must not be able to tell which half of the rule caught it*. `034` then
added a second unique index, recorded the same reasoning in a code comment, and did not
extend the translation. That is the shape this feature is mostly about.

## 2 · The audit, and what it found

Nine failure modes were checked against the delivered write path.

| Failure mode | Verdict | Where |
|---|---|---|
| Duplicate request | ⚠️ partial | Customers guarded; tags guarded but mistranslated; tickets and comments unguarded |
| Idempotency | ❌ absent | No `Idempotency-Key`, no `If-Match`, no ETag anywhere in `src/` |
| TOCTOU / check-then-act | ⚠️ partial | Every check-then-act has a database backstop except the assignee `IsActive` check |
| Lost update | ✅ held | `rowversion` on `Ticket`, `Customer`, `SupportUser`; the explicit check runs before the rules |
| Deadlock | ❌ absent | No retry, no execution strategy, no handling of SQL Server 1205 |
| Message duplication | — n/a | No broker, no queue, no outbox, no `BackgroundService` |
| Out-of-order messages | — n/a | Same |
| Cache stampede | — n/a | No cache of any kind |
| Retry storm | ⚠️ partial | Throttled on `POST /api/auth/token` and nowhere else |

The three `n/a` rows are recorded rather than omitted. **An absent mechanism and a
mechanism that was considered and rejected read identically six months later**, and the
next person to open this file should not have to re-derive that Wasl has no message bus.

### 2.1 · One documentation defect found on the way

`CLAUDE.md`'s *Decisions already made* table asserts:

> `ICommunicationProvider` + one Mock **is** built — `docs/sdd/08-board.md`, feature `021`

A `grep` over all of `src/` returns zero matches for `ICommunicationProvider`.
`src/Wasl.Domain/Communications/` holds exactly one file, `CommunicationChannel.cs`.
**The claim is false**, and it is the same defect `034` corrected one line above it for
`Interaction`. It is in scope for this feature as a `DOC-` task and nothing more — no
code follows from it.

## 3 · Five changes

### 3.1 · The tag race answers `409`, not `500` — **the `007` translation, generalised**

`TicketTagConfiguration` states the guarantee correctly:

```
// THE SAME TAG CANNOT BE ATTACHED TWICE. A double-click on the tag picker is the common
// case, and the client guard is not the guarantee — CLAUDE.md's first concurrency row.
```

The index exists and does its job. What is missing is the half `007` built for customers:
`WaslDbContext.TranslateDuplicate` matches on **index name**, and knows exactly two —
`UX_Customers_Email_Active` and `UX_Customers_Phone_Active`. `UX_TicketTags_Ticket_Tag`
is not among them, so an unrecognised violation is rethrown untouched and becomes a `500`.

The consequence is the one `007` wrote Q-D to prevent, arriving by a different route:

| Two attaches of the same tag | Answer today |
|---|---|
| Sequential (the pre-check catches it) | `409 errors/tag-unchanged` |
| Simultaneous (the index catches it) | **`500`** |

Same request, same intent, different status **decided by timing**. `TagUnchangedException`
already exists, already carries a written reason for being a `409` and not a no-op `200`,
and is already what the sequential path throws. The change is to reach it from the index
violation too.

**Matching on the name and not the error number stays.** `TranslateDuplicate` documents
why — 2601 and 2627 are reported for *any* unique violation, so keying on the number turns
an unrelated index's failure into a confident, wrong `409`. This adds a third name to that
list; it does not loosen the rule.

### 3.2 · A lost `rowversion` race answers `409`, not `500`

Three handlers compare `rowversion` explicitly before applying their rules —
`ChangeTicketStatus`, `AssignTicket`, `UpdateCustomer` — and each records why the
comparison is explicit rather than a caught `DbUpdateConcurrencyException`: catching would
put the version check *after* the transition rules, which is the inversion the frozen
contract warns about.

That reasoning is correct and is not being changed. But the explicit check is not the only
place a conflict can surface. `AssignTicketCommandHandler` says so itself:

> EF re-checks the rowversion against the row it is updating here, which catches a writer
> that arrived between the explicit check above and this line.

It does. And `WaslDbContext.SaveChangesAsync` catches only `DbUpdateException` with a
recognised index name, so **EF's re-check throws `DbUpdateConcurrencyException` into an
unmapped path and the client gets a `500`** — for the one case the explicit check was
never able to cover.

The window is narrow. It is also the only window that exists, which makes it the entire
population of races this endpoint can actually lose.

`ConcurrencyConflictException` and `errors/concurrency-conflict` already exist. The change
is to reach them from `SaveChangesAsync`, alongside the duplicate translation and for
exactly the same stated reason: **the loser of a race must receive the body a sequential
caller receives.**

### 3.3 · A deadlock is answered deliberately, in one of two ways

There is no handling of SQL Server error 1205 anywhere. There is no
`EnableRetryOnFailure`, no `CreateExecutionStrategy`, and the isolation level is the
provider default.

`TransactionBehaviour` opens one explicit transaction per command and holds it across the
whole handler, which for a create is `dbo.Tickets` + `dbo.TicketHistory` + `dbo.AuditLog`.
A deadlock victim surfaces as an unmapped `SqlException` and is a `500` with no
`Retry-After` and no indication that a retry would succeed — which is the one case where a
retry is *exactly* the right client behaviour.

**Two routes, and the choice is the product owner's** because they differ in cost by an
order of magnitude:

| Route | What it means |
|---|---|
| **A — map only** | Detect 1205, answer a documented status with `Retry-After`. Small. The request still fails; the client is told it may retry |
| **B — retry in the server** | `EnableRetryOnFailure` plus an `ExecutionStrategy`. **This forces a rewrite of `TransactionBehaviour`** — a manual `BeginTransactionAsync` under a retrying strategy throws at startup unless every transaction is wrapped in `strategy.ExecuteAsync`, and the retried delegate must be idempotent, which a handler that has already drawn a sequence value is not |

Route B is not a configuration flag. It changes the shape of the one class `003`'s
`research.md` R-15 fixed in place, and it interacts with `SequenceTicketNumberGenerator`,
whose consumed values are not returned on rollback. **Recorded as Q-3 rather than assumed.**

### 3.4 · A general rate limit, or a written decision not to have one

`004b` throttles `POST /api/auth/token`: ten failures in five minutes per `(address,
email)` pair, `429 errors/rate-limited`, `Retry-After`. It is in memory and per process,
and `InMemorySignInThrottle` states that limit in its own remarks rather than hiding it.

`CLAUDE.md` then says, correctly and deliberately:

> `429` is on that one action, not on the API. A general rate limit is a different feature
> with different numbers.

**This is that feature.** There is no `AddRateLimiter` and no `UseRateLimiter` in the
project, so every other endpoint — including `POST /api/tickets`, which creates a row and
draws a sequence value — is unthrottled. The existing checklist row *an unclamped page size
is a denial of service with one query string* names the same class of problem; BR-7.2
closed the query-string half and nothing closed the request-count half.

The numbers, the partition key, and whether reads are limited at all are **not invented
here** — Q-4.

### 3.5 · `Idempotency-Key` on the two unguarded creates — **and this contradicts a written convention**

`POST /api/tickets` and `POST /api/tickets/{id}/comments` create a row per request with
nothing to stop a duplicate. `CLAUDE.md`'s checklist opens with this exact case:

> **Does a duplicate request create a duplicate row?** `POST /api/tickets` is not
> idempotent. The client guard is not the guarantee — *Two clicks, two tickets, no error.
> Found by the support team, not the developer*

`docs/sdd/05-api-conventions.md` §Idempotency says the opposite, on purpose:

> Double-submitted tickets are accepted; deduplicating them would require **guessing
> intent**.

**Both are right about different mechanisms, and the spec must not resolve that silently.**
The convention rejects *server-side deduplication* — inferring from subject and timestamp
that two requests meant one ticket. It is correct to reject that; it guesses. An
`Idempotency-Key` guesses nothing: the client states that two deliveries are one intent,
and the server honours the statement.

So this is not a contradiction of the ruling's reasoning, but it **is** a change to the
text of a frozen convention. Per the working agreement it goes under **Contract changes**
in `plan.md` and is **not edited away** — and per Gate 2 the decision to make it at all is
Q-5, not this document's to take.

Also stated so it is not read as an oversight: the sequence guarantees a **unique ticket
number**, never a single ticket. Two duplicate creates produce two valid tickets with two
valid numbers and no error at any layer.

## 4 · What is NOT being built

| Not building | Why |
|---|---|
| A distributed / durable sign-in throttle | `004b` stated the in-memory limit rather than hiding it and ruled a shared store a larger decision. Unchanged here — this feature adds a general limiter, it does not revisit the sign-in one |
| Any cache | There is none, so there is no stampede. Adding one to fix a problem that has not been measured is the inversion of `008`'s query-counter lesson |
| A message broker, outbox, or consumer | Nothing publishes. Message duplication and ordering cannot be defended against in a system with no messages, and building the mechanism to defend the property is how a queue arrives without an ADR |
| A circuit breaker or any client-side retry policy | Wasl calls nothing outbound. `021` is unbuilt (§2.1) |
| ETag / `If-Match` on reads | `05-api-conventions.md` fixes `expectedVersion` in the body as the concurrency token, ADR-006. A second, header-shaped token for the same job is two ways to be stale |
| Changing the isolation level | Nothing has measured a phantom or a non-repeatable read. Raising it to fix a deadlock is the move that produces more deadlocks |
| Building `ICommunicationProvider` | §2.1 corrects the claim that it exists. Building it is `021`, and `021` is not this feature |

## 5 · Acceptance criteria

Each maps to a named test, and the run output is recorded in `tests.md` — never asserted
from memory.

**Tag race — §3.1**

| # | Criterion |
|---|---|
| AC-1 | Two simultaneous `PUT /api/tickets/{id}/tags/{tagId}` for the same pair: one `200`, one `409` with `type: errors/tag-unchanged`. **No `500` on any run** |
| AC-2 | The `409` body from AC-1 is **field-for-field identical** to the `409` a sequential second attach returns, `traceId` excepted. `007` Q-D's rule, and the reason AC-1 alone is insufficient |
| AC-3 | A unique-index violation on an index this feature does **not** name still produces a `500`. The negative control for `TranslateDuplicate`'s name-matching rule — a translation that catches everything is the confident-wrong-`409` the rule forbids |

**Concurrency conflict — §3.2**

| # | Criterion |
|---|---|
| AC-4 | A writer arriving between the explicit `rowversion` check and `SaveChangesAsync` produces `409 errors/concurrency-conflict`, not `500`. Asserted on `PUT /status`, `PUT /assignee`, and `PUT /api/customers/{id}` |
| AC-5 | The AC-4 body is identical to the one the explicit check produces |
| AC-6 | **The explicit check still runs first.** A stale `expectedVersion` plus a forbidden transition still answers `concurrency-conflict`, not `invalid-status-transition` — `012`'s contract ordering, unchanged. Fails if the fix was implemented by deleting the explicit check |
| AC-7 | A rolled-back conflicting command writes **no** audit row for the change, and the failure row is written outside the transaction. BR-9, unchanged by this feature |

**Deadlock — §3.3, shape depends on Q-3**

| # | Criterion |
|---|---|
| AC-8 | A deliberately induced deadlock produces the documented status for the chosen route — never an untyped `500` |
| AC-9 | *(Route B only)* A retried command does not double-write. Asserted against `dbo.TicketHistory` row count and the audit row count, not against the HTTP status |
| AC-10 | *(Route B only)* `TransactionBehaviour`'s existing guarantees hold under the strategy: one transaction per command, none opened for a query (`003` AC-16), and an already-open transaction is still joined |

**Rate limit — §3.4, numbers from Q-4**

| # | Criterion |
|---|---|
| AC-11 | Exceeding the limit returns `429` with `type: errors/rate-limited` and a `Retry-After` header ≥ 1 — the same contract `004b` froze, not a second `429` shape |
| AC-12 | `POST /api/auth/token` keeps **its own** `(address, email)` throttle and its own numbers. The general limiter does not replace it, and a Manager who never failed a sign-in is not locked out by an office's shared address (`004b` AC-37, still true) |
| AC-13 | `GET /health` is not limited |
| AC-14 | The `429` body is enveloped and localized like every other error — `002b`'s rule, and a limiter that short-circuits before the pipeline is the shape that silently breaks it |

**Idempotency — §3.5, subject to Q-5**

| # | Criterion |
|---|---|
| AC-15 | Two `POST /api/tickets` with the same `Idempotency-Key` create **one** ticket. The second returns the first's response |
| AC-16 | The replayed response carries the **same** `ticketNumber` and the same `Location`. A second sequence draw is the failure this AC exists to catch |
| AC-17 | Two requests with the same key and **different** bodies answer per Q-5's ruling, and the ruling is cited in the test name |
| AC-18 | Two requests with the same key sent **simultaneously** produce one row. The pre-check is not the guarantee — a unique index on the key is |
| AC-19 | A request with **no** `Idempotency-Key` behaves exactly as it does today. The header is opt-in; making it required is a breaking change to a frozen contract |

**Documentation — §2.1**

| # | Criterion |
|---|---|
| AC-20 | `CLAUDE.md`'s `ICommunicationProvider` row states what is actually built. Corrected in place with the correction visible, in the house style of the `Interaction` line above it |

## 6 · Edge cases

| Case | Expected |
|---|---|
| Attach a tag to a ticket that is deleted between the pre-check and the insert | The FK refuses. Not translated — `404` is not derivable from a constraint violation, and a confident wrong answer is worse than a `500` here. Stated, not fixed |
| Assignee deactivated between `LoadAssigneeAsync` and `SaveChangesAsync` | The ticket is assigned to a now-inactive user. The FK guarantees existence and cannot express *active*, and no check constraint can reference another table. **Accepted and recorded**, not fixed — fixing it means a lock or a re-read, and neither is worth it for a window of microseconds against an action a Manager performs |
| `Idempotency-Key` reused a month later with a new body | Depends on the retention ruling in Q-5. A key store with no expiry is a table that grows forever |
| `Idempotency-Key` sent by a **different** user | Must not replay another user's response. The key is scoped, never global — this is the one part of §3.5 that is a security property and not a convenience |
| Rate limit hit by the frontend's own polling | The frontend has no polling today. If the limiter's numbers are set below what a real screen issues, the first symptom is a `429` on a legitimate session — which is why Q-4 asks for numbers rather than assuming them |
| Deadlock inside the audit write on the second connection | `AuditWriter` uses `AddDbContextFactory` — a **separate connection** — to write `dbo.AuditLog` while the request transaction may hold locks on the same table. Not measured. Named here because a self-inflicted block is the deadlock this design makes most likely, and it must be in the induced-deadlock test's candidate list |

## 7 · Open Questions — **ALL RULED 2026-09-05**

> **Ruled by the product owner on 2026-09-05, after review**, with "الأفضل" on each of the
> three gating questions — i.e. take the working assumption this section had already written
> down and defended. Every one was taken **as written**; nothing was reinterpreted. The
> consequences are in `summary.md` §2, and the table below is left in its original shape so
> the question and its answer stay side by side.

**Not answered here, and not to be guessed into the design.** Each carries a working
assumption so the shape is discussable; none is a decision.

| # | Question | Working assumption |
|---|---|---|
| Q-1 | Is `TagUnchangedException` still the right answer for the **racing** attach, given it is a `409` on what the user experiences as one double-click? | Yes — the sequential path already answers `409` with a written reason, and two different answers for one intent is the defect being fixed |
| Q-2 | `DELETE …/tags/{tagId}` on a tag the ticket does not carry throws `TagUnchangedException` today. Should a delete be idempotent (`204`) instead? | Leave it. `034` chose `409` deliberately and this feature is not the place to reverse it — but the question is real, because §3.5 makes idempotency a topic |
| Q-3 | **Deadlock: route A (map only) or route B (retry)?** Route B rewrites `TransactionBehaviour` and interacts with the ticket-number sequence — §3.3 | Route A. Smaller, reversible, and the deadlock has not been observed in production because there is no production |
| Q-4 | **Rate limit: what numbers, keyed on what, over which endpoints?** Per authenticated user, or per address? Are reads limited? | Per authenticated `sub`, falling back to address when unauthenticated; writes only; a limit high enough that no legitimate screen reaches it. **All three parts are guesses and none should ship as one** |
| Q-5 | **`Idempotency-Key`: build it at all?** It changes the text of `05-api-conventions.md` §Idempotency — §3.5. If yes: header name, scope, retention, and the answer for same-key-different-body | Build it for `POST /api/tickets` only, scoped per user, 24-hour retention, same-key-different-body is `409`. Comments are the lower-value half and can follow |
| Q-6 | Does the general limiter apply to `PUT /api/me/language`? | Yes, as a write. Noted separately because it is the one write with no `expectedVersion` and therefore the cheapest to hammer |

## 8 · Requirements cited

`NFR-2` every endpoint returns a correct and documented status code — **the whole of §3.1
and §3.2**. `NFR-6` concurrent edits do not silently overwrite each other, ADR-006 — §3.2.
`NFR-4` errors never leak internals — an unmapped `500` from a `SqlException` is where a
leak would come from. `BR-4.8` the duplicate rule is enforced twice — the pattern §3.1
generalises. `BR-9` audit — AC-7. `BR-7.2` clamping, the query-string half of the
denial-of-service pair §3.4 completes.

## 9 · Definition of Done — what this feature adds to the list

- Every AC above maps to a named test with **recorded** output
- **AC-3 is the negative control and must be seen to fail** before it is trusted — a
  guard that has never been seen to fail has not been verified
- The generated OpenAPI is compared against `contracts/` in both directions, including
  the `429` and any new header
- Any new message key exists in `en` **and** `ar`, added in the same commit as the key
- `tests.md` records the induced-deadlock method, whether or not route B is chosen —
  if a deadlock could not be induced, that is a finding, not an omission

---

## Gate

Written under Gate 1. **No code, no scaffolding, no package.** Six open questions above,
and Q-3, Q-4 and Q-5 each decide whether a section of §3 exists at all — so this spec is
not implementable as written, by design.

~~Awaiting review.~~

**Approved 2026-09-05.** Q-3, Q-4 and Q-5 ruled the same day (§7). Implemented and delivered
the same day — 669 tests, evidence in [tests.md](tests.md), outcome and deviations in
[summary.md](summary.md).

**Two ACs are recorded N/A rather than deleted:** AC-9 and AC-10 belong to Q-3's route B, and
route A was chosen. **Two AC assumptions were disproved by measurement** — §3.4's fixed limit
and §3.3's `DbUpdateException` catch — and both are corrected in `summary.md` §5 rather than
edited out of this file.
