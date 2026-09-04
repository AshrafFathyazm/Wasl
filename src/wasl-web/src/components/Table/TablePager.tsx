import { useTranslation } from 'react-i18next';

import { IconChevronDown } from '../../icons/icons';
import { cx } from '../../lib/cx';
import { formatNumber, type Lang } from '../../lib/formatters';
import { Dropdown } from '../Dropdown/Dropdown';

import styles from './TablePager.module.css';

/* ============================================================================
 * TablePager — rows per page, the range, and the numbered pager
 * ============================================================================
 * PROMOTED OUT OF `TicketListPage` on 2026-09-01 (`033` §7.3), because the
 * customers directory needs the same footer and `component-inventory.md` already
 * assigns the pagination footer to `Table`. Not a tenth primitive.
 *
 * IT READS THE `common` CATALOGUE ITSELF rather than taking six label props,
 * which `Dropdown` established: a control whose every string is a prop pushes
 * the vocabulary into each caller, and two callers is where those drift. The
 * strings moved to `common:pager.*` in the same commit — they were
 * `tickets:list.*` and a page range is not a ticket.
 *
 * WHAT IT DOES NOT DO. It never fetches, never holds the page, and never decides
 * what a page means: `page`, `pageSize` and `totalPages` come from whatever the
 * SERVER returned after its own clamping (BR-7.2 clamps rather than rejecting),
 * so the control renders what came back and not what was asked for.
 * ========================================================================= */

const PAGE_SIZES = [10, 20, 50, 100] as const;

/**
 * WHICH PAGE NUMBERS TO DRAW, with an ellipsis standing in for the rest.
 *
 * The design shows `‹ 1 2 … 16 ›`: the first page, the last, and a window around
 * the current one. A pure function so the shape is testable without a render —
 * every off-by-one in a pager lives at its edges, and the edges are page 1, page
 * 2, the last page and the one before it.
 *
 * `null` is the ellipsis. It carries no page, which is why it is not `0` or
 * `-1`: both are numbers a careless `onPage` would happily navigate to.
 */
export function pageWindow(page: number, totalPages: number): Array<number | null> {
  const last = Math.max(totalPages, 1);
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);

  const around = [page - 1, page, page + 1].filter((n) => n > 1 && n < last);
  const shown = [1, ...around, last];

  const out: Array<number | null> = [];
  let previous = 0;
  for (const n of shown) {
    /* A gap of exactly one page renders as that page rather than as an ellipsis:
     * `1 … 3` hides a single number behind three dots, which is wider than the
     * number it replaced. */
    if (n - previous === 2) out.push(previous + 1);
    else if (n - previous > 2) out.push(null);
    out.push(n);
    previous = n;
  }
  return out;
}

export interface TablePagerProps {
  /** The EFFECTIVE page the server returned, not the one that was requested. */
  page: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;

  /** Counted, not computed — the last page is short, and `page * pageSize`
   *  would claim rows that are not there. */
  rowsOnPage: number;

  lang: Lang;
  onPage: (next: number) => void;
  onPageSize: (next: number) => void;
}

export function TablePager({
  page,
  pageSize,
  totalPages,
  totalCount,
  rowsOnPage,
  lang,
  onPage,
  onPageSize,
}: TablePagerProps) {
  const { t } = useTranslation('common');

  return (
    <div className={styles.footer}>
      <div className={styles.footStart}>
        {/* `031` replaced the raw `<select>` that used to sit here. The visible
            text stays a `<span>` and the control's own label is hidden, because
            `Dropdown` stacks its label above its trigger and this footer is one
            line. The string is passed twice on purpose — once to be seen, once
            to name the control for assistive technology, which a `<label>`
            cannot do for a `div role="combobox"`. */}
        <span className={styles.perPage}>
          {t('pager.rowsPerPage')}
          <span className={styles.perPageField}>
            <Dropdown
              size="sm"
              label={t('pager.rowsPerPage')}
              labelHidden
              value={String(pageSize)}
              onChange={(value) => {
                if (value !== null) onPageSize(Number(value));
              }}
              options={PAGE_SIZES.map((n) => ({
                value: String(n),
                /* BR-8.13 — a page size is a count, not an identifier. */
                label: formatNumber(n, lang),
              }))}
            />
          </span>
        </span>

        {/* THE RANGE, NOT THE PAGE NUMBER. `1–8 of 124` answers "where am I in
            the data"; `page 1 of 16` answers "where am I in the pager", which is
            a question about the control rather than about the rows. It is also
            the only one of the two that stays true when the page size changes
            under the reader. */}
        <span className={styles.range}>
          {t('pager.range', {
            from: formatNumber(totalCount === 0 ? 0 : (page - 1) * pageSize + 1, lang),
            to: formatNumber(
              totalCount === 0 ? 0 : (page - 1) * pageSize + rowsOnPage,
              lang,
            ),
            total: formatNumber(totalCount, lang),
          })}
        </span>
      </div>

      <div className={styles.pager}>
        {/* THE ARROWS ARE GLYPHS AND THEY MIRROR THEMSELVES. `IconChevronDown`
            rotated is one asset for both directions, and the rotation is
            logical: under RTL "previous" points right, which the CSS does with a
            single `scaleX` rather than two icons and a branch. */}
        <button
          type="button"
          className={styles.pageArrow}
          disabled={page <= 1}
          aria-label={t('pager.prev')}
          onClick={() => onPage(page - 1)}
        >
          <IconChevronDown size={18} className={styles.arrowPrev} aria-hidden="true" />
        </button>

        {pageWindow(page, totalPages).map((n, index) =>
          n === null ? (
            /* An ellipsis is not a control: no button, no tab stop, and a name
               for anyone listening rather than a bare "…". */
            <span
              key={`gap-${index}`}
              className={styles.pageGap}
              aria-label={t('pager.morePages')}
            >
              {'…'}
            </span>
          ) : (
            <button
              key={n}
              type="button"
              className={cx(styles.pageBtn, n === page && styles.pageBtnActive)}
              /* `aria-current`, not just a class: the active page is a state and
                 a colour is not announced. */
              {...(n === page ? { 'aria-current': 'page' as const } : {})}
              aria-label={t('pager.goToPage', { page: formatNumber(n, lang) })}
              onClick={() => onPage(n)}
            >
              {formatNumber(n, lang)}
            </button>
          ),
        )}

        <button
          type="button"
          className={styles.pageArrow}
          disabled={page >= Math.max(totalPages, 1)}
          aria-label={t('pager.next')}
          onClick={() => onPage(page + 1)}
        >
          <IconChevronDown size={18} className={styles.arrowNext} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
