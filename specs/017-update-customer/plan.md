# US-003 — Technical Plan

**Phase:** 5 · **Story:** US-003 · **Feature:** `017-update-customer` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

## Design Summary

One vertical slice, `Features/Customers/UpdateCustomer`, over the aggregate `007` already
built. The `Customer` aggregate gains an `Update` method that re-enforces BR-4.1 and
reports which fields actually changed, so the audit diff is produced by the domain rather
than reconstructed by the handler. Concurrency is EF Core's: the decoded
`expectedVersion` is assigned as the **original value** of `RowVersion`, so SQL Server
does the comparison in the `WHERE` clause of the `UPDATE` and a mismatch arrives as
`DbUpdateConcurrencyException`. No application code compares versions, and no application
code increments one.

The duplicate rule is the same query object `007` wrote, extended with an exclusion for
the row being updated. That one parameter is the whole difference between "the rule
applies to updates" and "no customer can ever be saved twice".

## Backend

Two projects, vertical slices, minimal APIs (ADR-010). There is no `Wasl.Application` and
no `Wasl.Infrastructure`; the slice owns everything it needs and the domain owns only what
is shared.

| Location | Component | Responsibility |
|---|---|---|
| `Wasl.Domain/Customers` | `Customer.Update(...)` | Applies the new field values, re-enforces BR-4.1, returns the set of fields that changed. Private setters stay private |
| `Wasl.Domain/Customers` | `CustomerChangeSet` | The changed-field record the domain returns: field name, before, after. Plain values, no EF, no JSON |
| `Wasl.Api/Features/Customers/UpdateCustomer` | `Endpoint.cs` | `MapPut("/api/customers/{id:guid}")`. Binds, authorizes, sends the command, maps the result |
| — | `UpdateCustomerCommand.cs` | `Id`, the five fields, `ExpectedVersion` (string). Implements `IAuditableCommand` with `Customer.Updated` |
| — | `UpdateCustomerHandler.cs` | Loads, decodes the version, calls `Update`, runs the duplicate query, saves |
| — | `UpdateCustomerValidator.cs` | FluentValidation: `fullName` required and bounded, lengths, at-least-one-contact, `expectedVersion` present and decodable |
| — | `CustomerResponse.cs` | Reused from `007`'s slice if identical; a shared response record lives in `Features/Customers/` rather than being duplicated |
| `Wasl.Api/Features/Customers` | `ActiveCustomerDuplicateQuery` | The named query object from `007`, gaining an `excludeCustomerId` parameter |
| `Wasl.Api/Common/Errors` | Middleware mapping | `DbUpdateConcurrencyException` → `409 errors/concurrency-conflict`; `DuplicateCustomerException` → `409 errors/duplicate-customer`. Both already single-place mappings from `002` |
| `Wasl.Api/Common/Persistence` | `CustomerConfiguration` | Unchanged. `RowVersion` is already `.IsRowVersion()` from `001` |
| `Wasl.Api/Common/Behaviors` | `TransactionBehavior`, `AuditBehavior` | Unchanged. The audit row lands in the same transaction because the pipeline puts it there, not because this handler remembers (BR-9.3) |

### Why the domain returns the change set

The audit diff has to name the fields that changed and no others (BR-9.8). The handler
*could* compare the DTO against the entity before calling `Update`, and that is the
implementation that goes wrong quietly: it compares the **raw** submitted email against
the **normalised** stored one, so `" Ali@Example.COM "` looks like a change to
`ali@example.com` and every save records a phantom edit. The domain has both values in
their normalised form because the value objects did the normalising, so it is the only
place that can answer the question correctly.

### Why `expectedVersion` is set as an original value, not compared

```csharp
db.Entry(customer).Property(c => c.RowVersion).OriginalValue = decoded;
```

EF Core then emits `UPDATE ... WHERE Id = @id AND RowVersion = @original`, and zero
affected rows becomes `DbUpdateConcurrencyException`. The alternative — read the row,
compare the bytes in C#, then save — is a check-then-act with a window between the two,
which is the race the concurrency token exists to close. It also reads as correct, which
is why it needs naming.

## Data Changes

Full detail in [`data-model.md`](data-model.md).

**No migration. No new column, no new index, no new constraint.**

Everything this feature needs already exists: `RowVersion` (`rowversion`) from
`001-solution-skeleton`, `CK_Customers_Contact` from `001`, and the two filtered unique
indexes plus the case-insensitive collation on `Email` from `007-create-customer`.

That is the interesting statement, not a gap. `017` is the feature that **exercises**
the schema `001` and `007` created, and if any of it was built wrong, this is where it
shows:

