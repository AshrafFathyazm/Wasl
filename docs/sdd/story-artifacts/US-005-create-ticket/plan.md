# US-005 — Technical Plan

**Phase:** 2 · **Role:** Architecture · **Status:** Complete

## Design Summary

`Ticket` is an aggregate root that owns its history rows. Creation goes through a
factory that sets the initial status and emits the `Created` history entry, so a
ticket cannot exist without its first audit record. The number comes from a database
sequence, formatted at insert time.

## Backend

| Layer | Component | Responsibility |
|---|---|---|
| Domain | `Ticket` | Aggregate root; `Create` factory sets `New` and appends the `Created` history row |
| Domain | `TicketHistory` | Owned entity; append-only |
| Domain | `TicketCategory`, `TicketPriority`, `CommunicationChannel`, `TicketEventType` | Enums per `03-domain-model.md` |
| Application | `CreateTicketCommand` / `Handler` | Validates, confirms the customer exists, reserves a number, creates, saves |
| Application | `CreateTicketValidator` | Required fields, lengths, enum validity |
| Application | `ITicketNumberGenerator` | `NextAsync(CancellationToken)` |
| Infrastructure | `SequenceTicketNumberGenerator` | Reads the SQL Server sequence and formats the value |
| Infrastructure | `TicketConfiguration`, `TicketHistoryConfiguration` | Columns, lengths, string-stored enums, indexes |
| API | `TicketsController.Create` | Binds, delegates, returns `201` |

The history row is appended inside the domain factory rather than by the handler, so
that AC-9 holds for every caller. A handler-level append is one refactor away from
being forgotten.

## Data Changes

Migration: `AddTicketsAndHistory`

Tables: `Tickets`, `TicketHistory`, plus sequence `ticket_number_seq`.

| Index or constraint | Query or rule it serves |
|---|---|
| `ux_tickets_number` unique on `TicketNumber` | Lookup and search by number (US-006) |
| `ix_tickets_status_created` on `(Status, CreatedAtUtc desc)` | The default list query (US-006) |
| `ix_tickets_customer` on `CustomerId` | Customer overview (US-004) |
| `ix_tickets_assignee` on `AssignedToUserId` | "My tickets" filter (US-006) |
| `ix_tickethistory_ticket_time` on `(TicketId, PerformedAtUtc)` | Timeline (US-010) |
| FK `CustomerId` → `Customers`, restrict on delete | A customer with tickets cannot be removed |
| FK `TicketId` → `Tickets`, cascade | History dies with its ticket |
| `RowVersion` concurrency token | ADR-006; used by US-007 and US-008 |

Enums are stored as strings so a database dump is readable and reordering the enum
cannot silently reinterpret existing rows.

## API Contract

| Method | Path | Request | Success | Failures |
|---|---|---|---|---|
| `POST` | `/api/tickets` | `{ customerId, subject, description, category, priority?, channel }` | `201` + `Location` + the created ticket | `400`, `401`, `404` unknown customer |

Response includes `id`, `ticketNumber`, `status`, `allowedTransitions`, `version`, the
classification fields, and a nested customer summary of id, name, and email.

## Frontend

| Route | Component | Purpose |
|---|---|---|
| `/tickets/new` | `CreateTicketPage` | Hosts the form |
| — | `CustomerPicker` | Debounced search against `GET /api/customers`, single selection |
| — | `TicketForm` | Classification fields and submit |

Enum options come from a shared constants module generated from the OpenAPI document,
not hand-typed, so a new enum value cannot silently be missing from the dropdown.

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

## Test Strategy

| Level | Covered | Why here |
|---|---|---|
| Unit | Initial status is `New`; the `Created` history row is appended by the factory; number formatting | Pure domain behaviour |
| Integration | `201`, `404` unknown customer, `400` variants, `401`, history row persisted, `allowedTransitions` present | HTTP and persistence |
| Integration | AC-11, two concurrent creations produce distinct numbers | Only a real sequence proves this |
| Frontend | Customer picker selection required; validation; loading | The form carries real logic |

Not tested: enum serialisation, which is framework behaviour.

## Dependencies

US-001 (customers exist), walking skeleton.

## Risks and Trade-offs

| Decision | Alternative | Why rejected |
|---|---|---|
| Database sequence for the number | `COUNT(*) + 1` | A race condition; two concurrent creations would collide (AC-11) |
| Database sequence | `Guid` only | Unusable in a conversation with a customer |
| Database sequence | Application-side counter | Not safe across instances, and not safe across restarts |
| History appended in the domain factory | Appended in the handler | One new caller away from being forgotten |
| Enums as strings | Enums as integers | A readable dump, and reordering cannot corrupt existing rows. Costs a few bytes per row |
| Restrict delete on the customer FK | Cascade | Cascading would delete a customer's entire ticket history along with the record |
| Four indexes created now | Add them when the queries arrive | They are created here because the columns are created here, and each names the story that needs it. Creating them later means a second migration for no benefit |

## Files to Create or Change

```text
src/Wasl.Domain/Tickets/Ticket.cs
src/Wasl.Domain/Tickets/TicketHistory.cs
src/Wasl.Domain/Tickets/Enums.cs
src/Wasl.Application/Tickets/Create/CreateTicketCommand.cs
src/Wasl.Application/Tickets/Create/CreateTicketHandler.cs
src/Wasl.Application/Tickets/Create/CreateTicketValidator.cs
src/Wasl.Application/Tickets/TicketDto.cs
src/Wasl.Application/Abstractions/ITicketRepository.cs
src/Wasl.Application/Abstractions/ITicketNumberGenerator.cs
src/Wasl.Infrastructure/Persistence/Configurations/TicketConfiguration.cs
src/Wasl.Infrastructure/Persistence/Configurations/TicketHistoryConfiguration.cs
src/Wasl.Infrastructure/Persistence/SequenceTicketNumberGenerator.cs
src/Wasl.Infrastructure/Migrations/*_AddTicketsAndHistory.cs
src/Wasl.Api/Controllers/TicketsController.cs
src/wasl-web/src/features/tickets/CreateTicketPage.tsx
src/wasl-web/src/features/tickets/TicketForm.tsx
src/wasl-web/src/features/customers/CustomerPicker.tsx
tests/Wasl.Domain.Tests/Tickets/TicketCreationTests.cs
tests/Wasl.Api.IntegrationTests/Tickets/CreateTicketTests.cs
```
