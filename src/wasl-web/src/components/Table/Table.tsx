import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { IconChevronDown, IconMore } from '../../icons/icons';
import { cx } from '../../lib/cx';
import { Loader } from '../Loader/Loader';
import { Skeleton } from '../Loader/Skeleton';
import styles from './Table.module.css';

/**
 * THE table. Not the ticket table.
 *
 * Adopted as the system's table 2026-08-29. It owns how a table behaves and how
 * it is measured; it owns nothing about tickets. The caller passes a rendered
 * cell, never a domain value — the same boundary `Badge` holds, and for the same
 * reason: a primitive that knows what `PendingCustomer` means cannot be used by
 * the customer list.
 *
 * The behaviour in here is not implementation detail. Every rule below was a
 * defect found by RENDERING `FE-026-00`, and a table that does not carry them
 * hands the same defect to the next screen. Contract and evidence:
 * `specs/026-ticket-list/table-primitive.md`.
 */

export type SortDirection = 'asc' | 'desc';

export interface TableSort {
  columnId: string;
  direction: SortDirection;
}

export interface TableColumn<TRow> {
  /** Stable id — the React key, and what `sort.columnId` refers to. */
  id: string;

  /** Already translated. Rendered VISIBLY: a heading no sighted user can read is
   *  a defect, and it is one `toBeVisible` does not catch (see the tests). */
  header: string;

  /** Fixed track width in px. Omit on exactly one column — it absorbs the rest. */
  width?: number;

  align?: 'start' | 'center';

  /** The whole cell, not a formatted string. A format-and-render API cannot
   *  express a two-line cell or a labelled tinted pill, and a primitive that
   *  cannot render its own reference screen is not the primitive. */
  cell: (row: TRow) => ReactNode;

  /** Shape shown while loading. The skeleton row is the SAME height as a real
   *  row, so nothing shifts when data lands. */
  skeleton?: 'text' | 'pill' | 'avatar' | 'icon';

  /** Default false. `026` passes it nowhere — the API is built now because
   *  adding it later is a breaking change, and a sort control in the header is
   *  header-shaped: `015` cannot inject one from outside without reopening this
   *  interface. `015` owns the query and the URL; this owns the control. */
  sortable?: boolean;
}

export interface TableRowFlyout<TRow> {
  /** Column heading. Visible, like every other heading. */
  header: string;

  /** Accessible name for the per-row trigger. */
  triggerLabel: string;

  width?: number;

  render: (row: TRow, close: () => void) => ReactNode;
}

export interface TableProps<TRow> {
  columns: readonly TableColumn<TRow>[];
  rows: readonly TRow[];
  rowKey: (row: TRow) => string;

  /** Accessible name. A table with no name is a grid of unexplained numbers to
   *  anyone not looking at the heading above it. */
  label: string;

  state?: 'data' | 'loading' | 'empty';

  /** The caller's element. The empty state carries artwork and copy that differ
   *  per reason — that is product content, not a primitive's. */
  empty?: ReactNode;

  /** Rows visible before the body scrolls. Default 10 — the page size, so the
   *  card shows exactly one page and scrolling never crosses a page boundary. */
  visibleRows?: number;

  density?: 'dense' | 'default' | 'roomy';

  footer?: ReactNode;

  /** Opt in to the flyout contract. This supplies the coordinates, the flip and
   *  the dismissal; the caller supplies what is inside. A caller that positions
   *  its own flyout reproduces the clipping defect — see `.scroller` in the CSS. */
  rowFlyout?: TableRowFlyout<TRow>;

  /** Mouse convenience for navigating a row.
   *
   * IT IS NOT THE KEYBOARD PATH, and the primitive does not pretend otherwise:
   * it adds no tabindex and no role. A <tr> given role="button" announces the
   * whole row as one control and swallows every cell inside it, and a row with
   * tabindex puts a stop in the tab order that leads nowhere for a screen
   * reader. The caller MUST put a real link in one cell — that is what a
   * keyboard and a screen reader use, and this only saves a mouse user aiming.
   *
   * Clicks originating inside a link or a button are ignored, so the link in
   * the cell does not navigate twice and a row action is not hijacked. */
  onRowClick?: (row: TRow) => void;

  sort?: TableSort | null;
  onSortChange?: (next: TableSort | null) => void;

  /** Accessible suffix for a sortable heading's button, already translated. */
  sortLabel?: string;

