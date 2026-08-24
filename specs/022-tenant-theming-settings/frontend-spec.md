# 022 — Frontend Spec

**Screen:** Settings · Branding · **Route:** `/settings/branding` · **Story:** — ·
**Who can reach it:** **Manager only** (spec Q-G). An Agent does not see the nav item and
gets the forbidden state if they navigate directly

The element-by-element screen spec — regions, tokens, icons — is `DOC-022-01`:
`docs/sdd/design/screens/012-settings-branding.md`, written to the template in that
folder's README, joining the sub-nav that
[`09-settings-localization.md`](../../docs/sdd/design/screens/09-settings-localization.md)
already establishes. It is not duplicated here. This file carries what is specific to
**this feature's** build: the contract binding, every state, the i18n keys, the RTL
obligations, and the accessibility obligations.

The API surface is [`FRONTEND-API-GUIDE.md`](FRONTEND-API-GUIDE.md).

---

## Components

| Component | Kind (ADR-011 §4) | Fetches? |
|---|---|---|
| `BrandingSettingsPage` | Route / page | **Yes** — owns `brandingQuery` and the mutation |
| `BrandColorField` | Feature | No |
| `ContrastVerdict` | Feature | No |
| `SidebarModePicker` | Feature | No |
| `FixedTokensNotice` | Feature | No |
| `BrandPreview` | Feature | No |
| `SettingsNav` | Feature — **changed**, owned by `014` | No |
| `Input`, `Button`, `Radio`, `Badge`, `Callout` | Primitive | No |

Fetching only at the route level (ADR-011 §4). No global store: the form is React Hook
Form, the branding is TanStack Query, and there is nothing left over (ADR-011 decision 1).

**The theme itself is not React state.** It is two CSS custom properties on
`document.documentElement`, written by `applyTheme.ts`. Putting it in a provider would
re-render the tree on every change and would not survive the pre-paint requirement, which
runs before React exists (AC-17).

## Fields

| Field | Control | Required | Client rule (a mirror) | Serves |
|---|---|---|---|---|
| `brandColor` | Hex text `Input` **plus** a native `type=color` swatch, bound to one value | yes | `/^#[0-9A-Fa-f]{6}$/`, then the mirrored contrast gate for live feedback | AC-7, AC-22 |
| `sidebarMode` | Three `Radio` preset cards — Light · Dark · Brand | yes | One of the three; no free colour input exists on this screen | AC-14 |
| `expectedVersion` | Hidden, from the last read | yes | Present. Never editable | AC-6 |

The hex field is the primary input and the swatch is secondary, not the reverse. A tenant
arrives with a brand hex from a brand guideline; a native colour picker makes them
approximate a value they already know exactly, and it is not keyboard-operable for
entering a specific value (AC-22).

**The mirror predicts; it never decides.** A colour the mirror refuses still submits if
the user insists, because the server is the authority and a client that silently blocks a
request cannot be wrong in a way anyone can see (ADR-003, AC-23).

## States — every one of them

| State | What the user sees | AC |
|---|---|---|
| **Loading** | Skeleton for the field, the presets, and the preview. Not a spinner over the whole page — the notice text is static and can render immediately | — |
| **Forbidden** | An Agent who navigated directly: an explanation and a link back to Settings. No form, so no request to fail (ADR-011 §5, Q-G) | AC-5 |
| **Idle** | Current values, Save disabled — nothing has changed | — |
| **Dirty** | Save enabled; the preview retints live from the local value, before any request | AC-13 |
| **Predicting** | The mirror has refused the typed value: the verdict region says so, Save stays enabled | AC-23 |
| **Submitting** | Save disabled and showing progress; a double-click sends one request | — |
| **Refused** (`400 errors/inaccessible-brand-color`) | The server's message, the reason from `refusedBy`, and both ratios formatted client-side. Announced, not only coloured. The previous theme stays applied — a refused colour never reaches `:root` | AC-8, AC-12, AC-21 |
| **Validation error** (`400 errors/validation`) | The message on the named field. A typo, handled inline as a typo | AC-7, AC-14 |
| **Conflict** (`409`) | "Someone else changed this" plus a Reload action that refetches and discards the local edit. Never a silent retry (ADR-006) | AC-6 |
| **Success** | Toast, `:root` rewritten once, the cache rewritten, `version` replaced. The interface retints in place — no reload | AC-4, AC-18 |
| **Unexpected** | Route-level `ErrorBoundary` (ADR-011 §5) | — |

