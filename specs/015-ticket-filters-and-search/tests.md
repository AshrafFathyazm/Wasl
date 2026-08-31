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