  /** A background refetch is in flight. The table DIMS and keeps its rows —
   *  it never returns to the skeleton.
   *
   *  Re-skeletoning on every refetch throws away content the reader is looking
   *  at to say something they did not ask about, and on a fast connection it is
   *  a flash rather than a state. Dimming says the same thing without moving
   *  anything. aria-busy carries it to a screen reader, which cannot see dim. */
  refreshing?: boolean;

  /** Defaults to `visibleRows`. */
  skeletonRows?: number;
}

const ARIA_SORT = {
  asc: 'ascending',
  desc: 'descending',
} as const;

/** asc → desc → unsorted. The third step matters: without it there is no way
 *  back to the server's default order once a column has been touched. */
function nextSort(
  current: TableSort | null | undefined,
  columnId: string,
): TableSort | null {
  if (!current || current.columnId !== columnId) return { columnId, direction: 'asc' };
  if (current.direction === 'asc') return { columnId, direction: 'desc' };
  return null;
}

/**
 * WIDTHS ARE RATIOS, NOT PIXELS — and this is what removes the horizontal
 * scrollbar rather than hiding it.
 *
 * A column set drawn at canvas widths sums to a fixed number (1120 for the
 * ticket list) and any frame narrower than that overflows. Hiding the bar makes
 * the columns past the edge vanish in silence; keeping it puts a bar in a table
 * that is not supposed to have one.
 *
 * So the px the caller supplies are read as a RATIO. They are normalised to
 * percentages that always sum to 100, which preserves the proportions the design
 * fixes while letting the table fit any frame. Narrow frames truncate — which is
 * already the pattern, and a truncated cell says "there is more here" where a
 * clipped column says nothing.
 *
 * The flexible column (no width) takes whatever the fixed ones leave, floored so
 * it cannot be squeezed to nothing.
 */
const FLEX_MIN_SHARE = 0.18;

/** The actions column when the caller names no width. From the design, and a
 *  default rather than a constant because a caller with wider controls should
 *  be able to say so. */
const FLYOUT_DEFAULT_WIDTH = 88;

/**
 * Takes the width list already assembled by the caller, INCLUDING the flyout
 * column if there is one.
 *
 * It used to build that list itself from `flyoutWidth?: number`, which made
 * `undefined` mean two different things — "no flyout column" and "a flyout
 * column with no width" — and the second silently produced one fewer entry than
 * there were columns. The actions `<th>` then got no width at all, fell outside
 * the normalisation, took its content width on top of a full 100%, and the table
 * overflowed by exactly that column. Caught by the customer preview on its first
 * render, which is what that page is for.
 */
function widthPercents(all: readonly (number | undefined)[]): Array<string | undefined> {
  const fixedTotal = all.reduce<number>((sum, w) => sum + (w ?? 0), 0);
  const flexCount = all.filter((w) => w === undefined).length;
  if (fixedTotal === 0) return all.map(() => undefined);

  /* One notional unit for each flexible column, so the ratio arithmetic has
   * something to divide by even when every column is flexible. */
  const flexUnit = Math.max(fixedTotal * FLEX_MIN_SHARE, 1);
  const total = fixedTotal + flexCount * flexUnit;

  return all.map((w) => `${(((w ?? flexUnit) / total) * 100).toFixed(4)}%`);
}

/**
 * FLYOUT PLACEMENT. The one piece of behaviour a caller must not reimplement.
 *
 * The body scrolls, which means it clips on BOTH axes — CSS forces `overflow-y`
 * to `auto` the moment `overflow-x` is not `visible`, so there is no "scroll one
 * way, overflow the other". An absolutely positioned flyout born inside the
 * table is therefore cut off by the table. `position: fixed` is the only escape,
 * and its cost is that the coordinates have to be handed to it.
 *
 * Measured after mount rather than assumed from a constant: the content is the
 * caller's and its height is not knowable here. The first frame is laid out
 * hidden, measured, placed, and only then shown — otherwise it paints at 0,0 and
 * jumps.
 */
