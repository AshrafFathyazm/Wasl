# 022 — Research

Questions that had to be answered before the plan could be written, what was checked,
and what each one settled. A question that turned out not to matter is recorded as such,
because "we looked and it did not matter" is information too.

All arithmetic below was done by hand from the formulas in
`docs/sdd/design/theming.md`. **It is not the specification.** The specification is that
the test recomputes it (AC-9) — the numbers here exist so a reviewer can see whether the
implementation lands where it should, and so the fixture is chosen deliberately rather
than by taste.

---

## R-1 · Does the token architecture this feature writes to actually exist?

**Checked:** `docs/sdd/design/tokens.css`, in full, and `grep -n -i "brand\|on-brand" ` over it.

**Found:** it does **not**. The file has `--navy-900: #1D174D` as a primitive and

```css
--action-primary-bg:     var(--navy-900);
--action-primary-border:  var(--navy-900);
--surface-inverse:        var(--navy-900);
--avatar-fill:            var(--navy-900);
```

There is no `--brand`, no `--on-brand`, and no derived ramp. ADR-012 states *"Every
colour is a CSS custom property on `:root`"* and *"Swapping the brand colour at runtime
is one assignment"* — both true, and neither is the same as the brand layer existing.
The semantic tokens currently point at a **primitive**, and a primitive is not themeable
by definition (`DESIGN-BRIEF.md` rule 2).

**Settled:** `006-design-system` owes this feature seven tokens and one rewiring:

| Owed by `006` | Consumed here |
|---|---|
| `--brand` | Written pre-paint and by the settings screen |
| `--on-brand` | Written pre-paint; computed server-side (R-6) |
| `--brand-hover`, `--brand-active` | Gated for contrast (AC-13) |
| `--brand-subtle`, `--brand-border`, `--brand-ring` | Rendered in the preview; not gated (they never carry `--on-brand` text) |
| Sidebar preset variables, three sets | The mode selector |
| `--action-primary-bg: var(--brand)` — **the rewiring** | Without it the primary button never retints and the whole feature is invisible |

**Consequence for the plan:** this is assumption A-1 and it is the one that can make the
whole feature worthless. `REV-022-01` checks it **before** any frontend task starts, not
after. Also settled: `--border-focus` stays fixed (`var(--blue-500)`), so the focus
*indicator* cannot be destroyed by a brand choice — `--brand-ring` is additive
reinforcement, which is why it is outside the contrast gate.

---

## R-2 · What does the contrast gate actually accept, and what does it refuse?

**Checked:** the formulas in `design/theming.md`, evaluated against the two candidate
foregrounds `#FFFFFF` (L = 1.0) and `#0D2626` (L ≈ 0.01615).

**The boundaries fall out of two equations.** For a brand of relative luminance `L`:

```text
ratio(brand, white) = 1.05 / (L + 0.05)          ≥ 4.5  ⟺  L ≤ 0.1833
ratio(brand, ink)   = (L + 0.05) / 0.066153      ≥ 4.5  ⟺  L ≥ 0.2477
```

**So there is a band — 0.1833 < L < 0.2477 — in which neither foreground reaches
4.5:1.** That band is the entire reason the refusal path exists, and it is **mid
luminance, not pale**. This is the single most useful thing this research produced,
because the intuition in ADR-012 points somewhere else: *"White text on a light yellow
brand is unreadable"* is true, and the gate's answer to light yellow is not refusal — it
is the **ink** foreground, which passes easily. Light yellow is refused by the *surface*
gate instead (R-3), not by this one.

**Consequence for the plan and for the fixture:** `design/theming.md` says *"The
pale-colour fixture matters most."* That is half right and the halves are different
tests:

