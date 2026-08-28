# `013-ticket-timeline-and-comments` — summary

Delivered 2026-08-28. **Backend.** The timeline UI (AC-17) belongs to the frontend lane.
Written for someone who was not present.

## What was built

| # | Thing |
|---|---|
| 1 | `TicketComment` — append-only, no update method, no delete. BR-5.3 as an absence rather than a check |
| 2 | `dbo.TicketComments` — `nvarchar(4000)` body, `CK_TicketComments_Body`, cascade from the ticket, `NO ACTION` to the author, `IX_TicketComments_Ticket_Time`. **No column default** |
| 3 | `POST /api/tickets/{id}/comments` — `201`, with `isInternal` and an optional `channel` |
| 4 | `GET /api/tickets/{id}/timeline` — the merged feed, cursor-paginated |
| 5 | `TicketTimelineQuery` in `Infrastructure/Queries/` — the second of the two named query classes `CLAUDE.md` sanctions |
| 6 | `Ticket.AcceptComment` (BR-5.2) and `TicketHistoryEntry.CommentAdded` (BR-5.5) |
| 7 | The comment's author stamped in `SaveChangesAsync`, beside the history actor `011` added |
| 8 | Three message keys, added **in the same commit as the keys** — the rule `004b` wrote down |

**378 tests, 0 warnings, run twice identically.** A feature about ordering is not proven by a
suite that passes once. Evidence and three negative controls: [tests.md](tests.md).

## Why it was built this way

### The tie is guaranteed, not contrived — and that is what `010` could not manage

`010` shipped a stable-sort guard and had to record it **unproven**: three attempts failed to
produce a tie, because six HTTP requests are six scopes and therefore six distinct instants.

Here every comment produces one. `IRequestTimestamp` memoizes the clock once per request, and
adding a comment writes two rows in that request — the comment and its `CommentAdded` history row
— so the two timeline entries carry a byte-identical timestamp. Deleting the tie-break turns a
test red.

**One result is worth more than the pass:** the test asserting *repeatability* did **not** go red
under that control. SQL Server returned the same order twice anyway on a small dataset, which is
exactly what `010` found. So the test that catches a missing tie-break is the one asserting a
**specific order**; the repeatability test earns its place by proving a tie exists at all, which
is what stops the order test passing on data that never tied.

### The cursor, and the defect it nearly shipped with

`spec.md` Q-B chose a `before` cursor over `010`'s page envelope: a ticket list grows at the end
the reader is not looking at, so page 2 stays page 2, while a timeline grows at the end they *are*
reading. Now recorded in `CLAUDE.md` under *API contract* as two deliberate shapes.

The first implementation ordered by `Id` and filtered the cursor by comparing the id **as text**.
SQL Server orders `uniqueidentifier` by a byte order of its own, which is not lexical — so an
entry sorted *after* the cursor by the `ORDER BY` and *before* it by the `WHERE`, and **appeared
on two consecutive pages**. Caught because AC-12's test asserts that no entry appears twice; a
test counting four entries per page would have passed.

The rule that came out of it, and the reason two of the three negative controls exist: **the
cursor must compare exactly the keys the sort orders by, in the same sequence.** Both directions
of that were broken deliberately and both produced a broken feed.

### `spec.md` A-4 was more specific than the first implementation

A-4 says ties break by **type then id**. The first version used id alone — deterministic, and
under-specified against its own spec, with the test hard-coding an arbitrary winner. Implemented
properly: a comment sorts before the `CommentAdded` row that records it. Substance before
bookkeeping.

### AC-18 — the reason this feature could prove something three older ones could not

`003` registered `TicketComment.Body` in `AuditRedaction` before any comment existed, so the rule
had **never once fired**. `013` is the first feature that can exercise it, and AC-18 does it by
searching every column of the audit row for a distinctive string rather than by reading the
redaction list.

It also asserts the row is **not empty** — a redaction that worked by writing nothing would pass
"the secret is absent" and prove nothing. The diff still names the entity and the field, with only
the value replaced by `[redacted]`. Confirmed against the live database as well as in the suite.

### Where each rule lives

| Rule | Where | Why |
|---|---|---|
| BR-5.1 (non-empty, ≤4000) | Validator | Shape. The boundary is the only place that can name the field |
| BR-5.2 (not on a closed ticket) | `Ticket.AcceptComment` | State. True for every caller, including a seeder or an importer |
| BR-5.3 (append-only) | The entity's shape | No update method, no delete endpoint. Writing one would require changing the entity first, which is a visible act |
| BR-5.5 (history records the event, not the text) | `TicketHistoryEntry.CommentAdded` | The row carries the comment's **id** — `spec.md` Q-1, so the client can link the two branches instead of rendering the event twice |
| BR-5.7 (the union, ascending) | `TicketTimelineQuery` | Neither table is on `IApplicationDbContext`; one named query class keeps the tie-break single |
| AC-15 (author from the token) | `SaveChangesAsync` | There is no field on the command or the request DTO a client could set — an absence, not a check |

### One `CHECK` kept, one default removed

`CK_TicketComments_Body` stays: it is a **constraint**, not a value the database computes
alongside the code, so `009`'s "does the database compute what the code computes" lesson does not
apply. Its cost is stated rather than hidden — reaching it is a `DbUpdateException` and therefore
a `500`, so the validator is what produces BR-5.1's `400`, and this is the guarantee of last
resort for a caller that is not the API.

`DF_TicketComments_Internal DEFAULT 0` goes, per `004` D-4. Here `false` and `0` agree, so it
would have been harmless today — and a value with two sources of truth that currently match is the
same defect waiting for one of them to move.

## Open

| # | What | Owner |
|---|---|---|
| 1 | **AC-14 has no test.** The actor name is resolved by a `JOIN` in both branches and no code path can loop, but nothing asserts the query count. Proving it needs a command interceptor counting round trips, which no test in this suite does for any feature | recorded, unowned |
| 2 | AC-17 — the timeline UI: distinct rendering per entry type, empty/loading/error states, and never `dangerouslySetInnerHTML` | frontend lane |
| 3 | A customer-facing view that excludes internal comments. `isInternal` exists so it needs no data migration when it comes | out of release |
| 4 | Timeline performance at volume — the largest ticket in any test has nine entries | future |
| 5 | `DOC-013-01`: the two new endpoints in `docs/sdd/documentation/api/` | open |

## A tool lied, and the Arabic was fine

A manual `Invoke-RestMethod` check stored an Arabic body as `?????` — the signature of `varchar`
under a non-Arabic collation, which ADR-013 calls the defect that reads as a font problem. It
looked like a real schema fault in a brand-new table.

It was the client: PowerShell 5.1 encodes a string request body as ASCII unless a charset is
named. The tell was in the same output — the author's name rendered correctly in the *response*,
from the same console, in the same request. Settled by asserting it through `PostAsJsonAsync`,
which sends UTF-8, in a test that now exists because the manual check was wrong.
