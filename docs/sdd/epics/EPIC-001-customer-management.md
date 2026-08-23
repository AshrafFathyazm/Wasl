# EPIC-001 — Customer Management

## Goal

Support staff can create, find, and maintain customer records, and see everything
that has happened with a customer in one place.

## Business value

Every ticket belongs to a customer. Without reliable customer records, tickets cannot
be grouped, history cannot be reconstructed, and the same person is served as if they
were three different people.

## Stories

| Story | Title | Release |
|---|---|---|
| US-001 | Create Customer | 1 |
| US-002 | View Customer | 1 |
| US-003 | Update Customer | 2 |
| US-004 | Customer Overview | 2 |

## Requirements covered

FR-1.1 through FR-1.6

## Key rules

- BR-4 — duplicate customer rule

## Out of scope

- Customer merge and de-duplication of existing records
- Customer import
- Attachments on a customer record
- Hard delete — deactivation only

## Done when

A customer can be created, retrieved, and shown with their tickets, and the duplicate
rule is enforced by both a database constraint and a friendly application-level error.
