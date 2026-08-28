# 013 — Specification

**Phase:** 3 · **Story:** US-010 · **Feature:** `013-ticket-timeline-and-comments` · **Status:** reconciled against delivered code 2026-08-28, **awaiting review**

---

## Reconciliation — what is already true under this spec

Written 2026-08-23, before `004`, `009`, `011` and `012` existed. Unlike `009`'s and `011`'s,
this folder's `data-model.md` is **accurate** — it attributes `dbo.SupportUsers` to `004` and
`dbo.TicketHistory` to `009` correctly. One name is wrong, and five things it could only assume
have since become facts.

### Corrected

| # | Says | Actually |
|---|---|---|
| 1 | The history index is `IX_TicketHistory_Ticket_Time` | It is **`IX_TicketHistory_Ticket`**, on `(TicketId, PerformedAtUtc)` — same columns, different name. Corrected in `data-model.md`. The same class of error as `011`'s: an index named in a document and not in the database, so advice about it points at nothing |

### Now true, and each one changes what this feature can prove

| # | What | Why it matters here |
|---|---|---|
| 2 | `TicketHistoryEventType.CommentAdded` already exists, from `009` | **No enum change and no migration on the history side.** The only new object is `dbo.TicketComments` |
| 3 | `AuditRedaction` already lists `TicketComment.Body` **and** `TicketComments.Body`, from `003` | The rule is built and has **never once been exercised**, because no comment has ever existed. `013` is the first feature that can prove BR-9.7's entity-qualified redaction actually fires rather than merely being registered — a guard that has never been seen to work has not been verified. **New AC-18** |
| 4 | `dbo.SupportUsers` exists, from `004` | AC-14's single join to resolve `actorName` is possible at all. Before `004` the timeline would have rendered every actor as blank |
| 5 | `TicketHistory.PerformedByUserId` is **stamped**, since `011` | It was NULL on every row ever written until 2026-08-28. Had `013` been built first, the timeline would have said "someone" for every historical event and looked like a UI defect. `011` found it because it asserted the actor rather than the row |
| 6 | `003`'s `AuditBehaviour` writes an independent row for **every** throwing `IAuditableCommand` | **Q-3 answers itself, and against its own working assumption.** The spec assumed a rejected comment writes no audit row. It does: `AuditOutcomeClassifier` returns `Failed` for a `409` on a closed ticket and the row is written outside the transaction. The spec's own note predicted this — *"the audit behaviour writes them centrally for every command and this feature inherits it with no change here"* — so Q-3 is **closed as inherited**, not as decided |

---

## The tie-break this feature can actually prove

AC-10 requires entries in the same instant to order deterministically. `010` shipped the same
kind of guard and had to record it as **unproven**: three attempts failed to produce a tie,
because six HTTP requests are six scopes and therefore six distinct instants.

**Here a tie is guaranteed by construction.** `IRequestTimestamp` memoizes `GetUtcNow()` once per
request (`009` AC-9), and adding a comment writes two rows in one request — the comment and its
`CommentAdded` history row. **Every single comment produces two timeline entries with a
byte-identical timestamp**, one from each branch of the union.

So the ordering rule is not decoration here: without it, a comment and its own history row swap
places between two identical requests. And unlike `010`, deleting the tie-break makes a test go
red. That is recorded as the negative control this feature owes.

---

## In Scope

Adding a comment, optionally internal and optionally carrying a channel; the merged
timeline; pagination; append-only enforcement; the timeline UI.

## Out of Scope

