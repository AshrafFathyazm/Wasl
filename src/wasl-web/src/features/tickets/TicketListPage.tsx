import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { Dropdown } from '../../components/Dropdown/Dropdown';
import { Table, type TableColumn } from '../../components/Table/Table';
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
  isFiltering,
  readFilters,
  toListParams,
  withFilters,
  type FilterState,
} from './ticketFilters';
import { listTickets, ticketKeys } from './tickets.api';
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

function Footer({
  lang,
  page,
  pageSize,
  totalPages,
  onPage,
  onPageSize,
}: {
  lang: Lang;
  page: number;
  pageSize: number;
  totalPages: number;
  onPage: (n: number) => void;
  onPageSize: (n: number) => void;
}) {
  const { t } = useTranslation('tickets');
  return (
    <div className={styles.footer}>
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

      <div className={styles.pager}>
        <button
          type="button"
          className={styles.pageBtn}
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          {t('list.prev')}
        </button>
        {/* The separator is catalogued, not a literal. Arabic wants a WORD
            here, not a slash, and the eslint rule caught it before the Arabic
            walk would have. */}
        <span className={styles.pageOf}>
          {t('list.pageOf', {
            page: formatNumber(page, lang),
            total: formatNumber(Math.max(totalPages, 1), lang),
          })}
        </span>
        <button
          type="button"
          className={styles.pageBtn}
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          {t('list.next')}
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
      <p className={styles.emptyTitle}>{t('list.errorTitle')}</p>
      <p className={styles.emptyBody}>{detail ?? t('list.errorBody')}</p>
      <button type="button" className={styles.retry} onClick={onRetry}>
        {t('list.errorCta')}
      </button>
    </div>
  );
}

export default function TicketListPage() {
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
  const filters = readFilters(params);
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
  const setFilters = (next: FilterState) => setParams(withFilters(params, next));

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
          <Link className={styles.subjectLine} to={`/tickets/${row.id}`}>
            {row.subject}
          </Link>
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
      width: 116,
      cell: (row) => formatDate(row.createdAtUtc, lang),
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
  const noMatches = items.length === 0 && !pastEnd && isFiltering(filters);

  const emptyKey = pastEnd ? 'pastEnd' : noMatches ? 'noMatch' : 'empty';

  const state = query.isPending ? 'loading' : items.length > 0 ? 'data' : 'empty';

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>{t('list.title')}</h1>

      <TicketFilterBar
        filters={filters}
        onChange={setFilters}
        totalCount={query.data?.totalCount}
      />

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <Table
          label={t('list.tableLabel')}
          columns={columns}
          rows={items}
          rowKey={(row) => row.id}
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
              onPage={setPage}
              onPageSize={setPageSize}
            />
          }
        />
      )}
    </main>
  );
}
