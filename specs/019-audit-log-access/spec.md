# US-015 — Specification

**Phase:** 5 · **Story:** US-015 · **Feature:** `019-audit-log-access` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

> **Migration note.** The source artifact
> `docs/sdd/story-artifacts/US-015-audit-log-access/spec.md` was an **unfilled
> template** — every section was a prompt with no content. There was therefore nothing
> to preserve except the section structure, which is kept exactly. The acceptance
> criteria are **not new**: `AC-1` – `AC-12` are copied verbatim from
> `docs/sdd/user-stories/US-015-audit-log-access.md` and keep their numbers, because
> other artifacts cite them. `AC-13` – `AC-19` are added here for obligations the story
> file did not carry: the audited denial (BR-9.2 / BR-9.4), pagination limits (BR-7.2),
> locale invariance (BR-9.10), and the client. Nothing above `AC-12` renumbers anything.

## Re-read 2026-09-27, before gate 3

This spec was written 2026-08-23 and has been awaiting review since. **Sixteen features
shipped in between** — `015`, `016`, `020`, `020b`, `021`, `035`, `036`, `036b` and the
whole frontend lane — so it was re-read against what is now true rather than approved as
found.

**The reasoning below survives. The PLAN does not.** Four findings are measured, two are
raised as questions.

### F-1 · The plan targets ADR-010, which was REJECTED — and this has happened before

`plan.md` and `data-model.md` are written for the two-project vertical-slice architecture
of ADR-010. Four citations, verbatim:

| Where | What it says |
|---|---|
| `plan.md:26` | *"Two projects only (ADR-010). There is no `Wasl.Application` and no `Wasl.Infrastructure`."* |
| `plan.md:37-43` | every slice placed in `Wasl.Api/Features/Audit/ListAuditEntries/`, with `MapGet("/api/audit")` |
| `plan.md:241` | *"because under ADR-010 those projects do not exist"* |
| `data-model.md:124` | *"references (ADR-010), so nothing below touches EF Core"* |

**ADR-010 was evaluated and rejected; four-project Clean stands (ADR-002)** —
`CLAUDE.md`'s *"Decisions already made — do not relitigate"* table says so by name. So the
plan puts the handler in the wrong project, reaches for minimal APIs where this product
uses controllers, names `Common/Behaviors/AuditBehavior.cs` in `Wasl.Api` when it lives in
`Wasl.Infrastructure/Persistence/Behaviours/`, and calls the policy class `Policies` when
it is `WaslPolicies`. Built as written, it would fail `LayerDependencyTests` before it
failed a review.

**`021` hit this exact defect and it is recorded in `CLAUDE.md`:** *"its structural half —
spec, research, tasks and three ticked checklist rows — targeted ADR-010, which was
rejected, and AC-17's search path would have scanned a directory that never exists and
passed vacuously."* The same migration produced both. `019/tasks.md:14` even notes
*"Layering repaired where the copied templates carried it"* — so somebody repaired
`tasks.md` and stopped there.

**Nothing is rewritten here.** `plan.md` and `data-model.md` are gate-5 artifacts and
correcting them is implementation work; this section names the defect so the correction
is a decision rather than a surprise. **`019` cannot pass gate 4 on the plan as it
stands.**

### F-2 · Assumption A-2 describes a `Changes` shape that does not exist

A-2 says `Changes` holds `{"Field": {"from": …, "to": …}}`. **It does not.**
`AuditChangeSerializer` writes a JSON **array** of records whose wire shape is declared in
that file, for this feature by name:

```csharp
/// The wire shape … so the JSON keys `019` reads are declared here
private sealed record ChangeRecord(
    string Entity, Guid? Id, string Field, string? Before, string? After);
```

So it is `[{ entity, id, field, before, after }]` — an array, five keys, and `before`/`after`
rather than `from`/`to`. `AuditPipelineTests` reads it that way today
(`EnumerateArray().Select(c => c.GetProperty("field"))`).

**Two things downstream are written against the wrong shape**: the edge case *"`Changes`
holds JSON that is not the `{field:{from,to}}` shape"*, and whatever `frontend-spec.md`
says the screen renders. Both need the real shape before a test is written from either.

