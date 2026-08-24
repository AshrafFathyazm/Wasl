# US-006 (read half) — Specification

**Phase:** 2 · **Story:** US-006 · **Feature:** `010-ticket-list-and-detail` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

## Understanding

Past about thirty tickets, an unfiltered list stops being a work queue and becomes a
wall. This story turns the ticket collection into something a person can navigate.

**This feature is the half of that which is on the critical demo path.** You cannot show
a ticket without a screen that lists it, and you cannot act on one without a screen that
shows it. So `010` is the plain paginated list, the detail view, and the two guarantees
that are easy to get wrong and invisible when you do: the list costs one query per page
rather than one per row, and the client is told which status transitions are permitted
rather than deciding for itself.

The filters and the free-text search — the part that makes a large list navigable rather
than merely visible — are `015-ticket-filters-and-search`, which is Release 2 and the
first thing the compression order cuts (`docs/sdd/08-board.md`).

## Why US-006 is two features

`docs/sdd/08-board.md` is the instruction: the list is not droppable and the filters are
the first thing to go, and a feature that is half critical and half droppable makes
"is it done?" unanswerable.

### The acceptance-criteria split — auditable, exhaustive, disjoint

Every criterion in the source story lands in exactly one feature. None is dropped and
none appears in both.

| AC | Criterion (abbreviated) | Lands in |
|---|---|---|
| AC-1 | Standard paged envelope | **010** |
| AC-2 | Default sort `CreatedAtUtc` descending (BR-7.1) | **010** |
| AC-3 | Page size defaults to 20, clamps at 100 (BR-7.2) | **010** |
| AC-4 | Seven filters combine with AND (BR-7.3) | `015` |
| AC-5 | A repeated filter combines with OR (BR-7.4) | `015` |
| AC-6 | `search` across number, subject, customer name (BR-7.5) | `015` |
| AC-7 | `%`, `_`, and a quote in a search term are literal | `015` |
| AC-8 | `assignee=me` resolves from the token | `015` |
| AC-9 | `assignee=unassigned` | `015` |
| AC-10 | Invalid filter value → `400` listing accepted values | `015` |
| AC-11 | No results → `200` with an empty array (BR-7.6) | **010** |
| AC-12 | No query per row; names projected in the same query | **010** |
| AC-13 | Row columns | **010** |
| AC-14 | Active filters in the URL, surviving a reload | `015` |
| AC-15 | Loading, empty, and error states on the screen | **010** |
| AC-16 | Unauthenticated → `401` | **010** |

`AC-15` lands in `010` because `010` builds the screen; the two filter-specific states
(`no matches` as distinct from `no tickets`, and the invalid-filter message) are new
criteria in `015`, not a second claim on AC-15.

### New criteria, and why the ranges are disjoint

The source story has no criterion for `GET /api/tickets/{id}`, even though
`docs/sdd/05-api-conventions.md` lists that endpoint under US-006 and
`docs/sdd/design/screens/04-ticket-detail.md` is a US-006 screen. That is a gap in the
source, not a scope decision, and it is filled here.

New criteria are numbered from AC-17 upward in **disjoint ranges**, so a citation from
another feature is never ambiguous about which folder it means:

| Range | Owner |
|---|---|
| AC-17 – AC-23 | `010-ticket-list-and-detail` |
| AC-24 – AC-27 | `015-ticket-filters-and-search` |

## In Scope

- `GET /api/tickets` as a **plain paginated list**: the standard envelope, the default
  sort, page-size clamping, and an empty page that is `200` and never `404`
- `GET /api/tickets/{id}`: the detail shape, including `allowedTransitions` (ADR-004)
- The tickets-list screen: table, pagination, loading / empty / error
- The ticket-detail screen, **read-only**: header, summary strip, rail, description
- One query per page, asserted — not assumed

## Out of Scope