| Excluded | Reason |
|---|---|
| Editing or deleting a comment | BR-5.3 — the audit value depends on immutability |
| Reactions and mentions | No requirement |
| Rich text and formatting | Plain text is sufficient and avoids a sanitisation surface |
| Attachments | Out of scope project-wide |
| Real-time updates | No requirement; polling on focus is enough |
| Customer-visible view | No customer login exists |
| A **role rule** on who may comment | BR-5 has none. Any authenticated support user may comment on any open ticket, including one assigned to someone else — deliberately, because a colleague adding context is the point of the feature. Stated because the absence of a rule beside `011`'s four is a decision, not an oversight |
| Redacting an internal comment from any API response | BR-5.4 says internal comments are visible to **all support users** and marked distinctly. There is no customer-facing surface to hide them from, and `isInternal` exists so that one can be added later without a data migration |

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | Comments and history belong in one feed, not two tabs | Two tabs would be simpler to build and worse to read; if the team disagrees, the merge disappears and the story shrinks |
| A-2 | Internal comments are visible to all support users | If some are restricted further, visibility becomes a per-comment rule |
| A-3 | 50 entries is a sensible page | Adjustable; the value is in one place |
| A-4 | Timeline order is by timestamp, and ties are broken by type then id | **No longer an assumption — a guaranteed condition.** See *The tie-break this feature can actually prove* |
| A-5 | **The timeline is a query, so it needs no `IApplicationDbContext` change** | `TicketHistory` is deliberately **not** exposed on that interface (`009`), and `TicketComments` will not be either. `CLAUDE.md` sanctions `TicketTimelineQuery` in `Infrastructure/Queries/` as one of only two named query classes, which is exactly the escape hatch this needs. If it were built in `Wasl.Application` instead, the interface would have to grow two `IQueryable`s and the reason for the named-query rule would be lost |
| A-6 | **The write path needs no new abstraction.** `POST /comments` adds two rows through `IApplicationDbContext.Add` in one `SaveChanges`, inside the transaction the pipeline opens | Same shape as `009` and `011`. If it needed anything more, the transaction boundary would be the thing to question, not this feature |

## Open Questions

| # | Question | Working assumption |
|---|---|---|
| Q-1 | Should the history row for a comment carry the comment id? | Yes — in `NewValue`, so the client can link them and avoid rendering the same event twice. Resolved in `plan.md` R-5 |
| Q-2 | Oldest-first or newest-first? | Ordered ascending, last page first. Resolved in `research.md` R-4 |
| ~~Q-3~~ | ~~Does a rejected comment write an audit row?~~ | **CLOSED — it does, and not by this feature's choice.** `003`'s `AuditBehaviour` writes a `Failed` row for every throwing `IAuditableCommand`, outside the transaction. Reconciliation row 6 |
| **Q-A** | **Is this one feature or two?** The timeline is a **read** over data that already exists. Comments are a **write**: a new table, a new endpoint, a migration, BR-5.1–BR-5.5, and the first exercise of `003`'s redaction rule. They are very different in size | **One feature, both halves.** They share the tie-break, the actor join and the `CommentAdded` row, and a timeline with nothing but history rows in it is a weaker demonstration than one with a conversation in it. Splitting would also mean building the union twice — once against one branch, once against two. **This needs a ruling: the timeline alone is roughly a third of the work** |
| **Q-B** | **What pagination shape?** AC-12 says "the 50 most recent entries with a load-older action". `010` froze `{ items, page, pageSize, totalCount, totalPages }` and `CLAUDE.md` records it as *the* pagination response | **A `before` cursor, not the page envelope** — `GET /timeline?before=<cursor>&limit=50`. A timeline grows at the end a user is reading, so page 2 shifts every time someone comments, and "load older" on a page number silently skips or repeats entries. `CLAUDE.md`'s envelope is right for a ticket **list**, which is stable and jumpable. **A ruling is needed because it is a second pagination shape in one API**, and that is a real cost — the frontend gets two patterns to learn and `015` will have to pick one |
| **Q-C** | `data-model.md` specifies `DF_TicketComments_Internal DEFAULT 0` on `IsInternal`, and a `CHECK` constraint on the body | **Drop the default; keep the check.** `004` D-4 removed every column default in this codebase after `001`'s `Customers.IsActive DEFAULT 1` proved the failure — EF applies a database default whenever the property holds the CLR default. For `bool` that is `false`, which here happens to *equal* the default, so it is harmless today and is still a second source of truth for one value. The `CHECK` is different: it is a constraint rather than a computed value, and it stays as the guarantee of last resort — with the cost stated, that a body reaching it is a `DbUpdateException` and therefore a `500`, so the validator remains the thing that produces the `400` |
| Q-D | Does an entry need to say **which** of the two tables it came from? | Yes — a discriminated `type` on every entry (`Created`, `StatusChanged`, `Assigned`, `Unassigned`, `Escalated`, `CommentAdded`, `Comment`). The client renders each differently, and inferring the kind from which fields are populated is a rule living in the renderer |

