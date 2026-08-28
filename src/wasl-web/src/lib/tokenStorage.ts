import type { AuthenticatedUser, SignInResponse } from './api-types.provisional';

/* ============================================================================
 * tokenStorage.ts — the ONLY module that touches Web Storage for the session
 * ============================================================================
 *
 * One read point, one write point, one clear point.
 *
 * A component that reads storage directly is how two components come to
 * disagree about whether the user is signed in: one reads at mount, another on
 * every render, and after a sign-out in a second tab they render different
 * answers on the same screen. `AuthContext` reads this ONCE at start-up and is
 * the only caller.
 *
 * TWO BACKENDS, ONE CLEAR (AC-28).
 *
 * `remember me` chooses `localStorage`; its absence chooses `sessionStorage`.
 * That means the SAME key can exist in either — and a user who checked the box
 * once and unchecked it the next time has a token in `localStorage` that the
 * second sign-in never touched. So `clear()` writes to BOTH, unconditionally,
 * and `read()` prefers neither by accident: it checks `localStorage` first and
 * `sessionStorage` second, and a stale entry in the loser is removed on the way
 * past rather than left to resurface.
 *
 * WHAT IS STORED, AND WHAT IS NOT.
 *
 * The token, its expiry, and the `user` object from the sign-in response. NOT
 * the password, ever, in any form (BR-9.7). NOT anything decoded out of the JWT
 * — the contract makes `accessToken` opaque, and `user` carries everything the
 * interface needs.
 *
 * EVERY ACCESS IS GUARDED. Safari in private mode throws on `setItem` rather
 * than returning; a browser configured to block site data throws on read. A
 * sign-in that fails because storage is unavailable must degrade to "not
 * signed in", never to a thrown error at start-up that leaves a blank page.
 * ============================================================================ */

/** Kept distinct from `wasl.lang` in `direction.ts`. Same prefix, same reason:
 *  a key without one collides with whatever else is served from this origin. */
export const SESSION_STORAGE_KEY = 'wasl.session';

/** What is persisted between loads. A subset of `SignInResponse` — `tokenType`
 *  is kept because the `Authorization` header is composed from it (AC-025-03),
 *  and dropping it here would force the header to hard-code the scheme. */
export interface StoredSession {
  accessToken: string;
  tokenType: string;
  expiresAtUtc: string;
  user: AuthenticatedUser;
}

/** Where the token lives. The label is the user's choice, not a storage
 *  implementation detail leaking upward — `remember` means "survive the tab". */
export type SessionPersistence = 'remember' | 'session';

function backendFor(persistence: SessionPersistence): Storage | null {
  try {
    return persistence === 'remember' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Both, in read priority order. `localStorage` first: an explicit "remember me"
 *  outranks a token left in a tab. */
function allBackends(): Storage[] {
  const found: Storage[] = [];
  try {
    found.push(window.localStorage);
  } catch {
    /* blocked — nothing to add */
  }
  try {
    found.push(window.sessionStorage);
  } catch {
    /* blocked — nothing to add */
  }
  return found;
}

/**
 * Shape-check what came back out of storage.
 *
 * Storage is attacker-influenced in the same sense any client-side value is: it
 * survives across deployments, so a shape written by an older build of this
 * application is the realistic case, not a hostile one. Either way a missing
 * `user.role` must read as "not signed in" rather than crash the shell on its
 * first render.
 */
function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<StoredSession>;
  if (typeof candidate.accessToken !== 'string' || candidate.accessToken === '') {
    return false;
  }
  if (typeof candidate.tokenType !== 'string' || candidate.tokenType === '') return false;
  if (typeof candidate.expiresAtUtc !== 'string') return false;

  const user = candidate.user as Partial<AuthenticatedUser> | undefined;
  if (typeof user !== 'object' || user === null) return false;

  return (
    typeof user.id === 'string' &&
    typeof user.fullName === 'string' &&
    typeof user.email === 'string' &&
    (user.role === 'Agent' || user.role === 'Manager') &&
    (user.preferredLanguage === 'en' || user.preferredLanguage === 'ar')
  );
}

/**
 * Read the session, from whichever backend holds it.
 *
 * A malformed or half-written entry is CLEARED as it is found rather than
 * ignored: leaving it means the next read walks the same broken value again,
 * and a value that is checked and skipped on every load is a value nobody ever
 * removes.
 */
export function readSession(): StoredSession | null {
  for (const backend of allBackends()) {
    let raw: string | null;
    try {
      raw = backend.getItem(SESSION_STORAGE_KEY);
    } catch {
      continue;
    }
    if (raw === null) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = undefined;
    }

    if (isStoredSession(parsed)) return parsed;

    try {
      backend.removeItem(SESSION_STORAGE_KEY);
    } catch {
      /* nothing further to try */
    }
  }

  return null;
}

/**
 * Persist a session.
 *
 * `clearSession()` FIRST, always. Writing only to the chosen backend would
 * leave the other one holding the previous token, and `readSession()` prefers
 * `localStorage` — so signing in without *remember me* after signing in with it
 * would read back the OLD session on the next load. Observed as a class of bug
 * before it was written this way round; the clear is not defensive, it is the
 * correctness of the switch.
 */
export function writeSession(
  response: SignInResponse,
  persistence: SessionPersistence,
): void {
  clearSession();

  const backend = backendFor(persistence);
  if (backend === null) return;

  const stored: StoredSession = {
    accessToken: response.accessToken,
    tokenType: response.tokenType,
    expiresAtUtc: response.expiresAtUtc,
    user: response.user,
  };

  try {
    backend.setItem(SESSION_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    /* Private mode, or a storage quota. The session lasts until reload and no
     * further — which is a worse experience, not a broken one. */
  }
}

/** BOTH backends, unconditionally. AC-28, and the reason is in the header. */
export function clearSession(): void {
  for (const backend of allBackends()) {
    try {
      backend.removeItem(SESSION_STORAGE_KEY);
    } catch {
      /* nothing further to try */
    }
  }
}
