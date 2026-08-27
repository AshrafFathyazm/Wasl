# 023 — Summary

**Delivered** 2026-08-25 · Frontend lane only · Evidence: [`tests.md`](tests.md)

Nothing in `src/Wasl.Api`, `src/Wasl.Application`, `src/Wasl.Domain`,
`src/Wasl.Infrastructure`, or `tests/` was created or changed. No `dotnet` command was
run — the working tree is shared with the backend lane.

---

## What was built

61 files under `src/wasl-web`, in four approved stages with a stop after each.

| Stage | Produced |
|---|---|
| **1 — Spec** | [`spec.md`](spec.md) — folder tree, dependencies with reasons, three primitives, shell geometry, API contract, i18n, out-of-scope, twelve open questions |
| **2 — Scaffold** | Vite + React + TS `strict` · ESLint · Prettier · stylelint · the no-literal-string rule · `tokens.css` copied verbatim · icons and the mark copied in |
| **3 — Build** | `Button` · `Input` · `Badge` · `Loader` · `/_preview` · `lib/api.ts` · i18n with `en`/`ar` and pre-paint `dir`/`lang` |
| **4 — Shell** | Sidebar · header · routing · collapse and drawer · flyout and tooltip · user popover — all on static data |

Every gate is green and every claim in `tests.md` was observed, not asserted.

---

## Decisions that are not obvious from the code

### `Badge` is specified on tone, not on status

`component-inventory.md` calls Badge “where the domain leaks in” and enumerates twelve
domain variants. **The leak is deferred, not taken.** Five tones × two appearances covers
all twelve without this foundation declaring what a ticket status is. The map from a raw
enum value to a tone is a product decision and belongs to the first ticket feature, which
will key it on the **untranslated** value — keying it on a label renders neutral for every
Arabic user and nothing fails.

### `Tooltip` and `NavFlyout` live in `shell/`, not `components/`

`component-inventory.md` lists both under *Not built* — “no screen needs them”. The
collapsed sidebar needs three. The eight-primitive cap applies to `components/`, and
spending three slots on something with one consumer is the same speculative work the cap
exists to prevent. The consequence is stated rather than discovered: **they are not
general purpose.** No portal, no collision detection, no arbitrary placement.

### The wordmark is a brand asset, not copy

**وصل** over **WASL**, both scripts in both locales, in `src/brand/wordmark.ts` — not in
the catalogue, where a translator could “fix” the logo. `common:productName` still exists
and is still used, for the accessible name and the document title.

### One place writes `dir` and `lang`

`lib/direction.ts`, plus one inline pre-paint copy in `index.html` because a module cannot
run before first paint. The duplication is deliberate and both copies say so.

### The API client declares no endpoint and no domain type

`ProblemDetails` is a transport shape — identical for every endpoint — so it may live
there. `Ticket` and `Customer` may not: ADR-011 §6 requires them generated from the
OpenAPI document so a contract change is a compile error, and hand-writing one here is the
exact defect that rule prevents.

---

## Deviations from the approved spec, each with its reason

