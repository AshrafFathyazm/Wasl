# Data model — `020b-dashboard-trend`

One table. No change to any existing one.

---

## `dbo.DashboardDailySnapshot`

| Column | Type | Null | Why |
|---|---|---|---|
| `Id` | `bigint IDENTITY` | no | Surrogate key. **Not `Guid.CreateVersion7()`** — this table is append-and-update by a background job, is never referenced by a URL, and has no client that could paste an id. `dbo.AuditLog` uses `bigint` for the same reason |
| `LocalDate` | `date` | no | **The BUSINESS date** — the day these numbers describe, in `Wasl:OrganizationTimeZone`. A `date`, not a `datetime2`: it carries no time by construction, which is the same reasoning that made `020`'s `localDate` a bare string on the wire |
| `ScopeUserId` | `uniqueidentifier` | **yes** | `NULL` = the team. A user id = that agent's view. FK to `dbo.SupportUsers(Id)` |
| `UnassignedCount` | `int` | no | Global in both scopes, as `020` documents — an unassigned ticket has no owner |
| `EscalatedOpenCount` | `int` | no | Scoped |
| `WaitingOnCustomerCount` | `int` | no | Scoped |
| `AssignedCount` | `int` | no | Scoped. Present so the team row can be read as *what the team was holding*, which the tile does not show today but which is the one number a trend on this table would obviously want next |
| `OldestUntouchedHours` | `int` | **yes** | `NULL` when no untouched ticket existed. **Not `0`** — the same distinction `020`'s medians make, and for the same reason: no data is not "brand new" |
| `CapturedAtUtc` | `datetime2(3)` | no | **The TECHNICAL date** — when the capture actually ran. `datetime2(3)` and the global UTC converter, per ADR-013 |

### The two dates are different on purpose

A capture that runs at 00:05 local on 8 September, describing the 7th, writes:

```text
LocalDate     = 2026-09-07          -- the day described
CapturedAtUtc = 2026-09-07T21:05Z   -- when it ran (00:05 +03)
```

They disagree by the zone's offset and that is correct. **Without `CapturedAtUtc` a row that ran
late is indistinguishable from one that ran on time**, and nobody can tell afterwards which day's
events it actually saw.

### `UNIQUE (LocalDate, ScopeUserId)` — plain, and it is the concurrency guarantee

```sql
CREATE UNIQUE INDEX UX_DashboardDailySnapshot_Date_Scope
    ON dbo.DashboardDailySnapshot (LocalDate, ScopeUserId);
```

**Not filtered, and `research.md` R-1 is the measurement that settled it.** SQL Server's unique
index treats `NULL`s as equal, so this already permits exactly one team row per day — error 2601
on the second. The spec's first draft claimed a filtered index was required; it was wrong, and
the correction is recorded in both files rather than edited away.

This index — not a lock, not a `SELECT` before the `INSERT` — is what makes two instances
capturing the same minute safe. `CLAUDE.md`'s write-path rule applies in full: *is check-then-act
relied on as the guarantee?* No. The upsert (`research.md` R-2) is the message; the index is the
rule.

**It is deliberately NOT added to `WaslDbContext.TranslateDuplicate`.** That list turns an index
violation into a readable `409` for a caller, and this violation has no caller: it happens inside
a background capture and means *the other instance won*, which is success. The catch is local and
is documented at the catch.

### The foreign key, and what it does on delete

```sql
FOREIGN KEY (ScopeUserId) REFERENCES dbo.SupportUsers (Id)
```

**No cascade.** `SupportUser` is deactivated, never deleted — `020`'s team-load card renders a
deactivated user who still holds work, which is only possible because the row survives. If a
delete is ever added, the snapshot rows are history and should outlive it; that decision belongs
to whoever adds the delete.

### Indexes, and the one that is NOT added

The read is `WHERE LocalDate = @date AND (ScopeUserId = @user OR (@user IS NULL AND ScopeUserId
IS NULL))` — a point lookup the unique index already serves as a seek. **No second index.** The
constitution requires an index to be justified by a named query, and there is no second query.

## Volume

| | Rows per year |
|---|---|
| Team scope | 365 |
| Per agent | 365 × active agents |

At three seeded users that is ~1,460 rows a year. **No retention policy is specified**, and §4 of
the spec says why: pruning is a decision for whoever first has a reason, and inventing one now is
inventing a requirement.

## Migration

One `dotnet ef migrations add DashboardDailySnapshot`. Additive: a new table, a new index, a new
FK. **Nothing existing changes**, so there is no data migration and no back-fill — §2.1 and the
Q-1 ruling both forbid one.

The restricted `wasl_app` principal needs `INSERT` and `UPDATE` on the new table and already has
them: `003b` grants `db_datawriter` per-role rather than per-table, exactly so a new table is not
a `500` that reads as a bug in the feature. **`--provision` does not change.**

## What this table is not

- **Not an audit trail.** `dbo.AuditLog` records what a person did; this records what the numbers
  were. It is derived data and is safe to delete and recompute — except that it *cannot* be
  recomputed, which is the whole point of writing it down.
- **Not an event store.** It holds levels, not transitions. Reconstructing a level from
  transitions is the route `spec.md` §2.1 rejects on measurement.
- **Not per-request or per-hour.** One row per day per scope, which is the coarsest grain that
  answers *"what was this level a fortnight ago"*.
