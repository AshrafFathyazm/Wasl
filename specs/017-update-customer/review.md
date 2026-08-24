# US-003 — Review

**Phase:** 6 · **Role:** Review · **Status:** Not started

Scope: this story's blast radius, not the whole system.

## Blocking Issues

| # | File | Issue | Required change |
|---|---|---|---|

Marking everything blocking makes the review useless. Blocking means the story cannot
ship.

## Non-Blocking Improvements

| # | File | Suggestion |
|---|---|---|

## Missing Tests

| Rule or AC | What is missing |
|---|---|

## Acceptance Criteria Status

| AC | Met / Not met / Partial | Note |
|---|---|---|

## Boundary Check

| Check | Result |
|---|---|
| Domain logic outside endpoints and components | |
| Domain has no infrastructure dependency | |
| DTOs at the boundary, not entities | |
| Every new index justified | |
| No query inside a loop | |
| `CancellationToken` threaded through | |

## Security Notes

Against `testing/security-checklist.md`.

## Scope Check

Anything built that is not in `spec.md`.

## Verdict

`Approved` / `Changes Required`
