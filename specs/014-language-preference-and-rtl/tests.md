# US-014 — Verification

**Phase:** 5 · **Role:** Verification · **Status:** Not started

Nothing in this file is written unless it was observed.

## Build

```text
$ dotnet build
```

## Unit Tests

```text
$ dotnet test tests/Wasl.Domain.Tests
```

There are exactly two test projects (ADR-010). The original template also named
`tests/Wasl.Application.Tests`, which does not exist — the backend key-parity test runs
inside `Wasl.Api.IntegrationTests` (`research.md` R-11).

Count, passed, failed, skipped.

## Integration Tests

```text
$ dotnet test tests/Wasl.Api.IntegrationTests
```

## Frontend Tests

```text
$ npm run test
```

## Acceptance Criteria Traceability

| AC | Test name | Result |
|---|---|---|

An AC with no test is a finding, not a footnote.

## Edge Cases Exercised

| Case | Source | Result |
|---|---|---|

## Arabic Walkthrough — the deliverable (TEST-014-16)

The whole demo flow, walked in Arabic, screen by screen. This is not a checklist item
that gets a tick; it is a list of what was looked at and what was seen. **"Nothing found"
is an acceptable result and is only credible with the screen list filled in underneath
it** — the rows are the evidence, not the verdict.

RTL defects fail no assertion: a container sized to English label text, a directional
icon that did not flip, a number on the wrong side of an Arabic sentence, Arabic clipped
by cap-height trim. Automated visual regression would need a baseline that does not
exist.

| Screen | Direction correct | Layout holds Arabic copy | Icons flipped correctly | Numbers / dates / `TicketNumber` | Type not clipped | Findings |
|---|---|---|---|---|---|---|
| `01-login` | | | | | | |
| `02-app-shell` | | | | | | |
| `03-tickets-list` | | | | | | |
| `04-ticket-detail` | | | | | | |
| `05-create-ticket` | | | | | | |
| `06-customers-list` | | | | | | |
| `07-customer-profile` | | | | | | |
| `08-create-customer` | | | | | | |
| `09-settings-localization` | | | | | | |

| Fix applied | Screen | Was it a token, a layout, or a component? |
|---|---|---|

## Not Tested

| What | Why |
|---|---|

## Findings
