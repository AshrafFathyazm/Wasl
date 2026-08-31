# `015-ticket-filters-and-search` — summary

**Backend half delivered 2026-08-31.** 589 tests, 0 warnings. `GET /api/tickets` is navigable by
question, not only by page.

## What was built

| # | What | Where |
|---|---|---|
| 1 | `?status=` `?priority=` `?category=` `?channel=` — repeated, OR within a key, AND across keys | `GetTicketsQuery`, `TicketFilters` |
| 2 | `?assignee=me` \| `unassigned` \| `<guid>` | `GetTicketsQueryHandler`, resolved from `ICurrentUser` |
| 3 | `?escalated=` as `bool?` | same |
| 4 | `?search=` over ticket number, subject, **and customer name** | same |
| 5 | `400` naming the parameter and listing every accepted value | `GetTicketsQueryValidator` + 5 catalogue keys in `en` and `ar` |
| 6 | A clamp of 20 values per repeated filter | `TicketFilters.MaxValues` |
| 7 | 21 tests | `TicketFilterTests`, `TicketFilterMessageTests` |

## The three things worth reading

### 1 · AC-10 dictated the binding, and that was measured elsewhere first

The four enum filters bind as **`string[]`**, not `TicketStatus[]`. The shorter version makes the
criterion unreachable: `002c` measured that the model binder refuses a malformed value **before**
the MediatR pipeline runs, so `ValidationBehaviour` never executes, the message is the framework's
English sentence, and it cannot list what the parameter accepts. AC-10 asks for exactly that list.

So the parse moved to where FluentValidation can see it. **A query gets a validator at all because
`ValidationBehaviour` is constrained to `notnull`** and not to `ICommand` — checked, not assumed.
The transaction and audit behaviours are constrained to `IAuditableCommand<TResponse>`, so this
read still opens no transaction and writes no audit row.

### 2 · The accepted values are in the catalogue, and a test is the reason that is safe

The validation path resolves a key with **no arguments** — only a `DomainException` carries
`MessageArguments` — so threading the live enum names into the sentence would mean changing `002`'s
error plumbing for a filter. The values are static per parameter, so the `.resx` holds them, and
`TicketFilterMessageTests` asserts each message names **every** member of its enum in both
languages.

**Without that test this is `009`'s defect waiting to happen.** A member added to `TicketStatus`
tomorrow would leave the message listing five of six, and every other test would stay green.

### 3 · AC-24's premise was wrong, and the fix was to write less code

AC-24 says `%` and `_` need escaping by hand on SQL Server. `008` had already measured otherwise:
EF Core 10 builds the pattern **and escapes the term**, emitting `LIKE @p ESCAPE N'\'`. A
hand-written escaper double-escapes, and any subject containing a backslash or a bracket becomes
unfindable — invisible to the obvious test, which only checks that `100%` matches nothing.

So the assertion pins the **provider's** behaviour across `%`, `_` and `[`. `spec.md`'s claim that
AC-7 "is incomplete on SQL Server" is recorded as **disproved** rather than deleted.

## A defect this feature's own test found in its own code

**`?status=` answered `400`.** It does not bind as an empty array — it binds as an array holding
one empty string, so the invalid-check saw `[""]` and produced a validation error naming six
accepted values. `spec.md` Q-4 rules that an empty parameter means **no filter**.

It is the ordinary case: **a filter bar that clears its select sends exactly that**, so a user who
*removed* a filter would have been shown an error about values they never asked about. Fixed in one
place — `TicketFilters.Supplied` drops blanks before the parse and before the invalid-check.

## Deviations

