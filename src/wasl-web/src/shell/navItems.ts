import type { ComponentType, SVGProps } from 'react';

import { IconCustomer, IconDashboard, IconTicket } from '../icons/icons';

/* ============================================================================
 * navItems.ts — STATIC DATA
 * ============================================================================
 *
 * A literal array. The shell makes no request, and navigation is not
 * server-driven: ADR-011 §2 puts the URL in charge, and a nav fetched at runtime
 * means the first paint has no navigation in it.
 *
 * No counts. `02-app-shell.md` shows none, and a badge beside "Unassigned" would
 * need an aggregate that no endpoint serves yet — inventing a zero would be worse
 * than the absence, because a zero reads as information.
 *
 * SETTINGS IS DELIBERATELY NOT HERE. It lives in the user popover, following the
 * house pattern: a destination used monthly costs the same vertical space as one
 * used hourly.
 * ============================================================================ */

export type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

export interface NavLeaf {
  key: string;
  /** `namespace:key`. Resolved by the caller — this file holds no strings. */
  labelKey: string;
  to: string;
  /** A label that is data rather than copy — a ticket number. Wins over
   *  `labelKey` when present; `labelKey` is then only the fallback. */
  label?: string | undefined;
}

export interface NavEntry extends NavLeaf {
  icon: IconComponent;
  children?: NavLeaf[];
}

export const NAV_ITEMS: NavEntry[] = [
  {
    key: 'dashboard',
    labelKey: 'common:nav.dashboard',
    to: '/',
    icon: IconDashboard,
  },
  {
    key: 'tickets',
    labelKey: 'common:nav.tickets',
    to: '/tickets',
    icon: IconTicket,
    children: [
      { key: 'tickets-all', labelKey: 'common:nav.allTickets', to: '/tickets' },
      { key: 'tickets-mine', labelKey: 'common:nav.myTickets', to: '/tickets/mine' },
      {
        key: 'tickets-unassigned',
        labelKey: 'common:nav.unassigned',
        to: '/tickets/unassigned',
      },
    ],
  },
  {
    key: 'customers',
    labelKey: 'common:nav.customers',
    to: '/customers',
    icon: IconCustomer,
  },
];

/** Every path the nav can reach, so routes.tsx has ONE source for its
 *  placeholders rather than a second list that drifts out of step. */
export const NAV_PATHS: string[] = NAV_ITEMS.flatMap((item) =>
  item.children ? item.children.map((child) => child.to) : [item.to],
);

/** `/tickets/:id` — anything under `/tickets/` that is not one of the fixed
 *  sub-routes. The set is closed and lives in `routes.tsx`; a new fixed sub-route
 *  needs adding here or it reads as a ticket id. */
const TICKET_DETAIL = /^\/tickets\/(?!mine$|unassigned$|new$)([^/]+)$/;

export function ticketIdFromPath(pathname: string): string | null {
  return TICKET_DETAIL.exec(pathname)?.[1] ?? null;
}

/**
 * `040` item 15. The sidebar marks a leaf active by exact path (`NavLink end`), so
 * on `/tickets/:id` NOTHING was marked and the reader lost their place in the
 * product. A ticket belongs to the list it was opened from; the nav cannot know
 * which, so it is "All tickets" — the one that always contains it. Customers has
 * the same shape (`/customers/:id`, `/customers/new`, `/customers/:id/edit`).
 */
export function isNavLeafActive(leaf: NavLeaf, pathname: string): boolean {
  if (pathname === leaf.to) return true;
  if (leaf.key === 'tickets-all') return TICKET_DETAIL.test(pathname);
  if (leaf.key === 'customers') return pathname.startsWith('/customers/');
  return false;
}

/** The group a path sits under, for keeping it expanded. */
export function navEntryContains(item: NavEntry, pathname: string): boolean {
  return (
    isNavLeafActive(item, pathname) ||
    (item.children?.some((child) => isNavLeafActive(child, pathname)) ?? false)
  );
}

/**
 * `040` item 14 — the trail for the routes that are not in the nav: a new ticket and
 * a ticket's own page. `ticketNumber` is whatever the cache already holds; the
 * header makes no request for it, so before the page has loaded the last crumb says
 * "Ticket" and then takes the number.
 */
export function breadcrumbFor(pathname: string, ticketNumber?: string): NavLeaf[] {
  const tickets = NAV_ITEMS.find((item) => item.key === 'tickets');
  if (tickets) {
    if (pathname === '/tickets/new') {
      return [tickets, { key: 'ticket-new', labelKey: 'tickets:new', to: pathname }];
    }
    if (ticketIdFromPath(pathname) !== null) {
      return [
        tickets,
        { key: 'ticket-detail', labelKey: 'common:nav.ticketDetail', to: pathname, label: ticketNumber },
      ];
    }
  }
  for (const item of NAV_ITEMS) {
    if (item.children) {
      const child = item.children.find((c) => c.to === pathname);
      if (child) {
        return child.to === item.to ? [item] : [item, child];
      }
    }
    if (item.to === pathname) return [item];
  }
  return [];
}