| Deviation | Why |
|---|---|
| **`react-router-dom` `^6` → `^7.18.2`** | `npm audit` reported an open-redirect via backslash in `<Link>`/`useNavigate` (GHSA-wrjc-x8rr-h8h6) with no patch on the 6.x line. Upgraded before the shell was written, when the cost was zero. `found 0 vulnerabilities` after |
| **`i18next` `^26`, `react-i18next` `^17`** | npm resolved current majors. The spec has been corrected to match what is installed, so the two cannot disagree. 0 vulnerabilities |
| **Three stylesheets, not four** | The spec's tree says four — a carry-over from a draft with a separate `theme.css`. The brand ramp lives in `tokens.css`, so there are three. Recorded in `main.tsx` |
| **`tsconfig` split in three, and `strict` set explicitly** | The Vite template ships `tsconfig.app.json` with a `/* Linting */` heading and four strictness flags and **no `"strict": true`** — it reads as strict and is not. `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes` are now explicit |
| **ESLint instead of the template's oxlint** | The no-user-facing-literal rule needs an esquery selector (`JSXText[value=/\S/]`) |
| **`width` not `height` removed from the stylelint ban** | Not direction-dependent, not required by ADR-007 §6, and banning it would have blocked the sidebar's documented width animation |
| **Placeholder routes for every nav destination** | The spec's route table lists `/` and `/_preview`, written before the shell was in scope. A shell whose nav 404s cannot demonstrate active state, breadcrumb, or group-stays-open. Paths come from `NAV_PATHS`, so a nav item can never point at a missing route. Confirmed by the product owner on the evidence that all five routes have distinct active states and breadcrumbs |
| **Two icons authored** — `IconSettings`, `IconSignOut` | `02-app-shell.md` asks for “icon + label” on both popover rows and the inherited set has neither. Raised under DESIGN-BRIEF rule 3; the product owner's answer was to draw them to the set's rules. Kept in `icons-added.tsx` so `icons.tsx` stays a byte-for-byte copy |
| **The parent nav group is not marked active while a child is** | `02-app-shell.md`: the parent “stays **expanded**”. Marking both put two bars in one column. Collapsed is the exception — the children are not rendered there at all |
| **The collapsed CTA is square** | It does **not** disappear: `02-app-shell.md` turns it into an icon with an `aria-label`, and hiding the most frequent action when the window narrows — automatically, unasked — is backwards. At `51.2 × 40` against a `32 × 32` tile it read as a repeated tile; square, it reads as a button |

---

## Changes made to `docs/sdd/design/`

The one authorised exception to not editing shared files.

**`tokens.css`** — `152 → 169` declarations. Added `--brand` + `--on-brand` + the five
oklab derivations · `--focus-ring` + `--focus-ring-width` · `--sidebar-width-collapsed`
`68px` · `--nav-item-height` `48px` · `--nav-child-height` `40px` · `--badge-dot-size`
`7px` · the four `--z-*` layers. Repointed `--action-primary-*` at `--brand` and
`--action-secondary-border`/`-text` at `--brand-border`/`--brand` — a `--brand` nothing
points at is a dead token. Corrected `--avatar-size` `27px → 32px` (27 was measured off a
vector export; `02-app-shell.md` reads 32 off the layer). Added notes 10 and 11.

**`layout-patterns.md`** — one line under the heading: the numbers there are stale and
`tokens.css` is the reference. Its `288 × 896` and `~46px` contradict the settled 956 / 48.

---

## Known limitations

1. **`prefers-reduced-motion` has never been seen.** The CSS exists in `base.css` and
   `Loader.module.css`; the browser tool cannot emulate that media feature. First thing to
   check by hand.
2. **The drawer below 780px has never been rendered.** Implemented, typechecked, unseen.
3. **No automated test exists.** Every result in `tests.md` is an observation. Repeating
   them is manual.
4. **No contrast ratio was measured.** `--brand-subtle` behind the active nav row and the
   disabled pairs are the first two worth measuring.
5. **The content area is empty.** Five routes render the same empty placeholder. That is
   the agreed stopping point, not an oversight.
6. **Literals with no token behind them**, each marked `TODO` in place and gathered under
   spec Q-8: the 26px collapse toggle, the 3px active bar, the 220ms collapse and 140ms
   flyout delay, the loader's geometry, and the 1100/780 breakpoints. `tokens.css` has no
   motion, shadow, or breakpoint token, and DESIGN-BRIEF rule 3 forbids inventing one.
7. **Fonts come from the Google CDN.** Offline it falls back to a face nobody chose — for
   Arabic that is the Q-15 defect reproduced by an infrastructure choice. A time decision,
   not an engineering one (spec Q-1).
