# US-003 — Update Customer

**Epic:** EPIC-001 · **Release:** 2 · **Depends on:** US-002

## Story

As a **Support Agent**,
I want to **correct a customer's details**,
so that **we can keep contacting them after their details change**.

## Business value

Contact details go stale. A CRM that cannot correct them accumulates unreachable
records.

## Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | `PUT /api/customers/{id}` updates name, email, phone, company, and notes and returns `200` with the updated resource |
| AC-2 | The duplicate rule applies to updates exactly as it does to creation — changing an email to one already in use returns `409` (BR-4.4) |
| AC-3 | The contact invariant survives updates: clearing both email and phone returns `400` (BR-4.1) |
| AC-4 | A stale `expectedVersion` returns `409` with `errors/concurrency-conflict` (ADR-006) |
| AC-5 | An unknown id returns `404` |
| AC-6 | The UI offers a reload path on a concurrency conflict rather than retrying |

## Rules referenced

BR-4.1 – BR-4.8, ADR-006

## Out of scope

Field-level change history for customers, partial update via `PATCH`, deactivation.

## Notes

This story is where the concurrency contract is first exercised on a write. It is in
Release 2 because create and view already prove the read and write paths; if
concurrency needs to be demonstrated earlier, US-008 exercises it on tickets.

## Definition of Done

`09-definition-of-done.md`
