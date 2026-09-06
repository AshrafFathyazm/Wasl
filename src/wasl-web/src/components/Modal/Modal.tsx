import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { IconClose } from '../../icons/icons';
import { cx } from '../../lib/cx';
import styles from './Modal.module.css';

/* ============================================================================
 * Modal — `design/feedback-layer.md` §3.
 * ============================================================================
 * IT BLOCKS WORK, THEREFORE IT IS ONLY FOR DECISIONS. §1.5's first tie-break:
 * "must the user decide something before anything else can happen? → modal.
 * Nothing else blocks." If the answer is no, this is the wrong component —
 * §1.4 sends inspection to a side panel and §1.1 sends outcomes to a toast.
 *
 * `006` inventoried it and did not build it. `030` was blocked on Q-1 until the
 * decision matrix arrived, because a modal built without the matrix is a modal
 * that gets used for the four things the matrix forbids.
 *
 * WHAT IT SHARES WITH `SideSheet` AND WHY IT IS NOT THE SAME COMPONENT: both
 * trap focus, close on Escape, and restore focus on close. Everything else
 * differs — the side, the motion, the sizes, whether a scrim is optional (here
 * it never is), and above all whether the page behind stays usable. A shared
 * "overlay" primitive would have to be told which of those it is on every call,
 * which is the same as two components with a flag between them.
 * ========================================================================= */

export type ModalSize = 'sm' | 'md' | 'lg';

export interface ModalProps {
  open: boolean;

  /** Escape, the close button and the scrim all route here. */
  onClose: () => void;

  /** Plain text — it becomes the dialog's accessible name through
   *  `aria-labelledby`, and that has to be readable text rather than a node. */
  title: string;

  children: ReactNode;

  /** The actions. Order is the caller's, and §3 gives two rules — see
   *  `destructive`. Absent on a modal with nothing to confirm. */
  footer?: ReactNode | undefined;

  /** §3: sm 420 confirm · md 560 short form · lg 720 read-only detail.
   *  Default `sm`, because the common modal is a confirmation. */
  size?: ModalSize | undefined;

  /** True when the primary action cannot be taken back.
   *
   *  IT DOES NOT STYLE ANYTHING — the caller styles its own buttons. What it
   *  changes is where focus lands: §3 says the destructive button is NEVER the
   *  default focus target and focus starts on cancel. With this set, the opening
   *  focus goes to the FIRST control in the FOOTER, which §3's destructive order
   *  makes cancel — that order is "cancel first in reading direction, then the
   *  red action", the opposite of an ordinary modal's.
   *
   *  THE FIRST VERSION REACHED FOR THE LAST FOCUSABLE CONTROL IN THE PANEL and
   *  was wrong for exactly that reason: last in a `[cancel, delete]` footer is
   *  DELETE. The test caught it. It would have shipped a confirmation dialog
   *  that opens with the destructive action under the Return key — which is the
   *  precise defect this prop exists to prevent, and which looks identical on
   *  screen to the correct behaviour. */
  destructive?: boolean | undefined;

  /** True while the modal holds input that would be lost.
   *
   *  IT GUARDS BOTH AMBIENT DISMISSALS — `Escape` and the scrim — and it did not
   *  until 2026-09-06. `030` AC-10 says "asks before `Escape` or a scrim click
   *  closes it… one guarded and one not is the likely half-fix", and the half-fix
   *  is what shipped: the source contradicts itself (§3's behaviour line puts the
   *  *except* on all three dismissal paths, §8 rule 6 names only the scrim), so
   *  the narrow reading was taken and recorded as a gap needing a ruling.
   *
   *  **A real consumer settled it.** `039`'s `CloseTicketModal` holds a
   *  500-character close reason and sets this flag — so a reader typed a note,
   *  pressed Escape by reflex, and lost it with no question asked. A guard that
   *  stops a stray click on the scrim and lets the Escape key wipe the same field
   *  is not a partial protection, it is the wrong one: Escape is the more
   *  reflexive of the two.
   *
   *  THE × AND THE FOOTER ARE NOT GUARDED, deliberately. Both are controls the
   *  reader had to aim at, and a modal that cannot be left at all is worse than
   *  one that loses a draft. Escape and a scrim click are the two a reader
   *  triggers without meaning to. */
  unsavedInput?: boolean | undefined;

  /** What to do when a guarded dismissal is attempted — the ask.
   *
   *  Only consulted while `unsavedInput` is true. THE COMPONENT CANNOT ASK: only
   *  the caller knows what is at stake and what the question should say, which is
   *  the same division `CustomersListPage` uses for its side sheet.
   *
   *  Omitting it is safe and is the sensible default: the guarded dismissal
   *  becomes inert rather than destructive, and the reader still leaves through
   *  the × or the footer. It is NOT a silent close. */
  onDismissAttempt?: (() => void) | undefined;
}

/**
 * Everything inside `panel` that Tab can reach, in document order. The same
 * query `SideSheet` uses, and duplicated rather than shared for the reason its
 * own note gives: the roving-tabindex case is subtle enough that a shared helper
 * would need to grow options, and two callers is not yet a library.
 */
