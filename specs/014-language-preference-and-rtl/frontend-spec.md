# 014 — Frontend Spec

**Screens:** Settings · Localization (`/settings/localization`), and the switcher on
Login (`/login`) · **Story:** US-014 · **Who can reach it:** any authenticated support
user for the settings screen (Agent or Manager — BR-6); anyone for the login switcher

The element-by-element screen specs, with tokens, geometry, and layout regions, are
[`docs/sdd/design/screens/09-settings-localization.md`](../../docs/sdd/design/screens/09-settings-localization.md)
and
[`docs/sdd/design/screens/01-login.md`](../../docs/sdd/design/screens/01-login.md).
They are not duplicated here. This file carries what is specific to **this feature's**
build: the contract binding, the states, the i18n keys, the RTL obligations, and the
Arabic typography that nothing else in the system has had to face yet.

The API surface is [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md).

This feature is also the only one that touches **every** screen. The per-screen work is
`FE-014-06` and its findings are recorded in `tests.md`, not here.

---

## Components

| Component | Kind (ADR-011 §4) | Fetches? |
|---|---|---|
| `LocalizationSettingsPage` | Route / page | Yes — owns the mutation |
| `SettingsLayout` (sub-nav + content) | Feature component | No |
| `LanguageOptionGroup` | Feature component | No — receives the value and a handler as props |
| `LocalePreview` | Feature component | No — formats a fixed date and number |
| `LanguageSwitcher` (login) | Feature component | No — writes `localStorage`, there is no user yet |
| `Radio`, `Button`, `Callout`, `Toast` | Primitive | No |
| `useLocale()` | Hook in `lib/i18n` | No |

Fetching only at the route level, per ADR-011 §4. No global store: the active locale
lives in i18next, the mutation state lives in TanStack Query, and there is nothing left
over (ADR-011 decision 1).

`LanguageSwitcher` on the login screen and `LanguageOptionGroup` in settings are
deliberately **not** the same component. One writes `localStorage` with no user and no
request; the other owns a server mutation with an optimistic update and a revert. Merging
them would produce one component with a `hasUser` branch through every path.

## Fields

| Field | Control | Required | Client rule | Mirrors |
|---|---|---|---|---|
| `language` | Radio group, two options | yes — one is always selected | `'en' \| 'ar'` union, lowercase, no region tag | AC-5, AC-6 |

No Save button. One setting with an instantly visible effect does not need a commit
step, and a Save button next to a change you can already see is confusing
(`09-settings-localization.md`).

Selecting the language already active is a **no-op and sends no request** — which is
also why `TEST-014-18` exists for the server-side path: the client's restraint is not
the guarantee.

## States — every one, and the two absences are decisions

| State | What the user sees | AC |
|---|---|---|
| **Idle** | Current language selected; both rows interactive | — |
| **Saving** | The chosen row shows a small spinner; both rows non-interactive; group is `aria-busy` | AC-5 |
| **Success** | Locale applied, `dir` and `lang` updated, catalogue swapped, preview re-rendered, toast confirms. No navigation | AC-2, AC-3, AC-5 |
| **Error** | Selection **reverts to the server's value**, message above the group | AC-6 |
| **Loading** | None. The current language comes from i18next and the token claim — there is nothing to fetch, so there is no skeleton | — |
| **Empty** | None. A two-option radio group cannot be empty | — |
| **Forbidden** (`403`) | None. Both roles may set their own language (BR-6). A `403` here would mean the policy is wrong, and it surfaces at the route-level `ErrorBoundary` like any unexpected fault (ADR-011 §5) | — |
| **Conflict** (`409`) | None. No `expectedVersion`; the only writer of a person's language is that person | — |
| **Unauthenticated** (`401`) | Redirect to sign-in, keeping the chosen locale in `localStorage` so the login screen appears in it | AC-7 |

The four absences are written down rather than omitted. Absence of a state is a defect,
not a gap (`docs/sdd/design/screens/README.md`) — so an absence that *is* correct has to
say why, or the next reader cannot tell which kind it is.

