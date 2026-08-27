# 009 — Technical Plan

**Phase:** 2 · **Story:** US-005 · **Feature:** `009-create-ticket` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

## Design Summary

`Ticket` is an aggregate root that owns its history rows. Creation goes through a
factory that sets the initial status and emits the `Created` history entry, so a
ticket cannot exist without its first audit record. The number comes from a database
sequence, formatted at insert time.

## Backend

**Four projects, ADR-002.** This section was written against ADR-010's two-project vertical
slices; ADR-010 is **rejected**, so every path below changed and the endpoint is a
**controller**, not a minimal API.

| Project | Component | Responsibility |
|---|---|---|
| `Wasl.Domain/Tickets/` | `Ticket` | Aggregate root. `Create` sets `New` and unassigned and stamps **nothing** — see `IAuditableEntity` |
| `Wasl.Domain/Tickets/` | `TicketHistoryEntry` | Append-only. `Created(ticketId, performedAtUtc)` — the timestamp is data the caller states, not infrastructure |
| `Wasl.Domain/Tickets/` | `TicketNumber` | `Format(int year, long sequence)` → `TCK-{yyyy}-{000000}`. Pure, so AC-3 and BR-8.13 are unit tests |
| `Wasl.Domain/Tickets/` | `TicketStatus`, `TicketCategory`, `TicketPriority` | Enums per `03-domain-model.md`, persisted as strings |
| `Wasl.Domain/Communications/` | `CommunicationChannel` | The **five** channels the product scope names: `Email`, `WhatsApp`, `LiveChat`, `Sms`, `WebForm` |
| `Wasl.Domain/Tickets/` | `TicketStatusTransitions` | The BR-1 map, **and all 36 tests** (moved from `012`). `AllowedFrom(status, hasAssignee)` — the raw matrix is private, because a caller reading it directly offers `InProgress` on an unassigned ticket |
| `Wasl.Domain/Common/` | `IAuditableEntity` | `CreatedAtUtc` · `UpdatedAtUtc` · `CreatedByUserId` · `UpdatedByUserId`, stamped by the DbContext |
| `Wasl.Application/Features/Tickets/CreateTicket/` | `CreateTicketCommand` · `Handler` · `Validator` · `CreateTicketResult` | The first production `IAuditableCommand`. Confirms the customer, draws a number, creates, saves |
| `Wasl.Application/Features/Tickets/GetTicketById/` | `GetTicketByIdQuery` · `Handler` | Not an `ICommand`, so no transaction and no audit row (AC-16) |
| `Wasl.Application/Common/Abstractions/` | `ITicketNumberGenerator` · `IRequestTimestamp` | Declared here, implemented in Infrastructure |
| `Wasl.Infrastructure/Persistence/` | `SequenceTicketNumberGenerator` | `NEXT VALUE FOR dbo.TicketNumberSeq`, formatted by the domain |
| `Wasl.Infrastructure/Persistence/Configurations/` | `TicketConfiguration` · `TicketHistoryEntryConfiguration` | Columns, lengths, string-stored enums, `rowversion`, indexes, **one** foreign key |
| `Wasl.Api/Controllers/` | `TicketsController` | Binds, dispatches, maps. `CreatedAtAction` so the `Location` is generated from the route that serves it |

**The history row is written by the handler, not by the domain factory.** The original plan
appended it inside `Ticket.Create` so AC-9 would hold for every caller — which is the right
instinct and does not survive the stamping decision: the factory no longer knows the instant,
because `SaveChangesAsync` supplies it. Both the ticket and its history row now read one scoped
`IRequestTimestamp`, so they carry the same instant by construction rather than by the factory
coordinating it.

### `ITicketNumberGenerator` is back, and the note that removed it was right

ADR-010 removed it as ceremony: one implementation, no second in prospect. Under ADR-002 the
handler is in `Wasl.Application`, which cannot see EF Core, and a sequence is a SQL Server
object — so the interface exists for the layer boundary, the same reason `IApplicationDbContext`
does.

