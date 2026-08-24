# 017 — Task Breakdown

**Phase:** 5 · **Story:** US-003 · **Feature:** `017-update-customer` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

Agents are **named** here and **not dispatched until the plan is approved**. Naming is the
plan; dispatching is implementation.

What changed in this migration, from
`docs/sdd/story-artifacts/US-003-update-customer/tasks.md`:

| Change | Why |
|---|---|
| Task IDs renumbered `BE-003-nn` → `BE-017-nn` (and `FE-`, `TEST-`, `DOC-`) | The number is the feature folder's, so an ID says where it lives without a lookup (`specs/README.md`). `003` is now `audit-trail` |
| `Agent` and `Skill` columns added to every row | Values from the table in `specs/README.md`, verbatim |
| **`BE-017-09` added: the audit obligation** | The original predates ADR-008. No task carried it, so nothing would have written a `Customer.Updated` row — and NFR-10's architecture test fails the build the moment `UpdateCustomerCommand` exists without `IAuditableCommand`. An audit gap is exactly the omission that test exists to catch, and it would have been found by a red build rather than by a reviewer |
| **`BE-017-10` added: the `401` denial row** | BR-9.2 and BR-9.4 — an authentication failure has no business transaction to join, so its row is written **outside** any transaction. That asymmetry is implemented wrongly by accident (ADR-008 says so in as many words), so it gets its own task and its own test. There is no `403` task because BR-6 permits both roles to update a customer; that absence is deliberate and stated in `spec.md` A-5 |
| **`FE-017-00` added: the screen preview** (Phase 3b) | Rendering a screen costs minutes. Changing one that already has tests, translation keys, and query wiring costs hours (ADR-009). The conflict state is previewed with it, because it is the state that gets discovered late |
| **`BE-017-11` added: verify, do not migrate** | The original assumed a schema change. There is none — and the *absence* of a migration is a claim that needs checking, because `017` is where `007`'s filtered indexes and `001`'s `rowversion` are first exercised |
| **`REV-017-04` added: OpenAPI vs the contract** | A gate in `specs/README.md` that gets skipped. Two `409` types on one endpoint is precisely the thing a generated document gets half right |
| Paths corrected to the ADR-010 slice layout | `src/Wasl.Application/...` and `src/Wasl.Infrastructure/...` do not exist. There are two projects |
| Verification changed from `psql`-shaped to `sys.indexes`-shaped | ADR-013. SQL Server, `Testcontainers.MsSql`, `rowversion` — never `xmin`, never EF `InMemory` |

## Critical path

```text
BE-017-01 → BE-017-02 → BE-017-04 → BE-017-05 → BE-017-06 → FE-017-02 → FE-017-04
```

`BE-017-05` and `FE-017-04` are on it because AC-4 and AC-6 are the story. Everything
before them is the plumbing that lets the conflict be produced; `FE-017-04` is the only
task that makes the conflict *usable*.

