import { useMemo, useState } from 'react';
import { I18nextProvider } from 'react-i18next';

import { DashboardView, type DashboardState } from '../features/dashboard/DashboardView';
import type {
  DashboardDay,
  DashboardRange,
  DashboardSnapshot,
} from '../lib/api-types.provisional';
import { cx } from '../lib/cx';
import type { Lang } from '../lib/formatters';
import i18n from '../lib/i18n';
import styles from './DashboardPreview.module.css';

/**
 * FE-020-00 — `/`, previewed at the real tokens and the real copy.
 *
 * Source: the dashboard canvas the product owner supplied on 2026-09-07, and
 * `docs/sdd/design/screens/11-dashboard.md`. **The numbers below are the
 * canvas's own** — 12 unassigned, 3 escalated with 2 over a day, a 4-day oldest
 * untouched, 21 waiting, 94 created against 88 resolved, a 63-ticket queue split
 * 12/18/12/21, medians of 2h 10m and 1d 4h, five channels at 36/26/16/10/6 and
 * three agents at 14/11/6 — so a difference between this page and the canvas is
 * a difference in the SCREEN rather than in the data it was given.
 *
 * NOTHING HERE CALLS THE SERVER. `DashboardView` takes a state and a snapshot as
 * props, which is what lets the four states that matter be rendered on demand:
 * loading, a failed request, an EMPTY system, and an Agent's four tiles instead
 * of a Manager's. A wired screen reaches three of those only by breaking
 * something, and the fourth by signing in as somebody else.
 *
 * ARABIC AND ENGLISH SIDE BY SIDE, Arabic first. The defects this page exists to
 * find are comparative — a tooltip that jumped to the far side of its column, an
 * arrow that kept pointing left, a 92px label column that fits `Pending cust.`
 * and not `بانتظار العميل`, a median that lost its unit. A language toggle would
 * make every one of those a memory test.
 */

/* ── The canvas's fourteen days ────────────────────────────────────────────── */

const CREATED = [6, 8, 5, 9, 7, 4, 2, 7, 9, 8, 6, 10, 7, 6];
const RESOLVED = [5, 7, 6, 8, 6, 3, 2, 6, 8, 9, 5, 8, 8, 7];

/** The 30-day series, so the range tabs are reviewable rather than decorative.
 *  The canvas's own 30-day arrays. */
const CREATED_30 = [
  4, 6, 7, 5, 8, 6, 3, 2, 5, 7, 6, 8, 4, 6, 8, 5, 9, 7, 4, 2, 7, 9, 8, 6, 10, 7, 6, 8, 5, 7,
];
const RESOLVED_30 = [
  3, 5, 7, 6, 7, 5, 3, 2, 4, 6, 7, 7, 4, 5, 7, 6, 8, 6, 3, 2, 6, 8, 9, 5, 8, 8, 7, 6, 6, 6,
];

/**
 * The spine, ending on a FIXED day.
 *
 * `2026-09-07`, not `new Date()`: a preview whose axis changes daily cannot be
 * compared against a canvas, and the whole point of this page is that comparison.
 * The dates are built by hand from a day number rather than through `Date`
 * arithmetic, for the reason `dashboardFormat.ts` documents — this file is where
 * a stray `new Date("2026-08-25")` would be most tempting and least visible.
 */
function series(created: readonly number[], resolved: readonly number[]): DashboardDay[] {
  const endDay = 7; // 2026-09-07
  const augustDays = 31;

  return created.map((value, index) => {
    const daysBack = created.length - 1 - index;
    const dayOfMonth = endDay - daysBack;

    const [month, day] =
      dayOfMonth > 0 ? [9, dayOfMonth] : [8, augustDays + dayOfMonth];

    return {
      localDate: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      created: value,
      resolved: resolved[index] ?? 0,
    };
  });
}

