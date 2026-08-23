# Git Workflow

The history is part of the deliverable. It is read as evidence of how the work
progressed, and a single commit named `final` erases all of that evidence.

## Branching

One branch per story, from `main`:

```text
feature/US-001-create-customer
feature/US-008-change-ticket-status
```

Fixes and chores follow the same shape:

```text
fix/US-008-closed-ticket-returns-500
chore/upgrade-testcontainers
```

## Commits

Conventional Commits, with the story id as the scope:

```text
<type>(<scope>): <what changed and why>

feat(US-001): add Customer aggregate with contact invariant
feat(US-001): enforce duplicate email via filtered unique index
test(US-001): cover duplicate rule for mixed-case email
fix(US-008): return 409 instead of 500 when transitioning a closed ticket
docs(US-008): record state machine decision in ADR-004
refactor(US-006): project ticket list to DTO to remove N+1
chore: add Testcontainers to integration test project
```

Types: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`, `perf`.

## Rules

- **Every commit builds.** A commit that does not build makes `git bisect` useless and
  makes the history unreadable.
- **One logical change per commit.** A commit that adds an entity, a migration, an
  endpoint, and three tests cannot be reviewed or reverted.
- **The message says why, not what.** The diff already shows what changed.
- **Never** commit a message of `final`, `fix`, `wip`, `update`, `changes`, or `asdf`.
- **Never** commit a secret. If one is committed, rotate it — removing it from the
  history does not un-leak it.
- Commit after each task in `tasks.md`. That cadence produces a history that reads
  like the plan, which is exactly what makes it useful evidence.

## What good history looks like

```text
feat(US-008): add TicketStatus enum and transition map
test(US-008): cover every permitted and forbidden transition
feat(US-008): enforce transition map in Ticket.ChangeStatus
feat(US-008): write TicketHistory row on status change
feat(US-008): add PUT /api/tickets/{id}/status endpoint
test(US-008): integration tests for valid and invalid transitions
feat(US-008): return allowedTransitions on ticket read
feat(US-008): render status actions from allowedTransitions
docs(US-008): update API docs and OpenAPI for status endpoint
```

The sequence is legible: rules first, tests alongside, endpoint next, client last,
documentation with it. Someone reading only these lines can reconstruct the approach.

## Pull requests

Even working alone, open a pull request per story. It creates a review surface and a
place for the story's evidence.

Description template:

```markdown
## Story
US-XXX — <title>

## What changed
<two or three sentences>

## Acceptance criteria
- [ ] AC-1 …
- [ ] AC-2 …

## Verification
Build:              <result>
Unit tests:         <command, count, result>
Integration tests:  <command, count, result>

## Trade-offs
<what was decided and what was rejected>

## Known gaps
<what is not covered, and why>
```

## Merging

Squash only when the branch history is genuinely noisy. Otherwise merge with the
history intact — a legible sequence of commits is worth more than a tidy single line,
because it shows the work rather than only the result.
