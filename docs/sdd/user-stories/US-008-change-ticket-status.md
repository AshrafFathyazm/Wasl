# US-008 — Change Ticket Status

**Epic:** EPIC-002 · **Release:** 1 · **Depends on:** US-005, US-007

## Story

As a **Support Agent**,
I want to **move a ticket through its lifecycle**,
so that **its state reflects reality and the team can trust the queue**.

## Business value

The status field is what everyone filters, reports, and prioritises on. If it can be
set arbitrarily, none of those are reliable.

## Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | `PUT /api/tickets/{id}/status` performs a permitted transition and returns `200` with the updated ticket |
| AC-2 | Every transition not marked permitted in the BR-1 matrix returns `409` with `errors/invalid-status-transition` |
| AC-3 | The error names the current status and the permitted transitions from it |
| AC-4 | Moving to `InProgress` without an assignee returns `409` (BR-1.3) |
| AC-5 | `New → Closed` and `Open → Closed` require a non-empty note; omitting it returns `400` (BR-1.2) |
| AC-6 | `PendingCustomer → Resolved` is rejected (BR-1.4) |
| AC-7 | No transition out of `Closed` is accepted (BR-1.5) |
| AC-8 | Moving to `Closed` sets `ClosedAtUtc` (BR-1.7) |
| AC-9 | Every accepted transition writes a `StatusChanged` history row in the same transaction (BR-1.8) |
| AC-10 | Transitioning to the current status returns `409` (BR-1.9) |
| AC-11 | An Agent changing the status of a ticket assigned to someone else returns `403`; a Manager may do it (BR-6) |
| AC-12 | A stale `expectedVersion` returns `409` with `errors/concurrency-conflict` (ADR-006) |
| AC-13 | The UI renders only the transitions in `allowedTransitions` and still surfaces a server rejection if one occurs |

## Rules referenced

BR-1.1 – BR-1.9, BR-6, ADR-004, ADR-006

## Out of scope

Bulk status change, scheduled auto-close of resolved tickets, reopening a closed
ticket, per-transition custom fields.

## Notes

This is the highest-value story for demonstrating engineering judgement: it contains
the state machine, the authorization split, and the concurrency contract in one place.
Every transition in the BR-1 matrix, permitted and forbidden, gets a unit test — the
forbidden ones are the point.

## Definition of Done

`09-definition-of-done.md`
