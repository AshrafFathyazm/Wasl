import { Modal } from '../../components/Modal/Modal';
import { useToast } from '../../components/Toast/ToastHost';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';

import { Mark } from '../../brand/Mark';
import { Button } from '../../components/Button/Button';
import { SideSheet } from '../../components/SideSheet/SideSheet';
import { Table, type TableColumn, type TableSort } from '../../components/Table/Table';
import { TablePager } from '../../components/Table/TablePager';
import { IconAdd } from '../../icons/icons';
import { ApiError } from '../../lib/api';
import type { CustomerListItem } from '../../lib/api-types.provisional';
import { formatDate, formatNumber, formatPhone, type Lang } from '../../lib/formatters';
import { avatarBucket, avatarInitial } from '../../lib/tint';

import { CreateCustomerForm } from './CreateCustomerPage';
import { CustomerQuickView } from './CustomerQuickView';
import styles from './CustomersList.module.css';
import { CustomerFilterBar } from './CustomerFilterBar';
import {
  isFilteringCustomers,
  readCustomerFilters,
  toCustomerListParams,
  withCustomerFilters,
  type CustomerFilterState,
} from './customerFilters';
import { customerKeys, listCustomers } from './customers.api';

/* ============================================================================
 * `033` — the customer directory, at `/customers`
 * ============================================================================
 * The first code in the product to call `GET /api/customers`. The endpoint has
 * been live since 2026-08-28 and nothing had reached it.
 *
 * IT IS THE PREVENTIVE HALF OF BR-4. Most duplicate customers are created by
 * someone who could not find the record that already existed — which is why the
 * *no matches* state carries a create CTA and is a different component from *no
 * customers*, and why the search box is the first control on the screen.
 *
 * ── WHAT IS NOT HERE, and each has a backend reason ────────────────────────
 *   the TICKETS COUNT column   `dbo.Tickets` is not in `008`'s contract and the
 *                              column arrives with `018`. The canvas draws it;
 *                              a number computed in the client would be a fact
 *                              the product does not have
 *   the DETAIL PANEL           `032` built the whole profile at `/customers/:id`
 *                              on 2026-08-31, so a 480px read-only side sheet
 *                              would be a second rendering of one record. Ruled
 *                              by the product owner 2026-09-01: the row
 *                              navigates. `030` still owns `Panel`
 *   EDIT / DEACTIVATE          `017`, unbuilt. Absent rather than disabled
 *
 * THIS COMPONENT IS THE ONLY THING THAT FETCHES (ADR-011 §4). The filter bar
 * takes state and callbacks; the company vocabulary it offers is its own query,
 * declared there and for the reason written there.
 * ========================================================================= */

const DEFAULT_PAGE_SIZE = 20;

/** Reading a URL parameter is parsing untrusted input: a hand-typed `?page=abc`
 *  must not reach a query key as `NaN`, which is a cache entry nothing can match
 *  — the screen would load forever and never error. */
