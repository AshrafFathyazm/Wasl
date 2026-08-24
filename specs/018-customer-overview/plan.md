# US-004 — Technical Plan

**Phase:** 5 · **Story:** US-004 · **Feature:** `018-customer-overview` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

## Design Summary

One read endpoint, one slice, one named query object, three database commands. The
customer profile is read by primary key; the counts come from a single `GROUP BY Status`
projected onto the full BR-1 status set so that a status with no rows still appears at
zero; the recent tickets come from one ordered, capped, projected read. Nothing is
tracked, nothing is `Include`d, and the number of commands is asserted rather than
hoped for.

## Backend

Two projects, one slice. ADR-010.

| Where | Component | Responsibility |
|---|---|---|
| `Wasl.Domain/Tickets/` | `TicketStatus` enum | Already exists. This feature **reads** the status set to build the zero-filled count map; it does not define or extend it |
| **The slice** — `Wasl.Api/Features/Customers/GetCustomerOverview/` | `Endpoint.cs` | One minimal-API `MapGet`. Binds `Guid id`, authorizes, sends the query, maps `null` to `404` and a result to `200`. Nothing else |
| | `Query.cs` | `GetCustomerOverviewQuery(Guid CustomerId)` — an `IQuery`, deliberately **not** an `ICommand` (see *Audit*, below) |
| | `Handler.cs` | Calls the query object, assembles `Response`. No business logic, because there is none to have |
| | `CustomerOverviewQuery.cs` | The named query object. Three reads, `AsNoTracking`, projected straight to DTO shapes. One caller, no interface |
| | `Response.cs` | `CustomerOverviewResponse` — `customer`, `ticketCounts`, `recentTickets`, `recentTicketsTruncated` |
| `Wasl.Api/Common/Persistence/` | — | **No change.** No new configuration, no new entity, no new column |

There is deliberately **no `Validator.cs`** in this slice. The only input is a route
parameter, and minimal-API parameter binding already rejects a value that is not a GUID
(AC-6). A FluentValidation class here would exist to match the shape of other slices and
would validate nothing — which is worse than its absence, because the next reader assumes
it is doing something.

### Why a query object and not a repository

`CustomerOverviewQuery` has exactly one caller and no interface. `ICustomerRepository`
with `GetOverviewAsync` would be an abstraction over `DbSet<T>`, which is already one.
Per the constitution: no new abstraction without a second implementation in hand or in
prospect.

### The three commands, and the two ways they silently become more

| # | Command | Shape |
|---|---|---|
| 1 | Profile | `Customers.AsNoTracking().Where(c => c.Id == id).Select(→ CustomerResponse).FirstOrDefaultAsync(ct)` |
| 2 | Counts | `Tickets.AsNoTracking().Where(t => t.CustomerId == id).GroupBy(t => t.Status).Select(g => new { g.Key, Count = g.Count() }).ToListAsync(ct)` |
| 3 | Recent | `Tickets.AsNoTracking().Where(t => t.CustomerId == id).OrderByDescending(t => t.CreatedAtUtc).ThenByDescending(t => t.Id).Take(11).Select(→ RecentTicketResponse).ToListAsync(ct)` |

`Take(11)` rather than `Take(10)`: the eleventh row is read and discarded solely to
answer `recentTicketsTruncated` (AC-9). The alternative is a fourth command — a `COUNT`
— to learn a boolean, and a boolean is not worth a round trip. The eleventh row is
dropped in the handler, never serialised.

Two failure modes here do not throw, do not fail a build, and get worse as data grows:

1. **`Include(c => c.Tickets)` on the profile read.** It compiles, it returns correct
   counts, and it loads every ticket the customer has ever had into memory to count
   them. On a demo database it is invisible. This is the exact defect AC-4 exists to
   catch, and the reason the assertion is a *command count* and not a stopwatch.
2. **A projected `AssignedToUser.FullName` written as a navigation walk on a tracked
   entity** instead of inside the `Select`. EF Core will happily issue one query per row
   for it. `recentTickets` carries `assignedToName`, so this is a live risk, not a
   hypothetical one. The projection is written inside the `Select` for that reason.

Both are why `TEST-018-03` asserts **exactly three** commands rather than "not many".
An upper bound of ten passes for a per-status implementation (1 + 6 = 7).

### Ordering: why the tie-break is not optional

`ORDER BY CreatedAtUtc DESC` alone is not a total order. `datetime2(3)` truncates to
milliseconds — a seed script, a test loop, or a bulk import creates several tickets in
the same millisecond routinely. Without a tie-break, SQL Server may return those rows in
any order, and it may return a different order on the next execution. Two visible
consequences: a flaky `TEST-018-04`, and a UI whose ticket list quietly reshuffles on
every refetch.

