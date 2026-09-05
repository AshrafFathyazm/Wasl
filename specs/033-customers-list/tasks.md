# `033` — Tasks

**Lane:** backend + frontend · **Approved for implementation:** product owner, 2026-09-01
(«033 كامل بدون Panel»)
**Owner of every row:** this session. No subagent was dispatched, so `tests.md` records
the measurements of one worker rather than accepted outputs of several.

Order is dependency order: the contract change is frozen first, the backend answers it,
the client reads it, and the two primitives are extracted before the screen that needs
them.

## The contract, and the endpoint behind it

| # | Task | Owner | Skill | Closes |
|---|---|---|---|---|
| DOC-033-01 | `contracts/customers-read-api.md` — the seven new parameters, the companies endpoint, and every change recorded **at the foot** rather than edited into the body | session | — | §3 |
| BE-033-02 | `GetCustomers/CustomerFilters.cs` — `Companies()` (trim · dedupe CI · clamp 20), `Parse<TEnum>`, `IsUnreadable`, `Accepted`, and the **digit guard** that makes `?sort=1` a `400` | session | dotnet-architect | §5.2 |
| BE-033-03 | `GetCustomersQuery` — seven parameters with `Effective*` properties, and the inverted-range divergence documented in the remarks | session | dotnet-architect | §5.1 |
| BE-033-04 | `GetCustomersQueryValidator` — calendar checked **before** the bounds | session | — | §5.4 |
| BE-033-05 | `GetCustomersQueryHandler` — company/noCompany OR-ed as one key, `>= from` and `< to.AddDays(1)`, every ordering branch ending `.ThenBy(c => c.Id)` | session | dotnet-architect | BR-7.3 · BR-7.4 |
| BE-033-06 | `GetCustomerCompanies` — the vocabulary, with `hasUncompanied` as its **own** `AnyAsync` because a capped list cannot answer it | session | — | §6 |
| BE-033-07 | `CustomersController` — the seven `[FromQuery]` parameters bound as `string`/`string[]`, with the binder-refusal reason written down | session | — | §5 |
| TEST-033-08 | `CustomerFilterTests` — 28 tests, own `SeedAsync` carrying `createdAtUtc`, six controls | session | — | every backend AC |

## The screen

| # | Task | Owner | Skill | Closes |
|---|---|---|---|---|
| FE-033-09 | `components/Table/TablePager` — **promoted** out of the ticket list, exporting `pageWindow`, reading `common:pager.*` | session | — | §7.1 |
| FE-033-10 | `components/DateRangePicker/DateField` — promoted from `TicketDateField`, `common` only | session | — | §7.3 |
| FE-033-11 | `customers.api.ts` — `listCustomers`, `getCustomerCompanies`, `customerKeys` | session | — | §10 |
| FE-033-12 | `customerFilters.ts` — the URL **is** the state: whitelists, `knownIsoDay` by round trip, the 20-clamp, and `isFilteringCustomers` where **sort is not a filter** | session | — | §10 |
| FE-033-13 | `CustomersListPage` — five columns, three ordered empty states, the no-match CTA carrying the term into `/customers/new?name=` | session | frontend-design | §4 |
| FE-033-14 | `CustomerFilterBar` — debounced search, a panel that applies on «تطبيق», the company vocabulary fetched **only while open** | session | frontend-design | §4.2 |
| FE-033-15 | `routes.tsx` — `/customers` replaces `023`'s placeholder | session | — | Q-1 |
| TEST-033-16 | `CustomersListPage.test.tsx` — 20 tests | session | — | frontend ACs |

## What the review of the two screens then forced

Not planned. Each row is a defect found by putting the two list screens beside each other
on 2026-09-02, and each is measured in `tests.md`.

| # | Task | Owner | Closes |
|---|---|---|---|
| FE-033-17 | Move the toolbar to the second row and pin it — the only arrangement whose x is independent of the primary action's label | session | «واماكن الحبث والفلاتر في نفس المكان» |
| FE-033-18 | One تصفية button: the customer bar's hand-rolled one deleted, the `Button` primitive used on both | session | same |
| FE-033-19 | One owner for the space above the first heading — the shell drops to `--space-6` at the top, and two stray margins go | session | «مساحة فوق في الصفحه فاضيه كبيره جدا» |
| FE-033-20 | The flex wrapper on every truncating cell, so the box follows the page and the ellipsis follows the words | session | «الهيدر مش تحته الرو الخاص بيه» |
| FE-033-21 | Wire the shell's «تذكرة جديدة» — it had **no `onClick` at all**, so `/tickets/new` was reachable only by typing the URL | session | — |
| TEST-033-22 | `listParity.test.ts` — 14 source-scan assertions, because jsdom has no layout | session | — |

## Deliberately not done

| Not done | Why |
|---|---|
| A rows-per-page control | Backed by `pageSize`, so buildable — but it is list chrome and was not asked for |
| The inverted-range divergence | **Closed later**, 2026-09-03: both endpoints answer `400`, and the readers drop the pair. Recorded in `tests.md` §5 |
| Promoting `Table`'s notice or the filter panel | `033` §7.1's rule — a promotion needs a second consumer and a written case |
