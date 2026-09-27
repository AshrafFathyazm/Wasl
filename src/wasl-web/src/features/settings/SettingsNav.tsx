import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { cx } from '../../lib/cx';
import styles from './SettingsNav.module.css';

/**
 * The settings sub-nav. `022`, FE-022-08.
 *
 * **It exists now because there are two screens.** `Sidebar.tsx` records the
 * reason there was none: *"the settings area has no nav entry of its own,
 * deliberately, because one screen behind a sidebar item is a section that does
 * not exist yet."* That reasoning held for exactly as long as `/settings` had
 * one screen. The user popover still routes to `/settings/localization`, which
 * stays the entry point for every role — an Agent who lands there sees one item.
 *
 * **Branding is hidden for an Agent, not disabled** (spec Q-G). A disabled item
 * advertises a capability the reader will never have and invites them to ask
 * why; an absent one says nothing. Reaching `/settings/branding` directly still
 * renders the forbidden state — the nav is a convenience, never the guard.
 */
export function SettingsNav() {
  const { t } = useTranslation('settings');
  const { user } = useAuth();

  const isManager = user?.role === 'Manager';

  return (
    <nav className={styles.nav} aria-label={t('title')}>
      <NavLink
        to="/settings/localization"
        className={({ isActive }) => cx(styles.item, isActive && styles.active)}
      >
        {t('nav.localization')}
      </NavLink>

      {isManager ? (
        <NavLink
          to="/settings/branding"
          className={({ isActive }) => cx(styles.item, isActive && styles.active)}
        >
          {t('nav.branding')}
        </NavLink>
      ) : null}
    </nav>
  );
}
