/* ============================================================================
 * mockApi — `041`. A deterministic stand-in for the API, for Playwright.
 * ============================================================================
 * WHY A MOCK. The smoke test must run with no SQL Server, no secrets and no
 * seeded database (Q-4, ruled 2026-10-15), and the layout it checks does not
 * depend on what the server computes — only on the SHAPE and LENGTH of what it
 * sends. So the fixtures are deliberately awkward: long Arabic and English
 * subjects, a long unbroken email, a customer name that will not fit a card.
 * A layout that survives these survives the seeded data.
 *
 * The shapes are copied from `lib/api-types.provisional.ts` and from the fixtures
 * in the vitest suites, which are the closest thing to a contract the client has.
 * An endpoint this file does not know answers `404` with the problem envelope
 * and is recorded in `unhandled`, so a new screen that fetches something new
 * fails loudly instead of rendering an empty state that looks fine.
 * ========================================================================= */

export const SESSION_KEY = 'wasl.session';
export const LANGUAGE_KEY = 'wasl.lang';

export const USER = {
  id: 'u-1',
  fullName: 'Mona Al-Otaibi',
  email: 'manager@wasl.local',
  role: 'Manager',
  preferredLanguage: 'en',
};

const THEME = {
  brandColor: '#0B2545',
  onBrand: '#FFFFFF',
  sidebarMode: 'Light',
  updatedAtUtc: '2026-10-01T00:00:00Z',
  version: 'AAAAAAAAB+4=',
};

export function sessionFor(lang) {
  return {
    accessToken: 'e2e-token',
    tokenType: 'Bearer',
    expiresAtUtc: new Date(Date.now() + 3_600_000).toISOString(),
    user: { ...USER, preferredLanguage: lang },
    theme: THEME,
  };
}

const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();

const SUBJECTS = [
  'Duplicate charge on invoice 5512 after the plan upgrade went through twice',
  'تعذر تسجيل الدخول إلى الحساب بعد تغيير كلمة المرور من الجوال',
  'Cannot export the monthly statement as PDF',
  'طلب استرداد المبلغ المدفوع مرتين عن الاشتراك السنوي للشركة',
  'Short one',
  'WhatsApp notifications stopped arriving for the whole Riyadh branch since Sunday morning',
  'تأخر تسليم الطلب رقم ٤٤١٢ لأكثر من أسبوعين دون أي تحديث',
  'Password reset email never arrives',
  'Invoice shows the wrong VAT number for the Jeddah entity',
  'لا يمكنني إضافة مستخدم جديد إلى الفريق',
  'Webform submissions are duplicated',
  'Please update the billing address on file',
];

const CUSTOMER_NAMES = [
  'Faisal Al-Otaibi',
  'علي الأحمد',
  'Abdulrahman Mohammed Al-Ghamdi Al-Qahtani',
  'سارة المطيري',
  'Noura',
  'محمد عبدالله بن سعود الدوسري',
];

const STATUSES = ['New', 'Open', 'InProgress', 'PendingCustomer', 'Resolved', 'Closed'];
const PRIORITIES = ['Low', 'Normal', 'High', 'Critical'];
const CHANNELS = ['Email', 'WhatsApp', 'LiveChat', 'Sms', 'WebForm'];
const CATEGORIES = ['Billing', 'Technical', 'Account', 'General'];
const ASSIGNEES = [
  { id: 'u-1', name: 'Mona Al-Otaibi' },
  { id: 'u-2', name: 'Omar Khalid' },
  { id: 'u-3', name: 'نورة الشهري' },
  null,
];

export const TICKETS = SUBJECTS.map((subject, i) => {
  const assignee = ASSIGNEES[i % ASSIGNEES.length];
  return {
    id: `00000000-0000-4000-8000-0000000000${String(i + 10)}`,
    ticketNumber: `TCK-2026-0003${String(10 + i)}`,
    subject,
    customerId: `c-${(i % CUSTOMER_NAMES.length) + 1}`,
    customerName: CUSTOMER_NAMES[i % CUSTOMER_NAMES.length],
    status: STATUSES[i % STATUSES.length],
    priority: PRIORITIES[i % PRIORITIES.length],
    category: CATEGORIES[i % CATEGORIES.length],
    channel: CHANNELS[i % CHANNELS.length],
    assigneeId: assignee ? assignee.id : null,
    assigneeName: assignee ? assignee.name : null,
    isEscalated: i % 5 === 0,
    createdAtUtc: hoursAgo(2 + i * 9),
  };
});

export const TICKET_ID = TICKETS[0].id;

