# 006 — Data Model

## There is no schema change in this feature, and there is no persistence at all

Stated explicitly rather than omitted, because an absent `data-model.md` reads as an
oversight and an empty one reads as a template that was not filled in.

**No table is created, altered, or dropped. No migration is added.** The migration list
after this feature is identical to the migration list before it — which is itself the
verification: `dotnet ef migrations list` returns the same set as it did after `001`.

## Why there is nothing to store

| Thing that looks like state | Where it actually lives | Why not a table |
|---|---|---|
| The design tokens | `src/wasl-web/src/styles/tokens.css`, committed | `design/design-tokens.md`, *Refresh*: tokens are committed to the repository rather than fetched at build time, so a build never depends on network access or on the design file being in a particular state. A refresh is a normal commit with a normal diff, and if the diff is large that is information |
| The brand colour `--brand` | A static value in `tokens.css`, labelled `(D)` | The tenant theme row is `022`'s. `spec.md` Q-E: the derivation, the `onBrand()` computation, and the pre-paint application point all ship here; the *value* they operate on is a literal until `004`/`022` supply a real one |
| The computed `--on-brand` | Computed at runtime from `--brand` | Storing a derived value is how it goes stale. ADR-012 §2 computes it, and computing it is cheaper than the migration that would keep a stored copy correct |
| The brand ramp — hover, active, subtle, border, ring | Derived in CSS by `color-mix(in oklab, …)` | ADR-012 §1. Derivation in the cascade is the whole point: one variable changes and six follow, with no recomputation and no second copy |
| The sidebar preset | Nowhere yet | `008`, with the shell that has a sidebar. `design/theming.md` specifies three presets and nothing renders one |
| Which primitive states exist | The component's CSS | A state is a rendering, not a record |

## What the persistent shape will be, and who owns it

Recorded so the next feature does not have to re-derive it, and **not designed here**,
because designing a table for a screen that does not exist is how a column ends up
holding something nobody wanted.

- The tenant theme — one brand colour and one sidebar preset — is designed in
  `docs/sdd/design/settings-and-uploads.md` and built by
  `022-tenant-theming-settings`.
- The logo upload named in ADR-012 is *planned, not excluded*, and is also `022` or
  later.
- Neither is in this feature's scope, and neither is a dependency of it: the token
  architecture is demonstrated by changing three variables in dev tools and watching the
  interface retint, which ADR-012 argues proves the architecture more convincingly than
  a settings page proves anything.

## Constraints this feature is nevertheless bound by

The SQL Server rules in the constitution do not disappear just because nothing is
stored; they apply to the feature that stores it. Repeated here as a handoff to `022`,
not as work:

| Rule | Applies to `022` as |
|---|---|
| `nvarchar`, never `varchar`, for human text | The preset name and any label a tenant types. `varchar` returns `????` for Arabic |
| `datetime2(3)` plus the global UTC converter | Any `UpdatedAtUtc` on the theme row |
| `rowversion`, maintained by the database | The theme row's concurrency token, if two administrators edit the branding at once |
| A constraint wherever an invariant must hold | The brand colour must satisfy AC-7's contrast rule. That is a **domain** invariant, not a `CHECK` constraint — the contrast computation cannot be expressed in T-SQL, so it is enforced in `Wasl.Domain` and the database stores what the domain approved |

That last row is the one worth carrying forward: the validation that refuses an
unreadable brand colour is the same function this feature ships and unit-tests
(`lib/theme/contrast.ts` for the client mirror), and `022`'s server-side enforcement is
the authority. The client mirrors the rule so the tenant is told sooner; it is never the
authority (constitution principle III).

## Verification

| Claim | How it is checked |
|---|---|
| No migration was added | `dotnet ef migrations list` is unchanged from `001` |
| No `DbContext` change | `git diff --stat` over `src/Wasl.Api/Common/Persistence/` is empty for this feature |
| Tokens are committed, not fetched | `npm run build` succeeds with the network unavailable |
| The application's tokens have not drifted from the blueprint's | `npm run lint:tokens` diffs `src/wasl-web/src/styles/tokens.css` against `docs/sdd/design/tokens.css` and fails on a changed value that carries an `(A)`, `(B)`, or `(C)` label |
