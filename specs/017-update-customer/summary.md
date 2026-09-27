# `017` — Summary

**Phase:** 7 · **Role:** Summary · **Status:** **Delivered 2026-09-03 by `035`.** This record
written 2026-09-27
**Story:** US-003 · **Endpoint:** `PUT /api/customers/{id}` · **Screen:** `/customers/:id/edit`

Written for someone who was not present. This is what is read in six months and discussed when
the decision is questioned.

---

## 1 · Why this file is dated three weeks after the feature

**`017` was built under another feature's number and its own folder was never closed.**
`035-customer-detail-edit-and-add-sheet` delivered both halves on 2026-09-03 and says so in its
own summary, in its own words:

> **`PUT /api/customers/{id}`** — the backend half of `017`, on its frozen contract, without
> changing it.

So the code shipped, the tests shipped, and the record did not. That is a broken gate rather
than a cosmetic gap — the working agreement's gate 6 says an implemented feature with no
`summary.md` **cannot be reviewed against what it promised**, and for three weeks `017` was a
folder holding a spec, a plan, a frozen contract and four templates that still read
*"Status: Not started"* about a live endpoint.

**It was found by a scan that looked for missing summaries and nearly reported the wrong
thing.** The first pass listed `017`, `018` and `019` as *having* a summary, because the file
exists. It is the template. *Assert content, not presence* — this repo's own testing rule,
arriving through the documentation.

This file does not re-litigate any of `035`'s decisions. It records what `017` asked for and
what answers it got, so the two can be compared without reading two folders.

---

## 2 · What was built

**Three ordered checks in one handler**, and the order is the contract:

1. the row exists → `404`
2. the version matches → `409 errors/concurrency-conflict`
3. the contacts are free → `409 errors/duplicate-customer`

**`Customer` gained its second mutator.** `SupportUser.ChangeLanguage` was the first (`014`);
everything else in the domain was still create-only. `PUT` **replaces** the mutable field set,
so an omitted optional field is cleared rather than preserved — AC-12, and the test for it is
named for the behaviour rather than the verb.

**The first endpoint that consumes the concurrency token.** ADR-006 chose optimistic
concurrency in `001` and `rowversion` had been a column nobody read until this. `expectedVersion`
is length-checked before any base64 buffer is allocated — `004b` AC-38's rule, applied here.

**`/customers/:id/edit`** reuses the create form's Zod schema, pre-filled from the read, and
sends every field on every save because `PUT` replaces. A `409 concurrency-conflict` gets its
own banner and its own control; it never retries by itself.

---

## 3 · The acceptance criteria, against the evidence

**The integration suite could not be run on the day this was written** — see
[tests.md](tests.md) §2. So this table separates *what a named test asserts* from *what was
executed today*, and never merges them.

