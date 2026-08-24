# 013 — Technical Plan

**Phase:** 3 · **Story:** US-010 · **Feature:** `013-ticket-timeline-and-comments` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

Migrated from `docs/sdd/story-artifacts/US-010-ticket-timeline-comments/plan.md`. The
design decisions are the original ones; what changed is the provider (ADR-013), the
project layout (ADR-010), and the audit obligation (ADR-008). The full list of repairs
is under **Migration note** in [`tasks.md`](tasks.md).

## Design Summary

Comments and history stay in separate tables — they have genuinely different shapes —
and are merged into a single ordered feed by a SQL `UNION ALL` over a common
projection. Merging in the database rather than in memory is what makes AC-12
pagination correct.

Under SQL Server the union is expressed as EF Core `Concat` over two identically shaped
projections, ordered and paged **after** the set operation so the engine produces
`UNION ALL … ORDER BY … OFFSET … FETCH NEXT`. That last sentence is the whole feature:
if the ordering or the paging lands on the wrong side of the `Concat`, EF evaluates the
merge in memory, every functional test still passes, and the application reads the
entire history of a ticket to return fifty rows. See `research.md` R-1.

## The merge decision

Two options were available, and they differ in more than style.

**In-memory merge:** query both tables, concatenate, sort, then page. This is simple
and wrong at any size, because paging a merged list requires *all* rows from both
tables to be loaded before the page can be taken. The application would read the
entire history of a ticket to return fifty rows.

**SQL `UNION ALL` over a projected shape:** both tables project to
`(occurredAt, entryType, actorUserId, payload…)`, the union is ordered and paged in
the database, and only the requested page crosses the wire.

The union is chosen. The cost is that both projections must produce identical column
shapes, which makes the query less readable — an acceptable trade for correct
pagination.

### What SQL Server adds to that trade

| Constraint | Consequence for the query |
|---|---|
| `OFFSET … FETCH NEXT` may only be applied to the **outermost** query, never to a `UNION ALL` branch | `Skip`/`Take` go after `Concat`, never inside a branch |
| `ORDER BY` inside a set-operation branch is not translatable and is dropped | `OrderBy`/`ThenBy` go after `Concat` too. An `OrderBy` written inside a branch disappears silently and the feed comes back in whatever order the engine found convenient |
| A `UNION ALL` column takes its type from the **first** branch | The comment `Body` (`nvarchar(4000)`) and the history `NewValue` (`nvarchar(200)`) must **not** share a column. Sharing one truncates a 4000-character comment to 200 characters with no error at all |
| `uniqueidentifier` sorts by a byte order that is **not** `Guid.CompareTo` in .NET | The tie-break is deterministic, but a test that computes the expected order in C# will disagree with the server. AC-10 is asserted as *stability across repeated requests*, not as a C#-computed sequence |

Each branch therefore carries its own nullable columns, with an explicit cast on the
`NULL` side, and one shared `(OccurredAtUtc, EntryTypeRank, Id)` ordering key.

## The two questions the spec left open

| # | Resolution | Reason |
|---|---|---|
| Q-1 — does the `CommentAdded` history row carry the comment id? | **Yes**, in `NewValue`, which is `nvarchar(200)` and holds a `Guid` comfortably. And the timeline projection **excludes** `CommentAdded` rows from the history branch | The row is required by BR-5.5 and is what a future customer-facing view and the audit reader join on. But projecting it into the timeline makes every comment appear twice — once as itself, once as a bodyless "a comment was added" line. De-duplicating that in the client works until two comments land in the same millisecond; excluding it in the query is structural. No new column, so no change to `dbo.TicketHistory` |
| Q-2 — oldest-first or newest-first? | Ordered **ascending**; page 1 is the oldest 50; the **default** page when `page` is omitted is the last one | Ascending numbering over an append-only feed is drift-free: entries are only ever appended at the newest end, so pages 1 … N−1 are immutable once full and only page N grows. Numbering from the newest end instead would shift every entry down by one on each insert, and "load older" would then skip or repeat entries — the classic offset-pagination defect, here made avoidable by the append-only rule |

