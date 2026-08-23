# US-009 — Escalate Ticket

**Epic:** EPIC-002 · **Release:** 2 · **Depends on:** US-008

## Story

As a **Support Manager**,
I want to **escalate a ticket with a reason**,
so that **urgent issues are visibly separated from the normal queue**.

## Business value

Every queue eventually needs a way to say "this one is different" that survives being
passed between people.

## Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | `POST /api/tickets/{id}/escalate` with a Manager token and a reason returns `200` (BR-3.2) |
| AC-2 | An Agent attempting to escalate returns `403` (BR-3.2) |
| AC-3 | Escalating a `Resolved` or `Closed` ticket returns `409` (BR-3.3) |
| AC-4 | Escalating an already-escalated ticket returns `409` (BR-3.4) |
| AC-5 | An empty reason, or one over 500 characters, returns `400` (BR-3.5) |
| AC-6 | Priority is raised to `High` if it is currently `Low` or `Normal`, and left unchanged if it is already `High` or `Critical` (BR-3.6) |
| AC-7 | `IsEscalated`, `EscalatedAtUtc`, `EscalatedByUserId`, and `EscalationReason` are all set (BR-3.7) |
| AC-8 | An `Escalated` history row is written, plus a `PriorityChanged` row only when the priority actually changed (BR-3.8) |
| AC-9 | Escalated tickets are visually distinct in the list and filterable via `escalated=true` |

## Rules referenced

BR-3.1 – BR-3.9, BR-6

## Out of scope

Automatic time-based escalation, escalation to a named person or tier, de-escalation,
escalation notifications.

## Notes

Escalation is modelled as a **flag plus metadata, not a status**. A ticket can be
escalated and `InProgress` at the same time; making it a status would force a choice
between two orthogonal facts and break the state machine.

BR-3.6 is the rule most likely to be implemented wrongly: escalation raises priority
to a floor of `High`, it does not set priority to `High`. A `Critical` ticket must not
be downgraded by being escalated.

## Definition of Done

`09-definition-of-done.md`
