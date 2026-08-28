# US-007 — Technical Plan

**Phase:** 2 · **Story:** US-007 · **Feature:** `011-assign-ticket` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

## Design Summary

The permission rule is data-dependent — it needs the current assignee and the caller's
identity — so it cannot be expressed as an attribute-based policy at the boundary. It is
decided by a pure policy type in `Wasl.Domain`, called by the slice's handler, which
supplies the three inputs the boundary does not have. The `Ticket` entity owns only what
is a ticket invariant: a closed ticket cannot be assigned or unassigned, and a no-op is
not a change.

Two endpoints, two slices, one frozen contract:
[`contracts/ticket-assignee-api.md`](contracts/ticket-assignee-api.md).

## Where each BR-2 check lives, and why

This is the table to read first. BR-6 draws the line explicitly — *"role-only checks are
enforced as ASP.NET Core authorization policies at the API boundary; data-dependent
checks are enforced in the application layer, because the boundary does not have the
data"* — and this feature is where that line first does real work.

| Check | Rule | Where | Why it cannot live anywhere else |
|---|---|---|---|
| Authenticated, holds a support role | BR-6 | **Endpoint** — `.RequireAuthorization()` | Role-only, and it needs no data at all |
| Assigning to someone other than yourself requires `Manager` | BR-2.1, BR-2.2 | **Handler** → `TicketAssignmentPolicy` | It compares the token's `sub` against the request body's `assigneeId`. An authorization policy runs before model binding, so the boundary does not have the body |
| The ticket is already assigned to someone else | BR-2.3 | **Handler** → `TicketAssignmentPolicy` | Needs the loaded row |
| The target is an **active** `SupportUser` | BR-2.4 | **Handler** | Needs a second row |
| A `Closed` ticket cannot be assigned or unassigned | BR-2.5, BR-1.5 | **Domain** — `Ticket.AssignTo` | A ticket invariant. It must hold for every caller, including a Manager, and for any future code path that is not this endpoint |
| Assignment does not change status | BR-2.7 | **Domain** — by omission, asserted by a test | The only defence is a test, because the failure mode is a line of code someone helpfully adds |

**What must not happen here:** putting a `Manager`-only policy on this endpoint. It
would read as a faithful implementation of BR-2.1, and it would silently break AC-2 — an
Agent self-assigning an unassigned ticket is the most common use of this endpoint.
`016-escalate-ticket` is where a genuine `Manager`-only policy belongs; this endpoint is
reachable by both roles by design, and that is exactly why the decision cannot be pushed
to the boundary.

## Backend

Two projects, vertical slices, minimal APIs (ADR-010). There is no `Wasl.Application`
and no `Wasl.Infrastructure`.

| Project | Component | Responsibility |
|---|---|---|
| `Wasl.Domain` | `Ticket.AssignTo(Guid? target, Guid actorId, DateTimeOffset now)` | Rejects assignment on a closed ticket; rejects a no-op; sets `AssignedToUserId` and `UpdatedAtUtc`; appends the `Assigned` / `Unassigned` history row |
| `Wasl.Domain` | `TicketAssignmentPolicy` | The BR-2.1 – BR-2.3 permission decision, as a pure function of actor role, actor id, current assignee, and target |
| `Wasl.Api` | `Features/Tickets/AssignTicket/` | `Endpoint`, `Command`, `Handler`, `Validator`, response mapping — one slice, one folder |
| `Wasl.Api` | `Features/SupportUsers/ListSupportUsers/` | `Endpoint`, `Query`, `Handler`, `Response` — the picker source |
| `Wasl.Api` | `Common/Errors/` | Two new `ProblemDetails` types, mapped from two new domain exceptions (see **Contract changes**) |

`TicketAssignmentPolicy` is separated from the handler because the rule has four
branches and is the most likely thing in this story to be got wrong. As its own type it
can be unit-tested exhaustively without a database.

