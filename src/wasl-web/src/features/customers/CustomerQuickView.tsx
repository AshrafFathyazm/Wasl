import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Button } from '../../components/Button/Button';
import { IconEmail, IconEye, IconSms } from '../../icons/icons';
import { formatDate, formatPhone, type Lang } from '../../lib/formatters';
import type { CustomerListItem } from '../../lib/api-types.provisional';

import styles from './CustomerQuickView.module.css';

/* ============================================================================
 * The row's quick view — `035` §4.3b, from the frame supplied 2026-09-03.
 * ============================================================================
 * A row click used to navigate straight to `/customers/:id`. It now opens this
 * inside a `SideSheet`, and «فتح الملف الكامل» is what navigates.
 *
 * IT RENDERS THE ROW IT WAS GIVEN, and fetches nothing. That is the whole point
 * of a quick view: the list already holds every field this shows, so opening one
 * costs no request and there is no loading state to design. It is also why the
 * NOTES are absent — see below.
 */

export interface CustomerQuickViewProps {
  customer: CustomerListItem;
  lang: Lang;
  onClose: () => void;
}

export function CustomerQuickView({ customer, lang, onClose }: CustomerQuickViewProps) {
  const { t } = useTranslation('customers');
  const navigate = useNavigate();

  return (
    <div className={styles.wrap}>
      <section className={styles.block}>
        <p className={styles.legend}>{t('profile.contact')}</p>

        {/* ONE FIELD PER ROW, with the glyph at the inline-end — the frame's
            order. An absent value keeps its row and shows the em dash, for the
            reason the list's cells do: a field that disappears makes two
            customers render as two different shapes, and the reader cannot tell
            an absent phone from a screen that failed to draw one. */}
        <div className={styles.field}>
          <span className={styles.fieldValue}>
            {customer.email === null ? (
              <span className={styles.absent}>{t('list.absent')}</span>
            ) : (
              <bdi dir="ltr">{customer.email}</bdi>
            )}
          </span>
          <IconEmail size={16} className={styles.fieldIcon} aria-hidden="true" />
        </div>

        <div className={styles.field}>
          <span className={styles.fieldValue}>
            {customer.phone === null ? (
              <span className={styles.absent}>{t('list.absent')}</span>
            ) : (
              <bdi dir="ltr">{formatPhone(customer.phone)}</bdi>
            )}
          </span>
          <IconSms size={16} className={styles.fieldIcon} aria-hidden="true" />
        </div>
      </section>

      {/* THE NOTES ARE NOT HERE, and the frame draws them.
       *
       * `GET /api/customers` does not return `notes` — the list DTO carries id,
       * fullName, email, phone, companyName and createdAtUtc, and nothing else.
       * Rendering the region empty would say "this customer has no notes" about
       * a customer who may have several; fetching the full profile to fill it
       * would turn a row click into a request and give this sheet a loading
       * state, a failure state and a reason to disagree with the row beside it.
       *
       * So the notes live one click away, behind «فتح الملف الكامل», which is
       * the control the frame already puts at the foot. Recorded rather than
       * quietly dropped — `035` §2's rule: a data region drawn from nothing
       * looks exactly like a working one. */}

      <section className={styles.block}>
        <p className={styles.legend}>{t('quick.record')}</p>

        <div className={styles.meta}>
          <span className={styles.metaLabel}>{t('field.company')}</span>
          <span className={styles.metaValue}>
            {customer.companyName === null ? (
              <span className={styles.absent}>{t('list.absent')}</span>
            ) : (
              <span dir="auto">{customer.companyName}</span>
            )}
          </span>
        </div>

        <div className={styles.meta}>
          <span className={styles.metaLabel}>{t('field.created')}</span>
          <span className={styles.metaValue}>
            {formatDate(customer.createdAtUtc, lang)}
          </span>
        </div>
      </section>

      {/* The frame's footer control. It closes the sheet BEFORE navigating: the
          sheet locks `body` scroll while it is open, and leaving it mounted
          through a route change would leave the next screen unscrollable — the
          cleanup runs on unmount, and unmount is not guaranteed to happen
          first. */}
      {/* A WRAPPER, because `Button` takes no `className` — deliberately, so a
          caller cannot restyle a primitive from outside. The full width is this
          screen's layout decision, so it lives on the element around it. */}
      <div className={styles.open}>
        <Button
          text={t('quick.openProfile')}
          iconStart={<IconEye size={16} />}
          onClick={() => {
            onClose();
            void navigate(`/customers/${customer.id}`);
          }}
        />
      </div>
    </div>
  );
}
