# Demo Script

A five-minute walkthrough of the core flow. The order is chosen so that each step
makes the next one possible, and so that the interesting engineering decisions come
up naturally rather than being announced.

**Before starting:** clean database, seed script run, both a Manager and an Agent
account available, browser and API documentation UI both open.

---

## 0 · Framing (20 seconds)

State what was built, what was deliberately left out, and why. Naming the boundary
first prevents the rest of the demo being read as an omission.

---

## 1 · Create a customer (45 seconds)

Create a customer with a name and an email.

Then attempt the same email again. It is rejected with `409` and a message naming the
conflicting field.

**Point to make:** the duplicate rule is BR-4, enforced in two places. The unique
filtered index is the guarantee, because two concurrent requests can both pass an
application-level check; the application check exists to produce a message a human
can act on. Name deliberately is not part of the rule.

---

## 2 · Create a ticket (45 seconds)

Create a ticket against that customer with a category, a priority, and a channel.

**Point to make:** the ticket number is `TCK-2026-000001`, generated from a database
sequence rather than a row count, because a count is a race condition and a `Guid` is
useless on a phone call. The channel is a field on the ticket — the requirement for
multi-channel support is satisfied by modelling the channel, not by integrating a
provider that is out of scope.

---

## 3 · Attempt an invalid transition (45 seconds)

With the ticket in `New`, try to move it straight to `InProgress`.

Rejected with `409` and `type: errors/invalid-status-transition`.

**Point to make:** the state machine is in the domain layer, in one place. The UI
disables the button as well, but the rejection just shown came from the server — the
UI mirrors the rule for usability and never owns it.

---

## 4 · Assign, then progress (60 seconds)

Assign the ticket to an agent. Move `New → Open`, then `Open → InProgress`.

Then log in as the Agent and try to reassign the ticket to somebody else: `403`.

**Points to make:**

- Assignment does not automatically advance the status (BR-2.7). Triage and
  ownership are separate events, and merging them would erase one of them from the
  history.
- `InProgress` requires an assignee (BR-1.3) — the rule that makes the previous point
  safe.
- The `403` came from an authorization policy on the server, not from a hidden button.

---

## 5 · Comment and timeline (45 seconds)

Add a comment. Open the timeline: creation, assignment, both status changes, and the
comment appear in order.

**Point to make:** history rows are written in the same transaction as the change
they describe, so the timeline cannot drift from the data. The timeline is a product
feature for agents; the separate `AuditLog` is the forensic record, and it has no
foreign keys precisely so it survives the deletion of what it describes. The history records that
a comment happened, not its content — the comment is the record of its own content,
and duplicating it would create two sources of truth.

---

## 6 · Concurrency (45 seconds)

Open the ticket in two tabs. Change the status in the first. Change it in the second:
`409`, `type: errors/concurrency-conflict`, and the UI offers to reload.

**Point to make:** two agents working the same queue is the normal case, not an edge
case. Optimistic concurrency was chosen over locking because support tickets have low
contention and a lock held by a distracted agent is worse than an occasional retry.

---

## 6b · Switch to Arabic (45 seconds)

Switch language. The same ticket screen re-renders in Arabic, right-to-left.

Then trigger a validation error — submit a comment with an empty body — and show the
response in dev tools: the message is Arabic, and `type` and the `errors` keys are
byte-identical to the English response.

**Points to make:**

- The server translates the sentences it authors; the client translates the labels it
  authors. Whoever writes a string owns its translation, so it cannot drift from the
  code that produces it.
- `type` and the `errors` keys never change language. That is what keeps the API
  contract locale-independent — a client branching on `type` works in every language.
- The ticket number is still `TCK-2026-000001` in Latin digits, because it gets read
  aloud and pasted, and Arabic-Indic digits would make it unsearchable.
- The infrastructure went into the walking skeleton rather than a later story.
  Retrofitting it would have meant revisiting every string and every stylesheet.

## 7 · Tests (30 seconds)

Run the test suite live. Show the state-machine tests and the authorization tests by
name.

**Point to make:** the tests are named after the rules in `04-business-rules.md`, so a
rule can be traced to the test that proves it.

---

## 8 · Close (30 seconds)

State the known limitations plainly: no live channel providers, no attachments, no
SLA engine, closed tickets are terminal, no de-escalation, and Arabic search does not
normalise hamza or ta marbuta — the fix for that last one is written down in
`11-open-questions.md` Q-7 rather than left to be rediscovered. Each was a decision, and
each is recorded in `00-project-context.md` or an ADR.

---

## Questions to expect, and where the answer lives

| Likely question | Answer lives in |
|---|---|
| Why SQL Server and not PostgreSQL? | `decisions/ADR-013-database-sql-server.md` |
| Why not microservices? | `decisions/ADR-002-architecture-style.md` |
| Why React and not Angular? | `decisions/ADR-003-frontend-stack.md` |
| Why is `Closed` terminal? | `decisions/ADR-004-ticket-state-machine.md` |
| Walk me through the schema | `03-domain-model.md` — ERD, then the query-to-index map |
| Is there an audit log? | Yes, and it is deliberately not `TicketHistory` — `decisions/ADR-008-audit-log.md` |
| Why does the audit table have no foreign keys? | ADR-008 — it must outlive what it describes |
| Why no lookup tables for status and priority? | `03-domain-model.md`, **No lookup tables** |
| Why restrict rather than cascade on the user foreign keys? | `03-domain-model.md`, **Three foreign keys from `Tickets`** |
| How does authentication work, and what are its limits? | `decisions/ADR-005-authentication.md` |
| Why optimistic and not pessimistic locking? | `decisions/ADR-006-concurrency.md` |
| Why Latin digits and Gregorian dates in Arabic? | `decisions/ADR-007-localization.md` |
| Why not translate enum values? | `04-business-rules.md` BR-8.7 |
| Why is localization in the skeleton and not a story? | `decisions/ADR-007-localization.md`, `08-board.md` |
| What did AI write, and how do you know it is right? | `story-artifacts/*/ai-notes.md` |
| What would you do next with another week? | `README.md`, story `summary.md` limitations |

## If asked to make a live change

The likely requests are a new ticket category, a new filter, or a new validation rule.
Rehearse all three. The order is the same each time: state where the change belongs
and why, write the failing test, make it pass, run the suite, then explain what else
the change touches.