| # | Spec says | Built | Reason |
|---|---|---|---|
| D-1 | Seven filters | Six here, `customerId` inherited | **`034` shipped `?customerId=` first**, on the same day, because the redrawn ticket-detail rail needed it. Its own comment says *"`015` owns filters, and this is one of them arriving early."* Reused rather than reimplemented |
| D-2 | AC-7/AC-24: escape `%` and `_` | No escaping | Measured in `008` and re-asserted here. Hand-rolling would introduce the defect it was meant to prevent |
| D-3 | — | A clamp of 20 per repeated filter | Not in the spec. `033` took the same decision for `?company=` on the same day with the same reason: **an unbounded repeated parameter is a denial of service from one URL**, and an `IN` list SQL Server has to plan. BR-7.2's clamp-never-reject, so 21 values succeed and the extra is dropped |
| D-4 | — | `?status=3` is a `400` | Not in the spec. `Enum.TryParse` accepts numeric strings — `"3"` yields `PendingCustomer` and `"99"` yields a value no member has. The contract says enums travel as strings, and the alternative is `009`'s shape: the request succeeds and means something the caller did not ask for |
| D-5 | `contracts/` frozen before either lane starts | Empty; recorded as a **Contract change** on `010`'s | The endpoint is `010`'s and its contract is frozen. `error-contract.md` set the rule when `429` arrived late — amend at the foot, never edit the frozen text — and `033` did the same for `008` on the same day |

## Known limitations

- **AC-14 and the whole filter bar are the frontend lane's** and are not claimed. This is the
  backend half; `spec.md`'s in-scope list covers both.
- **No query-count assertion over a filtered list.** `010` AC-12 covers the unfiltered projection
  and still passes; whether a seven-way filter changes the round-trip count was **not measured**,
  and `008`'s `CountQueries()` probe exists to do it. Named as a gap.
- **`?sort=` and `?dir=` are not here.** `033` adds them to customers; the ticket list keeps
  `010`'s BR-7.1 order with the `Id` tie-break.
- **CI has not run this.** Said plainly and no further: `003b` carried this same row and it was
  **false in both directions** — CI had been running every push and had been red for a day.

## The one thing that took a measurement rather than a reading

`New → Closed` is permitted by the BR-1 map and came back `400`. A forbidden transition is `409`,
so the status code alone made the test helper look broken. **BR-1.2** was the answer — closing work
that was never started requires a note — and it took one run to find because the helper's failure
message carries the response body:

```json
"errors":{"note":["أضف ملاحظة توضّح سبب الإغلاق."]}
```

Same lesson as `errors[field]` with one entry: **read the message.** The body also arrived in
Arabic, which is BR-8.4 working as specified — the seeded Manager's claim outranks any header.

---

# The FRONTEND half — delivered 2026-08-31

420 tests in 26 files, clean `tsc -b --force`, clean `eslint`. Before: 379 in 24.

## What was built

| # | What | Where |
|---|---|---|
| 1 | The filter state, read from and written to the URL | `ticketFilters.ts` |
| 2 | Status tabs, search box (300ms debounce), and a six-filter panel | `TicketFilterBar.tsx` + its module CSS |
| 3 | The page wired to all of it, and *no matches* separated from *no tickets* | `TicketListPage.tsx` |
| 4 | `aria-expanded` / `aria-controls` on the shared `Button` | `components/Button/Button.tsx` |
| 5 | Seven request parameters on the fetcher | `tickets.api.ts` |
| 6 | Six catalogue keys, `en` and `ar` | `locales/{en,ar}/tickets.json` |
| 7 | 41 tests | `ticketFilters.test.ts`, `TicketFilterBar.test.tsx` |

## The decisions worth reading

### 1 · The URL is the state, and there is no mirror of it

AC-14 and ADR-011 §2. `readFilters(params)` runs on every render; there is no `useState`
holding a copy. A mirror is a second source of truth that drifts the moment somebody uses
the back button, and the drift is silent — the list would show one thing while the controls
showed another.

**One exception, and it is forced:** the search box keeps a local draft, because typing
into the URL would push a history entry *per keystroke* and fire a request per keystroke.
It re-syncs whenever the incoming value changes, which is what makes the back button and
*Clear filters* work — without that effect the box keeps showing a term the list is no
longer filtered by, and the reader concludes the search is broken.