**The original objection survives intact and is honoured:** a faked sequence proves nothing
about AC-11. The concurrency test runs eight real concurrent creates against a real sequence and
never against a substitute. That was a rule about the test, not about the interface.

`ITicketRepository` stays removed. `DbSet<Ticket>` is already a repository.
## Data Changes

Full detail in [`data-model.md`](data-model.md). In summary:

**Migration:** `AddTicketsAndHistory`

`dbo.Customers` already exists — `001-solution-skeleton` created it. **`dbo.SupportUsers` does
not**, and this section claimed it did: see `data-model.md`, which carries the correction and the
two other false statements it contained. So this migration adds two tables, one sequence, and
**one** foreign key. The four keys into `SupportUsers` belong to `004`, which creates that table.

```sql
CREATE SEQUENCE dbo.TicketNumberSeq AS bigint START WITH 1 INCREMENT BY 1;
```

`CREATE SEQUENCE` exists on SQL Server, so the mechanism survives ADR-013 unchanged —
only the syntax and the object name are engine-specific. It is **not** reset per year;
the year in the formatted number is informational, which is what keeps the value unique
and monotonic across a year boundary (`03-domain-model.md`, *Ticket number generation*).

| Index or constraint | Query or rule it serves |
|---|---|
| `UX_Tickets_Number` unique on `TicketNumber` | Lookup and search by number (`010`, `015`) |
| `IX_Tickets_Status_Created` on `(Status, CreatedAtUtc DESC)` | The default list query (`010`) |
| `IX_Tickets_Customer` on `CustomerId` | Customer overview (`018`) |
| `IX_Tickets_Assignee` on `AssignedToUserId` | "My tickets" filter (`010`) |
| `IX_TicketHistory_Ticket_Time` on `(TicketId, PerformedAtUtc)` | Timeline (`013`) |
| FK `Tickets.CustomerId` → `Customers`, `ON DELETE NO ACTION` | A customer with tickets cannot be removed |
| FK `TicketHistory.TicketId` → `Tickets`, `ON DELETE CASCADE` | History dies with its ticket |
| FK `Tickets.CreatedByUserId` → `SupportUsers`, `ON DELETE NO ACTION` | The author of a ticket must stay resolvable |
| FK `Tickets.AssignedToUserId` → `SupportUsers`, `ON DELETE NO ACTION` | Nullable; an unassigned ticket is normal |
| FK `Tickets.EscalatedByUserId` → `SupportUsers`, `ON DELETE NO ACTION` | Nullable; created here so `016` needs no second migration |
| FK `TicketHistory.PerformedByUserId` → `SupportUsers`, `ON DELETE NO ACTION` | The audit trail must never lose its actor |
| `RowVersion` `rowversion` column, mapped `.IsRowVersion()` | ADR-006 as amended by ADR-013; consumed by `011` and `012` |

Five indexes, across two tables — **four on `dbo.Tickets` plus its primary key, and one
on `dbo.TicketHistory`**. Worth stating precisely, because the verification query in
`BE-009-03` runs per table and a reviewer counting five rows against `dbo.Tickets` alone
would conclude the migration was short one index when it is not.

Enums are stored as strings so a database dump is readable and reordering the enum
cannot silently reinterpret existing rows.

> **Deferred with the keys themselves.** Everything below stands and none of it is built in
> `009`: the four columns are `uniqueidentifier NULL` with no key, because the table they point
> at does not exist. `004` creates it and adds all four in one migration — and this note is what
> stops the cascade trap below being rediscovered there the hard way.

### Why every `SupportUsers` foreign key is `NO ACTION`

`ON DELETE RESTRICT` is not SQL Server syntax; `NO ACTION` is the same behaviour
(ADR-013). But on this table the choice is not merely a rename:

`CreatedByUserId`, `AssignedToUserId`, and `EscalatedByUserId` all point at
`dbo.SupportUsers`. If any one of them cascaded there would be multiple cascade paths
from `SupportUsers` into `Tickets` and onward into `TicketComments` and `TicketHistory`,
and **SQL Server rejects multiple cascade paths outright at `CREATE TABLE` time** — not
at delete time. The migration would simply fail with `FK_Tickets_Assignee ... may cause
cycles or multiple cascade paths`, which reads as an EF bug and is not one.

