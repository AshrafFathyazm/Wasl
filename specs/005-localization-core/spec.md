# 005 — Localization Core

**Phase:** 0 · Foundation · **Story:** — (infrastructure; US-014 is the story that
consumes it) · **Status:** **Revised 2026-08-29 against six delivered features — awaiting
review**

---

## Reconciliation, 2026-08-29 — read this before the rest

This spec was written when `005` was going to be the second feature built. It is now the
**thirteenth**, and six features have landed on top of its assumptions. Nothing below is
deleted, because a spec quietly edited to match what happened is a spec that can no longer be
checked against what it promised. What is stale is marked stale, in place.

### Why it moved to the front of the queue

It was scheduled **last** on the grounds that it unblocks nothing, and that was true. The
frontend lane then reported that `Accept-Language: ar` returns the same English sentence from
every endpoint. **Measured on the wire before this revision was written**, against the running
API and the compose container:

```text
401 [en]  Content-Language=      title=Authentication is required.
401 [ar]  Content-Language=      title=Authentication is required.
401 [en]  Content-Language=      title=Email or password is incorrect.
401 [ar]  Content-Language=      title=Email or password is incorrect.
400 [en]  Content-Language=      title=One or more validation errors occurred.
          errors: email=Enter your email address. | password=Enter your password.
400 [ar]  Content-Language=      title=One or more validation errors occurred.
          errors: email=Enter your email address. | password=Enter your password.
```

BR-8.6 is broken across the product, not on one screen. The ordering rule in
`specs/README.md` — *what unblocks something else, first* — could not see this, because
nothing is blocked by it. **A feature the product claims to have and does not is worse than
one it has not built yet.**

### The measurement found a second defect the report did not mention

`Content-Language` is **empty on every error response** and **correct on every success
response**, in the same run:

```text
/health      [ar]  Content-Language=ar
/api/tickets [ar]  Content-Language=ar        (authenticated, 200)
```

So the culture *is* being negotiated and the header *is* being applied —
`ApplyCurrentCultureToResponseHeaders = true` is already set in `Program.cs` — and error
responses lose it anyway. That is **two different failures wearing one symptom**, and they
have different fixes:

| # | Failure | Why | Fixed by |
|---|---|---|---|
| 1 | **There is no Arabic to serve.** `StaticProblemMessageSource` is an English-only dictionary | `002` deliberately deferred `.resx` to this feature | The catalogue half of this spec, unchanged |
| 2 | **A `401`/`403` never reaches the localization middleware at all.** `UseAuthorization()` runs **before** `UseRequestLocalization()` in `Program.cs`, and both denials are produced inside it | The ordering this spec already prescribes was never applied — `Program.cs` satisfies ADR-007's *after `UseAuthentication()`* and not this spec's *before `UseAuthorization()`* | AC-12, already written below, and now **measured rather than predicted** |

The `400`'s missing header is a **third** case and is not yet explained: that response is
produced after the localization middleware has run, so the culture was established and the
header still did not survive the exception handler. Raised as **Q-G**; it is not guessed at
here.

### What `023` already built, so this feature must not build it again

`023-frontend-foundation` shipped the entire client half of this spec while it sat in the
queue. Verified by reading the tree, not assumed:

| This spec's *In scope · Frontend* | Reality |
|---|---|
| `react-i18next`, catalogues under `locales/{en,ar}/` | **Built.** `i18next` 26, `react-i18next` 17, four namespaces — `auth`, `common`, `customers`, `tickets` — present in **both** locales |
| `lang` and `dir` on the document root | **Built** |
| The Vite/TypeScript/ESLint scaffold (Q-B) | **Built by `023`.** Q-B is answered, and not the way it guessed |
| `formatters.ts`, `UserText`, the plural-category work, the four lint rules, client parity test | **Not built.** No `formatters.ts` and no `UserText` exist anywhere in `src/wasl-web/` |

**The frontend lane owns `src/wasl-web/`.** What remains of the client half is therefore
*its* work to schedule, not this feature's to implement — this spec records the gap and the
criteria, and the lanes are told. AC-20 … AC-31 stay written for that reason; they are
criteria against the product, not a claim about who types them.

### Assumptions that are now known facts

