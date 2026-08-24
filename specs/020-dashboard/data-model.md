# 020 — Data Model

**Migration:** **none.** This feature makes no schema change.

That is a decision, not an omission, and it is the first thing a reviewer should check
against the plan: if [`plan.md`](plan.md) or [`tasks.md`](tasks.md) ever names a migration,
one of the two documents is wrong.

Full schema reference: [`docs/sdd/03-domain-model.md`](../../docs/sdd/03-domain-model.md).

---

## Why there is no schema change

A dashboard is a **read** over data other features already own. Every number on the screen
comes from four existing tables:

| Table | Read for | Columns used |
|---|---|---|
| `Tickets` | Every tile, the created series, open-by-status, channel mix, team load, needs-attention | `Id`, `TicketNumber`, `Subject`, `Status`, `Priority`, `Channel`, `AssignedToUserId`, `CustomerId`, `IsEscalated`, `CreatedAtUtc` |
| `TicketHistory` | The **resolved** series and the resolution median | `TicketId`, `EventType`, `NewValue`, `PerformedAtUtc` |
| `TicketComments` | The first-reply median, and "oldest untouched" (a ticket with no comment) | `TicketId`, `CreatedAtUtc` |
| `SupportUsers` | Team load, so an agent with nothing assigned still appears | `Id`, `FullName`, `IsActive` |
| `Customers` | The customer name on a needs-attention row, projected in the same query | `Id`, `FullName` |

No new entity, no new column, no new constraint. Nothing here needs a `rowversion` — the
endpoint is read-only and returns no `version` field, which is a deliberate omission
recorded in `spec.md` under **Rules referenced**.

## The column that does not exist, and what is done about it

`Tickets` has `CreatedAtUtc`, `UpdatedAtUtc`, and `ClosedAtUtc`. **It has no
`ResolvedAtUtc`.** The screen's central trend — created versus resolved — therefore has no
column behind it.

The resolved side is derived from `TicketHistory` instead, using the row BR-1.8 guarantees:

```sql
-- first entry into Resolved, per ticket
SELECT   h.TicketId, MIN(h.PerformedAtUtc) AS FirstResolvedAtUtc
FROM     dbo.TicketHistory AS h
WHERE    h.EventType = 'StatusChanged'
  AND    h.NewValue  = 'Resolved'
GROUP BY h.TicketId;
```

`MIN` rather than every matching row, because BR-1.6 permits `Resolved → InProgress` and a
reopened-then-resolved ticket would otherwise be counted twice, on two different days
(AC-19).

**A `ResolvedAtUtc` column was considered and rejected** — the full reasoning is
[`research.md`](research.md) R-5. The short version: it changes the ticket write path owned
by `012-change-ticket-status`, it denormalises a fact `TicketHistory` already holds, and
one screen is not a reason to add a column that two features then have to keep in step.

## Indexes: none added, and the ones each query would want

The constitution requires every new index to be justified by a named query. Five could be
justified by name here. **None is added**, because at the volume in scope each query scans a
table measured in thousands of rows, and `001`'s plan is explicit that speculative
structures are the thing this ordering avoids.

The candidates are written down so that "add an index" is a five-minute decision later
rather than a fresh investigation:

| # | Candidate | Query it serves | Measurement that would justify it |
|---|---|---|---|
| 1 | `IX_Tickets_CreatedAtUtc` | `DailySeriesQuery`, `ChannelMixQuery`, `MedianDurationsQuery` — all range-scan `CreatedAtUtc` | **Probably already exists.** BR-7.1 makes `CreatedAtUtc DESC` the ticket list's default sort, so `010-ticket-list-and-detail` is its likely owner. This feature does not add it and does not assume it: the queries are correct without it |
| 2 | `IX_TicketHistory_Resolved` — `ON dbo.TicketHistory (PerformedAtUtc) INCLUDE (TicketId) WHERE EventType = 'StatusChanged' AND NewValue = 'Resolved'` | The resolved series and the resolution median | The endpoint exceeding the ~300ms threshold from `11-dashboard.md`, measured, with this query named as the contributor |
| 3 | `IX_Tickets_Status` | `OpenByStatusQuery` | Never, realistically. Six distinct values over the whole table is the textbook case for *not* indexing — the scan is cheaper than the seek |
| 4 | `IX_Tickets_AssignedToUserId` | `TeamLoadQuery`, and the Agent scope predicate on every block | **Already exists.** EF Core creates an index for the `AssignedToUserId` foreign key by convention (`03-domain-model.md`, three FKs from `Tickets` to `SupportUsers`) |
| 5 | `IX_TicketComments_TicketId` | The first-reply median, and the `NOT EXISTS` behind "oldest untouched" | **Already exists**, for the same convention reason |

