# 018 — Research

The questions that actually had to be settled before this feature could be planned.
Mined from the original story artifacts' trade-offs and from what ADR-013 changed. A
question with an obvious answer is not here.

---

## R-1 — One composition endpoint, or let the client compose?

**Question.** The screen needs a profile, six counts, and ten ticket rows. All three
already exist behind endpoints `008` and `010` ship. Does US-004 need an endpoint at all?

**Checked.** `docs/sdd/design/screens/07-customer-profile.md` Action 1 — the screen spec
already names `GET /api/customers/:id/overview` as the single call. ADR-011 §4 — fetching
happens only at the route level, and every dependent request must be known at route
level. `docs/sdd/05-api-conventions.md` endpoint inventory — `/api/customers/{id}/overview`
is already listed against US-004.

**Settled.** One endpoint. Not because a screen deserves an endpoint, but because the
counts are **not derivable** from what the existing endpoints return: `GET /api/tickets?customerId=…`
returns one page of at most 100 rows, and a customer with 240 tickets would need three
pages fetched to be counted. The client would either be wrong or would page the whole
history to render a number.

**Rejected.**

| Alternative | Why not |
|---|---|
| Client calls profile + ticket list, derives counts | Wrong for any customer past one page, and silently wrong — the number looks plausible |
| Client calls profile + one list call per status (six) | Eight round trips for one screen, each one an opportunity for a partial render |
| Add `?includeCounts=true` to `GET /api/customers/{id}` | A flag that changes the response shape. Two shapes behind one URL is the thing OpenAPI cannot describe usefully and the client cannot type |

---

## R-2 — How are the counts produced without one query per status?

**Question.** AC-4 forbids an N+1. What does the query actually look like, and what does
"a single grouped query" return when a status has no rows?

**Checked.** SQL `GROUP BY` semantics — a grouping key with no rows produces **no row**,
not a row with `0`. EF Core's `GroupBy` translation to SQL Server for the simple
`Select(g => new { g.Key, g.Count() })` shape (the shape that translates; a `GroupBy`
followed by anything EF cannot translate is evaluated client-side, which is the same
defect by a different route). BR-1's status list in `docs/sdd/04-business-rules.md`.

**Settled.** One `GROUP BY Status`, returning only the statuses that have rows, then
**projected onto the full BR-1 status set in the handler**, zero-filling the rest. Both
halves are required and each fails on its own:

| Half | Alone it fails when |
|---|---|
| The grouped query | A status with no tickets is simply missing from the response, and the rail loses a row |
| The zero-fill | Nothing — but it needs the status set, which is the domain enum, and the client must not own a second copy of it |

This is the highest-value finding in the feature, because **the missing-status bug does
not look like a bug**. The response is well-formed, the counts present are correct, and
the rail just has four rows instead of six. Nobody reports it; an agent concludes the
customer has no `InProgress` tickets, which is true, and never learns that the row would
be missing either way.

**Rejected.**

| Alternative | Why not |
|---|---|
| Six `CountAsync` calls | Seven commands where three do, and it grows with the enum. This is the implementation AC-4 was written to fail |
| `Include(c => c.Tickets)` then count in memory | Loads every ticket the customer has ever had, to produce six integers. Compiles, returns correct answers, and gets slower forever |
| Return only the non-zero statuses and let the client fill the gaps | Puts the BR-1 status list in the client. That list is the thing that goes stale when a status is added |
| A `TicketCount` column maintained on write | See [`data-model.md`](data-model.md) — a counter that drifts from the rows never announces that it has |

---

## R-3 — How do you assert "no N+1" in a way that can actually fail?

**Question.** AC-4 has to be a test, not a review note. What does the assertion assert?

**Checked.** EF Core's `DbCommandInterceptor` — `ReaderExecuting` fires once per command,
which is the countable unit. The constitution's rule that integration tests run against
`Testcontainers.MsSql` and never EF `InMemory`. `docs/sdd/testing/test-matrix.md` — US-004's
integration row already reads "executed-query count assertion (AC-4)", and US-006 and
US-010 carry the same kind of assertion, so the harness is shared, not built here.

**Settled.** A `CommandCountingInterceptor` registered in the test host, counting commands
across one HTTP request, asserting **exactly three**.

Two details that matter more than they look:

- **Exactly**, not "at most". An upper bound of ten passes a per-status implementation
  (1 profile + 6 counts + 1 list = 8). An exact count means any change to the number of
  round trips is a deliberate edit to a test, with a reason written next to it.
- **`Testcontainers.MsSql`, never EF `InMemory`.** `InMemory` does not generate SQL at
  all, so there are no commands to count — the assertion would pass vacuously against a
  provider that cannot express the defect. **Migration note:** the original artifacts
  specified Testcontainers with a PostgreSQL image; ADR-013 makes it
  `Testcontainers.MsSql`, and the interceptor is provider-agnostic either way.