| # | Was | Is |
|---|---|---|
| A-1 / Q-A | "assume `004` does not emit a language claim, and do not depend on it" | ~~"Confirmed: it does not."~~ **That line was wrong, and it was wrong in the way this project keeps recording: a document was believed over a measurement.** It was reasoned from ADR-005 listing only `sub`, `email`, `role`. **Decoding a real token says the opposite** — `004` shipped `SupportUser.PreferredLanguage`, its column, `ActorClaimTypes.PreferredLanguage`, and `"preferred_language":"ar"` in the seeded Manager's token. So the claim has a producer **today**, `005b` owns only the *switcher* that lets a user change it, and `005` added a duplicate constant beside the provider before noticing `004` already had one. Corrected in `Program.cs`'s neighbours, in the provider's own remarks, and here |
| Q-B | "assume `005` creates the React scaffold, and this needs a human to confirm" | **Answered by delivery.** `023` created it. The narrowing of `006` that Q-B worried about happened too: `006` was delivered **inside `023`** |
| A-6 | "assume ICU is available" | Untested still. AC-17 stands |

### New since this spec was written

| What | Consequence |
|---|---|
| `004b` gave the `401`/`403` **real bodies** (they were empty) and added `429 errors/rate-limited` | AC-11 and AC-12 gain a status to cover, and they are now *checkable* — there was previously no body to localize. **The denial bodies are produced by `AuthDenialResultHandler`, inside `UseAuthorization`**, which is precisely why the ordering in AC-12 is load-bearing |
| `002`'s `ResourceKeyLeakTests` and `MessageKeyCoverageTests` exist | Two guards already assert that no response field looks like a raw key and that every key-shaped literal in the source is in the catalogue. **Moving from a dictionary to `.resx` must keep both green**, and the second one's source of truth changes file |
| `ADR-010` was **rejected** — four projects, not two | The *Rules referenced* line citing ADR-010 for "two projects, so the `.resx` live in `Wasl.Api`" reaches the right answer through a decision that no longer holds. Corrected below |

### New open questions this revision raises

| # | Question | Working assumption |
|---|---|---|
All four were ruled on by the product owner, 2026-08-29. The rulings are below, not the
working assumptions they replaced.

| # | Question | **Ruling** |
|---|---|---|
| **Q-G** | Why does a `400` lose `Content-Language` when the culture *was* established? | **Leave it as a measured fact with no explanation, and make it the first task.** Not guessing was the right call. **And one condition: if the cause turns out to live outside `005`, come back before fixing it.** A localization feature that quietly repairs the exception handler is a feature nobody can review against what it promised |
| **Q-H** | Is moving `UseRequestLocalization()` before `UseAuthorization()` an addition to ADR-007, or a change to it? | **An addition.** ADR-007 constrains the order relative to `UseAuthentication()` only; nothing in it speaks to authorization. **And the measured reason is written beside it, in `Program.cs`:** `004b` gave the `401`/`403` bodies, those bodies are produced *inside* `UseAuthorization`, so this ordering is the only thing that makes them translatable. **Without that line somebody moves the registration back, because ADR-007 does not forbid it** |
| **Q-I** | Which layer answers a key that is in neither catalogue? | **Approved as assumed.** Neutral English `.resx` is the fallback; a key absent from both still returns the key rather than throwing, for the reason `002` gives — an exception thrown while building an error response turns a `409` into a `500` and loses the original failure |
| **Q-J** | Server-only, or one feature spanning both lanes? | **Server only.** The frontend is already connected by `023`. What remains in this scope — `PUT /api/me/language` and the switcher screen — is **`005b`, a named row on the board**, not a deferred line inside another feature's spec. *A feature that crosses the boundary makes both lanes wait for each other, and that costs more than two features do* |

---

## Understanding

ADR-007 decision 1 makes this a **when** decision rather than a how: one screen built
without i18n costs about thirty minutes to convert, seven cost a day, and the conversion
is mechanical work in which omissions hide. This feature therefore builds both halves of
the localization mechanism before the first screen exists — the server side that resolves
a culture and localizes what it authors, and the client side that renders in a direction,
a plural category, and a numeral system.

Nothing here is user-visible. There is no switcher, no stored preference, and no screen
to look at. What exists at the end is a request that can be asked for in Arabic and
answered in Arabic, a build that fails when two catalogues diverge, and a frontend in
which a hard-coded string, a concatenated count, and a physical CSS property are each a
build error rather than a review finding.

