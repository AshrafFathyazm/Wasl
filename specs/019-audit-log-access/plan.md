# US-015 — Technical Plan

**Phase:** 5 · **Story:** US-015 · **Feature:** `019-audit-log-access` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

> **Migration note.** The source artifact
> `docs/sdd/story-artifacts/US-015-audit-log-access/plan.md` was an **unfilled
> template**. Its section structure is preserved exactly and filled here; there was no
> prior reasoning to keep or churn. Everything below is written against ADR-010 (two
> projects, vertical slices, minimal APIs), ADR-013 (SQL Server), and ADR-008 (audit),
> so no PostgreSQL type, no `Wasl.Application`/`Wasl.Infrastructure` path, and no
> controller appears anywhere in it.

## Design Summary

One read slice over an existing table. `003-audit-trail` created `dbo.AuditLog` and its
four indexes; this feature adds **no schema** and reads it through a named query object
with keyset pagination on `Id DESC`. Authorization is a `Manager`-only policy at the
endpoint (BR-6 role-only check, so the boundary is the right place). The twist carries
the design: BR-9.11 makes the read itself an audited event, so the slice's query is
marked auditable and the existing MediatR audit behaviour writes `Audit.Read` **after**
the page is materialised — which keeps a response from containing the row describing
itself.

## Backend

Two projects only (ADR-010). There is no `Wasl.Application` and no `Wasl.Infrastructure`.

| Layer | Component | Responsibility |
|---|---|---|
| Domain | `Wasl.Domain/Audit/AuditAction.cs` | Constants for the BR-9 naming table, including `Audit.Read`. Owned by `003`; this feature consumes it and adds the constant if absent |
| Domain | `Wasl.Domain/Audit/AuditEntityType.cs` | The accepted `EntityType` values — `Ticket`, `Customer`, `SupportUser`, `AuditLog`. Lives beside the writer so the reader's filter set cannot drift from what is actually written |
| Domain | `Wasl.Domain/Audit/AuditOutcome.cs` | `Success` \| `Denied` \| `Failed`. Exists from `003`; persisted as a string |
| Api — slice | `Features/Audit/ListAuditEntries/Endpoint.cs` | `MapGet("/api/audit")` with `.RequireAuthorization(Policies.ManagerOnly)`. Binds the query string, sends the query, returns `200`. Nothing else |
| Api — slice | `Features/Audit/ListAuditEntries/Query.cs` | `ListAuditEntriesQuery` — the parsed, normalised filter. Implements `IAuditableRequest` with `Action => AuditAction.AuditRead` |
| Api — slice | `Features/Audit/ListAuditEntries/Validator.cs` | FluentValidation at the boundary: enum membership, date parsing, inverted range, `entityId` requires `entityType`, cursor numeric, `action` length |
| Api — slice | `Features/Audit/ListAuditEntries/Handler.cs` | Clamps `pageSize`, calls the query object, maps rows to the response, computes `hasMore` and `nextCursor` |
| Api — slice | `Features/Audit/ListAuditEntries/AuditEntryQuery.cs` | The **named query object**. Non-trivial: keyset predicate, escaped `LIKE` prefix, the redundant `Outcome <> 'Success'` predicate, `AsNoTracking`, `Take(pageSize + 1)`. One caller, no interface (ADR-010) |
| Api — slice | `Features/Audit/ListAuditEntries/Response.cs` | `AuditEntryResponse` and `AuditPageResponse`. DTOs, never the entity |
| Api — common | `Common/Behaviors/AuditBehavior.cs` | **Extended here:** already writes rows for `IAuditableCommand`; now also writes for `IAuditableRequest` on a query, after the handler returns, outside a transaction |
| Api — common | `Common/Auth/Policies.cs` | `ManagerOnly` — exists from `004`; this feature applies it |
| Api — common | `Common/Errors/` | Untouched. The `400`, `401`, `403` bodies come from the single middleware (`002`) |

