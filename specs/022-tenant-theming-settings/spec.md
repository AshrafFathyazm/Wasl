# 022 — Tenant Theming Settings

**Phase:** 5 · Release 2 · **Story:** — (a settings capability, not a user story) ·
**Status:** Specified, awaiting review

## Understanding

ADR-012 is **Accepted in part**, and this feature is the part it deferred. Its own
recommendation reads: *"build the architecture in the skeleton, defer the settings screen
to Release 2."* The token architecture — `--brand`, `--on-brand`, the derived ramp, the
sidebar preset variables — is `006-design-system`. What is here is the screen, the row
that survives a restart, and the two endpoints between them.

That split is load-bearing in one direction only: this feature can be dropped and the
architecture still demonstrates — change three variables in dev tools and the interface
retints, which is ADR-012's stated walkthrough. The architecture cannot be dropped and
leave this feature with anything to write to.

Four things in ADR-012 are hard, and none of them is the colour swap:

| # | The hard part | Why it fails silently |
|---|---|---|
| 1 | A brand is a **ramp**, not a colour, derived in **oklab** | An HSL ramp renders — it just renders muddy for some hues and oversaturated for others. Nothing errors |
| 2 | The foreground on the brand is **computed** from relative luminance | Hard-coded white looks correct for every dark brand, which is most of the ones anyone tests with |
| 3 | Most tokens must **not** be themeable, and the UI must **say so** | Enforcement without explanation reads as a missing feature, and the first question is "why can't I change these?" |
| 4 | The sidebar is a **mode** with three presets, not a colour picker | A free colour on a 288px surface has to work against text, icons, hover, and the active indicator at once. Any one of them failing is a defect nobody notices until a tenant picks that colour |

Add a fifth that ADR-012 states as a constraint rather than a difficulty: the theme
arrives in the **bootstrap or auth response** and reaches `:root` **before first paint**.
A separate fetch produces a flash of unbranded interface on every load. It looks broken,
it is the first thing a tenant notices, and it is invisible to every automated test that
does not measure paint order.

## In scope

- `OrganizationSettings` — one row, seeded with the product default, carrying a `rowversion`
- `GET /api/settings/branding` — the read, and the same payload embedded in the
  `POST /api/auth/token` response so the post-sign-in paint needs no second round trip
- `PUT /api/settings/branding` — Manager only, per `docs/sdd/design/settings-and-uploads.md`
- The contrast gate in the **domain**: relative luminance, the two candidate foregrounds,
  the computed `--on-brand`, and the refusal of a colour that cannot reach the thresholds
- `Settings.BrandingChanged` audit row, in-transaction (BR-9.1, BR-9.3)
- The settings screen at `/settings/branding`, joining the sub-nav in
  `docs/sdd/design/screens/09-settings-localization.md`
- The pre-paint application path: an inline script that writes `--brand` and `--on-brand`
  to `:root` from a cached value before React mounts, corrected — once — by the
  authoritative server value
- The statement in the UI of which tokens are fixed and why (ADR-012 part 3)
- The three sidebar presets as a mode selector (ADR-012 part 4)

## Out of scope

| Excluded | Where it lives |
|---|---|
| `--brand`, `--on-brand`, the five derived ramp tokens, the sidebar preset variables, and rewiring `--action-primary-bg` off `--navy-900` | `006-design-system`. ADR-012's whole argument is that the value is in the token structure and the structure ships in the skeleton |
| Logo upload, `LogoBytes`, the logo endpoints, MIME sniffing, SVG sanitisation, re-encoding | `docs/sdd/design/settings-and-uploads.md`, "Release 2 or later" — **later than this feature**, and a separate story. Nothing here creates a logo column speculatively |
| User avatars (`AvatarBytes`, `PUT /api/me/avatar`) | Same file, same story as the logo. Unrelated to theming |
| Per-user theming | Nowhere, deliberately. ADR-012: a screenshot pasted into a support conversation would not match what the other person sees. That is the whole reason it is an organisation setting |
| Full custom palettes — nine values, a palette editor | Nowhere. ADR-012: a tenant who wants to set nine values wants a design system, not a settings page, and every extra field is another contrast pair to validate |
| Dark mode | Nowhere. A different axis and a much larger surface; `color-scheme: light` stands (`DESIGN-BRIEF.md` rule 16). The **Dark sidebar preset is not dark mode** — see AC-24 |
| Themeable status, priority, and neutral colours | Nowhere, permanently. A tenant who can set "success" to red has a product that can lie about state (ADR-012 part 3) |
| Favicon, e-mail templates, the login screen's brand mark | No requirement. The product mark lives in `docs/sdd/design/brand/` and is not tenant-variable |
| A second organisation, a `TenantId` column, tenant-scoped queries | Nowhere. Multi-tenancy is out of scope project-wide (`docs/sdd/00-project-context.md`) — see Q-B |
| The `403` and `409` `ProblemDetails` `type` strings themselves | `002-error-contract` owns the registry. This contract cites them; it does not define them |

## Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | `006-design-system` ships `--brand`, `--on-brand`, `--brand-hover/active/subtle/border/ring`, the sidebar preset variables, and **rewires `--action-primary-bg` to `var(--brand)`**. As of today `docs/sdd/design/tokens.css` sets `--action-primary-bg: var(--navy-900)` — a primitive — so that wiring does not yet exist (`research.md` R-1) | This feature persists a value nothing consumes: a correct row, a correct endpoint, and an interface that does not retint. The screen is then worth nothing and should be deferred with the architecture rather than shipped as a control with no effect. **This is the dependency to check before starting** |
| A-2 | `004-auth-and-roles` can carry an extra object on the `POST /api/auth/token` response | The theme comes only from `GET /api/settings/branding`, and the first paint after sign-in flashes once on a device with no cached value. Nothing else changes — the contract keeps both paths for exactly this reason |
| A-3 | `color-mix(in oklab, …)` is available in the browsers this is reviewed in | The ramp declarations are invalid at computed-value time and the derived tokens resolve to nothing — primary buttons lose their fill entirely. The mitigation is an `@supports` guard, and it belongs to `006` because the ramp does (`research.md` R-4) |
| A-4 | `localStorage` is readable at pre-paint time | The cache read returns null, the default theme paints, and the server value corrects it once. A `try`/`catch` around the read, never a thrown error before first paint — a theme cache that breaks the app is worse than a flash |
| A-5 | The two candidate foregrounds are `#FFFFFF` and `#0D2626` (`--Text-Primary`), per `docs/sdd/design/theming.md` | The accepted/refused luminance band moves. The band is therefore **computed by the test** from the two candidates and never hard-coded, so a change to the ink is a re-run rather than a rewrite (AC-9) |
| A-6 | Two Managers editing branding in the same minute is rare but possible | If the owner rules it impossible, `expectedVersion` and the `409` come out — one validator rule and one test. See Q-C |

## Open questions

| # | Question | Working assumption |
|---|---|---|
| Q-A | Is `GET /api/settings/branding` authenticated? ADR-005 says every endpoint except `/health` and `/api/auth/token` requires a token. `settings-and-uploads.md` marks the branding read "Any" and the **logo** read explicitly unauthenticated | **Authenticated.** ADR-005 is Accepted and is a security rule; a planned design file does not override it. The consequence is accepted and stated: the **sign-in screen is not branded** — it paints the product default, or a cached theme on a device that has signed in before. One screen, against weakening a blanket auth rule for a cosmetic gain |
| Q-B | "Tenant" theming in a product whose context document says multi-tenancy is out of scope | One row, `OrganizationSettings`, no `TenantId` column, no tenant resolution. "Tenant" is ADR-012's word for the single support organisation. If multi-tenancy ever arrives this is a column and a scoped query, not a redesign — recorded so the naming is not read as a hidden capability |
| Q-C | Does `PUT` require `expectedVersion`? ADR-006 names `Ticket` and `Customer`, not settings | **Yes.** A single global row editable by any Manager is the same hazard ADR-006 describes, and the row carries `rowversion` anyway because ADR-006's mechanism is structural. A `409` costs one refetch; a silent lost update costs a tenant's colour reverting for no visible reason |
| Q-D | Which `type` string does a `403` use? `05-api-conventions.md` names the status but no `type` | `errors/forbidden`. `002-error-contract` owns the registry and wins if it chose differently; this contract records a citation, not a definition |
| Q-E | Does the contrast gate also require the brand to be distinguishable from the **page surface**? ADR-012 specifies only the 4.5:1 text gate | **Yes — refuse below 3:1 against `#FFFFFF`** (WCAG 1.4.11 non-text contrast; the lighter of the two shell surfaces is the worst case). ADR-012's own worry — *"the first tenant who picks a pale yellow gets an unusable product"* — is **not** caught by the text gate: pale yellow passes it comfortably with the ink foreground and yields a primary button that cannot be seen against a white page. The text gate alone does not deliver what ADR-012 says it delivers. **This needs the owner's sign-off**, because it is an addition to ADR-012 rather than an implementation of it. AC-12 rests on it and is labelled |
| Q-F | With both gates applied the refusal set is wider than a tenant will expect — an orange or amber brand is refused (`research.md` R-3) | Refuse, per ADR-012: *"Better to refuse a colour than to render text nobody can read."* The alternative, and the recommendation to revisit: derive a **darkened action colour** from the raw brand so the button passes while accents keep the tenant's actual hue. That is a change to `006`'s ramp, not to this settings screen — which is precisely why it is not smuggled in here |
| Q-G | Does an Agent see the Branding item in the settings sub-nav? | Hidden for an Agent. Reaching `/settings/branding` directly renders the forbidden state (ADR-011 §5 — a `403` is information, handled inline), never a form that fails on submit |

## Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | On a clean database, `GET /api/settings/branding` returns `200` with the seeded product default — `#1D174D`, `Light` — and a `version`. There is no "not configured" state and no `404` |
| AC-2 | `GET /api/settings/branding` without a token returns `401` `errors/unauthenticated` (Q-A) |
| AC-3 | The `theme` object on the `POST /api/auth/token` response is **field-for-field equal** to the `GET` body, asserted by one test that calls both and compares — not by two tests that each check a shape independently |
| AC-4 | `PUT` as a Manager returns `200` with the stored resource, a new `version`, and `onBrand` **recomputed by the server** from the accepted colour |
| AC-5 | `PUT` as an Agent returns `403` `errors/forbidden`, changes nothing, and writes an audit row **outside** any business transaction (BR-9.2, BR-9.4) |
| AC-6 | `PUT` with a stale `expectedVersion` returns `409` `errors/concurrency-conflict` and the stored row is byte-identical to before the call (Q-C) |
| AC-7 | `PUT` with a malformed colour — `#ABC`, `1D174D`, `#1D174DFF`, `rgb(29,23,77)`, `#GGGGGG`, `" #1D174D "` — returns `400` `errors/validation` naming `brandColor`, and the stored value is unchanged. Those six inputs are six rows of one table-driven test |
| AC-8 | `PUT` with a colour that fails the gate returns `400` `errors/inaccessible-brand-color` carrying **numeric** `bestContrastRatio`, `requiredContrastRatio`, `surfaceContrastRatio`, and `requiredSurfaceContrastRatio` extensions. Those numbers are byte-identical under `Accept-Language: ar`; only `title` and the `errors` message translate (BR-8.7) |
| AC-9 | The accepted/refused luminance band is **computed by the test** from the two candidate foregrounds and printed as test output, never hard-coded in an assertion. Changing `--Text-Primary` moves the band and the test still passes for the right reason (A-5) |
| AC-10 | For every accepted colour in the fixture, `onBrand` is whichever of `#FFFFFF` and `#0D2626` has the higher ratio against the brand, and that ratio is ≥ 4.5:1. Asserted per fixture row, not in aggregate |
| AC-11 | The fixture exercises **four distinct verdicts**, at least one row each: accepted with white (`#1570EF`), accepted with ink (`#4A9E96`), refused by the **text** gate (`#808080` — mid luminance, both foregrounds fail), refused by the **surface** gate (`#FFF59D` — a foreground passes and the button would be invisible). A fixture of only pale and dark colours never reaches the refusal path at all |
| AC-12 | *(rests on Q-E)* A colour reaching 4.5:1 against a foreground but under 3:1 against `#FFFFFF` is refused, and the response says which gate refused it |
| AC-13 | The gate is applied to every ramp member that carries `--on-brand` text — `--brand`, `--brand-hover`, `--brand-active` — not to the base colour alone. A brand accepted on its base whose hover state drops under 4.5:1 is refused, and the fixture contains such a colour |
| AC-14 | `sidebarMode` accepts exactly `Light`, `Dark`, `Brand`. Anything else is `400` `errors/validation` and the stored value is unchanged. The three values are byte-identical in `en` and `ar` responses (BR-8.7); only their labels are translated |
| AC-15 | In **Brand** sidebar mode, every **text** role in the sidebar reaches 4.5:1 against `--brand` for every accepted fixture colour. Mixed foregrounds (`color-mix(… var(--on-brand) N%, transparent)`) are used only for borders and dividers, which are non-text and held to 3:1 |
| AC-16 | Changing the brand changes **no fixed token**: a `getComputedStyle` snapshot of the fixed list — every `--state-*`, the neutral ramp, `--text-*`, `--border-*`, every status and priority colour — is byte-identical before and after |
| AC-17 | `--brand` and `--on-brand` are on `:root` **before first paint**: on a reload with a cached theme, `performance.mark('theme-applied')` has a strictly smaller `startTime` than the `first-contentful-paint` paint entry. This is the criterion that catches a `useEffect` implementation, which passes every other criterion here |
| AC-18 | After one successful signed-in load, a reload paints the tenant's brand with **exactly one** write to `:root` — the pre-paint one. A second, correcting write means the cache was not populated and the flash is still there |
| AC-19 | A brand changed on device A appears on device B's next load. Device B may paint the previous brand for **one** correction write; that correction is the accepted stale-cache behaviour and is stated in `summary.md`, not discovered |
| AC-20 | The screen states, in permanently visible text — not a tooltip, not behind a disclosure — that status and priority colours are not themeable **and why** (ADR-012 part 3). The string exists in `en` and `ar` |
| AC-21 | The refusal is announced, not only coloured: the verdict region is `aria-live="polite"`, carries the server's message as text, and is reachable by a screen reader without moving focus |
| AC-22 | The brand colour is enterable as **text** in a hex field, keyboard-operable end to end with a visible focus ring. A native colour swatch is offered alongside and is never the only way in — a tenant has a hex value, not a mouse gesture |
| AC-23 | The client mirror is not the authority: a request that bypasses client validation and sends a refused colour still returns `400`, proven by an integration test that does not go through the form (ADR-003, Constitution III) |
| AC-24 | The **Dark** sidebar preset scopes `color-scheme: dark` to the sidebar element only; the app root stays `light` (`DESIGN-BRIEF.md` rule 16). Verified by reading the computed value on both elements — otherwise a scrollbar inside a dark sidebar renders light and reads as a rendering bug |
| AC-25 | The migration seeds **exactly one** row. A second insert is rejected by `CK_OrganizationSettings_SingleRow`, verified by a failed insert **and** by a `sys.check_constraints` query returning a non-null `definition` |
| AC-26 | A successful `PUT` writes one `Settings.BrandingChanged` audit row in the **same transaction**, recording only the fields that changed, before and after (BR-9.1, BR-9.3, BR-9.8). A forced rollback leaves no audit row |
| AC-27 | Every string on the screen has a key in both catalogues (parity test, BR-8.11), and the screen has been walked in Arabic with the findings written down — the walk is the deliverable, not the checkbox |

