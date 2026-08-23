# US-005 — Create Ticket

**Epic:** EPIC-002 · **Release:** 1 · **Depends on:** US-001

## Story

As a **Support Agent**,
I want to **raise a ticket against a customer**,
so that **their issue is tracked to resolution**.

## Business value

The central object of the product. Every other ticket story depends on this one.

## Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | `POST /api/tickets` with a valid customer, subject, description, category, priority, and channel returns `201` with a `Location` header |
| AC-2 | The created ticket has status `New` and no assignee (BR-1.1) |
| AC-3 | The ticket has a unique human-readable number in the form `TCK-{yyyy}-{000000}` |
| AC-4 | A missing or unknown `customerId` returns `400` for missing and `404` for unknown, and is never `500` |
| AC-5 | An invalid enum value for category, priority, or channel returns `400` naming the field and the accepted values |
| AC-6 | Subject and description are required and length-limited; violations return `400` |
| AC-7 | Priority defaults to `Normal` when omitted |
| AC-8 | A `TicketHistory` row of type `Created` is written in the same transaction (BR-1.8) |
| AC-9 | The response includes `allowedTransitions` for the new status (ADR-004) |
| AC-10 | Two concurrent creations receive two different ticket numbers |

## Rules referenced

BR-1.1, BR-1.8, FR-3.2

## Out of scope

Templates, bulk creation, attachments, auto-assignment on creation.

## Notes

AC-10 is the reason the ticket number comes from a database sequence rather than a
row count. See `03-domain-model.md`.

## Definition of Done

`09-definition-of-done.md`