The error state **reverts**. Leaving the UI in the chosen language after the server
refused is the worst of the options: the user believes the choice is stored, it is not,
and the next reload silently contradicts them.

## Localization

Every string is a key. No literals in JSX (BR-8.8), enforced by lint (AC-22).

| Key | `en` | Note |
|---|---|---|
| `settings:general` | GENERAL | Sub-nav section caption |
| `settings:nav.profile` | Profile | Sibling item; the Profile screen is not this feature |
| `settings:nav.localization` | Localization | |
| `settings:localization.title` | Localization | Section title |
| `settings:localization.body` | How the interface is shown to you. | |
| `settings:localization.preview` | Preview | Callout caption |
| `settings:localization.saving` | Saving… | |
| `settings:localization.saved` | Language updated | Toast |
| `settings:localization.saveFailed` | Could not change the language. Your previous choice is still in effect. | Names the revert, so the user is not left guessing what state they are in |
| `common:lang.current` | Language | Login-screen switcher label |
| `common:lang.en` | English | **Identical in both catalogues** |
| `common:lang.ar` | العربية | **Identical in both catalogues** |
| `common:nav.settings` | Settings | User popover item — already exists in `002` |

Every key exists in `ar` as well, enforced by the parity test (BR-8.11) — not by
discipline.

**`common:lang.en` and `common:lang.ar` are the same in both catalogues and that is
deliberate.** Language names are written in their own language. Someone who cannot read
the current interface must still be able to find their own language — the same reasoning
that puts the switcher on the login screen at all.

**Server-authored messages are not in this table.** The `400` message listing the
supported locales arrives already translated (BR-8.6) and is rendered as received.

### Plurals

Nothing on this screen is counted, so no plural key belongs here. `FE-014-09` covers the
counted nouns on the screens this feature passes over — ticket counts, comment counts,
result counts — with all six Arabic CLDR categories (`_zero`, `_one`, `_two`, `_few`,
`_many`, `_other`). Concatenating a number onto a translated noun is banned and caught
by lint, not by review (ADR-007 §9).

## Right-to-left

| Concern | Requirement |
|---|---|
| Direction | `dir` **and** `lang` on the document root, set together, once (ADR-007 §6). Setting `dir` without `lang` gives correct layout with the wrong font and the wrong hyphenation |
| Layout | CSS logical properties throughout. `margin-inline-start`, never `margin-left`; `inset-inline-start`, never `left` |
| Settings sub-nav | **Mirrors** — moves to the inline-end. The 3px active bar follows automatically via `inset-inline-start` |
| Login panel and form | **Mirror** — they swap sides via `flex` order, not a second layout |
| Login aurora, rays, particles | **Do not mirror.** They are abstract and have no reading direction; mirroring them would be work with no meaning (`01-login.md`) |
| Brand mark | **Does not mirror** |
| Collapse chevron, breadcrumb separators | **Mirror** — they point somewhere |
| A check mark | **Does not mirror.** An arrow does. This is the distinction that gets missed |
| `العربية` inside an English interface | Renders RTL internally regardless of the page direction, via `dir="auto"` on the option label |
| Numbers and dates in the preview | Latin digits, Gregorian, both locales (BR-8.13). The preview exists so the user sees the format change **before** committing |
| `TicketNumber`, phone numbers, email addresses, code | **Never mirror.** `+966501234567` and `TCK-2026-000042` read left-to-right in both locales |
| User content anywhere | `dir="auto"` on the element. Without it, Arabic in an LTR container puts its punctuation in the wrong place, which looks like a typo rather than a bug and so survives review (ADR-007 §8) |

`FE-014-06` walks every screen in Arabic and `TEST-014-16` records what it found in
`tests.md`. RTL defects are visual — no assertion catches a container sized to English
label text, a directional icon that did not flip, or a number on the wrong side of an
Arabic sentence.

## Arabic typography — the defect that reads as a broken font

Blueprint `11-open-questions.md` Q-13, and `design/tokens.css` note 4.

