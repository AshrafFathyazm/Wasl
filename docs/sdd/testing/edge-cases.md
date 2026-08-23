# Edge Case Register

A shared list, so that each story does not have to rediscover the same categories.
Every story's `spec.md` states which of these apply, and `tests.md` records which were
exercised.

## Input

| Case | Expected |
|---|---|
| Empty string where a value is required | `400`, field named |
| Whitespace-only string | `400` — treated as empty, not as content |
| Value exactly at the maximum length | Accepted |
| Value one character over the maximum | `400` |
| Unicode, emoji, and RTL characters in a name or subject | Stored and returned unchanged |
| Leading and trailing whitespace | Trimmed before validation and storage |
| Mixed-case email | Normalised; matches an existing lower-case record (BR-4.2) |
| Phone with spaces, dashes, or parentheses | Normalised to E.164 (BR-4.3) |
| Phone that cannot be parsed | `400`, not `409` (BR-4.3) |
| `null` versus omitted for an optional field | Both treated as absent |
| Unknown enum value | `400` listing the accepted values |
| Unknown field in the JSON body | Ignored, not an error |
| Malformed JSON | `400`, and never a `500` |
| Payload far larger than expected | Rejected by request size limits, not by an out-of-memory failure |

## Identity and existence

| Case | Expected |
|---|---|
| Well-formed `Guid` that does not exist | `404` |
| Malformed `Guid` in the route | `400` |
| Referenced entity deleted between read and write | `404` or `409`, never a `500` |
| Referenced user is inactive | `400` (BR-2.4) |

## State

| Case | Expected |
|---|---|
| Every forbidden transition in the BR-1 matrix | `409` |
| Transition to the current status | `409` (BR-1.9) |
| Any mutation of a `Closed` ticket | `409` (BR-1.5) |
| `InProgress` without an assignee | `409` (BR-1.3) |
| Escalating an already-escalated ticket | `409` (BR-3.4) |
| Escalating a `Critical` ticket | Succeeds; priority unchanged (BR-3.6) |

## Concurrency

| Case | Expected |
|---|---|
| Two writes with the same `expectedVersion` | The second returns `409` |
| Two simultaneous ticket creations | Two distinct ticket numbers |
| Two simultaneous customer creations with the same email | One `201`, one `409` — enforced by the index, not by a check |
| Double-submitted form | Second request returns `409` for customers; accepted for tickets, with the reasoning in `05-api-conventions.md` |

## Permissions

| Case | Expected |
|---|---|
| No token | `401` |
| Expired token | `401` |
| Malformed or tampered token | `401` |
| Valid token, insufficient role | `403` |
| Agent acting on a ticket assigned to someone else | `403` (BR-6) |
| Agent acting on an unassigned ticket | Allowed for status; restricted for assignment (BR-2.2) |

## Lists

| Case | Expected |
|---|---|
| No results | `200` with an empty array (BR-7.6) |
| `page` beyond the last page | `200` with an empty array and a correct `totalCount` |
| `page=0` or negative | Clamped to 1 |
| `pageSize` above 100 | Clamped to 100 (BR-7.2) |
| `pageSize=0` | Clamped to the default |
| Several filters combined | AND (BR-7.3) |
| One filter repeated | OR (BR-7.4) |
| Search term containing `%`, `_`, or a quote | Treated as literal text, not as a pattern or as SQL |

## Audit

| Case | Expected |
|---|---|
| A mutation whose transaction rolls back | No audit row (BR-9.3) |
| A `403` | One row, `Outcome = Denied`, written outside any transaction (BR-9.4) |
| A failed sign-in | One row with the attempted email, never the password |
| A sign-in attempt for an email that does not exist | One row; the response still does not reveal whether the email exists |
| An update that changes nothing | No `Changes` entries; a row is still written recording the attempt (BR-9.8) |
| The actor is deleted after the action | The row still returns, using the snapshotted email and role (BR-9.6, BR-9.12) |
| The entity is deleted after the action | The row still returns, using `EntityLabel` (BR-9.12) |
| A user promoted from Agent to Manager | Their past rows still show `Agent` |
| Application attempts `UPDATE` or `DELETE` on the table | Rejected by the database grant (BR-9.5) |
| Comment added | The row records that a comment was added, not its text (BR-9.7) |
| Arabic request producing a mutation | The audit row is English (BR-9.10) |
| Cursor pagination while new rows are arriving | No skipped and no repeated rows |
| Audit read by an Agent | `403`, and that denial is itself audited |

## Localization

| Case | Expected |
|---|---|
| `Accept-Language: fr` | Falls back to `en` with `200`, and `Content-Language: en` (BR-8.3) |
| `Accept-Language: ar-EG` or `ar-SA` | Resolves to `ar` (BR-8.2) |
| `Accept-Language: ar;q=0.9, en;q=0.8` | `ar`; quality values honoured |
| `Accept-Language` absent | Stored preference, else `en` |
| Malformed `Accept-Language` | Ignored, falls through. Never a `400` |
| Stored preference disagrees with the header | Stored preference wins (BR-8.4) |
| `?culture=ar` with an English preference and an English header | `ar` (BR-8.4) |
| Empty string as the language value on `PUT /api/me/language` | `400` |
| Translation key missing at runtime | Falls back to English; never renders the raw key (BR-8.12) |
| Key present in `en` and absent from `ar` | The build fails (BR-8.11) |
| Arabic label longer than its English original | Layout adapts; a container sized to English text is the most common RTL defect |
| Arabic text inside the English interface, and the reverse | Correct direction per element via `dir="auto"` (BR-8.10) |
| A number adjacent to Arabic text | Correct position; a bidirectional-algorithm case that only a person will catch |
| Count of 2, or of 3–10, in Arabic | Correct plural category, not the English `other` form (BR-8.14) |
| Ticket number rendered under `ar` | Latin digits (BR-8.13) |
| Language switched with a form half-filled | Entered values preserved; only labels re-render |
| Arabic request producing a server log line | The log stays English (BR-8.9) |

## Frontend

| Case | Expected |
|---|---|
| API unreachable | Error state with a retry action, not a blank screen |
| API slow | Loading state, and the submit control is disabled |
| Submit clicked twice quickly | One request |
| Validation error returned by the server | Displayed against the field it names |
| Concurrency conflict returned | Explanatory message with a reload action (ADR-006) |
| Empty list | Empty state, not a bare table header |
| Switching language on any screen | Re-renders in place; no navigation, no lost state |
| Switching back to English | No residual right-to-left styling anywhere |
