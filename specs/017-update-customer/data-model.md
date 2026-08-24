# 017 — Data Model

**Migration:** none.

**There is no schema change in this feature, and that is the finding rather than a gap.**
Every object `017` needs already exists. What `017` does is **exercise** them — it is the
first feature that reads the concurrency token, and the first that re-runs the duplicate
rule against a row that already exists.

Full schema reference:
[`docs/sdd/03-domain-model.md`](../../docs/sdd/03-domain-model.md). Type mapping:
[`ADR-013`](../../docs/sdd/decisions/ADR-013-database-sql-server.md).

---

## What already exists, and which feature created it

| Object | Definition | Created by | What `017` needs it for |
|---|---|---|---|
| `dbo.Customers` | The table | `001-solution-skeleton` | The row being updated |
| `FullName` | `nvarchar(200) NOT NULL` | `001` | AC-1, AC-11 |
| `Email` | `nvarchar(320) COLLATE Latin1_General_100_CI_AS NULL` | `001`, collation set by `007` | AC-2, AC-9 |
| `PhoneE164` | `nvarchar(20) NULL` | `001` | AC-8, AC-10 |
| `CompanyName` | `nvarchar(200) NULL` | `001` | AC-1, AC-12 |
| `Notes` | `nvarchar(2000) NULL` | `001` | AC-1, AC-12 |
| `IsActive` | `bit NOT NULL DEFAULT 1` | `001` | Read by the duplicate filter. **Not writable here** |
| `CreatedAtUtc` | `datetime2(3) NOT NULL` | `001` | Returned, never modified |
| `UpdatedAtUtc` | `datetime2(3) NOT NULL` | `001` | Written from `TimeProvider` (AC-16) |
| `RowVersion` | `rowversion NOT NULL` | `001` | **The concurrency token.** AC-4, AC-15, AC-23 |
| `CK_Customers_Contact` | `CHECK (Email IS NOT NULL OR PhoneE164 IS NOT NULL)` | `001` | The last line of defence for AC-3 |
| `UX_Customers_Email` | `UNIQUE ... (Email) WHERE Email IS NOT NULL AND IsActive = 1` | `007` | AC-2, AC-7 |
| `UX_Customers_Phone` | `UNIQUE ... (PhoneE164) WHERE PhoneE164 IS NOT NULL AND IsActive = 1` | `007` | AC-8, AC-7 |
| `dbo.AuditLog` | Table, `bigint IDENTITY`, `Changes nvarchar(max) CHECK (ISJSON(Changes) = 1)` | `003-audit-trail` | The `Customer.Updated` row (AC-17) |

## Added here

Nothing.

If `dotnet ef migrations add` produces a non-empty migration in this feature, **stop**:
either an entity was changed that should not have been, or something in `001`/`007` was
modelled differently from the configuration this feature reads. `BE-017-11` is the task
that checks it, and it is a verification rather than a build.

## Not added here