## Edge cases

| Case | Expected |
|---|---|
| `#ffffff` sent in lowercase | Accepted as a **format**, normalised to uppercase `#FFFFFF`, then **refused by the surface gate** — a white brand button is invisible on a white page. Two outcomes in one request, and the response says which one applied |
| `#000000` | Accepted. White foreground, ratio 21:1, surface ratio 21:1. The darkest possible brand is the easiest case, which is why testing with it proves nothing |
| `#808080` | Refused. Its luminance sits in the band where **neither** foreground reaches 4.5:1 (`research.md` R-2). The single most important fixture row, because it is the only kind of colour that exercises text-gate refusal |
| `#FFF59D` (pale yellow) | Refused by the **surface** gate, not the text gate. ADR-012's stated worry, and the case that shows the text gate alone does not answer it (Q-E) |
| A brand accepted on its base whose `--brand-hover` fails | Refused. The hover mix is lighter by construction, so a colour near the white-foreground boundary loses the gate on hover — and nobody tests hover contrast (AC-13) |
| Whitespace, `null`, empty string, or a missing `brandColor` | `400` `errors/validation`. `null` is not "keep the current value"; a `PUT` replaces the resource |
| The same values submitted again | `200`, `version` unchanged, **no audit row** — BR-9.8 records fields that actually changed, and a row recording nothing is noise |
| Two Managers `PUT` concurrently on the same version | One `200`, one `409` `errors/concurrency-conflict`. The `rowversion` is the guarantee; the message is the application's |
| An Agent navigates directly to `/settings/branding` | The forbidden state renders inline (ADR-011 §5). No form, so no request, so no denial row — the audit row exists only if a request was actually made |
| `localStorage` unavailable or holding corrupt JSON | Caught, ignored, product default paints, server value corrects once. A theme cache never throws before first paint (A-4) |
| The cached theme is a colour the gate would now refuse — the thresholds moved in a release | It still paints: the cache is a **rendering** cache, not a validation gate. The next `PUT` refuses it, and the stored value was valid when it was stored. Reachable only through a threshold change, and recorded as such |
| `color-mix(in oklab, …)` unsupported | The ramp tokens resolve to nothing and primary buttons lose their fill. Belongs to `006` with the ramp; recorded here because this feature is the first to make the ramp tenant-variable and therefore the first place it can be observed (A-3, `research.md` R-4) |
| `Accept-Language: ar` on the refusal | `title` and the `errors` message are Arabic; `type`, the `errors` keys, and all four ratio extensions are byte-identical to the English response (BR-8.7) |
| A `PUT` lands while the theme is being read on another connection | No coordination needed. The read is a single row and the write is one transaction; a reader sees the before or the after, never a half-applied theme |

