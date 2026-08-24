# US-004 — Specification

**Phase:** 5 · **Story:** US-004 · **Feature:** `018-customer-overview` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

## Understanding

A support agent opening a customer needs three things at once: who this is, how much
support history there is, and what the last few tickets were about. Today those three
things live behind three different calls, and an agent who has to click twice before
answering the phone will simply not do it.

This feature adds one endpoint — `GET /api/customers/{id}/overview` — returning the
customer profile, ticket counts broken down by status, and the ten most recent tickets,
in a single response. It also replaces the profile screen's data source: the screen
already exists (`008-customer-list-and-profile`, screen
[`07-customer-profile`](../../docs/sdd/design/screens/07-customer-profile.md)); this
feature gives it the rail and the tickets section, and switches the one call it makes.

Nothing new is written. Nothing new is stored. **There is no new table, no new column,
and no state change anywhere in this feature** — which is why its risk is concentrated
in exactly one place: the shape of the query.

### Why this is in Release 2, and not Release 1

Because it composes data that other features already expose, and composition is the
cheapest thing on the board.

| Piece of the response | Already produced by |
|---|---|
| The customer profile block | `008-customer-list-and-profile` — `GET /api/customers/{id}` |
| Ticket rows | `010-ticket-list-and-detail` — the ticket list projection |
| The ticket status set | `012-change-ticket-status` — the BR-1 statuses |
| The screen it lands on | `008` — `/customers/:id` already routes and renders |

Every one of those is a Release 1 commitment. If Release 1 ships and this does not, an
agent can still reach a customer, still reach that customer's tickets through
`/tickets?customerId=…`, and still do the job — one click worse. That is the definition
of droppable, and it is why `specs/README.md` puts this fourth in the Phase 5 cut order
and `docs/sdd/08-board.md` records it as "a composition of data the other stories
already expose".

Cheap is not the same as free. The one genuinely new piece of engineering here is **the
cost of the composition**: the naive implementation issues one `COUNT` per status, then
one query per ticket row to resolve its assignee, and it works perfectly on a demo
database with four tickets. AC-4 exists so that this is caught by a failing test rather
than by a reviewer noticing — which is precisely what the story's own notes asked for.

## In Scope

- `GET /api/customers/{id}/overview` returning profile + counts-by-status + the 10 most
  recent tickets in one response
- Counts produced by a single grouped query, projected to include every BR-1 status,
  including the ones with no tickets
- A bounded, asserted database-command count for the whole request
- The rail (total plus per-status breakdown) and the tickets section on the existing
  customer profile screen
- The zero-ticket empty state, on the rail and in the tickets section
- The "see all" affordance when the customer has more than 10 tickets
- Switching the profile screen's query from `GET /api/customers/{id}` to the overview
  endpoint, and repointing every cache invalidation that targeted the old key

## Out of Scope

| Excluded | Reason |
|---|---|
| A cross-channel interaction feed | Explicitly out of scope in US-004. There is no interaction entity in `docs/sdd/03-domain-model.md` to feed it, and `021` is where a channel abstraction would land |
| Activity charts and trend lines | Explicitly out of scope in US-004. `020-dashboard` owns aggregate visualisation |
| Customer-level SLA figures | Explicitly out of scope in US-004. There is no SLA engine in the product at all |
| Pagination inside the overview | The cap is 10 and there is no page 2. Paginating here would be a second pagination surface over rows the ticket list already pages. "See all" hands off to `/tickets?customerId=…` |
| Filtering the recent list by status | AC-8. The recent list is the last ten things that happened, and a ticket resolved yesterday is context |
| Editing anything on this screen | `017-update-customer` owns the `Edit` button on the screen spec |
| Comment counts, "last contacted" timestamp | Not asked for. Each is another aggregate, and neither appears on the screen spec |
| Deactivating or merging a customer | Not in the product |

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | "Recent interactions" in the story means recent **tickets**. The domain model has no interaction entity, so there is nothing else it can mean today | A real interaction feed is a new story with a new entity, and this endpoint grows a fourth section |
| A-2 | All support users may see all of a customer's tickets, so the recent list is not scoped by assignee (BR-6) | The list needs a per-role predicate, and then the counts stop matching the list — which is worse than either being wrong alone |
| A-3 | The `customer` block is the same shape `008` returns from `GET /api/customers/{id}`, embedded rather than restated | Two shapes for one entity drift, and the profile strip renders differently depending on which call filled it |
| A-4 | Counts are counts of tickets in a status **now**, not of transitions into it. A closed ticket counts once, under `Closed` | The counts become a history question, need `TicketHistory`, and belong to a different feature |
| A-5 | Ten is a display cap chosen for the screen, not a business rule. It is fixed in the contract, not configurable | A `limit` parameter, and with it the argument about a maximum — the thing BR-7.2 exists to settle for real list endpoints |
| A-6 | An inactive customer still has a viewable overview | The endpoint needs a `404`-or-`410` decision for deactivated customers, which no story has asked for |

## Open Questions

