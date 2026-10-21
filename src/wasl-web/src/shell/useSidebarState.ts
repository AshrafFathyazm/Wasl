import { useCallback, useEffect, useState } from 'react';

import { useBreakpoint } from '../lib/useMediaQuery';

/* ============================================================================
 * useSidebarState — three states, and two of them are the wide screen's
 * ============================================================================
 *
 *   expanded   288px   at lg (1024) and up — the default
 *   collapsed   68px   at lg and up, ONLY because the user toggled it
 *   drawer    overlay  below lg — the sidebar leaves the flow entirely
 *
 * `041` REMOVED THE THIRD WIDTH. There used to be an automatic 68px rail between
 * 780 and 1100: it saved nothing a phone-sized drawer does not save better, and a
 * 68px rail beside a 700px content area is a layout nobody chose. A tablet in
 * portrait is now a phone with more room — it gets the drawer — and the reader's
 * own collapse choice still persists, applying at lg and up (product owner,
 * 2026-10-15, Q-1).
 *
 * PERSISTENCE IS PER USER, NOT PER SESSION. Someone who collapses it means it.
 * The value is restored BEFORE FIRST PAINT by the inline script in index.html —
 * doing it here alone would render the sidebar wide and snap it narrow on every
 * load, which everyone sees and nobody files.
 *
 * THE BREAKPOINT IS `BREAKPOINTS.lg` AND NOT A LITERAL HERE. This file carried
 * `1100` and `780` with a TODO saying so; the TODO is discharged.
 * ============================================================================ */

export type SidebarMode = 'expanded' | 'collapsed' | 'drawer';

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

export interface SidebarState {
  mode: SidebarMode;
  /** Drawer only. Ignored in the other two modes. */
  drawerOpen: boolean;
  toggle: () => void;
  closeDrawer: () => void;
}

export function useSidebarState(): SidebarState {
  const wide = useBreakpoint('lg');
  const [userCollapsed, setUserCollapsed] = useState(readStoredCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);

  /* Leaving the drawer breakpoint must close it, or the overlay survives into a
   * layout that has no way to dismiss it. */
  useEffect(() => {
    if (wide) setDrawerOpen(false);
  }, [wide]);

  let mode: SidebarMode = 'drawer';
  if (wide) mode = userCollapsed ? 'collapsed' : 'expanded';

  const toggle = useCallback(() => {
    if (!wide) {
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
  }, [wide]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return { mode, drawerOpen, toggle, closeDrawer };
}
