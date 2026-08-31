# `007-create-customer` — test evidence

**Scope:** the backend. The create form (AC-16, AC-17) belongs to the frontend lane.

**Run:** 2026-08-29, Windows 11, .NET 10.0.200 SDK, SQL Server 2022 via `Testcontainers.MsSql`,
plus the `docker compose` container for the live verification.

```text
dotnet build --no-incremental      0 Warning(s)   0 Error(s)
dotnet test --no-build

Wasl.Domain.Tests            Failed: 0   Passed: 177   Total: 177
Wasl.Application.Tests       Failed: 0   Passed:  17   Total:  17
Wasl.Api.IntegrationTests    Failed: 0   Passed: 240   Total: 240
                                         ─────────────────────────
                                         Passed: 434   Total: 434
```

408 before. `007` added 26. **Run twice in a row, identically green.**

---

## Acceptance criteria → named tests

All in `CreateCustomerTests` unless noted.

| AC | Test | Result |
|---|---|---|
| AC-1 | `A_valid_create_returns_201_and_the_location_returns_the_same_resource` | pass |
| AC-2 | `A_missing_name_is_refused_and_names_the_field` (2 cases) | pass |
| AC-3 | `Neither_an_email_nor_a_phone_is_refused_and_names_both_fields` | pass |
| AC-4 | `The_stored_email_is_trimmed_and_lowercased` | pass |
| AC-5 | `A_malformed_email_is_refused` (3 cases) | pass |
| AC-6 | `Formatting_characters_are_stripped_from_a_phone` (3 cases) | pass |
| AC-7 | `An_unnormalisable_phone_is_a_validation_error` (5 cases) | pass |
| AC-8, AC-9, AC-12 | `A_duplicate_email_is_a_conflict_naming_only_the_field` | pass |
| AC-10 | `A_duplicate_phone_is_a_conflict_naming_the_phone` | pass |
| AC-11 | `Two_customers_may_share_a_name` | pass |
| **AC-13** | `Two_simultaneous_identical_creates_produce_one_201_and_one_409` | pass |
| AC-14 | `A_valid_create_returns_201_...` — asserts the two bodies are **byte-identical** | pass |
| AC-15 | `An_unauthenticated_create_is_refused` | pass |
| AC-16, AC-17 | **NOT BUILT** — the form. Frontend lane | — |
| **AC-18** | `Both_duplicate_indexes_are_unique_and_filtered` | pass |
| **AC-19** | `The_stored_email_is_trimmed_and_lowercased` — reads the column back | pass |

Beyond the criteria:

| Test | What it holds down |
|---|---|
| `Two_customers_with_no_email_are_both_created` | The behaviour the filter buys |
| `An_unfiltered_unique_index_treats_two_nulls_as_a_duplicate` | The **reason** it is needed — see below |
| `A_create_writes_an_audit_row_that_carries_no_contact_details` | BR-9.1, and BR-4.7 extended to the audit table |
| `A_refused_duplicate_writes_a_failed_row_without_the_email` | `Outcome = Failed`, not `Denied` — a business refusal is not a permission denial |
| `PersistenceConventionTests.Customers_NowHasExactlyTwoFilteredIndexes_AddedByFeature007` | Inverted from `001`'s guard — see below |

---

## AC-13 — the first concurrency test in this project

`CLAUDE.md`'s checklist opens with *"Does a duplicate request create a duplicate row?"*. `009`
recorded `POST /api/tickets` as **not idempotent, unowned**. Here the index is the owner, so the
claim is testable, and this is the first test in the codebase to exercise that row.

```csharp
var first  = PostAsync(Body());
var second = PostAsync(Body());
await Task.WhenAll(first, second);
```

The pre-check cannot win this on its own — both requests read before either writes — so a pass
means the unique index caught it **and** the violation was translated. The test asserts three
things, and the third is the one the status codes do not give:

- one `201` and one `409`;
- the `409` body is **identical to the pre-check's** — same `type`, same `errors.email` message
  (Q-D: a client cannot know which of two racing requests it was, and a difference between the two
  paths would leak timing);
- exactly **one row** exists afterwards.

---

## AC-18, and the negative control that proves *why*

AC-18 asserts `filter_definition` is non-null. `Two_customers_with_no_email_are_both_created`
asserts the behaviour that buys. **Neither demonstrates the reason**, which is a property of SQL
Server rather than of this code.

`An_unfiltered_unique_index_treats_two_nulls_as_a_duplicate` builds the wrong index on a throwaway
table, inserts two NULLs, and reads the failure — error 2601/2627. So the claim in the
configuration's comment is measured, not asserted.

