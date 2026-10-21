import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';

import { IconAdd, IconChevronDown, IconMenu } from '../icons/icons';
import { cx } from '../lib/cx';
import { useBreakpoint } from '../lib/useMediaQuery';
import styles from './Header.module.css';
import { ticketKeys } from '../features/tickets/tickets.api';
import type { TicketResponse } from '../lib/api-types.provisional';
import { breadcrumbFor, ticketIdFromPath } from './navItems';

interface HeaderProps {
  /** Only the drawer breakpoint shows a menu button; above it the sidebar is
   *  always present and a second control for it would be noise. */
  showMenuButton: boolean;
  /** For `aria-expanded` on the button. Meaningful only in drawer mode. */
  drawerOpen: boolean;
  onMenuClick: () => void;
}

export function Header({ showMenuButton, drawerOpen, onMenuClick }: HeaderProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const tabletUp = useBreakpoint('md');

  /* READ FROM THE CACHE, NEVER FETCHED — the shell makes no request. The ticket
     page has put this exact object there by the time it paints. */
  const ticketId = ticketIdFromPath(pathname);
  const ticketNumber =
    ticketId === null
      ? undefined
      : queryClient.getQueryData<TicketResponse>(ticketKeys.detail(ticketId))
          ?.ticketNumber;
  const trail = breadcrumbFor(pathname, ticketNumber);

  return (
    <header className={styles.header}>
      {showMenuButton ? (
        <button
          type="button"
          className={styles.menuButton}
          onClick={onMenuClick}
          aria-label={t('common:nav.openMenu')}
          aria-expanded={drawerOpen}
          aria-haspopup="dialog"
        >
          <IconMenu size={20} aria-hidden="true" />
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
                  {crumb.label ?? t(crumb.labelKey)}
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

      {/* `041` Q-2: below md the sidebar's "New ticket" is inside a drawer, so the one
          create action of the product would be two taps away. It stays on the top
          bar as an icon button — same glyph as the sidebar's, an accessible name, a
          tooltip, and a 44x44 target. Rendered, not hidden: a hidden duplicate would
          be a second "New ticket" in the accessibility tree at every width. */}
      {tabletUp || pathname === '/tickets/new' ? null : (
        <Link
          to="/tickets/new"
          className={styles.newTicket}
          aria-label={t('tickets:new')}
          title={t('tickets:new')}
        >
          <IconAdd size={20} aria-hidden="true" />
        </Link>
      )}
    </header>
  );
}