Three of its facts fail **silently**, which is why each carries its own criterion rather
than being trusted:

| Fails silently | Symptom | Criterion |
|---|---|---|
| `UseRequestLocalization()` registered before `UseAuthentication()` | The claim provider sees no user, returns nothing, and every user is served in whatever their browser guessed — forever, with no error anywhere (ADR-007 decision 4) | AC-1, AC-2 |
| `Content-Language` never written | A client that asked for `fr` cannot tell it got English. `RequestLocalizationOptions.ApplyCurrentCultureToResponseHeaders` defaults to **false** (`research.md` R-4) | AC-11 |
| `IStringLocalizer` looking in the wrong place | Every lookup returns the key itself. `Error.DuplicateCustomer.Email` renders to the user as `Error.DuplicateCustomer.Email`, which reads as a missing translation rather than a misconfigured resource path (`research.md` R-2) | AC-16 |

## In scope

### Backend

- `IStringLocalizer<SharedResource>` over `.resx` in `src/Wasl.Api/Common/Localization/`,
  the resources sitting next to the code that raises the messages (`research.md` R-1)
- Symbolic keys — `Error.DuplicateCustomer.Email` — with an **explicit English catalogue**
  as well as an Arabic one (ADR-007 decision 5), the English one doubling as the CLR
  neutral-culture fallback that BR-8.12 requires (`research.md` R-3)
- `RequestLocalizationMiddleware` registered **after `UseAuthentication()` and before
  `UseAuthorization()`**. The second half of that sentence is ours, not ADR-007's, and it
  is what makes a `401` and a `403` localized as well (`research.md` R-5)
- `PreferredLanguageCultureProvider`, a custom `RequestCultureProvider` reading the
  language claim that ADR-007 decision 4 places in the JWT
- The BR-8.4 resolution order as an explicit three-provider list: `?culture=` → the claim
  → `Accept-Language` → `en`. The framework's default list is **replaced**, not appended
  to, because it contains a cookie provider that would outrank the header without
  appearing anywhere in BR-8.4 (`research.md` R-6)
- `Content-Language` on **every** response, naming the locale actually applied — success
  and failure paths alike
- `ar-EG` resolving to `ar` (BR-8.2); `fr` falling back to `en` with a **`200`, never a
  `400`** (BR-8.3, FR-5.8)
- The supported-culture list as **configuration**, so a third locale is a resource file
  and a config entry (NFR-9)
- The **resource key-parity test that fails the build** when the two catalogues diverge
  (BR-8.11, NFR-8), with the runtime English fallback that BR-8.12 asks for underneath it
- Assertions that the machine-readable half of every response is byte-identical across
  locales (BR-8.7) and that log output stays English (BR-8.9)

### Frontend

> **Revised 2026-08-29 — see Q-J.** `023-frontend-foundation` shipped the first two bullets
> while this spec sat in the queue, and `src/wasl-web/` belongs to the frontend lane. The
> remaining bullets are **criteria against the product, handed to that lane in writing** —
> not work this feature types. Kept here rather than moved, so the client and server halves
> of BR-8 stay readable in one place; who builds them is Q-J.

- ~~The `react-i18next` layer: JSON catalogues per locale under
  `src/wasl-web/src/locales/{en,ar}/`, initialised before the first render~~ — **built by
  `023`.** Four namespaces, both locales
- ~~`lang` and `dir` on the document root, set once from the active locale (ADR-007
  decision 6)~~ — **built by `023`**
- All six CLDR plural categories for Arabic — `zero one two few many other` — and the ban
  on string concatenation around a number, **caught by lint, not by review** (BR-8.14,
  ADR-007 decision 9)
- `dir="auto"` on every element rendering user content, via a `UserText` primitive, so it
  is the default path rather than something remembered (ADR-007 decision 8, BR-8.10)
- `ar-u-ca-gregory-nu-latn`: Gregorian calendar and **Latin digits** in Arabic, in one
  `formatters.ts` that is the only place an `Intl` formatter is constructed (BR-8.13,
  ADR-007 decision 7)
- Lint rules that fail the build on a literal string in JSX, concatenation around `t()`
  or a count, a physical CSS property, and an inline `toLocaleString` or `Intl.*` outside
  `formatters.ts`
- The client catalogue parity test, and `Accept-Language` written once in the shared API
  client rather than per call

## Out of scope

