# US-010 — Technical Plan

**Phase:** 2 · **Role:** Architecture · **Status:** Complete

## Design Summary

Comments and history stay in separate tables — they have genuinely different shapes —
and are merged into a single ordered feed by a SQL `UNION ALL` over a common
projection. Merging in the database rather than in memory is what makes AC-12
pagination correct.

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

## Backend

| Layer | Component | Responsibility |
|---|---|---|
| Domain | `TicketComment` | Owned entity; validates the body per BR-5.1 |
| Domain | `Ticket.AddComment(...)` | Rejects on a closed ticket; appends both the comment and the `CommentAdded` history row |
| Application | `AddCommentCommand` / `Handler` | Validates, calls the domain, saves |
| Application | `GetTicketTimelineQuery` / `Handler` | The union query, paged, with actor names joined once |
| Application | `TimelineEntryDto` | The common shape, with a discriminating `entryType` |
| Infrastructure | `TicketCommentConfiguration` | Columns, lengths, `(TicketId, CreatedAtUtc)` index |
| Infrastructure | `TimelineQuery` | The raw or LINQ-composed `UNION ALL`, isolated in one class |
| API | `TicketsController.AddComment`, `.GetTimeline` | Bind, delegate, map |

The union lives in one infrastructure class rather than being composed in the handler,
so that the one piece of provider-shaped SQL in the codebase is in a predictable place.

## Data Changes

Migration: `AddTicketComments`

| Index or constraint | Query or rule it serves |
|---|---|
| `ix_ticketcomments_ticket_time` on `(TicketId, CreatedAtUtc)` | The timeline union's comment side |
| FK `TicketId` → `Tickets`, cascade | Comments die with the ticket |
| FK `AuthorUserId` → `SupportUsers`, restrict | An author who has left is still displayable |

`ix_tickethistory_ticket_time` already exists from US-005 and serves the other side.

## API Contract

| Method | Path | Request | Success | Failures |
|---|---|---|---|---|
| `POST` | `/api/tickets/{id}/comments` | `{ body, isInternal?, channel? }` | `201` + the comment | `400`, `401`, `404`, `409` closed |
| `GET` | `/api/tickets/{id}/timeline` | `?page&pageSize` | `200` + paged entries | `401`, `404` |

Timeline entry shape:

```json
{
  "entryType": "Comment" | "History",
  "occurredAtUtc": "…",
  "actorName": "…",
  "comment": { "body": "…", "isInternal": false, "channel": "Email" },
  "history": { "eventType": "StatusChanged", "oldValue": "New", "newValue": "Open", "note": null }
}
```

Exactly one of `comment` and `history` is populated. A discriminated shape rather
than a flat one with nullable fields from both, so the client can narrow on
`entryType` and TypeScript can enforce it.

## Frontend

| Component | Purpose |
|---|---|
| `TicketTimeline` | Renders the feed; distinct treatment per entry type |
| `CommentComposer` | Body, internal toggle, optional channel |
| `TimelineEntry` | Narrows on `entryType` and delegates |

The composer is hidden entirely on a closed ticket rather than disabled, because a
disabled control invites the question of how to enable it. The `409` is still handled,
since the ticket may close between load and submit.

## Localization Impact

| Item | Detail |
|---|---|
| New client strings | Composer labels, the internal-comment badge, the load-older action, the empty state, and one sentence per `TicketEventType` |
| New server messages | `Validation.CommentBody.Required`, `Validation.CommentBody.TooLong`, `Error.TicketClosed` |
| History rendering | Each history row is rendered from its `eventType`, `oldValue`, and `newValue` into a translated sentence with placeholders. The stored values stay canonical English; the sentence around them is translated |
| Formatting | Timestamps through `formatters.ts`; relative times, if used, need Arabic plural forms |
| User content | Comment bodies are the most likely place for mixed-language text in the whole product. `dir="auto"` per entry, not per feed |
| Not translated | `TicketHistory.OldValue` and `NewValue` are stored canonically, so a timeline written while the interface was English still renders correctly in Arabic (BR-8.7) |

That last row is the reason BR-8.7 exists. Had status values been stored translated,
the timeline would be a mix of languages reflecting whatever each agent had selected at
the time, and it could never be rendered consistently again.

## Test Strategy

| Level | Covered | Why here |
|---|---|---|
| Unit | Body validation; `AddComment` rejected on a closed ticket; both rows appended | Domain behaviour |
| Integration | AC-1 – AC-8, AC-15, AC-16 | HTTP contract |
| Integration | Merge order, including the same-instant tie-break | The union is the risk in this story |
| Integration | Pagination correctness across the union boundary — a page that spans both sources | The specific failure mode of a badly merged feed |
| Integration | Executed-command count for the timeline | AC-14 |
| Frontend | Distinct rendering per entry type; script content rendered as text; empty state | AC-17 and the XSS surface |

## Dependencies

US-005 (tickets and history), US-008 (status changes give the timeline something
interesting to show, though not a hard dependency).

## Risks and Trade-offs

| Decision | Alternative | Why rejected |
|---|---|---|
| SQL `UNION ALL` | In-memory merge then page | Would load every row of both tables to return one page |
| Two tables | One polymorphic `TicketEvent` table | Comments and history have different lifecycles and different shapes; a single table would be mostly nulls, and the comment body would sit in an audit table |
| History row excludes the comment body | Include it | Two sources of truth for the same text, which drift the moment either is touched |
| Discriminated entry shape | Flat shape with nullable fields | The client could not narrow safely, and every render would need defensive checks |
| Composer hidden on a closed ticket | Disabled | A disabled control implies a path to enabling it; there is none |
| Plain text only | Rich text | Rich text needs sanitisation, and an unsanitised rich-text field is a stored XSS vulnerability |

## Files to Create or Change

```text
src/Wasl.Domain/Tickets/TicketComment.cs
src/Wasl.Domain/Tickets/Ticket.cs                      (AddComment)
src/Wasl.Application/Tickets/AddComment/AddCommentCommand.cs
src/Wasl.Application/Tickets/AddComment/AddCommentHandler.cs
src/Wasl.Application/Tickets/Timeline/GetTicketTimelineQuery.cs
src/Wasl.Application/Tickets/Timeline/TimelineEntryDto.cs
src/Wasl.Infrastructure/Persistence/Configurations/TicketCommentConfiguration.cs
src/Wasl.Infrastructure/Persistence/Queries/TimelineQuery.cs
src/Wasl.Infrastructure/Migrations/*_AddTicketComments.cs
src/Wasl.Api/Controllers/TicketsController.cs
src/wasl-web/src/features/tickets/TicketTimeline.tsx
src/wasl-web/src/features/tickets/TimelineEntry.tsx
src/wasl-web/src/features/tickets/CommentComposer.tsx
tests/Wasl.Domain.Tests/Tickets/TicketCommentTests.cs
tests/Wasl.Api.IntegrationTests/Tickets/AddCommentTests.cs
tests/Wasl.Api.IntegrationTests/Tickets/TicketTimelineTests.cs
```
