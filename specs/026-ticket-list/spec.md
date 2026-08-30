# 026 — Ticket List · FRONTEND

**Phase:** 2 · **Story:** US-006 (read half, list only) · **Route:** `/tickets` ·
**Folder:** `specs/026-ticket-list/` ·
**Status:** Specified 2026-08-29, awaiting review · **Lane:** Frontend only

The backend half is [`010-ticket-list-and-detail`](../010-ticket-list-and-detail/),
**delivered 2026-08-26**. Its contract is **frozen** and this feature consumes it. `010`
also carries the `FE-010-*` task rows that predate the lane split; **this feature
supersedes the list half of them** — see *Deviations*.

Nothing in `src/Wasl.Api`, `src/Wasl.Application`, `src/Wasl.Domain`,
`src/Wasl.Infrastructure`, or `tests/` is created or changed.

---

## 1 · What this is, and what it is not

One screen: the ticket queue, as a table, paged. It is the first screen in the product
that **reads a collection**, so it is the first one that has to answer what a list shows
when there is nothing in it, when the page is past the end, and when the server cannot be
reached — three answers that are easy to collapse into one and wrong when collapsed.

It is also the first screen that renders a **timestamp**, and the first that could
plausibly reuse a value from a write it did not make. Both of those have a known way to
fail silently, and §5 is about them.

The visual spec is
[`docs/sdd/design/screens/03-tickets-list.md`](../../docs/sdd/design/screens/03-tickets-list.md)
and is not restated here. The build-level detail — components, columns, states, keys, RTL,
accessibility — is
[`010/frontend-spec.md`](../010-ticket-list-and-detail/frontend-spec.md), and **that file
is the frontend spec for this feature's list half**; it is cited, not duplicated. The API
surface is [`010/FRONTEND-API-GUIDE.md`](../010-ticket-list-and-detail/FRONTEND-API-GUIDE.md).

What this document adds is what those three cannot know: what the foundation has actually
shipped by now, which of this screen's neighbours still do not exist, and the cache rule
the backend lane's timestamp finding forces on it.

### Source of truth, in order

| For | Read |
|---|---|
| Every field, every enum value, every status code, the envelope | [`010/contracts/tickets-list-api.md`](../010-ticket-list-and-detail/contracts/tickets-list-api.md) — **frozen**, and the only source for the provisional types |
| What the list renders, in which states, with which keys | `010/frontend-spec.md` §"Screen 1" |
| Query keys, response handling, the mirror-never-authority rules | `010/FRONTEND-API-GUIDE.md` |
| Layout, tokens, icons, column geometry | `docs/sdd/design/screens/03-tickets-list.md` · `docs/sdd/design/component-inventory.md` §"Table column rules" |
| What already exists to build with | [`023`](../023-frontend-foundation/summary.md) · [`024`](../024-frontend-create-ticket-form/summary.md) · [`025`](../025-frontend-auth/summary.md) |

**The guide and the examples are not sources for types.** Where the guide and the contract
could differ, the contract wins; where the contract is silent, this document raises a
question rather than filling it.

---

## 2 · What the foundation gives us, and what is missing

`023`, `024` and `025` shipped `Button`, `Input`, `Badge`, `Select`, `Textarea`, `Toast`,
`Checkbox`, `Loader`, the app shell, `lib/api.ts`, `lib/tokenStorage.ts`, the auth guard,
i18n with a parity gate, and the `/_preview` harness.

| Needed | Status | Decision |
|---|---|---|
| `Table` — header, row, hover, empty, loading skeleton, pagination footer | **Not built.** One of the eight ADR-009 primitives, by name | **Build it here.** This is its first consumer, which is when the cap says a primitive should arrive |
| Pagination controls | **Not a primitive.** `component-inventory.md` lists "pagination footer" as one of `Table`'s **states**, not as a ninth component | **Part of `Table`.** A separate `Pagination` primitive would be a ninth needing a written reason, to express something the inventory already assigns to `Table` |
| Loading skeleton rows | **Not a primitive**, same row of the same table | **Part of `Table`** |
| An assignee avatar | **Not one of the eight.** `010/frontend-spec.md` lists `Avatar` under *Primitive*; `component-inventory.md` does not | **Feature-local, and minimal** — see Q-4 |
| A date formatter | **Does not exist anywhere in the frontend.** Audited 2026-08-28: no `Intl.DateTimeFormat` call in `src/wasl-web` | **Build `lib/formatters.ts`** — `014`'s file, arriving at its first consumer. See §6 |
| Status and priority colour maps | **Not built.** `Badge` deliberately ships five tones and no domain knowledge | **Feature-local** — `TicketStatusBadge` / `TicketPriorityBadge`, keyed on the **wire value** |

