# 022 — Plan

**Phase:** 5 · **Role:** Architecture · **Agent:** `feature-dev:code-architect` ·
**Skill:** `speckit-plan`

## Backend design

Two projects, vertical slices, per ADR-010. Every file this feature creates or changes is
named — a plan that does not name its files is a description.

```text
src/
  Wasl.Domain/
    Settings/
      OrganizationSettings.cs        entity; private setters; one Change method
      BrandColor.cs                  value object; parse, normalise to uppercase, refuse
      SidebarMode.cs                 enum: Light | Dark | Brand
      Contrast.cs                    NEW, and the point of the feature. Pure, ~40 lines
      BrandColorVerdict.cs           Accepted(foreground) | Refused(check, four ratios)
  Wasl.Api/
    Features/
      Settings/
        GetBranding/
          Endpoint.cs                MapGet("/api/settings/branding"), RequireAuthorization()
          Query.cs
          Handler.cs
          Response.cs                brandColor · onBrand · sidebarMode · updatedAtUtc · version
        UpdateBranding/
          Endpoint.cs                MapPut, RequireAuthorization("Manager")
          Command.cs                 IAuditableCommand — the architecture test from 003 requires it
          Handler.cs
          Validator.cs               FluentValidation: format, enum, expectedVersion presence
          Response.cs                same shape as GetBranding/Response.cs, deliberately
    Common/
      Persistence/
        Configurations/
          OrganizationSettingsConfiguration.cs
        Migrations/                  AddOrganizationSettings (generated)
      Errors/
        ProblemTypes.cs              CHANGED — one constant: InaccessibleBrandColor
      Localization/
        Resources/
          Settings.en.resx           CHANGED — refusal title, detail, field message
          Settings.ar.resx           CHANGED — same keys
    Features/
      Auth/
        IssueToken/
          Response.cs                CHANGED — gains `theme`. Owned by 004; see Contract changes
          Handler.cs                 CHANGED — reads the settings row and projects it
```

`Response.cs` is duplicated between the two slices on purpose. ADR-010 puts DTOs inside
the slice that owns them; a shared `BrandingResponse` in `Common/` would couple the read
and the write so that changing one changes the other, which is precisely what a slice
boundary is for. The **contract** guarantees they are identical; a shared class would only
guarantee they are the same object, which is a different and weaker property. AC-3 tests
the guarantee that matters.

### Where each decision is enforced

| Decision | Enforced by | Not by |
|---|---|---|
| The contrast rule exists once (Constitution III) | `Wasl.Domain/Settings/Contrast.cs`, called by the handler; the client's `contrast.ts` is a mirror with no authority | A validator holding the rule, with the frontend as its only second implementation |
| A colour that cannot be read is never stored | `OrganizationSettings.ChangeBranding` returns a `Refused` verdict; there is **no** setter that bypasses it | The endpoint remembering to check first |
| Only a Manager writes | `RequireAuthorization("Manager")` at the boundary — a role-only rule, per BR-6's own note | A check inside the handler, where a second caller could skip it |
| The audit row exists and is in-transaction | `Command : IAuditableCommand` plus `003`'s pipeline behaviour and its architecture test | The handler writing the row |
| One settings row, forever | `CK_OrganizationSettings_SingleRow`, verified via `sys.check_constraints` | An application rule that a script can bypass |
| `onBrand` is the server's answer | It is a field on the response, computed in the domain | The client computing it and the server trusting the result |
| Time comes from the clock we control | Injected `TimeProvider` | `DateTime.UtcNow` in the handler |

### `Contrast.cs`, and why it is in the domain

```text
RelativeLuminance(hex)      → double      sRGB linearisation, per design/theming.md
Ratio(a, b)                 → double      (lighter + 0.05) / (darker + 0.05)
OnBrandFor(brand)           → string      the higher-contrast of #FFFFFF and #0D2626
Evaluate(brand)             → BrandColorVerdict
```

`Evaluate` runs the three checks in the contract's order — text, hover/active, surface —
and returns the first refusal with the ratios attached. The hover and active inputs are
the same oklab mixes the stylesheet declares, computed in C# for the gate only; the
**rendered** ramp stays CSS (`research.md` R-6). That is the one place two implementations
of one thing exist, and it is contained: the C# mix is used to answer *accept or refuse*,
never to produce a colour that is sent anywhere.