## Acceptance Criteria

AC-18 is **added** by this reconciliation. Nothing is renumbered.

| # | Criterion |
|---|---|
| AC-1 | `POST /api/tickets/{id}/comments` adds a comment and returns `201` |
| AC-2 | An empty or whitespace-only body returns `400` (BR-5.1) |
| AC-3 | A body over 4000 characters returns `400` (BR-5.1) |
| AC-4 | Commenting on a `Closed` ticket returns `409` with `errors/ticket-closed` (BR-5.2) |
| AC-5 | `isInternal` is stored and returned, and the UI marks such comments distinctly (BR-5.4) |
| AC-6 | An optional `channel` is stored and returned (FR-3.3) |
| AC-7 | An invalid channel value returns `400` |
| AC-8 | A `CommentAdded` history row is written in the same transaction and does not contain the comment body (BR-5.5) |
| AC-9 | `GET /api/tickets/{id}/timeline` returns comments and history merged, ordered by timestamp ascending (BR-5.7) |
| AC-10 | Entries in the same instant order deterministically and identically across repeated requests |
| AC-11 | Each entry carries its type, actor name, timestamp, and the fields relevant to that type |
| AC-12 | The timeline paginates, defaulting to the 50 most recent entries with a load-older action |
| AC-13 | No endpoint exists to edit or delete a comment (BR-5.3) |
| AC-14 | The timeline query does not issue a query per entry to resolve actor names (AC-11 depends on this being cheap) |
| AC-15 | `authorUserId` comes from the token, never from the request body |
| AC-16 | An unknown ticket id returns `404` |
| AC-17 | The timeline UI renders comment and history entries distinctly, and handles empty, loading, and error states |
| **AC-18** | **The comment body appears in no column of any `dbo.AuditLog` row** — asserted by writing a comment whose body is a distinctive string and then searching **every column** of the resulting row for it, not by reading the redaction list. `003` built `AuditRedaction` with `TicketComment.Body` in it and nothing has ever exercised it, so this criterion is what turns a registered rule into a verified one (BR-9.7, BR-5.5) |

## Edge Cases

From `testing/edge-cases.md`: empty and whitespace-only body, boundary length,
unicode, unknown enum, unknown id, closed ticket, no token, empty list, slow API.

Specific to this story:

| Case | Expected |
|---|---|
| A ticket with history but no comments | The timeline renders history only, and is not an empty state |
| A brand-new ticket | Exactly one entry: `Created` |
| Comment body containing HTML or a script tag | Stored as-is, rendered as text. Never `dangerouslySetInnerHTML` |
| Two comments in the same millisecond | Deterministic order via the tie-break (AC-10) |
| **A comment and its own `CommentAdded` row** | **The same case, and it happens on every comment** — one request, one memoized instant, two rows. This is what makes AC-10 provable rather than hypothetical |
| Author has been deactivated | Their name still renders; history does not disappear when a person leaves |
| **A history row whose `PerformedByUserId` is NULL** | Renders without an actor rather than blank-and-broken. `--seed` writes such rows legitimately — it has no authenticated user — so the demo database contains them and the UI meets them on day one |
| **A comment body of exactly 4000 characters** | Accepted. 4001 is `400`. The column is `nvarchar(4000)`, so an off-by-one here is silent truncation by SQL Server rather than an error |

## Rules Referenced

BR-5.1 – BR-5.7, BR-6, BR-7.2, BR-9.7 (the redaction this feature is the first to exercise),
FR-3.3, ADR-008 (why `TicketHistory` and `dbo.AuditLog` are two tables), ADR-013 (SQL Server).
