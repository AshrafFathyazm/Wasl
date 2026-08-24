# US-001 — Technical Plan

**Phase:** 2 · **Role:** Architecture · **Feature:** `007-create-customer` · **Story:** US-001 · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

## Design Summary

A `Customer` aggregate owns the contact invariant. Normalisation happens in value
objects so it cannot be skipped by a caller. Duplicates are prevented by unique
filtered indexes and reported by an application-level pre-check, which exists purely to
produce a usable message — the index is the actual guarantee.

## Backend

Two projects, one slice. ADR-010.

| Where | Component | Responsibility |
|---|---|---|
| `Wasl.Domain/Customers/` | `Customer` | Aggregate root; enforces BR-4.1 in its factory method |
| `Wasl.Domain/Customers/` | `EmailAddress` (value object) | Parses, validates, and normalises per BR-4.2 |
| `Wasl.Domain/Customers/` | `PhoneNumber` (value object) | Parses and normalises to E.164 per BR-4.3 |
| `Wasl.Domain/Customers/` | `DuplicateCustomerException` | Signals BR-4.4 / BR-4.5 |
| **The slice** — `Wasl.Api/Features/Customers/CreateCustomer/` | `Endpoint` | One minimal-API endpoint. Binds, authorizes, sends the command, returns `201` with `Location` |
| | `Command` + `Handler` | Validates, checks for an existing match, creates, persists, maps to `Response` |
| | `Validator` | FluentValidation: required fields, lengths, the at-least-one-contact rule |
| | `Response` | The DTO. Never the entity |
| | `DuplicateCustomerQuery` | Named query object — one caller, no interface. **Not** a repository |
| `Wasl.Api/Common/Persistence/` | `CustomerConfiguration` | Column types, lengths, the filtered indexes, the collation |
| `Wasl.Api/Common/Errors/` | `DbUpdateException` translation | Maps the unique-index violation to `DuplicateCustomerException`, which the shared middleware then maps to the `409` |

**Migration note.** The original plan put the command in `Wasl.Application`, the EF
configuration in `Wasl.Infrastructure`, an `ICustomerRepository` between them, and a
`CustomersController` on top. All four are gone: ADR-010 was accepted after that plan was
written, so this feature is one slice folder plus the domain, and `DbSet<T>` is the
repository. The original's *reasoning* about what each piece does is unchanged — only
where it lives, and one abstraction fewer.

**Why a query object and not a repository.** `DuplicateCustomerQuery` has exactly one
caller and no interface. `ICustomerRepository` with `ExistsByEmailAsync` /
`ExistsByPhoneAsync` / `AddAsync` would be an abstraction over `DbSet<T>`, which is
already one — an interface with one implementation and no second in prospect.

**Value objects rather than validated strings**, because normalisation has to happen
exactly once, in one place. A `string Email` property means every caller is responsible
for lowercasing, and one of them will forget — which is precisely the bug BR-4.2 exists
to prevent.

## Data Changes

Full detail in [`data-model.md`](data-model.md). In summary:

**Migration:** `AddCustomerDuplicateIndexes`

The `Customers` table and its check constraint already exist — `001-solution-skeleton`
created them, because a migration that creates one column proves nothing about the type
mapping in ADR-013. What this feature adds is the part that **is** the duplicate rule:

| Added here | Rule it serves |
|---|---|
| `UX_Customers_Email` — filtered unique index on `Email` where `Email IS NOT NULL AND IsActive = 1` | BR-4.4 |
| `UX_Customers_Phone` — filtered unique index on `PhoneE164` where `PhoneE164 IS NOT NULL AND IsActive = 1` | BR-4.5 |

**Not added here:** `IX_Customers_FullName`. It serves the customer search in `008`, and
the no-speculative-indexes rule means it arrives with the query that needs it.

### Why the index does not use `LOWER(Email)`

The blueprint originally specified a unique index on `lower(Email)`, which PostgreSQL
supports directly. **SQL Server cannot build a filtered index on an expression**, so
that form does not exist here (ADR-013 row 3).

Two things replace it, and both are needed:

1. **BR-4.2 normalises on write.** `EmailAddress` trims and lowercases before the value
   ever reaches EF Core, so the stored form is already canonical. This is the mechanism.
2. **The column carries an explicit case-insensitive collation.** So `ALI@X.COM`
   arriving through a manual `INSERT` during support work still collides with a stored
   `ali@x.com`. This is the guarantee.

The original note said the `lower()` index was "technically redundant with the storage
format, kept because it makes the constraint true regardless of how a row arrives." That
reasoning is exactly right and it now lands on the collation instead of the expression.
Relying on the application alone would mean the guarantee holds only for rows the
application wrote — which is the assumption BR-4.8 exists to refuse.

## API Contract

| Method | Path | Request | Success | Failures |
|---|---|---|---|---|
| `POST` | `/api/customers` | `{ fullName, email?, phone?, companyName?, notes? }` | `201` + `Location`, body is the created customer | `400` validation, `401`, `409` `errors/duplicate-customer` |

Response body:

```json
{
  "id": "…", "fullName": "…", "email": "…", "phone": "…",
  "companyName": null, "notes": null,
  "createdAtUtc": "…", "version": "…"
}
```

`version` is returned even though this story does not use it, so US-003 does not have
to change the read shape later.

## Frontend

