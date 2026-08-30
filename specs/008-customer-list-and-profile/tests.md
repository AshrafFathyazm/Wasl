# `008-customer-list-and-profile` — test evidence

**Scope:** the backend. The list and profile screens (AC-12, AC-13) belong to the frontend lane.

**Run:** 2026-08-28, Windows 11, .NET 10.0.200 SDK, SQL Server 2022 via `Testcontainers.MsSql`,
plus the `docker compose` container for the live verification.

```text
dotnet build --no-incremental      0 Warning(s)   0 Error(s)
dotnet test --no-build

Wasl.Domain.Tests            Failed: 0   Passed: 177   Total: 177
Wasl.Application.Tests       Failed: 0   Passed:  17   Total:  17
Wasl.Api.IntegrationTests    Failed: 0   Passed: 214   Total: 214
                                         ─────────────────────────
                                         Passed: 408   Total: 408
```

378 before. `008` added 30 — 28 for this feature, and **two that closed criteria left open by
`010` and `013`**.

---

## Acceptance criteria → named tests

All in `CustomerReadTests` unless noted.

| AC | Test | Result |
|---|---|---|
| AC-1 | `The_profile_returns_the_whole_record_including_a_version` | pass |
| AC-2 | `An_unknown_id_is_not_found_and_names_nothing` | pass |
| AC-3 | `A_malformed_id_returns_404_which_the_contract_says_should_be_400` | **CLOSED 2026-08-30 by `002b`, answered differently.** Was KNOWINGLY UNMET — Q-A, below. The `404` stands, and it now carries a proper envelope. **The status was ruled deliberate, not tolerated:** a `400` tells an unauthenticated prober that the id SHAPE was wrong, which is the same enumeration oracle BR-4.4 closes for customers. See `002b` Q-B |
| AC-4 | `The_list_returns_the_frozen_envelope_with_the_default_page_size` | pass |
| AC-5 | `The_page_size_is_clamped` (3 cases: 500 → 100, 0 → 20, −3 → 20) | pass |
| AC-6 | `The_page_is_clamped_up_to_one` (2 cases) | pass |
| AC-7 | `Search_matches_name_email_and_phone` (3 cases, each lower-case term against an upper-case value) | pass |
| AC-7 | `A_whitespace_only_search_is_treated_as_absent` | pass |
| AC-8 | `A_pattern_character_is_matched_literally` (5 cases: `100%`, `%`, `_`, `[a-z]`, `O'Brien`) | pass |
| AC-9 | `No_results_is_an_empty_array_and_a_zero_total` | pass |
| AC-10 | `A_page_beyond_the_last_is_empty_with_the_correct_total` | pass |
| **AC-11** | `The_list_costs_the_same_number_of_queries_whatever_the_row_count` | pass — **measured** |
| AC-12 | **NOT BUILT** — the profile screen. Frontend lane | — |
| AC-13 | **NOT BUILT** — the list screen. Frontend lane | — |
| AC-14 | `Both_endpoints_refuse_an_unauthenticated_caller` | pass |
| AC-15 | `Two_customers_sharing_a_name_are_each_reachable_exactly_once` | pass |
| **AC-16** | `Every_searched_column_carries_an_explicit_case_insensitive_collation` | pass |
| **AC-17** | `A_list_row_carries_the_contract_fields_and_nothing_else` | pass |

Beyond the criteria:

| Test | What it holds down |
|---|---|
| `The_profile_shows_an_inactive_customer_and_the_list_hides_it` | Q-1 and Q-3 in one test, on a row provoked into existence (Q-D) |
| `A_read_writes_no_audit_row` | BR-9.11. Structural since `003`, asserted anyway |
| `The_query_defaults_match_the_shared_paging_helper` | The record's literal default cannot reference `Paging.DefaultPageSize` at compile time, so one assertion keeps them from drifting |

---

## The query counter — built here, and it closed three criteria in three features

`specs/README.md` recorded a `DbCommandInterceptor` as a cross-feature utility: **an entire
category of criterion had no coverage.** Every "this query does not issue one round trip per row"
in the product was met by *reading the LINQ*, which is inspection and not verification.

