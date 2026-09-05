# 036b — Transient Failures on the Read Path · BACKEND

**Phase:** 5 · **Lane:** Backend only · **Status:** spec, awaiting review
**Closes:** the first limitation `036` recorded in [summary.md §7](../036-write-path-hardening/summary.md)
**Consumer:** nobody is blocked

---

## 1 · What this is

`036` §3.3 translates a SQL Server deadlock victim into `503 errors/transient-conflict`. It
does that in `WaslDbContext.SaveChangesAsync`, so it covers a deadlock on the **write** and
nothing else.

That gap is not theoretical and it was not inferred. **`036`'s own deadlock test hit it**: the
first version read each row immediately before updating it, SQL Server chose the second
`SELECT` as the victim, and the test failed with `found {SqlException}` — an unmapped `500` for
the exact condition the feature exists to answer. The test was restructured to read both rows
up front so it exercised the path the fix covers, and **the gap was recorded rather than
quietly designed around** (`036` `tests.md` §3.3).

This closes it.

## 2 · Why a read deadlocks at all

A read outside a transaction takes a shared lock and releases it immediately; it is a poor
deadlock candidate. A read **inside** one is a different thing, and every command in this
product makes one:

```
TransactionBehaviour opens a transaction
  handler:  SELECT the aggregate        ← holds S until commit under a write transaction
            mutate
            SaveChanges                 ← takes X
  commit
```

Two commands touching two aggregates in opposite order deadlock on the `SELECT` as readily as
on the `UPDATE`. Which statement the engine picks as the victim is its own choice, and the
answer the client receives currently depends on it: `503` if the `UPDATE` lost, `500` if the
`SELECT` did. **The same failure, two answers, decided by the engine.**

## 3 · The mechanism, and why the obvious one is wrong

### 3.1 · Rejected: wrap the four read methods on `IApplicationDbContext`

`AnyAsync`, `FirstOrDefaultAsync`, `ToListAsync`, `CountAsync` are the chokepoint every
Application-layer read goes through, and wrapping them is four small edits.

**It is incomplete, and measurably so.** Two readers do not go through them:

| Reader | How it reads |
|---|---|
| `Infrastructure/Queries/TicketTimelineQuery` | EF extension methods directly on `WaslDbContext` DbSets — it unions two tables neither of which is on `IApplicationDbContext`, which is why it exists |
| `SequenceTicketNumberGenerator` | `Database.SqlQueryRaw<long>` |

So four wrappers would leave two holes, and the next named query class — `CLAUDE.md` says a
third needs a written reason, so there will be a third — would be a hole nobody remembers to
plug. **That is the per-table grant `003b` rejected, in another costume:** *a list is a list
somebody forgets to extend, and the next feature's addition becomes a `500` that reads as a bug
in the feature.*

### 3.2 · Chosen: one MediatR behaviour, outermost

`TransientFailureBehaviour` wraps every request — commands **and** queries — and translates a
deadlock victim anywhere beneath it: the handler's reads, its writes, the named query classes,
the raw sequence draw, and `TransactionBehaviour`'s commit.

```
TransientFailure  →  Validation  →  Transaction  →  Audit  →  handler
```

**Outermost, and every other position is wrong:**

- Inside `Transaction`, it would not see a deadlock raised by the `COMMIT` itself.
- Inside `Audit`, it would translate before `AuditBehaviour` classified the failure, so BR-9's
  failure row would record `transient-conflict` instead of what actually happened.

Outermost means `AuditBehaviour` still sees the raw exception and writes its row, and the
translation happens on the way out — which is the order BR-9 needs and the reason this cannot
simply be "added to the list".

> **CORRECTION, after implementation — the second bullet is FALSE and was measured to be.**
> Registering this behaviour innermost was run as AC-9's control and **every test stayed green**.
> `AuditOutcomeClassifier` maps any non-denial `DomainException` to `Failed`, which is exactly
> what it maps the raw engine exception to, so BR-9's row is identical from either position.
>
> The first bullet survives and is now the whole argument. It is **unproven**: a deadlock
> resolved on `COMMIT` could not be induced, so no test goes red if the line moves. Recorded as
> unproven rather than defended by the claim measurement rejected. Evidence: `tests.md` §4.2.
>
> **This paragraph is left in place rather than edited away** — the reasoning that led to the
> right placement for a wrong reason is the part worth keeping.