### The cap, so the arithmetic is not discovered later

ADR-009 caps the primitives at eight and names them: **Button, Input, Select, Checkbox,
Badge, Table, Modal, Toast**. Built today: **six** — Button, Input, Select, Checkbox,
Badge, Toast. `Table` is the **seventh**. **`Modal` is the eighth and last**, and its
claimants are `012`'s close-ticket dialog and `016`'s escalation reason.

`Textarea` is outside the eight, with the written reason in
[`024/spec.md` §2](../024-frontend-create-ticket-form/spec.md). `Loader` is outside it too
— `component-inventory.md` lists a generic spinner under *Not built* and it never competed
for a slot. Neither is re-argued here.

**After this feature the set is one slot from full.** Anything a screen wants that is not
`Modal` needs a written reason, or the cap is revisited. Recorded here because a cap that
quietly stops being counted is not a cap.

---

## 3 · In scope

- The route `/tickets`, inside the app shell, replacing the `023` placeholder
- `Table` as a primitive: header, row, hover, empty, loading skeleton, pagination footer —
  every state in `component-inventory.md`'s row, none optional
- `TicketListPage` — the only thing that fetches (ADR-011 §4)
- All nine columns from `010/frontend-spec.md`: number, subject, customer, status,
  priority, channel, assignee, escalated, created
- `TicketStatusBadge` and `TicketPriorityBadge` — the BR-1 colour map from
  `03-tickets-list.md`, keyed on the untranslated wire value
- **Envelope pagination**, not cursor: `?page=&pageSize=`, both held in the URL
- Rows per page — 10 / 20 / 50 / 100, and the control shows what the **server returned**
- The five states: loading · loaded · empty (no tickets) · page past the end · error
- Row click navigates to `/tickets/:id`
- `lib/formatters.ts`, with `ar-u-ca-gregory-nu-latn` (§6)
- `TicketListItem` added to `api-types.provisional.ts`, under `024` §5's conditions
- Every string from the catalogue in `en` **and** `ar`, parity-gated
- The Arabic walk of this screen, recorded — RTL defects are visual, and this is the most
  direction-sensitive screen in Release 1
- The **preview before wiring** (Phase 3b, ADR-009), rendered **in Arabic first**

## 4 · Out of scope

| Excluded | Where |
|---|---|
| Status tabs, the search box, the filter panel, filter state in the URL | `015` |
| Column sorting, and the sort control the screen spec draws | **Nowhere.** No story specifies it; the order is the server's, fixed at `CreatedAtUtc DESC, Id DESC` (`010/spec.md` Q-3) |
| The result-count summary — "128 tickets" | `015`. It is a counted noun needing all six Arabic CLDR plural categories (BR-8.14) |
| The ticket **detail** screen | A later feature. `/tickets/:id` keeps the `024` placeholder — Q-1 |
| Row actions that change anything — assign, status, escalate | `011`, `012`, `016`. The list does not carry `allowedTransitions` and must not derive it |
| `/tickets/mine` and `/tickets/unassigned` | `015` — both are filters. They keep their `023` placeholders — Q-2 |
| The customer profile the customer cell would link to | `018`. The cell renders text, not a link — Q-3 |
| Bulk actions, saved views, CSV export, column configuration, inline editing, infinite scroll, grouping | Out of scope in US-006, with reasons in `010/spec.md` |
| Replacing the provisional types with generated ones | Fires when `/swagger` is real |
| `Modal` | Its first consumer |

---

## 5 · The cache rule this screen is designed around

The backend lane found on 2026-08-28 that one ticket has **two different timestamp strings
depending on how it is read**:

```text
POST /api/tickets   →  "createdAtUtc": "2026-08-28T09:14:22.7129947Z"   in-memory precision
GET  /api/tickets/… →  "createdAtUtc": "2026-08-28T09:14:22.712Z"       datetime2(3) in the column
```

Same instant, two strings. The backend is fixing the write side. **This feature is written
so that the fix cannot break it, and so that the defect could not have reached it in the
first place** — because a list is exactly where a helpfully reused write response would go.