### Why the endpoint is a query, and why the query is still audited

`IAuditableCommand` is the marker `003` created, and NFR-10's architecture test asserts
that every `ICommand` implements it. A read is not a command: it must not open a
transaction, and BR-9.3's same-transaction rule has nothing to attach to.

The clean resolution is to split the marker: `IAuditableRequest` carries the action name,
`IAuditableCommand : IAuditableRequest` is what the architecture test keeps checking, and
the audit behaviour is registered for `IAuditableRequest`. The transaction behaviour stays
keyed on `ICommand`, so this read gets no transaction and its row is written
independently — the same asymmetry BR-9.4 already describes for denials.

Two alternatives were rejected:

| Alternative | Why not |
|---|---|
| Write the `Audit.Read` row by hand in the handler | It would be the one audit row in the system not written by the pipeline. ADR-008's whole mitigation for "someone forgets" is that no handler writes its own row. One exception is how the rule stops being a rule |
| Make the read a command so it reuses `IAuditableCommand` unchanged | It would open a transaction for a read and would make the architecture test's meaning fuzzy — "command" would no longer mean "changes state" |

### Ordering, and the row that must not appear in its own response

The behaviour writes **after** `await next()` and after the page has been materialised.
Two reasons, and the second is the one that bites:

1. A read that throws should not leave a `Success` row claiming it happened.
2. If the row were written first, it would be **inside the range the query then reads**,
   so every response would contain its own audit row. A client refetching would see the
   list grow by one on every refetch, indistinguishable from real activity. `AC-14` and
   `TEST-019-06` exist to pin this down.

The accepted cost: a read that fails with a `500` writes **no** row at all. BR-9.2
requires rows for auth events, not for faults, so this is inside the rules — and it is
listed as an accepted gap in `checklists/requirements.md` rather than left implicit.

### The denial path

An `Agent` never reaches the handler: the `ManagerOnly` policy rejects at the boundary.
The `Auth.Forbidden` row is therefore written by the authorization failure path that
`004-auth-and-roles` installed for every `403` (BR-9.2), **outside any transaction**
(BR-9.4). This feature does not build that writer — it asserts it, because an audit log
endpoint whose own denial is not recorded is the specific failure worth testing for
(`AC-13`, `TEST-019-05`).

## Data Changes

**None. There is no migration in this feature.**

Full detail and the reasoning in [`data-model.md`](data-model.md). In summary:
`003-audit-trail` created `dbo.AuditLog`, its `CK_AuditLog_ChangesIsJson` constraint, all
four indexes from `03-domain-model.md`, and the `GRANT INSERT, SELECT` / `DENY UPDATE,
DELETE` pair that makes BR-9.5 a permission rather than a convention. Every query this
feature issues is served by an index that already exists — which is the point of the
query-to-index map naming US-015 four times.

One conditional exception, and it is a task rather than an assumption: if
`IX_AuditLog_NotSuccess` turns out not to be *usable* for `outcome=Denied` (see
`research.md` R-3), the fix is an `INCLUDE (Outcome)` amendment to that index. It would
be a migration owned by this feature, and `BE-019-07` decides it from a real execution
plan instead of from a guess.

## API Contract

Frozen: [`contracts/audit-api.md`](contracts/audit-api.md).

| Method | Path | Request | Success | Failures |
|---|---|---|---|---|
| `GET` | `/api/audit` | `entityType`, `entityId`, `actorUserId`, `action`, `outcome` (repeatable), `from`, `to`, `cursor`, `pageSize` — all optional, AND'ed | `200` — `{ items, pageSize, nextCursor, hasMore }`, newest first | `400` `errors/validation`, `401` `errors/unauthenticated`, `403` `errors/forbidden`, `500`. `405` from routing on any write verb |

Two deviations from `05-api-conventions.md` are recorded in the contract and in
`research.md`: cursor pagination instead of `page`/`pageSize` (AC-12), and no
`totalCount`. `id` and `nextCursor` are **strings**, because a `bigint` above 2^53 loses
precision in JavaScript silently and a cursor built from a rounded id reads the wrong row.

