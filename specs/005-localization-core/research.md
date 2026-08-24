# 005 — Research

Questions that had to be answered before the plan could be written, what was checked,
and what each settled. A question that turned out not to matter is recorded as such,
because "we looked and it did not matter" is information too.

Where a framework API is named below, it was **verified against the .NET 10 reference
assembly on this machine**, not recalled:

```text
C:\Program Files\dotnet\packs\Microsoft.AspNetCore.App.Ref\10.0.9\ref\net10.0\
  Microsoft.AspNetCore.Localization.xml
  Microsoft.Extensions.Localization.xml
  Microsoft.Extensions.Localization.Abstractions.xml
```

That is the whole point of the exercise: ADR-007 was written against a four-project
layout that no longer exists, and AI-assisted work fails by referencing plausible APIs
that do not (constitution VI).

---

## R-1 · Where do the `.resx` files live, now that `Wasl.Application` does not exist?

**The conflict:** ADR-007 decision 2 and `documentation/development/localization.md` both
name `src/Wasl.Application/Resources/SharedResource.{en,ar}.resx`. ADR-010 has **two**
projects: `Wasl.Domain` and `Wasl.Api`. There is no `Wasl.Application`.

**Options weighed:**

| Option | Cost |
|---|---|
| A third project, `Wasl.Application`, holding only resources | Contradicts ADR-010 for one folder of XML. The same argument that rejected an `IOC` project in `001/research.md` R-7 applies |
| `Wasl.Domain/Resources` | `Wasl.Domain` has **zero** package references, ever. `IStringLocalizer` lives in `Microsoft.Extensions.Localization.Abstractions`, which is a package reference. Non-starter |
| One `.resx` pair per slice, beside the handler that raises the message | Attractive, and it makes "next to the code that raises the messages" literal. Rejected: the duplicate-customer message is raised by a validator, a handler, **and** the `ProblemDetails` mapper from `002`, so it has no single owning slice — and a parity test over N shifting file pairs is a test that gets disabled |
| `src/Wasl.Api/Common/Localization/` | One pair of files, in the same cross-cutting folder as the middleware that resolves the culture and the `ProblemDetails` mapper that consumes it |

**Settled:** `src/Wasl.Api/Common/Localization/SharedResource.{,ar}.resx`, alongside
`Common/{Persistence,Behaviors,Auth,Errors,Health}` — the layout `CLAUDE.md` already
prescribes. ADR-007's *intent* ("resources next to the code that raises the messages") is
satisfied at the granularity ADR-010 actually has.

**Consequence:** `DOC-005-03` corrects the path in
`documentation/development/localization.md`. It is one line, and leaving it wrong means
the next person creates `Wasl.Application` because the documentation told them to.

---

## R-2 · The `ResourcesPath` trap — why every lookup can silently return the key

**Checked:** `Microsoft.Extensions.Localization.xml` in the .NET 10 ref pack.

- `LocalizationOptions.ResourcesPath` — *"The relative path under application root where
  resource files are located."*
- `ResourceManagerStringLocalizerFactory.GetResourcePrefix(location, baseName, resourceLocation)`
  — *"Gets the resource prefix used to look up the resource."*

The factory **composes** the lookup name from the root namespace, the `ResourcesPath`, and
the type's own namespace-relative name. So with the marker type at
`Wasl.Api.Common.Localization.SharedResource` **and** `ResourcesPath = "Common/Localization"`,
the factory looks for
`Wasl.Api.Common.Localization.Common.Localization.SharedResource` — a resource that does
not exist.

**What that failure looks like:** nothing throws. `IStringLocalizer` returns a
`LocalizedString` whose `Value` is the key and whose `ResourceNotFound` is `true`. The
user sees `Error.DuplicateCustomer.Email` in the UI and it reads as a missing
translation, so the fix attempted is "add the Arabic string" — which does not help.

**Settled:** **do not set `ResourcesPath` at all.** `builder.Services.AddLocalization()`
with no options, and the `.resx` files physically beside `SharedResource.cs` so the
resource name is derived from the type's own namespace. One rule, no composition.

