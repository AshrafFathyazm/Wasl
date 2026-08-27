import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';

import { IconChevronDown, IconMore } from '../icons/icons';
import { cx } from '../lib/cx';
import styles from './Header.module.css';
import { breadcrumbFor } from './navItems';

interface HeaderProps {
  /** Only the drawer breakpoint shows a menu button; above it the sidebar is
   *  always present and a second control for it would be noise. */
  showMenuButton: boolean;
  onMenuClick: () => void;
}

export function Header({ showMenuButton, onMenuClick }: HeaderProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const trail = breadcrumbFor(pathname);

  return (
    <header className={styles.header}>
      {showMenuButton ? (
        <button
          type="button"
          className={styles.menuButton}
          onClick={onMenuClick}
          aria-label={t('common:nav.expand')}
        >
          <IconMore size={18} />
        </button>
      ) : null}

      {/* Derived from the matched route, never fetched. */}
      <nav className={styles.breadcrumb} aria-label={t('common:nav.main')}>
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          return (
            <span key={crumb.key} className={styles.breadcrumb}>
              {index > 0 ? (
                <span className={styles.separator} aria-hidden="true">
                  <IconChevronDown size={14} />
                </span>
              ) : null}
              {isLast ? (
                <span className={cx(styles.current)} aria-current="page">
                  {t(crumb.labelKey)}
                </span>
              ) : (
                <Link to={crumb.to} className={styles.crumb}>
                  {t(crumb.labelKey)}
                </Link>
              )}
            </span>
          );
        })}
      </nav>
    </header>
  );
}
