# `FE-026-01` — the `Table` primitive

**Feature:** `026-ticket-list` · **Lane:** Frontend · **Status:** spec, awaiting approval

**Scope raised by the product owner, 2026-08-29:** *"اعتمد الديزاين دا هيكون لاي جدول بعد
كدا في السيستم"* — the geometry proven in `FE-026-00` is adopted as **the** table for the
system, not as the ticket list's own. That is what turns this from a screen component into a
foundation primitive, and it is why this document exists rather than the task row alone.

---

## 1 · What this is, and what it is not

`Table` owns **how a table behaves and how it is measured**. It owns nothing about tickets.

| It owns | It does not own |
|---|---|
| Row height, header height, dividers, hover | What a column means |
| The ten-row viewport and the pinned header | How a cell renders |
| Horizontal overflow and the hidden scrollbars | The status → tone map |
| Every state: header, row, hover, empty, loading skeleton, footer | Empty-state copy or artwork |
| Where a row flyout may open, and when it closes | What is in the flyout |
| Bidi isolation of cell text | Which language is selected |

**The domain must not leak in**, for the same reason `Badge` refused it: a primitive that
knows what `PendingCustomer` means cannot be used by the customer list. `Badge`'s comment
already states the rule and this follows it — the caller passes a tone, never a status.

## 2 · Why it did not exist in `023`

`023` shipped every other primitive and deliberately left this one out. ADR-009's
preview-first workflow is the reason: a table's geometry cannot be designed from a
component gallery, because the numbers that matter — column widths, the row height, the
overflow — only appear when real content is in it. `FE-026-00` was built to produce those
numbers, and it did. **Eleven defects came out of rendering it that reading it had not
surfaced**, and all eleven are geometry or behaviour this primitive now carries.

Building `Table` first would have shipped every one of them into `008` and `018` as well.

## 3 · The measured constants it carries

Every number below was **read off a rendered screen**, not derived. They move into the
primitive unchanged. Evidence: `tests.md` §1b.

| | Value | How it was arrived at |
|---|---|---|
| Row height | `62` / `70` / `78` (dense / default / roomy) | Measured. **Cannot** be computed from `--row-pad` — a two-line cell contributes its own line-heights |
| Header height | `--table-header-height` (40px) | Token (A). The canvas drew 44 and the token won |
| Viewport | header + 10 rows | Ten is the footer's page size, so the card shows exactly one page |
| Row divider | `--border-divider` | Deliberately **lighter** than `--border-subtle` — one token for the card edge and the sixty lines inside it is what makes a long table read as graph paper |
| Hover | `--surface-row-hover` | (D), added for this |

**Column widths are the caller's**, not the primitive's — they are content, and `026`'s
eight are recorded in `tests.md` §1b.2 as one worked example.

## 4 · Behaviour the primitive owns, and why each is not optional

Each of these was a defect first. They are listed as behaviour rather than as bugs fixed,
because a primitive that does not carry them hands the same defect to the next screen.

### 4.1 · The clipping ancestor

The scroll container clips on **both** axes. CSS forces `overflow-y` to `auto` the moment
`overflow-x` is not `visible`; there is no "scroll horizontally, overflow vertically". So
**every overlay that originates inside the table must be `position: fixed`** — tooltip and
row flyout both were absolutely positioned and both were cut off.

`Table` therefore owns the placement contract: it hands an overlay its coordinates, flips
it, and closes it. A caller that positions its own flyout will reproduce the defect.

### 4.2 · Where a flyout may open

- **The floor is the table, not the window.** Flipping only at the viewport edge lets the
  last rows open downward *through* the pager — worse than off-screen, because it looks
  deliberate.
- **It grows inward.** Actions is the last column, so its trigger sits at the row's outer
  edge; hanging a 188px menu from the trigger's leading edge puts it outside the card.
- **Scroll closes it.** A fixed flyout is anchored to the viewport, so the row slides out
  from under it and it ends up over an unrelated record. Re-anchoring per frame is worse —
  it would ride the table and pass under the pinned header. **Blocking the scroll was
  considered and rejected:** a page that stops scrolling reads as frozen, and the wheel is
  how most people dismiss a menu opened by accident.

### 4.3 · Bidi

Cell text is isolated with `<bdi>`, **never `dir="auto"`**. Both isolate the run; only
`dir="auto"` also rewrites the element's direction, and `text-align: start` resolves against
that — so one Latin name in a column of Arabic ones aligns to the opposite edge.

`text-align: start` is not a fix on its own. It resolves against the direction `dir="auto"`
just changed.

### 4.4 · The `base.css` rule-17 override

Every `<button>` in the product is painted with the primary navy using `!important`, so a
dark-mode host stylesheet cannot repaint a native control. `base.css` states the only escape:
**a class selector repeating the same three properties, with `!important`.** Omitting it does
not win.

`Table` must carry that override for every control it renders. The preview did not, and
twenty-five controls rendered as solid navy pills — read as a broken palette rather than one
missing rule, which is exactly what rule 17's own comment warns about.

### 4.5 · Visibility is not presence

The channel label and the actions heading both shipped `sr-only` and both looked correct in
the JSX. A heading no sighted user can read is a defect, and `toBeVisible` **does not catch
it** — jsdom computes neither `clip-path` nor the 1px box, so a guard written for exactly
that defect passed on exactly that defect. Assertions in this primitive's tests are
structural.

## 5 · The proposed API

Generic over the row type. No domain type is imported by this file.

