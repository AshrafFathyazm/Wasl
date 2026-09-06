import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { IconHistory, IconTriangleAlert } from '../../icons/icons';
import type { TicketListItem, TicketStatus } from '../../lib/api-types.provisional';
import { formatNumber, type Lang } from '../../lib/formatters';
import styles from './CreateTicket.module.css';
import { TicketStatusBadge } from './TicketBadges';

/* ============================================================================
 * DuplicateWarning — `038` §3.5, the feature's load-bearing addition
 * ============================================================================
 * The rest of this redesign moves things the agent already had. This is the one
 * part that prevents a defect the support team currently finds by hand: a fourth
 * ticket opened on top of three about the same problem, with nothing on the
 * screen having said so.
 *
 * ADVISORY, NEVER A BLOCK (AC-17). It does not disable the submit and it does
 * not gate anything. Two tickets from one customer are often genuinely two
 * problems, and a screen that refuses the second is worse than one that never
 * warned — it would be a client inventing a business rule the server does not
 * have.
 *
 * ---------------------------------------------------------------------------
 * THE COUNT IS `totalCount`, NOT `items.length`
 * ---------------------------------------------------------------------------
 * The query asks for five rows. A customer with nine open tickets must say nine
 * and list five; counting the array says five, which is a WRONG FACT that looks
 * exactly like a right one. This is also the mock-up's own bug from the other
 * direction — its `{{ cust.open }}` resolved to empty and the banner shipped
 * reading «لدى هذا العميل ⟨ ⟩ تذاكر مفتوحة», found by running it (spec M-2).
 * ============================================================================ */

/** The four statuses that are not `Resolved` and not `Closed` (R-4).
 *
 *  WRITTEN OUT, not derived as "all minus two". `TICKET_STATUSES` is a contract
 *  list and a seventh member added there must not silently join this filter —
 *  a new status is a product decision about whether it counts as open, and a
 *  subtraction would answer it by default. */
export const OPEN_STATUSES: readonly TicketStatus[] = [
  'New',
  'Open',
  'InProgress',
  'PendingCustomer',
];

/** How many rows the disclosure lists. The count above it may be larger. */
export const OPEN_PAGE_SIZE = 5;

/** The other two — R-4 amended 2026-09-06. See `PriorTickets`. */
export const PRIOR_STATUSES: readonly TicketStatus[] = ['Resolved', 'Closed'];

/** Fewer than the open list, deliberately. This is context, not a warning. */
export const PRIOR_PAGE_SIZE = 3;

/** Whole days between then and now, floored, never negative.
 *
 *  `Math.floor` on the difference rather than a calendar subtraction: this is an
 *  age ("2 days ago"), not a date difference, so 47 hours is one day. A clock
 *  skew that puts `createdAtUtc` in the future clamps to 0 rather than rendering
 *  "-1 days ago". */
function daysSince(iso: string, now: number): number {
  const created = Date.parse(iso);
  if (Number.isNaN(created)) return 0;
  return Math.max(0, Math.floor((now - created) / 86_400_000));
}

interface DuplicateWarningProps {
  /** `totalCount` from the list envelope. See the header. */
  count: number;
  /** At most `OPEN_PAGE_SIZE` rows. */
  tickets: readonly TicketListItem[];
  customerId: string;
  lang: Lang;
}