## Backend

Two projects, vertical slices, minimal APIs (ADR-010). There is no `Wasl.Application`
and no `Wasl.Infrastructure`; the original plan's four-layer table is mapped onto the
accepted layout below, with the responsibilities unchanged.

| Project | Component | Responsibility |
|---|---|---|
| `Wasl.Domain` | `Tickets/TicketComment` | Owned entity; validates the body per BR-5.1 |
| `Wasl.Domain` | `Tickets/Ticket.AddComment(...)` | Rejects on a closed ticket; appends both the comment and the `CommentAdded` history row |
| `Wasl.Domain` | `Tickets/TicketClosedException` | Signals BR-5.2. **Check `012-change-ticket-status` first** — if it already introduced this type, reuse it. Two exception types for one condition is how one condition acquires two `ProblemDetails.type` values |
| `Wasl.Api` | `Features/Tickets/AddComment/AddCommentCommand` + `Handler` | Loads the ticket with its comments, calls the domain, saves. Author comes from the token (AC-15) |
| `Wasl.Api` | `Features/Tickets/AddComment/AddCommentValidator` | FluentValidation at the boundary: body present, ≤ 4000, `channel` one of the permitted values |
| `Wasl.Api` | `Features/Tickets/AddComment/AddCommentEndpoint` | One minimal-API endpoint. Binds, authorizes, delegates, maps |
| `Wasl.Api` | `Features/Tickets/Timeline/GetTicketTimelineQuery` + `Handler` | The paged request; computes the default (last) page |
| `Wasl.Api` | `Features/Tickets/Timeline/TicketTimelineQuery` | The named query object holding the `UNION ALL`. One caller, no interface (ADR-010) |
| `Wasl.Api` | `Features/Tickets/Timeline/TimelineEntryResponse` | The common shape, with a discriminating `entryType` |
| `Wasl.Api` | `Features/Tickets/Timeline/GetTimelineEndpoint` | One minimal-API endpoint |
| `Wasl.Api` | `Common/Persistence/Configurations/TicketCommentConfiguration` | Columns, lengths, `(TicketId, CreatedAtUtc)` index, the body check constraint |

The union lives in its own named class rather than being composed inline in the handler,
so that the one piece of provider-shaped query composition in the codebase is in a
predictable place. It is a **query object, not a repository**: one caller, no
interface, complex enough to name and to test on its own (ADR-010, which names this
query explicitly). `DbSet<T>` remains the repository for everything else in the slice.

`TicketsController` from the original plan does not exist. Controllers group by entity,
which would collect six unrelated slices into one file; each slice owns one endpoint
file instead.

## Data Changes

Full detail in [`data-model.md`](data-model.md). In summary:

**Migration:** `AddTicketComments`

`dbo.Tickets` and `dbo.TicketHistory` already exist — `009-create-ticket` created them,
along with `IX_TicketHistory_Ticket_Time`, which serves the history branch of this
union unchanged. `dbo.SupportUsers` exists from `004-auth-and-roles`. What this feature
adds is one table and one index.

| Object | Query or rule it serves |
|---|---|
| `dbo.TicketComments` — `nvarchar(4000)` body, `bit IsInternal`, `nvarchar(20)` nullable `Channel`, `datetime2(3) CreatedAtUtc` | AC-1, AC-5, AC-6 |
| `IX_TicketComments_Ticket_Time` on `(TicketId, CreatedAtUtc)` | The timeline union's comment branch |
| `CK_TicketComments_Body` — `LEN(LTRIM(RTRIM(Body))) > 0` | BR-5.1's floor for a row inserted by hand during support work |
| FK `TicketId` → `dbo.Tickets`, `ON DELETE CASCADE` | A comment has no meaning without its ticket |
| FK `AuthorUserId` → `dbo.SupportUsers`, `ON DELETE NO ACTION` | An author who has left is still displayable. `NO ACTION`, not `RESTRICT` — `RESTRICT` is not SQL Server syntax (ADR-013) |

