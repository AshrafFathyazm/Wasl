# US-003 — AI Usage and Audit

**Phase:** 5 · **Role:** Verification · **Status:** Not started

Be specific. "AI helped with the code and I reviewed it" is worthless. Name the file,
the suggestion, and what was wrong with it.

## What AI Was Used For

| Task | Prompt used |
|---|---|

## Context Provided

Which project files, which story artifacts, which constraints. Confirm that no
secrets or real data were included.

## Accepted As-Is

| Output | How it was verified |
|---|---|

Verified means run, not read.

## Modified

| Output | What was changed | Why |
|---|---|---|

## Rejected

| Output | Why rejected |
|---|---|

## Hallucinations Caught

APIs, packages, methods, or configuration options that were suggested and do not
exist. This is the characteristic failure mode of AI-generated code, and it reads as
entirely plausible.

| Suggested | Reality | How it was caught |
|---|---|---|

## Verification

| Check | Result |
|---|---|
| Build | |
| Unit tests | |
| Integration tests | |
| Manual verification | |
| Every referenced API confirmed to exist | |

## Human Decisions and Trade-offs

Decisions made by a person, not by the model, and the reasoning behind them.
