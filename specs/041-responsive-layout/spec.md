# 041 — Responsive layout (all pages)

**Lane** frontend only · **Source** product owner brief "P1 — Responsive layout", 2026-10-15
**Status** SPEC REVISED 2026-10-15 after product-owner review (§8). **Phase 1 approved, gated on `040` being implemented, verified and committed.** No 041 code, and no audit, before that. Commit / push gates unchanged.

Goal: every screen works on phone, tablet and desktop, in `en` (LTR) and `ar` (RTL).
No new endpoint, no contract change, no BR re-implemented. Overlaps `040` (design review
fixes) on table columns and ticket-detail width — see §6.

## 0. Findings from reading the code (before any change)

| Area | Finding | Consequence |
|---|---|---|
| Breakpoints | None exist as tokens. 8 `@media` literals across 8 files: 480, 700, 700, 768, 900, 900, 980, 1100 — all different. `useSidebarState.ts` hardcodes `COLLAPSE_BELOW=1100`, `DRAWER_BELOW=780` and carries a TODO saying so. CSS custom properties cannot be used inside `@media` conditions | Define one set (sm 640 · md 768 · lg 1024 · xl 1280) in ONE place, consumed by CSS (documented literals, guarded by a test) and by JS (`matchMedia` hook). Retire the 8 ad-hoc values or record why each stays |
| Sidebar | A **drawer mode already exists** (`Sidebar.module.css` `.drawer` / `.drawerOpen`, `drawerOpen` + `closeDrawer` in `useSidebarState`), below 780. Between 780–1100 it auto-collapses to 68px | Extend, do not rebuild. Brief wants drawer **below lg (1024)** and full sidebar + collapse button **at lg+**. That removes the 68px auto-collapse band; the user's own collapse toggle stays (Q-1) |
| Header | `Header.tsx` is 60 lines — not yet read for a hamburger or where the drawer opens from | Audit task |
| Table | `Table.tsx` 845 lines, `min-inline-size: 188px` cells, no card mode | Card layout is new: a slot on the primitive, or sibling list components (Q-3) |
| Dialogs | `Modal` and `SideSheet` exist; `SideSheet` already has a 768 rule | Bottom-sheet / full-screen under md is a CSS change in both |
| E2E | `playwright@^1.62.1` is a dependency but no config and no spec file exists | Smoke test needs a config, a dev server and a session (Q-4) |
| Tickets page | `TicketListPage.tsx` is one screen for `/tickets`, `/tickets/mine`, `/tickets/unassigned` | One card list serves all three |

Not yet read: every page's CSS beyond the above. **The audit (§2.1) is the first task and its
findings are written to `audit.md` BEFORE any CSS changes**, as the brief requires.

## 1. Breakpoints (one place)

| Name | Min width | Used for |
|---|---|---|
| sm | 640 | forms gain a column |
| md | 768 | table replaces cards; 2-col grids |
| lg | 1024 | persistent sidebar; two-column detail / new-ticket / dashboard pairs |
| xl | 1280 | KPI 4-up |

- `src/styles/breakpoints.ts` exports the four numbers and a `useMediaQuery()` / `useBreakpoint()` hook
  (`matchMedia` + `change` listener, not a resize loop).
- CSS cannot read a variable in `@media`; stylesheets use the literal and carry `/* bp: md */`.
  **`breakpoints.guard.test.ts`** scans every `*.module.css` and fails on a `@media` width literal that is
  not one of the four. Mobile-first (`min-width`) in anything touched.
- Logical properties only. `tokenReferences.test.ts` and `lint:tokens` stay green; no hard-coded
  colour, spacing or radius.

## 2. Work

