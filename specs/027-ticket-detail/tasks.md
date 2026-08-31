# 027 — Tasks

**Feature:** `027-ticket-detail` · **Lane:** Frontend only · **Approved:** 2026-08-31

Ordered. `FE-027-00` gates everything after it — nothing is wired until the preview is
reviewed (ADR-009, `docs/sdd/design/preview-first-workflow.md`).

Task IDs supersede the detail half of `FE-010-*`, as `026` superseded the list half.

**Four frozen contracts, not one.** `009` owns the ticket shape, `011` the assignee, `012`
the status, `013` comments and the timeline. A task that reads one contract and assumes
the rest is how a field goes missing — each row below names the one it is bound to.

## Phase 3b — before any wiring

| ID | Task | Depends on | Verified by | AC | Agent | Skill |
|---|---|---|---|---|---|---|
| `FE-027-00` | **The preview, in Arabic first.** 100 timeline entries, a 200-character Arabic subject, thirteen variants, both languages, at 880 and 1152 | — | Rendered, measured in a browser, **reviewed by the product owner** | AC-11 | — | `frontend-design` |
| `DOC-027-01` | Revise `docs/sdd/design/screens/04-ticket-detail.md` **from** the approved preview — kept regions, replaced regions, and the measured rules | `FE-027-00` | The document names every departure with its reason | AC-11 | — | — |

**Both delivered 2026-08-31.** `FE-027-00` is `src/wasl-web/src/dev/TicketDetailPreview.tsx`
at `/_preview/ticket-detail`; `DOC-027-01` took the design document from 102 lines to 260.
Three findings came out of rendering it and are carried in the document, not here:
`overflow-anchor: none`, the 700px breakpoint, and the one-`bdi`-per-value rule.

`027/spec.md` Q-3 and Q-5 were corrected in the same pass — both rested on "there is no
detail-screen design document", and there was one.

## Phase 4 — types, keys, helpers

| ID | Task | Depends on | Verified by | AC | Agent | Skill |
|---|---|---|---|---|---|---|
| `FE-027-02` | `TicketDetail`, `TimelineEntry`, `TimelinePage`, `SupportUser` in `api-types.provisional.ts`, transcribed from the four frozen contracts. `assignee` is **nullable with the key present**; `assignedToUserId` stays and is not read | — | `npm run lint:types`, `npm run typecheck` | §7 | — | — |
| `FE-027-03` | `ticketKeys.detail(id)` and `ticketKeys.timeline(id)` beside `026`'s `ticketKeys.list`. One key factory, never a literal array at a call site | `FE-027-02` | Grep: no `queryKey: ['ticket'` outside the factory | AC-1 | — | — |
| `FE-027-04` | `tickets.api.ts` — `getTicket`, `getTimeline({before,limit})`, `addComment`, `changeStatus`, `changeAssignee`, `getSupportUsers`. **`getSupportUsers` parses a bare array**, not an envelope | `FE-027-02` | Unit test that an object body is a parse failure, not an empty list | AC-7 | — | — |
| `FE-027-05` | Catalogue keys in `en` **and** `ar` — every string the preview holds, including `tickets:timeline.*`, `tickets:comment.*`, the three `expectedVersion` outcomes, and the picker's deactivated-assignee sentence | — | `npm run lint:i18n` | AC-10 | — | — |
| `FE-027-06` | Reuse `TicketStatusBadge` from `026`. **No second BR-1 colour map** — the preview holds a copy only because it has no i18n provider, and it does not ship | `FE-027-05` | Grep: one `STATUS_TONE` under `src/`, in `TicketBadges.tsx` | AC-1 | — | — |

## Phase 5 — the screen

