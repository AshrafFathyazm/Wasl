# 001 — Data Model

Scope: one table and the conventions that every later table inherits. Full schema
reference is [`docs/sdd/03-domain-model.md`](../../docs/sdd/03-domain-model.md); this
file records only what **this** feature creates and why.

**Migration name:** `InitialCreate`

---

## `Customers`

Created here at its column shape. Its filtered unique indexes belong to `007` — they
are the duplicate rule (BR-4.8), not schema mechanics, and they are tested alongside
the behaviour they enforce.

| Column | Type | Null | Note |
|---|---|---|---|
| `Id` | `uniqueidentifier` | no | PK, client-generated (`research.md` R-5) |
| `FullName` | `nvarchar(200)` | no | |
| `Email` | `nvarchar(320)` `COLLATE Latin1_General_100_CI_AS` | yes | CI collation per ADR-013 row 3 |
| `PhoneE164` | `nvarchar(20)` | yes | |
| `CompanyName` | `nvarchar(200)` | yes | |
| `Notes` | `nvarchar(2000)` | yes | |
| `IsActive` | `bit` | no | default `1` |
| `CreatedAtUtc` | `datetime2(3)` | no | |
| `UpdatedAtUtc` | `datetime2(3)` | no | |
| `RowVersion` | `rowversion` | no | ADR-006 as amended by ADR-013 |

**Constraint:** `CK_Customers_Contact` — `CHECK (Email IS NOT NULL OR PhoneE164 IS NOT NULL)`

The check constraint ships here rather than in `007` on purpose: it is a **database**
guarantee, and creating the table without it means every row inserted before `007`
could violate BR-4.1. There will be no such rows in practice, and the guarantee should
not depend on that being true.

**Index:** none in this feature beyond the primary key. `IX_Customers_FullName` arrives
with the search that needs it (`008`), per the no-speculative-indexes rule.

---

## Conventions every later table inherits

These are configured once in `WaslDbContext.OnModelCreating` and are the reason this
feature is not just "add a table".

| Convention | Configuration | Why |
|---|---|---|
| UTC timestamps | A global `ValueConverter<DateTime, DateTime>` that converts to UTC on write and stamps `DateTimeKind.Utc` on read | SQL Server has no `timestamptz`. Without this, a `Local` value is stored as if it were UTC and is wrong forever. Tested by AC-8 |
| `nvarchar` for human text | EF Core's default for `string` on SQL Server — left alone deliberately, and asserted | `varchar` returns `????` for Arabic and looks like a font bug (ADR-013 row 4) |
| `datetime2(3)` | `HasColumnType("datetime2(3)")` via a convention on every `DateTime` | Millisecond precision, comparable with client values without rounding surprises (`research.md` R-2) |
| Enums as strings | `HasConversion<string>()` | A database dump stays readable and reordering an enum cannot corrupt rows (`docs/sdd/03-domain-model.md`) |
| No cascade to `SupportUsers` | `DeleteBehavior.Restrict` on every reference to a user | SQL Server rejects multiple cascade paths outright, and a ticket outliving its creator is normal |
| `rowversion` where two people edit | `.IsRowVersion()` on `Customers`, `Tickets`, `SupportUsers` only | Append-only tables have nothing to conflict over |

Configurations live in `Wasl.Infrastructure/Persistence/Configurations/`, one file per
entity, applied by `ApplyConfigurationsFromAssembly`. A configuration class per entity
rather than a growing `OnModelCreating` — the latter is where conventions go to be
forgotten.

---

## What the entity looks like at this stage

`Wasl.Domain/Customers/Customer.cs` — an anaemic shell on purpose. It gets its factory,
its value objects, and its invariant in `007`, where they are specified and tested.

Creating the value objects here would mean writing them against a specification that
`007` owns, and then either rewriting them or having `007` inherit decisions nobody
reviewed.

What it does have: private setters and no public parameterless constructor beyond the
one EF needs, so the shape cannot drift into a mutable bag before `007` arrives.
