import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  apiFetch,
  ApiError,
  resetUnauthenticatedGuard,
  setCredentialResolver,
  setUnauthenticatedHandler,
  SIGN_IN_PATH,
} from './api';

/* ============================================================================
 * The interceptor — AC-27 and AC-025-05
 * ============================================================================
 *
 * AC-27 is one comparison in one file, and getting it wrong costs the whole
 * screen: a wrong password redirects `/login` → `/login`, the form and its error
 * are discarded, and the submit button looks dead. Nothing errors and nothing is
 * logged. It is the most expensive defect available in this feature and the
 * cheapest to assert.
 *
 * `fetch` is the seam. Everything below the wrapper is the network, and stubbing
 * the module instead would test the stub.
 * ============================================================================ */

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const problem401 = {
  type: 'https://wasl.local/errors/unauthenticated',
  title: 'Authentication is required.',
  status: 401,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetUnauthenticatedGuard();
  setCredentialResolver(() => null);
  setUnauthenticatedHandler(null);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthenticatedHandler(null);
  setCredentialResolver(() => null);
});

describe('AC-27 — the sign-in endpoint is excluded', () => {
  it('does NOT run the handler for a 401 from POST /api/auth/token', async () => {
    const handler = vi.fn();
    setUnauthenticatedHandler(handler);
    fetchMock.mockResolvedValue(jsonResponse(401, problem401));

    await expect(
      apiFetch(SIGN_IN_PATH, { method: 'POST', body: { email: 'a@b.c', password: 'x' } }),
    ).rejects.toBeInstanceOf(ApiError);

    /* If this ever reaches 1, a wrong password starts redirecting the user away
     * from the page they are already on, and the form error is thrown away. */
    expect(handler).not.toHaveBeenCalled();
  });

  it('DOES run the handler for a 401 from any other endpoint', async () => {
    const handler = vi.fn();
    setUnauthenticatedHandler(handler);
    fetchMock.mockResolvedValue(jsonResponse(401, problem401));

    await expect(apiFetch('/api/tickets')).rejects.toBeInstanceOf(ApiError);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('compares the PATH, not the built URL', async () => {
    /* The exclusion must not become a substring match: `/api/auth/tokens-audit`
     * is a different endpoint and has to be intercepted normally. */
    const handler = vi.fn();
    setUnauthenticatedHandler(handler);
    fetchMock.mockResolvedValue(jsonResponse(401, problem401));

    await expect(apiFetch('/api/auth/tokens-audit')).rejects.toBeInstanceOf(ApiError);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('still throws for the caller, so the screen can render the failure', async () => {
    setUnauthenticatedHandler(vi.fn());
    fetchMock.mockResolvedValue(jsonResponse(401, problem401));

    const error = await apiFetch(SIGN_IN_PATH, { method: 'POST' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
  });
});

describe('AC-025-05 — a burst of 401s clears once, and does not loop', () => {
  it('runs the handler exactly once for three parallel 401s', async () => {
    const handler = vi.fn();
    setUnauthenticatedHandler(handler);
    fetchMock.mockResolvedValue(jsonResponse(401, problem401));

    await Promise.allSettled([
      apiFetch('/api/tickets'),
      apiFetch('/api/customers'),
      apiFetch('/api/tickets/1'),
    ]);

    /* Three clears and three redirects is a `/login` that flickers. */
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('re-arms after a successful request, so a LATER expiry is still caught', async () => {
    const handler = vi.fn();
    setUnauthenticatedHandler(handler);

    fetchMock.mockResolvedValueOnce(jsonResponse(401, problem401));
    await apiFetch('/api/tickets').catch(() => undefined);
    expect(handler).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await apiFetch('/api/tickets');

    fetchMock.mockResolvedValueOnce(jsonResponse(401, problem401));
    await apiFetch('/api/tickets').catch(() => undefined);

    /* Without the reset, one 401 would disarm the interceptor for the rest of
     * the page's life and the next expiry would pass through unnoticed. */
    expect(handler).toHaveBeenCalledTimes(2);
  });
});

describe('AC-025-03 — Authorization is composed from tokenType', () => {
  function sentHeaders(): Record<string, string> {
    return (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
  }

  it('sends `${tokenType} ${accessToken}`', async () => {
    setCredentialResolver(() => ({ tokenType: 'Bearer', accessToken: 'abc.def.ghi' }));
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiFetch('/api/tickets');

    expect(sentHeaders()['Authorization']).toBe('Bearer abc.def.ghi');
  });

  it('follows a CHANGED tokenType rather than a hard-coded scheme', async () => {
    /* The contract issues `tokenType` precisely so the client does not write
     * `'Bearer '` into a template. A concatenated literal passes the test above
     * and fails this one. */
    setCredentialResolver(() => ({ tokenType: 'DPoP', accessToken: 'abc.def.ghi' }));
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiFetch('/api/tickets');

    expect(sentHeaders()['Authorization']).toBe('DPoP abc.def.ghi');
  });

  it('sends NO Authorization header when there is no session', async () => {
    setCredentialResolver(() => null);
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiFetch('/api/tickets');

    expect(sentHeaders()['Authorization']).toBeUndefined();
  });
});