### F-3 · A-1 and A-3 are correct, measured

| # | Claim | Verified |
|---|---|---|
| A-1 | `dbo.AuditLog` exists with four indexes, including the filtered one | `AuditEntryConfiguration` — `IX_AuditLog_Time`, `IX_AuditLog_Entity`, `IX_AuditLog_Actor`, and `IX_AuditLog_NotSuccess` with `.HasFilter("[Outcome] <> 'Success'")` |
| A-3 | `Id` is monotonic, so `Id DESC` is newest-first and deterministic | `AuditEntry.Id` is `long` |

AC-4's *"served by the filtered index, verified against a real execution plan"* therefore
still has an index to be served by. **ADR-013 asks for `filter_definition` to come back
non-null — and `021` found that reading `sys.*` needs `VIEW DEFINITION`, which `003b`'s
`db_datareader` does not grant.** Read that metadata on the **migrator** connection, or
the test reports a missing index for one that is present.

### F-4 · A `401` writes a row now, and AC-18 is true but incomplete

AC-18 says a request without a valid token returns `401` and **no `Auth.Forbidden` row is
written**. That is still correct — and since `004b` an `Auth.Unauthenticated` row **is**
written, by `AuthDenialResultHandler`, with the body enveloped.

A test written from AC-18's wording as *"no row"* would be asserting the opposite of the
product. The criterion needs one clause: *no `Auth.Forbidden` row; an
`Auth.Unauthenticated` row instead.*

### F-5 · Two questions the elapsed features raise

**Q-019-4 · Does `036`'s write limiter apply to this endpoint?** `036` §3.4 put every
write under 60 per caller per minute, and `CLAUDE.md` states *"Reads are deliberately
unlimited: nothing in this product polls."* `GET /api/audit` is the one endpoint that is
both — a read that writes a row per call. Under the limiter a Manager paging through a
long log is throttled at row 60; outside it, the one endpoint whose read volume IS write
volume is the one with no ceiling. **Working assumption: outside the write limiter**,
because the spec already forbids polling and refetch-on-focus for exactly this reason —
but it is a stated assumption, not an inherited one, which is what `036`'s own row asks
for.

**Q-019-5 · Is the action list in `plan.md` still complete?** It was written before
`016` (`Ticket.Escalated`), `021` (the send-message actions) and `020b`. AC-3's prefix
match does not care, but any enumerated list in the plan or on the screen does.
**`020b`'s scheduled snapshot writes NO audit row by design** — `CLAUDE.md`: *"a snapshot
is derived data, not a state change a person made"* — so an auditor reading this log will
not find the product's only background job in it. That is correct and it is the kind of
absence worth stating on the screen rather than leaving a Manager to infer.

**Q-019-6 · Does the screen survive `022`?** `022-tenant-theming-settings` is in flight in
the other lane and adds `OrganizationSettings` — a new audited entity. `019`'s
`entityType` filter and any fixed list of entity types will need it. Not a blocker; a
sequencing note.

---

## Understanding

`003-audit-trail` already **writes** `dbo.AuditLog`: every state change, every sign-in,
every `401` and `403`. This feature is the only way to **read** it without opening a
database client. That is the whole story, and it is why the feature sits in Release 2 —
the forensic value was created when the writing landed; until this endpoint exists, a
Manager asking "who changed that phone number" gets an answer from someone running SQL.

One endpoint: `GET /api/audit`. It is a filtered, cursor-paginated read over an
append-only table, restricted to `Manager` (BR-9.11).

The rule with the twist is BR-9.11's second sentence: **reading the audit log is itself
audited**, as `Audit.Read`. So this endpoint writes a row into the table it reads. Two
consequences follow, and both are the kind of thing that is implemented backwards by
accident:

1. The `Audit.Read` row is written **after** the page has been materialised, so the
   response never contains the row describing its own request. Write it before the query
   and every response contains its own audit row, and a client that refetches sees a
   list that grows by one row per refetch forever — a self-referential log that looks
   like real activity.
2. An `Agent` calling it gets `403`, and **that denial is also a row** (BR-9.2), written
   outside any transaction because there is no business transaction to join (BR-9.4).
   Denying access to the audit log without recording the attempt loses exactly the
   signal an auditor is looking for.

