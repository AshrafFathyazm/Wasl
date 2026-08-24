# 019 — Data Model

**Migration:** none. **This feature adds no schema.**

That is the headline and it needs stating rather than leaving as an empty section: a
reader who sees no `data-model.md` content assumes it was forgotten.

Full schema reference:
[`docs/sdd/03-domain-model.md`](../../docs/sdd/03-domain-model.md) · ADR-008 · ADR-013.

---

## What already exists, and who created it

`003-audit-trail` created every object this feature reads. All of it is SQL Server shape
per ADR-013 — `bigint IDENTITY`, `uniqueidentifier`, `datetime2(3)`, `nvarchar`, and
`nvarchar(max)` with an `ISJSON` check where PostgreSQL would have used `jsonb`.

```sql
CREATE TABLE dbo.AuditLog (
    Id             bigint           IDENTITY(1,1) NOT NULL PRIMARY KEY,
    OccurredAtUtc  datetime2(3)     NOT NULL,
    ActorUserId    uniqueidentifier NULL,
    ActorEmail     nvarchar(320)    NULL,
    ActorRole      nvarchar(20)     NULL,
    Action         nvarchar(80)     NOT NULL,
    EntityType     nvarchar(50)     NULL,
    EntityId       uniqueidentifier NULL,
    EntityLabel    nvarchar(200)    NULL,
    Outcome        nvarchar(20)     NOT NULL,
    Changes        nvarchar(max)    NULL,
    TraceId        varchar(64)      NOT NULL,
    IpAddress      varchar(45)      NULL,
    UserAgent      nvarchar(400)    NULL,
    CONSTRAINT CK_AuditLog_ChangesIsJson
        CHECK (Changes IS NULL OR ISJSON(Changes) = 1)
);
```

| Object | Created by | What this feature does with it |
|---|---|---|
| `dbo.AuditLog` | `003` | Reads it. Writes exactly one row per read, through the audit behaviour |
| `CK_AuditLog_ChangesIsJson` | `003` | Relies on it. It is the only guarantee that `changes` can be parsed by the client at all — and it guarantees *valid JSON*, not the expected shape |
| `IX_AuditLog_Time` — `(OccurredAtUtc DESC)` | `003` | Serves the `from`/`to` range filter |
| `IX_AuditLog_Entity` — `(EntityType, EntityId, OccurredAtUtc DESC)` | `003` | Serves `entityType` + `entityId`. **Leads on `EntityType`**, which is why `entityId` alone is a `400` rather than a scan |
| `IX_AuditLog_Actor` — `(ActorUserId, OccurredAtUtc DESC)` | `003` | Serves `actorUserId` |
| `IX_AuditLog_NotSuccess` — `(OccurredAtUtc DESC) WHERE Outcome <> 'Success'` | `003` | Serves `outcome=Denied` / `outcome=Failed` — **conditionally**, see below |
| `GRANT INSERT, SELECT` / `DENY UPDATE, DELETE ON dbo.AuditLog TO wasl_app` | `003` | Relies on it. It is why AC-9 is a property of the database and not of this feature remembering not to map a `DELETE` route. `DENY`, not `REVOKE` — `DENY` outranks a grant inherited from role membership, so adding the login to `db_datawriter` later cannot undo it (ADR-013) |

No `rowversion` on this table, deliberately: it is append-only, so there is nothing two
writers could conflict over (ADR-006 as amended by ADR-013).

No foreign keys on `ActorUserId` or `EntityId`, deliberately: an audit row must be able to
record a deletion and still exist afterwards (ADR-008). That absence is what makes `AC-7`
possible and what makes the snapshotted `ActorEmail`, `ActorRole` and `EntityLabel`
mandatory rather than convenient.

The query-to-index map in `03-domain-model.md` names US-015 four times. **This feature is
the story those four indexes were created for.** Until it exists they are paid for and
unused, which is the honest reason the feature sits in Release 2 rather than being free.

## Added here

Nothing. No table, no column, no index, no constraint, no migration.

An index is only added when a named query needs it, and every query this feature issues
already has one. Adding a fifth index "while we are here" would be the speculative index
the rules exist to prevent.

## The one conditional migration, and how it is decided

`IX_AuditLog_NotSuccess` is filtered on `Outcome <> 'Success'` and does **not** carry
`Outcome` as a key or included column. A query written as `WHERE Outcome = 'Denied'` may
therefore not use it at all:

- SQL Server matches a filtered index only when it can prove the query predicate implies
  the index filter. Implication across an **inequality** filter is not reliably derived.
- Even where it matches, `Outcome` is not in the index, so evaluating the residual
  predicate needs a key lookup per row — and the optimizer often prefers a scan instead.

