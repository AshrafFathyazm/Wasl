# 011 — Data Model

**Migration:** none.

This feature adds no table, no column, no index, and no constraint. It writes to columns
and rows that already exist, and the reason that is stated here rather than left implicit
is that "no migration" written down is a decision, while "no migration" unmentioned is
indistinguishable from a forgotten one.

Full schema reference: [`docs/sdd/03-domain-model.md`](../../docs/sdd/03-domain-model.md).

---

## What already exists, and which feature created it

| Object | Definition | Created by | Used here for |
|---|---|---|---|
| `dbo.Tickets.AssignedToUserId` | `uniqueidentifier NULL` | `009-create-ticket` | The field this feature writes. `NULL` is the unassigned state, which is why it is nullable and why `null` in the request is a legal target |
| `FK_Tickets_Assignee` | `REFERENCES dbo.SupportUsers (Id) ON DELETE NO ACTION` | `009-create-ticket` | The database-level guarantee that an assignee is a real support user. `ON DELETE NO ACTION`, **not** `ON DELETE RESTRICT` — `RESTRICT` is not SQL Server syntax, and `NO ACTION` is the same behaviour (ADR-013) |
| `IX_Tickets_Assignee` | `CREATE INDEX IX_Tickets_Assignee ON dbo.Tickets (AssignedToUserId)` | `009-create-ticket` | Not read by this feature. It serves the "my tickets" filter in `010` / `015`, and is named here so nobody adds a second one |
| `dbo.Tickets.RowVersion` | `rowversion NOT NULL`, mapped with `.IsRowVersion()` | `009-create-ticket` | `expectedVersion`. Maintained by SQL Server, never incremented by application code (ADR-006 as amended by ADR-013) |
| `dbo.TicketHistory` | `EventType nvarchar(30)`, `OldValue`/`NewValue nvarchar(200) NULL`, `PerformedByUserId`, `PerformedAtUtc datetime2(3)`, cascade from `Tickets` | `009-create-ticket` | The `Assigned` and `Unassigned` rows (BR-2.6, AC-9) |
| `dbo.SupportUsers.IsActive` | `bit NOT NULL DEFAULT 1` | `001-solution-skeleton`, seeded by `004-auth-and-roles` | BR-2.4, and the filter behind `GET /api/support-users` |
| `dbo.AuditLog` | `bigint IDENTITY` key, no foreign keys, `Changes nvarchar(max)` with `CHECK (ISJSON(Changes) = 1)` | `003-audit-trail` | The `Ticket.Assigned`, `Ticket.Unassigned`, and `Auth.Forbidden` rows |

Table names are PascalCase in the `dbo` schema — `dbo.Tickets`, `dbo.TicketHistory`,
`dbo.SupportUsers`. There are no snake_case object names anywhere in this schema; the
original story artifact's `ix_tickets_assignee` was PostgreSQL-era naming and is
corrected to `IX_Tickets_Assignee` here.

## What is deliberately not added

| Not added | Why |
|---|---|
| An index on `SupportUsers.IsActive` | The table is seeded and holds single digits of rows. A scan is free, and the no-speculative-indexes rule applies to a small table exactly as much as to a large one. If user management ever ships, the index arrives with the query that needs it |
| A `CHECK` constraint tying `AssignedToUserId` to an active user | A check constraint cannot reference another table, and a trigger doing it would enforce BR-2.4 retroactively — deactivating a user would then fail or strand every ticket they own. BR-2.4 governs the *act* of assigning, not the state of an existing assignment (`spec.md`, Edge cases) |
| A `CHECK` constraint forbidding assignment while `Status = 'Closed'` | It would have to fire on every update of a closed row, including the legitimate ones. BR-2.5 is enforced in the domain, where the *intent* is known — the same reasoning ADR-008 uses to reject a `SaveChanges` interceptor for audit |
| A join table for multiple assignees | `spec.md` A-2. One assignee, one column |
| An index on `TicketHistory.EventType` | Nothing filters history by type. The timeline reads by `(TicketId, PerformedAtUtc)`, which `009` already indexed |

## What goes into `TicketHistory.OldValue` and `NewValue`

The **`Guid` as text**, or `NULL` when there is no assignee on that side.