## Frontend

No screen spec for this screen exists in `docs/sdd/design/screens/`. The screen is
authored in [`frontend-spec.md`](frontend-spec.md) from `10-shared-patterns.md` plus the
`Table` primitive, and it is flagged there as authored rather than inherited. That flag
matters: claiming to match a design nobody has seen is the one thing not to do.

| Route | Component | Kind (ADR-011 §4) | Purpose |
|---|---|---|---|
| `/audit` | `AuditLogPage` | Route / page | Owns the query, reads and writes the URL, renders the states |
| — | `AuditFilterBar` | Feature component | The five filter controls; receives values and a change handler as props |
| — | `AuditTable` | Feature component | Rows, the expandable `changes` cell, the empty body |
| — | `AuditChangesCell` | Feature component | Renders the diff, or raw text for an unrecognised shape |
| — | `Table`, `Badge`, `Select`, `Input`, `Button` | Primitive | From `006-design-system`. No new primitive |

- Filters and the cursor live in the URL (ADR-011 §2), so the parsed object is also the
  TanStack Query key and per-filter caching falls out of the design.
- Fetching only at the route level (ADR-011 §4).
- **No polling, no `refetchOnWindowFocus`, a long `staleTime`, and an explicit Refresh
  button.** Every fetch appends an `Audit.Read` row, so a 30-second poll would write
  2,880 rows a day per open tab. This is the one screen in the product where refetching
  is a side effect.
- Cursor paging means **no numbered pager**: the shared pagination pattern in
  `10-shared-patterns.md` assumes page numbers and a total, and neither exists here.
  Newer/Older controls with a cursor stack instead.
- `403` renders inline as a forbidden state, not a toast, per `10-shared-patterns.md`. An
  Agent should never reach the route — the entry point is not rendered for them — but the
  state exists anyway, because a deep link is a real path.

## Localization Impact

| Item | Detail |
|---|---|
| New client strings | Page title, the five filter labels, the nine column headers, the four state messages, Newer/Older, Refresh, the `changes` expand/collapse label. Full key table in `frontend-spec.md` |
| New server messages | The `400` validation messages: `Validation.Audit.EntityType.Unknown`, `Validation.Audit.Outcome.Unknown`, `Validation.Audit.Range.Inverted`, `Validation.Audit.EntityId.RequiresEntityType`, `Validation.Audit.Cursor.Invalid`. Added to **both** `.resx` catalogues |
| **Never localized** | Every field of the `200` body (BR-9.10, BR-8.9). `action`, `outcome`, `entityType`, `entityLabel`, `changes` are stored values. The client shows `Customer.Updated` verbatim in Arabic — it is an identifier, not a sentence |
| Direction-sensitive layout | A nine-column table is the highest-risk RTL layout in the product. Column order reverses; `traceId`, `ipAddress`, timestamps and `id` do **not** mirror; `entityLabel` and `changes` carry `dir="auto"` |
| User content | `entityLabel` may be an Arabic customer name; `changes` values may be Arabic. Both get `dir="auto"` |

The subtlety worth naming: this screen is **deliberately bilingual within one page** —
Arabic chrome around English audit values. That looks like a translation gap and is not
one; BR-9.10 requires it. It is stated in `frontend-spec.md` so a reviewer does not
"fix" it, and `AC-17` is the test.

## Test Strategy

