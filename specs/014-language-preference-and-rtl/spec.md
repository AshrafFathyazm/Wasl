# US-014 — Specification

**Phase:** 4 · **Story:** US-014 · **Feature:** `014-language-preference-and-rtl` · **Status:** Migrated to spec-kit 2026-08-23, awaiting review

## Understanding

The localization infrastructure is built before this story starts —
`005-localization-core` owns the mechanism: registered cultures, the `.resx`
catalogues, the `ProblemDetails` localization path, `Content-Language`, and the
key-parity test in CI. What is missing is the part a user touches: a way to choose a
language, a place for that choice to live, and the layout work that makes Arabic
actually readable rather than merely translated.

The distinction matters. Translation without direction handling produces an interface
where the words are Arabic and everything else is still English — buttons on the wrong
side, punctuation misplaced, and numbers running the wrong way through a sentence.

One consequence of arriving after `005` is worth stating up front, because it explains
why several tests live here rather than there. **With no stored preference in existence,
a culture provider registered before `UseAuthentication()` and one registered after
behave identically.** ADR-007's most-likely defect is therefore not observable in `005`
at all. It becomes observable for the first time in this feature, on the first request
after someone chooses Arabic.

## In Scope

- Language switcher, available signed in and signed out
- `PUT /api/me/language` and the `PreferredLanguage` column, so the choice follows the
  user across devices (FR-5.5)
- The preference as a JWT claim
- The new preference reaching BR-8.4's resolution order **within the same session**,
  not only after the next sign-in (AC-24)
- `Accept-Language` on every client request, `Content-Language` on every response
- Right-to-left layout across every screen built so far
- Locale-aware date and number formatting
- Arabic plural forms
- Every string in a catalogue in both locales, with the key-parity test passing
- The no-hard-coded-strings lint rule
- **The manual Arabic pass over the whole demo flow, screen by screen, recorded in
  `tests.md`** — a deliverable, not a check

## Out of Scope

| Excluded | Reason |
|---|---|
| The localization infrastructure itself | `005-localization-core`; this story consumes it |
| A third locale | Two locales prove the mechanism; a third is a resource file (NFR-9) |
| Translating user content | BR-8.10; a different product |
| Hijri calendar | ADR-007 decision 7 |
| Arabic search normalisation | Real work with a known fix; deferred with reasoning in `11-open-questions.md` Q-7 |
| Per-customer language | No outbound customer communication exists to use it |
| A translation management platform | Two locales and one translator |
| A refresh-token flow | ADR-005 does not build one. What that costs here is Q-7 |
| Date-format, number-format, and timezone overrides | Not on the screen (`docs/sdd/design/screens/09-settings-localization.md`) |

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | Neutral `ar` is sufficient; no dialect or region-specific catalogue is needed | A regional catalogue is an added culture, not a redesign (BR-8.2) |
| A-2 | Interface language is a user preference, not an organisation setting | An organisation default would be a settings table and a fallback layer above the user |
| A-3 | The Arabic translation is produced by someone who reads Arabic, not by a machine | Machine-translated interface copy in a support tool reads as unserious, and this is worth saying out loud |
| A-4 | Latin digits are correct for this audience | ADR-007 decision 7; a reviewer may reasonably disagree, which is why it is written down |
| A-5 | `dbo.SupportUsers` already exists when this feature starts, created by `004-auth-and-roles` — sign-in cannot work without it | If `004` also shipped the `PreferredLanguage` column, this feature's migration is empty. That is checked, not assumed — see [`data-model.md`](data-model.md) |
| A-6 | Every Release 1 screen exists before the Arabic pass runs | A pass over a screen that does not exist yet is a pass that has to be repeated. It is why this feature sits in Phase 4 |

## Open Questions