function readInt(raw: string | null, fallback: number): number {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export default function CustomersListPage() {
  const { t, i18n } = useTranslation('customers');
  const toast = useToast();
  const lang: Lang = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en';
  const [params, setParams] = useSearchParams();

  const page = readInt(params.get('page'), 1);
  const pageSize = readInt(params.get('pageSize'), DEFAULT_PAGE_SIZE);
  const filters = readCustomerFilters(params);
  const listParams = toCustomerListParams(filters, page, pageSize);

  const query = useQuery({
    queryKey: customerKeys.list(listParams),
    queryFn: ({ signal }) => listCustomers(listParams, signal),

    /* KEEP THE ROWS WHILE THE NEXT PAGE LOADS. Without it, moving page
     * re-skeletons — and it is not a refetch doing it: a page change is a
     * different query key, so the new entry is genuinely pending and there is
     * nothing in the cache to show. `026` measured it and the same applies here. */
    placeholderData: keepPreviousData,
  });

  const items = query.data?.items ?? [];
  const totalCount = query.data?.totalCount ?? 0;
  const totalPages = query.data?.totalPages ?? 1;

  /* THE EFFECTIVE VALUES, from the response and never from the request. BR-7.2
   * clamps rather than rejecting, so a URL asking for `pageSize=500` gets 100 —
   * and a pager rendering 500 would be describing a page nobody has. */
  const effectivePage = query.data?.page ?? page;
  const effectivePageSize = query.data?.pageSize ?? pageSize;

  const setPage = (next: number) => {
    const out = new URLSearchParams(params);
    out.set('page', String(Math.max(next, 1)));
    setParams(out);
  };

  const setPageSize = (next: number) => {
    const out = new URLSearchParams(params);
    out.set('pageSize', String(next));
    /* Page 1: the reader's current offset means nothing at a different size, and
     * page 7 of 20-per-page can be past the end at 100. */
    out.delete('page');
    setParams(out);
  };

  const setFilters = (next: CustomerFilterState) =>
    setParams(withCustomerFilters(params, next));

  /* ── the sort, which `Table` owns as a control and this screen owns as a
   * request (`026` Q-T-3). The column ids ARE the wire values, so there is no
   * map to fall out of step. */
  const sort: TableSort | null =
    filters.sort === ''
      ? null
      : { columnId: filters.sort, direction: filters.dir || 'asc' };

  const onSortChange = (next: TableSort | null) =>
    setFilters({
      ...filters,
      sort: next === null ? '' : (next.columnId as CustomerFilterState['sort']),
      dir: next === null ? '' : next.direction,
    });

  const columns: readonly TableColumn<CustomerListItem>[] = [
    {
      id: 'fullName',
      header: t('list.column.name'),
      sortable: true,
      cell: (row) => (
        /* A FLEX WRAPPER AND `dir="auto"` ON THE VALUE — the note on
           `.subjectAnchor` in `TicketList.module.css` records why one element
           cannot carry both the placement and the truncation. */
        <span className={styles.cellBox}>
          {/* A REAL LINK, and it is not decoration — the same rule the ticket
              list's subject carries. `Table`'s contract: `onRowClick` is a MOUSE
              convenience, adds no tabindex and no role, and "the caller MUST put
              a real link in one cell".

              `033` DID NOT, and the gap was invisible until `035` asserted it:
              the row click navigated, so a mouse worked and a keyboard had no
              path to a customer profile at all. Now that the click opens a side
              sheet instead, this anchor is the only way there for a keyboard or
              a screen reader. Found by the test that asserts it, not by reading
              the file. */}
          <Link
            className={styles.name}
            to={`/customers/${row.id}`}
            dir="auto"
            /* A PLAIN CLICK OPENS THE SHEET; a MODIFIED one follows the href.
             *
             * The frame says a row click opens the quick view, and `Table`
             * deliberately ignores clicks that start inside a link — so without
             * this the name would navigate while the rest of the row opened a
             * sheet, and one row would do two different things depending on
             * where it was hit.
             *
             * The `href` is still real, and that is the point of doing it this
             * way rather than with a `<span>`: Enter navigates, a screen reader
             * announces a link to the profile, and ⌘/ctrl-click, middle-click and
             * "open in new tab" all work. Only the unmodified left click is
             * taken over — the one case where the app has a better answer. */
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
                return;
              event.preventDefault();
              setOpenId(row.id);
            }}
          >
            {row.fullName}
          </Link>
        </span>
      ),
      skeleton: 'text',
    },
    {
      id: 'email',
      header: t('list.column.email'),
      width: 220,
      cell: (row) =>
        row.email === null ? (
          <span className={styles.absent}>{t('list.absent')}</span>
        ) : (
          /* An address is an identifier: LTR whatever the page direction, or the
             leading run lays out on the wrong edge and the reader copies a
             string that does not exist. The wrapper is what keeps its BOX on
             the page's edge — see `.cellBox` in the stylesheet. */
          <span className={styles.cellBox}>
            <bdi className={styles.email} dir="ltr">
              {row.email}
            </bdi>
          </span>
        ),
      skeleton: 'text',
    },
    {
      id: 'phone',
      header: t('list.column.phone'),
      width: 150,
      cell: (row) =>
        row.phone === null ? (
          <span className={styles.absent}>{t('list.absent')}</span>
        ) : (
          <span className={styles.cellBox}>
            <bdi className={styles.phone} dir="ltr">
              {formatPhone(row.phone)}
            </bdi>
          </span>
        ),
      skeleton: 'text',
    },
    {
      id: 'companyName',
      header: t('list.column.company'),
      /* A WIDTH, because `Table`'s contract says to omit it on EXACTLY ONE column —
         the one that absorbs the rest. Both this and the name were left free, and
         the two of them split the slack: names truncated at eleven characters while
         'Northwind Logistics' wrapped onto two lines. The NAME is the column that
         should absorb, so this one is fixed. */
      width: 180,
      cell: (row) =>
        row.companyName === null ? (
          /* An em dash, not an empty cell: a blank reads as "not loaded". */
          <span className={styles.absent}>{t('list.absent')}</span>
        ) : (
          <span dir="auto">{row.companyName}</span>
        ),
      skeleton: 'text',
    },
    {
      id: 'createdAtUtc',
      header: t('list.column.created'),
      width: 132,
      sortable: true,
      cell: (row) => (
        <span className={styles.created}>{formatDate(row.createdAtUtc, lang)}</span>
      ),
      skeleton: 'text',
    },
  ];

  /* ── the three empty states, ORDERED, and each asserting the other two are
   * absent is what the tests do. Past-the-end wins over no-matches because a
   * filtered list can also be paged past its end — and `"no customers yet"` over
   * a filtered list tells the reader their data is gone. */
  const pastEnd = items.length === 0 && totalCount > 0;
  const noMatches = items.length === 0 && !pastEnd && isFilteringCustomers(filters);
  const emptyKey = pastEnd ? 'pastEnd' : noMatches ? 'noMatch' : 'empty';

  /* THE SHEET'S STATE IS DELIBERATELY NOT IN THE URL.
   *
   * Everything else on this screen is — filters, sort, page — because a filtered
   * list is a thing people send each other. A quick view is not: it is a glance
   * at a row on the way somewhere, and putting it in the URL would add a history
   * entry for every row a reader skims and make the back button close a sheet
   * instead of leaving the list. `033` §10 and ADR-011 §2 state the URL rule
   * absolutely, so the exception is written down here rather than assumed.
   *
   * THE OPEN ROW IS HELD AS AN ID, not as the row object. The list refetches on
   * a filter change and on window focus, and a held object would go stale while
   * the sheet displayed it. Looked up from `items` every render, so a row that
   * leaves the page takes its sheet with it. */
  const [openId, setOpenId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  /* THE TWO HALVES OF §3's "closes on a scrim click, EXCEPT over unsaved input".
   *
   * `addDirty` is reported up by the form — only the form knows whether anything
   * was typed, and only this component knows the sheet is being closed.
   * `discarding` is the confirmation, and it is the Modal's first consumer in the
   * product: `030` built the component and had nowhere honest to use it, because
   * the three rows of §1.3 that need one — session expired, delete, unsaved
   * input — were flows that did not exist. This one does. */
  const [addDirty, setAddDirty] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  /* One place that actually closes it, so the sheet's ×, its Escape, its scrim,
     its own «إلغاء» and the modal's «تجاهل» cannot disagree about what closing
     means — and so the dirty flag is cleared exactly once. */
  const closeAdd = () => {
    setDiscarding(false);
    setAddDirty(false);
    setAddOpen(false);
  };

  /* Asked, not done. Every exit from the sheet routes here first. */
  const requestCloseAdd = () => {
    if (addDirty) {
      setDiscarding(true);
      return;
    }
    closeAdd();
  };
  const openRow = items.find((row) => row.id === openId) ?? null;

  /* ERROR FIRST, and the order matters: a failed request also has zero items, so
     checking `empty` first would tell the reader "no customers match" when the
     truth is that nothing was asked. */
  const state = query.isError
    ? 'error'
    : query.isPending
      ? 'loading'
      : items.length === 0
        ? 'empty'
        : 'data';

  return (
    <main className={styles.page}>
      <CustomerFilterBar
        filters={filters}
        onChange={setFilters}
        lang={lang}
        heading={
          <>
            <h1 className={styles.title}>{t('list.title')}</h1>
            <p className={styles.subtitle}>
              {t('list.count', {
                count: totalCount,
                formatted: formatNumber(totalCount, lang),
              })}
            </p>
          </>
        }
        actions={
          <Button
            text={t('new.link')}
            iconStart={<IconAdd size={16} />}
            /* THE SHEET, not the route — the frame supplied 2026-09-03.
               `/customers/new` stays routed and reachable: the no-match empty
               state links to it CARRYING THE SEARCH TERM, and a sheet cannot be
               deep-linked (`035` Q-3). */
            onClick={() => setAddOpen(true)}
          />
        }
      />

      {/* THE TABLE IS ALWAYS DRAWN. It used to be replaced by an error pane, so
          a failed request took the columns, the pager and the card with it and
          nothing on screen said what the reader had been looking at. The notice
          sits under the header now, and both its copy and its shape belong to
          the primitive — one failed request looks the same on every table. */}
      <Table
        columns={columns}
        rows={items}
        rowKey={(row) => row.id}
        label={t('list.title')}
        state={state}
        /* 62px rows. `06-customers-list.md` specifies 61 and the default is 70
             — that default is right for the ticket list, whose subject cell is
             two lines. Every cell here is one. */
        density="dense"
        sort={sort}
        onSortChange={onSortChange}
        sortLabel={t('list.sortBy')}
        /* IT OPENS THE QUICK VIEW NOW. `033` chose "no panel — the row click
             navigates", and the frame supplied 2026-09-03 reversed it: the sheet
             opens, and its «فتح الملف الكامل» is what navigates. The anchor in
             the name cell is unchanged, so a keyboard and a screen reader still
             reach the profile directly — this is the mouse path. */
        onRowClick={(row) => setOpenId(row.id)}
        selectedRowKey={openId}
        empty={
          <div className={styles.pane}>
            <span className={styles.mark} aria-hidden="true">
              <Mark size={44} />
            </span>
            <p className={styles.paneTitle}>{t(`list.${emptyKey}Title`)}</p>
            <p className={styles.paneBody}>{t(`list.${emptyKey}Body`)}</p>

            {pastEnd ? (
              <button
                type="button"
                className={styles.paneCta}
                onClick={() => setPage(Math.max(totalPages, 1))}
              >
                {t('list.pastEndCta')}
              </button>
            ) : noMatches ? (
              /* BR-4's preventive half, and the reason this state is its own
                   component: the term the reader could not find is the name they
                   are about to create, so it is carried into the form rather
                   than retyped. */
              <Link
                className={styles.paneCta}
                to={
                  filters.search
                    ? `/customers/new?name=${encodeURIComponent(filters.search)}`
                    : '/customers/new'
                }
              >
                {filters.search
                  ? t('list.noMatchCta', { term: filters.search })
                  : t('new.link')}
              </Link>
            ) : (
              <Link className={styles.paneCta} to="/customers/new">
                {t('new.link')}
              </Link>
            )}
          </div>
        }
        footer={
          <TablePager
            lang={lang}
            page={effectivePage}
            pageSize={effectivePageSize}
            totalPages={totalPages}
            totalCount={totalCount}
            /* COUNTED, not computed: the last page is short. */
            rowsOnPage={items.length}
            onPage={setPage}
            onPageSize={setPageSize}
          />
        }
        onRetry={() => void query.refetch()}
        traceId={
          query.error instanceof ApiError ? query.error.problem?.traceId : undefined
        }
      />

      {/* ── the row's quick view ─────────────────────────────────────────── */}
      {/* NO SCRIM, which is the default and is the point of the variant:
          `feedback-layer.md` §1.4 puts "open a customer profile" on a panel with
          none, because the reader is comparing this customer to the rows they
          just scanned. The list stays scrollable and clickable behind it. Both
          sheets on this screen used to block; only the one below should. */}
      <SideSheet
        open={openRow !== null}
        onClose={() => setOpenId(null)}
        label={openRow?.fullName ?? ''}
        badge={
          <span
            className={styles.sheetAvatar}
            data-tint={avatarBucket(openRow?.fullName ?? '')}
          >
            {avatarInitial(openRow?.fullName ?? '')}
          </span>
        }
        title={<bdi>{openRow?.fullName}</bdi>}
        subtitle={
          openRow?.companyName === null || openRow === null ? undefined : (
            <bdi>{openRow.companyName}</bdi>
          )
        }
      >
        {openRow === null ? null : (
          <CustomerQuickView
            customer={openRow}
            lang={lang}
            onClose={() => setOpenId(null)}
          />
        )}
      </SideSheet>

      {/* ── «عميل جديد» ─────────────────────────────────────────────────── */}
      {/* SCRIM, and this is the one row of §1.4 that has one: it holds input
          that must not be lost. That single prop also turns on the body-scroll
          lock, the Tab trap and `aria-modal` — the three claims that only hold
          when the page behind really is unreachable. */}
      <SideSheet
        scrim
        open={addOpen}
        onClose={requestCloseAdd}
        label={t('new.title')}
        badge={<IconAdd size={20} />}
        title={t('new.title')}
        subtitle={t('new.sheetHint')}
      >
        <CreateCustomerForm
          /* NO PAGE CHROME. The form's own «رجوع» link and its <h2> rendered
             inside the sheet, under the sheet's own title — two headings, and
             the frame has one. Seen on the screen, not in a test: jsdom finds
             both headings and neither assertion cared which. */
          chrome={false}
          onCancel={requestCloseAdd}
          onDirtyChange={setAddDirty}
          onCreated={() => {
            /* `closeAdd`, not `requestCloseAdd`. The input is not unsaved any
               more — it is saved, which is the whole point — and asking to
               discard a customer that was just created would be absurd. */
            closeAdd();

            /* CLOSE FIRST, THEN THE TOAST — `feedback-layer.md` §1.1 states the
               order, and the order is the whole content of that row: a success
               message rendered INSIDE the panel that is about to close is a
               message that appears and disappears in the same instant. §1.6 says
               the same thing twice, for the sheet and for the modal.
               The close is above; this is after it. */
            toast.show({ tone: 'success', title: t('new.createdToast') });

            /* REFETCHED, never seeded from the write response — `026` §5 and
               `032` AC-1. A list that trusts a create's body shows a row the
               server has not been asked about, and it sorts and pages by rules
               only the server knows. */
            void query.refetch();
          }}
        />
      </SideSheet>

      {/* ── §1.3: "close a form with unsaved input → modal sm, asked BEFORE the
             close completes" ───────────────────────────────────────────────── */}
      <Modal
        open={discarding}
        /* Closing the QUESTION is not answering it. Escape here dismisses the
           confirmation and leaves the sheet open with everything still typed —
           the safe answer, and the same one «متابعة التحرير» gives. */
        onClose={() => setDiscarding(false)}
        title={t('new.discardTitle')}
        /* DESTRUCTIVE, and the word buys exactly one thing here: the opening
           focus goes to «متابعة التحرير» and not to «تجاهل». A dialog asking
           whether to throw away a half-typed form, with Discard under the Return
           key, is one keystroke from doing the thing it exists to prevent. */
        destructive
        footer={
          <>
            {/* CANCEL FIRST in reading order — §3's destructive ordering, the
                reverse of an ordinary modal's. */}
            <Button
              buttonType="secondary-outline"
              withText
              text={t('new.keepEditing')}
              onClick={() => setDiscarding(false)}
            />
            <Button
              buttonType="danger"
              withText
              text={t('new.discardConfirm')}
              onClick={closeAdd}
            />
          </>
        }
      >
        {t('new.discardBody')}
      </Modal>
    </main>
  );
}