No `rowversion` on `TicketComments`. It is append-only, so there is nothing to conflict
over (ADR-006 as amended by ADR-013). Adding one "to be safe" would put a concurrency
token on a table no two people ever edit.

**Adding a comment does not touch the `dbo.Tickets` row.** No `UpdatedAtUtc` bump, so
the ticket's `rowversion` does not change and this endpoint takes no `expectedVersion`.
If it did bump it, an agent commenting and an agent changing status at the same moment
would produce a `409 concurrency-conflict` that neither of them caused, and it would
look random. The consequence is recorded honestly: "last activity" on the ticket list
stays creation-based and is not comment-aware (`research.md` R-10).

Verification is a `sys.indexes` / `sys.check_constraints` query, not a reading of the
migration file, and not `\d+` — there is no psql here.

## Audit

ADR-008 postdates the original plan, so none of the original tasks carried this. It is
not optional: NFR-10's architecture test fails the build when a state-changing command
does not implement `IAuditableCommand`.

| Concern | Decision |
|---|---|
| State-changing commands in this feature | Exactly one: `AddCommentCommand` |
| Action name (BR-9 naming table) | `Ticket.CommentAdded` |
| Who writes the row | The pipeline behaviour, inside the same transaction as the insert (BR-9.3). Absent when the transaction rolls back, and that is tested both ways |
| `EntityType` / `EntityId` / `EntityLabel` | `Ticket` / the ticket id / the `TicketNumber`, so the row reads without a join (BR-9.6) |
| `Changes` (BR-9.7) | `{ "commentId": "…", "isInternal": true, "channel": "Email" }` — **never the body**. A generic behaviour that serialises the command would include `body` automatically, and would put user-entered text into the one table nothing deletes and only Managers read. This is the single most likely audit defect in the feature, so it gets its own assertion: the body string appears nowhere in the row |
| `GET /timeline` | Not audited. Reads are audited only for the audit log itself (BR-9.11). Recorded so the absence is visibly a decision |
| `403` | **There is no `403` on either endpoint.** BR-6 permits both `Agent` and `Manager` to add a comment and to read a ticket, so no role check exists to deny. Stated rather than left as a hole in the matrix |
| `401` | BR-9.2 covers it: `Auth.Unauthenticated`, `Outcome = Denied`, written **outside any transaction** (BR-9.4) because there is no business transaction to join. Owned by `003`/`004`; asserted here for these two endpoints |
| A rejected comment (`400`, `409`) | No row, per `spec.md` Q-3's working assumption. Open, not decided by this plan |

## API Contract

Frozen: [`contracts/ticket-timeline-api.md`](contracts/ticket-timeline-api.md). The
frontend lane reads [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md) and starts against
it immediately.

| Method | Path | Request | Success | Failures |
|---|---|---|---|---|
| `POST` | `/api/tickets/{id}/comments` | `{ body, isInternal?, channel? }` | `201` + the comment | `400`, `401`, `404`, `409` closed |
| `GET` | `/api/tickets/{id}/timeline` | `?page&pageSize` | `200` + paged entries | `400`, `401`, `404` |

Timeline entry shape:

```json
{
  "entryType": "Comment" | "History",
  "id": "…",
  "occurredAtUtc": "…",
  "actorUserId": "…",
  "actorName": "…",
  "comment": { "body": "…", "isInternal": false, "channel": "Email" },
  "history": { "eventType": "StatusChanged", "oldValue": "New", "newValue": "Open", "note": null }
}
```

Exactly one of `comment` and `history` is populated. A discriminated shape rather
than a flat one with nullable fields from both, so the client can narrow on
`entryType` and TypeScript can enforce it.

Two deliberate deviations from `docs/sdd/05-api-conventions.md`, both recorded rather
than absorbed:

