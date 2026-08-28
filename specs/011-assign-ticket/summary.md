# `011-assign-ticket` — summary

Delivered 2026-08-28. **Backend half.** The assignee picker UI (AC-15) belongs to the frontend
lane. Written for someone who was not present.

## What was built

| # | Thing |
|---|---|
| 1 | `PUT /api/tickets/{id}/assignee` — assign, reassign, unassign, in the order the frozen contract fixed |
| 2 | `GET /api/support-users` — the picker's source, active users only, three fields |
| 3 | `Ticket.Assign(Guid?, DateTime)` in the domain: BR-2.5 and AC-11, and deliberately nothing else |
| 4 | `TicketHistoryEntry.Assigned` / `.Unassigned` — two event types, the ids as text, no names |
| 5 | `ForbiddenException`, `AssigneeUnchangedException`, `AssigneeNotFoundException`, `AssigneeInactiveException` |
| 6 | Two new rows in `002`'s problem-type registry: `assignee-unchanged` (`409`), `assignee-not-found` (`404`) |
| 7 | `assignee` as a nested object on the shared ticket DTO — additive, so no frozen contract moved |
| 8 | A second seeded Agent, so BR-2.3 is provable rather than asserted |
| 9 | `TicketHistory.PerformedByUserId` now stamped — a defect that predated this feature |

**340 tests, 0 warnings.** Evidence, negative controls and the live run:
[tests.md](tests.md).

**No migration.** `TicketHistoryEventType` already contained `Assigned` and `Unassigned` from
`009`, and every column this feature writes already existed. `data-model.md` says so at the top
and that statement was checked rather than inherited — four of its other statements were wrong and
are corrected there in a table.

## Why it was built this way

### The decision the whole feature turns on

**BR-2's data-dependent rules are in the handler, not in an authorization policy.** `CLAUDE.md`
mandates that split for BR-6, and `011` is where the reason stops being architectural taste:

> A handler denial is audited. A policy denial is not.

`003`'s `AuditOutcomeClassifier` maps a `DomainException` carrying `DomainErrorCodes.Forbidden` to
`AuditOutcome.Denied`, and `AuditBehaviour` writes that row through `WriteIndependentAsync` — on
its own connection, so it survives the rollback of the write it refused. A `403` produced by the
authorization middleware throws nothing, MediatR never sees it, and no row is written at all.
That second half is `004` AC-18, still open.

**Measured, not argued.** Moving the check into `[Authorize(Policy = ManagerOnly)]` and re-running
the suite returned `found 0: {empty}` — the audit row does not lose a column, it ceases to exist.
Two further things fell out of the same control, neither predicted: the policy's `403` has an
**empty body** (no `type`, no `traceId` — `002b` owns that), and a policy cannot express the
contract's step-4-before-step-5 ordering at all, because it necessarily runs before any handler.

AC-17 was added to this spec by the reconciliation so the property is asserted rather than
believed.

### The endpoint carries no role policy, and it cannot

`ManagerOnly` there would refuse every Agent, and BR-2.2 makes an Agent self-assigning unowned
work legitimate. So `[Authorize]` alone, and the role read from the token inside the handler
beside the two things a policy could never see: the request's target and the ticket's current
owner.

This is also why `011` was the right feature to build after `004`: `ManagerOnly` had **zero
consumers in production**, and a policy that is registered but attached to nothing is a policy
that has not been verified — the same standard `CLAUDE.md` applies to any other guard.

### Where each rule ended up

| Rule | Where | Because |
|---|---|---|
| BR-2.1 – BR-2.3 (roles, ownership) | Handler | Needs the caller, the caller's role, the target, and the ticket's current owner |
| BR-2.4 (target must be active) | Handler | A row in another table. `Ticket.Assign` takes a bare `Guid?` precisely so the entity does not reach across an aggregate |
| BR-2.5 (`Closed` is terminal) | Domain | An invariant of the ticket, true for every caller including a seeder |
| AC-11 (must be a change) | Domain | Same |
| BR-2.6 (history rows) | Domain, returned from `Assign` | The entity that changed the field is the only thing that knows both sides |
| BR-2.7 (status unchanged) | Domain, as an **absence** | AC-10 tests that a method does nothing |

