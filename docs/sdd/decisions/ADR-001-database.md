# ADR-001 — Database and provider

**Status:** **Superseded by ADR-013** (2026-08-23 — the product owner specified SQL Server, resolving Q-3) · **Supersedes:** none · **Related:** ADR-006, ADR-013

## Context

The CRM stores customers, tickets, comments, and an append-only history. It needs
relational integrity, unique constraints, transactions, and a database that can run
locally and inside a container for integration tests.

The program's backend track lists *SQL Server integration* under .NET. The CRM
requirements themselves do not depend on any SQL Server-specific feature.

## Decision

PostgreSQL with EF Core (`Microsoft.EntityFrameworkCore.SqlServer`).

## Reasoning

- The data is relational with clear foreign keys and constraints; a relational store
  is the correct shape.
- Partial unique indexes are needed for the customer duplicate rule (BR-4), where
  email and phone are each optional but unique when present. PostgreSQL supports
  `CREATE UNIQUE INDEX ... WHERE column IS NOT NULL` directly.
- Testcontainers runs a real PostgreSQL instance per test run, which means integration
  tests execute against the same engine as production rather than an in-memory
  substitute that does not enforce constraints.
- No licence, no edition matrix, and a clean local and CI setup.
- `JSONB` is available if a future requirement needs schemaless channel payloads,
  without adding a second datastore.

## Alternatives considered

### SQL Server

A strong choice with .NET, and the better choice when any of the following holds:

- The organisation already runs SQL Server and has operational expertise in it
- Azure SQL is the target environment
- There are stored procedures or reporting tools tied to SQL Server
- An existing schema must be integrated with

None of these applies to this project, so the decision rests on portability,
containerised testing, and the partial-index requirement.

**This is a genuinely close call.** If the reviewer expects SQL Server, the decision
should be revisited rather than defended — see `11-open-questions.md`, Q-3.

### SQLite

Rejected. It is the fastest to start with and the worst to test against: weak type
affinity, limited `ALTER TABLE`, and constraint behaviour that differs from any
production engine. Integration tests would pass against behaviour that does not
exist in production.

### A document database

Rejected. The access patterns are relational — tickets by customer, history by
ticket, filtered lists across several dimensions — and the invariants are exactly
what foreign keys and unique constraints exist to enforce.

## Provider-specific surface

Two places depend on the provider. Both are isolated and both have a documented
SQL Server equivalent, so switching is a contained change rather than a rewrite.

| Concern | PostgreSQL | SQL Server equivalent |
|---|---|---|
| Partial unique index (BR-4) | `CREATE UNIQUE INDEX ... WHERE col IS NOT NULL` | Filtered index: `CREATE UNIQUE INDEX ... WHERE col IS NOT NULL` — same capability, different EF Core configuration call |
| Concurrency token (ADR-006) | `xmin` system column via `UseXminAsConcurrencyToken()` | `rowversion` / `timestamp` column via `IsRowVersion()` |
| Case-insensitive email uniqueness | Unique index on `lower(email)` | Case-insensitive collation on the column, or a persisted computed column |

## Consequences

- Docker is required to run the integration test suite. Contributors without Docker
  can run unit tests only, and this is stated in `documentation/development/setup.md`.
- The concurrency token is provider-specific, so switching providers requires a
  migration, not just a connection-string change.
- If the reviewer requires SQL Server, the switch touches three configuration points
  and the migration set — roughly a half day, not a redesign.