| Deviation | Reason |
|---|---|
| `201` carries **no `Location` header** | There is no `GET /api/tickets/{id}/comments/{commentId}` in the endpoint inventory, and there will not be: BR-5.3 makes a comment append-only, so it has no addressable identity of its own. A `Location` pointing at a route that returns `404` is worse than no header. The created comment is returned in the body instead |
| Default `pageSize` is 50, not BR-7.2's 20 | AC-12 and assumption A-3. BR-7.2's 20 is the ticket-list default; a timeline entry is one line, and 20 makes a reader page three times to see a week of activity. The **100 maximum and its clamp still apply**, as does the clamp of `page ≤ 0` to 1 |

## Frontend

| Component | Kind (ADR-011 §4) | Purpose |
|---|---|---|
| `TicketDetailPage` | Route / page | Owns both queries and the mutation. The only thing here that fetches |
| `TicketTimelineDrawer` | Feature | Renders the feed; distinct treatment per entry type; `onLoadOlder` is a prop |
| `TimelineEntry` | Feature | Narrows on `entryType` and delegates |
| `CommentComposer` | Feature | Body, internal toggle, optional channel. React Hook Form + Zod |

The drawer does **not** own a `useQuery`, even though a drawer that loads its own
content reads as the natural design. Fetching stays at the route level (ADR-011 §4); a
drawer that fetches on mount is a request waterfall hidden behind a click.

The composer is hidden entirely on a closed ticket rather than disabled, because a
disabled control invites the question of how to enable it. The `409` is still handled,
since the ticket may close between load and submit.

Full screen detail: [`frontend-spec.md`](frontend-spec.md). The element-by-element
layout is `docs/sdd/design/screens/04-ticket-detail.md` and is not duplicated.

## Localization Impact

| Item | Detail |
|---|---|
| New client strings | Composer labels, the internal-comment badge, the load-older action, the empty state, and one sentence per `TicketEventType` |
| New server messages | `Validation.CommentBody.Required`, `Validation.CommentBody.TooLong`, `Validation.Channel.Invalid`, `Error.TicketClosed` |
| History rendering | Each history row is rendered from its `eventType`, `oldValue`, and `newValue` into a translated sentence with placeholders. The stored values stay canonical English; the sentence around them is translated |
| Formatting | Timestamps through `formatters.ts`; relative times, if used, need Arabic plural forms |
| User content | Comment bodies are the most likely place for mixed-language text in the whole product. `dir="auto"` per entry, not per feed |
| Not translated | `TicketHistory.OldValue` and `NewValue` are stored canonically, so a timeline written while the interface was English still renders correctly in Arabic (BR-8.7) |

That last row is the reason BR-8.7 exists. Had status values been stored translated,
the timeline would be a mix of languages reflecting whatever each agent had selected at
the time, and it could never be rendered consistently again.

**And it is the reason the timeline carries this feature's most invisible defect.** The
sentence is translated; the *values interpolated into it* are canonical enum strings.
Writing

```ts
t('tickets:timeline.entry.statusChanged', { from: e.history.oldValue, to: e.history.newValue })
```

produces a fully Arabic sentence with `New` and `Open` sitting inside it in Latin
script. Every key exists in both catalogues, the parity test passes, the sentence
renders, and nothing fails. The interpolated values must themselves go through the
enum-label catalogue (`tickets:status.*`, `tickets:priority.*`), which
`010-ticket-list-and-detail` and `012-change-ticket-status` already own — so this
feature *references* those keys and does not add its own copies. Asserted by a test that renders an Arabic timeline and looks for Latin
enum tokens.

## Test Strategy

