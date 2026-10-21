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
