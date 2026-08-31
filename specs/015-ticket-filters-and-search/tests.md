# `015-ticket-filters-and-search` — test evidence

**Backend half. Run 2026-08-31**, Windows 11, .NET 10.0.200 SDK, SQL Server 2022 via
`Testcontainers.MsSql` — one container for the whole integration suite.

```text
dotnet build                       0 Warning(s)   0 Error(s)
dotnet test --no-build

Wasl.Application.Tests       Failed: 0   Passed:  26   Total:  26
Wasl.Domain.Tests            Failed: 0   Passed: 189   Total: 189
Wasl.Api.IntegrationTests    Failed: 0   Passed: 374   Total: 374
                                         ─────────────────────────
                                         Passed: 589   Total: 589
```

Before this feature: 568 (`034`'s number). **21 tests added, all in the integration project** —
16 in `TicketFilterTests`, 5 in `TicketFilterMessageTests`.

**Verification is the whole suite.** `--filter` appears twice below and both times it is labelled
diagnosis.

---

## Acceptance criteria → named tests

| AC | Test | Result |
|---|---|---|
| AC-4 (AND across keys, BR-7.3) | `TicketFilterTests.Two_different_filters_combine_with_AND` | pass |
| AC-5 (OR within a key, BR-7.4) | `A_repeated_filter_combines_with_OR` | pass |
| AC-6 (search over three columns, BR-7.5) | `Search_matches_the_number_the_subject_and_the_customer_name` | pass |
| AC-8 (`assignee=me`) | `Assignee_me_resolves_from_the_token` | pass |
| AC-9 (`assignee=unassigned`) | `Assignee_unassigned_is_a_null_test_and_not_an_id` | pass |
| AC-10 (`400` listing accepted values) | `An_unaccepted_status_is_a_400_naming_the_parameter_and_every_accepted_value` **+** `An_unrecognised_assignee_is_a_400_and_not_a_dropped_filter` **+** the five `TicketFilterMessageTests` | pass |
| AC-24 (wildcards literal) | `A_LIKE_wildcard_in_a_search_term_is_literal` (`%`, `_`, `[`) | pass — **and the criterion's premise was wrong, see below** |
| `spec.md` Q-4 (empty parameter) | `An_empty_filter_parameter_is_not_a_filter_that_matches_nothing` | pass — **red on the first run, see below** |
| `spec.md` Q-6-adjacent (case) | `A_lower_case_status_is_accepted_and_filters` | pass |
| BR-7.2 clamp on a repeated filter | `More_filter_values_than_the_clamp_are_dropped_and_not_refused` | pass |
| `escalated` is `bool?` | `Escalated_false_filters_rather_than_meaning_any` | pass |
| The numeric hole | `A_numeric_status_is_refused_even_though_Enum_TryParse_would_accept_it` (`3`, `99`) | pass |

**AC-14 (filters in the URL, surviving a reload) is the frontend lane's** and is not claimed here.
AC-7 is subsumed by AC-24 — same property, and AC-24 is the version that is correct on SQL Server.

---

## Every decoy is deliberate, because the alternative passes on no filter at all

The two filter tests each seed rows that satisfy **half** the query:

- `Two_different_filters_combine_with_AND` seeds `Billing`+`High` (wanted), `Billing`+`Low`, and
  `Technical`+`High`. Without the two decoys the test passes on an **OR** — which is the exact
  thing BR-7.3 and BR-7.4 exist to keep apart.
- `A_repeated_filter_combines_with_OR` seeds a third ticket moved to `Closed`. Asserting only that
  the `New` one came back would pass with no filtering whatsoever.
- `Escalated_false_filters_rather_than_meaning_any` asserts **both** directions. `escalated=false`
  returning the row proves nothing on its own — a dropped parameter returns it too. The half that
  can fail is `escalated=true` returning **none** of them.

---

## Three tests were red on the first run, and one of them was a real defect

### 1 · `?status=` answered `400` — and Q-4 says it must mean *no filter*

**A defect in this feature's own code, found by its own test.**

`?status=` does **not** bind as an empty array. It binds as an array holding one empty string, and
`TicketFilters.Invalid` saw `[""]`, found it unparseable, and produced a validation error naming
six accepted values.

```text
An_empty_filter_parameter_is_not_a_filter_that_matches_nothing
    System.Collections.Generic.KeyNotFoundException : The given key was not present in the
    dictionary.          ← GetProperty("items") on a ProblemDetails body
```

**It is the ordinary case, not an exotic one:** a filter bar that clears its select sends
`?status=`, so a user who *removed* a filter would have been shown an error about values they
never asked about. Fixed with `TicketFilters.Supplied`, which drops blanks before either the parse
or the invalid-check — one place rather than a `Count == 0` guard at the top of two methods.

### 2 · `type` is an absolute URI

```text
Expected body.GetProperty("type").GetString() to be "errors/validation"
  ↓ (actual)
"https://wasl.local/errors/validation"
```

The assertion was wrong, not the server. Asserted by suffix now, so the test is about the code and
not about whichever host the registry is configured with.

### 3 · `New → Closed` answered `400`, and BR-1 permits it

The BR-1 map says `New → Closed` is permitted, and a forbidden transition is `409` — so a `400`
here read like a broken helper. It was **BR-1.2**: closing work that was never started requires a
note.

```json
{"type":"https://wasl.local/errors/validation",
 "detail":"أضف ملاحظة توضّح سبب الإغلاق.",
 "errors":{"note":["أضف ملاحظة توضّح سبب الإغلاق."]}}
```

**This took one run instead of several because the helper's failure message carries the response
body.** The status code alone said `400` and nothing about which field — and this is the same
lesson as `errors[field]` with one entry being a shape assertion: *read the message.* The helper
sends a note on every step now, which is correct for all of them (`Resolved → Closed` deliberately
does **not** require one — `012` Q-1 ruled that asking for a reason for the expected outcome
trains people to type nothing useful).

The response arrived in **Arabic**, which is `014`/BR-8.4 working as specified: the seeded Manager
carries `preferred_language=ar` and a claim outranks a header. Already recorded from the demo
rehearsal; noted here because it is the second time it surprised a reader.

---

## AC-24's premise was wrong, and `008` had already measured it

AC-24 exists because `spec.md` says *"AC-7 was written against PostgreSQL and is incomplete on SQL
Server"* — the assumption being that `%` and `_` need escaping by hand.

**They do not.** `008` measured what EF Core 10 emits on SQL Server:

```sql
[c].[FullName] LIKE @search_contains ESCAPE N'\'
```

The provider builds the pattern **and escapes the term**, declaring its own `ESCAPE`. A
hand-written escaper on top of that double-escapes, and a subject containing a backslash or a
bracket becomes unfindable — a defect the obvious test cannot see, because it only checks that
`100%` matches nothing.

So `A_LIKE_wildcard_in_a_search_term_is_literal` pins the **provider's** behaviour across `%`, `_`
and `[` — the thing a package upgrade could change — rather than asserting an escaper this feature
deliberately does not have.

---

## AC-10 could not have been met by binding enums, and that is a measured constraint

The four enum filters bind as `string[]`, not `TicketStatus[]`. Binding enums directly is shorter
and makes AC-10 **unreachable**: `002c` measured that the model binder refuses a malformed value
**before** the MediatR pipeline runs, so `ValidationBehaviour` never executes, the message is the
framework's English sentence, and it cannot list the accepted values. The parse therefore happens
in `TicketFilters`, where FluentValidation can see it.

`ValidationBehaviour` runs for a **query** at all because it is constrained to `notnull` rather
than to `ICommand` — checked before the validator was written, not assumed. `TransactionBehaviour`
and `AuditBehaviour` are constrained to `IAuditableCommand<TResponse>`, so this read still opens no
transaction and writes no audit row.

### The accepted values live in the catalogue, and a test is what keeps them true

The validation path resolves a message key with **no arguments** — `ProblemDetailsFactory` calls
`Resolve(context, key)`, and only a `DomainException` carries `MessageArguments` — so threading
`TicketFilters.Accepted<T>()` into the sentence would mean changing `002`'s error plumbing for a
filter. The values are static per parameter, so the catalogue holds them and
`TicketFilterMessageTests` asserts each message names **every** member of its enum, in `en` **and**
`ar`.

**Without that test this is `009`'s defect waiting to happen.** `009` transcribed enum members by
hand and shipped two invented ones. A member added to `TicketStatus` tomorrow would leave the
message naming five of six — and every other test in the suite would stay green, because they
assert the message is *present* or check the six they already know about.

Member names stay **Latin in the Arabic message**: BR-8 never localizes an enum value, and a
translated list would be unusable in a URL.

---

## The numeric hole, which `Enum.TryParse` opens by default

`Enum.TryParse<TicketStatus>("3", out _)` returns `true` and yields `PendingCustomer`. `"99"`
also returns `true`, for a value no member has. Both are now `400`, and the guard is a digit check
**before** the parse rather than an `IsDefined` check after — because `IsDefined` alone would let
`"3"` through as a legitimate member.

**The failure mode is the one `009` shipped:** the request succeeds and means something the caller
never asked for. `?status=3` from a client that guessed the wire format would silently return
`PendingCustomer` tickets.

---

## Not claimed

| What | Why |
|---|---|
| **AC-14** — filters in the URL, surviving a reload | The frontend lane's. This feature is the backend half only |
| **The filter bar, the status tabs, the "no matches" state, the Arabic plural count** | Same — `spec.md`'s in-scope list covers both lanes and only one is built |
| **`?sort=` and `?dir=` on tickets** | Not in `015`'s scope. `033` adds them to **customers**; the ticket list keeps `010`'s BR-7.1 order |
| **A query-count assertion over the filtered list** | `010` AC-12 covers the unfiltered projection and still passes. Whether a seven-way filter changes the count was **not measured**, and `008`'s `CountQueries()` probe exists — this is a gap, named rather than assumed away |
| **A frozen contract of its own** | `015/contracts/` is empty. The parameters are recorded as a **Contract change** at the foot of `010`'s frozen contract, which is the rule `error-contract.md` set when `429` arrived late and what `033` did for `008` on the same day |
| **CI** | Not run at the time of writing. `003b`'s limitation row claimed the same thing and was **false in both directions** — CI had been running every push and was red — so this one says only *not yet*, and the next push settles it |

---

# The FRONTEND half — run 2026-08-31

```text
npx tsc -b --force              no output — clean
npm run build                   ✓ built
npm run lint                    eslint . — no output
npm run test                    26 files, 420 tests, all passed
```

Before this half: 379 tests in 24 files. **41 added** — 24 in `ticketFilters.test.ts`
(the URL round-trip, no DOM) and 17 across `TicketFilterBar.test.tsx` (rendered, through
Testing Library and the real page).

## Acceptance criteria → named tests

| AC | Test | Result |
|---|---|---|
| AC-14 (the URL is the state container) | `renders a filtered list straight from the URL` **+** the whole `writing filters back to the URL` block | pass |
| The filter bar | `puts the status in the URL and in the request`, `clicking the active tab clears the filter` | pass |
| The search box | `does not request on every keystroke`, `shows the term the URL carries, not a stale draft` | pass |
| The status tabs | `marks the active tab with aria-selected, not only a class` | pass |
| "No matches" distinct from "no tickets" | `says nothing matched when a filter is on` **+** `says there are no tickets when nothing is filtered` **+** `past the end wins over no matches` | pass |
| The panel is a disclosure | `is a disclosure — closed, named, and reporting its state` | pass |
| Active-filter count | `counts the active filters on the button` | pass |
| Clear keeps the search | `Clear filters keeps the search term` | pass |
| Arabic plural result count | — | **not built. See *Not claimed*** |

## The three states are ordered, and each has a control

`items.length === 0` arrives for three different reasons and they must not share a
component:

| State | Reached by | Message |
|---|---|---|
| Past the end | `?page=99`, and `totalCount > 0` | `list.pastEnd*` — the CTA jumps to the last page |
| No matches | a filter is on and `totalCount === 0` | `list.noMatch*` — the CTA clears the facets |
| No tickets | nothing filtered, nothing exists | `list.empty*` |

**Past the end wins**, because a filtered list can also be paged past its end and the pager
is the thing to fix first. Each of the three has its own test asserting the OTHER two
messages are absent — a test that only checks its own message present would pass on a
component that renders all three.

**"No tickets yet" over a filtered list tells the reader their data is gone.** That is why
this is `015`'s criterion and not a nicety.

## A negative control, because fourteen tests passing on the first run is not evidence

The rendered suite went green immediately, and this project's rule is that a guard nobody
has seen fail has not been verified. So `withFilters` was changed to keep the page:

```text
× writing filters back to the URL > drops the page but keeps the page size
    → expected '5' to be null

× the tabs write the URL … > drops the page when a filter changes and keeps the page size
    → expected { page: 5, pageSize: 50, …(1) } to match object { page: 1, pageSize: 50 }
```

Two tests, at two levels, with messages that name the actual values. Reverted; 420/420.

**The defect it protects against is not cosmetic.** Page 5 of an unfiltered list is rarely
page 5 of a filtered one, so keeping the page turns *filter to Open* into an empty table
with a pager reading 5 of 1 — and the empty table then says "nothing matches these
filters", so the FILTER looks broken rather than the pager.

## The endpoints, measured against the running API

Not asserted from the client's types — the API was started and asked. `--seed` data, one
Manager token:

```text
?（none）                 6 of 6          ?status=Bogus       400
?status=New                1 of 1          ?status=3           400
?status=Open               1 of 1          ?assignee=nobody    400
?status=New&status=Open    2 of 2  ← OR    ?status=            200  ← Q-4
?assignee=unassigned       2 of 2
?escalated=true            0 of 0
?escalated=false           6 of 6  ← both directions, so the parameter is not ignored
?search=zzzznomatch        0 of 0
```

```json
{"type":"https://wasl.local/errors/validation","status":400,
 "errors":{"status":["Not an accepted status. Accepted values: New, Open, InProgress,
                     PendingCustomer, Resolved, Closed."]}}
```

**`?escalated=` is asserted in both directions on purpose.** `false` returning six rows
proves nothing on its own — an ignored parameter returns them too. `true` returning zero is
the half that can fail.

The dev server proxy was checked as well: `/api/tickets` through Vite answers **`401`**,
which is the API's fallback policy rather than a Vite `404` — so the proxy is reaching the
server and not swallowing the path.

## Not claimed — and the first one is the biggest

| What | Why |
|---|---|
| **Anything visual.** The rendered look, RTL on screen, colour contrast, focus rings, the tab strip at a real viewport width | **No browser was driven.** The `chrome-devtools` MCP server disconnected during this session and there is no Playwright or Puppeteer in the project — searched, not assumed. Testing Library renders to jsdom, which has no layout: it can prove a control writes the URL and cannot prove the panel is not overlapping the table. **This is a gap, not a pass** |
| The Arabic pass over this screen | Same reason. The catalogue has parity — 143 keys in `en` and 143 in `ar`, zero difference either way — and **parity is not a reading.** Q-8 still stands: nobody who reads Arabic has reviewed these strings |
| The result count with Arabic plural forms | `spec.md` lists it in scope. The count is rendered on the *All* tab as a bare number, which needs no plural rule; a sentence like "12 tickets found" does, and it is not built |
| `?sort=` / `?dir=` | Not in `015`'s scope on the ticket list |
| A test that the 300ms debounce is exactly 300ms | The test proves no request fires during typing and one fires after the timer advances. Asserting the constant would be asserting the code against itself |
