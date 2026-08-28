import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../lib/api';
import i18n from '../../lib/i18n';
import { AuthProvider } from './AuthContext';

/* ============================================================================
 * The sign-in screen — AC-27, and the temporary 401 override
 * ============================================================================
 *
 * The module is the seam, for the reason `024` gives: mocking `fetch` would test
 * the wrapper, and the wrapper has its own suite in `lib/api.test.ts`. What this
 * file asserts is what the SCREEN does with what the wrapper throws.
 * ============================================================================ */

/* jsdom implements neither, and `BrandPanel` calls both on mount. Stubbed
 * rather than shimmed: no assertion here is about the mesh, and a stub that
 * records nothing is honest about that. The panel is `aria-hidden`, so it is
 * invisible to every query below in any case. */
if (!global.ResizeObserver) {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];

vi.mock('./auth.api', () => ({ signIn: vi.fn() }));

const { signIn } = await import('./auth.api');
const { default: LoginPage } = await import('./LoginPage');

/** The `401` the server ACTUALLY returns today — see the override test below. */
const REJECTED = new ApiError(
  {
    type: 'https://wasl.local/errors/unauthenticated',
    title: 'Authentication is required.',
    status: 401,
    detail: 'Error.Auth.InvalidCredentials',
  },
  'en',
);

function renderPage(initialEntry = '/login') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <AuthProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            {/* A marker, not copy — queried by test id so the BR-8.8 rule keeps
                meaning what it says about USER-FACING strings. */}
            <Route path="/tickets" element={<div data-testid="tickets-screen" />} />
          </Routes>
        </MemoryRouter>
        </AuthProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

async function submitCredentials() {
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: /email/i }), 'manager@wasl.local');
  await user.type(
    document.querySelector('input[name="password"]') as HTMLInputElement,
    'wrong-password',
  );
  await user.click(screen.getByRole('button', { name: /sign in/i }));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.mocked(signIn).mockReset();
  void i18n.changeLanguage('en');
});

describe('AC-27 — a 401 here is the form error, never a redirect', () => {
  it('stays on /login and renders the failure', async () => {
    /* THE DEFECT THIS PREVENTS. Without the interceptor's `SIGN_IN_PATH`
     * exclusion, a wrong password redirects `/login` → `/login`: the route is
     * replaced, `LoginPage` remounts, the form state and the error block go with
     * it, and the screen looks like the submit button does nothing at all. */
    vi.mocked(signIn).mockRejectedValue(REJECTED);
    renderPage();

    await submitCredentials();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByTestId('tickets-screen')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /email/i })).toHaveValue(
      'manager@wasl.local',
    );
  });

  it('does not write a session on a rejected credential', async () => {
    vi.mocked(signIn).mockRejectedValue(REJECTED);
    renderPage();

    await submitCredentials();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(localStorage.getItem('wasl.session')).toBeNull();
    expect(sessionStorage.getItem('wasl.session')).toBeNull();
  });
});

describe('TEMPORARY — the 401 message comes from OUR catalogue, not the server', () => {
  /* ==========================================================================
   * REMOVE THIS BLOCK WHEN `004` IS FIXED.
   *
   * `POST /api/auth/token` currently answers a rejected credential with
   * `title: "Authentication is required."` — the sentence for a MISSING token on
   * a protected endpoint. The frozen contract specifies
   * `"Email or password is incorrect."`. So the screen was telling someone who
   * had just typed a password that authentication is required.
   *
   * Rendering the server's sentence is the rule (BR-8.6) and still is
   * everywhere else. It stops being right when the sentence itself is the
   * defect. The product owner is reporting it to the backend lane; it is NOT
   * fixed here.
   *
   * THE CONDITION: when `004` returns the contract's title, delete the
   * `status === 401` branch in `LoginPage`'s `onError` and this describe block
   * with it. The assertion below inverts — the server's sentence becomes what
   * the screen shows.
   * ========================================================================== */

  it('shows the catalogue sentence and NOT the server title', async () => {
    vi.mocked(signIn).mockRejectedValue(REJECTED);
    renderPage();

    await submitCredentials();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Email or password is incorrect');
    expect(alert).not.toHaveTextContent('Authentication is required');
  });

  it('never renders `detail`, which carries a raw resource key', async () => {
    /* `detail` was never displayed and is not what the override is about — but
     * an untranslated identifier reaching a user is worth one assertion. */
    vi.mocked(signIn).mockRejectedValue(REJECTED);
    renderPage();

    await submitCredentials();

    await screen.findByRole('alert');
    expect(screen.queryByText(/Error\.Auth\.InvalidCredentials/)).not.toBeInTheDocument();
  });
});

describe('a transport failure says something different from a rejected credential', () => {
  it('tells the user to retry rather than to retype', async () => {
    vi.mocked(signIn).mockRejectedValue(
      new ApiError(
        { type: 'errors/network', title: 'Failed to fetch', status: 0 },
        null,
      ),
    );
    renderPage();

    await submitCredentials();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not reach the server/i);
  });
});