## Backend

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| BE-017-01 | `Customer.Update(...)` applies the five fields, re-enforces the at-least-one-contact invariant, and returns a `CustomerChangeSet` naming only fields whose **normalised** value changed | `007` | `dotnet test tests/Wasl.Domain.Tests --filter CustomerUpdate` — including the case where only the casing of the email changed | AC-3, AC-9, AC-12, AC-19 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-017-02 | `UpdateCustomerCommand`, handler, and FluentValidation validator in one slice folder `Features/Customers/UpdateCustomer/` | BE-017-01 | Unit tests for the validator, including a missing `expectedVersion` | AC-11, AC-13 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-017-03 | `ActiveCustomerDuplicateQuery` gains `excludeCustomerId`, so the row being updated cannot conflict with itself | BE-017-02 | Integration test: saving the customer's own email returns `200`, another active customer's returns `409` | AC-2, AC-7, AC-8 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-017-04 | `expectedVersion` decodes from base64 to `byte[]` and is assigned as the `OriginalValue` of `RowVersion`; malformed or wrong-length input is `400`, never `409` and never `500` | BE-017-02 | Unit test on the decoder plus an integration test per malformed form | AC-13, AC-14 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-017-05 | `DbUpdateConcurrencyException` maps to `409` with `type: errors/concurrency-conflict` in the shared middleware — one mapping, no endpoint building an error by hand | `002`, BE-017-04 | Integration test: two `PUT`s with the same `expectedVersion` give one `200` and one `409`, and the `409` body carries no customer data | AC-4, AC-15, AC-22 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-017-06 | `PUT /api/customers/{id:guid}` returns `200` with the full resource and the **new** `version`; unknown id `404`; malformed id `400` | BE-017-02 | Integration test asserting the returned `version` differs from the one sent, and that it works as `expectedVersion` on an immediate second `PUT` | AC-1, AC-5, AC-23 | `voltagent-lang:dotnet-core-expert` | `speckit-implement` |
| BE-017-07 | A unique-index violation on update surfaces as `DuplicateCustomerException`, not `DbUpdateException`, so a genuine race produces the same `409` a sequential duplicate does | BE-017-03 | Integration test forcing two concurrent updates into the same email | AC-2, AC-8, BR-4.8 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-017-08 | `UpdatedAtUtc` comes from the injected `TimeProvider`, never `DateTime.UtcNow`, and is returned in the response | BE-017-06 | Integration test with a fake `TimeProvider` asserting the exact stamp | AC-16 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-017-09 | `UpdateCustomerCommand` implements `IAuditableCommand` with action `Customer.Updated` (BR-9 naming table); the row is written by the pipeline behaviour in the **same transaction** (BR-9.3) and its `Changes` carries only the fields that actually changed (BR-9.8) | `003`, BE-017-01, BE-017-02 | Integration test: exactly one row on success; **no** row after a forced rollback; empty `Changes` on a no-op save; the architecture test passes | AC-17, AC-18, AC-19, BR-9.1, BR-9.3, BR-9.8 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-017-10 | A `401` on this endpoint writes an `Auth.Unauthenticated` audit row **outside** any transaction (BR-9.4), and the row records the attempt without a token value in it (BR-9.7) | `003`, `004`, BE-017-06 | Integration test without a token: `401`, one audit row present, no `Customer.Updated` row | AC-20, BR-9.2, BR-9.4 | `voltagent-lang:dotnet-core-expert` | `superpowers:test-driven-development` |
| BE-017-11 | **No migration.** Confirm the schema this feature depends on is already correct: `RowVersion` is `rowversion` mapped `.IsRowVersion()`, and both filtered unique indexes still carry their `WHERE` clause | `001`, `007` | `SELECT name, is_unique, filter_definition FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.Customers')` — `filter_definition` **non-null** on both; plus `SELECT c.name, t.name FROM sys.columns c JOIN sys.types t ON c.user_type_id = t.user_type_id WHERE c.object_id = OBJECT_ID('dbo.Customers') AND c.name = 'RowVersion'` returning `timestamp`. **If `dotnet ef migrations add` produces a non-empty migration here, stop — something was modelled wrong** | AC-7, AC-15, ADR-006, ADR-013 | `voltagent-lang:sql-pro` | — |
| BE-017-12 | Server-authored messages for the three new keys resolve through `IStringLocalizer` and exist in both `.resx` catalogues | `005`, BE-017-05 | Key-parity test, plus an `Accept-Language: ar` request returning an Arabic `title` with a byte-identical `type` | BR-8.6, BR-8.7 | `voltagent-lang:dotnet-core-expert` | — |
| BE-017-13 | OpenAPI metadata declares `200`, `400`, `401`, `404`, and **both** `409` types on this one endpoint | BE-017-05, BE-017-07 | `/swagger` inspected, then compared against `contracts/customer-update-api.md` | Contract | `voltagent-lang:dotnet-core-expert` | — |

## Frontend

