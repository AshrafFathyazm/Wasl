import { useCallback, useRef, useState, type ReactNode } from 'react';

import { cx } from '../lib/cx';
import styles from './Anchored.module.css';

/* ============================================================================
 * Anchored — the collapsed sidebar's tooltip and flyout
 * ============================================================================
 * Shell-internal on purpose. See Anchored.module.css for why these are not in
 * src/components/ and what "not general purpose" means here.
 * ============================================================================ */

/**
 * 140ms. Without a close delay the pointer cannot travel from the icon to the
 * panel without the panel vanishing under it, which makes a flyout unusable with
 * a mouse. It is the single most commonly missing detail in a collapsed sidebar.
 *
 * TODO — no motion token exists (tokens.css note 11). Spec Q-8.
 */
const CLOSE_DELAY_MS = 140;

interface AnchoredProps {
  /** The trigger. Rendered as-is; this component adds no styling to it. */
  children: ReactNode;

  /** The panel's contents. */
  panel: ReactNode;

  /** A tooltip is a label; a flyout is a navigable list. The difference is what
   *  each is announced as, and which one may cover the other. */
  kind: 'tooltip' | 'flyout';

  /** When false the panel never opens — the expanded sidebar shows its labels
   *  and its children inline, so neither is needed. */
  enabled: boolean;

  /** Set on the panel so a trigger can point `aria-describedby` at it. */
  id: string;
}

export function Anchored({ children, panel, kind, enabled, id }: AnchoredProps) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback(() => {
    window.clearTimeout(timer.current);
    setOpen(true);
  }, []);

  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, []);

  const hideNow = useCallback(() => {
    window.clearTimeout(timer.current);
    setOpen(false);
  }, []);

  if (!enabled) return <>{children}</>;

  return (
    <div
      className={styles.anchor}
      onMouseEnter={show}
      onMouseLeave={hide}
      /* FOCUS, not only hover. onFocus/onBlur bubble in React, so focusing the
       * trigger or anything inside the panel keeps it open — which is what makes
       * the collapsed sidebar navigable by keyboard rather than merely narrow. */
      onFocus={show}
      onBlur={hide}
      onKeyDown={(event) => {
        if (event.key === 'Escape') hideNow();
      }}
    >
      {children}
      <div
        id={id}
        data-z={kind}
        role={kind === 'tooltip' ? 'tooltip' : undefined}
        className={cx(
          styles.panel,
          kind === 'tooltip' && styles.tooltipPanel,
          open && styles.open,
        )}
      >
        {panel}
      </div>
    </div>
  );
}

export const anchoredStyles = styles;