| Level | What is covered | Why at this level |
|---|---|---|
| Unit | The validator: enum membership, inverted range, `entityId` without `entityType`, cursor parsing, `action` length; and `pageSize` clamping | Pure functions over the parsed filter; the input space is wide and needs no database |
| Unit | `LIKE` metacharacter escaping in the prefix builder | A pure string function, and the failure mode (`%` returning everything) is invisible in a passing integration test that only checks a row count |
| Integration | Every AC that is HTTP-shaped: `200`, ordering, each filter, `403`, `401`, every `400`, `405` | The contract is HTTP-shaped |
| Integration | `Audit.Read` written once per read, absent from its own response, present in the next (AC-6, AC-14) | Only a real round trip through the pipeline proves the ordering |
| Integration | `Auth.Forbidden` written on the `403`, with no ambient transaction (AC-13) | The asymmetry in BR-9.4 is exactly what gets implemented backwards |
| Integration | Cursor stability: insert a row between page 1 and page 2, assert no row is skipped or repeated (AC-12) | This is the defect offset pagination has, and the reason for the `bigint` key |
| Integration | Snapshotted actor after a role change (AC-8); a row whose entity was deleted (AC-7) | Both need real rows and a real delete; a join-based implementation passes every other test |
| Integration | Arabic request, English data (AC-17) | `Accept-Language` handling is middleware behaviour |
| **Execution plan** | `outcome=Denied` uses `IX_AuditLog_NotSuccess` (AC-4) | A row-count assertion passes whether or not the index is used. The index is the point of AC-4, so the plan is the assertion — see `research.md` R-3 |
| Frontend | The five states, URL round-tripping of filters, the Newer/Older cursor stack, `changes` rendering for both the known and an unknown shape | The page carries real logic |
| Frontend / a11y | Table semantics, keyboard reachability, the Arabic pass on a nine-column table | RTL defects in a wide table are visual; no assertion catches a column sized to English headers |

Not tested: the entity-to-DTO mapping, which has no behaviour beyond field copying;
`ipAddress` and `userAgent` capture, which belong to `003`.

## Dependencies

| Must land first | Why |
|---|---|
| `003-audit-trail` | The table, the four indexes, the permissions, `IAuditableCommand`, the audit behaviour this feature extends. Without it there is nothing to read |
| `004-auth-and-roles` | The `Manager` role, the `ManagerOnly` policy, and the `403`/`401` audit rows this feature asserts |
| `002-error-contract` | Every `400`/`401`/`403` body |
| `005-localization-core` | The `.resx` catalogues and `Content-Language` |
| `006-design-system` | `Table`, `Badge`, `Select`, `Input`, `Button` |

Nothing depends on this feature. It is a leaf, which is part of why it is droppable.

## Risks and Trade-offs

| Decision | Alternative | Why rejected |
|---|---|---|
| Cursor pagination on `Id DESC` | `page`/`pageSize` per `05-api-conventions.md` | Offset paging over a constantly appended table skips and repeats rows across pages. The convention is right for tickets and wrong here, and ADR-008 already paid for the `bigint` key to make this possible |
| `ORDER BY Id DESC` | `ORDER BY OccurredAtUtc DESC` per AC-1's wording | `OccurredAtUtc` is `datetime2(3)`; two rows can share a millisecond, so the sort is unstable — and an unstable sort under keyset pagination drops or duplicates rows at the boundary. `Id` is `IDENTITY` and stamped in the same insert, so `Id DESC` **is** newest-first and is deterministic |
| No `totalCount` | Include it, as the convention does | A count over an append-only table is a scan returning a number that is stale before it renders. The UI shows "*n* rows" for the page and an Older control |
| `id` as a JSON **string** | A JSON number, since it is a `bigint` | Above 2^53 JavaScript rounds it silently, and the cursor then reads the wrong page. It would surface as "pagination occasionally skips rows" months later |
| The audit row written **after** the query | Written by the pipeline before the handler, as for a command | It would land inside the range the query reads, so every response would contain its own row. Also a read that throws would leave a `Success` row |
| The row written by the pipeline at all | Written explicitly in the handler | It would be the only hand-written audit row in the system, and ADR-008's mitigation is precisely that nobody writes their own |
| `Manager` enforced by policy at the endpoint | Checked in the handler | BR-6 calls this a role-only check, and role-only checks belong at the boundary. It also guarantees the handler cannot run at all, so no `Audit.Read` row is written for a denied attempt |
| `entityId` requires `entityType` | Allow `entityId` alone | `IX_AuditLog_Entity` leads on `EntityType`; without it the filter scans. The caller always knows the type, so the restriction costs nothing and the alternative silently gets slow |
| No index on `Action` | Add one for the prefix filter | No speculative indexes. `LIKE 'Auth.%'` is a residual predicate on a backwards clustered scan, which is fine at demo volume. `data-model.md` names the volume at which it is not, and the index that fixes it |
| Redundant `Outcome <> 'Success'` predicate | Trust the optimizer to match `Outcome = 'Denied'` against a `<>` filtered index | Filtered-index matching on an inequality predicate is unreliable, and the index does not carry `Outcome`. Without the explicit literal, AC-4 passes on rows while the index it names is never touched |
| `changes` passed through unvalidated | Parse and validate the shape on read | The reader is not the authority on a column the writer owns; validating here would reject rows an older writer produced and lose them from the log |
| A screen, despite US-015 excluding a UI | Endpoint only | An endpoint no screen reaches is not demonstrable. Recorded as `Q-019-1`, and every FE task is droppable |

