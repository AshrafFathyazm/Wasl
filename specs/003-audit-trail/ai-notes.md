# 003 — AI Usage Notes

**State: specification phase only. No implementation has run.**

Everything below describes AI use on the *planning* artifacts for this feature. The
Implementation and Testing sections are headings with nothing under them, and they stay that
way until code exists — an empty section is honest, a pre-filled one is a false statement.

---

## Specification and planning

**Used for:** reading the blueprint for this feature and reconciling it into one design.
Read in full, not from memory: `docs/sdd/decisions/ADR-008-audit-log.md`,
`docs/sdd/04-business-rules.md` (BR-9.1 – BR-9.13 and the action-naming table),
`docs/sdd/03-domain-model.md` (the `AuditLog` entity, its physical shape, the query-to-index
map, and the notes on `DENY`), `docs/sdd/01-product-spec.md` (FR-6, NFR-10),
`docs/sdd/testing/test-strategy.md` (the audit rows and the architecture-test section),
`docs/sdd/02-architecture.md` (the pipeline order and the `Behaviors/` file names),
`docs/sdd/05-api-conventions.md`, `docs/sdd/09-definition-of-done.md`,
`docs/sdd/11-open-questions.md` (Q-9, Q-10), ADR-010, ADR-013, and the constitution. Tone
and structure were taken from `specs/001-solution-skeleton/` and the contract and frontend
formats from `specs/007-create-customer/`.

**Accepted as-is:**

- ADR-008's reasoning end to end — two tables, no foreign keys, snapshot the actor, explicit
  writes rather than an interceptor choosing the action, the `bigint` key, and the
  same-transaction exception. None of it needed changing, and the alternatives it already
  rejected (application logs, triggers, temporal tables, event sourcing, a separate database)
  were not re-litigated here
- The physical shape of `dbo.AuditLog`, column for column, including which columns stay
  `varchar` because they are ASCII by definition
- The four indexes and the filtered one's justification, plus the blueprint's own instruction
  to verify `filter_definition` rather than trust it
- `docs/sdd/02-architecture.md`'s pipeline order, `Validation → Transaction → Audit → handler`
- Q-9 and Q-10 left open, with the blueprint's own working assumptions

**Modified, and why:**