export function DuplicateWarning({
  count,
  tickets,
  customerId,
  lang,
}: DuplicateWarningProps) {
  const { t } = useTranslation();
  const listId = useId();
  const [shown, setShown] = useState(false);

  /* NOT RENDERED AT ZERO, and the caller is not trusted to check. An empty amber
     panel is a warning about nothing, and AC-13 asserts the absence. */
  if (count === 0) return null;

  /* ONE `Date.now()` for every row. Two rows created in the same second must not
     be able to render different ages because the loop crossed a midnight
     boundary — the same reason the server threads one `IRequestTimestamp`
     through a request instead of calling `DateTime.UtcNow` per handler. */
  const now = Date.now();

  return (
    <div className={styles.duplicate} role="status">
      <div className={styles.duplicateHead}>
        <IconTriangleAlert size={16} aria-hidden="true" />
        <span className={styles.duplicateText}>
          {t('tickets:new.openTickets', { count, formatted: formatNumber(count, lang) })}
        </span>
        <button
          type="button"
          className={styles.duplicateToggle}
          aria-expanded={shown}
          aria-controls={listId}
          onClick={() => setShown((open) => !open)}
        >
          {shown ? t('tickets:new.openTicketsHide') : t('tickets:new.openTicketsShow')}
        </button>
      </div>

      {shown ? (
        <ul id={listId} className={styles.duplicateList}>
          {tickets.map((ticket) => {
            const days = daysSince(ticket.createdAtUtc, now);
            return (
              <li key={ticket.id}>
                <Link className={styles.duplicateRow} to={`/tickets/${ticket.id}`}>
                  {/* Latin digits in every locale (BR-8.13), so it is isolated
                      rather than left to inherit the paragraph direction. */}
                  <span className={styles.duplicateNumber}>
                    <bdi>{ticket.ticketNumber}</bdi>
                  </span>
                  <span className={styles.duplicateSubject}>
                    <bdi>{ticket.subject}</bdi>
                  </span>
                  <span className={styles.duplicateAge}>
                    {days === 0
                      ? t('tickets:new.ageToday')
                      : t('tickets:new.age', {
                          count: days,
                          formatted: formatNumber(days, lang),
                        })}
                  </span>
                </Link>
              </li>
            );
          })}

          {/* Only when the count exceeds what is listed. A "view all" under a
              complete list is a link to the same information. */}
          {count > tickets.length ? (
            <li>
              <Link
                className={styles.duplicateAll}
                to={`/tickets?customerId=${customerId}`}
              >
                {t('tickets:new.openTicketsAll')}
              </Link>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

/* ============================================================================
 * PriorTickets — the quiet half, added 2026-09-06
 * ============================================================================
 * WHY IT EXISTS: `Closed` is terminal (BR-1.5, ADR-004), so a customer whose
 * problem was closed yesterday and who calls back today gets a NEW ticket. The
 * banner above would say nothing, because R-4 scoped it to the four open
 * statuses — and that is exactly the case the banner was built to catch. The
 * agent opens a second ticket with no idea the first one exists.
 *
 * Ruled 2026-09-06 rather than reopening the state machine: `Resolved →
 * InProgress` is already the supported way back (BR-1.6), and a closed ticket
 * that can reopen makes `ClosedAtUtc` and every duration derived from it
 * ambiguous. What was missing was not a transition — it was VISIBILITY.
 *
 * ---------------------------------------------------------------------------
 * IT DOES NOT SAY "CLOSED IN THE LAST 14 DAYS", AND THAT WAS THE FIRST DRAFT
 * ---------------------------------------------------------------------------
 * The API cannot answer that question. `GET /api/tickets` filters on
 * `createdFrom`/`createdTo` and there is **no `closedFrom`**; `closedAtUtc` is
 * on the ticket DETAIL and not on a list row (`010` contract). Approximating it
 * with a creation window is wrong in both directions — a ticket opened six
 * months ago and closed yesterday is missed, and one opened ten days ago and
 * closed nine days ago is included — so the label would be a fact the product
 * does not have, which is the failure `027` names about drawing data regions
 * from nothing.
 *
 * So this makes the weaker claim it CAN support: these are the customer's
 * previous tickets, newest first. Weaker and true beats precise and invented.
 *
 * ---------------------------------------------------------------------------
 * NEUTRAL, NOT AMBER
 * ---------------------------------------------------------------------------
 * A separate element rather than a third region inside the warning. An open
 * ticket is a duplicate RISK; a closed one is CONTEXT, and painting context in
 * warning colours is how a palette stops meaning anything. It is also why the
 * status badge is rendered here and not above: `Resolved` and `Closed` are
 * different answers to "should I even open this one", and above, every row is
 * open by construction.
 * ============================================================================ */

interface PriorTicketsProps {
  /** `totalCount` from the envelope — the same rule as the banner's count. */
  count: number;
  tickets: readonly TicketListItem[];
  customerId: string;
  lang: Lang;
}

export function PriorTickets({ count, tickets, customerId, lang }: PriorTicketsProps) {
  const { t } = useTranslation();
  const listId = useId();
  const [shown, setShown] = useState(false);

  if (count === 0) return null;

  const now = Date.now();

  return (
    <div className={styles.prior}>
      <div className={styles.priorHead}>
        <IconHistory size={15} aria-hidden="true" />
        <span className={styles.duplicateText}>
          {t('tickets:new.priorTickets', { count, formatted: formatNumber(count, lang) })}
        </span>
        <button
          type="button"
          className={styles.priorToggle}
          aria-expanded={shown}
          aria-controls={listId}
          onClick={() => setShown((open) => !open)}
        >
          {shown ? t('tickets:new.openTicketsHide') : t('tickets:new.openTicketsShow')}
        </button>
      </div>

      {shown ? (
        <ul id={listId} className={styles.duplicateList}>
          {tickets.map((ticket) => {
            const days = daysSince(ticket.createdAtUtc, now);
            return (
              <li key={ticket.id}>
                <Link className={styles.duplicateRow} to={`/tickets/${ticket.id}`}>
                  <span className={styles.priorNumber}>
                    <bdi>{ticket.ticketNumber}</bdi>
                  </span>
                  <span className={styles.duplicateSubject}>
                    <bdi>{ticket.subject}</bdi>
                  </span>
                  {/* THE BADGE IS THE POINT OF THIS ROW. `Resolved` invites a
                      reopen — `Resolved → InProgress` is permitted; `Closed` does
                      not, and the agent needs to know which before they open the
                      link. */}
                  <TicketStatusBadge status={ticket.status} />
                  <span className={styles.duplicateAge}>
                    {days === 0
                      ? t('tickets:new.ageToday')
                      : t('tickets:new.age', {
                          count: days,
                          formatted: formatNumber(days, lang),
                        })}
                  </span>
                </Link>
              </li>
            );
          })}

          {count > tickets.length ? (
            <li>
              <Link className={styles.priorAll} to={`/tickets?customerId=${customerId}`}>
                {t('tickets:new.openTicketsAll')}
              </Link>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