Because every read appends a row, **read volume is now write volume**. That is a
frontend constraint, not only a note: the screen does not poll, does not refetch on
window focus, and refreshes only when a person asks it to.

## In Scope

- `GET /api/audit`, `Manager` only, returning a cursor-paginated envelope newest-first
- Filters, combined with AND: `entityType`, `entityId`, `actorUserId`, `action`
  (prefix match), `outcome` (repeatable), `from`, `to`
- The `outcome` filter served by the existing filtered index `IX_AuditLog_NotSuccess`,
  verified against a real execution plan and not only against returned rows
- `Audit.Read` written on every successful read; `Auth.Forbidden` written on every denial
- Snapshotted actor and entity label returned as stored — no join to `SupportUsers`
- An audit-log screen at `/audit`, reachable by a Manager only. **See the scope note
  below: US-015 puts a UI out of scope and this feature reinstates it deliberately**

## Out of Scope

| Excluded | Reason |
|---|---|
| Any write, edit or delete endpoint for audit rows | BR-9.5. `DENY UPDATE, DELETE` is already in place; adding an endpoint would be building the thing the permission forbids (AC-9) |
| CSV / JSON export | Not in US-015. An export is also a bulk extraction of personal data, which sharpens Q-9 before Q-9 has an answer |
| Retention or a purge job | Q-9, open. BR-9.13 puts retention outside the application entirely |
| Auditing **reads** of customer data | Q-10, open. This feature audits reads of the *audit log*, which BR-9.11 mandates; it does not extend read-auditing to anything else |
| Tamper evidence — hash chains, signed rows, a write-only replica | ADR-008 considered and rejected a separate database; there is no stated compliance requirement to justify it |
| Alerting on patterns (repeated `Auth.LoginFailed`, repeated `Auth.Forbidden`) | Named as valuable in ADR-008 and still a separate story. Detecting a pattern is not reading a log |
| Full-text search over `Changes` | `Changes` is `nvarchar(max)` with no JSON index (ADR-013). A `LIKE '%…%'` over it scans the table and would be the slowest query in the system |
| A count of total matching rows | See AC-1 and `research.md` R-4. `totalCount` over a table that is appended to constantly is a full scan producing a number that is already stale |
| Free-text search across all columns | Nothing in FR-6.7 asks for it; the four named axes are entity, actor, time, outcome |

### Scope note — the screen

US-015's own **Out of scope** line reads: *"A UI, export, read auditing, retention,
alerting, tamper-evidence."* This feature keeps every one of those exclusions except the
first: it specifies a read-only Manager screen. The reason is that an endpoint no screen
reaches is not demonstrable, and Phase 5 exists to add reachable value. The cost is that
the screen was authored here (`frontend-spec.md`) rather than inherited from
`docs/sdd/design/screens/`, where **no audit screen spec exists**. That is recorded in
`frontend-spec.md` rather than hidden, and it is the subject of `Q-019-1` below. Every FE
task is droppable; the endpoint is not.

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | `003-audit-trail` has already created `dbo.AuditLog` with all four indexes and the `DENY UPDATE, DELETE` grant. This feature adds **no** schema | If `IX_AuditLog_NotSuccess` was not created with its filter, `AC-4` cannot be served by an index and `BE-019-07` becomes a schema task in `003`, not here |
| A-2 | `Changes` holds `{"Field": {"from": …, "to": …}}` as written by `003`. This endpoint passes it through and does **not** validate the shape | A row with a different shape renders as raw text in the client rather than failing the page. Named as an edge case, not a defect | **← DISPROVED 2026-09-27, see F-2: the shape is an ARRAY of `{entity, id, field, before, after}`, not an object keyed by field name.**
| A-3 | `Id` is `bigint IDENTITY` and monotonic, so `Id DESC` **is** newest-first and is deterministic where `OccurredAtUtc DESC` is not — two rows can share a millisecond | If ids were ever generated out of order (they are not, on one instance), `AC-1`'s ordering and `AC-12`'s cursor would disagree |
| A-4 | A Manager is trusted with the personal data in `Changes` — customer emails and phone numbers appear there | If not, `Changes` needs field-level redaction on read, which is a different feature and would make the log useless for its purpose |
| A-5 | Audit volume in the demo is thousands of rows, not millions. No index is added speculatively for `action` | At millions of rows an unindexed `action` prefix filter degrades. The threshold and the index that fixes it are named in `data-model.md` |
| A-6 | `Auth.Forbidden` rows for this endpoint are written by the mechanism `004-auth-and-roles` already installed for every `403`. This feature asserts the row, it does not build the writer | If `004` writes the row only for some paths, the `403` here is silent and `AC-13` fails — which is precisely why `AC-13` exists as a test and not as a note |

