# 022 — Review

**Phase:** 6 · **Role:** Review · **Status:** Complete · **Date:** 2026-10-04

Scope: this story's blast radius, not the whole system.

**Who reviewed this.** The main session, self-reviewing. The product owner was present for the
four rulings at the approval gate and for the ramp decision, which are the decisions that
shaped the feature; the code review itself is a self-review and is stated as such rather than
dressed up. Every ruling is in `spec.md` under *Corrections and rulings at the approval gate*,
so any of them can be overturned without re-deriving the reasoning.

## Blocking Issues

| # | File | Issue | Required change |
|---|---|---|---|
| — | — | None found | — |

## Non-Blocking Improvements

| # | File | Suggestion |
|---|---|---|
| 1 | `src/wasl-web/src/styles/tokens.css` | The Brand preset's border is `--on-brand` at 20%, measuring 1.14–1.91:1. AC-15 says 3:1; the shipped Light sidebar has never met that either. Q-I |
| 2 | `src/wasl-web/src/features/settings/BrandingPage.tsx` | Not walked keyboard-only or with a screen reader. Third feature in a row to record this; it belongs to whoever owns accessibility as a task |
| 3 | `src/wasl-web/src/lib/api-types.provisional.ts` | Four more hand-written shapes. Still blocked on the OpenAPI document being exported, which `002c` deliberately does not serve |
| 4 | `src/Wasl.Domain/Settings/BrandContrast.cs` | Out-of-gamut mixes are **clipped**, not gamut-mapped per CSS Color 4. Correct for every mix this ramp performs (a point between two in-gamut colours is in gamut) and stated in the method, but it would diverge the day someone mixes toward a saturated colour |
| 5 | `src/Wasl.Application/Features/Settings/` | `GetBrandingQuery` and the token handler both throw `InvalidOperationException` when the row is missing. Correct — it means the migration has not run — but the message is duplicated in two files |

## Missing Tests

| Rule or AC | What is missing |
|---|---|
| AC-19 | A two-device run. Recorded **Partial** |
| Accessibility | Keyboard-only and screen-reader walk of the form |
| ADR-006 | Two concurrent `PUT`s on one version. The sequential case passes; the mechanism is `rowversion`, unchanged since `007` AC-13 |
| `research.md` R-4 | The `@supports` fallback for a browser without `color-mix`. Raised against `006` (REV-022-02), not owned here |

## Acceptance Criteria Status

| AC | Met / Not met / Partial | Note |
|---|---|---|
| AC-1 … AC-14 | **Met** | Every one named to a test in `tests.md`. AC-13 is the one that found `006`'s ramp |
| AC-15 | **Met for text; border is Q-I** | Measured over 1800 accepted brands. The 72% muted text FAILED — 1079 below 4.5:1 — and was replaced with the full foreground, which AC-15 had prescribed in words |
| AC-16 … AC-18 | **Met** | AC-16 measured over 60 fixed tokens, 0 drifted; AC-17 at 52.9 ms against a 476 ms first paint |
| AC-19 | **Partial** | One device |
| AC-20 … AC-27 | **Met** | AC-24 **failed first**, in a browser, and the fix is verified |

## Boundary Check

| Check | Result |
|---|---|
| Domain logic outside controllers and components | **Pass.** The gate and the outcome both live in `BrandContrast`/`OrganizationSettings`; the handler orders the version check and the gate; the controller binds, authorises, dispatches and maps |
| Domain has no infrastructure dependency | **Pass.** `Wasl.Domain/Settings/` names no EF type and no HTTP type. `BrandContrast` is arithmetic |
| The client is not the authority | **Pass, and asserted.** There is **no contrast gate in the client at all** — the screen submits and renders the server's verdict (AC-23) |
| DTOs at the boundary | **Pass.** `UpdateBrandingRequest` is three fields. **No `onBrand`** — a client-supplied foreground would defeat the whole accessibility rule while looking like a preference |
| Every new index justified | **No new index.** One row, one primary key, one check constraint |
| No query inside a loop | **Pass.** One row, one read |
| `CancellationToken` threaded through | **Pass** |
| `DateTime.UtcNow` anywhere | **None.** The seed timestamp is a literal, for the reason in the configuration |
| Two tables written without a transaction | **N/A.** One table |
| Check-then-act as the guarantee | **Not relied on.** `CK_OrganizationSettings_SingleRow` is a database rule, and the explicit version check is the *message* while the `rowversion` is the *rule* |
| An external call inside the transaction | **None** |
| A deadlock translated | **Pass, inherited** from `036b` |
| Rate limiting | Inherited from `036` §3.4. No endpoint-specific limit: this is a Manager-only write of a single row, and a flood of it is self-defeating — the second request gets a `409` |

