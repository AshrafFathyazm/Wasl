# 010 — Research

Questions that had to be settled before the plan could be written, what was checked, and
what each one settled. Mined from the original US-006 plan's trade-offs and from what the
switch to SQL Server (ADR-013) and to vertical slices (ADR-010) changed.

A question that turned out not to matter is recorded as such, because "we looked and it did
not matter" is information too.

---

## R-1 · Is `ORDER BY CreatedAtUtc DESC` a deterministic order?

**Checked:** BR-7.1, the column type in `docs/sdd/03-domain-model.md`, and what SQL Server
guarantees for rows that tie on the sort key.

**Found:** `CreatedAtUtc` is `datetime2(3)` — millisecond precision, chosen in `001`'s
`research.md` R-2. Several tickets created inside one millisecond is not a theoretical case:
a seeded integration fixture inserting ten tickets in a loop produces it every run, and a
real burst of inbound email produces it too.

SQL Server makes **no guarantee** about the relative order of rows that tie on the `ORDER BY`
key, and it is free to return them differently on each execution — the plan can change with
statistics, parallelism, or which index it picks.

**What that costs, and why it is the worst kind of defect:** with `OFFSET … FETCH`, a
non-deterministic order means a row that ties with another can appear on **both** page 1 and
page 2, or on **neither**. Nothing errors. Every single-page test passes. Every review passes.
It reaches a user as "the list skipped one", and they will not be able to reproduce it.

**Settled:** `ORDER BY CreatedAtUtc DESC, Id DESC`. `Id` is the primary key, so the composite
is total and the order is stable across executions. **AC-22 is the test**, with a controlled
`TimeProvider` so the tie is deliberate rather than lucky.

`Id` is a `Guid`, so `Id DESC` is not meaningful as an ordering — it does not have to be. It
only has to be *deterministic*, which is the whole requirement.

**Rejected:** ordering by `CreatedAtUtc DESC, TicketNumber DESC`. `TicketNumber` is unique
and would also work, but it is a formatted `nvarchar` and the comparison is a string
comparison under a collation. Correct, slower, and dependent on the collation being what
someone assumed.

---

## R-2 · Does `IX_Tickets_Status_Created` serve the default list?

**Checked:** the index inventory in `docs/sdd/03-domain-model.md` line by line against the
query this feature actually issues.

**Found:** it does not. The index is `(Status, CreatedAtUtc DESC)` and its stated reason is
"Default list query" — but `010`'s default list has **no `Status` predicate at all**. With an
unconstrained leading column, the index cannot supply the ordering; the query reads
everything and sorts.

The blueprint row is describing `015`'s **filtered** query under `010`'s name. That is a real
inconsistency in the blueprint, not a misreading.

**Settled:** `010` adds `IX_Tickets_CreatedAtUtc_Id` on `(CreatedAtUtc DESC, Id DESC)`,
justified by exactly one named query — the default list, which is the most-executed query in
the product — and it covers the R-1 tie-breaker so paging becomes a seek rather than a sort.

**Considered and rejected:** adding nothing. At a few hundred rows the scan is free and the
honest position is that nothing is measurable. Rejected because the no-speculative-indexes
rule says an index arrives *with the query that needs it*, and this is that query. It is
listed as droppable in `tasks.md` precisely because it is performance and not correctness.

---

## R-3 · How do you actually assert "no query per row" on SQL Server?

**Checked:** what AC-12 requires, and what is available in EF Core 10 to observe it.

**Found:** the original artifact said "executed-command count stays constant as the page size
grows" without naming a mechanism. There are two, and only one of them measures the right
thing:

| Mechanism | Verdict |
|---|---|
| A `DbCommandInterceptor` registered on the test host, counting `ReaderExecuting` / `ReaderExecutingAsync` | **Chosen.** It counts what was actually sent to the engine, which is the claim |
| Asserting on logged SQL text | Rejected. It couples the test to log formatting and it cannot count reliably |

**The number is 2, not 1.** `docs/sdd/05-api-conventions.md` already decided that
`totalCount` is a second query. So the assertion is: *the command count is the same at
`pageSize=10` and at `pageSize=50` over 50 rows* — 2 in both cases. An assertion of "exactly
one command" would fail on correct code, be "fixed" by loosening it, and then never catch
anything again.

