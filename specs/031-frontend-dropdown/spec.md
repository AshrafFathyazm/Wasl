# 031 — Dropdown · FRONTEND

**Phase:** 4 · **Lane:** Frontend only · **Status:** approved 2026-08-30, implementing
**Source design:** `Dropdown Spec.dc.html` — Abyan Design System v1.0, supplied by the
product owner 2026-08-30
**Blocks:** `027-ticket-detail` (status menu, assignee picker) · `015` (multi-select
filters) · **`029-loader-system`** — see §0

---

## 0 · Numbering, and the feature this one unblocks

**Written as `029`, renumbered to `031` on the day it was written.** `029-loader-system`
and `030-feedback-layer` were created by the other lane at 23:46 the same evening, from
the same instruction — *shared at system level, every component uses them* — against a
different design document. Two folders held `029` for about four minutes. The newer one
moved, which is this one. Recorded rather than silently renamed: a spec that changes its
own number without saying so is a spec whose cross-references stop resolving.

**`029-loader-system` is downstream of this feature, not parallel to it.** Its scope says:

> *`Select` gains loading states — five from the source §08: trigger resolving its value,
> **menu** loading its options, **search inside the menu**, **loading-more at the menu
> foot**, and the **chip** awaiting confirmation.*

…and its AC-11 asserts *"`Select`'s menu loader terminates: after 10s it shows a retry
affordance."* A native `<select>` has no menu to put a loader in, no search field, and no
chips. **All five of those states presuppose a custom listbox that did not exist when they
were written.** They are states of the component in this spec.

The boundary, so neither feature waits on the other:

| Concern | Owner |
|---|---|
| The `loading` **prop**, the menu's loading surface, the disabled trigger while resolving | **031.** Rendered with whatever `Loader` exists at the time |
| Which **shape** waits, its timing gates, the 10s failure and retry, `useDeferredBusy` | **029.** When it lands it swaps the shape inside `Dropdown` and re-points its own §08 from `Select` to `Dropdown` |
| The first motion tokens, and the correction to `tokens.css` note 11 | **031**, below in §3.1. Both specs claim to add them; they are added once. `029` consumes them and must not re-add them |

---

## 1 · What this is

The Abyan design system ships a **Dropdown** reference: anatomy, three sizes, twelve
states, six variants, menu behaviour, the full WAI-ARIA combobox keyboard model, a props
table, and its token list. This feature builds it in `wasl-web` as a **shared primitive**
and moves **every** existing dropdown-shaped control onto it.

**It is not a ninth primitive.** `component-inventory.md` caps the set at eight (ADR-009)
and row three of that table already reads:

> **Select** — Default, open, focus, disabled, error, empty option, **multi-select** —
> *Category, priority, channel, assignee, filters*

Every one of those states and every one of those consumers is in this spec. This finishes
the primitive the inventory already specified; it does not add one. The cap is untouched —
eight before, eight after.

## 2 · The ruling this reverses, said out loud

`023` built `Select` as a **native `<select>`**, and its source says why:

> *A native `<select>`, deliberately. It brings the platform's own open state, keyboard
> model, and mobile picker — none of which a div can be given without a listbox
> implementation.*

That reasoning was correct and it is still correct. **The product owner ruled on
2026-08-30 to replace it anyway**, and this spec records what that costs rather than
quietly deleting the paragraph:

| The platform gave us free | We now own it |
|---|---|
| Open / close state | `useMenuSurface` — outside click, `Escape`, `Tab`, scroll |
| Keyboard model | Seven bindings, §7, each with a named test |
| Mobile picker (iOS wheel, Android sheet) | **Lost.** A 36px option row on a phone stays a 36px option row |
| Focus behaviour | `aria-activedescendant`, focus never leaves the trigger |
| Form participation | A hidden `<input name>` mirrors the value |

What it buys: search inside the menu, multi-select with chips, an option carrying an icon
and a description, a `+N` counter, an async skeleton, and an appearance that matches the
rest of the design system in both directions. `Select` could give none of those, and four
of them are already named requirements — `015`'s filters, `027`'s two pickers, and the
inventory's own *multi-select* row.

**Recorded as a deviation from `023`, not as a correction of it.** `023`'s summary keeps
its paragraph; this is the counter-argument, with a date and an owner.

## 3 · Token reconciliation — six conflicts, and the rule that settles them

