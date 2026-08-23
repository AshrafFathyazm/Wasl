# US-004 — Customer Overview

**Epic:** EPIC-001 · **Release:** 2 · **Depends on:** US-002, US-005, US-010

## Story

As a **Support Agent**,
I want to **see a customer's tickets and recent interactions on one screen**,
so that **I have context before I respond**.

## Business value

Answering a customer without knowing what they contacted us about last week is how
support teams lose trust. This screen is where the CRM stops being a database.

## Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | `GET /api/customers/{id}/overview` returns the profile, ticket counts by status, and the most recent tickets |
| AC-2 | Recent tickets are capped at 10 and sorted by creation date descending |
| AC-3 | A customer with no tickets returns counts of zero and an empty list, with an empty state in the UI |
| AC-4 | The response is produced without an N+1 query — counts are a single grouped query |
| AC-5 | An unknown id returns `404` |

## Rules referenced

BR-7.1

## Out of scope

Cross-channel interaction feed, activity charts, customer-level SLA figures.

## Notes

This story creates a genuine query-performance question: naive implementations issue
one query per status. AC-4 exists to make that explicit rather than leaving it to
review.

## Definition of Done

`09-definition-of-done.md`
