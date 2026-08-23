# EPIC-002 — Ticket Management

## Goal

A ticket can be raised against a customer, routed to an owner, moved through a
controlled lifecycle, discussed, escalated when it matters, and audited afterwards.

## Business value

This is the product. Everything else exists to support it.

## Stories

| Story | Title | Release |
|---|---|---|
| US-005 | Create Ticket | 1 |
| US-006 | List and Filter Tickets | 1 |
| US-007 | Assign Ticket | 1 |
| US-008 | Change Ticket Status | 1 |
| US-010 | Ticket Timeline and Comments | 1 |
| US-009 | Escalate Ticket | 2 |

## Requirements covered

FR-2.1 through FR-2.9

## Key rules

- BR-1 — status state machine
- BR-2 — assignment
- BR-3 — escalation
- BR-5 — comments and history
- BR-6 — authorization
- BR-7 — listing and filtering

## Out of scope

- SLA timers and automatic escalation
- Ticket merging, splitting, or linking
- Bulk operations
- Saved views and custom filters
- Reopening a closed ticket

## Done when

The full lifecycle runs end to end, invalid transitions are rejected by the server,
and every significant change appears in the ticket timeline.