Zero dependencies, so the fixture in `TEST-022-01` runs in the unit suite with no
database and no container — which is what makes it cheap enough to run on every build.

### `Program.cs`

Nothing changes. This feature adds endpoints and a policy usage; it does not touch
middleware order. Recorded because ADR-007 calls the
`UseRequestLocalization()`-after-`UseAuthentication()` ordering the single most likely
defect in the build, and this feature's Arabic refusal message (`TEST-022-09`) is a
witness to that ordering — if the order were broken, this `400` would come back in English
and read as a missing translation key (`research.md` R-11).

## Frontend design

```text
index.html                             CHANGED — the pre-paint inline script. See below
src/
  lib/
    theme/
      applyTheme.ts                    writes --brand and --on-brand to :root, once
      themeCache.ts                    read/write localStorage, try/catch, never throws
      contrast.ts                      MIRROR of Contrast.cs. Never the authority
  features/
    settings/
      api.ts                           getBranding, putBranding — typed from the contract
      queries.ts                       brandingQuery, useUpdateBranding
      schema.ts                        Zod: hex format, enum, expectedVersion
      BrandingSettingsPage.tsx         ROUTE — the only thing here that fetches
      BrandColorField.tsx              feature — hex text input + native swatch
      ContrastVerdict.tsx              feature — aria-live region, ratios, refusal reason
      SidebarModePicker.tsx            feature — three preset cards, radio semantics
      FixedTokensNotice.tsx            feature — ADR-012 part 3, permanently visible
      BrandPreview.tsx                 feature — button states, sidebar, a fixed status chip
      SettingsNav.tsx                  CHANGED — adds the Branding item, Manager only
  routes.tsx                           CHANGED — /settings/branding
  lib/i18n/en/settings.json            CHANGED
  lib/i18n/ar/settings.json            CHANGED
```

Component kinds per ADR-011 §4 are in [`frontend-spec.md`](frontend-spec.md). One route
fetches; nothing else does.

### The pre-paint path, which is the whole no-flash requirement

```text
index.html  <script> (synchronous, in <head>, before the bundle)
  ├─ read the cached theme          try/catch, may return null
  ├─ write --brand / --on-brand     document.documentElement.style
  └─ performance.mark('theme-applied')
       ↓
React mounts. The shell paints already branded.
       ↓
Route-level brandingQuery resolves (or the auth response carried it)
  ├─ equal to what was painted?  → nothing happens. AC-18
  └─ different?                  → applyTheme once + rewrite the cache. AC-19
```

The mark is not instrumentation for its own sake — it is how AC-17 is verified, by
comparing its `startTime` against the `first-contentful-paint` paint entry. A
`useEffect` implementation satisfies every other criterion in the spec and fails exactly
this one, which is why the mark ships rather than being added when someone wonders.

`themeCache.ts` never throws. A private window, disabled site data, or corrupt JSON
returns null and the product default paints (A-4). A theme cache that can break the app
before first paint is worse than the flash it exists to prevent.

### The mirror, and its boundary

`contrast.ts` is the same arithmetic as `Contrast.cs` so the picker can say "this colour
will be refused" before a round trip. Three things it deliberately does not do:

| Not done client-side | Why |
|---|---|
| Deciding what gets stored | The server refuses, the client anticipates. AC-23 proves the server refuses when the client is bypassed |
| Recomputing `onBrand` from the response | The server sent it. Recomputing is a second answer that can differ from the one that was gated |
| Suggesting a nearby acceptable colour | Not specified anywhere, and inventing it here would be this screen designing a palette feature ADR-012 refused |

## Data changes

See [`data-model.md`](data-model.md). One table, one row, four constraints, one seed.
Migration `AddOrganizationSettings`.

No column is created for the logo or for avatars. Those belong to a later story
(`settings-and-uploads.md`), and a `varbinary(max)` column nothing writes to is an
invitation rather than preparation.

## Contract changes

[`contracts/theming-api.md`](contracts/theming-api.md) is frozen and new — nothing is
broken by it.

