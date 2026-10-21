import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import i18n from '../lib/i18n';
import { NAV_ITEMS, breadcrumbFor, isNavLeafActive, ticketIdFromPath } from './navItems';
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

const ID = '8f1c2d34-5678-4abc-9def-0123456789ab';

describe('040 item 15 — a ticket’s own page keeps its place in the sidebar', () => {
  const allTickets = NAV_ITEMS.find((item) => item.key === 'tickets')?.children?.find(
    (child) => child.key === 'tickets-all',
  );
  const mine = NAV_ITEMS.find((item) => item.key === 'tickets')?.children?.find(
    (child) => child.key === 'tickets-mine',
  );

  it('recognises /tickets/:id as a ticket and the fixed sub-routes as not', () => {
    expect(ticketIdFromPath(`/tickets/${ID}`)).toBe(ID);
    for (const fixed of [
      '/tickets',
      '/tickets/mine',
      '/tickets/unassigned',
      '/tickets/new',
    ]) {
      expect(ticketIdFromPath(fixed)).toBeNull();
    }
  });

  it('marks All tickets active on a ticket, and leaves My tickets alone', () => {
    expect(allTickets && isNavLeafActive(allTickets, `/tickets/${ID}`)).toBe(true);
    expect(mine && isNavLeafActive(mine, `/tickets/${ID}`)).toBe(false);
    /* The negative control: the fixed sub-route must NOT light up All tickets too,
       or two bars would stand in one column. */
    expect(allTickets && isNavLeafActive(allTickets, '/tickets/mine')).toBe(false);
  });

  it('renders the active class on the All tickets link at /tickets/:id', () => {
    render(
      <MemoryRouter initialEntries={[`/tickets/${ID}`]}>
        <Sidebar
          mode="expanded"
          drawerOpen={false}
          onToggle={() => undefined}
          onNavigate={() => undefined}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'All tickets' }).className).toMatch(/active/);
    expect(screen.getByRole('link', { name: 'My tickets' }).className).not.toMatch(
      /active/,
    );
  });

  it('keeps Customers active on a customer page', () => {
    const customers = NAV_ITEMS.find((item) => item.key === 'customers');
    expect(customers && isNavLeafActive(customers, '/customers/abc')).toBe(true);
    expect(customers && isNavLeafActive(customers, '/customers/new')).toBe(true);
  });
});

describe('040 item 14 — the breadcrumb for routes that are not in the nav', () => {
  it('reads Tickets › <number> on a ticket, from what the cache already holds', () => {
    const trail = breadcrumbFor(`/tickets/${ID}`, 'TCK-2026-000042');

    expect(trail.map((crumb) => crumb.key)).toEqual(['tickets', 'ticket-detail']);
    expect(trail[0]?.to).toBe('/tickets');
    expect(trail[1]?.label).toBe('TCK-2026-000042');
  });

  it('falls back to the generic label before the ticket has loaded', () => {
    const last = breadcrumbFor(`/tickets/${ID}`).at(-1);
    expect(last?.label).toBeUndefined();
    expect(last?.labelKey).toBe('common:nav.ticketDetail');
  });

  it('reads Tickets › New ticket on /tickets/new', () => {
    expect(breadcrumbFor('/tickets/new').map((crumb) => crumb.key)).toEqual([
      'tickets',
      'ticket-new',
    ]);
  });

  it('leaves every existing trail as it was', () => {
    expect(breadcrumbFor('/').map((crumb) => crumb.key)).toEqual(['dashboard']);
    expect(breadcrumbFor('/tickets/mine').map((crumb) => crumb.key)).toEqual([
      'tickets',
      'tickets-mine',
    ]);
    expect(breadcrumbFor('/tickets').map((crumb) => crumb.key)).toEqual(['tickets']);
  });
});