Starts as soon as [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md) exists. It does not
wait for `BE-017-06`. It **does** need `008`'s `GET /api/customers/{id}` to be real before
`FE-017-02` can run end to end, because the version has to come from somewhere.

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| FE-017-00 | Screen preview of the **edit** variant: real tokens, real copy, plausible data lengths, all states including **conflict** and **not found**, both languages. **Approved before any wiring** | `006` | Rendered and reviewed (Phase 3b), recorded in `frontend.md` | AC-6, AC-24 | `ui-ux-pro-max:ui-styling` | `frontend-design` |
| FE-017-01 | Request/response types and the Zod schema extended with `expectedVersion`. Types marked **provisional** until generated from OpenAPI | Contract frozen | `npm run typecheck` | AC-1, AC-13 | `voltagent-lang:typescript-pro` | — |
| FE-017-02 | `/customers/:id/edit` loads the customer at route level, prefills `CustomerForm`, and holds the `version` it loaded | FE-017-01, `008` | Component test with a mocked `GET`; manual run against the API | AC-1, AC-23 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-017-03 | Submit sends **all five fields** plus `expectedVersion`; on `200` the response is written into the query cache with `setQueryData` so the held version is the one the server just returned | FE-017-02, BE-017-06 | Component test: two consecutive saves both succeed with no reload between them | AC-12, AC-23 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-017-04 | `409 errors/concurrency-conflict` renders an explanatory message and a **Reload** action that refetches and repopulates. **No automatic retry and no silent merge** | FE-017-03 | Component test with a mocked `409`: the message appears, no second `PUT` is issued, and Reload triggers exactly one `GET` | AC-6, AC-22 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-017-05 | `409 errors/duplicate-customer` attaches to the field the server names and is visibly **not** the conflict notice — the client branches on `type`, never on the status code | FE-017-03 | Component test with each `409` mocked in turn, asserting two different renderings | AC-2, AC-8 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-017-06 | `400` messages attach to their fields, including the at-least-one-contact rule on **both**; `404` renders an inline not-found state; `401` redirects to sign-in | FE-017-03 | Component tests per response | AC-3, AC-5, AC-11 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-017-07 | Save disabled while the mutation is pending; a double-click sends one request, so the client never produces a `409` it caused itself by racing its own first `PUT` | FE-017-03 | Component test plus a manual run on a throttled network | AC-6, AC-15 | `voltagent-lang:react-specialist` | `superpowers:test-driven-development` |
| FE-017-08 | The profile's `[Edit]` action navigates here and back on success, with the profile's cached data updated rather than stale | `008`, FE-017-03 | Manual run: save, land on the profile, see the new values with no manual refresh | AC-1 | `voltagent-lang:react-specialist` | `frontend-design` |
| FE-017-09 | Provisional types replaced with types generated from the OpenAPI document | BE-017-13 | `npm run typecheck` after regeneration | ADR-011 §6 | `voltagent-lang:typescript-pro` | — |
| FE-017-10 | Every new string from a catalogue, present in `en` **and** `ar`; the edit screen and the **conflict notice** viewed in Arabic, rendering RTL, with email and phone still LTR | `005`, FE-017-04 | Key-parity test, plus the Arabic pass recorded in `tests.md` with what it found | AC-24, BR-8.8, BR-8.11 | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |
| FE-017-11 | The conflict notice is announced to assistive technology when it appears, the Reload action is keyboard reachable with a visible focus ring, and focus moves to the notice rather than staying on a now-meaningless Save button | FE-017-04 | Keyboard-only walkthrough and a screen-reader pass, recorded | AC-6 | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |

## Tests

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| TEST-017-01 | `Customer.Update` unit tests: the invariant, the change set, and the normalised-equal case that must **not** register as a change | BE-017-01 | Test run | AC-3, AC-9, AC-19 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-017-02 | Happy path: `200`, every field updated, a new `version`, `UpdatedAtUtc` from the fake clock | BE-017-06, BE-017-08 | Test run | AC-1, AC-16 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-017-03 | The returned `version` works immediately as `expectedVersion` on a second `PUT` | BE-017-06 | Test run | AC-23 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-017-04 | Two `PUT`s with the same `expectedVersion`: one `200`, one `409 errors/concurrency-conflict` | BE-017-05 | Test run against `Testcontainers.MsSql` — never EF `InMemory`, which does not enforce a concurrency token | AC-4, AC-15 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-017-05 | Saving the customer's own email and own phone unchanged returns `200`, not `409` | BE-017-03 | Test run | AC-7 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-017-06 | Changing email, then phone, into another **active** customer's value returns `409 errors/duplicate-customer` naming that field | BE-017-03 | Test run | AC-2, AC-8 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-017-07 | Clearing both contact methods returns `400` naming both fields | BE-017-02 | Test run | AC-3 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-017-08 | Each `400` variant: whitespace `fullName`, unparseable phone, over-length field, missing `expectedVersion`, malformed `expectedVersion` | BE-017-02, BE-017-04 | Test run | AC-10, AC-11, AC-13, AC-14 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-017-09 | An omitted optional field is cleared, and clearing the last contact method is still `400` | BE-017-06 | Test run | AC-12 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-017-10 | Unknown `Guid` → `404`; malformed `Guid` → `400` | BE-017-06 | Test run | AC-5 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-017-11 | One `Customer.Updated` audit row per successful update; **none** after a forced rollback; `Changes` naming only changed fields; empty `Changes` on a no-op save | BE-017-09 | Test run | AC-17, AC-18, AC-19 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-017-12 | `401` without a token: one `Auth.Unauthenticated` row, written outside any transaction, and no `Customer.Updated` row | BE-017-10 | Test run | AC-20 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-017-13 | An `Agent` token and a `Manager` token both succeed — there is no `403` on this endpoint | BE-017-06 | Test run | AC-21, BR-6 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-017-14 | The `409 concurrency-conflict` body contains no customer data, and neither `409` leaks the other customer's id or name | BE-017-05, BE-017-07 | Test run | AC-22, BR-4.7 | `comprehensive-review:security-auditor` | — |
| TEST-017-15 | An Arabic `fullName` written over an English one round-trips byte-identical; the audit row stays English | BE-017-06, BE-017-09 | Test run | ADR-013, BR-9.10 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-017-16 | Frontend: the conflict path renders, issues no automatic `PUT`, and Reload issues exactly one `GET` | FE-017-04 | `npm run test` | AC-6 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |
| TEST-017-17 | Frontend: two consecutive saves succeed with no reload, proving the held version was replaced | FE-017-03 | `npm run test` | AC-23 | `voltagent-qa-sec:test-automator` | `superpowers:test-driven-development` |