## Open Questions

| # | Question | Working assumption |
|---|---|---|
| Q-9 | What is the audit log retention period? The table grows without bound and holds personal data — customer emails and phone numbers appear in `Changes`. This feature makes the question **sharper**, because it turns the log into something people actually open, and it adds a row per read | Retained indefinitely, no purge job, no export. A legal or compliance answer, not an engineering one (`docs/sdd/11-open-questions.md` Q-9). Recorded as a known limitation in `summary.md`, never resolved by guessing |
| Q-10 | Should **reads of customer data** be audited, not just writes? This feature proves the mechanism works — it audits reads of one resource — which is exactly what makes the question answerable now | No. Writes and auth events only, plus `Audit.Read` where BR-9.11 mandates it. Auditing every customer read multiplies the table by the read-to-write ratio, and the proportionate version (single-record reads, not list queries) is its own story |
| Q-019-1 | Is a Manager-only audit screen in scope for Release 2, given US-015 excludes a UI? | Yes, specified here, and **first out** if time runs short. `FE-019-*` is droppable in full; `BE-019-*` is not. The screen is authored in `frontend-spec.md` from `10-shared-patterns.md` and the `Table` primitive, and flagged there as authored-not-inherited |
| Q-019-2 | Where does a Manager enter the screen from? `02-app-shell.md` states *"Manager — same nav; the roles differ in permissions, not in navigation"*, so a Manager-only nav item is a change to the shell | Entry from the user popover beside `Settings`, which is the shell's existing home for a destination used monthly rather than hourly. The route is directly linkable either way. Needs a design owner's confirmation |
| Q-019-3 | Should the `Audit.Read` row record the **filter** the Manager used? | Yes. `Changes` carries the normalised query and the row count returned. Which customer a manager went looking for is itself forensically interesting. It is a deliberate reuse of a column BR-9.8 defines as a field diff, and it is named in `contracts/audit-api.md` rather than left to be discovered |
| **Q-019-4** | Does `036`'s write limiter apply to `GET /api/audit`? It is the one endpoint that is both a read and a write — a row per call. | **Outside it.** The spec already forbids polling and refetch-on-focus for this reason. Stated rather than inherited, which is what `036`'s own row asks for. See F-5 |
| **Q-019-5** | Is the action list still complete after `016`, `021` and `020b`? | AC-3's prefix match does not care; an enumerated list does. And **`020b`'s scheduler writes no row by design**, so the product's only background job is absent from this log — worth stating on the screen. See F-5 |
| **Q-019-6** | `022` adds `OrganizationSettings`, a new audited entity, in the other lane right now. | A sequencing note, not a blocker: the `entityType` filter and any fixed list need it. See F-5 |

## Acceptance Criteria

