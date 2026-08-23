# EPIC-003 — Communication Channels

## Goal

The system records which channel a ticket originated from and which channel an
interaction arrived through, and can filter on it.

## Business value

Support teams need to know where demand comes from and to reply through the channel
the customer used. Recording the channel is what makes both possible later.

## Scope decision

**This epic contributes fields, not screens.** It has no stories of its own in
Release 1.

The requirement (FR-3) is satisfied by:

- `Ticket.Channel` — delivered in US-005
- `TicketComment.Channel` — delivered in US-010
- Channel filter on the ticket list — delivered in US-006

Earlier drafts of the backlog carried US-011 *Channel Classification* as a separate
story. It was removed because it described a field on an entity rather than a unit of
deliverable value, and keeping it would have made the board look larger without
adding work. The decision is recorded in `08-board.md`.

## Requirements covered

FR-3.1 through FR-3.4

## Deferred stories

| Story | Title | Why deferred |
|---|---|---|
| US-012 | Provider Abstraction | An abstraction with exactly one implementation and no second one in prospect is speculative design. It would be introduced when a real provider is added |
| US-013 | Incoming Interaction Registration | Requires an inbound webhook contract and provider authentication, both out of scope |

## Out of scope

- Live delivery through WhatsApp, SMS, or email
- Inbound webhooks
- Per-channel templates and formatting
- Delivery status and read receipts

## Done when

Channel is captured on ticket creation and on interactions, and the ticket list can be
filtered by it.
