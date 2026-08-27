import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Strip every dev-only selector from the production stylesheet.
 *
 * `[data-preview-state='…']` exists so src/dev/PreviewPage can force :hover and
 * :active, which cannot be forced any other way — and that is the ONLY reason
 * those selectors exist. Nothing in production ever sets the attribute.
 *
 * The problem is not their size. It is that a development surface leaks into the
 * production build, and it leaks in small enough pieces that nobody notices it
 * growing: six selectors today, sixty after ten screens, each one too small to
 * argue about on its own.
 *
 * Doing this at build time rather than by hand keeps ONE copy of every state
 * value — the component's own rule — so the preview cannot drift from what the
 * product renders. A hand-maintained dev-only stylesheet would have to restate
 * all six values, and a preview that restates them is a preview that can lie.
 *
 * The marker is the attribute name. Any future dev-only hook that uses it is
 * stripped by the same rule, with no further work.
 */
const DEV_ONLY_SELECTOR = 'data-preview-state';

const stripDevOnlySelectors = () => ({
  postcssPlugin: 'strip-dev-only-selectors',
  Rule(rule: { selectors: string[]; remove: () => void }) {
    const kept = rule.selectors.filter(
      (selector) => !selector.includes(DEV_ONLY_SELECTOR),
    );
    if (kept.length === 0) {
      rule.remove();
    } else if (kept.length !== rule.selectors.length) {
      rule.selectors = kept;
    }
  },
});
stripDevOnlySelectors.postcss = true;

/**
 * The API in development.
 *
 * Read from the environment rather than written here, because it is a local
 * fact: `src/Wasl.Api/Properties/launchSettings.json` binds 5272 today and a
 * teammate may run it elsewhere. `.env.local` is git-ignored and is the one
 * place to change it.
 */
const API_TARGET = process.env.WASL_API_TARGET ?? 'http://localhost:5272';

export default defineConfig(({ command }) => ({
  plugins: [react()],

  /* A DEV PROXY, so the browser never makes a cross-origin request.
   *
   * Not a convenience. Calling the API directly at its own port is cross-origin,
   * which means a preflight, which the API answers with no
   * `Access-Control-Allow-Origin` — the create request failed with
   * `net::ERR_FAILED` and nothing reached the server at all. That is a real gap
   * in the API's configuration and it is NOT fixed here; it is reported to the
   * backend lane, because a deployment that serves the SPA from a different
   * origin will hit it again with no proxy in front.
   *
   * What the proxy does fix is the development loop: `/api/**` is same-origin,
   * so there is no preflight to fail. It also makes `BASE_URL` default to
   * `window.location.origin`, which removes the hard-coded port guess that was
   * wrong from the day it was written.
   *
   * Development only. `vite build` emits no server, so nothing here ships. */
  server: {
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
  css: {
    postcss: {
      plugins: command === 'build' ? [stripDevOnlySelectors()] : [],
    },
  },
}));