| # | Criterion | Evidence |
|---|---|---|
| AC-1 | valid update returns the resource, new version | `A_valid_update_returns_the_resource_and_a_get_returns_the_same_bytes` — and it compares the `PUT` and the `GET` **as raw JSON**, which is `007` AC-14's lesson |
| AC-2 | another active customer's email → `409` naming `email` | `Another_customers_email_is_a_duplicate_naming_only_the_field` |
| AC-3 | clearing both contacts → `400` naming **both** | `Clearing_both_contact_methods_is_a_400_naming_both` |
| AC-4 | stale version → `409 concurrency-conflict` | `A_stale_version_is_a_concurrency_conflict` |
| AC-5 | unknown id → `404`; **malformed id → `400`** | First half: `An_unknown_id_is_a_404`. **Second half ANSWERED DIFFERENTLY — see §4** |
| AC-6 | the UI explains a `409` and offers reload, never auto-retries | `035`'s frontend suite |
| AC-7 | a customer's own contacts are not a conflict with itself | `Re_saving_a_customer_with_its_own_contacts_is_not_a_duplicate` |
| AC-8 | another customer's phone → `409` naming `phone` | `Another_customers_phone_is_a_duplicate` |
| AC-9 | email trimmed and lowercased, phone normalised, as on create | `The_email_is_normalised_before_it_is_stored` |
| AC-10 | unparseable phone → `400`, never `409` | `An_unparseable_phone_is_a_400_and_not_a_conflict` |
| AC-11 | missing `fullName` → `400` | the shared validator; `002c`'s `RequiredMemberCoverageTests` is what keeps it from reaching the handler as `null` |
| AC-12 | an omitted optional field is **cleared** | `An_omitted_optional_field_is_cleared_rather_than_kept` |
| AC-13 | missing `expectedVersion` → `400`, not `409` | `A_missing_version_is_a_400_naming_the_field` |
| AC-14 | undecodable or wrong-length version → `400`, never `500` | `An_undecodable_version_is_a_400` **and** `An_over_long_version_is_a_400` — two tests, because `004b` AC-38 found the length must be checked *first* |
| AC-15 | two updates on one version → one `200`, one `409` | **No parallel test found.** `007` AC-13 remains the project's only concurrency test; the serial equivalent (AC-4) is covered. Recorded, not claimed |
| AC-16 | `UpdatedAtUtc` from the injected `TimeProvider` | `The_row_in_the_database_carries_the_new_values`; the clock itself is `IRequestTimestamp`, guarded globally by NFR-10's scanner |
| AC-17 | one audit row, `Customer.Updated`, same transaction, only changed fields | `A_successful_update_writes_one_audit_row_with_an_actor` |
| AC-18 | a refusal leaves the row unchanged and writes no succeeded row | `A_rejected_update_writes_no_succeeded_row` |
| AC-19 | a no-op update still writes a row with empty `Changes` (BR-9.8) | **No test found for the empty-`Changes` half.** The endpoint deliberately does **not** answer `409` to a no-op save — the test file's own note calls that "the most common request it will ever get" — but that a row is written *with no entries* is unasserted |
| AC-20 | no token → `401`, audited outside any transaction | `004b`'s `AuthDenialResultHandler`, asserted there rather than here |
| AC-21 | both roles may update; no `403` path | The endpoint carries no policy, so there is nothing to refuse. **Asserted by absence, not by a test with an Agent token** |
| AC-22 | the `409` body carries no customer data | `002`'s envelope shape; `ProblemDetails` has nowhere to put a customer |
| AC-23 | the returned version is immediately usable | `The_returned_version_works_on_the_next_update` |
| AC-24 | the edit screen viewed in Arabic, RTL, with LTR email and phone inputs | **`035`'s deliverable. Not evidenced here** |

**Three criteria are recorded without a test of their own: AC-15, AC-19's second half, and
AC-21.** None is a defect; each is a claim resting on something else — a shared mechanism, an
absence, or a sibling criterion. They are listed so that nobody reads this table as twenty-four
green lights.

---

## 4 · AC-5's second half was answered differently, by ruling

`017` AC-5 asks for `400` on a malformed id. **It returns `404`, deliberately.**

`[HttpPut("{id:guid}")]` — the route constraint means a non-GUID never matches the route, so the
handler is never reached and `002b`'s `UseStatusCodePages` envelopes a `404`. That is structural,
not an oversight in the handler.

And the ruling is recorded in `002b`'s own summary:

> **`GET /api/tickets/not-a-guid` stays `404`**, ruled. A `400` would tell an unauthenticated
> prober that the id *shape* was wrong. `008` AC-3 and `011` D-2 are closed as *answered
> differently*.

`017` AC-5 is the third criterion asking the same question and gets the same answer. It is
**closed as answered differently**, not unmet.

> **`CLAUDE.md` contradicts itself about this**, and the contradiction is between two bullets
> written at different moments: the `002b` row says it "closed `008` AC-3", and the `008` row
> says "AC-3 recorded unmet — `002b` owns it". Both are true of their own day. The ruling above
> is the resolution, and it is recorded here rather than by editing either line.

---

## 5 · Known limitations

- **No parallel-update test.** AC-15 describes the exact race the version check exists for, and
  the suite proves it serially. `007` AC-13 is still the only concurrency test in the project.
  The control is the `rowversion` itself, which is a database mechanism rather than a check —
  the distinction this repo draws for BR-4's filtered index.
- **AC-19's empty-`Changes` half is unasserted.** A no-op save writes a row; that the row's
  `Changes` is empty rather than absent is the part nobody measured.
- **AC-24's Arabic walk belongs to `035`** and is not evidenced in this folder.
- **The integration suite was not run when this record was written** — Docker's WSL backend was
  unavailable. See [tests.md](tests.md) §2. Every row in §3 that names a test is a *static*
  citation, and it is labelled as one.

---

## 6 · Deviations from the plan

| Planned | What happened |
|---|---|
| `017` delivered as its own feature with its own tasks | Delivered inside `035`, on `017`'s **frozen contract, unchanged** — which is the part that matters, and `035` states it |
| `tasks.md` executed and ticked | `017`'s task list was never run as written; `035`'s was. `017/tasks.md` is left as the plan it was, unticked, rather than back-dated to look executed |
| `summary.md`, `tests.md`, `ai-notes.md`, `review.md` at delivery | Three weeks late. `review.md` is a phase-6 artifact for a review that did not happen under this number and is **left as a template rather than invented** |
