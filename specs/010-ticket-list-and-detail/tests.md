# 010 — Test Evidence

**Backend implemented and run 2026-08-26.** Every command executed, every result pasted.

Scope, as trimmed by the product owner: **`GET /api/tickets` with paging.** No filters, no
search, no column sorting — `015`. No timeline or comments — `013`. Both screens belong to the
frontend lane; the detail read shipped in `009`.

---

## Build and tests

```text
$ dotnet build --no-incremental
Build succeeded.
    0 Warning(s)
    0 Error(s)

$ dotnet test
Passed!  - Failed: 0, Passed: 166, Skipped: 0, Total: 166 - Wasl.Domain.Tests.dll
Passed!  - Failed: 0, Passed:   8, Skipped: 0, Total:   8 - Wasl.Application.Tests.dll
Passed!  - Failed: 0, Passed:  89, Skipped: 0, Total:  89 - Wasl.Api.IntegrationTests.dll

$ dotnet test tests/Wasl.Api.IntegrationTests --filter GetTicketsTests
Passed!  - Failed: 0, Passed: 13, Total: 13
```

**263 tests, 263 passed, 0 skipped.** `010` added 13.

---

## Acceptance criteria

| AC | Verified by | Result |
|---|---|---|
| AC-1 | `The_list_returns_the_paged_envelope_and_the_documented_row` — the envelope's property names asserted as a **set**, so an extra field fails too | **Pass** |
| AC-2 | `The_default_sort_is_newest_first` | **Pass** |
| AC-3 | `Page_size_is_clamped_and_the_effective_value_is_echoed` (5 cases) + `A_page_below_one_is_clamped_to_the_first_page` (2) | **Pass** |
| AC-11 | `A_page_beyond_the_last_returns_an_empty_array_with_the_real_totals` | **Pass** |
| AC-12 | Same test as AC-1 — `customerName` comes back populated from the single projected query | **Pass** by construction. See Gaps: no test counts the SQL statements |
| AC-13 | The row's property names asserted as a set, plus every value including the two that were wrong | **Pass** |
| AC-17 – AC-20 | Shipped in `009` — the detail read, `allowedTransitions`, `404` for an unknown id, route constraint for a malformed one | **Pass** (`009`'s evidence) |
| AC-21 | `A_page_beyond_the_last_...` — `200`, empty `items`, real `totalCount` and `totalPages` | **Pass** |
| AC-22 | `Two_consecutive_pages_contain_each_row_exactly_once`, with the tie **forced** | **Pass, and could not be made to fail.** See below |
| AC-4 – AC-10, AC-14, AC-24 – AC-27 | — | **`015-ticket-filters-and-search`** |
| AC-15, AC-23 | — | Frontend lane |
| AC-16 | — | **`004-auth-and-roles`.** The endpoint is unauthenticated |

---

## The guard I could not prove bites

AC-22 is about a stable sort. `CreatedAtUtc` is `datetime2(3)`, and SQL Server guarantees **no**
order for tied rows — so without a tie-break the engine may place one row on two pages, or on
neither. The second is the dangerous half: a row silently missing from a list.

The handler orders by `CreatedAtUtc` then `Id`. Verifying that tie-break took three attempts and
the honest result is a partial one:

1. **First version created six tickets and passed with `ThenByDescending(Id)` removed.** Six HTTP
   requests are six scopes, so six distinct `IRequestTimestamp` values — the tie never arose. The
   test proved nothing it was written to prove, which is the same shape as `009`'s "a green
   filtered run is not evidence about the suite".
2. **Rewrote it to force the tie**, collapsing all six rows onto one `CreatedAtUtc` with
   parameterised SQL. (The first attempt at that used `ExecuteSqlRawAsync` with an interpolated
   id list and the EF1002 analyser refused it — correctly, even in a test: the habit formed here is
   the habit carried into `015`, which builds a query from user input.)
3. **Removed the tie-break again, with a real tie in place — and it still passed.** For six rows
   SQL Server happens to return them in clustered-key order, so the observed behaviour is stable
   even though the guarantee is not.

**So the tie-break stays, and it is defensive rather than demonstrated.** It is correct against
the documented behaviour of the engine — no order is promised for a tie — and this file says
plainly that no test in this suite fails without it. Proving it would need a data volume and a
plan shape that force a parallel or unordered scan, which is a performance-shaped test the
strategy document deliberately excludes.

Recorded rather than quietly kept, because a comment claiming a test protects something it does
not is worse than no comment.

---

## Two enum values were wrong, from `009`

Found while reading `010`'s frozen contract before writing the query:

```text
contracts/tickets-list-api.md
  items[].priority   Low | Normal | High | Critical
  items[].category   Billing | Technical | Account | General

009 shipped
  TicketPriority { Low, Normal, High, Urgent }
  TicketCategory { Technical, Billing, General, Complaint }
```

The blueprint agrees with the contract — `docs/sdd/03-domain-model.md` lines 368 and 370 state
both enums explicitly, and line 39–40 repeat them as column comments. **`009` was wrong, and it
was the same mistake as `CommunicationChannel` from the same cause:** written from a contract
example instead of from the line that defines the enum.

Corrected to `Critical` and `Account`, and the declaration order aligned to the blueprint's. No
data migration — the values are stored as strings and no row held either name.

**Why no test caught it:** `009`'s tests used `Technical` and `Billing`, which survived. A test
asserting a wrong value against a wrong enum passes. `010`'s row test now asserts `Critical` and
`Account` by name, against the contract rather than against the code.

---

## Gaps, each with a reason

| Gap | Reason |
|---|---|
| **AC-12 has no statement-count assertion** | The name comes back populated from one projected query, which proves the projection works — not that no second query ran. Counting SQL statements needs an interceptor in the test host; the shape that would regress it (loading rows then resolving names in a loop) is instead prevented by the projection being inside the `Select` |
| **`assigneeId` and `assigneeName` are always `null`** | `dbo.SupportUsers` does not exist. The contract already types both nullable for the unassigned case, so the shape is right and only the values are missing. `004` creates the table; `011` assigns |
| **AC-16 — no `401`** | `004-auth-and-roles` |
| **AC-15, AC-23 — the two screens** | Frontend lane, from the frozen contract and `FRONTEND-API-GUIDE.md` |
| **No filter or search parameters are accepted** | `015`. Accepting and ignoring them would be worse than rejecting the request: a client would filter, get everything, and believe the filter matched |
| **`totalCount` is a second round trip, not a window function** | Two simple queries the engine can cache beat one the provider may not translate. What the code does guarantee is that the count runs on the **unpaged** query — counting after `Take` would return at most the page size and make `totalPages` permanently 1 |
| **Deliberately untested** | Volume, index selectivity, and query plans. `docs/sdd/testing/test-strategy.md` excludes them, and AC-22 above is where that exclusion has a real cost |
