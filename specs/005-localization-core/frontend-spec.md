# 005 — Frontend Spec

**Screens:** none. **Route:** none. **Story:** — (infrastructure) ·
**Who can reach it:** everyone, invisibly, on every screen built after this one

This feature has **no screen**, and saying so in one line would be dishonest, because it
has a great deal of frontend. What it ships is the layer every later screen is built on
top of: the i18n runtime, the direction switch, the formatters, the `dir="auto"`
primitive, and four lint rules that turn three of ADR-007's decisions from conventions
into build failures.

The screen that makes any of this visible is `014`
(`docs/sdd/story-artifacts/US-014-language-preference/`). The design-system primitives are
`006`. Neither exists yet, and this deliberately lands first — ADR-007 decision 1.

**Scope note needing confirmation:** this feature also creates the Vite/TypeScript/ESLint
scaffold, which `001/spec.md` assigned to `006`. See `spec.md` Q-B and `research.md` R-10.

---

## Components

| Component | Kind (ADR-011 §4) | Fetches? | Why it exists |
|---|---|---|---|
| `App.tsx` | Route / page shell | No | Somewhere for `main.tsx` to render. Deliberately contains no copy |
| `UserText` | **Primitive** — domain-agnostic | No | `dir="auto"` as the default path rather than something remembered (`spec.md` Q-C) |
| `LocaleProvider` | **None of the three** | No | Writes `lang` and `dir` on `<html>`. It renders no markup of its own |
| `useLocale()` | Hook, not a component | No | `{ locale, dir, setLocale }`. `014` is the first caller of `setLocale` |
| `formatters.ts` | Module | No | The only place an `Intl` formatter is constructed, enforced by lint |

`LocaleProvider` is recorded as not fitting ADR-011 §4's taxonomy rather than being forced
into it. The three kinds classify *rendering* components by whether they fetch and whether
they know the domain; a provider that sets two attributes on the document element is
infrastructure, and mislabelling it would make the taxonomy useless the first time anyone
applied it.

There is no fetching anywhere in this feature, so ADR-011 §4's route-level-only rule is
not exercised — recorded so its absence is visible rather than looking like an omission.

---

## Fields

**None.** There is no form, and therefore no React Hook Form and no Zod schema in this
feature. Recorded because every other `frontend-spec.md` in this repository has a fields
table, and an empty one is information: the first form is `007`.

---

## All states

There is no screen, so the five screen states do not apply. What does have states is the
**i18n runtime**, and every one of them has to be right before the first screen exists:

| State | Behaviour | AC |
|---|---|---|
| **Initialising** | `lib/i18n` is imported and initialised in `main.tsx` **before** `createRoot().render()`. Catalogues are static imports, so there is no asynchronous window and no flash of untranslated content (`research.md` R-12) | — |
| **Ready, `en`** | `<html lang="en" dir="ltr">`. Latin digits, Gregorian dates, two plural categories | AC-20 |
| **Ready, `ar`** | `<html lang="ar" dir="rtl">`. Latin digits (`nu-latn`), Gregorian calendar (`ca-gregory`), six plural categories | AC-20, AC-21, AC-26 |
| **Switching** | Synchronous. `setLocale('ar')` re-renders and rewrites both attributes in the same commit; switching back leaves **no residual attribute** | AC-20 |
| **Missing key** | Falls back to the English string. **Never the raw key.** `returnEmptyString: false`, so an empty catalogue entry also falls back instead of rendering blank | AC-29 |
| **Empty catalogue value** | Treated as missing, both at runtime and by the parity test. An empty translation renders as blank text, which reads as a layout bug and survives review | AC-28, AC-29 |
| **Locale disagreement** | `Content-Language` differs from what was requested → `console.warn` in development only. Not a user-facing error: falling back is legitimate (BR-8.3) | AC-31 |

An absent state is a defect, not a gap (`docs/sdd/design/screens/README.md`). The five
*screen* states arrive with the first screen, in `007`.

---

## i18n keys

Namespace `common`, in `src/wasl-web/src/locales/{en,ar}/common.json`. App-shell copy
only — every key below is rendered by something in this feature or is generic state copy
that `006` and `007` will use immediately.

| Key | `en` | Note |
|---|---|---|
| `app.name` | Wasl | Rendered by the shell. Not translated in `ar` either — it is a product name |
| `app.tagline` | Customer support | |
| `states.loading` | Loading… | Generic; the first consumer is `006` |
| `states.error.title` | Something went wrong | |
| `states.error.body` | The action could not be completed. | |
| `states.empty` | Nothing to show | |
| `actions.retry` | Try again | |
| `actions.cancel` | Cancel | |
| `actions.close` | Close | |
| `a11y.skipToContent` | Skip to content | Rendered but visually hidden; still a key (BR-8.8) |
| `a11y.languageRegion` | Language | The `aria-label` on the region `014`'s switcher will occupy |

Every key exists in `ar`, enforced by the parity test (AC-28) — not by discipline
(BR-8.11).

**No plural key is shipped**, and that is deliberate. Every count this product renders
belongs to a screen that does not exist yet, and a catalogue entry with no caller is
speculative. AC-21 proves the six-category configuration with a resource bundle defined
inside the test, which tests the mechanism without shipping copy nobody renders. The first
real plural arrives with `010`'s ticket list.

**No server-authored message is in this table.** Validation and error sentences arrive
already translated (BR-8.6) and are rendered as received. Re-translating them client-side
would put the same sentence in two catalogues, which is how they diverge.

