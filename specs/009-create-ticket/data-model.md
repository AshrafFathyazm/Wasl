# 009 — Data Model

**Migration:** `AddTicketsAndHistory`

This is the largest schema change in the project. It adds two tables, one sequence, and
**exactly one** foreign key.

> **Corrected 2026-08-25. This file described a database that did not exist**, and three of
> its statements were wrong — which matters more than the count, because the four foreign
> keys they justified were impossible and every decision after them stood on invented ground.
>
> | Was | Is |
> |---|---|
> | "`dbo.Customers` and `dbo.SupportUsers` already exist — `001` created them" | `001` created **`Customers` only**. `SupportUsers` does not exist in any migration, in `Wasl.Domain`, or anywhere in source |
> | "`dbo.AuditLog` — created by `001`, wired by `003`" | **`003` created it**, table and wiring both |
> | "`008` added `IX_Customers_FullName`" | `008` is **not built**. No index on `FullName` exists |
>
> **Consequence, decided by the product owner:** the four columns that pointed at
> `SupportUsers` — `CreatedByUserId`, `PerformedByUserId`, `AssignedToUserId`,
> `EscalatedByUserId` — are `uniqueidentifier NULL` **with no foreign key** in `009`.
> `004-auth-and-roles` creates `SupportUsers` and adds all four keys in the same migration
> that creates the table.
>
> `CreatedByUserId` was additionally specified `NOT NULL` and sourced from the token. `009`
> ships without authentication (see `spec.md`), so it is nullable here too — the same shape
> the response takes: **the column exists and its value is null**, not absent.
>
> Rejected: seeding a "system" user so the key would work. ADR-005 rejected a forgeable
> actor for the same reason — every audit row would name a user the server never
> authenticated.

Full schema reference: [`docs/sdd/03-domain-model.md`](../../docs/sdd/03-domain-model.md).
Type mapping: [`ADR-013`](../../docs/sdd/decisions/ADR-013-database-sql-server.md).

---

## What already exists

| Object | Created by | Used here as |
|---|---|---|
| `dbo.Customers` | `001` | The target of `FK_Tickets_Customers` — **the only foreign key this migration adds** |
| `dbo.AuditLog` | `003` | Written by the audit behaviour; **not** touched by this migration |
| The `DateTimeKind.Utc` value converter | `001` | Applies to every `datetime2(3)` column added here |
| `IApplicationDbContext` | `001` | Gains `Tickets`; `TicketHistory` is **not** exposed on it — the pipeline writes history, not a handler |
| `ICommand` · `IAuditableCommand<T>` · the audit and transaction behaviours | `003` | `CreateTicketCommand` is the **first production consumer**. The NFR-10 scanner now has a non-empty population |

**`dbo.SupportUsers` does not exist.** It is `004`'s, along with the four foreign keys
listed above. Nothing here references it.

No index on `Customers.FullName` exists either — `008` owns the customer picker's search.
Nothing on the customer side changes here.
## Added here

### Sequence

```sql
CREATE SEQUENCE dbo.TicketNumberSeq AS bigint START WITH 1 INCREMENT BY 1;
```

`AS bigint` explicitly: the SQL Server default for a sequence with no type is `bigint`,
but stating it removes the question, and `int` would cap at 2.1 billion for no saving.
No `MAXVALUE`, no `CYCLE` — a cycling sequence would eventually hand out a number the
unique index already holds, and that failure would arrive years later with no clue as to
why.

**Not reset per year.** The year in `TCK-{yyyy}-{000000}` is informational; the sequence
is what makes the number unique. A per-year reset would make `TCK-2026-000001` and
`TCK-2027-000001` two different tickets sharing a numeric part, and any code that parses
the number for sorting would silently interleave them.

EF Core maps it with `.HasSequence<long>("TicketNumberSeq")`; the value is read with
`NEXT VALUE FOR dbo.TicketNumberSeq` and formatted by
`TicketNumber.Format(year, sequence)` in `Wasl.Domain`.

### `dbo.Tickets`

