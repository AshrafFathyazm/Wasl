# 010 — Data Model

**Migration:** `AddTicketListSortIndex`

This feature is almost entirely a read. It adds **one index** and no table, no column, and
no constraint. Full schema reference:
[`docs/sdd/03-domain-model.md`](../../docs/sdd/03-domain-model.md).

SQL Server types throughout (ADR-013 supersedes ADR-001). The original story artifact was
written against PostgreSQL; the type mapping and the index reasoning below are the repair.

---

## What already exists, and which feature created it

Stating this explicitly is the point of the file — otherwise a reviewer cannot tell what
this migration adds from what it inherits.

| Object | Created by | Note |
|---|---|---|
| `dbo.Customers` and its columns, `CK_Customers_Contact` | `001-solution-skeleton` | Plus the UTC value converter, `nvarchar` defaults, `datetime2(3)` convention, enum-as-string, and `rowversion` — every convention this feature reads through |
| `UX_Customers_Email`, `UX_Customers_Phone`, the CI collation on `Email` | `007-create-customer` | The duplicate rule |
| `IX_Customers_FullName` | `008-customer-list-and-profile` | Customer search |
| `dbo.SupportUsers`, `UX_SupportUsers_Email` | `004-auth-and-roles` | The two joins for `assigneeName` and `createdBy` resolve here |
| `dbo.AuditLog` and its four indexes | `003-audit-trail` | This feature writes to it only on the `401` path (BR-9.2) |
| **`dbo.Tickets`** and every column | **`009-create-ticket`** | Including `RowVersion`, which is what `version` in the detail response projects from |
| `dbo.TicketNumberSeq` | `009-create-ticket` | `TicketNumber` is read here, never generated |
| `UX_Tickets_Number` | `009-create-ticket` | Lookup by number. Not used by this feature — `010` addresses tickets by `Id` |
| `IX_Tickets_Status_Created` on `(Status, CreatedAtUtc DESC)` | `009-create-ticket` | Justified in the blueprint as the "default list query". See the note below — it serves `015`'s filtered query, not `010`'s |
| `IX_Tickets_Customer` on `(CustomerId)` | `009-create-ticket` | Customer overview (`018`) |
| `IX_Tickets_Assignee` on `(AssignedToUserId)` | `009-create-ticket` | The "my tickets" filter (`015`) |
| `dbo.TicketComments`, `dbo.TicketHistory` and their indexes | `009-create-ticket` | Read by `013`, not by this feature |

## Added here

| Object | Definition | Query it serves |
|---|---|---|
| `IX_Tickets_CreatedAtUtc_Id` | `CREATE INDEX IX_Tickets_CreatedAtUtc_Id ON dbo.Tickets (CreatedAtUtc DESC, Id DESC);` | The default unfiltered list — AC-2's ordering plus AC-22's tie-breaker |

Not unique, not filtered. `BE-010-10` verifies it with:

```sql
SELECT  i.name, i.is_unique, i.filter_definition
FROM    sys.indexes i
WHERE   i.object_id = OBJECT_ID('dbo.Tickets');
```

`is_unique` must come back **0**. A unique index here would reject two tickets created in
the same millisecond — which is precisely the case AC-22 exists to exercise, so the test
that proves the tie-breaker would be the test that fails the migration.

(That query replaces the `\d+ tickets` the original artifact would have used. `psql`
meta-commands do not exist here — ADR-013.)

### Why a new index, and why not the existing one

`docs/sdd/03-domain-model.md` justifies `IX_Tickets_Status_Created` on
`(Status, CreatedAtUtc DESC)` as *"Default list query"*.

That is accurate for the **filtered** list in `015`, where `WHERE Status IN (…)` makes
`Status` a useful leading column. It is not accurate for `010`, which has no predicate at
all: with `Status` unconstrained, the index cannot serve `ORDER BY CreatedAtUtc DESC`
without reading and re-sorting the whole thing.

So the blueprint row is describing `015`'s query under `010`'s name. Recorded rather than
quietly worked around.

| Option | Consequence |
|---|---|
| **Add `IX_Tickets_CreatedAtUtc_Id`** (chosen) | One index, justified by exactly one named query — the default list, which is the most-executed query in the product. It also covers the `Id` tie-breaker, so paging is a seek rather than a sort |
| Reuse `IX_Tickets_Status_Created` | It cannot serve an unconstrained `ORDER BY CreatedAtUtc`. At demo volume nothing is measurable; at real volume the default list is the first thing to hurt |
| Add nothing and accept the scan | Defensible, and the honest position is that at a few hundred rows it makes no difference. Rejected because the index arrives **with** the query that needs it, which is the no-speculative-indexes rule working as intended rather than against us |

This index is on the **droppable** list in `tasks.md`: it is performance, not correctness.
The `ORDER BY` is the contract; the index only makes it cheap.

## Not added here

