# US-016 — Dashboard

**Epic:** EPIC-002 · **Release:** 2 · **Depends on:** US-005, US-006, US-007, US-008

## Story

As a **Support Agent or Manager**,
I want **one screen that tells me what needs attention**,
so that **I start the day acting instead of searching**.

## Business value

Without it, "what should I do first?" is answered by scrolling a list. The screen turns
the queue into a set of decisions.

## Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | `GET /api/dashboard?range=7d\|14d\|30d` returns every block in one response |
| AC-2 | The first row is actionable metrics only — unassigned, escalated and open, oldest untouched, waiting on customer |
| AC-3 | An Agent sees their own figures; a Manager sees the team's. Same endpoint, filtered by role in the query |
| AC-4 | An Agent's response contains no team-load data at all — not hidden client-side |
| AC-5 | The daily series includes days with zero, produced by a generated date spine |
| AC-6 | Times are bucketed in the organisation's timezone, and the header states which |
| AC-7 | First-reply and resolution times are **medians**, computed with `percentile_cont` |
| AC-8 | The whole screen costs roughly six queries; an executed-command-count test asserts it |
| AC-9 | An empty system renders a first-run state, not a grid of zeros |
| AC-10 | A zero in any tile renders muted, never in the danger colour |
| AC-11 | Each card has its own skeleton at its real height, so nothing shifts on load |
| AC-12 | A failure renders one message with a `traceId`, not eight broken cards |
| AC-13 | Changing the range updates the URL and refetches |
| AC-14 | Every ticket subject shown carries `dir="auto"`; numbers use Latin digits |

## Rules referenced

BR-1 (status shape), BR-3 (escalation), BR-6 (role filtering), BR-8.13 (digits)

## Out of scope

CSV export · configurable widgets · date-range picker beyond the three presets · SLA
compliance (no SLA engine) · satisfaction scores (not collected) · an agent leaderboard.

## Notes

**Leaderboards are excluded deliberately.** Ranking agents by tickets closed rewards
closing, not resolving, and the fastest way up such a board is to close things that
should have stayed open.

## Definition of Done

`09-definition-of-done.md`
