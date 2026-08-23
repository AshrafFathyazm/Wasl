# US-001 — Specification

**Phase:** 1 · **Role:** Specification · **Status:** Complete

## Understanding

A support agent needs to record a person or organisation the team supports, so that
tickets have something to attach to. The record needs a name and at least one way to
reach the person. The system must stop the same person being recorded twice, because
duplicate customers split a person's history across two records and the split is
usually noticed only after it has done damage.

This is the first write path in the system. It establishes the validation approach,
the error contract, and the persistence pattern that later stories follow.

## In Scope

- Creating a customer with name, email, phone, company, and notes
- Normalising email and phone before comparison and storage
- Rejecting duplicates on email and on phone
- Returning `201` with a `Location` header
- A create-customer form in the client with validation and error display

## Out of Scope

| Excluded | Reason |
|---|---|
| Update and deactivate | US-003 |
| Search and list | US-002 |
| Customer overview with tickets | US-004 |
| Merging existing duplicates | No requirement; a rule that prevents new duplicates does not imply a tool for old ones |
| Bulk import | No requirement |
| Attachments | Out of scope project-wide |
| Address fields | Not in the requirements; adding them speculatively means validating and displaying data nobody asked for |

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | A customer is a single person, not a company with contacts. `CompanyName` is a label on the person, not a relationship | The model needs a `Company` entity, which is a new story |
| A-2 | Phone numbers may be international, so E.164 is the storage format | If all customers are single-country, normalisation could be simpler — but E.164 is not wrong in that case |
| A-3 | Email is the primary contact method in practice, but the system must not require it | If phone-only customers do not exist, the invariant could be simplified |
| A-4 | Two customers sharing a name is legitimate and common | If the business wants name-based duplicate warnings, that is a soft warning feature, not this rule |

## Open Questions

| # | Question | Working assumption |
|---|---|---|
| Q-1 | Should a duplicate return the existing customer's id so the client can navigate to it? | No. It returns the conflicting field only. Returning the id leaks a record the caller may not have been entitled to look up, and the search in US-002 is the intended way to find it |
| Q-2 | Is a customer ever deleted? | No hard delete. `IsActive` exists for future deactivation but is not exposed in this story |

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | `POST /api/customers` with a name and at least one contact method returns `201` with a `Location` header pointing at the new resource |
| AC-2 | A missing or whitespace-only `fullName` returns `400` with a field-level error naming `fullName` |
| AC-3 | A request with neither `email` nor `phone` returns `400` naming both fields (BR-4.1) |
| AC-4 | Email is trimmed and lowercased before storage; `" Ali@Example.COM "` is stored as `ali@example.com` (BR-4.2) |
| AC-5 | A syntactically invalid email returns `400` |
| AC-6 | A phone containing spaces, dashes, or parentheses is normalised to E.164 (BR-4.3) |
| AC-7 | A phone that cannot be normalised returns `400` naming `phone`, not `409` (BR-4.3) |
| AC-8 | Creating a customer whose normalised email matches an existing active customer returns `409` with `type: errors/duplicate-customer` and names `email` (BR-4.4, BR-4.7) |
| AC-9 | The duplicate check is case- and whitespace-insensitive: `ALI@EXAMPLE.COM` conflicts with a stored `ali@example.com` |
| AC-10 | The same duplicate behaviour applies to a matching normalised phone (BR-4.5) |
| AC-11 | Two customers with the same `fullName` and different contact details are both created (BR-4.6) |
| AC-12 | The `409` response does not include the existing customer's id or other details (BR-4.7) |
| AC-13 | A unique database index enforces both duplicate rules, so two concurrent identical requests produce one `201` and one `409` (BR-4.8) |
| AC-14 | The created customer can be retrieved at the URL in the `Location` header |
| AC-15 | A request without a valid token returns `401` |
| AC-16 | The client form shows field-level validation before submitting, a loading state while submitting, and the server's message on `409` |
| AC-17 | Submitting the form twice quickly produces one request |

## Edge Cases

From `testing/edge-cases.md`: empty string, whitespace-only, exactly at maximum
length, one over, unicode in a name, mixed-case email, phone with formatting
characters, unparseable phone, `null` versus omitted, unknown field in the body,
malformed JSON, two simultaneous identical creations, double-submitted form.

Specific to this story:

| Case | Expected |
|---|---|
| Email matching an **inactive** customer | Created. The rule applies between active customers (BR-4.4). Recorded as a known limitation — reactivation is not designed |
| Email valid but 320 characters | Accepted; 321 returns `400` |
| Name of 200 characters | Accepted; 201 returns `400` |
| Both email and phone duplicate a record | `409`; the response names `email` first and stops. Reporting one conflict is enough to act on |

## Rules Referenced

BR-4.1 – BR-4.8, BR-6 (create is permitted for both roles), BR-7.6 (not applicable
here, listed only to note it is deferred to US-002)
