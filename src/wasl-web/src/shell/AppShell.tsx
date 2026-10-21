import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { ToastProvider } from '../components/Toast/ToastHost';
import styles from './AppShell.module.css';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { useSidebarState } from './useSidebarState';
import sidebarStyles from './Sidebar.module.css';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Wraps every authenticated route. Persistent navigation and identity;
 * everything else renders inside it.
 *
 * IT MAKES NO REQUEST. `git grep -nE "fetch\(|axios|XMLHttpRequest" src/shell`
 * returns nothing — the nav is a literal array, the breadcrumb is derived from
 * the matched route, and the user is a placeholder marked for `004`.
 *
 * THE DRAWER (`041`) is a modal for as long as it is open: Escape and the
 * backdrop close it, a route change closes it, Tab cannot leave it, the page
 * behind is `inert`, and focus returns to whatever opened it. It is a SIBLING of
 * the page tree and never replaces it — so a half-typed reply in the composer is
 * still there when the drawer closes (`041` §8.F).
 */
export function AppShell() {
  const { mode, drawerOpen, toggle, closeDrawer } = useSidebarState();
  const { pathname } = useLocation();

  const asideRef = useRef<HTMLElement | null>(null);
  const mainRef = useRef<HTMLDivElement | null>(null);
  const modal = mode === 'drawer' && drawerOpen;

  /* A route change closes it. `onNavigate` covers a click on a link in the
     drawer; this covers the back button and any programmatic navigation. */
  useEffect(() => {
    closeDrawer();
  }, [pathname, closeDrawer]);

  /* Everything that makes it a modal, in one effect so the open and the close are
     one balanced pair. */
  useEffect(() => {
    const main = mainRef.current;
    if (!modal) return undefined;

    const opener =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    main?.setAttribute('inert', '');

    const aside = asideRef.current;
    aside?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeDrawer();
        return;
      }
      if (event.key !== 'Tab' || !aside) return;

      const items = [...aside.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      main?.removeAttribute('inert');
      opener?.focus();
    };
  }, [modal, closeDrawer]);

  /* THE PROVIDER WRAPS THE SHELL, not `main.tsx`'s tree.
   *
   * Every surface that fires a toast is an authenticated route, and this is the
   * component every one of them renders inside — so the provider spans exactly
   * the tree that needs it and nothing more. Putting it above the router would
   * put it above the login screen too, where §1.2 already rules a failed
   * sign-in to be a FIELD error rather than a toast.
   *
   * It renders the stack after `<Outlet />`, which matters for one reason: a
   * toast is announced by an accessibility tree that reads in document order,
   * and a live region ahead of the page content interrupts differently. */
  return (
    <ToastProvider>
      <div className={styles.shell}>
        {modal ? (
          <button
            type="button"
            className={sidebarStyles.backdrop}
            onClick={closeDrawer}
            aria-hidden="true"
            tabIndex={-1}
          />
        ) : null}

        <Sidebar
          mode={mode}
          drawerOpen={drawerOpen}
          onToggle={toggle}
          asideRef={asideRef}
          /* Following a link inside the drawer must close it, or the overlay
             covers the page the user just asked for. */
          onNavigate={closeDrawer}
        />

        <div className={styles.main} ref={mainRef}>
          <Header
            showMenuButton={mode === 'drawer'}
            drawerOpen={drawerOpen}
            onMenuClick={toggle}
          />
          <main className={styles.content}>
            <Outlet />
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
