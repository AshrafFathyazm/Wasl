# 038 — tasks

One owner each. `Agent` is who executed it; `Skill` is what the work was.

| # | Task | Agent | Skill | Status |
|---|---|---|---|---|
| FE-038-01 | `--state-warning-border` in `tokens.css`, beside the two existing warning semantics | main | design tokens | ✅ |
| FE-038-02 | `ApiRequest.headers` in `lib/api.ts` — the only way to send `Idempotency-Key`; merged so it cannot overwrite `Authorization` or `Accept-Language` | main | api client | ✅ |
| FE-038-03 | `createTicket(body, idempotencyKey?, signal?)` in `tickets.api.ts` | main | api client | ✅ |
| FE-038-04 | i18n keys, `en` + `ar`, same commit — summary plurals, open-ticket plurals, channel hint, assignment reason, day-age plurals | main | i18n | ✅ |
| FE-038-05 | `ChannelPicker.tsx` — `role="radiogroup"`, five icons from the set, arrow keys, one tab stop | main | react component | ✅ |
| FE-038-06 | `PriorityPicker.tsx` — same model, colour dots, **nothing selected** initially | main | react component | ✅ |
| FE-038-07 | `DuplicateWarning.tsx` — amber banner, count from `totalCount`, «عرضها» disclosure, links | main | react component | ✅ |
| FE-038-08 | `CustomerPicker.tsx` rewrite — company on rows and card, «عميل جديد» live | main | react component | ✅ |
| FE-038-09 | `CreateTicketPage.tsx` rewrite — two columns, footer bar, error summary, focus order, sheet, idempotency key | main | react route | ✅ |
| FE-038-10 | `CreateTicket.module.css` rewrite — grid in a stylesheet with nothing inline (M-1), logical properties only | main | css | ✅ |
| TEST-038-11 | `CreateTicketPage.test.tsx` rewrite — AC-1…AC-3, AC-18…AC-21, AC-27, AC-30, AC-35, AC-39 | main | vitest + RTL | ✅ |
| TEST-038-12 | `newTicketLayout.test.ts` — a SOURCE scan for M-1: the grid columns are declared in CSS and no inline `style` on the page sets a grid property. jsdom paints nothing, so no rendered test can see this | main | vitest | ✅ |
| TEST-038-13 | `ChannelPicker` / `PriorityPicker` / `DuplicateWarning` unit tests — AC-6…AC-8, AC-13…AC-16, AC-29, AC-33, AC-34 | main | vitest + RTL | ✅ |
| TEST-038-14 | AC-31's absence guard — the route imports no support-user fetcher | main | vitest | ✅ |
| TEST-038-15 | AC-37's guard — `src/icons/` unchanged by this feature | main | vitest | ✅ |
| REV-038-16 | Negative controls: break each new guard on purpose, watch it go red, restore. Recorded in `tests.md` | main | verification | ✅ |
| DOC-038-17 | `docs/sdd/design/screens/05-create-ticket.md` → v2, v1 table kept | main | docs | ✅ |
| DOC-038-18 | `tests.md`, `ai-notes.md`, `summary.md`, board + delivery log | main | docs | ✅ (board + delivery log pending the commit gate) |

| FE-038-19 | `PriorTickets` — R-4b: the quiet previous-tickets line, its second query, styles, strings | main | react component | ✅ |
| TEST-038-20 | AC-40…AC-44 + controls C6/C7 | main | vitest + RTL | ✅ |

**Order matters in two places only:** FE-038-02 before FE-038-03, and FE-038-04 before
anything that renders a string.