| Deferred | To | Why |
|---|---|---|
| Any index for free-text search on `Subject` | Nowhere — deliberately | A leading-wildcard `LIKE` cannot use a B-tree index, and Full-Text Search is a separate feature of the engine that nothing has measured a need for. `015`'s `research.md` records the limit rather than pre-solving it |
| Any index on `Priority`, `Category`, `Channel`, `IsEscalated` | Nowhere until measured | Low-selectivity columns. An index on a four-value column is usually ignored by the optimiser, and `015` filters against the existing `Status` and `Assignee` indexes |
| A covering index with `INCLUDE (Subject, CustomerId, …)` | Nowhere | It would make the list a pure index scan and it doubles the write cost of every ticket. No measurement asks for it |
| Any change to `dbo.Tickets` columns | — | This feature reads. It adds no field |

## The read shapes

Neither is an entity. DTOs at the boundary, never domain entities (constitution IV).

### List row — `TicketListItemResponse`

Projected inside the `Select`, so EF Core emits joins instead of lazy loads. This is
AC-12, and it is the difference between one query and one hundred and one.

```text
SELECT  t.Id, t.TicketNumber, t.Subject,
        t.CustomerId, c.FullName            AS CustomerName,
        t.Status, t.Priority, t.Category, t.Channel,
        t.AssignedToUserId AS AssigneeId, u.FullName AS AssigneeName,
        t.IsEscalated, t.CreatedAtUtc
FROM        dbo.Tickets      t
INNER JOIN  dbo.Customers    c ON c.Id = t.CustomerId
LEFT  JOIN  dbo.SupportUsers u ON u.Id = t.AssignedToUserId
ORDER BY    t.CreatedAtUtc DESC, t.Id DESC
OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY;
```

Two joins, and the difference between them matters:

| Join | Kind | What the other kind would do |
|---|---|---|
| `Customers` | **INNER** | `CustomerId` is `NOT NULL` with a foreign key, so a left join would be honest and pointless |
| `SupportUsers` | **LEFT** | An inner join would silently drop every **unassigned** ticket — which is the entire triage queue, and the list would look correct because the rows it hides are the ones nobody has claimed. `TEST-010-13` is the test |

`totalCount` is a second query against the same predicate (`docs/sdd/05-api-conventions.md`).
That is why AC-12 asserts a **constant** command count and not exactly one: the expected
number is 2, and the defect being hunted is 2 + n.

### Detail — `TicketDetailResponse`

One row, three joins to `dbo.SupportUsers` (`AssignedToUserId`, `CreatedByUserId`,
`EscalatedByUserId`) and one to `dbo.Customers`. All three user joins are **LEFT**: only
`CreatedByUserId` is non-nullable, and left-joining it costs nothing while making the
projection uniform.

`allowedTransitions` is **not** a column and not a join. It is
`TicketStatusTransitions.PermittedFrom(status)` — a static map in `Wasl.Domain`, evaluated
in memory after the row is materialised. It is deliberately not in the database:

| Rejected | Why |
|---|---|
| A `TicketTransitions` lookup table | ADR-004 rejected it. It moves behaviour into data, needs a round trip for a pure decision, and makes the rule invisible in code review |
| A computed column | Same, plus it would put a business rule in a migration |

`version` projects from `Tickets.RowVersion` — a real `rowversion` column, base64-encoded on
the wire. Not `xmin`, not a manually incremented `int` (ADR-013 row 1): a counter someone
forgets to increment is a silent lost update, which is the defect ADR-006 exists to prevent.

## Types this feature depends on being right

Read-only features are where a wrong type mapping surfaces, because they are the first
thing that renders the data.

| Concern | Correct here | Symptom if wrong |
|---|---|---|
| `Subject`, `Description`, `FullName` | `nvarchar` — EF Core's default for `string` on SQL Server, left alone deliberately | `varchar` returns `????` for Arabic, and it looks like a font problem, so it survives review (ADR-013 row 4). `TEST-010-12` asserts a byte-identical round trip |
| `CreatedAtUtc` | `datetime2(3)` read back through the UTC value converter from `001` | Without the converter a `Local` value is stored as if it were UTC and is wrong forever. It also makes the sort order wrong by hours in a way no test notices unless it checks the `Kind` |
| Millisecond precision | `datetime2(3)`, deliberately, not `(7)` | The precision is why ties are reachable — see AC-22. On `datetime2(7)` the tie-breaker would look like dead code, and then someone would delete it |
| Enums | `nvarchar(20)`, string-converted | An integer mapping makes a database dump unreadable and lets a reordered enum corrupt existing rows |
| `IsEscalated` | `bit` | Not `boolean` — that type does not exist here |
| `Id`, `CustomerId`, `AssignedToUserId` | `uniqueidentifier`, client-generated | Not `uuid` |

## No schema change beyond the index — and why that is worth stating

Every entity, column, constraint, and relationship this feature reads was created by `001`,
`003`, `004`, and `009`. If a reviewer finds a table or column change in this feature's
migration, it is scope creep — the feature is a read path, and the one index it adds is
named by the one query that needs it.
