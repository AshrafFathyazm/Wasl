# 034 — Ticket Detail · BACKEND · summary

**Delivered** 2026-08-31 · Backend lane · 33 tests added
**Consumer:** `027-ticket-detail`, which was blocked on all six of these.

---

## 1 · What was built

**A customer can be the author of a comment** — `TicketComment` gains `AuthorKind` and
`AuthorCustomerId`, with three invariants in the domain and a check constraint behind them.

**The timeline splits** — `?type=Comments|History`, plus `commentCount` and `historyCount`.
The union is unchanged when the filter is omitted.

**Two fields the design renders and the API did not send** — `customer.companyName`,
`closedAtUtc`.

**`GET /api/tickets?customerId=`** — the rail's "this customer's other tickets".

**Tags** — `dbo.Tags`, `dbo.TicketTags`, `PUT`/`DELETE` sub-resources, an audit row each.

**Canned replies** — `dbo.CannedReplies`, `GET /api/canned-replies?category=`, seeded.

---

## 2 · The decision that shaped the whole feature

**`TicketComment.AuthorUserId` stays `NOT NULL`.**

The obvious way to let a customer author a comment is to make the support user optional. It is
also how a NULL actor gets back into `dbo.AuditLog` — the defect `011` found on
`TicketHistory.PerformedByUserId`, where every row ever written had no actor, nothing threw,
and the timeline would have said "someone" for every event.

The customer never signs in. A support user caused every one of these writes, so both people
go on the row: `AuthorCustomerId` is who it is **from**, `AuthorUserId` is who **recorded** it.
ADR-005 rejects filling the gap with a seeded "system" user, and nothing here does.

That choice propagates: the API returns `author` and `recordedBy` separately, the timeline
attributes the entry to the customer while naming the recorder, and the audit row names the
support user.

---

## 3 · Three defects this feature introduced, and what caught each

Full detail in `tests.md` §3. None reached a commit.

| Defect | Caught by | Would have shipped because |
|---|---|---|
| The generated migration backfills `AuthorKind = ''` then adds a constraint rejecting it | The integration suite, against real SQL Server | **It applies cleanly on a database with no comments** — every developer machine |
| `companyName` compiled and was null on every response | Reading the four projections, before any test | `dotnet build` reported 0 warnings; the default filled the fourth argument silently |
| The contract guard rejected an endpoint that *was* in the contract | `OpenApiContractTests` | The heading carried a query string, so the contracted path never matched the OpenAPI path |

**The second one is `027`'s recorded defect exactly** — *one mapper, three call sites, one of
them right*, where `assigneeName` went missing on both read paths. Fixed by **removing the
default** rather than by fixing four call sites: a required positional parameter turns the next
occurrence into a compiler error, four corrections leave the trap armed for the fifth.

### And a fourth, found by the suite after the code was written

Every tag attach returned `500`. `TicketTag` carries an actor column and I wrote on the entity
that it is stamped *"the same path `TicketComment.AuthorUserId` takes"* — **a sentence that was
true of the intent and false of the code.** The stamping in `SaveChangesAsync` matches by
**type**, not by a shared interface, so `TicketTag` was simply not in it and
`AttachedByUserId` stayed `Guid.Empty` until the foreign key refused it.

This is the second time this shape has bitten: `Customer` went six features unstamped because
the loop above it matches by *interface* and `Customer` does not implement it — and nothing
noticed until `007` served `"createdAtUtc":"0001-01-01T00:00:00"` as a fact. **A new entity
with an actor column needs a line in that method, and nothing tells you so except a failing
write.** Recorded in the code at the point of the fix.

---

## 4 · What reversed a previous ruling, and how it is recorded

**`013` merged comments and history into one feed deliberately**, and `CLAUDE.md` carries that
as a decision. The v3 design splits them; the product owner ruled for the split.

The reversal is written down in three places rather than edited away: the `TimelineFilter`
enum's own remarks, the contract's *Contract changes* table, and — the one that mattered most —
**the paragraph in `TimelinePage` that said "no total count either" was corrected, not
deleted.** Its argument was right for a single feed (a count nothing acts on) and its premise
changed (two tabs, each labelled with its total). The cost objection it raised is answered
rather than ignored: the counts are two constant `COUNT` queries, never a second pass that
grows with the page.

**The cursor does not change.** `CLAUDE.md`'s two-pagination-shapes rule stands — each tab
still grows at the end the reader is looking at, so neither gets a page number.

---

## 5 · Trade-offs

**Tag rules are in the handler, not a policy.** `034` Q-4 ruled anyone who may act on the
ticket may tag it. `ManagerOnly` on detach was the alternative and was turned down for BR-6's
measured reason: a policy runs before any handler, so a denial by policy writes **no audit
row** — `011` measured that — and a tag removed with no trace is worse than one anybody can
remove.

**Closed tickets can still be tagged.** BR-1.5 makes `Closed` terminal for the ticket's state
and for comments. A tag is filing, not work on the ticket, and reclassifying last month's
closed tickets is why the set exists. Stated in the handler, because the absence of the check
next to `AcceptComment`'s reads as an oversight otherwise.

**No FK from `TicketComment.AuthorCustomerId` to `dbo.Customers`.** The comment is a historical
record of who said something and must survive the customer row being merged or anonymised.
`AuthorUserId` keeps its FK because a support user is never hard-deleted. Two columns, two
lifetimes, two guarantees.

**Tags and canned replies have no admin screen.** `--seed` writes them; adding one is a
database action. Q-3's ruling, and the limitation is in the entity's own remarks rather than
discovered later.

---

## 6 · Known limitations, and what is open

| # | What | Owner |
|---|---|---|
| 1 | **Negative controls not run.** Three guards here have never been seen to fail, and CLAUDE.md is explicit that such a guard is unverified. `tests.md` §6 lists what to break and what should go red | **This feature — AC-18 not fully met** |
| 2 | **The `CK_TicketComments_AuthorKind` constraint has no test of its own.** The factory keeps the pair in step, so the constraint only matters for a writer that is not the factory — and nothing in the suite is one | This feature, named in `tests.md` §6 |
| 3 | **An intermittent failure in `007`'s duplicate-customer path.** One run returned a `409` with no `errors` object; 3/3 in isolation and every full run since have passed. `007`'s contract requires the two `409` paths to be indistinguishable, and intermittently they are not. Not reproducible from here, not this feature's | `007` |
| 4 | **Q-1 left unbuilt, deliberately.** The design's history shows *"**النظام** غيّر الحالة … بعد ردّ العميل"* — an automatic transition on a customer reply. That is a second writer of ticket status against BR-1's single map, and "النظام" is an actor ADR-005 rejects. It needs its own ruling | Open |
| 5 | **`--seed` not run end to end.** `ReferenceDataSeeder` is now driven by the integration fixture, so it is exercised — but the tag half has no reader asserting it, so those rows are written by code no test reads back | This feature, named |
| 6 | **`CLAUDE.md` lists `Domain/Communications/Interaction`, which has never existed.** The folder holds only `CommunicationChannel.cs`. Found while looking for a home for a customer's message (Q-5) | Corrected in this commit |

---

## 7 · Numbering

**This feature was written as `032` and renumbered to `034` before any commit.** Three
lanes each created a `specs/032-*` folder within minutes of each other —
`032-customer-screens`, `032-customers-list`, and this one. Mine moved because two others were
already there; I do not rename another lane's folder.

**`032-customer-screens` and `032-customers-list` still collide with each other.** That is
recorded here rather than resolved, and it is the same shared-tree hazard the
`git commit <paths>` line in `CLAUDE.md` was added for after `029`.
