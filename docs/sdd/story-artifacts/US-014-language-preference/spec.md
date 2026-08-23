# US-014 — Specification

**Phase:** 1 · **Role:** Specification · **Status:** Complete

## Understanding

The localization infrastructure is built in the walking skeleton, so by the time this
story starts, catalogues exist and strings resolve. What is missing is the part a user
touches: a way to choose a language, a place for that choice to live, and the layout
work that makes Arabic actually readable rather than merely translated.

The distinction matters. Translation without direction handling produces an interface
where the words are Arabic and everything else is still English — buttons on the wrong
side, punctuation misplaced, and numbers running the wrong way through a sentence.

## In Scope

- Language switcher, available signed in and signed out
- `PUT /api/me/language` and the `PreferredLanguage` column
- The preference as a JWT claim
- `Accept-Language` on every client request, `Content-Language` on every response
- Right-to-left layout across every screen built so far
- Locale-aware date and number formatting
- Arabic plural forms
- The key-parity test and the no-hard-coded-strings lint rule

## Out of Scope

| Excluded | Reason |
|---|---|
| The localization infrastructure itself | Walking skeleton; this story consumes it |
| A third locale | Two locales prove the mechanism; a third is a resource file (NFR-9) |
| Translating user content | BR-8.10; a different product |
| Hijri calendar | ADR-007 decision 7 |
| Arabic search normalisation | Real work with a known fix; deferred with reasoning in `11-open-questions.md` Q-7 |
| Per-customer language | No outbound customer communication exists to use it |
| A translation management platform | Two locales and one translator |

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | Neutral `ar` is sufficient; no dialect or region-specific catalogue is needed | A regional catalogue is an added culture, not a redesign (BR-8.2) |
| A-2 | Interface language is a user preference, not an organisation setting | An organisation default would be a settings table and a fallback layer above the user |
| A-3 | The Arabic translation is produced by someone who reads Arabic, not by a machine | Machine-translated interface copy in a support tool reads as unserious, and this is worth saying out loud |
| A-4 | Latin digits are correct for this audience | ADR-007 decision 7; a reviewer may reasonably disagree, which is why it is written down |

## Open Questions

| # | Question | Working assumption |
|---|---|---|
| Q-1 | Should the language switcher appear on the login screen? | Yes. Someone who cannot read English cannot find a switcher that only appears after signing in |
| Q-2 | If a user's stored preference is Arabic but they send `Accept-Language: en`, which wins? | The stored preference (BR-8.4). It is a deliberate choice; the header is the browser's guess |
| Q-3 | Should the interface language also set the language of exported or printed output? | No export exists yet. Recorded so the answer is not invented later |

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | A language switcher is present on every screen, including the login screen |
| AC-2 | Switching to Arabic re-renders the interface in Arabic and sets `dir="rtl"` on the document root |
| AC-3 | Switching back to English restores `dir="ltr"` with no residual right-to-left styling |
| AC-4 | The choice survives a reload, and is applied on a fresh sign-in from a different browser (BR-8.4) |
| AC-5 | `PUT /api/me/language` with `en` or `ar` stores the preference and returns `204` |
| AC-6 | An unsupported value returns `400` listing the supported locales |
| AC-7 | An unauthenticated call to `PUT /api/me/language` returns `401` |
| AC-8 | The preference is present as a JWT claim after the next token issue, and resolving the locale costs no database query per request |
| AC-9 | The client sends `Accept-Language` matching the active locale on every request |
| AC-10 | Every response carries `Content-Language` naming the locale actually applied (BR-8.4) |
| AC-11 | A request for `ar-EG` or `ar-SA` resolves to `ar` (BR-8.2) |
| AC-12 | A request for `fr` falls back to `en` and returns `200`, with `Content-Language: en` (BR-8.3) |
| AC-13 | `?culture=ar` overrides both the stored preference and the header (BR-8.4) |
| AC-14 | A validation error requested in Arabic returns Arabic messages, with `type` and every `errors` key byte-identical to the English response (BR-8.6, BR-8.7) |
| AC-15 | Enum values in payloads are unchanged in Arabic; only their display labels differ (BR-8.7) |
| AC-16 | Dates and numbers render per the active locale, using the Gregorian calendar in Arabic (BR-8.13) |
| AC-17 | `TicketNumber` renders with Latin digits in both locales (BR-8.13) |
| AC-18 | An Arabic comment inside the English interface, and an English subject inside the Arabic interface, both render with correct direction (BR-8.10) |
| AC-19 | A counted noun uses plural forms and produces grammatically correct Arabic at 0, 1, 2, 3, 11, and 100 (BR-8.14) |
| AC-20 | A key present in `en` and absent from `ar`, or the reverse, fails the build (BR-8.11) |
| AC-21 | A missing key at runtime falls back to English and never renders the raw key (BR-8.12) |
| AC-22 | A lint rule fails on a hard-coded user-facing string in a component (FR-5.2) |
| AC-23 | Log output is English regardless of the request locale (BR-8.9) |

## Edge Cases

From `testing/edge-cases.md`, plus these:

| Case | Expected |
|---|---|
| `Accept-Language: ar;q=0.9, en;q=0.8` | `ar` — quality values are honoured by the framework's parser |
| `Accept-Language` header absent entirely | Stored preference, else `en` |
| Malformed `Accept-Language` | Ignored; falls through to the next source. Never a `400` |
| Signed out, no preference, browser set to Arabic | Arabic. The header is the only signal available |
| User switches language mid-session with a form half-filled | Entered values are preserved; only labels re-render |
| Arabic label longer than its English original | Layout adapts. Fixed-width containers sized to English text are the most common RTL defect |
| Empty string as the language value | `400` |
| Text mixing Arabic and English in one comment | Direction resolved per element by `dir="auto"`, not per document |
| Number immediately adjacent to Arabic text | Renders in the correct position; verified visually, since this is a bidirectional-algorithm case that automated tests will not catch |

## Rules Referenced

BR-8.1 – BR-8.14, FR-5.1 – FR-5.8, NFR-8, NFR-9, ADR-007
