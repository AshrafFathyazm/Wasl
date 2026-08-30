// Wasl icon set
// 24 box · 16-unit keyline · stroke 1.5 · round caps and joins · corner radius 2
// Contours are closed. The signature is the tighter keyline and the derived radius,
// not an interruption — see design/icons.md for why the aperture rule was dropped.

import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const base = (size: number) => ({
  width: size, height: size, viewBox: '0 0 24 24',
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
});


export const IconDashboard = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/></svg>
);

export const IconTicket = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><path d="M6 7h12a2 2 0 0 1 2 2v1.5a1.8 1.8 0 0 0 0 3.6V15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1.9a1.8 1.8 0 0 0 0-3.6V9a2 2 0 0 1 2-2Z"/></svg>
);

export const IconCustomer = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><circle cx="12" cy="8.5" r="3.4"/><path d="M5.5 19.5c0-3.2 2.9-4.9 6.5-4.9s6.5 1.7 6.5 4.9"/></svg>
);

export const IconEscalate = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><rect x="4.5" y="4.5" width="15" height="15" rx="2"/><path d="M12 15.5v-7m0 0-2.6 2.6M12 8.5l2.6 2.6"/></svg>
);

export const IconAssign = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><circle cx="10.5" cy="8" r="3.2"/><path d="M4 19.5c0-3 2.8-4.6 6.5-4.6 1 0 2 .1 2.8.4"/><path d="M17.5 15.5v5m2.5-2.5h-5"/></svg>
);

export const IconComment = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><path d="M19.5 14.5a2 2 0 0 1-2 2H12l-4 3v-3H6.5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8Z"/></svg>
);

export const IconPending = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 1.8"/></svg>
);

export const IconResolved = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><circle cx="12" cy="12" r="8"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>
);

export const IconClosed = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><rect x="4.5" y="10.5" width="15" height="9.5" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>
);

export const IconEmail = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><rect x="4" y="6" width="16" height="12" rx="2"/><path d="m4.8 7.5 7.2 5 7.2-5"/></svg>
);

export const IconWhatsapp = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><path d="M4 20l1.2-4A8 8 0 1 1 8 18.8L4 20Z"/><path d="M9.5 9.8c0 2.9 2.2 5.1 5 5.3"/></svg>
);

export const IconLivechat = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><path d="M20 14.5a2 2 0 0 1-2 2h-4l-4 3.5v-3.5H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7Z"/><path d="M8.5 11h7"/></svg>
);

export const IconSms = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><rect x="6.5" y="3" width="11" height="18" rx="2"/><path d="M10.5 18h3"/></svg>
);

export const IconWebform = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M7.5 9h9M7.5 12.5h9M7.5 16h5"/></svg>
);

export const IconSearch = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/></svg>
);

/* LINES, NOT A FUNNEL. The funnel this used to draw is a different icon in the
 * same family, and the design uses the lines form - three horizontal rules of
 * decreasing length, centred. Same keyline, same stroke, same 24 box.
 *
 * A funnel reads as "narrow this down" and the lines read as "these are the
 * controls"; the panel this opens holds chips and date fields, not a narrowing
 * step. Only the tickets preview consumes this, so the geometry moved rather
 * than a second icon being added - two filter icons in one set is how a screen
 * ends up with both. */
export const IconFilter = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><path d="M3.5 7h17M6.5 12h11M9.5 17h5"/></svg>
);

export const IconSort = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><path d="M7.5 4.5v15m0 0L4 16m3.5 3.5L11 16M16.5 19.5v-15m0 0L13 8m3.5-3.5L20 8"/></svg>
);

export const IconAdd = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><path d="M12 5.5v13M5.5 12h13"/></svg>
);

export const IconChevronDown = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><path d="M6.5 10l5.5 5.5L17.5 10"/></svg>
);

export const IconMore = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><circle cx="12" cy="5.5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="18.5" r="1.2"/></svg>
);

/* Added by 026 for the ticket-list chrome. Same keyline, same stroke, same box —
 * a filter panel that closes with a hand-drawn × is a second icon set. */

export const IconClose = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"/></svg>
);

export const IconCalendar = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><rect x="4" y="6" width="16" height="14" rx="2"/><path d="M8 4v4M16 4v4M4 10.5h16"/></svg>
);

export const IconEye = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><path d="M4 12s3.2-5.5 8-5.5 8 5.5 8 5.5-3.2 5.5-8 5.5S4 12 4 12Z"/><circle cx="12" cy="12" r="2.4"/></svg>
);