The defect being hunted is 2 + n, which is what `Include` plus lazy loading produces.

**Settled:** `CommandCountingInterceptor` in `tests/Wasl.Api.IntegrationTests/Common/`,
against a real SQL Server through `Testcontainers.MsSql` — not `Testcontainers.PostgreSql`
(ADR-013) and never EF `InMemory`, whose query translation is not the translation under test.

---

## R-4 · Who owns `TicketStatusTransitions`, given `010` reads it and `012` enforces it?

**Checked:** ADR-004, the phase order in `specs/README.md` (`010` before `012`), and what
`012`'s "all 36 BR-1 transitions covered" actually covers.

**The problem:** ADR-004 requires the ticket response to carry `allowedTransitions`, which
means `010` needs the permitted-transition map. But `012-change-ticket-status` is the feature
that owns the state machine, and it comes two features later.

**Options weighed:**

| Option | Cost |
|---|---|
| `010` returns a placeholder or empty array until `012` | Ships a screen whose action menu is knowingly wrong, and the "temporary" version is what gets reviewed |
| `010` derives the array in the slice | A second copy of BR-1 outside the domain — the exact thing ADR-004 forbids |
| **`010` creates the map in `Wasl.Domain/Tickets/`; `012` adds the enforcement** | The map arrives one feature before its enforcement. Its 36 cells are pure data and unit-testable with no database |

**Settled:** the third. `010` owns `TicketStatusTransitions` and the unit test that checks all
36 cells against BR-1's matrix. `012` adds the guard, the `409`, BR-1.3's assignee
precondition, BR-1.2's required note, and the endpoint-level coverage of the same 36
transitions — which is enforcement, not the map, so nothing is duplicated.

Recorded as spec Q-2 so the division is reviewable rather than discovered.

---

## R-5 · Should `allowedTransitions` fold in BR-1.3 and BR-6?

**Checked:** BR-1.3 (`InProgress` requires an assignee), BR-6 and BR-2 (who may act), and
what the field would have to mean if either were folded in.

**Found:** folding them in makes the array depend on the **caller** and on the ticket's
assignment, not just on its status. Two consequences, both bad:

- Two users viewing the same ticket get different arrays, so the field stops being a property
  of the ticket and stops being cacheable.
- The array would then be answering "what may *you* do", which duplicates the authorization
  matrix into a data field — and the matrix is enforced server-side anyway.

**Settled:** `allowedTransitions` is the permitted-**transition** set for the current status,
nothing more. A client may therefore offer an action the server then rejects with a `409`
(BR-1.3) or a `403` (BR-2, BR-6), and that is correct: the rejection carries a message the
user can act on. Documented in the contract as a behaviour, not left to be discovered.

---

## R-6 · What does a malformed request produce, and does it stay inside the error contract?

**Checked:** two paths — a non-`Guid` path segment, and a non-numeric `page`.

**Found:**

| Input | Result | Why |
|---|---|---|
| `/api/tickets/not-a-guid` | **`404`** | The `{id:guid}` route constraint means the route does not match. No endpoint runs, so there is no request to validate and nothing to return `400` about. `400` is the intuitive guess and it is wrong |
| `?page=abc` | `400` — **and the body has to be checked** | Minimal-API parameter binding failure raises `BadHttpRequestException`. Whether that reaches the client as the contract's `ProblemDetails` or as a bare `400` depends on `002-error-contract`'s middleware ordering and on `AddProblemDetails()` being registered |

**Settled:** both are asserted rather than assumed — `TEST-010-09` and `BE-010-11`. The
second is the one that matters: constitution IV says every non-2xx response is
`ProblemDetails` with a `traceId`, and a framework-generated `400` with an empty body would
violate that **on a path nobody thinks to test**. If it turns out not to hold, the fix belongs
in `002` and this feature reports it rather than patching it locally.

---

## R-7 · Projection or `Include`?

**Checked:** the original plan's trade-off table, which already reached the right answer, and
what the SQL Server shape adds to it.