**Rejected:** `[assembly: ResourceLocation("Common/Localization")]` — verified to exist
(`Microsoft.Extensions.Localization.ResourceLocationAttribute`) and it works, but it puts
the resource layout in an assembly attribute far from the files it describes. Same for
`RootNamespaceAttribute`, which is only needed when the assembly name and the root
namespace differ; here they are both `Wasl.Api`.

**Consequence:** **AC-16** asserts `ResourceNotFound == false` for every shipped key in
both cultures. That single assertion is the whole defence against this class of
misconfiguration, and it costs one test.

---

## R-3 · An explicit `en` catalogue, and the BR-8.12 fallback chain

**The requirement pair, and the tension between them:**

- ADR-007 decision 5 wants an **explicit English catalogue**, not English-text-as-key
- BR-8.12 wants a missing translation to fall back to **the English string, never the
  raw key**

**What was checked:** how `ResourceManager` resolves a missing entry. The chain is
`ar` → *neutral* (the `.resx` with no culture suffix) → not found. There is no step in
that chain that consults `SharedResource.en.resx`; `.en.resx` is a specific culture like
any other, and `ar` does not fall back to it.

| Layout | Missing `ar` key resolves to |
|---|---|
| `SharedResource.en.resx` + `SharedResource.ar.resx`, no neutral file | **The raw key.** Violates BR-8.12 |
| Neutral + `.en.resx` + `.ar.resx` | The neutral value. Correct — but two English catalogues that can diverge silently, which is the same defect ADR-007 decision 5 was trying to avoid |
| Neutral (English) + `.ar.resx` | The English value. Correct, one English file |

**Settled:** `SharedResource.resx` holds English and **is** the explicit English
catalogue; `SharedResource.ar.resx` holds Arabic; `[assembly: NeutralResourcesLanguage("en")]`
says so in the metadata rather than by convention. ADR-007 decision 5's substance — keys
are symbolic, English is a maintained catalogue and not an accident of the code — holds
exactly as written. Only the file name differs from the ADR's example.

**How the fallback is proven rather than assumed:** the parity test would prevent any
divergence from ever shipping, which also makes BR-8.12 untestable using real keys. So
the English catalogue carries exactly one key, `Diagnostics.FallbackProbe`, documented in
the contract, exempt from parity by name, and referenced only by the test that asserts
AC-15. One deliberate exemption, written down, beats a rule that cannot be demonstrated.

---

## R-4 · How is `Content-Language` actually written?

**Checked:** `Microsoft.AspNetCore.Localization.xml`. The property exists in .NET 10:

> `RequestLocalizationOptions.ApplyCurrentCultureToResponseHeaders` — *"Gets or sets a
> value that determines if `CultureInfo.CurrentUICulture` is applied to the response
> `Content-Language` header."*

It is an auto-property with no initializer and was added as a non-breaking change, so it
is **off unless set**. That is the silent failure: everything about localization works,
and a client asking for `fr` has no way to learn it was served `en`.

**Settled:** set it to `true`, one line in `LocalizationRegistration.cs`.

**Rejected:** our own `ContentLanguageMiddleware`. It would need `OnStarting` to write a
header before the response begins, it would need to sit in the right place relative to
the localization middleware, and it would duplicate a framework feature that verifiably
exists. Kept as the documented fallback if the built-in option ever proves not to cover
the `401`/`403` paths (AC-12 is what would reveal that).

**Not delegated to the option:** the *assertion*. AC-11 checks the header on seven status
codes, because "the option is set" and "the header is on the `401`" are different claims
and only the second one matters.

---

## R-5 · Where exactly does `UseRequestLocalization()` go?

ADR-007 decision 4 says *after* `UseAuthentication()` and explains why: the claim
provider needs a resolved `HttpContext.User`, and the default template puts localization
first, where the provider silently returns nothing.