| Excluded | Reason |
|---|---|
| Filters on status, priority, category, channel, assignee, customer, escalated | `015`. AC-4, AC-5 |
| Free-text search | `015`. AC-6, AC-7 |
| The status tabs on the list screen | `015` — a tab is a status filter with a label |
| Filters in the URL | `015`. AC-14 |
| Sorting other than `CreatedAtUtc DESC` | No requirement in the source story. Adding one is a parameter, not a redesign — see Q-3, because the screen spec draws a control for it |
| Changing status, assigning, escalating | `011`, `012`, `016`. `010` **renders** `allowedTransitions`; it does not act on them |
| Comments and the activity timeline on the detail screen | `013`. The sections are declared in the accordion and are empty until then |
| Saved views, per-user defaults, CSV export, column configuration, infinite scroll | No requirement; page-based pagination is simpler to verify and to explain |
| Attachments | Out of scope project-wide (`docs/sdd/00-project-context.md`) |
| Full-text ranking | Substring matching is sufficient at this scale — and it belongs to `015` regardless |

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | Every support user may see every ticket (BR-6) | If visibility is scoped by team, the list query grows a mandatory predicate and BR-6 grows a row. The endpoint would then also acquire a `403` path, which would bring BR-9.2's audit row with it |
| A-2 | Creation date descending is the right default | Most recent first is what a queue view generally means (BR-7.1) |
| A-3 | `TicketNumberSeq`, `dbo.Tickets`, and its three indexes exist from `009-create-ticket` | If `009` has not landed, this feature cannot be demonstrated. It can still be built and unit-tested |
| A-4 | The detail screen is reached by clicking a row, not by typing a `Guid` | It also has to survive being typed, which is why AC-19 and AC-20 exist |
| A-5 | 100 rows is a plausible worst-case page, and a demo dataset is in the low hundreds of tickets | If the real volume is orders of magnitude larger, the search and sort limits recorded in `research.md` need measuring rather than accepting |

## Open Questions

| # | Question | Working assumption |
|---|---|---|
| Q-1 | Should closed tickets be excluded from the default list? | **No.** An invisible default filter is confusing, and a "hide closed" toggle is discoverable while a hidden default is not. Note that with no filters at all in `010`, excluding them would be unreachable *and* unremovable |
| Q-2 | Who owns the `TicketStatusTransitions` map, given `010` reads it and `012` enforces it? | **`010` creates the map and the unit test that checks its 36 cells against BR-1's table; `012` adds the enforcement** — the guard, the `409`, BR-1.3's assignee precondition, BR-1.2's required note. The alternative is `010` returning a placeholder array and `012` replacing it, which means shipping a screen whose action menu is knowingly wrong |
| Q-3 | `docs/sdd/design/screens/03-tickets-list.md` draws a sort control in the toolbar, and no story specifies sorting | **Not rendered.** The source story excludes sort explicitly, so the control is omitted rather than rendered inert. Flagged because it is a real disagreement between the screen spec and the story, and the screen spec should lose it or a story should gain it |
| Q-4 | What should `pageSize=0` do — clamp to the default, clamp to 1, or `400`? | **Clamp to the default of 20**, consistent with `page=0` clamping to 1 rather than being rejected (`docs/sdd/05-api-conventions.md`). A `pageSize` of 0 has no useful meaning and rejecting it would be the only place in the pagination contract that rejects rather than clamps |
| Q-5 | Does the **list** need `allowedTransitions` per row? | **No.** Nothing in `010` acts from the list, and per-row transitions would add a projection nobody reads. Revisit only if a story asks for a status change from the list — at which point it is one field on an existing projection, not a redesign |

## Acceptance Criteria

Numbers are preserved from the source story. Gaps in the sequence are criteria owned by
`015` — see the split table above.

