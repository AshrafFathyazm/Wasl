# US-002 — Technical Plan

**Phase:** 1 · **Story:** US-002 · **Feature:** `008-customer-list-and-profile` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

## Design Summary

Two read-only queries projected straight to DTOs. No aggregate loading, no tracking.
Search is a parameterised `LIKE` over three columns, with an **explicit** collation and
the term's `LIKE` metacharacters escaped before it reaches the database.

The original plan said "a parameterised `ILIKE`". SQL Server has no `ILIKE`; the
replacement is `LIKE` plus an explicit case-insensitive collation, and the difference is
not cosmetic — see `research.md` R-1.

## Backend

Two projects, vertical slices, minimal APIs (ADR-010). There is no `Wasl.Application`
and no `Wasl.Infrastructure`, so the original plan's layer column is replaced by the
slice that owns each piece.

| Slice / location | Component | Responsibility |
|---|---|---|
| `Features/Customers/GetCustomer` | `Endpoint` | Binds `Guid id`, delegates, maps `null` to `404` |
| `Features/Customers/GetCustomer` | `GetCustomerQuery` / `Handler` | Projects to `CustomerDetailResponse`; returns `null` for unknown |
| `Features/Customers/ListCustomers` | `Endpoint` | Binds the query string, delegates |
| `Features/Customers/ListCustomers` | `ListCustomersQuery` / `Handler` | Paging, clamping, search, `totalCount` |
| `Features/Customers/ListCustomers` | `Validator` | Rejects nothing outright — clamps instead (BR-7.2). Present to bound `search` length |
| `Common/Paging` | `PagedResult<T>` | The shared list envelope, matching `05-api-conventions.md` |
| `Wasl.Domain/Common` | `PagingParameters` | Clamping logic in one place, reused by `010` and `015` |
| `Common/Persistence/Configurations` | `CustomerConfiguration` | Gains `IX_Customers_FullName` |

`AsNoTracking` with a projection rather than loading the entity: nothing is being
mutated, so change tracking is pure cost, and the projection is what keeps AC-11 true.

### Why the queries are not commands

This is the first read path, so the asymmetry gets established here or it gets
established by accident later:

| Concern | Commands | Queries |
|---|---|---|
| `IAuditableCommand` (NFR-10) | Required — the architecture test fails the build without it | **Not applicable.** A query typed as `ICommand` by copy-paste fails the build with a message about auditing, which reads as an audit bug and is a typing mistake |
| Transaction behaviour | Opens one per request | **Must skip.** Wrapping a `GET` in a transaction holds locks for the duration of a read that changes nothing |
| Validation behaviour | Applies | Applies |
| Audit row | Exactly one (BR-9.1) | **None.** A read of a customer is not `Audit.Read`; that action is reading the audit log (BR-9.11) |

`BE-008-09` asserts the negative — no audit row after either `GET` — because "we did not
add auditing to the read path" is unverifiable by inspection once the pipeline is
generic.

### Why `PagingParameters` lives in `Wasl.Domain`

BR-7.2 is a numbered business rule, and the constitution puts rules in the domain, once.
It is pure C# with no package reference, so it does not compromise `Wasl.Domain`'s zero
dependencies, and it gets boundary tests in `tests/Wasl.Domain.Tests` with no host and
no container.

Rejected: putting it in `Wasl.Api/Common/Paging` alongside `PagedResult<T>`. It reads
more naturally as a transport concern, but then its boundary tests live in
`Wasl.Api.IntegrationTests`, which owns the SQL Server container fixture — pure-logic
tests behind a container start is the wrong trade. `PagedResult<T>` **does** stay in
`Wasl.Api/Common/Paging`: it is the wire envelope, not a rule.

## Data Changes

Full detail in [`data-model.md`](data-model.md).

**Migration:** `AddCustomerFullNameIndex`

`IX_Customers_FullName` is created **here**, not in `007`. `007`'s `data-model.md`
deferred it on purpose, under the no-speculative-indexes rule: the index arrives with the
query that needs it, and that query is in this feature.

The honest part, kept from the original plan and now stated more precisely:

> Search covers email and phone as well as name. The filtered unique indexes on those
> columns do not serve a leading-wildcard match, so the **search predicate** is a scan.
> At the expected data volume that is correct; full-text search would be premature. The
> limit is recorded rather than pre-solved.

So why create the index at all, if the search will not use it? Because the index serves
the **other** half of the query:

| Part of the list query | Uses `IX_Customers_FullName`? |
|---|---|
| `WHERE FullName LIKE '%term%'` | No. A leading wildcard cannot seek |
| `ORDER BY FullName, Id` — every unsearched page, which is the default view | **Yes.** This is the named query that earns the index |

Without it, the default `/customers` page sorts the whole table on every request. That
is the query-to-index justification the Definition of Done asks for, and it is a better
one than "search".

## API Contract

Frozen: [`contracts/customers-read-api.md`](contracts/customers-read-api.md).

| Method | Path | Request | Success | Failures |
|---|---|---|---|---|
| `GET` | `/api/customers/{id}` | — | `200` + customer | `400` malformed, `401`, `404` |
| `GET` | `/api/customers` | `?page&pageSize&search` | `200` + paged envelope | `400`, `401` |

