import { useCallback, useEffect, useState } from 'react';

/* ============================================================================
 * useSidebarState — three states, not two
 * ============================================================================
 *
 * Treating the sidebar as a binary is the usual mistake, and it is why nested
 * items become unreachable on a narrow window: there is no room to show them
 * inline and nothing takes over.
 *
 *   expanded   288px   default above 1100px
 *   collapsed   68px   user toggled, OR automatically below 1100px
 *   drawer    overlay  below 780px — the sidebar leaves the flow entirely
 *
 * PERSISTENCE IS PER USER, NOT PER SESSION. Someone who collapses it means it.
 * The value is restored BEFORE FIRST PAINT by the inline script in index.html —
 * doing it here alone would render the sidebar wide and snap it narrow on every
 * load, which everyone sees and nobody files.
 *
 * TODO — 1100 and 780 are literals. tokens.css has no breakpoint token (note 11)
 * and DESIGN-BRIEF rule 3 forbids inventing one, so the debt is visible. Spec Q-8.
 * ============================================================================ */

export type SidebarMode = 'expanded' | 'collapsed' | 'drawer';

const COLLAPSE_BELOW = 1100;
const DRAWER_BELOW = 780;

const STORAGE_KEY = 'wasl.sidebar';

function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'collapsed';
  } catch {
    /* A private window can throw. Expanded is the correct default. */
    return false;
  }
}

function store(collapsed: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? 'collapsed' : 'expanded');
  } catch {
    /* The choice lasts this session and no further. */
  }
}

function readViewport(): 'wide' | 'narrow' | 'compact' {
  if (typeof window === 'undefined') return 'wide';
  if (window.innerWidth < DRAWER_BELOW) return 'compact';
  if (window.innerWidth < COLLAPSE_BELOW) return 'narrow';
  return 'wide';
}

export interface SidebarState {
  mode: SidebarMode;
  /** Drawer only. Ignored in the other two modes. */
  drawerOpen: boolean;
  toggle: () => void;
  closeDrawer: () => void;
}

export function useSidebarState(): SidebarState {
  const [userCollapsed, setUserCollapsed] = useState(readStoredCollapsed);
  const [viewport, setViewport] = useState(readViewport);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const onResize = () => setViewport(readViewport());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /* Leaving the drawer breakpoint must close it, or the overlay survives into a
   * layout that has no way to dismiss it. */
  useEffect(() => {
    if (viewport !== 'compact') setDrawerOpen(false);
  }, [viewport]);

  let mode: SidebarMode = 'expanded';
  if (viewport === 'compact') {
    mode = 'drawer';
  } else if (viewport === 'narrow' || userCollapsed) {
    mode = 'collapsed';
  }

  const toggle = useCallback(() => {
    if (readViewport() === 'compact') {
      setDrawerOpen((open) => !open);
      return;
    }
    setUserCollapsed((collapsed) => {
      const next = !collapsed;
      store(next);
      /* Kept in step with the pre-paint script, which reads the same key. */
      document.documentElement.dataset['sidebar'] = next ? 'collapsed' : 'expanded';
      return next;
    });
  }, []);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return { mode, drawerOpen, toggle, closeDrawer };
}
