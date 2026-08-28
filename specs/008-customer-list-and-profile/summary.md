# `008-customer-list-and-profile` — summary

Delivered 2026-08-28. **Backend.** The list and profile screens (AC-12, AC-13) belong to the
frontend lane. Written for someone who was not present.

## What was built

| # | Thing |
|---|---|
| 1 | `GET /api/customers` — the paged envelope `010` froze, with search over name, email and phone |
| 2 | `GET /api/customers/{id}` — the full record, with `version` for `017` to send back |
| 3 | Migration `ExplicitCollationOnSearchedCustomerColumns` — the fix for a defect found by reading |
| 4 | **`QueryCountingInterceptor` + `QueryCountProbe`** — the cross-feature test utility, and one named seam in `AddInfrastructure` to attach it |

**408 tests, 0 warnings, run twice.** Evidence and two negative controls: [tests.md](tests.md).

`008` added 30 tests: 28 for this feature, and **two that closed criteria left open by `010` and
`013`**.

## Why this feature was next, and what it removed

`024`'s create-ticket form had a **finished customer picker running on hard-coded data**, because
`GET /api/customers` did not exist. That is the whole reason `008` came before `007`: it makes a
built screen work on real data rather than adding a screen nobody has asked for yet.

Verified live — the picker now lists three customers, two of them Arabic, alphabetically ordered.

## Why it was built this way

### The query counter, and the category it closed

An entire class of criterion had **no coverage in this codebase**. Every "this query does not
issue one round trip per row" was met by reading the LINQ — which is inspection, and inspection
cannot see a lazy load, a client-side `ToList` added later, or a projection that stops being
translatable after an unrelated edit.

Built once, general on purpose, and used immediately by three tests in three features:

| Feature | Criterion | Was | Now |
|---|---|---|---|
| `008` | AC-11 | — | measured |
| `013` | AC-14 | **Not claimed** — argued from the LINQ | measured |
| `010` | AC-12's second half | asserted only that the name *arrived* | measured |

Each asserts the count over a small result **equals** the count over a larger one. The property is
"does not grow with the row count", not "is under some number" — a threshold would drift with every
unrelated change to the request.

**Its most important property is that it refuses to report zero as a pass.** `Count` throws when it
observed no commands, because `Count.Should().BeLessThan(3)` is satisfied by zero and an unattached
interceptor would have made all three tests green no-ops — `001`'s false negative, prevented by
design. Verified by removing the seam and watching all three fail with a message naming the two
things to check.

### The measurement that reversed this feature's own research

`research.md` R-2 said `Contains` translates to `LIKE` **without escaping the term**, so AC-8 was
written expecting a hand-rolled escaper. The first implementation had one — and **it did not
compile**, because `Wasl.Application` cannot see EF Core and `LayerDependencyTests` enforces it.

That refusal forced the question to be measured. `search=%` returned 0 of 3 customers, and the
command log showed why:

```sql
[c].[FullName] LIKE @search_contains ESCAPE N'\'
```

The provider builds the pattern **and escapes the term**. The hand-rolled escaper would have
**double-escaped** — a customer whose name contained a backslash or a bracket would have become
unfindable, and AC-8's test would still have passed, because it only checks that a pattern
character matches nothing extra.

**The architecture test prevented a defect it was not written for.** It exists to keep EF Core out
of the Application layer; what it did here was stop a reimplementation of something the provider
already did correctly. R-2's claim is corrected in the handler's own remarks rather than left to be
rediscovered.

### AC-16 — a defect found by reading, before any code was written

`001` gave `Email` an explicit CI collation and left `FullName`, `PhoneE164` and `CompanyName`
inheriting the database default. AC-7 searches all three, so **two thirds of the search surface was
case-insensitive by luck of the server.** On a `_CS_AS` instance — the default in several
installers — searching `ahmed` would silently miss `Ahmed`: identical LINQ, no exception, a smaller
result set.

Fixed by migration rather than by `COLLATE` in the query: an in-query collation is non-sargable, so
every search becomes a scan, and it would have to be repeated in `015` and `017`. AC-16 reads the
collation back from `INFORMATION_SCHEMA`, not from the configuration that set it.

### What this feature inherited instead of defining

The spec opens by saying `008` "establishes the paging envelope, the `404` shape, the
malformed-identifier behaviour, and the rule that a query does not travel the command half of the
pipeline. Everything from `010` onwards inherits those four."

**All four were established by `010` and `012`.** `008` is the seventh read path, not the first. So
it inherits the envelope, delegates BR-7.2's clamping to the existing `Paging` helper rather than
re-implementing it, and re-asserts the clamping only because that part is per-endpoint code.

### The count column: the exclusion stands, its reason changed

The screens show a `Tickets` count. The original reason for dropping it — no table to count — is
gone; `dbo.Tickets` has existed since `009`.

The reason now is AC-11: **a count per customer is exactly the N+1 this feature's own criterion
forbids.** Twenty rows means twenty `SELECT COUNT(*)`. Doing it correctly needs a grouped join,
which is `018`'s design work. And it is not hypothetical — that same N+1 was used as negative
control 2, and the counter reported *twelve rows cost 14 round trips and one row cost 3*.

## Open

| # | What | Owner |
|---|---|---|
| 1 | **AC-3 is unmet.** A malformed id returns `404`, not `400`. Q-A ruled for API consistency over one criterion; the test asserts today's behaviour and names the contract it violates, so it goes red the day the fix lands | `002b` |
| 2 | AC-12, AC-13 — the list and profile screens, with loading, error, not-found and empty states | frontend lane |
| 3 | `email` is not returned in the normalised form the contract describes, because nothing normalises it | `007` |
| 4 | Arabic orthographic search — `احمد` does not match `أحمد`. Stated limitation with the fix written down: a persisted normalised `SearchName` column | a story, unscheduled |
| 5 | Search at volume. A-1 records full-text search as the scaling limit | future |
| 6 | The `Tickets` count column and the profile's status rail | `018`, and it needs a grouped join rather than a per-row count |
| 7 | `020`'s per-widget aggregate criterion — the fourth in the category the counter was built for | `020`, which can now assert it on delivery |

## One test-data lesson worth keeping

`Search_matches_name_email_and_phone(phone)` failed with `found 2`. The search term was a
seven-character prefix of a marker built from `Guid.CreateVersion7()` — **which leads with a
timestamp**, so two markers minted milliseconds apart share their leading hex digits, and the
prefix matched the other row the same test had seeded.

A test-data collision rather than a product defect, and a reminder that a time-ordered id is a poor
source of a unique *prefix*. Fixed with a random nine-digit number, which a phone column can hold
and a hex marker cannot.