**One change is imposed on another feature**, and it is the reason this heading matters:

| Change | Owner | Status |
|---|---|---|
| `POST /api/auth/token` response gains a `theme` object | `004-auth-and-roles` | `004` is **not yet specified**, so this is a requirement placed on its contract, not a change to a frozen one. If `004` is specified without it, this feature loses its no-flash path on the first authenticated load and A-2's consequence applies |
| `ProblemDetails` type `errors/inaccessible-brand-color` joins the registry | `002-error-contract` | A new constant in `Common/Errors/ProblemTypes.cs`. `002` owns the registry's shape; this feature owns one entry in it |
| BR-6's authorization matrix gains a "Change branding" row (Manager only) | `docs/sdd/04-business-rules.md` | `DOC-022-02`. The matrix currently has no row, and `settings-and-uploads.md` is the only place the Manager rule is written down |
| `docs/sdd/05-api-conventions.md` endpoint inventory gains two rows | Same file's owner | `DOC-022-03`. An endpoint absent from the inventory looks unbuilt |

## Test strategy

| Level | What | Why there |
|---|---|---|
| **Unit** (`Wasl.Domain.Tests`) | The whole contrast gate, table-driven over the fixture: luminance, chosen foreground, the three checks, the computed band boundaries, `BrandColor` parsing and normalisation, the six malformed inputs, `ChangeBranding` refusing without storing | Pure arithmetic with no dependencies. Every colour in the fixture is a row, and the suite runs on every build with no container. This is where the feature's actual risk lives |
| **Integration** (`Wasl.Api.IntegrationTests`) | Both endpoints; every status code in the contract; the auth `theme` object equalling the `GET` body; the Agent `403` and its audit row; two writes on one version; the Arabic refusal's untranslated parts; the audit row in-transaction and absent on rollback; the migration seeding exactly one row; the second insert being rejected; `sys.check_constraints` returning a non-null definition | Every one of these is a property of the real engine or of the real pipeline. EF `InMemory` enforces none of them (`docs/sdd/testing/test-strategy.md`) |
| **Frontend unit** (Vitest + RTL) | The refusal state rendering the server's message and the ratios; the mirror refusing before submit; the `409` path refetching; the Manager-only nav item; the fixed-tokens notice being present in the DOM rather than behind a disclosure | The critical form, per the constitution's frontend test scope |
| **Browser observation** (`chrome-devtools-mcp`) | AC-17 paint order; AC-16 the fixed-token snapshot before and after a brand change; AC-24 the two `color-scheme` values; AC-15 sidebar text contrast in Brand mode; the Arabic walk | None of these is assertable in jsdom. Paint order needs a real paint; computed-token diffing needs a real cascade; contrast on a rendered surface needs rendering |
| **Deliberately not tested** | That the browser's `color-mix(in oklab, …)` is correct; whether the ramp looks *good*; the exact rendered pixel values of the ramp; `localStorage` itself | The first is testing the engine. The second is a human judgement and belongs to the Phase 3b preview (`design/preview-first-workflow.md`), not to an assertion. The third would encode a browser's rounding into a test. The fourth is testing the platform |

**Recorded as knowingly untested:** the `@supports` fallback for a browser without
`color-mix` (`research.md` R-4). It belongs to `006`'s stylesheet, and testing it here
would mean this feature owning a fallback it did not write.

## Dependencies

| Depends on | For | If it is not there |
|---|---|---|
| `006-design-system` | `--brand`, `--on-brand`, the five ramp tokens, the three sidebar presets, and `--action-primary-bg: var(--brand)` | **The feature is pointless.** A correct row, a correct endpoint, and an interface that does not retint. `REV-022-01` checks this before any frontend task starts (A-1, `research.md` R-1) |
| `004-auth-and-roles` | The `Manager` policy, the token, and the `theme` object on the token response | Without the policy there is no `403`. Without the `theme` object, A-2's consequence: one flash on the first authenticated load |
| `003-audit-trail` | `IAuditableCommand` and the pipeline behaviour | The audit row would have to be written by the handler, which `003` exists to prevent |
| `002-error-contract` | `ProblemDetails` middleware and the type registry | The refusal would build its own error response by hand, against Constitution IV |
| `005-localization-core` | `IStringLocalizer`, the `.resx` pipeline, the parity test | The refusal message would be English-only, and this feature's most important message is the one a user has to act on |
| `014-language-preference-and-rtl` | `SettingsNav.tsx` and the settings shell that screen `09` describes | The Branding item has no nav to join. It could ship as a standalone route, recorded as a deviation |