| Excluded | Where it lives |
|---|---|
| The language **switcher** — the control a user clicks | `014-language-preference-and-rtl`. This feature builds the mechanism; `014` exposes the choice |
| `PUT /api/me/language`, the `PreferredLanguage` column, and its migration | `014` (migration `AddSupportUserPreferredLanguage`) |
| Issuing the language claim into the JWT | `004-auth-and-roles`. This feature **reads** the claim; see Q-A |
| The Arabic walk of every screen, and RTL defect fixing | `014` — a deliberate deliverable there, not a check (`specs/README.md`, Phase 4) |
| Design tokens, `Button`, `Input`, `Badge` | `006-design-system` — **which was itself delivered inside `023`.** The narrowing Q-B feared happened, and it happened in the other lane |
| Emitting a `preferred_language` claim into the JWT | `004`, and **it does not** (confirmed by delivery). This feature reads the claim if present and falls through if absent; `014` is where the claim gets a real producer, alongside the column that feeds it |
| Localizing `Retry-After`, `Location`, or any other header value | Nowhere. `Content-Language` is the only header this feature writes. A header carrying a number or a URL is machine-read (BR-8.7) |
| Translating user-entered content | Nowhere. Never (BR-8.10, FR-5.7, `00-project-context.md`) |
| Locales beyond `en` and `ar` | Nowhere. Two prove the mechanism; NFR-9 makes a third configuration, and AC-19 tests that claim without shipping one |
| Hijri calendar; Arabic-Indic digits | Nowhere. Rejected in ADR-007 decision 7 |
| Arabic search normalisation (alif/hamza folding) | `docs/sdd/11-open-questions.md` Q-7 — deferred with reasoning |
| Localizing log messages or audit content | Nowhere. BR-8.9 and BR-9.10 forbid it; AC-18 proves it |
| Translating `checks[].description` on `GET /health` | Already decided in `001/contracts/health-api.md`: consumed by machines, stays English |

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | `004-auth-and-roles` places the preferred language in the JWT as a claim, per ADR-007 decision 4. ADR-005 names only `sub`, `email`, and `role`, so the claim is an ADR-007 addition that `004` must honour | The provider still compiles and still falls through to `Accept-Language` — which is exactly the **silent** failure this feature exists to prevent. AC-5 is therefore tested with a token minted **inside the test**, so the ordering is proven now rather than in `014` when the claim first has a real producer |
| A-2 | The claim name is `preferred_language` | One constant in `LocalizationClaims.cs`. If `004` names it differently, that constant changes and nothing else does — which is why it is a constant and not a literal inside the provider |
| A-3 | Neutral `ar` is sufficient; no `ar-SA` or `ar-EG` catalogue is needed | A regional catalogue is an added culture and an added `.resx`, not a redesign (BR-8.2, NFR-9). `research.md` R-7 records that this was checked and does not matter |
| A-4 | Arabic copy in the catalogues is written by someone who reads Arabic | Machine-translated interface copy in a support tool reads as unserious. Recorded because it is a delivery risk rather than a code risk (US-014 A-3) |
| A-5 | Catalogues are small enough to bundle into the JavaScript build rather than be fetched per locale | If Arabic ever ships megabytes of copy, lazy loading is an i18next backend plugin plus a loading state. `research.md` R-12 rejects it **now** because it would add a loading state to every screen for two small files |
| A-6 | ICU is available to the runtime — `InvariantGlobalization` is not enabled anywhere | Every culture collapses to invariant, `ar` formats like `en`, and nothing throws. AC-17 asserts it rather than assuming it |

## Open questions

