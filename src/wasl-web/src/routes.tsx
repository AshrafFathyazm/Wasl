import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';

import { RedirectIfSignedIn, RequireAuth } from './features/auth/guards';
import { AppShell } from './shell/AppShell';
import { NAV_PATHS } from './shell/navItems';

/*
 * The route table. Every page element is lazy(), so the production build emits
 * one entry chunk plus one chunk per page and no finer split (ADR-011 §7).
 *
 * PLACEHOLDER ROUTES, AND WHY THEY EXIST.
 * The spec's route table names only `/` and `/_preview`, written before the shell
 * was in scope. A shell whose every nav link 404s is not routing — the active
 * state, the breadcrumb, and the group-stays-open behaviour are all unverifiable.
 * So each nav destination is mounted, and each renders the SAME placeholder. The
 * paths come from NAV_PATHS rather than a second list, so a nav item can never
 * point at a route that does not exist.
 *
 * The feature that owns each screen replaces its element. Nothing else changes.
 */

const HomePage = lazy(() => import('./features/home/HomePage'));
const CreateTicketPage = lazy(() => import('./features/tickets/CreateTicketPage'));

/* A PLACEHOLDER for `010`'s detail screen, and the reason it exists at all: the
 * frozen contract promises `Location: /api/tickets/{id}` resolves. Without this
 * route a `201` would navigate to a 404 and AC-1's round trip would be
 * unprovable. `010` swaps the component; the path does not move. */
const TicketCreatedPage = lazy(() => import('./features/tickets/TicketCreatedPage'));

/*
 * /_preview is a DEVELOPMENT route and removes itself from the production bundle.
 *
 * THE `import()` MUST BE INSIDE THE BRANCH, not at module top level. Vite
 * replaces `import.meta.env.DEV` with a literal `false` in a production build and
 * the dead branch is dropped — but only what is INSIDE it. A top-level
 * `lazy(() => import('./dev/PreviewPage'))` is always reachable, so Rollup emits
 * the chunk and preloads it whatever the branch says. That is exactly what
 * happened on the first attempt: a PreviewPage chunk and its CSS shipped while
 * the comment claimed they did not.
 *
 * It sits OUTSIDE the shell: it is a component harness, not a screen.
 *
 * Verified by listing dist/assets and grepping the bundle, not asserted.
 */
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? (() => {
      const PreviewPage = lazy(() => import('./dev/PreviewPage'));
      const CreateTicketPreview = lazy(() => import('./dev/CreateTicketPreview'));
      return [
        { path: '/_preview', element: <PreviewPage /> },
        /* FE-024-00. A screen preview, not a component harness — it sits beside
         * the primitives page rather than inside it, and it is stripped from the
         * production build by the same branch. */
        { path: '/_preview/create-ticket', element: <CreateTicketPreview /> },
      ];
    })()
  : [];

const LoginPage = lazy(() => import('./features/auth/LoginPage'));

/*
 * TWO GROUPS, AND THE GUARD IS THE BOUNDARY (`025`).
 *
 * `/login` is the only public route in the product. Everything else sits under
 * `RequireAuth`, which is deliberately wrapped OUTSIDE `AppShell` rather than
 * inside it: a signed-out visitor must never see the shell paint — not the
 * sidebar, not their absence of a name in the user block — before the redirect
 * takes effect. Guarding inside the layout renders the frame first and replaces
 * it a moment later, which is AC-25's flash wearing different clothes.
 *
 * The nesting is also what makes a new screen protected BY DEFAULT: a route
 * added to the children below inherits the guard, and forgetting to protect one
 * requires deliberately moving it out. The backend's fallback policy works the
 * same way round, and for the same reason.
 */
export const routes: RouteObject[] = [
  {
    element: <RedirectIfSignedIn />,
    children: [{ path: '/login', element: <LoginPage /> }],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          /* The nav destinations that have no screen yet keep their placeholder,
           * so the active state and the breadcrumb stay verifiable (`023`). */
          ...NAV_PATHS.map((path) => ({ path, element: <HomePage /> })),
          { path: '/tickets/new', element: <CreateTicketPage /> },
          { path: '/tickets/:id', element: <TicketCreatedPage /> },
        ],
      },
    ],
  },
  ...devRoutes,
];
