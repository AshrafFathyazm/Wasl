import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from './AuthContext';

/* ============================================================================
 * guards.tsx — RequireAuth · RedirectIfSignedIn
 * ============================================================================
 *
 * BOTH REDIRECT DURING RENDER, never from an effect (AC-25).
 *
 * `<Navigate>` rendered instead of the children is a redirect that happens
 * before anything paints. The same decision taken in a `useEffect` runs AFTER
 * paint, so the wrong screen is on the glass for a frame: the login form flashes
 * for a signed-in user on every reload, and a protected page flashes its
 * contents for a signed-out one. Everyone sees it and nobody files it, because
 * it looks like the page loading rather than like a bug.
 *
 * `replace` ON BOTH, and that is AC-28's second half. Without it the redirect
 * PUSHES, so the browser's Back button returns to the view the guard just
 * rejected — after signing out, Back restores an authenticated-looking shell
 * rendered from React state that has not been cleared yet.
 * ============================================================================ */

/** The public route the guards send people to, and the one `RedirectIfSignedIn`
 *  guards. One constant, so the two can never point at different paths. */
export const LOGIN_PATH = '/login';

/** Where a signed-in user goes when there is nothing to return to (spec Q-1).
 *  `004/frontend-spec.md` names `/tickets`. */
export const DEFAULT_SIGNED_IN_PATH = '/tickets';

/** The query parameter carrying the interrupted destination. */
export const RETURN_URL_PARAM = 'returnUrl';

/**
 * Read `returnUrl` and reduce it to something safe to navigate to.
 *
 * **An unchecked `returnUrl` is an open redirect.** `?returnUrl=https://evil.example`
 * would send a user who just typed their password straight off the origin, and
 * the link that did it looks like a normal sign-in link from this application.
 *
 * So the value is not trusted as a destination. It is accepted only when it is a
 * path within this application:
 *
 *   - It must start with a single `/`.
 *   - It must NOT start with `//` or `/\`, which are protocol-relative and are
 *     read by browsers as an absolute URL with the scheme inherited. This is the
 *     bypass that gets missed — `//evil.example` passes a naive "starts with /"
 *     check and leaves the origin anyway. It is also the exact class of defect
 *     `023` upgraded `react-router-dom` over (GHSA-wrjc-x8rr-h8h6).
 *
 * Anything else falls back to the default, silently. There is nothing useful to
 * tell the user — they did not type it.
 */
export function safeReturnPath(raw: string | null): string {
  if (raw === null || raw === '') return DEFAULT_SIGNED_IN_PATH;
  if (!raw.startsWith('/')) return DEFAULT_SIGNED_IN_PATH;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return DEFAULT_SIGNED_IN_PATH;
  return raw;
}

/**
 * Wraps every protected route. AC-24.
 *
 * The interrupted destination is captured as `pathname + search + hash`, so a
 * filtered list or a deep link survives the round trip — a `returnUrl` that
 * keeps only the path silently drops the query, and the user lands on an
 * unfiltered list wondering what happened to their filters.
 */
export function RequireAuth() {
  const { isSignedIn } = useAuth();
  const location = useLocation();

  if (!isSignedIn) {
    const target = `${location.pathname}${location.search}${location.hash}`;
    const query = new URLSearchParams({ [RETURN_URL_PARAM]: target });
    return <Navigate to={`${LOGIN_PATH}?${query.toString()}`} replace />;
  }

  return <Outlet />;
}

/**
 * Wraps `/login`. AC-25.
 *
 * Sends a signed-in visitor to wherever they were going, honouring a `returnUrl`
 * that is already on the URL — someone who follows a stale sign-in link while
 * already signed in should still land on the page the link was for.
 */
export function RedirectIfSignedIn() {
  const { isSignedIn } = useAuth();
  const location = useLocation();

  if (isSignedIn) {
    const params = new URLSearchParams(location.search);
    return <Navigate to={safeReturnPath(params.get(RETURN_URL_PARAM))} replace />;
  }

  return <Outlet />;
}
