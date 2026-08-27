import { Outlet } from 'react-router-dom';

import styles from './AppShell.module.css';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { useSidebarState } from './useSidebarState';
import sidebarStyles from './Sidebar.module.css';

/**
 * Wraps every authenticated route. Persistent navigation and identity;
 * everything else renders inside it.
 *
 * IT MAKES NO REQUEST. `git grep -nE "fetch\(|axios|XMLHttpRequest" src/shell`
 * returns nothing — the nav is a literal array, the breadcrumb is derived from
 * the matched route, and the user is a placeholder marked for `004`.
 */
export function AppShell() {
  const { mode, drawerOpen, toggle, closeDrawer } = useSidebarState();

  return (
    <div className={styles.shell}>
      {mode === 'drawer' && drawerOpen ? (
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
        /* Following a link inside the drawer must close it, or the overlay
           covers the page the user just asked for. */
        onNavigate={closeDrawer}
      />

      <div className={styles.main}>
        <Header showMenuButton={mode === 'drawer'} onMenuClick={toggle} />
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
