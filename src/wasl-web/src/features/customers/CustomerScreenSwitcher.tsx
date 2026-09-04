import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';

import styles from './CustomerScreenSwitcher.module.css';

/* ============================================================================
 * The pill above the breadcrumb — `035` Q-1, answered 2026-09-03.
 * ============================================================================
 * *"فيه فوق سويتشر كدا لما بتضغط علي زرار تعديل بيتحول السويتشر فوق لتعديل
 * العميل وزار حفظ التغيرات"*.
 *
 * MY WORKING ASSUMPTION WAS WRONG, and it is worth recording why rather than
 * just correcting it: `027`'s frames carried a similar element above the page
 * frame, it was the design canvas's own artboard switcher, and it was not built.
 * I read this one the same way and wrote it into the spec as "not product
 * chrome". It is product chrome. That is what the question was for.
 *
 * TWO SEGMENTS, BOTH WITH A REAL TARGET. The frames show a third label —
 * «إضافة عميل» — beside «تفاصيل العميل» on the detail screen. It is deliberately
 * NOT here: from `/customers/new` the other segment would read «تفاصيل العميل»
 * and have no customer to point at, and the create sheet on the list has no
 * route at all. A segment that leads nowhere is the thing `035` refuses on every
 * other surface. Raised as Q-5 rather than guessed.
 */

export interface CustomerScreenSwitcherProps {
  /** The customer both segments are about. */
  id: string;
}

export function CustomerScreenSwitcher({ id }: CustomerScreenSwitcherProps) {
  const { t } = useTranslation('customers');

  return (
    /* A NAV OF LINKS, not a tablist. Each segment is a route, so the browser's
       own affordances have to work — back, forward, middle-click, "copy link".
       `role="tab"` would announce a panel that does not exist and swallow all
       of that. */
    <nav className={styles.switcher} aria-label={t('switcher.label')}>
      <NavLink
        end
        to={`/customers/${id}`}
        className={({ isActive }) => (isActive ? `${styles.seg} ${styles.segOn}` : styles.seg)}
      >
        {t('switcher.details')}
      </NavLink>

      <NavLink
        end
        to={`/customers/${id}/edit`}
        className={({ isActive }) => (isActive ? `${styles.seg} ${styles.segOn}` : styles.seg)}
      >
        {t('switcher.edit')}
      </NavLink>
    </nav>
  );
}
