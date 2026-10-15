import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import i18n from '../lib/i18n';
import { Sidebar } from './Sidebar';

vi.mock('../features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { fullName: 'Ashraf Fathy', email: 'manager@wasl.local', role: 'Manager' },
    signOut: () => undefined,
  }),
}));

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

/* `040` item 24 / AC-7 — asserted by ROLE QUERY, which is what a screen reader
 * does: an element is named or it is not found. */
describe('the shell controls each have an accessible name', () => {
  for (const collapsed of ['expanded', 'collapsed'] as const) {
    it(`${collapsed}: logo link, collapse button and user menu are found by name`, () => {
      render(
        <MemoryRouter>
          <Sidebar
            mode={collapsed}
            drawerOpen={false}
            onToggle={() => undefined}
            onNavigate={() => undefined}
          />
        </MemoryRouter>,
      );

      const logo = screen.getByRole('link', { name: 'Wasl — go to the dashboard' });
      expect(logo).toHaveAttribute('href', '/');

      expect(
        screen.getByRole('button', {
          name: collapsed === 'collapsed' ? 'Expand sidebar' : 'Collapse sidebar',
        }),
      ).toBeInTheDocument();

      expect(
        screen.getByRole('button', { name: 'Account menu for Ashraf Fathy' }),
      ).toBeInTheDocument();
    });
  }
});