**The failure is silent.** `AC-4` as written ("return only those rows, served by the
filtered index") passes on the row assertion whether or not the index is touched. So the
verification for `BE-019-07` / `TEST-019-04` is the **actual execution plan**, read from
`sys.dm_exec_query_plan` or the plan XML captured in the integration test, and it must
name `IX_AuditLog_NotSuccess`.

Two responses, in order:

| Step | Action |
|---|---|
| 1 | The handler adds a redundant `AND Outcome <> 'Success'` whenever the requested outcome set excludes `Success`. This gives the optimizer the literal implication it needs, and costs nothing when the index is not chosen |
| 2 | **Only if the plan still ignores the index:** migration `AlterAuditLogNotSuccessIndexIncludeOutcome`, changing it to `CREATE INDEX IX_AuditLog_NotSuccess ON dbo.AuditLog (Id DESC) INCLUDE (Outcome) WHERE Outcome <> 'Success'`. Keyed on `Id DESC` because that is the sort this feature actually pages on |

Step 2 is a change to an object `003` owns, so it is recorded as a **Contract-adjacent
deviation** in `summary.md` if it happens, and `03-domain-model.md` is updated with it.
It is not pre-emptively written into `003`, because an index amended on speculation is
the same mistake as an index added on speculation.

## Not added here

| Deferred | Why |
|---|---|
| An index on `Action` | `action=Auth.` is a `LIKE 'Auth.%'` residual predicate on a backwards clustered scan. At thousands of rows that is a few milliseconds. **The threshold is roughly a million rows**, at which point the fix is `CREATE INDEX IX_AuditLog_Action_Id ON dbo.AuditLog (Action, Id DESC)` — a left-anchored `LIKE` can seek on it. Adding it now would be an index with no measurement behind it |
| A JSON index or computed column over `Changes` | `nvarchar(max)` has no JSON indexing (ADR-013). Nothing in scope queries inside `Changes`, and searching it is explicitly out of scope |
| A retention or purge job, and any partitioning | BR-9.13 puts retention outside the application, and Q-9 has no answer. Partitioning a table with no retention policy is deciding Q-9 by implementation |
| Any `UPDATE` or `DELETE` path | BR-9.5. The `DENY` already makes it impossible; adding a code path would only produce a runtime permission error |

## How this feature reads the table

| Concern | Implementation |
|---|---|
| Ordering | `ORDER BY Id DESC`. Newest-first **and** deterministic. `OccurredAtUtc DESC` alone is not: `datetime2(3)` ties are possible, and an unstable sort under keyset pagination drops or duplicates rows at the page boundary |
| Keyset predicate | `WHERE (@cursor IS NULL OR Id < @cursor)`. Rows below a cursor never change in an append-only table, which is the property offset paging lacks |
| Page size | `Take(pageSize + 1)`. The extra row is how `hasMore` is answered without a second `COUNT` |
| Tracking | `AsNoTracking()`. Nothing here is updated, and tracking thousands of rows for a read is pure cost |
| Projection | Projected straight into `AuditEntryResponse` in the query. The entity never leaves the slice |
| `LIKE` safety | The `action` prefix is escaped for `%`, `_` and `[` with an explicit `ESCAPE` clause. Without it, `action=%` returns the whole table and reads as a filter that quietly did nothing |
| `Id` on the wire | Serialised as a **string**. A `bigint` above 2^53 loses precision in JavaScript silently, and a cursor built from a rounded id reads the wrong page |
| Cancellation | `CancellationToken` on the query and on `ToListAsync` — a nine-column scan is exactly the request a user abandons by navigating away |

## Domain shape

`Wasl.Domain/Audit/` — owned by `003`, consumed here. `Wasl.Domain` has zero package
references (ADR-010), so nothing below touches EF Core.

| Type | Owner | Note |
|---|---|---|
| `AuditEntry` | `003` | The entity. Read-only from this feature's point of view |
| `AuditOutcome` | `003` | `Success` \| `Denied` \| `Failed`, persisted as a string so a database dump is readable |
| `AuditAction` | `003` | Constants for the BR-9 naming table. This feature needs `Audit.Read` and adds the constant if `003` did not |
| `AuditEntityType` | **added here if absent** | The accepted `EntityType` values: `Ticket`, `Customer`, `SupportUser`, `AuditLog` |

`AuditEntityType` lives beside the writer on purpose. If the reader's validator held its
own private list, a later story writing a fifth entity type would produce rows that are
**unfilterable and nothing would fail** — no test, no build error, just a filter that
silently cannot reach part of the table.
