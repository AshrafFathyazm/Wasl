import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { AutoText } from '../../components/AutoText/AutoText';
import type { TicketListItem } from '../../lib/api-types.provisional';
import { formatDateTime, type Lang } from '../../lib/formatters';
import { formatRelativeAge } from '../../lib/relativeTime';
import { Avatar } from './Avatar';
import { TicketPriorityBadge, TicketStatusBadge } from './TicketBadges';
import styles from './TicketCard.module.css';

/* ============================================================================
 * TicketCard — `041`, the row of the list below md
 * ============================================================================
 * What the table shows across seven columns, stacked: number, subject (two lines
 * at most), customer, status and priority, assignee, age, and the row's actions.
 *
 * THE WHOLE CARD IS ONE LINK. The subject is the real anchor — a keyboard and a
 * screen reader reach the ticket through it, exactly as in the table — and its
 * `::after` is stretched over the card so a thumb anywhere on it navigates. The
 * actions menu sits above that layer (`position: relative; z-index: 1`), so
 * pressing it opens the menu and does not navigate. That is the same split the
 * table makes with `onRowClick` ignoring clicks that start in a button.
 *
 * NO ROW-CLICK HANDLER, no second path: one anchor, one destination.
 *
 * It fetches nothing and decides nothing — `TicketListItem` is what the list
 * query already returned, and `menu` is the `Table`'s own row flyout.
 * ========================================================================= */

interface TicketCardProps {
  row: TicketListItem;
  /** The actions trigger + flyout, or `null` if the list offers none. */
  menu: ReactNode;
  lang: Lang;
}

export function TicketCard({ row, menu, lang }: TicketCardProps) {
  const { t } = useTranslation('tickets');

  return (
    <article className={styles.card}>
      <div className={styles.top}>
        <span className={styles.number} dir="ltr">
          {row.ticketNumber}
        </span>
        {row.isEscalated ? (
          <span className={styles.escalated}>{t('list.escalated')}</span>
        ) : null}
        {menu === null ? null : <span className={styles.menu}>{menu}</span>}
      </div>

      <Link to={`/tickets/${row.id}`} className={styles.subject} dir="auto">
        {row.subject}
      </Link>

      <AutoText className={styles.customer}>{row.customerName}</AutoText>

      <div className={styles.badges}>
        <TicketStatusBadge status={row.status} />
        <TicketPriorityBadge priority={row.priority} />
      </div>

      <div className={styles.foot}>
        {row.assigneeName === null ? (
          <span className={styles.unassigned}>{t('list.unassigned')}</span>
        ) : (
          <span className={styles.assignee}>
            <Avatar name={row.assigneeName} size={24} />
            <AutoText className={styles.assigneeName}>{row.assigneeName}</AutoText>
          </span>
        )}
        <time
          className={styles.age}
          dateTime={row.createdAtUtc}
          title={formatDateTime(row.createdAtUtc, lang)}
        >
          {formatRelativeAge(row.createdAtUtc, Date.now(), lang, t)}
        </time>
      </div>
    </article>
  );
}
