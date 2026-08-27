import { useEffect, type ReactNode } from 'react';

import { cx } from '../../lib/cx';
import styles from './Toast.module.css';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastProps {
  tone?: ToastTone | undefined;

  /** The message. ALREADY TRANSLATED, and a `ReactNode` so a caller can isolate
   *  an identifier inside it — a ticket number has to be `dir="ltr"` and cannot
   *  be if the whole message is a string. */
  children: ReactNode;

  /** The dismiss control's accessible name. Already translated; a primitive
   *  holds no strings, and an icon-only control with no name is invisible to
   *  anyone not looking at it. */
  dismissLabel: string;

  onDismiss: () => void;

  /** Milliseconds until it dismisses itself. Omit for a message that stays.
   *  TODO — no motion or duration token exists (tokens.css note 11). Spec Q-8. */
  autoDismissMs?: number | undefined;
}

/**
 * One message. Rendered inline where the caller puts it, not portalled.
 *
 * `role="status"` and not `role="alert"`: status is polite and waits for a
 * pause, alert interrupts. A ticket was created successfully — that is worth
 * announcing and never worth cutting someone off for. An error tone still uses
 * `status`, because on this screen the errors that matter are attached to their
 * fields and this is the summary.
 */
export function Toast({
  tone = 'success',
  children,
  dismissLabel,
  onDismiss,
  autoDismissMs,
}: ToastProps) {
  useEffect(() => {
    if (autoDismissMs === undefined) return undefined;
    const id = window.setTimeout(onDismiss, autoDismissMs);
    /* Cleared on unmount AND when the callback identity changes, so a re-render
     * cannot leave two timers racing to dismiss the same message. */
    return () => window.clearTimeout(id);
  }, [autoDismissMs, onDismiss]);

  return (
    <div className={cx(styles.toast, styles[tone])} role="status">
      <span className={styles.body}>{children}</span>
      <button
        type="button"
        className={styles.dismiss}
        onClick={onDismiss}
        aria-label={dismissLabel}
      >
        {'×'}
      </button>
    </div>
  );
}
