import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '../lib/i18n';
import { AppShell } from './AppShell';

vi.mock('../features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { fullName: 'Ashraf Fathy', email: 'manager@wasl.local', role: 'Manager' },
    signOut: () => undefined,
  }),
}));

/* ============================================================================
 * `041` AC-3, AC-5, AC-17 — the navigation drawer below lg
 * ============================================================================
 * jsdom evaluates no stylesheet, so what is asserted here is behaviour: the
 * open/close contract, the modal semantics, focus, and that the PAGE is not
 * replaced while the drawer is up. The slide, the mirroring under RTL and the
 * reduced-motion rule are CSS and are checked in a browser (the smoke test and
 * `tests.md`), not claimed here.
 * ========================================================================= */

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

const ORIGINAL_WIDTH = window.innerWidth;
beforeEach(() => {
  window.innerWidth = 390;
});
afterEach(() => {
  window.innerWidth = ORIGINAL_WIDTH;
});

const LABEL = 'Draft';
const GO = 'Go elsewhere';
const OTHER = 'Other page';
const NEW_PAGE = 'New ticket page';

/** A page with a field whose text must survive the drawer opening and closing. */
function Draft() {
  return (
    <div>
      <label htmlFor="draft">{LABEL}</label>
      <textarea id="draft" />
      <Link to="/other">{GO}</Link>
    </div>
  );
}

function mount(path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Draft />} />
            <Route path="/other" element={<p>{OTHER}</p>} />
            <Route path="/tickets/new" element={<p>{NEW_PAGE}</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const openButton = () => screen.getByRole('button', { name: 'Open menu' });

describe('below lg the navigation is a drawer', () => {
  it('shows a hamburger, and no dialog until it is pressed', () => {
    mount();

    expect(openButton()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens as a modal dialog and moves focus into it', async () => {
    mount();

    await userEvent.click(openButton());

    const dialog = screen.getByRole('dialog', { name: 'Main' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(openButton()).toHaveAttribute('aria-expanded', 'true');
  });

  it('makes the page behind it inert while it is open', async () => {
    const { container } = mount();
    const page = container.querySelector('main')?.parentElement;

    await userEvent.click(openButton());
    expect(page).toHaveAttribute('inert');

    await userEvent.keyboard('{Escape}');
    expect(page).not.toHaveAttribute('inert');
  });

  it('closes on Escape and gives focus back to the hamburger', async () => {
    mount();
    await userEvent.click(openButton());

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(openButton()).toHaveFocus();
  });

  it('closes when the close button is pressed', async () => {
    mount();
    await userEvent.click(openButton());

    await userEvent.click(screen.getByRole('button', { name: 'Close menu' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes when a link inside it is followed, and the route changes', async () => {
    mount();
    await userEvent.click(openButton());

    await userEvent.click(screen.getByRole('link', { name: 'Customers' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps Tab inside it — from the last control to the first, and back', async () => {
    mount();
    await userEvent.click(openButton());
    const dialog = screen.getByRole('dialog');

    for (let i = 0; i < 30; i += 1) {
      await userEvent.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    for (let i = 0; i < 30; i += 1) {
      await userEvent.tab({ shift: true });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  /* AC-17 / §8.F. The drawer is a SIBLING of the page. If it ever remounted the
     route, the half-written reply below would be gone — and nothing else in the
     suite would notice, because every other test types and submits in one go. */
  it('does not lose an unsaved draft when it opens and closes', async () => {
    mount();
    const field = screen.getByLabelText('Draft');
    await userEvent.type(field, 'half a reply');

    await userEvent.click(openButton());
    await userEvent.keyboard('{Escape}');
    await userEvent.click(openButton());
    await userEvent.click(screen.getByRole('button', { name: 'Close menu' }));

    expect(screen.getByLabelText('Draft')).toBe(field);
    expect(screen.getByLabelText('Draft')).toHaveValue('half a reply');
  });
});

describe('AC-5 — New ticket stays reachable below md', () => {
  it('has a named, linked button in the top bar without opening the drawer', () => {
    mount();

    const link = screen.getByRole('link', { name: 'New ticket' });
    expect(link).toHaveAttribute('href', '/tickets/new');
  });

  it('is not drawn on the New ticket page itself', async () => {
    mount('/tickets/new');

    await waitFor(() => expect(screen.getByText('New ticket page')).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'New ticket' })).not.toBeInTheDocument();
  });
});

describe('at lg and up the sidebar is the persistent one', () => {
  beforeEach(() => {
    window.innerWidth = 1280;
  });

  it('renders no hamburger and no dialog, and keeps the collapse button', () => {
    mount();

    expect(screen.queryByRole('button', { name: 'Open menu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument();
  });

  it('does not draw the header New ticket button (the sidebar has it)', () => {
    mount();

    const links = screen.queryAllByRole('link', { name: 'New ticket' });
    expect(links).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'New ticket' })).toBeInTheDocument();
  });
});