**If candidate 2 is ever added, it is a filtered index**, which puts it under ADR-013 row 2
and the hard rule that comes with it: the migration must be verified by querying

```sql
SELECT name, filter_definition FROM sys.indexes WHERE name = 'IX_TicketHistory_Resolved';
```

and confirming `filter_definition` comes back **non-null**. A filtered index whose `WHERE`
clause went missing is still a valid index — it is simply much larger and covers rows
nobody asked for, and nothing about the result set changes. This is the same silent failure
`007`'s `data-model.md` guards against, restated here because it applies to any filtered
index anyone adds later.

## Query types — the shape EF Core needs

The seven queries return projections, not entities. Each is a keyless query type registered
on the model ([`research.md`](research.md) R-6), defined in the slice and applied to
`WaslDbContext` by one call.

| Type | Shape | SQL Server types on the wire |
|---|---|---|
| `AttentionTilesRow` | one row | `int` counts; `uniqueidentifier`, `nvarchar(20)`, `nvarchar(200)`, `datetime2(3)` for the oldest-untouched ticket, all nullable |
| `DailySeriesRow` | one row per local day | `date` `LocalDate`, `int Created`, `int Resolved` |
| `StatusCountRow` | one row per status present | `nvarchar(20) Status`, `int Count` |
| `ChannelCountRow` | one row per channel present | `nvarchar(20) Channel`, `int Count` |
| `MedianDurationsRow` | exactly one row | `float` medians (`PERCENTILE_CONT` returns `float`), nullable; `int` sample sizes |
| `TeamLoadRow` | one row per support user | `uniqueidentifier UserId`, `nvarchar(200) FullName`, `bit IsActive`, `int AssignedOpenCount` |
| `NeedsAttentionRow` | at most 10 rows | `uniqueidentifier`, `nvarchar(20) TicketNumber`, `nvarchar(200) Subject`, `nvarchar(200) CustomerName`, `nvarchar(20)` status and priority, `bit IsEscalated`, `datetime2(3) CreatedAtUtc` |

Four notes, each of which is a way to get this wrong quietly:

1. **`nvarchar`, never `varchar`,** for `Subject`, `FullName`, and `CustomerName`. These
   carry Arabic. `varchar` returns `????` and it looks like a font problem, which is how it
   survives review (ADR-013 row 4). The columns are already `nvarchar`; the risk is a cast
   or a `CONVERT` introduced inside a raw query.
2. **`datetime2(3)`** everywhere, and every timestamp returned by the endpoint is UTC and
   named `*Utc`. The global UTC value converter from `001` applies to mapped entities; a
   **keyless query type is still part of the model**, so the convention reaches it — but
   `TEST-020-09` asserts it rather than trusting it, because a raw-SQL projection is exactly
   where a convention is most likely not to apply.
3. **`LocalDate` is a `date`, not a `datetime2`.** It is a calendar date in the
   organisation's zone and has no instant. Mapping it to `DateTime` and serialising it as
   ISO-8601 is what produces the off-by-one-day chart AC-16 forbids.
4. **`PERCENTILE_CONT` returns `float`** (`double` in C#), not an integer. The contract
   rounds to whole minutes at the edge, once, rather than leaving `41.99999` to be rounded
   by whichever client renders it.

## What this feature must not touch

| Table | Why |
|---|---|
| `AuditLog` | Not read and not written. A dashboard read changes no state (AC-20, BR-9.1). Reading the audit log is `019-audit-log-access` and needs a Manager (BR-9.11) |
| Every table above, for **write** | This feature is read-only. There is no command, no `SaveChanges`, no `IAuditableCommand`, and no transaction of its own ([`research.md`](research.md) R-8, R-13) |
