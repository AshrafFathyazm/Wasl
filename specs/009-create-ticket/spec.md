# 009 — Create Ticket

**Phase:** 2 · **Story:** US-005 · **Feature:** `009-create-ticket` ·
**Status:** Reconciled 2026-08-25 against `001`–`003` and four product-owner decisions;
approved for implementation

> **The split, and the four decisions.** Every acceptance criterion below is tagged **`·C`**
> (`009`, runs now), **`·b`** (deferred, with the owning feature named) or **`·FE`** (a
> different feature entirely). Decided 2026-08-25.
>
> **1 · `009` ships without authentication.** `004-auth-and-roles` comes after this feature
> and after `012` in `docs/sdd/16-three-day-plan.md`. So `createdByUserId` is **null** in the
> `201` — the field stays in the response shape and stays nullable in the DTO, because
> removing it and adding it back is a breaking change for the frontend, while a null it
> handles from day one is not. **The frozen contract does not change.** AC-12 and AC-13 are
> `·b`, owner `004`. Rejected: a forgeable header or a stub claim to fill the field — ADR-005
> rejected exactly that, and `003`'s `ICurrentUser` returning nulls is the *correct* answer
> for a system with no authentication, not a gap.
>
> **2 · The BR-1 transition map and all 36 tests are built here**, moved from `012`. AC-10
> needs `allowedTransitions` and `CLAUDE.md` allows the map to exist once, in `Wasl.Domain`.
> A rules table half of which is verified is not a rules table — and the API returns from it,
> so an unverified cell reaches the screen as a button. `012` keeps `PUT /status` and
> optimistic concurrency.
>
> **3 · `GET /api/tickets/{id}` is built here**, moved from `010`. The contract promises
> `Location` works and `TEST-009-03` gets a resource from it. A `201` whose `Location`
> returns `404` is a broken API, and `010` lands after `012` — so it would stay broken
> through the demo. `010` keeps the list and both screens.
>
> **4 · Four foreign keys are deferred to `004`.** `data-model.md` claimed `SupportUsers`
> already existed; it does not exist anywhere in source. `CreatedByUserId`,
> `PerformedByUserId`, `AssignedToUserId` and `EscalatedByUserId` are
> `uniqueidentifier NULL` with no key. `data-model.md` carries the correction and the two
> other false statements it contained.
>
> **The frontend is `024-frontend-create-ticket-form`.** AC-14 and AC-15 are `·FE` with that owner,
> the frozen contract, and `FRONTEND-API-GUIDE.md` as their input. `009` closes as a
> complete backend feature — which is the mechanism `CLAUDE.md` describes, not a shortfall.
>
> **Budget.** `docs/sdd/16-three-day-plan.md` allots 50 minutes to "`Ticket` domain type,
> `CreateTicketCommand`, validator, `POST /api/tickets`". With the transition map, its 36
> tests, `TicketHistory`, the sequence, and the read endpoint, this is closer to 2 hours.
> Decisions 2 and 3 moved work **into** this feature deliberately; the plan's Session 2
> item 1 moved with them.

## Understanding

A ticket is the record of one customer problem, from report to resolution. It always
belongs to exactly one customer, carries the classification the team routes on
(category, priority, channel), and starts its life untriaged.

This story creates the central entity of the product and the history table every later
ticket story writes to. Getting the shape right here is cheaper than migrating it
later.

## In Scope

- Creating a ticket against an existing customer
- Category, priority, and channel as required classification
- A unique human-readable ticket number
- Initial status `New`, no assignee
- The `TicketHistory` table and the first `Created` row
- Returning `allowedTransitions` in the response shape — **computed** from the map plus its
  conditions, never written out. A `New` ticket has no assignee, so the answer is
  `["Open", "Closed"]`; the same call on an `Open` ticket with no assignee must exclude
  `InProgress`, which is why the signature takes the assignee
- **`TicketStatusTransitions` — the whole BR-1 map and all 36 transition tests** (moved from
  `012`, decision 2)
- **`GET /api/tickets/{id}`** — the same DTO and the same mapping as the `201` (moved from
  `010`, decision 3). Nothing more: no timeline, no comments, no extra include
- ~~A create-ticket form with a customer picker~~ → **`024-frontend-create-ticket-form`**

## Out of Scope

| Excluded | Reason |
|---|---|
| Assignment on creation | US-007. Creation and routing are separate decisions |
| `PUT /api/tickets/{id}/status` and optimistic concurrency | `012`. The **map** is here (decision 2); the endpoint that writes through it is not |
| The ticket list and both screens | `010`. The **detail read** is here (decision 3); the list is not |
| Authentication, `SupportUsers`, and four foreign keys | `004`. See the split note and `data-model.md` |
| The create-ticket form | `024-frontend-create-ticket-form`. Contract frozen, `FRONTEND-API-GUIDE.md` is its input |
| Comments | US-010 |
| Ticket templates | No requirement |
| Attachments | Out of scope project-wide |
| Auto-classification by keyword | No requirement, and it would need a rule engine |

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | A ticket has exactly one customer and cannot be moved between customers | Moving a ticket needs a history event and a story of its own |
| A-2 | The four categories in `03-domain-model.md` are sufficient | Adding one is an enum value plus a migration if stored as a constrained type |
| A-3 | The reporting channel is known at creation and does not change | If a ticket can move channel, that is a change event, not a field edit |
| A-4 | Ticket numbers are globally sequential, not per-customer or per-year | Per-year reset would make the number non-unique across years |

