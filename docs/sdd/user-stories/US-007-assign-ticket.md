# US-007 — Assign Ticket

**Epic:** EPIC-002 · **Release:** 1 · **Depends on:** US-005

## Story

As a **Support Manager**,
I want to **assign and reassign tickets**,
so that **every ticket has a clear owner**.

## Business value

An unowned ticket is not being worked. Assignment is what turns a list into a
workload.

## Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | `PUT /api/tickets/{id}/assignee` with a Manager token assigns any ticket to any active user and returns `200` (BR-2.1) |
| AC-2 | An Agent may assign an **unassigned** ticket to themselves (BR-2.2) |
| AC-3 | An Agent assigning to anyone other than themselves returns `403` (BR-2.2) |
| AC-4 | An Agent reassigning a ticket already assigned to someone else returns `403` (BR-2.3) |
| AC-5 | Assigning to an inactive or unknown user returns `400` for inactive and `404` for unknown (BR-2.4) |
| AC-6 | Assigning a `Closed` ticket returns `409` (BR-2.5) |
| AC-7 | Assignment writes a `TicketHistory` row of type `Assigned`; clearing writes `Unassigned` (BR-2.6) |
| AC-8 | Assigning a `New` ticket leaves its status unchanged (BR-2.7) |
| AC-9 | A stale `expectedVersion` returns `409` with `errors/concurrency-conflict` |
| AC-10 | `GET /api/support-users` returns active users for the assignee picker |

## Rules referenced

BR-2.1 – BR-2.7, BR-6, ADR-006

## Out of scope

Round-robin or load-based auto-assignment, teams and queues, out-of-office handling,
assignment notifications.

## Notes

AC-3 and AC-4 are the first place the authorization matrix is genuinely tested. Both
must be integration tests against real tokens, not unit tests against a faked user.

## Definition of Done

`09-definition-of-done.md`