| What | Change | Reason |
|---|---|---|
| ADR-013's `GRANT ... TO wasl_app` read as a database **user** | Implemented as a database **role**, created idempotently by the migration | The same grant with one fewer coupling: the login name varies per environment, and a user would put a password in a migration file. `research.md` R-4 |
| One connection string (`001`'s shape) | Two: `Migrations` (owner) and `Default` (member of `wasl_app`) | A least-privileged principal cannot run DDL, and `DENY` does not restrict `sysadmin`. Without the split, BR-9.5 is implemented and ineffective. `research.md` R-4, AC-13 |
| ADR-008's blanket rejection of a `SaveChangesInterceptor` | Narrowed: an interceptor that **captures the field diff** and decides nothing | The ADR's objection is that an interceptor cannot see business intent. Intent still comes from `IAuditableCommand`. The change tracker is the only correct source for "which properties changed value", and it is destroyed by `SaveChanges`. `research.md` R-1, with the ADR's objection quoted rather than paraphrased |
| `AuditLog` as the CLR type name (`03-domain-model.md`) vs `AuditEntry` (ADR-010) | Type `AuditEntry`, table `AuditLog` | Two names for one thing is how a duplicate file gets created. `research.md` R-6 |
| A handler-called `IAuditContext.Describe(...)`, the first design | `IAuditableCommand<TResponse>.DescribeTarget(TResponse?)` | A handler that forgets to call it produces a row with a null `EntityId` and nothing announces it. Moving the obligation onto the interface makes it the compiler's problem. `research.md` R-8 |
| A single NFR-10 architecture test | Two tests: the rule, plus a scanner self-test over a deliberate violator | The rule test has an **empty population** at Phase 0 and passes vacuously — which is the exact failure mode this feature exists to prevent. `research.md` R-5, AC-14 |
| `TraceId` derived here from `Activity.Current?.Id` | Read from `002`'s single `TraceContext` accessor | Checked against `specs/002-error-contract/` as specified rather than assumed. BR-9.9 wants one identifier in three places; a locally derived value is valid and simply not *the* value, and it would diverge only when `Activity.Current` was null. `research.md` R-13 |
| `AuditOutcomeClassifier` keyed on an `IDeniedException` marker | Keyed on `002`'s `DomainException.ErrorCode`, with middleware-level `401`/`403` reassigned to `004` | `002` produces `401`/`403` with **no exception thrown**, so the marker interface this design first assumed does not exist and a middleware denial never reaches MediatR. `research.md` R-13, `spec.md` Q-4 |

**Rejected:**

| Suggestion | Why it was rejected |
|---|---|
| Have the pipeline own `SaveChanges` so handlers never call it | The cleanest design on paper, and it breaks `007`'s **frozen** contract: `version` is the base64 `rowversion`, which SQL Server produces only on save. The first handler needing a generated value would call `SaveChanges` anyway and silently lose its diff. `plan.md`, second rejected alternative |
| Write the audit row after the commit, on every path, for uniformity | Inverts BR-9.3. A commit with a failed audit write leaves an unrecorded change; a rollback with a successful write leaves a record of something that never happened. ADR-008: *"a log recording things that did not happen is worse than no log"* |
| Keep the single `sa` connection string and document the `DENY` as "enforced in production" | `DENY` does not restrict a `sysadmin` member, so this ships a claim with no evidence behind it and a green suite. AC-13 makes the difference observable |
| Add a `Development`-only probe endpoint to `Wasl.Api` so the pipeline has a production consumer | A real HTTP surface that has to be excluded from the contract, the OpenAPI document, and the auth policy — and an endpoint that dispatches an arbitrary command survives into the environment where `ASPNETCORE_ENVIRONMENT` was set wrong. Test-assembly only. `research.md` R-12 |
| Infer the audit action from the command's type name | `CreateCustomerCommand` → `Customer.Created` works right up to `ChangeStatusCommand`. A convention that is correct most of the time is worse than a declared string, because the exceptions are invisible |
| Add a retention window (90 days was suggested) so the table does not grow unbounded | Q-9 is open and the answer comes from legal. An invented number in a migration is an invented requirement, and the constitution says it goes to Open Questions instead |
| Redact by substring match on property names containing `token`, `key`, or `secret` | It would silently redact a future `TokenCount` or `SecretaryName`. A field redacted that nobody intended is a hole that looks like a feature. Exact, case-insensitive matching plus a unit test on the near-misses |
| Skip the NFR-10 rule test until `004` gives it something to check | A skipped test is the silent hole with a label on it. `001` AC-9 already refuses a skipped suite without a reason, and this would be one |
| Add `rowversion` to `AuditLog` "for consistency" with the other tables | Append-only; there is no second writer. ADR-006 as amended scopes the token to entities two people edit at once, and AC-5 asserts the absence so re-adding it has to be argued for |

**How each accepted output was verified:** every rule, column, type, index, and ADR claim in
these documents was checked by opening the blueprint file and reading the line, not by
recalling it — including the ones that turned out to disagree with each other (`AuditLog` vs
`AuditEntry`, the `Behaviors`/`behaviour` spelling split, `TO wasl_app` as user or role), all
three of which are recorded in `research.md` rather than silently resolved. The task-table
format, the `Agent` and `Skill` strings, and the task-ID scheme were copied from
`specs/001-solution-skeleton/tasks.md` and `specs/README.md`'s *Who builds what* table rather
than invented.

**What was deliberately left unverified, and how:** assumption A-3 (MediatR resolving
constrained open-generic pipeline behaviours) is a property of a package version and cannot be
confirmed by reading. It is recorded as an assumption, given a verification command and a
designed fallback in `research.md` R-3, and it is checked by `TEST-003-05` **before**
`BE-003-05` is written. No document here claims it works.

**Not put into any prompt:** no credentials, no connection strings, no customer data. The
least-privileged login the test fixture creates uses a password generated per run against a
throwaway container; it is never committed and never appears in a prompt (constitution,
*No secrets*).

---

## Implementation

*Empty. No code has been written for this feature.*

To be filled per task with: what the agent was given, what came back, what was accepted, what
was modified and how, what was rejected and why, and — for each accepted output — the command
that was **run** to verify it. Reading is not verifying.

---

## Testing

*Empty. No tests have been run.*

`tests.md` records the commands and their real output. Nothing is written there that was not
observed, which is the one rule in this process a reviewer can check in about ten seconds.