| Route | Component | Purpose |
|---|---|---|
| `/customers/new` | `CreateCustomerPage` | Hosts the form |
| — | `CustomerForm` | Fields, Zod schema, submit |

- Zod schema mirrors AC-2 through AC-7, including the at-least-one-contact rule as a
  cross-field refinement.
- `useMutation` with the submit button disabled while pending, which satisfies AC-17.
- On `409`, the message from the server is attached to the field named in the
  response rather than shown as a banner, so the user sees the problem where it is.
- On success, navigate to the customer profile using the `Location` header.

## Localization Impact

| Item | Detail |
|---|---|
| New client strings | Form labels, the field-level validation messages, the duplicate-conflict message, the success toast |
| New server messages | `Validation.FullName.Required`, `Validation.Contact.AtLeastOne`, `Validation.Email.Invalid`, `Validation.Phone.Unparseable`, `Error.DuplicateCustomer.Email`, `Error.DuplicateCustomer.Phone` |
| Direction-sensitive layout | The form is a single column, so the risk is low. Field labels and validation text align to `start`, not `left` |
| User content | `FullName`, `CompanyName`, and `Notes` may be Arabic in an English interface. Every element rendering them carries `dir="auto"` |
| Not translated | The `email` and `phone` keys in the `errors` dictionary — they are contract field names (BR-8.7) |

One subtlety worth naming: BR-4.2 lowercases email for comparison. `ToLowerInvariant`
is used deliberately rather than a culture-aware `ToLower`, because a culture-sensitive
lowercase can behave differently under some locales and the duplicate rule must not
depend on who is calling it.

## Test Strategy

| Level | Covered | Why here |
|---|---|---|
| Unit | `EmailAddress` and `PhoneNumber` normalisation across many inputs; the BR-4.1 invariant in the `Customer` factory | Pure functions; the input space is wide and cheap to cover |
| Integration | Every AC involving HTTP: `201`, `400` variants, `409` on email and on phone, case-insensitive duplicate, `401`, retrieval via `Location` | The contract is HTTP-shaped |
| Integration | AC-13, two concurrent identical requests | Only a real unique index can prove this; it is the reason EF InMemory is not used |
| Frontend | Form validation, loading state, `409` field message, double-submit | The form carries real logic |

Not tested: the mapping from entity to DTO, which has no behaviour.

## Dependencies

Walking skeleton: solution structure, `DbContext`, authentication, error middleware,
integration test harness.

## Risks and Trade-offs

| Decision | Alternative | Why rejected |
|---|---|---|
| Value objects for email and phone | Validated `string` properties | Normalisation would be the caller's responsibility, and eventually a caller forgets |
| Pre-check plus unique index | Index only | The index produces a database error, not a usable message. The pre-check exists for the message; it is explicitly not the guarantee, because two concurrent requests can both pass it |
| Pre-check plus unique index | Pre-check only | A race between two requests would create the duplicate the rule exists to prevent |
| Duplicate rule scoped to active customers | All customers | Simpler, but it would permanently block an email if a customer were ever deactivated, with no reactivation path built. Recorded as a limitation |
| E.164 storage | Store as entered | Two records for the same number written differently, which defeats BR-4.5 |
| `409` names the field only | Return the existing customer | Discloses a record the caller may not be entitled to; search in US-002 is the intended path |

## Files to Create or Change

```text
src/Wasl.Domain/Customers/Customer.cs                          becomes a real aggregate; 001 left a shell
src/Wasl.Domain/Customers/EmailAddress.cs
src/Wasl.Domain/Customers/PhoneNumber.cs
src/Wasl.Domain/Customers/DuplicateCustomerException.cs

src/Wasl.Api/Features/Customers/CreateCustomer/Endpoint.cs     the whole slice, one folder
src/Wasl.Api/Features/Customers/CreateCustomer/Command.cs
src/Wasl.Api/Features/Customers/CreateCustomer/Handler.cs
src/Wasl.Api/Features/Customers/CreateCustomer/Validator.cs
src/Wasl.Api/Features/Customers/CreateCustomer/Response.cs
src/Wasl.Api/Features/Customers/CreateCustomer/DuplicateCustomerQuery.cs

src/Wasl.Api/Common/Persistence/Configurations/CustomerConfiguration.cs   changed, not created
src/Wasl.Api/Common/Persistence/Migrations/*_AddCustomerDuplicateIndexes.cs
src/Wasl.Api/Common/Errors/DuplicateCustomerExceptionMapping.cs           changed, not created

src/wasl-web/src/features/customers/CreateCustomerPage.tsx
src/wasl-web/src/features/customers/CustomerForm.tsx
src/wasl-web/src/features/customers/api.ts
src/wasl-web/src/features/customers/schema.ts

tests/Wasl.Domain.Tests/Customers/EmailAddressTests.cs
tests/Wasl.Domain.Tests/Customers/PhoneNumberTests.cs
tests/Wasl.Domain.Tests/Customers/CustomerTests.cs
tests/Wasl.Api.IntegrationTests/Customers/CreateCustomerTests.cs
```

## Contract changes

First contract for this resource: [`contracts/customers-api.md`](contracts/customers-api.md), frozen 2026-08-23.

Nothing existed before it, so nothing is broken. The heading stays even when empty —
an empty contract-changes section is the statement that the contract did not move.

The frontend lane reads [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md) and may start
as soon as that file exists; it does not wait for `BE-007-06`.
