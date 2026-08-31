# 034 — Tests and measurements

Every line below was **run**. Where something was not run, it says so and says why.

```bash
dotnet build                                    # warnings are errors
dotnet test tests/Wasl.Domain.Tests             # no Docker needed
dotnet test tests/Wasl.Application.Tests
dotnet test tests/Wasl.Api.IntegrationTests     # real SQL Server via Testcontainers
dotnet test                                     # the whole suite — the only proof
```

**Verification means the whole suite.** `--filter` appears twice below and both times it is
labelled as diagnosis. A filtered run tells you about a class; it tells you nothing about the
suite.

---

## 1 · Observed output

```text
dotnet build                     0 Warning(s)  0 Error(s)
Wasl.Domain.Tests                Passed!  Failed: 0, Passed: 189
Wasl.Application.Tests           Passed!  Failed: 0, Passed:  26
Wasl.Api.IntegrationTests        Passed!  Failed: 0, Passed: 353
```

Before this feature: 176 domain, 26 application, 335 integration.
After: **189 / 26 / 353** — 13 domain and 18 integration tests added, all green on the final run.

Two intermediate runs failed and both are recorded rather than hidden — §3 and §5.

---

## 2 · AC coverage

| AC | Test | Result |
|---|---|---|
| AC-1 | `CustomerAuthoredCommentTests` (domain) › *Naming a customer makes it a customer comment*; (integration) › *records the customer AND the support user who typed it* | Pass |
| AC-2 | integration › *The audit row names the support user who recorded it* — reads `ActorUserId`, never counts rows | Pass |
| AC-3 | domain › *A customer comment cannot be internal* **+** *An agent comment may still be internal* | Pass |
| AC-4 | domain › *A reply from a different customer is refused* **+** *The refusal names neither customer* | Pass |
| AC-5 | domain › *without a channel is refused* **+** *An agent comment without a channel is accepted* | Pass |
| AC-6 | `003`'s redaction re-asserted by the existing `013` audit tests, untouched and green | Pass — inherited, not rewritten |
| AC-7 | integration › *The two tabs are disjoint and both counts are reported* | Pass |
| AC-8 | integration › *Omitting the filter still returns the union*; `013`'s own timeline tests untouched | Pass |
| AC-9 | `013`'s existing no-duplicate-across-pages assertions, still green | Pass — inherited |
| AC-10 | `TicketTimelineTests` › *costs the same number of queries whatever the entry count* | Pass — **the threshold moved, see §4** |
| AC-11 | Contract + `GetTicketById` projection | Pass — **and it was broken first, see §3** |
| AC-12 | `GetTicketsQueryHandler` filters count and page from one source | Pass |
| AC-13 | `TicketTagTests` › attach / detach, each asserting its own audit row and actor | Pass |
| AC-14 | `TicketTagTests` › *Two tags differing only in case are the same tag* | Pass |
| AC-15 | `TicketTagTests` › *Canned replies are scoped … and include the general ones* | Pass |
| AC-16 | domain › *A closed ticket refuses a customer reply too*; integration › *says closed* | Pass |
| AC-17 | `OpenApiContractTests` (6 tests) | Pass — **it failed first, see §3** |
| AC-18 | This file | — |

---

## 3 · Three defects this feature introduced and its own guards caught

None of these reached a commit. They are recorded because each was invisible to the change
that caused it.

### 3.1 · The generated migration would have failed on any database with comments

`dotnet ef migrations add` produced:

```csharp
AddColumn<string>("AuthorKind", …, nullable: false, defaultValue: "");
AddCheckConstraint("CK_TicketComments_AuthorKind", …);   // requires 'Agent' or 'Customer'
```

Every existing comment backfills to `""`, and the constraint on the next line rejects it. **On
a developer database with no comments it applies cleanly** — which is the dangerous case,
because the defect then ships to the first environment that has data.

Rewritten by hand: add nullable → `UPDATE … SET AuthorKind = 'Agent'` → alter to `NOT NULL` →
add the constraint last. The backfill is a statement of fact, not a guess: `AuthorUserId` has
always been `NOT NULL` with an FK to `dbo.SupportUsers`, so every comment written before this
migration was written by a support user.

**No `defaultValue:` is left behind.** That would create a DEFAULT constraint — `009` shipped
`DEFAULT 'Normal'` on a priority column and it silently overrode a caller asking for `Low`.

### 3.2 · `companyName` compiled, shipped, and was null on every response

`CompanyName` was added to `TicketCustomerSummary` with `= null`. It built, `dotnet build`
reported 0 warnings, and **four projections still passed three arguments** — so the default
filled the fourth silently and the field was null everywhere.

