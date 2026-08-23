# API Overview

## Base

- Base path: `/api`
- Content type: `application/json`
- Interactive documentation is served in Development at `/swagger`
- Authentication: `Authorization: Bearer <token>`

## Getting a token

```http
POST /api/auth/token
Content-Type: application/json

{ "email": "manager@wasl.local", "password": "<from the seed configuration>" }
```

Returns a JWT containing the user id, email, and role. Every other endpoint requires
it. See `decisions/ADR-005-authentication.md` for the mechanism and its documented
limits.

## Conventions

Full detail in `05-api-conventions.md`. In summary:

| Aspect | Convention |
|---|---|
| Timestamps | UTC, ISO 8601, `Z` suffix |
| Identifiers | `Guid` in payloads; `TicketNumber` for humans |
| Enums | Strings |
| Errors | RFC 7807 `ProblemDetails`, always with a `traceId` |
| Lists | `{ items, page, pageSize, totalCount, totalPages }` |
| Pagination | `page` 1-based, default `pageSize` 20, maximum 100 |
| Concurrency | `expectedVersion` on writes; mismatch returns `409` |
| Language | `Accept-Language: en` or `ar`; every response carries `Content-Language` |

## Endpoints

### Customers

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/customers` | Create a customer |
| `GET` | `/api/customers` | Search and list, paginated |
| `GET` | `/api/customers/{id}` | Retrieve one |
| `PUT` | `/api/customers/{id}` | Update |
| `GET` | `/api/customers/{id}/overview` | Profile plus ticket summary |

### Tickets

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/tickets` | Create a ticket |
| `GET` | `/api/tickets` | List and filter, paginated |
| `GET` | `/api/tickets/{id}` | Retrieve one, including `allowedTransitions` |
| `PUT` | `/api/tickets/{id}/status` | Change status |
| `PUT` | `/api/tickets/{id}/assignee` | Assign or unassign |
| `POST` | `/api/tickets/{id}/escalate` | Escalate |
| `POST` | `/api/tickets/{id}/comments` | Add a comment |
| `GET` | `/api/tickets/{id}/timeline` | Merged comments and history |

### Me

| Method | Path | Purpose |
|---|---|---|
| `PUT` | `/api/me/language` | Store the caller's interface language |

### Support users

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/support-users` | Active users, for the assignee picker |

## Why sub-resources rather than `PATCH`

Status and assignee are separate endpoints because each is a distinct business action
with its own rules, its own authorization, and its own history entry. A generic
`PATCH /api/tickets/{id}` that accepts any field would make the state machine
unenforceable, because the server would have no way to know which change was intended
as which action.

## `allowedTransitions`

Every ticket read includes the transitions currently permitted from its status. The
client renders actions from this array rather than holding its own copy of the state
machine. There is one implementation of the rule, in the domain, and the client is
told the answer rather than working it out. See `decisions/ADR-004-ticket-state-machine.md`.
