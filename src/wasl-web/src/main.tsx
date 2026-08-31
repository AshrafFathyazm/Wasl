import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

/*
 * THIS ORDER, AND NO OTHER. It is load-bearing.
 *
 *   1. tokens.css   the values — copied verbatim from docs/sdd/design/tokens.css
 *   2. base.css     element defaults, consuming the semantics
 *   3. locale.css   [lang="ar"] overrides, last so they win
 *
 * The spec's folder tree calls these "the four stylesheets" — a carry-over from a
 * draft that kept the brand ramp in a separate theme.css. The ramp now lives in
 * tokens.css itself, so there are three. Recorded rather than silently differing.
 */
import './styles/tokens.css';
import './styles/base.css';
import './styles/locale.css';

/* Side-effect import, and it must come BEFORE the first render: it initialises
 * i18next, registers the languageChanged handler that owns every later write of
 * `dir`/`lang`, and hands lib/api.ts its language resolver. The FIRST write of
 * dir/lang already happened inline in index.html, before paint. */
import './lib/i18n';
import { AuthProvider } from './features/auth/AuthContext';
import { routes } from './routes';
import { RouteFallback } from './shell/RouteFallback';

const container = document.getElementById('root');
if (!container) {
  throw new Error('#root is missing from index.html');
}

const router = createBrowserRouter(routes);

/* ONE client for the app. The defaults are chosen, not inherited:
 *
 *  - `retry: false`. `lib/api.ts` throws `ApiError` for every non-2xx, and a
 *    `404` or a `400` is information, not a transient fault. Retrying them
 *    three times delays the message the user needs and multiplies the log lines
 *    someone will read while debugging.
 *  - `refetchOnWindowFocus: false`. A support agent alt-tabs constantly. */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* OUTSIDE the router, so the session is read once for the application's
          whole life rather than per navigation — and so `RequireAuth` sees a
          settled answer on its very first render (`025`). */}
      <AuthProvider>
        {/* Route-level code splitting only (ADR-011 §7). Anything finer is
            optimisation without a measurement.

            The fallback was `null` until `029`, and that was the right answer
            without a timing gate: a chunk that resolves in 40ms and paints a
            spinner is a flash, and nothing beats a flash. `RouteFallback` keeps
            that behaviour for the first 150ms and shows the mark after — the
            rule, rather than the judgement that stood in for it. */}
        <Suspense fallback={<RouteFallback />}>
          <RouterProvider router={router} />
        </Suspense>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