1. **Audit** — Playwright script visits Dashboard, `/tickets`, `/tickets/mine`, `/tickets/unassigned`, `/tickets/:id`,
   `/tickets/new`, `/customers`, `/customers/:id`, `/customers/new`, `/customers/:id/edit`, `/login`,
   `/settings/branding`, `/settings/localization` at **360, 390, 768, 1024, 1280, 1440**, en + ar. Records
   horizontal overflow, clipped elements, targets under 44px, inputs under 16px. "Before" screenshots at 390 and 1024
   under `specs/041-responsive-layout/screens/before/`. Output: `audit.md` — issues listed, nothing fixed.
2. **Shell** — hamburger in the header; drawer below lg from the inline-start edge (mirrors in RTL), backdrop,
   closes on backdrop / Esc / route change, focus trap and focus restore, page behind inert, scroll lock;
   lg and up: current sidebar + collapse. Header title / breadcrumb truncates with an ellipsis. **New ticket**
   stays reachable below md (Q-2). Slide honours `prefers-reduced-motion`.
3. **Dashboard** — KPI grid 4 / 2 / 1 (xl / md / small; 2 compact at 390 only if nothing truncates — measured);
   chart + status, and attention + demand, side by side at lg and stacked below; chart follows its container
   width, fewer ticks on small screens, no overlapping labels; attention rows stack number + badge above the
   subject on mobile, no character truncation; team load 3 / 2 / 1; 7d/14d/30d wraps under the title.
4. **Tickets list** — md and up the table (P0 column fixes belong to `040`); below md a card list: subject (2-line
   clamp), number, customer, status + priority badge, assignee avatar, relative time, actions menu; the whole card
   is the link. Status tabs scroll horizontally, active tab scrolled into view; search and filter on one row, filter
   opens as a bottom sheet; pager below md shows prev / next + "page X of Y", rows-per-page never overflows.
5. **Ticket detail** — lg and up two columns; below lg one column ordered header → title / description →
   conversation, with ticket info collapsible; header actions wrap, "Take action" is an icon button below md;
   composer reachable and keyboard-safe (`dvh`, `visualViewport`); tabs scroll horizontally; "Newest first"
   moves under the tabs below md.
6. **New ticket** — lg and up form + Routing panel; below lg one column, Routing under the fields, no nested
   scroll; sticky Cancel / Create footer with `env(safe-area-inset-bottom)`; channel and priority pickers wrap
   to fit 360 with labels visible.
7. **Customers** — list: table at md+, card list below; detail, create and edit single column below lg.
8. **General** — touch targets at least 44x44; inputs at least 16px below md; `Anchored` popovers stay in the
   viewport and flip (checked in RTL); `Modal` / `SideSheet` full-screen or bottom sheet below md; long EN/AR
   strings wrap or ellipsise; reduced motion respected.
9. **Smoke test** — Playwright config + `e2e/responsive.spec.ts`: each main route at 390 and 1280, assert
   `document.documentElement.scrollWidth <= window.innerWidth` and main navigation reachable (visible at 1280;
   hamburger → drawer → link at 390). Script `test:e2e`; not part of `vitest run`.
10. **Docs** — `summary.md` listing before / after screenshots (390 and 1024, every page); `CLAUDE.md` Recent Changes line.

## 3. Constraints (CLAUDE.md)

Server state through TanStack Query at route level — the card list reuses the table's data, no second fetch.
No user-facing string in JSX outside the `en` + `ar` catalogues (new keys: open / close menu, "Details",
"Page X of Y", card labels). No global store (drawer state stays in the shell). No barrel files. No BR mirrored.
`shellLayout.test.ts` and other guards are updated narrowly with a control, never loosened. Every touched screen
is viewed in Arabic RTL.

## 4. Acceptance criteria