## Security Notes

Against `docs/sdd/testing/security-checklist.md`.

| Concern | Finding |
|---|---|
| Role enforcement | `ManagerOnly` on the `PUT`, the policy's **second** production consumer after `016`. Verified: `403`, enveloped body (`004b`), stored row byte-identical afterwards |
| The read is deliberately wider | Any authenticated user. Every screen is painted with it; restricting it would leave Agents on the default theme |
| Enumeration oracle | **Not applicable.** One row, no id in any request, nothing to enumerate |
| Mass assignment | **Closed.** Three fields on the wire. `onBrand`, `updatedAtUtc`, `version`-as-output and the id are all server-owned |
| Sensitive data in the audit diff | **None.** The diff carries a hex colour and a mode name. Deliberately **not** redacted: a branding audit row that refused to say which colour was set would record nothing worth keeping, and BR-9.7 is about secrets and human text |
| PII in a refusal body | **None.** The refusal carries five numbers and a field name |
| A secret in the diff | **None.** No new configuration, no new secret — the five in `CLAUDE.md` are unchanged |
| Unvalidated input reaching the engine | **None.** `TryNormalise` admits exactly `#` plus six hex digits; nothing is interpolated into SQL |
| A client-supplied value defeating a safety rule | **The one to watch, and it is closed.** The contrast gate is server-side only, and the integration refusals all go through HTTP rather than the form |

## Scope Check

| Built | In `spec.md`? | Justification |
|---|---|---|
| The sidebar preset layer | No — A-1 assumed `006` shipped it | Ruled at the gate. Three documents disagreed; the stylesheet settled it |
| The ramp direction fix | No | The hover gate refused nearly every colour, including the contract's own example. Ruled by the product owner with the measured table |
| `tokenReferences.test.ts` | No | Four invented token names had already shipped a panel with no background. `032` had the same idea scoped to one folder |
| `--font-mono` | No | Referenced by `024` in two places and never defined; both declarations were being dropped |
| `DomainException.MachineExtensions` | Implied by AC-8 | Numbers on `ProblemDetails` that must **not** go through the catalogue. No mechanism existed |
| `SettingsNav` | Implied by FE-022-08 | The settings area has two screens now. `Sidebar.tsx` recorded the reason there was no nav, and that reason expired |
| The toast | No — asked for by the product owner mid-build | The retint is global and the Save button is nowhere near the sidebar that changes |
| Splitting `.identityEmail` from `.popoverEmail` | No | One rule served a sidebar surface and a floating card; the presets would have had to choose between them |

**Nothing here widens the feature's behaviour.** Each item is a guard, a correction to something
already shipped, or a consequence of a ruling.

## Open for the product owner

1. **Q-H** — `--action-secondary-text: var(--brand)` renders the brand as **text** on white, a
   4.5:1 requirement, while the ruled surface gate holds the brand to 3:1. Measured: teal
   `#4A9E96` scores **3.17**, passes every ruled check, and produces a secondary button whose
   label is unreadable. **Not implemented** — a fourth gate is a decision, and three were signed
   off. Recorded in `spec.md`.
2. **Q-I** — AC-15 holds sidebar borders to 3:1. The Brand border measures 1.14–1.91:1, and the
   shipped Light sidebar has never met 3:1. Treat dividers as decorative (WCAG 1.4.11 asks 3:1 only
   of a boundary needed to identify a component), or restyle every preset.
3. **The accepted set is narrow.** Orange and amber are refused. Ruled under Q-F, with the
   darkened-action-colour revisit named.

## Verdict

**`Approved`**, with AC-19 recorded **Partial**, Q-H and Q-I open, and the final cosmetic
browser pass incomplete for an environment reason stated in `summary.md` rather than claimed.
