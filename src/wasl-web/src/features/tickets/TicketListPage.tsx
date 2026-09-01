import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { Mark } from '../../brand/Mark';
import { Dropdown } from '../../components/Dropdown/Dropdown';
import { Table, type TableColumn } from '../../components/Table/Table';
import { IconChevronDown, IconEye } from '../../icons/icons';
import { IconArrowUp, IconCircleX, IconReassign } from '../../icons/icons-added';
import {
  IconEmail,
  IconLivechat,
  IconSms,
  IconWebform,
  IconWhatsapp,
} from '../../icons/icons';
import { ApiError } from '../../lib/api';
import { cx } from '../../lib/cx';
import type { TicketListItem } from '../../lib/api-types.provisional';
import { formatDate, formatNumber, type Lang } from '../../lib/formatters';
import { TicketFilterBar } from './TicketFilterBar';
import {
  NO_FILTERS,
  TAB_STATUSES,
  isFiltering,
  readFilters,
  toListParams,
  withFilters,
  type FilterState,
} from './ticketFilters';
import { countTickets, listTickets, ticketKeys } from './tickets.api';
import { TicketPriorityText, TicketStatusBadge } from './TicketBadges';
import styles from './TicketList.module.css';

/**
 * THE ONLY THING ON THIS SCREEN THAT FETCHES (ADR-011 §4). Fetching at the route
 * is what makes loading and error one decision instead of one per child, and it
 * is why no cell below takes a query.
 *
 * `page` and `pageSize` live in the URL, not in state (ADR-011 §1, no global
 * store). Three things fall out of that and none is free otherwise: the back
 * button moves between pages, a link to page 4 is a link to page 4, and a
 * refresh lands where you were.
 *
 * NOTHING HERE READS FROM A WRITE RESPONSE, and nothing calls setQueryData —
 * spec §5. A body returned by a write is what the server HAD, not what it
 * STORED; the two already differ by four digits of a timestamp. A list is
 * exactly where a helpfully reused write response would go.
 */

/* One asset per channel, keyed on the WIRE value. The glyph sits inside the
 * pill beside the label — it is not the label's replacement. */
const CHANNEL_ICON = {
  Email: IconEmail,
  WhatsApp: IconWhatsapp,
  LiveChat: IconLivechat,
  Sms: IconSms,
  WebForm: IconWebform,
} as const;

/* The tint is the scanning aid: "every WhatsApp ticket" is found by colour
 * before a word is read, which a monochrome glyph cannot do. The values are
 * --channel-* tokens, not literals (DESIGN-BRIEF rule 3). */
const CHANNEL_CLASS: Record<string, string | undefined> = {
  Email: styles.chEmail,
  WhatsApp: styles.chWhatsApp,
  LiveChat: styles.chLiveChat,
  Sms: styles.chSms,
  WebForm: styles.chWebForm,
};

/* Q-4 — A FEATURE-LOCAL INITIALS CIRCLE. Not a ninth primitive, and not an
 * image: there is no avatar URL on the row and none in the contract.
 * aria-hidden because the name is right beside it — announcing "ع" before
 * "عمر سعيد" is noise, not information. */
/**
 * THE SUBJECT'S TOOLTIP — the full sentence, only when the cell actually cut it.
 *
 * The check is scrollWidth > clientWidth ON HOVER, not a stored flag: column
 * widths are ratios of the frame, so whether a subject truncates changes with
 * the window and a value computed at render is stale after the first resize.
 * A tooltip on every subject would be the wrong fix — hovering a short subject
 * and being told the same words twice reads as a glitch.
 *
 * aria-hidden: the full text is already the link's accessible name, because
 * truncation is visual — a screen reader was never given the shortened form.
 */
