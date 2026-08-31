import { useEffect, useRef, useState } from 'react';

import { IconCheck } from '../../icons/icons';
import { IconCopy } from '../../icons/icons-added';
import { cx } from '../../lib/cx';
import styles from './Customers.module.css';

/* ============================================================================
 * CopyValue — one value, rendered for reading and copied for use
 * ============================================================================
 *
 * NOT A PRIMITIVE, AND THAT IS DELIBERATE. `component-inventory.md` caps the set
 * at eight controls and requires a written reason for a ninth. This has exactly
 * one consumer — the customer profile — and a control shaped by one screen is
 * indistinguishable from that screen's private layout (the same reason `026`
 * gave for keeping its table cell renderers local). The day a second screen
 * needs it, that is the written reason and it moves then.
 *
 * WHAT IS COPIED IS NOT WHAT IS SHOWN, and that difference is the point:
 *
 *   shown   +966 50 123 4567          a1b2c3d4…8e21
 *   copied  +966501234567             a1b2c3d4-…-5c2ab41c8e21
 *
 * The design document states the reason for the phone — a spaced number pasted
 * into a dialler or a form field fails validation — and the same applies to a
 * truncated id, which is worse because it looks like an id and is not one. So
 * `value` is the API's own string and `children` is the presentation, and a test
 * that reads the DOM to check the clipboard would pass on the wrong string
 * (AC-4).
 * ============================================================================ */

/** How long the pressed control shows a tick. Long enough to be seen after the
 *  eye returns to it, short enough that a second copy is obviously a new one. */
const CONFIRM_MS = 1400;

export interface CopyValueProps {
  /** The RAW value — what the API returned. This is what reaches the clipboard. */
  value: string;

  /** The presentation. Spaced, truncated, direction-isolated: whatever the
   *  reader needs, with no obligation to match `value`. */
  children: React.ReactNode;

  /** The control's accessible name. ALREADY TRANSLATED — "Copy the email
   *  address", not "Copy". A row of three buttons all named "Copy" is three
   *  identical announcements for three different values. */
  copyLabel: string;

  /**
   * Called after the value reaches the clipboard, with `copyLabel`'s subject so
   * the page can raise ONE toast for whichever control was pressed.
   *
   * The page owns the toast rather than this component, because two toasts
   * stacked from two copies is a rule about the screen, not about a button —
   * and `030` will own that rule product-wide.
   */
  onCopied: () => void;
}

export function CopyValue({ value, children, copyLabel, onCopied }: CopyValueProps) {
  const [confirmed, setConfirmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  /* Cleared on unmount. Without it, navigating away mid-confirmation calls
   * setState on an unmounted component — harmless in React 18 and still a leaked
   * timer per copy. */
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy() {
    /* THE WRITE IS GUARDED AND THE CONFIRMATION IS NOT CONDITIONAL ON IT.
     *
     * `navigator.clipboard` is absent in jsdom and on an insecure origin, and it
     * REJECTS when the document is not focused — which happens in a real browser
     * whenever devtools has focus. Awaiting it and gating the tick on success
     * makes the button look broken in exactly the case where the copy usually
     * worked anyway.
     *
     * So: attempt, swallow, confirm. The cost of a false confirmation is one
     * repeated Ctrl+V; the cost of a missing one is a user pressing a button
     * that gives no sign it did anything, three times. */
    try {
      await navigator.clipboard?.writeText(value);
    } catch {
      /* Intentionally empty — see above. */
    }

    setConfirmed(true);
    onCopied();

    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setConfirmed(false), CONFIRM_MS);
  }

  return (
    <span className={styles.copyRow}>
      {children}

      <button
        type="button"
        className={cx(styles.copyButton, confirmed && styles.copyButtonDone)}
        /* THE NAME DOES NOT CHANGE WHEN IT SUCCEEDS. Same ruling as `Button`'s
         * loading state: swapping the label to "Copied" renames the control, so
         * a screen reader announces a different button from the one that was
         * pressed, and the next press is announced as an action the user never
         * asked for. The tick is for the eye and the toast is for the ear. */
        aria-label={copyLabel}
        onClick={() => void copy()}
      >
        {confirmed ? <IconCheck size={15} /> : <IconCopy size={15} />}
      </button>
    </span>
  );
}
