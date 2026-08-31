# 031 — Dropdown · summary

**Delivered 2026-08-31.** Frontend only. 289 tests green (21 new), `tsc` clean, eslint
clean, locale parity clean, two new gates clean. Evidence in
[tests.md](tests.md).

---

## What was built

The Abyan Design System's Dropdown, as the `component-inventory.md` primitive that row
already called *Select*: single and multiple, searchable, three sizes, twelve states, the
full WAI-ARIA combobox keyboard model, portalled menu with an upward flip, `en` + `ar`.

| File | |
|---|---|
| `components/Dropdown/Dropdown.tsx` | the primitive |
| `components/Dropdown/Dropdown.module.css` | semantic tokens only, logical properties only |
| `components/Dropdown/useMenuSurface.ts` | the menu shell — **`027` builds its action menu on this** |
| `components/Dropdown/Dropdown.test.tsx` | 21 tests |
| `scripts/check-no-native-select.mjs` · `scripts/check-semantic-tokens.mjs` | two gates, `npm run lint:select` / `lint:tokens` |
| `components/Select/` | **deleted** |

Migrated: `CreateTicketPage` ×3, `TicketListPage` rows-per-page, `dev/TicketDetailPreview`.
Tokens added: `--shadow-md`, `--ease-in/out`, `--duration-instant/enter/exit`, nine
`--dropdown-*`, and `--accent-presence`. Ten `common:dropdown.*` keys in both catalogues.

---

## The five things worth reading

### 1 · `029-loader-system` is downstream of this, and was written against a control that did not exist

Found while resolving a folder-number collision, not by looking for it. `029`'s scope says
*"`Select` gains loading states — trigger resolving its value, **menu** loading its
options, **search inside the menu**, **loading-more at the menu foot**, and the **chip**
awaiting confirmation"*, and its AC-11 asserts *"`Select`'s menu loader terminates after
10s."*

A native `<select>` has no menu to put a loader in, no search field, and no chips. **All
five states presuppose the component in this feature.** The two specs were written hours
apart from the same instruction and neither knew about the other. The boundary is now
written into `031` §0: `031` owns the `loading` prop and the menu's loading surface, `029`
owns which shape waits and the timing gates, and when `029` lands it re-points its §08
from `Select` to `Dropdown`.

Both specs also claimed to add *"the first motion tokens the system has ever had"* and both
edited `tokens.css` note 11. They are added once.

### 2 · The gate `023` said existed did not exist

`023`'s risk table describes a CI script over `src/components/` and `src/shell/` catching a
component that reaches for `--navy-900` instead of `--brand`. AC-3 was written citing it.
It is not there: stylelint enforces logical properties, eslint enforces no literal strings,
and **nothing read a custom property.** Written now, and its first run found one real hit —
in `Loader.module.css`, reaching for `--teal-600` because the semantic layer had no name
for "presence". The fix is the name, not an exemption: `--accent-presence`.

The gate's scope is narrower than AC-3 first claimed and the narrowing is written down
rather than done quietly — five raw `rgb()` literals already exist in four other features'
files, and a gate that is red on day one is a gate people disable. They are a finding for
their owners, in `tests.md` §3.3.

### 3 · The trigger is a `<div role="combobox">`, against the design document's own snippet

The document draws `<button role="combobox">`. It cannot be one: the multi-select trigger
holds chips with remove controls and the clearable trigger holds a clear control, and
interactive content inside a `<button>` is invalid HTML — browsers resolve it by making
the inner control unreachable, so the × renders and clicking it activates the outer button.
`TEST-031-06`'s clear test is what holds that decision in place.

### 4 · AC-12 was too strong, and four failing tests are what showed it

The criterion said the migrated screens' tests must be **unedited**. `user.selectOptions`
reaches for an `HTMLOptionElement` and throws on anything else; `toHaveValue` casts to
`HTMLSelectElement`. Neither can survive removing a native element *by definition*. Four
tests failed, on exactly those two lines and no others.

The honest line is between **how a control is driven** and **what is claimed about it**.
Only the second is protected, and all four claims are byte-identical — same values, same
request body, same preservation claim. One assertion got better on the way through:
`(select as HTMLSelectElement).value` became `toHaveTextContent('100')`, which reads what
the user sees rather than a DOM property.

### 5 · `CustomerPicker` is not a dropdown, and the attempt is what proved it

It was in scope and came out, for reasons found in this order: `Dropdown` filters locally
while the picker's term drives a **server** search owned by the route; the interaction
models differ (there is no trigger — the field is always visible and selection replaces the
whole control with a card); and its tests assert behaviour that has no equivalent.

Then the inventory turned out to have ruled on it already, under *Not built*: *"Autocomplete
— `CustomerPicker` composes Input plus a result list; a generic autocomplete is a much
larger commitment."* Scaling this back is the product owner's call, so it is stated rather
than absorbed. Full reasoning in spec §4.1.

---

## Deferred, each with a reason

`groupBy` · `creatable`/`onCreate` · `renderOption`/`renderValue` · `virtualized` ·
controlled `open`/`onOpenChange` · `placement`/`matchTriggerWidth` props · a `dir` prop.
Seven of the document's twenty-two. Every one would ship with zero call sites, and **an
unexercised prop is an unverified prop** — the rule `009`, `011` and `007` each paid for in
a different currency. Reasons are in spec §5.1.

Both `placement` and `matchTriggerWidth` **behaviours** ship; only the props to override
them do not.

---

## Known limitations

| | |
|---|---|
| **The mobile picker is gone** | A native `<select>` gives an iOS wheel and an Android sheet. A 36px option row on a phone is now a 36px option row, on every screen at once. Spec Q-3 accepted it — one control, one behaviour, one set of tests — and it is the one thing §2 lists as lost. Revisit if the demo is driven on a phone |
| **AC-16 not met in order** | The preview tiles were built *after* the component was wired, not before (ADR-009 Phase 3b). The design document is itself a rendered interactive canvas that was reviewed first, so the design had a preview; the implementation did not. `tests.md` §5 |
| **AC-10 has no test** | The upward flip is written and commented. jsdom computes no layout — every rect is zero — so an assertion would pass against a function that always returns `flipped: false`. That is `010`'s stable-sort problem, and a green test there is worse than none |
| **The throttle on typeahead is per component** | 500ms buffer, matching the document. No shared state, no configuration |
| **Two gates red in `027`'s preview file** | `stylelint` and `check-no-domain-types`, both in `dev/TicketDetailPreview.*`, created by the other lane this session. This feature touched four lines of it — only because deleting `Select` would have broken their build. Not fixed on purpose: reaching into an in-flight file to silence a gate is how one conflict becomes two, and the domain-type finding is real work for `027` |

---

## The number

Written as `029`, renumbered to **`031`** the same evening: `029-loader-system` and
`030-feedback-layer` were created by the other lane four minutes earlier, from the same
instruction, against a different design document. The newer folder moved. Recorded in spec
§0 rather than silently renamed — a spec that changes its own number without saying so is a
spec whose cross-references stop resolving.

`030-feedback-layer` is an empty folder as of this writing.