function SubjectLink({ to, subject }: { to: string; subject: string }) {
  const [tip, setTip] = useState<false | 'above' | 'below'>(false);

  /* ABOVE by default, BELOW for the first rows. The tooltip lives inside the
   * table's scroller, and a scroller clips on both axes — the same fact that
   * made the row flyout position: fixed. A tip popping above row one leaves the
   * scroll box and is cut mid-sentence, which was the report: "أول تول تيب
   * بيختفي جزء منه". Rows near the top get the tip under the link instead;
   * everywhere else keeps the design's above placement. */
  const measure = (el: HTMLElement) => {
    if (el.scrollWidth <= el.clientWidth) {
      setTip(false);
      return;
    }
    const table = el.closest('table');
    const room = table
      ? el.getBoundingClientRect().top - table.getBoundingClientRect().top
      : Number.POSITIVE_INFINITY;
    setTip(room < 110 ? 'below' : 'above');
  };

  return (
    <span className={styles.subjectAnchor}>
      <Link
        className={styles.subjectLine}
        dir="auto"
        to={to}
        onMouseEnter={(e) => measure(e.currentTarget)}
        onMouseLeave={() => setTip(false)}
        onFocus={(e) => measure(e.currentTarget)}
        onBlur={() => setTip(false)}
      >
        {subject}
      </Link>
      {tip === false ? null : (
        <span
          className={cx(styles.subjectTip, tip === 'below' && styles.subjectTipBelow)}
          aria-hidden="true"
          dir="auto"
        >
          {subject}
        </span>
      )}
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className={styles.avatar} aria-hidden="true">
      {[...name.trim()][0] ?? ''}
    </span>
  );
}

const PAGE_SIZES = [10, 20, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 20;

/** Reading a URL parameter is parsing untrusted input. A hand-typed `?page=abc`
 *  must not reach a query key as `NaN` — that is a cache entry nothing can ever
 *  match, so the screen loads forever and never errors. */
function readInt(raw: string | null, fallback: number): number {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * WHICH PAGE NUMBERS TO DRAW, with an ellipsis standing in for the rest.
 *
 * The design shows `‹ 1 2 … 16 ›`: the first page, the last page, and a window
 * around the current one. Written as a pure function so the shape is testable
 * without a render — every off-by-one in a pager lives at its edges, and the
 * edges are page 1, page 2, the last page and the one before it.
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
    /* A gap of exactly one page renders as that page rather than as an
     * ellipsis: `1 … 3` hides a single number behind three dots, which is
     * wider than the number it replaced. */
    if (n - previous === 2) out.push(previous + 1);
    else if (n - previous > 2) out.push(null);
    out.push(n);
    previous = n;
  }
  return out;
}

