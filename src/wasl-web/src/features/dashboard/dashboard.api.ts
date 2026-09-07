import { apiFetch } from '../../lib/api';
import type { DashboardRange, DashboardSnapshot } from '../../lib/api-types.provisional';

/* ============================================================================
 * dashboard.api.ts — the one fetcher this screen has
 * ============================================================================
 * Thin, like every other feature's: build the path, call the wrapper, return the
 * body. No error handling and no rendering — `lib/api.ts` throws a typed
 * `ApiError` and the route decides what to draw.
 *
 * ONE REQUEST FOR THE WHOLE SCREEN, and that is the contract's decision rather
 * than a convenience here (AC-1). The numbers are read against each other — "63
 * open" beside "12 unassigned" beside a fortnight of bars — so seven requests
 * would let a reader see a total that no single moment produced.
 * ============================================================================ */

/** The key factory. One entry per range, so switching back to `7d` is instant
 *  and the two do not evict each other. */
export const dashboardKeys = {
  all: ['dashboard'] as const,
  snapshot: (range: DashboardRange) => ['dashboard', range] as const,
};

/**
 * `GET /api/dashboard?range=`.
 *
 * The range is always sent, including the default: the response echoes what was
 * applied, and a request that omits it would make the echo the only place the
 * value exists — so a mismatch between what the tabs show and what the chart
 * covers would be unprovable from the URL.
 */
export function getDashboard(
  range: DashboardRange,
  signal?: AbortSignal,
): Promise<DashboardSnapshot> {
  return apiFetch<DashboardSnapshot>(
    `/api/dashboard?range=${encodeURIComponent(range)}`,
    signal ? { signal } : {},
  );
}