This is `027`'s recorded defect exactly: *one mapper, three call sites, one of them right*,
where `assigneeName` went missing on both read paths.

Fixed by **removing the default**, not by fixing the four call sites. A required positional
parameter turns the next occurrence into a compiler error; four corrected call sites leave the
trap armed for the fifth.

### 3.3 · The contract guard rejected an endpoint that was in the contract

`OpenApiContractTests` failed with `{"GET /api/canned-replies"}` missing from every frozen
contract — while the contract file had a heading for it. The heading read:

```markdown
## `GET /api/canned-replies?category={TicketCategory}`
```

The discovery regex captures everything after the verb, so the contracted path included the
query string and never matched the OpenAPI path. Two headings had it; both fixed.

**The guard was right and the document was wrong**, which is the direction that test has no
exception list for.

---

## 4 · A threshold that drifted, exactly as CLAUDE.md predicted

`TicketTimelineTests.The_timeline_costs_the_same_number_of_queries_whatever_the_entry_count`
went red:

```text
Expected withOneEntry to be less than or equal to 3
because the existence check, the union, and at most one more, but found 4.
```

**The guarantee did not regress.** The assertion above it — fifteen entries cost exactly what
one entry costs — still passed, and that is the one proving nothing resolves per row. What
moved is the absolute number: the split feed reports two totals, so the request is now the
existence check, the union, and one `COUNT` per tab.

CLAUDE.md says of exactly this line:

> assert the count over a small result set **equals** the count over a larger one, never that
> it is under a threshold — a threshold drifts with every unrelated change to the request.

It drifted on the first change after it was written. It was **raised to 4 and each of the four
queries named in a comment**, rather than deleted: the equality cannot catch a query added
per *request*, which would move both numbers together and still compare equal.

---

## 5 · An intermittent failure that is not this feature's

One run reported:

```text
Wasl.Api.IntegrationTests.Customers.CreateCustomerTests
  .Two_simultaneous_identical_creates_produce_one_201_and_one_409  [FAIL]
System.Collections.Generic.KeyNotFoundException : The given key was not present in the dictionary.
  at System.Text.Json.JsonElement.GetProperty(String propertyName)
  at …/CreateCustomerTests.cs:line 378
```

Line 378 is `problem.GetProperty("errors")`. The `409` came back **without an `errors`
object**.

- It passed in the run immediately before, and in the two full runs after.
- Re-run in isolation three times: **3/3 passed** — diagnosis only, and a filtered run changes
  the timing of a concurrency test, which is the thing under test.
- Nothing in this feature touches customers, `POST /api/customers`, or the duplicate path.

**Recorded rather than dismissed.** `007`'s own contract says the two `409` paths — the
pre-check and the unique-index violation — must be *indistinguishable*, and this test asserts
it. An intermittent absence of `errors` means they are **not** indistinguishable on one of the
two paths, which would be a real defect in `007`. It is not reproducible from here and it is
not this feature's to fix; it is written down so the next person to see it has the first
sighting.

---

## 6 · Negative controls

Not yet run for this feature. **AC-18 is therefore not fully met**, and the gap is named rather
than glossed: three guards below have never been seen to fail, and CLAUDE.md is explicit that a
guard nobody has watched go red has not been verified.

| # | What to break | Expected |
|---|---|---|
| 1 | Make `TicketComment.AuthorUserId` nullable and drop the stamp | AC-2 red — the audit row's actor goes null while every request still succeeds |
| 2 | Remove `UseCollation` from `Tag.Name` | AC-14 red on a case-sensitive server; **may pass on a CI-default server, which is the point `008` made** |
| 3 | Drop the `CK_TicketComments_AuthorKind` constraint and insert `AuthorKind = 'Customer'` with a null customer id | Nothing red today — no test covers the constraint directly |

Control 3 already names a hole: the check constraint has no test of its own. The factory keeps
the pair in step, so the constraint only matters for a writer that is not the factory — a
script, an importer, a migration — and nothing in the suite is one.

---

## 7 · What was not run

- **Negative controls** — §6.
- **`--provision` against a fresh database.** The three new tables are covered by the
  `db_datareader` / `db_datawriter` grants (CLAUDE.md: a per-role grant, not a per-table list),
  and no new **sequence** was added — which is the one thing those roles do not cover. Reasoned,
  not measured.
- **`--seed` end to end.** `ReferenceDataSeeder` is exercised indirectly: AC-15's test reads the
  templates it writes, and passes. The tag half has no such reader, so the seeded tags are
  written by code no test drives — **and CLAUDE.md's rule applies: an entity written only from
  outside the real path is unverified.** The first `--seed` run is its first test.