---

## Right-to-left

| Concern | Requirement | AC |
|---|---|---|
| Direction | `dir` on `<html>`, written once by `LocaleProvider`. Never on a component, never in CSS | AC-20 |
| Language attribute | `lang` on `<html>` too — it drives font shaping, hyphenation, `:lang()` selectors, and what a screen reader pronounces. Setting `dir` without `lang` is the half-done version | AC-20 |
| Layout | CSS **logical** properties throughout: `margin-inline-start`, `padding-inline-end`, `text-align: start`, `inset-inline-start`, `border-inline-start` | AC-24 |
| The physical forms | Banned by Stylelint, so it is a build failure. There is no mirrored stylesheet and no automatic flipping tool: both double what is maintained and both flip things that must not flip (ADR-007 decision 6) | AC-24 |
| **User content** | Every element rendering text a user typed carries `dir="auto"`. `UserText` is the easy path so that the correct thing is also the shortest thing to type | AC-30 |
| Identifiers and phone numbers | Do **not** mirror. `TCK-2026-000042` and `+966501234567` read left-to-right in both locales | AC-27 |
| Digits | Latin in both locales. `nu-latn` in the Arabic `Intl` locale, and lint keeps every formatter in one file | AC-25, AC-26 |
| Calendar | Gregorian in both locales, `ca-gregory` (ADR-007 decision 7) | AC-26 |

`dir="auto"` **cannot be fully enforced by lint** — deciding whether a given expression is
user content requires knowing where the value came from, which ESLint does not. It is
enforced structurally instead: `UserText` exists, it is the documented way to render a
customer name or a comment, and review checks the rest. Recorded as an accepted gap in
[`checklists/requirements.md`](checklists/requirements.md) rather than claimed as
automated.

Without `dir="auto"`, Arabic text in an LTR container renders with its punctuation in the
wrong place — which looks like a typo rather than a bug, so it survives review (ADR-007
decision 8).

---

## Accessibility

| Requirement | Verified by |
|---|---|
| `<html lang>` matches the rendered language, and changes when the locale changes | `TEST-005-14` — asserted, not eyeballed. A screen reader reading Arabic with `lang="en"` produces sounds, not words |
| `<html dir>` matches the language's direction | `TEST-005-14` |
| No text is rendered as an image, and no direction is conveyed by colour alone | Nothing in this feature renders either |
| The `a11y.skipToContent` string is a key, not a literal, even though it is visually hidden | AC-22's lint rule fires on it like any other string |
| Focus rings, tab order, `aria-describedby` | **Not this feature.** No interactive element exists. Arrives with `006`'s primitives and is verified per screen from `007` onward |

`REV-005-02` is the accessibility pass on what exists: two attributes and one primitive.
Small, and it establishes the habit before there are seven screens to catch up on.

---

## Lint rules — the part of this feature that outlives it

Each rule ships with a fixture that **must fail**, asserted by `TEST-005-11`. A lint rule
nobody has watched fail may be misconfigured, and a misconfigured lint rule is worse than
no rule because it is believed.

| Rule | Bans | AC | Rationale |
|---|---|---|---|
| `react/jsx-no-literals` | A literal user-facing string in JSX | AC-22 | FR-5.2, BR-8.8. Ships with an allow-list for punctuation, or it becomes noise and gets disabled |
| `no-restricted-syntax` | `t('x') + n`, `` `${n} ${t('x')}` ``, and `+` around a count | AC-23 | BR-8.14. English's two plural forms applied to Arabic are wrong for most values of `n`. The failure message names the plural form to use instead |
| `stylelint property-disallowed-list` | `margin-left`, `margin-right`, `padding-left`, `padding-right`, `left`, `right`, `border-left`, `border-right`, and `text-align: left\|right` | AC-24 | ADR-007 decision 6 |
| `no-restricted-properties` / `no-restricted-globals` | `toLocaleString`, `toLocaleDateString`, `toLocaleTimeString`, `Intl.*` outside `lib/i18n/formatters.ts` | AC-25 | Otherwise the first person in a hurry writes `date.toLocaleDateString('ar')`, gets Arabic-Indic digits, and it looks correct to anyone who does not read Arabic |

---

## Not on this screen

There is no screen. What is nonetheless deliberately excluded:

| Excluded | Where |
|---|---|
| The language **switcher** | `014`. This feature ships `setLocale`; `014` ships the control that calls it, on every screen including sign-in |
| Persisting the choice across sessions | `014` — `PUT /api/me/language` and the JWT claim |
| Design tokens, `Button`, `Input`, `Badge`, and the other primitives | `006` |
| Any form, any Zod schema, any React Hook Form usage | `007` is the first form |
| Any TanStack Query usage | `008` is the first list. `client.ts` here is the fetch wrapper the query functions will call, not a query |
| A `useTranslation` call in a feature folder | There are no feature folders yet. `src/features/` arrives with `007` |
| Lazy-loaded catalogues | Rejected in `research.md` R-12 — a loading gate on the whole application for two small files |
| Arabic-Indic digits as an option | Rejected in ADR-007 decision 7. Not a setting, not a toggle |
| A right-to-left stylesheet, or an automatic flipping build step | Rejected in ADR-007 decision 6 |
| The Arabic walk of every screen | `014`, where it is a **deliverable** rather than a check, because RTL defects are visual and no assertion catches a container sized to English text |