const MANAGER: DashboardSnapshot = {
  range: '14d',
  scope: 'Team',
  timeZoneId: 'Asia/Riyadh',
  fromLocalDate: '2026-08-25',
  toLocalDate: '2026-09-07',
  generatedAtUtc: '2026-09-07T09:14:02Z',
  attention: {
    unassignedCount: 12,
    escalatedOpenCount: 3,
    escalatedOverdueCount: 2,
    waitingOnCustomerCount: 21,
    assignedToMeCount: 4,
    oldestUntouched: {
      ticketId: '8f1c2d34-5678-4abc-9def-0123456789ab',
      ticketNumber: 'TCK-2026-000318',
      subject: 'Duplicate charge on invoice 5512',
      createdAtUtc: '2026-09-03T06:11:00Z',
      ageHours: 99,
    },
    myOldest: null,
    needsAttentionTotal: 15,

    /* `020b`. The canvas's own deltas: ▲3 unassigned, ▼1 escalated, ▲2d on the
       oldest, ▲5 waiting. Present here so the arrows are reviewable — the EMPTY
       and AGENT frames below deliberately omit `previous`, which is what the first
       fortnight after the capture starts running actually looks like. */
    previous: {
      localDate: '2026-08-24',
      unassignedCount: 9,
      escalatedOpenCount: 4,
      waitingOnCustomerCount: 16,
      oldestUntouchedHours: 51,
    },
  },
  dailySeries: series(CREATED, RESOLVED),
  openByStatus: [
    { status: 'New', count: 12 },
    { status: 'Open', count: 18 },
    { status: 'InProgress', count: 12 },
    { status: 'PendingCustomer', count: 21 },
    { status: 'Resolved', count: 9 },
  ],
  medians: {
    firstReplyMinutes: 130,
    firstReplySampleSize: 46,
    resolutionMinutes: 1680,
    resolutionSampleSize: 31,
    firstReplyTargetMinutes: 120,
    resolutionTargetMinutes: 1440,
  },
  channelMix: [
    { channel: 'Email', count: 26 },
    { channel: 'WhatsApp', count: 36 },
    { channel: 'LiveChat', count: 16 },
    { channel: 'Sms', count: 6 },
    { channel: 'WebForm', count: 10 },
  ],
  needsAttention: [
    {
      ticketId: '8f1c2d34-5678-4abc-9def-0123456789ab',
      ticketNumber: 'TCK-2026-000318',
      subject: 'Duplicate charge on invoice 5512',
      customerName: 'Faisal Al-Otaibi',
      status: 'Open',
      priority: 'High',
      isEscalated: true,
      isUnassigned: false,
      createdAtUtc: '2026-09-03T06:11:00Z',
      ageHours: 99,
    },
    {
      ticketId: '2b7e4c10-1111-4aaa-8bbb-000000000002',
      ticketNumber: 'TCK-2026-000341',
      /* THE ARABIC ROW IS IN BOTH FRAMES, deliberately. A subject is user
         content and the two languages share one list — `dir="auto"` is what
         keeps its punctuation at the right end on the English screen, and that
         is only reviewable if an Arabic subject is present there. */
      subject: 'تعذر تسجيل الدخول للحساب',
      customerName: 'علي الأحمد',
      status: 'New',
      priority: 'Normal',
      isEscalated: false,
      isUnassigned: true,
      createdAtUtc: '2026-09-05T08:20:00Z',
      ageHours: 51,
    },
    {
      ticketId: '2b7e4c10-1111-4aaa-8bbb-000000000003',
      ticketNumber: 'TCK-2026-000355',
      subject: 'Refund not received after 10 days',
      customerName: 'Noura Al-Harbi',
      status: 'InProgress',
      priority: 'Critical',
      isEscalated: true,
      isUnassigned: false,
      createdAtUtc: '2026-09-06T10:02:00Z',
      ageHours: 25,
    },
    {
      ticketId: '2b7e4c10-1111-4aaa-8bbb-000000000004',
      ticketNumber: 'TCK-2026-000372',
      subject: 'Cannot update billing address',
      customerName: 'Abdullah Al-Qahtani',
      status: 'New',
      priority: 'Normal',
      isEscalated: false,
      isUnassigned: true,
      createdAtUtc: '2026-09-07T02:40:00Z',
      ageHours: 9,
    },
  ],
  teamLoad: [
    {
      userId: '1a2b3c4d-0000-4000-8000-000000000001',
      fullName: 'Ashraf Fathy',
      isActive: true,
      assignedOpenCount: 14,
      escalatedOpenCount: 3,
    },
    {
      userId: '1a2b3c4d-0000-4000-8000-000000000002',
      fullName: 'سارة المطيري',
      isActive: true,
      assignedOpenCount: 11,
      escalatedOpenCount: 1,
    },
    {
      userId: '1a2b3c4d-0000-4000-8000-000000000003',
      fullName: 'Omar Khalid',
      isActive: false,
      assignedOpenCount: 6,
      escalatedOpenCount: 0,
    },
  ],
};