function focusableIn(panel: HTMLElement): HTMLElement[] {
  const candidates = panel.querySelectorAll<HTMLElement>(
    [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(','),
  );

  return [...candidates].filter((el) => {
    if (el.closest('[inert]') !== null) return false;
    if (el.closest('[hidden]') !== null) return false;
    if (el.closest('[aria-hidden="true"]') !== null) return false;

    /* NOT `offsetParent`. jsdom performs no layout, so it is always null there —
       `SideSheet` shipped that filter and two focus tests passed for a reason
       unrelated to what they claimed to measure. */
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'sm',
  destructive = false,
  unsavedInput = false,
  onDismissAttempt,
}: ModalProps) {
  const { t } = useTranslation('common');
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  /* THE TWO AMBIENT DISMISSALS GO THROUGH ONE FUNCTION, so `Escape` and the
     scrim cannot drift apart — which is exactly how the half-fix happened the
     first time. One is a keypress and one is a click, they were written in two
     places, and only one of them got the guard. */
  const ambientDismiss = () => {
    if (!unsavedInput) {
      onClose();
      return;
    }
    /* Guarded. The caller asks; with no `onDismissAttempt` this is inert, which
       is the safe default — never a silent close. */
    onDismissAttempt?.();
  };

  /* Escape, on `document` with `capture: true`. The panel is not itself focused
     on open, and a nested control that stops propagation would otherwise swallow
     the key and leave the modal up with no visible cause. */
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (!unsavedInput) {
        onClose();
        return;
      }
      onDismissAttempt?.();
    };

    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose, unsavedInput, onDismissAttempt]);

  /* A modal always blocks, so this is unconditional — unlike `SideSheet`, where
     the lock follows the scrim. */
  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  /* FOCUS IN, AND THE DESTRUCTIVE RULE (§3).
   *
   * On an ordinary modal focus goes to the first focusable thing — the reader is
   * heading into the content. On a DESTRUCTIVE one it goes to the first control
   * in the FOOTER, which §3's ordering makes cancel: a destructive footer runs
   * cancel-first-then-red, the reverse of an ordinary one.
   *
   * ASKING THE FOOTER RATHER THAN COUNTING FROM AN END. The first attempt took
   * the last focusable control in the whole panel, on the reasoning that cancel
   * is at the far end — and in a `[cancel, delete]` footer the far end is
   * DELETE. Position in the panel does not identify a button; being in the
   * footer does.
   *
   * And focus goes back where it came from. Without the restore, closing drops
   * focus onto `<body>` and the reader's next Tab starts from the top of the
   * document rather than from the control they opened this with. */
  useEffect(() => {
    if (!open) return;

    const opener = document.activeElement;
    const panel = panelRef.current;
    if (panel === null) return;

    const footerEl = panel.querySelector<HTMLElement>('[data-modal-footer]');
    const target =
      (destructive && footerEl !== null ? focusableIn(footerEl)[0] : undefined) ??
      focusableIn(panel)[0] ??
      panel;

    target.focus();

    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [open, destructive]);

  /* THE TAB LOOP. `aria-modal="true"` tells a screen reader the rest of the
     document is inert; it does nothing about the Tab key, and a browser will
     move focus to the page behind a dialog that covers it. The wrap is forced
     only at the two ends, so every Tab in between is the browser's own. */
  useEffect(() => {
    if (!open) return;

    const onTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (panel === null) return;

      const focusable = focusableIn(panel);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (first === undefined || last === undefined) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const active = document.activeElement;

      if (!(active instanceof HTMLElement) || !panel.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }

      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      }
    };

    document.addEventListener('keydown', onTab, true);
    return () => document.removeEventListener('keydown', onTab, true);
  }, [open]);

  if (!open) return null;

  return (
    <div className={styles.host}>
      {/* THE SCRIM CLOSES IT — EXCEPT over unsaved input (§3), where a stray
          click outside a form is not consent to throw the form away. The
          asking-first is the caller's, because only the caller knows what to
          ask; what this owns is not closing silently.

          Hidden from the accessibility tree and out of the tab order for the
          reason `SideSheet` records: a keyboard already has Escape and the ×,
          and a second control with the same name sitting OUTSIDE the panel
          fights the focus trap. */}
      <button
        type="button"
        className={styles.scrim}
        aria-hidden="true"
        tabIndex={-1}
        onClick={ambientDismiss}
      />

      <div
        ref={panelRef}
        className={cx(styles.panel, styles[size])}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className={styles.head}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>

          <button
            type="button"
            className={styles.close}
            aria-label={t('dismiss')}
            onClick={onClose}
          >
            <IconClose size={16} />
          </button>
        </header>

        {/* THE ONLY SCROLLER. §3: the body grows to 70vh and then scrolls, with
            the header and the footer fixed — a modal whose whole box scrolls
            takes its own actions off screen. */}
        <div className={styles.body}>{children}</div>

        {footer === undefined ? null : (
          <div data-modal-footer="" className={styles.foot}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
