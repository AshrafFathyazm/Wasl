# US-006 (filter half) — Specification

**Phase:** 5 · **Story:** US-006 · **Feature:** `015-ticket-filters-and-search` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

## Understanding

Past about thirty tickets, an unfiltered list stops being a work queue and becomes a wall.
`010-ticket-list-and-detail` made the collection visible and navigable by page. **This
feature makes it navigable by question:** filter on the dimensions the team actually routes
on, and search by the identifiers people quote to each other.

It is also the feature the delivery plan cuts first. `docs/sdd/08-board.md`'s compression
order puts *"US-006 filters, reduced to a plain paginated list"* at position 1, with the
reason that the flow still demonstrates end to end without it. So this specification is
written to be **droppable without leaving a hole**: `010` is complete on its own, this
feature adds only query parameters and a filter bar, and nothing in `010` has to change when
it lands or when it does not.

## Why US-006 is two features

`docs/sdd/08-board.md` is the instruction: the list is not droppable and the filters are the
first thing to go, and a feature that is half critical and half droppable makes "is it done?"
unanswerable.

### The acceptance-criteria split — auditable, exhaustive, disjoint

Every criterion in the source story lands in exactly one feature. None is dropped and none
appears in both. **This table is identical to the one in
[`../010-ticket-list-and-detail/spec.md`](../010-ticket-list-and-detail/spec.md); if the two
ever disagree, that is a defect in one of them.**

| AC | Criterion (abbreviated) | Lands in |
|---|---|---|
| AC-1 | Standard paged envelope | `010` |
| AC-2 | Default sort `CreatedAtUtc` descending (BR-7.1) | `010` |
| AC-3 | Page size defaults to 20, clamps at 100 (BR-7.2) | `010` |
| AC-4 | Seven filters combine with AND (BR-7.3) | **015** |
| AC-5 | A repeated filter combines with OR (BR-7.4) | **015** |
| AC-6 | `search` across number, subject, customer name (BR-7.5) | **015** |
| AC-7 | `%`, `_`, and a quote in a search term are literal | **015** |
| AC-8 | `assignee=me` resolves from the token | **015** |
| AC-9 | `assignee=unassigned` | **015** |
| AC-10 | Invalid filter value → `400` listing accepted values | **015** |
| AC-11 | No results → `200` with an empty array (BR-7.6) | `010` |
| AC-12 | No query per row; names projected in the same query | `010` |
| AC-13 | Row columns | `010` |
| AC-14 | Active filters in the URL, surviving a reload | **015** |
| AC-15 | Loading, empty, and error states on the screen | `010` |
| AC-16 | Unauthenticated → `401` | `010` |

AC-14 belongs here, as the board's split note requires: the URL *is* the filter state
container (ADR-011 §2), so it is meaningless without filters.

AC-15 is `010`'s because `010` builds the screen and its three states. The two states that
only exist once filtering exists — "no matches" as distinct from "no tickets", and the
invalid-filter message — are **new criteria here**, not a second claim on AC-15.

### New criteria, and why the ranges are disjoint

New criteria are numbered from AC-17 upward in **disjoint ranges**, so a citation from
another feature is never ambiguous about which folder it means:

| Range | Owner |
|---|---|
| AC-17 – AC-23 | `010-ticket-list-and-detail` |
| **AC-24 – AC-27** | **`015-ticket-filters-and-search`** |

Three of this feature's four new criteria exist because the engine changed. AC-7 was written
against PostgreSQL and is **incomplete on SQL Server** — see AC-24.

## In Scope

- Filtering `GET /api/tickets` on status, priority, category, channel, assignee, customer,
  and escalated — AND across fields, OR within a field
- `assignee=me` and `assignee=unassigned`, resolved server-side
- Free-text `search` across ticket number, subject, and customer name
- `400` listing the accepted values for an invalid filter value
- The filter bar, the search box, and the status tabs on `/tickets`
- **The URL as the state container**, and therefore as the TanStack Query key
- The "no matches" empty state, distinct from "no tickets"
- The result count, with correct Arabic plural forms

## Out of Scope

