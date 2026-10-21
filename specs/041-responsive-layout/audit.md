# 041 — Audit (Phase 1, 2026-10-21)

Run with `src/wasl-web/e2e/audit.mjs` against the **mock API** (`e2e/mockApi.mjs`) — Docker and the
SQL Server container were not available, so the live-DB audit Q-4 asked for was **not** done.
Core routes (Dashboard, `/tickets`, `/tickets/:id`, `/tickets/new`, `/customers`, `/login`) at
**390, 768, 1024, 1440**, in `en` and `ar` — 48 page loads each way. Raw numbers:
`audit-before.results.json`, `audit-after.results.json`. Screenshots at 390 and 1024, Arabic:
`screens/before/` and `screens/after/` (the only ones committed, spec §8.E).

"Before" is commit `396f82c` (the tip of `040`), measured in a throwaway worktree with the same scripts.

## Method note — the first audit lied

The first run reported **no overflow on any of 48 loads**, next to screenshots of a clipped table.
The shell is `100dvh; overflow: hidden` and scrolls **inside `<main>`**, so
`documentElement.scrollWidth` can never see a page that is too wide. The audit and the smoke test now
measure `main.scrollWidth - main.clientWidth` as well. Re-measured: **8 of 48 "before" loads overflow.**

## What was actually wrong (before)

| # | Finding | Evidence |
|---|---|---|
| 1 | **Login never stacked.** `@container login { .screen { flex-direction: column } }` styles the container itself, which a container query cannot do — every mobile rule for `.screen` matched nothing, since the card was built. At 390 the panel and the form sat side by side, ~150px each | `before/login.390.ar.png`; `main +71` (en) / `+36` (ar) |
| 2 | **No navigation on a phone below 780px except a 3-dot "more" icon**, and a collapse toggle clipped against the left screen edge (`IconMore` stood in for a hamburger) | `before/*.390.ar.png`, top-left |
| 3 | **Between 780 and 1100 the sidebar auto-collapsed to a 68px rail** — a tablet in portrait got a rail beside a 700px content area (Q-1: removed) | `useSidebarState.ts` (`COLLAPSE_BELOW=1100`) |
| 4 | **56px frame on every side** (`--content-padding`) and a 56px header end padding at every width: 112 of 390px spent on margin; the header title was pushed off its own edge | `AppShell.module.css`, `Header.module.css` |
| 5 | **Tickets table at 390 and 768**: seven columns, Subject cut to 3 characters, Status and Priority overlapping. At 1024 with the full sidebar the content area is ~620px, so a *viewport* test ("md = table") still drew a cramped table | `before/tickets.390.ar.png` |
| 6 | **Ticket detail**: the rail (assignee, customer, facts) came *before* the title and conversation, and one unbroken token in a description widened the page **538px** past the screen (`main +538`) | `before/ticket-detail.390.en.png` |
| 7 | **Customers at 390 (ar)**: table clipped, the Filter button pushed off the screen by a fixed 320px search field (`main +82`) | `before/customers.390.ar.png` |
| 8 | **Two-column breakpoints answered to the viewport** (`@media 980`, `@media 1100`) while the content area is 288px+112px narrower — "two columns at 1024" meant a rail beside a ~330px conversation | `TicketDetail.module.css`, `CreateTicket.module.css` |
| 9 | Eight different `@media` widths in eight files; two more hard-coded in `useSidebarState` | `breakpoints.ts` header |
| 10 | Tabs 32px tall, pager buttons 34px, mode switch 30px, header menu button 32px — below 44 | measured, see the targets column below |

Not a defect, measured: **the dashboard already fits at 390** (2-column KPI cards, bars, no overflow). Its grids
and chart ticks are Phase 2.

## Before → after (390 and 1024, both languages)

Overflow = the document **or** `<main>`. Targets / fields = counts of controls under 44×44 / form fields under 16px.

| route | w | lang | overflow before | overflow after | targets<44 before→after | fields<16 before→after |
|---|---|---|---|---|---|---|
| login | 390 | en | main +71 | none | 5 → 4 | 3 → 1 |
| login | 1024 | en | none | none | 4 → 4 | 3 → 3 |
| dashboard | 390 | en | none | none | 21 → 17 | 0 → 0 |
| dashboard | 1024 | en | none | none | 20 → 20 | 0 → 0 |
| tickets | 390 | en | none | none | 43 → 19 | 1 → 0 |
| tickets | 1024 | en | none | none | 39 → 41 | 1 → 1 |
| ticket-detail | 390 | en | main +538 | none | 22 → 7 | 1 → 0 |
| ticket-detail | 1024 | en | main +284 | none | 18 → 19 | 1 → 1 |
| ticket-new | 390 | en | none | none | 18 → 13 | 3 → 0 |
| ticket-new | 1024 | en | none | none | 17 → 17 | 3 → 3 |
| customers | 390 | en | none | none | 18 → 8 | 1 → 0 |
| customers | 1024 | en | none | none | 17 → 15 | 1 → 1 |
| login | 390 | ar | main +36 | none | 5 → 4 | 3 → 1 |
| login | 1024 | ar | none | none | 4 → 4 | 3 → 3 |
| dashboard | 390 | ar | none | none | 21 → 17 | 0 → 0 |
| dashboard | 1024 | ar | none | none | 20 → 20 | 0 → 0 |
| tickets | 390 | ar | none | none | 43 → 19 | 1 → 0 |
| tickets | 1024 | ar | none | none | 39 → 41 | 1 → 1 |
| ticket-detail | 390 | ar | main +21 | none | 22 → 7 | 1 → 0 |
| ticket-detail | 1024 | ar | none | none | 18 → 19 | 1 → 1 |
| ticket-new | 390 | ar | none | none | 18 → 13 | 3 → 0 |
| ticket-new | 1024 | ar | none | none | 17 → 17 | 3 → 3 |
| customers | 390 | ar | main +82 | none | 18 → 8 | 1 → 0 |
| customers | 1024 | ar | none | none | 17 → 15 | 1 → 1 |

**Overflowing page loads: 8 / 48 → 0 / 48.** `npm run test:e2e` (24 loads: 6 routes × 390/1280 × en/ar) passes.

## Open after Phase 1 (measured, not fixed)

- **Touch targets (AC-10, Phase 3).** Still 7–42 controls under 44px per page — the dashboard (17 at 390), the ticket list's
  filter bar, ticket detail's header chips and rail buttons, form fields at 40px. Tabs, pager buttons, the header menu
  and New-ticket buttons, the mode switch and the drawer close button were brought to 44. Most of the rest are 24–32px
  icon buttons inside dense rows.
- **Form fields under 16px** at 1024+ is by design (the 16px floor is `< md`); at 390 only the login screen's remaining field fails (1).
- Dashboard grids and chart ticks, the filter bottom sheet, dialogs as sheets, popover flipping — Phase 2.
- Widths 360 and 1440 for every route, settings pages — Phase 3 (1440 and 768 were audited for the core routes only).

## Container thresholds decided from the audit (spec §8.A)

| Name | px | Measured basis |
|---|---|---|
| `split` (detail, new-ticket) | 880 | At 1280 the full sidebar (288) and the 56px frame (112) leave **880** — the first width where a 292px rail beside a 520px conversation is not cramped. At 1024 the content area is **624**; with the sidebar collapsed, **844** — still single column |
| `table` (list screens) | 760 | The seven ticket columns need ~760px to keep Subject readable; at a 1024 viewport the content area is ~620, so the list is cards there, which a viewport "md" rule would have missed |
| `login` | 780 | The reference's own value, unchanged — it just applies now |