**What ADR-007 does not say, and what was checked:** which middleware actually emits the
`401` and the `403`. `UseAuthentication()` only *populates* `HttpContext.User`; it does
not reject. The challenge and the forbid are emitted by the **authorization** middleware
and by endpoint filters that run after it.

**Consequence, and it is a requirement rather than a nicety:** if localization is placed
after `UseAuthorization()` — which still satisfies the letter of ADR-007 decision 4 —
then every `401` and `403` is produced *before* the culture is resolved. Those two
responses carry no `Content-Language` and an English `title`, in the one situation where
the user most needs to be told what happened in a language they read.

**Settled:** the order is exactly

```text
UseAuthentication()      →  UseRequestLocalization()  →  UseAuthorization()
```

and it is asserted twice: behaviourally by AC-1 and AC-12, and as a text guard over
`Program.cs` by AC-2.

`001/plan.md` already reserved this constraint under "Reserved for later, deliberately
not added now". This narrows it from "after authentication" to "between the two", and the
narrowing is the finding.

---

## R-6 · The default provider list contains a cookie provider that BR-8.4 does not mention

**Checked:** `RequestLocalizationOptions.RequestCultureProviders` — *"An ordered list of
providers used to determine a request's culture information. The first provider that
returns a non-`null` result for a given request will be used. Defaults to the
following: 1. `QueryStringRequestCultureProvider` 2. `CookieRequestCultureProvider`
3. `AcceptLanguageHeaderRequestCultureProvider`."*

**The hazard:** BR-8.4 defines four sources and a cookie is not one of them. Left in
place, a stale `.AspNetCore.Culture` cookie — trivially set by anything, including a
browser extension or an earlier experiment — outranks both the user's stored preference
and `Accept-Language`, and BR-8.5's reasoning ("a stored preference is a deliberate
choice, the header is the browser's guess") is quietly inverted. Nothing errors.

A second hazard: `Insert(1, new PreferredLanguageCultureProvider())` **appends into** the
default list rather than replacing it, so the cookie provider survives at position 2 and
still outranks the header. This is the natural way to write it and it is wrong.

**Settled:** `options.RequestCultureProviders.Clear()` and then add the three, in order.
**AC-3** asserts the list is exactly three entries in that order and that
`CookieRequestCultureProvider` is absent **by type name** — a test that reads like
paranoia and costs four lines.

---

## R-7 · Does `ar-EG` → `ar` need anything? — *it turned out not to matter*

**Checked:** `FallBackToParentCultures` and `FallBackToParentUICultures` — *"Defaults to
`true`"* — with the remark *"the parent culture check is done using only the culture
name."*

**Settled:** nothing to build. With `SupportedCultures = [en, ar]`, a request for `ar-EG`
resolves to `ar` by parent fallback, and `en-GB` to `en`. BR-8.2 is satisfied by two
default values.

**Rejected:** adding `ar-SA`, `ar-EG`, `en-GB` to the supported list "to be explicit". It
adds cultures whose catalogues then have to exist and stay in parity, in exchange for
behaviour that is already correct.

**Recorded anyway**, because the defaults are the load-bearing part: if someone sets
`FallBackToParentUICultures = false` while tightening something, `ar-EG` starts resolving
to `en` and BR-8.2 breaks with no error. **AC-8** is the tripwire.

---

## R-8 · Invariant globalization — the setting that makes Arabic format like English

**The concern:** `InvariantGlobalization=true` is a common addition to container-targeted
projects, and `PredefinedCulturesOnly=true` is its companion. Under invariant mode,
`CultureInfo.GetCultureInfo("ar")` does not throw — it returns a culture whose formatting
is invariant. Dates, numbers, and month names all come out English-shaped.

**Checked:** `001/plan.md` and the `Directory.Build.props` it specifies. Neither sets it
today, which is the good case — and precisely the case that changes silently when someone
publishes trimmed or self-contained later.

**Settled:** **AC-17** asserts `CultureInfo.GetCultureInfo("ar").Name == "ar"` and that
the Arabic name of month 8 is Arabic text. This is a two-line test in the class that
takes no database fixture, so it runs on a machine with no Docker.

