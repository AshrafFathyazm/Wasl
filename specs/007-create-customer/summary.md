# `007-create-customer` — summary

Delivered 2026-08-29. **Backend.** The create form (AC-16, AC-17) belongs to the frontend lane.
Written for someone who was not present.

## What was built

| # | Thing |
|---|---|
| 1 | `Customer.Create` — the factory the entity has been missing since `001` |
| 2 | `ContactNormalisation` — BR-4.2 and BR-4.3, static, **not** value objects |
| 3 | `POST /api/customers` — `201` with a `Location` that returns a byte-identical body |
| 4 | Two **filtered** unique indexes — BR-4.8's guarantee, added exactly where `001` said they belonged |
| 5 | The index violation translated into the same exception the pre-check raises |
| 6 | `Customer` timestamps stamped for the first time — a defect six features old |
| 7 | Every stamp truncated to `datetime2(3)`, so a create and a read agree |

**434 tests, 0 warnings, run twice.** Evidence: [tests.md](tests.md).

## Why it was built this way

### The spec's opening claim was entirely superseded, and that made the feature small

It said: *"This is the first write path in the system. It establishes the validation approach, the
error contract, and the persistence pattern that later stories follow."* It is the **sixth**.
`002` established the error contract, `009` the validation approach and the persistence pattern,
and `errors/duplicate-customer` had been sitting in the type registry since `002` waiting for
something to raise it.

So `007` defined nothing. That is the reconciliation's most useful output: what would have been a
foundational feature is a factory, two indexes, one endpoint and two normalisers.

**And the delivery order paid off once more.** AC-14 — a `GET` on the `Location` returns the same
resource — is satisfiable only because `008` shipped `GET /api/customers/{id}` the day before. Had
`007` come first it would have faced `009`'s dilemma: a `201` whose `Location` returns `404`, which
`009` solved by absorbing a read endpoint it did not own.

### BR-4.8 enforced twice, and the two halves must be indistinguishable

The application checks before inserting; the filtered unique index catches what the check cannot —
two simultaneous requests, where both read before either writes. Neither is redundant: without the
check a duplicate is a `DbUpdateException` and therefore a `500`; without the index two racing
requests both pass and both insert.

**Q-D made that a design constraint rather than a nicety.** A client cannot know which of two
racing requests it was, so the two paths must answer identically — which means catching the
violation, identifying the index **by name**, and raising the exception the pre-check raises. The
translation lives in `WaslDbContext` because it needs an EF Core type and because it belongs beside
the index configuration; matching on error number alone would translate an unrelated index's
violation into "this customer already exists".

AC-13 is the first test in this project to exercise `CLAUDE.md`'s *"does a duplicate request create
a duplicate row?"* row. `009` recorded `POST /api/tickets` as **not idempotent, unowned**; here the
index is the owner.

### AC-18 and AC-19 exist because the story could pass on the wrong mechanism

Both were added by the reconciliation, and the product owner kept them for that reason.

- **AC-19.** `Customers.Email` carries a case-insensitive collation, so AC-9's duplicate test
  passes whether or not the application lowercases anything. AC-19 reads the stored column back —
  without it, BR-4.2 is a rule nothing verifies.
- **AC-18.** `HasIndex(...).IsUnique()` reads identically with and without a filter. Unfiltered,
  SQL Server treats two NULLs as equal and rejects the **second** customer who has no email, with a
  `409` naming `email` — correct-looking, wrong, and diagnosed as a bug in the duplicate rule. The
  reason is proved directly, on a throwaway table, rather than argued.

### The value-object ruling, recorded in three places

`CLAUDE.md`'s structure block named `EmailAddress` and `PhoneNumber` from day one and neither was
ever built. Ruled before implementation: **static normalisers**. A value object earns its place by
making an invalid instance impossible to construct, and `Customer` has private setters and exactly
one factory, so that door was already shut; two wrappers would have cost an EF converter each and a
conversion on every read while enforcing nothing the factory does not.

Recorded in the spec, in `CLAUDE.md`'s code style (**"do not add them back on the grounds that a
structure diagram once named them"**), and in `12-delivery-log.md` with the reasoning — because a
file read at the start of every session that describes something which does not exist is the same
failure `009` and `011` both found in their own planning artifacts.

**The ruling is narrow.** The test is whether the type closes a door the aggregate leaves open.
`TicketNumber` stays a value object; `Email` is a string with a normal form, and normalisation is a
function, not an identity.

### Phone numbers: formatting is stripped, a country is never guessed

`+966 (55) 111-2233` becomes `+966551112233`. `0501234567` is a `400` saying *"Enter the phone
number in international format, starting with the country code."*

Deciding that a local number is Saudi is a business rule nobody has stated, and being wrong writes
an unreachable number into a record whose entire purpose is that its owner can be reached. The user
is told what to do instead. `017` can revisit it with a stated default region.

## Three defects found by running

| | |
|---|---|
| **`Customer` timestamps had never been stamped** | It predates `IAuditableEntity` and has no actor columns, so the stamping loop — which matches by interface — skipped it. Nothing noticed for six features because nothing had ever created a customer through the application: `--seed` writes SQL and `008`'s tests use reflection. The `201` returned `"createdAtUtc":"0001-01-01T00:00:00"` |
| **`POST` and `GET` disagreed on the timestamp** | `.7129947Z` against `.712Z` — full tick precision in memory, `datetime2(3)` in the column. A client caching a create response holds a value the server will never return again, and **every create in the product has that shape**. Caught only because AC-14 asserts the two bodies are byte-identical; a field-by-field comparison walks past it |
| **Two test fixtures wrote data the product forbids** | `008`'s seeding helper gave every customer the same phone number. Harmless until the unique index existed. The index was right and the fixtures were wrong |

## Open

| # | What | Owner |
|---|---|---|
| 1 | AC-16, AC-17 — the create form, its field-level validation, and the double-submit guard | frontend lane |
| 2 | The duplicate rule does not apply against **inactive** customers, so a deactivated person's address can be taken. Structural, via the filter. Reactivation is unde­signed | `017` |
| 3 | No country-aware phone normalisation. A local number is refused with an instruction | `017`, with a stated default region |
| 4 | `Customer` still has no actor columns, so who created a customer lives only in `dbo.AuditLog`. Correct by ADR-008, and worth naming | recorded |
| 5 | `POST /api/tickets` remains **not idempotent and unowned** — `007` closed the customer half of `CLAUDE.md`'s duplicate-request row, not the ticket half | `009`, recorded in its `tests.md` |

## The lesson from `008`, repeated one feature later

`008` recorded that a time-ordered id is a poor source of a unique *prefix*. `007`'s first test
helper used `Guid.CreateVersion7().ToString("N")[..10]` as an email local-part, and two customers
created in the same instant collided.

Writing it down once did not stop it recurring in the very next feature. Both helpers now use
`RandomNumberGenerator`, and the repetition is recorded because it is more useful than the original
finding.