## Files to Create or Change

```text
src/Wasl.Domain/Audit/AuditEntityType.cs                                    (add if absent)
src/Wasl.Domain/Audit/AuditAction.cs                                        (add Audit.Read if absent)
src/Wasl.Api/Features/Audit/ListAuditEntries/Endpoint.cs
src/Wasl.Api/Features/Audit/ListAuditEntries/Query.cs
src/Wasl.Api/Features/Audit/ListAuditEntries/Handler.cs
src/Wasl.Api/Features/Audit/ListAuditEntries/Validator.cs
src/Wasl.Api/Features/Audit/ListAuditEntries/Response.cs
src/Wasl.Api/Features/Audit/ListAuditEntries/AuditEntryQuery.cs
src/Wasl.Api/Common/Behaviors/AuditBehavior.cs                              (extend for IAuditableRequest)
src/Wasl.Api/Common/Audit/IAuditableRequest.cs                              (split out of IAuditableCommand)
src/Wasl.Api/Common/Localization/Resources.en.resx                          (5 validation keys)
src/Wasl.Api/Common/Localization/Resources.ar.resx                          (5 validation keys)
src/wasl-web/src/features/audit/api.ts
src/wasl-web/src/features/audit/queries.ts
src/wasl-web/src/features/audit/schema.ts
src/wasl-web/src/features/audit/AuditLogPage.tsx
src/wasl-web/src/features/audit/AuditFilterBar.tsx
src/wasl-web/src/features/audit/AuditTable.tsx
src/wasl-web/src/features/audit/AuditChangesCell.tsx
src/wasl-web/src/routes.tsx                                                 (add /audit, Manager-only)
src/wasl-web/src/locales/en/audit.json
src/wasl-web/src/locales/ar/audit.json
tests/Wasl.Domain.Tests/Audit/AuditEntityTypeTests.cs
tests/Wasl.Api.IntegrationTests/Audit/ListAuditEntriesTests.cs
tests/Wasl.Api.IntegrationTests/Audit/AuditReadIsAuditedTests.cs
tests/Wasl.Api.IntegrationTests/Audit/AuditIndexUsageTests.cs
src/wasl-web/src/features/audit/__tests__/AuditLogPage.test.tsx
```

No file under `src/Wasl.Application/` or `src/Wasl.Infrastructure/` appears above,
because under ADR-010 those projects do not exist.

## Contract changes

First contract for this resource: [`contracts/audit-api.md`](contracts/audit-api.md),
frozen 2026-08-23. Nothing existed before it, so nothing is broken.

The heading stays even when empty — an empty contract-changes section is the statement
that the contract did not move.

The frontend lane reads [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md) and may start as
soon as that file exists; it does not wait for `BE-019-05`.