EF Core also cannot infer three relationships to one entity. Each needs an explicit
`HasOne(...).WithMany().HasForeignKey(...)`. Left to convention it invents shadow
properties and the migration produces columns nobody intended — a defect that compiles,
migrates, and only shows up as a stray `SupportUserId1` column in the schema.

## API Contract

Frozen: [`contracts/tickets-api.md`](contracts/tickets-api.md).

| Method | Path | Request | Success | Failures |
|---|---|---|---|---|
| `POST` | `/api/tickets` | `{ customerId, subject, description, category, priority?, channel }` | `201` + `Location` + the created ticket | `400` `errors/validation`, `401` `errors/unauthenticated`, `404` `errors/not-found` naming `customerId` |

Response includes `id`, `ticketNumber`, `status`, `allowedTransitions`, `version`, the
classification fields, and a nested customer summary of id, name, and email.

The `404` uses the registered `errors/not-found` type from
`docs/sdd/documentation/api/error-handling.md` rather than inventing
`errors/customer-not-found`. The registry is closed on purpose: a client branches on
`type`, so a per-feature type means a client branch per feature. **Which** reference was
unresolvable is carried by the key of `errors` — `customerId` — and that is what lets the
picker clear its selection instead of showing a full-page not-found.

`allowedTransitions` is `["Open", "Closed"]` for `New` (AC-10). It is returned by the
server rather than derived by the client because the state machine lives in exactly one
place (ADR-004) — a client that computes it is a second copy that will drift.

## Audit

Added in migration. This plan predates ADR-008, so it carried no audit obligation, and
`NFR-10`'s architecture test — every `ICommand` must implement `IAuditableCommand` —
would have failed the build on the first commit of `CreateTicketCommand`.

| Path | Action | Outcome | Transaction |
|---|---|---|---|
| `201` | `Ticket.Created` | `Success` | **Same transaction** as the insert, written by the pipeline behaviour (BR-9.3). Rolls back with it |
| `401` | `Auth.Unauthenticated` | `Denied` | **Outside** any transaction — there is no business transaction to join (BR-9.2, BR-9.4) |
| `400`, `404` | — | — | Nothing written. See `spec.md` Q-3 for why, and for what would change it |

