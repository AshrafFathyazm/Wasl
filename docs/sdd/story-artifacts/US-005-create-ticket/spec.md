# US-005 — Specification

**Phase:** 1 · **Role:** Specification · **Status:** Complete

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
- Returning `allowedTransitions` in the response shape
- A create-ticket form with a customer picker

## Out of Scope

| Excluded | Reason |
|---|---|
| Assignment on creation | US-007. Creation and routing are separate decisions |
| Status changes | US-008 |
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

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | `POST /api/tickets` with valid input returns `201` with a `Location` header |
| AC-2 | The created ticket has status `New` and a null assignee (BR-1.1) |
| AC-3 | The ticket number matches `TCK-{yyyy}-{000000}` and is unique |
| AC-4 | A missing `customerId` returns `400`; an unknown `customerId` returns `404` |
| AC-5 | An invalid value for `category`, `priority`, or `channel` returns `400` listing the accepted values |
| AC-6 | `subject` is required and limited to 200 characters; `description` to 4000. Violations return `400` |
| AC-7 | A whitespace-only `subject` or `description` returns `400` |
| AC-8 | `priority` defaults to `Normal` when omitted |
| AC-9 | A `TicketHistory` row of type `Created` is written in the same transaction (BR-1.8) |
| AC-10 | The response includes `allowedTransitions` for status `New`, which is `["Open", "Closed"]` |
| AC-11 | Two concurrent creations receive two different ticket numbers |
| AC-12 | `createdByUserId` is taken from the token, never from the request body |
| AC-13 | An unauthenticated request returns `401` |
| AC-14 | The form's customer picker searches by name, email, and phone, and cannot submit without a selection |
| AC-15 | The form handles loading, validation errors, and server errors |

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