| Excluded | Reason |
|---|---|
| The list itself, its envelope, its sort, its pagination, its detail view | `010`. This feature adds parameters to an endpoint that already works |
| Saved views and per-user default filters | No requirement; needs a preferences store |
| CSV export | No requirement |
| Column configuration | No requirement |
| Infinite scroll | Page-based pagination is simpler to verify and to explain, and it is already built in `010` |
| Sort other than creation date | No requirement; adding one is a parameter, not a redesign. The screen spec draws a control for it anyway — see `010`'s Q-3 |
| Full-text ranking, relevance ordering | Substring matching is sufficient at this scale. The limit is recorded in `research.md` R-4 rather than pre-solved |
| Status counts on the tabs | Q-3 below. No endpoint provides the aggregate, and inventing one is a new requirement |
| A date-range filter | Not in BR-7.3's list. The seven named filters are the scope |
| Filter presets shared between users | No requirement; the URL already makes a filtered view a shareable link |

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | Every support user may see every ticket (BR-6), so no filter is mandatory | If visibility is scoped by team, the query grows a mandatory predicate, BR-6 grows a row, and the endpoint acquires a `403` path with a BR-9.2 audit row attached |
| A-2 | Filters combine with AND across dimensions and OR within one | The usual expectation (BR-7.3, BR-7.4); anything else needs a query language |
| A-3 | `010-ticket-list-and-detail` has landed | This feature is additive to it. Built before it, there is nothing to filter |
| A-4 | `011-assign-ticket` has landed, so `GET /api/support-users` exists | Without it the assignee filter has no picker and degrades to `me` / `unassigned` plus a typed id. The API is unaffected |
| A-5 | Substring matching is sufficient at the expected volume — low hundreds of tickets | If the real volume is orders of magnitude larger, `research.md` R-4's limit needs measuring rather than accepting |
| A-6 | `Subject`, `TicketNumber`, and `Customers.FullName` carry a case-insensitive collation | This is what makes AC-6 true. SQL Server has no `ILIKE`; case-insensitivity **is** the collation, and a case-sensitive column would make the search silently miss matches (`research.md` R-2) |

## Open Questions

| # | Question | Working assumption |
|---|---|---|
| Q-1 | Should closed tickets be excluded by default? | **No.** An invisible default filter is confusing, and a "hide closed" toggle is discoverable while a hidden default is not. Carried unchanged from the source story |
| Q-2 | Should `assignee=me` be supported as a shorthand? | **Yes**, resolved server-side from the token, because it is the single most common filter and the client should not have to know its own id. Carried unchanged |
| Q-3 | `docs/sdd/design/screens/03-tickets-list.md` draws status tabs with counts — `All 128 │ ● Open 41 │ …`. No endpoint provides those counts | **Tabs are rendered as filter shortcuts without counts.** Producing them needs either a new aggregate endpoint or extra fields on the list envelope, and both are new requirements. A tab without a count still does its main job, which is a one-click status filter. Flagged because a reviewer comparing the screen to the screen spec will notice |
| Q-4 | Should an empty filter array — `?status=` — mean "no filter" or "match nothing"? | **No filter.** A trailing `&status=` from a form serialiser is common, and translating it to `WHERE Status IN ()` returns zero rows for a user who filtered nothing. See `research.md` R-9 — this is the highest-risk silent defect in the feature |
| Q-5 | Should `search` also match the description? | **No.** BR-7.5 names three fields and description is 4,000 characters of free text; including it would make every search a scan of the largest column in the table and would surface tickets whose *subject* looks unrelated. Recorded because it is the obvious next request |
| Q-6 | Is `customerId` or `customer` the parameter name? | **`customerId`.** The source spec says "customer" in prose and the source plan's contract table says `customerId`. The value is a `Guid`, so the name should say so — and `customer` would suggest a name search, which is what `search` is for |

## Acceptance Criteria

Numbers are preserved from the source story. Gaps in the sequence are criteria owned by
`010` — see the split table above.