**Rejected.**

| Alternative | Why not |
|---|---|
| Assert on elapsed time | Measures the container, and is flaky in CI |
| Assert on the generated SQL text | Breaks on an EF Core upgrade that changes formatting, for no gain |
| A benchmark with a large seeded dataset | Slow, and it tells you the query is slow rather than telling you it is an N+1 |
| Review it manually | The story's own notes rejected this: "AC-4 exists to make that explicit rather than leaving it to review" |

---

## R-4 — What did the move to SQL Server change about the ordering?

**Question.** AC-2 orders by `createdAtUtc` descending over a `Take(10)`. Is that a total
order?

**Checked.** `docs/sdd/03-domain-model.md` physical shape — `CreatedAtUtc datetime2(3)`.
ADR-013's note that `datetime2(3)` is millisecond precision, chosen over `datetime`
(3.33ms rounding) and against higher precision at no storage cost. The original blueprint
was written against PostgreSQL `timestamptz`, which is microsecond precision. SQL Server
makes no ordering guarantee for rows tied on the `ORDER BY` key, and the order can differ
between two executions of the same query.

**Settled.** `ORDER BY CreatedAtUtc DESC, Id DESC`. The tie-break is in the acceptance
criterion and in the frozen contract, not left as an implementation detail.

This is a genuine regression introduced by the database switch and it is worth stating
plainly: at microsecond precision, ties happen when two tickets are created in the same
microsecond — effectively never outside a tight loop. At **millisecond** precision they
happen in every seed script, in every test that creates fixtures in a loop, and in any
bulk import. The two visible symptoms are a `TEST-018-04` that fails one run in ten, and
a ticket list that reshuffles when the query refetches — which a user reads as data
changing on its own.

**Rejected.**

| Alternative | Why not |
|---|---|
| Order by `TicketNumber DESC` | It is a formatted string, so its ordering is lexical, and the sequence behind it is not reset per year — correct by accident today, and only until the format changes |
| Order by `Id DESC` alone | `Id` is a client-generated `Guid` (`001` research R-5). It has no time component at all |
| Accept the instability, since the ten rows are the same set | The *set* is stable only when the tie does not straddle the boundary at row 10. When it does, the set changes too |
| Raise the column to `datetime2(7)` | A schema change to paper over a missing tie-break, and the tie-break is still needed at any precision |

---

## R-5 — Where does `IX_Tickets_Customer` come from?

**Question.** Which feature's migration creates it?

**Checked.** `docs/sdd/03-domain-model.md` — the index appears in the `dbo.Tickets` DDL,
and the query-to-index map attributes "Tickets for one customer" to US-004. `specs/001-solution-skeleton/data-model.md`
— `001` creates only `dbo.Customers`, and explicitly defers `IX_Customers_FullName` to
`008` under the no-speculative-indexes rule. `specs/README.md` — `015-ticket-filters-and-search`
also filters by customer (BR-7.3) and is **first out** in the Phase 5 cut order.

**Settled.** `018` owns the migration `AddTicketsCustomerIndex`, which creates the index
**only if absent**, and `BE-018-02` verifies through `sys.indexes` rather than assuming.
Recorded as spec **Q-1** because ownership across two features is a human decision, not
one this plan gets to make silently.

The failure mode if it is left implicit: two features each add a `CREATE INDEX` for the
same name, and the second migration fails to apply on a clean database. That is loud, and
loud is the best available outcome — the quiet version is both features assuming the other
created it and neither doing so, leaving a scan behind a passing test suite.

**Rejected.**

| Alternative | Why not |
|---|---|
| Put it in `001` with the table | Speculative. `001`'s own data-model rejects exactly this for `IX_Customers_FullName` |
| Let `015` own it and depend on `015` | `015` is first out of the cut order. Depending on the most droppable feature on the board for an index this feature needs is a dependency that plans to break |
| Skip the index; the dataset is small | Two table scans per profile view, on the fastest-growing table, hidden behind a green test suite |

---

## R-6 — Is reading the overview an audited event?

**Question.** ADR-008 landed after the original artifacts were written. Every state-changing
command must be auditable, and NFR-10 fails the build otherwise. What does that mean for a
read?

**Checked.** BR-9.1 — "every operation that **changes state**". BR-9.2 / BR-9.4 — every
`401` and `403` writes a row, and for a denial there is no business transaction, so the
row is written independently. BR-9.11 — reading the audit log **is** audited, as
`Audit.Read`. NFR-10 — the architecture test asserts every `ICommand` implements
`IAuditableCommand`. BR-6 — both roles may view a customer.

**Settled.** No audit row on a successful read. The obligation is discharged in three
places instead, and each is a task:

