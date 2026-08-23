# US-015 — Audit Log Access

**Epic:** EPIC-005 · **Release:** 2 · **Depends on:** audit infrastructure in the
walking skeleton

## Story

As a **Support Manager**,
I want to **query the audit log by record, by person, by time, and by outcome**,
so that **I can answer who did what when something is questioned**.

## Business value

The log is already being written by the skeleton. This story is how it is read without
opening a database client.

## Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | `GET /api/audit` returns a paginated envelope, sorted by `occurredAtUtc` descending |
| AC-2 | Filters: `entityType`, `entityId`, `actorUserId`, `action`, `outcome`, `from`, `to` — combined with AND |
| AC-3 | `action` supports a prefix match, so `Auth.` returns every authentication event |
| AC-4 | `outcome=Denied` and `outcome=Failed` return only those rows, served by the filtered index |
| AC-5 | An Agent calling the endpoint receives `403` (BR-9.11) |
| AC-6 | Every successful read writes an `Audit.Read` row (BR-9.11) |
| AC-7 | Rows for deleted or unknown entities still return, with their snapshotted label (BR-9.12) |
| AC-8 | The actor shown is the snapshot, not a join — a promoted user's past actions still show their former role (BR-9.6) |
| AC-9 | No endpoint exists to create, alter, or delete an audit row |
| AC-10 | A `traceId` from an error response can be used to find the corresponding row (BR-9.9) |
| AC-11 | An empty result returns `200` with an empty array |
| AC-12 | Pagination is cursor-based on `id`, not offset-based |

## Rules referenced

BR-9.1 – BR-9.13, BR-6, BR-7.2

## Out of scope

A UI, export, read auditing, retention, alerting, tamper-evidence.

## Notes

AC-12 is the reason the primary key is `bigint` (ADR-008). Offset pagination over a
table that is constantly being appended to skips and repeats rows between pages: as
new entries arrive at the top, everything shifts down and page 2 re-serves what page 1
already showed. A cursor on a monotonic key does not have that problem.

## Definition of Done

`09-definition-of-done.md`
