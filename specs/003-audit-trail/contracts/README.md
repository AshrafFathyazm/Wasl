# Contracts — 003 Audit Trail

**There is no HTTP surface in this feature, so there is no contract to freeze.**

`003` ships a table, two MediatR pipeline behaviours, a redaction rule, a permission grant,
and an architecture test. Nothing it produces is reachable over HTTP, and nothing that is
already reachable changes shape — no request body gains a field, no response gains a
property, and no new status code becomes possible.

## Who owns the surface instead

| Surface | Owned by |
|---|---|
| Reading the audit log — `GET /api/audit`, its filters by entity / actor / time range / outcome (FR-6.7), its `Manager`-only policy (BR-9.11, FR-6.6), and auditing the read itself as `Audit.Read` | **`019-audit-log-access`** (US-015) |
| `ProblemDetails`, `traceId`, and the shape of every error this pipeline can produce | `002-error-contract` |
| The `401` / `403` audit rows that never reach MediatR, and the sign-in endpoint (BR-9.2) | `004-auth-and-roles` |

`003` is a dependency of `019` and not a preview of it. The read model, the pagination
shape, and the `Manager` policy are all `019`'s decisions, and specifying them here would
freeze a contract with no consumer.

## Until `019` exists, the log is read with SQL

That is a real answer, not a placeholder: the table is queryable the moment this feature
lands, and each of the four indexes exists because one of these four queries needs it
(`data-model.md`). Run them against any read-capable connection. **Note for `003`:** the
application connects as the owner until `003b` introduces the restricted principal, so any
connection reads the table today; from `003b` onward `SELECT` is granted to `wasl_app`.

```sql
-- "What happened recently"                              → IX_AuditLog_Time
SELECT TOP (100) Id, OccurredAtUtc, ActorEmail, ActorRole, Action, Outcome, EntityLabel
FROM   dbo.AuditLog
ORDER  BY OccurredAtUtc DESC;

-- "Everything that touched this record"                  → IX_AuditLog_Entity
SELECT OccurredAtUtc, ActorEmail, Action, Outcome, Changes
FROM   dbo.AuditLog
WHERE  EntityType = @entityType AND EntityId = @entityId
ORDER  BY OccurredAtUtc DESC;

-- "Everything this person did"                            → IX_AuditLog_Actor
SELECT OccurredAtUtc, Action, Outcome, EntityType, EntityLabel
FROM   dbo.AuditLog
WHERE  ActorUserId = @actorUserId
ORDER  BY OccurredAtUtc DESC;

-- "Show me denials and failures"                          → IX_AuditLog_NotSuccess
SELECT OccurredAtUtc, ActorEmail, ActorRole, Action, Outcome, EntityLabel, TraceId
FROM   dbo.AuditLog
WHERE  Outcome <> 'Success'
ORDER  BY OccurredAtUtc DESC;

-- One field's history, out of the JSON diff              → IX_AuditLog_Entity
SELECT a.OccurredAtUtc, a.ActorEmail, c.[field], c.[before], c.[after]
FROM   dbo.AuditLog a
CROSS  APPLY OPENJSON(a.Changes)
       WITH ([field] nvarchar(200), [before] nvarchar(max), [after] nvarchar(max)) c
WHERE  a.EntityType = 'Customer' AND a.EntityId = @customerId
ORDER  BY a.OccurredAtUtc DESC;
```

`TraceId` in the fourth query is the one that matters during an incident: it is
byte-identical to the `traceId` the caller saw in the `ProblemDetails` body and to the
correlation id in the request log (BR-9.9, AC-21). One identifier, three places.

## The one endpoint that exists, and where it does not exist

`POST /__test/probe` dispatches the probe commands that prove the pipeline (AC-6, AC-8,
AC-9, AC-21). It is defined in **`Wasl.Api.IntegrationTests`** and registered only on the
test host by `WaslApiFactory`. It is not in `Wasl.Api`, not in the generated OpenAPI
document, and not deployable. `research.md` R-12 records why a `Development`-only endpoint
in the real application was rejected.

It is named here so that a reviewer who greps for `__test` finds an explanation rather than
a surprise.
