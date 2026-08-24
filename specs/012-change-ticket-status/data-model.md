# 012 — Data Model

**Migration:** none.

**This feature changes no schema, and that is a decision rather than an omission.**
Everything it needs exists: `009-create-ticket` created `Tickets` — including `Status`,
`ClosedAtUtc`, and `RowVersion` — and `TicketHistory`; `003-audit-trail` created
`AuditLog`; `001-solution-skeleton` established the conventions all three inherit.

The original plan named a hypothetical `AddTicketClosedAt` migration and then concluded
it was unnecessary. That conclusion still holds and is recorded here explicitly, because
"no migration" written down is a decision a reviewer can check, and a blank section is
one they cannot.

Full schema reference: [`docs/sdd/03-domain-model.md`](../../docs/sdd/03-domain-model.md).

---

## What this feature reads and writes

### `dbo.Tickets` — created by `009`

| Column | Type | Null | This feature |
|---|---|---|---|
| `Id` | `uniqueidentifier` | no | Reads — the route key |
| `TicketNumber` | `nvarchar(20)` | no | Reads — the audit row's `EntityLabel` |
| `Status` | `nvarchar(20)` | no | **Writes.** Enum stored as a string |
| `AssignedToUserId` | `uniqueidentifier` | yes | Reads — BR-1.3 and BR-6 both depend on it |
| `ClosedAtUtc` | `datetime2(3)` | yes | **Writes** when the new status is `Closed` (BR-1.7) |
| `UpdatedAtUtc` | `datetime2(3)` | no | **Writes** — from the injected `TimeProvider`, never `DateTime.UtcNow` |
| `RowVersion` | `rowversion` | no | Read as `version`, sent back as `expectedVersion`, and maintained by SQL Server itself |

### `dbo.TicketHistory` — created by `009`

One row per accepted transition (BR-1.8).

| Column | Type | Value written here |
|---|---|---|
| `Id` | `uniqueidentifier` | New `Guid`, client-generated |
| `TicketId` | `uniqueidentifier` | The ticket |
| `EventType` | `nvarchar(30)` | `StatusChanged` |
| `OldValue` | `nvarchar(200)` | The previous status, as its enum **value** — `InProgress`, not a label |
| `NewValue` | `nvarchar(200)` | The new status, same form |
| `Note` | `nvarchar(500)` | The request's `note`, or null |
| `PerformedByUserId` | `uniqueidentifier` | The caller |
| `PerformedAtUtc` | `datetime2(3)` | From `TimeProvider` |

`OldValue` and `NewValue` store canonical enum values, not translated labels. That is
why a history row stays readable after a user switches language (BR-8.7), and why
storing "قيد التنفيذ" here would make the timeline locale-dependent for ever.

`Note` is `nvarchar(500)`, which is where the request's 500-character limit comes from.
A note of 501 characters is rejected at the boundary rather than silently truncated by
the column — a truncated reason for closing a ticket is worse than no reason, because it
looks complete.

### `dbo.AuditLog` — created by `003`

One row per accepted transition, written by the pipeline behaviour **inside the same
transaction** (BR-9.3), plus one row per denial, written **outside** any transaction
(BR-9.4).

| Column | On success | On a `403` |
|---|---|---|
| `Action` | `Ticket.StatusChanged` | `Auth.Forbidden` |
| `EntityType` / `EntityId` | `Ticket` / the id | `Ticket` / the id |
| `EntityLabel` | `TCK-2026-000042` — readable with no join | same |
| `Outcome` | `Success` | `Denied` |
| `Changes` | `{"Status":{"from":"Open","to":"Closed"}}` — English, redacted per BR-9.7 | null |
| `ActorEmail`, `ActorRole` | Snapshotted, never joined (ADR-008) | same |
| `TraceId` | Matches the response's `traceId` and the request log | same |

`Changes` is `nvarchar(max)` with `CHECK (ISJSON(Changes) = 1)` — `jsonb` does not exist
here (ADR-013). The note is **not** copied into `Changes`: it is already on the history
row, and BR-9.8 says record the fields that changed, not everything that was sent.

## Indexes

**None added.** Every read this feature performs is already covered:

| Query | Index | Owner |
|---|---|---|
| Load one ticket by `Id` | The clustered primary key | `009` |
| Read the transition's history rows back in the timeline | `IX_TicketHistory_Ticket_Time` on `(TicketId, PerformedAtUtc)` | `009` |
| "Everything that touched this ticket" in the audit log | `IX_AuditLog_Entity` on `(EntityType, EntityId, OccurredAtUtc DESC)` | `003` |

`ClosedAtUtc` gets **no** index. Nothing in scope filters or sorts on it — the automatic
close of resolved tickets after N days is an SLA feature and is out of scope
project-wide. An index here would be speculative, and the no-speculative-indexes rule
(`03-domain-model.md`) says it arrives with the query that needs it.

## Constraints

**None added, and one is deliberately absent.**

`Status` is `nvarchar(20)` with no `CHECK` constraining it to the six values. That is the
enums-as-strings trade-off recorded in `03-domain-model.md`: the domain is the
constraint, because a value the state machine cannot move is worse than a value the
database rejects, and every new status requires code anyway.

The consequence to name: **a hand-written `UPDATE dbo.Tickets SET Status = 'Pending'`
during support work would succeed and produce a ticket no transition can leave.** The
state machine is enforced on the write path only. Nothing in scope justifies a check
constraint, and if one is ever added it must be generated from the enum rather than
typed, or it becomes a second copy of the six values.

## Concurrency

`Tickets.RowVersion` already exists from `009`, configured by the `.IsRowVersion()`
convention established in `001`. ADR-006 as amended by ADR-013.

This feature is the first one to actually **consume** it, so two mechanics land here:

| Mechanic | Why it is not optional |
|---|---|
| `expectedVersion` decoded from base64 and compared to the loaded `RowVersion` before the transition is evaluated | Otherwise a stale client is told its transition is forbidden, computed against a state it never saw |
| `Entry(ticket).Property(t => t.RowVersion).OriginalValue = decoded` before `SaveChanges` | **This is the one that fails silently.** Without it EF Core compares against the value it loaded a moment ago, which always matches — the `UPDATE`'s `WHERE` clause is satisfied, no `DbUpdateConcurrencyException` is raised, and the stale write wins. The column is present, `.IsRowVersion()` is configured, the test with two sequential requests passes, and the feature is broken |

`research.md` R-3 records how that was checked. `TEST-012-09` is the test that would
catch it, and it only catches it because it performs two writes against **one** captured
version rather than reloading between them.

## Why nothing here needs `Testcontainers.MsSql` to be optional

`rowversion` has no equivalent under EF `InMemory`, which does not enforce concurrency
tokens at all. Every concurrency and rollback assertion in this feature —
`TEST-012-07`, `TEST-012-09`, `TEST-012-11` — is meaningless without a real engine, so
the integration suite runs against `mcr.microsoft.com/mssql/server:2022-latest` through
`Testcontainers.MsSql` (`001-solution-skeleton` R-1).