**It is NOT constrained to `ICommand`.** `TransactionBehaviour` is, deliberately, so a query
never opens a transaction (`003` AC-16). This one must run for queries too — a `GET
/api/tickets` can be a deadlock victim against a concurrent write, and that is precisely the
case §3.1's four wrappers would have covered and this must not lose.

### 3.3 · The `SaveChangesAsync` catch stays

`036`'s translation is not replaced. It is redundant for anything reaching the pipeline and it
is **not** redundant for the seeders, which call `SaveChangesAsync` directly and never touch
MediatR. Two mechanisms, and each keeps its own negative control — the shape `002b` used for
`404`/`405` versus `415`.

## 4 · What is NOT being built

| Not building | Why |
|---|---|
| Retrying inside the server | `036` Q-3 ruled route A and nothing here reopens it. The retried delegate would still not be idempotent |
| Translating 1222 (lock timeout) | `036`'s ruling stands: a timeout does not prove rollback, so advising a retry could double a write that eventually commits |
| Any change to `Retry-After`, the `type`, or the status | `503 errors/transient-conflict` already exists and is already documented. This feature adds no vocabulary |
| Widening to other transient SQL Server errors (1204, 1221, 40501…) | None has been observed here. `036` chose 1205 because its rollback is guaranteed by the engine; every other number needs its own argument |

## 5 · Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | A deadlock victim chosen on a **`SELECT` inside a command's transaction** answers `503 errors/transient-conflict`, not `500` |
| AC-2 | The AC-1 body is identical to the one `036`'s write-path deadlock produces, `traceId` and `instance` excepted — the client cannot tell which statement lost |
| AC-3 | `Retry-After` is present and ≥ 1 on AC-1's response |
| AC-4 | A deadlock victim on a **query** — no command, no transaction of ours — answers the same `503` |
| AC-5 | **BR-9 is unchanged.** A deadlocked command still writes its failure audit row, and that row records `Failed`. ~~This is the criterion that goes red if the behaviour is registered in the wrong place~~ — **struck after measurement: it does not.** It stays as a regression guard on a new outermost behaviour not swallowing a failure or skipping the audit path, which is a real risk. §3.2's correction |
| AC-6 | `WaslPipeline.DeclaredOrder` names four behaviours in the asserted order, and `003` AC-15's test is updated in the same change rather than loosened |
| AC-7 | `003` AC-16 still holds: a **query** opens no transaction. Adding an unconstrained behaviour must not drag one in |
| AC-8 | `036`'s write-path deadlock test still passes **unchanged**, proving the new behaviour did not become the only thing translating |
| AC-9 | **Negative control:** with the behaviour removed, AC-1 goes red and AC-8 stays green. ~~With it registered innermost instead of outermost, AC-5 goes red~~ — **run, and it did not.** The first half passed as written; the second half is the disproof recorded in §3.2 and `tests.md` §4.2. A control that fails to fail is a finding, not a formality |

## 6 · Open Questions

| # | Question | Working assumption |
|---|---|---|
| Q-1 | Should the behaviour also cover a deadlock raised by `TransactionBehaviour`'s **rollback**? | No. A failed rollback is not a retryable business outcome and the connection is already suspect; let it be a `500` |
| Q-2 | Does an unconstrained behaviour measurably cost anything on the read path? | No — it is a `try`/`catch` with no allocation on the success path. Stated so nobody assumes it was measured |

## 7 · Definition of Done — additions

- AC-9's two controls are **run and seen red**, then reverted, with output recorded in
  `tests.md`. A guard never seen to fail has not been verified.
- The full suite, never `--filter`, with the count recorded.
- No new i18n key, no new `ProblemTypes` row, no migration — and if any of those turns out to
  be needed, this spec was wrong and is amended before the code is.

---

## Gate

Written under Gate 1. **No code.** Two open questions, neither blocking — both have defensible
working assumptions and neither changes the shape of §3.

May I implement this spec?