| Fixture role | Colour | L | Verdict |
|---|---|---|---|
| Exercises the **computed foreground**, ink branch | `#4A9E96` | ≈ 0.283 | Accept, ink, 5.0:1 |
| Exercises the **computed foreground**, white branch | `#1570EF` | ≈ 0.180 | Accept, white, 4.6:1 |
| Exercises the **text-gate refusal** | `#808080` | ≈ 0.216 | **Refuse** — white 3.95:1, ink 4.02:1, both short |
| Exercises the **surface-gate refusal** | `#FFF59D` | ≈ 0.882 | **Refuse** — ink passes at 14:1, button invisible |
| The shipped default, as a regression guard | `#1D174D` | ≈ 0.0141 | Accept, white, 16.4:1 |

A fixture of pale and dark colours only — which is what "include pale ones" produces if
read literally — **never executes the refusal branch**. AC-11 exists to make that
impossible to ship.

`#808080` is the best row in the table: both ratios land near 4:1, so an implementation
that compares against 3:1 by mistake, or that takes the *first* passing foreground
rather than the *higher* one, fails on it.

---

## R-3 · How much of the plausible brand-colour space does this refuse?

**Checked:** the same arithmetic with a non-text-contrast gate added (WCAG 1.4.11, 3:1
for a control boundary against its adjacent surface). Shell surfaces are `#FFFFFF`
(sidebar, header) and `#F9FAFB` (content, L ≈ 0.966). White is the worse case.

```text
ratio(brand, #FFFFFF) = 1.05 / (L + 0.05)        ≥ 3.0  ⟺  L ≤ 0.30
```

Combined with R-2, the accepted region is `L ≤ 0.1833` **or** `0.2477 ≤ L ≤ 0.30`.
Everything lighter than L = 0.30 is refused.

| Colour | L | Verdict |
|---|---|---|
| `#2E7D32` support green | 0.155 | Accept, white |
| `#1570EF` blue | 0.180 | Accept, white |
| `#4A9E96` teal | 0.283 | Accept, ink — surface 3.15:1, a narrow pass |
| `#FFAF36` amber | 0.522 | **Refuse** — surface 1.84:1 |
| `#FFFF00` yellow | 0.928 | **Refuse** — surface 1.07:1 |

**Settled, and it is a tension rather than a clean answer.** Any mid-to-light brand —
orange, amber, pink, a bright cyan — is refused. ADR-012 authorises refusal
(*"Better to refuse a colour than to render text nobody can read"*), and a tenant whose
brand is orange will read the refusal as the product being broken.

**Rejected here, deliberately:** deriving a darkened *action* colour from the raw brand
(`color-mix(in oklab, var(--brand) N%, black)` until the gates pass) so accents keep the
tenant's hue while controls stay legible. It is the right answer and it is a change to
`006`'s ramp — a new token with a new meaning — not a change to a settings screen.
Putting it here would be this feature quietly redesigning the design system. It is Q-F,
with the recommendation attached.

---

## R-4 · Is `color-mix(in oklab, …)` safe to depend on, and what happens if it is not?

**Checked:** the failure mode, which matters more than the support table.

A custom property whose value the browser cannot parse becomes **invalid at
computed-value time**. It does not fall back to the previous declaration — it resolves to
the guaranteed-invalid value, and every `var()` consuming it falls back to its
`unset` behaviour. `background: var(--action-primary-bg)` on a primary button therefore
resolves to `transparent`. **The button loses its fill and keeps its white label**, which
is an invisible button, not a degraded one.

**Settled:** the ramp declarations need an `@supports (color: color-mix(in oklab, red, blue))`
guard with a flat fallback — hover and active falling back to `var(--brand)`, subtle and
border to fixed neutrals, ring to `--border-focus`. An un-hovered but legible interface.

**And it is not this feature's file.** The ramp is `006`'s. Recorded here because this
feature is the first to make the ramp tenant-variable and therefore the first place the
defect could be observed by anyone. `REV-022-02` raises it against `006` rather than
fixing it here, because a second definition of the ramp is worse than the gap.

---

## R-5 · How does an SPA with no SSR get the theme onto `:root` before first paint?

