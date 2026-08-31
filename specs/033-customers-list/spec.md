# 033 — Customers List · BACKEND + FRONTEND

**Phase:** 4 · **Story:** US-002 (read half, the directory) · **Route:** `/customers` ·
**Folder:** `specs/033-customers-list/` ·
**Status:** Specified 2026-08-31, awaiting review · **Lanes:** **both**

**Source:** `Wasl Customers.dc.html` — a canvas design document, authored in Arabic,
supplied 2026-08-31. **It is not in the repository** and this feature vendors it. §3.

**Scope ruling:** product owner, 2026-08-31 — **build the canvas as drawn, and make the
adjustments it needs.** That reverses the subset chosen earlier the same day, and it is what
makes this a two-lane feature: three of the canvas's controls have no parameter on the
frozen endpoint, so the contract is reopened rather than the screen reduced. §4.

**Consumes and extends:** [`008-customer-list-and-profile`](../008-customer-list-and-profile/)
— delivered 2026-08-28, 408 tests. Its contract is **frozen and is amended by this feature**,
recorded under **Contract changes** in `008/plan.md` and told to both lanes.

**Depends on:** `026` (`Table`) · `029` (`Skeleton`, motion tokens) · `031` (`Dropdown`)
**Adjacent, not consumed:** [`032-customer-screens`](../032-customer-screens/) — profile and
create, approved for implementation the same day, from a **different** canvas. §2.

---

## 1 · What this is

The customer directory: a table over `GET /api/customers`, with search, sorting, two filters,
paging, and a detail panel that opens beside the row.

It is the **preventive half of BR-4**. Most duplicate customers are created by someone who
could not find the record that already existed, which is why the *no matches* state carries a
create-with-this-term CTA, and why it is never the same component as *no customers*.

It is also the **first code in the product to call `GET /api/customers`**. The endpoint has
been live since 2026-08-28 and nothing has reached it: the customer picker in
`024-frontend-create-ticket-form` still runs on `STUBBED_CUSTOMER_SEARCH = true`. §11.

### 1.1 · Source of truth, in order

| For | Read |
|---|---|
| Every field, the envelope, the clamps, the order | [`008/contracts/customers-read-api.md`](../008-customer-list-and-profile/contracts/customers-read-api.md) — frozen, **amended by §5** |
| What the built endpoint actually does | `src/Wasl.Application/Features/Customers/GetCustomers/` — read, not assumed |
| Table geometry, densities, bidi, the flyout floor | [`026/table-primitive.md`](../026-ticket-list/table-primitive.md) |
| Waiting vocabulary, motion tokens, `Skeleton` | [`029/summary.md`](../029-loader-system/summary.md) and `docs/sdd/design/loaders.md` |
| Layout, columns, RTL, states, i18n keys | [`06-customers-list.md`](../../docs/sdd/design/screens/06-customers-list.md) — **amended by §8** |
| The canvas | `Wasl Customers.dc.html` — not in the repository. Q-1 |

**Where the canvas and a house document disagree, neither wins silently.** §8 lists all
seven disagreements, each with a ruling and a reason.

---

## 2 · The number was contested, and here is how it was settled

Three folders claimed `032` at 12:44 on 2026-08-31. `032-customer-screens` — the customer
**profile** and **create** screens, from a different canvas — was already **approved for
implementation** by the product owner, and its `tasks.md` records *"No `/customers` list …
The list itself is a later feature."* This is that feature, and it renumbered to `033`.
`034-ticket-detail-backend` had already taken the next slot from the other lane.

**Recorded rather than tidied away**, for the reason `029` gave when it hit the same thing:
a folder-number collision is how two sessions discover they are building adjacent halves of
one surface, and the discovery is worth more than the clean history.

The two features meet at exactly three points, and each is one-directional:

| Point | Who owns it | This feature does |
|---|---|---|
| `/customers` route | **This feature.** `032` keeps `023`'s placeholder and says so | Replaces the placeholder |
| `/customers/new` | `032` | Links to it. No form here |
| `/customers/:id` | `032` | Links to it from the panel's footer. No profile here |

`032`'s Q-1 asked for a placeholder list so its breadcrumb and its `409` find-existing land
somewhere. **This feature is the real answer to that question**, and if it ships first, `032`
Q-1 resolves to *the list exists*.

---

## 3 · The canvas, and the two problems with how it arrived

`029` set the precedent (its Q-5), `030` restated it, and `032` applied it: a `.dc.html` is
**vendored into `docs/sdd/design/` byte-exact** and an English `.md` is authored beside it.
**No `.dc.html` exists anywhere in the repository** — verified 2026-08-31 by
`find . -name "*.dc.html"`, which returns nothing. `030` is blocked on exactly this.

Second: **the Arabic copy is unreadable.** It arrived by paste, through the lossy channel
`030` §2 and `032` §2 both document — UTF-8 read as cp1252 with the C1 bytes stripped.
`العملاء` arrived as `Ø§ÙØ¹ÙÙØ§Ø¡`: the `D9 84` and `D9 85` pairs lost their second byte, so
the string cannot be round-tripped back.

| Readable | Not readable |
|---|---|
| Every measurement, colour, radius, duration, `z-index`, `data-*` hook | Every Arabic string on the screen |
| The complete inline CSS and all three `@keyframes` | The Arabic empty-state, error, and filter copy |
| The full behaviour in `<script>` — debounce, states, sort, filters, calendar, panel | The Arabic column headers and button labels |
| **Every English code comment**, which carries the reasoning | — |

**No Arabic string in this feature is transcribed from the canvas.** This spec names the
catalogue **keys**; the Arabic **values** are authored in the repository and diffed against the
vendored file when it lands. That is Q-1, and it gates the **i18n task only** — the geometry
and behaviour are fully readable, so everything else can be built.