**Settled, unchanged from the original:** project inside the `Select`. `Include` on
`Customer` and `AssignedToUser` is the classic N+1 in this shape and AC-12 exists to prevent
it.

**What the SQL Server pass adds:** the *kind* of join matters and the original did not say so.

| Join | Kind | What the other kind does |
|---|---|---|
| `Customers` | INNER | `CustomerId` is `NOT NULL` with an FK. A left join would be honest and pointless |
| `SupportUsers` for the assignee | **LEFT** | An inner join **silently drops every unassigned ticket** — the entire triage queue — and the list looks correct, because the missing rows are the ones nobody has claimed |

EF Core generates the left join automatically from a nullable navigation, so the failure mode
is not writing the query by hand — it is "optimising" it later. `TEST-010-13` is the guard.

---

## R-8 · Should the detail response carry `version` now, or when `011` needs it?

**Checked:** ADR-006 as amended by ADR-013, and `007`'s decision to return `version` from an
endpoint that does not consume it.

**Settled:** now. `011-assign-ticket` and `012-change-ticket-status` both send
`expectedVersion`, and if the read shape does not carry it they either refetch to obtain a
value the cache already had, or the read shape changes after two clients consume it — which
is a contract change with no requirement behind it.

`version` is the base64 of a real `rowversion` column, maintained by the database and never
incremented by application code (ADR-013 row 1).

**Not carried on the list rows.** Nothing on the list mutates, and 100 rows of an unused
token is payload for nobody.

---

## R-9 · What should out-of-range paging values do?

**Checked:** `docs/sdd/05-api-conventions.md` and BR-7.2.

**Settled from the blueprint:** `page` ≤ 0 clamps to 1; `pageSize` > 100 clamps to 100.
Neither is rejected.

**Not covered by the blueprint, and decided here:** `pageSize=0`. It clamps to the default of
20. Zero has no useful meaning, and rejecting it would be the only place in the pagination
contract that rejects instead of clamping. Recorded as spec Q-4 rather than assumed.

**The part that is easy to get wrong:** the response must echo the **effective** value.
Returning `"pageSize": 500` after clamping to 100 is what makes a clamp invisible — the
client renders "showing 500 per page" over 100 rows and the pagination arithmetic is wrong
from there on. `TEST-010-01` asserts the echoed value, not just the row count.

---

## R-10 · Does the list need a `sort` parameter?

**Checked:** the source story's Out of scope ("Sort other than creation date"),
`docs/sdd/05-api-conventions.md` (whose pagination example shows `sort=-createdAt`), and
`docs/sdd/design/screens/03-tickets-list.md` (which draws a sort button in the toolbar).

**Found:** three documents, two positions. The story excludes sorting; the conventions
example implies it exists; the screen spec draws a control for it.

**Settled:** not implemented. A `sort` parameter is ignored like any other unrecognised
parameter, and the sort control is **omitted from the screen** rather than rendered inert — a
disabled control invites a bug report about the support tool.

Flagged as spec Q-3, because it is a genuine disagreement and one of the two documents should
change: either the screen spec loses the icon, or a story gains a criterion. Guessing which
would be inventing a requirement.

---

## R-11 · Does anything here need MediatR, given both operations are reads?

**Checked:** ADR-010's justification for MediatR — validation, the audit row, and the
transaction boundary, applied by pipeline behaviours.

**Found:** a read needs the first and none of the others. There is no audit row for a
successful read in this feature (BR-9.11 audits reading the *audit log*, which is `019`), and
there is no transaction to open.

**Settled:** keep both operations on the same pipeline anyway. Two reasons, and the second is
the real one:

- The validation behaviour is what turns a FluentValidation failure into the contract's `400`.
  Bypassing the pipeline for reads means a second path to a `400`, and two paths to one error
  shape is how they diverge.
- A read that skips the pipeline is a read that also skips whatever is added to the pipeline
  next. The transaction behaviour must be a no-op for a query — which it is, since a query
  opens none — rather than something a handler opts out of.

The honest cost: two `IRequestHandler`s that do nothing a plain method could not do. Accepted,
because the alternative is a second convention in the same codebase.