| Column | Type | Notes |
|---|---|---|
| `Id` | `uniqueidentifier` | PK, `Guid` generated client-side so the aggregate is valid before `SaveChanges` |
| `TicketNumber` | `nvarchar(20)` | `TCK-2026-000042`. Unique |
| `CustomerId` | `uniqueidentifier` | FK → `dbo.Customers`, `ON DELETE NO ACTION` |
| `Subject` | `nvarchar(200)` | Human-written. `nvarchar`, not `varchar` |
| `Description` | `nvarchar(4000)` | Human-written |
| `Category` | `nvarchar(20)` | Enum as string |
| `Priority` | `nvarchar(20)` | Enum as string, `DEFAULT 'Normal'` |
| `Channel` | `nvarchar(20)` | Enum as string |
| `Status` | `nvarchar(20)` | Enum as string, `DEFAULT 'New'` |
| `AssignedToUserId` | `uniqueidentifier NULL` | **No FK in `009`** — `SupportUsers` does not exist yet. Null on creation; `011` assigns and `004` adds the key |
| `CreatedByUserId` | `uniqueidentifier NULL` | **Nullable and no FK in `009`.** Specified `NOT NULL` from the token; `009` has no authentication, so the column exists and its value is null — `004` fills it and adds the key |
| `IsEscalated` | `bit` | `DEFAULT 0` |
| `EscalatedAtUtc` | `datetime2(3) NULL` | Created here so `016` needs no second migration |
| `EscalatedByUserId` | `uniqueidentifier NULL` | **No FK in `009`.** `016` owns escalation; `004` adds the key |
| `EscalationReason` | `nvarchar(500) NULL` | |
| `CreatedAtUtc` | `datetime2(3)` | From the injected `TimeProvider`, never `DateTime.UtcNow` |
| `UpdatedAtUtc` | `datetime2(3)` | Equal to `CreatedAtUtc` on insert |
| `ClosedAtUtc` | `datetime2(3) NULL` | Set by `012` (BR-1.7) |
| `RowVersion` | `rowversion` | `.IsRowVersion()`. Maintained by the engine, never by application code |

### `dbo.TicketHistory`

| Column | Type | Notes |
|---|---|---|
| `Id` | `uniqueidentifier` | PK |
| `TicketId` | `uniqueidentifier` | FK → `dbo.Tickets`, **`ON DELETE CASCADE`** |
| `EventType` | `nvarchar(30)` | `Created` on insert here |
| `OldValue` | `nvarchar(200) NULL` | Null for `Created` |
| `NewValue` | `nvarchar(200) NULL` | `New` for `Created` |
| `Note` | `nvarchar(500) NULL` | |
| `PerformedByUserId` | `uniqueidentifier NULL` | **Nullable and no FK in `009`**, same reason as `Tickets.CreatedByUserId`. The `Created` row is written by an unauthenticated request until `004` |
| `PerformedAtUtc` | `datetime2(3)` | The same `TimeProvider` reading as the ticket's `CreatedAtUtc` |

No `RowVersion`: `TicketHistory` is append-only, so there is nothing to conflict over
(BR-5.6).

### Indexes

| Index | Definition | Query it serves |
|---|---|---|
| `UX_Tickets_Number` | `CREATE UNIQUE INDEX UX_Tickets_Number ON dbo.Tickets (TicketNumber)` | Lookup and search by number (`010`, `015`). Also the guarantee behind AC-3 |
| `IX_Tickets_Status_Created` | `ON dbo.Tickets (Status, CreatedAtUtc DESC)` | The default ticket list, newest first (`010`, BR-7.1) |
| `IX_Tickets_Customer` | `ON dbo.Tickets (CustomerId)` | Tickets for one customer (`018`) |
| `IX_Tickets_Assignee` | `ON dbo.Tickets (AssignedToUserId)` | The "my tickets" filter (`010`) |
| `IX_TicketHistory_Ticket_Time` | `ON dbo.TicketHistory (TicketId, PerformedAtUtc)` | The timeline (`013`) |

**Five indexes across two tables** — four on `dbo.Tickets`, one on `dbo.TicketHistory`.
None is filtered, so unlike `007` there is no `filter_definition` to verify. What is
verified instead is that `UX_Tickets_Number` came back `is_unique = 1`: a non-unique
index there would satisfy every test in this feature except `TEST-009-08`, and would
leave AC-3's uniqueness resting on the sequence alone.

```sql
SELECT name, is_unique, filter_definition
FROM   sys.indexes
WHERE  object_id = OBJECT_ID('dbo.Tickets');

SELECT name, is_unique
FROM   sys.indexes
WHERE  object_id = OBJECT_ID('dbo.TicketHistory');
```

Four rows plus the clustered primary key for `Tickets`; two rows for `TicketHistory`.
`\d+` is a psql command and does not exist here — the original plan's verification step
was written against PostgreSQL.

### Why every index is created now

The no-speculative-indexes rule normally means an index arrives with the query that needs
it. These are the exception, and the reason is stated so it does not read as a lapse: the
columns are created here, each index names the feature that consumes it, and adding them
in `010`, `013`, and `018` would be three migrations that alter a table nothing has yet
queried at volume. Every one of them has a named consumer in the table above; none is
"probably useful later".

