# Self-Review Checklist

Run before declaring the work finished, and before any walkthrough. The point is to
find the problems before a reviewer does.

## Specification and planning

- [ ] A specification file exists with assumptions and acceptance criteria
- [ ] Out of scope is written down, not merely implied
- [ ] A plan and a task breakdown exist and reflect what was actually built
- [ ] Every deviation from the plan is recorded with its reason
- [ ] Open questions were raised as questions, not resolved by guessing

## The core flow

- [ ] Create Customer → View Customer → Create Ticket → Assign → Change Status → Add Comment → View Timeline works end to end
- [ ] It works from a clean database using the documented setup steps
- [ ] No step in the flow relies on hardcoded or mocked data
- [ ] The flow can be demonstrated in under five minutes

## Backend

- [ ] Business rules are in the domain layer, not in controllers
- [ ] Every input is validated at the boundary
- [ ] Every endpoint returns the documented status code
- [ ] No endpoint returns `200` with an error in the body
- [ ] Error responses match the single documented contract
- [ ] No stack trace, SQL, or internal type name reaches the client
- [ ] Async paths accept and pass a `CancellationToken`
- [ ] No query runs inside a loop
- [ ] Every new index is justified by a query that needs it

## Frontend

- [ ] Every screen handles loading, error, and empty states
- [ ] Validation messages are field-level and readable
- [ ] Server-side errors are surfaced, not swallowed
- [ ] No `console.log` left in committed code
- [ ] The UI never claims a rule the server does not enforce

## Localization

- [ ] The whole flow was walked once in Arabic, end to end
- [ ] No untranslated English string appears in the Arabic interface
- [ ] No raw translation key is visible anywhere
- [ ] Layout is correct right-to-left: alignment, spacing, directional icons, form controls
- [ ] User content in the opposite direction renders correctly inside the interface
- [ ] Dates and numbers are formatted for the locale
- [ ] Ticket numbers use Latin digits in both locales
- [ ] Server errors arrive in the requested language
- [ ] `type` values and `errors` keys are identical in both languages
- [ ] The key-parity test passes
- [ ] Switching language persists after a reload and after signing in again

## Testing

- [ ] Unit tests exist for the state machine and every BR-* rule implemented
- [ ] Integration tests cover the happy path and the main failure path per endpoint
- [ ] Tests were run, and the output was observed, before being recorded
- [ ] Edge cases were exercised deliberately: empty value, missing entity, duplicate, wrong role, stale version, oversized input, concurrent update
- [ ] What is not tested is listed, with the reason

## Design

- [ ] No hard-coded colour, spacing, or radius anywhere in a component
- [ ] Components consume semantic tokens, not raw ramp values
- [ ] Every interactive element has a visible focus ring, checked by tabbing through
- [ ] Disabled, loading, and error states all exist and were viewed
- [ ] No badge conveys meaning by colour alone — every one carries a label
- [ ] No primitive was built that no screen uses

## Audit

- [ ] Every mutation writes an audit row, and I checked the table rather than assuming
- [ ] A rolled-back transaction leaves no audit row
- [ ] A `403` and a failed sign-in both produce a row
- [ ] No password, token, or comment body appears anywhere in the table
- [ ] The actor's role on the row is the role held at the time, not the current one
- [ ] `traceId` on an error response can be found in the audit table
- [ ] The application cannot `UPDATE` or `DELETE` an audit row — I tried it

## Security

- [ ] No secrets, connection strings, or tokens in source control
- [ ] Configuration comes from environment variables or user secrets
- [ ] Authorization is enforced server-side for every protected action
- [ ] Authorization was tested by calling an endpoint with the wrong role
- [ ] No sensitive data is written to logs
- [ ] Error responses do not disclose whether a record exists when that matters

## Git

- [ ] Commits are small and each one builds
- [ ] Commit messages explain intent, not just the file that changed
- [ ] No commit named `final`, `fix`, `wip`, or `update`
- [ ] The history reads as a narrative of how the work progressed

## AI usage

- [ ] An AI notes file exists and is specific, not generic
- [ ] Every package, API, and method suggested by AI was confirmed to exist
- [ ] Nothing was accepted that cannot be explained
- [ ] Rejected output is recorded along with the reason for rejecting it
- [ ] No secrets or production data were placed in any prompt

## Ownership

- [ ] Every significant decision has a two-sentence answer to "why this and not that?"
- [ ] The location of every piece of logic is known without searching
- [ ] A small change could be made live, under observation, without panic
- [ ] Any part of the code could be debugged live
- [ ] The limits of the solution are known and can be stated plainly

## Handover

- [ ] `README.md` covers setup, run, what was built, what was not, and why
- [ ] The board and the delivery log reflect reality
- [ ] Documentation describes what exists, not what was planned