- AC-1 No horizontal page scroll at 360, 390, 768, 1024, 1280, 1440, en + ar, on every route in §2.1.
- AC-2 Breakpoints defined once; guard test goes red on a stray `@media` width literal (control: plant one, watch it fail).
- AC-3 Below lg the nav is a drawer: opens from the hamburger, enters from inline-start in LTR and RTL, closes on backdrop / Esc / route change, traps focus, restores focus.
- AC-4 At lg and up the sidebar and collapse button behave as today.
- AC-5 Below md, "New ticket" is reachable on every route.
- AC-6 `/tickets`, `/tickets/mine`, `/tickets/unassigned`, `/customers` render cards below md and the table at md+; a card is one link; one query feeds both.
- AC-7 Dashboard grids match §2.3 at each breakpoint; no overlapping chart tick labels at 360.
- AC-8 Ticket detail is single column below lg in the stated order; composer Send is visible with the keyboard open.
- AC-9 New-ticket footer is sticky below lg and clears the safe-area inset.
- AC-10 Interactive targets at least 44x44 and inputs at least 16px below md — measured by a script over the audit routes, report attached.
- AC-11 Popovers stay inside the viewport at 360 in en + ar.
- AC-12 Dialogs below md are full-screen or bottom sheets.
- AC-13 `prefers-reduced-motion: reduce` removes the drawer and sheet slide.
- AC-14 `tsc -b`, `eslint`, `lint:i18n`, `lint:tokens`, full `vitest run` green; smoke test green; before / after screenshots listed. Results recorded in `tests.md` as observed.

## 5. Out of scope

New business behaviour, backend, a new visual language, Arabic copy review (Q-8 of the project), widths below 360,
print styles, PWA chrome.

## 6. Overlap with `040` (not yet approved)

`040` items 1–2 (table columns and density), 13–15 (detail width, breadcrumb, sidebar active state), 21 (Routing
inner scroll) and 24 touch the same files. Recommended: **`040` first**, because the card list reuses its column
decisions. One feature in progress at a time — they must not run in parallel.

## 7. Open questions

- **Q-1 Sidebar bands.** Today: expanded at 1100+, auto-collapsed 780–1099, drawer below 780. Brief: drawer below 1024, full at 1024+. Confirm the 68px auto-collapse band is **removed** (tablet portrait gets the drawer) and the manual collapse still persists at lg+.
- **Q-2 New ticket below md.** Header icon button or floating action button? A FAB can cover the last card and the composer. Recommend the header icon button.
- **Q-3 Card list shape.** A card slot on the shared `Table` (one data path) or separate `TicketCardList` / `CustomerCardList`? Recommend the slot; `listParity.test.ts` already keeps list screens in step.
- **Q-4 E2E session.** Sign in through the real form against the compose DB (needs the backend and user-secrets running), or mock the API with `page.route`? Recommend mocked for the committed smoke test (deterministic), live DB for the audit run.
- **Q-5 Mobile filter.** Bottom sheet (SideSheet bottom variant) or full-screen panel? Recommend bottom sheet, max 85dvh.
- **Q-6 Ticket info on mobile.** Collapsible section above the conversation (default collapsed) or a "Details" tab? Recommend collapsible — the tab set is already three.
- **Q-7 Dashboard chart.** Hand-built SVG or a library? Decides ResizeObserver vs viewBox scaling; to be read in the audit.
- **Q-8 Spec number.** `041` assumed next free after `040`; confirm.

## 8. Product-owner review, 2026-10-15 — rulings and changes

**Sequencing.** `040` is implemented, verified and committed before any `041` code. Folder `specs/040-design-review-fixes/` exists (untracked, spec only) — `041` is a valid number.

### Answers

| Q | Ruling |
|---|---|
| Q-1 | **Yes.** 68px auto-collapse band removed. Drawer below lg; full sidebar at lg+. Manual collapse toggle and its persisted state stay at lg+ |
| Q-2 | Header icon button, same "+" icon as the sidebar button, `aria-label` + tooltip, target at least 44x44 |
| Q-3 | Slot on the shared `Table`, kept thin: optional `renderCard(row)` prop; switches table / cards with `useBreakpoint`. One data path, one query. Card markup lives in `TicketCard` / `CustomerCard` beside each page, **not** in `Table.tsx`. `matchMedia` read **synchronously on first render** (no table→cards flash); render **only one** of the two, never both with one hidden by CSS |
| Q-4 | Mocked API (`page.route`) for the committed smoke test; live DB for the audit run |
| Q-5 | Bottom sheet, max 85dvh, visible close button, Esc and backdrop close |
| Q-6 | Collapsible, default collapsed, with a one-line summary in the collapsed header (assignee avatar + name, category) |
| Q-7 | Decided in the audit. Hand-built SVG → `viewBox` scaling + tick count driven by container width; `ResizeObserver` only if tick logic needs pixel widths |
| Q-8 | `041` confirmed |

