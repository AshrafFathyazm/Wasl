# Test Matrix

Which story is covered by which kind of test, and which rules each verifies. A blank
cell means intentionally not covered at that level.

| Story | Unit | Integration | Frontend | E2E |
|---|---|---|---|---|
| **US-001** Create Customer | Contact invariant (BR-4.1), email and phone normalisation (BR-4.2, BR-4.3) | `POST` happy path, `400` validation, `409` duplicate email and phone, case-insensitive duplicate, `401` unauthenticated | Form validation, submit, `409` message display | Step 1 |
| **US-002** View Customer | — | `GET` by id, `404` unknown, list pagination defaults, `search` match, empty result is `200` | Loading, error, and not-found states | Step 2 |
| **US-003** Update Customer | Contact invariant on update | `PUT` happy path, `409` duplicate on change, `409` stale version, `404` unknown | Conflict reload path | — |
| **US-004** Customer Overview | — | Overview shape, zero-ticket case, executed-query count assertion (AC-4) | Empty state | — |
| **US-005** Create Ticket | Initial status is `New` (BR-1.1), ticket number formatting | `POST` happy path, unknown customer `404`, invalid enum `400`, history row written, concurrent creation produces distinct numbers | Form validation, customer picker, submit | Step 3 |
| **US-006** List and Filter | Filter predicate composition | Pagination envelope, page-size clamp at 100, AND across filters, OR within a filter, `search`, empty result, executed-query count assertion (AC-9) | Filter state in the URL, empty and loading states | — |
| **US-007** Assign Ticket | Assignment permission logic (BR-2.1–BR-2.3) | Manager assigns any, Agent self-assigns, Agent assigns other `403`, Agent reassigns `403`, inactive user `400`, closed ticket `409`, history row | Assignee picker, `403` message | Step 4 |
| **US-008** Change Status | **Every cell of the BR-1 matrix**, both permitted and forbidden; assignee requirement (BR-1.3); same-status rejection (BR-1.9) | Valid transition `200`, invalid `409` with permitted list, note required on close, Agent on another's ticket `403`, Manager `200`, stale version `409`, history row | Buttons reflect `allowedTransitions`, server rejection surfaced | Step 5 |
| **US-009** Escalate | Priority floor keeps `Critical` unchanged (BR-3.6), preconditions (BR-3.3, BR-3.4) | Manager `200`, Agent `403`, resolved or closed `409`, already escalated `409`, empty reason `400`, both history rows | Escalated badge, reason dialog | — |
| **US-010** Timeline and Comments | Comment body validation (BR-5.1) | `POST` comment, empty body `400`, closed ticket `409`, `CommentAdded` history row, merged timeline order, pagination, executed-query count assertion (AC-11) | Timeline render, internal-comment styling, load-older | Steps 6–7 |

| **US-014** Language and RTL | `PreferredLanguage` validation; catalogue key parity, both sides | `PUT /api/me/language` `204`/`400`/`401`; resolution order per level; `ar-EG`→`ar`; `fr`→`en` `200`; `Content-Language`; Arabic error with identical `type` and keys; enum values unchanged; logs stay English | `dir`/`lang` set and reverted; Arabic plurals at 0/1/2/3/11/100; Latin digits in a ticket number; `dir="auto"` on user content | Whole flow walked in Arabic, manually |

| **US-015** Audit log access | Filter predicate composition; cursor encode/decode | `GET /api/audit` envelope; each filter; `action` prefix match; `outcome` filters; Agent `403`; read writes an `Audit.Read` row; rows for deleted entities still return; snapshot not join; cursor pagination stable while rows are being inserted | — | — |

## Cross-cutting tests

Not owned by any one story; they belong to the walking skeleton and run on every build.

| Area | Test |
|---|---|
| Error contract | Every error response is `ProblemDetails` with a `traceId` |
| Information disclosure | No `500` response body contains a stack trace, SQL, or a type name |
| Authentication | Every non-public endpoint returns `401` without a token |
| Migrations | The full migration set applies to an empty database |
| Health | `/health` responds without authentication |
| Configuration | The application fails fast at startup if the signing key is missing, rather than starting insecurely |
| Localization | Catalogue key parity, `en` ↔ `ar`, backend and frontend — runs on every build |
| Localization | Every `ProblemDetails` response carries `Content-Language` |
| Localization | No lint violation for a hard-coded user-facing string or a physical CSS direction property |
| Audit | Every `ICommand` implements `IAuditableCommand` — architecture test, every build |
| Audit | Every mutating endpoint leaves exactly one audit row |
| Audit | Every `401` and `403` leaves an audit row |
| Audit | `UPDATE` and `DELETE` against `audit_log` are rejected by the database |
| Audit | No audit row in the suite contains a password, token, or comment body |
