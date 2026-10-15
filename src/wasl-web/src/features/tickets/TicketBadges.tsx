import { useTranslation } from 'react-i18next';

import {
  Badge,
  type BadgeAppearance,
  type BadgeTone,
} from '../../components/Badge/Badge';
import type { TicketPriority, TicketStatus } from '../../lib/api-types.provisional';

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

/* `040` item 2: the list renders priority as a badge beside Status, same size,
 * at the product owner's request — which reverses the "plain text, not a badge"
 * ruling; the plain-text component and its stylesheet are deleted, not kept (`040`). No dot, so the two badges in one row differ by more than a
 * word; Low/Normal are outline so only High and Critical shout. */
/** Exported for the test. */
export const PRIORITY_TONE_MAP: Record<TicketPriority, [BadgeTone, BadgeAppearance]> = {
  Low: ['neutral', 'outline'],
  Normal: ['neutral', 'outline'],
  High: ['warning', 'filled'],
  Critical: ['danger', 'filled'],
};

export function TicketPriorityBadge({ priority }: { priority: TicketPriority }) {
  const { t } = useTranslation('tickets');
  const [tone, appearance] = PRIORITY_TONE_MAP[priority];
  return (
    <Badge tone={tone} appearance={appearance} label={t(`priority.${priority}`)} dot={false} />
  );
}

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const { t } = useTranslation('tickets');
  const [tone, appearance] = STATUS_TONE[status];
  return <Badge tone={tone} appearance={appearance} label={t(`status.${status}`)} />;
}

/** Exported for the test, and for `015` when it builds the status filter — a
 *  second copy of this map is the defect the whole file is arranged to prevent. */
export const STATUS_TONE_MAP = STATUS_TONE;