**Why the control is staged that way, stated rather than hidden.** The obvious counterfactual —
remove `.HasFilter(...)`, generate a migration, run the suite — was attempted and produced **no
usable result**: the extra migration broke the test fixture, and all 32 tests in the filtered run
failed in about 1 ms each, which is a fixture failure and not a measurement. Reverted with
`dotnet ef migrations remove`. The throwaway-table test is the version that isolates the property
without depending on the schema the suite needs in order to start.

Confirmed live afterwards:

```text
name                        is_unique  filter_definition
UX_Customers_Email_Active   1          ([Email] IS NOT NULL AND [IsActive]=(1))
UX_Customers_Phone_Active   1          ([PhoneE164] IS NOT NULL AND [IsActive]=(1))
```

---

## AC-19 — and why AC-9 could not have covered it

`Customers.Email` carries a case-insensitive collation, so once the unique index exists,
`ALI@EXAMPLE.COM` collides with a stored `ali@example.com` **whether or not the application
lowercases anything**. AC-9 passes on the collation alone.

So AC-19 reads the column back and looks at the value. Without it, BR-4.2 would be a rule nothing
verifies, and the frozen contract's promise that `email` is returned in normalised form would rest
on data that happened to be typed in lower case. Same family as `CLAUDE.md`'s *assert content, not
presence*.

---

## Three defects found by running

### 1 · `Customer` timestamps had never been stamped, by any code path

`Customer` predates `IAuditableEntity`: `001` created it, `009` introduced the interface, nobody
went back. It has `CreatedAtUtc` and `UpdatedAtUtc` but no actor columns, so it cannot implement
the interface without a migration adding two columns the blueprint does not define — and the
stamping loop matches **by interface**, so it was skipped.

Nothing noticed for six features, because **nothing had ever created a customer through the
application**: `--seed` inserts raw SQL and `008`'s tests set the properties by reflection. `007`
is the first, and its `201` came back with:

```json
"createdAtUtc": "0001-01-01T00:00:00"
```

The CLR default, served as a fact. Fixed with a third loop in `Stamp()`, beside the ones `011` and
`013` added for the same reason.

**And the stamp only fires when the value is unset** — because `001`'s two converter tests write a
specific instant through the tracked entity to prove the UTC round trip, and an unconditional stamp
silently overwrote it, so the test guarding the converter would have been testing the stamp.
Backdating is prevented by the **request shape** — `CreateCustomerRequest` has no timestamp field —
not by that line.

### 2 · `POST` and `GET` returned different timestamps for the same resource

AC-14 asserts the two bodies are **byte-identical**. They were not:

```text
POST /api/customers        "createdAtUtc":"2026-08-29T09:57:57.7129947Z"
GET  /api/customers/{id}   "createdAtUtc":"2026-08-29T09:57:57.712Z"
```

The in-memory value keeps full .NET tick precision; the column is `datetime2(3)`. **A client that
caches a create response holds a value the server will never return again**, and every create in
the product has the same shape.

Fixed by truncating the stamp to milliseconds, so memory and storage agree by construction rather
than by rounding twice. Truncation, not rounding: rounding could produce an instant one
millisecond ahead of the request's own, and `009` AC-9 asserts a ticket and its history row share
one exactly.

**A field-by-field comparison would have walked straight past this.** AC-14 says "the same
resource", and the strongest reading of that is the one that caught it.

### 3 · Two test fixtures were writing data the product forbids

`008`'s `SeedAsync` defaulted every customer to the same phone number, and one theory shared a
literal across two cases. Harmless until `UX_Customers_Phone_Active` existed; then the second seed
of any test failed on a duplicate.

**The index was right and the fixtures were wrong** — two customers cannot share a phone number,
and a fixture writing the same one twice describes a world the product does not allow. Both now
mint a unique number.

---

## A guard from `001` fired, exactly as written

```text
PersistenceConventionTests.Customers_HasNoFilteredIndexYet_ThoseBelongToFeature007   FAILED
```

`001` wrote it to assert the filtered indexes did **not** exist yet: *"the duplicate rule (BR-4.8)
and its filtered indexes are feature 007's, tested alongside the behaviour they enforce."* It went
red on the commit that added them.

Inverted rather than deleted, and tightened rather than loosened: it now asserts `dbo.Customers`
has **exactly two** filtered indexes. AC-18 checks each one's filter in detail; this checks the
count, so a third has to be justified rather than merely added.

---

## The lesson from `008` repeated one feature later

`008`'s `tests.md` recorded: *a time-ordered id is a poor source of a unique prefix* —
`Guid.CreateVersion7()` leads with a timestamp, so two minted milliseconds apart share their
leading hex digits.

`007`'s first test helper did exactly that again: `Guid.CreateVersion7().ToString("N")[..10]` as an
email local-part, and two customers created in the same instant came back as a duplicate.

**Writing the lesson down once did not stop it recurring in the next feature.** Both helpers now
use `RandomNumberGenerator`. Recorded because the repetition is the more useful finding than the
original.

---

## Verified live, against the compose container

