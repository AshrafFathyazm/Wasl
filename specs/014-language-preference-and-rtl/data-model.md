# 014 — Data Model

**Migration:** `AddSupportUserPreferredLanguage` — **conditional; it may be empty. Read
the next section before writing it.**

One column, no index, no constraint beyond a default. This is the smallest schema change
in the project, and it carries the only migration in the project that might correctly do
nothing.

Full schema reference:
[`docs/sdd/03-domain-model.md`](../../docs/sdd/03-domain-model.md).
SQL Server type rules: `decisions/ADR-013-database-sql-server.md`.

---

## What already exists

| Object | Created by | Note |
|---|---|---|
| `dbo.SupportUsers` | `004-auth-and-roles` | Sign-in cannot work without it, so the table precedes this feature |
| `RowVersion` on `SupportUsers` | `001-solution-skeleton` conventions | `rowversion` with `.IsRowVersion()`. This feature does not use it — see **Concurrency** |
| `UX_SupportUsers_Email` | `004-auth-and-roles` | Identity lookup at sign-in |
| Registered cultures, catalogues, parity harness | `005-localization-core` | Not schema, listed so the boundary is complete |

## What this feature adds

| Column | Type | Null | Default | Rule |
|---|---|---|---|---|
| `PreferredLanguage` | `nvarchar(5)` | no | `'en'` (`DF_SupportUsers_Lang`) | BR-8.1, BR-8.4, FR-5.5 |

The default backfills every existing row, so the migration needs no data step and
`004`'s seeded users become English users without anyone writing an `UPDATE`.

### The migration may be empty, and that has to be checked rather than assumed

`03-domain-model.md`'s physical sketch shows `PreferredLanguage` **inside** the
`CREATE TABLE dbo.SupportUsers` statement. If `004-auth-and-roles` implemented that
sketch literally, the column already exists and this migration adds nothing.

Both outcomes are fine. What is not fine is either of the two silent failures:

| Failure | How it presents |
|---|---|
| The column was never created, and this feature assumed `004` did it | `dotnet ef database update` succeeds, the endpoint throws at runtime on the first write, and the exception names a column rather than a feature |
| The column exists, and this feature adds a migration for it anyway | The migration fails on a clean database with `Column names in each table must be unique`, or worse, EF generates an empty `Up()` that nobody notices and the feature is recorded as having a migration it does not have |

`BE-014-11` therefore checks first:

```sql
SELECT c.name, t.name AS type_name, c.max_length, c.is_nullable, d.definition
FROM sys.columns c
JOIN sys.types t ON t.user_type_id = c.user_type_id
LEFT JOIN sys.default_constraints d ON d.parent_object_id = c.object_id
                                  AND d.parent_column_id = c.column_id
WHERE c.object_id = OBJECT_ID('dbo.SupportUsers')
  AND c.name = 'PreferredLanguage';
```

Expected, whichever feature created it: `nvarchar`, `max_length` 10 (five characters at
two bytes), `is_nullable` 0, and a non-null `definition` containing `'en'`. An empty
result set means the column does not exist and the migration is real. `sys.columns`
rather than a `psql \d+` — this is SQL Server (ADR-013 supersedes ADR-001).

If the migration turns out to be empty, `BE-014-11` is closed by recording that in
`backend.md`, not by deleting the task. "This feature adds no schema change, and here is
the query that proves the column was already there" is a finding; a missing task is not.

### Why `nvarchar(5)` and not `varchar(5)`

ADR-013 row 4 requires `nvarchar` for every column a human writes into, because `varchar`
returns `????` for Arabic and looks like a font bug. This column is the one place where
that reasoning does not directly apply: a BCP-47 tag is ASCII, and `varchar(5)` would
store `en` and `ar` perfectly.

It is still `nvarchar`, for two reasons that are about the codebase rather than the data:

1. **EF Core sends `nvarchar` parameters for `string` properties.** A `varchar` column
   compared against an `nvarchar` parameter is an implicit conversion. Here it costs
   nothing — the column is never a predicate — but it would be the only place in the
   schema where that is true, and "it is fine in this one case" is a thing a future
   reader has to re-derive.
2. **One exception invites a second.** A schema where every human-text column is
   `nvarchar` except one is a schema where the rule has to be looked up rather than
   known.

