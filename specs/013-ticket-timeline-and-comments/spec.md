# 013 — Specification

**Phase:** 3 · **Story:** US-010 · **Feature:** `013-ticket-timeline-and-comments` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

## Understanding

A ticket that changes hands without context forces the next person to start again.
The timeline is the ticket's memory: every comment and every recorded change, in the
order it happened, in one feed.

The design question is that comments and history are two tables with different shapes
being presented as one ordered list — and that list has to paginate.

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

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | Comments and history belong in one feed, not two tabs | Two tabs would be simpler to build and worse to read; if the team disagrees, the merge disappears and the story shrinks |
| A-2 | Internal comments are visible to all support users | If some are restricted further, visibility becomes a per-comment rule |
| A-3 | 50 entries is a sensible page | Adjustable; the value is in one place |
| A-4 | Timeline order is by timestamp, and ties are broken by type then id | Without a tie-break, two entries in the same millisecond would order non-deterministically between requests |

## Open Questions

| # | Question | Working assumption |
|---|---|---|
| Q-1 | Should the history row for a comment carry the comment id? | Yes, so the client can link them and avoid rendering the same event twice |
| Q-2 | Should the timeline paginate oldest-first or newest-first? | Ordered ascending, but the **last** page is loaded first, because the newest entries are what a person reads on arrival |
| Q-3 | Does a **rejected** comment — the `409` on a closed ticket, or a `400` — write an audit row with `Outcome = Failed`? | No. BR-9.1 scopes a row to an operation that *changed* state, and BR-9.2 to authentication and authorization events; a business-rule rejection is neither. If the owner wants failed attempts recorded, the audit behaviour writes them centrally for every command and this feature inherits it with no change here. Raised during the spec-kit migration: ADR-008 postdates the original spec, and BR-9.4's word "failed" is genuinely ambiguous |

Q-1 and Q-2 are **resolved** in [`plan.md`](plan.md) and in [`research.md`](research.md)
(R-5 and R-4). Both working assumptions held, and the mechanism chosen for each is
recorded there rather than here. Q-3 is still open and carries the assumption above.

## Acceptance Criteria

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
| Author has been deactivated | Their name still renders; history does not disappear when a person leaves |

## Rules Referenced

BR-5.1 – BR-5.7, BR-6, BR-7.2, FR-3.3