| # | Question | Working assumption |
|---|---|---|
| Q-A | `005` comes after `004` in Phase 0, but does `004` actually emit the language claim, given that ADR-005 lists only `sub`, `email`, `role`? | Assume **not yet**, and do not depend on it. The provider reads the claim if present and falls through if absent; the test mints its own token. `DOC-005-04` raises the claim as a requirement against `004`'s spec instead of assuming it silently |
| Q-B | Which feature scaffolds the React application? `001`'s out-of-scope table says "the React application, tokens, primitives → `006`", but this feature has frontend work, and `006` builds primitives that must already have `t()` available | Assume **`005` creates the scaffold** — Vite, TypeScript, ESLint, Stylelint, the i18n layer — and `006` adds tokens and primitives on top of an app in which a hard-coded string is already a build error. That is precisely the ordering ADR-007 decision 1 argues for. **This narrows what `001` said `006` would do and needs a human to confirm it** (`research.md` R-10) |
| Q-C | `UserText` is a primitive, and `006` owns primitives. Does it belong here? | Ship it here. It is localization infrastructure with no visual design in it, and ADR-007 decision 8 is only structural if the easy path exists on the day the first screen is written. Recorded as a deliberate narrowing of `006`, not an accident |
| Q-D | Is `Content-Language` written by `RequestLocalizationOptions.ApplyCurrentCultureToResponseHeaders`, or by our own middleware? | Use the built-in option if it exists in .NET 10; otherwise an eight-line middleware setting the header inside `OnStarting`. AC-11 is the same observable either way, so the answer changes one file and no criterion (`research.md` R-4) |
| Q-E | Where do the two parity tests live, given that the integration project needs Docker and Docker is not running on this machine (`001/research.md` R-8)? | In `Wasl.Api.IntegrationTests`, in classes that take **no** database fixture, so they run with no container. A build-failing test that cannot run on the machine that must not break the build is not a control |
| Q-F | Should `?culture=` be suppressed in production? | No. BR-8.5 says it exists for testing and for sharing a link in a known language, and it can only select from the supported list, so the worst it does is pick the other locale. Recorded so the question is not reopened later as a security finding |

## Acceptance criteria

### Culture resolution and pipeline order

| # | Criterion |
|---|---|
| AC-1 | With a token whose language claim is `ar` and a request header of `Accept-Language: en`, the response body is Arabic and `Content-Language: ar`. This is the **only** observable that distinguishes correct middleware order from the default template's order: with localization before authentication the claim is invisible and the response is English (ADR-007 decision 4) |
| AC-2 | A source-level guard test fails the build if the order of `UseAuthentication()`, `UseRequestLocalization()`, and `UseAuthorization()` in `Program.cs` is not exactly that. It is crude — it reads the file as text — and it is kept because the built pipeline exposes no inspectable order (`research.md` R-11) |
| AC-3 | The configured `RequestCultureProviders` list is exactly three entries in exactly this order: query string, preferred-language claim, `Accept-Language`. `CookieRequestCultureProvider` is **absent**, asserted by type name |
| AC-4 | `?culture=ar` beats both an `en` claim and an `en` header (BR-8.4, BR-8.5) |
| AC-5 | With no `?culture=`, an `ar` claim beats an `en` header (BR-8.5) |
| AC-6 | With no `?culture=` and no claim, `Accept-Language: ar` is applied |
| AC-7 | With no `?culture=`, no claim, and no header, `en` is applied |
| AC-8 | `Accept-Language: ar-EG` and `?culture=ar-SA` both resolve to `ar`, return `200`, and carry `Content-Language: ar` (BR-8.2) |
| AC-9 | `Accept-Language: fr` and `?culture=fr` both return **`200`**, English content, and `Content-Language: en`. Asking for a language the system does not speak is not a client error (BR-8.3, FR-5.8) |
| AC-10 | A malformed `Accept-Language` (`!!!`, `;q=`, empty) is ignored, falls through to the next source, and never produces a `400` |
| AC-11 | Every response carries `Content-Language` naming the locale actually applied — asserted on a `200`, a `400`, a `401`, a `403`, a `404`, a `409`, a `429` and a `500`. **Measured 2026-08-29: the `200`s pass today and every error status fails**, so this criterion is not speculative and its negative control already exists |
| AC-12 | A `401` and a `403` carry `Content-Language` and a localized `title`. That is true only because localization sits **before** `UseAuthorization()`, which is where both responses are produced — by `004b`'s `AuthDenialResultHandler`. **Moving the registration back is the negative control**, and it must be run and recorded, because this is the failure ADR-007 calls the most likely defect in the build and it produces no error of any kind |
| **AC-12b** | `429 errors/rate-limited` (`004b`) carries `Content-Language` and a localized `title`, and its `Retry-After` header is **unchanged** by locale. A number of seconds is not a translatable string |
| **AC-12c** | The `title` under `errors/unauthenticated` is localized in **both** of its two forms — the challenge (`Error.Unauthenticated.Title`) and the failed sign-in (`Error.Auth.InvalidCredentials.Title`). `004b` recorded that one `type` carries two titles and that shipping the wrong one is invisible; two locales is where that doubles |
| AC-19 | Adding a third culture requires no code change: a test host configured with `en`, `ar`, `fr` in `Localization:SupportedCultures` answers `?culture=fr` with `Content-Language: fr` and English text. The list is configuration, which is what NFR-9 actually claims |