There is **no `403`** on either endpoint: BR-6 permits both roles to view a customer.
Recorded so the missing `403` reads as the authorization matrix rather than an omission.

### The malformed identifier, and where it silently goes wrong

AC-3 wants `400`. Three implementations, and two of them are wrong in a way no compiler
catches:

| Implementation | What a malformed id actually returns |
|---|---|
| `MapGet("/customers/{id:guid}")` | **`404`** — the route does not match, so the request never reaches the endpoint. AC-3 fails, and it fails looking like correct not-found behaviour |
| `MapGet("/customers/{id}")` with a `Guid id` parameter | `400`, but from minimal-API binding, **with no `ProblemDetails` body**. A client branching on `type` gets `undefined` |
| No route constraint, plus a `BadHttpRequestException` → `errors/validation` mapping in the shared middleware | `400` with the same shape as every other validation failure |

The third is chosen, and the mapping goes in `002-error-contract`'s middleware rather
than in this endpoint, because it then covers every `Guid` route parameter in the system
without anyone remembering. This feature owns the **first** such parameter, so it is
where the mapping is proven (`BE-008-02`, `TEST-008-03`).

Rejected: binding `string id` and calling `Guid.TryParse` in the endpoint. It works, it
is explicit, and it has to be repeated in every future endpoint with an id — which is
the definition of a rule that depends on being remembered.

## Frontend

| Route | Component | Purpose |
|---|---|---|
| `/customers` | `CustomerListPage` | Search box, table, pagination. Route-level fetch |
| `/customers/:id` | `CustomerProfilePage` | Read-only profile. Route-level fetch |
| — | `CustomerTable` | Feature component; receives rows as props |
| — | `CustomerSearchInput` | Debounced, 300 ms |

Search text lives in the URL query string, so a result set can be shared and the back
button behaves (ADR-011 §2). `CustomerPicker` in `009` reuses the same query hook.

The profile is built against `GET /api/customers/{id}`. The screen file
(`07-customer-profile.md`) shows its load calling `/api/customers/{id}/overview` — that
is US-004's endpoint, arriving with `018`. The route and the layout do not change then;
only the query does. Stated so `018` is a query swap and not a rediscovery.

## Localization Impact

| Item | Detail |
|---|---|
| New client strings | Column headings, the search placeholder, pagination controls, both empty states, the not-found state |
| New server messages | None. `404` reuses the shared not-found message; the malformed-id `400` reuses the shared validation message |
| Direction-sensitive layout | A table. Column order reverses under RTL, and the pagination controls must sit on the correct side — the highest-risk layout in this story |
| Formatting | `createdAtUtc` rendered through `formatters.ts` in the active locale, Gregorian calendar, Latin digits (BR-8.13) |
| User content | Customer names and company in the result rows carry `dir="auto"` |
| Does **not** mirror | Email and phone. An E.164 number rendered right-to-left is unreadable and un-diallable |

Search matches Arabic literally, without normalising hamza, alef, or ta marbuta. That
is a real gap for Arabic names and it is recorded, with the intended fix, in
`11-open-questions.md` Q-7 and again under **Known limitation** in
[`spec.md`](spec.md) — with the second half the original did not spell out: for a
customer who has a phone and no email, BR-4 does not catch the resulting duplicate
either.

## Test Strategy

| Level | Covered | Why here |
|---|---|---|
| Unit | `PagingParameters` clamping | Pure logic, several boundaries, no host |
| Integration | `200`, `404`, `400`, paging defaults and clamps, search across all three fields, pattern characters, empty result, page beyond last | The contract is HTTP-shaped, and AC-8 needs a real database |
| Integration | Executed-command count for the list query | AC-11 |
| Integration | Full traversal with duplicate names at `pageSize=1` | AC-15. A non-total order is invisible on one page |
| Integration | Generated SQL contains an explicit `COLLATE` | AC-16. White-box on purpose — see below |
| Integration | No audit row is written by either `GET`; one row for the `401` (BR-9.2) | The negative is the part that rots |
| Frontend | Loading, error, not-found, and empty states | The states most often skipped |

AC-16's test asserts on the generated SQL rather than on a result, and that is a
deliberate trade: a behavioural test for case-insensitivity passes on a
`CI_AS` server whether the collation is explicit or accidental. The assertion that
distinguishes the two is the one that reads the SQL. Recorded as white-box rather than
disguised as behaviour.

## Dependencies

`001` (schema, `DbContext`, harness), `002` (the `ProblemDetails` middleware this
feature extends with the binding-failure mapping), `004` (authentication for AC-14),
`005` (catalogues), `006` (primitives), `007` (the `Customer` aggregate and rows to read).

## Risks and Trade-offs

