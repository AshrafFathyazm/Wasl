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

/**
 * Everything inside `panel` that Tab can reach, in document order.
 *
 * `[tabindex]:not([tabindex="-1"])` is included because a roving-tabindex widget
 * — the date picker's calendar grid — puts its own `tabindex="0"` on one cell
 * and `-1` on the rest, and a query that only knew about form controls would
 * treat that whole grid as unreachable and wrap Tab straight past it.
 *
 * THE VISIBILITY FILTER DOES NOT TOUCH LAYOUT, and the first version did.
 *
 * It read `el.offsetParent !== null`, which is the usual way to ask "is this
 * actually on screen". **jsdom performs no layout, so `offsetParent` is always
 * `null`** — the filter rejected every candidate, this returned an empty list,
 * and the trap fell into its "nothing to cycle between" branch, which pins focus
 * to the panel. The two Tab-wrap tests went GREEN on that: focus really did stay
 * inside the panel, for a reason that had nothing to do with wrapping.
 *
 * A test that passes for the wrong reason is worse than one that fails, so the
 * check is now something jsdom and a browser both answer the same way: the
 * attributes and the two computed properties that hide an element without
 * removing it.
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

    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

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

  /** The rung on `--panel-w-*`. Default `'md'` — 480, the profile and detail
   *  width. THERE IS NO FREE LENGTH: this shipped at 600px measured off one
   *  frame, and 420 before that measured off another. See
   *  `design/feedback-layer.md` §4. */
  size?: 'sm' | 'md' | 'lg' | undefined;

  /** Whether the sheet BLOCKS. Default `false`, and the default is the common
   *  case — `feedback-layer.md` §1.4 puts the profile, the ticket detail and the
   *  filter panel without one, and only the add/edit form with one.
   *
   *  It is not a finish. `true` turns on three coupled behaviours below — the
   *  body scroll lock, the Tab trap, and `aria-modal` — because all three are
   *  claims that the document behind is unreachable, and without a scrim it is
   *  reachable on purpose. */
  scrim?: boolean | undefined;
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
  size = 'md',
  scrim = false,
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

  /* THE BODY DOES NOT SCROLL BEHIND IT — but only when there is a scrim.
   *
   * Without this the wheel scrolls the list under the scrim, so the row the
   * sheet is describing slides away — the same class of defect the table flyout
   * has, and there the answer was to close on scroll. A sheet cannot do that: it
   * is the reader's current task.
   *
   * WITH NO SCRIM THE LOCK IS WRONG, not merely unnecessary. A panel that
   * completes the context is meant to be read against the list, and a reader
   * comparing the open customer to the rows above them has to be able to move
   * those rows. Locking the body there takes away the exact thing the no-scrim
   * variant exists to give. */
  useEffect(() => {
    if (!open || !scrim) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open, scrim]);

  /* FOCUS MOVES INTO THE PANEL, and to the first focusable thing rather than to
   * the panel itself: the create form's first field is where the reader is going,
   * and announcing the panel and then making them tab to it is one step nobody
   * needs. A sheet with nothing focusable falls back to the panel, which is why
   * it carries `tabIndex={-1}`.
   *
   * AND IT GOES BACK WHERE IT CAME FROM. Without the restore, closing the sheet
   * drops focus onto `<body>` — the reader's next Tab starts from the top of the
   * document, which on this shell is the skip link, and the row or button they
   * opened the sheet from is however many tab stops away. The opener is captured
   * BEFORE the move, and restored only if it is still in the document: the
   * quick view's «فتح الملف الكامل» navigates, so by the time this cleanup runs
   * the row it came from may not exist. */
  useEffect(() => {
    if (!open) return;

    const opener = document.activeElement;
    const panel = panelRef.current;
    if (panel === null) return;

    /* THE BODY FIRST, then anywhere in the panel. In DOM order the header's ×
       comes before the content, so `focusableIn(panel)[0]` is the CLOSE button —
       measured, and the opposite of what this comment says the sheet is for.
       Opening a form and landing on its dismiss control is a sheet that offers
       to undo itself before it offers to be filled in. */
    const body = panel.querySelector<HTMLElement>('[data-sheet-body]');
    const target =
      (body === null ? undefined : focusableIn(body)[0]) ??
      focusableIn(panel)[0] ??
      panel;

    target.focus();

    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [open]);

  /* THE TAB LOOP. `aria-modal="true"` tells a screen reader the rest of the
   * document is inert; it does NOT stop the Tab key, and a browser will happily
   * move focus to the page behind a sheet that covers it. Then the reader is
   * typing into a form they cannot see, behind a scrim, with no way back that
   * they can find.
   *
   * The wrap is only forced at the two ends, so every Tab in between is the
   * browser's own — which is what keeps radio groups, a `contenteditable` and
   * the date picker's roving tabindex behaving normally inside the panel.
   *
   * IT ONLY APPLIES WITH A SCRIM. The paragraph above describes a reader who
   * cannot see where focus went; without a scrim they can — the list is right
   * there, unobscured and deliberately still interactive — so trapping Tab would
   * make the panel a cage around a page the design says is reachable. A keyboard
   * user tabbing out of an open profile into the row beneath it is the
   * no-scrim variant working, not focus escaping. */
  useEffect(() => {
    if (!open || !scrim) return;

    const onTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (panel === null) return;

      const focusable = focusableIn(panel);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      /* Nothing to cycle between: hold focus on the panel rather than letting
         Tab walk out of it. */
      if (first === undefined || last === undefined) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const active = document.activeElement;

      /* Focus is OUTSIDE the panel — it escaped, or the sheet opened while the
         page had focus elsewhere. Pull it back to the end Tab was heading for
         rather than to the top every time. */
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
  }, [open, scrim]);

  if (!open) return null;

  return (
    <div className={cx(styles.host, scrim && styles.hostBlocking)}>
      {/* THE SCRIM IS A MOUSE AFFORDANCE, and now it says so.
          It began as a labelled button, on the reasoning that a div "swallows
          the click for a mouse and offers nothing to a keyboard". That was
          right about the div and wrong about the remedy: it put a SECOND
          control with the same accessible name as the × into the tab order,
          and it sits OUTSIDE the panel — so the focus trap either has to make
          an exception for it or traps focus away from the only thing it labels.

          A keyboard already has two ways out, and neither is this: Escape, and
          the × which carries the same name. So the scrim is hidden from the
          accessibility tree and taken out of the tab order, and the duplicate
          goes with it. It stays a `<button>` rather than a `<div>` so the
          click target is a real control for the mouse. */}
      {!scrim ? null : (
        <button
          type="button"
          className={styles.scrim}
          aria-hidden="true"
          tabIndex={-1}
          onClick={onClose}
        />
      )}

      <div
        ref={panelRef}
        className={cx(styles.panel, styles[size])}
        role="dialog"
        /* ONLY WHEN IT BLOCKS. `aria-modal="true"` tells a screen reader that
           everything outside this node is inert — which is a statement about the
           document, not a style. With no scrim the list behind is genuinely
           reachable and genuinely interactive, so the attribute would be a lie
           told to exactly the readers who cannot check it for themselves. */
        aria-modal={scrim ? true : undefined}
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

        <div
          data-sheet-body=""
          className={cx(styles.body, footer === undefined && styles.bodyNoFooter)}
        >
          {children}
        </div>

        {footer === undefined ? null : <div className={styles.foot}>{footer}</div>}
      </div>
    </div>
  );
}
