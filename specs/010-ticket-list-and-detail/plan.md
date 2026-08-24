# US-006 (read half) — Technical Plan

**Phase:** 2 · **Story:** US-006 · **Feature:** `010-ticket-list-and-detail` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

## Design Summary

One `IQueryable` over `dbo.Tickets`, projected straight to a flat response shape with
the customer and assignee names joined in, ordered and paged. The whole list is one
query written carefully. The detail is a second, narrower query plus a lookup into a
static map in the domain.

The original plan for US-006 said "the whole story is one query written carefully",
and that is still the right sentence. What changed is that the filter composition it
also described now lives in `015`, and this feature is the query with no predicate — the
part that has to be correct before any predicate is worth adding.

## Backend

Vertical slices over a thin domain core (ADR-010). There is no `Wasl.Application` and no
`Wasl.Infrastructure`; the original plan's `Application` and `API` layer rows are
re-homed into slices below.

| Location | Component | Responsibility |
|---|---|---|
| `Wasl.Domain/Tickets/` | `TicketStatusTransitions` | The static permitted-transition map from BR-1, with `PermittedFrom(status)`. Created here because `010` is the first feature that reads it (spec Q-2) |
| `Wasl.Api/Features/Tickets/ListTickets/` | `Endpoint` | Minimal-API `MapGet("/api/tickets")`. Binds, authorizes, delegates, maps to `200` |
| | `ListTicketsQuery` | `page`, `pageSize`. Nothing else in this feature — the filter properties arrive in `015` |
| | `ListTicketsHandler` | Counts, orders, pages, projects |
| | `ListTicketsValidator` | FluentValidation on the shape of `page` / `pageSize` |
| | `TicketListItemResponse` | The flat row, with `customerName` and `assigneeName` included |
| `Wasl.Api/Features/Tickets/GetTicket/` | `Endpoint` | `MapGet("/api/tickets/{id:guid}")` |
| | `GetTicketQuery` / `GetTicketHandler` | Single projection; throws `NotFoundException` when the id matches nothing |
| | `TicketDetailResponse` | Detail shape, including `allowedTransitions` and `version` |
| `Wasl.Api/Common/Persistence/Paging/` | `PagingParameters`, `PagedResult<T>` | **Reused from `008`.** Clamping lives in one place or it lives in several places that disagree |

No repository. `DbSet<Ticket>` is already one (ADR-010, constitution). Neither query here
is complex enough to earn a named query object — a single projection with two joins is
readable inline, and naming it would add a file whose only content is the `Select`. The
timeline union in `013` and the filter composition in `015` are the two that do earn one.

### The two guarantees, and how each is made structural

| Guarantee | Mechanism | What it fails as, if forgotten |
|---|---|---|
| One query per page, not one per row (AC-12) | Project directly to `TicketListItemResponse` inside the `Select`, so EF Core builds joins instead of lazy loads. Asserted by counting executed commands with a `DbCommandInterceptor` | A list that is fast on ten rows and unusable on a hundred. Invisible in every test that does not count queries |
| The client never re-implements the state machine (AC-18, AC-23, ADR-004) | The server projects `allowedTransitions` onto the detail response; the menu is a `map` over that array | Two copies of BR-1 that agree today. The drift is silent and surfaces as a `409` the UI offered the user |

### The sort, and the tie-breaker nobody writes down

BR-7.1 says `CreatedAtUtc` descending. That alone is **not a deterministic order**:
`datetime2(3)` has millisecond precision, a seeded fixture creates several tickets inside
one millisecond, and SQL Server is free to return ties in any order it likes on each
execution. The consequence is not a wrong sort — it is a row that appears on both page 1
and page 2, or on neither.

The order is therefore `ORDER BY CreatedAtUtc DESC, Id DESC`, and AC-22 is the test that
proves it. This is the single most likely silent defect in the feature: it passes every
review, passes every single-page test, and only shows up as "the list skipped one" from
a user who will not be able to reproduce it.

## Data Changes

Full detail in [`data-model.md`](data-model.md). In summary:

**Migration:** `AddTicketListSortIndex`