## Rules referenced

- **ADR-012** — accepted in part; this feature is the deferred part. All four hard parts, the no-flash constraint, and every out-of-scope exclusion above
- **ADR-011** §4 (three kinds of component, fetching at route level only), §5 (`403` inline), §6 (types generated from the contract), decision 1 (no global store)
- **ADR-009** — the design system is extracted, not copied; the one-day timebox is `006`'s, not this feature's
- **ADR-006** as amended by **ADR-013** — `rowversion`, `expectedVersion`, `409 errors/concurrency-conflict`
- **ADR-013** — SQL Server types; row 4 (`nvarchar`, never `varchar`, for human text) and the `varchar(45)` precedent for ASCII-only machine values
- **ADR-005** — every endpoint except `/health` and `/api/auth/token` requires a token (Q-A)
- **ADR-007** §6 (CSS logical properties), §8 (`dir="auto"`), and the `UseRequestLocalization()`-after-`UseAuthentication()` ordering this feature must not disturb
- **ADR-003** — the client mirrors a rule and is never the authority (AC-23)
- **BR-6** — the authorization matrix. It has **no row for branding**; `settings-and-uploads.md` says Manager, and `DOC-022-02` adds the row
- **BR-8.6, BR-8.7, BR-8.11** — what is translated, what never is, and the parity test
- **BR-9.1, BR-9.2, BR-9.3, BR-9.4, BR-9.8** — the audit row, the denial row, the transaction, and recording only what changed
- **NFR-1** — maintainability over cleverness: the reason the ramp stays CSS rather than becoming six numbers on the wire
- **DESIGN-BRIEF.md** rule 2 (semantic tokens only), rule 2b (brand and status are different categories), rule 16 (`color-scheme: light`)

## Why the criteria are shaped this way

Six of them exist because the failure is invisible:

| Criterion | The silent failure it catches |
|---|---|
| AC-17 | A `useEffect` implementation. It works, it is tested, and it flashes on every load |
| AC-13 | A hover state that fails contrast while the base colour passes. Nobody hovers during review |
| AC-16 | A status colour drifting into the themeable set — the product becomes able to lie about state |
| AC-11 | A fixture that never reaches the refusal path, so the refusal code is never executed |
| AC-24 | A light scrollbar in a dark sidebar, which reads as a rendering bug rather than a token bug |
| AC-25 | A second settings row. Every read then returns whichever one the query happened to order first |