| Rule | Why |
|---|---|
| **The detail route always reads from `GET`.** No screen renders a ticket from the response to a write | A body returned by a write is what the server *had*, not what it *stored*. Those differ today by four digits of a timestamp, and the class of difference is open-ended — a trigger, a default, a computed column |
| **No `setQueryData` from a `201`.** Not into the list key, not into a detail key | A seeded cache entry holds a value the server will never return again. Nothing throws. The row simply differs from the same row after a refresh, by digits nobody reads |
| **After a create, the list key is `invalidateQueries`, never patched** | An optimistic insert also has to decide *where* the row lands, which on a server-ordered paged list it cannot know. Two wrongs: a stale value and a wrong position |
| **The only values allowed to cross from a `201` into a rendered screen are `id` and `ticketNumber`** | Both are immutable and byte-identical from either endpoint. `024` already does exactly this — the number travels in navigation state and nothing else does. That stays legal; a timestamp, a `version`, or a `status` travelling the same way does not |
| **Rows are never sorted, re-sorted, or filtered in the browser** | The order is a contract (`CreatedAtUtc DESC, Id DESC`). Client-side sorting of one page produces an order that is right on the page you are looking at and wrong across pages |

**This is testable, and the test is cheap:** a gate asserting no `setQueryData` under
`features/tickets/`, plus an assertion that the rendered timestamp comes from the `GET`
payload the query cache holds. AC-026-16.

---

## 6 · Dates — the first formatter in the product, and its two silent defaults

`014-language-preference-and-rtl` owns `lib/formatters.ts`. It is not built, and this is
its first consumer, so the file arrives here.

ADR-007 §7 fixes the locale as **`ar-u-ca-gregory-nu-latn`**.

**This section originally claimed two silent failures and was rewritten after measuring
them.** The preview rendered all four locales side by side (`tests.md` §1.4), and the
engine agreed with one claim and contradicted the other:

| Locale | Renders | Resolved | |
|---|---|---|---|
| `ar-u-ca-gregory-nu-latn` | `29/08/2026` | gregory · latn | the rule |
| `ar` | `29/08/2026` | gregory · latn | **no defect** — the spec claimed Arabic-Indic |
| `ar-EG` | `٢٩/٠٨/٢٠٢٦` | gregory · arab | digits flip |
| `ar-SA` | `٢٩/٠٨/٢٠٢٦` | **gregory** · arab | digits flip; the spec claimed a Hijri year |

So **`-nu-latn` is load-bearing, but only once the locale string carries a region** —
which is exactly what `navigator.language` supplies and what a stored user preference
could become. **`-ca-gregory` changed nothing in this engine** and is kept as defence: the
ICU default for `ar-SA` is version-dependent, and a Hijri year reads as bad ticket data
rather than as a formatting bug.

**The real defect on this screen was neither of those, and no test would have caught it.**
Under any `ar` locale the formatter puts **U+200F RIGHT-TO-LEFT MARK inside the string** —
`29‏/08‏/2026` — which rendered as `292026/08/`. `dir="ltr"` creates an isolate around the
cell and does nothing to control characters within it. The text content is correct, the
digits are Latin, the year is Gregorian, and an assertion on the text passes on a string
that is indistinguishable in a terminal. `lib/formatters.ts` strips `U+200E`, `U+200F` and
`U+061C`, so the column is byte-identical in both locales.

None of these throws. None fails a test that asserts a date is present. All were found by
looking at the Arabic screen, which is why AC-026-14 requires the walk and why the preview
is rendered in Arabic first.

**Page numbers are not dates.** BR-8.13 pins Latin digits to *identifiers and timestamps*;
a page number is neither, and the house reference renders them in Arabic-Indic. Counts go
through a second formatter, `ar-u-nu-arab` — explicit, because V8 resolves plain `ar` to
`latn` and the pager would silently agree with the dates instead of with the reference.

`ticketNumber` is **not** a number and never reaches a formatter: it is a string with an
explicit `dir="ltr"`, Latin digits in both locales, `tabular-nums` (BR-8.13).

---

## 7 · Provisional types — the same authorised exception

ADR-011 §6 requires generated types. Generation still does not exist. The exception granted
on 2026-08-26 and its five conditions are in
[`024/spec.md` §5](../024-frontend-create-ticket-form/spec.md) and apply unchanged. This
feature adds **one** interface to the one file:

