# 031 — Dropdown · tasks

Lane: frontend only. No `.cs` file, no endpoint, no migration.

| ID | Task | Agent | Skill | Done |
|---|---|---|---|---|
| DOC-031-01 | Spec, with the six token conflicts resolved against `tokens.css`'s own near-match rule | claude | — | ✅ |
| DOC-031-02 | Resolve the `029` folder collision; renumber and record it in §0 | claude | — | ✅ |
| DOC-031-03 | Record that `029-loader-system`'s five `Select` loading states presuppose this component | claude | — | ✅ |
| FE-031-01 | Tokens: `--shadow-md`, the three durations, two easings, nine `--dropdown-*`; correct note 11 | claude | `frontend-design` | ✅ |
| FE-031-02 | `common:dropdown.*` — ten keys, `en` + `ar`, parity-gated | claude | — | ✅ |
| FE-031-03 | `useMenuSurface` — portal geometry, flip, dismissal, focus return | claude | — | ✅ |
| FE-031-04 | `Dropdown` — single, multiple, searchable, three sizes, twelve states | claude | `frontend-design` | ✅ |
| FE-031-05 | `IconCheck`, scaled into the 24 box rather than pasted from the document's 16 | claude | — | ✅ |
| FE-031-06 | Migrate `CreateTicketPage` ×3 | claude | — | ✅ |
| FE-031-07 | Migrate `TicketListPage` rows-per-page; retire `.select` | claude | — | ✅ |
| FE-031-08 | Migrate `dev/TicketDetailPreview` — unplanned, the other lane added a `<Select>` mid-flight | claude | — | ✅ |
| FE-031-09 | Delete `components/Select/` | claude | — | ✅ |
| FE-031-10 | `/_preview` — twelve state tiles, three sizes beside an `Input`, two direction tiles | claude | `frontend-design` | ✅ |
| TEST-031-01 | 21 tests: seven bindings, focus contract, Arabic typeahead, `+N`, empty menu, disabled option, clear, direction | claude | `superpowers:test-driven-development` | ✅ |
| TEST-031-02 | `scripts/check-no-native-select.mjs` (AC-1) + `npm run lint:select` | claude | — | ✅ |
| TEST-031-03 | `scripts/check-semantic-tokens.mjs` (AC-3) + `npm run lint:tokens` | claude | — | ✅ |
| TEST-031-04 | Watch both gates fail on real code before accepting them | claude | — | ✅ |
| DOC-031-04 | `component-inventory.md`: row *Select* → *Dropdown* (Q-1) | claude | — | ✅ |
| DOC-031-05 | Correct AC-3, AC-12, AC-13 against what was measured | claude | — | ✅ |
| DOC-031-06 | `tests.md` · `summary.md` | claude | `verify-story` | ✅ |

## Dropped, with a reason

| ID | Task | Why |
|---|---|---|
| FE-031-11 | Migrate `CustomerPicker` | Not a dropdown. Three measured reasons in spec §4.1, plus `component-inventory.md` ruling it out under *Not built* before this feature existed |
| TEST-031-05 | Assert the upward flip (AC-10) | jsdom computes no layout; the assertion would pass against a function that never flips. `tests.md` §5 |

## Not done in the specified order

`FE-031-10` was built **after** `FE-031-04` and the migrations, not before. ADR-009 Phase
3b asks for the preview first. Recorded in `summary.md` under *Known limitations*, not
back-dated.