### Catalogues, keys, and what is never translated

| # | Criterion |
|---|---|
| AC-13 | For one request issued twice — once `en`, once `ar` — `ProblemDetails.type`, every **key** of `errors`, every enum value, `traceId`, and `TicketNumber` are byte-identical between the two responses, while `title`, `detail`, and the `errors` **values** differ (BR-8.6, BR-8.7) |
| AC-14 | A key present in `SharedResource.resx` and absent from `SharedResource.ar.resx`, or the reverse, **fails the build**. An entry whose value is empty or whitespace counts as absent (BR-8.11, NFR-8) |
| AC-15 | A key present in English and absent from Arabic resolves at runtime to the **English sentence**, never to the raw key (BR-8.12), proven with the one documented parity-exempt probe key |
| AC-16 | For every key in the shipped catalogues, in both cultures, `LocalizedString.ResourceNotFound` is `false`. A misconfigured resource path returns the key as its own value, which reads as a missing translation rather than a broken lookup (`research.md` R-2) |
| AC-17 | `CultureInfo.GetCultureInfo("ar").Name` is `"ar"`, and the Arabic name of month 8 is Arabic text. This fails if `InvariantGlobalization` is enabled or ICU is trimmed away — a change that silently makes Arabic format like English |
| AC-18 | A request sent with `Accept-Language: ar` that produces a logged warning writes that log entry in **English** (BR-8.9) |
| AC-28 | A key present in `locales/en/*.json` and absent from `locales/ar/*.json`, or the reverse, fails the frontend build, per namespace. An empty-string value counts as absent (BR-8.11) |
| AC-29 | A key missing from both catalogues renders the English fallback and **never the raw key**; `returnEmptyString` is `false`, so an empty catalogue entry does not render as blank text (BR-8.12) |
| AC-32 | Both parity tests run in CI, and a deliberately introduced divergence fails the pipeline — observed on a real run, not inferred from the workflow file (NFR-8) |

### Direction, plurals, and numerals

| # | Criterion |
|---|---|
| AC-20 | Setting the locale to `ar` puts `lang="ar"` and `dir="rtl"` on the document root; setting it back to `en` restores `lang="en"` and `dir="ltr"` with no residual attribute (FR-5.4) |
| AC-21 | With the Arabic catalogue, counts of 0, 1, 2, 3, 11, and 100 select the `zero`, `one`, `two`, `few`, `many`, and `other` forms respectively. This fails if `compatibilityJSON: 'v3'` is configured, which silently switches the suffixes to `_0`…`_5` (BR-8.14, `research.md` R-9) |
| AC-22 | Lint fails on a literal user-facing string in JSX (FR-5.2, BR-8.8) |
| AC-23 | Lint fails on concatenation around a translated string or a count, with a message naming the plural form to use instead (BR-8.14) |
| AC-24 | Lint fails on a physical CSS property: `margin-left`, `padding-right`, `left`, `right`, `text-align: left`, `border-left` (ADR-007 decision 6) |
| AC-25 | Lint fails on `toLocaleString`, `toLocaleDateString`, `toLocaleTimeString`, or an `Intl.*` constructor used anywhere outside `src/lib/i18n/formatters.ts` |
| AC-26 | `formatDate` and `formatNumber` under `ar` return strings containing **no** character in `U+0660–U+0669` or `U+06F0–U+06F9`, and the Arabic rendering of `2026-08-23` is the Gregorian date, not a Hijri one (BR-8.13, ADR-007 decision 7) |
| AC-27 | The string `TCK-2026-000042` renders byte-identical under `en` and `ar` (BR-8.13) |
| AC-30 | `UserText` renders `dir="auto"`. An Arabic string inside an `ltr` document and an English string inside an `rtl` document each resolve their own direction (ADR-007 decision 8, BR-8.10) |
| AC-31 | Every request leaving the shared API client carries `Accept-Language` matching the active locale, set in one place. A `Content-Language` that disagrees with what was asked for is surfaced in development rather than swallowed |

## Edge cases

