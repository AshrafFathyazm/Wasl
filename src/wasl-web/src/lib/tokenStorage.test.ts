import { beforeEach, describe, expect, it } from 'vitest';

import type { SignInResponse } from './api-types.provisional';
import {
  clearSession,
  readSession,
  writeSession,
  SESSION_STORAGE_KEY,
} from './tokenStorage';

/* ============================================================================
 * tokenStorage — AC-28, and the switch that made it necessary
 * ============================================================================
 *
 * Two storages hold the same key, and which one is written depends on a
 * checkbox. Every defect this module can have is a disagreement between the
 * two, so every test below writes one and asserts about BOTH.
 *
 * No DOM and no React: this is storage behaviour, and rendering a screen to
 * reach it would make the test slower and able to pass for the wrong reason.
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

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('AC-28 — sign-out clears BOTH storages', () => {
  it('clears the backend that was never written to in this session', () => {
    /* THE DEFECT THIS EXISTS FOR. Someone ticks "remember me" once, and does not
     * tick it the next time. The second sign-in writes `sessionStorage`; a naive
     * clear removes only that, and the first session's token survives in
     * `localStorage` — so the next visit is silently authenticated as a user who
     * pressed sign out. */
    writeSession(RESPONSE, 'remember');
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();

    writeSession(RESPONSE, 'session');
    clearSession();

    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(readSession()).toBeNull();
  });

  it('clears both even when nothing was ever written', () => {
    expect(() => clearSession()).not.toThrow();
    expect(readSession()).toBeNull();
  });
});

describe('writeSession puts the token in exactly one place', () => {
  it('remember → localStorage only', () => {
    writeSession(RESPONSE, 'remember');
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('session → sessionStorage only', () => {
    writeSession(RESPONSE, 'session');
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('switching from remember to session leaves NO stale localStorage entry', () => {
    /* `writeSession` clears first for this reason, and `readSession` prefers
     * `localStorage` — so without the clear this reads back the OLD session. */
    writeSession(RESPONSE, 'remember');
    writeSession({ ...RESPONSE, accessToken: 'second.token.value' }, 'session');

    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(readSession()?.accessToken).toBe('second.token.value');
  });
});

describe('readSession', () => {
  it('round-trips the whole session, Arabic name included', () => {
    writeSession(RESPONSE, 'remember');
    const read = readSession();

    expect(read?.accessToken).toBe(RESPONSE.accessToken);
    expect(read?.tokenType).toBe('Bearer');
    expect(read?.expiresAtUtc).toBe(RESPONSE.expiresAtUtc);
    /* `nvarchar` on the server, and it has to survive the client too. */
    expect(read?.user.fullName).toBe('نورة السالم');
    expect(read?.user.role).toBe('Agent');
  });

  it('prefers localStorage when both hold a session', () => {
    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ ...RESPONSE, accessToken: 'from.session.storage' }),
    );
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ ...RESPONSE, accessToken: 'from.local.storage' }),
    );

    expect(readSession()?.accessToken).toBe('from.local.storage');
  });

  it('treats a malformed entry as signed out AND removes it', () => {
    /* A shape written by an older build is the realistic case. It must read as
     * "not signed in" rather than crash the shell on its first render — and it
     * must not be left behind to be re-checked on every load forever. */
    localStorage.setItem(SESSION_STORAGE_KEY, '{ not json');

    expect(readSession()).toBeNull();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('rejects a session whose role is not one the server issues', () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ ...RESPONSE, user: { ...RESPONSE.user, role: 'admin' } }),
    );

    expect(readSession()).toBeNull();
  });

  it('rejects a session with no token', () => {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ ...RESPONSE, accessToken: '' }),
    );

    expect(readSession()).toBeNull();
  });
});
