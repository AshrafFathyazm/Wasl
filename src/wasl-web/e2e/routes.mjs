import { TICKET_ID } from './mockApi.mjs';

/** The core routes of `041` Phase 1. `signedIn: false` is the login screen. */
export const CORE_ROUTES = [
  { key: 'login', path: '/login', signedIn: false },
  { key: 'dashboard', path: '/' },
  { key: 'tickets', path: '/tickets' },
  { key: 'ticket-detail', path: `/tickets/${TICKET_ID}` },
  { key: 'ticket-new', path: '/tickets/new' },
  { key: 'customers', path: '/customers' },
];

/** Phase 3: everything else a signed-in user can reach. */
export const EXTRA_ROUTES = [
  { key: 'tickets-mine', path: '/tickets/mine' },
  { key: 'tickets-unassigned', path: '/tickets/unassigned' },
  { key: 'customer-profile', path: '/customers/c-1' },
  { key: 'customer-new', path: '/customers/new' },
  { key: 'customer-edit', path: '/customers/c-1/edit' },
  { key: 'settings-branding', path: '/settings/branding' },
  { key: 'settings-localization', path: '/settings/localization' },
];

export const ALL_ROUTES = [...CORE_ROUTES, ...EXTRA_ROUTES];