---

## R-9 · Arabic plurals in `react-i18next`, and the parity test's false positive

**Two things were checked.**

**First, the suffix scheme.** i18next selects plural forms through
`Intl.PluralRules` and writes the CLDR category names as suffixes — `_zero`, `_one`,
`_two`, `_few`, `_many`, `_other`. Setting `compatibilityJSON: 'v3'` switches it to the
legacy numeric scheme, `_0` … `_5`. A catalogue authored with the named suffixes under a
`v3` configuration resolves **nothing** for Arabic and falls back to the singular for
every count. Nothing errors, and the Arabic is grammatically wrong for most values of
`n`. **AC-21** asserts the six categories at counts 0, 1, 2, 3, 11, 100 — the values in
`docs/sdd/testing/test-matrix.md` for US-014 — which fails under `v3`.

**Second, a false positive in the parity test.** Arabic has six categories; English has
`_one` and `_other`. A naive key-set comparison reports four missing Arabic keys — or,
worse, four *extra* ones — for every correctly translated plural. Someone then "fixes" it
by adding `_two`/`_few`/`_many` to English, which is wrong English, or by exempting
plurals from parity, which is worse.

**Settled:** the client parity test compares **stems**. A key ending in a CLDR category
suffix is reduced to its stem, and a stem is required to exist in both catalogues with a
category set that is *valid for that locale* — two for `en`, six for `ar`. This is the
single non-obvious piece of logic in the whole feature and it is the reason `FE-005-08`
is its own task rather than a line inside another one.

---

## R-10 · Who scaffolds the React application — `005` or `006`?

**Checked:** `001/spec.md` (out of scope: *"The React application, tokens, primitives →
`006-design-system`"*), `specs/README.md` Phase 0 (`005` before `006`), ADR-009 (`006` is
**one day, hard stop**), ADR-007 decision 1 (i18n before the first screen).

**The tension is real.** `006` builds `Button`, `Input`, and `Badge`. Those are components
with text in them. If the app is scaffolded in `006`, then either the primitives are
built before the lint rule that bans literal strings exists, or `005` has no frontend at
all and ADR-007 decision 1 is not implemented on the client until `014` — which is the
retrofit the ADR exists to prevent.

**Settled, as a working assumption needing human confirmation (`spec.md` Q-B):** `005`
creates the scaffold — Vite, TypeScript, ESLint, Stylelint, Vitest, the `lib/i18n` layer —
and `006` creates tokens and primitives inside it. `006` keeps its one-day budget for
design work instead of spending part of it on `npm create vite`, and every primitive it
writes is written in an app where a hard-coded string already fails the build.

**Rejected:** moving this feature's entire frontend half into `006`. It would put the
whole client side of localization inside a hard-stopped one-day timebox, behind the
tokens, which is where it gets cut.

---

## R-11 · Can middleware order be asserted structurally?

**Checked:** whether the built pipeline can be enumerated. `IApplicationBuilder` exposes
`Use` and `Build`; the composed chain is a closure. There is no public surface that lists
what was registered, in order, after the fact.

**Settled: two tests, neither pretending to be the other.**

| Test | What it actually proves |
|---|---|
| Behavioural (AC-1): claim `ar` + header `en` ⇒ Arabic body, `Content-Language: ar` | The order is right **for the reason that matters**. This is the real control |
| Source guard (AC-2): read `Program.cs` as text, assert the line index of `UseAuthentication` < `UseRequestLocalization` < `UseAuthorization` | Someone reordering the pipeline gets a red test naming ADR-007 decision 4, instead of a green suite and a defect that surfaces in `014` |

**Rejected:** reflection over `ApplicationBuilder`'s private middleware list. It works
today and breaks on a framework patch, and a test that goes red for unrelated reasons
teaches the team to delete tests.

The source guard is crude and it is written down as crude. It is also the only thing that
turns "the most likely defect in this piece of work" (ADR-007) into a build failure
rather than a paragraph in an ADR.

