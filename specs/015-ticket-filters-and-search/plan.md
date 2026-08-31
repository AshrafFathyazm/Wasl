# US-006 (filter half) — Technical Plan

**Phase:** 5 · **Story:** US-006 · **Feature:** `015-ticket-filters-and-search` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

## Design Summary

One composable `IQueryable` built from a filter object, handed to the projection that `010`
already wrote, with the count taken from the same predicate. On the client, the URL is parsed
once into a typed filter object, and that object is both the request and the TanStack Query
key.

The original US-006 plan said *"the whole story is one query written carefully"*. That is
still the sentence. `010` wrote the query; this feature writes the predicate — and the
predicate is where a wrong operator hides.

## Backend

Vertical slices over a thin domain core (ADR-010). There is no `Wasl.Application` and no
`Wasl.Infrastructure`; the original plan's `Application` and `API` layer rows are re-homed
into `010`'s existing slice.

| Location | Component | Change |
|---|---|---|
| `Wasl.Api/Features/Tickets/ListTickets/` | `ListTicketsQuery` | **Extended** — gains the filter properties. Collection-valued for the four enums, nullable for the rest |
| | `TicketFilterSpecification` | **New.** Predicate composition, isolated and unit-testable with no HTTP and no database |
| | `ListTicketsHandler` | **Extended** — applies the specification before ordering and paging. The projection is untouched |
| | `ListTicketsValidator` | **Extended** — parses the raw enum strings and produces AC-10's message |
| | `AssigneeFilter` | **New.** Parses `me` / `unassigned` / a `Guid` into a discriminated result, resolving `me` from `ICurrentUser` |
| | `Endpoint` | **Extended** — binds the new parameters. Same route, same verb, same response shape |

`TicketFilterSpecification` is separated for the reason the original gave, and it is still the
right reason: **seven optional filters composed inline is where an accidental `&&` instead of
`||` hides.** It is a query object with one caller and no interface — not a repository
(ADR-010).

No new endpoint. No new response field. `015` is additive to a frozen contract, which is why
its contract file is written as an extension.

### The predicate, and the three ways it goes wrong quietly

| Concern | Correct | What the wrong version does |
|---|---|---|
| AND across fields, OR within one | Each field contributes one `AND` clause; a multi-valued field becomes `IN (…)` via `Contains` | An `||` between fields turns seven filters into a union — the list gets *larger* as you filter, which reads as a UI bug |
| **An empty collection** | Contributes **nothing** | `Contains` over an empty array translates to `WHERE 1 = 0`. A trailing `&status=` from a form serialiser then returns zero rows for a user who filtered nothing, and the screen shows "no matches" (`research.md` R-9) |
| `escalated` | `bool?` | A plain `bool` binds `false` when the parameter is absent, so an unfiltered list silently hides every escalated ticket. The source story's edge case *"`escalated=false` returns non-escalated tickets, not all tickets"* is the symptom; `bool?` is the cause being fixed |

### Why the enum parameters bind as strings

They bind as `string[]`, not `TicketStatus[]`, and are parsed in the validator.

Minimal-API parameter binding will happily bind an enum array from repeated query keys — and
when a value does not parse, the **framework** produces the failure, not our pipeline. The
result is a `400` in the framework's shape rather than the contract's `ProblemDetails`, with
no `traceId`, no `errors` dictionary, and certainly no list of accepted values.

AC-10 requires the accepted values in the response, and constitution IV requires one error
shape produced by one middleware. Both are satisfied by taking the strings and parsing them
where we can generate the message. `research.md` R-1 has the detail.

The cost is one parse per parameter and a slightly less self-describing signature. Accepted:
the alternative is an error path that bypasses the error contract on the one input a user is
most likely to get wrong.

### Search

`TicketNumber`, `Subject`, and the joined `Customers.FullName`, OR'd together, each a
`LIKE '%term%'`.

| Concern | Decision |
|---|---|
| Case-insensitivity | **The columns' collation**, not `LOWER()`. SQL Server has no `ILIKE`; `LIKE` is case-insensitive under a CI collation. `LOWER(col) LIKE …` would also work and would make every comparison non-sargable for no gain |
| Escaping | `%`, `_`, `[`, and the escape character itself are escaped, with an explicit `ESCAPE '\'` clause |
| Why `[` | T-SQL treats `[` as a character-class opener. **PostgreSQL does not** — which is why AC-7's list is complete on the original engine and incomplete here. AC-24 is the repair |
| Translation | `EF.Functions.Like(col, pattern, "\\")` — explicit, rather than relying on `string.Contains` to choose an escaping strategy that is a provider-version detail |
| Index | None. A leading-wildcard `LIKE` cannot use a B-tree index. This is a scan and it is correct at the expected volume; the limit is recorded rather than pre-solved (`research.md` R-4) |