**There is no empty state.** The row is always seeded, so there is no collection and no
"not configured" (AC-1). Recorded so the omission is visibly a decision.

`401` is not a form state: the session expired, so it redirects to sign-in.

## What the screen must say out loud

`FixedTokensNotice` is **permanently visible text**, not a tooltip and not behind a
disclosure (AC-20). ADR-012 part 3:

> This is worth stating to the tenant in the UI, not just enforcing silently — otherwise
> the first question is "why can't I change these?"

It names what is fixed — status and priority colours, the neutral ramp, text and borders —
and gives the reason in one sentence: a status colour is meaning, not branding, and a
product whose "success" colour can be set to red is a product that can lie about state.

`BrandPreview` renders a **fixed** status chip beside the branded button for the same
reason, so the boundary is visible rather than only described.

## Localization

Every string is a key. No literals in JSX (BR-8.8), enforced by lint.

| Key | `en` | Note |
|---|---|---|
| `settings:nav.branding` | Branding | The sub-nav item; hidden for an Agent |
| `settings:branding.title` | Branding | Section heading |
| `settings:branding.body` | Your brand colour is applied across buttons, links, and highlights. | |
| `settings:branding.color.label` | Brand colour | Label for the hex field, not a placeholder |
| `settings:branding.color.help` | Six hexadecimal digits, for example #1D174D. | The example is not translated — it is a value |
| `settings:branding.color.swatch` | Pick a colour | Accessible name for the native swatch |
| `settings:branding.sidebar.legend` | Sidebar | `fieldset` legend for the preset group |
| `settings:branding.sidebar.light` | Light | Label for the enum value `Light`. **The value is never translated** (BR-8.7) |
| `settings:branding.sidebar.dark` | Dark | |
| `settings:branding.sidebar.brand` | Brand | |
| `settings:branding.sidebar.brandHelp` | Uses your brand colour, with text chosen automatically for readability. | Explains the computed foreground without naming luminance |
| `settings:branding.fixed.title` | What cannot be changed | |
| `settings:branding.fixed.body` | Status and priority colours, text, and borders stay the same for everyone. A colour that means "resolved" has to mean it in every organisation. | AC-20 |
| `settings:branding.verdict.ok` | Text will be readable on this colour. | |
| `settings:branding.verdict.ratio` | Contrast {{ratio}}:1, minimum {{required}}:1 | Interpolated. The numbers are formatted client-side in the active locale |
| `settings:branding.verdict.refusedText` | No text colour is readable on this colour. Try a darker or a lighter shade. | Mirrors `refusedBy: "text"` |
| `settings:branding.verdict.refusedHover` | This colour is readable, but its hover shade is not. Try a darker shade. | Mirrors `refusedBy: "hover"` |
| `settings:branding.verdict.refusedSurface` | This colour is too light to be visible as a button on a white page. | Mirrors `refusedBy: "surface"` |
| `settings:branding.preview.title` | Preview | |
| `settings:branding.preview.statusExample` | Resolved | On the **fixed** status chip in the preview |
| `settings:branding.save` | Save | |
| `settings:branding.saving` | Saving… | |
| `settings:branding.saved` | Branding updated | Toast |
| `settings:branding.conflict` | Someone else changed this. Reload to see the current values. | AC-6 |
| `settings:branding.conflictAction` | Reload | |
| `settings:branding.forbidden` | Only a manager can change branding. | AC-5, Q-G |

Every key exists in `ar`, enforced by the parity test (BR-8.11) — not by discipline.

**Server-authored messages are not in this table.** The refusal `title`, `detail`, and the
`errors` message arrive already translated (BR-8.6) and are rendered as received. The
`verdict.refused*` keys above are the **mirror's** messages, shown before a request is
made; once the server has answered, the server's sentence is the one on screen. Both exist
because they are said at different moments, and neither re-translates the other.

## Right-to-left