/* THE PROPERTY IS OMITTED, NOT SET TO `undefined` — and the compiler is what
 * insisted. `exactOptionalPropertyTypes` refuses `teamLoad: undefined` against
 * `teamLoad?: DashboardTeamMember[]`, which is exactly the distinction the
 * contract makes on the wire: an Agent's document has NO `teamLoad` key. The
 * first version of this fixture wrote `teamLoad: undefined` and would have
 * modelled a shape the server never sends. */
function withoutTeamLoad(snapshot: DashboardSnapshot): DashboardSnapshot {
  const copy = { ...snapshot };
  delete copy.teamLoad;
  return copy;
}

/** The same fortnight for an AGENT: no `teamLoad` property at all, and the four
 *  tiles are a different four. `unassignedCount` stays global — the contract's
 *  documented exception, and the tile that would otherwise read 0 forever. */
const AGENT: DashboardSnapshot = {
  ...withoutTeamLoad(MANAGER),
  scope: 'Mine',
  attention: {
    unassignedCount: 12,
    escalatedOpenCount: 1,
    escalatedOverdueCount: 0,
    waitingOnCustomerCount: 3,
    assignedToMeCount: 7,
    oldestUntouched: null,
    myOldest: {
      ticketId: '2b7e4c10-1111-4aaa-8bbb-000000000003',
      ticketNumber: 'TCK-2026-000355',
      subject: 'Refund not received after 10 days',
      createdAtUtc: '2026-09-06T10:02:00Z',
      ageHours: 25,
    },
    needsAttentionTotal: 6,
  },
  openByStatus: [
    { status: 'New', count: 1 },
    { status: 'Open', count: 3 },
    { status: 'InProgress', count: 2 },
    { status: 'PendingCustomer', count: 3 },
    { status: 'Resolved', count: 1 },
  ],
  medians: {
    firstReplyMinutes: 48,
    firstReplySampleSize: 9,
    resolutionMinutes: 610,
    resolutionSampleSize: 6,
    firstReplyTargetMinutes: 120,
    resolutionTargetMinutes: 1440,
  },

};

/**
 * A brand-new installation. Every count zero, a full-length zero series, all
 * five channels at zero, both medians `null` with a sample size of zero.
 *
 * THIS IS THE STATE THE CONTRACT REFUSES TO GIVE A SHAPE OF ITS OWN — an empty
 * system is a `200` with zeros, and the CLIENT decides what that means. So this
 * frame is the only place the decision is visible: muted tiles rather than red
 * ones, an em dash rather than `0m`, a sentence in the chart card rather than
 * fourteen bars of nothing, and good news rather than "no results" under the
 * attention list.
 */
const EMPTY: DashboardSnapshot = {
  ...MANAGER,
  attention: {
    unassignedCount: 0,
    escalatedOpenCount: 0,
    escalatedOverdueCount: 0,
    waitingOnCustomerCount: 0,
    assignedToMeCount: 0,
    oldestUntouched: null,
    myOldest: null,

    // Zero, so the "View all" link is absent on an empty system rather than
    // offering a list with nothing in it.
    needsAttentionTotal: 0,
  },
  dailySeries: series(
    CREATED.map(() => 0),
    RESOLVED.map(() => 0),
  ),
  openByStatus: [
    { status: 'New', count: 0 },
    { status: 'Open', count: 0 },
    { status: 'InProgress', count: 0 },
    { status: 'PendingCustomer', count: 0 },
    { status: 'Resolved', count: 0 },
  ],
  medians: {
    firstReplyMinutes: null,
    firstReplySampleSize: 0,
    resolutionMinutes: null,
    resolutionSampleSize: 0,

    /* THE TARGETS SURVIVE AN EMPTY SYSTEM, and that is the point of this frame:
       they are configuration rather than measurement, so the card reads
       "target 2h" beside an em dash instead of losing the label with the
       number. */
    firstReplyTargetMinutes: 120,
    resolutionTargetMinutes: 1440,
  },
  channelMix: [
    { channel: 'Email', count: 0 },
    { channel: 'WhatsApp', count: 0 },
    { channel: 'LiveChat', count: 0 },
    { channel: 'Sms', count: 0 },
    { channel: 'WebForm', count: 0 },
  ],
  needsAttention: [],
  teamLoad: [],
};

const VARIANTS = [
  { key: 'manager', label: 'Manager · 14d' },
  { key: 'agent', label: 'Agent · Mine' },
  { key: 'empty', label: 'Empty system' },
  { key: 'loading', label: 'Loading' },
  { key: 'error', label: 'Request failed' },
] as const;

