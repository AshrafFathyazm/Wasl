/*
 * A placeholder, and the one real instance of ADR-011 §3's feature-folder
 * convention — so the next feature copies a shape that exists rather than reading
 * a description of one.
 *
 * It renders nothing. Stage 2 produces no UI, and an application with no route
 * does not run, so this is the smallest thing that satisfies both. The app shell
 * replaces it in stage 3.
 *
 * No text: a user-facing literal in JSX fails the build (eslint.config.js).
 */
export default function HomePage() {
  return <div data-page="home" />;
}
