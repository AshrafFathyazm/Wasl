import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';

import { Button } from '../components/Button/Button';
import { IconAdd, IconChevronDown, IconResolved } from '../icons/icons';
import { IconSettings, IconSignOut } from '../icons/icons-added';
import { Mark } from '../brand/Mark';
import { WORDMARK_AR, WORDMARK_LATIN } from '../brand/wordmark';
import { cx } from '../lib/cx';
import { useAuth } from '../features/auth/AuthContext';
import { Anchored, anchoredStyles } from './Anchored';
import { initialsOf } from './currentUser';
import { NAV_ITEMS, type NavEntry, type NavLeaf } from './navItems';
import styles from './Sidebar.module.css';
import type { SidebarMode } from './useSidebarState';

interface SidebarProps {
  mode: SidebarMode;
  drawerOpen: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}

export function Sidebar({ mode, drawerOpen, onToggle, onNavigate }: SidebarProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const collapsed = mode === 'collapsed';

  return (
    <aside
      className={cx(
        styles.sidebar,
        collapsed && styles.collapsed,
        mode === 'drawer' && styles.drawer,
        mode === 'drawer' && drawerOpen && styles.drawerOpen,
      )}
      style={{ position: mode === 'drawer' ? undefined : 'relative' }}
    >
      {/* Tile + name (design/brand.md, Lockups). THE WORDMARK IS BILINGUAL AND
          FIXED: both scripts render in both locales, because a logo is a brand
          asset and not copy — neither line replaces the other when the language
          changes. Collapsed, it becomes the tile alone. */}
      <div className={styles.lockup} role="img" aria-label={t('common:productName')}>
        <span className={styles.mark} aria-hidden="true">
          <Mark size={20} />
        </span>
        <span className={styles.wordmark} aria-hidden="true">
          {/* lang="ar" so it takes --font-ar even while the interface is English.
              Without it the Arabic renders through whatever fallback the Latin
              stack happens to reach, which is the Q-15 defect in miniature. */}
          <span className={styles.wordmarkPrimary} lang="ar">
            {WORDMARK_AR}
          </span>
          <span className={styles.wordmarkSecondary}>{WORDMARK_LATIN}</span>
        </span>
      </div>

      {/* On the sidebar's OUTER edge, half-overlapping the border. The chevron
          rotates 180°; under RTL it mirrors, and so does the direction of
          collapse — both from the logical properties, with no second rule. */}
      <button
        type="button"
        className={styles.toggle}
        onClick={onToggle}
        aria-label={t(collapsed ? 'common:nav.expand' : 'common:nav.collapse')}
        aria-expanded={!collapsed}
      >
        <span className={styles.toggleIcon}>
          <IconChevronDown size={14} />
        </span>
      </button>

      {/* The one create action for the whole section, at the TOP of the sidebar
          rather than in the page header. Collapsed it becomes icon-only, and the
          component then REQUIRES an aria-label — the visible text is gone. */}
      <div className={styles.cta}>
        <Button
          text={t('tickets:new')}
          withText={!collapsed}
          iconStart={<IconAdd size={16} />}
          aria-label={t('tickets:new')}
        />
      </div>

      <nav className={styles.nav}>
        <span className={styles.caption}>{t('common:nav.main')}</span>
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.key}
            item={item}
            collapsed={collapsed}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <UserBlock collapsed={collapsed} />
    </aside>
  );
}

/* -------------------------------------------------------------------------- */

interface NavItemProps {
  item: NavEntry;
  collapsed: boolean;
  pathname: string;
  onNavigate: () => void;
}

