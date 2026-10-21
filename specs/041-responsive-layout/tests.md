# 041 — Tests (Phase 1, observed 2026-10-21)

Every number below was printed by the command beside it in this session. Nothing is quoted from memory.

## Runs

| Command (in `src/wasl-web`) | Result |
|---|---|
| `npx tsc -b` | clean |
| `npx eslint .` | clean (`e2e/**` gets Node + browser globals — the scripts hand functions to the page) |
| `npx stylelint "src/**/*.css"` | **2 errors, both pre-existing at `396f82c`** (`Sidebar.module.css:31 :global`, `Dashboard.module.css:961` range notation). The three this phase introduced were fixed. The Dashboard one goes with its Phase 2 migration |
| `npm run lint:tokens` / `lint:i18n` / `lint:select` / `lint:types` | clean · parity OK, 641 keys · clean · clean |
| `NODE_OPTIONS=--max-old-space-size=6144 npx vitest run --maxWorkers=3` | **69 files, 1489 tests passed** (the default run dies `Zone Allocation failed`) |
| `npm run test:e2e` | **✓ 24 page loads** — 6 core routes × 390/1280 × en/ar: no sideways scroll in the document or in `<main>`, navigation reachable, nothing threw, no unmocked request |
| `node e2e/audit.mjs` before / after | overflowing loads **8 / 48 → 0 / 48** (`audit.md`) |

## Acceptance criteria — Phase 1

| AC | Status | Evidence |
|---|---|---|
| AC-1 no sideways scroll (core routes) | **met at 390 / 768 / 1024 / 1440, en + ar, on the mock API** | `audit-after.results.json`; smoke test. 360 and settings pages are Phase 3 |
| AC-2 breakpoints named once | met | `breakpoints.ts`; `breakpoints.guard.test.ts` (7 tests). **Control run:** planting `@media (min-width: 1100px)` in `base.css` turned it red naming `styles/base.css … 1100px`; reverted, green |
| AC-3 drawer below lg | met in jsdom; **slide, backdrop and RTL side seen in a browser** (`_tickets.390.ar.drawer.png`: panel enters from the right) | `shell/drawer.test.tsx` (12 tests). **Control run:** removing the Tab branch of the trap turned the focus test red; restored |
| AC-4 sidebar and collapse at lg+ | met | `drawer.test.tsx` "at lg and up"; the 68px auto band is gone (`useSidebarState.ts`) |
| AC-5 New ticket reachable below md | met | header icon button, 44×44, named, titled; `drawer.test.tsx` |
| AC-6 table / cards, one query | met for `/tickets`, `/tickets/mine`, `/tickets/unassigned` and `/customers` | `tableCards.test.tsx` (9 tests: one of the two in the DOM, on the first render; measured width beats viewport). Customers' card list is a Phase 2 item brought forward because the table overflowed at 390 |
| AC-8 detail single column, composer reachable | **partly** | order, fold and wrapping seen in browser screenshots. The composer's action row is `position: sticky` and Send is above the fold; **not tested with a real on-screen keyboard** — no device and no `visualViewport` emulation was run |
| AC-9 new-ticket footer | **partly** | sticky already (it is outside the form's scroller); `env(safe-area-inset-bottom)` added with `viewport-fit=cover`. **Not seen on a notched device** — the inset is `0` in desktop Chrome |
| AC-15 container queries for page layout | met for detail and new-ticket | `breakpoints.guard.test.ts`; `newTicketLayout.test.ts` updated |
| AC-16 no table→cards flash | met in test | `tableCards.test.tsx` renders cards synchronously on the first render |
| AC-17 draft survives the drawer | met | `drawer.test.tsx` "does not lose an unsaved draft" — same DOM node, same value. Bottom sheets are Phase 2 |
| AC-18 collapsed info header | met | "Details · avatar + name · category" |
| AC-7, 10, 11, 12, 13, 14-full | **not Phase 1** | Phase 2 / 3 |

## Known gaps in what was verified

- **The mock API, not the real one.** The SQL Server container was down. Shapes were copied from `api-types.provisional.ts` and the vitest fixtures; a field the real server sends and the mock omits could change a layout.
- **Chromium only** (Playwright's bundled build, v151). No Safari, no Firefox, no real phone.
- `position: fixed` inside an inline-size container: **probed** (Chrome 151 does not capture it) — not checked in Safari.
