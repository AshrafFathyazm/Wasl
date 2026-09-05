import { useEffect, useRef, useState, type ReactNode } from 'react';

import { IconCircleInfo, IconCircleX, IconTriangleAlert } from '../../icons/icons-added';
import { IconResolved } from '../../icons/icons';
import { cx } from '../../lib/cx';
import styles from './Toast.module.css';

/* ============================================================================
 * Toast — ONE message. The stack, the timing table and the de-duplication are
 * `ToastHost`'s; this is the card.
 * ============================================================================
 * `030` / `design/feedback-layer.md` §2 replaces what `006` deferred and `032`
 * extended. Three things changed from the shipped version and each was ruled:
 *
 *   1. THE VISUAL MODEL. It was a tinted fill — `--state-*-bg` with a matching
 *      border. It is now a white card with a 3px stripe on the inline-start
 *      edge. Disagreement #1, ruled to the source: four tinted panels stacked at
 *      a screen corner read as four different surfaces, while four white cards
 *      with coloured edges read as four of the same thing.
 *   2. A FOURTH REAL TONE. `warning`, with its own glyph and its own 6s.
 *   3. `role` FOLLOWS THE TONE. This shipped as `role="status"` for everything,
 *      with a comment arguing that an error on that one screen was a summary
 *      beside fields that already carried their own messages. That was true
 *      there and is false as a product rule: §2 gives error and warning
 *      `alert`, because a request-wide failure has no field to sit beside.
 *
 * `inverse` survives from `032`. It is not one of the four tones — it is an
 * acknowledgement floating over the page (a copy confirmation), it takes no
 * stripe and no glyph, and `feedback-layer.md` leaves it alone.
 * ========================================================================= */

export type ToastTone = 'success' | 'warning' | 'error' | 'info' | 'inverse';

/** §2's timing table, in one place. `null` means it never leaves on its own. */
export const TOAST_MS: Record<ToastTone, number | null> = {
  success: 4000,
  info: 5000,
  warning: 6000,
  /* AN ERROR NEVER AUTO-DISMISSES. It is the only tone that reports something
     the reader has to act on, and a message that removes itself while they are
     reading it is a message they cannot get back — there is no toast history. */
  error: null,
  inverse: 4000,
};

/** §2: any toast carrying an action stays 10s regardless of tone. */
export const TOAST_ACTION_MS = 10_000;

const GLYPH: Record<ToastTone, ((p: { size?: number }) => ReactNode) | null> = {
  success: IconResolved,
  warning: IconTriangleAlert,
  error: IconCircleX,
  info: IconCircleInfo,
  inverse: null,
};

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastProps {
  tone?: ToastTone | undefined;

  /** The message's first line. ALREADY TRANSLATED, and a `ReactNode` so a caller
   *  can isolate an identifier inside it — a ticket number has to be `dir="ltr"`
   *  and cannot be if the whole message is a string. */
  children: ReactNode;

  /** The second line: the detail, in `--text-muted`. Optional. */
  body?: ReactNode | undefined;

  /** One action, rendered as a link under the body. Its presence changes the
   *  timing — see `TOAST_ACTION_MS`. */
  action?: ToastAction | undefined;

  /** §2's de-duplication counter. Rendered from 2 up; 1 and `undefined` show
   *  nothing, because "×1" is noise on the common case. */
  count?: number | undefined;

  /** The dismiss control's accessible name. Already translated; a primitive
   *  holds no strings, and an icon-only control with no name is invisible to
   *  anyone not looking at it. */
  dismissLabel: string;

  onDismiss: () => void;

  /** Milliseconds until it dismisses itself. Omit for a message that stays. */
  autoDismissMs?: number | undefined;
}

/**
 * One message, rendered inline where the caller puts it.
 *
 * `role` is `status` for success, info and the inverse acknowledgement, and
 * `alert` for error and warning (§2). Status is polite and waits for a pause;
 * alert interrupts. A ticket was created — worth announcing, never worth cutting
 * someone off for. A reply that failed to send is worth interrupting for,
 * because the reader is about to walk away believing it went.
 */
export function Toast({
  tone = 'success',
  children,
  body,
  action,
  count,
  dismissLabel,
  onDismiss,
  autoDismissMs,
}: ToastProps) {
  const [paused, setPaused] = useState(false);

  /* THE CALLBACK IN A REF, so that pausing does not restart the countdown.
     `onDismiss` is almost always a fresh closure per render; with it in the
     effect's dependencies, every hover — every parent render — would clear the
     timer and start a new full-length one, and a toast under a moving mouse
     would never leave. */
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  /* THE COUNTDOWN PAUSES ON HOVER AND ON FOCUS (§2), and the two are one
     mechanism rather than two: a reader who has moved the pointer onto the card,
     or tabbed into its action, is reading it. Restarting the full duration on
     leave rather than resuming the remainder is deliberate — the remainder can
     be 200ms, which is a message that vanishes the instant the pointer moves
     away, and that reads as a bug rather than as a timer. */
  useEffect(() => {
    if (autoDismissMs === undefined || paused) return undefined;

    const id = window.setTimeout(() => dismissRef.current(), autoDismissMs);
    /* Cleared on unmount AND when the pause flips, so a re-render cannot leave
       two timers racing to dismiss the same message. */
    return () => window.clearTimeout(id);
  }, [autoDismissMs, paused]);

  const Glyph = GLYPH[tone];
  const interrupts = tone === 'error' || tone === 'warning';

  return (
    <div
      className={cx(styles.toast, styles[tone])}
      role={interrupts ? 'alert' : 'status'}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* THE STRIPE IS NOT AN ELEMENT with a role — it is the tone, drawn. It
          carries no information the glyph and the text do not, so it is a
          decorative span rather than anything the accessibility tree sees. */}
      {tone === 'inverse' ? null : <span className={styles.stripe} aria-hidden="true" />}

      <div className={styles.main}>
        {Glyph === null ? null : (
          <span className={styles.glyph} aria-hidden="true">
            <Glyph size={18} />
          </span>
        )}

        <div className={styles.text}>
          <span className={styles.title}>
            {children}
            {count === undefined || count < 2 ? null : (
              /* «×3» — the same message arrived three times. `dir="ltr"` for the
                 reason every identifier in this product carries it: a latin run
                 inside an Arabic line is reordered by bidi otherwise. */
              <span className={styles.count} dir="ltr">
                {`×${count}`}
              </span>
            )}
          </span>

          {body === undefined ? null : <span className={styles.body}>{body}</span>}

          {action === undefined ? null : (
            <button type="button" className={styles.action} onClick={action.onClick}>
              {action.label}
            </button>
          )}
        </div>

        <button
          type="button"
          className={styles.dismiss}
          onClick={onDismiss}
          aria-label={dismissLabel}
        >
          {'×'}
        </button>
      </div>
    </div>
  );
}
