# US-001 — Technical Plan

**Phase:** 2 · **Role:** Architecture · **Status:** Complete

## Design Summary

A `Customer` aggregate owns the contact invariant. Normalisation happens in value
objects so it cannot be skipped by a caller. Duplicates are prevented by unique
filtered indexes and reported by an application-level pre-check, which exists purely to
produce a usable message — the index is the actual guarantee.

## Backend

| Layer | Component | Responsibility |
|---|---|---|
| Domain | `Customer` | Aggregate root; enforces BR-4.1 in its factory method |
| Domain | `EmailAddress` (value object) | Parses, validates, and normalises per BR-4.2 |
| Domain | `PhoneNumber` (value object) | Parses and normalises to E.164 per BR-4.3 |
| Domain | `DuplicateCustomerException` | Signals BR-4.4 / BR-4.5 |
| Application | `CreateCustomerCommand` / `Handler` | Validates, checks for an existing match, creates, persists, maps |
| Application | `CreateCustomerValidator` | FluentValidation: required fields, lengths, the at-least-one-contact rule |
| Application | `ICustomerRepository` | `ExistsByEmailAsync`, `ExistsByPhoneAsync`, `AddAsync` |
| Infrastructure | `CustomerConfiguration` | Column types, lengths, indexes, check constraint |
| Infrastructure | `CustomerRepository` | EF Core implementation |
| Infrastructure | `DbUpdateException` translation | Maps the unique-index violation to `DuplicateCustomerException` |
| API | `CustomersController.Create` | Binds, delegates, returns `201` with `Location` |

Value objects rather than validated strings because normalisation has to happen
exactly once, in one place. A `string Email` property means every caller is
responsible for lowercasing, and one of them will forget — that is precisely the bug
BR-4.2 exists to prevent.

## Data Changes

Migration: `AddCustomers`

| Column | Type | Constraint |
|---|---|---|
| `Id` | `uniqueidentifier` | PK |
| `FullName` | `varchar(200)` | not null |
| `Email` | `varchar(320)` | null |
| `PhoneE164` | `varchar(20)` | null |
| `CompanyName` | `varchar(200)` | null |
| `Notes` | `varchar(2000)` | null |
| `IsActive` | `boolean` | not null, default true |
| `CreatedAtUtc` | `datetime2(3)` | not null |
| `UpdatedAtUtc` | `datetime2(3)` | not null |

| Index or constraint | Query or rule it serves |
|---|---|
| `ux_customers_email` — unique on `lower(Email)` where `Email is not null and IsActive` | BR-4.4 |
| `ux_customers_phone` — unique on `PhoneE164` where `PhoneE164 is not null and IsActive` | BR-4.5 |
| `ck_customers_contact` — `Email is not null or PhoneE164 is not null` | BR-4.1 |
| `ix_customers_fullname` on `FullName` | US-002 search — created here because the column is created here |
| `RowVersion` concurrency token | ADR-006; used by US-003 |

Email is stored already lowercased, so the index on `lower(Email)` is technically
redundant with the storage format. It is kept because it makes the constraint true
regardless of how a row arrives — including a manual `INSERT` during support work.

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
src/Wasl.Domain/Customers/Customer.cs
src/Wasl.Domain/Customers/EmailAddress.cs
src/Wasl.Domain/Customers/PhoneNumber.cs
src/Wasl.Domain/Customers/DuplicateCustomerException.cs
src/Wasl.Application/Customers/Create/CreateCustomerCommand.cs
src/Wasl.Application/Customers/Create/CreateCustomerHandler.cs
src/Wasl.Application/Customers/Create/CreateCustomerValidator.cs
src/Wasl.Application/Customers/CustomerDto.cs
src/Wasl.Application/Abstractions/ICustomerRepository.cs
src/Wasl.Infrastructure/Persistence/Configurations/CustomerConfiguration.cs
src/Wasl.Infrastructure/Persistence/Repositories/CustomerRepository.cs
src/Wasl.Infrastructure/Migrations/*_AddCustomers.cs
src/Wasl.Api/Controllers/CustomersController.cs
src/wasl-web/src/features/customers/CreateCustomerPage.tsx
src/wasl-web/src/features/customers/CustomerForm.tsx
src/wasl-web/src/features/customers/api.ts
src/wasl-web/src/features/customers/schema.ts
tests/Wasl.Domain.Tests/Customers/EmailAddressTests.cs
tests/Wasl.Domain.Tests/Customers/PhoneNumberTests.cs
tests/Wasl.Domain.Tests/Customers/CustomerTests.cs
tests/Wasl.Api.IntegrationTests/Customers/CreateCustomerTests.cs
```