`AC-1` – `AC-12` are US-015's, verbatim and in their original order.

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
| AC-13 | The `403` in AC-5 writes an `Auth.Forbidden` row with `outcome: Denied`, **outside any transaction** (BR-9.2, BR-9.4), and the row survives even though the request produced no business change |
| AC-14 | The `Audit.Read` row written by a successful read is **not present in that response**, and appears in the next read (BR-9.11) |
| AC-15 | `pageSize` defaults to 20 and is **clamped** to 100, not rejected (BR-7.2). `pageSize=0` or negative is clamped to the default |
| AC-16 | Invalid filter input returns `400` naming the field: an unparseable `from`/`to`, `from` later than `to`, an `outcome` or `entityType` outside the accepted set, an `entityId` without an `entityType`, or a malformed `cursor` |
| AC-17 | Every field of the response is **English regardless of `Accept-Language`** (BR-9.10, BR-8.9) — `action`, `outcome`, `entityLabel`, and `changes` are stored values, not localized strings. Only a `ProblemDetails` `title`/`detail`/`errors` message is translated, and `Content-Language` still names the applied locale |
| AC-18 | A request without a valid token returns `401` before any authorization check, and no `Auth.Forbidden` row is written for it (the `401` writes `Auth.Unauthenticated` instead, from `004`) |
| AC-19 | The client screen renders loading, empty-no-rows, empty-no-matches, error (with `traceId`), and forbidden as five distinct states; filters and the cursor live in the URL; the screen never polls or refetches on focus, because every refetch appends a row |

## Edge Cases

From `docs/sdd/testing/edge-cases.md`: empty result set, page beyond the last, `pageSize`
over the maximum, `pageSize` of zero, unknown query-string parameter, malformed date,
inverted date range, unknown enum value, `null` versus omitted, unauthenticated request,
wrong-role request.

Specific to this story:

| Case | Expected |
|---|---|
| Reading the log immediately after reading it | The second response contains the first read's `Audit.Read` row. This is the test that proves AC-6 and AC-14 together |
| `action=%` or `action=a[b` | Treated as literal text, not as `LIKE` wildcards. `%` alone must not return the whole table — the metacharacters are escaped with an explicit `ESCAPE` clause |
| `action=Auth.` | Every `Auth.*` row (AC-3). No index serves this; it is a residual predicate on a backwards clustered scan, which is correct at demo volume and named in `data-model.md` |
| `outcome=Denied&outcome=Failed` | Both, OR'd within the filter and AND'ed with the rest (BR-7.4). The handler adds a redundant `Outcome <> 'Success'` predicate so the filtered index is eligible — see `research.md` R-3 |
| `outcome=Success` together with `outcome=Denied` | Accepted. The redundant `<> 'Success'` predicate is **not** added, because it would exclude rows the caller asked for. The plan falls back to a scan; that is correct, not a regression |
| A row whose `EntityId` points at a deleted customer | Returned, with `entityLabel` as snapshotted. There is no join to fail (BR-9.12, AC-7) |
| A row written by a user who has since been promoted to Manager | `actorRole` reads `Agent` — the role held then (BR-9.6, AC-8) |
| A row with `actorUserId` null (failed sign-in) | Returned. `actorEmail` may hold the attempted address; `actorRole` is null |
| `Changes` is null | Returned as `null`. Not every action has a diff — `Auth.LoginFailed` and `Audit.Read` have no before/after |
| `Changes` holds JSON that is not the `{field:{from,to}}` shape | Returned as-is; the client renders it as raw text rather than failing the row (A-2) |
| A cursor from a different filter combination | Accepted. The cursor is only an `id` boundary; it does not encode the filter. Reusing it with different filters is meaningful, not an error |
| A cursor pointing past the newest row | `200` with an empty array (AC-11), not `404` |
| Two reads racing on the same page | Both succeed and both write a row. There is nothing to conflict over — the table is append-only and carries no `rowversion` |
| `POST`/`PUT`/`PATCH`/`DELETE` on `/api/audit` | `405 Method Not Allowed` from routing, because no such handler is mapped (AC-9) |
| `Accept-Language: ar` | `Content-Language: ar`, and every data field still English (AC-17) |

## Rules Referenced

BR-9.1 – BR-9.13 (BR-9.11 is the subject of the story; BR-9.2, BR-9.4, BR-9.5, BR-9.6,
BR-9.9, BR-9.10, BR-9.12 are each asserted by a named test), BR-6 (authorization matrix
— *Read the audit log: Agent ❌, Manager ✅*), BR-7.2 (page size clamp), BR-7.4 (repeated
filter values OR'd), BR-7.6 (empty result is `200`), BR-8.7 and BR-8.9 (what is never
localized), FR-6.4, FR-6.6, FR-6.7, NFR-10 (the architecture test), ADR-008, ADR-010,
ADR-011, ADR-013.