**Migration note.** The blueprint was written against PostgreSQL, where `timestamptz`
carries microsecond precision and the collision is rarer — rare enough to look like it
was not a problem. ADR-013 moved to `datetime2(3)` and made it common. `ThenByDescending(t => t.Id)`
is the fix, and it is in AC-2 rather than left to review.

### Audit — and why there is no `IAuditableCommand` here

This is the one place where "add the audit task" resolves to a documented **no**.

| BR | Applies here? | What is done |
|---|---|---|
| BR-9.1 — every state change writes a row | No state changes | Nothing. `AC-11` asserts the absence |
| BR-9.3 — the row is in the change's transaction | No transaction is opened | The transaction behaviour keys on `ICommand`; an `IQuery` does not open one |
| BR-9.2 / BR-9.4 — a `401` or `403` writes a row, outside any transaction | The `401` path exists | `BE-018-10` asserts one `Auth.Unauthenticated` row. There is **no `403` path** — BR-6 permits both roles to view a customer |
| BR-9.11 — reading the audit log is itself audited as `Audit.Read` | Not this endpoint | Deliberate contrast: the forensic log is audited on read; a customer overview is not. If reading a customer were audited, the audit table would be dominated by page views and the interesting rows would be unfindable |
| NFR-10 — the architecture test requires every `ICommand` to be `IAuditableCommand` | Satisfied vacuously | This slice contributes no `ICommand`. `BE-018-09` asserts that, so a later refactor that turns the query into a command cannot slip past the rule |

**Migration note.** The original artifacts predate ADR-008, so they carried no audit
obligation at all. Rather than adding a task that would be wrong, the obligation is
discharged in three places: `AC-11` (no row on success), `AC-10` / `BE-018-10` (one row
on the `401`, outside a transaction), and `BE-018-09` (the type stays an `IQuery`, so the
architecture test keeps holding). An audit *decision* recorded is worth more than an
audit task invented — but the decision has to be recorded, and it was not.

## Data Changes

Full detail in [`data-model.md`](data-model.md). In summary: **no table, no column, no
constraint.**

**Migration:** `AddTicketsCustomerIndex` — and it may legitimately be empty.

| Object | Status |
|---|---|
| `dbo.Customers`, `dbo.Tickets` | Already exist (`001`, `009`). Untouched |
| `IX_Tickets_Customer` | Named in `docs/sdd/03-domain-model.md` with the reason "Customer overview" — this query. Created here **if absent**, per Q-1 |

`IX_Tickets_Customer` serves commands 2 and 3 above: both filter on `CustomerId` and
nothing else. Without it, each is a scan of `dbo.Tickets` — twice per profile view, on
the table that grows fastest in the product. `AC-17` records the actual plan rather than
asserting the index exists and assuming it is used; an index that exists but is not
chosen looks exactly like an index that works.

## API Contract

Frozen in [`contracts/customer-overview-api.md`](contracts/customer-overview-api.md).

| Method | Path | Request | Success | Failures |
|---|---|---|---|---|
| `GET` | `/api/customers/{id}/overview` | Route parameter only | `200` with `customer` + `ticketCounts` + `recentTickets` + `recentTicketsTruncated` | `400` malformed id, `401`, `404` unknown customer |

Notably **absent**: `403`. BR-6 permits both roles, and an endpoint documented with a
status code it never returns teaches the client to handle a branch that will never be
exercised.

### Why `400` and not `404` for a malformed id

The route is mapped as `{id}` with a `Guid id` parameter and **no `:guid` route
constraint**. A route constraint would make `/api/customers/abc/overview` fail to match
any route, producing a `404` — indistinguishable from a real unknown customer. The
screen distinguishes them: `404` is "this customer does not exist", `400` is "this link
is broken". Minimal-API binding failure gives `400`, and `002-error-contract`'s middleware
shapes it as `ProblemDetails` (AC-6). The verification is that the body is
`ProblemDetails` and not the framework's default — a `400` with the wrong body shape is
the failure that gets found by a client, not by a test.

## Frontend

**This feature adds no route.** `/customers/:id` already exists from `008`. What changes
is what it reads and what it renders.

| Route | Component | Change |
|---|---|---|
| `/customers/:id` | `CustomerProfilePage` | Existing route component. Its query moves from `GET /api/customers/{id}` to `GET /api/customers/{id}/overview` |
| — | `CustomerTicketRail` | New feature component. Total plus one row per status, zeros included |
| — | `CustomerTicketsSection` | New feature component. Up to 10 rows, empty state, "see all" |
| — | `Badge`, `Button`, `Card` | Primitives from `006` |

