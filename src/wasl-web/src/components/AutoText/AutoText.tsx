import type { ElementType, ReactNode } from 'react';

import { cx } from '../../lib/cx';
import styles from './AutoText.module.css';

/* ============================================================================
 * AutoText — `040` item 23
 * ============================================================================
 * User-authored text (a customer's name, an assignee, a subject) may be Arabic on
 * an English screen or the reverse. `dir="auto"` lets the browser pick the
 * paragraph direction from the first strong character, and `text-align: start`
 * makes the alignment follow THAT direction instead of the page's — without the
 * second half, an Arabic name in an English table is right-to-left but still hugs
 * the left edge, and two rows in one column start at different sides.
 *
 * One component rather than two attributes repeated on every cell, because the
 * pair is the rule and a call site that has only one of them looks correct.
 *
 * Use it for free text a person typed. NOT for an email address or a ticket
 * number: those are LTR by nature and `dir="auto"` would let a leading Arabic
 * letter in a display name drag one of them backwards.
 * ========================================================================== */

interface AutoTextProps {
  children: ReactNode;
  as?: ElementType;
  className?: string | undefined;
  title?: string | undefined;
}

export function AutoText({ children, as: Tag = 'span', className, title }: AutoTextProps) {
  return (
    <Tag dir="auto" className={cx(styles.autoText, className)} title={title}>
      {children}
    </Tag>
  );
}
