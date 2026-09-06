import { useQueries } from '@tanstack/react-query';

import { countTickets, ticketKeys } from './tickets.api';

/* ============================================================================
 * openTicketCounts — `039`, Q-1
 * ============================================================================
 * How many tickets each support user still has open, so the assignee menu is a
 * decision rather than a list of names.
 *
 * THE FIELD DOES NOT EXIST. `SupportUser` is `(id, fullName, role)` on `011`'s
 * frozen contract, and adding `openTicketCount` to it is the RIGHT answer and
 * is the other lane's call. Ruled 2026-09-06: derive it here, and record what
 * the derivation costs.
 *
 * WHAT IT COSTS, stated rather than discovered later:
 *
 *   ONE REQUEST PER SUPPORT USER. `011` froze the list as a bare array and
 *   recorded that paging it is a breaking change, so the fan-out is bounded by
 *   a set the server will not grow silently. Three seeded users today.
 *
 *   A DIFFERENT NUMBER FROM THE ONE A BACKEND FIELD WOULD GIVE, and the
 *   difference is invisible. This is the count THIS user is allowed to see, at
 *   the moment the menu opened. With no per-user list scoping in the product the
 *   two agree; the day scoping arrives they diverge and nothing goes red. That
 *   is the whole argument for the contract change, kept where the derivation is
 *   rather than in a document nobody opens.
 *
 * `enabled` is the other half of the cost control: nothing is counted until a
 * menu is actually open, so the list screen pays nothing for a menu nobody
 * pressed.
 * ========================================================================= */

/** "Open" for this count: everything a person still has to act on.
 *
 * NOT `TAB_STATUSES` — that list is the filter bar's four tabs and leaves out
 * `Open`, which is very much open. Reusing it here would undercount every agent
 * by however many tickets sit in the one status whose name says it. The two
 * lists look interchangeable and are not, which is why this one is declared
 * beside its use with the reason attached. */
export const OPEN_STATUSES = ['New', 'Open', 'InProgress', 'PendingCustomer'] as const;

/**
 * One `totalCount` per user id. A user whose request has not resolved is
 * ABSENT from the map rather than present as `0` — `AssigneePanel` renders the
 * two differently on purpose, because a zero is a fact and "not counted yet" is
 * not that fact.
 */
export function useOpenTicketCounts(
  userIds: readonly string[],
  enabled: boolean,
): Record<string, number | undefined> {
  const results = useQueries({
    queries: userIds.map((id) => ({
      /* The key space `026` built for the chip counts. A count and a page of
         rows are different questions about the same filters, and this reuses the
         question rather than inventing a third key. */
      queryKey: ticketKeys.count({ assignee: id, status: OPEN_STATUSES }),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        countTickets({ assignee: id, status: OPEN_STATUSES }, signal),
      enabled,
      /* A minute. The number moves when somebody assigns or closes, and both of
         those invalidate `['tickets']` from the mutation anyway — this is the
         floor for a menu opened twice in a row, not the freshness policy. */
      staleTime: 60_000,
    })),
  });

  const counts: Record<string, number | undefined> = {};
  userIds.forEach((id, index) => {
    const result = results[index];
    if (result && result.isSuccess) counts[id] = result.data;
  });
  return counts;
}
