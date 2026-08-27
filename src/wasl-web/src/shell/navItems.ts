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

/** The trail for a pathname: the parent group, when there is one, then the
 *  current entry. Derived from the route, never fetched. */
export function breadcrumbFor(pathname: string): NavLeaf[] {
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