| Obligation | Where |
|---|---|
| No row on success, asserted so the absence is a decision | `AC-11`, `TEST-018-09` |
| One row on the `401`, written outside any transaction | `AC-10`, `BE-018-10`, `TEST-018-08` |
| The type stays an `IQuery`, so NFR-10's architecture test keeps holding after a refactor | `BE-018-09` |

**Migration note.** The original artifacts predate ADR-008 entirely and carried no audit
task. Adding one that wrote `Customer.Viewed` would have been worse than the omission:
BR-9.11 makes reading the *audit log* the single deliberate exception, and auditing
profile views would fill the table with page views until the rows that matter after an
incident were unfindable — which is the exact purpose `IX_AuditLog_NotSuccess` exists to
serve.

**Rejected.**

| Alternative | Why not |
|---|---|
| Audit every read | The audit table becomes a web log. BR-9.1 draws the line at state changes for this reason |
| Make the query an `ICommand` so it participates in the pipeline uniformly | It would then be required to be `IAuditableCommand` by NFR-10, and it would open a transaction for a read. Uniformity bought by lying about what the operation is |
| Say nothing, since there is nothing to audit | Then the next reviewer cannot tell the difference between "decided" and "forgotten", which is the entire reason this file exists |

---

## R-7 — `404` or `400` for an id that is not a GUID?

**Question.** The screen spec's Action 1 lists both `404` (unknown) and `400` (malformed
id) as distinct failures. ASP.NET Core makes it easy to accidentally have only one.

**Checked.** Minimal-API route parameter binding — a `Guid id` parameter that fails to
parse produces a `400` before the handler runs. A `{id:guid}` route constraint instead
makes the request match **no route**, producing a `404`. `docs/sdd/05-api-conventions.md`
— `400` is "malformed request or failed input validation", `404` is "the addressed
resource does not exist".

**Settled.** No route constraint. Bind `Guid id` and let binding produce the `400`
(AC-6), shaped as `ProblemDetails` by `002-error-contract`'s middleware.

The verification is that the body is `ProblemDetails` and not the framework's default
`400` — a `400` with the wrong body shape satisfies the status-code assertion and breaks
the client, and it is found by a user rather than a test unless the test looks at the
body.

**Rejected.**

| Alternative | Why not |
|---|---|
| `{id:guid}` constraint, accept `404` | A broken link and a deleted customer become indistinguishable, and the screen shows different things for each |
| Bind `string id` and validate with FluentValidation | A validator whose only rule re-implements `Guid.TryParse`, in a slice that otherwise needs no validator |

---

## R-8 — How is `recentTicketsTruncated` computed?

**Question.** The screen shows "see all" only when there is more to see. Where does that
boolean come from?

**Checked.** `ticketCounts.total` is already in the response, so the client *could*
compare it to 10. The contract's own principle that machine-readable behaviour should be
stated by the endpoint rather than derived by each client.

**Settled.** `Take(11)`, return 10, set the flag from whether an eleventh row came back.
No extra command.

**Rejected.**

| Alternative | Why not |
|---|---|
| A fourth `COUNT` command | A round trip to learn one boolean, and it breaks AC-4's count of three |
| Let the client compute `total > 10` | The truncation rule then lives in two places, and the endpoint stops being self-describing. Every client re-derives it, and one of them gets the boundary wrong |
| Return `null` for the flag when it does not apply | A tri-state boolean, for no reason |

---

## R-9 — Does the recent list exclude `Closed` and `Resolved` tickets?

**Question.** "Recent tickets" could plausibly mean "recent open work".

**Checked.** US-004's story text — "see a customer's tickets and recent interactions on
one screen, so that I have context before I respond". The screen spec's body region —
"the 10 most recent, newest first", with no filter named.

**Settled.** No status filter (AC-8). The purpose is context, and the ticket the customer
is calling back about is the one that was resolved last week. Filtering to open work would
hide precisely the thing the story exists to surface.

**Rejected.** Excluding `Closed`: it would make the recent list disagree with the counts
beside it, and a rail reading `Closed: 14` next to a list containing none of them looks
like a bug even when it is a deliberate filter.

---

## R-10 — Whose `customer` shape is in the response?

**Question.** Does the overview declare its own customer DTO, or reuse `008`'s?

**Checked.** `008`'s `GET /api/customers/{id}` response — the same fields the profile
strip renders. AC-13. The screen spec's contact strip — email, phone, company, since, plus
the name in the header and notes in the body.

**Settled.** Embed `008`'s `CustomerResponse` unchanged, including `version`
(AC-13). The cost is real and is stated in `plan.md`'s *Contract changes*: a change to
`008`'s shape is a change to this contract too, and must be recorded in both. That is
cheaper than the alternative.

**Rejected.** A slimmer overview-specific block: the strip needs the same fields either
way, so the "slimmer" version would be the same fields with a different type name — two
declarations of one shape, kept in step by hand, and the drift shows up as a strip that
renders differently depending on which call filled it.
