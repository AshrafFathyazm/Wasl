# Localization

How to add a translated string, and how to add a language. Rationale lives in
`decisions/ADR-007-localization.md`; rules live in `04-business-rules.md` under BR-8.

## The ownership rule

Whoever authors a string translates it, where they are.

| Author | Examples | Catalogue |
|---|---|---|
| Server | Validation messages, `ProblemDetails.title` and `detail` | `src/Wasl.Application/Resources/SharedResource.{en,ar}.resx` |
| Client | Labels, buttons, headings, empty states, enum display names | `src/wasl-web/src/locales/{en,ar}/*.json` |

## Never translated

`ProblemDetails.type`, the keys of `errors`, enum values, `TicketNumber`, identifiers,
and log messages. See BR-8.7 and BR-8.9.

Enum values travel over the wire as `InProgress` in every locale. Only the label the
user reads is translated, and that lives in the client catalogue.

## Adding a server-authored string

1. Add a symbolic key to `SharedResource.en.resx`, e.g. `Error.TicketClosed`.
2. Add the same key to `SharedResource.ar.resx`.
3. Resolve it through `IStringLocalizer<SharedResource>`, never as a literal.
4. Run the parity test.

Keys are symbolic rather than the English text itself. With English-as-key, a missing
Arabic entry renders a plausible English sentence and nobody notices; editing the
English copy silently orphans the translation.

## Adding a client string

1. Add the key to `locales/en/<namespace>.json`.
2. Add the same key to `locales/ar/<namespace>.json`.
3. Use `t('namespace:key')`. Never a literal in JSX — the lint rule will fail the build.
4. Run the parity test.

### Counts

Use plural keys, not concatenation:

```json
{
  "ticketCount_zero":  "…",
  "ticketCount_one":   "…",
  "ticketCount_two":   "…",
  "ticketCount_few":   "…",
  "ticketCount_many":  "…",
  "ticketCount_other": "…"
}
```

```tsx
t('tickets:ticketCount', { count: n })
```

Arabic has six CLDR plural categories. English has two. `t('tickets') + ' ' + n` is
banned and is caught by lint, because it produces text that is wrong in Arabic for
most values of `n`.

## Direction

Direction is set once, as `dir` on `<html>`, by `useLocale`.

Every component uses CSS **logical** properties:

| Use | Not |
|---|---|
| `margin-inline-start` | `margin-left` |
| `padding-inline-end` | `padding-right` |
| `text-align: start` | `text-align: left` |
| `inset-inline-start` | `left` |
| `border-inline-start` | `border-left` |

A lint rule bans the physical forms. There is no mirrored stylesheet and no automatic
flipping tool: both double what has to be maintained, and both flip things that must
not flip.

### User content

Every element rendering text a user typed carries `dir="auto"`:

```tsx
<p dir="auto">{comment.body}</p>
```

An Arabic comment in an English interface, and an English subject in an Arabic one,
are both normal. Without `dir="auto"` the punctuation lands in the wrong place, which
reads as a typo and therefore survives review.

`dir="auto"` is a rendering hint, not escaping. User content is still rendered as
text; `dangerouslySetInnerHTML` is not used anywhere.

## Formatting

Use `formatters.ts`, never `toLocaleString()` inline.

Arabic is configured as `ar-u-ca-gregory-nu-latn`:

- **Gregorian**, not Hijri — support timelines and audit trails are Gregorian, and
  displaying one calendar while reasoning in another invites arithmetic errors.
- **Latin digits**, not Arabic-Indic — `TCK-2026-000042` is read aloud, pasted, and
  searched. `TCK-٢٠٢٦-٠٠٠٠٤٢` is none of those things.

Both are decisions a reviewer may disagree with. They are in ADR-007 so the
disagreement is about the reasoning, not about whether it was considered.

## Culture resolution

```text
?culture=  →  the user's PreferredLanguage claim  →  Accept-Language  →  en
```

The stored preference beats the header because it is a deliberate choice and the
header is the browser's guess. An unsupported locale falls back to English with a
`200` — asking for a language the system does not speak is not a client error.

### The ordering trap

`UseRequestLocalization()` must be registered **after** `UseAuthentication()`.

The provider that reads the language claim needs a resolved user. Registered before
authentication — which is where the default template puts it — it finds nothing,
returns null, and the system falls through to `Accept-Language` for every user,
forever, with no error anywhere.

This is the single most likely defect in the localization work and it fails silently.
`TEST-014-05` exists for exactly this, and it is marked not-droppable.

## Parity tests

Two tests, one per side, each failing the build when a key exists in one catalogue and
not the other.

Runtime behaviour falls back to English for a missing key (BR-8.12), but that fallback
is the safety net, not the control. Without the tests, BR-8.11 is a convention, and
conventions are not enforced.

## Adding a third language

No code change (NFR-9):

1. Add `SharedResource.<code>.resx`.
2. Add `locales/<code>/*.json`.
3. Register the culture in the supported list.
4. Add the option to the switcher.
5. Extend the parity tests to the new catalogue.

If any step above requires touching a component, something has been hard-coded and
that is the bug to fix first.

## Reviewing

Every screen is reviewed twice, once per direction. Reviewing only in English is how
right-to-left defects ship — the words are translated, so the work looks finished.
