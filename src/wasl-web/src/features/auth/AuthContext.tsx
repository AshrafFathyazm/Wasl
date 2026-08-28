import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  resetUnauthenticatedGuard,
  setCredentialResolver,
  setUnauthenticatedHandler,
  type Credential,
} from '../../lib/api';
import type { AuthenticatedUser, SignInResponse } from '../../lib/api-types.provisional';
import { applyDocumentLanguage, isLanguage, storeLanguage } from '../../lib/direction';
import i18n from '../../lib/i18n';
import {
  clearSession,
  readSession,
  writeSession,
  type SessionPersistence,
  type StoredSession,
} from '../../lib/tokenStorage';

/* ============================================================================
 * AuthContext — the ONE place the application knows who is signed in
 * ============================================================================
 *
 * STORAGE IS READ ONCE, in `useState`'s initialiser (ADR-011 §1).
 *
 * Not in a `useEffect`. An effect runs AFTER paint, so for one frame every
 * guard sees "signed out" and every protected route redirects to `/login` —
 * including for a user who is signed in. That is AC-25's flash with the causes
 * reversed, and it happens on every single load rather than intermittently. The
 * initialiser runs before the first render, so the first thing any guard sees is
 * the truth.
 *
 * NOTHING ELSE READS STORAGE. `tokenStorage` is imported here and nowhere else,
 * which is what stops two components disagreeing about whether there is a
 * session.
 *
 * THE `401` HANDLER LIVES HERE, NOT IN A COMPONENT. It is registered in an
 * effect against `lib/api.ts`, because `lib/api.ts` must not import this module
 * — the dependency runs one way, and a fetch wrapper that knows about React
 * context is a fetch wrapper that cannot be tested without one.
 * ============================================================================ */

export interface AuthState {
  user: AuthenticatedUser | null;
  isSignedIn: boolean;
  /** Applies the response: stores it, adopts the language, and arms the API
   *  layer. Returns nothing — the caller navigates. */
  signIn: (response: SignInResponse, persistence: SessionPersistence) => void;
  /** Clears both storages and drops the identity. Does NOT navigate — the caller
   *  does, because only it knows where from. */
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Adopt `user.preferredLanguage` (AC-30).
 *
 * The server's stored preference OUTRANKS the client's resolution order
 * (ADR-007 §4), and this is the moment the client learns what it is. A Manager
 * whose preference is `ar` lands in an Arabic interface without touching a
 * switcher.
 *
 * `storeLanguage` as well as `changeLanguage`, so the choice survives the next
 * load and the pre-paint script in `index.html` gets it right BEFORE React runs
 * — otherwise every subsequent load flashes LTR for an Arabic user, which is
 * the defect `direction.ts` exists to prevent.
 */
function adoptPreferredLanguage(user: AuthenticatedUser): void {
  if (!isLanguage(user.preferredLanguage)) return;
  storeLanguage(user.preferredLanguage);
  applyDocumentLanguage(user.preferredLanguage);
  void i18n.changeLanguage(user.preferredLanguage);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  /* Read once, before first paint. See the header. */
  const [session, setSession] = useState<StoredSession | null>(() => readSession());

  /* The resolver `lib/api.ts` calls on EVERY request must see the current
   * session without this component re-registering it on every change — so the
   * resolver closes over a ref, and the ref is written synchronously during
   * render rather than in an effect.
   *
   * An effect here would mean the very first request after sign-in reads the
   * PREVIOUS value: `signIn()` sets state, the caller navigates, the new route
   * fires its query, and the effect that updates the ref has not run yet. The
   * request goes out with no credential and comes back `401`. */
  const sessionRef = useRef<StoredSession | null>(session);
  sessionRef.current = session;

  useEffect(() => {
    setCredentialResolver((): Credential | null => {
      const current = sessionRef.current;
      if (current === null) return null;
      return { tokenType: current.tokenType, accessToken: current.accessToken };
    });

    return () => {
      setCredentialResolver(() => null);
    };
  }, []);

  const signIn = useCallback(
    (response: SignInResponse, persistence: SessionPersistence) => {
      writeSession(response, persistence);
      setSession({
        accessToken: response.accessToken,
        tokenType: response.tokenType,
        expiresAtUtc: response.expiresAtUtc,
        user: response.user,
      });
      /* A fresh credential re-arms the interceptor: without this, a session that
       * ended in a `401` would leave the guard latched and the NEXT expiry would
       * pass through unintercepted. */
      resetUnauthenticatedGuard();
      adoptPreferredLanguage(response.user);
    },
    [],
  );

  const signOut = useCallback(() => {
    clearSession();
    setSession(null);
    resetUnauthenticatedGuard();
  }, []);

  /* BACK AFTER SIGN-OUT — AC-28's second half, and it does not work without this.
   *
   * MEASURED, not anticipated. After signing out, the browser Back button
   * rendered the full authenticated shell at `/tickets/new`, with the previous
   * user's real name and email in the sidebar. Storage was empty; the interface
   * was not.
   *
   * The cause is the back/forward cache. A bfcache restore does not re-mount the
   * application — it restores the whole JavaScript heap, so this provider comes
   * back holding the session object it had before, and `readSession()` (which
   * runs exactly once, in the state initialiser) is never called again. Every
   * guard then sees a signed-in user because, in memory, there still is one.
   *
   * `pageshow` with `persisted` is the only event that fires for that restore.
   * Re-reading storage there is what makes the in-memory answer agree with the
   * stored one again — and because `RequireAuth` is already watching
   * `isSignedIn`, setting it to null is all that is needed; the redirect follows.
   *
   * This also covers the reverse: a session started in another tab is picked up
   * on restore rather than showing a stale signed-out shell. */
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      const restored = readSession();
      setSession((current) => {
        const sameToken = current?.accessToken === restored?.accessToken;
        return sameToken ? current : restored;
      });
    };

    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  /* The interceptor's consequence. Registered once; it only ever clears.
   *
   * It does NOT navigate. `RequireAuth` is already mounted on every protected
   * route and redirects the moment `isSignedIn` goes false, so pushing a second
   * navigation from here would race it — and the loser wins, non-deterministically.
   * One mechanism for "you are not signed in, go to /login", and it is the guard. */
  useEffect(() => {
    setUnauthenticatedHandler(() => {
      clearSession();
      setSession(null);
    });

    return () => {
      setUnauthenticatedHandler(null);
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user: session?.user ?? null,
      isSignedIn: session !== null,
      signIn,
      signOut,
    }),
    [session, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Throws outside the provider rather than returning a signed-out default.
 *
 * A default would make a component rendered outside the tree look signed out —
 * so a guard would redirect, a shell would show nobody, and the cause would be a
 * missing provider that nothing reported.
 */
export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error('useAuth was called outside AuthProvider');
  }
  return value;
}
