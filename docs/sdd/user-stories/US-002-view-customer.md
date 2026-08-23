# US-002 — View Customer

**Epic:** EPIC-001 · **Release:** 1 · **Depends on:** US-001

## Story

As a **Support Agent**,
I want to **view a customer's profile and find a customer quickly**,
so that **I can confirm who I am dealing with before raising a ticket**.

## Business value

Creating a duplicate customer is usually caused by being unable to find the existing
one. Search is the preventive half of the duplicate rule.

## Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | `GET /api/customers/{id}` returns the profile with name, contact details, company, notes, and timestamps |
| AC-2 | An unknown id returns `404` with the standard error contract |
| AC-3 | The response includes the concurrency `version` (ADR-006) |
| AC-4 | `GET /api/customers` returns a paginated list with defaults of page 1 and page size 20 (BR-7.2) |
| AC-5 | A `search` parameter matches name, email, and phone, case-insensitively |
| AC-6 | An empty result returns `200` with an empty array, never `404` (BR-7.6) |
| AC-7 | The customer profile screen handles loading, error, and not-found states distinctly |

## Rules referenced

BR-7.2, BR-7.6

## Out of scope

Fuzzy matching, ranking, phonetic search, the ticket panel (that is US-004).

## Definition of Done

`09-definition-of-done.md`