### Changes to the spec

**A. Container queries for page layouts; viewport breakpoints for the shell only.**
Viewport breakpoints (§1) control the shell: drawer vs sidebar, header. Page-internal layouts — detail two-column, new-ticket form + Routing, dashboard pairs, KPI grid, team load — respond to the width of the **main content area** (`container-type: inline-size` on the main region). Reason: at 1024 the full sidebar leaves about 780px for content, so "two columns at lg" would be cramped. Container thresholds are **set from content widths measured in the audit** (e.g. detail goes two-column only at a content area of 960px or more), not guessed here. This **supersedes** the "two-column at lg" wording in §2.3, §2.5, §2.6 and AC-7 to AC-9: read "lg" there as "the audited container threshold". The breakpoints file also exports the allowed container widths; `breakpoints.guard.test.ts` covers `@container` literals against that list.

**B. Guard test** accepts **both** `min-width` and `max-width` literals (range syntax too) from the allowed set — some existing rules may legitimately stay `max-width`. `summary.md` lists every ad-hoc value retired (480, 700, 700, 768, 900, 900, 980, 1100 today) and states why any remaining one stays.

**C. Phasing — report after each phase and stop for review.**

| Phase | Priority | Scope | AC |
|---|---|---|---|
| 1 | must | Audit at 390, 768, 1024, 1440 in en + ar for core routes: Dashboard, `/tickets`, `/tickets/:id`, `/tickets/new`, `/customers`, `/login`. Then: shell drawer (+ header "New ticket" button, breakpoints file + guard), tickets card list, single-column ticket detail with keyboard-safe composer, new-ticket single column with sticky footer, no horizontal scroll. **Playwright smoke test (AC-1 subset + navigation) ships here** | 1 (core routes), 2, 3, 4, 5, 6 (tickets), 8, 9 |
| 2 | should | Dashboard grids and chart ticks, customers card list + detail, mobile filter sheet, dialogs as sheets, popover flipping | 6 (customers), 7, 11, 12 |
| 3 | nice | Settings pages, the full 6-width audit, 44px / 16px measurement script, reduced motion, full before / after screenshot set | 1 (all routes), 10, 13 |

AC-14 applies at the end of every phase.

**D. AC-10 scope:** 44x44 measured on buttons, tabs, toggles, row actions, pagination and form controls. Inline text links inside paragraphs are excluded.

**E. Screenshots:** only 390 and 1024, **Arabic**, for each core route, before and after, are committed. All other captures stay out of git (`.gitignore` entry under `specs/041-responsive-layout/screens/`, with the committed subset whitelisted).

**F. Draft safety.** On mobile, opening or closing the drawer or a bottom sheet must not unmount or reset an unsaved composer draft. Verified by a test (type in the composer, open and close the drawer and the filter sheet, assert the text is intact) and in the browser. Consequence for design: the drawer and sheets render as siblings of the page tree (portal or fixed overlay), never by replacing or remounting the route content.

### New acceptance criteria

- AC-15 Page layouts switch on container width; a viewport-only `@media` rule inside a page module is a guard failure (control: plant one).
- AC-16 No table→cards flash: first render at 390 contains cards and no table, asserted in a test; never both in the DOM.
- AC-17 Composer draft survives opening and closing the drawer and the filter sheet (F).
- AC-18 Collapsed ticket-info header shows assignee avatar + name and category.

### Open

None blocking Phase 1. Container thresholds are an audit output, not a question.
