# 026 — Tasks

**Feature:** `026-ticket-list` · **Lane:** Frontend only · **Approved:** 2026-08-29

Ordered. `FE-026-00` gates everything after it — nothing is wired until the preview is
reviewed (ADR-009, `docs/sdd/design/preview-first-workflow.md`).

Task IDs supersede the list half of `FE-010-*`, per `spec.md` §11.

## Phase 3b — before any wiring

| ID | Task | Depends on | Verified by | AC | Agent | Skill |
|---|---|---|---|---|---|---|
| `DOC-026-01` | Resolve the two token gaps the table needs — a header height and a table-scale avatar — in `docs/sdd/design/tokens.css` **first**, then mirror into `src/styles/tokens.css`. Never invented in a stylesheet (DESIGN-BRIEF rule 3) | — | Both files carry the same value and a citation | A-4 | — | — |
| `FE-026-00` | **The preview, in Arabic first.** 100 plausible rows, a 200-character Arabic subject, all nine columns, all five states, both languages, at 1280px. Native `<table>` — `Table` does not exist yet, and the geometry the preview produces is the geometry it will have | `DOC-026-01` | Rendered, screenshotted, **reviewed by the product owner** | AC-026-20, AC-026-03 (A-3) | — | `frontend-design` |

## Phase 4 — primitives and helpers

| ID | Task | Depends on | Verified by | AC | Agent | Skill |
|---|---|---|---|---|---|---|
| `FE-026-01` | `Table` primitive: header, row, hover, empty, loading skeleton, pagination footer. Skeleton rows at the real `--table-row-height` | `FE-026-00` | `/_preview` renders every state in isolation | AC-026-05, AC-026-18 | — | `frontend-design` |
| `FE-026-02` | `lib/formatters.ts` — `ar-u-ca-gregory-nu-latn`. Header names `014` as its owner | — | Unit test asserting Latin digits and a Gregorian year under `ar` | AC-026-14 | — | — |
| `FE-026-03` | `TicketListItem` in `api-types.provisional.ts`, transcribed from the frozen contract. `PagedResult<T>` reused, not redeclared | — | `npm run typecheck`, `npm run lint:types` | §7 | — | — |
| `FE-026-04` | `TicketStatusBadge` / `TicketPriorityBadge`, keyed on the **wire value**. The BR-1 colour map from `03-tickets-list.md` | `FE-026-03` | Component test asserting the map, and that Arabic changes no colour | AC-026-11, AC-026-12 | — | — |
| `FE-026-05` | Catalogue keys in `en` **and** `ar`, including the six `tickets:status.*`. No counted-noun string | — | `npm run lint:i18n` | AC-026-19 | — | — |

## Phase 5 — the screen

| ID | Task | Depends on | Verified by | AC | Agent | Skill |
|---|---|---|---|---|---|---|
| `FE-026-06` | `TicketListPage` — the only thing that fetches. `ticketKeys.list({page,pageSize})`, the object key from `010`'s guide | `FE-026-01`…`05` | Renders against the running API | AC-026-01, AC-026-02 | — | — |
| `FE-026-07` | `page` and `pageSize` in the URL; rows-per-page 10/20/50/100; the footer renders the **returned** values | `FE-026-06` | Component test plus a manual `?pageSize=500` | AC-026-03, AC-026-04 | — | — |
| `FE-026-08` | The five states, each distinct: loading · loaded · empty · past-the-end · error. Refetch dims, never re-skeletons | `FE-026-06` | Component tests, plus a manual run with the API stopped | AC-026-05…09 | — | — |
| `FE-026-09` | Row click navigates to `/tickets/:id`. **Q-1:** neutralise the `024` placeholder's heading, and keep the created-toast bound to navigation state — not to the presence of an id | `FE-026-06` | Component test: the placeholder with no navigation state shows **no** toast | Q-1 | — | — |
| `FE-026-10` | The cache gate: no `setQueryData` under `features/tickets/`, and `createdAtUtc` is rendered from the `GET` payload only | `FE-026-06` | A gate that is **watched failing** before it is trusted | AC-026-16 | — | — |

## Phase 6 — proof

| ID | Task | Depends on | Verified by | AC | Agent | Skill |
|---|---|---|---|---|---|---|
| `TEST-026-11` | Keyboard order through the table, visible focus rings, `<th scope="col">`, the unassigned label, the escalated meaning without colour | `FE-026-08` | Recorded in `tests.md` | AC-026-13, AC-026-15 | — | `chrome-devtools-mcp:a11y-debugging` |
| `TEST-026-12` | **The Arabic walk.** Column order, mirrored pagination chevrons, the escalate icon **not** mirrored, Gregorian dates with Latin digits | `FE-026-08` | Recorded in `tests.md`, including "nothing found" if that is the truth | AC-026-14 | — | — |
| `TEST-026-13` | Full gate run: `build`, `lint`, `lint:css`, `lint:i18n`, `lint:types`, `typecheck`, `test` | all | Output recorded, never asserted from memory | AC-026-21 | — | — |
| `DOC-026-14` | `summary.md` and `tests.md` | all | Present | Gate 6 | — | — |
