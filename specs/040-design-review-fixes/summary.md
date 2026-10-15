# 040 — Summary (frontend lane, 2026-10-15)

**Status** implemented, **not committed**. Browser checks at 1440 / 1024 in `en` and `ar` were **NOT done**:
the SQL Server container was not running (`docker ps` hung, `POST /api/auth/token` answered `500`), so no
signed-in screen could be opened. Everything below is verified by `tsc -b`, `eslint`, the three lint scripts and
the full `vitest run` only. A visual pass is still owed — items 1, 2, 6, 9, 12, 13, 17, 19, 20 and 22 are layout
claims that jsdom cannot see.

## Run output (observed)

| Command | Result |
|---|---|
| `npx tsc -b` | clean |
| `npx eslint .` | clean |
| `npm run lint:tokens` / `lint:i18n` / `lint:select` / `lint:types` | clean · parity OK, 637 keys · clean · clean |
| `npx vitest run` (needs `NODE_OPTIONS=--max-old-space-size=6144 --maxWorkers=3`; the default run died `Zone Allocation failed`) | **66 files, 1452 tests passed** |

## Per item

State came from reading the tree after commit `ce8d310` (made by another session before this one started) — items
marked *(ce8d310)* were already in that commit and were only re-checked here.

| # | Item | State | Notes |
|---|---|---|---|
| 1 | Table cell overflow | done *(ce8d310)* | assignee cell capped, titles on cells. Not seen in a browser |
| 2 | Table density | done *(ce8d310)* | icon-only channel, relative age, priority badge. Sticky header / no inner scroll **not verified** |
| 3 | Counts | done *(ce8d310)* + backend edits uncommitted by the other session (`DashboardTrendPredicates.OpenStatus`) | one definition: open = neither Resolved nor Closed |
| 4 | Open + Closed tabs | done *(ce8d310)* | |
| 5 | Medians "No data yet" | done *(ce8d310)* | |
| 6 | Heading colour | done | `.subjectTitle` names `--text-primary`. Cause not seen in a browser; the heading previously inherited |
| 7 | One composer | **done** | new `TicketComposer`; Reply = `021` message (ruled by product owner), Internal note = comment. Separate drafts per mode. Messages tab is the record only |
| 8 | Mode-dependent helper | done | `messages.sendHint` / `detail.internalHintOn` |
| 9 | Sort control one line | done (CSS) | `white-space: nowrap; flex: none`. Not seen in a browser |
| 10 | Messages skeleton | done | page renders `FeedSkeleton`; panel no longer has a loading state |
| 11 | Reason tooltips | done | close names where the ticket can go **from `allowedTransitions`**; tooltip moved to a wrapper because a disabled button swallows pointer events |
| 12 | Other tickets: number + badge | done | full number, `TicketStatusBadge`, whole row is the link |
| 13 | Wider layout | partial | `.sheet` 1240 → 1440. Not seen in a browser |
| 14 | Breadcrumb | done | `Tickets › <number>` (from the query cache, no request) and `Tickets › New ticket` |
| 15 | Sidebar active state | done | `/tickets/:id` → All tickets; `/customers/*` → Customers |
| 16 | Sparse chart empty state | **no change needed** | `chart.empty` already replaces an empty period. "Sparse" (few non-zero days) was not defined by the spec, so nothing was added |
| 17 | Zero channels | done | rows for count 0 are not drawn; one muted line names them |
| 18 | `dir="auto"` on name, count in fixed slot | no change needed | `BarRow` already does both |
| 19 | "Pending customer" | done | label column 92 → 112px so it is not clipped. **Check in a browser** |
| 20 | Channel labels | done | `ChannelPicker` uses the `label` variant; orphan cell spans the row |
| 21 | Routing inner scroll | **not done — moved to `041`** | the scroll is the form's own scroller (`.scroll`) inside a fixed-height shell; removing it is a layout restructure that `041` AC-9 owns (sticky footer, no nested scroll). Not reproduced without a browser |
| 22 | Priority Normal on load | done | **reverses `038` R-3**. The body now carries `priority: "Normal"` even untouched, which pins today's server default |
| 23 | `dir="auto"` + `text-align:start` | done | new `AutoText`; applied to ticket-list customer and assignee (subject and customers list were already `dir="auto"`) |
| 24 | Accessible names | done | logo is a link home with a name (it was `role="img"`), user menu always named, KPI links asserted by role query |

Added after review in the same session: tabs + search/filter share one row at 100% zoom (the search field was a fixed
320px; seven status chips plus it overflowed 1420px and wrapped). `TicketFilterBar.module.css` only — **not seen in a browser**.

## Deviations and trade-offs

- **Item 7 sends replies as messages, not comments.** Existing non-internal comments still display; the screen no
  longer writes new ones. If the product wants public comments back, that is a third mode, not a flag.
- **Item 22 reverses a written ruling** (`038` R-3). The reason it stood was that the client would pin the server's default.
- **`TicketMessagesPanel` lost its composer and its `loading`/`sendableChannels`/`canSend`/`onSend` props**; its tests that
  covered the composer moved to `TicketComposer.test.tsx`.
- Dead catalogue keys removed (`detail.markInternal`, `detail.commentPlaceholder`, `messages.bodyHelp`,
  `messages.bodyRequired`, `messages.loading`); added `detail.composerMode/modeReply/modeInternal/sendReply/sendNote/closeAlready/closeNotAllowedFrom`,
  `channels.none/allNone`, `nav.home/userMenu/ticketDetail` in both languages. Arabic copy is unreviewed (Q-8).
- `Header` now reads the ticket number from the TanStack cache (`getQueryData`); the shell still makes no request.

## Known limitations

- No browser verification (see top). No screenshots.
- Item 21 open. Item 16 interpretation open.
- The other session's uncommitted backend edits (`DashboardAggregatesQuery.cs`, `DashboardTrendPredicates.cs`,
  `DashboardReadTests.cs`) were **not run** here — no Docker.
