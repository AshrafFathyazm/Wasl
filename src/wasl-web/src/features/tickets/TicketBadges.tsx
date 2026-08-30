import { useTranslation } from 'react-i18next';

import {
  Badge,
  type BadgeAppearance,
  type BadgeTone,
} from '../../components/Badge/Badge';
import { cx } from '../../lib/cx';
import type { TicketPriority, TicketStatus } from '../../lib/api-types.provisional';
import styles from './TicketBadges.module.css';

/**
 * The domain leak `Badge` refused, taken HERE — which is where
 * component-inventory.md says it belongs. `Badge` knows five tones and two
 * appearances; this file is the only place that knows a ticket status is one of
 * them.
 *
 * KEYED ON THE WIRE VALUE, never on a label. Keying on displayed text renders
 * every badge neutral for an Arabic user and nothing fails: no exception, no
 * test failure, no visible error in English. `Badge`'s own comment says this and
 * it is repeated because this is the file where it would happen.
 */

/**
 * BR-1, from docs/sdd/design/screens/03-tickets-list.md — the source of record.
 *
 * `New` and `Open` do NOT share a colour. A supplied design painted both the
 * same blue; it was adopted twice during the preview and overruled on
 * 2026-08-29. Two distinct states in the state machine must not read as one
 * appearance, in the column an agent scans first.
 *
 * Every treatment is FILLED. The blueprint had `PendingCustomer` and `Closed` as
 * outlines; rendered against real rows those two were the loudest thing on the
 * table — a heavy ring around a waiting ticket drew more attention than a
 * `Critical` priority two columns away, which inverts the ranking this map
 * exists to express. The blueprint changed with the code, in one commit.
 *
 * RED IS NEVER A STATUS. It is `Critical` priority and escalation only, so red
 * on a ticket always means "needs attention now" and never "this ended badly".
 * A closed thing is neutral (DESIGN-BRIEF rule 15).
 */
const STATUS_TONE: Record<TicketStatus, [BadgeTone, BadgeAppearance]> = {
  New: ['neutral', 'filled'],
  Open: ['info', 'filled'],
  InProgress: ['warning', 'filled'],
  PendingCustomer: ['neutral', 'filled'],
  Resolved: ['success', 'filled'],
  Closed: ['neutral', 'filled'],
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const { t } = useTranslation('tickets');
  const [tone, appearance] = STATUS_TONE[status];
  return <Badge tone={tone} appearance={appearance} label={t(`status.${status}`)} />;
}

/**
 * PLAIN COLOURED TEXT, NOT A BADGE — and that is a decision, not an omission.
 *
 * Two badges side by side in one row read as a single control with two halves.
 * Only the two priorities that demand an action carry colour; `Low` and `Normal`
 * are muted, because a table where every cell shouts says nothing.
 *
 * This is the one place red is allowed on a ticket row. `Critical` is a
 * SEVERITY, and BR-1 bans red for STATUS only.
 */
/* CSS MODULE CLASSES, not strings. This map held 'priority-high' and
 * 'priority-critical' as plain global names that no stylesheet defined, so
 * High and Critical rendered in the default text colour — the map was inert
 * and the screen looked like the design had simply not been applied. */
const PRIORITY_CLASS: Record<TicketPriority, string | undefined> = {
  Low: undefined,
  Normal: undefined,
  High: styles.priorityHigh,
  Critical: styles.priorityCritical,
};

export function TicketPriorityText({ priority }: { priority: TicketPriority }) {
  const { t } = useTranslation('tickets');
  return (
    <span className={cx(styles.priority, PRIORITY_CLASS[priority])}>
      {t(`priority.${priority}`)}
    </span>
  );
}

/** Exported for the test, and for `015` when it builds the status filter — a
 *  second copy of this map is the defect the whole file is arranged to prevent. */
export const STATUS_TONE_MAP = STATUS_TONE;
