# 013 — Data Model

**Migration:** `AddTicketComments`

One new table, one new index, one new check constraint. Everything else this feature
reads already exists.

Full schema reference: [`docs/sdd/03-domain-model.md`](../../docs/sdd/03-domain-model.md).
SQL Server types throughout, per ADR-013 — which supersedes ADR-001, so nothing here is
`uuid`, `timestamptz`, `jsonb`, `boolean`, or `varchar`.

---

## What already exists before this migration

Stated explicitly, because the interesting part of this feature is a query over three
tables and only one of them is new.

| Object | Created by | This feature's use of it |
|---|---|---|
| `dbo.Tickets` | `009-create-ticket` | Read, and the parent of the new FK. **Not written** — see *Not touched* below |
| `dbo.TicketHistory` | `009-create-ticket` | Read for the history branch of the union; one row **appended** per comment (BR-5.5) |
| `IX_TicketHistory_Ticket_Time` on `(TicketId, PerformedAtUtc)` | `009-create-ticket` | Serves the history branch unchanged. No new index needed on that side |
| `dbo.SupportUsers` | `004-auth-and-roles` | Joined once per branch to resolve `actorName` (AC-14) |
| `dbo.AuditLog` | `003-audit-trail` | One row appended per accepted comment, by the pipeline behaviour |

**Hard dependency:** this migration cannot apply before `009`. `dbo.TicketComments` has a
foreign key to `dbo.Tickets`, and SQL Server rejects the `CREATE TABLE` outright if the
referenced table is absent — which is the right failure, loudly at migration time rather
than quietly at query time.

## Added here

```sql
CREATE TABLE dbo.TicketComments (
    Id            uniqueidentifier NOT NULL PRIMARY KEY,
    TicketId      uniqueidentifier NOT NULL
        CONSTRAINT FK_TicketComments_Tickets REFERENCES dbo.Tickets (Id) ON DELETE CASCADE,
    AuthorUserId  uniqueidentifier NOT NULL
        CONSTRAINT FK_TicketComments_Author  REFERENCES dbo.SupportUsers (Id) ON DELETE NO ACTION,
    Body          nvarchar(4000)   NOT NULL,
    IsInternal    bit              NOT NULL CONSTRAINT DF_TicketComments_Internal DEFAULT 0,
    Channel       nvarchar(20)     NULL,
    CreatedAtUtc  datetime2(3)     NOT NULL,
    CONSTRAINT CK_TicketComments_Body CHECK (LEN(LTRIM(RTRIM(Body))) > 0)
);

CREATE INDEX IX_TicketComments_Ticket_Time
    ON dbo.TicketComments (TicketId, CreatedAtUtc);
```

| Column | Type | Why this type |
|---|---|---|
| `Id` | `uniqueidentifier` | Generated client-side so a `Guid` exists before `SaveChanges`, which the `CommentAdded` history row needs in the same unit of work |
| `TicketId` | `uniqueidentifier` | FK, `ON DELETE CASCADE`. A comment has no meaning without its ticket |
| `AuthorUserId` | `uniqueidentifier` | FK, `ON DELETE NO ACTION`. `RESTRICT` is not SQL Server syntax; `NO ACTION` is the same behaviour (ADR-013). An author who has left must still display |
| `Body` | `nvarchar(4000)` | **`nvarchar`, never `varchar`.** Arabic in a `varchar` column under a non-Arabic collation stores `????`, and it presents as a font or encoding problem rather than a schema one, which is exactly why it survives review. 4000 UTF-16 code units matches BR-5.1 and matches `String.length` on the client |
| `IsInternal` | `bit` | `boolean` does not exist here |
| `Channel` | `nvarchar(20)` NULL | Enum as a string. No `CHECK` — see below |
| `CreatedAtUtc` | `datetime2(3)` | Millisecond precision. `datetime` rounds to 3.33 ms and starts at 1753; `datetime2(3)` costs the same. Time-zone intent is carried by the `*Utc` suffix plus the global EF converter that stamps `DateTimeKind.Utc` (ADR-013) |

### `IX_TicketComments_Ticket_Time`

Serves the comment branch of the timeline union: seek on `TicketId`, then an ordered scan
on `CreatedAtUtc`. It is the mirror of `IX_TicketHistory_Ticket_Time`, and the two
together are what remove the per-branch sort from the union's plan.

`Body` is deliberately **not** an `INCLUDE` column. At `nvarchar(4000)` it would nearly
duplicate the table in the index for the sake of avoiding a key lookup on fifty rows.

### `CK_TicketComments_Body`

BR-5.1 is an invariant, and the constitution requires a constraint wherever an invariant
must hold. This is an **addition beyond the physical sketch** in
`docs/sdd/03-domain-model.md`, made deliberately and recorded in
[`checklists/requirements.md`](checklists/requirements.md).

It is a floor, not the mechanism. The domain rejects a whitespace-only body before EF
ever sees it; the constraint is what stops a row inserted by hand during support work —
which is precisely when the application-level check is not running. Note honestly what it
does **not** catch: `LEN(LTRIM(RTRIM(…)))` trims spaces, not tabs or non-breaking spaces.
A body of three tab characters passes the constraint and is rejected by the domain. The
domain is the real rule.