function ticketDetail(id) {
  const row = TICKETS.find((t) => t.id === id) ?? TICKETS[0];
  return {
    id: row.id,
    ticketNumber: row.ticketNumber,
    customer: {
      id: row.customerId,
      fullName: row.customerName,
      email:
        'abdulrahman.mohammed.alghamdi.alqahtani@very-long-company-domain-name.example.com',
      companyName: 'Al-Ghamdi Trading & Contracting Company LLC',
    },
    subject: row.subject,
    description:
      'The customer reports the issue started after the plan upgrade. '.repeat(4) +
      'ThisIsAVeryLongUnbrokenTokenThatMustNotPushThePageWiderThanTheViewport_0123456789_abcdefghijklmnopqrstuvwxyz',
    category: row.category,
    priority: row.priority,
    channel: row.channel,
    status: row.status,
    assignedToUserId: row.assigneeId,
    assignee: row.assigneeId
      ? { id: row.assigneeId, fullName: row.assigneeName, role: 'Agent' }
      : null,
    isEscalated: row.isEscalated,
    escalatedAtUtc: null,
    escalatedBy: null,
    escalationReason: null,
    canEscalate: true,
    createdByUserId: 'u-1',
    createdAtUtc: row.createdAtUtc,
    updatedAtUtc: row.createdAtUtc,
    version: 'AAAAAAAAB+4=',
    allowedTransitions: ['InProgress', 'Closed'],
    tags: [
      { id: 't-1', name: 'Refund' },
      { id: 't-2', name: 'Double charge' },
    ],
  };
}

const ACTOR = { id: 'u-1', fullName: 'Mona Al-Otaibi', role: 'Manager' };

function timelinePage() {
  const base = {
    actor: ACTOR,
    body: null,
    isInternal: null,
    channel: null,
    oldValue: null,
    newValue: null,
    note: null,
    authorKind: null,
    recordedBy: null,
  };
  const items = [
    {
      ...base,
      type: 'Created',
      id: 'e-1',
      occurredAtUtc: hoursAgo(30),
      cursor: 'c-1',
      newValue: 'New',
    },
    {
      ...base,
      type: 'Comment',
      id: 'e-2',
      occurredAtUtc: hoursAgo(20),
      cursor: 'c-2',
      body: 'Called the customer and confirmed the second charge. Escalating to billing for a refund — ThisIsAVeryLongUnbrokenTokenThatMustNotPushThePageWiderThanTheViewport_0123456789',
      isInternal: true,
    },
    {
      ...base,
      type: 'Comment',
      id: 'e-3',
      occurredAtUtc: hoursAgo(10),
      cursor: 'c-3',
      body: 'مرحباً، نعتذر عن الإزعاج. تم تحويل طلبك إلى قسم الفواتير وسنوافيك بالنتيجة خلال يومين عمل.',
      isInternal: false,
    },
  ];
  return { items, hasMore: false, nextCursor: null, commentCount: 2, historyCount: 1 };
}

function dashboard(range) {
  const days = range === '30d' ? 30 : range === '7d' ? 7 : 14;
  const series = Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * 86_400_000);
    return {
      localDate: d.toISOString().slice(0, 10),
      created: 3 + ((i * 7) % 9),
      resolved: 2 + ((i * 5) % 8),
    };
  });
  return {
    range,
    scope: 'Team',
    timeZoneId: 'Asia/Riyadh',
    fromLocalDate: series[0].localDate,
    toLocalDate: series[series.length - 1].localDate,
    generatedAtUtc: new Date().toISOString(),
    attention: {
      unassignedCount: 12,
      escalatedOpenCount: 3,
      escalatedOverdueCount: 2,
      waitingOnCustomerCount: 21,
      assignedToMeCount: 4,
      oldestUntouched: {
        ticketId: TICKETS[0].id,
        ticketNumber: 'TCK-2026-000318',
        subject: 'Duplicate charge on invoice 5512',
        createdAtUtc: hoursAgo(99),
        ageHours: 99,
      },
      myOldest: null,
      needsAttentionTotal: 15,
    },
    dailySeries: series,
    openByStatus: [
      { status: 'New', count: 12 },
      { status: 'Open', count: 18 },
      { status: 'InProgress', count: 12 },
      { status: 'PendingCustomer', count: 21 },
    ],
    medians: {
      firstReplyMinutes: 130,
      firstReplySampleSize: 46,
      resolutionMinutes: 1680,
      resolutionSampleSize: 31,
      firstReplyTargetMinutes: 120,
      resolutionTargetMinutes: 1440,
    },
    channelMix: CHANNELS.map((channel, i) => ({
      channel,
      count: [26, 36, 16, 0, 10][i],
    })),
    needsAttention: TICKETS.slice(0, 5).map((t, i) => ({
      ticketId: t.id,
      ticketNumber: t.ticketNumber,
      subject: t.subject,
      customerName: t.customerName,
      status: t.status,
      priority: t.priority,
      isEscalated: t.isEscalated,
      isUnassigned: t.assigneeId === null,
      createdAtUtc: t.createdAtUtc,
      ageHours: 99 - i * 12,
    })),
    teamLoad: [
      {
        userId: 'u-1',
        fullName: 'Mona Al-Otaibi',
        isActive: true,
        assignedOpenCount: 14,
        escalatedOpenCount: 3,
      },
      {
        userId: 'u-2',
        fullName: 'Omar Khalid',
        isActive: true,
        assignedOpenCount: 11,
        escalatedOpenCount: 1,
      },
      {
        userId: 'u-3',
        fullName: 'نورة الشهري',
        isActive: true,
        assignedOpenCount: 6,
        escalatedOpenCount: 0,
      },
    ],
  };
}

