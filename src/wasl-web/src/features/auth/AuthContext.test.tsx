import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { SignInResponse } from '../../lib/api-types.provisional';
import { SESSION_STORAGE_KEY } from '../../lib/tokenStorage';
import { AuthProvider, useAuth } from './AuthContext';

/* ============================================================================
 * D-2 — Back after sign-out restored the authenticated shell
 * ============================================================================
 *
 * THE DEFECT, AS IT PRESENTED. Sign out, press Back: `/tickets/new` came back
 * with the sidebar, the nav, and the PREVIOUS USER'S REAL NAME AND EMAIL on
 * screen — while both storages were empty. Nothing threw. Nothing logged.
 *
 * THE CAUSE. The back/forward cache does not re-mount the application; it
 * restores the JavaScript heap. `AuthProvider` therefore comes back holding the
 * session object it had before, and `readSession()` — which runs exactly once,
 * in the state initialiser — is never called again. Every guard then sees a
 * signed-in user because, in memory, there still is one.
 *
 * WHY THIS TEST IS WORTH ITS WEIGHT. No amount of reading the component finds
 * it: the initialiser is correct, the guard is correct, the storage module is
 * correct. It is only wrong in combination with a browser behaviour, and it is
 * invisible to every other test in this suite.
 *
 * jsdom does not implement bfcache, so the test does what the browser does:
 * fires `pageshow` with `persisted: true` while the heap is intact. That is the
 * one signal the fix hangs on, so it is the right thing to assert against.
 * ============================================================================ */

const RESPONSE: SignInResponse = {
  accessToken: 'header.payload.signature',
  tokenType: 'Bearer',
  expiresAtUtc: '2026-08-28T20:00:00Z',
  user: {
    id: '01a0452e-3cf5-765a-a947-1b32c47e38b4',
    fullName: 'نورة السالم',
    email: 'agent2@wasl.local',
    role: 'Agent',
    preferredLanguage: 'ar',
  },
};

function Probe() {
  const { isSignedIn, user } = useAuth();
  return (
    <div>
      <span data-testid="state">{isSignedIn ? 'signed-in' : 'signed-out'}</span>
      <span data-testid="name">{user?.fullName ?? ''}</span>
    </div>
  );
}

function firePageShow(persisted: boolean) {
  act(() => {
    const event = new Event('pageshow') as Event & { persisted?: boolean };
    Object.defineProperty(event, 'persisted', { value: persisted });
    window.dispatchEvent(event);
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('D-2 — a bfcache restore re-reads storage', () => {
  it('drops the in-memory session when storage has been emptied', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(RESPONSE));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByTestId('state')).toHaveTextContent('signed-in');

    /* Sign-out happens, then the page is restored from bfcache with the heap
     * intact — which is what the running app did, and what broke. */
    localStorage.clear();
    sessionStorage.clear();
    firePageShow(true);

    expect(screen.getByTestId('state')).toHaveTextContent('signed-out');
    /* The name is the part that actually leaked. Assert on it directly rather
     * than only on the flag: a component could report signed-out and still be
     * rendering the person. */
    expect(screen.getByTestId('name')).toHaveTextContent('');
    expect(screen.queryByText('نورة السالم')).not.toBeInTheDocument();
  });

  it('picks up a session started elsewhere on restore', () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByTestId('state')).toHaveTextContent('signed-out');

    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(RESPONSE));
    firePageShow(true);

    expect(screen.getByTestId('state')).toHaveTextContent('signed-in');
  });

  it('ignores a NON-persisted pageshow, which fires on every ordinary load', () => {
    /* `pageshow` fires on a normal navigation too. Re-reading there would be
     * harmless but pointless; acting on it without checking `persisted` is how
     * this handler would start doing work on every page load. */
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(RESPONSE));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    localStorage.clear();
    firePageShow(false);

    expect(screen.getByTestId('state')).toHaveTextContent('signed-in');
  });
});

describe('the session is read once, before first paint', () => {
  it('renders signed-in on the FIRST render, with no effect needed', () => {
    /* If the read moved into a `useEffect`, every guard would see "signed out"
     * for one frame and redirect a signed-in user to `/login` on every load —
     * AC-25's flash with the causes reversed. `render` returns after the first
     * commit, so a signed-in state here proves the initialiser did it. */
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(RESPONSE));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(screen.getByTestId('state')).toHaveTextContent('signed-in');
    expect(screen.getByTestId('name')).toHaveTextContent('نورة السالم');
  });
});