### No `CHECK` on `Channel`

Deliberate, per **No lookup tables** in `03-domain-model.md`. `CommunicationChannel` has
behaviour attached in code, so adding a value means writing code regardless; a database
constraint or a lookup table would create the illusion that it does not. The domain is
the constraint, and it is the layer that has to be right anyway.

### No `rowversion`

`TicketComments` is append-only, so there is nothing for two people to conflict over
(ADR-006 as amended by ADR-013). Adding one "to be safe" would put a concurrency token on
a table nobody ever updates, and it would then show up in a DTO as an `expectedVersion`
that means nothing.

## Not touched

| Object | Why it is worth saying |
|---|---|
| `dbo.Tickets` | **Adding a comment does not update the ticket row.** No `UpdatedAtUtc` bump, so the ticket's `rowversion` does not move. If it did, an agent commenting and an agent changing status at the same moment would collide on a `409 concurrency-conflict` that neither of them caused, and it would look random. The cost is that "last activity" is not comment-aware (`research.md` R-10) |
| `dbo.TicketHistory` | Rows are **appended**, never altered (BR-5.6). No new column: the `CommentAdded` row carries the comment id in the existing `NewValue`, which is `nvarchar(200)` and holds a `Guid` comfortably. A dedicated `CommentId` column would be nullable for six of the seven event types |
| `dbo.AuditLog` | Rows appended by the behaviour from `003`. No schema change, and no foreign key to any of the above — by design (ADR-008) |

## Domain shape

`Wasl.Domain/Tickets/` — two projects only, no `Wasl.Application`, no
`Wasl.Infrastructure` (ADR-010).

| Type | Responsibility |
|---|---|
| `TicketComment` | Owned entity with private setters and no public mutator at all. Append-only is enforced by the absence of a way to change it, not by a comment saying so (BR-5.3) |
| `Ticket.AddComment(body, isInternal, channel, authorUserId, now)` | The only way a comment comes into existence. Rejects a `Closed` ticket (BR-5.2), validates the body (BR-5.1), and appends **both** the comment and the `CommentAdded` history row in one call, so the two cannot get out of step |
| `TicketClosedException` | Signals BR-5.2. Check `012-change-ticket-status` first: if it already introduced this type, reuse it. Two exception types for one condition is how one condition ends up with two `ProblemDetails.type` values |

`AddComment` takes the timestamp as a parameter rather than reading a clock. The clock is
an injected `TimeProvider` at the boundary; the domain stays free of both the dependency
and the temptation of `DateTime.UtcNow`.

## Verifying the migration

The parts that silently go missing are the constraint and the index, so check them rather
than reading the migration file. There is no `psql` here, so no `\d+`:

```sql
SELECT name, type_desc, is_unique
FROM   sys.indexes
WHERE  object_id = OBJECT_ID('dbo.TicketComments');

SELECT name, definition
FROM   sys.check_constraints
WHERE  parent_object_id = OBJECT_ID('dbo.TicketComments');

SELECT name, delete_referential_action_desc
FROM   sys.foreign_keys
WHERE  parent_object_id = OBJECT_ID('dbo.TicketComments');
```

Expected: `IX_TicketComments_Ticket_Time` present and non-unique;
`CK_TicketComments_Body` present with a non-empty definition;
`FK_TicketComments_Tickets` = `CASCADE` and `FK_TicketComments_Author` = `NO_ACTION`.

A cascade on `FK_TicketComments_Author` would be the dangerous one: deleting a support
user would then erase their comments from every ticket, and the operation would succeed.

## The query this schema exists for

```sql
-- shape only; EF Core composes this from two projections and a Concat
SELECT ... FROM dbo.TicketComments c
JOIN dbo.SupportUsers u ON u.Id = c.AuthorUserId          -- no IsActive predicate
WHERE c.TicketId = @ticketId
UNION ALL
SELECT ... FROM dbo.TicketHistory h
JOIN dbo.SupportUsers u ON u.Id = h.PerformedByUserId     -- no IsActive predicate
WHERE h.TicketId = @ticketId AND h.EventType <> 'CommentAdded'
ORDER BY OccurredAtUtc, EntryTypeRank, Id
OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY;
```

Four things in that sketch are load-bearing, and each has a note in
[`research.md`](research.md):

| Detail | If it is wrong |
|---|---|
| No `IsActive = 1` on either join | A departed colleague's entries vanish from every ticket they touched (R-8) |
| `EventType <> 'CommentAdded'` | Every comment appears twice, the second copy with no body (R-5) |
| `ORDER BY` and `OFFSET` **outside** the union | SQL Server drops a branch-level `ORDER BY` and EF cannot page inside a set operation; the merge falls back to the client and reads the whole ticket (R-1) |
| `Body` and `NewValue` in **separate** columns | A shared column takes its type from the first branch and truncates a 4000-character comment to 200 with no error (R-3) |

## Scale, stated honestly

Offset paging over a union means the engine produces the ordered set up to
`offset + take` before returning fifty rows. For a ticket with a few hundred entries that
is nothing. At tens of thousands of entries per ticket it costs, and the fix is keyset
pagination — which changes the contract shape and which nothing in this project asks for.
Recorded as a known limitation rather than pre-built (`plan.md`, Risks).
