# ADR-013 — Database provider: SQL Server

**Status:** Accepted · **Supersedes:** ADR-001 · **Amends:** ADR-006 · **Resolves:**
`11-open-questions.md` Q-3 · **Date:** 2026-08-23

## Context

ADR-001 chose PostgreSQL. It also recorded, in its own words, that the call was
close: *"This is a genuinely close call. If the reviewer expects SQL Server, the
decision should be revisited rather than defended."*

Two facts have since arrived, and both point the same way:

- **The product owner has specified SQL Server.** Q-3 was open precisely because the
  program deck lists *SQL Server integration* under the .NET track. It is now answered.
- **The house platform runs SQL Server.** `AzmFormBuilder` references
  `Microsoft.EntityFrameworkCore.SqlServer`, so a reviewer reads SQL Server as the
  familiar shape and PostgreSQL as a divergence needing defence.

## Decision

**SQL Server 2022 with `Microsoft.EntityFrameworkCore.SqlServer`.**

Integration tests run against a real SQL Server instance through
`Testcontainers.MsSql`. EF `InMemory` is not used anywhere, for the reason
`testing/test-strategy.md` already gives: it does not enforce unique constraints,
foreign keys, or concurrency tokens, which are exactly what these tests exist to
verify.

## The provider-coupled surface

ADR-001 named three coupling points and documented their SQL Server equivalents. This
is that table, now as the specification rather than as a contingency. A fourth row is
added because Arabic makes it non-optional.

| # | Concern | Implementation | Failure if done wrong |
|---|---|---|---|
| 1 | Concurrency token (ADR-006) | A `rowversion` column mapped with `.IsRowVersion()`. **Not** `xmin`, **not** a manually incremented `int` | A manual counter that someone forgets to increment is a silent lost update — the exact defect ADR-006 exists to prevent |
| 2 | Duplicate rule (BR-4.4, BR-4.5) | Filtered unique index: `.HasIndex(c => c.Email).IsUnique().HasFilter("[Email] IS NOT NULL AND [IsActive] = 1")` | Without the filter the index rejects a second customer who simply has no email |
| 3 | Case-insensitive email uniqueness (BR-4.2) | An explicit case-insensitive collation on the column. Do **not** rely on the server default, and do **not** index `LOWER(Email)` — SQL Server filtered indexes cannot be built on an expression | `Ali@x.com` and `ali@x.com` both stored, and the duplicate rule silently has a hole |
| 4 | Arabic text | `nvarchar`, which is the EF Core default for `string` on SQL Server. Never `varchar` | `varchar` under a non-Arabic collation stores `????` — and it looks like a font problem, so it survives review |

BR-4.2 normalises email to trimmed lowercase **before** storage, so row 3 is a second
line of defence rather than the mechanism. It is specified anyway, because the
application-level normalisation is the friendly message and the database is the
guarantee (BR-4.8).

## Type mapping

| PostgreSQL (ADR-001) | SQL Server | Note |
|---|---|---|
| `uuid` | `uniqueidentifier` | Keys stay `Guid`, generated client-side so a `Guid` exists before `SaveChanges` |
| `varchar(n)` | `nvarchar(n)` | See row 4 above |
| `timestamptz` | `datetime2(3)` | SQL Server has no time-zone-aware type. Every column is named `*Utc` and a global EF value converter asserts `DateTimeKind.Utc` on read and write, which is what `timestamptz` was buying |
| `boolean` | `bit` | |
| `jsonb` | `nvarchar(max)` + `CHECK (ISJSON(Changes) = 1)` | Only `AuditLog.Changes`. The check keeps the column honest without a JSON type |
| `inet` | `varchar(45)` | IPv6 maximum textual length. ASCII, so `varchar` is correct here |
| `bigint GENERATED ALWAYS AS IDENTITY` | `bigint IDENTITY(1,1)` | `AuditLog` only, per ADR-008 |
| `ON DELETE RESTRICT` | `ON DELETE NO ACTION` | `RESTRICT` is not SQL Server syntax; `NO ACTION` is the same behaviour |
| `REVOKE UPDATE, DELETE` | `DENY UPDATE, DELETE` | `DENY` outranks any grant from role membership, so it is the stronger form of BR-9.5 |

`CREATE SEQUENCE` for the ticket number works on both engines and is unchanged.

## What is given up

ADR-001's reasoning was not wrong, and the things it valued are genuinely lost:

- **`jsonb` becomes `nvarchar(max)`.** No GIN index, no operator support. `AuditLog.Changes`
  is written and read whole and never queried by key, so nothing in scope needs it.
- **`xmin` becomes a real column.** The concurrency token now appears in the schema and
  in every DTO that carries `expectedVersion`. That is a migration, not a rewrite,
  which is exactly the cost ADR-001 estimated.
- **Licence and edition matter now.** The container image is the Developer edition and
  its EULA must be accepted via an environment variable in the test setup. `setup.md`
  records it.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Stay on PostgreSQL and flag the divergence | Defensible on the engineering merits and wrong on the facts: the owner has specified SQL Server and the house platform runs it. ADR-001 itself said to revisit rather than defend |
| SQL Server LocalDB for integration tests | Windows-only, no clean per-run isolation, and it drifts from whatever runs in CI. Kept as the documented fallback for a contributor with no Docker |
| SQLite for tests, SQL Server for production | The same trap ADR-001 rejected: tests would pass against constraint behaviour that does not exist in production |
| Azure SQL | No requirement to run in Azure, and it cannot run offline from a clean clone (NFR-7) |

## Consequences

- ADR-001 is superseded, not deleted. Its reasoning stands as the record of what was
  weighed, which is the point of keeping it.
- ADR-006's decision text is amended: the token is `rowversion`. Its reasoning about
  *why* optimistic concurrency, and why not a manual counter, is unchanged.
- `03-domain-model.md`'s physical shape is rewritten in SQL Server types.
- Docker is still required for the integration suite. Unit tests need nothing.
