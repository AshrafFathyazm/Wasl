# 040 — Design review fixes (24 items)

**Lane** frontend (backend only if Q-1 is answered "API") · **Source** design/UX review of the deployed app, 2026-10-15
**Status** SPEC ONLY — not approved, no code written.

Scope is the 24 numbered items of the review, in its P0 → P2 order. Each group ends with
`tsc -b`, `eslint`, full `vitest run`, and a browser check at 1440 and 1024 px, in `en` and `ar`.

## 0. Findings from reading the code (before any change)

| Item | Finding | Consequence |
|---|---|---|
| 3 counts | `TicketListPage.tsx` ~L300: five count queries (`TAB_STATUSES` + `Closed`), `allCount` = their **sum**, `openCount` = all − Closed. `TAB_STATUSES` = New, InProgress, PendingCustomer, Resolved — **`Open` is absent**, so the sum **omits every `Open` ticket**. The three numbers (17 / 22 / 27) are one defect: "All" is a sum of 4 of 6 statuses, the pager reads the server total. | Fixing item 4 (add `Open`) very likely fixes most of item 3. Verify by arithmetic against live data, not by assumption |
| 3 dashboard | "Open by status" sums the four non-Resolved statuses; "Team load" is assigned + unassigned over a possibly different set. Definition not yet read in the API handler | Needs the backend handler read before a definition is chosen (Q-1) |
| 5 medians | `DashboardView.tsx` ~L514 already returns `medians.none` at `sampleSize === 0 \|\| minutes === null` | Likely **already fixed**; deployed build may be stale. Only the muted "No data yet" line is unverified |
| 4 tabs | See above — real | Fix |

Items not yet inspected at file level: 1, 2, 6–2, 9–24. The plan reads each owning file first
and records anything already satisfied as "no change needed" rather than editing it.

## 1. Items and approach

**P0**
1. Table cell overflow — `Table` primitive cell: `min-inline-size:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap`, `title` with full value.
2. Table density — Subject flexible with ticket number as second line; Channel icon-only (tooltip + aria-label); Created relative ("11h"/"2d", full date in tooltip, localised via existing duration keys); Priority badge at body font size; no inner scroll; sticky header.
3. Counts — one definition per label, written in `docs/` and in a code comment: **All** = every ticket under the non-status filters (equals pager total); **Open** (wording) = New + Open + InProgress + PendingCustomer. Dashboard aligned to the same.
4. Add `Open` tab in dashboard status order; add `Closed` tab (count query for it already exists).
5. Medians — verify; add muted "No data yet" sub-line.

**P1 ticket detail** — 6 heading colour; 7 one composer with mode switch (Reply to customer / Internal note), amber internal mode, mode-specific Send label, keep channel selector + char limit; 8 mode-dependent helper; 9 sort control one line; 10 skeleton for messages; 11 reason tooltips from the real rules (BR-1 map, `canEscalate`, merge/extend unbuilt); 12 full number + status badge + link; 13 wider layout, larger conversation column; 14 breadcrumb; 15 sidebar active state on `/tickets/:id`.

**P1 dashboard** — 16 empty-state for sparse chart; 17 hide zero channels (or one muted "Other channels: 0"); 18 `dir="auto"` on name only, count in fixed end slot; 19 "Pending customer".

**P1 new ticket** — 20 channel labels; 21 remove Routing inner scroll; 22 Priority Normal selected on load.

**P2** — 23 `dir="auto"` + `text-align:start` on free-text cells via shared component; 24 aria-labels on logo link, collapse button, user menu, four KPI links; verify collapsed sidebar.

## 2. Constraints (from CLAUDE.md)

Semantic tokens only (guard: `tokenReferences.test.ts`); logical CSS properties; no string in JSX outside the `en`+`ar` catalogues; no BR re-implemented client-side (item 11 reads `allowedTransitions`/`canEscalate`, never recomputes); no new global store; no barrel files. Existing guards (`shellLayout.test.ts`, `dashboardGuards.test.ts`, `rowActions.guards.test.ts`, `newTicketLayout.test.ts`) will probably go red on legitimate changes — each is updated narrowly with its control, not loosened.

## 3. Acceptance criteria

- AC-1 No overlapping text in the tickets table at 1024 px and wider, EN and AR; Subject shows ≥ 20 chars at 1024 px.
- AC-2 On `/tickets` with no filter, All-tab count === pager `totalCount`, asserted in a test and observed live.
- AC-3 Tab order matches the dashboard status list; `Open` and `Closed` present.
- AC-4 Dashboard open total, team-load total and tickets-page open count agree, or each is labelled with its definition.
- AC-5 Detail page has exactly one Send control; mode changes label, helper, treatment.
- AC-6 Every disabled "Take action" item has a tooltip derived from server data or a stated unbuilt reason.
- AC-7 Every interactive element named in item 24 has an accessible name, asserted by role query.
- AC-8 Typecheck, lint, full vitest green; per-item report fixed / partial / not fixed.

## 4. Open questions

- **Q-1 Counts: frontend only, or backend too?** The review asks both to "agree". Pure frontend fix covers the tabs/pager; the dashboard's "17 assigned · 5 unassigned" vs "18 open" may be a backend definition difference (e.g. Resolved counted as assigned). Recommend: frontend first, read the dashboard handler, change the API only if the numbers still disagree — which would be a contract change recorded in `020`'s plan.
- **Q-2 Item 7 scope.** Full consolidation touches `TicketDetailPage` and `TicketMessagesPanel` and two endpoints (`013` comments, `021` messages) behind one UI. Recommend full consolidation; the fallback in the brief is "visually distinct".
- **Q-3 Item 13/14.** Breadcrumb and wider layout change the shared `AppShell`/`Header` used by every route. OK to change the shell, or detail-page only?
- **Q-4 Item 2 relative time.** "11h" in Arabic needs new catalogue keys and a decision on abbreviations (ساعة vs س). Q-8 (who writes Arabic copy) is still open — OK to use the existing `duration.*` keys, unabbreviated in Arabic?
- **Q-5 Spec number.** `040` assumed next free; confirm.