function useFlyoutPosition(
  triggerRef: React.RefObject<HTMLButtonElement | null>,
  flyoutRef: React.RefObject<HTMLDivElement | null>,
  open: boolean,
) {
  const [placed, setPlaced] = useState(false);

  useLayoutEffect(() => {
    if (!open) {
      setPlaced(false);
      return;
    }
    const trigger = triggerRef.current;
    const flyout = flyoutRef.current;
    if (!trigger || !flyout) return;

    const box = trigger.getBoundingClientRect();
    const size = flyout.getBoundingClientRect();
    const gap = 6;

    /* THE FLOOR IS THE TABLE, NOT THE WINDOW. Flipping only at the viewport edge
     * lets the last rows open downward THROUGH the footer — the flyout clears
     * the screen and covers the controls under the table, which is worse than
     * being off-screen because it looks deliberate. */
    const scroller = trigger.closest<HTMLElement>('[data-table-scroller]');
    const floor = Math.min(
      window.innerHeight,
      scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight,
    );
    const below = box.bottom + gap + size.height <= floor;
    const top = below ? box.bottom + gap : Math.max(gap, box.top - gap - size.height);

    /* IT GROWS INWARD. The trigger is the last column, so it sits at the OUTER
     * edge of the row — far left under RTL. Hanging the flyout from the
     * trigger's leading edge puts all of it outside the card, on the side with
     * nothing in it. Aligning the outer edges makes it open across its own row.
     *
     * `inset-inline-start` measures from the RIGHT under RTL, so the physical
     * arithmetic happens here and the stylesheet stays logical. */
    const rtl = getComputedStyle(trigger).direction === 'rtl';
    const raw = rtl ? window.innerWidth - box.left - size.width : box.right - size.width;
    const start = Math.max(gap, Math.min(raw, window.innerWidth - size.width - gap));

    flyout.style.setProperty('--flyout-x', `${start}px`);
    flyout.style.setProperty('--flyout-y', `${top}px`);
    setPlaced(true);
  }, [open, triggerRef, flyoutRef]);

  return placed;
}

function SortButton({
  label,
  sortLabel,
  direction,
  onToggle,
}: {
  label: string;
  sortLabel: string;
  direction: SortDirection | null;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={cx(styles.sortBtn, direction && styles.sortBtnOn)}
      onClick={onToggle}
    >
      {label}
      {/* The arrow is decorative — `aria-sort` on the <th> is what a screen
          reader reads, and it says the same thing without a glyph. */}
      <IconChevronDown
        size={14}
        aria-hidden="true"
        className={cx(styles.sortIcon, direction === 'asc' && styles.sortIconUp)}
      />
      <span className={styles.srOnly}>{sortLabel}</span>
    </button>
  );
}