| # | Question | Working assumption |
|---|---|---|
| Q-1 | Who owns the migration that creates `IX_Tickets_Customer`? `docs/sdd/03-domain-model.md` names its reason as "Customer overview" — this feature — but `015-ticket-filters-and-search` also filters by customer and ships **before** this one in the Phase 5 order, while being explicitly first out if time runs short | `018` owns it. The migration `AddTicketsCustomerIndex` creates the index only if it is absent, and `BE-018-02` verifies presence through `sys.indexes` rather than assuming. If `015` shipped it first, this migration is a no-op and that is recorded, not silently duplicated. **This needs a human decision before either feature starts** |
| Q-2 | Should the overview carry a comment count or a "last contacted" timestamp? | No. Neither is on the screen spec, and each is another aggregate over `TicketComments`. Revisit only if an agent asks |
| Q-3 | Does an inactive customer's overview show a visible marker? | Yes — a muted chip on the header, no separate screen state. Deactivation is not built (A-6), so a chip is the honest minimum rather than a designed flow |
| Q-4 | Does the rail show a status row with zero tickets, or hide it? | It shows it, at `0`. AC-3 requires it. Hiding zero rows makes the rail change shape between customers, and an agent who sees no `Open` row cannot tell whether that means zero or means broken |

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | `GET /api/customers/{id}/overview` returns, in one response, the customer profile, ticket counts by status, and the most recent tickets |
| AC-2 | `recentTickets` contains at most 10 items, ordered by `createdAtUtc` descending and tie-broken by `id` descending, so the order is total and stable across refetches (BR-7.1) |
| AC-3 | A customer with no tickets returns `total: 0`, every status key present with the value `0`, and `recentTickets: []`. The screen renders an intentional empty state with the create-ticket action, and shows the zero counts as `0` rather than hiding them |
| AC-4 | Producing the response executes exactly **three** database commands — the profile read, one grouped count, one capped ticket read — asserted by an executed-command count in the integration test. No command is issued per status, and none per ticket row |
| AC-5 | An unknown id returns `404` with the standard `ProblemDetails` contract and `type: errors/not-found` |
| AC-6 | An id that is not a well-formed GUID returns `400` as `ProblemDetails`, distinguishable from AC-5 by both status and `type` |
| AC-7 | `byStatus` carries all six BR-1 statuses on every response, and the status keys are the untranslated enum names in every locale (BR-8.7) |
| AC-8 | `recentTickets` is not filtered by status: `Resolved` and `Closed` tickets appear in it |
| AC-9 | `recentTicketsTruncated` is `false` when the customer has 10 tickets or fewer and `true` at 11 or more; the screen shows the "see all" link only when it is `true` |
| AC-10 | A request without a valid token returns `401`, and the denial writes exactly one audit row, outside any transaction (BR-9.2, BR-9.4) |
| AC-11 | A successful read writes **no** audit row. Asserted, so the absence is a recorded decision rather than an omission (BR-9.1) |
| AC-12 | Both `Agent` and `Manager` receive `200`. This endpoint has no `403` path (BR-6) |
| AC-13 | The `customer` block is identical in shape to `GET /api/customers/{id}` from `008`, including `version` |
| AC-14 | An inactive customer's overview returns `200` with its counts and history intact |
| AC-15 | The screen handles loading, empty, not-found, and error distinctly, and each is reachable in a test |
| AC-16 | In Arabic: the ticket total uses CLDR plural categories (BR-8.14), name, company, and notes carry `dir="auto"`, and email and phone render left-to-right inside the right-to-left layout |
| AC-17 | `IX_Tickets_Customer` exists, and both ticket reads seek on it — evidenced by the actual execution plan, recorded in `tests.md` |

## Edge Cases

From `docs/sdd/testing/edge-cases.md`: unknown id, malformed id, `null` versus omitted
optional fields, exactly-at-boundary collection sizes, unicode in a name, empty
collection, an unauthenticated request.

Specific to this story:

| Case | Expected |
|---|---|
| Customer with **no** tickets | `200`, `total: 0`, all six status keys at `0`, `recentTickets: []`, `recentTicketsTruncated: false`. The screen looks deliberate, not broken (AC-3) |
| Customer with exactly **10** tickets | `recentTickets` has 10, `recentTicketsTruncated: false`. The boundary is tested on both sides |
| Customer with **11** tickets | `recentTickets` has 10, `recentTicketsTruncated: true`, and the "see all" link appears |
| Eleven tickets created in the **same millisecond** | A total order still exists and repeats, because the sort is `CreatedAtUtc DESC, Id DESC`. `datetime2(3)` truncates to milliseconds, so this is reachable from a seed script or a loop in a test — not a theoretical case |
| Customer whose tickets are **all** `Closed` | `Closed` is non-zero, the other five are `0`, and the recent list is populated (AC-8) |
| Customer with `notes = null` | The notes region renders its own muted empty state, distinct from the tickets empty state |
| Arabic `fullName`, `companyName`, and `notes` | Round-trip byte-identical, rendered with `dir="auto"` |
| Totals of 1, 2, 3, 11, 100 in Arabic | Six CLDR plural categories exercised (BR-8.14). An English two-form plural is grammatically wrong for most of these |
| A non-GUID id, `/api/customers/abc/overview` | `400` `ProblemDetails` (AC-6) — not `404`, and not the framework's default body |
| Inactive customer | `200` (AC-14), with the muted chip from Q-3 |

## Rules Referenced

BR-7.1 (default sort is `CreatedAtUtc` descending), BR-7.6 (an empty result is `200`
with an empty collection, never `404`), BR-6 (both roles may view a customer, so there
is no `403` path), BR-8.7 (status enum values are never localized), BR-8.13 / BR-8.14
(Latin digits, CLDR plurals), BR-9.1 (only state changes are audited — this endpoint
changes none), BR-9.2 / BR-9.4 (the `401` is audited, outside a transaction).

Requirement served: FR-1.5. Non-functional: NFR-2, NFR-10.