| ID | Task | Depends on | Verified by | AC | Agent | Skill |
|---|---|---|---|---|---|---|
| `FE-027-07` | `TicketDetailPage` at `/tickets/:id`, replacing `024`'s placeholder. **The only thing that fetches.** Header, subject, summary strip, description | `FE-027-03`, `FE-027-04` | Renders against the running API | AC-1 | — | — |
| `FE-027-08` | The timeline feed: cursor-paged, oldest→newest, `load earlier` at the top, `overflow-anchor: none` plus the `useLayoutEffect` correction | `FE-027-07` | Component test that a prepend leaves the same entry at the same offset | AC-3 | — | — |
| `FE-027-09` | The composer — body, `isInternal`, optional `channel`. Hidden **entirely** when `Closed`, not disabled | `FE-027-07` | Component test asserting the composer is absent, not disabled, at `Closed` | AC-1 | — | — |
| `FE-027-10` | The take-action menu, rendered **only** from `allowedTransitions`. Empty array ⇒ no control at all | `FE-027-07` | Component test with `[]` **and** with a populated array | AC-2 | — | — |
| `FE-027-11` | Status change with `expectedVersion` and `note`; the note **required** closing from `New` or `Open` | `FE-027-10` | Component test: Confirm disabled until the note is non-empty | AC-6 | — | — |
| `FE-027-12` | The assignee picker — bare array, `Intl.Collator` sort, BR-2 affordance, **current assignee read from the ticket** | `FE-027-04` | Component test with a current assignee absent from the list | AC-7 | — | — |
| `FE-027-13` | The three `expectedVersion` outcomes, distinguished: `200` takes the new `version`; `400` is a client fault with no retry; `409` refetches, explains, and is **never** retried | `FE-027-11`, `FE-027-12` | Three component tests, one per branch | AC-4, AC-5, AC-6 | — | — |
| `FE-027-14` | Five states per region — loading · loaded · empty · error · forbidden. The timeline failing must degrade **only** the timeline | `FE-027-07` | Component tests, plus a manual run with the API stopped | AC-1 | — | — |
| `FE-027-15` | The cache gate, extended from `026`: no `setQueryData` seeds a ticket key, and nothing renders a ticket from a write response | `FE-027-13` | The gate is **watched failing** before it is trusted | AC-1 | — | — |

## Phase 6 — proof

| ID | Task | Depends on | Verified by | AC | Agent | Skill |
|---|---|---|---|---|---|---|
| `TEST-027-16` | **The duplicate-entry assertion.** No entry appears twice across two consecutive pages, asserted by **identity** — counting passes on a duplicate, which is how `013` found it | `FE-027-08` | Recorded in `tests.md` | AC-3 | — | — |
| `TEST-027-17` | **The stale-version assertion.** After a successful write, a second write with the **old** `version` is asserted to `409` | `FE-027-13` | Recorded in `tests.md`, against the running API | AC-6 | — | — |
| `TEST-027-18` | Keyboard order through menu, dialogs and feed; visible focus rings; the feed reachable and escapable; `aria-expanded` on the sections | `FE-027-14` | Recorded in `tests.md` | AC-10 | — | `chrome-devtools-mcp:a11y-debugging` |
| `TEST-027-19` | **The Arabic walk.** Every state in Arabic. Rail at the inline-end, chevron rotating and **not** mirroring, `dir` isolation on subject, description and each comment body, Gregorian dates with Latin digits | `FE-027-14` | Recorded in `tests.md`, including "nothing found" if that is the truth | AC-8, AC-9, AC-10 | — | — |
| `TEST-027-20` | Full gate run: `build`, `lint`, `lint:css`, `lint:i18n`, `lint:types`, `lint:tokens`, `lint:select`, `typecheck`, `test`. **`--no-file-parallelism` on the suite** — full-parallel runs die with an esbuild service crash on this machine, which is a tooling fault and is recorded as one | all | Output recorded, never asserted from memory | Gate 6 | — | — |
| `DOC-027-21` | `summary.md` and `tests.md`, plus the two open questions the preview raised — the rail's 240px before `016`, and the picker's missing Manager variant | all | Present | Gate 6 | — | — |

## Not tasks here

| Excluded | Where |
|---|---|
| Escalation | `016` |
| Generated types replacing `api-types.provisional.ts` | `028`, blocked pending authorisation |
| Customer profile link | `018` |
| Audit log view | `019` |
| Attachments | Out of product scope |