Fetching stays at the route level (ADR-011 §4). The rail and the section receive data as
props; neither fetches. Making the rail fetch its own counts would reintroduce the
request waterfall that a composition endpoint exists to remove.

### The query-key change is the dangerous part

`008` reads `['customer', id]`. After this feature the profile screen reads
`['customer', id, 'overview']`. Any `invalidateQueries` call written against the old key
— `017-update-customer` invalidates the profile after a save — will still succeed, still
return no error, and no longer refresh the screen it was written to refresh. The user
saves an edit and the strip shows the old value until a hard reload.

`FE-018-06` exists solely to sweep every invalidation target, and `REV-018-01` checks it.
This is the one thing in the feature that fails silently in a way a test for *this*
feature would not catch, because the broken behaviour lives in `017`.

### States

Every state on the screen, with its source, is in [`frontend-spec.md`](frontend-spec.md).
The one worth naming here: **empty is not an error.** A customer with no tickets is
normal and common — every customer has zero tickets for the minute between being created
and having one raised. The rail renders `0` in every row rather than collapsing, and the
tickets section renders a title, a sentence, and the create-ticket action. A section that
renders nothing at all is indistinguishable from a section that failed to load.

## Localization Impact

| Item | Detail |
|---|---|
| New client strings | Section heading, the rail total label, the six status labels (already in the `tickets` namespace from `010` — reused, not re-added), the empty-state title/body/CTA, the "see all" link, the notes empty state, the not-found and error states, the inactive chip |
| New server messages | **None.** The only server-authored strings are the `404` and `400` `ProblemDetails`, both already in `002`/`005`'s catalogues |
| Counted noun | The ticket total is a count, so it uses plural keys with all six CLDR categories (BR-8.14), never `count + " tickets"` |
| Direction-sensitive layout | The rail moves to the inline-end in Arabic. Logical properties only, so this is free rather than a second stylesheet |
| Stays left-to-right in an RTL layout | Email, phone, `ticketNumber`, and timestamps. An E.164 number rendered right-to-left is unusable, and `TCK-2026-000042` reversed is not a ticket number (BR-8.13) |
| User content | `fullName`, `companyName`, `notes`, and every ticket `subject` carry `dir="auto"` |
| Not translated | `byStatus` keys, `status` values, `ticketNumber`, `traceId`, `ProblemDetails.type` (BR-8.7) |

## Test Strategy

| Level | Covered | Why here |
|---|---|---|
| Unit | Zero-filling the status map from the grouped result; the truncation boolean from an 11-row read | Both are pure transformations over a list and are the two places the shape is actually decided. Cheap to cover exhaustively, and neither needs a database |
| Integration | The full response shape, the zero-ticket case, the cap and the ordering tie-break, the truncation boundary at 10 and 11, `404`, `400`, `401`, both roles, an inactive customer, Arabic round-trip | The contract is HTTP-shaped, and half of these are only real against a database that enforces types and returns rows in an engine-chosen order |
| Integration | **The executed-command count (AC-4)** | The whole engineering point of the feature. A `DbCommandInterceptor` in the test harness counts commands for one request and asserts exactly three. Testcontainers.MsSql, never EF `InMemory` — `InMemory` does not produce SQL at all, so there is nothing to count |
| Manual, recorded | The actual execution plan for commands 2 and 3 (AC-17) | A plan is an observation, not an assertion. It is recorded in `tests.md` once, with the index name it seeks |
| Frontend | Empty state, loading skeleton, not-found, error, the truncation link, and the Arabic pass | The empty state is the highest-value frontend test in this feature — it is the common case and the one that looks broken when wrong |

Deliberately not tested: the mapping from the query result to the response DTO field by
field, which has no behaviour beyond assignment; and `IX_Tickets_Customer`'s effect on
latency, which would be a measurement of the container, not of the code.

## Dependencies

| Must land first | Why |
|---|---|
| `008-customer-list-and-profile` | The screen, the route, and the `customer` block's shape (A-3) |
| `009-create-ticket` | `dbo.Tickets` and the ticket entity |
| `010-ticket-list-and-detail` | The ticket row projection this reuses, and `/tickets/:id` for the row link |
| `012-change-ticket-status` | The full BR-1 status set actually being reachable, so the counts are meaningful |
| `002`, `004`, `005`, `006` | Error contract, auth, localization, primitives |

`015-ticket-filters-and-search` is **not** a dependency, but see Q-1: the two features
overlap on one index, and `015` is first out in the cut order.

## Risks and Trade-offs