const CUSTOMERS = CUSTOMER_NAMES.map((fullName, i) => ({
  id: `c-${i + 1}`,
  fullName,
  email:
    i % 2 === 0
      ? `customer.with.a.rather.long.address.${i}@example-company-name.example.com`
      : null,
  phone: i % 3 === 0 ? null : `+96655000000${i}`,
  companyName: i % 2 === 0 ? 'Al-Ghamdi Trading & Contracting Company LLC' : null,
  createdAtUtc: hoursAgo(100 + i * 24),
}));

function paged(items, url) {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const pageSize = Math.min(100, Number(url.searchParams.get('pageSize') ?? 25));
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    totalCount: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
  };
}

const json = (body, status = 200) => ({
  status,
  contentType: 'application/json; charset=utf-8',
  body: JSON.stringify(body),
});

/**
 * Installs the mock on a page's context. Returns `{ unhandled }`, an array that
 * fills with `METHOD /path` for every request nothing answered.
 */
export async function installMockApi(context, { signedIn = true } = {}) {
  const unhandled = [];

  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method === 'GET') {
      if (path === '/api/dashboard')
        return route.fulfill(json(dashboard(url.searchParams.get('range') ?? '14d')));
      if (path === '/api/tickets') {
        let rows = TICKETS;
        const status = url.searchParams.getAll('status');
        if (status.length > 0) rows = rows.filter((t) => status.includes(t.status));
        const assignee = url.searchParams.get('assignee');
        if (assignee === 'unassigned') rows = rows.filter((t) => t.assigneeId === null);
        else if (assignee)
          rows = rows.filter((t) => t.assigneeId === assignee || assignee === 'me');
        return route.fulfill(json(paged(rows, url)));
      }
      const ticket = /^\/api\/tickets\/([^/]+)$/.exec(path);
      if (ticket && ticket[1] !== 'new')
        return route.fulfill(json(ticketDetail(ticket[1])));
      if (/^\/api\/tickets\/[^/]+\/timeline$/.test(path))
        return route.fulfill(json(timelinePage()));
      if (/^\/api\/tickets\/[^/]+\/interactions$/.test(path))
        return route.fulfill(json({ items: [] }));
      if (path === '/api/communications/channels') {
        return route.fulfill(json({ sendableChannels: ['Email', 'WhatsApp', 'Sms'] }));
      }
      if (path === '/api/support-users') {
        return route.fulfill(
          json([
            { id: 'u-1', fullName: 'Mona Al-Otaibi', role: 'Manager' },
            { id: 'u-2', fullName: 'Omar Khalid', role: 'Agent' },
            { id: 'u-3', fullName: 'نورة الشهري', role: 'Agent' },
          ]),
        );
      }
      if (path === '/api/tags')
        return route.fulfill(
          json([
            { id: 't-1', name: 'Refund' },
            { id: 't-2', name: 'Double charge' },
          ]),
        );
      if (path === '/api/canned-replies') {
        return route.fulfill(
          json([
            {
              id: 'r-1',
              title: 'Request a statement',
              body: 'Please send a copy of the statement.',
              category: 'Billing',
            },
          ]),
        );
      }
      if (path === '/api/customers') return route.fulfill(json(paged(CUSTOMERS, url)));
      if (path === '/api/customers/companies')
        return route.fulfill(json(['Al-Ghamdi Trading & Contracting Company LLC']));
      const customer = /^\/api\/customers\/([^/]+)$/.exec(path);
      if (customer) {
        const row = CUSTOMERS.find((c) => c.id === customer[1]) ?? CUSTOMERS[0];
        return route.fulfill(
          json({
            ...row,
            notes: 'Prefers WhatsApp. Billing contact for the Jeddah entity.',
            isActive: true,
            updatedAtUtc: row.createdAtUtc,
            version: 'AAAAAAAAB+4=',
          }),
        );
      }
      if (path === '/api/settings/branding') return route.fulfill(json(THEME));
    }

    if (method === 'POST' && path === '/api/auth/token') {
      return route.fulfill(json({ ...sessionFor('en'), tokenType: 'Bearer' }));
    }

    unhandled.push(`${method} ${path}`);
    return route.fulfill(
      json(
        {
          type: 'https://wasl.local/errors/not-found',
          title: 'e2e: no mock',
          status: 404,
          traceId: 'e2e',
        },
        404,
      ),
    );
  });

  if (signedIn) context.signedIn = true;
  return { unhandled };
}

/** Seeds the session and language BEFORE the app boots. */
export async function seedSession(context, lang, { signedIn = true } = {}) {
  await context.addInitScript(
    ({ sessionKey, languageKey, session, language, withSession }) => {
      try {
        localStorage.setItem(languageKey, language);
        if (withSession) localStorage.setItem(sessionKey, JSON.stringify(session));
        else localStorage.removeItem(sessionKey);
      } catch {
        /* a private window; the run reports it as a failure of its own */
      }
    },
    {
      sessionKey: SESSION_KEY,
      languageKey: LANGUAGE_KEY,
      session: sessionFor(lang),
      language: lang,
      withSession: signedIn,
    },
  );
}
