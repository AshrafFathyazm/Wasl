# ADR-008 — Audit log, and why it is not `TicketHistory`

**Status:** Accepted · **Implements:** FR-6, BR-9 · **Related:** ADR-002, ADR-005

## Context

`TicketHistory` already exists (US-005, BR-5). It records ticket creation, assignment,
status changes, escalation, and comments, and it is rendered as the ticket timeline.

It was reasonable to assume that covers auditing. It does not, and the gap is worth
stating precisely rather than papering over:

| Not covered by `TicketHistory` | Why it matters |
|---|---|
| Customer creation, edits, deactivation | US-003 explicitly put field-level customer history out of scope. A phone number can be changed with no record of who did it |
| Failed sign-in attempts | Brute force is invisible. ADR-005 already names rate limiting as the most serious gap; without an audit log there is not even a record of the attempt |
| Denied actions (`403`) | An agent repeatedly trying to escalate is a signal. Currently it produces a response and nothing else |
| Reads of sensitive data | Nobody can answer "who looked at this customer" |
| Language preference changes | Trivial, but it is a mutation with no record |
| Anything after the ticket is deleted | `TicketHistory` cascades with its ticket. Delete the ticket and its history is gone with it |

That last row is the decisive one. **A record that disappears when the thing it
describes disappears is not an audit log.** It is a feature of the thing.

## Decision

Add a separate `AuditLog` table. Keep `TicketHistory`. They are not redundant; they
have opposite requirements.

| | `TicketHistory` | `AuditLog` |
|---|---|---|
| Audience | Support agents | Administrators, incident response, compliance |
| Purpose | A product feature — the timeline | A forensic record |
| Scope | Tickets only | Every mutation, plus authentication and authorization events |
| Deletion | Cascades with the ticket | Never deleted by application code |
| Foreign keys | Yes, to `Tickets` and `SupportUsers` | **None, deliberately** |
| Shape | Typed columns | Generic, with a JSON diff |
| Language | Rendered translated in the UI | Always English (BR-8.9) |
| Reachable by | Any support user | Managers only |

## Why not merge them

The obvious objection is that six ticket events are now written twice. That is real,
and it is accepted, because merging forces one of the two to be wrong:

- **Merge into `TicketHistory`** and the audit record inherits a foreign key to
  `Tickets` and a cascade delete. Auth events have no ticket to point at, and deleting
  a ticket would erase its own audit trail — precisely the case an auditor cares about.
- **Merge into `AuditLog`** and the timeline loses typed columns, referential
  integrity, and cascade cleanup. US-010 merges history with comments in a SQL union
  and renders each entry as a translated sentence; doing that over a generic JSON blob
  with no foreign key is worse in every respect.

So: two tables, one principle. **`AuditLog` is the durable record; `TicketHistory` is
a product projection.** If they ever disagree, the audit log is right.

## No foreign keys on `AuditLog`

`ActorUserId` and `EntityId` are plain `uniqueidentifier` columns with no `REFERENCES` clause.

This looks like a mistake and is the opposite. A foreign key would mean the audit row
can be blocked, cascaded, or invalidated by the lifecycle of the thing it describes.
An audit log must be able to record the deletion of a row and still exist afterwards.

The cost is that a join can return nothing. That is why the actor's email and role, and
a human-readable label for the entity, are **snapshotted onto the row itself**.

## Snapshot the actor, never join to it

`ActorEmail` and `ActorRole` are copied onto the row at write time.

An audit log that joins to `SupportUsers` to display who did something reports the
actor's role *today*, not their role *at the time*. If an agent is promoted to manager,
every past action they took retroactively appears to have been taken by a manager —
which inverts the meaning of every authorization question an auditor would ask.

The denormalisation is the correct answer here, not a shortcut.

## Explicit writes, not an EF Core interceptor

A `SaveChangesInterceptor` that audits every tracked change automatically is the
tempting implementation. It was rejected.

An interceptor sees `UPDATE tickets SET status = 'Open'`. It cannot see whether that
was a triage, a reopen, or a correction — and the business action is the thing an
auditor needs. It also captures every incidental column touch as an event, which fills
the table with noise that makes the real entries harder to find.

Audit writes therefore happen in the application layer, where intent is known.

**The obvious risk with explicit writes is forgetting one.** Mitigated structurally,
not by discipline: every command implements `IAuditableCommand` declaring its action
name, a MediatR pipeline behaviour writes the row, and an architecture test fails the
build if any type implementing `ICommand` does not also implement `IAuditableCommand`.
Forgetting becomes a compile-time-adjacent failure instead of a silent gap.

## `bigint` primary key

The only table in the schema that is not keyed by `uniqueidentifier`.

It is append-only, high-volume, and always read in time order. A monotonic key gives
cheap cursor pagination and clustered insert locality. There is no distributed
generation requirement and no reason to expose the key outside the system.

Deviating from the convention needs a reason; this is it.

## Same transaction, with one exception

An audit row for a successful mutation is written in the same transaction as the
mutation. If the transaction rolls back, the audit row goes with it — a log recording
things that did not happen is worse than no log.

The exception is denied and failed actions. A `403`, a `401`, or a failed sign-in has
no business transaction to join, so those rows are written on their own, outside any
ambient transaction. This asymmetry is deliberate and is the kind of thing that gets
implemented wrongly by accident, so it is named here and tested (BR-9.4).

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Application logs instead of a table | Logs are unstructured, rotate away, and are not queryable by entity. An auditor asking "everything that touched customer X" cannot grep for it |
| SQL Server triggers | Invisible in code review, untestable in the unit suite, and blind to business intent — the same problem as the interceptor, with worse tooling |
| Temporal tables / full row versioning | Answers "what did this row look like" but not "who did what and was it allowed". Also a large storage cost for a question nobody asked |
| Event sourcing | The right shape for a system whose audit trail *is* its data model. Rebuilding this CRM around it to get an audit log is a rewrite (ADR-002) |
| Write to a separate database | Correct for a real compliance requirement, since it removes the application's ability to tamper. Rejected here: it breaks the same-transaction guarantee above, and there is no stated compliance requirement to justify the trade |

## Consequences

- The walking skeleton grows again. See `08-board.md` for the effect on the cut line.
- Every command handler must declare an audit action; the architecture test enforces it.
- `AuditLog` becomes a store of personal data — customer emails and phone numbers
  appear in change diffs. Access control and retention therefore apply to it, and both
  are recorded as open questions rather than invented.
- Nothing in the application may issue `UPDATE` or `DELETE` against it. The database
  role the application connects as is granted `INSERT` and `SELECT` only, so this is
  enforced by permissions rather than by convention.
- Six ticket events are written twice. That redundancy is the price of the two tables
  having opposite deletion semantics, and it is accepted knowingly.
