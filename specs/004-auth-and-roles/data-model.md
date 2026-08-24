# 004 — Data Model

**Migration:** `AddSupportUsers` · **Tables added:** 1 · **Tables changed:** 0 ·
**Provider:** SQL Server 2022 (ADR-013)

Derived from `docs/sdd/03-domain-model.md` § SupportUser and its **physical shape**
section. Where the two disagree with the ER diagram, the physical shape and ADR-005 win —
see `research.md` R-14, which lists exactly what the diagram omits and why that is
reported upward rather than corrected here.

---

## `dbo.SupportUsers`

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `Id` | `uniqueidentifier` | no | — | Primary key. Generated in the application, so `SupportUser.Create` returns a complete entity (`001/research.md` R-5) |
| `FullName` | `nvarchar(200)` | no | — | Human-written. `varchar` returns `????` for Arabic (ADR-013) — AC-23 is the test |
| `Email` | `nvarchar(320)` `COLLATE Latin1_General_100_CI_AS` | no | — | The login identity. Case-insensitive by collation, not by `LOWER()` — SQL Server cannot index an expression (ADR-013 row 3) |
| `PasswordHash` | `nvarchar(400)` | no | — | PBKDF2, `IdentityV3` format, produced by `PasswordHasher<SupportUser>`. Never returned by any endpoint, never logged, never in an audit row (BR-9.7). `nvarchar` follows the blueprint's DDL even though the value is ASCII — `research.md` R-13 |
| `Role` | `nvarchar(20)` | no | — | `Agent` or `Manager`, stored as a string. No lookup table and **no `CHECK` constraint** — both deliberate, per § *No lookup tables* in the domain model |
| `PreferredLanguage` | `nvarchar(5)` | no | `'en'` (`DF_SupportUsers_Lang`) | `en` or `ar` (BR-8.1). Read as part of the user row by primary key and never a filter, so it has no index |
| `IsActive` | `bit` | no | `1` (`DF_SupportUsers_Active`) | Checked at sign-in only. A live token outlives deactivation by up to 8 hours — `spec.md` Q-F |
| `CreatedAtUtc` | `datetime2(3)` | no | — | From the injected `TimeProvider`. Stamped `DateTimeKind.Utc` by the global converter from `001` |
| `RowVersion` | `rowversion` | no | — | Maintained by the database, never by application code (ADR-006). **No consumer in this feature** — nothing here updates a user row. It exists because the schema says so and because `014` updates `PreferredLanguage` |

### Indexes

| Name | Definition | Justified by |
|---|---|---|
| `PK_SupportUsers` | clustered, `Id` | Primary key |
| `UX_SupportUsers_Email` | **unique**, `Email`, **no filter** | "Sign in by email" in the query-to-index map of `docs/sdd/03-domain-model.md`, and the uniqueness of the login identity |

**`UX_SupportUsers_Email` is deliberately unfiltered, and this is the opposite of
`Customers`.** The customer duplicate indexes carry
`WHERE [col] IS NOT NULL AND IsActive = 1` because BR-4.4 is a rule between *active*
customers. Email here is not a duplicate rule, it is the credential: two rows sharing an
email would make "which user is this?" ambiguous at sign-in, whether or not one of them is
inactive.

So AC-22 asserts `filter_definition IS NULL` for this index — the inverse of the check
`007` performs on its own. Both are asserted rather than assumed, because a filter that
silently went missing and a filter that silently arrived are the same class of migration
defect:

```sql
SELECT  i.name, i.is_unique, i.filter_definition
FROM    sys.indexes i
WHERE   i.object_id = OBJECT_ID('dbo.SupportUsers');
-- UX_SupportUsers_Email | 1 | NULL      ← NULL is correct here
```

No index on `Role`. Two rows, and no query filters by role — the role travels in the token.
No index on `IsActive` for the same reason. `docs/sdd/03-domain-model.md` requires every
index to be justified by a named query, and neither has one.

### Constraints

| Constraint | Kind | Why |
|---|---|---|
| `PK_SupportUsers` | primary key | — |
| `UX_SupportUsers_Email` | unique index | Uniqueness of the credential, and the guarantee behind idempotent seeding under concurrent startup (AC-13) |
| `DF_SupportUsers_Lang` | default `'en'` | BR-8.1 — `en` is the default and the fallback |
| `DF_SupportUsers_Active` | default `1` | A new user is active |

**No `CHECK` on `Role` or `PreferredLanguage`.** Consistent with the domain model's
decision on enum columns: the values have behaviour attached in code, adding one means
writing code, and a `CHECK` would suggest otherwise. The guard lives in `SupportUser`'s
factory, which is the only way a row is created (AC — see `plan.md`).

**No foreign keys, in either direction.** `Tickets`, `TicketComments`, and `TicketHistory`
reference this table with `ON DELETE NO ACTION`, and each of those FKs arrives with the
feature that creates its table (`009`, `013`). Adding them here would mean creating
constraints against tables that do not exist.

### DDL as SQL Server will create it