A search term that is only `%` matches **nothing**, because it is a literal. That is the
correct reading of AC-7, and the wrong implementation matches everything — which looks like a
feature until someone relies on it.

## Data Changes

**None.** See [`data-model.md`](data-model.md) for why, and for what is deliberately not
indexed.

The three indexes this feature's predicates can use — `IX_Tickets_Status_Created`,
`IX_Tickets_Customer`, `IX_Tickets_Assignee` — were created in `009-create-ticket` and are
named there against this story. `010` added `IX_Tickets_CreatedAtUtc_Id` for the unfiltered
ordering.

Note the one thing this feature makes true retroactively:
`docs/sdd/03-domain-model.md` justifies `IX_Tickets_Status_Created` as the "default list
query", which is accurate for **this** feature's filtered query and not for `010`'s
unfiltered one. `010`'s `research.md` R-2 records the discrepancy.

## API Contract

Frozen: [`contracts/tickets-filter-api.md`](contracts/tickets-filter-api.md), written as an
**extension** of
[`../010-ticket-list-and-detail/contracts/tickets-list-api.md`](../010-ticket-list-and-detail/contracts/tickets-list-api.md).

| Method | Path | Added parameters | Success | Failures |
|---|---|---|---|---|
| `GET` | `/api/tickets` | `status*`, `priority*`, `category*`, `channel*`, `assignee`, `customerId`, `escalated`, `search` | `200` + the **same** envelope | `400` invalid filter value (new), `401` (unchanged) |

`status`, `priority`, `category`, and `channel` accept **repeated keys**. `assignee` accepts a
`Guid`, the literal `me`, or the literal `unassigned`.

Overloading `assignee` with two magic strings is a deliberate small ugliness. The alternative
— three mutually exclusive parameters — is worse to document and worse to validate, and it
puts the "exactly one of these three" rule in the validator where nobody reads it.

**Additive, and provably so:** no field is removed, no field changes type, no status code is
removed, and a client that sends none of these parameters gets exactly `010`'s behaviour.
That is what makes this feature droppable without leaving a hole.

## Frontend

| Route | Component | Kind (ADR-011 §4) | Purpose |
|---|---|---|---|
| `/tickets` | `TicketListPage` | Route | **Extended** — reads the filter object from the URL and passes it to the existing query |
| — | `useTicketFilters` | Hook | Parses `useSearchParams` into a typed filter object and serialises it back. The **only** place either direction happens |
| — | `TicketFilterBar` | Feature | Multi-select per dimension, the assignee select, the customer picker, the escalated tri-state, `Clear` and `Apply` |
| — | `TicketSearchInput` | Feature | Debounced 300ms, writes to the URL |
| — | `TicketStatusTabs` | Feature | Status shortcuts. **Without counts** — see `spec.md` Q-3 |
| — | `TicketResultCount` | Feature | `t('tickets:list.resultCount', { count })` — plural forms, never concatenation |
| — | `MultiSelect` | Primitive | From `006`, or plain checkboxes if `006` capped before it (ADR-009) |

**Filter state is derived from the URL, not held in component state**, so AC-14 falls out of
the design instead of being bolted on. And the parsed object **is** the TanStack Query key, so
caching per filter combination falls out of it too (ADR-011 §2) — that is the whole reason the
key was an object from the start in `010`.

```ts
const filters = useTicketFilters();              // parsed from the URL, typed
useQuery({ queryKey: ticketKeys.list(filters), queryFn: () => fetchTickets(filters) });
```

Three properties follow from that one line, none of which had to be built:

| Property | Why |
|---|---|
| A filtered view is a shareable link | The state is in the URL |
| The back button restores the previous filter set | Same |
| Switching back to a previous filter combination is instant | It is a different cache key, still populated |

`Apply` is explicit, not live-as-you-type, for the filter panel: the filter set triggers a
server round trip and a six-checkbox change would trigger six
(`docs/sdd/design/screens/03-tickets-list.md`). The **search box** is the exception and is
debounced instead, because typing with an Apply button is worse than a 300ms wait.

