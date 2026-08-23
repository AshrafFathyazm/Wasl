# US-006 — Technical Plan

**Phase:** 2 · **Role:** Architecture · **Status:** Complete

## Design Summary

One composable `IQueryable` built from a filter object, projected to a list DTO,
paged, with the count taken from the same predicate. The whole story is one query
written carefully.

## Backend

| Layer | Component | Responsibility |
|---|---|---|
| Application | `ListTicketsQuery` | The filter object: nullable and collection-valued properties |
| Application | `ListTicketsHandler` | Composes predicates, counts, pages, projects |
| Application | `TicketFilterSpecification` | Predicate composition, isolated and unit-testable |
| Application | `TicketListItemDto` | The flat row shape, with customer and assignee names included |
| Application | `PagingParameters` | Reused from US-002 |
| API | `TicketsController.List` | Binds the query string, including repeated keys |

`TicketFilterSpecification` is separated so that predicate composition can be tested
without HTTP or a database, and so the handler stays readable. Seven optional filters
composed inline is where an accidental `&&` instead of `||` hides.

## Data Changes

None. `ix_tickets_status_created`, `ix_tickets_customer`, and `ix_tickets_assignee`
were created in US-005 and are named there against this story.

Search touches `TicketNumber` (indexed, but a leading-wildcard `ILIKE` will not use
it), `Subject` (not indexed), and the joined customer name. This is a sequential scan
and is correct at the expected volume; the limit is recorded rather than pre-solved
with an index nobody has measured a need for.

## API Contract

| Method | Path | Request | Success | Failures |
|---|---|---|---|---|
| `GET` | `/api/tickets` | `?page&pageSize&status*&priority*&category*&channel*&assignee&customerId&escalated&search` | `200` + paged envelope | `400` invalid value, `401` |

`status`, `priority`, `category`, and `channel` accept repeated keys. `assignee`
accepts a `Guid`, the literal `me`, or the literal `unassigned`.

Overloading `assignee` with two magic strings is a deliberate small ugliness. The
alternative — three separate parameters that are mutually exclusive — is worse to
document and worse to validate.

## Frontend

| Route | Component | Purpose |
|---|---|---|
| `/tickets` | `TicketListPage` | Filter bar, table, pagination |
| — | `TicketFilterBar` | Multi-select per dimension, plus search |
| — | `TicketTable` | Rows, empty state, loading skeleton |

Filter state is derived from the URL search params rather than held in component
state, so AC-14 falls out of the design instead of being bolted on. The query key is
the parsed filter object, so TanStack Query caches each filter combination naturally.

## Localization Impact

| Item | Detail |
|---|---|
| New client strings | Filter labels, multi-select placeholders, the clear-filters action, the empty state, and a count summary |
| New server messages | The invalid-filter-value message, listing accepted values |
| Plurals | The result count is a counted noun and needs all six Arabic categories (BR-8.14). This is the first place in the build where `_two`, `_few`, and `_many` actually matter |
| Direction-sensitive layout | A filter bar plus a table — the most RTL-sensitive screen in Release 1. Multi-select chips, sort indicators, and the pagination control all have a side |
| Not translated | Filter values in the query string are canonical enum values. `?status=Open` is `Open` in every locale |

The count summary is the specific thing to check: `t('tickets:resultCount', { count })`
rather than any form of concatenation. Concatenation here produces text that is wrong
in Arabic for most counts and looks fine to an English reviewer.

## Test Strategy

| Level | Covered | Why here |
|---|---|---|
| Unit | `TicketFilterSpecification` — each filter alone, AND across dimensions, OR within one | Pure predicate logic; the highest-risk part |
| Unit | `PagingParameters` clamping | Already covered in US-002; re-asserted here |
| Integration | Envelope, defaults, clamping, each filter, combinations, `me`, `unassigned`, search, pattern characters, empty result, `400` on invalid value | The query string binding and the SQL are both real risks |
| Integration | Executed-command count with 50 rows | AC-12 |
| Frontend | Filters reflected in the URL; empty and loading states | AC-14, AC-15 |

## Dependencies

US-005 (tickets exist), US-007 (assignee filter is meaningful), US-008 (status filter
is meaningful). Buildable before those land, but not demonstrable.

## Risks and Trade-offs

| Decision | Alternative | Why rejected |
|---|---|---|
| Projection to a flat DTO | Load entities with `Include` | The classic N+1 in this shape, and AC-12 exists specifically to prevent it |
| Predicate composition in its own class | Inline in the handler | Seven optional filters inline is where a wrong operator hides unnoticed |
| Repeated query-string keys for OR | Comma-separated values | Repeated keys are the standard convention and bind natively; comma-separation needs custom parsing and breaks on values containing commas |
| `assignee=me` resolved server-side | Client sends its own id | The client would need to know its user id, which means decoding the token in the browser |
| Page-based pagination | Cursor-based | Cursors are better for large or fast-changing sets and worse for a UI that shows page numbers and a total |
| Closed tickets included by default | Excluded by default | A hidden default filter is the kind of thing people spend an afternoon confused by |
| No search index | Trigram index on subject | Premature; no measurement suggests it is needed at this volume |

## Files to Create or Change

```text
src/Wasl.Application/Tickets/List/ListTicketsQuery.cs
src/Wasl.Application/Tickets/List/ListTicketsHandler.cs
src/Wasl.Application/Tickets/List/TicketFilterSpecification.cs
src/Wasl.Application/Tickets/TicketListItemDto.cs
src/Wasl.Api/Controllers/TicketsController.cs
src/wasl-web/src/features/tickets/TicketListPage.tsx
src/wasl-web/src/features/tickets/TicketFilterBar.tsx
src/wasl-web/src/features/tickets/TicketTable.tsx
src/wasl-web/src/features/tickets/useTicketFilters.ts
tests/Wasl.Application.Tests/Tickets/TicketFilterSpecificationTests.cs
tests/Wasl.Api.IntegrationTests/Tickets/ListTicketsTests.cs
```