| Decision | Alternative | Why rejected |
|---|---|---|
| Projection with `AsNoTracking` | Load the entity and map | Change tracking on a read path is wasted work and invites accidental writes |
| `LIKE` substring search | Full-text search (`CONTAINS`) | Premature at this data volume, and it needs a full-text catalogue in the migration and in every test container. The limit is documented instead |
| Explicit `COLLATE` in the predicate | Rely on the database's default collation | It works on a `CI_AS` server and fails on a `CS_AS` one, with no test failure anywhere near the change. AC-16 exists because of this |
| Escape the term in C# as `[%]`, `[_]`, `[[]` | `LIKE … ESCAPE '\'` | Bracket escaping needs only the two-argument `EF.Functions.Like`, so it does not depend on an overload whose existence has to be confirmed first (constitution VI) |
| Search across three fields in one parameter | Separate parameters per field | One box is how people actually search; three would be used as one anyway |
| `totalCount` on every request | Omit it, or return it only on page 1 | The UI shows a count. If it becomes a measured bottleneck, that goes in an ADR before it is removed (`05-api-conventions.md`) |
| Empty result is `200` | `404` | An empty set is a valid answer to a valid question (BR-7.6) |
| `ORDER BY FullName, Id` | `ORDER BY FullName` alone | Names are not unique (BR-4.6). Without the tiebreaker, `OFFSET`/`FETCH` may return a row twice or never — AC-15 |
| No route constraint plus a middleware mapping | `{id:guid}` | The constraint turns AC-3's `400` into a `404` that looks correct |
| `IX_Customers_FullName` created here | Created in `007` | It serves this feature's `ORDER BY`. `007` deferred it deliberately |

## Files to Create or Change

```text
src/Wasl.Domain/Common/PagingParameters.cs
src/Wasl.Api/Common/Paging/PagedResult.cs
src/Wasl.Api/Features/Customers/GetCustomer/Endpoint.cs
src/Wasl.Api/Features/Customers/GetCustomer/GetCustomerQuery.cs
src/Wasl.Api/Features/Customers/GetCustomer/Handler.cs
src/Wasl.Api/Features/Customers/GetCustomer/CustomerDetailResponse.cs
src/Wasl.Api/Features/Customers/ListCustomers/Endpoint.cs
src/Wasl.Api/Features/Customers/ListCustomers/ListCustomersQuery.cs
src/Wasl.Api/Features/Customers/ListCustomers/Handler.cs
src/Wasl.Api/Features/Customers/ListCustomers/Validator.cs
src/Wasl.Api/Features/Customers/ListCustomers/CustomerListItem.cs
src/Wasl.Api/Features/Customers/ListCustomers/CustomerSearch.cs          escaping + collation, one caller
src/Wasl.Api/Common/Persistence/Configurations/CustomerConfiguration.cs  index added
src/Wasl.Api/Common/Persistence/Migrations/*_AddCustomerFullNameIndex.cs
src/Wasl.Api/Common/Errors/ProblemDetailsMiddleware.cs                   binding-failure mapping added
src/wasl-web/src/features/customers/CustomerListPage.tsx
src/wasl-web/src/features/customers/CustomerProfilePage.tsx
src/wasl-web/src/features/customers/CustomerTable.tsx
src/wasl-web/src/features/customers/CustomerSearchInput.tsx
src/wasl-web/src/features/customers/queries.ts
src/wasl-web/src/features/customers/api.ts
src/wasl-web/src/features/customers/types.ts                             provisional, then generated
src/wasl-web/src/lib/formatters.ts                                       date formatting, if 006 did not add it
tests/Wasl.Domain.Tests/Common/PagingParametersTests.cs
tests/Wasl.Api.IntegrationTests/Customers/GetCustomerTests.cs
tests/Wasl.Api.IntegrationTests/Customers/ListCustomersTests.cs
tests/Wasl.Api.IntegrationTests/Customers/CustomerSearchEscapingTests.cs
src/wasl-web/src/features/customers/__tests__/CustomerListPage.test.tsx
src/wasl-web/src/features/customers/__tests__/CustomerProfilePage.test.tsx
```

The original file list named `src/Wasl.Application/...`, `src/Wasl.Infrastructure/...`,
`CustomersController.cs`, and `tests/Wasl.Application.Tests/...`. None of those projects
or shapes exist under ADR-010; the list above is the same work in the accepted layout.

## Contract changes

First read contract for this resource:
[`contracts/customers-read-api.md`](contracts/customers-read-api.md), frozen 2026-08-23.

One thing worth naming rather than discovering in TypeScript: `007`'s `201` body and
this feature's `200` body are **not the same shape**. The detail response adds
`updatedAtUtc`; the list item omits `notes` and `version`. Three named types, not one
reused three ways:

| Type | Where | Why it differs |
|---|---|---|
| `CustomerResponse` | `007`, the `201` body | Frozen. Not changed here |
| `CustomerDetailResponse` | `GET /api/customers/{id}` | Adds `updatedAtUtc`, which `017` needs and which the profile's "Since"/"Updated" strip reads |
| `CustomerListItem` | `GET /api/customers` | Omits `notes` (2000 characters × 20 rows of payload nothing renders) and `version` (nothing on a list mutates) |

`007`'s contract is not reopened by this feature. The heading stays even when there is
nothing under it — an empty contract-changes section is the statement that the contract
did not move.

The frontend lane reads [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md) and may start
as soon as that file exists; it does not wait for `BE-008-05`.