| Level | Covered | Why here |
|---|---|---|
| Unit | Body validation; `AddComment` rejected on a closed ticket; both rows appended | Domain behaviour |
| Integration | AC-1 – AC-8, AC-15, AC-16 | HTTP contract |
| Integration | Merge order, including the same-instant tie-break | The union is the risk in this story |
| Integration | Pagination correctness across the union boundary — a page that spans both sources | The specific failure mode of a badly merged feed |
| Integration | Executed-command count for the timeline | AC-14 |
| Integration | The **captured SQL** contains `UNION ALL` and `OFFSET … FETCH`, in one statement | The failure that no functional assertion catches: a client-evaluated merge behaves correctly and reads the whole ticket |
| Integration | One audit row per accepted comment; none after a forced rollback; the body appears nowhere in the row | ADR-008, BR-9.3, BR-9.7 |
| Integration | An Arabic comment body round-trips byte-identical | `nvarchar`, ADR-013 row 4. `varchar` returns `????` and reads as a font bug |
| Integration | A comment authored by a **deactivated** user still appears in the timeline | The join must not carry `IsActive = 1`. Copying that predicate from an assignee-picker query makes a departed colleague's history disappear |
| Frontend | Distinct rendering per entry type; script content rendered as text; empty state | AC-17 and the XSS surface |
| Frontend | An Arabic render of a `StatusChanged` entry contains no Latin enum token | The localization defect above |

Integration tests run against a real SQL Server through `Testcontainers.MsSql`. EF
`InMemory` is not an option for any of this: it does not translate `UNION ALL` the way
the provider does, does not enforce the check constraint, and cannot prove that the
paging happened server-side — which is the only thing worth proving here.

## Dependencies

`009-create-ticket` (tickets and history — a hard dependency: this migration cannot
apply without `dbo.Tickets` and `dbo.TicketHistory`), `012-change-ticket-status`
(status changes give the timeline something interesting to show, and may already own
`TicketClosedException` — not a hard dependency), `003-audit-trail` (the behaviour that
writes the row), `004-auth-and-roles` (the token that supplies the author),
`002-error-contract` (the `ProblemDetails` shape and the `errors/not-found` slug).

## Risks and Trade-offs

| Decision | Alternative | Why rejected |
|---|---|---|
| SQL `UNION ALL` | In-memory merge then page | Would load every row of both tables to return one page |
| Two tables | One polymorphic `TicketEvent` table | Comments and history have different lifecycles and different shapes; a single table would be mostly nulls, and the comment body would sit in an audit table |
| History row excludes the comment body | Include it | Two sources of truth for the same text, which drift the moment either is touched |
| Discriminated entry shape | Flat shape with nullable fields | The client could not narrow safely, and every render would need defensive checks |
| Composer hidden on a closed ticket | Disabled | A disabled control implies a path to enabling it; there is none |
| Plain text only | Rich text | Rich text needs sanitisation, and an unsanitised rich-text field is a stored XSS vulnerability |
| EF Core `Concat` over two projections | `FromSql` with a hand-written `UNION ALL` | Raw SQL would have to re-implement parameterisation and could not compose with the count query. Kept as the documented fallback with one named trigger: if the generated SQL is not a single statement, `research.md` R-2 says switch |
| `Concat` **before** `OrderBy`/`Skip`/`Take` | Ordering inside each branch | SQL Server drops a branch-level `ORDER BY`, and EF cannot translate `Skip`/`Take` inside a set operation. Written the wrong way round it still compiles and still returns rows |
| Offset paging | Keyset (cursor) paging | Keyset is the correct answer at tens of thousands of entries per ticket and changes the contract shape. Nothing asks for it, and the append-only feed makes offset paging drift-free (Q-2). Recorded as a known limitation, not as an oversight |
| Ascending page numbers, default = last page | Descending page numbers from the newest | Descending shifts every entry on each insert, so "load older" skips or repeats. The client is told which page it got, so it never has to compute one |
| `CommentAdded` excluded from the timeline projection | Included, de-duplicated in the client | Client de-duplication needs a stable link between the comment and its history row, and breaks when two comments share a millisecond. Excluding it in the query cannot break |
| `bit IsInternal` returned to **every** support user | Filtered server-side by role | BR-5.4 and A-2 say internal comments are visible to all support users and merely *marked*. Filtering now would be a rule nobody asked for, and the flag exists precisely so a future customer-facing view can exclude them without a data migration |
| `channel` bound as `string?` and validated | Bound directly to the enum | An unknown enum string makes `System.Text.Json` throw, which surfaces as a malformed-body `400` with an empty `errors` dictionary. AC-7 would technically pass with a `400` that tells the user nothing |