| Event | `OldValue` | `NewValue` |
|---|---|---|
| Assign an unassigned ticket | `NULL` | `3f9a1b52-…` |
| Reassign | `3f9a1b52-…` | `b7d2e4c1-…` |
| Unassign | `3f9a1b52-…` | `NULL` |

The alternative — storing the user's `FullName` — was rejected. `TicketHistory` has a
foreign key to `SupportUsers` and nothing in this system hard-deletes a user (`IsActive`
handles departures), so the join always resolves and a snapshot would only add a second
copy of a name that can be renamed. That is the opposite of `AuditLog`, which snapshots
its actor precisely **because** it has no foreign keys and must outlive what it describes
(ADR-008); the two tables have opposite requirements and this is one of the places it
shows.

The consequence belongs to `013-ticket-timeline-and-comments`, and it is recorded here so
that feature does not discover it: rendering an `Assigned` row as a sentence requires
joining `SupportUsers` for both ids. `research.md` R-4.

`nvarchar(200)` holds a 36-character `Guid` comfortably. It is `nvarchar` rather than
`varchar` because the column also carries enum values and notes for other event types,
and every column a human may write into is `nvarchar` (ADR-013 row 4).

## Concurrency

`Tickets.RowVersion` already exists. This feature is the first one to **consume** it:

- The client sends `expectedVersion`, the base64 form of the `rowversion` it read.
- The handler compares it against the loaded row **before** deciding permission
  (`research.md` R-6), and EF re-checks it in the `UPDATE`'s `WHERE` clause at
  `SaveChanges`.
- A mismatch at either point is `409 errors/concurrency-conflict`.

Two failure modes worth naming because both are silent:

| If | Then |
|---|---|
| The ticket is read with `AsNoTracking()` and updated by a hand-written `ExecuteUpdate` | EF has no tracked original value, so the token is not in the `WHERE` clause and the lost update happens with no error at all. The handler loads a tracked entity |
| Only a `TicketHistory` row were inserted, without touching the `Tickets` row | `RowVersion` would not change, and two concurrent writers would both succeed. Not a live risk here — every assignment updates `AssignedToUserId` and `UpdatedAtUtc` — but it is the reason the token must never be relied on to protect a child table |

## Verifying the schema this feature depends on

`BE-011-01` and `BE-011-04` assume `009`'s migration is correct. That is checked with a
query, not with an assumption — and not with `psql \d+`, which does not exist here:

```sql
SELECT  i.name, i.is_unique, i.filter_definition
FROM    sys.indexes i
WHERE   i.object_id = OBJECT_ID('dbo.Tickets');

SELECT  fk.name, fk.delete_referential_action_desc
FROM    sys.foreign_keys fk
WHERE   fk.parent_object_id = OBJECT_ID('dbo.Tickets');
```

`IX_Tickets_Assignee` must be present, and `FK_Tickets_Assignee` must report
`NO_ACTION`. A cascade on that key would mean deactivating — or, during support work,
deleting — a support user silently deletes their tickets. It is also the constraint that
makes the schema creatable at all: three foreign keys from `Tickets` to `SupportUsers`
with any cascade among them produce multiple cascade paths, which SQL Server rejects
outright (`docs/sdd/03-domain-model.md`).

Integration tests run against a real SQL Server through `Testcontainers.MsSql`. EF
`InMemory` is not used, and here the reason is specific: it enforces neither the foreign
key nor the concurrency token, which are two of the three things this feature relies on.

## Domain shape

`Wasl.Domain/Tickets/` — no new entity, two new types.

| Type | Responsibility |
|---|---|
| `Ticket.AssignTo(Guid? target, Guid actorId, DateTimeOffset now)` | Rejects a closed ticket and a no-op; sets `AssignedToUserId` and `UpdatedAtUtc`; appends the history row. The only way to change the assignee — there is no public setter |
| `TicketAssignmentPolicy` | Pure decision over (actor role, actor id, current assignee, target) → permitted or a denial reason. No EF, no HTTP, no `DbContext`; unit-testable in `Wasl.Domain.Tests` with no container |

`now` is passed in rather than read inside the entity, because the time comes from the
injected `TimeProvider` and never from `DateTime.UtcNow` — that is what lets a test pin
`PerformedAtUtc` and assert history ordering.
