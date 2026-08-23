# US-006 — List and Filter Tickets

**Epic:** EPIC-002 · **Release:** 1 · **Depends on:** US-005

## Story

As a **Support Agent**,
I want to **filter the ticket list**,
so that **I can find what needs my attention without reading everything**.

## Business value

Once there are more than about thirty tickets, an unfiltered list is unusable and the
queue stops being worked in any deliberate order.

## Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | `GET /api/tickets` returns a paginated envelope with `items`, `page`, `pageSize`, `totalCount`, `totalPages` |
| AC-2 | Default sort is creation date descending (BR-7.1) |
| AC-3 | Default page size is 20; a request above 100 is clamped to 100, not rejected (BR-7.2) |
| AC-4 | Filters for status, priority, category, channel, assignee, customer, and escalated combine with AND (BR-7.3) |
| AC-5 | Repeated values for one filter combine with OR (BR-7.4) |
| AC-6 | `search` matches ticket number, subject, and customer name, case-insensitively (BR-7.5) |
| AC-7 | An empty result returns `200` with an empty array (BR-7.6) |
| AC-8 | An invalid filter value returns `400` naming the accepted values |
| AC-9 | The list does not issue a query per row — customer name and assignee name are projected in the same query |
| AC-10 | The UI shows loading, empty, and error states, and reflects the active filters in the URL |

## Rules referenced

BR-7.1 – BR-7.6

## Out of scope

Saved views, per-user default filters, CSV export, column configuration, infinite scroll.

## Notes

AC-9 is the performance criterion for this story. The natural implementation lazily
loads `Customer` per ticket and produces an N+1; a projection to a DTO avoids it.

This is the story to compress if time runs short: fewer filters still demonstrates the
flow, provided pagination and the envelope are correct.

## Definition of Done

`09-definition-of-done.md`
