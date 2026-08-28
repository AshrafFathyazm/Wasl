# `013-ticket-timeline-and-comments` — test evidence

**Scope:** the backend. The timeline UI (AC-17) belongs to the frontend lane.

**Run:** 2026-08-28, Windows 11, .NET 10.0.200 SDK, SQL Server 2022 via `Testcontainers.MsSql`
(one container for the suite), plus the `docker compose` container for the live verification.

```text
dotnet build --no-incremental      0 Warning(s)   0 Error(s)
dotnet test --no-build

Wasl.Domain.Tests            Failed: 0   Passed: 177   Total: 177
Wasl.Application.Tests       Failed: 0   Passed:  17   Total:  17
Wasl.Api.IntegrationTests    Failed: 0   Passed: 184   Total: 184
                                         ─────────────────────────
                                         Passed: 378   Total: 378
```

355 before. `013` added 23. **Run twice in a row, identically green** — this feature's whole
subject is ordering, and a suite that passes once is not evidence about an order.

---

## Acceptance criteria → named tests

All in `TicketTimelineTests` unless noted.

| AC | Test | Result |
|---|---|---|
| AC-1 | `A_comment_is_created_and_names_the_author_from_the_token` | pass |
| AC-2 | `An_empty_body_is_refused` (3 cases: empty, spaces, tabs/newlines) | pass |
| AC-3 | `Four_thousand_characters_is_accepted_and_four_thousand_and_one_is_not` | pass |
| AC-4 | `A_closed_ticket_accepts_no_comment` | pass |
| AC-5 | `A_comment_is_created_...` · `The_timeline_merges_both_branches_in_ascending_order` | pass |
| AC-6 | `A_comment_is_created_...` (`channel: WhatsApp` stored and returned) | pass |
| AC-7 | `An_invalid_channel_is_refused` | pass |
| AC-8 | `The_history_row_carries_the_comment_id_and_not_its_body` | pass |
| AC-9 | `The_timeline_merges_both_branches_in_ascending_order` | pass |
| AC-10 | `Entries_sharing_an_instant_order_identically_on_every_request` | pass |
| AC-11 | `The_timeline_merges_both_branches_in_ascending_order` (per-branch fields) | pass |
| AC-12 | `Load_older_returns_the_previous_page_without_skipping_or_repeating` | pass |
| AC-12 | `The_limit_is_clamped_never_rejected` (3 cases: 0, −5, 5000) | pass |
| AC-13 | `No_endpoint_edits_or_deletes_a_comment` | pass |
| AC-14 | **not directly asserted** — see *Not claimed* | — |
| AC-15 | `An_author_in_the_body_has_nowhere_to_arrive` | pass |
| AC-16 | `An_unknown_ticket_is_not_found_on_both_endpoints` | pass |
| AC-17 | **NOT BUILT** — the timeline UI. Frontend lane | — |
| **AC-18** | `The_comment_body_reaches_no_column_of_the_audit_row` | pass |

Beyond the criteria:

| Test | What it holds down |
|---|---|
| `Arabic_in_a_comment_body_round_trips` | `nvarchar` end to end — see *A tool lied* below |
| `A_new_ticket_shows_only_its_creation` | One entry, and not an empty state |
| `An_actorless_history_row_renders_a_name` | `--seed` writes rows with no actor; the UI meets them on day one |
| `A_corrupt_cursor_returns_the_newest_page` | A stale stored cursor sends the reader to the top, not to a `400` |
| `Both_endpoints_refuse_an_unauthenticated_caller` | The fallback policy, on `013`'s two new endpoints |

---

## AC-18 — the criterion that turns a registered rule into a verified one

`003` put `TicketComment.Body` and `TicketComments.Body` into `AuditRedaction` before any comment
existed. **Nothing had ever exercised it.** `013` is the first feature that can, and the assertion
searches **every column** of the audit row for a distinctive string rather than reading the
redaction list — reading the list only proves the list says what it says.

Verified in the test, and then again against the live database:

```sql
SELECT COUNT(*) FROM dbo.AuditLog
WHERE CAST(Changes AS nvarchar(max)) LIKE '%SECRET-BODY-MUST-NOT-REACH-AUDIT-9931%'
   OR EntityLabel LIKE '%SECRET-BODY%'
-- Hits: 0
```

And the row is **not empty**, which is the half a weaker assertion would miss — a redaction that
worked by writing nothing at all would pass "the secret is absent" and prove nothing:

