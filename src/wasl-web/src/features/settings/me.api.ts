import { apiFetch } from '../../lib/api';
import type { Language } from '../../lib/direction';

/* ============================================================================
 * me.api.ts — the fetchers for the signed-in user's own settings
 * ============================================================================
 * Source: specs/014-language-preference-and-rtl/contracts/me-language-api.md,
 * frozen. Thin on purpose: build a path, call the wrapper, return nothing.
 * ============================================================================ */

/**
 * `PUT /api/me/language` → `204 No Content`.
 *
 * NO PATH PARAMETER, AND THAT IS THE CONTRACT'S POINT. `me` is the subject of
 * the bearer token; no user can set another user's preference, and there is no
 * field in the body that names one.
 *
 * TWO THINGS THIS RESPONSE DOES NOT DO, both of which look like failures:
 *
 *   1. **`Content-Language` on the `204` names the locale applied to THIS
 *      request** — the one in force *before* the switch. A client reading it to
 *      confirm the change will conclude it failed. The contract calls this the
 *      single most confusing thing about the endpoint, and it is behaviour, not
 *      a defect. So nothing here reads it.
 *   2. **The token is not reissued.** The `preferred_language` claim keeps its
 *      old value until the next sign-in, which is why the caller also sets the
 *      in-session `?culture=` override — see `setSessionCulture`.
 */
export function changeMyLanguage(
  language: Language,
  signal?: AbortSignal,
): Promise<void> {
  return apiFetch<void>('/api/me/language', {
    method: 'PUT',
    body: { language },
    ...(signal ? { signal } : {}),
  });
}
