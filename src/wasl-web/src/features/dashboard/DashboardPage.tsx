import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

import { ApiError } from '../../lib/api';
import type { DashboardRange } from '../../lib/api-types.provisional';
import type { Lang } from '../../lib/formatters';
import { dashboardKeys, getDashboard } from './dashboard.api';
import { minutesSince } from './dashboardFormat';
import { DASHBOARD_RANGES, DashboardView } from './DashboardView';

/* ============================================================================
 * DashboardPage — `/`, US-016
 * ============================================================================
 * THE ROUTE FETCHES; THE VIEW RENDERS. Fetching happens here and never in a
 * child (ADR-011), which is what makes the loading and error states one decision
 * instead of six — and what lets `/_preview/dashboard` show every state without
 * a server.
 *
 * ONE REQUEST FOR THE WHOLE SCREEN (AC-1). The numbers are read against each
 * other, so seven requests would let a reader see a total that no single moment
 * produced.
 *
 * THE ROLE PICKS THE CONTENT AND THE SERVER PICKS THE ROLE. `scope` arrives in
 * the body; nothing here reads a token or a claim.
 * ========================================================================== */

/**
 * The range from the URL, and anything unrecognised degrades to the default.
 *
 * `?range=` LIVES IN THE URL AND NOT IN STATE (ADR-011 §1, FE-020-03): the back
 * button returns to the previous range and a link can be pasted. A stale or
 * hand-edited value becomes `14d` rather than a `400` — the same rule
 * `readFilters` applies on the ticket list, for the same reason: a bad link
 * should degrade to a working screen, not to an error the reader cannot act on.
 * The SERVER still refuses an unaccepted value, because a client is not the
 * place that rule is enforced.
 */
export function readRange(raw: string | null): DashboardRange {
  return DASHBOARD_RANGES.find((range) => range === raw) ?? '14d';
}

export default function DashboardPage() {
  const { i18n } = useTranslation('dashboard');
  const lang: Lang = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en';
  const [params, setParams] = useSearchParams();

  const range = readRange(params.get('range'));

  const query = useQuery({
    queryKey: dashboardKeys.snapshot(range),
    queryFn: ({ signal }) => getDashboard(range, signal),

    /* KEEP THE NUMBERS WHILE THE NEXT RANGE LOADS. Switching 14d → 30d is a
       different query key, so without this the whole screen re-skeletons: six
       cards collapse and come back, which on a fast connection is a flash rather
       than a state. `026` met the same thing on its pager and this is the same
       answer — the previous snapshot stays, dimmed, and the loader beside the
       subtitle is what says work is happening. */
    placeholderData: keepPreviousData,
  });

  function setRange(next: DashboardRange) {
    const updated = new URLSearchParams(params);

    /* The default is not written to the URL. `/` and `/?range=14d` are the same
       screen, and a parameter that restates the default is a parameter that has
       to be kept in step with it. */
    if (next === '14d') {
      updated.delete('range');
    } else {
      updated.set('range', next);
    }

    setParams(updated);
  }

  return (
    <DashboardView
      /* `error` ONLY WHEN THERE IS NOTHING TO SHOW. A failed refetch over a good
         snapshot is not an error state — the numbers on screen are one range old
         and still true, and replacing them with an alert loses information the
         reader already had. */
      state={query.isPending ? 'loading' : query.isError && query.data === undefined ? 'error' : 'loaded'}
      snapshot={query.data}
      range={range}
      onRangeChange={setRange}
      lang={lang}
      updatedMinutes={minutesSince(query.dataUpdatedAt)}
      isBusy={query.isFetching}
      /* Read off the problem, never synthesised: a transport failure has none —
         the request never reached a server, so no server logged it — and an
         invented one sends somebody hunting through logs for a string that was
         never written. */
      traceId={query.error instanceof ApiError ? query.error.problem.traceId : undefined}
      onRetry={() => void query.refetch()}
    />
  );
}