function RowFlyout<TRow>({
  row,
  config,
  open,
  onToggle,
  onClose,
}: {
  row: TRow;
  config: TableRowFlyout<TRow>;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const placed = useFlyoutPosition(triggerRef, flyoutRef, open);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={cx(styles.flyoutTrigger, open && styles.flyoutTriggerOn)}
        aria-label={config.triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <IconMore size={16} />
      </button>
      {open ? (
        <div
          ref={flyoutRef}
          className={cx(styles.flyout, placed && styles.flyoutPlaced)}
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          {config.render(row, onClose)}
        </div>
      ) : null}
    </>
  );
}

export function Table<TRow>({
  columns,
  rows,
  rowKey,
  label,
  state = 'data',
  empty,
  visibleRows,
  density = 'default',
  footer,
  rowFlyout,
  onRowClick,
  refreshing = false,
  sort,
  onSortChange,
  sortLabel = '',
  skeletonRows,
}: TableProps<TRow>) {
  const [openFlyout, setOpenFlyout] = useState<string | null>(null);
  const close = useCallback(() => setOpenFlyout(null), []);

  /* SCROLL AND ESCAPE CLOSE IT, and scroll is not a nicety — it is the cost of
   * `position: fixed`. The flyout is anchored to the VIEWPORT, so the row it
   * belongs to slides out from under it and it ends up over an unrelated record,
   * still offering to act on the one that has gone.
   *
   * Re-anchoring every scroll frame is worse: it would ride the table and pass
   * under the pinned header. Blocking the scroll was considered and rejected —
   * a page that stops scrolling reads as frozen, and the wheel is how most
   * people dismiss something they opened by accident.
   *
   * `capture: true` because scroll does not bubble to `document`. */
  useEffect(() => {
    if (!openFlyout) return undefined;
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', esc);
    document.addEventListener('scroll', close, { capture: true, passive: true });
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', esc);
      document.removeEventListener('scroll', close, { capture: true });
      window.removeEventListener('resize', close);
    };
  }, [openFlyout, close]);

  /* One entry per rendered column, flyout included — see widthPercents. */
  const percents = widthPercents([
    ...columns.map((c) => c.width),
    ...(rowFlyout ? [rowFlyout.width ?? FLYOUT_DEFAULT_WIDTH] : []),
  ]);
  const skeletonCount = skeletonRows ?? visibleRows ?? 8;

  /* NO MAX HEIGHT UNLESS ASKED. A table with no scrollbar is a table that does
   * not overflow, so the body is only capped when the caller opts in — and a
   * caller passing its page size gets a card exactly one page tall, which never
   * overflows either. The cap exists for a caller that deliberately shows fewer
   * rows than it holds. */
  const capped = visibleRows !== undefined && rows.length > visibleRows;
  const bodyStyle = capped
    ? ({ '--table-visible-rows': String(visibleRows) } as React.CSSProperties)
    : undefined;

  const head = (
    <thead>
      <tr>
        {columns.map((col, i) => {
          const active = sort && sort.columnId === col.id ? sort.direction : null;
          return (
            <th
              key={col.id}
              scope="col"
              className={cx(styles.th, col.align === 'center' && styles.center)}
              style={{ inlineSize: percents[i] }}
              aria-sort={col.sortable ? (active ? ARIA_SORT[active] : 'none') : undefined}
            >
              {col.sortable && onSortChange ? (
                <SortButton
                  label={col.header}
                  sortLabel={sortLabel}
                  direction={active}
                  onToggle={() => onSortChange(nextSort(sort, col.id))}
                />
              ) : (
                col.header
              )}
            </th>
          );
        })}
        {rowFlyout ? (
          <th
            scope="col"
            className={cx(styles.th, styles.center)}
            style={{ inlineSize: percents[columns.length] }}
          >
            {rowFlyout.header}
          </th>
        ) : null}
      </tr>
    </thead>
  );

  return (
    <div
      className={cx(styles.card, styles[density], refreshing && styles.refreshing)}
      aria-busy={refreshing || undefined}
    >
      {/* BAR, on a refetch only (design/loaders.md §2: background loading that
          does not block interaction).

          The rows stay, dimmed — that rule is older than this feature and it
          stands: throwing away what the reader is looking at, to say something
          they did not ask about, is worse than saying it quietly. What the dim
          could never say is WHY the rows went quiet, and on a fast connection it
          reads as a flicker rather than as a state. The bar is the sentence the
          dim was missing.

          Not on the first load: that is what the skeleton rows below are, and
          two loaders on one surface is the rule broken by construction. */}
      {refreshing ? (
        <div className={styles.refreshBar}>
          <Loader variant="bar" />
        </div>
      ) : null}

      <div
        className={cx(styles.scroller, capped && styles.capped)}
        style={bodyStyle}
        data-table-scroller=""
      >
        <table className={styles.table} aria-label={label}>
          {head}
          {state === 'empty' ? null : (
            <tbody>
              {state === 'loading'
                ? Array.from({ length: skeletonCount }, (_, i) => (
                    <tr key={i} className={styles.row} aria-hidden="true">
                      {columns.map((col, ci) => (
                        <td
                          key={col.id}
                          className={cx(
                            styles.td,
                            col.align === 'center' && styles.center,
                          )}
                          style={{ inlineSize: percents[ci] }}
                        >
                          <Skeleton shape={col.skeleton ?? 'text'} />
                        </td>
                      ))}
                      {rowFlyout ? (
                        <td className={cx(styles.td, styles.center)}>
                          <Skeleton shape="icon" />
                        </td>
                      ) : null}
                    </tr>
                  ))
                : rows.map((row) => {
                    const key = rowKey(row);
                    return (
                      <tr
                        key={key}
                        className={cx(styles.row, onRowClick && styles.rowClickable)}
                        onClick={
                          onRowClick
                            ? (e) => {
                                /* A click that started on a link or a button
                                 * belongs to that control, not to the row. */
                                const el = e.target as HTMLElement;
                                if (el.closest('a, button')) return;
                                onRowClick(row);
                              }
                            : undefined
                        }
                      >
                        {columns.map((col, ci) => (
                          <td
                            key={col.id}
                            className={cx(
                              styles.td,
                              col.align === 'center' && styles.center,
                            )}
                            style={{ inlineSize: percents[ci] }}
                          >
                            {col.cell(row)}
                          </td>
                        ))}
                        {rowFlyout ? (
                          <td className={cx(styles.td, styles.center, styles.flyoutCell)}>
                            <RowFlyout
                              row={row}
                              config={rowFlyout}
                              open={openFlyout === key}
                              onToggle={() =>
                                setOpenFlyout(openFlyout === key ? null : key)
                              }
                              onClose={close}
                            />
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
            </tbody>
          )}
        </table>
      </div>

      {/* The header stays above an empty state. One that also drops the column
          headings reads as a broken page rather than an empty list, and the
          headings are what tell you which filter to relax. */}
      {state === 'empty' ? empty : null}

      {state === 'empty' ? null : footer}
    </div>
  );
}