```text
POST /api/customers   201   Location: /api/customers/01a04d03-2772-7ba5-b155-a47cb0ea6b4a
      sent   fullName "نورة الشمري"   email "  SAMIRA@Example.COM  "   phone "+966 (55) 111-2233"
      got    email    samira@example.com          <- trimmed and lowercased  (AC-4)
             phone    +966551112233               <- formatting stripped     (AC-6)
             createdAtUtc 2026-08-29T10:14:07.474Z <- millisecond precision   (defect 2)

GET  {Location}       200   identical: True                                   (AC-14)

POST duplicate, shouted casing        409  errors/duplicate-customer
      errors.email ["A customer with this email already exists."]             (AC-8, AC-9)
      the body names no id and no other customer                              (AC-12)

POST {"phone":"0501234567"}           400  errors/validation
      errors.phone ["Enter the phone number in international format,
                     starting with the country code."]                        (AC-7, Q-B)
```

---

## Deviations from the specification

| # | Spec says | Built | Reason |
|---|---|---|---|
| D-1 | `CLAUDE.md` structure: `Customers/ Customer, EmailAddress, PhoneNumber` | Static `ContactNormalisation`, no value objects | Ruled 2026-08-28 before implementation and recorded in three places — the spec, `CLAUDE.md`'s code style, and `12-delivery-log.md`. A value object earns its place by making an invalid instance impossible; `Customer` has private setters and one factory, so that door was already shut |
| D-2 | BR-4.1 measured against contact **validity** | Measured against **presence** | Found by running: a malformed phone with no email failed twice, so the form showed *"Provide either an email address or a phone number"* beside a phone the user had just typed. Both true, one useful |
| D-3 | — | `Stamp()` fills `CreatedAtUtc` only when unset | `001`'s converter tests write a specific instant through the tracked entity; an unconditional stamp made them test the stamp instead of the converter |

## Not run, and therefore not claimed

| What | Why |
|---|---|
| AC-16, AC-17 — the form and its double-submit guard | The frontend lane owns them |
| The duplicate rule against an **inactive** customer | Stated as a limitation: BR-4.4 scopes it to active customers and the filter makes that structural. Reactivation is `017`'s design problem, and no test claims otherwise |
| Country-aware phone normalisation | Refused by ruling (Q-B), not deferred by omission. A local number is a `400` |
| More than two simultaneous requests | AC-13 races two. The index makes the count irrelevant, but only two were run |
| `POST` under a `_CS_AS` server collation | `008` fixed the column collations and AC-16 there asserts them; nothing runs the suite against a case-sensitive server |

---

## `FE-007-00` — the preview (2026-08-30)

`/_preview/create-customer`. Six states, both directions, side by side. Nothing calls
`POST /api/customers`: a preview that fetches cannot render its own duplicate-conflict state
on demand, and that is the state this screen exists to get right.

### A finding I reported and then withdrew

I claimed `Input` could not meet the design's *"email and phone stay LTR in the Arabic form"*
— that `dir="auto"` on an **empty** field falls back to the paragraph direction, so the caret
would start at the wrong end. I wrote a wrapper forcing `direction: ltr` and put the claim on
the page as a finding.

**It was wrong.** `dir="auto"` with no strong directionality character resolves to **ltr**
per the HTML specification, not to the parent's direction. Measured in the Arabic frame:

| Field | Computed |
|---|---|
| (empty) | `ltr` |
| `نورة السالم` | **`rtl`** — `dir="auto"` is live, not ignored |
| `noura@example.com` | `ltr` |
| `+966501234567` | `ltr` — no strong character at all |

Then the control: **with the wrapper neutralised, email and phone were still `ltr`.** The
rule was doing nothing. The primitive already satisfies the design.

The wrapper is gone and the correction is on the page where the wrong version was, because a
reviewer who read the finding deserves to meet its retraction in the same place.

**The lesson is the one this repository already has a table for**, arriving from the other
side: I asserted a defect from a mental model of `dir="auto"` and did not check it. The
control took one minute.

### The submit loader

`Button` already carries it — `loading` swaps in **"Converge"** (`design/brand.md` §2), the
three dots travelling into a node that replaces the spinner product-wide. One prop, not a new
component: the loader appears far more often than the logo does, which is why it is the
brand asset it is.

Measured on the busy button: `aria-busy="true"`, disabled, 3 dots and 1 node inside, and the
accessible name still **`إنشاء`**.

**The `Creating…` string was removed rather than used.** `Button` deliberately keeps its
accessible name while busy, so swapping the label renames the control mid-action and a screen
reader announces a different button from the one that was pressed. The loader carries the
state; the name does not move.

### Not verified

The design's `409` behaviour — *"names `email` first and stops"* when both fields duplicate —
is rendered as a state here but not exercised against the server. It needs `FE-007-02`.