`EntityLabel` is the `TicketNumber`, so an audit row is readable without a join
(BR-9.6's sibling requirement). `Changes` carries the classification fields and the
customer id — **not** `Description`, which is user-entered free text of up to 4000
characters and is exactly the kind of content BR-9.7 keeps out of the forensic log. The
ticket row is the record of the description; the audit row is the record that a ticket
was created.

There is no `403` on this endpoint: BR-6 permits *create ticket* for both roles
(`spec.md` Q-4).

## Frontend

| Route | Component | Purpose |
|---|---|---|
| `/tickets/new` | `CreateTicketPage` | Hosts the form; owns the mutation (ADR-011 §4 — fetching at route level only) |
| — | `CustomerPicker` | Debounced search against `GET /api/customers`, single selection |
| — | `TicketForm` | Classification fields and submit; receives handlers as props, fetches nothing |

Enum options come from a shared constants module generated from the OpenAPI document,
not hand-typed, so a new enum value cannot silently be missing from the dropdown.

Screen spec: [`docs/sdd/design/screens/05-create-ticket.md`](../../docs/sdd/design/screens/05-create-ticket.md).
Feature-specific build detail — states, keys, RTL obligations — in
[`frontend-spec.md`](frontend-spec.md). The handoff the lane actually reads is
[`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md), and it does not wait for `BE-009-06`.

## Localization Impact

| Item | Detail |
|---|---|
| New client strings | Form labels, and the display names for every value of `TicketCategory`, `TicketPriority`, and `CommunicationChannel` |
| New server messages | `Validation.Subject.Required`, `Validation.Description.Required`, `Error.CustomerNotFound`, plus the invalid-enum message |
| Enum handling | Values travel as `Billing`, `High`, `WhatsApp`. Only the labels in the dropdowns are translated (BR-8.7). Adding a new enum value therefore needs a key in both catalogues, or the dropdown shows a fallback |
| Formatting | `TicketNumber` renders in Latin digits in both locales (BR-8.13) |
| User content | `Subject` and `Description` carry `dir="auto"` |

The enum-label catalogue is the one piece here that is easy to forget when a new
category is added later. The parity test catches a key missing from one language; it
does not catch a key missing from both. That gap is why enum labels are generated from
the OpenAPI enum list and checked against the catalogue at build time.

One addition from ADR-013: `Subject` and `Description` are `nvarchar(200)` and
`nvarchar(4000)`. Under `varchar` an Arabic subject stores as `????`, and it presents as
a font or encoding problem rather than a schema one — which is why `TEST-009-11`
round-trips an Arabic subject byte-for-byte instead of trusting the column type.

## Test Strategy

| Level | Covered | Why here |
|---|---|---|
| Unit | Initial status is `New`; the `Created` history row is appended by the factory; number formatting | Pure domain behaviour |
| Integration | `201`, `404` unknown customer, `400` variants, `401`, history row persisted, `allowedTransitions` present | HTTP and persistence |
| Integration | AC-11, two concurrent creations produce distinct numbers | Only a real sequence proves this |
| Integration | One `Ticket.Created` audit row per success; none after a forced rollback | BR-9.3 is a property of the pipeline, not of the handler, so it has to be observed end to end |
| Frontend | Customer picker selection required; validation; loading | The form carries real logic |

Integration tests run against a real SQL Server through `Testcontainers.MsSql`
(ADR-013). EF `InMemory` is not a substitute anywhere in this feature and is
specifically useless for three of its criteria: it has no sequences (AC-3, AC-11), it
does not enforce the unique index on `TicketNumber` (AC-3), and it does not enforce
foreign keys, so an unknown `customerId` would insert happily instead of failing (AC-4).

Not tested: enum serialisation, which is framework behaviour.

## Dependencies

`001-solution-skeleton` (solution, `DbContext`, migration harness, integration fixture),
`002-error-contract`, `003-audit-trail` (the `IAuditableCommand` pipeline this feature's
command plugs into), `004-auth-and-roles` (the token that supplies `createdByUserId`),
`005-localization-core`, `006-design-system`, and `007-create-customer` (customers must
exist to attach a ticket to). The customer search the picker calls belongs to `008`.

## Risks and Trade-offs

| Decision | Alternative | Why rejected |
|---|---|---|
| Database sequence for the number | `COUNT(*) + 1` | A race condition; two concurrent creations would collide (AC-11) |
| Database sequence | `Guid` only | Unusable in a conversation with a customer |
| Database sequence | Application-side counter | Not safe across instances, and not safe across restarts |
| History appended in the domain factory | Appended in the handler | One new caller away from being forgotten |
| Enums as strings | Enums as integers | A readable dump, and reordering cannot corrupt existing rows. Costs a few bytes per row |
| `NO ACTION` on the customer FK | Cascade | Cascading would delete a customer's entire ticket history along with the record |
| `NO ACTION` on all three `SupportUsers` FKs | Cascade on any one of them | SQL Server refuses to create the table at all — multiple cascade paths. Correct on its own merits, and here it is also the only creatable option |
| Five indexes created now | Add them when the queries arrive | They are created here because the columns are created here, and each names the feature that needs it. Creating them later means a second migration for no benefit |
| A concrete `TicketNumberSequence`, no interface | `ITicketNumberGenerator` with a fake in tests | A fake sequence cannot prove AC-11, which is the only reason a sequence exists. The interface would have had one implementation and bought a test that tests the fake |
| The audit row carries the classification, not the description | The whole request body | BR-9.7. A 4000-character free-text field in a forensic log is both a leak and unreadable |

## Files to Create or Change

```text
src/Wasl.Domain/Tickets/Ticket.cs
src/Wasl.Domain/Tickets/TicketHistory.cs
src/Wasl.Domain/Tickets/TicketNumber.cs
src/Wasl.Domain/Tickets/TicketStatus.cs
src/Wasl.Domain/Tickets/TicketStatusTransitions.cs
src/Wasl.Domain/Tickets/Enums.cs
src/Wasl.Api/Features/Tickets/CreateTicket/Endpoint.cs
src/Wasl.Api/Features/Tickets/CreateTicket/CreateTicketCommand.cs
src/Wasl.Api/Features/Tickets/CreateTicket/CreateTicketHandler.cs
src/Wasl.Api/Features/Tickets/CreateTicket/CreateTicketValidator.cs
src/Wasl.Api/Features/Tickets/CreateTicket/TicketResponse.cs
src/Wasl.Api/Features/Tickets/CreateTicket/TicketNumberSequence.cs
src/Wasl.Api/Common/Persistence/Configurations/TicketConfiguration.cs
src/Wasl.Api/Common/Persistence/Configurations/TicketHistoryConfiguration.cs
src/Wasl.Api/Common/Persistence/Migrations/*_AddTicketsAndHistory.cs
src/wasl-web/src/features/tickets/CreateTicketPage.tsx
src/wasl-web/src/features/tickets/TicketForm.tsx
src/wasl-web/src/features/tickets/api.ts
src/wasl-web/src/features/tickets/schema.ts
src/wasl-web/src/features/customers/CustomerPicker.tsx
tests/Wasl.Domain.Tests/Tickets/TicketCreationTests.cs
tests/Wasl.Domain.Tests/Tickets/TicketNumberTests.cs
tests/Wasl.Api.IntegrationTests/Tickets/CreateTicketTests.cs
tests/Wasl.Api.IntegrationTests/Tickets/TicketNumberSequenceTests.cs
```

## Contract changes

First contract for this resource: [`contracts/tickets-api.md`](contracts/tickets-api.md),
frozen 2026-08-23. `010` through `016` extend it; none of them may narrow it without an
entry here.

Nothing existed before it, so nothing is broken. The heading stays even when empty — an
empty contract-changes section is the statement that the contract did not move.

### 2026-08-27 — the keys of `errors` are camelCase

**Reported by the frontend lane from a live run, not from reading the contract.** Both lanes
were told.

The contract specifies field-name keys in camelCase — `errors.subject`, `errors.customerId`.
The server was sending `errors.Subject` and `errors.CustomerId`: FluentValidation reports the
**CLR property name**, and `ProblemDetailsFactory` passed it through untouched. So every
client lookup by the contract's key found nothing, and a `400` rendered as a validation error
with no fields attached — the form showing "something is wrong" and pointing at nothing.

Fixed in `Wasl.Api/Common/Errors/ProblemDetailsFactory.cs`: one `CamelCase(field)` helper,
applied in both `FromDomainException` and `FromValidationFailures`.

**Not a contract change — a defect in the implementation, found from the other side of the
contract.** It is recorded here because the contract is where the two lanes agree, and
because of how it stayed hidden: `002`'s `ErrorEnvelopeTests` asserted
`errors.TryGetProperty("FullName")`. **Those assertions were written from the implementation
rather than from `contracts/`, so the suite agreed with the defect.** Two server tests were
passing on the wrong casing while the client could not read a single key. Updated to
`errors.fullName` / `errors.email` alongside the fix.

The lesson is narrower than "test more": a test written by reading the code it tests
can only confirm that the code does what it does.

Two shape decisions in it are made **for later features**, deliberately, so the read
shape does not change under a client that has already shipped:

| Field | Consumed by |
|---|---|
| `version` (base64 `rowversion`) | `011-assign-ticket`, `012-change-ticket-status` — both send it back as `expectedVersion` |
| `allowedTransitions` | `012-change-ticket-status` renders the buttons from it |

Adding either later would be a breaking change to a response the frontend already
parses. Adding them now costs two fields nothing reads yet.