---

## 4 · What the canvas needs that the endpoint does not have

The table that makes this two-lane. Left is drawn; right is what `GET /api/customers`
accepted before this feature.

| Canvas control | Endpoint before | This feature |
|---|---|---|
| Paged table, five columns | `?page=&pageSize=`, the shared envelope | consumes |
| Search over name, email, phone | `?search=` | consumes |
| Rows per page 10 / 20 / 50 / 100 | default 20, clamp 100, `0` → 20 | consumes |
| Skeleton · empty · no-match · error | — | consumes `Table` + `Skeleton` |
| **Sort** by name ↑↓ and created ↑↓ | **nothing.** Order fixed `FullName ASC, Id ASC` | **`?sort=&dir=`** — §5.1 |
| **Company** multi-select, searchable, with a "no company" row | **nothing**, and no endpoint returns the company list | **`?company=&noCompany=`** + a new endpoint — §5.2, §5.3 |
| **Created-date range**, Gregorian or Hijri | **nothing** | **`?createdFrom=&createdTo=`** — §5.4 |
| Row click → **detail panel** | `GET /api/customers/{id}` already returns exactly what the panel draws | consumes. The **primitive** is what is missing — §7 |
| Numbered pager `‹ 1 2 3 … 14 ›` | — | §7 |
| "137 customers · page 1 of 14" | — | §9 |
| "Open tickets only" toggle | — | **out.** The canvas itself labels it *needs `018`* and renders it disabled |

---

## 5 · The contract change

Five parameters and one endpoint. Recorded under **Contract changes** at the foot of
`008/contracts/customers-read-api.md` and in `008/plan.md` — **the frozen text is not edited
in place**, which is the rule `error-contract.md` set when `429` arrived late.

### 5.1 · `?sort=` and `?dir=`

| Parameter | Type | Default | Rules |
|---|---|---|---|
| `sort` | enum `fullName` \| `createdAtUtc` | `fullName` | An unknown value is a **`400`**, not a fallback. §5.5 |
| `dir` | enum `asc` \| `desc` | `asc` | Same |

**Every ordering ends `.ThenBy(Id)`.** The existing `FullName ASC, Id ASC` has the tiebreak
already and `008` AC-15 explains why: names are not unique (BR-4.6), and `OFFSET`/`FETCH` over
a non-total order can return one row on two pages and skip another.

**Sorting by `createdAtUtc` makes ties LIKELY rather than possible, and that changes what has
to be tested.** `RequestTimestamp` truncates to `datetime2(3)`, and `--seed` writes many
customers inside one request — so equal timestamps are the ordinary case, not the edge.
`013` measured that a repeatability test proves nothing here: it deleted its tiebreak and the
test still passed, because SQL Server agreed with itself twice over nine rows. So two tests,
and only one of them can go red for the right reason:

1. **A tie exists** — two customers with byte-identical `createdAtUtc`, asserted.
2. **A specific order** is returned across two pages with `pageSize=1`, and no id appears twice.

### 5.2 · `?company=` and `?noCompany=`

| Parameter | Type | Default | Rules |
|---|---|---|---|
| `company` | repeated string | absent | Exact match against `CompanyName`, case-insensitive. `?company=A&company=B` is OR. **Clamped to 20 values**, per BR-7.2's clamp-never-reject |
| `noCompany` | bool | `false` | `CompanyName IS NULL`. **OR-ed with `company`**, so "Acme or none" is expressible |

**`noCompany` is a separate flag, not a sentinel string inside `company`.** The canvas draws
the "no company" row as one more checkbox in the same list, which invites encoding it as a
magic value — and a real company named that string then becomes unfilterable, silently.

**Case-insensitivity comes from the column and needs no migration.**
`CustomerConfiguration.cs` already gives `CompanyName` an explicit
`SQL_Latin1_General_CP1_CI_AS`, added by `008` when it found `001` had given it to `Email`
alone. **This was checked, not assumed** — the assumed answer was a migration.

The clamp at 20 is not decoration. An unbounded repeated parameter is a query-string denial
of service and an `IN` list SQL Server has to plan, from one URL — the same shape as the
unclamped `pageSize` in `CLAUDE.md`'s write checklist.

### 5.3 · `GET /api/customers/companies` — new

The filter panel needs the list of companies to offer. Nothing returns it.

```http
GET /api/customers/companies?search=gulf&limit=50
```

```json
{ "items": ["Gulf Logistics Co.", "Gulf Services Ltd."], "hasUncompanied": true }
```

| Part | Rules |
|---|---|
| `search` | Case-insensitive substring, same provider-escaped `Contains` as the list. Trimmed; whitespace-only is absent |
| `limit` | Default 50, clamped to 100 |
| `items` | Distinct non-null `CompanyName` of **active** customers, ordered `ASC`, capped at `limit` |
| `hasUncompanied` | Whether any active customer has no company — so the "no company" row is offered only when it would match something |
| Auth | Both roles, like the rest of `008`. No `403` |

**`IsActive` is filtered here too, and its absence would be invisible.** A deactivated
customer's company would appear in the panel and then match zero rows — a filter that
returns nothing, on a name the UI itself offered. The list endpoint has filtered on
`IsActive` since `008` Q-1; the two must agree or the panel lies.

**The panel's company search is server-backed, which is an adjustment to the canvas.** The
canvas filters a hard-coded array of six in the browser. With 137 customers the whole set
would fit; the mechanism has to be the one that still works at 10,000, and a client-side
filter over a truncated list silently hides companies that exist. Cost: a 250 ms debounce on
that input, where the canvas is instant.

### 5.4 · `?createdFrom=` and `?createdTo=`