### 2 · A filter change resets the page, and this is the one with a control behind it

`withFilters` drops `page` and keeps `pageSize`. Page 5 of an unfiltered list is rarely
page 5 of a filtered one, so keeping it turns *filter to Open* into an empty table with a
pager reading 5 of 1 — and the empty table then says "nothing matches these filters", so
the FILTER looks broken rather than the pager. `pageSize` survives because it is a
preference about the viewport, not a position in a result set.

Verified by breaking it: two tests at two levels went red with messages naming the actual
values. See `tests.md`.

### 3 · Three empty states, ordered, each with the other two asserted absent

Past the end · no matches · no tickets. They arrive as the same empty array and mean
different things, and `015` makes the second one a criterion because **"No tickets yet" over
a filtered list tells the reader their data is gone.** Past the end wins the ordering,
because a filtered list can also be paged past its end.

### 4 · A URL is user input, so unknown values are dropped rather than sent

`readFilters` keeps only values the server accepts. An unknown one would earn a `400`
listing six accepted values — the right answer to a client that guessed, the wrong thing to
show somebody who followed a stale link from an older build. The server's `400` remains the
authority for anything reaching it another way, and it was measured doing so.

### 5 · Nothing is sent blank

`?status=` — the parameter present and empty — was a real `400` in the backend half's first
run, because it binds as an array holding one empty string. It is fixed there, and
`toListParams` omits empty filters entirely, so this client is unambiguous against either
behaviour.

## Deviations

| # | Spec / design says | Built | Reason |
|---|---|---|---|
| D-6 | The tab strip draws `All · Open · In progress · Resolved` | The same four | `New`, `PendingCustomer` and `Closed` are in the panel. Six tabs would make the strip wider than the table on a laptop, and the tabs are a daily-rhythm shortcut rather than the whole filter |
| D-7 | — | `Button` gained `aria-expanded` and `aria-controls` | A disclosure needs both and the component forwarded neither. Added rather than dropping to a bare `<button>`: a design-system button that cannot be a disclosure sends the next caller outside the system, and the toggle then looks nothing like the buttons beside it. Optional and absent by default, so no existing caller changes |
| D-8 | Search has an inline icon (`03-tickets-list.md`) | The icon and the clear button are the WRAPPER's | `Input` carries no icon props — checked in the source, not assumed. Positioned with `inset-inline-*`, so both swap sides in Arabic with no second rule |
| D-9 | `escalated` as a checkbox would be the obvious control | A select with three options | A checkbox has two states and this parameter has three. Absent means "any"; `false` means "not escalated". A checkbox collapses the first two and makes every unfiltered list a request for non-escalated tickets — invisible until `016` escalates something, and then it reads as the escalated tickets having been deleted |
| D-10 | — | *Clear filters* keeps the search term | The search is a question the reader typed, not a facet they ticked. Clearing it alongside the facets throws away the thing they are most likely still looking for, and the box has its own clear beside it |

## Known limitations

- **Nothing visual was verified.** No browser was driven: the `chrome-devtools` MCP server
  disconnected during this session and the project has no Playwright or Puppeteer —
  searched, not assumed. jsdom has no layout, so these tests prove a control writes the URL
  and cannot prove the panel is not overlapping the table. **A gap, not a pass.**
- **The Arabic pass over this screen has not happened.** The catalogue has parity, 143 keys
  each way with zero difference — and parity is not a reading. Q-8 stands.
- **The Arabic plural result count is not built.** `spec.md` lists it; the count renders as a
  bare number on the *All* tab, which needs no plural rule.
- **The clamp of 20 is mirrored, not enforced here.** `readFilters` slices at 20 to match
  the server, and there are only six statuses — so the slice is unreachable through the UI
  and is asserted on the function rather than through a control.
