# US-014 — Backend Implementation

**Phase:** 4 · **Role:** Backend · **Status:** Not started

## What Was Implemented

## Files Created or Changed

| File | Change |
|---|---|

## Data Changes and Migration

Migration name, tables, columns, constraints, indexes. Every index names its query.

## API Endpoints

| Method | Path | Status codes returned |
|---|---|---|

## Audit

| Check | Result |
|---|---|
| Command implements `IAuditableCommand` | |
| Action name follows `Entity.Verb` | |
| Row written in the same transaction (BR-9.3) | |
| Denials and failures covered (BR-9.2) | |
| Nothing sensitive in `Changes` (BR-9.7) | |

## Localization

| Check | Result |
|---|---|
| Server-authored messages resolve through `IStringLocalizer` | |
| Keys added to both `.resx` catalogues | |
| Nothing machine-readable translated (BR-8.7) | |
| Logs remain English (BR-8.9) | |

## Deviations From the Plan

| What changed | Why |
|---|---|

A deviation is fine. An undocumented deviation is not.

## Verification

Commands run and output observed. Do not write a result that was not seen.

```text
$ dotnet build
$ dotnet test tests/Wasl.Domain.Tests
$ dotnet test tests/Wasl.Api.IntegrationTests
```

## Acceptance Criteria Coverage

| AC | Test | Result |
|---|---|---|

## Known Gaps