**It lives in `Wasl.Domain`, not in the slice** — a change from the original plan, caused
by ADR-010. The original put it in `Wasl.Application`, which had its own test project.
With that project gone, a policy class inside `Wasl.Api` is reachable only from
`Wasl.Api.IntegrationTests`, where every branch costs a container round-trip and
exhaustive coverage stops being affordable. It is also a business rule, and the
constitution puts business rules in `Wasl.Domain`, once.

The original plan's objection — *"the domain would need to know about the caller's
identity and role, which is not a ticket concern"* — was right about the **entity** and
is preserved: `Ticket` still knows nothing about the caller. A pure function that
*receives* a role and two ids is not the entity knowing about the caller; it is the rule
written where it can be tested. `research.md` R-1 carries the alternatives.

## Data Changes

**None.** Full detail, including what verifies that, in
[`data-model.md`](data-model.md).

`Tickets.AssignedToUserId`, `FK_Tickets_Assignee` (`ON DELETE NO ACTION`),
`IX_Tickets_Assignee`, and `dbo.TicketHistory` were all created by `009-create-ticket`.
This feature adds no column, no index, and no migration — and says so explicitly,
because "no migration" written down is a decision, while "no migration" left unmentioned
is indistinguishable from an oversight.

The one index this feature could have been tempted into — something on
`SupportUsers.IsActive` for the picker — is **not** added. The table is seeded and holds
single digits of rows, so a scan of it is free, and the no-speculative-indexes rule
applies to a small table exactly as much as to a large one.

## API Contract

| Method | Path | Request | Success | Failures |
|---|---|---|---|---|
| `PUT` | `/api/tickets/{id}/assignee` | `{ assigneeId?, expectedVersion }` | `200` + the updated ticket | `400` validation / inactive target, `401`, `403`, `404` ticket or target, `409` closed / no-op / concurrency |
| `GET` | `/api/support-users` | — | `200` + active users | `401` |

`assigneeId` is nullable, and `null` means unassign. A separate `DELETE` endpoint was
considered and rejected: unassigning is the same business action with a different
target, it writes to the same field, and it belongs in the same history sequence.

`expectedVersion` is **required**, not optional. An optional concurrency token is a
concurrency token that is absent on the one request where it mattered.

The response is the ticket read representation owned by `010-ticket-list-and-detail`.
This feature freezes only the fields its acceptance criteria depend on — `id`,
`ticketNumber`, `status`, `assignee`, `allowedTransitions`, `updatedAtUtc`, `version` —
and does not invent the rest. The full shape is in the contract file.

One consequence that looks like a contradiction: assignment does not change `status`
(BR-2.7, AC-10) but it **does** change `allowedTransitions`, because BR-1.3 makes
`InProgress` conditional on having an assignee. A client that keeps its previous action
menu after a successful assignment shows "Start work" as unavailable on a ticket that
can now be started. The response carries the recomputed array for exactly that reason,
and `spec.md` Q-3 records that the precondition-aware computation itself belongs to
`012`.

## Audit

ADR-008 postdates the original plan, so no task in it carried the audit obligation. Both
mutations here are state-changing, so both are covered — and the NFR-10 architecture
test would have failed the build without it.

| Path | Action (BR-9 naming) | Outcome | Transaction |
|---|---|---|---|
| Assign, success | `Ticket.Assigned` | `Success` | **Inside** the same transaction as the change (BR-9.3) |
| Unassign, success | `Ticket.Unassigned` | `Success` | **Inside** (BR-9.3) |
| `403` from BR-2.1 – BR-2.3 | `Auth.Forbidden` | `Denied` | **Outside** any transaction (BR-9.2, BR-9.4) — there is no business transaction to join, and the one that was opened has rolled back |
| `GET /api/support-users` | — | — | No row. It is a read, and BR-9.1 covers state changes only. BR-9.11's audited read applies to the audit log itself, nothing else |

The asymmetry is a property of the pipeline from `003-audit-trail`, not of this handler:
the denial behaviour sits **outside** the transaction behaviour and the success write
sits **inside** it. This feature is the first one that exercises both halves, so both are
tested here (`TEST-011-11`, `TEST-011-12`).

