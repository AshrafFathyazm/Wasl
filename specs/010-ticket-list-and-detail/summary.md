# 010 — Summary

**Backend implemented 2026-08-26. 263 tests, 263 passed, 0 warnings** — 13 new. Evidence in
[tests.md](tests.md).

Short by instruction: the evidence file carries the detail and the deadline is Wednesday.

## What was built

| Where | What |
|---|---|
| `Wasl.Application/Common/` | `PagedResult<T>` with `TotalPages` derived · `Paging` — BR-7.2's clamping in one place |
| `Wasl.Application/Common/Abstractions/` | `ToListAsync` and `CountAsync` on `IApplicationDbContext` |
| `Wasl.Application/Features/Tickets/GetTickets/` | Query · Handler · `TicketListItem` |
| `Wasl.Api/Controllers/` | `GET /api/tickets?page=&pageSize=` |

Scope trimmed on instruction: paging only. Filters, search and column sorting are `015`;
timeline and comments are `013`; the detail read shipped in `009`; both screens are the frontend
lane's.

## Trade-offs

**`totalCount` is a second query, not a window function.** Two simple statements the engine can
cache beat one the provider may not translate. The guarantee that matters is that the count runs
on the **unpaged** query — after `Take` it would return at most the page size and make
`totalPages` permanently 1, which looks like a working pager until page 2.

**The customer name is a correlated subquery inside the projection.** One statement, and an
unassigned or name-less row still comes back — the contract calls it a left join. The alternative
is a query per row, which passes at ten tickets and times out at ten thousand.

**Clamped, never rejected** (BR-7.2), and the response echoes the **effective** values. Echoing
the request instead would leave a client computing pages from a number the server ignored.

**`assigneeId` and `assigneeName` are always null.** `dbo.SupportUsers` does not exist. The
contract already types both nullable for the unassigned case, so the shape is right.

## Deviations

| Deviation | Why |
|---|---|
| **`TicketPriority.Urgent` → `Critical`, `TicketCategory.Complaint` → `Account`**, and both declaration orders aligned to the blueprint | `009` shipped two invented values. `docs/sdd/03-domain-model.md` lines 368 and 370 state both enums, and `010`'s frozen contract repeats them. Same mistake as `CommunicationChannel`, same cause. No data migration — stored as strings, no row held either name |
| `ToListAsync` and `CountAsync` added to `IApplicationDbContext` | `009` deliberately declared only what it used. `010` is the first feature that lists |
| AC-22's tie-break is defensive, not demonstrated | See below |

## The guard that could not be proved

AC-22 asks for a stable sort. The handler orders by `CreatedAtUtc` then `Id`, and **no test in
the suite fails without the tie-break** — even after forcing six rows onto one timestamp, SQL
Server returned them in clustered-key order. The tie-break is correct against the engine's
documented behaviour (no order is promised for a tie) and unproven at this data volume.
`tests.md` records all three attempts, including the first version that passed for the wrong
reason.

## Known limitations

| Limitation | Owner |
|---|---|
| No `401` | `004-auth-and-roles` |
| Assignee id and name always null | `004` creates `SupportUsers`; `011` assigns |
| No filters, no search, no column sorting | `015-ticket-filters-and-search` |
| Both screens | Frontend lane, from the frozen contract |
| AC-12 proven by the projection, not by counting statements | Would need a statement-counting interceptor in the test host |
| AC-22's tie-break unproven | Needs a volume and plan shape the test strategy excludes |

## What the next feature inherits

- **`015`** — `PagedResult<T>`, `Paging`'s clamping, and a query with one place to add a `Where`
- **`011`** — the version-check pattern from `012`, and `TicketHistoryEventType.Assigned`
- **`004`** — one endpoint to attribute and two null columns to fill
- **The frontend lane** — a paged envelope identical in shape to every future list