type Variant = (typeof VARIANTS)[number]['key'];

function snapshotFor(variant: Variant, range: DashboardRange): DashboardSnapshot | undefined {
  const base =
    variant === 'agent'
      ? AGENT
      : variant === 'empty'
        ? EMPTY
        : variant === 'manager'
          ? MANAGER
          : undefined;

  if (base === undefined) return undefined;

  /* THE RANGE TABS DO SOMETHING HERE. A preview whose tabs only restyle
     themselves cannot show that 30 days labels every fourth tick, which is the
     one piece of chart behaviour that depends on the range. */
  if (range === '30d') {
    return {
      ...base,
      range,
      dailySeries:
        variant === 'empty'
          ? series(
              CREATED_30.map(() => 0),
              RESOLVED_30.map(() => 0),
            )
          : series(CREATED_30, RESOLVED_30),
    };
  }

  if (range === '7d') {
    return {
      ...base,
      range,
      dailySeries: base.dailySeries.slice(-7),
    };
  }

  return { ...base, range };
}

function stateFor(variant: Variant): DashboardState {
  return variant === 'loading' ? 'loading' : variant === 'error' ? 'error' : 'loaded';
}

/* ONE i18next INSTANCE PER LANGUAGE, so both frames render at once. Cloning is
 * what makes side-by-side possible: `changeLanguage` is global, so a toggle
 * would re-render both frames in the same language and the comparison would be
 * with a memory of the other one. A key missing from `ar` is then invisible in
 * exactly the place it should be loudest. */
const instances: Partial<Record<Lang, typeof i18n>> = {};

function instanceFor(lang: Lang) {
  instances[lang] ??= i18n.cloneInstance({ lng: lang });
  return instances[lang];
}

function Frame({
  variant,
  lang,
  range,
  onRangeChange,
}: {
  variant: Variant;
  lang: Lang;
  range: DashboardRange;
  onRangeChange: (next: DashboardRange) => void;
}) {
  const instance = useMemo(() => instanceFor(lang), [lang]);

  return (
    <I18nextProvider i18n={instance}>
      <div className={styles.frame} dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang}>
        {/* NO ROUTER HERE. This route is already inside the application's
            router, and react-router refuses a nested one — `032`'s preview met
            that and the whole page rendered as an error boundary while every
            unit test stayed green, because each of those mounts in its own
            MemoryRouter. The view's Links work from the real one. */}
        <DashboardView
          state={stateFor(variant)}
          snapshot={snapshotFor(variant, range)}
          range={range}
          onRangeChange={onRangeChange}
          lang={lang}
          updatedMinutes={1}
          traceId={variant === 'error' ? '0HN7QK3M9V2P1:0000000B' : undefined}
          onRetry={() => {}}
        />
      </div>
    </I18nextProvider>
  );
}

export default function DashboardPreview() {
  const [variant, setVariant] = useState<Variant>('manager');
  const [range, setRange] = useState<DashboardRange>('14d');

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>{'Dashboard — FE-020-00'}</h1>
      <p className={styles.pageNote}>
        {
          'The canvas of 2026-09-07 at the shipped tokens and the shipped copy. The numbers are the canvas’s own, so a difference here is a difference in the screen. Arabic first, English beside it — the tooltip, the hover arrow, the 92px label column and the medians are all comparative defects.'
        }
      </p>

      <div className={styles.controls}>
        {VARIANTS.map((option) => (
          <button
            key={option.key}
            type="button"
            className={cx(styles.control, option.key === variant && styles.controlOn)}
            aria-pressed={option.key === variant}
            onClick={() => setVariant(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className={styles.block}>
        <p className={styles.blockTitle}>{'AR — rtl'}</p>
        <Frame variant={variant} lang="ar" range={range} onRangeChange={setRange} />
      </div>

      <div className={styles.block}>
        <p className={styles.blockTitle}>{'EN — ltr'}</p>
        <Frame variant={variant} lang="en" range={range} onRangeChange={setRange} />
      </div>

      <p className={styles.pageNote}>
        {
          'The range tabs move both frames, and they change the data: 30d labels every fourth tick, 7d shows the last week of the same series. The escalated tile’s footnote is the one number the frozen contract could not produce — it is the contract change of 2026-09-07.'
        }
      </p>
    </div>
  );
}