## Risks and trade-offs

### Considered and rejected: compute `onBrand` on the client only

The arithmetic is fifteen lines and the client already needs it for the picker's live
feedback, so sending the field looks redundant.

Rejected. The chosen foreground is the *output of the rule that gated the colour*. If the
client recomputes it, there are two answers to one question and the one that renders is
not the one that was validated — a rounding difference, a different ink token, or a stale
bundle produces text the server believed was readable and the browser does not. Constitution
III settles it: the server tells the client what is permitted. The client's copy is a
mirror for speed (AC-23).

### Considered and rejected: block the first render on the branding fetch

It removes the stale-cache correction entirely — no `localStorage`, no double write, and
the theme is always right on the first paint the user sees.

Rejected. It replaces a one-frame colour change with a blank screen for the length of a
round trip **on every load**, and it makes the interface's time-to-first-content depend on
a settings endpoint. ADR-011 explicitly has no first-paint budget to spend that way. The
cache costs one conditional write and one accepted, documented stale frame (AC-19).

### Considered and rejected: send the derived ramp as six hex values

The server could compute the whole ramp and the client would set six variables. No
`color-mix` dependency, no `@supports` guard, no browser-support question (A-3).

Rejected. It creates a second implementation of the ramp — one in C#, one in CSS — that
must agree forever, and the CSS one cannot be deleted because the stylesheet needs default
values before any response arrives. It is the same trap `007` avoids by keeping E.164
normalisation server-side only. The `color-mix` risk is real and belongs to `006` with the
ramp itself.

### Considered and rejected: a free colour picker for the sidebar

More flexible, and it is what a tenant asks for.

Rejected, per ADR-012 part 4, and the reason is worth restating because it is not
obvious: a 288px surface carries text, icons, hover states, an active indicator, a border,
and a scrollbar. A free colour means six contrast pairs to validate for every value a
tenant might pick, and the failure is per-colour — it works for the colours anyone tests
with. Three presets that always work beat a picker that sometimes does.

### Considered and rejected: warn instead of refuse

A soft warning — "this colour may be hard to read" — keeps every tenant able to use their
actual brand and puts the choice with the person who owns the brand.

Rejected. A warning that can be dismissed is a warning that will be, and the result is a
product with unreadable buttons whose cause is a decision nobody remembers making. ADR-012
is explicit: refuse, with an explanation. The honest cost is Q-F — a wider refusal set
than a tenant expects — and the answer to *that* is a darkened action colour in `006`'s
ramp, not a dismissible dialog here.

### Accepted risk: the whole feature depends on `006` having rewired one token

`--action-primary-bg` currently points at `--navy-900`, a primitive
(`research.md` R-1). If `006` ships without the brand layer, this feature is a settings
screen that changes a database row and nothing else — and it would still pass every
backend acceptance criterion here. That is the failure mode worth naming: **the backend
can be entirely correct while the feature does nothing visible.** `REV-022-01` is a gate,
not a review step, and it runs first.

### Accepted risk: the surface gate is not in ADR-012

Q-E adds a check ADR-012 does not specify. Without it, ADR-012's own worry about pale
colours goes unanswered (`research.md` R-2); with it, this spec has one rule the accepted
decision record does not. It is flagged in the spec, labelled on AC-12, and it is one
constant and one branch to remove if the owner says no.

### Known tension, recorded rather than resolved: how many colours get refused

With both gates, any brand lighter than L ≈ 0.30 is refused — orange, amber, most pinks,
bright cyan. That is ADR-012's stated policy applied consistently, and it will read as a
broken product to a tenant whose brand is orange. Q-F carries the recommendation (a
derived darkened action colour, owned by `006`) rather than this feature quietly
redesigning the ramp to make its own screen look more permissive.