| # | Criterion |
|---|---|
| AC-4 | Filters for status, priority, category, channel, assignee, customer, and escalated combine with AND (BR-7.3) |
| AC-5 | A repeated filter combines with OR: `status=Open&status=InProgress` (BR-7.4) |
| AC-6 | `search` matches ticket number, subject, and customer name, case-insensitively (BR-7.5) |
| AC-7 | A search term containing `%`, `_`, or a quote is treated as literal text |
| AC-8 | `assignee=me` resolves to the caller from the token |
| AC-9 | `assignee=unassigned` returns tickets with no assignee |
| AC-10 | An invalid filter value returns `400` listing the accepted values |
| AC-14 | Active filters are reflected in the URL and survive a reload |
| AC-24 | A search term containing `[` is treated as literal text. T-SQL's `LIKE` treats `[` as a character-class opener; PostgreSQL's does not, so AC-7's list was complete on the original engine and is not on this one (ADR-013) |
| AC-25 | "No matches" is a **different** state from "no tickets": a different message, plus a `Clear filters` action. A filtered query returning nothing never renders the create-a-ticket empty state |
| AC-26 | Filter values in the URL and on the wire are canonical enum values, identical in every locale. `?status=Open` is `Open` in Arabic (BR-8.7) |
| AC-27 | The result count uses plural forms for all six Arabic CLDR categories and is never built by concatenation (BR-8.14) |

## Edge Cases

From `docs/sdd/testing/edge-cases.md`: several filters combined, one filter repeated, a
search containing pattern characters, an unknown enum value, no results, API unreachable.

Specific to this feature:

| Case | Expected |
|---|---|
| Filter on an assignee id that does not exist | `200` with an empty array. A filter is a question, and "none" is a valid answer — not `404` and not `400` |
| `escalated=false` | Returns **non-escalated** tickets, not all tickets. The parameter binds as a nullable bool: absent means "any", `false` means "not escalated" |
| Search term matching a ticket number exactly | That ticket appears. The search is a substring match, not an exact-match shortcut, so `TCK-2026-000042` and `042` both find it |
| `?status=` — the parameter present and empty | Treated as no filter (Q-4). Not `WHERE Status IN ()`, which returns nothing for a user who filtered nothing |
| `?status=Open&status=Open` | Same as `?status=Open`. A duplicate value is a set, not a multiplier |
| `?status=Open&status=Bogus` | `400` naming `status` and listing all six accepted values. One bad value invalidates the parameter; silently dropping it would answer a different question from the one asked |
| `?status=open` (lower case) | Q-6-adjacent and decided: **accepted.** Enum parsing is case-insensitive, and the canonical form is what goes back in the URL. Rejecting a case variant of a correct value is a worse failure than normalising it |
| A search term of a single character | Accepted. The screen debounces at 300ms and requires at least one character; one character is a legitimate, slow query |
| A search term of 500 characters | Accepted and matches nothing. It is capped at the length of the longest searchable column rather than rejected |
| A search term that is only `%` | Matches nothing, because it is escaped to a literal `%` (AC-7). It does **not** match everything |
| Every filter set at once, plus a search | One query, one `WHERE`, still two commands (the count and the page). Filtering adds no round trip |
| `assignee=me` for a user with no tickets | `200`, empty array, and the "no matches" state |
| `assignee=me` with no token | `401` — `010`'s AC-16 path, unchanged |
| Filters set, then the browser Back button | The previous filter set is restored, because the URL is the state (AC-14) |
| A filtered URL pasted by another user | Renders the same filtered view. This is a consequence of AC-14 and is the main reason it is worth having |

## Rules Referenced

BR-6 (list is permitted for both roles, so no filter is mandatory), BR-7.3, BR-7.4, BR-7.5,
BR-7.6 (inherited from `010` — an empty filtered result is `200`), BR-8.7 (enum values in the
query string are untranslated), BR-8.11, BR-8.14 (the result count).

### On the audit obligation

**This feature contains no state-changing command.** It adds query parameters to a read.
BR-9.1 and BR-9.3 therefore have nothing to attach to, and the NFR-10 architecture test has
no `IAuditableCommand` here to assert against. Written down because "no audit task" is
otherwise indistinguishable from "audit task forgotten".

What applies, and what does not:

| Rule | Applies? | Why |
|---|---|---|
| BR-9.1, BR-9.3 — one row per state change, in-transaction | **No** | Nothing changes state |
| BR-9.2 — every `401` and `403` writes a row | **Yes, already covered.** `BE-010-09` proves it on this endpoint, and adding parameters does not add a path | |
| BR-9.4 — a denied action's row is written outside any transaction | Same row, same test | |
| A `400` for an invalid filter value | **Not an audit event.** BR-9.2 covers authentication and authorization events; a malformed query is neither | |
| A `403` path | **Does not exist.** BR-6 grants list access to both roles. If A-1 turns out to be wrong, a `403` appears and brings its own row |

`REV-015-02` re-checks all five rows before the feature closes, because each of them
becoming false is a blocking finding rather than a note.
