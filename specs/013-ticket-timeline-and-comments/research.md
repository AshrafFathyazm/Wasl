# 013 — Research

Questions that had to be answered before the plan could be written, what was checked,
and what each one settled. Mined from the trade-offs in the original
`docs/sdd/story-artifacts/US-010-ticket-timeline-comments/plan.md` and from what the move
to SQL Server (ADR-013) and to vertical slices (ADR-010) changed underneath it.

A question that turned out not to matter is recorded as such, because "we looked and it
did not matter" is information too.

---

## R-1 · Does EF Core translate `Concat` + `OrderBy` + `Skip`/`Take` into one SQL statement?

**Why it matters more than anything else in this feature.** The whole design rests on the
union being paged *in the database*. If EF cannot translate it, the fallback is client
evaluation: two full queries, a merge in memory, and the page taken afterwards. Every
functional test still passes. The results are correct. And the application reads the
entire history of a ticket to return fifty rows — which is exactly the option the plan
rejected, silently reinstated.

**Checked:** EF Core's set-operation support and its ordering rules.

**Settled:** yes, with three conditions, and all three are the kind of thing that is easy
to write the wrong way round:

| Condition | Consequence of getting it wrong |
|---|---|
| Both sides of `Concat` must project to the **same type**, property for property, nullability included | EF refuses to translate the set operation, or splits it into two queries |
| `OrderBy` / `ThenBy` go **after** `Concat`, never inside a branch | SQL Server drops a branch-level `ORDER BY` inside a `UNION ALL`, and EF does not translate one. The feed comes back in whatever order the engine found convenient, which is often *nearly* right — nearly right ordering is the hardest kind of bug to see |
| `Skip` / `Take` go **after** `Concat` too | `OFFSET … FETCH NEXT` may only be applied to the outermost query. Inside a branch, EF cannot translate it |

**Consequence for the plan:** `BE-013-05` orders and pages after the `Concat`, and
`TEST-013-12` asserts on the **captured SQL** — one statement, containing `UNION ALL` and
`OFFSET … FETCH NEXT`. That assertion is the only thing in the suite that distinguishes
the chosen design from the rejected one, which is why `tasks.md` marks it not droppable.

---

## R-2 · `FromSql` with a hand-written union, or LINQ `Concat`?

**Checked:** what each costs at the point where the query has to compose with something
else.

| Option | Cost |
|---|---|
| `FromSql` with a literal `UNION ALL` | Has to re-implement parameterisation by hand, cannot compose with the `COUNT` needed for the envelope without a second literal that must be kept in step, and the two would drift the first time a column is added |
| LINQ `Concat` over two projections | Less readable — both projections must carry the same columns — but composes with the count, parameterises itself, and is checked by the compiler |

**Settled:** `Concat`. `FromSql` is kept as the documented fallback with **one named
trigger**: if `TEST-013-12` shows the generated SQL is not a single statement, switch to
`FromSql` rather than trying to coax the LINQ. A fallback with no trigger is not a plan,
it is a hope.

---

## R-3 · What are SQL Server's rules for a `UNION ALL` column, and where do they bite?

**Checked:** how a `UNION ALL` resolves a column's type when the two branches disagree.

**Settled:** the column takes its type from the **first** branch, and the second is
coerced into it. Applied to this feature, that means the tempting shape — one `Text`
column carrying the comment `Body` on one side and the history `NewValue` on the other —
is a trap:

- History branch first: `nvarchar(200)`, and a 4000-character comment is **truncated to
  200 characters with no error at all**.
- Comment branch first: `nvarchar(4000)`, which works, and now the correctness of the
  feature depends on the order two `Concat` operands happen to be written in.

**Settled:** each branch carries its **own** nullable columns — `CommentBody`,
`HistoryEventType`, `HistoryOldValue`, `HistoryNewValue`, `HistoryNote` — with an
explicit cast on the `NULL` side so the inferred type is not guessed from a literal. The
projection is wider and duller, and it cannot truncate.

The one genuinely shared column set is the ordering key: `OccurredAtUtc`
(`datetime2(3)` on both sides), `EntryTypeRank` (a constant per branch), and `Id`
(`uniqueidentifier` on both sides).

---

## R-4 · Oldest-first or newest-first pages? (spec Q-2)

**The requirement:** AC-9 orders ascending; AC-12 defaults to the fifty **most recent**
entries with a load-older action. Those pull in opposite directions and the interaction is
the whole question.

**Options weighed:**

| Option | What happens when a comment is added mid-session |
|---|---|
| Number pages from the **newest** end (page 1 = newest 50) | Every entry shifts by one. The entry that was last on page 1 is now first on page 2, so "load older" either repeats it or skips it. The classic offset-pagination defect |
| Number pages from the **oldest** end (page 1 = oldest 50), default to the last page | The feed is **append-only**, so entries only ever arrive at the newest end. Pages `1 … N−1` are immutable once full; only page `N` grows. "Load older" walks immutable pages and cannot skip or repeat |