**Checked:** ADR-012 (*"the bootstrap or auth response … written to `:root` before first
paint"*), ADR-011 (no SSR, *"no first-paint requirement"*), and `grep -rn -i "bootstrap"`
across `docs/` — which returns **only** ADR-012, `theming.md`, and
`settings-and-uploads.md`. **There is no bootstrap endpoint anywhere in the blueprint**,
and `05-api-conventions.md`'s endpoint inventory has no candidate.

The constraint and the architecture are in tension on one path. On **sign-in**, the auth
response can carry the theme and the app can write it before it renders anything — that
is straightforwardly ADR-012's design. On a **reload** there is no auth response: the
token is already in hand, so the first authenticated request happens after the bundle has
parsed, and anything a `fetch` returns arrives after first paint by definition.

**Settled, and there is a precedent for it in the blueprint.**
`design/screens/02-app-shell.md`, under Persistence, on the sidebar collapse state:

> Restored **before first paint, like the theme** — otherwise the sidebar renders
> expanded and snaps narrow on every load.

So a synchronous pre-paint read of `localStorage` is already the established mechanism
for exactly this class of value. The theme uses it:

| Load | What paints first | Source |
|---|---|---|
| Sign-in | Product default, on the sign-in screen (Q-A) | Nothing cached yet |
| Immediately after sign-in | The tenant's brand | The auth response, written before the app renders |
| Every later reload | The tenant's brand, pre-paint | The `localStorage` cache, applied by an inline script in `index.html` |
| A reload after someone changed it elsewhere | The **previous** brand, then one correction | Cache, then `GET /api/settings/branding` |

**The cache is never the authority.** The server's value overwrites it on arrival, every
load. What the cache buys is paint order, and nothing else. AC-18 and AC-19 pin both
halves — one write when the cache is warm and correct, one correction when it is stale.

**Rejected:** blocking the app render on the branding fetch. It removes the stale-cache
correction and replaces a one-frame colour change with a blank screen for the duration of
a round trip, on every load. A worse trade at every latency.

**Rejected:** `useEffect`. `design/theming.md` names it: *"`useEffect` runs after paint.
That is the flash."* AC-17 is the criterion that fails it, and it is the only one that
does — an effect-based implementation satisfies every other criterion in this spec.

---

## R-6 · Does the derived ramp go on the wire, or does the browser compute it?

**Checked:** what is a *decision* and what is a *derivation*.

**Settled: only `brandColor`, `sidebarMode`, and `onBrand` cross the wire.**

- The ramp is five `color-mix(in oklab, …)` declarations already sitting in the
  stylesheet. Sending six hex values instead would mean a second implementation of the
  ramp — one in C#, one in CSS — that has to agree forever. Two implementations of one
  rule is how they diverge (the same argument `007` uses for E.164 normalisation).
- `onBrand` **is** sent, because it is not a derivation, it is a decision: it is the
  output of the rule that gates the colour, and Constitution III says the rule lives in
  the domain, once, and *"the server tells the client what is permitted rather than the
  client deriving it."* The client mirrors the computation for immediate feedback in the
  picker and is never the authority (AC-23).

**Rejected:** putting the theme in the JWT claims. Same reasoning as
`design/screens/09-settings-localization.md` gives for the language claim: the claim
would be stale for up to eight hours after a change, and forcing a reissue needs a
refresh-token flow ADR-005 does not build.

---

## R-7 · The types in `settings-and-uploads.md` are PostgreSQL types

**Checked:** `docs/sdd/design/settings-and-uploads.md` against ADR-013.

That file specifies `LogoBytes bytea`, `BrandColor char(7)`, `SidebarMode varchar(10)`.
`bytea` is PostgreSQL, so the file predates ADR-013 superseding ADR-001 and its types
need translating rather than copying.

| In that file | Here | Reason |
|---|---|---|
| `bytea` | — | Not created. Logo is a later story; no speculative column (`001`'s no-speculative-index rule, applied to columns) |
| `char(7)` | `char(7)` | Kept. `#RRGGBB` is ASCII, fixed width, machine-readable — the same reasoning ADR-013 gives for `inet → varchar(45)`: *"ASCII, so `varchar` is correct here"* |
| `varchar(10)` | `nvarchar(10)` | Changed. `001`'s convention table says enums are stored as strings via `HasConversion<string>()`, whose SQL Server default is `nvarchar`. Ten bytes on one row is not worth a divergence from a project-wide convention, and a reviewer seeing one lonely `varchar` column has to work out whether it was deliberate |
| `Id smallint` always 1 | `Id smallint` + `CK_OrganizationSettings_SingleRow` | Kept, including the check constraint the file asks for. AC-25 verifies the constraint's `definition` is non-null, not that the migration mentions it — the same lesson as the filtered-index filter in `001` AC-12 |

---

## R-8 · Does the read need caching, an `ETag`, or a `304`?

**Checked:** the payload. Three short fields and a base64 `rowversion` — under 200 bytes
including headers' worth of JSON.

**Settled: `Cache-Control: no-store`, no `ETag`, no conditional request.** A stale theme
is the precise defect this feature exists to prevent, and adding a conditional-request
path adds a status code and a cache-invalidation question to save a payload smaller than
the request that fetches it.

**Rejected:** the `ETag` plus `Cache-Control: max-age=31536000, immutable` pattern from
`settings-and-uploads.md`. That is the right answer **for the logo** — image bytes,
fetched per page view, with a content-addressable identity. It is the wrong answer for
three fields whose whole job is to be current.

---

## R-9 · Where does the screen spec live, and does this feature need a new one?

**Checked:** `docs/sdd/design/screens/` — eleven files and an inventory. `09` is
Settings · Localization, with a sub-nav reading `GENERAL: Profile · Localization`.

**Settled:** Branding is a **third item in that existing sub-nav**, not a new shell.
`012-settings-branding.md` is a new file in `docs/sdd/design/screens/` following the
template in that folder's README, and it is `DOC-022-01` — owned by this feature but
written into the shared design folder, because the screens inventory is the index a
reviewer reads and a screen missing from it looks unbuilt.

One thing the sub-nav does not currently handle: **Localization is Agent + Manager,
Branding is Manager only.** Screen `09`'s sub-nav has no notion of a hidden item. Q-G
settles it as hidden-for-Agent with the route rendering the forbidden state if reached
directly, and `DOC-022-01` records it in the screen spec so the next person adding a
settings section finds the pattern already decided.

---

## R-10 · Does the sidebar's Dark preset conflict with `color-scheme: light`?

**Checked:** `DESIGN-BRIEF.md` rule 16 — *"Set `color-scheme: light` on the app root.
This product has one appearance."* — against a 288px surface at `#0D1420`.

**Found:** they do not conflict, and there is a detail that bites. `color-scheme` is an
inherited property that can be set per element. The app root stays `light`, satisfying
rule 16 and keeping dark mode out of scope. But the sidebar's nav list scrolls when there
are enough items, and under `color-scheme: light` the browser paints a **light scrollbar
on a near-black surface**. It reads as a rendering bug, and it is the kind of thing that
gets reported as "the sidebar looks broken" with no further detail.

**Settled:** the Dark preset sets `color-scheme: dark` on the sidebar element only. Rule
16 is about the product having one appearance, which it still does — one surface
declaring its own scheme so the UA paints its scrollbar correctly is not a second
appearance. AC-24 asserts both values, because setting it on the root instead would look
identical until someone opens a screen with a scrollbar.

---

## R-11 · Does anything need to change in the localization middleware order?

**Checked:** ADR-007 — `UseRequestLocalization()` must be registered **after**
`UseAuthentication()`, and ADR-007 calls this the most likely defect in the build because
it fails silently.

**Settled: nothing to do, and that is the finding.** This feature adds endpoints and a
validator; it does not touch `Program.cs`'s middleware order. It is recorded because the
refusal message is server-authored and translated (BR-8.6), so if the order were ever
broken this feature's `400` would come back in English for an `ar` request and look like
a missing translation key rather than a middleware ordering bug. `TEST-022-09` asserts
the Arabic refusal, which makes this feature a witness to that ordering rather than a
victim of it.
