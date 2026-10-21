import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { AutoText } from '../../components/AutoText/AutoText';
import type { CustomerListItem } from '../../lib/api-types.provisional';
import { formatDate, formatPhone, type Lang } from '../../lib/formatters';
import styles from './CustomerCard.module.css';

/* ============================================================================
 * CustomerCard — `041`, the row of the customers list below md
 * ============================================================================
 * The table's five columns, stacked. The name is the real anchor, exactly as in
 * the table, and its `::after` is stretched over the card so the whole surface is
 * the touch target.
 *
 * A PLAIN TAP OPENS THE QUICK VIEW; a modified one follows the href. Same split the
 * table's name cell makes (`CustomersListPage`): the href is real so Enter, a screen
 * reader and "open in a new tab" all work, and only the unmodified press — the one
 * case where the app has a better answer — is taken over.
 *
 * Email and phone are `dir="ltr"` in both languages: an address reversed is an
 * address that cannot be checked.
 * ========================================================================= */

interface CustomerCardProps {
  row: CustomerListItem;
  lang: Lang;
  onOpen: (id: string) => void;
}

export function CustomerCard({ row, lang, onOpen }: CustomerCardProps) {
  const { t } = useTranslation('customers');

  return (
    <article className={styles.card}>
      <Link
        to={`/customers/${row.id}`}
        className={styles.name}
        dir="auto"
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          onOpen(row.id);
        }}
      >
        {row.fullName}
      </Link>

      {row.companyName === null ? null : (
        <AutoText className={styles.company}>{row.companyName}</AutoText>
      )}

      <dl className={styles.facts}>
        {row.email === null ? null : (
          <div className={styles.fact}>
            <dt className={styles.label}>{t('list.column.email')}</dt>
            <dd className={styles.value}>
              <bdi dir="ltr">{row.email}</bdi>
            </dd>
          </div>
        )}
        {row.phone === null ? null : (
          <div className={styles.fact}>
            <dt className={styles.label}>{t('list.column.phone')}</dt>
            <dd className={styles.value}>
              <bdi dir="ltr">{formatPhone(row.phone)}</bdi>
            </dd>
          </div>
        )}
        <div className={styles.fact}>
          <dt className={styles.label}>{t('list.column.created')}</dt>
          <dd className={styles.value}>{formatDate(row.createdAtUtc, lang)}</dd>
        </div>
      </dl>
    </article>
  );
}