| Not added | Why |
|---|---|
| A `CustomerHistory` table | US-003 excludes field-level customer history. The `Customer.Updated` audit row is the record of who changed a phone number, and ADR-008 cites exactly this gap as a reason `AuditLog` exists separately from `TicketHistory`. Two tables answering the same question is the redundancy ADR-008 accepted for tickets *because* the timeline is a product feature — there is no customer timeline requirement to justify it here |
| A `Version int` column | ADR-006 rejected a manual counter: every new entity and every raw update has to remember to increment it, and the one that forgets is a silent lost update. `rowversion` is incremented by SQL Server itself |
| An index on `UpdatedAtUtc` | Nothing queries it. Sorting customers by recent change is not a requirement, and no speculative indexes |
| A trigger maintaining `UpdatedAtUtc` | Invisible in code review and untestable in the unit suite (ADR-008's reasoning against triggers). `TimeProvider` in the handler, tested with a fake clock (AC-16) |
| Anything on `IsActive` | Deactivation has no story. The column is read by the duplicate filter and is not writable by this endpoint |

## The concurrency token, in practice

This is the feature where ADR-006 stops being a column and starts being behaviour.

```sql
-- What EF Core emits for a successful save
UPDATE dbo.Customers
SET    FullName = @p0, Email = @p1, PhoneE164 = @p2,
       CompanyName = @p3, Notes = @p4, UpdatedAtUtc = @p5
WHERE  Id = @id AND RowVersion = @expectedVersion;

SELECT RowVersion FROM dbo.Customers WHERE Id = @id;   -- the new token, returned
```

| Property | Where it comes from |
|---|---|
| The comparison | The `WHERE` clause. Not application code (`REV-017-03` reads the generated SQL to confirm it) |
| The increment | SQL Server, on any `UPDATE` to the row. Not application code, ever |
| Zero rows affected | `DbUpdateConcurrencyException`, mapped once to `409 errors/concurrency-conflict` (`BE-017-05`) |
| The wire format | Base64 of the 8-byte token. `expectedVersion` in, `version` out |

EF mapping, unchanged from `001`:

```csharp
builder.Property(c => c.RowVersion).IsRowVersion();
```

`.IsRowVersion()` is what makes EF treat the column as a concurrency token *and* as
store-generated. Configuring it as a plain `byte[]` compiles, saves, and never conflicts —
the version is simply overwritten. That is a silent last-write-wins wearing a concurrency
token's name, and it is the reason `BE-017-11` asserts the column's type comes back as
`timestamp` from `sys.types` rather than trusting the model.

**Not `xmin`.** ADR-006 was written against PostgreSQL, where the token needed no column.
ADR-013 replaced it with a real `rowversion` column. Any artifact still saying `xmin` or
`UseXminAsConcurrencyToken` predates that.

## The duplicate rule, on an existing row

`007` established the pair: a filtered unique index is the guarantee, an application check
produces the usable message (BR-4.8). `017` inherits both and adds exactly one thing.

```sql
-- ActiveCustomerDuplicateQuery, with the exclusion 017 adds
SELECT 1 FROM dbo.Customers
WHERE  IsActive = 1
  AND  Id <> @excludeCustomerId          -- the whole difference
  AND (Email = @email OR PhoneE164 = @phone);
```

| Layer | Gives you | Without the exclusion |
|---|---|---|
| Application pre-check | The friendly `409` naming the field | **Every save fails.** A customer's own email matches itself, so the check reports a duplicate against the row it is checking (AC-7) |
| Filtered unique index | The guarantee under a race | Nothing changes — SQL Server does not consider a row a duplicate of itself. The index is correct here without any help; only the pre-check needed fixing |

That asymmetry is worth naming: the bug lives entirely in the application check, and it
presents as "editing a customer is broken", not as "the duplicate rule is wrong". Both
indexes stay exactly as `007` created them.

The index still matters on update, for the case where two agents move two different
customers onto the same email concurrently: both pre-checks pass, one `UPDATE` wins, and
the other raises a unique-violation that `BE-017-07` translates into the same `409` a
sequential duplicate would produce.

## Verification

`BE-017-11`, run against the container after `dotnet ef database update`:

```sql
-- Both filtered indexes still carry their WHERE clause.
-- A NULL filter_definition means the filter was lost in 007's migration, and it
-- presents here as "editing a customer with no email fails".
SELECT  i.name, i.is_unique, i.filter_definition
FROM    sys.indexes i
WHERE   i.object_id = OBJECT_ID('dbo.Customers');

-- RowVersion is a real rowversion column. Expect type name 'timestamp'.
SELECT  c.name, t.name AS type_name, c.max_length
FROM    sys.columns c
JOIN    sys.types t ON t.user_type_id = c.user_type_id
WHERE   c.object_id = OBJECT_ID('dbo.Customers')
  AND   c.name = 'RowVersion';

-- Every human-writable column is nvarchar. varchar returns ???? for Arabic and
-- looks like a font bug, which is how it survives review (ADR-013 row 4).
SELECT  c.name, t.name AS type_name
FROM    sys.columns c
JOIN    sys.types t ON t.user_type_id = c.user_type_id
WHERE   c.object_id = OBJECT_ID('dbo.Customers')
  AND   c.name IN ('FullName','Email','PhoneE164','CompanyName','Notes');
```

Integration tests run against a real SQL Server through `Testcontainers.MsSql`. EF
`InMemory` is not used here and could not be: it does not enforce unique indexes and does
not enforce concurrency tokens, which are the two things every interesting test in this
feature asserts.

## Domain shape

`Wasl.Domain/Customers/` — no new aggregate, one new method and one new record.

| Type | Change | Responsibility |
|---|---|---|
| `Customer` | Gains `Update(...)` | Applies the five values through the existing value objects, re-enforces BR-4.1, returns the change set. Setters stay private |
| `CustomerChangeSet` | New | `(field, before, after)` for each field whose **normalised** value changed. Plain values — no EF, no JSON, no serializer attribute. The audit behaviour turns it into `Changes` |
| `EmailAddress`, `PhoneNumber` | Unchanged | Parse-or-fail value objects from `007`. They are why the change set can compare canonical forms |

The change set is produced by the domain rather than by the handler because the handler
sees **raw** input beside **normalised** storage. Diffing those two records
`" Ali@Example.COM "` as a change to `ali@example.com`, so every save logs a phantom edit
to the audit table — a defect that adds rows rather than losing them, which is why nothing
ever notices it.

## Audit row written here

| Column | Value |
|---|---|
| `Action` | `Customer.Updated` — from the BR-9 naming table, `Entity.Verb` |
| `EntityType` / `EntityId` | `Customer` / the customer's `Id`. No foreign key, deliberately (ADR-008) |
| `EntityLabel` | The customer's `FullName` **after** the update, snapshotted |
| `ActorUserId`, `ActorEmail`, `ActorRole` | Snapshotted from the token, never joined (BR-9.6) |
| `Changes` | JSON, only the fields that actually changed (BR-9.8). Empty on a no-op save (AC-19) |
| `Outcome` | `Success`. The `401` path writes its own row with `Denied`, outside any transaction (BR-9.4) |
| `TraceId` | Matches the `traceId` a `ProblemDetails` would have carried (BR-9.9) |
| `OccurredAtUtc` | From `TimeProvider` |

`Changes` contains the customer's email and phone, before and after. That is personal data
in the audit table, it is intentional, and ADR-008 names it as a consequence: access
control (`019-audit-log-access`, Manager only) and retention are the answers, not a weaker
diff. `REV-017-02` confirms nothing beyond that gets in — no token, no header dump, no
password (BR-9.7).