| Existing object | What `017` proves about it |
|---|---|
| `RowVersion rowversion` with `.IsRowVersion()` | It increments on `UPDATE` without a line of application code (AC-1, AC-15) |
| `UX_Customers_Email` filtered where `IsActive = 1` | It rejects an update into another active customer's email (AC-2) and does **not** reject an update to the row's own email (AC-7) |
| Case-insensitive collation on `Email` | `ALI@X.COM` typed into the edit form collides with a stored `ali@x.com` (AC-9) |
| `CK_Customers_Contact` | It is the last line of defence for AC-3, behind the domain invariant |

`BE-017-11` verifies this by query rather than by assumption, because a filtered index
whose `filter_definition` came back `NULL` from `007`'s migration presents here as
"editing a customer with no email fails", which reads as a bug in this feature and is a
defect in that one.

## API Contract

Frozen: [`contracts/customer-update-api.md`](contracts/customer-update-api.md).

| Method | Path | Request | Success | Failures |
|---|---|---|---|---|
| `PUT` | `/api/customers/{id}` | `{ fullName, email?, phone?, companyName?, notes?, expectedVersion }` | `200` with the full resource and a **new** `version` | `400` validation, `401`, `404`, `409` `errors/duplicate-customer`, `409` `errors/concurrency-conflict` |

Two distinct `409`s on one endpoint is the load-bearing detail. A client that branches on
the status code alone cannot tell "someone else edited this, reload" from "that email
belongs to another customer, change it" — and the two need opposite actions. Branch on
`type` (`docs/sdd/05-api-conventions.md`).

`PUT` replaces the mutable field set: an omitted optional field is cleared. This is stated
in the contract, in the frontend guide, and as AC-12, because it is the failure that
produces no error at all — a client that sends only the field the user touched silently
erases the other four.

## Frontend

| Route | Component | Kind (ADR-011 §4) | Purpose |
|---|---|---|---|
| `/customers/:id/edit` | `EditCustomerPage` | Route / page | Loads the customer, owns the mutation and the held version |
| — | `CustomerForm` | Feature component | Reused from `007` — same fields, same Zod schema, an `initialValues` prop and a different submit handler |
| — | `ConcurrencyConflictNotice` | Feature component | The conflict message and the reload action (AC-6) |
| — | `Input`, `Button`, `Callout` | Primitive | — |

- Fetching at route level only. The page reads `GET /api/customers/{id}` through TanStack
  Query, and the `version` it renders with is the one it will send.
- On `200`, the mutation writes the response into the query cache with
  `setQueryData(['customer', id], response)`. **Not `invalidateQueries` alone**: the held
  version has to be the one the server just returned, and an invalidate-then-refetch has a
  window in which the form holds the old version. That window is AC-23's bug.
- On `409 concurrency-conflict`, render `ConcurrencyConflictNotice`: an explanation, and a
  **Reload** button that refetches and repopulates the form. No auto-retry, no silent
  merge (ADR-006).
- On `409 duplicate-customer`, attach the server's message to the field the response names
  — the same behaviour as `007`, and deliberately *not* the conflict notice.
- On `404`, an inline not-found state. On `401`, redirect to sign-in; a session expiry is
  not a form error.
- The form submits **all five fields** every time, because of AC-12.

Screen: [`frontend-spec.md`](frontend-spec.md), and the element-level spec is the edit
variant of
[`docs/sdd/design/screens/08-create-customer.md`](../../docs/sdd/design/screens/08-create-customer.md),
with the profile's `[Edit]` action in
[`07-customer-profile.md`](../../docs/sdd/design/screens/07-customer-profile.md) as the
entry point.

## Localization Impact

| Item | Detail |
|---|---|
| New client strings | The page heading, `Save changes`, `Saving…`, the conflict title and explanation, the `Reload` action, the not-found state, the discard-changes confirmation |
| New server messages | `Validation.ExpectedVersion.Required`, `Validation.ExpectedVersion.Malformed`, `Error.ConcurrencyConflict.Customer`. The rest are reused from `007` — the same rules produce the same sentences, and duplicating them would mean two catalogue entries drifting apart |
| Direction-sensitive layout | The form is the create form. The conflict notice is new: it is a `Callout` with an inline action, so its icon and button move to the inline-start / inline-end and must use logical properties |
| User content | `fullName`, `companyName`, `notes` carry `dir="auto"`. Email and phone inputs stay LTR even under `ar` (`08-create-customer.md` RTL section) |
| Not translated | `ProblemDetails.type`, the keys of `errors`, `version` / `expectedVersion` (an opaque token), `traceId` (BR-8.7) |
| Audit rows | English regardless of the request locale (BR-9.10). The `Changes` diff contains user content verbatim, which is not translation |

