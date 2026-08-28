import { apiFetch, SIGN_IN_PATH } from '../../lib/api';
import type { SignInRequest, SignInResponse } from '../../lib/api-types.provisional';

/* ============================================================================
 * auth.api.ts — the fetcher for this feature
 * ============================================================================
 * Thin on purpose, like tickets.api.ts: build a path, call the wrapper, return
 * the body. `lib/api.ts` throws a typed `ApiError` and the ROUTE decides what a
 * `401` means on this screen — which here is "render it", not "redirect".
 *
 * The path is `SIGN_IN_PATH`, imported rather than written again. It is the
 * value the `401` interceptor excludes, and a second copy of it in this file is
 * a second place for the two to drift — at which point the interceptor stops
 * excluding the endpoint it was written to exclude, and AC-27 fails silently.
 * ============================================================================ */

/**
 * `POST /api/auth/token`.
 *
 * The email is sent AS TYPED. The server trims and lowercases before lookup, and
 * normalising here would be a second implementation of one rule — the same
 * division as BR-4.2 for customers, and they diverge the same way.
 *
 * The password is sent AS TYPED, never trimmed. Leading and trailing spaces are
 * part of a password; a client that trims them makes a correct password fail
 * with no explanation, for the only users who would never guess why.
 */
export function signIn(
  body: SignInRequest,
  signal?: AbortSignal,
): Promise<SignInResponse> {
  return apiFetch<SignInResponse>(SIGN_IN_PATH, {
    method: 'POST',
    body,
    ...(signal ? { signal } : {}),
  });
}