The Abyan doc's palette **already is** ours. `#1D174D` = `--navy-900`, `#DEE5E7` =
`--Neutral-200`, `#F5F8F8` = `--neutral-50`, `#EDF1F2` = `--neutral-75`, `#0D2626` =
`--ink`, `#9FABB5` = `--neutral-400`, `#CAD3D7` = `--neutral-300`, `#B3BFC6` =
`--neutral-350`, `#E54545` = `--red-600`, `#F9FAFB` = `--Neutral-00`. Ten exact matches,
zero near-matches. Same system — and that is the reason this feature is cheap.

**Six values disagree.** `tokens.css` states the rule for exactly this case — *"a
near-match is a second palette, not a refinement"* — so **the token wins wherever the two
are close**, and the doc wins only where we have nothing at all.

| # | Abyan doc | `wasl-web` | Resolution | Why |
|---|---|---|---|---|
| C-1 | trigger height **32 / 40 / 48** | `--field-height-sm/md/lg` = **39 / 47 / 51** | **Token wins** | A Dropdown beside an `Input` on one row must share a box. 47 against 40 is a visible step, and `026`'s toolbar puts them adjacent |
| C-2 | menu radius **6px** | `--radius-md` = **8px** | **Token wins** | 2px apart is a second radius scale |
| C-3 | focus ring `rgba(29,23,77,.18)` | `--focus-ring` = **22%** of `--brand` | **Token wins** | `tokens.css`: *"One ring intensity, everywhere."* Ours derives from `--brand`, so a tenant colour change moves it. A literal navy does not |
| C-4 | `z-index: 1000` | `--z-flyout` = **200** | **Token wins** | Four ordered layers exist. 1000 sits above `--z-modal`, so a dropdown inside a dialog would cover its own dialog |
| C-5 | open **150ms**, close **100ms** | `design/motion.md`: *dropdown = **200ms***, and *"arriving is slower than leaving"* | **House doc wins — 200ms in, 150ms out** | `motion.md` is our authority and it names dropdowns explicitly. 100ms is its "below perception" band: hover, focus ring, colour |
| C-6 | shadow `0 4px 12px rgba(13,38,38,.08)` | **none exists** — `tokens.css` note 11 | **Doc wins** | Note 11 says the value was *missing*, not wrong. This is the first real shadow the system has been handed |

**Note 11 is edited in the same commit.** It currently reads *"NO SHADOW TOKENS AND NO
MOTION TOKENS EXIST YET"*, and the moment this lands that sentence is false. A note that
goes stale silently is the exact failure mode the file warns about elsewhere.

### 3.1 · Tokens added

```css
/* first shadow in the system — Abyan Dropdown §09. Closes note 11 */
--shadow-md: 0 4px 12px rgba(13, 38, 38, 0.08);

/* first motion tokens — values and easing from design/motion.md, NOT from the doc */
--ease-out: cubic-bezier(.22, .80, .30, 1);
--ease-in:  cubic-bezier(.55, 0, 1, .45);
--duration-enter: 200ms;
--duration-exit:  150ms;

/* component — geometry the doc supplies and we had no name for */
--dropdown-option-height-sm: 32px;
--dropdown-option-height-md: 36px;
--dropdown-option-height-lg: 44px;
--dropdown-menu-max-height: 320px;         /* doc §06 */
--dropdown-menu-offset: var(--space-1);    /* 4 — trigger to menu */
--dropdown-menu-radius: var(--radius-md);  /* 8, per C-2 */
--dropdown-chip-height: 24px;
```

The three motion literals `023` left as `TODO` — `Select`'s 100ms, the shell's 220ms and
140ms — are **out of scope**. Retro-fitting them is a separate sweep, and mixing it in
here makes a failure in this feature indistinguishable from a failure in that one.

## 4 · What replaces what

| Call site | Today | After |
|---|---|---|
| `CreateTicketPage` ×3 — category, priority, channel | `<Select>` native | `<Dropdown>` single |
| `TicketListPage` rows-per-page | **raw `<select>`**, styled ad hoc in `TicketList.module.css` | `<Dropdown size="sm">` |
| `CustomerPicker` | hand-rolled `role="listbox"` with its own arrow / Enter / Escape handler | **NOT MIGRATED.** See §4.1 — measured, not decided |
| `dev/TicketDetailPreview` | the other lane added a `<Select>` mid-flight | `<Dropdown size="sm">` |
| `components/Select/` | 2 files | **deleted** |
| `027` status menu · assignee picker | not built | consumes this |
| `015` filters | not built | consumes this — `multiple` |

### 4.1 · `CustomerPicker` is not a dropdown, and the attempt is what proved it