The original artifact specified `varchar(5)`, written against PostgreSQL before ADR-013.
It is corrected here rather than translated mechanically, because the corrected value
happens to need a reason.

## No index, deliberately

`03-domain-model.md`'s index inventory names this column explicitly as the one that has
none: *"`SupportUser.PreferredLanguage` has no index: it is read as part of the user row
by primary key and is never a filter."*

Nothing queries `WHERE PreferredLanguage = ...`. Nothing ever should — there is no
feature that lists users by language, and if one appears, the index arrives with the
query that needs it, per the no-speculative-indexes rule.

At runtime the column is not read on the request path at all: the value travels in the
`preferred_language` JWT claim, which is the whole point of ADR-007 decision 4. The only
reads are the sign-in projection and the handler's own load-by-id.

## Constraints

| Considered | Decision |
|---|---|
| `CHECK (PreferredLanguage IN ('en','ar'))` | **Not added.** The list is `SupportedLanguages` in `Wasl.Domain`, and NFR-9 requires a third locale to be a resource file plus a registered culture — **no code change**. A check constraint would make it a migration too, which is the requirement inverted |
| `DEFAULT 'en'` | **Added.** It is what makes the column `NOT NULL` on an existing table without a data step, and BR-8.1 makes `en` the default for the product, not just for the migration |
| `NOT NULL` | **Added.** A null preference and a preference of `en` would be two encodings of one state, and every reader would have to handle both |

The absence of the check constraint is the one place in this feature where a rule is
enforced only in application code. It is recorded rather than glossed: the value is
written through one value object with one caller, and the cost of a manual `INSERT`
setting `fr` is a user whose interface falls back to English (BR-8.3) — a degradation,
not a corruption. That trade is what makes it acceptable here and would not make it
acceptable for the duplicate rule in `007`.

## Domain shape

`Wasl.Domain/SupportUsers/` — zero package references (ADR-010).

| Type | Responsibility |
|---|---|
| `PreferredLanguage` | Parse-or-fail value object. An instance cannot hold anything but a supported tag, so no handler has to remember to check. This is why `TEST-014-01` needs no database |
| `SupportedLanguages` | The canonical list, in one place. Read by the validator, by the `400` message that lists the supported locales (AC-6), and by startup culture registration. Three consumers, one source — which is what makes NFR-9's "no code change" claim true |
| `SupportUser` | Gains the property with a private setter and a method to change it. Not a public setter: the only legitimate writer is the command |

## Concurrency

`RowVersion` exists on `SupportUsers` and this feature **does not read or return it**.

The endpoint takes no `expectedVersion` and can never return `409`. `05-api-conventions.md`
requires the version token on endpoints that mutate a ticket or a customer; this mutates
neither, and the only writer of a person's own language preference is that person. A
conflict would be a conflict with oneself.

Stated because a reader who knows the convention will otherwise assume the token was
forgotten. If a user-administration feature ever writes to `SupportUsers` from a second
actor, that feature adds the token — and it will already have a `rowversion` waiting,
maintained by the database rather than incremented by application code (ADR-006 as
amended by ADR-013).

## Audit

No schema change. `dbo.AuditLog` exists from `003-audit-trail`, has no foreign keys by
design (ADR-008), and this feature writes to it through the pipeline behaviour rather
than directly.

| Row | Action | Written | `Changes` |
|---|---|---|---|
| Successful change | `User.LanguageChanged` | Inside the same transaction as the `UPDATE` (BR-9.3) | `PreferredLanguage: en → ar` |
| No-op change | — | **No row** (BR-9.8) | — |
| `401` | `Auth.Unauthenticated` | Outside any transaction (BR-9.2, BR-9.4) | — |

The action name comes from BR-9's naming table, which already lists
`User.LanguageChanged`. Nothing about the name is invented here.

## Verification

| What | How |
|---|---|
| The column exists with the right type and default | The `sys.columns` query above, run after `dotnet ef database update` on a clean database (`BE-014-11`) |
| An Arabic value never reaches this column | It cannot — the value object rejects it. `TEST-014-01` |
| The migration applies to a clean database and to one seeded by `004` | `dotnet ef database update` in both states, against `Testcontainers.MsSql`. EF `InMemory` is not a substitute: it does not apply the default, so every test would pass with the column silently null |