Built in `008` as `QueryCountingInterceptor` + `QueryCountProbe`, attached through one named seam
in `AddInfrastructure`, and used immediately by three tests:

| Feature | Criterion | Was | Now |
|---|---|---|---|
| `008` | AC-11 | — | `The_list_costs_the_same_number_of_queries_whatever_the_row_count` |
| `013` | AC-14 | **Not claimed** — argued from the LINQ | `The_timeline_costs_the_same_number_of_queries_whatever_the_entry_count` |
| `010` | AC-12's second half | Asserted only that the name *arrived* | `The_list_costs_the_same_number_of_queries_whatever_the_row_count` |

Each measures the count over a small result and over a larger one and asserts they are **equal** —
the property is "does not grow with the row count", not "is under some number".

### It refuses to report zero as a pass, and that was verified first

`Count` throws when it observed no commands. An assertion of the form
`Count.Should().BeLessThan(3)` is satisfied by zero, so an unattached interceptor would have turned
all three tests into green no-ops — the exact false negative `001`'s architecture test shipped
with.

**Negative control 1 — the seam removed from `AddInfrastructure`:**

```text
Failed: 3   All three query-count tests

System.InvalidOperationException : The query counter observed no commands. That is not a fast
operation — it is an unattached interceptor, and every 'no more than N queries' assertion would
pass against it. Check that QueryCountingInterceptor is registered as IInterceptor in the test
host and that AddInfrastructure still calls AddInterceptors(provider.GetServices<IInterceptor>()).
```

Loud, and it names the two things to check.

### And it measures the right thing

**Negative control 2 — the exact N+1 the `Tickets` count column would have caused**, a
`CountAsync` per row added to the handler:

```text
Expected withTwelveRows to be 3 because the query count must not grow with the number of rows.
One SELECT for the count and one for the page, with the name projected in the same statement —
twelve rows cost 14 and one row cost 3, but found 14 (difference of 11).
```

Twelve rows, eleven extra round trips, named and quantified. Reverted, rebuilt with
`--no-incremental`, re-ran the whole suite twice: 408/408 both times.

---

## The measurement that reversed this feature's own research

`research.md` R-2 states that `Contains` translates to `LIKE '%' + @p + '%'` **without escaping the
term**, so a search for `100%` would match everything. AC-8 was written from that, and the first
implementation used `EF.Functions.Like` with a hand-written escaper covering `\ % _ [ ]`.

**It did not compile** — `Wasl.Application` cannot see EF Core, and `LayerDependencyTests` says so.
That refusal is what forced the question to be measured instead of assumed.

Measured behaviourally first, against three seeded customers:

```text
GET /api/customers?search=%      →  totalCount 0     (not 3)
GET /api/customers?search=100%   →  totalCount 0
```

Then read out of the command log of a running instance:

```sql
WHERE [c].[IsActive] = CAST(1 AS bit)
  AND ([c].[FullName] LIKE @search_contains ESCAPE N'\'
       OR ([c].[Email] IS NOT NULL AND [c].[Email] LIKE @search_contains0 ESCAPE N'\')
       OR ([c].[PhoneE164] IS NOT NULL AND [c].[PhoneE164] LIKE @search_contains1 ESCAPE N'\'))
```

**EF Core builds the pattern and escapes the term, declaring its own `ESCAPE` clause.** So the
hand-rolled escaper would have **double-escaped**: a customer whose name contained a backslash or
a bracket would have become unfindable, and AC-8's test would have passed anyway, because it only
checks that a pattern character matches *nothing extra*.

AC-8's test now pins the provider's behaviour across five terms, which is the thing that could
change under an upgrade. The dead escaper is deleted and R-2's claim is corrected in the handler's
own remarks rather than left to be rediscovered.

**Worth naming plainly: the architecture test prevented a defect it was not written for.** It
exists to keep EF Core out of the Application layer; what it actually did here was stop a
hand-rolled implementation of something the provider already did correctly.

---

## AC-16 — the defect found by reading, before any code was written

