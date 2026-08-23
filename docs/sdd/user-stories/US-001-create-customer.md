# US-001 — Create Customer

**Epic:** EPIC-001 · **Release:** 1 · **Depends on:** walking skeleton

## Story

As a **Support Agent**,
I want to **create a customer record**,
so that **tickets and interactions can be associated with a real person**.

## Business value

Nothing else in the system can be created until a customer exists. This is the first
story in the flow and the first proof that the write path works end to end.

## Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | A customer with a name and at least one contact method is created and returns `201` with a `Location` header |
| AC-2 | A request with no name, or with neither email nor phone, returns `400` with field-level errors (BR-4.1) |
| AC-3 | Email is trimmed and lowercased before storage (BR-4.2) |
| AC-4 | A phone number is normalised to E.164; an unparseable phone returns `400`, not `409` (BR-4.3) |
| AC-5 | Creating a customer whose normalised email matches an existing active customer returns `409` naming the conflicting field (BR-4.4, BR-4.7) |
| AC-6 | The same applies to a matching normalised phone (BR-4.5) |
| AC-7 | Two customers may share a name (BR-4.6) |
| AC-8 | The created customer can be retrieved by the id in the `Location` header |
| AC-9 | An unauthenticated request returns `401` |

## Rules referenced

BR-4.1 – BR-4.8, BR-6

## Out of scope

Update, deactivate, search, merge, import, attachments.

## Definition of Done

`09-definition-of-done.md`