**Settled:** ascending numbering, oldest-first, and the server returns the **last** page
when `page` is omitted, naming the page it served in the envelope so the client never
computes one. The spec's working assumption for Q-2 held, and the reason it is correct is
stronger than the reason it was proposed: append-only is what makes offset paging safe
here, and it is why keyset paging is not needed (see `plan.md`, Risks).

**The silent failure it creates instead:** a client that sends `page=1` because that looks
like the obvious default gets the oldest fifty entries. On an active ticket that renders
as a timeline frozen weeks ago, with no error anywhere. Named in the contract, the
frontend guide, and the frontend spec.

---

## R-5 · Should `CommentAdded` history rows appear in the timeline? (spec Q-1)

**The tension:** BR-5.5 requires a `CommentAdded` history row. BR-5.7 says the timeline is
the union of comments and history. Do both, literally, and every comment appears twice —
once as itself with its body, once as a bodyless line saying a comment was added. The
second copy reads like data loss.

Q-1's working assumption already named the goal ("avoid rendering the same event twice");
what had to be settled was the mechanism.

| Option | Why not |
|---|---|
| Do not write the row | Violates BR-5.5, and a future customer-facing view and the audit reader both want it |
| Write it, render both | Every comment shown twice |
| Write it, de-duplicate in the client | Needs a stable link between a comment and its history row, and breaks the moment two comments share a millisecond — which a frozen `TimeProvider` makes routine in tests (R-6) |
| **Write it, exclude it from the projection** | The comment *is* the entry. One predicate in one query, and nothing downstream can get it wrong |

**Settled:** exclude it — `EventType <> 'CommentAdded'` on the history branch. The row is
still written, and it carries the comment id in the existing `NewValue` column
(`nvarchar(200)`, a `Guid` fits), so the link Q-1 asked for exists for the consumers that
want it. **No schema change to `dbo.TicketHistory`**: a dedicated `CommentId` column would
be null for six of the seven event types.

`TEST-013-16` asserts one comment produces exactly one entry. `frontend-spec.md` records
why there is deliberately no `timeline.entry.commentAdded` translation key, so that a
later reader does not "fix the gap" and reintroduce the double render.

---

## R-6 · What makes the same-instant tie-break deterministic, and how is it tested?

**Checked:** what a same-millisecond collision actually looks like, and what SQL Server
orders `uniqueidentifier` by.

**Two findings, both counter-intuitive:**

1. **Ties are not an exotic edge case — they are the normal case in the test suite.**
   `TimeProvider` is injected and frozen in tests, and `AddComment` writes the comment and
   its history row in one call with one timestamp. At `datetime2(3)` they are byte-identical.
   So `AC-10` is not protecting against a rare production coincidence; it is what makes
   every ordering assertion in the suite stable at all.
2. **SQL Server does not order `uniqueidentifier` the way .NET orders `Guid`.** The byte
   comparison order differs. Both are deterministic; they are not the same. A test that
   computes the expected sequence in C# with `Guid.CompareTo` and compares it to what the
   server returned will fail, and it will look like a query defect.

**Settled:** order by `(OccurredAtUtc, EntryTypeRank, Id)` — `EntryTypeRank` a constant
per branch, so a comment and its own history row have a fixed relative position — and
assert AC-10 as **stability across repeated requests**, never against a C#-computed
sequence (`TEST-013-08`).

---

## R-7 · Does `POST /comments` return a `Location` header?

**Checked:** the endpoint inventory in `docs/sdd/05-api-conventions.md`.

**Settled:** no, and this is a recorded deviation from the convention that `201` carries a
`Location`. There is no `GET /api/tickets/{id}/comments/{commentId}` in the inventory, and
there will not be one: BR-5.3 makes a comment append-only, so it has no addressable
identity of its own — the timeline is its only view.

A `Location` header pointing at a route that answers `404` is worse than no header,
because a client that follows it fails in a way that looks like a server fault.

**What is returned instead:** the created comment, including `authorName`, so the client
can replace its optimistic entry without a second request to resolve a name it already
has the id for. Recorded in `plan.md` under **API Contract** as a deviation, not absorbed
silently.

---

## R-8 · How is `actorName` resolved, and what is the difference from the audit log?

**Checked:** AC-14 (no query per entry) against BR-9.6 (the audit log snapshots its
actor), because the two say opposite things and both are right.

**Settled:** the timeline **joins** `dbo.SupportUsers` once per branch and resolves the
name live. A renamed user's past entries show the new name, which is what a support agent
reading a ticket wants — they are looking for a colleague they can go and talk to today.

`AuditLog` does the opposite and snapshots `ActorEmail` and `ActorRole` at write time,
because an audit record that resolves the actor live reports their role *today* and
inverts the answer to every authorization question an auditor would ask (ADR-008). The two
tables genuinely need opposite behaviour, and this is the feature where both appear at
once.

