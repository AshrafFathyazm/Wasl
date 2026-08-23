# US-006 — Specification

**Phase:** 1 · **Role:** Specification · **Status:** Complete

## Understanding

Past about thirty tickets, an unfiltered list stops being a work queue and becomes a
wall. This story turns the ticket collection into something a person can navigate:
paginated, filtered on the dimensions the team actually routes on, and searchable by
the identifiers people quote to each other.

## In Scope

Paginated list; filters on status, priority, category, channel, assignee, customer,
and escalated; free-text search; the list screen with filters reflected in the URL.

## Out of Scope

| Excluded | Reason |
|---|---|
| Saved views and per-user defaults | No requirement; needs a preferences store |
| CSV export | No requirement |
| Column configuration | No requirement |
| Infinite scroll | Page-based pagination is simpler to verify and to explain |
| Sort other than creation date | No requirement; adding one is a parameter, not a redesign |
| Full-text ranking | Substring matching is sufficient at this scale |

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | Every support user may see every ticket | If visibility is scoped by team, the query grows a mandatory filter and BR-6 grows a row |
| A-2 | Filters combine with AND across dimensions and OR within one | The usual expectation; anything else needs a query language |
| A-3 | Creation date descending is the right default | Most recent first is what a queue view generally means |

## Open Questions

| # | Question | Working assumption |
|---|---|---|
| Q-1 | Should closed tickets be excluded by default? | No. An invisible default filter is confusing, and a "hide closed" toggle is discoverable while a hidden default is not |
| Q-2 | Should `assignee=me` be supported as a shorthand? | Yes, resolved server-side from the token, because it is the single most common filter and the client should not have to know its own id |

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | `GET /api/tickets` returns the standard paged envelope |
| AC-2 | Default sort is creation date descending (BR-7.1) |
| AC-3 | Default page size is 20; above 100 is clamped to 100, not rejected (BR-7.2) |
| AC-4 | Filters for status, priority, category, channel, assignee, customer, and escalated combine with AND (BR-7.3) |
| AC-5 | A repeated filter combines with OR: `status=Open&status=InProgress` (BR-7.4) |
| AC-6 | `search` matches ticket number, subject, and customer name, case-insensitively (BR-7.5) |
| AC-7 | A search term containing `%`, `_`, or a quote is treated as literal text |
| AC-8 | `assignee=me` resolves to the caller from the token |
| AC-9 | `assignee=unassigned` returns tickets with no assignee |
| AC-10 | An invalid filter value returns `400` listing the accepted values |
| AC-11 | No results returns `200` with an empty array (BR-7.6) |
| AC-12 | The list query issues no query per row; customer and assignee names are projected in the same query |
| AC-13 | Each row shows ticket number, subject, customer name, status, priority, channel, assignee, escalated flag, and creation date |
| AC-14 | Active filters are reflected in the URL and survive a reload |
| AC-15 | The screen shows loading, empty, and error states |
| AC-16 | An unauthenticated request returns `401` |

## Edge Cases

From `testing/edge-cases.md`: no results, page beyond the last, `page=0`, `pageSize`
above the maximum and at zero, several filters combined, one filter repeated, search
containing pattern characters, unknown enum value, API unreachable.

Specific to this story:

| Case | Expected |
|---|---|
| Filter on an assignee id that does not exist | `200` with an empty array. A filter is a question, and "none" is a valid answer |
| `escalated=false` | Returns non-escalated tickets, not all tickets |
| Search term matching a ticket number exactly | That ticket appears; the search is a substring match, not an exact-match shortcut |

## Rules Referenced

BR-7.1 – BR-7.6, BR-6