| Parameter | Type | Rules |
|---|---|---|
| `createdFrom` | `yyyy-MM-dd` | Inclusive. Interpreted as **UTC midnight** |
| `createdTo` | `yyyy-MM-dd` | Inclusive **to the end of that day**: `CreatedAtUtc < createdTo + 1 day` |

**`createdTo` is the one that fails quietly.** `<= createdTo` parsed as a date is
`<= 00:00:00` on that day, which excludes every customer created during it. The filter looks
correct, returns rows, and drops exactly the newest day — the one a user filtering *to today*
is asking about. A test asserts a customer created at `23:59:59.999` on `createdTo` is
**included**.

**An inverted range is an empty page, not a `400`.** `createdFrom > createdTo` describes a
window with nothing in it, `totalCount: 0` says exactly that, and BR-7.6's "empty is `[]`,
never `null`" already covers the shape. A `400` would be the client having to handle an error
for a state the UI can render.

Dates are **date-only on the wire**, not timestamps. A client sending an instant would be
sending a timezone question the contract does not answer.

### 5.5 · Why an unknown `sort` is a `400` when an out-of-range `pageSize` is clamped

The distinction already exists in this contract and is stated so nobody "fixes" it:
*"An out-of-range **value** is clamped; a non-integer is a `400`, because there is nothing to
clamp."* `pageSize=500` has an obvious nearest legal value. `sort=email` does not — silently
sorting by name instead returns a correct-looking page in the wrong order, which is the
failure the client cannot see. Both go through `ValidationBehaviour`, so the message is a
catalogue key and the `errors` key is the parameter name.

### 5.6 · Indexes — not added, with the trigger written down

`CustomerConfiguration.cs` records why there is no index on `FullName`: the search is
`LIKE '%term%'` and no index serves a leading wildcard. **Sorting is a different workload and
an index would serve it** — as would one on `CreatedAtUtc` for the range filter, which is
sargable.

**None is added here.** The table holds 137 rows in the demo database and the default order
has been an unindexed sort since `008` shipped, so this feature adds no new cost. The trigger
is written instead: **when `dbo.Customers` passes ~50,000 rows, or when a filtered range query
appears in a slow-query log**, an index on `CreatedAtUtc` and one on `CompanyName` are the
first two to add. Recorded so the next reader does not have to re-derive it, and so nobody
adds two indexes to a 137-row table on the strength of this spec.

---

## 6 · What the built endpoint already does that the contract does not say

Read from the code, not from the contract. `CLAUDE.md`: a difference between a contract and
the build is a defect in one of the two and is never fixed silently.

| # | Contract | Build | This feature |
|---|---|---|---|
| 6.1 | Nothing about `IsActive` filtering on the list | `Filter` applies `.Where(c => c.IsActive)`, from `008` Q-1 | Codes against the build, and §5.3 makes the new endpoint agree. **The contract text should say so** — raised, not fixed here |
| 6.2 | Search escaping unspecified | Measured in `008`: EF Core 10 builds the `LIKE` pattern **and** escapes the term, emitting its own `ESCAPE N'\'`. A search for `%` returns 0, not everything | The company search in §5.3 inherits this. **No hand-rolled escaper** — `008` proved one would double-escape |
| 6.3 | `CustomerListItem` is six fields | Same, and `AC-17` asserts the absence over the **raw response text** rather than over the type | Unchanged. The panel's extra fields come from `GET /api/customers/{id}`, a different shape |

---

## 7 · The components this needs, and the cap