## Files to Create or Change

```text
src/Wasl.Domain/Tickets/TicketComment.cs
src/Wasl.Domain/Tickets/Ticket.cs                                        (AddComment)
src/Wasl.Domain/Tickets/TicketClosedException.cs                         (reuse if 012 added it)
src/Wasl.Api/Features/Tickets/AddComment/AddCommentEndpoint.cs
src/Wasl.Api/Features/Tickets/AddComment/AddCommentCommand.cs
src/Wasl.Api/Features/Tickets/AddComment/AddCommentHandler.cs
src/Wasl.Api/Features/Tickets/AddComment/AddCommentValidator.cs
src/Wasl.Api/Features/Tickets/AddComment/CommentResponse.cs
src/Wasl.Api/Features/Tickets/Timeline/GetTimelineEndpoint.cs
src/Wasl.Api/Features/Tickets/Timeline/GetTicketTimelineQuery.cs
src/Wasl.Api/Features/Tickets/Timeline/GetTicketTimelineHandler.cs
src/Wasl.Api/Features/Tickets/Timeline/TicketTimelineQuery.cs            the UNION ALL
src/Wasl.Api/Features/Tickets/Timeline/TimelineEntryResponse.cs
src/Wasl.Api/Common/Persistence/Configurations/TicketCommentConfiguration.cs
src/Wasl.Api/Common/Persistence/Migrations/*_AddTicketComments.cs
src/Wasl.Api/Common/Localization/Resources.ar.resx                       (4 keys)
src/Wasl.Api/Common/Localization/Resources.resx                          (4 keys)
src/wasl-web/src/features/tickets/TicketDetailPage.tsx                   (drawer + composer wiring)
src/wasl-web/src/features/tickets/TicketTimelineDrawer.tsx
src/wasl-web/src/features/tickets/TimelineEntry.tsx
src/wasl-web/src/features/tickets/CommentComposer.tsx
src/wasl-web/src/features/tickets/timeline.queries.ts
src/wasl-web/src/features/tickets/comment.schema.ts
src/wasl-web/src/lib/i18n/en/tickets.json                                (timeline + composer keys)
src/wasl-web/src/lib/i18n/ar/tickets.json
tests/Wasl.Domain.Tests/Tickets/TicketCommentTests.cs
tests/Wasl.Api.IntegrationTests/Tickets/AddCommentTests.cs
tests/Wasl.Api.IntegrationTests/Tickets/TicketTimelineTests.cs
tests/Wasl.Api.IntegrationTests/Tickets/TicketTimelinePagingTests.cs
src/wasl-web/src/features/tickets/__tests__/TimelineEntry.test.tsx
src/wasl-web/src/features/tickets/__tests__/CommentComposer.test.tsx
```

## Contract changes

First contract for this resource:
[`contracts/ticket-timeline-api.md`](contracts/ticket-timeline-api.md), frozen
2026-08-23. Nothing existed before it, so nothing is broken.

Two entries that are **not** changes to this contract but are changes it depends on,
both raised by this feature and owned elsewhere:

| Item | Owner | Task |
|---|---|---|
| `errors/ticket-closed` is a new `409` `type`. `docs/sdd/05-api-conventions.md` lists four `409` types and this is a fifth | `002-error-contract` owns the registry; the row is a docs edit | `DOC-013-04` |
| `docs/sdd/design/screens/04-ticket-detail.md` action 5 says a new comment is *prepended*. The feed is ascending, so it is **appended** and the view scrolls to it | Screen spec | `DOC-013-04` |

The heading stays even when empty — an empty contract-changes section is the statement
that the contract did not move.
