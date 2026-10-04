# 022 — Summary

**Phase:** 6 · **Role:** Summary · **Delivered:** 2026-09-27 … 2026-10-04

## What Was Built

ADR-012 is *Accepted in part*; this is the part it deferred. The token architecture shipped
with `006`. What `022` adds is the row, the two endpoints, the rule that decides whether a
colour may be used at all, and the screen.

**Backend**

| Piece | Where |
|---|---|
| `OrganizationSettings` — one row, `rowversion`, seeded by the migration | `Wasl.Domain/Settings/` |
| `SidebarMode` — `Light` · `Dark` · `Brand`, stored as a string | same |
| `BrandContrast` — relative luminance, the WCAG ratio, the **oklab ramp**, and the three-check gate | same |
| `BrandContrastVerdict` + `InaccessibleBrandColorException` | same |
| `GetBrandingQuery` · `UpdateBrandingCommand` + validator + handler | `Wasl.Application/Features/Settings/` |
| `BrandingResponse` — one shape for the `GET`, the `PUT` result and the token response's `theme` | same |
| `GET` and `PUT /api/settings/branding`, the second Manager-only endpoint in the product | `Wasl.Api/Controllers/SettingsController.cs` |
| `errors/inaccessible-brand-color` — a `400` with four numeric extensions | `ProblemTypes.cs` |
| `DomainException.MachineExtensions` — values copied to `ProblemDetails` **without** going through the catalogue | `Wasl.Domain/Common/Exceptions/` |
| Migration `AddOrganizationSettings` + `CK_OrganizationSettings_SingleRow` | `Wasl.Infrastructure/Persistence/` |
| 10 catalogue keys × 2 languages | `SharedResource{,.ar}.resx` |

**Frontend**

| Piece | Where |
|---|---|
| `theme.ts` — `applyTheme`, the cache that never throws, `paintsTheSame` | `src/lib/` |
| The **pre-paint** theme write | `index.html`, beside the `dir`/`lang` block |
| The four sidebar preset tokens and the three presets | `styles/tokens.css` |
| `Sidebar.module.css` rewired off the page-level tokens | `src/shell/` |
| `BrandingPage` + `SettingsNav` + `branding.api.ts` | `src/features/settings/` |
| `tokenReferences.test.ts` — every `var(--token)` resolves | `src/styles/` |
| 47 keys × 2 languages | `locales/{en,ar}/settings.json` |

**Tests:** 330 domain · 46 application · 615 integration · 1416 frontend. Build clean,
`tsc` clean, `eslint` clean.

## Why It Was Built This Way

### The gate is in the domain, and it decides two things rather than one

`BrandContrast.Evaluate` returns both the refusal *and* the chosen foreground. A validator
could only produce the refusal, which would leave the acceptance half — *which of white and
ink goes on this colour* — implemented a second time beside it. One evaluation, one answer.

### The ramp is computed in C# against the stylesheet's own declaration

ADR-012 part 1 says a brand is a ramp derived in oklab. The gate has to judge the **hover**
state, so it reproduces `color-mix(in oklab, …)` in C#. That is the feature's one piece of
real arithmetic, and getting it wrong fails silently in the worst direction: the gate would
accept colours whose actual hover state is unreadable, with a green build.

So it was checked against the thing that renders — Chrome 154, twenty values, **all
byte-identical** — rather than against itself.

### `006`'s ramp direction was wrong, and the default brand was hiding it

The largest finding in the feature. `--brand-hover` lightened unconditionally, so a brand
dark enough to need white text became *less* readable on hover. The gate refused `#1570EF`
at 3.66, `#4A9E96` at 3.10 and `#2E7D32` at 4.07 — the last being the frozen contract's own
example — while accepting their base colours comfortably.

**Only the house navy and pure black survived, and the house navy survived because it is
nearly black.** The one colour the product ships with is the one colour the old ramp could
not break.

Put to the product owner with the measured table; ruled **fix the ramp in `022`**. Both
states now move *away* from the chosen foreground, so contrast is monotonic. `--brand-away`
carries the direction, written by the same pre-paint assignment that writes `--on-brand`.

### The theme rides on the token response

A separate fetch paints the default and then snaps to the tenant's, on every sign-in, on
every device. AC-17 measured the delivered path at **52.9 ms** against a first contentful
paint of **476 ms**.

`theme` on `POST /api/auth/token` is a **contract change to `004`'s frozen `auth-api.md`**,
recorded there and in `plan.md` rather than made quietly. It is additive, it is the same
object `GET /api/settings/branding` returns from the same mapper, and it is read *after* the
credentials are verified so an unauthenticated caller cannot learn the branding by posting a
wrong password.

### The refusal carries numbers, not a sentence with a number in it

`"4.02:1, needs 4.5:1"` composed on the server would put a formatted number inside a
translated string, and Arabic formats numbers differently. The response carries five machine
values — `refusedBy` plus four ratios — and the client formats them in the active locale.
Verified live: the Arabic body translates `title`, `detail` and the `errors` message, and
leaves `type`, `refusedBy` and every ratio byte-identical.

### `--on-brand` is computed server-side and the client never recomputes it

