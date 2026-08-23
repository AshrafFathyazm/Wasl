# US-002 — Technical Plan

**Phase:** 2 · **Role:** Architecture · **Status:** Complete

## Design Summary

Two read-only queries projected straight to DTOs. No aggregate loading, no tracking.
Search is a parameterised `ILIKE` over three columns.

## Backend

| Layer | Component | Responsibility |
|---|---|---|
| Application | `GetCustomerByIdQuery` / `Handler` | Projects to `CustomerDto`; returns null for unknown |
| Application | `ListCustomersQuery` / `Handler` | Paging, clamping, search, `totalCount` |
| Application | `PagedResult<T>` | The shared list envelope |
| Application | `PagingParameters` | Clamping logic in one place, reused by US-006 |
| API | `CustomersController.GetById`, `.List` | Bind, delegate, map null to `404` |

`AsNoTracking` with a projection rather than loading the entity: nothing is being
mutated, so change tracking is pure cost, and the projection is what keeps AC-11
true.

## Data Changes

None. `ix_customers_fullname` was created in US-001.

Search covers email and phone as well as name. The filtered unique indexes on those
columns do not serve a leading-wildcard `ILIKE`, so the search is a sequential scan.
At the expected data volume that is correct; a trigram index would be premature. The
limit is recorded rather than pre-solved.

## API Contract

| Method | Path | Request | Success | Failures |
|---|---|---|---|---|
| `GET` | `/api/customers/{id}` | — | `200` + customer | `400` malformed, `401`, `404` |
| `GET` | `/api/customers` | `?page&pageSize&search` | `200` + paged envelope | `400`, `401` |

## Frontend

| Route | Component | Purpose |
|---|---|---|
| `/customers` | `CustomerListPage` | Search box, table, pagination |
| `/customers/:id` | `CustomerProfilePage` | Read-only profile |
| — | `CustomerSearchInput` | Debounced, 300 ms |

Search text lives in the URL query string, so a result set can be shared and the back
button behaves. `CustomerPicker` in US-005 reuses the same query hook.

## Localization Impact

| Item | Detail |
|---|---|
| New client strings | Column headings, the search placeholder, pagination controls, the empty state, the not-found state |
| New server messages | None; `404` reuses the shared not-found message |
| Direction-sensitive layout | A table. Column order reverses under RTL, and the pagination controls must sit on the correct side — the highest-risk layout in this story |
| Formatting | `CreatedAtUtc` rendered through `formatters.ts` in the active locale |
| User content | Customer names in the result rows carry `dir="auto"` |

Search matches Arabic literally, without normalising hamza, alef, or ta marbuta. That
is a real gap for Arabic names and it is recorded, with the intended fix, in
`11-open-questions.md` Q-7 rather than quietly ignored.

## Test Strategy

| Level | Covered | Why here |
|---|---|---|
| Unit | `PagingParameters` clamping | Pure logic, several boundaries |
| Integration | `200`, `404`, `400`, paging defaults and clamps, search across all three fields, pattern characters, empty result, page beyond last | The contract is HTTP-shaped, and AC-8 needs a real database |
| Integration | Executed-command count for the list query | AC-11 |
| Frontend | Loading, error, not-found, and empty states | The states most often skipped |

## Dependencies

US-001.

## Risks and Trade-offs

| Decision | Alternative | Why rejected |
|---|---|---|
| Projection with `AsNoTracking` | Load the entity and map | Change tracking on a read path is wasted work and invites accidental writes |
| `ILIKE` substring search | Full-text or trigram index | Premature at this data volume; the limit is documented instead |
| Search across three fields in one parameter | Separate parameters per field | One box is how people actually search; three would be used as one anyway |
| `totalCount` on every request | Omit it, or return it only on page 1 | The UI shows a count. If it becomes a measured bottleneck, that goes in an ADR before it is removed |
| Empty result is `200` | `404` | An empty set is a valid answer to a valid question (BR-7.6) |

## Files to Create or Change

```text
src/Wasl.Application/Customers/GetById/GetCustomerByIdQuery.cs
src/Wasl.Application/Customers/List/ListCustomersQuery.cs
src/Wasl.Application/Common/PagedResult.cs
src/Wasl.Application/Common/PagingParameters.cs
src/Wasl.Api/Controllers/CustomersController.cs
src/wasl-web/src/features/customers/CustomerListPage.tsx
src/wasl-web/src/features/customers/CustomerProfilePage.tsx
src/wasl-web/src/features/customers/CustomerSearchInput.tsx
src/wasl-web/src/features/customers/queries.ts
tests/Wasl.Application.Tests/Common/PagingParametersTests.cs
tests/Wasl.Api.IntegrationTests/Customers/GetCustomerTests.cs
tests/Wasl.Api.IntegrationTests/Customers/ListCustomersTests.cs
```