| Decision | Alternative | Why rejected |
|---|---|---|
| One composition endpoint | The client calls `GET /customers/{id}` and `GET /tickets?customerId=…` and derives the counts | The counts are not derivable from one page of tickets — a customer with 40 tickets would need every page fetched to count them. It is also the request waterfall ADR-011 §4 exists to prevent |
| One composition endpoint | Six calls, one per status, plus the profile and the list | Eight round trips for one screen, and every one of them a chance for a partial render |
| One grouped query, projected onto the full status set | One `COUNT` per status | Seven commands where three will do, and it grows with the enum. This is the implementation AC-4 was written to fail |
| One grouped query, projected onto the full status set | Return only the statuses that have rows and let the client fill the gaps | The client would then own a rule about which statuses exist — a second place the BR-1 status set is written down, and the one that goes stale when a status is added |
| `Take(11)` to compute `recentTicketsTruncated` | A fourth `COUNT` command | A round trip to learn one boolean |
| `Take(11)` to compute `recentTicketsTruncated` | Return the total count and let the client compare it to 10 | The total is already returned, so the client *could* — but then the truncation rule lives in two places, and the endpoint's own contract stops being self-describing |
| Assert **exactly** three commands | Assert "fewer than ten" | An upper bound of ten passes a per-status implementation (1 + 6 = 7). Exactness means any change to the query plan is a deliberate edit to the test, which is the point |
| Embed `008`'s customer shape | A slimmer overview-specific customer block | Two shapes for one entity, kept in step by hand. The strip on the screen needs the same fields either way |
| No `:guid` route constraint | Constrain the route and accept `404` for a malformed id | A broken link and a deleted customer would be indistinguishable, and the screen shows different things for each |
| No audit row on a successful read | Audit reads too | The audit table would be dominated by page views. BR-9.1 draws the line at state changes, and BR-9.11 makes the one deliberate exception |
| Ten, fixed in the contract | A `limit` query parameter | A second pagination surface over rows `/tickets` already pages, plus an argument about the maximum |

## Files to Create or Change

```text
src/Wasl.Api/Features/Customers/GetCustomerOverview/Endpoint.cs
src/Wasl.Api/Features/Customers/GetCustomerOverview/Query.cs
src/Wasl.Api/Features/Customers/GetCustomerOverview/Handler.cs
src/Wasl.Api/Features/Customers/GetCustomerOverview/CustomerOverviewQuery.cs
src/Wasl.Api/Features/Customers/GetCustomerOverview/Response.cs
src/Wasl.Api/Migrations/*_AddTicketsCustomerIndex.cs          (may be empty — see Q-1)

src/wasl-web/src/features/customers/api.ts                    (add the overview fetcher)
src/wasl-web/src/features/customers/queries.ts                (add useCustomerOverview; retire the old profile key)
src/wasl-web/src/features/customers/types.ts                  (provisional types, then generated)
src/wasl-web/src/features/customers/CustomerProfilePage.tsx   (change: switch data source, mount rail + section)
src/wasl-web/src/features/customers/CustomerTicketRail.tsx
src/wasl-web/src/features/customers/CustomerTicketsSection.tsx
src/wasl-web/src/features/customers/CustomerTicketsEmpty.tsx
src/wasl-web/src/locales/en/customers.json                    (change)
src/wasl-web/src/locales/ar/customers.json                    (change)

tests/Wasl.Api.IntegrationTests/Customers/GetCustomerOverviewTests.cs
tests/Wasl.Api.IntegrationTests/Customers/GetCustomerOverviewQueryCountTests.cs
tests/Wasl.Api.IntegrationTests/Infrastructure/CommandCountingInterceptor.cs
tests/Wasl.Domain.Tests/Customers/TicketCountMapTests.cs
src/wasl-web/src/features/customers/__tests__/CustomerTicketsSection.test.tsx
src/wasl-web/src/features/customers/__tests__/CustomerProfilePage.states.test.tsx
```

Anything that invalidates `['customer', id]` in another feature's folder is also in
scope for `FE-018-06`. It cannot be enumerated here, because it depends on which of
`015`/`016`/`017` has landed — which is why it is a sweep with a review check behind it
rather than a file list.

## Contract changes

First contract for this endpoint:
[`contracts/customer-overview-api.md`](contracts/customer-overview-api.md), frozen
2026-08-23.

It **embeds** a shape owned elsewhere: the `customer` block is `008`'s
`CustomerResponse` (A-3, AC-13). A change to that shape is therefore a change to this
contract, and has to be recorded here as well as in `008`. That is the cost of not
duplicating it, and it is the cheaper of the two costs.

Nothing else existed before this, so nothing is broken. The heading stays even when
empty — an empty contract-changes section is the statement that the contract did not
move.

The frontend lane reads [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md) and may start
as soon as that file exists; it does not wait for `BE-018-05`.
