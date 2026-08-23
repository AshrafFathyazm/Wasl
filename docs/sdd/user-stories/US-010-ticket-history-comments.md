# US-010 — Ticket Timeline and Comments

**Epic:** EPIC-002 · **Release:** 1 · **Depends on:** US-005

## Story

As a **Support Agent**,
I want to **add comments and see everything that has happened to a ticket in order**,
so that **anyone picking it up has the full context**.

## Business value

This is what makes handover possible. Without it, every reassignment starts from
zero.

## Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | `POST /api/tickets/{id}/comments` adds a comment and returns `201` |
| AC-2 | An empty or whitespace-only body returns `400`; over 4000 characters returns `400` (BR-5.1) |
| AC-3 | Commenting on a `Closed` ticket returns `409` (BR-5.2) |
| AC-4 | A comment may be marked `isInternal` and is visually distinct in the UI (BR-5.4) |
| AC-5 | A comment may carry a `channel` to record how the interaction arrived (FR-3.3) |
| AC-6 | Adding a comment writes a `CommentAdded` history row that does not duplicate the comment body (BR-5.5) |
| AC-7 | `GET /api/tickets/{id}/timeline` returns comments and history merged, ordered by timestamp ascending (BR-5.7) |
| AC-8 | Each timeline entry carries its type, actor name, timestamp, and the fields relevant to that type |
| AC-9 | The timeline is paginated, defaulting to the 50 most recent entries with a load-older action |
| AC-10 | Comments cannot be edited or deleted through any endpoint (BR-5.3) |
| AC-11 | The timeline query does not issue a query per entry to resolve actor names |

## Rules referenced

BR-5.1 – BR-5.7, FR-3.3

## Out of scope

Editing and deleting comments, reactions, mentions, rich text, attachments, real-time
updates.

## Notes

The merge in AC-7 is the design question in this story. Two tables with different
shapes are being combined into one ordered feed. The plan must decide whether the
merge happens in SQL via a union or in memory after two queries, and must justify the
choice against the pagination requirement in AC-9 — the two interact, because
paginating a union is not the same as paginating two lists and interleaving them.

## Definition of Done

`09-definition-of-done.md`