function Footer({
  lang,
  page,
  pageSize,
  totalPages,
  totalCount,
  rowsOnPage,
  onPage,
  onPageSize,
}: {
  lang: Lang;
  page: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;
  rowsOnPage: number;
  onPage: (n: number) => void;
  onPageSize: (n: number) => void;
}) {
  const { t } = useTranslation('tickets');
  return (
    <div className={styles.footer}>
      <div className={styles.footStart}>
      {/* `031` replaced the raw `<select>` that used to sit here. The visible
          text stays a `<span>` and the control's own label is hidden, because
          `Dropdown` stacks its label above its trigger and this footer is one
          line. The string is passed twice on purpose — once to be seen, once to
          name the control for assistive technology, which a `<label>` cannot do
          for a `div role="combobox"`. */}
      <span className={styles.perPage}>
        {t('list.rowsPerPage')}
        <span className={styles.perPageField}>
          <Dropdown
            size="sm"
            label={t('list.rowsPerPage')}
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

      {/* THE RANGE, NOT THE PAGE NUMBER. `1–8 of 124` answers "where am I in the
          data"; `page 1 of 16` answers "where am I in the pager", which is a
          question about the control rather than about the tickets. The design
          shows the range, and it is also the only one of the two that stays true
          when the page size changes under the reader. */}
      <span className={styles.range}>
        {t('list.range', {
          from: formatNumber(totalCount === 0 ? 0 : (page - 1) * pageSize + 1, lang),
          /* The LAST ROW ON THIS PAGE, counted rather than computed: the final
             page is short, and `page * pageSize` would claim rows that are not
             there. */
          to: formatNumber(totalCount === 0 ? 0 : (page - 1) * pageSize + rowsOnPage, lang),
          total: formatNumber(totalCount, lang),
        })}
      </span>
      </div>

      <div className={styles.pager}>
        {/* THE ARROWS ARE GLYPHS AND THEY MIRROR THEMSELVES. `IconChevronDown`
            rotated is one asset for both directions, and the rotation is logical:
            under RTL "previous" points right, which is what the CSS does with a
            single `scaleX` on the row rather than two icons and a branch. */}
        <button
          type="button"
          className={styles.pageArrow}
          disabled={page <= 1}
          aria-label={t('list.prev')}
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
              aria-label={t('list.morePages')}
            >
              {'…'}
            </span>
          ) : (
            <button
              key={n}
              type="button"
              className={cx(styles.pageBtn, n === page && styles.pageBtnActive)}
              /* `aria-current`, not just a class: the active page is a state, and
                 a colour is not announced. */
              {...(n === page ? { 'aria-current': 'page' as const } : {})}
              aria-label={t('list.goToPage', { page: formatNumber(n, lang) })}
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
          aria-label={t('list.next')}
          onClick={() => onPage(page + 1)}
        >
          <IconChevronDown size={18} className={styles.arrowNext} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation('tickets');
  /* The server's own message when it authored one, our copy otherwise. A
   * transport failure has no ProblemDetails to read, and rendering an empty
   * string for it would say nothing at all. */
  const detail = error instanceof ApiError ? error.problem?.detail : undefined;
  return (
    <div className={styles.error} role="alert">
      <span className={styles.emptyMark} aria-hidden="true">
        <Mark size={44} />
      </span>
      <p className={styles.emptyTitle}>{t('list.errorTitle')}</p>
      <p className={styles.emptyBody}>{detail ?? t('list.errorBody')}</p>
      <button type="button" className={styles.retry} onClick={onRetry}>
        {t('list.errorCta')}
      </button>
    </div>
  );
}


/**
 * Whole minutes since a timestamp, floored at zero.
 *
 * FLOORED, not rounded: 90 seconds is "1 minute ago", never "2". And zero is a
 * real answer — the catalogue gives it its own plural form ("just now"), because
 * "0 minutes ago" is a sentence no one says.
 */
function minutesSince(timestamp: number): number {
  if (!timestamp) return 0;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
}

/* =============================================================================
 * THREE QUEUES, ONE SCREEN
 * =============================================================================
 * `/tickets`, `/tickets/mine` and `/tickets/unassigned` are this same table with
 * one filter decided by the PATH instead of by the reader. `assignee=me` and
 * `assignee=unassigned` already exist on `GET /api/tickets` (`015`), and `me` is
 * resolved from the TOKEN server-side — so this client never sends the signed-in
 * user's own id, and reading somebody else's queue is not one URL edit away.
 *
 * A SECOND COMPONENT WAS THE OBVIOUS SHAPE AND IS THE WRONG ONE: the table, the
 * five chip counts, the pager, the row menu and an eight-report design pass
 * would all exist twice, and the copy that drifts first is the one nobody is
 * looking at.
 *
 * THE SCOPE IS NOT A FILTER, and every difference below follows from that one
 * sentence:
 *   - it is never written to the URL — the path already says it, and one fact
 *     stated twice drifts
 *   - it is not an applied chip, because a chip has an `×`, and removing this
 *     one would leave the nav highlighting "My tickets" over everybody's
 *   - `Clear all` does not clear it
 *   - the chip counts are scoped to it, or "My tickets" heads a four-row table
 *     with 131 beside `All`
 *   - it does not count as filtering, so an empty personal queue reads "no
 *     tickets" rather than "no matches" under a Clear-filters button
 * ========================================================================== */
export type TicketQueue = 'mine' | 'unassigned';

export default function TicketListPage({
  queue,
}: {
  queue?: TicketQueue | undefined;
}) {
  const { t, i18n } = useTranslation('tickets');
  const lang: Lang = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en';
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const page = readInt(params.get('page'), 1);
  const pageSize = readInt(params.get('pageSize'), DEFAULT_PAGE_SIZE);

  /* `015` AC-14. The filters are READ FROM THE URL on every render — there is no
   * state and no mirror. A filtered list therefore survives a reload, the back
   * button, and being pasted to a colleague, and `readFilters` drops anything
   * the server would not accept so a stale link degrades to a wider list rather
   * than to a 400 (ADR-011 §2). */
  /* The URL's filters, then the path's scope ON TOP — in that order, so a stale
   * `?assignee=` in a pasted link cannot outrank the queue being viewed. */
  const urlFilters = readFilters(params);
  const scopeAssignee =
    queue === 'mine' ? 'me' : queue === 'unassigned' ? 'unassigned' : '';
  const filters: FilterState =
    scopeAssignee === '' ? urlFilters : { ...urlFilters, assignee: scopeAssignee };

  const listParams = toListParams(filters, page, pageSize);

  const query = useQuery({
    /* The key is the WHOLE parameter object, which is what the fetcher was
     * written for: "`015` adds filter properties to this same object, and
     * caching per filter combination falls out of it." */
    queryKey: ticketKeys.list(listParams),
    queryFn: ({ signal }) => listTickets(listParams, signal),

    /* KEEP THE ROWS WHILE THE NEXT PAGE LOADS.
     *
     * Without this, moving page re-skeletons — and it is not a refetch doing
     * it, which is why "refreshing" alone did not fix it: a page change is a
     * DIFFERENT query key, so the new entry is genuinely pending and there is
     * nothing in the cache to show. React Query is behaving correctly; the
     * screen was asking the wrong question.
     *
     * With it, the previous page stays on screen, dimmed, until the next one
     * arrives. The table does not collapse to a skeleton and back on every
     * click of Next, which on a fast connection is a flash rather than a state.
     *
     * Found by a test, not by reading: the assertion was written first and the
     * page failed it. */
    placeholderData: keepPreviousData,
  });

  /* ==========================================================================
   * THE CHIP COUNTS — one request per status, and the cost is stated here
   * ==========================================================================
   * The design puts a count on every status chip and on All. `GET /api/tickets`
   * returns ONE `totalCount`, for the query it was given, so five numbers means
   * five questions. Each is asked with `pageSize: 1`: the row is thrown away and
   * only the envelope's count is read.
   *
   * WHY NOT ONE REQUEST: there is no aggregate endpoint. `020-dashboard` owns
   * `DashboardAggregatesQuery` — one of the two query classes `CLAUDE.md`
   * sanctions — and it is not built. When it is, this block becomes one call and
   * the chips do not change.
   *
   * THE COUNTS ARE THE WHOLE QUEUE — no status filter, no search, no facets.
   * The first version counted "what the other filters leave", which sounded
   * right and was wrong: the product owner's frame shows a search matching
   * NOTHING while the chips still read 124 / 18 / 42 / 31 / 33. The chips answer
   * "how much work exists", not "how much survives my current question" — and
   * as a bonus they stop refetching on every keystroke of the search box.
   *
   * `Closed` is queried although it has no chip: the subtitle says *"124 open
   * tickets"*, and open is every status that is not Closed. Without that number
   * the subtitle would have to call the total "open", which is a claim the data
   * does not make. */
  const countStatuses = [...TAB_STATUSES, 'Closed'] as const;

  const countQueries = useQueries({
    queries: countStatuses.map((status) => {
      /* SCOPED TO THE QUEUE, and to nothing else the reader picked. The counts
       * answer "how much work is in the list I am looking at" — on
       * `/tickets/mine` that is my work, and an unscoped count puts the team's
       * 131 above a table holding four rows. */
      const countParams = toListParams(
        { ...NO_FILTERS, assignee: scopeAssignee, status: [status] },
        1,
        1,
      );
      return {
        queryKey: ticketKeys.count(countParams),
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          countTickets(countParams, signal),
        /* A count is not what the reader came for; a minute of staleness is
         * cheaper than a sixth request on every keystroke of the search box. */
        staleTime: 60_000,
      };
    }),
  });

  const statusCounts: Record<string, number | undefined> = {};
  countStatuses.forEach((status, index) => {
    statusCounts[status] = countQueries[index]?.data;
  });

  /* All = the sum of every status, which is the total under the non-status
   * filters. Absent until every count has landed: a total assembled from four of
   * five numbers is wrong, and wrong is worse than pending. */
  const allCount = countQueries.every((q) => q.data !== undefined)
    ? countQueries.reduce((sum, q) => sum + (q.data ?? 0), 0)
    : undefined;

  const openCount =
    allCount === undefined ? undefined : allCount - (statusCounts['Closed'] ?? 0);

  /* WHEN THE LIST WAS LAST TRUE, not when this component rendered.
   * `dataUpdatedAt` is the moment the data arrived; a clock started on mount
   * would count from a navigation and say "just now" about a cached list that is
   * ten minutes old. */
  const updatedAt = query.dataUpdatedAt;

  /* THE SERVER'S NUMBERS, NEVER THE REQUEST'S. BR-7.2 clamps rather than
   * rejecting, so asking for pageSize 500 returns a 200 carrying 100 — and a
   * control rendering what was SENT would show 500 above a hundred rows and
   * quietly disagree with the data beside it. */
  const effectivePageSize = query.data?.pageSize ?? pageSize;
  const effectivePage = query.data?.page ?? page;

  const setPage = (next: number) => {
    const p = new URLSearchParams(params);
    p.set('page', String(next));
    setParams(p);
  };

  const setPageSize = (next: number) => {
    const p = new URLSearchParams(params);
    p.set('pageSize', String(next));
    /* Page 7 of 20-row pages is not page 7 of 100-row pages. Anything but
     * returning to 1 lands the reader somewhere they did not choose, and on a
     * short list lands them past the end. */
    p.set('page', '1');
    setParams(p);
  };

  /* A filter change RESETS THE PAGE — `withFilters` drops it — for the same
   * reason a page-size change does: page 5 of an unfiltered list is rarely page
   * 5 of a filtered one, and keeping it turns "filter to Open" into an empty
   * table with a pager reading 5 of 2. `pageSize` survives, because it is a
   * preference about the viewport rather than a position in a result set. */
  /* THE SCOPE IS STRIPPED ON THE WAY OUT. `withFilters` writes whatever it is
   * given, and writing the queue's own assignee would put it in the query string
   * beside the path that already declares it — two places to keep in step, one
   * of which survives a click to another queue. */
  const setFilters = (next: FilterState) =>
    setParams(
      withFilters(params, scopeAssignee === '' ? next : { ...next, assignee: '' }),
    );

  const columns: TableColumn<TicketListItem>[] = [
    {
      id: 'subject',
      header: t('list.column.subject'),
      cell: (row) => (
        <span className={styles.subject}>
          {/* A REAL LINK, and it is not decoration. onRowClick is a mouse
              convenience — it adds no tabindex and no role, deliberately — so
              this anchor is the only way a keyboard or a screen reader reaches
              the ticket. Removing it leaves the row navigable by mouse only. */}
          {/* `dir="auto"` on the element that holds the text (measured: an RTL
              cell cuts a Latin subject at its START), and the tooltip lives in
              SubjectLink — see its note. */}
          <SubjectLink to={`/tickets/${row.id}`} subject={row.subject} />
          <span className={styles.subjectMeta}>
            <span className={styles.ticketNumber} dir="ltr">
              {row.ticketNumber}
            </span>
            {row.isEscalated ? (
              <span className={styles.escalated}>{t('list.escalated')}</span>
            ) : null}
          </span>
        </span>
      ),
    },
    {
      id: 'customer',
      header: t('list.column.customer'),
      width: 124,
      cell: (row) => <span className={styles.truncate}>{row.customerName}</span>,
    },
    {
      id: 'channel',
      header: t('list.column.channel'),
      width: 150,
      skeleton: 'pill',
      cell: (row) => {
        const Icon = CHANNEL_ICON[row.channel];
        return (
          <span className={cx(styles.channel, CHANNEL_CLASS[row.channel])}>
            <Icon size={14} className={styles.channelIcon} />
            {t(`channel.${row.channel}`)}
          </span>
        );
      },
    },
    {
      id: 'status',
      header: t('list.column.status'),
      width: 160,
      skeleton: 'pill',
      cell: (row) => <TicketStatusBadge status={row.status} />,
    },
    {
      id: 'priority',
      header: t('list.column.priority'),
      width: 92,
      cell: (row) => <TicketPriorityText priority={row.priority} />,
    },
    {
      id: 'assignee',
      header: t('list.column.assignee'),
      width: 150,
      skeleton: 'avatar',
      cell: (row) =>
        row.assigneeName === null ? (
          /* Text, not an em dash. A dash reads as nothing to a screen reader and
             says little to a sighted user either. */
          <span className={styles.muted}>{t('list.unassigned')}</span>
        ) : (
          <span className={styles.assignee}>
            <Avatar name={row.assigneeName} />
            <span className={styles.truncate}>{row.assigneeName}</span>
          </span>
        ),
    },
    {
      id: 'created',
      header: t('list.column.created'),
      /* 116, not the 96 the preview measured. The preview drew the date with
       * its own cell padding; `Table` pads 16px each side, so 96 left 64px for
       * a string that needs 73 — and `30/08/2026` rendered as `0/08/2026`, one
       * digit short, in a way that reads as a data error rather than a width
       * one. Measured on the real screen: cell 97, content 105. */
      width: 132,
      /* THE DATE GETS ITS OWN BOX, and it is not decoration — see `.dateCell`.
       * 116 was measured short AGAIN on 2026-08-31: cell 75, content 83, so the
       * run overflowed 8px into the actions column and the flyout trigger's
       * hover background painted over the leading digit. `29/08/2026` read as
       * `9/08/2026` — a plausible date, which is the whole problem. */
      cell: (row) => (
        <span className={styles.dateCell}>{formatDate(row.createdAtUtc, lang)}</span>
      ),
    },
  ];

  /* NO ROW MENU. Spec Q-7 ruled one out — "Open is the row click, and copy-
   * the-number is one action behind two clicks" — and this screen shipped one
   * anyway, holding a single View item that duplicated the row click. That is
   * the empty menu Q-7 was about, with one thing in it.
   *
   * `Table` keeps the capability: the customer preview uses it, and the first
   * action that CHANGES something (011, 012) is what earns it back here. */
  const openTicket = (row: TicketListItem) => {
    void navigate(`/tickets/${row.id}`);
  };

  const items = query.data?.items ?? [];
  const totalPages = query.data?.totalPages ?? 0;

  /* PAST THE END IS NOT EMPTY, and the contract is what makes them separable:
   * `page` clamps UP to 1 and is never clamped DOWN, so `?page=99` on a list of
   * three pages returns page 99, zero items, and a totalCount of 137. Both
   * states arrive as an empty array; only totalCount tells them apart.
   *
   * Rendering "No tickets yet" over a list that holds 137 of them tells the
   * reader their data is gone. It is the one state here reachable by editing
   * the address bar, which is how it will actually be met. */
  const pastEnd = items.length === 0 && (query.data?.totalCount ?? 0) > 0;

  /* NO MATCHES IS NOT NO TICKETS, and the two must not share a component — it is
   * `015`'s own criterion and the preventive half of the feature. "No tickets
   * yet" over a filtered list tells the reader their data is gone; "nothing
   * matches these filters" tells them what to undo, and its call to action
   * clears the filters rather than offering to create something.
   *
   * The three states are ordered: past the end wins over no-matches, because a
   * filtered list CAN be paged past its end and the pager is the thing to fix
   * first. */
  /* `urlFilters`, NOT `filters`: on a scoped queue the assignee is the page
   * rather than a choice, so an empty personal queue is "no tickets yet" and
   * only a filter the READER set turns it into "no matches". */
  const noMatches = items.length === 0 && !pastEnd && isFiltering(urlFilters);

  /* FIVE STATES, NOT THREE. `empty` says "nothing has arrived on any channel",
   * which is TRUE on `/tickets` and FALSE on an empty `/tickets/mine` while the
   * team's queue holds 131 — the reader would be told the product has no tickets
   * because none are theirs. A scoped queue gets its own sentence. */
  const emptyKey = pastEnd
    ? 'pastEnd'
    : noMatches
      ? 'noMatch'
      : queue === 'mine'
        ? 'emptyMine'
        : queue === 'unassigned'
          ? 'emptyUnassigned'
          : 'empty';

  const state = query.isPending ? 'loading' : items.length > 0 ? 'data' : 'empty';

  return (
    <main className={styles.page}>
      <TicketFilterBar
        filters={filters}
        onChange={setFilters}
        totalCount={allCount}
        statusCounts={statusCounts}
        /* So the bar draws no removable chip for the assignee and مسح الكل
           leaves it alone — see the scope note at the top of this file. */
        lockedAssignee={scopeAssignee !== ''}
        /* The heading rides INSIDE the bar so the search box shares its line —
           the frames' layout. The page still authors every word of it. */
        heading={
          <>
            <h1 className={styles.title}>
              {queue === undefined ? t('list.title') : t(`list.title.${queue}`)}
            </h1>
            {openCount === undefined ? null : (
              <p className={styles.subtitle}>
                {t('list.openCount', {
                  count: openCount,
                  formatted: formatNumber(openCount, lang),
                })}
                <span className={styles.subtitleDot} aria-hidden="true">
                  {'·'}
                </span>
                {t('list.updatedAgo', {
                  count: minutesSince(updatedAt),
                  formatted: formatNumber(minutesSince(updatedAt), lang),
                })}
              </p>
            )}
          </>
        }
      />

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <Table
          label={t('list.tableLabel')}
          columns={columns}
          rows={items}
          rowKey={(row) => row.id}
          /* THE ROW MENU IS BACK, and Q-7's ruling is the reason it looks like
             this rather than the reason it is absent.

             Q-7 turned one down when it held a single View item that duplicated
             the row click — "the empty menu Q-7 was about, with one thing in it".
             The design supplies four actions, and three of them are things the
             row click cannot do.

             EVERY ITEM NAVIGATES. Reassign and Close are real operations with a
             frozen contract each — `PUT /assignee` and `PUT /status`, both
             taking `expectedVersion` and both answering three distinguishable
             `409`s — and the controls that handle those answers live on the
             detail screen. Firing either from a list row would mean a second
             implementation of the concurrency handling, in a component that has
             no version to send. So the menu takes the user to where the action
             is, carrying its intent. */
          rowFlyout={{
            header: t('list.column.actions'),
            triggerLabel: t('list.rowActions'),
            render: (row, close) => (
              <div className={styles.rowMenu} role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className={styles.rowMenuItem}
                  onClick={() => {
                    close();
                    void navigate(`/tickets/${row.id}`);
                  }}
                >
                  <IconEye size={16} aria-hidden="true" />
                  {t('list.view')}
                </button>

                <button
                  type="button"
                  role="menuitem"
                  className={styles.rowMenuItem}
                  onClick={() => {
                    close();
                    void navigate(`/tickets/${row.id}`, { state: { intent: 'assign' } });
                  }}
                >
                  <IconReassign size={16} aria-hidden="true" />
                  {t('list.action.reassign')}
                </button>

                {/* DISABLED, WITH THE REASON IN ITS ACCESSIBLE NAME. `016` is
                    not built and there is no escalate endpoint in the API — the
                    design draws the item, so it is drawn, and it does not
                    pretend to work. This is the one place on this screen where a
                    disabled control is right: the item is part of a menu whose
                    shape the design fixes, and removing it would move the three
                    below it. */}
                <button
                  type="button"
                  role="menuitem"
                  className={styles.rowMenuItem}
                  disabled
                  aria-disabled="true"
                  title={t('list.action.escalateUnavailable')}
                >
                  <IconArrowUp size={16} aria-hidden="true" />
                  {t('list.action.escalate')}
                </button>

                <span className={styles.rowMenuRule} role="separator" />

                <button
                  type="button"
                  role="menuitem"
                  className={cx(styles.rowMenuItem, styles.rowMenuItemDanger)}
                  onClick={() => {
                    close();
                    void navigate(`/tickets/${row.id}`, { state: { intent: 'close' } });
                  }}
                >
                  <IconCircleX size={16} aria-hidden="true" />
                  {t('list.action.close')}
                </button>
              </div>
            ),
          }}
          state={state}
          /* A refetch DIMS and keeps the rows. isPending is the FIRST load;
           * isFetching is any load, so this is true only for a background one. */
          /* isPlaceholderData: the rows on screen belong to the PREVIOUS page
           * and the next one is in flight. isFetching-without-isPending: the
           * same key is being refetched. Both are "these rows are not fresh",
           * and neither is the first load. */
          refreshing={query.isPlaceholderData || (query.isFetching && !query.isPending)}
          skeletonRows={Math.min(effectivePageSize, 10)}
          empty={
            <div className={styles.empty}>
              {/* THE MARK ON A PATTERNED GROUND — ruled by the product owner
                  2026-08-31: an empty surface in this product carries the Wasl
                  mark. The tokens are shared (`tokens.css`), so this card and
                  the customer profile's two blank states use one asset.

                  The glyph is `aria-hidden`: the heading under it already says
                  what happened, and a screen reader announcing "Wasl" before
                  "no matching results" adds a brand name to a failure. */}
              <span className={styles.emptyMark} aria-hidden="true">
                <Mark size={44} />
              </span>
              <p className={styles.emptyTitle}>{t(`list.${emptyKey}Title`)}</p>
              <p className={styles.emptyBody}>{t(`list.${emptyKey}Body`)}</p>
              {pastEnd ? (
                <button
                  type="button"
                  className={styles.retry}
                  onClick={() => setPage(Math.max(totalPages, 1))}
                >
                  {t('list.pastEndCta')}
                </button>
              ) : noMatches ? (
                /* Clears the FACETS and keeps the search term, matching the bar's
                   own Clear all: the reader's typed question is the last thing to
                   throw away, and the search box has its own clear beside it. */
                <button
                  type="button"
                  className={styles.retry}
                  onClick={() =>
                    setFilters({
                      status: [],
                      priority: [],
                      category: [],
                      channel: [],
                      assignee: '',
                      escalated: undefined,
                      search: filters.search,
                      createdFrom: '',
                      createdTo: '',
                    })
                  }
                >
                  {t('list.noMatchCta')}
                </button>
              ) : null}
            </div>
          }
          onRowClick={openTicket}
          footer={
            <Footer
              lang={lang}
              page={effectivePage}
              pageSize={effectivePageSize}
              totalPages={totalPages}
              totalCount={query.data?.totalCount ?? 0}
              /* COUNTED, not computed: the last page is short, and
                 `page * pageSize` would claim rows that are not there. */
              rowsOnPage={items.length}
              onPage={setPage}
              onPageSize={setPageSize}
            />
          }
        />
      )}
    </main>
  );
}