| Concern | Requirement |
|---|---|
| Direction | `dir` on the document root, set once (ADR-007 §6) |
| Layout | CSS logical properties throughout. `margin-inline-start`, never `margin-left` |
| The hex value | **`dir="ltr"` explicitly — not `dir="auto"`.** `#1D174D` contains Latin letters, so `auto` resolves LTR and looks correct; `#123456` contains none, so `auto` falls back to the paragraph direction and renders the `#` on the right in Arabic. The same field would then render two ways depending on which colour was typed, which is the kind of defect that gets reported as "sometimes the colour box looks wrong" |
| The contrast ratio | `dir="ltr"` on the rendered ratio for the same reason: `4.02:1` is digits and a colon, all direction-neutral, so it mirrors to `1:4.02` inside an Arabic paragraph. A number that reads backwards is worse than no number |
| The native swatch | Does not mirror. A UA control; it is positioned with logical properties and left alone |
| The preset cards | Mirror with the layout. They are a list, not a progression |
| The preview's sidebar | Mirrors — it must, because the real sidebar moves to the inline-end in Arabic (`02-app-shell.md`). A preview that does not mirror is showing the wrong product |
| The ramp strip in the preview | Mirrors. It is ordered default → hover → active, which is a sequence in reading order, not a physical direction |

`FE-022-07` walks this screen in Arabic and records what it found. RTL defects are
visual — no assertion catches a preset card sized to the English word "Brand".

## Accessibility

| Requirement | Verified by |
|---|---|
| The hex field has a programmatic label; the placeholder is not standing in for one | `FE-022-07` |
| The native swatch has an accessible name of its own (`settings:branding.color.swatch`) — an unlabelled colour input is announced as "colour" | `FE-022-07` |
| The three presets are a `fieldset` with a `legend`, arrow-key navigable as one radio group — not three checkboxes and not three buttons | `FE-022-07` |
| `ContrastVerdict` is `aria-live="polite"` and carries its message as **text**; the verdict is never conveyed by colour alone | AC-21 |
| The refusal does not move focus. The user is still typing; stealing focus to an error region loses their cursor position | `FE-022-07` |
| Every control keyboard reachable with a visible focus ring, using the **fixed** `--border-focus` — the focus indicator cannot be destroyed by a brand choice (`research.md` R-1) | `FE-022-07` |
| `BrandPreview` is not the only place information appears: everything it shows is also stated in text, because a preview is an image to a screen reader | `FE-022-07` |
| Save's disabled state is conveyed, not only styled | `FE-022-07` |
| In **Brand** sidebar mode, sidebar text reaches 4.5:1 for every accepted colour; mixed foregrounds are borders only | AC-15 |
| The **Dark** preset scopes `color-scheme: dark` to the sidebar element; the root stays `light` | AC-24 |

## Preview before build — not optional

`FE-022-00` renders this screen with real tokens, real copy, plausible values, **every**
state above, and both languages **before** anything is wired
(ADR-009, `design/preview-first-workflow.md`).

Two things this preview exists to find, which a wired screen finds expensively:

1. **The refused state is the important one and it is the one nobody draws.** A preview
   with only the accepted state means the refusal is designed while a test is red.
2. **The preview must be rendered with a refused colour applied to the preview panel
   only** — the surrounding interface keeps the saved theme. Getting that boundary wrong
   means typing an invalid colour retints the whole application, which looks like the
   product accepting something it is about to reject.

## Not on this screen

| Excluded | Where |
|---|---|
| Logo upload, and the logo's fallback to the product mark | `docs/sdd/design/settings-and-uploads.md` — a later story than this one |
| A user avatar | Same file, same later story |
| Any second colour, a palette editor, or a token-by-token editor | Nowhere. ADR-012: a tenant who wants nine values wants a design system |
| A free sidebar colour | Nowhere. Three presets, ADR-012 part 4 |
| Dark mode, or a light/dark toggle for the app | Nowhere. `DESIGN-BRIEF.md` rule 16 |
| Editing a status or priority colour | Nowhere, permanently — and the screen says so rather than omitting it silently (AC-20) |
| A per-user override of the organisation's brand | Nowhere. ADR-012: screenshots in a support conversation would not match |
| A suggested nearest acceptable colour when one is refused | Nowhere. Not specified, and inventing it here is this screen designing a palette feature (Q-F records the real answer, which lives in `006`) |
| Language and profile | `/settings/localization` (`014`) and `/settings/profile` |