| Case | Expected |
|---|---|
| `Accept-Language: ar;q=0.9, en;q=0.8` | `ar`. Quality values are the framework parser's job, not ours |
| `Accept-Language: en-GB, ar;q=0.5` | `en`. Parent-culture fallback resolves `en-GB` to `en`, and it wins on quality |
| `Accept-Language` absent entirely | Claim if present, else `en` |
| `Accept-Language: !!!` or `;q=` | Ignored, falls through, `200`. Never a `400` |
| Claim value `de` — supported by nobody | The provider returns it, the supported-culture filter rejects it, resolution falls through to `Accept-Language`. Not a `400`, not a `500` |
| Claim value `AR` — wrong case | Resolves to `ar`. Culture matching is case-insensitive, and a token minted elsewhere must not break a request by capitalisation |
| Claim value `""` or whitespace | Treated as absent. Falls through |
| Claim value `ar-EG` | Resolves to `ar` (BR-8.2) |
| Two language claims on one token | The first is used and the request still succeeds. A malformed token is `004`'s problem; localization must not turn it into a `500` |
| **Unauthenticated** request, no token at all | Localizes from `?culture=` then `Accept-Language`. The `401` itself is localized — the user who cannot read English is exactly the one who needs it translated |
| **Expired or invalid token** | `HttpContext.User` is unauthenticated, so there is no claim; falls through to the header. The `401` still carries `Content-Language` (AC-12) |
| A `403` from a role check (BR-6) | Localized `title`, untranslated `type`. The permission decision is not locale-dependent; the sentence about it is |
| `?culture=` present with no value | Ignored, falls through. Not a `400` |
| `?culture=ar&culture=en` | The framework takes the first; the request succeeds either way. Not worth a rule |
| An unhandled exception under `Accept-Language: ar` | `500` with an Arabic `title`, an English log entry, and no stack trace in `detail` (BR-8.9, `05-api-conventions.md`) |
| A key added to `.resx` and not to `.ar.resx` | The build fails (AC-14). It never reaches a user, and if the test were deleted it would render English (AC-15) |
| A `.resx` value that is empty | Counts as a missing key. An empty translation renders as blank text, which reads as a layout bug and survives review |
| Arabic text stored in the database and returned in an `en` response | Returned verbatim, rendered with `dir="auto"` (BR-8.10, FR-5.7). The interface language never touches user content |
| A counted noun at `count: 0` in Arabic | Uses the `zero` form. English has no `zero` form, so the English catalogue legitimately omits it — the parity test must compare plural **stems**, not suffixed keys, or it reports a false divergence (`research.md` R-9) |
| Arabic label longer than its English original | Not a defect here — there is no screen. It is `014`'s deliverable, recorded so the omission is visibly deliberate |

## Rules referenced

- **FR-5.1 – FR-5.8** — two locales; everything translatable; server messages in the
  caller's locale; RTL; persistence (`014`); locale formatting; user content verbatim;
  unsupported locale falls back
- **BR-8.1 – BR-8.14** — in full. This feature is BR-8's implementation
- **BR-9.10** — audit content is English regardless of request locale
- **NFR-8** — catalogues stay in step, enforced by an automated test in CI
- **NFR-9** — a third locale is a resource file and a registered culture, no code change
- **ADR-007** — all nine decisions; decision 4's ordering constraint is this feature's
  centre of gravity
- **ADR-005** — the JWT and its claims; the language claim is ADR-007's addition to it
- ~~**ADR-010** — two projects, so the `.resx` live in `Wasl.Api` rather than in the third
  project ADR-007 assumed (`research.md` R-1)~~ — **ADR-010 was rejected; the solution is four
  projects (ADR-002).** The conclusion survives and the reason does not: the `.resx` live in
  `Wasl.Api` because that is where `IProblemMessageSource` and its one consumer
  `ProblemDetailsFactory` live, and because `Wasl.Application/Resources/` is reserved by
  `CLAUDE.md` for messages the **Application layer** authors — of which there are currently
  none, since every sentence in the product is a `ProblemDetails` title or a validation
  message resolved at the API edge. **If a handler ever authors a sentence, it gets its own
  catalogue in `Wasl.Application` rather than reaching across the boundary.**
- **ADR-011 §4** — three kinds of component, one of which fetches
- **US-014** — the story that consumes this, and the owner of everything a user touches