`dbo.Tickets`, `dbo.TicketNumberSeq`, `UX_Tickets_Number`, `IX_Tickets_Status_Created`,
`IX_Tickets_Customer`, and `IX_Tickets_Assignee` all exist from `009-create-ticket`.
This feature adds exactly one object:

| Added here | Query it serves |
|---|---|
| `IX_Tickets_CreatedAtUtc_Id` on `(CreatedAtUtc DESC, Id DESC)` | The default unfiltered list — AC-2 plus the AC-22 tie-breaker |

`docs/sdd/03-domain-model.md` justifies `IX_Tickets_Status_Created` as *"Default list
query"*. That is accurate for the **filtered** list in `015` and not for this one: with
no `WHERE Status = …` predicate, `Status` is a leading column the query does not
constrain, so the index cannot serve the ordering. Recorded rather than quietly worked
around — the blueprint row is describing `015`'s query under `010`'s name.

## API Contract

Frozen: [`contracts/tickets-list-api.md`](contracts/tickets-list-api.md).

| Method | Path | Request | Success | Failures |
|---|---|---|---|---|
| `GET` | `/api/tickets` | `?page&pageSize` | `200` + paged envelope | `400` malformed paging, `401` |
| `GET` | `/api/tickets/{id:guid}` | — | `200` + detail | `401`, `404` |

`015` extends the first of these with filter parameters and adds no new endpoint and no
new response field. That is why its contract file is written as an extension and says so
at the top.

### What the list deliberately does not carry

| Omitted from the row | Reason |
|---|---|
| `description` | Up to 4,000 characters × 100 rows is roughly 400 KB of payload nothing renders (`docs/sdd/design/screens/03-tickets-list.md` has no description column) |
| `version` | Nothing on the list mutates. `expectedVersion` is a detail-screen concern (ADR-006) |
| `allowedTransitions` | Nothing on the list acts (spec Q-5) |

The detail response **does** carry `version`, even though `010` never sends it back, so
that `011-assign-ticket` and `012-change-ticket-status` do not have to change the read
shape later. Same reasoning as `007`'s `201` body.

## Frontend

| Route | Component | Kind (ADR-011 §4) | Purpose |
|---|---|---|---|
| `/tickets` | `TicketListPage` | Route | Owns the list query; page and page size from the URL |
| — | `TicketTable` | Feature | Rows, column set, loading skeleton, both empty states, error |
| — | `TicketStatusBadge`, `TicketPriorityBadge` | Feature | Wrap the `Badge` primitive with the BR-1 colour map |
| — | `Pagination` | Primitive | Page buttons and rows-per-page |
| `/tickets/:id` | `TicketDetailPage` | Route | Owns the detail query |
| — | `TicketSummaryStrip`, `TicketRail`, `TicketSections` | Feature | Read-only rendering |
| — | `TicketActionMenu` | Feature | Renders **only** what `allowedTransitions` contains. In `010` the items are present and their handlers arrive in `011` / `012` |

Fetching at route level only, so there is no request waterfall (ADR-011 §4). No global
store: `page` and `pageSize` live in the URL, and everything else here is server state
that TanStack Query already owns (ADR-011 §1).

`page` and `pageSize` are in the URL in `010` even though AC-14 (filters in the URL)
belongs to `015`. Paging is shareable state by the same argument, and putting it anywhere
else first would mean `015` moving it.