### Four orderings, each with a failure mode

The contract fixes ten steps. Two of them are the ones that would have been got wrong:

- **Version check before the permission decision.** The permission rules read the ticket's current
  assignee; with a stale token the client is looking at a different assignee than the server is,
  so a `403` computed there can be wrong and the client has no way to tell. Only one test in the
  suite protects this — control 2 confirmed it, and confirmed it is the only one.
- **Permission before state.** An Agent assigning someone else to a `Closed` ticket gets `403`,
  not `409`: they could not have done it on an open ticket either, and `409` first implies that
  reopening would help, which BR-1.5 says it would not.

`012` shipped the same version-check-first ordering, so `011` follows it rather than re-deciding
it — with one difference worth naming: `012` skips the version check for a `Closed` ticket,
because a closed ticket does not become un-closed by reloading. `011` does **not** skip it,
because here the `Closed` check sits *after* the permission decision, and skipping would move that
decision onto data the client has not seen.

### Q-5: the assignee shape, resolved by addition

The frozen contract returns `assignee` as a nested object; `009` and `010` froze a bare
`assignedToUserId`. Three shapes for one concept. The ruling was "return the nested object, change
nothing else" — and the implementation reads that as **additive**: `assignee` was added to the one
shared DTO and `assignedToUserId` kept. Adding a field is backward-compatible, so no frozen
contract moved and `024`'s hand-written `api-types.provisional.ts` keeps working; a second
seventeen-field DTO with its own mapper would have been the "second shape to keep in step" that
`012` declined for the same reason.

**Known limitation, recorded in `plan.md` rather than left to be noticed:** `assignedToUserId` is
now redundant with `assignee.id`, and removing it **will be** a breaking change, owned by `010`.
`GET /api/tickets` still returns flat `assigneeId` + `assigneeName` — a single-query list
projection, deliberately not this shape.

## The defect this feature exposed in two older ones

**`TicketHistory.PerformedByUserId` was NULL on every row ever written.** The stamping in
`WaslDbContext.SaveChangesAsync` matches on `IAuditableEntity`, and `TicketHistoryEntry` is
correctly not one — it is append-only and its actor column means "who did this" rather than "who
last edited this row". So the loop skipped it, and `Created` rows from `009` and `StatusChanged`
rows from `012` all carried a null actor. Nothing failed; `013`'s timeline would have said
"someone" for every event.

Found because AC-9 asserts the actor rather than the row's existence. Fixed in one place, beside
the existing stamp, keeping the standing decision that the time and the user are set in
`SaveChangesAsync` and never in a handler.

## Open

| # | What | Owner |
|---|---|---|
| 1 | AC-15 — the picker UI, the ticket strip, the mirrored BR-2 that disables a button the server would refuse | frontend lane |
| 2 | Q-4: the response does not tell the client whether the caller **may** assign. The client mirrors BR-2 for UX, which is a stopgap; a server-authored capability flag is the right design and is a change to the read shape | `010` |
| 3 | An audit row on a policy-level `403`. `011` avoids needing one and does not close the gap | `004b` |
| 4 | Removing the redundant `assignedToUserId`; aligning `GET /api/tickets`'s flat assignee shape | `010` |
| 5 | A malformed route `Guid` returns `404` where the contract says `400` | `002b` |
| 6 | No rate limit on this endpoint, as on every other | `004b` |
| 7 | User management — creating, editing, deactivating support users. The picker's list is seeded, and `GET /api/support-users` becomes paged if it ever ships, which is a breaking change | out of release |

## One process note

`tests.md` records a fifth entry for `CLAUDE.md`'s list of tools that produced a well-formed
report about nothing — and the first where the tool was the build. Reverting a negative control
with `Copy-Item` restored the source file with an **older** `LastWriteTime` than the compiled DLL,
so MSBuild skipped recompiling it and reported `0 Errors`. The second negative control was
therefore measured against the first one's binary, and would have been written up as "swapping the
check order breaks five tests" — specific, confident, and wrong. Caught by comparing timestamps.
Every control here was re-measured with `--no-incremental`.