`component-inventory.md` caps the primitives at eight and names them: **Button, Input,
Select, Checkbox, Badge, Table, Modal, Toast**. Built: Button, Input, `Dropdown` (the
inventory's *Select*, `031`), Checkbox, Badge, Table, Toast — **seven**. `Modal` is the eighth
and unbuilt. `Textarea` and `Loader`/`Skeleton` are outside the eight with written reasons.

This canvas asks for two things that are outside it. **Both need a written reason, and both
have one.**

| Needed | Status | Ruling |
|---|---|---|
| **`Panel`** — the 480px side sheet the row opens | **Not built, not inventoried.** `030` owns it, calls it a Panel, specifies four variants and three widths — and is **APPROVED FOR SPEC, NOT FOR IMPLEMENTATION**, blocked on its own Q-1 | **Built here, as the one variant this screen needs**, and `030` **adopts and extends it** rather than building a second. This is exactly what `026` did with `Table`: the first real consumer builds the primitive, because geometry cannot be designed from a gallery. Scoped: inline-end, one width, read-only body, footer slot, focus trap, `Escape`, scrim. **`030` still owns the tones, the stacking rule and the other three variants** |
| **`DateRangePicker`** — two fields and the calendar | **Not built, not inventoried, not one of the eight**, and the largest single item in this feature: day / month / year modes, a Hijri display toggle, and viewport flipping | **Built here**, and named the **ninth** with its reason: a range filter cannot be expressed by any built primitive, and the alternative — native `<input type="date">` — is refused for three measured reasons in §7.1 |
| `Table` gains a **sort affordance** | `Table` is built and this changes it | **Changed here**, which answers `026/table-primitive.md` **Q-T-3** — asked against this same canvas on 2026-08-29 and open since. §7.2 |
| **`TablePager`** — numbered, with an ellipsis | Not built. The ticket list has prev/next only, local to `TicketListPage.tsx` | **Promoted into `components/Table/`**, and `TicketListPage` migrated onto it. `component-inventory.md` already assigns the pagination footer to `Table`, so this is not a tenth primitive. §7.3 |
| Filter chips | — | **Feature-local.** One screen's control until a second wants it |

**After this feature the set is `Modal` plus two admitted exceptions.** Recorded because a cap
that stops being counted is not a cap.

### 7.1 · Why not `<input type="date">`

1. **`031` deleted every native `<select>` and gated it** — `npm run lint:select`. The reason
   given there applies unchanged: a native control cannot be styled to the system, and its
   popup is the browser's.
2. **Its calendar is not RTL-aware and not localisable by us.** The month names, the first day
   of the week, and the direction come from the browser's locale, not the app's — so an Arabic
   user on an English browser gets an English calendar inside an RTL screen, and no test sees
   it because the popup is not in the DOM.
3. **The Hijri view is unreachable.** §8 row 5.

### 7.2 · The sort affordance — `Table` owns the control, the caller owns the request

`TableColumn<TRow>` gains `sortable?: boolean`, and `TableProps` gains
`sort?: { id: string; dir: 'asc' | 'desc' }` plus `onSort?: (id) => void`. The primitive
renders the header button, the arrow, and the `aria-sort` attribute; it **never reorders
rows** and holds no state.

That boundary is the same one `Badge` and `Table` already hold — the primitive takes the
geometry, not the domain. A `Table` that sorted its own rows would be a `Table` that breaks
paging, which is the defect `026` AC-026-17 exists to prevent and which **the canvas's own
script commits** (§15).

### 7.3 · The pager, and the delivered screen it changes

`TicketListPage` is migrated onto the shared pager in this feature. That changes a screen
delivered by `026`, and it is stated here rather than discovered in a diff. The alternative
is two lists in one product paging differently, and the ticket list's copy becoming the one
that gets fixed. `026` set the precedent for adopting a canvas's table decisions
system-wide; this is the same claim about the footer.

---

## 8 · Canvas versus house documents — seven disagreements

| # | Canvas | House document | Ruling |
|---|---|---|---|
| 1 | Columns: name, email, phone, company, **created** | `06`: name, email, phone, company, **tickets count** | **Canvas wins, with a reason:** `CustomerListItem` carries `createdAtUtc` and no ticket count, and the count is the N+1 `008` used as its own negative control. **`06` is amended in the same commit as the code** |
| 2 | A **filter panel** | `06`: *"no tabs, no filter panel … adding a panel with one control in it would be furniture"* | **Canvas wins.** `06`'s reason was *one* control; the canvas has three, and the product owner ruled for the drawing. `06` is amended |
| 3 | **Sortable** headers | `06` names no sort; `026` §4 removed sorting from the ticket list because *"no story specifies it"* | **Canvas wins**, and `026` Q-T-3 is answered (§7.2). **The ticket list is not given sorting here** — that needs `010`'s contract reopened, and nobody asked |
| 4 | Row click → **panel** | `06`: navigate to `/customers/:id` | **Both.** The panel opens on row click; its footer navigates to `032`'s profile. The canvas draws exactly this — a *"open full profile"* button in the panel footer |
| 5 | A **Hijri** toggle in the calendar | ADR-007 §7 pins `ar-u-ca-gregory-nu-latn`, Gregorian, Latin digits | **Canvas wins, narrowly and with a boundary:** ADR-007 governs how a date is **displayed**; nothing in it governs date **entry**, and this is the product's first date input. The toggle changes the calendar's own labels only. **The value sent to the server is always ISO Gregorian**, and every date rendered in the table stays `lib/formatters.ts`. The canvas already uses `-nu-latn` on the Hijri formatter for the same reason. **Recorded as an addition to ADR-007's territory, not a contradiction of it** |
| 6 | Page numbers **Latin** with `tabular-nums` | `026` §6 ruled page numbers **Arabic-Indic** under `ar`, via `ar-u-nu-arab`, because BR-8.13 pins Latin digits to identifiers and timestamps and a page number is neither | **House wins.** Nine features old, tested, shipped, and `formatNumber` already does it |
| 7 | Search debounce **350 ms** | `06`: **300 ms** | **House wins** — 300 ms. Not worth a second number in the product |

Rows 1 and 2 both amend `06-customers-list.md`. **A blueprint amended by a canvas drawn later
is a real change and is committed as one** — the failure mode is `026`'s, where a canvas and a
spec disagreed and the disagreement was left standing for someone to find.

---

## 9 · The counted noun, which `026` deferred and this feature does not

The canvas's subtitle is *"137 customers · page 1 of 14"*. `026` excluded every counted noun
because BR-8.14 requires all six Arabic CLDR plural categories and one string is wrong for 2,
for 3–10, and again above 10.

**`react-i18next` implements the six categories natively** —
`_zero`, `_one`, `_two`, `_few`, `_many`, `_other` on the key. So this is a copy task, not a
technical one, and the canvas asks for the string. **Both catalogues carry all six forms**, the
parity gate covers them, and a test renders 0, 1, 2, 3, 11 and 100 in Arabic and asserts six
distinct strings.

`"1–10 of 137"` is **not** a counted noun — no noun agrees with anything in it — and needs
none of this. The distinction is worth stating because the two sit side by side in the footer.

---

## 10 · In scope

**Backend — `BE-033-*`**

- `GetCustomersQuery` gains `Sort`, `Dir`, `Company[]`, `NoCompany`, `CreatedFrom`, `CreatedTo`
- `GetCustomersQueryHandler.Filter` extended; the ordering becomes a switch that **always**
  ends `.ThenBy(Id)`
- `GetCustomersQueryValidator` — the two enums, the 20-value clamp, the date shapes. Messages
  are catalogue keys in `en` + `ar` (`002c`'s gate)
- `GET /api/customers/companies` — new use-case folder `GetCustomerCompanies/`, controller
  action, `[Authorize]`
- The contract amendment under **Contract changes**, and `008/plan.md`
- Integration tests, including the two tie tests (§5.1), the end-of-day test (§5.4), and a
  `CountQueries()` assertion that selecting 1 company and 20 companies issue the **same**
  number of round trips
- **No migration.** The collation is already there (§5.2) and no index is added (§5.6)

**Frontend — `FE-033-*`**

- `/customers` replacing the `023` placeholder; `features/customers/` — `CustomersListPage`,
  `customers.api.ts`, `CustomerFilters`, `FilterChips`, `CustomerPanel` content, one module CSS
- `CustomersListPage` is the **only** thing that fetches (ADR-011 §4)
- Five columns; sort on name and created; the filter panel; chips; numbered pager; rows per page
- **Every filter, the sort, the page and the search in the URL** (ADR-011 §2)
- `components/Panel/` — the primitive, §7
- `components/DateRangePicker/` — the primitive, §7.1
- `components/Table/` — the sort affordance (§7.2) and `TablePager` (§7.3), plus migrating
  `TicketListPage`
- Seven states: loading · loaded · refetching · empty-no-customers · empty-no-matches ·
  past-the-end · error
- The panel's four states: loading · loaded · not-found · error
- Deleting `STUBBED_CUSTOMER_SEARCH` and its branch — §11
- `CustomerDetail` in `api-types.provisional.ts` **only if `032` has not added it** — §12
- ~45 catalogue keys × 2, including the six plural forms; parity-gated
- The Arabic walk, recorded
- **Previews before wiring** (ADR-009), Arabic first: the list, the panel, the calendar

## 11 · Out of scope

| Excluded | Where |
|---|---|
| "Open tickets only" | `018`. The canvas says so itself |
| Ticket-count column | `018` |
| The customer **profile** at `/customers/:id`, and the **create** form | **`032`**, approved. Linked to, never built here |
| Editing, deactivating, reactivating, merging | `017`, and reactivation is undesigned in `007`'s contract |
| Import, export, bulk actions, saved views, column configuration, inline editing, infinite scroll | Out of scope in US-002 |
| Sorting on the **ticket** list | Needs `010`'s contract reopened. Not asked for |
| `030`'s toast tones, `Modal`, the other three panel variants and widths | `030` |
| Types generated from OpenAPI | `028` |
| An index on `CreatedAtUtc` or `CompanyName` | §5.6, with the trigger written down |

---

## 12 · The stub that is a false statement

`features/tickets/tickets.api.ts` carries, today:

```ts
/* `GET /api/customers` IS NOT BUILT (spec Q-1). Its contract is frozen, so the
 * shape below is real; only the transport is stubbed. */
export const STUBBED_CUSTOMER_SEARCH = true;
```

**The endpoint has been built for three days.** `008` delivered it 2026-08-28 and the comment
was true when written. Its own instruction is that the swap is *"deleting the stub and the
branch — not editing a hook until it works"*, and `STUBBED_CUSTOMER_SEARCH` was made
greppable for this moment.

It belongs here because **this feature is the first code that calls the endpoint at all**, so
it is the first thing that can prove the real transport works. Flipping the picker without a
screen that exercises the endpoint moves it from an honest stub to a live call nobody has
watched succeed — and the picker is inside a form that currently works.

The four stub customers go with it. Their Arabic-and-Latin mix is deliberate, and its purpose —
proving a result row needs bidi isolation — moves to the previews, which need the same mix.

## 12b · One provisional type, and who declares it

`CustomerListItem` and `PagedResult<T>` are **already** in `api-types.provisional.ts` from
this same frozen contract. Neither is redeclared. The panel needs `CustomerDetail`, which
**`032` `FE-032-01` also adds** — whichever feature lands first declares it, and the second
reuses it. **Stated here because two features adding the same interface to one file is a merge
conflict that resolves silently and wrongly**, by keeping both.

---

## 13 · Acceptance criteria

### Backend

| # | Criterion |
|---|---|
| AC-033-01 | `?sort=fullName&dir=desc`, `?sort=createdAtUtc&dir=asc`, and `desc` on both return the four distinct orders, asserted on a specific sequence — not on two requests agreeing |
| AC-033-02 | **A tie exists**: two customers with byte-identical `createdAtUtc`, asserted from the response. Without it AC-033-03 passes on data that never tied |
| AC-033-03 | With `pageSize=1` and `sort=createdAtUtc`, a full traversal returns every id exactly once. The tiebreak is deleted, the test goes red, and that is **recorded** (`013`'s rule: a guard never seen to fail is unverified) |
| AC-033-04 | `?sort=email` and `?dir=sideways` are each `400 errors/validation` naming the parameter, with a **message read as a string** — not a fallback to the default order, and not a raw resource key |
| AC-033-05 | `?company=A&company=B` returns rows from either. `?noCompany=true` returns only rows with no company. Both together return the union |
| AC-033-06 | Company matching is case-insensitive, asserted against a differently-cased value — and the collation is read back from `INFORMATION_SCHEMA`, the way `008` AC-16 does it, because the C# reads identically either way |
| AC-033-07 | 21 `company` values clamp to 20 and return `200`, never `400` |
| AC-033-08 | A customer created at `23:59:59.999` UTC on `createdTo` **is included**. A customer created at `00:00:00.000` on `createdFrom` is included |
| AC-033-09 | `createdFrom` later than `createdTo` returns `200` with `items: []` and `totalCount: 0` |
| AC-033-10 | `GET /api/customers/companies` returns distinct, ordered, active-only company names; `?search=` filters case-insensitively; `?limit=` clamps at 100; `hasUncompanied` reflects reality |
| AC-033-11 | A **deactivated** customer's company does **not** appear in `/companies`, and its rows do not appear in the list — asserted together, because one without the other is a filter that offers a value matching nothing |
| AC-033-12 | `factory.CountQueries()` over one selected company **equals** the count over twenty. Not "under a threshold" — a threshold drifts |
| AC-033-13 | Every filter combination is one round trip for the page plus one for the count, unchanged from `008` |
| AC-033-14 | The generated OpenAPI matches the amended contract, both directions, via `OpenApiContractTests` |
| AC-033-15 | The whole suite is run and its output recorded. No `--filter` result is offered as proof |

### Frontend

| # | Criterion |
|---|---|
| AC-033-16 | `/customers` renders the real list from the real API in a browser, signed in, in both locales. The `023` placeholder is gone |
| AC-033-17 | Five columns: name and company `<bdi>`-isolated per `026` §4.3 (**never `dir="auto"`**), email `dir="ltr"`, phone `dir="ltr"` + `tabular-nums` + **Latin digits in Arabic too**, created via `lib/formatters.ts` |
| AC-033-18 | An absent `email`, `phone` or `companyName` renders a muted em-dash — not an empty cell, not `null` |
| AC-033-19 | `search`, `sort`, `dir`, `page`, `pageSize`, `company`, `noCompany`, `createdFrom`, `createdTo` **all live in the URL**. A pasted URL carrying every one of them reproduces the screen, and Back returns to the previous state |
| AC-033-20 | The footer, the rows-per-page control and the sort arrows render what the **server returned**. Proven with `?pageSize=500` (clamped to 100) and `?page=0` (clamped to 1) |
| AC-033-21 | **The client never sorts, re-sorts or filters rows.** Every control issues a request. Gated the way `026`'s cache rule is gated |
| AC-033-22 | Loading renders `Skeleton` rows at the **same measured height** as real rows. Announced once, not once per row |
| AC-033-23 | Every refetch — page, size, sort, search, filter — **dims and keeps the rows** with `029`'s Bar; none swaps them for skeletons |
| AC-033-24 | `totalCount === 0` with no filter renders **no customers**; with any filter or search it renders **no matches**, carrying the term, offering *clear* and *create with this term*. **Two components, never one** |
| AC-033-25 | `items: []` with `totalCount > 0` renders the past-the-end state and offers page 1 from `totalPages` |
| AC-033-26 | An unreachable API renders the error state with the message, the `traceId`, and a retry that works. Verified with the API stopped |
| AC-033-27 | A `401` redirects to sign-in and is **not** a list state. `lib/api.ts` owns it |
| AC-033-28 | A chip per active filter; removing one re-requests. The date range is **one** chip, not two — it is one question the user asked |
| AC-033-29 | The filter badge counts the range as **one** condition |
| AC-033-30 | The company list comes from `/companies`, debounced; its own loading state is `029`'s `Skeleton` menu rows, and "no company matches" is distinct from "still loading" |
| AC-033-31 | The calendar: day / month / year modes, flips up near the viewport foot, closes on `Escape` and on outside click, and is keyboard-navigable. Every arrow **mirrors** in RTL |
| AC-033-32 | The Hijri toggle changes only the calendar's own labels. The value submitted is **ISO Gregorian** in both modes, asserted on the request — and every date in the table stays Gregorian |
| AC-033-33 | The panel opens on row click, traps focus, closes on `Escape` and on the scrim, and returns focus to the row that opened it |
| AC-033-34 | The panel renders four states from `GET /api/customers/{id}`: loading (header **blanked, not hidden** — the close button must not move) · loaded · not-found · error with `traceId` |
| AC-033-35 | Empty notes are a **muted line**, asserted distinct from both the skeleton and the error state — three states that all show no notes to a shape assertion |
| AC-033-36 | The panel's footer navigates to `032`'s `/customers/:id`. If `032` has not landed, the control is **absent, not disabled** |
| AC-033-37 | `Panel` and `DateRangePicker` each render every state in isolation in `/_preview`, and neither imports a domain type |
| AC-033-38 | `Table`'s sort affordance renders `aria-sort` and **reorders nothing**. The `026` ticket list still passes its own suite unchanged after the pager migration |
| AC-033-39 | The count string renders six distinct Arabic forms for 0, 1, 2, 3, 11 and 100 |
| AC-033-40 | Page numbers are **Arabic-Indic** under `ar`; ids, phone numbers and dates stay Latin |
| AC-033-41 | The screen is walked in Arabic: column order reverses, pager and calendar chevrons mirror, the search icon does not, the panel enters from the inline-end, dates carry **no `U+200F` inside the string**. Findings recorded, including "nothing found" if that is the truth |
| AC-033-42 | A Latin name in a column of Arabic ones starts on the **same inline edge** as its neighbours |
| AC-033-43 | Real `<table>` with `<th scope="col">`; every row keyboard-reachable and activating it opens the panel; focus rings visible throughout |
| AC-033-44 | `STUBBED_CUSTOMER_SEARCH`, its branch and `STUB_CUSTOMERS` are **deleted**, `grep` finds none of the three, and the picker in `/tickets/new` returns real customers |
| AC-033-45 | No hex, no raw px radius or spacing, no `left`/`right` in any module CSS. The canvas's ~60 literals are mapped to semantic tokens and **the mapping is recorded** |
| AC-033-46 | Every user-facing string is a key in `en` **and** `ar`; `lint:i18n` passes |
| AC-033-47 | Previews rendered and reviewed **before** any wiring, **Arabic first**: 100 rows, a 120-character Arabic name, a Latin name, rows missing each optional field, and every state |
| AC-033-48 | `npm run build`, `lint`, `lint:css`, `lint:i18n`, `lint:types`, `lint:select`, `lint:tokens`, `typecheck`, `test` — all pass, zero warnings |

---

## 14 · Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | The product owner accepts amending `008`'s frozen contract, which §4 makes unavoidable | The feature reverts to the subset chosen earlier on 2026-08-31 and the canvas is not built as drawn |
| A-2 | `030` will adopt this feature's `Panel` rather than build a second | Two panels, which is the outcome `030` exists to prevent. Raised at `030`'s review |
| A-3 | `032` lands, so the panel footer and the two create CTAs have destinations | Both controls are **absent, not disabled** (AC-033-36) |
| A-4 | The seeded database holds enough customers, companies and dates to exercise every filter | The API-facing criteria are not provable; the previews still prove the states. **`--seed` writes customers with raw SQL, so `Customer` timestamps are a known blind spot** — `007` found `0001-01-01` on the first real `201` |
| A-5 | Five columns fit at 1280px and 880px | `026` Q-T-2 records eight overflowing at 880. If five do, it is a `Table` finding and goes back to `026`'s document — **never fixed locally** |
| A-6 | The tokens exist after `026` and `029` | A missing token goes to the design docs and returns as a token. **Never invented in a stylesheet** — DESIGN-BRIEF rule 3 |

---

## 15 · Open questions

| # | Question | Why it matters | Working assumption |
|---|---|---|---|
| **Q-1** | The canvas is **not in the repository** and its **Arabic cannot be read** (§3) | Arabic transcribed from mojibake is copy nobody reviewed, wearing a reviewed design's authority | **Build from the geometry, which is complete. Author the Arabic and mark it unreviewed.** Gates the i18n task only. When the file lands, its strings replace the authored ones and the diff is copy-only |
| **Q-2** | This is a **two-lane feature with two new primitives, a `Table` change, a contract amendment and a new endpoint**. It is roughly the size of `026` plus `031` | One spec that large is one review that cannot be done in one sitting, and a partial build has no defined stopping point | **Four stages, each shippable, in this order: (1)** sort — contract, endpoint, `Table` affordance, list screen, pager, states, panel-less; **(2)** company filter — `/companies`, the panel's filter UI, chips; **(3)** date range — `DateRangePicker`; **(4)** the detail `Panel`. **The screen is coherent after each.** If the product owner prefers, stages 2–4 become their own numbered features and this spec is their parent |
| **Q-3** | `030` owns `Panel` and is approved for spec only. This feature builds one (§7) | Either this feature waits on a blocked feature, or `030` inherits a primitive it did not design | **Build it, scoped to one variant, and `030` adopts it.** The `026`/`Table` precedent. **`030`'s reviewer must be told**, and this is that notice |
| **Q-4** | `DateRangePicker` is the **ninth** component outside the cap (§7) | The cap is the mechanism that stops a component library growing by accident | **Admitted with the reason in §7.1**, and `component-inventory.md` gains the row in the same commit — the way `029` added `Skeleton`'s |
| **Q-5** | The Hijri toggle sits outside ADR-007's territory (§8 row 5) | The first date **input** in the product, and the first Hijri anything | **Display-only inside the calendar; the wire value is always ISO Gregorian.** ADR-007 gains a sentence about entry. **If the product owner would rather not ship a Hijri view at all, the toggle is one boolean to remove** and nothing else changes |
| **Q-6** | *Create with this term* — into which field? Search matches name, email and phone | Pre-filling the wrong field is worse than pre-filling none: the user submits it | **Pass the term in navigation state; `032`'s form decides**, since it owns the fields and their validation. `06` says the CTA *"carries the search term"* and not where. Recorded in `032` too |
| **Q-7** | `06`'s *illustration* for the empty state does not exist as an asset | An invented illustration looks deliberate and is not | **The canvas's tiled brand pattern behind a circled glyph**, which `Table`'s empty state already supports (`026` §5). Recorded as `(D)` |
| **Q-8** | §6.1 — the contract does not say the list filters on `IsActive`, and the build has since `008` | A contract that omits a filter is a contract a client codes against wrongly | **Raise it; do not fix it here.** It is `008`'s text, and this feature's amendment section names it so the correction is not lost |

---

## 16 · Deviations

| Deviation | Reason | Removed when |
|---|---|---|
| `008`'s **frozen contract is amended** | §4 — three canvas controls have no parameter. Recorded under **Contract changes**, never edited in place | Not removed |
| `06-customers-list.md`'s **tickets-count column → created** | §8 row 1. No endpoint feeds a count | `018`, with a query that supports it |
| `06`'s **"no filter panel"** is overruled | §8 row 2. Its reason was one control; there are three | Not removed |
| The **panel's company search is server-backed**, where the canvas filters in the browser | §5.3 — a client filter over a truncated list hides companies that exist | Not removed |
| **`Panel` is built outside `030`** | Q-3 | `030` adopts it |
| **`DateRangePicker` exceeds the eight** | Q-4 | Not removed. Inventoried in the same commit |
| **`Table` is modified** | §7.2, answering `026` Q-T-3 | Not removed |
| **`TicketListPage`'s footer is replaced** | §7.3. A delivered screen changes, stated not discovered | Not removed |
| Page numbers **Arabic-Indic** against the canvas's Latin | §8 row 6 | Not removed |
| Debounce **300 ms** against the canvas's 350 | §8 row 7 | Not removed |
| Default `pageSize` **10**, not the contract's 20 | `Table`'s ten-row viewport is a measured constant (`026` §3). The client sends it explicitly, which is not a contract change | Not removed |
| Row density **`dense` (62px)** against the canvas's computed 61 | The primitive's measured number beats a derived one; one pixel is not a fourth density | Not removed |
| A **Hijri** calendar view | Q-5, §8 row 5 | If ruled against — one boolean |
| **Hand-written API types**, against ADR-011 §6 | The 2026-08-26 exception, conditions in `024` §5. At most **one** interface added, and `032` may add it first (§12b) | `028`. The file is **deleted**, not edited |
| Arabic copy authored, not taken from the canvas | Q-1 | When the file is vendored readable |

---

## 17 · What fails silently here

| Silent failure | Why nobody notices | Caught by |
|---|---|---|
| **`createdTo` as `<= midnight`** | The filter works, returns rows, and drops exactly the newest day — the one a user filtering *to today* is asking about | AC-033-08 |
| **A missing `.ThenBy(Id)` on a new sort** | `createdAtUtc` ties are the ordinary case here, not the edge, so a page repeats one customer and skips another. `013` deleted its tiebreak and the repeatability test **still passed** | AC-033-02 + AC-033-03, and the deliberate break |
| **`noCompany` encoded as a magic string in `company`** | Works until a company is actually named that, and then that company is unfilterable | §5.2, AC-033-05 |
| **`IsActive` forgotten on `/companies`** | The panel offers a company that matches zero rows. Reads as a broken filter, not as a missing `WHERE` | AC-033-11, which asserts both halves together |
| **An unknown `sort` falling back to the default** | A correct-looking page in the wrong order. The client cannot see it and no status code says so | AC-033-04 |
| **A hand-rolled `LIKE` escaper** | `008` measured that EF Core 10 escapes the term itself. A second escaper double-escapes, and a customer with a backslash becomes unfindable — while the test asserting `100%` matches nothing still passes | §6.2 |
| **`dir="auto"` on the name cell instead of `<bdi>`** | Both isolate the run; only `dir="auto"` rewrites the element's direction, and `text-align: start` resolves against **that**. One Latin name in a column of Arabic ones aligns to the opposite edge | AC-033-42. Measured in `026` §4.3 |
| **A local `Intl.DateTimeFormat` instead of `lib/formatters.ts`** | Under `ar` the engine puts `U+200F` **inside** the string. Text content correct, digits Latin, every assertion passes — and it renders `292026/08/` | AC-033-17, AC-033-41 |
| **The Hijri toggle leaking into the wire value** | The server receives a Hijri date it parses as Gregorian. Off by ~580 years, and only for users who touched the toggle | AC-033-32 |
| **Client-side filtering or sorting "so it feels instant"** | Right on the page you are looking at, wrong for every row on the other thirteen. **The canvas's own script does this** — `apply()` filters DOM rows and `applySort()` re-sorts one page, directly beneath a comment saying sorting is a request. It is a preview stand-in and reads as an implementation | AC-033-21 |
| **Rendering the requested `pageSize`** | Everything agrees until someone types `?pageSize=500`, and the control says 500 above 100 rows | AC-033-20 |
| **One empty state for *no customers* and *no matches*** | They are the same component until the moment they must differ — which is exactly when a user is about to create the duplicate this screen exists to prevent | AC-033-24 |
| **A `401` handled as a list error** | "Customers could not be loaded" on an expired session, with a retry that fails forever | AC-033-27 |
| **The panel's header hidden rather than blanked while loading** | The close button moves — the one control that must never move | AC-033-34 |
| **Empty notes rendered as an absent section** | Indistinguishable from *nothing loaded*, on a panel whose job is telling you what is on file | AC-033-35 |
| **Skeleton height derived from CSS rather than the primitive's constant** | The table jumps once on load and reads as jank, not as a wrong number | AC-033-22 |
| **Replacing rows with skeletons on a keystroke** | A fast interaction looks slow and the user loses their place. **The canvas gets this right** — it dims to `.45` and keeps the rows — and it is the easy thing to lose in translation | AC-033-23 |
| **A phone number left to inherit RTL** | `+966` lands on the wrong end. Reads as a rendering bug, and the number gets **dialled wrong** | AC-033-17 |
| **Two features declaring `CustomerDetail` in one file** | A merge that resolves by keeping both, and a type that then depends on import order | §12b |
| **Arabic transcribed from the mojibake** | Plausible Arabic no reviewer wrote, carrying a reviewed design's authority | Q-1 |
| **Indexes added to a 137-row table on this spec's authority** | Two indexes maintained on every write, serving a measurement nobody took | §5.6, which writes the trigger instead |

---

## 18 · Rules referenced

**ADR-006/ADR-013** `rowversion`, filtered indexes, CI collation, `datetime2(3)`, `nvarchar` ·
**ADR-007** §6 logical properties · §7 Gregorian + Latin digits, **extended to date entry by
§8 row 5** · §8 user-content isolation · **ADR-009** the cap and preview-before-build ·
**ADR-011** §1 no global store · §2 the URL is the state · §3 promotion · §4 only the route
fetches · §5 empty is data · §6 generated types ·
**BR-4** the duplicate rule this screen prevents · **BR-4.2** the normalised email ·
**BR-4.6** names are not unique — why `Id` is the tiebreak · **BR-6** both roles read, no `403` ·
**BR-7.2** clamp, never reject — and §5.5 on where that stops · **BR-7.6** `[]`, never `null` ·
**BR-8.6** the server localises what it authors · **BR-8.8** no hard-coded string ·
**BR-8.11** catalogue parity · **BR-8.13** Latin digits for identifiers and timestamps, and
**not** for page numbers · **BR-8.14** six Arabic plural categories — §9 ·
**BR-9** a query is not auditable and opens no transaction ·
**`026/table-primitive.md`** §3 constants · §4.2 the flyout floor · §4.3 `<bdi>` · §4.4 the
rule-17 override · Q-T-2 · **Q-T-3, answered by §7.2** ·
**`029`** the waiting vocabulary — no new spinner, `Skeleton` for shape, Bar for refetch ·
**`031`** no native control — §7.1 ·
**`06-customers-list.md`**, amended by §8 rows 1 and 2 ·
**DESIGN-BRIEF rule 3** never invent a token · rule 14 never colour alone ·
**constitution I** open questions instead of guesses · **II** evidence over assertion ·
**III** the client mirrors, and is never the authority · **V** structural over remembered.
