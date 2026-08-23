# ADR-007 — Localization and right-to-left support

**Status:** Accepted · **Implements:** FR-5, BR-8 · **Supersedes:** the out-of-scope
entry for localisation previously in `00-project-context.md`

## Context

The interface and every server-authored message must be available in English and
Arabic, and Arabic must render right-to-left.

Arabic is not "English with different words". It reverses layout direction, has six
plural categories where English has two, renders in a script whose text can appear
inside an otherwise English interface, and has its own numeral system that is
sometimes wanted and sometimes actively harmful.

Retrofitting localization is the expensive version of this work. Every hard-coded
string, every `margin-left`, and every `"You have " + n + " tickets"` becomes a
separate edit. The decision that matters most here is *when*, not *how*.

## Decisions

### 1. The infrastructure is built in the walking skeleton, before the first story

Not as a later story. A single screen built without i18n costs perhaps thirty minutes
to convert; seven screens cost a day, and the conversion is the kind of mechanical
work where things get missed.

The consequence is that step 1 of the build order grows, and one Release 1 story may
have to move out. That trade is recorded in `08-board.md` rather than absorbed
silently.

### 2. Whoever authors a string owns its translation

| Author | Examples | Where the translation lives |
|---|---|---|
| Server | Validation messages, `ProblemDetails.title` and `detail` | `.resx` in `Wasl.Application/Resources` |
| Client | Labels, buttons, headings, empty states, enum display names | JSON catalogues in `wasl-web/src/locales` |

The alternative — the server returning every display string so the client is a dumb
renderer — was rejected. It would mean a network round trip to render a button label,
it would couple every UI copy change to a backend deployment, and it would put UI
text in a layer that has no idea what a button is.

The rule is simple enough to apply without thinking: if the string is produced by code
you are writing, translate it where you are.

### 3. Machine-readable values are never translated

`ProblemDetails.type`, the keys of `errors`, enum values, `TicketNumber`, and every
identifier stay identical in both locales. Only human sentences change.

This is what keeps the API contract locale-independent. A client that branches on
`type` works in every language. Translating `InProgress` would make the stored data
locale-dependent, break every filter, and corrupt the history table, which stores
status values as text.

### 4. Culture resolution order, and where the middleware sits

`?culture=` → the user's stored `PreferredLanguage` → `Accept-Language` → `en`.

A stored preference beats the header because it is a deliberate choice and the header
is the browser's guess. The query parameter beats both, for testing and for sharing a
link in a known language.

Reading the stored preference requires a custom `RequestCultureProvider` that reads a
claim, which means `UseRequestLocalization()` must be registered **after**
`UseAuthentication()`. In the default ASP.NET Core template it sits before, where the
user is not yet resolved and the provider silently returns nothing. This is the single
most likely defect in this piece of work, and it fails quietly — the application
simply always uses `Accept-Language` and nobody notices until an Arabic user with an
English browser complains.

The `PreferredLanguage` is also placed in the JWT as a claim, so resolving it costs no
database query per request.

### 5. Symbolic resource keys, with an explicit English catalogue

Keys are symbolic — `Error.DuplicateCustomer.Email` — and there is an explicit `en`
catalogue as well as an `ar` one.

Using the English text as the key is a common shortcut. It was rejected because a
missing Arabic entry then renders an English sentence that looks deliberate, and
because editing the English copy silently orphans the Arabic translation.

With symbolic keys plus a **key-parity test that fails the build when the two
catalogues diverge**, a missing translation is caught in CI rather than in front of a
user. Runtime behaviour still falls back to English (BR-8.12) — the fallback is the
safety net, the test is the actual control.

### 6. CSS logical properties, not a mirrored stylesheet

`margin-inline-start` rather than `margin-left`; `text-align: start` rather than
`left`. Direction is set once, as `dir` on the document root.

A separate RTL stylesheet, or an automated flipping tool, was rejected: it doubles
what has to be maintained and it flips things that must not flip — code snippets,
phone numbers, and the ticket number among them.

### 7. Gregorian calendar and Latin digits in Arabic

The Arabic locale is configured as `ar-u-ca-gregory-nu-latn` for identifiers,
timestamps, and counts.

Arabic-Indic digits (`٠١٢٣`) are correct Arabic typography and wrong here. A ticket
number is read aloud on the phone, pasted into an email, and searched for. Rendering
`TCK-٢٠٢٦-٠٠٠٠٤٢` makes it unsearchable against the stored value and unusable in a
conversation with anyone whose keyboard is not Arabic.

Hijri dates were rejected for the same class of reason: support timelines, SLAs, and
audit trails are Gregorian, and displaying one calendar while reasoning in another
invites arithmetic errors nobody will catch.

This is a decision that a reviewer may disagree with, and it is stated here so the
disagreement is about the reasoning rather than about whether it was considered.

### 8. `dir="auto"` on every element rendering user content

An Arabic comment inside an English interface, and an English ticket subject inside an
Arabic one, are both normal. `dir="auto"` lets the browser decide per element from the
first strong directional character.

Without it, Arabic text in an LTR container renders with its punctuation in the wrong
place — which looks like a typo rather than a bug, so it survives review.

### 9. Full CLDR plural categories for Arabic

`react-i18next` plural suffixes: `_zero`, `_one`, `_two`, `_few`, `_many`, `_other`.

Applying English's two forms to Arabic is grammatically wrong for most counts. String
concatenation around a number — `t('tickets') + ' ' + n` — is banned for the same
reason, and is caught by lint rather than by review.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Localization as a later story | Retrofitting touches every file; the conversion is mechanical work where omissions hide |
| Server returns all display strings | A round trip per label, UI copy coupled to backend deploys, and text in a layer with no view |
| Database-stored translations | Needs an admin UI to be worth anything, adds a query to every request, and puts strings outside version control where they cannot be reviewed |
| English text as the resource key | A missing translation renders as plausible English; editing the source text orphans the translation |
| A third-party translation platform | Correct for a product with real translators; overhead here for two locales |
| Automatic RTL stylesheet mirroring | Flips things that must not flip, and doubles what is maintained |
| Arabic-Indic digits throughout | Breaks copy, paste, search, and reading a ticket number aloud |

## Consequences

- The walking skeleton is larger, and the Release 1 cut line moves. See `08-board.md`.
- Every story's Definition of Done gains a localization section.
- Every screen must be reviewed twice, once per direction. Reviewing only in English
  is how RTL defects ship.
- Adding a third locale is a resource file and a registered culture, with no code
  change (NFR-9).
- The key-parity test must run in CI. Without it, this decision degrades into a
  convention, and conventions are not enforced.
