# EPIC-005 — Audit and Operations

## Goal

Every operation that changes state, and every authentication or authorization event, is
recorded in a durable, tamper-resistant log that survives the data it describes.

## Business value

Three questions a support organisation eventually has to answer, none of which the
ticket timeline can answer today:

- Who changed this customer's phone number, and when?
- Is somebody repeatedly trying an action they are not allowed to perform?
- What actually happened in the hour before this went wrong?

The first two are about accountability, the third about incident response. All three
are cheap to support if the log exists from the start and expensive to reconstruct
afterwards, because the data was never captured.

## Scope shape

Like EPIC-004, this is mostly **infrastructure plus a discipline**, and only partly a
story.

| Part | Where it lives |
|---|---|
| The table, the pipeline behaviour, the architecture test | Walking skeleton, before US-001 |
| Every story declaring its audit action | Definition of Done, applied to every story |
| The read endpoint and its filters | US-015 |

The infrastructure goes in the skeleton for the same reason localization did:
retrofitting means revisiting every command handler. See
`decisions/ADR-008-audit-log.md`.

## Stories

| Story | Title | Release |
|---|---|---|
| US-015 | Audit Log Access | 2 |

US-015 sits in Release 2 because the *writing* is what has value, and that is in the
skeleton. The read endpoint is how the value is retrieved, and it can be retrieved with
a SQL query until the endpoint exists.

## Requirements covered

FR-6.1 through FR-6.7, NFR-10

## Key rules

- BR-9 — audit log
- BR-6 — only a Manager may read it

## Out of scope

- Read auditing — see `11-open-questions.md` Q-10
- A retention or purge job — Q-9
- Writing to a separate database or an append-only external store, which is the correct
  answer under a real compliance requirement and disproportionate without one (ADR-008)
- Tamper-evidence through hash chaining or signing
- Alerting on suspicious patterns
- Export for an external auditor

## Done when

Every mutation and every auth event produces a row, the architecture test fails the
build when a command does not declare an audit action, the application cannot alter or
delete a row, and a Manager can retrieve the history of any record.
