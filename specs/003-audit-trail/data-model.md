# 003 — Data Model

Scope: one table, one database role, two permission statements. The full schema reference
is [`docs/sdd/03-domain-model.md`](../../docs/sdd/03-domain-model.md); this file records
only what **this** feature creates, and why each choice is not the obvious one.

**Migration name:** `AddAuditLog`

---

## `dbo.AuditLog`

The forensic record (ADR-008). The physical shape below is
`docs/sdd/03-domain-model.md`'s sketch, unchanged — if the generated migration ever
disagrees with it, the migration is the truth and this file is the defect.

| Column | Type | Null | Note |
|---|---|---|---|
| `Id` | `bigint IDENTITY(1,1)` | no | PK. The only non-`uniqueidentifier` key in the schema — append-only, high volume, always read in time order (ADR-008) |
| `OccurredAtUtc` | `datetime2(3)` | no | From the injected `TimeProvider`, never `DateTime.UtcNow` (AC-23) |
| `ActorUserId` | `uniqueidentifier` | **yes** | **No foreign key.** Null for anonymous events — a failed sign-in has no actor |
| `ActorEmail` | `nvarchar(320)` | yes | Snapshot at write time (BR-9.6). No collation override: this column is never compared, only read |
| `ActorRole` | `nvarchar(20)` | yes | Snapshot at write time — the role held *then* |
| `Action` | `nvarchar(80)` | no | `Entity.Verb`, from `IAuditableCommand.AuditAction`. Never localized |
| `EntityType` | `nvarchar(50)` | yes | `Ticket`, `Customer`, `SupportUser` |
| `EntityId` | `uniqueidentifier` | yes | **No foreign key** |
| `EntityLabel` | `nvarchar(200)` | yes | A readable handle — `TCK-2026-000042` — so the row means something without a join |
| `Outcome` | `nvarchar(20)` | no | `AuditOutcome` as a string: `Success`, `Denied`, `Failed` |
| `Changes` | `nvarchar(max)` | yes | Redacted JSON diff. Shape below |
| `TraceId` | `varchar(64)` | no | `varchar` deliberately — a W3C `traceparent` is ASCII by definition |
| `IpAddress` | `varchar(45)` | yes | `varchar`; 45 characters is the longest IPv6 form. Normalised — `::ffff:127.0.0.1` is stored as `127.0.0.1` |
| `UserAgent` | `nvarchar(400)` | yes | Truncated to 400 at write time, never allowed to throw |

**Constraint:** `CK_AuditLog_ChangesIsJson` —
`CHECK (Changes IS NULL OR ISJSON(Changes) = 1)`

SQL Server has no `jsonb`. ADR-013 row 6 downgrades the column to `nvarchar(max)`, and this
check is the only thing keeping a malformed diff out of it.

### What this table deliberately does not have

| Absent | Why | Asserted by |
|---|---|---|
| Any foreign key | An audit row must be able to record a deletion and still exist afterwards. A foreign key would let the lifecycle of the audited thing block, cascade, or invalidate the record of it (BR-9.12, ADR-008) | AC-2 — `sys.foreign_keys` count is 0 |
| `rowversion` | Append-only. There is no second writer to conflict with (ADR-006 as amended, `research.md` R-10) | AC-5 |
| `UpdatedAtUtc` | Nothing updates a row. A column for it would be an invitation | AC-5 |
| `CHECK` on `Outcome` | Consistent with every other enum column in the schema: the domain is the constraint, not the database (`docs/sdd/03-domain-model.md`, *No lookup tables*) | — |
| A collation override on `ActorEmail` | ADR-013 row 3 puts the case-insensitive collation on `Customers.Email` and `SupportUsers.Email` only, because that is where uniqueness is compared. Blanket collation changes comparison semantics for columns where it was never wanted | — |

### Indexes

Four, each serving a named query. The queries themselves are in
[`contracts/README.md`](contracts/README.md), because until `019` exists SQL *is* the read
interface.

