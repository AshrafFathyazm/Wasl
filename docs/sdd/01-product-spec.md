# Product Specification — Customer Support CRM

## Actors

| Actor | Description |
|---|---|
| **Support Agent** | Creates and updates customers, creates tickets, works tickets assigned to them, adds comments, changes status of tickets they own or that are unassigned. |
| **Support Manager** | Everything an Agent can do, plus assign and reassign any ticket, change status of any ticket, and escalate. |
| **System** | Records an immutable history entry for every significant change and rejects state transitions that are not permitted. |

Both human roles are internal users of the same application. There is no customer
login in the MVP; the customer is a record, not a user.

## Functional requirements

### FR-1 Customer Management

| ID | Requirement |
|---|---|
| FR-1.1 | Create a customer with a name and at least one contact method. |
| FR-1.2 | View a customer profile including contact details. |
| FR-1.3 | Update customer profile and contact details. |
| FR-1.4 | Prevent duplicate customers according to a defined and tested rule. |
| FR-1.5 | View a customer's tickets and interaction history in one place. |
| FR-1.6 | Store free-text notes against a customer. |

### FR-2 Ticket Management

| ID | Requirement |
|---|---|
| FR-2.1 | Create a ticket that is always linked to exactly one customer. |
| FR-2.2 | Every ticket carries a category, a priority, and an originating channel. |
| FR-2.3 | Every ticket has a human-readable ticket number, unique and stable. |
| FR-2.4 | List tickets with filtering by status, priority, assignee, customer, and channel, and with pagination. |
| FR-2.5 | Assign or reassign a ticket to a support user. |
| FR-2.6 | Change ticket status only along permitted transitions. |
| FR-2.7 | Escalate a ticket according to an explicit rule. |
| FR-2.8 | Record an immutable history entry for creation, assignment, status change, priority change, escalation, and comments. |
| FR-2.9 | Add comments to a ticket, optionally marked internal. |

### FR-3 Communication Channels

| ID | Requirement |
|---|---|
| FR-3.1 | The supported channels are Email, WhatsApp, LiveChat, SMS, and WebForm. |
| FR-3.2 | A ticket records the channel it originated from. |
| FR-3.3 | A comment or interaction records the channel it arrived through. |
| FR-3.4 | Tickets can be filtered by channel. |

Real provider integration is out of scope. The channel is modelled as domain data so
that a provider adapter can be added later without changing the ticket model.

### FR-4 Authentication and Authorization

| ID | Requirement |
|---|---|
| FR-4.1 | Every API endpoint except health requires an authenticated user. |
| FR-4.2 | The authenticated user carries a role of `Agent` or `Manager`. |
| FR-4.3 | Authorization is enforced on the server; the UI only hides what the server would reject anyway. |

See `decisions/ADR-005-authentication.md` for the mechanism and its limits.

### FR-5 Localization

| ID | Requirement |
|---|---|
| FR-5.1 | The application supports two locales: English (`en`) and Arabic (`ar`). English is the default. |
| FR-5.2 | Every string a user reads is translatable. No user-facing text is hard-coded in a component or a controller. |
| FR-5.3 | Server-authored messages — validation errors and error responses — are returned in the caller's locale. |
| FR-5.4 | The Arabic interface renders right-to-left, including layout, alignment, icons that imply direction, and form controls. |
| FR-5.5 | A user can switch language, and the choice persists across sessions and devices. |
| FR-5.6 | Dates, times, and numbers are formatted for the active locale. |
| FR-5.7 | Content entered by users is stored and displayed exactly as entered, in whatever language it was written, and renders with the correct direction regardless of the interface language. |
| FR-5.8 | An unsupported requested locale falls back to English rather than failing. |

### FR-6 Audit

| ID | Requirement |
|---|---|
| FR-6.1 | Every operation that changes state is recorded with who did it, what changed, when, and whether it succeeded. |
| FR-6.2 | Every authentication and authorization event is recorded, including failures and denials. |
| FR-6.3 | The audit record survives deletion of the entity it describes. |
| FR-6.4 | The audit record is append-only and cannot be altered by the application. |
| FR-6.5 | The audit record never contains credentials, tokens, or the body of a comment. |
| FR-6.6 | Only a Manager may read the audit log, and reading it is itself recorded. |
| FR-6.7 | The audit log is queryable by entity, by actor, by time range, and by outcome. |

This is distinct from the ticket timeline (FR-2.8), which is a product feature for
agents. See `decisions/ADR-008-audit-log.md`.

## Non-functional requirements

| ID | Requirement | How it is measured |
|---|---|---|
| NFR-1 | Maintainability is preferred over cleverness | Review artifact records any construct that needed explanation |
| NFR-2 | Every endpoint returns a correct and documented status code | `05-api-conventions.md` plus integration tests |
| NFR-3 | List endpoints are paginated and filtered | Default page size 20, maximum 100 |
| NFR-4 | Errors never leak stack traces, SQL, or internal identifiers | Single error contract, verified by test |
| NFR-5 | Significant changes are auditable | `TicketHistory` row written in the same transaction as the change |
| NFR-6 | Concurrent edits do not silently overwrite each other | Optimistic concurrency, see `decisions/ADR-006-concurrency.md` |
| NFR-7 | The system runs locally from a clean clone in documented steps | `documentation/development/setup.md` |
| NFR-8 | Translation catalogues stay in step; a key added to one locale exists in the other | Automated key-parity test, run in CI |
| NFR-9 | Adding a third locale requires no code change, only a resource file and a registered culture | Culture list is configuration |
| NFR-10 | An audit gap is a build failure, not a review finding | Architecture test: every `ICommand` must implement `IAuditableCommand` |

## Acceptance principle

Every requirement above becomes at least one testable acceptance criterion in a
story `spec.md`. A requirement with no acceptance criterion is not in the build.
