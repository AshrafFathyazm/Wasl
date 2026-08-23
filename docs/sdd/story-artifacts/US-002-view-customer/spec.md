# US-002 — Specification

**Phase:** 1 · **Role:** Specification · **Status:** Complete

## Understanding

Before raising a ticket, an agent needs to find the customer and confirm it is the
right one. Search is the preventive half of the duplicate rule from US-001: most
duplicates are created by someone who could not find the record that already existed.

## In Scope

Retrieve one customer by id; paginated list with a free-text search across name,
email, and phone; profile screen; loading, error, not-found, and empty states.

## Out of Scope

| Excluded | Reason |
|---|---|
| Tickets on the profile | US-004 |
| Editing | US-003 |
| Fuzzy or phonetic matching | No requirement; exact substring matching is sufficient at this scale, and fuzzy matching without ranking is worse than none |
| Result ranking | No requirement |
| Column configuration, export | No requirement |

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | Case-insensitive substring matching is enough | At tens of thousands of rows this needs a trigram or full-text index; noted as a scaling limit |
| A-2 | Every support user may see every customer | If visibility is scoped by team, this becomes a filtered query and BR-6 grows a row |

## Open Questions

| # | Question | Working assumption |
|---|---|---|
| Q-1 | Should inactive customers appear in search? | No, unless `includeInactive=true` is passed. Deactivation is not in this release, so the parameter is specified but unused |

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | `GET /api/customers/{id}` returns name, contact details, company, notes, timestamps, and `version` |
| AC-2 | An unknown id returns `404` with the standard error contract |
| AC-3 | A malformed id returns `400`, not `500` |
| AC-4 | `GET /api/customers` returns the standard paginated envelope |
| AC-5 | Default page is 1 and default page size 20; a page size above 100 is clamped to 100 (BR-7.2) |
| AC-6 | `page=0` or negative is clamped to 1 |
| AC-7 | `search` matches name, email, and phone, case-insensitively, as a substring |
| AC-8 | A search term containing `%`, `_`, or a quote is treated as literal text |
| AC-9 | No results returns `200` with an empty array and a `totalCount` of zero (BR-7.6) |
| AC-10 | A page beyond the last returns `200` with an empty array and the correct `totalCount` |
| AC-11 | The list query does not issue a query per row |
| AC-12 | The profile screen distinguishes loading, error, and not-found |
| AC-13 | The list screen shows an empty state, not a bare table header |
| AC-14 | An unauthenticated request returns `401` |

## Edge Cases

From `testing/edge-cases.md`: unknown id, malformed id, no results, page beyond the
last, `page=0`, `pageSize` above the maximum and at zero, search containing pattern
characters, API unreachable, API slow.

## Rules Referenced

BR-7.2, BR-7.5, BR-7.6, BR-6