| # | Question | Working assumption |
|---|---|---|
| Q-1 | Should the language switcher appear on the login screen? | Yes. Someone who cannot read English cannot find a switcher that only appears after signing in |
| Q-2 | If a user's stored preference is Arabic but they send `Accept-Language: en`, which wins? | The stored preference (BR-8.4). It is a deliberate choice; the header is the browser's guess |
| Q-3 | Should the interface language also set the language of exported or printed output? | No export exists yet. Recorded so the answer is not invented later |
| Q-4 | AC-1 says the switcher is "present on every screen". The design puts it inline on `01-login.md` and, inside the shell, behind the user popover → Settings → Localization (`09-settings-localization.md`). Which is it? | **Reachable** from every screen, not rendered in every header. `02-app-shell.md` has no header control for it and puts Settings in the popover deliberately. The user story's own wording is "available on every screen" — the story and the design agree; only this artifact's paraphrase reads stricter |
| Q-5 | Who writes and reviews the Arabic copy? (blueprint `11-open-questions.md` Q-8) | A person who reads Arabic writes it, and a second person reviews it. If there is no reviewer, that is worth knowing **before** the catalogue is filled: unreviewed Arabic copy is indistinguishable from machine output at review time, because the reviewers read English |
| Q-6 | Which Arabic typeface, and was the current one ever chosen? (blueprint `11-open-questions.md` Q-15) | `IBM Plex Sans Arabic`, set as `--font-ar`. The Arabic layer in the design reports **IBM Plex Sans**, which contains no Arabic glyphs at all — so that layer renders through whatever fallback the machine supplied, and the Arabic in the designs is very likely not a choice anybody made. Inheriting an accidental fallback is worse than choosing, because it looks settled |
| Q-7 | The token is not reissued when the language changes, so the `preferred_language` claim is stale for the rest of the session — and the claim outranks `Accept-Language` (BR-8.5). How does BR-8.4's order see the new value before the next sign-in? | The client sends `?culture=<locale>` on every request for the remainder of the session after an in-session switch. The query parameter is the **top** of BR-8.4's order precisely so an explicit intent outranks a stored one, and this is an explicit intent. It costs no reissue, no per-request database read, and no contract change, and it is dropped at the next token issue, when the claim carries the value itself. The alternative is reissuing the token from this endpoint, which turns AC-5's `204` into a `200` carrying a token — a contract change other features cite, hence the question rather than the change |
| Q-8 | The token is valid but the subject's `SupportUsers` row is missing or inactive. Is `PUT /api/me/language` a `401` or a `404`? | `401`, `errors/unauthenticated`. `/api/me/*` addresses the caller and nothing else, so there is no resource to report missing; and a `404` would tell a token holder that the account no longer exists, which a `401` does not |

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
| AC-24 | After an in-session switch to Arabic, the **next** server-authored message arrives in Arabic, without signing out and in (FR-5.5) |

**On AC-1:** "present" means reachable — inline on the login screen, and via the user
popover → Settings → Localization inside the shell. See Q-4.

**AC-24 is added by this migration**, and it is the one requirement the original
artifact set accepted without writing down. AC-8's own wording — "after the next token
issue" — is the evidence that the stale claim was known. The consequence was not
recorded, and it is the kind that survives review: the UI labels switch instantly
because they come from `react-i18next`, while every server-authored sentence keeps
arriving in the previous language until the user signs out and in. Nothing errors,
nothing logs, and a reviewer who checks the labels sees a working feature.

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
| `PUT /api/me/language` with the value already stored | `204`, and **no audit row** — BR-9.8 records fields that actually changed. The client does not send the request at all in this case (`09-settings-localization.md`, state "Already this language"), so this covers the server-side path only |
| `Content-Language` on the `204` that performed the switch | Names the **previous** locale. The request was resolved before the handler ran, from the claim current at that moment. A client reading `Content-Language` to confirm the switch will conclude it failed |
| Arabic rendered at `--leading-tight` (100%) with cap-height vertical trim | **Clipped glyphs.** Arabic descends well below the baseline and carries marks above cap height. It presents as a font rendering fault rather than a missing token, which is exactly why it survives review. `--leading-ar-*`, and cap-height trim is not applied to Arabic at all (blueprint Q-13, `design/tokens.css` note 4) |
| Positive letter-spacing applied to Arabic | Breaks the cursive joins. Tracking stays `0` for Arabic permanently |
| Token valid, `SupportUsers` row missing or inactive | `401` — see Q-8 |

## Rules Referenced

BR-8.1 – BR-8.14, BR-9.1 – BR-9.4, BR-9.8, BR-9.10, FR-5.1 – FR-5.8, NFR-8, NFR-9,
NFR-10, ADR-005, ADR-007, ADR-008, ADR-010, ADR-011, ADR-013