---

## R-12 · Should catalogues be lazy-loaded per locale? — *rejected*

**Checked:** the size of what is being shipped. Two locales; `common.json` at roughly
twenty keys in this feature and a few hundred at project end.

**Settled:** bundle both catalogues statically, imported by `lib/i18n/index.ts`.

**Rejected:** `i18next-http-backend`. It adds a network fetch before the first render,
which means either a flash of untranslated content or a loading gate on the whole
application, plus a failure mode ("the catalogue 404s in production") that static imports
cannot have. For two small files this is cost with no benefit. If Arabic ever ships
megabytes of copy, this is one plugin and a suspense boundary — recorded in `spec.md` A-5.

---

## R-13 · Which lint rules exist, and what do they hang off?

**Checked:** what each ban in ADR-007 needs in order to be a build failure rather than a
review note.

| Ban | Rule | Confidence |
|---|---|---|
| Literal user-facing string in JSX (BR-8.8) | `react/jsx-no-literals` from `eslint-plugin-react` | Exists; needs an allow-list for punctuation and non-copy strings, or it becomes noise and gets disabled |
| Concatenation around a count (BR-8.14) | `no-restricted-syntax`, targeting a `BinaryExpression[operator='+']` with a `t(...)` call or a numeric identifier on either side, and a `TemplateLiteral` containing a `t(...)` call | Core ESLint rule, custom selector. The selector is the work, not the rule |
| Physical CSS properties (ADR-007 decision 6) | `stylelint` `property-disallowed-list` plus `declaration-property-value-disallowed-list` for `text-align: left\|right` | Exists. **Depends on how `006` styles things** — if `006` chooses a utility framework or CSS-in-JS, the same ban moves host. The intent is fixed; the host is not, and that is recorded rather than assumed |
| Inline `Intl` / `toLocaleString` outside `formatters.ts` | `no-restricted-properties` and `no-restricted-globals`, with an override disabling both inside `src/lib/i18n/formatters.ts` | Exists |

**Settled:** each rule ships with a **fixture that must fail**. `TEST-005-11` runs ESLint
and Stylelint against `tests/lint-fixtures/` and asserts a non-zero exit with the expected
rule id. A lint rule nobody has watched fail is a lint rule that might be misconfigured,
and a misconfigured lint rule is worse than none because it is believed.

---

## R-14 · Does anything already log a localized string?

**Checked:** whether BR-8.9 is at risk from what exists. `001` has no logging (its
`research.md` R-7 defers `Serilog` to `002`), and `002` creates the first real log entry —
the one that carries the `traceId` matching `ProblemDetails`.

**The risk this feature introduces:** `002`'s mapper is about to gain an
`IStringLocalizer`. The natural next step is logging the same localized `title` it just
put in the response, at which point log language follows request language and
`docs/sdd/testing/test-matrix.md`'s "logs stay English" row quietly becomes false.

**Settled:** **AC-18** asserts English log output under `Accept-Language: ar`, using a
capturing `ILoggerProvider` in the test host. It is cheap now and it is the kind of thing
nobody goes back to add.

**Rejected:** an analyzer banning `IStringLocalizer` values from reaching a logger. It
cannot be expressed without dataflow analysis, and one test covers the realistic case.

---

## R-15 · Does the frontend need to *read* `Content-Language`?

**Checked:** what a client can do with it. Requesting `ar` and receiving
`Content-Language: en` means the server does not speak Arabic — which, in this product,
means a locale was added on the client and not on the server, or the culture list was
misconfigured.

**Settled:** read it in the one API client, compare it with the requested locale, and
`console.warn` on a mismatch **in development only**. Not a user-facing error: BR-8.3 says
falling back is legitimate, so a user-visible warning would be wrong. AC-31.

**Rejected:** switching the UI locale to whatever the server replied with. It would flip
the interface out from under a user mid-session because one endpoint answered in English,
and the interface locale is a client concern that `014` will make a stored preference.