```ts
export interface TableColumn<TRow> {
  /** Stable id. Used as the React key and for the column-width map. */
  id: string;

  /** Already translated by the caller. Rendered visibly — see 4.5. */
  header: string;

  /** Fixed track width. `undefined` = the one flexible column. */
  width?: number;

  align?: 'start' | 'center';

  /** The whole cell, not a formatted string — the subject cell is two lines
   *  and the channel cell is a tinted pill. */
  cell: (row: TRow) => ReactNode;

  /** Skeleton shape for this column while loading, so nothing shifts when
   *  data lands (AC-026-05). Defaults to a full-width bar. */
  skeleton?: 'text' | 'pill' | 'avatar' | 'icon';
}

export interface TableProps<TRow> {
  columns: readonly TableColumn<TRow>[];
  rows: readonly TRow[];
  rowKey: (row: TRow) => string;

  /** Drives which state renders. `empty` is the caller's element. */
  state: 'data' | 'loading' | 'empty';
  empty?: ReactNode;

  /** Rows visible before the body scrolls. Default 10. */
  visibleRows?: number;

  density?: 'dense' | 'default' | 'roomy';

  /** Rendered by the primitive; the caller supplies the numbers. */
  footer?: ReactNode;

  /** Opt in to the flyout contract of §4.2. The primitive supplies the
   *  coordinates and closes it; the caller supplies the content. */
  rowFlyout?: (row: TRow, close: () => void) => ReactNode;
}
```

**`cell` returns a node, not a string.** A `format`-and-render API cannot express the two
cells that drove the whole design — the two-line subject and the labelled tinted pill — and
a primitive that cannot render its own reference screen is not the primitive.

**`empty` is a node too.** The empty state carries the brand pattern, three different
artworks, and copy that differs per reason. That is product content; the primitive supplies
the surface and the pattern-clearing behaviour, not the words.

## 6 · Acceptance criteria

| # | Criterion |
|---|---|
| AC-T-01 | Every state in `component-inventory.md`'s Table row renders in isolation in `/_preview`: header, row, hover, empty, loading skeleton, pagination footer (AC-026-18) |
| AC-T-02 | Skeleton rows occupy the **same height** as real rows at every density, asserted numerically — nothing shifts when data lands (AC-026-05) |
| AC-T-03 | The body shows `visibleRows` rows and scrolls; the header stays pinned through a scroll, asserted on computed position **and** on its measured top |
| AC-T-04 | Scrollbars are not rendered, and the container still scrolls — both asserted, since hiding one without the other is a different bug each way |
| AC-T-05 | A row flyout on the **last** row flips up, stays inside the card horizontally, and is fully within the viewport |
| AC-T-06 | A row flyout closes when the table scrolls |
| AC-T-07 | Every cell's text starts on the same inline edge regardless of script — asserted with a Latin value in a column of Arabic ones |
| AC-T-08 | Every control the primitive renders carries the rule-17 override. Asserted by **reading the stylesheet**, because vitest does not apply CSS Modules and a render assertion passes on the broken build |
| AC-T-09 | Every column heading is present **and** not `sr-only`, asserted structurally, not with `toBeVisible` |
| AC-T-10 | `Table` imports no domain type. Enforced the way `Badge`'s boundary is |
| AC-T-11 | `008`'s customer list renders through `Table` with no change to the primitive — the proof that it is a primitive and not a ticket table |

## 7 · Open questions — not decided here

| # | Question | Why it is not mine to settle |
|---|---|---|
| Q-T-1 | **`New` and `Open` share one blue.** The supplied design says so; `BR-1` and `docs/sdd/design/screens/03-tickets-list.md` say otherwise, and they are the source of record. Two distinct states with one appearance in the column an agent scans first | It is a product rule with a written home. If it goes into a shared primitive's reference screen unresolved, the contradiction reaches every table. **Whichever way it is ruled, the blueprint and the screen must be changed in the same commit** |
| Q-T-2 | **The 880 frame hides two columns behind a scroll** (1120 table, 878 visible). Hiding the scrollbars removed the only thing reporting it. Candidates that give: the 150px channel pill, the 260px subject floor, or a horizontal-overflow affordance that is not a native bar | It is a design trade, not a technical one |
| Q-T-3 | Does `Table` own **sorting** affordances, or does `015`? The supplied customer-list screen shows a sort control per column | `015` owns filters, search and sorting. Naming an owner before building is cheaper than removing it after |

## 8 · What fails silently here

| Failure | How it presents | Guarded by |
|---|---|---|
| A caller positions its own flyout | Cut off, but only on the last rows and only when the table scrolls | AC-T-05, AC-T-06 |
| A caller uses `dir="auto"` on a cell | One record in a hundred aligns to the wrong edge | AC-T-07 |
| A new control skips the rule-17 override | A navy pill that reads as a palette decision | AC-T-08 |
| A heading ships `sr-only` | Looks correct in the JSX; `toBeVisible` passes | AC-T-09 |
| Skeleton height drifts from row height | The table jumps once, on load, and reads as jank | AC-T-02 |
| A domain type is imported | Nothing, until `008` cannot use it | AC-T-10, AC-T-11 |

## 9 · Deviations from `tasks.md`

`FE-026-01`'s row says *"`Table` primitive: header, row, hover, empty, loading skeleton,
pagination footer"*. That list is unchanged. What this document adds is everything in §4 —
behaviour that did not exist as a requirement when the task was written, because it was
discovered by rendering `FE-026-00`. **That is the preview-first workflow producing its
output**, and the task row is the poorer description of the two.

## 10 · Rules referenced

`ADR-009` (preview-first) · `BR-1` (status map, see Q-T-1) · `BR-8` / `BR-8.13`
(localisation, Latin digits) · `DESIGN-BRIEF` rule 3 (tokens first), rule 9 (focus rings),
rule 14 (never colour alone), rule 17 (native control override) · `AC-026-05`, `AC-026-18`,
`AC-026-20` · `component-inventory.md` §Table
