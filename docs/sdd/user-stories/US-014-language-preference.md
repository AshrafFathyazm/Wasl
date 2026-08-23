# US-014 — Language Preference and RTL Support

**Epic:** EPIC-004 · **Release:** 1 · **Depends on:** localization infrastructure in
the walking skeleton

## Story

As a **Support Agent**,
I want to **use the system in Arabic and have that choice remembered**,
so that **I can work in my own language without re-selecting it every time**.

## Business value

Infrastructure without a switch is invisible. This story is what turns translation
files into a product the team can actually use in Arabic.

## Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | A language switcher is available on every screen, including before signing in |
| AC-2 | Switching to Arabic re-renders the interface in Arabic and sets the document direction to right-to-left |
| AC-3 | The choice persists across a reload, and across signing out and in again on another device (BR-8.4) |
| AC-4 | `PUT /api/me/language` stores the preference and returns `204` |
| AC-5 | An unsupported language value returns `400` listing the supported ones |
| AC-6 | The stored preference is carried in the JWT so it costs no query per request |
| AC-7 | Every API request from the client sends `Accept-Language` for the active locale |
| AC-8 | Server errors arrive in the active language, with identical `type` and `errors` keys in both (BR-8.6, BR-8.7) |
| AC-9 | An unsupported requested locale falls back to English with `200`, not `400` (BR-8.3) |
| AC-10 | Every response carries `Content-Language` naming the locale actually applied |
| AC-11 | Dates and numbers are formatted for the active locale |
| AC-12 | Ticket numbers render with Latin digits in both locales (BR-8.13) |
| AC-13 | User content renders with correct direction regardless of interface language (BR-8.10) |
| AC-14 | Counted nouns use plural forms, with all six Arabic categories (BR-8.14) |
| AC-15 | A key present in one catalogue and missing from the other fails the build (BR-8.11) |
| AC-16 | No user-facing string is hard-coded; a lint rule enforces this (FR-5.2) |

## Rules referenced

BR-8.1 – BR-8.14, FR-5.1 – FR-5.8, NFR-8, NFR-9

## Out of scope

A third language, translating user content, Hijri dates, Arabic search normalisation,
per-customer language.

## Definition of Done

`09-definition-of-done.md`