## Documentation

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| DOC-017-01 | `docs/sdd/documentation/api/` lists `PUT /api/customers/{id}` with both `409` types | BE-017-13 | Read it | DoD | main session | — |
| DOC-017-02 | The concurrency story documented once, here, as the worked example the ticket endpoints (`011`, `012`) point at rather than re-explain | BE-017-05 | Read it; `012`'s plan cites it | ADR-006 | main session | — |
| DOC-017-03 | `summary.md` written: what changed, trade-offs, known limitations — including that there is no customer field history and the audit row is the answer | All | DoD checklist | DoD | main session | — |
| DOC-017-04 | `tests.md` and `ai-notes.md` completed with **observed** output; `08-board.md` and `12-delivery-log.md` updated | DOC-017-03 | The `verify-story` gate | DoD | main session | `verify-story` |

## Review

| ID | Outcome | Depends on | Verified by | Serves | Agent | Skill |
|---|---|---|---|---|---|---|
| REV-017-01 | Layer boundaries, `CancellationToken` on every async path, no `DateTime.UtcNow` inline, correctness against every AC, no scope creep | All | `review.md` verdict `Approved` | DoD | `comprehensive-review:code-reviewer` | `code-review:code-review` |
| REV-017-02 | Security: neither `409` leaks another customer's data; the audit `Changes` diff contains customer PII **by design** (ADR-008) and nothing beyond it — no token, no password, no header dump (BR-9.7); no PII in logs | BE-017-05, BE-017-09 | `review.md` | DoD | `comprehensive-review:security-auditor` | — |
| REV-017-03 | The concurrency mechanism reviewed specifically: the version is never compared in application code, never incremented in application code, and the `UPDATE` carries it in its `WHERE` clause | BE-017-04, BE-017-05 | Read the generated SQL from an EF log in the integration run | ADR-006, NFR-6 | `comprehensive-review:code-reviewer` | `code-review:code-review` |
| REV-017-04 | Generated OpenAPI compared line by line against `contracts/customer-update-api.md`, with particular attention to **both** `409` types being documented rather than one | BE-017-13 | Any difference fixed in one of the two before closing — never one silently | DoD | main session | — |
| REV-017-05 | The Arabic pass on the edit screen and the conflict notice, reviewed as a deliverable rather than a checkbox | FE-017-10 | Findings written into `tests.md`, including "nothing found" if that is the result | AC-24 | `voltagent-qa-sec:accessibility-tester` | `chrome-devtools-mcp:a11y-debugging` |

## Droppable if time runs short

`017` is itself in the droppable half of the release (`specs/README.md`, Phase 5). Inside
it:

| Task | What is lost |
|---|---|
| FE-017-08 profile round trip | The user saves and then navigates manually. Mildly annoying; nothing is wrong |
| FE-017-07 disabled-while-pending | A double-click sends two `PUT`s. The second gets a `409 concurrency-conflict` from the first one's version bump — so the data is safe and the user sees a confusing conflict they caused themselves. Drop only as a last resort, and record it |
| BE-017-07 unique-index translation on update | AC-2 still works for the sequential case. Under a genuine race the `409` degrades to a `500`. Rare, still a real defect |
| DOC-017-02 the concurrency write-up | `011` and `012` re-derive it, and one of them derives it differently |
| TEST-017-15 Arabic round-trip | Covered indirectly by `007`'s equivalent test on the same column |

**Not droppable: `FE-017-04`.** AC-6 *is* the conflict path. Without it a `409` is an
unexplained failure with no way forward, and the user's only recourse is a browser
refresh that loses what they typed. ADR-006 accepted optimistic concurrency on the
explicit basis that the conflict is surfaced to a human — drop this and the trade-off
that justified the whole approach is not honoured.

**Not droppable: `BE-017-05`.** Without the mapping, a stale version produces a `500`
from an unhandled `DbUpdateConcurrencyException`. That is worse than last-write-wins,
because it is a crash rather than an answer.

**Not droppable: `BE-017-09`.** The architecture test fails the build the moment the
command exists without `IAuditableCommand`, so this is not optional in the schedule sense.
It is also the only record that a phone number was changed and by whom — US-003 put field
history out of scope on the understanding that this row exists (ADR-008).

**Not droppable: `BE-017-11`.** It is a verification, not a build, and it costs one query.
Skipping it means a defect in `007`'s migration presents as a bug in this feature.