| Index | Definition | Query it serves |
|---|---|---|
| `IX_AuditLog_Time` | `(OccurredAtUtc DESC)` | "What happened recently" |
| `IX_AuditLog_Entity` | `(EntityType, EntityId, OccurredAtUtc DESC)` | "Everything that touched this record" |
| `IX_AuditLog_Actor` | `(ActorUserId, OccurredAtUtc DESC)` | "Everything this person did" |
| `IX_AuditLog_NotSuccess` | `(OccurredAtUtc DESC) WHERE Outcome <> 'Success'` | "Show me denials and failures" — the query that matters after an incident, over a table that is otherwise dominated by successes |

**The filtered one is verified, not assumed.** A filtered index created without its `WHERE`
clause is a migration defect that presents as a performance problem, so AC-3 reads the
catalogue rather than the migration:

```sql
SELECT  i.name, i.has_filter, i.filter_definition
FROM    sys.indexes i
WHERE   i.object_id = OBJECT_ID('dbo.AuditLog');
-- IX_AuditLog_NotSuccess must report has_filter = 1
-- and filter_definition = ([Outcome]<>'Success')
```

### Permissions — BR-9.5, enforced by the database

```sql
IF DATABASE_PRINCIPAL_ID('wasl_app') IS NULL
    CREATE ROLE wasl_app;

GRANT INSERT, SELECT ON dbo.AuditLog TO wasl_app;
DENY  UPDATE, DELETE ON dbo.AuditLog TO wasl_app;
```

Three things about these four lines:

- **`DENY`, not `REVOKE`** (ADR-013 row 10). `DENY` outranks a grant inherited from role
  membership, so adding the application login to `db_datawriter` later cannot quietly undo
  it.
- **A role, not a user.** ADR-013 writes `TO wasl_app`, which reads as a user. A role is the
  same grant with one fewer coupling: the login name varies by environment, and no password
  ever enters a migration file. The login is created and added to the role by an
  operational step (documented in `setup.md`) and by the test fixture, per run.
- **It only means something if the application is not `sa`.** `DENY` does not restrict a
  member of `sysadmin`, and `db_owner` skips the check on its own objects — so this whole
  block is decorative on a `sa` connection, with every test still green. AC-13 is the
  assertion that makes that visible: on the application's own connection,
  `IS_SRVROLEMEMBER('sysadmin')`, `IS_ROLEMEMBER('db_owner')`, and
  `HAS_PERMS_BY_NAME('dbo.AuditLog','OBJECT','UPDATE')` must all return 0.

Consequence, recorded here because it changes how the repository is run: **two connection
strings.** `ConnectionStrings:Migrations` is an owner and is what `dotnet ef database
update` uses; `ConnectionStrings:Default` is a member of `wasl_app` and is what the running
application uses. A least-privileged principal cannot execute DDL, so one string cannot do
both jobs.

---

## The shape of `Changes`

A JSON **array** of change records — flat, so `OPENJSON` can query it in `019` without
knowing which entity it describes, and stable, so two runs of the same command produce
byte-identical text (AC-19).

```json
[
  { "entity": "Customer", "id": "8f1c2d34-5678-4abc-9def-0123456789ab",
    "field": "Email",     "before": null, "after": "ali@example.com" },
  { "entity": "Customer", "id": "8f1c2d34-5678-4abc-9def-0123456789ab",
    "field": "PhoneE164", "before": "+966501234567", "after": "+966555000111" }
]
```

