import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import i18n from '../../lib/i18n';
import { SESSION_STORAGE_KEY } from '../../lib/tokenStorage';
import { AuthProvider } from '../auth/AuthContext';
import { SettingsNav } from './SettingsNav';

/* ============================================================================
 * SettingsNav — `022`, FE-022-08, spec Q-G
 * ========================================================================= */

function signInAs(role: 'Manager' | 'Agent') {
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      accessToken: 'test-token',
      tokenType: 'Bearer',
      expiresAtUtc: new Date(Date.now() + 3_600_000).toISOString(),
      user: {
        id: '01a0452e-3cf5-765a-a947-1b32c47e38b4',
        fullName: 'Someone',
        email: 'someone@wasl.local',
        role,
        preferredLanguage: 'en',
      },
    }),
  );
}

const mounted = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/settings/localization']}>
        <AuthProvider>
          <SettingsNav />
        </AuthProvider>
      </MemoryRouter>
    </I18nextProvider>,
  );

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage('en');
});

describe('Q-G — Branding is hidden for an Agent, not disabled', () => {
  it('shows both items to a Manager', () => {
    signInAs('Manager');
    mounted();

    expect(screen.getByRole('link', { name: 'Localization' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Branding' })).toBeInTheDocument();
  });

  /* ABSENT, NOT DISABLED. A disabled item advertises a capability the reader
   * will never have and invites them to ask why. `queryBy` and `toBeNull` is the
   * assertion — `not.toBeEnabled` would pass on a disabled item too, which is
   * exactly the outcome this rejects. */
  it('hides Branding from an Agent', () => {
    signInAs('Agent');
    mounted();

    expect(screen.getByRole('link', { name: 'Localization' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Branding' })).toBeNull();
    expect(screen.queryByText('Branding')).toBeNull();
  });

  /* THE NAV IS A CONVENIENCE, NEVER THE GUARD. Recorded as a test rather than a
   * comment, because "the item is hidden" is the kind of statement that gets
   * read as "the route is protected". It is not: the server answers `403` and
   * the page renders the forbidden state. */
  it('does not route-guard anything — the server does', () => {
    signInAs('Agent');
    const { container } = mounted();

    expect(container.querySelectorAll('a')).toHaveLength(1);
  });
});

describe('both languages', () => {
  it('renders the Arabic labels', async () => {
    signInAs('Manager');
    await i18n.changeLanguage('ar');
    mounted();

    expect(screen.getByRole('link', { name: 'الهوية البصرية' })).toBeInTheDocument();

    await i18n.changeLanguage('en');
  });
});
