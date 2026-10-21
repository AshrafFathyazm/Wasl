# 041 — Summary, Phases 1 and 2 (2026-10-21)

**Status** Phases 1 and 2 implemented, **not committed**. Phase 3 not started — the brief says to stop for review.
Full evidence is in `audit.md` and `tests.md`.

## What was built

| Area | Change |
|---|---|
| **Breakpoints** | `styles/breakpoints.ts` (sm 640 · md 768 · lg 1024 · xl 1280, plus container widths), `lib/useMediaQuery.ts` (`useBreakpoint`, and `useAtLeastWidth` for an element's own width), `breakpoints.guard.test.ts`. All eight old widths retired (480, 700 ×2, 900 ×2, 980, 1100, plus 768 re-spelled); `LEGACY_WIDTHS` is empty |
| **Shell** | Drawer below **lg (1024)** from the inline-start edge, backdrop, Esc / close button / route change, focus trap and focus return, `inert` page, `visibility: hidden` when closed (out of the tab order), reduced-motion. Hamburger (`IconMenu`, new) and a 44px **New ticket** icon button in the top bar below md. The automatic 68px rail is gone. Side padding 16 / 24 / 56 by breakpoint; breadcrumb collapses to the current page on a phone |
| **Tickets list** | `Table` takes `renderCard`; `TicketCard` below the table's own width (measured, not the viewport). Tabs 44px and scrolled into view, search + Filter shrink onto one row, pager becomes ‹ Page X of Y › on a phone |
| **Ticket detail** | One column below a container width of 880: header → title/description → **Details** (collapsed, summary = assignee + category) → conversation. Unbroken text wraps. Tabs never wrap, "Newest first" drops under them, composer action row sticky, mode switch 44px |
| **New ticket** | Two columns by container (880), single column below; footer clears the safe area; `viewport-fit=cover` |
| **Customers list** | `CustomerCard` below the table's width; toolbar no longer overflows (done in Phase 1 because the table overflowed 82px at 390) |
| **Login** | Stacks below 780 for the first time. The container moved from `.screen` to `.page` (a container query cannot style its own container) |
| **Forms** | 16px field floor below md (iOS zoom), one rule in `base.css` |
| **Tests** | `e2e/` (mock API, audit, smoke, screenshot helper), `drawer.test.tsx`, `tableCards.test.tsx`, `breakpoints.guard.test.ts`; the test setup now has a width-aware `matchMedia` (desktop by default) |

## Phase 2 — what was built

| Area | Change |
|---|---|
| **Dashboard** | Grids answer to the dashboard's own width (`@container dash`): KPI 2-up, 4-up from 1000px of content; the 1.6:1 pair from 760px, stacked below. "Needs attention" rows stack on a phone — number, badge and age on one line, the subject under them at full width and free to wrap (it was cut to eight characters). Chart ticks were already width-aware: checked at 30 days / 360px, every fourth label, no overlap |
| **Customer profile** | Container `profile`: the contact strip stacks, the two columns go side by side from 880px. The breadcrumb + screen switcher row wraps (the switcher's second segment was clipped off the screen) |
| **Filter panel** | Below md it is a **bottom sheet**: backdrop, a title row, a 44px close button, 85dvh with its own scroll, safe-area inset. **Escape now closes it at every width** (it had no keyboard exit) |
| **Dialogs** | `Modal` is a bottom sheet below md (full width, 90dvh, slide-up, 44px close, safe area); `SideSheet` was already full-page — its close is 44px and its breakpoint is `< 768` so it no longer claims exactly 768. `Toast` is edge to edge below md. All honour reduced motion |
| **Popovers** | **Found by measuring, not by reading:** the composer's template menu is 316px wide and hangs from a button in the middle of the action row, so at 360px it ran 18px off the screen (right edge in English, left in Arabic). Below md its anchor is now the action row. `e2e/popovers.mjs` opens 12 menus (take-action, status, templates, tags, assignee, the `Dropdown` primitive) in both languages at 360 and 390: **all inside the viewport**. **Control:** the same script was red on the template menu before the fix |
| **Guard** | `LEGACY_WIDTHS` is now **empty** — every width in every stylesheet is a named one. `npm run test:e2e` runs the smoke test and the popover check |

## Decisions I made that you should check

1. **The table/card switch is the element's width (760px), not the viewport's md.** At a 1024px viewport the sidebar and frame leave ~620px, so a viewport rule would have drawn the cramped table the audit found at 768. This is a deviation from "md and up: the table" in the brief.
2. **Detail and new-ticket go two-column at a content width of 880px**, i.e. a ≥1280px screen with the sidebar open. At 1024 they are single-column. This follows spec §8.A; it means a 1024 desktop gets the stacked layout.
3. **The drawer is below 1024 for tablets too** (Q-1 as ruled): an iPad in portrait has a hamburger, not a rail.
4. **`position: fixed` in an `inline-size` container**: probed in Chrome 151 (not captured), not in Safari.
5. Brought `CustomerCard` and the customers toolbar fix forward from Phase 2 because the smoke test went red on them.
6. `IconMenu` added to the icon module (73 → 74 exports); it is labelled (D) like the others the document does not contain.

## Not done / limits

- **AC-10 (44px / 16px)** — 7–42 controls per page are still under 44px (see `audit.md`); Phase 3.
- **No real keyboard, notch or touch device** — AC-8's keyboard-open behaviour and AC-9's inset are implemented, not observed.
- **Mock API** — the live-DB audit was impossible (Docker down).
- **Chromium only.**
- The two stylelint errors that predate this work are untouched.

## Screenshots (`screens/`, Arabic, committed)

`before/` and `after/` for `login`, `dashboard`, `tickets`, `ticket-detail`, `ticket-new`, `customers` at **390** and **1024**
(`<route>.<width>.ar.png`).