The spec as approved said *every* dropdown-shaped control moves. `CustomerPicker` was on
that list and came off it, for three reasons found in this order:

1. **`Dropdown` filters its `options` locally; the picker's term drives a SERVER
   search.** The route owns a debounced query and the picker is forbidden from fetching
   (ADR-011 §4). Migrating needs a controlled-search prop pair, which is a new prop with
   one consumer — the thing §5.1 refuses for all seven others.
2. **The interaction models are different, not similar.** A dropdown is *closed trigger →
   open menu → pick*. The picker's field is always visible, its results appear as you
   type without anything being "opened", and once a customer is chosen the whole control
   is replaced by a card with a *Change customer* button. There is no trigger.
3. **It breaks tests that assert behaviour, not markup.** `TEST-024-05` reads
   `toHaveValue('')` off the picker's `<input>` to prove a `404` clears the selection;
   `selectCustomer` finds the results list without opening anything. Both describe what
   the screen DOES.

And the inventory already ruled on this, before this feature existed — *Not built*:

> **Autocomplete** — `CustomerPicker` composes Input plus a result list; a generic
> autocomplete is a much larger commitment.

So "every component uses the Dropdown" holds for every control that is one. The picker's
duplicated keyboard handler is a real cost and it stays a real cost; making it a
`Dropdown` would not remove it, it would fork the `Dropdown` instead.

**The shell is out of scope and stays out.** `023 §3.4` puts `Tooltip` and `NavFlyout`
inside `src/shell/` *precisely so they are not primitives*. "Every component uses the
Dropdown" stops at the `components/` and `features/` boundary — a shell flyout adopting a
form control is how a capped set quietly stops being capped.

`dev/*Preview.tsx` are drawings, not production. They change only where a preview already
claims to be showing the real control.

## 5 · The API we build

```ts
interface DropdownOption {
  value: string;          // the RAW wire value. Never a translated label
  label: string;          // already translated by the caller
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
}
```

| Prop | Type | Notes |
|---|---|---|
| `options` | `readonly DropdownOption[]` | required |
| `value` | `string \| readonly string[] \| null` | array when `multiple` |
| `onChange` | `(value, option) => void` | fires on select, deselect and clear |
| `label` · `labelHidden` | `string` · `boolean` | the label is **required** — the contract `Input` and `Select` already have |
| `multiple` | `boolean` | chips on the trigger, checkboxes in the menu |
| `searchable` | `boolean \| 'auto'` | `'auto'` shows the search field above 10 options |
| `size` | `'sm' \| 'md' \| 'lg'` | trigger height from `--field-height-*` (C-1) |
| `helperText` · `error` | `string` | `error` is a **string**: its presence IS the error state, and it replaces the helper. Identical to `Input` and `Select`, because two error conventions in one form is a form nobody can read at a glance |
| `required` · `disabled` · `readOnly` · `loading` | `boolean` | |
| `clearable` | `boolean` | |
| `maxTagCount` | `number` | default 2; the remainder collapses to `+N` |
| `placeholder` · `noOptionsText` · `loadingText` | `string` | defaulted from the catalogue, never from a literal |
| `onBlur` · `name` · `id` | | `name` renders a hidden input for form posts |

`forwardRef` points at the **trigger**, never the wrapper. React Hook Form's
`shouldFocusError` and `setFocus` both work by calling `.focus()` on the registered ref,
and a failed submit that focuses a `<div>` leaves the caret where it was while the user
hunts for the message. Measured in `024`; the same rule applies here.

### 5.1 · Deferred, each with a reason

| Doc prop | Why not now |
|---|---|
| `groupBy` + sticky group headers | No consumer. Six statuses, four priorities, five channels, N agents — none of them group |
| `creatable` / `onCreate` | The one place it fits is *New customer*, and `007`'s create form is a route, not an inline row |
| `renderOption` / `renderValue` | An escape hatch with no consumer is an untested code path. `icon` + `description` cover both shapes we actually have |
| `virtualized` | Triggers above 100 options. The largest real list is `GET /api/support-users` |
| `open` / `onOpenChange` | Controlled open has no caller. Uncontrolled, with `Escape` and outside-click, is the whole requirement |
| `placement` / `matchTriggerWidth` | Both **behaviours** ship. The props to override them do not |
| `dir` | Inherited from the document, which `014` already sets on `<html>`. A per-component override is a second source of truth for direction |

**Every one of these would be an unexercised prop, and an unexercised prop is an
unverified prop** — the rule `009`, `011` and `007` each paid for in a different currency.
They go into a *Deferred* table in `summary.md`, not into the file.