```ts
// PROVISIONAL — hand-written against specs/010-ticket-list-and-detail/
// contracts/tickets-list-api.md (frozen). Delete when OpenAPI
// generation lands. ADR-011 §6.
export interface TicketListItem { … }
```

- `PagedResult<T>` **already exists** in that file and is reused, not redeclared. Its
  comment already states that `page` and `pageSize` are the **effective** values after the
  server's clamping.
- `assigneeId` and `assigneeName` are `string | null` — **nullable, not optional**. The
  contract says both are `null` together on an unassigned ticket, and that the row is
  still returned.
- The list row deliberately carries **no** `description`, **no** `version`, and **no**
  `allowedTransitions`. The contract says so by name, and putting any of them in the type
  would invite a screen to use one.
- The enums are already transcribed and are not re-declared.

---

## 8 · Acceptance criteria

| # | Criterion |
|---|---|
| AC-026-01 | `/tickets` renders the real list from `GET /api/tickets` in a browser, signed in, in both locales |
| AC-026-02 | All nine columns render, each per `010/frontend-spec.md`'s rendering column — including `dir="ltr"` + `tabular-nums` on the number, and `dir="auto"` on subject, customer, and assignee |
| AC-026-03 | `page` and `pageSize` live in the URL. A pasted `/tickets?page=3&pageSize=50` renders page 3 at 50 rows, and Back returns to the previous page |
| AC-026-04 | The pagination footer and the rows-per-page control render the values the **server returned**, not the values requested. Proven with `?pageSize=500`, which the server clamps to 100 |
| AC-026-05 | Loading renders skeleton rows at the real `--table-row-height`, so nothing shifts when data lands. Announced once, not once per row |
| AC-026-06 | A page change **dims and refetches**; it does not replace rendered rows with skeletons |
| AC-026-07 | `totalCount === 0` renders the "no tickets" empty state with a CTA to `/tickets/new`. It is **not** the "no matches" state, which does not exist in this feature |
| AC-026-08 | `items: []` with `totalCount > 0` renders the past-the-end state and offers page 1, computed from `totalPages` |
| AC-026-09 | An unreachable API renders the error state with the message, the `traceId`, and a retry that works. Verified with the API stopped |
| AC-026-10 | A `401` redirects to sign-in and is **not** a list state. `lib/api.ts` already owns this; the screen must not intercept it |
| AC-026-11 | Status and priority badges are keyed on the **untranslated wire value**. Switching to Arabic changes the labels and changes **no** colour |
| AC-026-12 | Red appears only on `Critical` priority and on the escalated icon. No status is red |
| AC-026-13 | The escalated icon renders only when `isEscalated` is true, and its meaning reaches a screen reader — not colour alone. The unassigned `—` has an accessible label |
| AC-026-14 | The screen is walked in Arabic: column order reverses, pagination chevrons mirror, the escalate icon does **not** mirror, dates are Gregorian with Latin digits. Findings recorded in `tests.md`, including "nothing found" if that is the truth |
| AC-026-15 | The table is a real `<table>` with `<th scope="col">`. Every row is keyboard reachable, activating it navigates, and the focus ring is visible |
| AC-026-16 | **No `setQueryData` anywhere under `features/tickets/`**, asserted by a gate. The list renders `createdAtUtc` from the `GET` payload and from nowhere else (§5) |
| AC-026-17 | The client never sorts, re-sorts, or filters rows, and never derives `allowedTransitions`. No row action that changes state is rendered |
| AC-026-18 | `Table` renders every state in `component-inventory.md`'s row — header, row, hover, empty, loading skeleton, pagination footer — visible in isolation in `/_preview` |
| AC-026-19 | Every user-facing string is a key present in `en` **and** `ar`; `npm run lint:i18n` passes. One key per enum value, keyed by the wire value. No counted-noun string is added |
| AC-026-20 | The preview is rendered and reviewed **before** anything is wired, **in Arabic first**, with 100 plausible rows and a 200-character Arabic subject |
| AC-026-21 | `npm run build`, `lint`, `lint:css`, `lint:i18n`, `lint:types`, `typecheck`, and `test` all pass with zero warnings |

---