Detail: [`frontend-spec.md`](frontend-spec.md). API surface:
[`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md).

## Localization Impact

| Item | Detail |
|---|---|
| New client strings | Page title, column headers, the two empty states, the error state and its retry, `Unassigned`, rows-per-page, and every enum display label for `TicketStatus`, `TicketPriority`, `TicketCategory`, and `CommunicationChannel` |
| New server messages | The malformed-paging validation message only. `010` authors no other human sentence |
| Plurals | **Not here.** The result-count summary is a counted noun and needs all six Arabic CLDR categories (BR-8.14), and it is part of the filter bar — it belongs to `015` |
| Direction-sensitive layout | A table plus a pagination control, and a detail screen with a side rail. Column order reverses, the pagination chevrons mirror, the rail moves to the inline-end |
| Not translated | Enum **values** on the wire, `TicketNumber` (Latin digits in both locales, BR-8.13), `traceId`, `ProblemDetails.type` |

The specific thing to check in Arabic: `TicketNumber` is `tabular-nums`, Latin digits,
and reads left-to-right inside a right-to-left row. Left to the browser it will be laid
out by the surrounding direction and the `TCK-` prefix will land on the wrong end. It
looks like a rendering bug and it is a missing `dir` on one cell.

## Test Strategy

| Level | Covered | Why here |
|---|---|---|
| Unit | `PagingParameters` clamping at 0, 1, 20, 100, 101, and 1000 | Pure arithmetic, wide input space, and the place an off-by-one hides |
| Unit | `TicketStatusTransitions` against all 36 cells of BR-1's matrix | Pure data. `012` re-covers the same 36 through the endpoint, which is enforcement, not the map |
| Integration | Envelope, default sort, clamping, empty result, page beyond the last | The envelope is HTTP-shaped and the clamp is observable only in the response |
| Integration | Executed-command count with 50 rows across two page sizes | AC-12. The only test that can catch an N+1 |
| Integration | Two tickets with an identical `CreatedAtUtc` across a page boundary | AC-22. Needs a real engine and a controlled `TimeProvider` |
| Integration | Detail shape, `allowedTransitions` per status, `404`, non-`Guid` path, `401` | AC-17 – AC-20 |
| Integration | An Arabic subject and customer name round-trip byte-identical | ADR-013 row 4. `varchar` would return `????` and look like a font problem |
| Frontend | Column set, loading skeleton, both empty states, error with `traceId`, action menu driven by a stubbed `allowedTransitions` including the empty array | AC-13, AC-15, AC-23 |

Against a real SQL Server through `Testcontainers.MsSql`. EF `InMemory` is not used
anywhere: it does not enforce constraints, and more to the point here, its query
translation is not the translation being tested.

Not tested: the mapping from a projection to a response record, which has no behaviour.

## Dependencies

| On | For |
|---|---|
| `009-create-ticket` | `dbo.Tickets`, the ticket entity, the number sequence, the three existing indexes |
| `008-customer-list-and-profile` | `PagingParameters` and `PagedResult<T>`. If `008` has not landed, they are created **there**, not duplicated here |
| `004-auth-and-roles` | The `401` path and `ICurrentUser` |
| `003-audit-trail` | The BR-9.2 row on the `401` path |
| `006-design-system` | Tokens, `Badge`, `Button`, `Input` for the preview and the screens |
| `002-error-contract` | `ProblemDetails` for `400`, `401`, `404` |

`011`, `012`, `013`, and `016` depend on **this** feature's detail screen, not the
reverse. `010` renders the action menu; they wire its items.

## Risks and Trade-offs

| Decision | Alternative | Why rejected |
|---|---|---|
| Projection to a flat response | Load entities with `Include` | The classic N+1 in this shape. AC-12 exists specifically to prevent it, and `Include` would pass every test that does not count queries |
| `ORDER BY CreatedAtUtc DESC, Id DESC` | `CreatedAtUtc DESC` alone | Non-deterministic across ties, so a row can appear twice or not at all across a page boundary. BR-7.1 does not say this and it is what BR-7.1 requires to be true |
| Page-based pagination | Cursor-based | Cursors are better for large or fast-changing sets and worse for a UI that shows page numbers and a total (`docs/sdd/design/screens/03-tickets-list.md` shows both) |
| `totalCount` as a second query | Window function in the same query | `docs/sdd/05-api-conventions.md` already decided this, and the count query is why AC-12 asserts a **constant** command count rather than exactly one |
| `allowedTransitions` on the detail only | On every list row | Nothing in `010` acts from the list, and a per-row transition set is a projection nobody reads (spec Q-5) |
| `TicketStatusTransitions` created here | Placeholder array until `012` | A screen whose action menu is knowingly wrong is worse than a map arriving one feature early. Its 36 cells are testable with no database |
| A new `(CreatedAtUtc DESC, Id DESC)` index | Reuse `IX_Tickets_Status_Created` | Its leading column is not constrained by this query, so it cannot serve the ordering. Naming it "Default list query" in the blueprint describes `015`, not `010` |
| No repository | `ITicketRepository` | `DbSet<Ticket>` is already one, and an interface with one implementation and no second in prospect is ceremony (ADR-010) |
| Detail returns `version` now | Add it in `011` | Changing a read shape after two clients consume it is a contract change; including one unused field is not |
| Sort control omitted from the screen | Rendered and disabled | A disabled control invites a bug report. The story excludes sorting; the screen spec should lose the icon (spec Q-3) |

## Files to Create or Change

```text
src/Wasl.Domain/Tickets/TicketStatusTransitions.cs
src/Wasl.Api/Features/Tickets/ListTickets/Endpoint.cs
src/Wasl.Api/Features/Tickets/ListTickets/ListTicketsQuery.cs
src/Wasl.Api/Features/Tickets/ListTickets/ListTicketsHandler.cs
src/Wasl.Api/Features/Tickets/ListTickets/ListTicketsValidator.cs
src/Wasl.Api/Features/Tickets/ListTickets/TicketListItemResponse.cs
src/Wasl.Api/Features/Tickets/GetTicket/Endpoint.cs
src/Wasl.Api/Features/Tickets/GetTicket/GetTicketQuery.cs
src/Wasl.Api/Features/Tickets/GetTicket/GetTicketHandler.cs
src/Wasl.Api/Features/Tickets/GetTicket/TicketDetailResponse.cs
src/Wasl.Api/Common/Persistence/Paging/PagingParameters.cs        (from 008 — reused)
src/Wasl.Api/Common/Persistence/Paging/PagedResult.cs             (from 008 — reused)
src/Wasl.Api/Common/Persistence/Migrations/*_AddTicketListSortIndex.cs
src/Wasl.Api/Common/Localization/Resources/*.resx                 (paging validation message)
src/wasl-web/src/features/tickets/api.ts
src/wasl-web/src/features/tickets/queries.ts
src/wasl-web/src/features/tickets/types.ts
src/wasl-web/src/features/tickets/TicketListPage.tsx
src/wasl-web/src/features/tickets/TicketTable.tsx
src/wasl-web/src/features/tickets/TicketStatusBadge.tsx
src/wasl-web/src/features/tickets/TicketPriorityBadge.tsx
src/wasl-web/src/features/tickets/TicketDetailPage.tsx
src/wasl-web/src/features/tickets/TicketSummaryStrip.tsx
src/wasl-web/src/features/tickets/TicketRail.tsx
src/wasl-web/src/features/tickets/TicketActionMenu.tsx
src/wasl-web/src/components/Pagination.tsx
src/wasl-web/src/locales/en/tickets.json
src/wasl-web/src/locales/ar/tickets.json
tests/Wasl.Domain.Tests/Tickets/TicketStatusTransitionsTests.cs
tests/Wasl.Api.IntegrationTests/Tickets/ListTicketsTests.cs
tests/Wasl.Api.IntegrationTests/Tickets/GetTicketTests.cs
tests/Wasl.Api.IntegrationTests/Common/CommandCountingInterceptor.cs
src/wasl-web/src/features/tickets/__tests__/TicketTable.test.tsx
src/wasl-web/src/features/tickets/__tests__/TicketActionMenu.test.tsx
```

`CommandCountingInterceptor` is test infrastructure, not production code, and it is
listed because AC-12 is unverifiable without it.

## Contract changes

First contract for this resource:
[`contracts/tickets-list-api.md`](contracts/tickets-list-api.md), frozen 2026-08-23.

Nothing existed before it, so nothing is broken. The heading stays even when empty — an
empty contract-changes section is the statement that the contract did not move.

One change is **already scheduled and is not a surprise**: `015` adds query parameters to
`GET /api/tickets`. It is additive — no field is removed, no field changes type, and a
client that sends none of them gets exactly this feature's behaviour. It is recorded in
[`../015-ticket-filters-and-search/contracts/tickets-filter-api.md`](../015-ticket-filters-and-search/contracts/tickets-filter-api.md)
as an extension rather than as an edit to this file, so `010`'s contract stays readable
as the thing `010` was reviewed against.

The frontend lane reads [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md) and may start as
soon as that file exists; it does not wait for `BE-010-03`.
