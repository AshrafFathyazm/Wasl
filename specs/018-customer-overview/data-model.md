# 018 — Data Model

**Migration:** `AddTicketsCustomerIndex` — and it may legitimately contain nothing.

Scope: **no new table, no new column, no new constraint, no new entity.** This feature
reads. Full schema reference:
[`docs/sdd/03-domain-model.md`](../../docs/sdd/03-domain-model.md).

---

## What this feature adds to the schema

One index, conditionally.

| Object | Definition | Query it serves |
|---|---|---|
| `IX_Tickets_Customer` | `CREATE INDEX IX_Tickets_Customer ON dbo.Tickets (CustomerId)` | Both ticket reads in this feature: the grouped count and the capped recent list. `docs/sdd/03-domain-model.md` names its reason as "Customer overview", which is this story |

Both reads filter on `CustomerId` and nothing else, so a single-column index on
`CustomerId` covers them. Without it, each is a scan of `dbo.Tickets` — **twice per
profile view**, on the table that grows fastest in the product. That is not a
correctness problem and it will never fail a test; it is the thing that is fine at
demo scale and is not fine later.

### Why the migration may be empty

`IX_Tickets_Customer` sits in the `dbo.Tickets` DDL in `docs/sdd/03-domain-model.md`, and
its stated reason is this feature. But `015-ticket-filters-and-search` also filters
tickets by customer (BR-7.3), and `015` ships **before** `018` in the Phase 5 order while
being explicitly first out if time runs short. So one of three things is true when this
feature starts, and the migration cannot know which:

| Situation | What the migration does |
|---|---|
| `015` shipped and created the index | Nothing. Recorded, not duplicated |
| `015` was cut | Creates the index |
| `015` is still to come | Creates the index; `015` then finds it present |

`BE-018-02` therefore **checks before creating**, and its verification is a query, not an
assumption:

```sql
SELECT  i.name, i.type_desc, i.is_unique, c.name AS column_name
FROM    sys.indexes i
JOIN    sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
JOIN    sys.columns      c  ON c.object_id  = i.object_id AND c.column_id = ic.column_id
WHERE   i.object_id = OBJECT_ID('dbo.Tickets')
  AND   i.name = 'IX_Tickets_Customer';
```

One row, on `CustomerId`, or the index is not there.

**Migration note.** The original blueprint verified indexes with `psql`'s `\d+`, which
does not exist on SQL Server (ADR-013). The `sys.indexes` query above is the replacement,
and it is not merely a syntax swap: `\d+` prints every index at once, so a missing one is
visible by absence, whereas a query for a named index has to be *written* for that name.
The name is therefore part of the task.

Ownership of this index is spec **Q-1** and needs a human decision. Two features creating
the same index produces a migration that fails to apply on a clean database — the failure
mode is loud, which is the only good thing about it.

## What already exists, and is not touched

| Object | Created by | This feature |
|---|---|---|
| `dbo.Customers` — all columns, `CK_Customers_Contact` | `001-solution-skeleton` | Reads. Nothing added |
| `UX_Customers_Email`, `UX_Customers_Phone` | `007-create-customer` | Not used — the overview is addressed by primary key |
| `IX_Customers_FullName` | `008-customer-list-and-profile` | Not used — same reason |
| `dbo.Tickets` — all columns, `RowVersion`, the `TicketNumberSeq` sequence | `009-create-ticket` | Reads. Nothing added |
| `FK_Tickets_Customers` (`ON DELETE NO ACTION`) | `009-create-ticket` | Unchanged. It is why a customer with tickets cannot be deleted out from under this query |
| `IX_Tickets_Status_Created` | `010-ticket-list-and-detail` | Not used by this feature. Its leading column is `Status`; these reads filter on `CustomerId` |
| `dbo.AuditLog`, its indexes, the `DENY UPDATE, DELETE` | `003-audit-trail` | The `401` path writes one row through the existing pipeline. No schema change |

## Types, for the record

Nothing is created here, but the columns this feature reads are the ones ADR-013 changed,
so the shapes it depends on are worth stating — a projection written against the wrong
assumption compiles and returns wrong values.

| Column read | Type | Why it matters here |
|---|---|---|
| `Customers.Id`, `Tickets.Id`, `Tickets.CustomerId` | `uniqueidentifier` | Not `uuid`. The route binds `Guid`, and `Id` is the ordering tie-break in AC-2 |
| `Customers.FullName`, `CompanyName`, `Notes`, `Tickets.Subject` | `nvarchar` | Not `varchar`. Arabic in a `varchar` column returns `????`, and it presents as a font problem rather than a schema one — which is exactly why it survives review (ADR-013) |
| `Tickets.CreatedAtUtc` | `datetime2(3)` | Not `timestamptz`. **Millisecond** precision, which is why AC-2 requires the `Id` tie-break: ties are ordinary, not theoretical |
| `Tickets.Status` | `nvarchar(20)`, enum-as-string | The `GROUP BY` groups on the stored string. Enum-as-string also means the grouped result is readable in a query window during support work |
| `Customers.IsActive`, `Tickets.IsEscalated` | `bit` | Not `boolean` |
| `Customers.RowVersion` | `rowversion` | Not `xmin`. Returned as base64 `version` (AC-13); read-only here, never incremented by application code |
| `AuditLog.Changes` | `nvarchar(max)` + `ISJSON` check | Not `jsonb`. Not written by this feature except via the existing `401` path |

## Concurrency

None. Nothing here writes, so nothing takes or checks a `rowversion`. `version` is
carried on the response purely so `017-update-customer` does not need a second read
before a save (AC-13).

## Why there is no `TicketCount` column

The obvious "optimisation" is to denormalise: a `TicketCount` column on `dbo.Customers`,
or six of them, maintained on every ticket write.

| | Cost |
|---|---|
| One counter column | Every ticket create and every status change becomes a two-table write, and each is a place the counter can drift from the rows |
| Six status counters | The same, six times over, plus a migration every time BR-1 gains a status |
| What it buys | One index seek per profile view, avoided |

A counter that disagrees with the rows is worse than a count that takes a millisecond,
because nothing in the system will ever tell you it disagrees. A grouped count over an
indexed `CustomerId` is the correct answer at this scale, and the scale where it stops
being correct is far past this product. If that day comes, it is an ADR, not a patch.