## Delete behaviour, and why it is not a free choice

| FK | On delete | Reason |
|---|---|---|
| `TicketHistory.TicketId` → `Tickets` | `CASCADE` | History has no meaning without its ticket. The audit log is the record that survives a deletion (ADR-008); `TicketHistory` is a product projection and goes with it |
| `Tickets.CustomerId` → `Customers` | `NO ACTION` | Deleting a customer must not silently erase their support history |
| ~~`Tickets.CreatedByUserId` → `SupportUsers`~~ | — | **`004`.** The author must stay resolvable, and there is no author yet |
| ~~`Tickets.AssignedToUserId` → `SupportUsers`~~ | — | **`004`**, consumed by `011` |
| ~~`Tickets.EscalatedByUserId` → `SupportUsers`~~ | — | **`004`**, consumed by `016` |
| ~~`TicketHistory.PerformedByUserId` → `SupportUsers`~~ | — | **`004`.** The audit trail must never lose its actor — and until `004` there is no actor to lose |

**`009` adds two foreign keys, not six.** The four struck through above wait for the table
they point at. That is recorded rather than silently omitted, because a missing foreign key
looks identical to a forgotten one six months later.

`ON DELETE RESTRICT` is **not SQL Server syntax**. `NO ACTION` is the same behaviour, and
it is what ADR-013 specifies.

**Three foreign keys from one table to `dbo.SupportUsers` is the part that fails loudly
if it is got wrong, and quietly if it is got half-right:**

- If any of the three cascaded, SQL Server would refuse to create the table at all —
  multiple cascade paths from `SupportUsers` into `Tickets` and onward into
  `TicketHistory` and `TicketComments`. The error names cycles, not the real cause, and it
  arrives at `dotnet ef database update` rather than at a delete. `NO ACTION` on all three
  is correct on its own merits *and* is the only creatable configuration.
- EF Core cannot infer three relationships to one entity. Each needs an explicit
  `HasOne(...).WithMany().HasForeignKey(...)`. Left to convention it invents shadow
  properties, and the migration produces a `SupportUserId1` column nobody asked for — a
  defect that compiles, migrates, and is visible only in the schema.

## Domain shape

`Wasl.Domain/Tickets/` — the aggregate and everything genuinely shared.

| Type | Responsibility |
|---|---|
| `Ticket` | Aggregate root. Private setters and a `Create` factory that sets `Status = New`, leaves the assignee null, and appends the `Created` history row. There is no constructor an outside caller can use to reach a ticket with no history |
| `TicketHistory` | Owned, append-only. Exposed as `IReadOnlyCollection<TicketHistory>`; there is no public `Add` |
| `TicketNumber` | `static string Format(int year, long sequence)` → `$"TCK-{year:0000}-{sequence:000000}"`. Pure, so AC-3's formatting is a unit test with no database |
| `TicketStatusTransitions` | The BR-1 static map. Read here only to answer `allowedTransitions` for `New`; `012` is what exercises the rest |
| Enums | `TicketCategory`, `TicketPriority`, `CommunicationChannel`, `TicketStatus`, `TicketEventType` |

`Ticket.Create` appending the history row is the whole design (AC-9, BR-1.8). A handler
that appends it is one new caller away from a ticket whose history begins in the middle,
and nothing in the system would announce that — the timeline would simply start at the
first status change.

## Concurrency

`RowVersion` is a `rowversion` column mapped with `.IsRowVersion()` (ADR-013 row 1). Not
`xmin`, and never a manually incremented `int` — a counter someone forgets to increment
is a silent lost update, which is the exact defect ADR-006 exists to prevent.

This feature does not consume it. The `201` response **does** return `version`, so
`011-assign-ticket` and `012-change-ticket-status` do not have to change the read shape
after a client has shipped against it.

## Sequences are not transactional, and that is the design

A value drawn from `dbo.TicketNumberSeq` is **not returned** if the surrounding
transaction rolls back. Two consequences, both accepted:

| Consequence | Why it is accepted |
|---|---|
| The number series has gaps | A failed create consumes a number. Making the series dense would require serialising every create behind a lock, which is precisely what the sequence was chosen to avoid |
| The number is drawn before the insert commits | Which is why AC-11 holds: two concurrent creates get two values without either waiting on the other |

Stated here because "why is there no `TCK-2026-000007`?" is a question someone will ask,
and "it is a bug" is the wrong answer.