`tokens.css` carried a comment predicting this exact day: *"A tenant that changes `--brand`
to a light colour will need this to become dark, and THAT is the day it earns a
computation."* The computation is in `Wasl.Domain`, because the same rule that chooses the
foreground is the rule that **refuses** a colour, and a client must not be the authority on a
refusal (Constitution III). The client is told the answer and writes it.

## Trade-offs

| Decision | Alternative | Why |
|---|---|---|
| The read is authenticated (Q-A) | Unauthenticated, per `settings-and-uploads.md` | ADR-005 is a security rule and a planned design file does not override it. **The consequence is accepted and stated: the sign-in screen is not branded** — it paints the default, or a cached theme on a device that has signed in before. One screen against weakening a blanket auth rule |
| The surface gate at 3:1 (Q-E) | ADR-012's text gate alone | ADR-012's stated worry is a pale yellow brand, and the text gate does not catch it — pale yellow passes comfortably with ink text and yields an invisible button. **The text gate alone does not deliver what ADR-012 says it delivers** |
| Refuse, rather than derive a darker action colour (Q-F) | Keep the hue, darken only the button | ADR-012: *"Better to refuse a colour than to render text nobody can read."* The alternative is a change to the ramp's *meaning*, not to this screen, and it stays out |
| `022` builds the sidebar preset layer | Defer it | Three documents disagreed about who owed it and the stylesheet had none. Building it was the ruling |
| An identical `PUT` still writes an audit row | Suppress the row | **Deviation from the spec's edge-case table, deliberate.** `AuditBehaviour` writes exactly one row per auditable command, and that invariant is what makes a *missing* row always a defect. Teaching it to sometimes not write makes every future missing row ambiguous. The row carries `Changes: null`, which BR-9.8 already distinguishes |
| `varchar(7)` for the two colours | `nvarchar` | ADR-013 row 4 forbids `varchar` for human text. A hex colour is a machine value with a fixed ASCII alphabet, and this is the one column where that distinction applies |
| No `Idempotency-Key` | `036`'s mechanism | This `PUT` is idempotent by construction, and a replay is refused by the stale `expectedVersion` anyway |

## Deviations from the plan

| # | Planned | Built | Why |
|---|---|---|---|
| 1 | `006` ships the sidebar presets | `022` ships them | `006`'s spec defers them in writing; two other documents said otherwise. Measured, ruled, built |
| 2 | *(not planned)* | The ramp direction fix in `tokens.css` | The hover gate refused nearly every colour. Ruled by the product owner |
| 3 | *(not planned)* | `tokenReferences.test.ts` | Four invented token names shipped a panel with no background |
| 4 | *(not planned)* | `--font-mono` added to `tokens.css` | Referenced by `024` for longer than it had existed |
| 5 | *(not planned)* | `DomainException.MachineExtensions` | AC-8 needs numbers on `ProblemDetails` that do **not** go through the catalogue. No mechanism existed |
| 6 | An inline "saved" line | A toast | Both shipped first and said the same sentence; a test found two matching elements. The inline line was removed |
| 7 | `--sidebar-muted` at 72% in the Brand preset | **The full foreground** | Measured: 1079 of 1800 accepted brands put 72% text below 4.5:1, worst 2.72:1, and a brand at the boundary fails at ANY alpha below 1. AC-15 already prescribed this in words |
| 8 | AC-19 across two devices | **Partial** | One device exercised |

## Known Limitations

- **AC-15 was partial, then failed when measured, and is now met for text** — see `tests.md` finding 9. **Its border half is Q-I, open:** a 20% border measures 1.14–1.91:1, and the shipped Light sidebar has never met 3:1 either.
- **AC-19 is partial.** One device.
- **The settings form has not been walked keyboard-only or with a screen reader.** `016` and
  `021` each recorded the same gap; three features makes it a standing task, not an omission.
- **The sign-in screen is not branded** (Q-A), by ruling.
- **Q-H is open and not implemented.** `--action-secondary-text: var(--brand)` puts the brand
  on as **text** against white, which is a 4.5:1 requirement, and the ruled surface gate holds
  the brand to 3:1. Measured: the teal `#4A9E96` scores **3.17** — it passes every ruled check
  and renders a secondary button whose label is unreadable. A fourth gate is a product
  decision and three were signed off, so it is recorded in `spec.md`, not coded.
- **The accepted set is narrow.** With both gates on, orange and amber are refused. Ruled, and
  the revisit is named in Q-F.
- **`--font-mono` resolves to the platform monospace**, not IBM Plex Mono. Requesting a third
  CDN family for two ticket numbers was not worth the load.

## A note on the final browser pass

The Arabic walk, the AC-16 fixed-token snapshot, the AC-17 paint-order measurement and the
AC-24 before/after were all taken in a browser and are recorded in `tests.md` with their
figures. **A final pass over the restyled form and the new toast was not completed**: the
SQL Server container stopped (port 14330 unreachable, `/health` → `503`,
`POST /api/auth/token` → `500`), and the environment failure is not a product defect — the
615-test integration suite, which signs in and reads the theme, had passed fifteen minutes
earlier. Recorded rather than claimed.