The design system's line height is **100%** with vertical trim set to **cap height**. For
single-line Latin labels that is tidy. For Arabic it **clips**: Arabic glyphs descend
well below the baseline (final ي ج ع) and carry marks above cap height (ث ض). What the
reviewer sees is text with its tops and tails shaved off, which reads as a font rendering
fault or a bad web-font load — not as a missing token. That is exactly why it would
survive review, and why it is specified here instead of being left to the stylesheet.

| Rule | Value | Why |
|---|---|---|
| Arabic leading | `--leading-ar-tight: 1.3` · `--leading-ar-normal: 1.75` · `--leading-ar-heading: 1.45` | Arabic needs more leading than Latin at the same size. The source design has no per-locale answer, so these are ours |
| Cap-height vertical trim | **Not applied to Arabic at all** | There is no trim value that keeps both the marks and the descenders |
| Letter spacing | `0`, permanently, for Arabic | Arabic is cursive; positive tracking breaks the joins and the word stops being one word |
| Family | `--font-ar: 'IBM Plex Sans Arabic', 'IBM Plex Sans', system-ui, sans-serif` | See below |

**The typeface is an open question, not an inherited decision** (`spec.md` Q-6, blueprint
Q-15). The Arabic layer in the design reports **IBM Plex Sans**, which contains no Arabic
glyphs — so it is rendering through whatever fallback the machine supplied, and the
Arabic in the designs is very likely not a choice anybody made. The working assumption is
`IBM Plex Sans Arabic`: same designers, open source, the obvious pairing. It is set in
`--font-ar` and flagged as a decision being made here for the first time, rather than
presented as inherited. The Arabic face is half the typography of a bilingual product and
it is the half nobody reviews, because the reviewers read English.

This is `FE-014-11`, and it is verified by looking at every type size in Arabic, not by a
test.

## Accessibility

| Requirement | Verified by |
|---|---|
| A real radio group — `role="radiogroup"` with `aria-labelledby`, real `<input type="radio">` options, arrow-key navigation within the group and one tab stop for the group | `TEST-014-21` |
| Each option carries its own `lang` — `lang="ar"` on `العربية` — so a screen reader pronounces it in an Arabic voice instead of spelling it in English | `TEST-014-21` |
| `aria-busy` on the group while saving; both options non-interactive, and the disabled state conveyed rather than only styled | `TEST-014-21` |
| The failure message announced — `role="alert"` — because the visible change is a selection moving back, which a screen-reader user does not see | `TEST-014-21` |
| Every interactive element keyboard reachable with a visible focus ring | `FE-014-06` |
| `<html lang>` and `<html dir>` change together on switch | `TEST-014-12` |

The `lang` per option is the non-obvious one. Without it the whole page is `lang="en"`
while an Arabic string sits inside it, and the screen reader reads it letter by letter in
an English voice — technically all of the information, none of it usable.

## Preview before build — not optional

`FE-014-00` renders `/settings/localization` with real tokens, real copy, plausible
values, every state, and both languages **before** anything is wired.

The Arabic for "Localization" is longer than the English, the sub-nav sits on the other
side, and the preview callout has to hold a formatted date and a formatted number in both
directions. Finding a container sized to English there costs minutes; finding it after
the screen has tests, translation keys, and query wiring costs hours (ADR-009,
`docs/sdd/design/preview-first-workflow.md`).

## Not on this screen

| Excluded | Where |
|---|---|
| A third language | Nowhere. `005` + NFR-9 make it a resource file, not a screen change |
| Date-format, number-format, timezone overrides | Nowhere. Not requested, and each one multiplies the formatting surface |
| Regional variants (`ar-EG`, `ar-SA`) | Nowhere. They fall back to `ar` on a request (BR-8.2) and are rejected as a stored preference (contract) |
| Hijri calendar | Out of scope project-wide (ADR-007 §7) |
| Profile fields | The Profile settings screen, which is not this feature |
| Theme toggle | Nowhere — one appearance only (ADR-009), and it is listed as deliberately absent from the shell |
| Per-customer language | No outbound customer communication exists to use it |
| A Save button | Deliberately absent — see Fields |