## Open Questions

| # | Question | Working assumption |
|---|---|---|
| Q-1 | Should the ticket number be shown to the customer? | Assumed yes, which is why it is human-readable. If it is internal-only, a `Guid` would have been sufficient and the sequence is unnecessary complexity |
| Q-2 | Should creating a ticket for an inactive customer be allowed? | Yes. Deactivation is not in this release, and blocking it would create a state with no exit |
| Q-3 | Does a rejected create — a `400` or the `404` for an unknown customer — write an audit row? | **No.** BR-9.1 covers state changes and BR-9.2 covers authentication and authorization events; a request rejected at the boundary is neither. BR-9.4's "denied or failed" is read as *denied by authorization* or *failed after the change was attempted*. The working assumption is therefore: `201` writes `Ticket.Created` in-transaction, `401` writes `Auth.Unauthenticated` outside any transaction, and a `400`/`404` writes nothing. If the product owner wants failed validation audited, it is a change to the behaviour's filter, not to this feature — but it would make the log mostly noise, which is why the default is off |
| Q-4 | Is there a `403` path on this endpoint? | **No.** BR-6 permits *create ticket* for both `Agent` and `Manager`, so there is no role that can authenticate and be refused. Recorded rather than left implicit, because every other ticket feature in Phase 2 does have one and the absence here is easy to read as an omission |

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 **·C** | `POST /api/tickets` with valid input returns `201` with a `Location` header |
| AC-2 **·C** | The created ticket has status `New` and a null assignee (BR-1.1) |
| AC-3 **·C** | The ticket number matches `TCK-{yyyy}-{000000}` and is unique |
| AC-4 **·C** | A missing `customerId` returns `400`; an unknown `customerId` returns `404` |
| AC-5 **·C** | An invalid value for `category`, `priority`, or `channel` returns `400` listing the accepted values |
| AC-6 **·C** | `subject` is required and limited to 200 characters; `description` to 4000. Violations return `400` |
| AC-7 **·C** | A whitespace-only `subject` or `description` returns `400` |
| AC-8 **·C** | `priority` defaults to `Normal` when omitted |
| AC-9 **·C** | A `TicketHistory` row of type `Created` is written in the same transaction (BR-1.8) |
| AC-10 **·C** | The response includes `allowedTransitions` for status `New`, which is `["Open", "Closed"]` |
| AC-11 **·C** | Two concurrent creations receive two different ticket numbers |
| AC-12 **·b** · owner `004-auth-and-roles` | `createdByUserId` is taken from the token, never from the request body. **Not verifiable in `009`** — there is no token. What `009` does prove: the field is never read from the body, so a value sent there is ignored today and will still be ignored when a token exists |
| AC-13 **·b** · owner `004-auth-and-roles` | An unauthenticated request returns `401`. **Not verifiable in `009`** — the endpoint is unauthenticated, so every request is. `002` already ships the `errors/unauthenticated` registry row, so `004` adds the middleware and nothing else |
| AC-14 **·FE** · owner `024-frontend-create-ticket-form` | The form's customer picker searches by name, email, and phone, and cannot submit without a selection |
| AC-15 **·FE** · owner `024-frontend-create-ticket-form` | The form handles loading, validation errors, and server errors |

## Edge Cases

From `testing/edge-cases.md`: whitespace-only strings, boundary lengths, unicode in
the subject, unknown enum value, malformed `Guid`, unknown `Guid`, two simultaneous
creations, double-submitted form, unknown field in the body.

Specific to this story:

| Case | Expected |
|---|---|
| `createdByUserId` supplied in the body | Ignored. The token is the only source (AC-12) |
| Ticket number sequence reaches 999999 | Format widens rather than wrapping; documented as a known limit, not handled in code |
| Customer deleted between the picker and submit | `404` — deletion does not exist in this release, but the endpoint must not return `500` |

## Rules Referenced

BR-1.1, BR-1.8, BR-6, FR-2.1 – FR-2.3, FR-3.2

Added in migration, because this specification predates ADR-008: **BR-9.1, BR-9.2,
BR-9.3, BR-9.4** (the audit row for `Ticket.Created`, and the independent row for a
`401`) and **BR-8.7, BR-8.13** (`TicketNumber` and the enum values are identical in
every locale). No acceptance criterion changed and none was renumbered — other features
cite these numbers. The audit obligation lands as `BE-009-09` and `BE-009-10` in
[`tasks.md`](tasks.md), which is where 007 put it too.
