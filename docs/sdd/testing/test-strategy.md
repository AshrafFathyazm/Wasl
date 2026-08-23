# Test Strategy

## Principle

Tests exist to prove that the business rules in `04-business-rules.md` hold. Coverage
percentage is not a goal; rule coverage is. A suite with 90% coverage and no test for
a forbidden state transition is worse than a suite with 40% coverage that has one.

## The pyramid, as it applies here

### Unit tests — `Wasl.Domain.Tests`, `Wasl.Application.Tests`

Fast, no database, no HTTP.

| What | Why here |
|---|---|
| The full BR-1 transition matrix, permitted and forbidden | Pure logic with no dependencies; the forbidden transitions are the point |
| BR-1.3 `InProgress` requires an assignee | A domain invariant |
| BR-2 assignment rules | Decision logic, testable without persistence |
| BR-3 escalation preconditions and the priority floor (BR-3.6) | The floor rule is the one most likely to be implemented as an assignment |
| BR-4.2, BR-4.3 email and phone normalisation | Pure functions with many edge inputs |
| BR-4.1 contact invariant | Domain invariant |
| Ticket number formatting | Pure formatting |
| BR-8 resource key parity between `en` and `ar` | The control that makes BR-8.11 real; a convention without a test is not a rule |
| `PreferredLanguage` value object | Pure validation |

Tools: xUnit, FluentAssertions. Moq only where a collaborator genuinely has to
be faked.

### Integration tests — `Wasl.Api.IntegrationTests`

Real HTTP through `WebApplicationFactory`, real SQL Server through Testcontainers.
Never EF InMemory: it does not enforce unique constraints, foreign keys, or
concurrency tokens, which are exactly the things these tests exist to verify.

| What | Why here |
|---|---|
| Every endpoint's happy path and its main failure path | The contract is HTTP-shaped |
| BR-4 duplicate rule at the database level | A unique index is a database behaviour; an application check cannot prove it |
| BR-6 authorization, exercised with real tokens for both roles | A faked user proves nothing about the policy |
| ADR-006 concurrency conflicts | Requires two real writes against one row |
| Error contract shape and status codes | Verifies the middleware, not the handler |
| Migrations apply cleanly to an empty database | Catches migration drift before a reviewer does |
| Absence of N+1 in the list and timeline queries | Assert the executed command count |
| Culture resolution order (BR-8.4) | Needs a real request pipeline with a real token; the middleware-ordering defect appears nowhere else |
| Every mutation writes exactly one audit row (BR-9.1) | Requires a real transaction and a real table |
| A rolled-back transaction leaves no audit row (BR-9.3) | The guarantee that makes the log trustworthy; only provable against a real database |
| A `403` and a failed sign-in each write a row outside any transaction (BR-9.2, BR-9.4) | The asymmetry is easy to implement wrongly and impossible to see by reading |
| The application cannot `UPDATE` or `DELETE` an audit row (BR-9.5) | A permission grant, so only a real database can prove it |
| The actor snapshot does not change when the user's role changes (BR-9.6) | The failure is silent and retroactive |
| Arabic error responses carry translated sentences and identical `type` and `errors` keys | The contract guarantee in BR-8.7 |
| `ar-EG` → `ar`, `fr` → `en` with `200` | Framework culture fallback behaviour, in the real pipeline |

### Frontend tests — `wasl-web`

Vitest and React Testing Library, applied narrowly.

| What | Why |
|---|---|
| Create Customer and Create Ticket forms: validation, submit, error display | The forms carry the most logic |
| Loading, error, and empty state rendering | The states most often skipped, and most often asked about |
| Status action buttons reflect `allowedTransitions` | Prevents the state machine being reimplemented client-side |
| Catalogue key parity across every namespace | Same reason as the backend parity test |
| Arabic plural output at 0, 1, 2, 3, 11, 100 | Six categories; the two-form assumption is wrong and silent |
| `dir` and `lang` set on switch, and cleanly reverted | The most common half-done RTL implementation |
| Latin digits in a ticket number under `ar` | BR-8.13 |

Not tested: styling, layout, component snapshots. They break on every change and
catch nothing.

### End-to-end

One test, covering the critical path:

```text
Create Customer → Create Ticket → Assign → New→Open → Open→InProgress
→ Add Comment → View Timeline
```

One end-to-end test that always runs is worth more than ten that are disabled because
they are flaky. If the harness proves unreliable, it is replaced by the documented
manual walkthrough in `14-demo-script.md`, and that substitution is recorded rather
than left implied.

## Naming

`MethodOrEndpoint_Condition_ExpectedResult`, and where a rule is being verified, name
the rule:

```text
ChangeStatus_FromNewToInProgress_ReturnsConflict            // BR-1
ChangeStatus_ToInProgressWithoutAssignee_ReturnsConflict    // BR-1.3
CreateCustomer_WithDuplicateEmailDifferentCase_ReturnsConflict  // BR-4.2, BR-4.4
Escalate_AsAgent_ReturnsForbidden                           // BR-3.2
Escalate_WhenPriorityIsCritical_LeavesPriorityUnchanged     // BR-3.6
ResolveCulture_WhenClaimAndHeaderDisagree_PrefersClaim       // BR-8.4
Error_WhenArabicRequested_TranslatesDetailButNotType         // BR-8.7
ResolveCulture_WhenUnsupportedLocale_FallsBackToEnglish      // BR-8.3
```

A reviewer should be able to read the test list and see the rules.

## Architecture tests

Two rules in this system are enforced by a test over the codebase itself rather than by
review, because both fail by omission and omission is what review is worst at catching:

| Rule | Test |
|---|---|
| NFR-10 | Every type implementing `ICommand` also implements `IAuditableCommand`. A new command with no declared audit action fails the build |
| BR-8.11 | Translation catalogues have identical key sets, both directions |

A rule that depends on somebody remembering it is not a rule. These two are the places
where the cost of remembering is highest and the cost of a test is lowest.

## Manual verification: the Arabic pass

Right-to-left layout defects are visual. A container sized to English text, a
directional icon that did not flip, a number sitting on the wrong side of an Arabic
sentence — none of these fail an assertion, and automated visual regression would need
a baseline that does not exist yet.

So one manual pass is a **listed deliverable**, not an informal check: walk the demo
flow in Arabic, screen by screen, and record the findings in the story's `tests.md`.

Naming it as a deliverable is the honest version. Calling it "covered by tests" would
be false, and leaving it unmentioned would mean it does not happen.

## What is deliberately not tested

| Not tested | Reason |
|---|---|
| Framework behaviour (EF Core saves, ASP.NET Core routes) | Testing the framework, not the code |
| Getters, setters, and DTO mapping with no logic | No behaviour to verify |
| Component snapshots | Break on every change, catch nothing |
| Load and performance under concurrency | No stated requirement; N+1 absence is asserted instead |
| Translation quality | Not a property code can assert; it needs a person who reads Arabic (`11-open-questions.md` Q-8) |
| Visual RTL correctness | Verified by the manual pass above; automated visual regression is disproportionate here |

Anything in this table is a deliberate decision. Anything untested that is *not* in
this table is a gap, and gaps belong in `tests.md` with a reason.

## Test data

- A shared builder per aggregate, with sensible defaults and named overrides, so a
  test states only what it cares about.
- No shared mutable state between tests. Each integration test runs against a database
  reset by transaction rollback or a per-test schema.
- No test depends on the order in which tests run.