| # | Criterion |
|---|---|
| AC-1 | `GET /api/tickets` returns the standard paged envelope: `items`, `page`, `pageSize`, `totalCount`, `totalPages` |
| AC-2 | Default sort is creation date descending (BR-7.1) |
| AC-3 | Default page size is 20; above 100 is clamped to 100, not rejected (BR-7.2) |
| AC-11 | No results returns `200` with an empty array (BR-7.6) |
| AC-12 | The list query issues no query per row; customer and assignee names are projected in the same query |
| AC-13 | Each row shows ticket number, subject, customer name, status, priority, channel, assignee, escalated flag, and creation date |
| AC-15 | The screen shows loading, empty, and error states |
| AC-16 | An unauthenticated request returns `401` |
| AC-17 | `GET /api/tickets/{id}` returns the ticket with its customer name, assignee name, escalation fields, `version`, and `allowedTransitions` — in one query, by the same rule as AC-12 |
| AC-18 | `allowedTransitions` is exactly the permitted set for the ticket's current status per BR-1's matrix; for a `Closed` ticket it is an empty array, not absent and not `null` |
| AC-19 | A syntactically valid id that matches no ticket returns `404` with `type: errors/not-found` — never `200` with a null body |
| AC-20 | A path segment that is not a `Guid` returns `404` from the route constraint, never `500` |
| AC-21 | A `page` beyond the last returns `200` with an empty `items` array and the correct `totalCount` and `totalPages` |
| AC-22 | Two tickets with the same `CreatedAtUtc` appear exactly once each across two consecutive pages — the sort has a deterministic tie-breaker |
| AC-23 | The detail screen's action control is rendered from `allowedTransitions` as returned. With an empty array no action control is rendered at all, and the client holds no copy of the state machine (ADR-004) |

## Edge Cases

From `docs/sdd/testing/edge-cases.md`: no results, page beyond the last, `page=0`,
`pageSize` above the maximum and at zero, API unreachable.

Specific to this feature:

| Case | Expected |
|---|---|
| `page=0` or negative | Clamped to 1, not `400` (`docs/sdd/05-api-conventions.md`) |
| `pageSize=101` | Clamped to 100, and the response's `pageSize` field reports **100** — reporting back what was asked for is the bug that makes a clamp invisible to the client |
| `pageSize=0` | Clamped to the default of 20 (Q-4) |
| `page=abc` | `400` `errors/validation` — a value that cannot be a number is malformed, not out of range. It must arrive as `ProblemDetails`, not as the framework's bare 400 body |
| Two tickets created in the same millisecond | Both appear exactly once. `datetime2(3)` makes this reachable in a seeded fixture, not merely theoretical (AC-22) |
| A ticket whose assignee is `null` | The row renders `—`; the projection uses a left join and does not drop the row |
| A ticket whose customer was deactivated | Still listed. `IsActive` on a customer is not a filter on tickets, and hiding the ticket would lose history |
| An Arabic subject in an English interface | Renders with `dir="auto"`; stored and returned verbatim (BR-8.10) |
| An empty database | `200`, `items: []`, `totalCount: 0`, `totalPages: 0` — and the screen shows the "no tickets" empty state with a create CTA |
| A `Closed` ticket's detail | `allowedTransitions: []`, and no action control rendered (AC-18, AC-23) |
| `GET /api/tickets/{id}` for an id that is a valid `Guid` but is a **customer's** id | `404`. Ids are not typed on the wire; the lookup is scoped to `dbo.Tickets` |

## Rules Referenced

BR-1 (read-only — the permitted-transition matrix is projected, not enforced here),
BR-6 (list and view are permitted for both roles), BR-7.1, BR-7.2, BR-7.6,
BR-8.7 (enum values and `TicketNumber` untranslated), BR-8.10, BR-8.13,
BR-9.2 and BR-9.4 (the `401` audit row — see the note below).

### On the audit obligation

**This feature contains no state-changing command.** BR-9.1 and BR-9.3 therefore have
nothing to attach to, and the NFR-10 architecture test has no `IAuditableCommand` here
to assert against. That is correct, and it is written down because "no audit task" is
otherwise indistinguishable from "audit task forgotten".

What *does* apply is BR-9.2: the `401` path in AC-16 is an authorization event and
writes an audit row — **outside any transaction**, because a denied read has no business
transaction to join (BR-9.4). The mechanism lives in `003` and `004`; `BE-010-09` proves
it fires on these two endpoints rather than assuming it does.

There is no `403` path, because BR-6 grants list and view to both roles. If A-1 ever
turns out to be wrong, a `403` path appears and brings its own audit row with it.
