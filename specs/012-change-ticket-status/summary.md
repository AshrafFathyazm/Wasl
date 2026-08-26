# 012 — Summary

**Implemented 2026-08-26. 250 tests, 250 passed, 0 warnings** — 36 new. Evidence in
[tests.md](tests.md).

Deliberately short: the evidence file carries the detail, and the delivery deadline is Wednesday.

## What was built

| Where | What |
|---|---|
| `Wasl.Domain/Tickets/` | `Ticket.ChangeStatus` — BR-1 enforced in the entity, returning the history row · `TicketStatusTransitions.RawAllows` · four exceptions (`TicketClosed`, `SameStatusTransition`, `InvalidStatusTransition`, `AssigneeRequired`) · `NoteRequired` with a field error · `TicketHistoryEntry.StatusChanged` |
| `Wasl.Domain/Common/Exceptions/` | `ConcurrencyConflictException` — `002` had reserved the code with nothing able to raise it |
| `Wasl.Application/Features/Tickets/ChangeStatus/` | Command · Handler · Validator |
| `Wasl.Api/Contracts/Tickets/` | `ChangeTicketStatusRequest` |
| `Wasl.Api/Controllers/` | `PUT /api/tickets/{id}/status` |
| `002`'s registry | `same-status-transition` and `assignee-required`, plus six detail messages |

**Three `409` codes where one would have compiled.** `spec.md` Q-3: the client's reaction differs
for each — refetch quietly, offer Assign, offer a different transition — and it cannot tell them
apart by parsing an English sentence.

## Trade-offs

**No authorization.** BR-6's check has no identity to evaluate. The handler names the exact point
it goes — after the lookup, before the version check — so `004` inserts rather than redesigns.

**The version check is explicit, not `DbUpdateConcurrencyException`.** That exception only
surfaces after the write, which would put the check *after* the transition rules — the inversion
the contract calls easiest to get wrong.

**`ChangeTicketStatusRequest` sits in `Wasl.Api`, `CreateTicketResult` stays in
`Wasl.Application`.** The request exists only because the route id must not come from the body —
a binding concern, so it belongs to the layer that binds. The result is the use case's output and
is returned by three handlers; moving it would force a second shape, and the frozen contract's
"a `GET` on it returns the same resource" would stop being true by construction and start being
true by coordination.

**Assignment set by reflection in one test helper.** `011` does not exist, and AC-4's positive
half plus every `InProgress` transition need an assignee.

## Deviations

| Deviation | Why |
|---|---|
| Six detail messages added to `002`'s message source | AC-3 needs the detail to *name* the current status and the permitted list. The key alone came back — see `tests.md` finding 1 |
| Two registry rows and two domain error codes added | `spec.md` Q-3 asked for them; they were not in `002`'s thirteen |
| `ConcurrencyConflictException` added | `002` shipped the code and the registry row; nothing could raise them until something was editable |
| File naming standardised to `<Command>Handler` / `<Command>Validator` across all three ticket use cases, and `CreateTicketResult` split into its own file | Product-owner instruction. `ChangeStatus` had shipped as one file while `CreateTicket` was three |
| AC-22's malformed id returns `404` | The `{id:guid}` route constraint short-circuits before the action. `002b` envelopes those statuses |

## Known limitations

| Limitation | Owner |
|---|---|
| No `403`, no `Auth.Forbidden` row (AC-14–16, AC-25) | `004-auth-and-roles` |
| A malformed id is `404` rather than `400` with an envelope | `002b` |
| AC-12's save-failure half asserted by construction, not injection | Needs a seam that does not exist |
| `DOC-012-02` — the proposed amendment to `05-api-conventions.md` (two new `409` types) and to BR-1's `PendingCustomer` diagonal | Product-owner action; a feature does not edit the blueprint |
| `docs/sdd/04-business-rules.md` still shows `PendingCustomer → PendingCustomer` as permitted | The one file out of step. `CLAUDE.md`, BR-1.9, and shipped code all say forbidden |

## What the next feature inherits

- **`010-ticket-list-and-detail`** — the detail read already exists from `009`; `010` adds the
  list, paging, and `ToListAsync` on `IApplicationDbContext`
- **`011-assign-ticket`** — `Ticket` adds methods rather than setters, `TicketHistoryEventType`
  already has `Assigned`/`Unassigned`, and the version-check pattern is here to copy
- **`004`** — one insertion point, commented, in `ChangeTicketStatusCommandHandler`
- **`013`** — `TicketHistory` now carries `Created` and `StatusChanged` rows with notes
