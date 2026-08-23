# EPIC-004 — Platform Localization

## Goal

The entire product is usable in English and in Arabic, with correct right-to-left
layout, and adding a third language requires no code change.

## Business value

The support team and the customers it serves read Arabic. An English-only interface
makes every agent translate in their head, which is slower and produces mistakes in
exactly the records that need to be accurate.

## Scope shape

This epic is mostly **infrastructure plus a discipline**, and only partly a story.

| Part | Where it lives |
|---|---|
| Localization infrastructure, both sides | Walking skeleton, before US-001 |
| Every string in every story translated | Definition of Done, applied to every story |
| Language switcher, stored preference, RTL polish | US-014 |

Building the infrastructure inside the skeleton rather than as a story is the central
decision of this epic. The reasoning is in `decisions/ADR-007-localization.md`.

## Stories

| Story | Title | Release |
|---|---|---|
| US-014 | Language Preference and RTL Support | 1 |

## Requirements covered

FR-5.1 through FR-5.8, NFR-8, NFR-9

## Key rules

- BR-8 — localization

## Out of scope

- Locales beyond English and Arabic
- Translating content entered by users
- Hijri calendar display
- Arabic search normalisation of hamza, alef, and ta marbuta — see
  `11-open-questions.md` Q-7 for the reasoning and the intended fix
- A per-customer language, for outbound communication that does not exist yet
- A translation management platform

## Done when

The full demo flow can be walked start to finish in Arabic, no English string appears
in the Arabic interface, server errors arrive in the requested language, and the
key-parity test passes in CI.