Reference only. EF Core generates the migration from `SupportUserConfiguration`; if the two
disagree, the generated migration is the truth and this block is the defect.

```sql
CREATE TABLE dbo.SupportUsers (
    Id                 uniqueidentifier NOT NULL PRIMARY KEY,
    FullName           nvarchar(200)    NOT NULL,
    Email              nvarchar(320)    COLLATE Latin1_General_100_CI_AS NOT NULL,
    PasswordHash       nvarchar(400)    NOT NULL,
    Role               nvarchar(20)     NOT NULL,
    PreferredLanguage  nvarchar(5)      NOT NULL CONSTRAINT DF_SupportUsers_Lang DEFAULT 'en',
    IsActive           bit              NOT NULL CONSTRAINT DF_SupportUsers_Active DEFAULT 1,
    CreatedAtUtc       datetime2(3)     NOT NULL,
    RowVersion         rowversion       NOT NULL
);

CREATE UNIQUE INDEX UX_SupportUsers_Email ON dbo.SupportUsers (Email);
```

### EF Core configuration — the parts that are not conventions

| Concern | How | If left to convention |
|---|---|---|
| Collation on `Email` | `.UseCollation("Latin1_General_100_CI_AS")` on the property | The database default applies. On a case-sensitive server, `MANAGER@wasl.local` fails to sign in — AC-23 is the test |
| `Role` as a string | `.HasConversion<string>()` with `.HasMaxLength(20)` | EF stores the enum as `int`, and a database dump stops being readable |
| `RowVersion` | `.IsRowVersion()` | EF creates a `varbinary(8)` it does not maintain, and optimistic concurrency silently never triggers |
| `CreatedAtUtc` | The global UTC converter from `001` | A `DateTimeKind.Local` value is stored as if it were UTC |
| `PasswordHash` never in a projection | The endpoint returns `Response`, never the entity (Principle IV) | The entity gets serialised somewhere and the hash ships in a JSON body |

---

## Seed data

Two rows, inserted by `SupportUserSeeder` at startup — not by the migration. A migration
that inserts credential-bearing rows would need the hasher and the configured passwords
inside a migration, which are a package reference and a secret in a file whose whole
purpose is to be replayed on every environment.

| `FullName` | `Email` | `Role` | `PreferredLanguage` | Password source |
|---|---|---|---|---|
| Support Agent | `agent@wasl.local` | `Agent` | `en` | `Seed:AgentPassword` |
| Support Manager | `manager@wasl.local` | `Manager` | `ar` | `Seed:ManagerPassword` |

- **Hashed before insert.** No plaintext reaches the entity, the context, or the log
  (AC-14).
- **Idempotent by email**, not by row count: `INSERT` only when no row has that email. A
  second run changes nothing, including the stored hash — so changing the configured
  password and restarting does **not** update it (`spec.md` edge cases). Stated because "I
  changed the password and nothing happened" would otherwise read as a bug.
- **Both passwords are required configuration with no default.** Missing either one is a
  startup failure, not a fallback (AC-12, `research.md` R-8).
- **`Manager` is seeded as `ar`** so `005` inherits a fixture whose stored preference
  differs from any plausible `Accept-Language` (assumption A-5).

---

## Migration verification

The migration is not trusted because it was generated. Each row below is checked against
the live database after `dotnet ef database update`, which is what AC-22 and AC-23 require.

| Check | Query or command |
|---|---|
| Columns, types, lengths, nullability | `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'SupportUsers'` |
| `Email` collation | `SELECT name, collation_name FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SupportUsers')` |
| Index is unique and **unfiltered** | `SELECT name, is_unique, filter_definition FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.SupportUsers')` — `filter_definition` must be `NULL` |
| `RowVersion` is a real `rowversion` | `SELECT name, system_type_id FROM sys.columns …` — `timestamp`/`rowversion`, not `varbinary` |
| Arabic round-trip | Insert `"محمد العلي"` into `FullName`, read it back, compare byte-for-byte |
| Case-insensitive sign-in | `SELECT COUNT(*) FROM dbo.SupportUsers WHERE Email = 'MANAGER@WASL.LOCAL'` returns 1 |
| Idempotency | Run the seeder twice; assert two rows and two unchanged hashes |
| Applies to an empty database, twice | `dotnet ef database update` then again; the second applies nothing and exits 0 |

---

## What this feature does **not** change

| Not changed | Where it belongs |
|---|---|
| `AuditLog` — table, indexes, and the `INSERT`/`SELECT`-only grant | `003-audit-trail`. This feature writes four kinds of row into it and adds no columns |
| `Customers` | `001` created it; `007` adds its filtered indexes |
| Any foreign key into `SupportUsers` | `009` (`Tickets`), `013` (`TicketComments`, `TicketHistory`) |
| `SupportUsers.PreferredLanguage` becoming writable | `014-language-preference-and-rtl` |
| `SupportUsers.IsActive` becoming writable | Nowhere. There is no user management (`spec.md` Out of scope) |