The conflict message is the one string here that has to be written carefully rather than
translated mechanically: it has to say *what happened* ("someone else changed this
customer since you opened it") and *what to do* ("reload to see their version"), and the
Arabic has to say both without becoming two lines longer than the container.

## Test Strategy

| Level | Covered | Why here |
|---|---|---|
| Unit (`Wasl.Domain.Tests`) | `Customer.Update` re-enforcing BR-4.1; the change set naming only genuinely changed fields, including the normalised-equal case | Pure behaviour, wide input space, no database needed |
| Unit | `expectedVersion` decoding: valid, invalid base64, wrong length | It is a parse, and it must produce `400` rather than an exception |
| Integration (`Wasl.Api.IntegrationTests`, `Testcontainers.MsSql`) | Every AC that is HTTP-shaped: `200`, the two `409`s, `400` variants, `404`, `401` | The contract is HTTP-shaped, and both `409`s are database behaviour |
| Integration | AC-15, two writes on one version | Only a real `rowversion` proves this. EF `InMemory` does not enforce concurrency tokens, which is the reason it is not used anywhere (ADR-013) |
| Integration | AC-7, saving the row's own email | Only a real filtered unique index proves the exclusion works |
| Integration | AC-17 – AC-19, the audit row and its absence after a forced rollback | The transaction boundary is the thing under test, and it exists only in the real pipeline |
| Frontend (Vitest + RTL) | The conflict path: message rendered, reload refetches, **no** automatic resubmit; the held version updating after a save; the duplicate `409` attaching to a field | These are the acceptance criteria the user actually experiences (AC-6, AC-23) |
| Manual, recorded | The Arabic pass on the edit screen and the conflict notice (AC-24) | An RTL defect is visual; no assertion catches a container sized to English text |

Deliberately not tested: the mapping from entity to `CustomerResponse` (no behaviour); the
`GET` this screen depends on (owned by `008`); `IsActive` behaviour on update (unreachable,
per spec A-3 — listed in `tests.md` under **Not tested** with that reason).

## Dependencies

| Needs | For |
|---|---|
| `001-solution-skeleton` | `Customers` table, `RowVersion`, `CK_Customers_Contact`, the test harness |
| `002-error-contract` | `ProblemDetails` and the single mapping point for both `409`s |
| `003-audit-trail` | `IAuditableCommand`, the audit behaviour, the transaction behaviour |
| `004-auth-and-roles` | `401`, and the out-of-transaction denial row (BR-9.4) |
| `005-localization-core` | `IStringLocalizer`, the `.resx` catalogues, the key-parity test |
| `006-design-system` | The primitives the edit screen and the conflict notice are built from |
| `007-create-customer` | The `Customer` aggregate, the value objects, the duplicate query object, `CustomerForm`, the filtered unique indexes |
| `008-customer-list-and-profile` | `GET /api/customers/{id}` returning `version`, and the profile screen's `[Edit]` entry point. **Hard dependency** — without the `GET` there is no version to send (spec A-1) |

## Risks and Trade-offs

| Decision | Alternative | Why rejected |
|---|---|---|
| `expectedVersion` in the request body | `If-Match` with an `ETag` | HTTP-correct, and it is the answer in a system whose concurrency story is cache validation. Rejected because `docs/sdd/05-api-conventions.md` already fixed the body form for every mutating endpoint; two transports for one concept means every client picks one and the ticket endpoints in `011`/`012` would have to pick the same one. One mechanism, stated once |
| Version set as EF's `OriginalValue` | Read the row, compare bytes, then save | A check-then-act with a window between the check and the write — the exact race the token exists to close. It also passes every single-user test |
| The 409 body carries nothing | Return the current resource in the `409` | Saves a round trip and invites a silent merge, which ADR-006 rejected by name. `ProblemDetails` has no field for it, so it would have to be smuggled into an extension member |
| `PUT` replaces the mutable set | `PATCH` with merge semantics | `PATCH` needs a way to distinguish "absent" from "set to null" — `JsonPatchDocument`, or a nullable wrapper per field. Five fields on one screen do not justify that machinery, and `05-api-conventions.md` lists `PUT` for this endpoint |
| Duplicate query excludes `Id` | Skip the duplicate check when the email is unchanged | Works, and it is fragile: "unchanged" has to be computed against the normalised value, and getting that wrong means either a phantom conflict or a missed one. Excluding the row is one `WHERE` clause and cannot be got subtly wrong |
| The domain returns the change set | The handler diffs the DTO against the entity | The handler sees raw input and stored values, so it diffs unnormalised against normalised and records phantom changes. The domain has both in canonical form |
| `409 concurrency-conflict` checked before the duplicate rule | Report both | Two conflicts in one response, and the client would have to decide which to act on first. The version is checked by the `UPDATE` itself, so this ordering is a property of the mechanism rather than a choice made in code |
| Reuse `CustomerForm` from `007` | A separate `EditCustomerForm` | Two forms with the same five fields and the same Zod schema drift apart, and the second one is the one that forgets `dir="auto"`. The differences are `initialValues` and the submit handler, which are props |
| `setQueryData` after a successful save | `invalidateQueries` and refetch | The refetch window leaves the form holding the previous version, so the user's second save fails with a `409` they did nothing to earn (AC-23) |
| No customer field history | A `CustomerHistory` table mirroring `TicketHistory` | Explicitly out of scope in US-003, and ADR-008 answers the question it would answer: the `Customer.Updated` audit row records who changed which field, from what, to what. Building both would be the redundancy ADR-008 accepted knowingly for tickets, without the timeline requirement that justified it there |

## Files to Create or Change

```text
src/Wasl.Domain/Customers/Customer.cs                                        (change: Update method)
src/Wasl.Domain/Customers/CustomerChangeSet.cs                               (new)
src/Wasl.Api/Features/Customers/UpdateCustomer/Endpoint.cs                   (new)
src/Wasl.Api/Features/Customers/UpdateCustomer/UpdateCustomerCommand.cs      (new)
src/Wasl.Api/Features/Customers/UpdateCustomer/UpdateCustomerHandler.cs      (new)
src/Wasl.Api/Features/Customers/UpdateCustomer/UpdateCustomerValidator.cs    (new)
src/Wasl.Api/Features/Customers/ActiveCustomerDuplicateQuery.cs              (change: excludeCustomerId)
src/Wasl.Api/Features/Customers/CustomerResponse.cs                          (change: shared by 007 and 017)
src/Wasl.Api/Common/Errors/ExceptionMapping.cs                               (change: DbUpdateConcurrencyException → 409)
src/Wasl.Api/Common/Localization/Resources/Wasl.en.resx                      (change: 3 keys)
src/Wasl.Api/Common/Localization/Resources/Wasl.ar.resx                      (change: 3 keys)
src/wasl-web/src/features/customers/EditCustomerPage.tsx                     (new)
src/wasl-web/src/features/customers/ConcurrencyConflictNotice.tsx            (new)
src/wasl-web/src/features/customers/CustomerForm.tsx                         (change: initialValues prop)
src/wasl-web/src/features/customers/api.ts                                   (change: updateCustomer)
src/wasl-web/src/features/customers/queries.ts                               (change: useUpdateCustomer)
src/wasl-web/src/features/customers/schema.ts                                (change: expectedVersion)
src/wasl-web/src/routes.tsx                                                  (change: /customers/:id/edit)
src/wasl-web/src/lib/i18n/en/customers.json                                  (change)
src/wasl-web/src/lib/i18n/ar/customers.json                                  (change)
tests/Wasl.Domain.Tests/Customers/CustomerUpdateTests.cs                     (new)
tests/Wasl.Domain.Tests/Customers/RowVersionTokenTests.cs                    (new)
tests/Wasl.Api.IntegrationTests/Customers/UpdateCustomerTests.cs             (new)
tests/Wasl.Api.IntegrationTests/Customers/UpdateCustomerConcurrencyTests.cs  (new)
tests/Wasl.Api.IntegrationTests/Customers/UpdateCustomerAuditTests.cs        (new)
src/wasl-web/src/features/customers/__tests__/EditCustomerPage.test.tsx      (new)
```

**No migration file.** If a migration appears in this feature's diff, something was
modelled wrong — see [`data-model.md`](data-model.md).

## Contract changes

First contract for this endpoint:
[`contracts/customer-update-api.md`](contracts/customer-update-api.md), frozen 2026-08-23.

It **reuses** `007`'s `CustomerResponse` shape unchanged, including `version`, which `007`
returned deliberately so this feature would not have to move the read shape. That
prediction held; nothing in `007`'s contract changes here.

One thing to watch when `008` freezes its own contract: `GET /api/customers/{id}` must
return the same `version` field, spelled the same way. If it does not, this endpoint is
uncallable and the failure surfaces in the frontend lane, not the backend one.

The heading stays even when empty — an empty contract-changes section is the statement
that the contract did not move.

The frontend lane reads [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md) and may start as
soon as that file exists; it does not wait for `BE-017-06`.
