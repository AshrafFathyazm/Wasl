# 039 — tasks

One owner each. `Agent` is who executed it; `Skill` is what the work was.

**The 038 lane is live in the same working tree.** It holds `CreateTicketPage.tsx`,
`CreateTicket.module.css`, `CustomerPicker.tsx`, `ChannelPicker.tsx`, `PriorityPicker.tsx`,
`RadioGroup.tsx`, `DuplicateWarning.tsx`, `lib/api.ts`, `tokens.css` and both
`tickets.json`. **This feature touches none of the first eight.** It shares the two locale
files, and it adds **no token** — the three count colours are already
`--state-danger-text`, `--state-warning-text` and `--text-muted`. Every commit passes
paths.

| # | Task | Agent | Skill | Status |
|---|---|---|---|---|
| FE-039-01 | `useMenuSurface` — `maxBlockSize` measured per open and on scroll/resize, and `align: 'stretch' \| 'end'`. Both opt-in; `Dropdown` passes neither and is unchanged | main | react hook | ☑ |
| FE-039-02 | `Dropdown.module.css` — `max-block-size: min(token, var(--menu-max-block-size, 100vh))` so a cap can only ever shorten a menu | main | css | ☑ |
| FE-039-03 | `Avatar.tsx` + `Avatar.module.css` — the tinted avatar, `initials`, `tint`, `AVATAR_TINT` moved out of `TicketDetailPage.tsx` so two screens can share one | main | react component | ☑ |
| FE-039-04 | `AssigneePanel.tsx` + `.module.css` — the shared panel: search, rows (initial · name · role · open count), tick, pinned «إلغاء الإسناد». `counts` **optional** so the detail rail is unchanged (Q-5) | main | react component | ☑ |
| FE-039-05 | `openTicketCounts.ts` — `useQueries` fan-out, one `countTickets` per support user under `ticketKeys.count`, `enabled` only while a menu is open (Q-1) | main | tanstack query | ☑ |
| FE-039-06 | `RowAssignMenu.tsx` — the surface: `useMenuSurface` portal anchored to the row's actions cell, the ticket fetch for `version`, the mutation, the two toasts | main | react component | ☑ |
| FE-039-07 | `CloseTicketModal.tsx` + `.module.css` — `Modal size="sm"` + `unsavedInput`, four reasons, conditional «التذكرة الأصلية», summary, the `allowedTransitions` refusal, the composed `note` | main | react component | ☑ |
| FE-039-08 | `TicketListPage.tsx` + `TicketList.module.css` — the two items act instead of navigating, `rowMenuItemDanger` deleted with its selectors | main | react route | ☑ |
| FE-039-09 | `TicketDetailPage.tsx` + `TicketDetail.module.css` — import the shared panel and avatar, delete the local copies and their selectors | main | react route | ☑ |
| FE-039-10 | i18n keys, `en` + `ar`, in the same commit as the code that renders them | main | i18n | ☑ |
| TEST-039-11 | `AssigneePanel.test.tsx` — AC-5…AC-12, the three colour boundaries asserted individually | main | vitest + RTL | ☑ |
| TEST-039-12 | `CloseTicketModal.test.tsx` — AC-16…AC-22, AC-24 | main | vitest + RTL | ☑ |
| TEST-039-13 | `rowActions.test.tsx` — AC-1…AC-3, AC-25…AC-27, AC-33 through the real list page | main | vitest + RTL | ☑ |
| TEST-039-14 | `rowActions.guards.test.ts` — the source scans: AC-3, AC-17's no-transition-map, AC-28, AC-30, AC-31, AC-32, AC-34, AC-35 | main | vitest | ☑ |
| TEST-039-15 | `menuSurfaceCap.test.ts` — AC-13's cap and flip with the trigger positioned deliberately (M-4), and AC-36 | main | vitest | ☑ |
| REV-039-16 | Negative controls: break each new guard on purpose, watch it go red, restore. Recorded in `tests.md` | main | verification | ☑ |
| DOC-039-17 | `tests.md`, `ai-notes.md`, `summary.md`, board + delivery log | main | docs | ☑ |

**Order matters in three places only:** FE-039-01 before 06, FE-039-03 before 04, and
FE-039-10 before anything that renders a string.
