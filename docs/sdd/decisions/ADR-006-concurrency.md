# ADR-006 — Concurrency control

**Status:** Accepted, **amended by ADR-013** (the concurrency token is `rowversion`, not `xmin`) · **Implements:** NFR-6 · **Related:** ADR-001, ADR-013

## Context

A support queue is shared. Two agents opening the same ticket is the normal case, not
an edge case. Without a concurrency strategy, the second write silently overwrites
the first: an agent's status change disappears, and the history shows a transition
that contradicts what the first agent saw.

This is the most common defect in ticketing systems, and it is invisible in
single-user testing.

## Decision

**Optimistic concurrency** on `Ticket` and `Customer`.

- A SQL Server `rowversion` column mapped with `.IsRowVersion()`, exposed on the wire
  as its base64 form. **Amended by ADR-013** — this was `xmin` under PostgreSQL, which
  needed no column at all. The reasoning below about *why* a database-maintained token
  beats a manual counter is unchanged; only the mechanism moved.
- Read endpoints return the current `version`.
- Mutating endpoints accept `expectedVersion`.
- A mismatch produces `409 Conflict` with `type: errors/concurrency-conflict`.
- The client refetches and shows the user what changed. It never retries silently.

## Reasoning

- Contention is low — two agents touching the same ticket in the same second is
  uncommon — so the optimistic assumption is usually right, and being wrong costs one
  refetch.
- The alternative failure mode is worse: silent data loss is not detectable by the
  user, while a `409` is.
- The token is maintained by the database, not by application code, so it cannot be
  forgotten on a new entity. (`rowversion` needs a column declaration; `xmin` needed
  none at all. Neither needs a line of code at write time, which is the property that matters.)
- Surfacing the conflict to the user is the correct product behaviour. The system
  cannot know whether "set to Resolved" is still intended after someone else set the
  ticket to `PendingCustomer`. Only a human can decide that.

## Alternatives considered

### Pessimistic locking

Rejected. A row lock held while an agent reads a ticket, gets distracted, and goes to
lunch blocks the queue. Lock timeouts, deadlock handling, and a lock-release UI would
all be needed. This is the correct choice for high-contention financial writes, not
for a support queue.

### Last write wins

Rejected. It is what happens with no strategy at all, and the data loss is silent.

### A manual `Version int` column

Rejected in favour of a database-maintained token. A manual counter works and is portable
across providers, but every
new entity and every raw update must remember to increment it, and the one that
forgets is the one that breaks. `rowversion` is incremented by SQL Server itself.

The trade-off is provider coupling, and it has since been paid: ADR-013 moved this from
PostgreSQL `xmin` to a SQL Server `rowversion` column, which was a migration rather than
a redesign — exactly the cost ADR-001 estimated. It was accepted because forgetting a
manual increment is a silent bug, whereas a provider switch is a planned change.

### Automatic retry on conflict

Rejected. Retrying a status change without asking the user is guessing at intent, and
it can produce a transition the user would not have chosen if they had seen the
current state.

## Consequences

- Every mutating request carries the version, so read and write endpoints are
  coupled through it and the client must keep it.
- The UI needs a conflict path: an explanatory message and a reload action. This is
  part of the story acceptance criteria, not an afterthought.
- `409` on conflict is exercised by an integration test that performs two writes
  against the same version.