`001` gave **`Email`** an explicit `SQL_Latin1_General_CP1_CI_AS` collation and left **`FullName`**,
`PhoneE164` and `CompanyName` inheriting the database default. AC-7 searches all three, so **two
thirds of the search surface was case-insensitive by luck of the server.**

On a `_CS_AS` instance — the default in several installers — searching `ahmed` would silently miss
`Ahmed`. Identical LINQ, no exception, a smaller result set, and nothing in the code looking wrong.

Fixed by migration `ExplicitCollationOnSearchedCustomerColumns`, not by `COLLATE` in the query:
an in-query collation makes the column expression non-sargable, so every search becomes a scan —
and it would have to be repeated in `015` and `017`, which search the same columns.

Read back from the live database rather than from the configuration that set it:

```text
COLUMN_NAME | COLLATION_NAME
CompanyName | SQL_Latin1_General_CP1_CI_AS
Email       | SQL_Latin1_General_CP1_CI_AS
FullName    | SQL_Latin1_General_CP1_CI_AS
PhoneE164   | SQL_Latin1_General_CP1_CI_AS
```

---

## Verified live — the stub this feature removes

`024`'s create-ticket form had a finished customer picker running on hard-coded data.

```text
GET /api/customers                 200
    totalCount=3  pageSize=20  totalPages=1
    Sara Khan          sara.khan@example.com   Northwind Logistics
    علي الأحمد          ali@example.com         شركة الأفق للتقنية
    مها العتيبي         maha@example.com

GET /api/customers/{id}            200
    notes=  isActive=True  version=AAAAAAAAB9U=
```

Two of the three are Arabic, alphabetically ordered, with `version` present for `017` to send
back. The picker has real data.

---

## A test-data collision, recorded because the diagnosis was the interesting part

`Search_matches_name_email_and_phone(field: "phone")` failed with `found 2` rather than 1. The
term was `marker[..7]`, and the marker is `"m" + Guid.CreateVersion7()`.

**`Guid.CreateVersion7()` leads with a timestamp**, so two markers minted milliseconds apart share
their leading hex digits — the seven-character prefix matched the *other* row the same test had
seeded. A test-data collision, not a product defect, and a reminder that a time-ordered id is a
poor source of a unique **prefix**.

Fixed with a random nine-digit number for the phone case, which a phone column can hold and a hex
marker cannot.

---

## Deviations from the specification

| # | Spec says | Built | Reason |
|---|---|---|---|
| D-1 | AC-3: a malformed id returns `400` `errors/validation` | **`404`** | Q-A. `{id:guid}` fails the route match before any action runs. Dropping the constraint would buy AC-3 and cost two resources in one API answering the same malformed input differently, so a client cannot write one handler. `002b` owns the fix and fixes every route at once; `011` met the identical conflict and made the identical choice. **AC-3 is recorded as unmet, not ticked** |
| D-2 | `research.md` R-2: escape the search term before `LIKE` | No escaping | Measured. EF Core escapes it and declares its own `ESCAPE` clause; a hand-rolled escaper would have double-escaped. See above |
| D-3 | — | `EffectivePage`/`EffectivePageSize` delegate to the existing `Paging` helper rather than re-implementing BR-7.2 | `010` already has the clamp. A second copy is a second thing that has to be right, and there is no reading of BR-7.2 under which two endpoints should differ |

## Not run, and therefore not claimed

| What | Why |
|---|---|
| AC-12, AC-13 — the two screens | The frontend lane owns them |
| Search at volume | The largest result set in any test is twelve rows. A-1 records full-text search as the scaling limit, with the SQL Server form in `research.md` R-3 |
| Arabic orthographic search (`احمد` matching `أحمد`) | Q-7, deferred with the fix written down. **Asserted as a limitation, not as a pass** — the spec states it and no test claims otherwise |
| `email` returned in normalised form | The contract calls it "lowercased, trimmed"; nothing normalises it, because `Customer` has no factory until `007`. Q-E — `008` returns what is stored |
| A concurrent read during a write | No test constructs one |