No global store. Filters are URL state, results are server state (ADR-011 §1).

Detail: [`frontend-spec.md`](frontend-spec.md). API surface:
[`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md).

## Localization Impact

| Item | Detail |
|---|---|
| New client strings | Filter labels, multi-select placeholders, the clear-filters action, the apply action, the search placeholder, the tab labels, the "no matches" empty state, and the result-count summary |
| New server messages | The invalid-filter-value message, listing the accepted values for the named field |
| **Plurals** | The result count is a counted noun and needs all six Arabic CLDR categories (BR-8.14). **This is the first place in the build where `_two`, `_few`, and `_many` actually matter** |
| Direction-sensitive layout | A filter bar above a table — the most RTL-sensitive area in the product. Multi-select chips, the tab dividers, the search icon inside its input, and the tri-state control all have a side |
| Not translated | Filter values in the query string are canonical enum values. `?status=Open` is `Open` in every locale (BR-8.7, AC-26) |

The count summary is the specific thing to check: `t('tickets:list.resultCount', { count })`
rather than any form of concatenation. **Concatenation here produces text that is wrong in
Arabic for most counts and looks fine to an English reviewer** — which is exactly why BR-8.14
exists and why AC-27 is a criterion rather than a note.

The second thing to check: an Arabic *search term* against an Arabic subject. The term is user
content, the column is `nvarchar`, and the match is a collation-dependent `LIKE`. If the
column were ever `varchar` the term would match nothing and it would look like a search bug
rather than a type bug (ADR-013 row 4).

## Test Strategy

| Level | Covered | Why here |
|---|---|---|
| Unit | `TicketFilterSpecification` — each filter alone, AND across dimensions, OR within one, **and the empty-collection case** | Pure predicate logic; the highest-risk part of the feature. The empty-collection case is the one that silently returns nothing |
| Unit | `AssigneeFilter` parsing — a `Guid`, `me`, `unassigned`, and garbage | Pure, and it is where two magic strings live |
| Unit | The search-term escaper across `%`, `_`, `[`, `\`, and a quote | Pure string work with a wide input space and a SQL-injection-adjacent failure mode |
| Unit | `useTicketFilters` parse ⇄ serialise round-trip | AC-14, and the round-trip is what makes the back button correct |
| Integration | Each filter alone; several combined; one repeated; `escalated` absent / true / false; `me`; `unassigned`; a non-existent assignee id; `400` per enum | The query-string binding and the generated SQL are both real risks, and neither is visible in a unit test |
| Integration | Search across all three fields, mixed case, and each pattern character | AC-6, AC-7, AC-24 |
| Integration | Executed-command count with every filter set | Filtering must not add a round trip — `010`'s AC-12 guarantee must survive |
| Integration | An Arabic search term matching an Arabic subject | ADR-013 row 4 |
| Frontend | Filters reflected in the URL, surviving a reload and the back button; "no matches" distinct from "no tickets"; the `400` message; the plural count in `ar` at 0, 1, 2, 3, 11, and 100 | AC-14, AC-25, AC-10, AC-27 |

Against a real SQL Server through `Testcontainers.MsSql`. EF `InMemory` is not used anywhere
— and here the reason is sharper than usual: `InMemory` does not evaluate `LIKE` or collations
at all, so every search test would pass against LINQ-to-Objects semantics that production does
not have.

## Dependencies

| On | For |
|---|---|
| `010-ticket-list-and-detail` | The endpoint, the projection, the envelope, the table, the pagination. This feature is additive to all of it |
| `004-auth-and-roles` | `ICurrentUser`, for `assignee=me` |
| `011-assign-ticket` | `GET /api/support-users`, which populates the assignee picker. Without it the filter still works with an id, `me`, or `unassigned` |
| `008-customer-list-and-profile` | The customer picker's search. Without it the customer filter degrades to a typed id |
| `005-localization-core` | The plural machinery for AC-27 |
| `006-design-system` | `MultiSelect`, or plain checkboxes if the one-day cap hit first (ADR-009) |

`012-change-ticket-status` and `016-escalate-ticket` make the status and escalated filters
*meaningful* rather than merely functional. Buildable before them, not demonstrable.

## Risks and Trade-offs

| Decision | Alternative | Why rejected |
|---|---|---|
| Predicate composition in its own class | Inline in the handler | Seven optional filters inline is where a wrong operator hides unnoticed. Carried unchanged from the original plan |
| Repeated query-string keys for OR | Comma-separated values | Repeated keys are the standard convention and bind natively; comma-separation needs custom parsing and breaks on values containing commas |
| Enum parameters bound as `string[]` and parsed in the validator | Bound as `TicketStatus[]` | Framework binding failure produces a `400` outside the error contract, with no accepted-values list. AC-10 and constitution IV both require otherwise (`research.md` R-1) |
| An empty collection means "no filter" | `WHERE 1 = 0` (the default `Contains` translation) | A trailing `&status=` would return nothing for a user who filtered nothing, and the screen would say "no matches". The highest-risk silent defect in the feature |
| `escalated` as `bool?` | `bool` | A plain `bool` binds `false` when absent, silently hiding every escalated ticket from an unfiltered list |
| Case-insensitivity from the column collation | `LOWER(col) LIKE …` | Non-sargable for no gain, and it hides the fact that the guarantee is the collation. Recorded so nobody "fixes" the search by adding `LOWER` |
| Escape `[` as well as `%` and `_` | AC-7's original list | T-SQL treats `[` as a character class; PostgreSQL does not. AC-7 was right on ADR-001's engine and is incomplete on ADR-013's |
| `assignee=me` resolved server-side | The client sends its own id | The client would need to decode the token in the browser to learn its user id |
| One overloaded `assignee` parameter | Three mutually exclusive parameters | Worse to document and worse to validate; the exclusivity rule ends up in a validator nobody reads |
| `search` over three fields | Also the description | 4,000 characters of free text per row makes every search a scan of the largest column, and it surfaces tickets whose subject looks unrelated (`spec.md` Q-5) |
| No search index | Full-Text Search, or a persisted computed column with an index | Premature; nothing has measured a need at this volume. Full-Text is a separate engine feature with its own catalogue, crawl, and operational surface (`research.md` R-4) |
| Closed tickets included by default | Excluded by default | A hidden default filter is the kind of thing people spend an afternoon confused by |
| Explicit `Apply` for the panel, debounce for the search | Live-as-you-type for both | Six checkbox changes would be six round trips; an Apply button on a search box is worse than 300ms |
| Tabs without counts | Invent an aggregate endpoint | A new endpoint with no requirement behind it. The tab still does its main job (`spec.md` Q-3) |
| Filters in the URL | Component state, or a store | AC-14 requires the URL, and it also gives shareable links, a working back button, and per-combination caching for free (ADR-011 §2) |

## Files to Create or Change

```text
src/Wasl.Api/Features/Tickets/ListTickets/ListTicketsQuery.cs          (extended)
src/Wasl.Api/Features/Tickets/ListTickets/ListTicketsHandler.cs        (extended)
src/Wasl.Api/Features/Tickets/ListTickets/ListTicketsValidator.cs      (extended)
src/Wasl.Api/Features/Tickets/ListTickets/Endpoint.cs                  (extended)
src/Wasl.Api/Features/Tickets/ListTickets/TicketFilterSpecification.cs
src/Wasl.Api/Features/Tickets/ListTickets/AssigneeFilter.cs
src/Wasl.Api/Features/Tickets/ListTickets/SearchTerm.cs
src/Wasl.Api/Common/Localization/Resources/*.resx                      (invalid-filter message)
src/wasl-web/src/features/tickets/useTicketFilters.ts
src/wasl-web/src/features/tickets/filterSchema.ts
src/wasl-web/src/features/tickets/TicketFilterBar.tsx
src/wasl-web/src/features/tickets/TicketSearchInput.tsx
src/wasl-web/src/features/tickets/TicketStatusTabs.tsx
src/wasl-web/src/features/tickets/TicketResultCount.tsx
src/wasl-web/src/features/tickets/TicketListPage.tsx                   (extended)
src/wasl-web/src/features/tickets/TicketTable.tsx                      (extended — no-matches state)
src/wasl-web/src/features/tickets/api.ts                               (extended)
src/wasl-web/src/features/tickets/types.ts                             (extended)
src/wasl-web/src/locales/en/tickets.json                               (extended)
src/wasl-web/src/locales/ar/tickets.json                               (extended)
tests/Wasl.Api.IntegrationTests/Tickets/FilterTicketsTests.cs
tests/Wasl.Api.IntegrationTests/Tickets/SearchTicketsTests.cs
tests/Wasl.Api.UnitTests/Tickets/TicketFilterSpecificationTests.cs
tests/Wasl.Api.UnitTests/Tickets/AssigneeFilterTests.cs
tests/Wasl.Api.UnitTests/Tickets/SearchTermTests.cs
src/wasl-web/src/features/tickets/__tests__/useTicketFilters.test.ts
src/wasl-web/src/features/tickets/__tests__/TicketFilterBar.test.tsx
src/wasl-web/src/features/tickets/__tests__/TicketResultCount.test.tsx
```

`SearchTerm` is a small parse-don't-validate type over the raw term: it holds the escaped
pattern, so no caller can forget to escape. `TicketFilterSpecification` and `AssigneeFilter`
are query objects with one caller each — not repositories, and not interfaces (ADR-010).

`tests/Wasl.Api.UnitTests` is where the pure slice-level types are tested. `Wasl.Domain.Tests`
is for the domain, and none of these three types belongs there: a filter predicate is not a
business invariant.

## Contract changes

This feature **is** a contract change, and it is the reason the section exists.

| Change | Shape | Effect on an existing client |
|---|---|---|
| Eight query parameters added to `GET /api/tickets` | Additive | None. Sending none of them yields `010`'s behaviour exactly |
| A new `400` `errors/validation` cause — an invalid filter value | Additive | None. `010` clients cannot trigger it, because they send no filters |
| Response shape | **Unchanged** | None |
| Status codes removed | **None** | — |

Recorded in [`contracts/tickets-filter-api.md`](contracts/tickets-filter-api.md) as an
extension rather than as an edit to `010`'s file, so `010`'s contract stays readable as the
thing `010` was reviewed against, and this file stays readable as the delta a reviewer has to
check.

Both lanes are told when this lands, and
[`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md) is the regenerated handoff. A contract change
discovered by the frontend failing to compile is the failure this process exists to prevent.

### 2026-08-31 — `createdFrom` / `createdTo`

Two more query parameters on `GET /api/tickets`, added at the product owner's direction the day
the filter panel's date range went from drawn-and-disabled to live ("شغل فلتر البحث بالتاريخ").

| Change | Shape | Effect on an existing client |
|---|---|---|
| `?createdFrom=YYYY-MM-DD` and `?createdTo=YYYY-MM-DD` | Additive | None. Sending neither yields the prior behaviour exactly |
| A new binder-`400` cause — an unparseable date | Additive | None for a client that sends none |

The semantics are written where they bind, in `GetTicketsQuery`'s XML docs, and they are the
part a reader needs before reusing the parameters:

- **`DateOnly`, not `DateTime`** — the wire carries a day, and a stray time-of-day component
  would silently shave tickets off the first day of the range.
- **The bounds are UTC days**, because `CreatedAtUtc` is what the column stores; a Riyadh-local
  day is a different slice and choosing it silently would make the filter disagree with every
  timestamp the product renders.
- **Both ends inclusive** — `to 31/08` includes the 31st, implemented as `< 01/09T00:00` rather
  than a per-row date cast, which no index would cover.

Three integration tests pin the bounds (`TicketFilterTests`): inclusivity at 09:00 on the first
day and 23:30 on the last, composition with the other filters (BR-7.3), and the binder's `400`
on `?createdFrom=not-a-date`. Full suite after the change: 384 integration, 189 domain, 0 failed.

The panel's calendar is the `026` preview's `Calendar` promoted to
`features/tickets/TicketDateField.tsx` — Monday-first clipped-word weekdays, the day→month→decade
drill, Latin digits in both calendars, and a Hijri toggle that changes the **display only**; the
value is always the ISO Gregorian day this parameter accepts. One physical `translate` became
logical on the way in (the switch knob left its track under RTL), and the trigger gained the
accessible name its preview version never had.

### If this feature is cut

`docs/sdd/08-board.md`'s compression order puts it first out. Cutting it leaves:

- `010`'s contract, unchanged and complete
- No dead parameters on the endpoint and no dead fields in the response
- A `/tickets` screen with no filter bar, which looks deliberate rather than unfinished
- Nothing in `011`, `012`, `013`, or `014` waiting on it

That is the whole point of the split, and it is worth stating here because it is the property
that has to still be true when the plan is reviewed.