## 9 · Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | The frozen contract does not move while this is built | One interface in one file changes |
| A-2 | `GET /api/tickets` is reachable and the seeded database holds enough rows to page | The states are still provable from the preview; AC-026-01, -03 and -04 are not |
| A-3 | Nine columns fit at 1280px with the 132px number column, in Arabic | `010/frontend-spec.md` names this as the thing the preview is looking for. The fallback is demoting `channel` to a `title`, decided at the preview and not after wiring |
| A-4 | The tokens the table needs already exist — `--table-row-height`, `--surface-content`, `--state-*` | A missing token goes to the design docs and comes back as a token. **It is never invented in a stylesheet** (DESIGN-BRIEF rule 3), which is what `023` did for the gaps it found |

---

## 10 · Open questions

**Every one of these blocks or changes real work.** None is filled in with a guess.

| # | Question | Why it matters | Working assumption |
|---|---|---|---|
| **Q-1** | A row click navigates to `/tickets/:id`, which today renders `TicketCreatedPage` — a `024` placeholder whose heading is **"Ticket created"**. Arriving there from a list row is a lie | It reads as the app having created something | **Keep the route and the navigation, neutralise the placeholder**: retitle it to "not built yet", and keep the created-toast bound to navigation state, which only the create flow supplies. One key changes; the detail feature replaces the component |
| **Q-2** | `/tickets/mine` and `/tickets/unassigned` are in the sidebar and are **filters** (`015`) | Two nav items lead to a placeholder while their parent is a real screen | **Leave both on the placeholder.** Pointing them at an unfiltered `/tickets` would show every ticket under a label that says otherwise, which is worse than a page that says it is not built |
| **Q-3** | `010/frontend-spec.md` links the customer cell to `/customers/:customerId`. **That screen does not exist** (`018`), and `/customers` is itself a placeholder | A link to nowhere in every row of every page | **Render the customer name as text, not a link.** Recorded as a deviation from `010/frontend-spec.md`, removed by the customer-profile feature |
| **Q-4** | `010/frontend-spec.md` lists `Avatar` as a primitive; `component-inventory.md`'s eight do not include it, and `03-tickets-list.md` specifies a 24px avatar | A ninth primitive for one cell | **Feature-local initials circle** — not a primitive, and not an image: there is no avatar URL on the row and none in the contract. Promoted with a written reason if a second screen wants it |
| **Q-5** | Is the rows-per-page control in this feature, or is the page size fixed at 20? `010/tasks.md` lists it as a cut candidate | It is the only control on the screen besides pagination | **Build it.** BR-7.2's clamp is otherwise unobservable in the UI, and AC-026-04 is what proves the client shows the effective value rather than the requested one |
| **Q-6** | The empty state calls for an "illustration". **No illustration asset exists** in `src/wasl-web/src/icons/` or the brand folder | An invented illustration looks deliberate and is not | **The brand `Mark` at a large size, muted**, plus the message and the CTA. Recorded as `(D)`. A real asset replaces it without touching the state |
| **Q-7** | Does the row menu (`⋯`) render at all? `010` gave it "navigation only — open, copy the number" | An empty menu is worse than none | **No row menu.** "Open" is the row click, and "copy the number" is one action behind two clicks. It arrives with the first action that changes something (`011`/`012`) |
| **Q-8** | `lib/formatters.ts` belongs to `014`. Does it land in `lib/` now, or feature-local until `014`? | A second copy would be the defect `014` exists to prevent | **`lib/formatters.ts` now**, with a header naming `014` as its owner. A feature-local date formatter is how a product ends up with two calendars |

---

## 11 · Deviations

| Deviation | Reason | Removed when |
|---|---|---|
| The list half of `FE-010-*` becomes `FE-026-*` | `specs/README.md`: the number in a task ID is the feature folder's number | On approval of this spec |
| The customer cell is text, not a link | Q-3 | At the customer-profile feature |
| No `Avatar` primitive | Q-4, and the eight-primitive cap | At its second consumer, with a written reason |
| No row menu | Q-7 | At the first row action that changes state |
| **The supplied design shows an `الإجراءات` column with a kebab; this screen has neither** | **DISCREPANCY, ruled 2026-08-30: the spec wins.** Q-7 decided before any code that a menu holding only "open" is an empty menu, and opening a ticket is the row click. The design canvases were drawn later and were not re-ruled against Q-7. **Left standing and documented rather than silently reconciled** — the screen and the drawing disagree, and which one is wrong is a product decision | When Q-7 is explicitly revised. Not before |
| The subtitle line (`count · updated`) is absent | It needs a counted noun. `FE-026-05` rules those out, and Arabic plural agreement makes one string wrong for 2, for 3–10, and again above 10. **Unresolved copy decision, not a missing feature** | When the copy is decided — with a form that does not count, or with ICU plural rules |
| `Pagination` is not a component; the footer is a `Table` state | `component-inventory.md` assigns it to `Table` | Not removed |
| The empty state uses the brand mark rather than an illustration | Q-6 — the asset does not exist | When one does |
| **Hand-written API types**, against ADR-011 §6 | Product owner, 2026-08-26. Unchanged conditions, one more interface in the one file | When generation lands. The file is **deleted**, not edited |