```text
Action              Outcome  EntityType  EntityLabel       Changes
Ticket.CommentAdded Success  Ticket      TCK-2026-000005   [{"entity":"TicketComment",
                                                             "field":"AuthorUserId", ...},
                                                            {"entity":"TicketComment",
                                                             "field":"Body",
                                                             "before":"[redacted]"...
```

The diff still records that the entity changed and which field; only the value is replaced.

---

## Negative controls — three, on the one thing this feature is about

### Control 1 — the tie-break deleted (`ThenByDescending(IdText)` removed)

```text
Failed: 1, Passed: 22   →  The_timeline_merges_both_branches_in_ascending_order
```

**This is what `010` could not achieve.** `010` shipped the same kind of stable-sort guard and had
to record it as **unproven**: three attempts failed to produce a tie, because six HTTP requests are
six scopes and therefore six distinct instants.

Here the tie is guaranteed by construction. `IRequestTimestamp` memoizes the clock once per
request, and adding a comment writes two rows in one request — so **every comment produces two
timeline entries with a byte-identical timestamp**. Confirmed live:

```text
CommentAdded   2026-08-28T12:19:53.821Z   منى العتيبي
Comment        2026-08-28T12:19:53.821Z   منى العتيبي
```

**And one result worth recording precisely:** `Entries_sharing_an_instant_order_identically_on_
every_request` did **not** go red under this control. With the tie-break gone, SQL Server still
returned the same order twice on a small dataset — exactly `010`'s finding. So the test that
catches a missing tie-break is the one asserting a **specific order**, not the one asserting
**repeatability**. The repeatability test earns its place by asserting that a tie exists at all,
which is what stops the order test passing on data that never tied.

### Control 2 — the type rank removed from the sort, while the cursor still compares it

```text
Failed: 2, Passed: 21   →  The_timeline_merges_both_branches_in_ascending_order
                           Load_older_returns_the_previous_page_without_skipping_or_repeating
```

### Control 3 — the inverse: the sort keeps the rank, the cursor drops it

```text
Failed: 1, Passed: 22   →  Load_older_returns_the_previous_page_without_skipping_or_repeating
```

Controls 2 and 3 are the two directions of one rule: **the cursor must compare exactly the keys
the sort orders by, in the same sequence.** Either half alone produces a feed that skips or
repeats entries, which is the defect a cursor exists to prevent.

All three reverted, rebuilt with `--no-incremental`, re-ran: 378/378, twice.

---

## Defects found by running

### The cursor repeated an entry across two pages

The first implementation ordered by `Id` and filtered the cursor with
`string.Compare(row.Id.ToString(), ...)`. **SQL Server orders `uniqueidentifier` by a byte order
of its own, which is not the lexical order of the same value as text** — so an entry could sort
*after* the cursor by the `ORDER BY` and *before* it by the `WHERE`.

```text
Did not expect olderIds to intersect with {...} because no entry appears on two pages,
but found the following shared items {01a04853-85a1-7948-b3b3-7dee4da5db5d}.
```

Caught by AC-12's test asserting that **no entry appears on two pages**. A test that only checked
each page had four entries would have passed — and the reader would have seen one comment twice
and never seen another.

Fixed by projecting the id as text once, into `IdText`, and using that single value as both the
sort key and the cursor key. Controls 2 and 3 above exist because of this.

### `spec.md` A-4 says ties break by **type then id**; the first implementation used id alone

Found when the merge-order test went red after the `IdText` fix changed which side of the tie won.
Both orders were deterministic, so the code was not wrong so much as **under-specified against its
own spec** — and the assertion was hard-coding one arbitrary winner.

Implemented properly: a comment sorts before the `CommentAdded` row that records it, within the
instant they share. Substance before bookkeeping. The cursor carries all three keys.

### A `500` from the union — `Unable to cast object of type 'System.String' to type 'System.Int32'`

Two enum columns are stored as `nvarchar` by a value converter. A `UNION ALL` aligns branches by
**column position** and requires one type per position — but only one branch has a real column to
read, and the other supplies a literal `null` that EF typed from the CLR enum rather than from the
converted column. SQL Server returned `nvarchar` where the reader expected `int`.

Nothing in the exception mentions a union. Fixed by projecting `.ToString()` on both sides so the
column type is unambiguous at the source, and parsing in the mapper.

### `Invalid object name 'TicketComments'` — the development database, not the code

The migration had not been applied to the compose database. The integration suite migrates its own
container and was unaffected; the manual check was not. Recorded because the error names a table
and looks like a mapping fault.