**The predicate that must not be there:** `WHERE u.IsActive = 1`. It is the natural thing
to copy from an assignee-picker query, and with it a departed colleague's comments and
history vanish from every ticket they ever touched. The rows are still in the database, the
query returns fewer of them, nothing errors. `TEST-013-19` exists for this and nothing
else.

The join is an inner join on the primary key, and `ON DELETE NO ACTION` on both FKs
guarantees it always matches — a support user cannot be deleted out from under it.

---

## R-9 · Page size 50, when BR-7.2 says 20?

**Checked:** BR-7.2 against AC-12 and spec assumption A-3.

**Settled:** 50, and it is a deviation with a reason rather than an oversight. BR-7.2's
default of 20 is written for the **ticket list**, where a row is a summary card. A timeline
entry is one line; at 20 a reader pages three times to see a week of activity on a normal
ticket.

What is **not** changed: the maximum of 100 and its clamp, and the clamp of `page ≤ 0` to
1. Both still apply, both are still tested. A request for `pageSize=5000` is clamped, not
rejected — the convention's behaviour, unchanged.

Recorded in the contract and in `checklists/requirements.md` so a reviewer reading BR-7.2
sees the divergence stated rather than discovering it.

---

## R-10 · Does adding a comment touch the `Tickets` row?

**The question nobody asks until it produces a bug.** `05-api-conventions.md` says
endpoints that mutate a ticket accept an `expectedVersion`. Does this one?

**Checked:** what would move if `AddComment` bumped `Ticket.UpdatedAtUtc`.

**Settled: no.** Adding a comment inserts into `dbo.TicketComments` and `dbo.TicketHistory`
and touches nothing on `dbo.Tickets`. Therefore the ticket's `rowversion` does not move,
this endpoint takes **no `expectedVersion`**, and there is nothing for it to conflict over.

**What the alternative would have cost:** if the comment bumped `UpdatedAtUtc`, then an
agent writing a comment and an agent changing the status at the same moment would collide.
One of them would get a `409 errors/concurrency-conflict` caused by an action that has no
business conflicting with theirs, and from the user's side it would look random — the
worst class of intermittent bug, because it is unreproducible on demand and correct
according to every rule in the codebase.

**What it costs the way it is, stated honestly:** "last activity" on a ticket is not
comment-aware. A ticket with fifty comments today still sorts by its creation time in the
list from `010`. If the product later wants activity-based sorting, the answer is a
computed column or a separate `LastActivityAtUtc` maintained deliberately — not a side
effect of commenting.

---

## R-11 · What goes into the audit row's `Changes`, and what must not?

**Checked:** BR-9.7 against the shape of a generic audit behaviour.

**Settled:** `{ "commentId": "…", "isInternal": true, "channel": "Email" }`. Metadata
only. **Never `body`.**

**The failure mode is the default one.** A pipeline behaviour that audits by serialising
the command — the obvious implementation, and the one that needs no per-command work —
puts `body` in `Changes` automatically. The comment body is user-entered text, and
`dbo.AuditLog` is the one table the application never deletes and only Managers read
(BR-9.5, BR-9.11, BR-9.13). Nothing fails, nothing looks wrong, and the data is there
permanently.

BR-5.5 and BR-9.7 say the same thing from two directions: the record notes that a comment
happened, not what it said. `TEST-013-14` asserts a distinctive body string appears nowhere
in the row — not in `Changes`, not in `EntityLabel`.

**Also settled while looking:** the `403` question. There is no `403` on either endpoint —
BR-6 permits both `Agent` and `Manager` to comment and to read — so BR-9.2's denial path
does not arise here. The `401` path does, and BR-9.4 means that row is written **outside**
any transaction, because there is no business transaction to join (`BE-013-11`,
`TEST-013-15`). And whether a *rejected* comment writes a row is genuinely undecided, so
it is `spec.md` Q-3 with a working assumption rather than a guess in the code.

---

## R-12 · Can any of this be tested without a real SQL Server?

**Checked:** whether EF `InMemory` could stand in for the union tests, since they are the
bulk of the suite.

**Settled: no, and not partially.** `InMemory` is not a relational provider: there is no
`UNION ALL` to translate, no `OFFSET … FETCH`, no check constraint, and no way to capture
generated SQL — so `TEST-013-12`, the assertion the whole design rests on, cannot exist
there at all. A suite green against `InMemory` would prove that a client-side merge
produces correct results, which was never in doubt and is precisely the design that was
rejected.

Integration tests run against `mcr.microsoft.com/mssql/server:2022-latest` through
`Testcontainers.MsSql` — **not** the PostgreSQL module the pre-ADR-013 artifacts assumed.
The container requirements (`ACCEPT_EULA`, the SA password complexity policy, and waiting
for the engine's readiness rather than the open port) are already settled by
`001-solution-skeleton`'s `research.md` R-1, and this feature inherits that fixture
unchanged.