### 5.2 · The action menu is deliberately not this component

Doc §10, under *do not*: **«لا تستخدمها كقائمة إجراءات مع حالة اختيار — افصل بين النوعين»**
— *do not use it as an action menu with a selection state; keep the two apart.*

`027` Q-3 rules the status control **a menu**, and a status change is an action, not a
value. So the menu **shell** — portal, positioning, flip, dismissal, roving
`aria-activedescendant` — is extracted as an internal `useMenuSurface`, and `027` builds
its action menu on that shell **without** a value model. One implementation of the hard
part, two components, and the doc's own rule respected. See Q-2.

## 6 · States — twelve, and each one is a preview tile

`/_preview` is where a primitive's states are proven visible in isolation (`023` Q-7).
Twelve tiles, both directions, both languages:

`default` · `hover` · `focus` · `open` · `filled` · `error` · `disabled` · `readOnly` ·
`loading` · `multi-empty` · `multi-filled` · `empty menu`

Two of them cannot be forced by a real pointer, so they use `[data-preview-state]` — the
same mechanism `Button` and `Select` already use. See `base.css`, *HOW A COMPONENT
OVERRIDES THESE*.

## 7 · Keyboard — the doc's table, unchanged

| Key | Behaviour |
|---|---|
| `Enter` / `Space` | Open, or select the highlighted option |
| `↑` / `↓` | Move the highlight; open the menu if it is closed |
| `Home` / `End` | First / last **enabled** option |
| `Esc` | Close with no change; focus returns to the trigger |
| `Tab` | Close, keep the value, move to the next control |
| `A–Z` / `ا–ي` | Typeahead, 500ms buffer |
| `Backspace` | `multiple` with an empty search: remove the last chip |

Focus **stays on the trigger**; the highlight moves through `aria-activedescendant`, never
by moving focus. With `searchable`, focus moves into the search field and **that field**
carries the combobox attributes. Disabled options are `aria-disabled` and are skipped by
every key above — skipped, not merely unclickable.

## 8 · In scope

- `components/Dropdown/` — the primitive: single and multiple, searchable, three sizes,
  twelve states, the full keyboard model in §7
- The internal `useMenuSurface`: portal to `document.body`, width = trigger width,
  `bottom-start` with an automatic flip above under 200px of space, at `--z-flyout`
- The token additions in §3.1, and the correction to `tokens.css` note 11
- Catalogue keys in `common`, **en and ar**, parity-gated
- Migration of all three live call sites in §4; `components/Select/` deleted
- `/_preview` tiles for every state, in both directions
- The Arabic pass over the preview and the three migrated screens, recorded in `tests.md`
- **The preview before wiring** (Phase 3b, ADR-009), in Arabic first

## 9 · Out of scope

| Excluded | Where |
|---|---|
| The seven deferred props | §5.1 — each with a reason, repeated in `summary.md` |
| `027`'s action menu | `027`. This feature ships the shell it stands on |
| Shell `Tooltip` / `NavFlyout` | `023 §3.4` — deliberately not primitives |
| Retro-fitting the three existing motion literals | A separate sweep. Mixed in here, a failure becomes unattributable |
| A `Modal` primitive | Still unbuilt, still the inventory's eighth row. Not this |
| A native picker on touch widths | Considered and refused for now — one control, one behaviour. Q-3 |