8. **The Arabic walk is done** — `tests.md` §11, 2026-08-26. One defect found and fixed:
   a machine-readable identifier mangled by bidi. Twenty-two checks held. The drawer below
   780px and `prefers-reduced-motion` are still the two things nobody has seen.

---

## Defects found by measuring rather than reading

Recorded because each looked like success until it was measured.

| Defect | How it presented |
|---|---|
| `transition: inline-size` does not interpolate in Chrome | The sidebar applied every collapsed declaration and left the width at 288. It **looked** collapsed and was not |
| `-webkit-text-fill-color` inherits and beats a descendant's `color` | White avatar initials rendered invisible on navy; the muted email came out dark |
| A `<button>` with `display:flex` shrinks to fit; an `<a>` fills | The collapsed nav group became 18px, the active bar landed on the icon and clipped it — a broken glyph, not a sizing bug |
| `body`'s explicit `font-family` beats inheritance from `<html lang="ar">` | Arabic not tagged per-element rendered in a Latin face with no Arabic glyphs |
| `import.meta.env.DEV` around a route does not remove a top-level `lazy(import())` | `/_preview` and its CSS shipped in the production bundle while the comment said they did not |
| `loading` implies `disabled`, so `:disabled` styling won | A working button wore the unavailable palette |
| `dir="auto"` conflates alignment with text direction | A field label hugged one edge and its own message the other, because the message was Latin and computed `ltr`. BR-8.12 makes that a documented path, not an edge case. Fixed with `<bdi>`: the container follows the interface, the text follows itself |
| A logical property inside an assembly that is mirrored as a whole | The loader mirrored twice and cancelled: the node stayed on the right under RTL while the dots ran away from it. The keyframes are physical because they are copied verbatim; the positioning was logical |
| A leading hyphen is directionally NEUTRAL | `--surface-page` rendered as `surface-page--` in the RTL preview. A machine-readable identifier is never translated, but it still has to be pinned with `dir="ltr"` or bidi reorders it and the reader copies a string that does not exist |
| A flex `gap` after a zero-width sibling still occupies space | The collapsed brand tile sat 10px off the rail axis while everything below it was centred — reported as a spacing problem when the vertical gaps were a uniform 16px |
| Three static dots | A default spinner — the one thing `design/brand.md` §2 says must not ship |

---

## Carried forward from the backend lane

Recorded so the next feature does not build on a stale assumption. Received during this
work; nothing in the foundation depends on it, and nothing was changed in response.

- `specs/009-create-ticket/contracts/tickets-api.md` is **frozen** and describes the final
  shape, but `004-auth` is not built. Until it is: **no `Authorization: Bearer`, no `401`,
  the endpoint is temporarily open.** No login screen and no route protection were built —
  `lib/api.ts` carries one `TODO — 004-auth-and-roles` at the insertion point and attaches
  nothing.
- `createdByUserId` is present in the `201` shape with a value of `null`. Any screen
  showing the creator must handle `null` from the start, and the type is **nullable, not
  optional**.
- The shape does not change when `004` lands; only the value is filled in.
- The create-ticket form is `024-frontend-create-ticket-form`. Not started. Its sources are the
  frozen contract above and `specs/009-create-ticket/FRONTEND-API-GUIDE.md`.

---

## Still open

Spec Q-1 fonts · Q-4 the backend port (`http://localhost:5000` assumed; one line in one
untracked file if wrong) · Q-5 whether `errors` appears on `409` — answered **`400` only**,
and the `409` example in `05-api-conventions.md` is wrong in the document · Q-6 exact
version pins · Q-8 the untokenised literals · Q-11 permission to reuse the house assets.

Q-3 (Badge tone), Q-7 (`/_preview` dev-only), Q-9 (`--brand` repointed), Q-10
(`layout-patterns.md` left stale), and Q-12 (the Arabic typeface) were answered during the
work and are recorded above.