function NavItem({ item, collapsed, pathname, onNavigate }: NavItemProps) {
  const { t } = useTranslation();
  const Icon = item.icon;
  const childPaths = item.children?.map((c) => c.to) ?? [];
  const containsActive = childPaths.includes(pathname) || item.to === pathname;

  /* A group stays expanded while one of its children is active. */
  const [open, setOpen] = useState(containsActive);
  useEffect(() => {
    if (containsActive) setOpen(true);
  }, [containsActive]);

  const label = t(item.labelKey);
  const panelId = `nav-panel-${item.key}`;

  /* THIS IS WHERE MOST COLLAPSED SIDEBARS QUIETLY BREAK. There is no room to
   * show the children inline, and if nothing takes over they simply become
   * unreachable. A group gets a flyout carrying the parent's name as a heading;
   * a leaf gets a tooltip. Both open on focus as well as hover. */
  const panel = item.children ? (
    <>
      <span className={anchoredStyles.flyoutHeading}>{label}</span>
      <span className={anchoredStyles.flyoutList}>
        {item.children.map((child) => (
          <ChildLink key={child.key} child={child} onNavigate={onNavigate} inFlyout />
        ))}
      </span>
    </>
  ) : (
    label
  );

  const trigger = item.children ? (
    <button
      type="button"
      /* THE PARENT DOES NOT GET THE ACTIVE TREATMENT WHILE A CHILD HAS IT.
       * 02-app-shell.md: the active child is "bold label plus a solid navy bar
       * on the inline-start edge, indented under its parent — the parent stays
       * EXPANDED". Expanded, not active. Marking both puts two bars in one
       * column and makes the current page ambiguous.
       *
       * Collapsed is the exception, and it is not an inconsistency: the children
       * are not rendered at all there, so the group icon is the only thing that
       * can say where the user is. */
      className={cx(styles.item, collapsed && containsActive && styles.active)}
      onClick={() => setOpen((value) => !value)}
      aria-expanded={collapsed ? undefined : open}
      aria-label={collapsed ? label : undefined}
      aria-describedby={collapsed ? panelId : undefined}
    >
      <span className={styles.itemIcon} aria-hidden="true">
        <Icon size={18} />
      </span>
      <span className={styles.itemLabel}>{label}</span>
      <span className={cx(styles.itemChevron, open && styles.itemChevronOpen)}>
        <IconChevronDown size={14} />
      </span>
    </button>
  ) : (
    <NavLink
      to={item.to}
      end
      onClick={onNavigate}
      className={({ isActive }) => cx(styles.item, isActive && styles.active)}
      aria-label={collapsed ? label : undefined}
      aria-describedby={collapsed ? panelId : undefined}
    >
      <span className={styles.itemIcon} aria-hidden="true">
        <Icon size={18} />
      </span>
      <span className={styles.itemLabel}>{label}</span>
    </NavLink>
  );

  return (
    <>
      <Anchored
        id={panelId}
        kind={item.children ? 'flyout' : 'tooltip'}
        enabled={collapsed}
        panel={panel}
      >
        {trigger}
      </Anchored>

      {!collapsed && item.children && open ? (
        <div className={styles.children}>
          {item.children.map((child) => (
            <ChildLink key={child.key} child={child} onNavigate={onNavigate} />
          ))}
        </div>
      ) : null}
    </>
  );
}

/**
 * The flyout is a DIFFERENT SURFACE from the sidebar, so the active child is
 * marked differently on it: a filled row rather than the 3px inline-start bar.
 * A bar inside a floating panel reads as a stray rule; the panel is small enough
 * that a filled row is unambiguous.
 */
function ChildLink({
  child,
  onNavigate,
  inFlyout = false,
}: {
  child: NavLeaf;
  onNavigate: () => void;
  inFlyout?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <NavLink
      to={child.to}
      end
      onClick={onNavigate}
      className={({ isActive }) =>
        cx(
          styles.child,
          inFlyout && styles.childInFlyout,
          isActive && styles.active,
          isActive && inFlyout && styles.activeInFlyout,
        )
      }
    >
      {t(child.labelKey)}
    </NavLink>
  );
}

/* -------------------------------------------------------------------------- */

