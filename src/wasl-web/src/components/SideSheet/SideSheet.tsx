import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { IconClose } from '../../icons/icons';
import { cx } from '../../lib/cx';

import styles from './SideSheet.module.css';

/* ============================================================================
 * The side sheet. `035` §4.3, and `030`'s drawer contradiction closed by frame.
 * ============================================================================
 * Two consumers on the customer directory, from the frames supplied 2026-09-03:
 * a row click opens a QUICK VIEW of that customer, and «عميل جديد» opens the
 * CREATE form. One shell, two contents — the chrome (the panel, the scrim, the
 * header, the footer slot, the escape and focus behaviour) is identical in both
 * frames, and the only difference is what fills the body.
 *
 * WHY IT EXISTS AT ALL, given `030` deferred a drawer: `030` recorded that the
 * design authority contradicts itself — `10-shared-patterns.md` specifies a navy
 * `--surface-inverse` header at h56 while the newer spec specifies a WHITE one,
 * and the enter duration is 250ms in one and 220ms in the other. The frames
 * settle it: a white header with a title and a subtitle, an × at the inline-end,
 * a footer holding the actions. A frame from the product owner outranks two
 * documents that disagree with each other.
 *
 * IT IS NOT PROMOTED TO THE INVENTORY YET. `033` §7.1's rule: a promotion needs
 * a second consumer and a written-up case, and both consumers here are on one
 * screen. When a third arrives — the ticket detail is the likely one — the case
 * gets written and this moves.
 * ========================================================================= */

export interface SideSheetProps {
  open: boolean;

  /** Escape, the scrim, and the × all route here. One handler, so a caller
   *  cannot make the three disagree about what closing means. */
  onClose: () => void;

  /** The header's leading badge — an avatar for the quick view, a `+` for the
   *  create form. The frames draw both as a 44px circle. */
  badge: ReactNode;

  title: ReactNode;
  subtitle?: ReactNode | undefined;

  /** The actions row at the foot. Absent on a sheet with nothing to submit. */
  footer?: ReactNode | undefined;

  children: ReactNode;

  /** Accessible name for the panel when `title` is not a plain string — the
   *  quick view's title is a name in a `<bdi>`, and `aria-label` takes text. */
  label: string;
}

export function SideSheet({
  open,
  onClose,
  badge,
  title,
  subtitle,
  footer,
  children,
  label,
}: SideSheetProps) {
  const { t } = useTranslation('common');
  const panelRef = useRef<HTMLDivElement>(null);

  /* ESCAPE CLOSES IT, on `document` rather than on the panel.
   *
   * The panel is not focused on open — see below — so a `keydown` bound to it
   * would never fire until the reader clicked inside. `capture: true` for the
   * reason the table flyout gives: a nested control that stops propagation
   * would otherwise swallow the key and leave the sheet open with no visible
   * cause. */
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  /* THE BODY DOES NOT SCROLL BEHIND IT. Without this the wheel scrolls the list
   * under the scrim, so the row the sheet is describing slides away — the same
   * class of defect the table flyout has, and there the answer was to close on
   * scroll. A sheet cannot do that: it is the reader's current task. */
  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  /* FOCUS MOVES INTO THE PANEL, and to the first focusable thing rather than to
   * the panel itself: the create form's first field is where the reader is going,
   * and announcing the panel and then making them tab to it is one step nobody
   * needs. A sheet with nothing focusable falls back to the panel, which is why
   * it carries `tabIndex={-1}`. */
  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    if (panel === null) return;

    const first = panel.querySelector<HTMLElement>(
      'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), a[href]',
    );
    (first ?? panel).focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className={styles.host}>
      {/* THE SCRIM IS A BUTTON, not a div with an onClick. A div swallows the
          click for a mouse and offers nothing to a keyboard, and this is the
          only way out for someone who cannot see the ×. `aria-label` names what
          it does rather than what it is. */}
      <button
        type="button"
        className={styles.scrim}
        aria-label={t('dismiss')}
        onClick={onClose}
      />

      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
      >
        <header className={styles.head}>
          <span className={styles.badge} aria-hidden="true">
            {badge}
          </span>

          <div className={styles.heading}>
            <p className={styles.title}>{title}</p>
            {subtitle === undefined ? null : (
              <p className={styles.subtitle}>{subtitle}</p>
            )}
          </div>

          {/* THE × IS AT THE INLINE-END of the header, which in the frames is
              the far side from the badge. `margin-inline-start: auto` rather
              than an order swap, so the DOM order stays badge → title → close
              and a screen reader hears the name before the way out. */}
          <button
            type="button"
            className={styles.close}
            aria-label={t('dismiss')}
            onClick={onClose}
          >
            <IconClose size={18} />
          </button>
        </header>

        <div className={cx(styles.body, footer === undefined && styles.bodyNoFooter)}>
          {children}
        </div>

        {footer === undefined ? null : <div className={styles.foot}>{footer}</div>}
      </div>
    </div>
  );
}