## 10 · Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | `components/Select/` no longer exists and no `<select>` element remains in `src/components/` or `src/features/`. Asserted by a gate, not by reading the diff. **The gate does not exist and this feature writes it** — `scripts/check-no-native-select.mjs`, wired into `npm run lint:select` |
| AC-2 | The trigger's height comes from `--field-height-*`. A `Dropdown` and an `Input` of the same `size`, rendered side by side, have the **same** computed `blockSize` — asserted, because C-1 is the conflict most likely to be "fixed" back to 40px by whoever reads the design doc next |
| AC-3 | **No primitive token** in any component stylesheet — semantic only. **Measured, and the gate `023` describes was not there:** `.stylelintrc.json` enforces the logical-property rule (AC-8) and eslint enforces the no-literal-string rule (AC-4), but nothing read a custom property. This feature writes `scripts/check-semantic-tokens.mjs`. **Its scope is narrower than this criterion first claimed and the narrowing is stated, not quiet:** it checks primitive colour TOKENS and not raw `rgb()` / `#hex` literals, of which five already exist in four files owned by other features — a gate that is red on the day it lands is a gate everybody learns to ignore. The five are recorded in `summary.md` as a finding |
| AC-4 | Every string is a catalogue key present in **both** `en` and `ar`. The doc's Arabic literals — `اختر المدينة`, `لا توجد نتائج مطابقة`, `جاري التحميل…` — appear nowhere in the source |
| AC-5 | All seven bindings in §7 have a named test. `Home` / `End` land on an **enabled** option with a disabled one at the boundary — the case that passes by accident when no fixture has a disabled option |
| AC-6 | Focus never leaves the trigger while the menu is open, search excepted. Asserted on `document.activeElement`, not on a class name |
| AC-7 | `Esc` closes with the value unchanged **and** returns focus to the trigger. Both halves asserted — closing without restoring focus strands a keyboard user on the page body |
| AC-8 | The menu mirrors in RTL: check mark, caret, chips and clear control all sit at the inline-end in `ar` and in `en`, with **no `left` / `right`** anywhere in the stylesheet |
| AC-9 | Typeahead matches Arabic labels typed in Arabic — asserted with an Arabic fixture, since an `A-Z`-only implementation passes every English test |
| AC-10 | The menu flips above the trigger with under 200px of space below it, in both directions. Asserted against a measured viewport, not by trusting the branch |
| AC-11 | `multiple` collapses past `maxTagCount` to `+N`, and `N` renders in **Latin digits in both locales** through `lib/formatters.ts` (BR-8.13) |
| AC-12 | **Every ASSERTION in `CreateTicketPage`'s and `TicketListPage`'s tests survives unchanged.** The criterion originally said the tests themselves must be unedited, and that was wrong in a way worth keeping: `user.selectOptions` reaches for an `HTMLOptionElement` and throws on anything else, so it cannot survive the removal of a native element **by definition**, and neither can a `toHaveValue` cast to `HTMLSelectElement`. Four tests failed on exactly those two lines and no others. The honest line is between *how a control is driven* and *what is claimed about it*; only the second is protected, and all four claims are byte-identical |
| AC-13 | `CustomerPicker` is **not migrated**, for the three measured reasons in §4.1 and one that predates this feature — `component-inventory.md` lists a generic autocomplete under *Not built* and names this component as the reason. Its tests stay green and untouched, which is the assertion |
| AC-14 | `tokens.css` note 11 is corrected in the same commit that adds `--shadow-md` and the motion tokens |
| AC-15 | Every state in §6 renders in Arabic and is recorded in `tests.md` |
| AC-16 | The preview is rendered and reviewed **before** anything is wired |

## 11 · Open questions

| # | Question | Why it blocks | Working assumption |
|---|---|---|---|
| Q-1 | The inventory's row is named **Select**; the design doc's component is named **Dropdown**. Which name does the directory carry? | A rename makes the capped-eight list stop matching the filesystem, and any gate that reads that list by name | **`Dropdown`**, with `component-inventory.md`'s row renamed *Select → Dropdown* in the same commit and a one-line note saying why. Keeping "Select" keeps promising a native `<select>` that is no longer there |
| Q-2 | Is `useMenuSurface` shipped by this feature or written by `027`? | `027` cannot start its status menu without it, and building it twice is the outcome nobody picks deliberately | **Here.** It is the hard half — portal, flip, dismissal, `aria-activedescendant` — and shipping it here is what makes §5.2's separation cheap instead of theoretical |
| Q-3 | Touch: a 36px option row on a phone replaces the OS picker. Accept it, or delegate to a native `<select>` below 640px? | It is the one thing §2 lists as **lost**, and it is lost on every screen at once | **Accept for now.** One control, one behaviour, one set of tests. Recorded as a known limitation in `summary.md` rather than left silent. Revisit if the demo is driven on a phone |
| Q-4 | `docs/sdd/11-open-questions.md` Q-11 — *how far may the house design assets be reused* — is still open, and this feature consumes an Abyan design document wholesale | If the answer turns out to be "not this far", the source of this entire spec is wrong | **Proceed.** The document was supplied by the product owner for this purpose on 2026-08-30, which is the closest thing to an answer Q-11 has ever had. Flagged so the ruling is visible rather than assumed |
| Q-5 | `readOnly` appears in the doc's states and in its props table. Nothing in Wasl has a read-only field today | It would otherwise be one of the twelve tiles with no consumer, which §5.1 rejects for every other prop | **Build it.** Nine lines of CSS and no logic, and `019`'s audit view and `027`'s closed ticket are both read-only screens by their own specs |
