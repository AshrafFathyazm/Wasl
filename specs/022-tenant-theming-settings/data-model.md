# 022 — Data Model

Scope: one table, one row, one check constraint, one seed. Full schema reference is
[`docs/sdd/03-domain-model.md`](../../docs/sdd/03-domain-model.md); this file records
only what **this** feature creates and why. Types translated from
`docs/sdd/design/settings-and-uploads.md`, which was written under ADR-001 and therefore
in PostgreSQL types (`research.md` R-7).

**Migration name:** `AddOrganizationSettings`

---

## `OrganizationSettings`

| Column | Type | Null | Note |
|---|---|---|---|
| `Id` | `smallint` | no | PK, **always 1**. Not `IDENTITY` — the value is part of the invariant, not a surrogate |
| `BrandColorHex` | `char(7)` | no | `#RRGGBB`, uppercase, normalised before storage. ASCII and fixed width, so `char` is correct — ADR-013's `inet → varchar(45)` row is the precedent (`research.md` R-7) |
| `SidebarMode` | `nvarchar(10)` | no | `Light` · `Dark` · `Brand`, stored as the enum's string via `HasConversion<string>()` per `001`'s convention table |
| `UpdatedByUserId` | `uniqueidentifier` | no | **No foreign key** to `SupportUsers`, for the reason `settings-and-uploads.md` gives and BR-9.12 gives for audit rows: the record must survive the user being removed |
| `UpdatedAtUtc` | `datetime2(3)` | no | From the injected `TimeProvider`, never `DateTime.UtcNow` |
| `RowVersion` | `rowversion` | no | ADR-006 as amended by ADR-013. Two Managers can edit this row; see Q-C |

### Constraints

| Name | Definition | Why it is a database constraint |
|---|---|---|
| `PK_OrganizationSettings` | `PRIMARY KEY (Id)` | |
| `CK_OrganizationSettings_SingleRow` | `CHECK ([Id] = 1)` | A second settings row means every read returns whichever one the query plan ordered first, and the theme becomes non-deterministic. An application-level "only insert once" rule is a rule someone can bypass with a script; this cannot be bypassed |
| `CK_OrganizationSettings_BrandColorFormat` | `CHECK ([BrandColorHex] LIKE '#[0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F]')` | Cheap, and it keeps the column honest against a manual `UPDATE`. It checks the **format** only — the contrast gate is a business rule and lives in the domain, not in SQL. A `CHECK` cannot compute relative luminance and should not try |
| `CK_OrganizationSettings_SidebarMode` | `CHECK ([SidebarMode] IN ('Light','Dark','Brand'))` | The enum is stored as text, so the database is the last place that can refuse `'light'` or `'Blue'` arriving from a manual edit. `001`'s convention stores enums as strings precisely so a dump stays readable; this keeps a readable dump from also being a wrong one |

`CK_OrganizationSettings_SingleRow` is verified by **querying `sys.check_constraints` for
a non-null `definition`** and by a failed second insert (AC-25) — not by reading the
migration. The lesson is `001` AC-12's: a constraint that was written and a constraint
that exists are different claims.

### Indexes

**None beyond the primary key.** The table has one row; there is no query to justify one
(`001`'s no-speculative-index rule).

### Seed

The migration inserts the single row:

| `Id` | `BrandColorHex` | `SidebarMode` | `UpdatedByUserId` | `UpdatedAtUtc` |
|---|---|---|---|---|
| `1` | `#1D174D` | `Light` | `00000000-0000-0000-0000-000000000000` | the migration's timestamp |

**Seeded rather than created on first write**, because the alternative is a nullable
theme: every read handles "no settings yet", the endpoint needs a `404` or an empty-body
case, and the frontend needs a third code path that only ever runs once per database.
A default is a value, not an absence.

`#1D174D` is `--navy-900` from `docs/sdd/design/tokens.css` — the product's own brand, so
a fresh database looks like the product rather than like an unconfigured one. Its
luminance is ≈ 0.0141, so it passes both gates at 16.4:1 and 16.4:1 (`research.md` R-2);
the fixture keeps it as a regression guard, since a default that the gate would refuse
would make the product unable to save its own colours.

`UpdatedByUserId` is the empty `Guid` on the seeded row and means "never edited by a
person". It is not a foreign key, so nothing has to exist for it to be valid. A nullable
column would express the same thing and would make every read handle a null for the
lifetime of the product; one sentinel value on one row does not.

---

## What is deliberately not created

| Not created | Why |
|---|---|
| `LogoBytes` `varbinary(max)`, `LogoContentType`, `LogoUpdatedAtUtc` | The logo is a later story (`settings-and-uploads.md`, "Release 2 or later"). Creating the columns now means a migration that cannot be tested against behaviour, and a `varbinary(max)` column nobody writes to is an invitation |
| `SupportUser.AvatarBytes`, `AvatarContentType` | Same story, and not theming at all |
| `TenantId` on this or any table | Multi-tenancy is out of scope (`00-project-context.md`). Q-B records that "tenant" is ADR-012's word for the single organisation |
| A `ThemePreset` or `Palette` table | Full custom palettes are excluded by ADR-012. One brand colour and one mode fit in one row; a palette table is the schema for the feature that was explicitly refused |
| An `OrganizationSettingsHistory` table | `AuditLog` already records `Settings.BrandingChanged` with before and after (BR-9.8). A second history is a second truth |

---

## Domain shape

`Wasl.Domain/Settings/` — no EF Core, no ASP.NET, no MediatR, per ADR-010, and therefore
unit-testable with no database, which is what makes the contrast fixture cheap enough to
run on every build.

| Type | Kind | Responsibility |
|---|---|---|
| `OrganizationSettings` | Entity, private setters | Holds the two values and `RowVersion`; exposes one method that changes them and refuses an inaccessible colour |
| `BrandColor` | Value object | Parses and normalises `#RRGGBB`; refuses the six malformed shapes in AC-7. Equality by value, so "same values submitted again" is a comparison rather than a string compare |
| `SidebarMode` | Enum | `Light`, `Dark`, `Brand`. Stored as its name; **never localized** (BR-8.7) |
| `Contrast` | Static, pure | `RelativeLuminance`, `Ratio`, `OnBrandFor`, `Evaluate`. The whole gate, ~40 lines, no dependencies |
| `BrandColorVerdict` | Result record | `Accepted` plus the chosen foreground, or `Refused` plus which gate refused and the four ratios. The endpoint maps it; it does not re-derive it |

`Contrast` is in the domain rather than in the API project for one reason that matters:
it is the business rule the whole feature exists to enforce, Constitution III says a rule
lives in the domain once, and putting it in a validator would put it where the frontend's
mirror is the only other implementation — which is exactly the arrangement that lets the
two drift.