function UserBlock({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  /* ABOVE the `user === null` early return. Declared below it, this is a
   * conditional hook call — the component returns before it on one path and
   * after it on another, so the hook order changes between renders. */
  const navigate = useNavigate();
  const anchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (!anchor.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  /* `AppShell` only ever renders inside `RequireAuth`, so `user` is non-null in
   * practice. Returning null rather than asserting: an assertion would crash the
   * shell during the one frame between a sign-out clearing the context and the
   * redirect committing. */
  if (user === null) return null;

  const roleKey = user.role === 'Manager' ? 'common:role.manager' : 'common:role.agent';

  /* AC-28. `signOut` clears BOTH storages and drops the context.
   *
   * IT DOES NOT NAVIGATE, and that is deliberate. `RequireAuth` wraps this
   * shell and redirects the moment `isSignedIn` goes false, so an explicit
   * `navigate` here is a SECOND mechanism racing the first — which is exactly
   * what it was, and the race was visible: the guard won, and the URL came out
   * as `/login?returnUrl=%2Ftickets` rather than the `/login` this line asked
   * for. One mechanism, and it is the guard.
   *
   * The popover is closed first so it is not left open behind the redirect. */
  const onSignOut = () => {
    setOpen(false);
    signOut();
  };

  return (
    <div className={styles.user}>
      <div className={cx(styles.popoverAnchor)} ref={anchor}>
        {open ? (
          <div className={styles.popover} role="menu">
            <div className={styles.popoverHeader}>
              {/* BIDI ISOLATION on every piece of user content.
                  A person's name and their email are user content — an Arabic name
                  inside an English interface is normal, and vice versa. <bdi>
                  keeps the CONTAINER on the interface's direction, so the block
                  hugs the panel's inline-start like everything beside it, while
                  the TEXT still runs in its own direction so the punctuation
                  lands at the right end (ADR-007 §8). dir="auto" on the span
                  itself did the second half and broke the first. */}
              <span className={styles.popoverName}>
                <bdi>{user.fullName}</bdi>
              </span>
              <span className={styles.popoverEmail} title={user.email}>
                <bdi>{user.email}</bdi>
              </span>
            </div>

            <div className={styles.divider} />

            <div className={styles.popoverRow} role="menuitem" aria-current="true">
              {t(roleKey)}
              <span className={styles.roleCheck} aria-hidden="true">
                <IconResolved size={16} />
              </span>
            </div>

            <div className={styles.divider} />

            {/* Both glyphs are ours — the inherited set has neither a gear nor
                an exit. Drawn to the set's own rules; see icons-added.tsx. */}
            {/* FE-014-03 — this row existed and did nothing. It is the only
                route to /settings/localization: the settings area has no nav
                entry of its own, deliberately, because one screen behind a
                sidebar item is a section that does not exist yet.

                The popover closes first, so it is not left open behind the
                navigation — the same reason sign-out closes it. */}
            <button
              type="button"
              className={styles.popoverRow}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void navigate('/settings/localization');
              }}
            >
              <span className={styles.rowIcon} aria-hidden="true">
                <IconSettings size={16} />
              </span>
              {t('common:nav.settings')}
            </button>

            {/* The only red item in the navigation. */}
            <button
              type="button"
              className={cx(styles.popoverRow, styles.signOut)}
              role="menuitem"
              onClick={onSignOut}
            >
              <span className={styles.rowIcon} aria-hidden="true">
                <IconSignOut size={16} />
              </span>
              {t('auth:signOut')}
            </button>
          </div>
        ) : null}

        <Anchored
          id="user-tooltip"
          kind="tooltip"
          enabled={collapsed}
          panel={user.fullName}
        >
          <button
            type="button"
            className={styles.userButton}
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label={collapsed ? user.fullName : undefined}
          >
            <span className={styles.avatar} aria-hidden="true">
              {initialsOf(user.fullName)}
            </span>
            <span className={styles.identity}>
              <span className={styles.identityName}>
                <bdi>{user.fullName}</bdi>
              </span>
              <span className={styles.identityEmail} title={user.email}>
                <bdi>{user.email}</bdi>
              </span>
            </span>
            <span className={styles.userChevron} aria-hidden="true">
              <IconChevronDown size={14} />
            </span>
          </button>
        </Anchored>
      </div>
    </div>
  );
}
