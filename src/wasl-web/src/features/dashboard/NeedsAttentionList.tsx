import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Badge } from '../../components/Badge/Badge';
import type { DashboardAttentionItem } from '../../lib/api-types.provisional';
import { formatNumber, type Lang } from '../../lib/formatters';
import { ageParts } from './dashboardFormat';
import styles from './Dashboard.module.css';

/* ============================================================================
 * NeedsAttentionList — the top ten, oldest first
 * ============================================================================
 * Not a table and not paginated. The server caps this at ten and "see all" is a
 * link into the ticket list, because the card answers "what should I pick up
 * now" rather than "what is outstanding" — a pager here would invite reading
 * page four of a prompt.
 *
 * ONE BADGE PER ROW, AND ESCALATED WINS. Both membership reasons can be true at
 * once: an escalated ticket that nobody owns is both. Escalated is the one drawn,
 * because it is the reason with a person behind it — somebody decided this needed
 * attention — and two badges on a 12px row is the design's own decision.
 * ========================================================================== */

export function NeedsAttentionList({
  items,
  lang,
}: {
  items: readonly DashboardAttentionItem[];
  lang: Lang;
}) {
  const { t } = useTranslation('dashboard');

  if (items.length === 0) {
    /* AN EMPTY LIST IS GOOD NEWS AND IS SAID SO. `[]` here means nothing is
       unassigned and nothing is escalated, which is the outcome the card exists
       to drive — rendering "no results" under it would read as a broken filter. */
    return <p className={styles.emptyLine}>{t('attentionList.empty')}</p>;
  }

  return (
    <ul className={styles.rows}>
      {items.map((item) => {
        const age = ageParts(item.ageHours);

        return (
          <li key={item.ticketId}>
            <Link to={`/tickets/${item.ticketId}`} className={styles.row}>
              {/* Latin in every locale, and never through a number formatter
                  (BR-8.13) — it is quoted aloud and pasted between systems. */}
              <span className={styles.rowNumber}>{item.ticketNumber}</span>

              {/* `dir="auto"` — user content, and the two languages sit in one
                  list. Without it an Arabic subject renders its punctuation at
                  the wrong end on the English screen. */}
              <span className={styles.rowSubject} dir="auto">
                {item.subject}
              </span>

              <span className={styles.rowBadge}>
                {item.isEscalated ? (
                  <Badge tone="danger" label={t('attentionList.escalated')} dot={false} />
                ) : (
                  <Badge tone="neutral" label={t('attentionList.unassigned')} dot={false} />
                )}
              </span>

              <span className={styles.rowAge}>
                {t(`age.${age.unit}`, {
                  count: age.value,
                  formatted: formatNumber(age.value, lang),
                })}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