| Rule | Reason |
|---|---|
| Envelope keys are `entity`, `id`, `field`, `before`, `after` — lowercase, fixed | They are part of what `019` reads. Not localized, ever (BR-8.7 applies to machine-readable keys) |
| `field` is the CLR property name, unchanged | It is an identifier, not a label. Translating it would make the stored data locale-dependent |
| Entries are ordered by `entity`, then `id`, then `field` | Determinism is what lets a test compare `Changes` byte-for-byte instead of parsing it |
| A field whose value did not change is **absent** (BR-9.8) | Including unchanged fields would bury the one that changed. A write that sets a property to the value it already had produces no entry — AC-18 |
| `null` is `null`, not `""` and not `"null"` | `before: null` on a create is meaningful and different from an empty string |
| A redacted field keeps its name and loses both values (BR-9.7) | `{ "field": "PasswordHash", "before": "[redacted]", "after": "[redacted]" }`. That a password changed is auditable; the value is not |
| An empty diff is `null`, not `[]` | A command that changed nothing and a command whose diff was lost must not look the same. `null` means "no tracked change"; `[]` would be indistinguishable from the R-1 failure |
| `AuditEntry` itself is excluded from the diff | Otherwise every audit row records the writing of an audit row |

### Redaction deny-list — BR-9.7

A pure function in `Wasl.Domain/Audit/AuditRedaction.cs`, unit-tested with no database
(constitution III: the rule lives in the domain, once).

| Matched | Match rule |
|---|---|
| `Password`, `PasswordHash`, `Token`, `RefreshToken`, `SigningKey`, `Secret`, `ApiKey` | Property name, case-insensitive, exact |
| `TicketComments.Body` | Entity-qualified. BR-9.7 and BR-5.5: a comment records **that** a comment was added, never its text |

Case-insensitive **exact** name matching rather than "contains": a substring rule would
redact a future column called `TokenCount` or `SecretaryName`, and a redacted field nobody
intended to redact is a hole that looks like a feature. The cost is that a new sensitive
column must be added to the list — which is why the list is one file, in the domain, with
its own unit test.

---

## The domain types

`Wasl.Domain/Audit/`. Zero package references, per ADR-010 and constitution III.

| Type | Shape |
|---|---|
| `AuditEntry` | The entity. Private setters, one static factory `AuditEntry.For(...)`, no public mutator. Immutability is a second line behind the `DENY`: EF cannot update what the code cannot change |
| `AuditOutcome` | `enum { Success, Denied, Failed }`, persisted as a string via `HasConversion<string>()` so a database dump stays readable and reordering cannot corrupt rows |
| `AuditTarget` | `readonly record struct (string? EntityType, Guid? EntityId, string? EntityLabel)` — what a command returns from `DescribeTarget` |
| `AuditFieldChange` | `record (string Entity, Guid? Id, string Field, string? Before, string? After)` — one element of the `Changes` array |
| `AuditRedaction` | The deny-list above, plus `Redact(entity, field, value)` and the `"[redacted]"` placeholder constant |

`AuditEntry.For(...)` enforces what the columns already say: `Action`, `Outcome`, and
`TraceId` are required; `UserAgent` is truncated to 400 rather than throwing. An audit write
that throws on its own input would fail the mutation it exists to record.

---

## Migration `AddAuditLog` — what it must contain

| Step | Expressed as |
|---|---|
| `CREATE TABLE dbo.AuditLog` with the columns above | Generated from `AuditEntryConfiguration` |
| `CK_AuditLog_ChangesIsJson` | `ToTable(t => t.HasCheckConstraint(...))` |
| The four indexes, including `IsDescending` and `HasFilter` | `HasIndex(...)` (`research.md` R-9) |
| `CREATE ROLE wasl_app` (idempotent) + `GRANT` + `DENY` | `migrationBuilder.Sql(...)` at the end of `Up` |
| `Down` | Drops the table; **revokes nothing**. Dropping the table removes the object-level grants with it, and dropping a role that another object may reference is a worse failure than leaving an empty role |

Verified on a clean database, twice, per `001` AC-3: the second `dotnet ef database update`
applies nothing and exits 0. `CREATE ROLE` is guarded by
`IF DATABASE_PRINCIPAL_ID('wasl_app') IS NULL` so that re-running against a database that
already has the role is not an error.