---

## 12 · What fails silently here

The rows that look like success. Each is why an acceptance criterion exists.

| Silent failure | Why nobody notices | Caught by |
|---|---|---|
| Seeding the detail or list cache from a `201` | The screen renders. The value is simply one the server will never return again, differing by four digits of a timestamp | AC-026-16, §5 |
| A date formatted under a region-qualified `ar` without `-nu-latn` | Perfectly plausible Arabic digits. An English reviewer cannot see it, and no test asserts a digit shape | AC-026-14, §6 |
| **The `U+200F` marks ICU puts inside the Arabic date** | The text content is correct and the digits are Latin, so every assertion passes. Only the render is wrong — `292026/08/` — and only in Arabic | AC-026-14, §6. **Measured, not predicted** |
| A status column sized on the Arabic label | English `Pending customer` is 129px to Arabic's 92px. The pill overflows into the priority column, in the language the Arabic pass does not look at | `tests.md` §1.2 |
| Rendering the **requested** `pageSize` instead of the returned one | Everything agrees until someone types `?pageSize=500`, and then the control says 500 while 100 rows are on screen | AC-026-04 |
| A status colour map keyed on the **translated** label | Every badge renders neutral in Arabic. Nothing throws, no test fails, and it is invisible in English | AC-026-11 |
| Client-side sorting "so the newest is on top" | Right on the page you are looking at, wrong across pages — and it bypasses the tie-break the backend built for exactly this | AC-026-17 |
| Skeleton rows at a different height from real rows | The table jumps when data lands. It reads as jank, not as a wrong constant | AC-026-05 |
| Replacing rows with skeletons on every page change | A fast interaction looks slow, and the user loses their place | AC-026-06 |
| One empty state for "no tickets" and "no matches" | They are the same component until `015` needs them to differ, at which point the state is load-bearing in two places | AC-026-07, and `015` |
| A `401` handled as a list error | "The ticket list could not be loaded" on an expired session, with a retry that fails forever | AC-026-10 |
| The escalated meaning carried by colour only | Invisible to a colour-blind user, and in a monochrome print | AC-026-13 |
| A ticket number left to inherit RTL | `TCK-` lands on the wrong end. It reads as a rendering bug, and the number gets copied wrong | AC-026-02 |
| Nine columns that do not fit the Arabic headers | Found after the screen is wired, tested and translated, when it costs hours instead of minutes | AC-026-20 — the preview, in Arabic, before wiring |

---

## 13 · Rules referenced

**ADR-004** the state machine lives in the domain, once — the list holds no copy and no
`allowedTransitions` · **ADR-007** §6 logical properties · §7 `ar-u-ca-gregory-nu-latn` ·
§8 `dir="auto"` on user content · **ADR-009** the eight-primitive cap, and preview before
build · **ADR-011** §1 no global store · §2 the URL is the state · §3 feature folders and
when to promote · §4 only the route fetches · §5 an empty result is data, not an error ·
§6 types are generated, never hand-written ·
**BR-1** the status set and its colour map · **BR-6** both roles read the list — no `403` ·
**BR-7.1** the order · **BR-7.2** the `pageSize` clamp · **BR-8.6** server messages arrive
translated · **BR-8.7** enum values are never translated · **BR-8.8** no hard-coded string ·
**BR-8.11** catalogue parity · **BR-8.13** Latin digits and the Gregorian calendar ·
**BR-8.14** six Arabic plural categories — which is why no count string is added here ·
**`component-inventory.md`** the cap, `Table`'s state list, and the column rules ·
**`03-tickets-list.md`** the element-by-element screen spec ·
**DESIGN-BRIEF rule 3** never invent a token ·
**constitution III** the client mirrors a rule to tell the user sooner, and is never the
authority.
