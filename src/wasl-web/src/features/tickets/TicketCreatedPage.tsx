import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useParams } from 'react-router-dom';

import { Toast } from '../../components/Toast/Toast';
import styles from './CreateTicket.module.css';

/* ============================================================================
 * TicketCreatedPage — A PLACEHOLDER, and it says so
 * ============================================================================
 * The ticket DETAIL screen is `010`. This exists for one reason: the frozen
 * contract promises `Location: /api/tickets/{id}` resolves, and `009` built
 * `GET /api/tickets/{id}` so it does. Without a route here, a `201` would
 * navigate to a 404 and AC-1's round trip would be unprovable — the alternative
 * was staying on the form, which makes the created ticket invisible.
 *
 * It fetches NOTHING. The number arrives in navigation state, so this page
 * proves the round trip without duplicating `010`'s read.
 *
 * `010` replaces this component. Nothing else changes: the route path and the
 * navigation are already what they will be.
 * ============================================================================ */

interface CreatedState {
  ticketNumber?: string;
}

export default function TicketCreatedPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const location = useLocation();
  const [dismissed, setDismissed] = useState(false);

  const ticketNumber = (location.state as CreatedState | null)?.ticketNumber;

  return (
    <div className={styles.page}>
      {ticketNumber !== undefined && !dismissed ? (
        <Toast
          dismissLabel={t('common:dismiss')}
          onDismiss={() => setDismissed(true)}
          autoDismissMs={8000}
        >
          {t('tickets:new.created')}{' '}
          {/* VERBATIM. Latin digits in both locales, never through a
              locale-aware number formatter — it is a string, not a number
              (BR-8.13). `dir="ltr"` because an identifier in an RTL paragraph
              is reordered by bidi and the reader copies something that does not
              exist. */}
          <bdi dir="ltr">
            <strong>{ticketNumber}</strong>
          </bdi>
        </Toast>
      ) : null}

      <h2 className={styles.title}>{t('tickets:detail.placeholderTitle')}</h2>
      <p className={styles.disabledNote}>{t('tickets:detail.placeholderBody')}</p>
      <p className={styles.resultMeta} dir="ltr">
        {id}
      </p>
    </div>
  );
}