`AssignTicketCommand` implements `IAuditableCommand` with the action **computed from its
own payload** — `AssigneeId is null ? "Ticket.Unassigned" : "Ticket.Assigned"` — not as a
constant. One command legitimately produces two actions, and the alternative is two
commands duplicating all of BR-2. `research.md` R-5.

`Changes` records `AssignedToUserId` before and after, and nothing else. There is
nothing sensitive in an assignment, which makes BR-9.7 easy here — noted so a reviewer
does not have to check twice.

## Frontend

| Component | Kind (ADR-011 §4) | Purpose |
|---|---|---|
| `TicketDetailPage` | Route / page | Owns both queries and the mutation; shows the current assignee in the summary strip |
| `AssigneeSelect` | Feature component | Lists active users, includes an "Unassigned" option, receives data and handlers as props |
| `Select`, `Button`, `Badge` | Primitive | — |

Fetching only at the route level (ADR-011 §4), so the picker never fetches when it
opens — the request is known when the route loads. The support-users query hook lives in
`features/tickets/` rather than a `features/supportUsers/` folder, because tickets are
its only consumer; ADR-011 §3 says to move something when the second consumer appears,
not when one is imagined.

The picker is enabled or disabled based on the caller's role and the current assignee —
the client mirrors BR-2 for usability. A `403` is still handled, because the client's
copy of the rule can be stale.