---

## A tool lied, again — and the Arabic was fine

A manual check with `Invoke-RestMethod` posted an Arabic comment body and the database came back
holding `?????`. That is the signature of `varchar` under a non-Arabic collation, which ADR-013
names as the defect that reads as a font problem — so it looked like a real schema fault in a
brand-new table.

It was the client. **PowerShell 5.1 encodes a string request body as ASCII unless a charset is
named**, so the mangling happened before the request left the machine. The tell was in the same
output: the author's name `منى العتيبي` rendered correctly in the *response*, from the same console,
in the same request.

Settled by asserting it through a tool that is not suspect — `PostAsJsonAsync`, which sends UTF-8 —
in `Arabic_in_a_comment_body_round_trips`, which passes on the way out and again through the
timeline. The column is `nvarchar(4000)`, which is the half that would have failed had it been the
server.

Sixth entry for `CLAUDE.md`'s list of tools that produced a well-formed report about nothing.
The rule it confirms is the one already written there: **verify a measurement with something below
it.**

---

## Verified live, against the compose container

```text
POST /api/tickets/{id}/comments   201
      author = منى العتيبي / Manager    isInternal = True    channel = WhatsApp

GET  /api/tickets/{id}/timeline   200
Created        2026-08-27T21:35:14.190Z  System         -> New
StatusChanged  2026-08-27T21:35:14.238Z  System         New -> Open
StatusChanged  2026-08-27T21:35:14.279Z  System         Open -> InProgress
StatusChanged  2026-08-27T21:35:14.315Z  System         InProgress -> Resolved
Comment        2026-08-28T12:19:53.821Z  منى العتيبي     ...
CommentAdded   2026-08-28T12:19:53.821Z  منى العتيبي     -> 01a0484f-f15e-7eda-...
hasMore = False
```

Three things in that output are the feature working rather than incidental:

- The four seeded rows show **`System`**, because `--seed` runs with no authenticated user and
  their `PerformedByUserId` is legitimately null. The demo database contains them, so the UI meets
  them on its first render — which is why the query supplies a name rather than a blank.
- The last two share a timestamp **to the millisecond**. That is the tie, live.
- The `CommentAdded` row's value is the comment's **id**, not a word of its text (BR-5.5).

---

## Deviations from the specification

| # | Spec says | Built | Reason |
|---|---|---|---|
| D-1 | `data-model.md`: `DF_TicketComments_Internal DEFAULT 0` | No column default | `004` D-4's house rule. Here `false` and `0` agree, so it is harmless **today** — and a value with two sources of truth that currently match is the same defect waiting for one to move. `001`'s `Customers.IsActive DEFAULT 1` is the case where they did not, and undoing it needed a migration. Approved as Q-C |
| D-2 | `data-model.md`: the history index is `IX_TicketHistory_Ticket_Time` | It is `IX_TicketHistory_Ticket` | Same columns, wrong name; corrected in `data-model.md`. `011` hit the identical class of error |
| D-3 | AC-12: "the 50 most recent entries with a load-older action" | A `before` cursor, not `010`'s page envelope | Approved as Q-B, and now recorded in `CLAUDE.md` under *API contract* as **two deliberate shapes**: an envelope for stable, jumpable lists, a cursor for feeds that grow at the point the reader is looking. `015` takes the envelope |
| D-4 | — | `TimelinePage` carries `hasMore` and no `totalCount` | Counting a union costs a second pass over both tables to produce a number nothing acts on: there is no page picker, because there are no pages. One row of lookahead answers the only question the UI asks |

## Not run, and therefore not claimed

| What | Why |
|---|---|
| **AC-14** — that the query issues no per-entry lookup | The actor name is resolved by a `JOIN` in both branches and there is no code path that could loop, but **nothing asserts the query count**. Proving it needs a command interceptor counting round trips per request, which no test in this suite does for any feature. Stated rather than implied — this is the one AC in `013` with an argument behind it and no test |
| AC-17 — the timeline UI | The frontend lane owns it |
| A page boundary landing exactly between a comment and its own `CommentAdded` row | The cursor compares all three sort keys and controls 2 and 3 prove both directions, but the specific boundary was not constructed |
| Timeline performance at volume | The largest ticket in any test has nine entries |
| An internal comment hidden from anyone | BR-5.4 says internal comments are visible to **all** support users. There is no customer-facing view to hide them from, and `isInternal` exists so one can be added later without a data migration |
