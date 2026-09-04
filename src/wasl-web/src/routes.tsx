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
const TicketListPage = lazy(() => import('./features/tickets/TicketListPage'));
const LocalizationPage = lazy(() => import('./features/settings/LocalizationPage'));
const CustomersListPage = lazy(() => import('./features/customers/CustomersListPage'));
const CreateCustomerPage = lazy(() => import('./features/customers/CreateCustomerPage'));
const CustomerProfilePage = lazy(() => import('./features/customers/CustomerProfilePage'));

/* `027`. THE REAL DETAIL SCREEN, replacing the placeholder that stood here.
 *
 * The placeholder existed because the frozen contract promises
 * `Location: /api/tickets/{id}` resolves — without a route a `201` would navigate
 * to a 404 and `024` AC-1's round trip would be unprovable. It said "`010` swaps
 * the component; the path does not move", and that is what happened: `027` swaps
 * it, and the path did not move.
 *
 * `TicketCreatedPage` is kept in the tree and is no longer routed. It is the
 * post-create confirmation, and whether the create flow still wants a distinct
 * screen or should land straight on the detail is `024`'s decision rather than
 * this one's — deleting it here would take that decision by removing the option. */
const TicketDetailPage = lazy(() => import('./features/tickets/TicketDetailPage'));

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
      const TicketListPreview = lazy(() => import('./dev/TicketListPreview'));
      const TablePreview = lazy(() => import('./dev/TablePreview'));
      const LocalizationPreview = lazy(() => import('./dev/LocalizationPreview'));
      const CreateCustomerPreview = lazy(() => import('./dev/CreateCustomerPreview'));
      const LoadersPreview = lazy(() => import('./dev/LoadersPreview'));
      const CustomerProfilePreview = lazy(() => import('./dev/CustomerProfilePreview'));
      return [
        { path: '/_preview', element: <PreviewPage /> },
        /* FE-024-00. A screen preview, not a component harness — it sits beside
         * the primitives page rather than inside it, and it is stripped from the
         * production build by the same branch. */
        { path: '/_preview/create-ticket', element: <CreateTicketPreview /> },
        /* FE-026-00. Same shape, and it gates every other 026 task: nothing is
         * wired until the nine-column question is answered in Arabic. */
        { path: '/_preview/tickets', element: <TicketListPreview /> },
        /* FE-026-01. The primitive in isolation, holding CUSTOMERS - AC-T-11.
         * A component used by exactly one screen and shaped by that screen is
         * indistinguishable from that screen private layout. */
        { path: '/_preview/table', element: <TablePreview /> },
        /* FE-014-00. The Phase 3b gate: /settings/localization is previewed and
         * reviewed before anything is wired to PUT /api/me/language. */
        { path: '/_preview/localization', element: <LocalizationPreview /> },
        /* FE-007-00. The Phase 3b gate for /customers/new — 007 backend is
         * delivered and this is previewed before anything is wired to it. */
        { path: '/_preview/create-customer', element: <CreateCustomerPreview /> },
        /* FE-027-00. The Phase 3b gate for `/tickets/:id`. It gates every other
         * 027 task: nothing is wired until the layout is approved in Arabic, at
         * 100 timeline entries and a 200-character subject. */
        /* FE-029-00. The Phase 3b gate for the loader system, and it gates every
         * rewired consumer: nothing moves onto a new shape until the ten are
         * reviewed in Arabic, in both directions, with reduced motion on. */
        { path: '/_preview/loaders', element: <LoadersPreview /> },
        /* FE-032-00. The Phase 3b gate for `/customers/:id`, and it gates every
         * other `032` task. Eight variants including the two a wired screen can
         * only reach by breaking something — a `404` and a failed request, which
         * are different states for the reason the preview page states. */
        { path: '/_preview/customer-profile', element: <CustomerProfilePreview /> },
      ];
    })()
  : [];

/** Paths that now have a real screen. Listed once so the placeholder spread and
 *  the real routes cannot disagree about which is which. */
const OWNED_PATHS = new Set([
  '/tickets',
  '/tickets/mine',
  '/tickets/unassigned',
  '/customers',
]);

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
           * so the active state and the breadcrumb stay verifiable (`023`).
           *
           * A path with a REAL screen is filtered out here rather than shadowed.
           * The first attempt declared `/tickets` after this spread and relied on
           * react-router preferring the later of two identical paths. IT DOES
           * NOT — `matchRoutes` returns the first, so `/tickets` rendered the
           * placeholder while every TicketListPage test still passed, because
           * those mount the page directly and never go through the router.
           *
           * NAV_PATHS is not edited: the nav item has to keep pointing at
           * `/tickets`, and deleting the path there would delete the link. */
          ...NAV_PATHS.filter((path) => !OWNED_PATHS.has(path)).map((path) => ({
            path,
            element: <HomePage />,
          })),

          { path: '/tickets', element: <TicketListPage /> },

          /* THE SAME SCREEN, SCOPED BY THE PATH — `023`'s placeholder until
           * now. The `queue` prop is the only difference between the three, and
           * `TicketListPage`'s header note says why it is a route rather than a
           * filter.
           *
           * Both are static segments, so `matchRoutes` ranks them above
           * `/tickets/:id` whatever the order — `mine` is not read as a ticket
           * id. Declared before it anyway, because relying on that ranking
           * silently is how `/tickets` came to render a placeholder for a whole
           * release. */
          { path: '/tickets/mine', element: <TicketListPage queue="mine" /> },
          {
            path: '/tickets/unassigned',
            element: <TicketListPage queue="unassigned" />,
          },
          { path: '/settings/localization', element: <LocalizationPage /> },
          { path: '/tickets/new', element: <CreateTicketPage /> },
          { path: '/tickets/:id', element: <TicketDetailPage /> },

          /* `032`. `/customers` ITSELF IS NOT HERE and keeps `023`'s
           * placeholder: the list screen is a later feature, and the placeholder
           * is what makes the breadcrumb, the two back-to-list controls and the
           * `409`'s find-existing link land somewhere instead of on a 404 (spec
           * Q-1). It is filtered in from NAV_PATHS above, so nothing to add.
           *
           * `/customers/new` before `/customers/:id` for the reader's sake only
           * — `matchRoutes` ranks a static segment above a dynamic one whatever
           * the order, so `new` is not swallowed by `:id`. Written this way round
           * because relying on that ranking silently is how `/tickets` came to
           * render a placeholder for a whole release. */
          /* `033`. `/customers` ITSELF IS A SCREEN NOW — it was `023`'s placeholder,
           * filtered in from NAV_PATHS, and the comment beside `/customers/new`
           * said the list was a later feature. This is that feature. */
          { path: '/customers', element: <CustomersListPage /> },
          { path: '/customers/new', element: <CreateCustomerPage /> },
          { path: '/customers/:id', element: <CustomerProfilePage /> },
        ],
      },
    ],
  },
  ...devRoutes,
];