Full screen binding, states, keys, and RTL obligations:
[`frontend-spec.md`](frontend-spec.md). API surface:
[`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md).

## Localization Impact

| Item | Detail |
|---|---|
| New client strings | The assignee picker label, the "Unassigned" option, the reassign confirmation, and the permission-denied message |
| New server messages | `Error.AssigneeInactive`, `Error.AssigneeNotFound`, `Error.TicketClosed`, `Error.AssigneeUnchanged`, and the forbidden message |
| Direction-sensitive layout | A dropdown and an avatar or name pairing; the name must sit on the correct side of the avatar |
| User content | Support-user names are seeded and may be Arabic; `dir="auto"` applies |
| Not translated | The `assigneeId` key in `errors`, both new `type` values, and a support user's `role` value (BR-8.7) |

The `403` message is server-authored and therefore server-translated. The client mirrors
BR-2 to disable the control, and that mirrored explanation is a *client* string saying
the same thing in a different place. Both need Arabic, and they must not contradict each
other — the review checks that they read consistently.

One thing that fails silently: the picker's ordering. `GET /api/support-users` returns
users ordered by `FullName` under the **database** collation, which does not follow
`Accept-Language`. A mixed Arabic and English list therefore arrives in an order that
looks arbitrary to an Arabic reader and correct to an English one. The client sorts with
`Intl.Collator` in the active locale; the server's order is only a stable default.

## Test Strategy

| Level | Covered | Why here |
|---|---|---|
| Unit | `TicketAssignmentPolicy`, all four branches, both roles | Pure decision logic, and the widest input space in the story |
| Unit | `Ticket.AssignTo` rejects a closed ticket and a no-op; history row appended with old and new values | Domain behaviour, no database needed |
| Integration | AC-1 – AC-8, AC-11, AC-12, AC-14, each with real tokens | Authorization is proven only with real tokens. A faked user proves that a string was read |
| Integration | History row content, old and new assignee | Needs persistence |
| Integration | One audit row on success, none after a forced rollback; one `Denied` row on `403`, written outside the transaction | BR-9.3 and BR-9.4 are opposite obligations, and each is visible only in a test |
| Integration | An Arabic `FullName` returned byte-identical from `GET /api/support-users` | `varchar` renders Arabic as `????`, and it looks like a font bug (ADR-013 row 4) |
| Frontend | Picker disabled state, `403` message, current assignee rendered from the ticket response | The mirrored rule, and the inactive-assignee trap |

**A trap in the `403` tests.** An integration test that sends a stale `expectedVersion`
while asserting `403` gets `409` instead (R-6 fixes that ordering) and still passes if it
asserts only "not `200`". Every authorization test asserts the exact status **and** the
`type`.

Not tested: the mapping from entity to response, which has no behaviour.

## Dependencies

| Depends on | For |
|---|---|
| `001-solution-skeleton` | Solution, `DbContext`, the test harness with `Testcontainers.MsSql` |
| `002-error-contract` | The single middleware, and the registry the two new `type` values are added to |
| `003-audit-trail` | `IAuditableCommand`, the audit behaviour, and the transaction behaviour that makes BR-9.3 structural |
| `004-auth-and-roles` | Real tokens carrying `sub` and `role` |
| `005-localization-core` | `IStringLocalizer` and both catalogues |
| `009-create-ticket` | `Tickets`, `TicketHistory`, `AssignedToUserId`, `IX_Tickets_Assignee` |
| `010-ticket-list-and-detail` | The ticket read representation this endpoint returns, and the screen that hosts the picker |

## Risks and Trade-offs

| Decision | Alternative | Why rejected |
|---|---|---|
| Permission rule decided in the handler, from data it loads | Attribute-based policy at the API boundary | The boundary has neither the current assignee nor the request body, so the rule cannot be expressed there |
| `TicketAssignmentPolicy` in `Wasl.Domain` | Inside the `AssignTicket` slice | Under ADR-010 the slice is testable only through the integration project, so eight branches would cost eight container round-trips instead of eight unit tests |
| `TicketAssignmentPolicy` as its own type | Inline in the handler | Four branches inline are hard to test exhaustively and easy to get subtly wrong |
| Permission in a pure policy, invariants in `Ticket` | All of BR-2 inside the entity | The entity would take the caller's identity as a parameter on every call, which is not a ticket concern |
| `null` assignee means unassign | Separate `DELETE` endpoint | Same field, same action, same history sequence; two endpoints would need the same rules twice |
| Sub-resource `PUT` | `PATCH /api/tickets/{id}` | A generic patch makes the state machine unenforceable and collapses two business actions with different rules into one request shape. `research.md` R-2 |
| Assignment does not change status | Auto-advance `New → Open` | BR-2.7 and ADR-004: coupling would erase the triage event from the history |
| No-op assignment returns `409` | Return `200` | Consistent with BR-1.9; a no-op usually indicates a stale client |
| `expectedVersion` checked before the permission decision | Check it at `SaveChanges` only | A `403` computed from a row the client has not seen may be wrong, and the client cannot tell that it might be. R-6 |
| `GET /api/support-users` returns a plain array | The paged envelope from BR-7 | The set is seeded and bounded; a page control nobody can use is worse than none. The cost is that user management would make this a breaking change, recorded as `spec.md` A-4 |
| Two new `ProblemDetails` types | Reuse `errors/not-found` and `errors/concurrency-conflict` | The client's recovery differs — reload the ticket, refresh the picker, or refetch — and the only alternative signal is a translated `detail`. Parsing a translated sentence is the failure BR-8.7 exists to prevent. R-3 |

## Files to Create or Change

```text
src/Wasl.Domain/Tickets/Ticket.cs                                     (AssignTo)
src/Wasl.Domain/Tickets/TicketAssignmentPolicy.cs
src/Wasl.Domain/Tickets/TicketAssignmentDenialReason.cs
src/Wasl.Domain/Tickets/TicketClosedException.cs                      (may already exist from 009)
src/Wasl.Domain/Tickets/AssigneeUnchangedException.cs
src/Wasl.Domain/Tickets/AssignmentNotPermittedException.cs
src/Wasl.Api/Features/Tickets/AssignTicket/AssignTicketEndpoint.cs
src/Wasl.Api/Features/Tickets/AssignTicket/AssignTicketCommand.cs
src/Wasl.Api/Features/Tickets/AssignTicket/AssignTicketHandler.cs
src/Wasl.Api/Features/Tickets/AssignTicket/AssignTicketValidator.cs
src/Wasl.Api/Features/SupportUsers/ListSupportUsers/ListSupportUsersEndpoint.cs
src/Wasl.Api/Features/SupportUsers/ListSupportUsers/ListSupportUsersQuery.cs
src/Wasl.Api/Features/SupportUsers/ListSupportUsers/ListSupportUsersHandler.cs
src/Wasl.Api/Features/SupportUsers/ListSupportUsers/SupportUserResponse.cs
src/Wasl.Api/Common/Errors/ProblemTypes.cs                            (two additions)
src/Wasl.Api/Common/Localization/Resources.en.resx                    (four message keys)
src/Wasl.Api/Common/Localization/Resources.ar.resx                    (the same four)
src/wasl-web/src/features/tickets/AssigneeSelect.tsx
src/wasl-web/src/features/tickets/AssigneeSelect.test.tsx
src/wasl-web/src/features/tickets/api.ts                              (assignAssignee, fetchSupportUsers)
src/wasl-web/src/features/tickets/queries.ts                          (useSupportUsers, useAssignAssignee)
src/wasl-web/src/features/tickets/schema.ts                           (the assign request schema)
src/wasl-web/src/features/tickets/TicketDetailPage.tsx                (hosts the picker; owned by 010)
src/wasl-web/src/locales/en/tickets.json                              (assignee keys)
src/wasl-web/src/locales/ar/tickets.json                              (the same keys)
tests/Wasl.Domain.Tests/Tickets/TicketAssignmentPolicyTests.cs
tests/Wasl.Domain.Tests/Tickets/TicketAssignmentTests.cs
tests/Wasl.Api.IntegrationTests/Tickets/AssignTicketTests.cs
tests/Wasl.Api.IntegrationTests/SupportUsers/ListSupportUsersTests.cs
```

No migration file. See **Data Changes**.

## Contract changes

First contract for both endpoints:
[`contracts/ticket-assignee-api.md`](contracts/ticket-assignee-api.md), frozen
2026-08-23. Nothing existed before it, so nothing is broken. The heading stays even
when empty — an empty contract-changes section is the statement that the contract did
not move.

It does add two entries to the shared `ProblemDetails` type registry owned by
`002-error-contract`:

| Added `type` | Status | Why a new type rather than an existing one |
|---|---|---|
| `errors/assignee-not-found` | `404` | Two different 404s reach this endpoint — the ticket and the target user — and the client's recovery differs. A `404` carries no `errors` dictionary, so a field name cannot disambiguate them |
| `errors/assignee-unchanged` | `409` | The recovery is "refetch and show the current assignee". Reusing `errors/concurrency-conflict` would tell the user someone else changed the ticket, which is false |

`DOC-011-01` adds both rows to `docs/sdd/documentation/api/error-handling.md`. A `type`
that exists in a response and not in the registry is how a client ends up with a
`default:` branch that swallows a real error.

The frontend lane reads [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md) and may start
as soon as that file exists; it does not wait for `BE-011-05`.

### 2026-08-28 — three entries from implementation

Both endpoints shipped. The contract did not move; three things about the agreement between the
lanes changed or were clarified, and each is here rather than in a commit message.

#### 1 · `assignee` is an added field, not a replaced one — `spec.md` Q-5

The frozen contract shows the `200` body carrying `assignee` as a nested object
`{ id, fullName, role }`. `009`'s and `010`'s frozen contracts show a bare
`assignedToUserId`. Three shapes existed for one concept, and the product owner ruled: return
the nested object and change nothing else, because **aligning all three would be a breaking
change to two frozen contracts the frontend has already built against** — `024` reads a
hand-written `api-types.provisional.ts` derived from them.

Implemented as an **addition** to the one shared ticket DTO:

| Endpoint | `assignedToUserId` | `assignee` |
|---|---|---|
| `POST /api/tickets` | present | present, `null` — a create never has one (BR-2.7) |
| `GET /api/tickets/{id}` | present | present, populated when assigned |
| `PUT /api/tickets/{id}/status` | present | present, populated when assigned |
| `PUT /api/tickets/{id}/assignee` | present | present — the contract's shape |
| `GET /api/tickets` (paged list) | — | — flat `assigneeId` + `assigneeName`, **unchanged** |

Adding a field is backward-compatible; replacing one is not. So no client breaks and no frozen
contract is amended. The alternative — a second seventeen-field DTO for this endpoint with its own
mapper — is the "second shape to keep in step" `012` declined for the same reason, and it would
have meant `allowedTransitions` and `version` computed in two places.

**Known limitation, stated so it is not discovered:** `assignedToUserId` is now redundant with
`assignee.id`, and the paged list still uses a third shape because it is a single-query projection.
Removing the redundant field and aligning the list **will be a breaking change** when it happens.
**Owner: `010-ticket-list-and-detail`**, which owns the read shape. Nothing in `011` should be read
as having settled it.

#### 2 · A malformed route `Guid` returns `404`, and the contract says `400` — `spec.md` Q-6

The contract states: *"A malformed `Guid` in the route is `400`, not `404`."* The observed
behaviour is `404`. ASP.NET Core's `:guid` route constraint fails the route match before any
action runs, so nothing `002` built ever sees the request.

**`CLAUDE.md`: "a difference is a defect in one of the two, never fixed silently."** It is a defect
in the implementation, not in the contract — the contract's answer is the better one, because a
client cannot distinguish "this ticket does not exist" from "you sent nonsense" and the two need
different reactions. It is **not** fixed here: enveloping the statuses the framework
short-circuits is `002b`'s task and was split out with a written reason.

`AssignTicketTests.A_malformed_route_id_returns_404_which_the_contract_says_should_be_400` asserts
today's behaviour and names the contract it violates in its own remarks, so the day `002b` lands
the test goes red at the line that says why. Asserting the contract's `400` instead would have
failed immediately for a reason unconnected to this feature.

Also recorded in the README's known defects. This entry exists because the README is where a
reader looks and `plan.md` is where the two lanes agree.

#### 3 · The `403` body, and what it deliberately does not contain

Unchanged from the contract, restated because the live response is now available and a reviewer
will compare them:

```json
{
  "type": "https://wasl.local/errors/forbidden",
  "title": "You do not have permission to do that.",
  "status": 403,
  "detail": "You are not permitted to change this ticket's assignee.",
  "instance": "/api/tickets/01a04526-0109-.../assignee",
  "traceId": "00-ca21e64965cd04a6e98e08d84a492460-209b7734f58180ed-00"
}
```

No `errors` dictionary, and the `detail` names neither the current assignee nor the permitted
target. An Agent could otherwise learn who owns every ticket they are refused, one request at a
time. The client branches on `type`; a client branching on `title` was already broken, because
`title` is translated and `type` is not.

---

## Deviations from this plan

| # | The plan said | Built | Why |
|---|---|---|---|
| D-1 | A separate `TicketAssignmentPolicy` class in `Wasl.Domain`, unit-testable without a database, **because ADR-010 removed the `Wasl.Application` test project** | A private `EnsurePermitted` in `AssignTicketCommandHandler` | **The premise is gone: ADR-010 was rejected and `Wasl.Application.Tests` exists.** The plan's own reasoning was that a policy class in `Wasl.Api` would only be reachable from the integration suite. That is no longer true, and the plan's original objection — which it quotes and then overrules — was right: BR-2.1–BR-2.3 need the caller's identity and role, which are not ticket concerns and would drag `ICurrentUser`'s shape into `Wasl.Domain`. The rules are in the handler, where the identity already is; the two that *are* ticket invariants (BR-2.5, AC-11) are in `Ticket.Assign`. Exhaustive coverage is not lost: eleven domain unit tests cover the entity's half with no database, and the handler's half is covered by six integration tests that need a token anyway — a policy class could not have been tested without one either |
| D-2 | Two new registry types | Same two, plus a fourth exception type `AssigneeInactiveException` carrying `FieldErrors` | AC-6's `400` must key its message on `assigneeId`, and `InvariantViolationException` has no field-error channel. Follows `012`'s `NoteRequiredException` rather than inventing a second mechanism. No new registry row — it maps to the existing `errors/validation` |
| D-3 | — | A second seeded Agent, and a third `Seed:*` password with no default | `spec.md` Q-7. With two users, BR-2.3's "someone else" is always the Manager, so the case that actually happens — one agent taking a colleague's ticket — could not be distinguished from a rarer one. One row makes AC-4 provable instead of asserted |
