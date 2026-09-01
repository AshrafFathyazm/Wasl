import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { Badge } from '../components/Badge/Badge';
import { Skeleton } from '../components/Loader/Skeleton';
import { Button } from '../components/Button/Button';
import { Checkbox } from '../components/Checkbox/Checkbox';
import { Input } from '../components/Input/Input';
import { Dropdown } from '../components/Dropdown/Dropdown';
import { Textarea } from '../components/Textarea/Textarea';
import {
  IconAssign,
  IconChevronDown,
  IconComment,
  IconEmail,
  IconEscalate,
  IconLivechat,
  IconSms,
  IconWebform,
  IconWhatsapp,
} from '../icons/icons';
import { cx } from '../lib/cx';
import type {
  CommunicationChannel,
  SupportUser,
  SupportUserRole,
  TicketCategory,
  TicketPriority,
  TicketResponse,
  TicketStatus,
  TimelineEntry,
} from '../lib/api-types.provisional';
import { formatDateTime, formatNumber, type Lang } from '../lib/formatters';
/* The design lives WITH THE FEATURE now, not in dev/. The real page imports the
 * same file, so there is one source of truth for this screen's geometry — a
 * preview with its own copy is a preview that drifts from the thing it was
 * approved as. `027` Q-5 ruled the preview IS the design; that makes this file
 * the design document, and it belongs beside the page. */
import styles from '../features/tickets/TicketDetail.module.css';

/*
 * FE-027-00 — the ticket detail screen, PREVIEWED BEFORE ANY WIRING.
 *
 * No fetch, no query client, no route params. A static rendering costs minutes
 * and answers the questions that cost hours once a screen carries tests, keys
 * and query wiring (ADR-009, design/preview-first-workflow.md).
 *
 * ---- THE DESIGN DOCUMENT EXISTS -------------------------------------------
 *
 * `027/spec.md` Q-5 says there is no design document for this screen and that
 * the preview must therefore BE the design. That is wrong:
 * `docs/sdd/design/screens/04-ticket-detail.md` is 102 lines and names every
 * region, every action with its endpoint and failure paths, and every state.
 *
 * So this preview is measured AGAINST that document rather than substituting
 * for it. Four things below are taken straight from it — the summary strip, the
 * 240px rail that doubles as section anchors, the accordion body sections, and
 * the sticky bottom action bar. Three things DEPART from it, each because a
 * later ruling overrides it, and each is commented where it happens:
 *
 *   1. THE TIMELINE IS INLINE, NOT A DRAWER, and it grows at the top.
 *      The document says "Timeline" is a header button opening a drawer,
 *      "newest page first". `027` Q-2 was approved on 2026-08-30 as newest at
 *      the BOTTOM with "load earlier" above. A drawer and an inline feed are
 *      not the same screen, and the approved answer is the later one.
 *
 *   2. ONE MERGED TIMELINE SECTION, NOT "Comments" + "Activity".
 *      The document lists two accordion sections. `013` returns ONE cursor-paged
 *      union of `dbo.TicketComments` and `dbo.TicketHistory` with a `type`
 *      discriminator per entry. Two sections from one merged feed would need the
 *      client to split it back apart and would give each half its own cursor,
 *      which the endpoint does not offer.
 *
 *   3. NO ESCALATE ACTION. The document's take-action menu carries Escalate and
 *      its rail carries an escalation callout. Escalation is `016` and `027` §5
 *      puts it out of scope. `isEscalated` IS on the ticket response, so the
 *      rail marker is rendered READ-ONLY; nothing here can raise it.
 *
 * ---- WHAT THE DOCUMENT HAS THAT `027` DOES NOT ----------------------------
 *
 * Three fields are real in the frozen contracts and named in the design
 * document, and `027`'s acceptance criteria are silent on all three. They are
 * rendered here because a preview is exactly where that gets decided:
 *
 *   · `isInternal` on a comment (`013`) — BR-5.4. "Mark it. Do not hide it."
 *   · `channel` on a comment (`013`) — optional, null when typed rather than
 *     received.
 *   · `note` on a status change (`012`) — REQUIRED when closing from `New` or
 *     `Open` (BR-1.2), accepted on any transition. This one is not optional
 *     scope: a Close dialog without it produces a `400` the reader cannot act
 *     on, and status change IS in `027` scope.
 *
 * ---- IT IS BUILT IN ARABIC FIRST ------------------------------------------
 *
 * With a 200-character subject and 100 timeline entries, which is what was
 * asked for and is the case that decides the layout. An English preview with
 * five rows fits, passes, and answers the wrong question.
 *
 * Literals are allowed here: eslint scopes the no-JSX-literal rule to
 * src/components, src/shell and src/features. This file is none of them and it
 * never ships — routes.tsx strips /_preview from the production bundle inside
 * the `import.meta.env.DEV` branch.
 */

/* ---------------------------------------------------------------------------
 * Wire shapes. Hand-written and PROVISIONAL — `028` replaces them with types
 * generated from the OpenAPI document, and it is blocked pending authorisation
 * (`027` §5). Every field below was read off a frozen contract or the DTO that
 * implements it, not invented.
 * ------------------------------------------------------------------------- */

/*
 * THE PREVIEW DECLARED ITS OWN COPIES OF THESE, AND `npm run lint:types`
 * CAUGHT IT — six violations of ADR-011 §6, in a file written before those
 * types existed anywhere and checked only with `tsc` and `eslint`. Passing two
 * gates is not passing the gates.
 *
 * The copies were also already wrong in a way nothing would have surfaced: the
 * local `Ticket` had `customer.email` and no `createdByUserId`, so it agreed
 * with the real shape on everything the preview happened to render and on
 * nothing else. That is the failure this gate exists for.
 *
 * Aliasing them locally did not satisfy the gate either, and it is right about
 * that too: rule R1 fires on the DECLARATION, so `type Ticket = TicketResponse`
 * is still a domain name declared outside the provisional file, and the next
 * person to widen it has a second shape again. The imported names are used
 * directly below.
 *
 * `TimelineEntry` STAYS LOCAL, and it is the one type here that should be. It
 * has no entry in the provisional file because the frozen contract and the
 * server disagree about its shape — see the block at the foot of
 * `lib/api-types.provisional.ts`. The preview renders the shape the SERVER
 * returns, because a preview's job is to show what the screen will look like;
 * it is not a client, it sends nothing, and it therefore cannot ratify anything.
 * `FE-027-08` is where that stops being true, and it is blocked.
 */

/* THE LOCAL COPY IS DELETED 2026-08-31, because the reason for it is gone.
 *
 * The paragraph above said `TimelineEntry` STAYS LOCAL and was right to: the
 * frozen contract and the server disagreed about the shape, and a preview cannot
 * ratify a contract change because it sends nothing. FE-027-08 was blocked on it.
 *
 * The backend lane ruled on 2026-08-31 — the cursor is the truth, the frozen file
 * was stale, and `CLAUDE.md` had already said so. The shape is now in
 * `api-types.provisional.ts`, transcribed from a MEASUREMENT of a running
 * instance. So the local copy would be the second shape this same comment warns
 * about, and it is imported instead.
 */
/* ---------------------------------------------------------------------------
 * Copy. Real, destined for the `en` and `ar` catalogues. A preview written
 * with placeholder text measures placeholder text.
 * ------------------------------------------------------------------------- */

const COPY = {
  ar: {
    back: 'رجوع',
    takeAction: 'اتخاذ إجراء',
    status: 'الحالة',
    customer: 'العميل',
    assignee: 'المسؤول',
    channel: 'القناة',
    priority: 'الأولوية',
    category: 'التصنيف',
    created: 'تاريخ الإنشاء',
    updated: 'آخر تحديث',
    unassigned: 'غير مُعيَّنة',
    escalated: 'مُصعَّدة',
    escalatedBy: 'صُعِّدت هذه التذكرة. التصعيد يُدار في شاشة أخرى.',
    description: 'الوصف',
    timeline: 'المسار الزمني',
    entries: (n: string) => `${n} إدخالًا`,
    loadEarlier: 'تحميل الأقدم',
    feedStart: 'بداية المسار الزمني',
    moveTo: (s: string) => `النقل إلى ${s}`,
    assign: 'تعيين مسؤول',
    reassign: 'إعادة التعيين',
    unassign: 'إلغاء التعيين',
    pickAssignee: 'اختيار المسؤول',
    pickerHint: 'الترتيب هنا بحسب لغة العرض، لا بحسب ترتيب الخادم.',
    currentAssignee: 'المسؤول الحالي:',
    notInList: 'غير موجود في القائمة — حساب مُعطَّل. الاسم مقروء من التذكرة.',
    selfAssignOnly: 'يمكن للوكيل تعيين نفسه على تذكرة غير مُعيَّنة فقط.',
    confirm: 'تأكيد',
    cancel: 'إلغاء',
    note: 'ملاحظة',
    noteRequiredHelp: 'مطلوبة عند الإغلاق من «جديدة» أو «مفتوحة».',
    noteOptionalHelp: 'اختيارية، وتُحفظ مع التغيير.',
    commentLabel: 'تعليق',
    commentPlaceholder: 'اكتب تعليقًا…',
    markInternal: 'تعليق داخلي',
    internalHint: 'مرئي لفريق الدعم فقط، ويظهر مُعلَّمًا. لا يُخفى.',
    internal: 'داخلي',
    commentChannel: 'القناة',
    channelNone: 'مكتوب هنا',
    send: 'إرسال',
    closedNoComment: 'التذكرة مغلقة. لا يمكن إضافة تعليق، ولا توجد إجراءات.',
    conflictTitle: 'غيّر شخص آخر هذه التذكرة',
    conflictBody: 'تم تحديثها بعد أن فتحتها. أعد التحميل لرؤية الحالة الحالية.',
    reload: 'إعادة التحميل',
    forbidden: 'ليست لديك صلاحية هذا الإجراء على هذه التذكرة.',
    clientBugTitle: 'تعذّر إرسال التغيير',
    clientBugBody:
      'لم يُقبل رقم الإصدار المرسل. هذا خلل في التطبيق وليس خطأ منك — لم يتغيّر شيء، وإعادة المحاولة لن تُجدي. أُبلِغ عنه.',
    emptyTitle: 'لا توجد إدخالات بعد',
    emptyBody: 'أول تعليق أو تغيير على هذه التذكرة سيظهر هنا.',
    errorTitle: 'تعذّر تحميل المسار الزمني',
    errorBody: 'لم نتمكن من الوصول إلى الخادم.',
    retry: 'إعادة المحاولة',
    notFoundTitle: 'التذكرة غير موجودة',
    notFoundBody: 'ربما حُذفت، أو أن الرابط غير صحيح.',
    backToList: 'العودة إلى القائمة',
    loading: 'جارٍ التحميل…',
    createdTicket: 'أنشأ التذكرة',
    changedStatus: (from: string, to: string) =>
      `غيّر الحالة من ${from} إلى ${to}`,
    assignedTo: (name: string) => `عيّن التذكرة إلى ${name}`,
    unassignedEvent: 'ألغى تعيين التذكرة',
    escalatedEvent: 'صعّد التذكرة',
  },
  en: {
    back: 'Back',
    takeAction: 'Take action',
    status: 'Status',
    customer: 'Customer',
    assignee: 'Assignee',
    channel: 'Channel',
    priority: 'Priority',
    category: 'Category',
    created: 'Created',
    updated: 'Updated',
    unassigned: 'Unassigned',
    escalated: 'Escalated',
    escalatedBy: 'This ticket was escalated. Escalation is managed elsewhere.',
    description: 'Description',
    timeline: 'Timeline',
    entries: (n: string) => `${n} entries`,
    loadEarlier: 'Load earlier',
    feedStart: 'Start of the timeline',
    moveTo: (s: string) => `Move to ${s}`,
    assign: 'Assign',
    reassign: 'Reassign',
    unassign: 'Unassign',
    pickAssignee: 'Choose an assignee',
    pickerHint: 'Ordered for the display language, not in the server order.',
    currentAssignee: 'Current assignee:',
    notInList: 'Not in the list — a deactivated account. The name is read from the ticket.',
    selfAssignOnly: 'An agent may only self-assign an unassigned ticket.',
    confirm: 'Confirm',
    cancel: 'Cancel',
    note: 'Note',
    noteRequiredHelp: 'Required when closing from New or Open.',
    noteOptionalHelp: 'Optional, and stored with the change.',
    commentLabel: 'Comment',
    commentPlaceholder: 'Write a comment…',
    markInternal: 'Internal comment',
    internalHint: 'Visible to support staff only, and shown marked. Never hidden.',
    internal: 'Internal',
    commentChannel: 'Channel',
    channelNone: 'Typed here',
    send: 'Send',
    closedNoComment: 'This ticket is closed. No comments, and no actions.',
    conflictTitle: 'Someone else changed this ticket',
    conflictBody: 'It was updated after you opened it. Reload to see where it stands.',
    reload: 'Reload',
    forbidden: 'You are not permitted to do this on this ticket.',
    clientBugTitle: 'The change could not be sent',
    clientBugBody:
      'The version token was not accepted. This is a fault in the application, not something you did — nothing changed, and trying again will not help. It has been reported.',
    emptyTitle: 'Nothing here yet',
    emptyBody: 'The first comment or change on this ticket will appear here.',
    errorTitle: 'The timeline could not be loaded',
    errorBody: 'We could not reach the server.',
    retry: 'Retry',
    notFoundTitle: 'Ticket not found',
    notFoundBody: 'It may have been removed, or the link may be wrong.',
    backToList: 'Back to the list',
    loading: 'Loading…',
    createdTicket: 'created the ticket',
    changedStatus: (from: string, to: string) => `changed the status from ${from} to ${to}`,
    assignedTo: (name: string) => `assigned the ticket to ${name}`,
    unassignedEvent: 'removed the assignee',
    escalatedEvent: 'escalated the ticket',
  },
} as const;

const STATUS_LABEL: Record<Lang, Record<TicketStatus, string>> = {
  ar: {
    New: 'جديدة',
    Open: 'مفتوحة',
    InProgress: 'قيد التنفيذ',
    PendingCustomer: 'بانتظار العميل',
    Resolved: 'تم الحل',
    Closed: 'مغلقة',
  },
  en: {
    New: 'New',
    Open: 'Open',
    InProgress: 'In progress',
    PendingCustomer: 'Pending customer',
    Resolved: 'Resolved',
    Closed: 'Closed',
  },
};

const PRIORITY_LABEL: Record<Lang, Record<TicketPriority, string>> = {
  ar: { Low: 'منخفضة', Normal: 'عادية', High: 'مرتفعة', Critical: 'حرجة' },
  en: { Low: 'Low', Normal: 'Normal', High: 'High', Critical: 'Critical' },
};

const CHANNEL_LABEL: Record<Lang, Record<CommunicationChannel, string>> = {
  ar: {
    Email: 'البريد الإلكتروني',
    WhatsApp: 'واتساب',
    LiveChat: 'محادثة مباشرة',
    Sms: 'رسالة نصية',
    WebForm: 'نموذج الويب',
  },
  en: {
    Email: 'Email',
    WhatsApp: 'WhatsApp',
    LiveChat: 'Live chat',
    Sms: 'SMS',
    WebForm: 'Web form',
  },
};

const CATEGORY_LABEL: Record<Lang, Record<TicketCategory, string>> = {
  ar: { Billing: 'الفوترة', Technical: 'فني', Account: 'الحساب', General: 'عام' },
  en: { Billing: 'Billing', Technical: 'Technical', Account: 'Account', General: 'General' },
};

const ROLE_LABEL: Record<Lang, Record<SupportUserRole, string>> = {
  ar: { Agent: 'وكيل', Manager: 'مدير' },
  en: { Agent: 'Agent', Manager: 'Manager' },
};

const CHANNEL_ICON: Record<CommunicationChannel, (p: { size?: number }) => ReactNode> = {
  Email: IconEmail,
  WhatsApp: IconWhatsapp,
  LiveChat: IconLivechat,
  Sms: IconSms,
  WebForm: IconWebform,
};

/*
 * BR-1's colour map, and it is NOT a second copy of the state machine — it maps
 * a status to an appearance, never a status to what may follow it. The
 * transitions come from `allowedTransitions` on the response and from nowhere
 * else. Keyed on the WIRE value, never on a label: keying on displayed text
 * renders every badge neutral for an Arabic reader and nothing fails.
 *
 * The product's copy of this map is features/tickets/TicketBadges.tsx, which is
 * the file the built screen will use. It is duplicated here rather than
 * imported because TicketBadges calls `useTranslation`, and this preview has no
 * i18n provider — the keys are FE-027's job, not this gate's.
 */
const STATUS_TONE: Record<TicketStatus, 'neutral' | 'info' | 'success' | 'warning'> = {
  New: 'neutral',
  Open: 'info',
  InProgress: 'warning',
  PendingCustomer: 'neutral',
  Resolved: 'success',
  Closed: 'neutral',
};

/* ---------------------------------------------------------------------------
 * Fixtures
 * ------------------------------------------------------------------------- */

/** 200 characters of Arabic, which is the case that decides the header. The
 *  length is PRINTED in the measurement line rather than asserted here. */
const SUBJECT_AR =
  'فاتورة الاشتراك السنوي للحساب المؤسسي خُصمت مرتين خلال نفس الدورة، والعميل يطالب باسترداد المبلغ الزائد فورًا مع تقرير مفصّل يوضّح سبب التكرار وخطوات منع تكراره في الدورات القادمة، ويطلب تأكيدًا خطيًا';

const SUBJECT_EN =
  'The annual subscription invoice on the corporate account was charged twice within a single billing cycle, and the customer wants the surplus refunded immediately together with a written report explaining the duplication';

const DESCRIPTION_AR =
  'خُصم مبلغ الاشتراك مرتين بتاريخ 20/08/2026، بفارق ثلاث دقائق بين العمليتين.\n\nالعميل أرفق كشف الحساب البنكي وطلب الرد خلال يوم عمل واحد. رقم المرجع لدى البنك: 4471-0092.';

const DESCRIPTION_EN =
  'The subscription amount was charged twice on 20/08/2026, three minutes apart.\n\nThe customer attached a bank statement and asked for a reply within one business day. Bank reference: 4471-0092.';

/** The picker's source, in the order `GET /api/support-users` returns it —
 *  `FullName` ascending under the DATABASE collation, which does not follow
 *  `Accept-Language`. Left in that order deliberately so the preview can show
 *  both it and the `Intl.Collator` order side by side. */
const SUPPORT_USERS: SupportUser[] = [
  { id: 'u-01', fullName: 'Layla Al-Harbi', role: 'Manager' },
  { id: 'u-02', fullName: 'Noura Al-Qahtani', role: 'Agent' },
  { id: 'u-03', fullName: 'Omar Khalid', role: 'Agent' },
  { id: 'u-04', fullName: 'Sara Al-Mutairi', role: 'Agent' },
  { id: 'u-05', fullName: 'أحمد الزهراني', role: 'Agent' },
  { id: 'u-06', fullName: 'بدر العتيبي', role: 'Agent' },
  { id: 'u-07', fullName: 'خالد الشمري', role: 'Manager' },
  { id: 'u-08', fullName: 'منيرة الدوسري', role: 'Agent' },
];

/** The signed-in user for this preview — an Agent, which is what makes BR-2's
 *  self-assign affordance visible. */
const ME: SupportUser = { id: 'u-03', fullName: 'Omar Khalid', role: 'Agent' };

const ACTORS: { id: string; fullName: string; role: string | null }[] = [
  { id: 'u-03', fullName: 'عمر خالد', role: 'Agent' },
  { id: 'u-04', fullName: 'سارة المطيري', role: 'Agent' },
  { id: 'u-01', fullName: 'ليلى الحربي', role: 'Manager' },
];

const COMMENT_BODIES = [
  'اتصلت بالعميل وأكّد أن الخصم الثاني ظهر في كشف الحساب.',
  'راجعت سجل المدفوعات: العمليتان تحملان نفس رقم المرجع، وهو ما يرجّح تكرارًا في بوابة الدفع لا في نظامنا.',
  'Escalated to the payments team over email — reference PAY-4471. Awaiting their reply before we promise the customer a date.',
  'أرسلت للعميل إشعارًا بأننا نراجع الطلب، ووعدته بتحديث خلال يوم عمل.',
  'ملاحظة داخلية: هذا ثالث بلاغ من نفس البوابة هذا الأسبوع. يستحق فتح بلاغ مع المزوّد.',
  'العميل اتصل مرة أخرى ويطلب تأكيدًا خطيًا بموعد الاسترداد.',
  'تم استرداد المبلغ الزائد. رقم عملية الاسترداد: RFN-88213.',
  'The provider confirmed a duplicate authorisation on their side. No change needed in our billing records.',
  'أُرسل التقرير المفصّل إلى العميل، ويتضمن سبب التكرار وخطوات منعه.',
  'العميل أكّد استلام المبلغ ولم يعد لديه اعتراض.',
];

const NOTES = [
  'العميل وافق على الانتظار حتى ردّ المزوّد.',
  'Waiting on the payments team.',
  null,
  null,
];

const STATUS_WALK: TicketStatus[] = [
  'Open',
  'InProgress',
  'PendingCustomer',
  'InProgress',
  'Resolved',
  'InProgress',
];

const BASE_MS = Date.parse('2026-08-20T09:14:02.117Z');
const STEP_MS = 37 * 60 * 1000;

/**
 * 100 entries, in the order the wire delivers them: NEWEST FIRST. `013` orders
 * `OccurredAtUtc` descending and `before=<cursor>` fetches the next page of
 * OLDER entries, so index 0 here is the newest thing that happened.
 *
 * The render reverses a prefix of this array. It does not re-sort it: the
 * cursor compares exactly the keys the `ORDER BY` sorts by, and a client that
 * re-sorts has quietly taken over an ordering it cannot see.
 */
/* The server sends EVERY key on every entry, with nulls where they do not apply —
 * measured on a running instance. So the shared type has them required-and-
 * nullable, and this fixture fills the blanks rather than declaring them
 * optional: a preview whose shape is LOOSER than the wire is a preview that
 * renders states the wire cannot produce, which is the opposite of its job.
 */
const entry = (
  e: Partial<TimelineEntry> &
    Pick<TimelineEntry, 'type' | 'id' | 'occurredAtUtc' | 'cursor' | 'actor'>,
): TimelineEntry => ({
  body: null,
  isInternal: null,
  channel: null,
  oldValue: null,
  newValue: null,
  note: null,
  authorKind: null,
  recordedBy: null,
  ...e,
});

const WIRE: TimelineEntry[] = (() => {
  const ascending: TimelineEntry[] = [];

  ascending.push(entry({
    type: 'Created',
    id: 'e-000',
    occurredAtUtc: new Date(BASE_MS).toISOString(),
    actor: { id: 'u-04', fullName: 'سارة المطيري', role: 'Agent' },
    cursor: 'c-000',
  }));

  for (let i = 1; i < 100; i += 1) {
    const actor = ACTORS[i % ACTORS.length]!;
    const at = new Date(BASE_MS + i * STEP_MS).toISOString();
    const id = `e-${String(i).padStart(3, '0')}`;
    const cursor = `c-${String(i).padStart(3, '0')}`;

    /* Roughly two comments per recorded change, which is the shape a real
     * ticket has. The mix matters: a feed of nothing but comments hides how a
     * one-line history row reads between two paragraphs. */
    if (i % 3 === 0) {
      const step = Math.floor(i / 3) % STATUS_WALK.length;
      const from = STATUS_WALK[(step + STATUS_WALK.length - 1) % STATUS_WALK.length]!;
      const to = STATUS_WALK[step]!;
      ascending.push(entry({
        type: 'StatusChanged',
        id,
        occurredAtUtc: at,
        actor,
        cursor,
        oldValue: from,
        newValue: to,
        note: NOTES[i % NOTES.length] ?? null,
      }));
    } else if (i % 17 === 0) {
      ascending.push(entry({
        type: 'Assigned',
        id,
        occurredAtUtc: at,
        actor,
        cursor,
        oldValue: null,
        newValue: 'عمر خالد',
      }));
    } else {
      const body = COMMENT_BODIES[i % COMMENT_BODIES.length]!;
      ascending.push(entry({
        type: 'Comment',
        id,
        occurredAtUtc: at,
        actor,
        cursor,
        body,
        isInternal: i % 10 === 4,
        channel: i % 7 === 0 ? 'Email' : null,
      }));
    }
  }

  return ascending.reverse();
})();

const PAGE_LIMIT = 50; /* `013`'s default. Not a preview number. */

const CUSTOMER = {
  id: 'cus-1',
  fullName: 'منيرة الدوسري',
  email: 'billing@riyadh-trade.example',

  /* The v3 canvas puts the ORGANISATION under the person's name, so the fixture
     had the two the wrong way round: the customer was the company and there was
     no person. The server sends both — measured 2026-09-01. */
  companyName: 'مؤسسة الرياض للتجارة',
};

const BASE_TICKET: TicketResponse = {
  id: '8f1c2d34-5678-4abc-9def-0123456789ab',

  /* `034`'s read half, added 2026-08-31 — and `tsc` is what asked for it here.
   * The design tints three tags, and this preview had drawn none because the
   * field did not exist on the response until the backend lane added it. Three
   * Arabic names from the seeded set, so the preview measures the real width. */
  tags: [
    { id: 't-1', name: 'خصم مزدوج' },
    { id: 't-2', name: 'استرداد' },
    { id: 't-3', name: 'متابعة مالية' },
  ],
  ticketNumber: 'TCK-2026-000042',
  subject: SUBJECT_AR,
  description: DESCRIPTION_AR,
  status: 'InProgress',
  priority: 'High',
  category: 'Billing',
  channel: 'Email',
  customer: CUSTOMER,
  assignedToUserId: 'u-03',
  assignee: { id: 'u-03', fullName: 'عمر خالد', role: 'Agent' },
  isEscalated: false,

  /* Added with the type 2026-09-01. Null at every status but Closed, and the
     preview's ticket is InProgress. */
  closedAtUtc: null,
  /** Nullable, not optional. `009` shipped before `004`, and the field stayed
   *  in the shape so that filling it in was not a breaking change. */
  createdByUserId: null,
  createdAtUtc: '2026-08-20T09:14:02.117Z',
  updatedAtUtc: '2026-08-30T11:02:41.004Z',
  /* Measured off the running server for an `InProgress` ticket. BR-1 row 3. */
  allowedTransitions: ['Open', 'PendingCustomer', 'Resolved'],
  version: 'AAAAAAAAB+c=',
};

/* ---------------------------------------------------------------------------
 * Bits
 * ------------------------------------------------------------------------- */

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('');

function Avatar({ name }: { name: string }) {
  return (
    <span className={styles.avatar} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

function StripItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.stripItem}>
      <span className={styles.stripLabel}>{label}</span>
      <div className={styles.stripValue}>{children}</div>
    </div>
  );
}

function Section({
  title,
  count,
  open,
  onToggle,
  children,
  id,
}: {
  title: string;
  count?: string | undefined;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  id: string;
}) {
  return (
    <section className={styles.section} id={id}>
      <button
        type="button"
        className={styles.sectionHead}
        aria-expanded={open}
        aria-controls={`${id}-body`}
        onClick={onToggle}
      >
        <span>{title}</span>
        {count ? <span className={styles.sectionCount}>{count}</span> : null}
        {/* The chevron ROTATES and does not mirror. A vertical disclosure has
            no direction, so `transform: rotate` is correct in both. */}
        <span className={cx(styles.chev, open && styles.chevOpen)} aria-hidden="true">
          <IconChevronDown size={16} />
        </span>
      </button>
      {open ? (
        <div className={styles.sectionBody} id={`${id}-body`}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * The timeline feed — the part of this preview that is not static
 * ------------------------------------------------------------------------- */

interface FeedMeasurement {
  before: number;
  after: number;
  delta: number;
  corrected: boolean;
}

/**
 * NEWEST AT THE BOTTOM, "load earlier" ABOVE — `027` Q-2, approved 2026-08-30.
 *
 * Which makes the prepend the whole problem. The browser preserves `scrollTop`,
 * not visual position: inserting 50 entries above the viewport leaves
 * `scrollTop` at the number it was, so the content the reader was looking at
 * moves down by the height of everything inserted, and the feed appears to jump
 * to somewhere they never asked for.
 *
 * The correction is to capture `scrollHeight` immediately BEFORE the insert and
 * add the difference to `scrollTop` immediately after, in `useLayoutEffect` —
 * before the browser paints. A `useEffect` runs after paint, so the jump is
 * still visible; it just becomes a flicker instead of a scroll.
 *
 * IT ONLY WORKS BECAUSE THE STYLESHEET SETS `overflow-anchor: none`, and that
 * was measured rather than reasoned. Chrome had already compensated on its own
 * — the same +3929px, the same row left at the same offset — so the correction
 * applied it a SECOND time and threw the feed to the bottom. The full evidence
 * is in the comment on `.feed` in the stylesheet. Removing that one declaration
 * does not stop the correction working in Chrome; it makes it actively worse
 * there while changing nothing in Safari, which is the failure shape that gets
 * a line deleted as redundant.
 *
 * `anchor={false}` turns the correction off. That is the negative control: a
 * guard nobody has seen fail has not been verified, and this one is invisible
 * when it works. With `overflow-anchor: none` in place it now genuinely fails
 * — the jump is real and visible — which it did not before.
 */
function Feed({
  lang,
  anchor,
  onMeasure,
}: {
  lang: Lang;
  anchor: boolean;
  onMeasure: (m: FeedMeasurement) => void;
}) {
  const c = COPY[lang];
  const ref = useRef<HTMLDivElement>(null);
  const pendingBefore = useRef<number | null>(null);
  const [loaded, setLoaded] = useState(Math.min(PAGE_LIMIT, WIRE.length));

  /* The wire is newest-first; the render is oldest-first. Reversing a prefix is
   * the whole transformation — the client never re-sorts. */
  const shown = useMemo(() => WIRE.slice(0, loaded).slice().reverse(), [loaded]);
  const hasMore = loaded < WIRE.length;

  /* Land at the newest entry, which is the one the reader came for. */
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
    /* First paint only. A dependency on `loaded` would re-pin to the bottom on
     * every prepend and hide the very thing this measures. */
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    const before = pendingBefore.current;
    if (!el || before === null) return;
    pendingBefore.current = null;

    const after = el.scrollHeight;
    const delta = after - before;
    if (anchor) el.scrollTop += delta;
    onMeasure({ before, after, delta, corrected: anchor });
  }, [loaded, anchor, onMeasure]);

  const loadEarlier = () => {
    const el = ref.current;
    if (!el) return;
    pendingBefore.current = el.scrollHeight;
    setLoaded((n) => Math.min(n + PAGE_LIMIT, WIRE.length));
  };

  return (
    <div className={styles.feed} ref={ref}>
      <div className={styles.feedTop}>
        {hasMore ? (
          /* NOT a page number, and not an infinite scroller either. `013` pages
             by cursor: the client sends back `nextCursor` and never constructs
             one. A page number here reintroduces the duplicate `013` measured. */
          <button type="button" className={styles.loadEarlier} onClick={loadEarlier}>
            {c.loadEarlier}
          </button>
        ) : (
          <span className={styles.feedStart}>{c.feedStart}</span>
        )}
      </div>

      {shown.map((entry) => (
        <Entry key={entry.id} entry={entry} lang={lang} />
      ))}
    </div>
  );
}

function Entry({ entry, lang }: { entry: TimelineEntry; lang: Lang }) {
  const c = COPY[lang];
  const time = formatDateTime(entry.occurredAtUtc, lang);

  /* The kind comes from `type`. It is NEVER inferred from which fields are
   * null — inference is a rule, and two renderers would eventually disagree
   * about what an entry with a null body and a null oldValue means. */
  if (entry.type === 'Comment' || entry.type === 'CommentAdded') {
    const ChannelIcon = entry.channel ? CHANNEL_ICON[entry.channel] : null;
    return (
      <article className={styles.entry}>
        <Avatar name={entry.actor.fullName} />
        <div className={styles.entryMain}>
          <div className={styles.entryHead}>
            <span className={styles.entryActor}>{entry.actor.fullName}</span>
            {entry.actor.role ? (
              <span className={styles.entryRole}>
                {ROLE_LABEL[lang][entry.actor.role as SupportUserRole] ?? entry.actor.role}
              </span>
            ) : null}
            {entry.isInternal ? (
              /* BR-5.4 — MARKED, never hidden. The server does not filter these
                 and neither does the client. */
              <span className={styles.internalMark}>
                <Badge tone="warning" appearance="outline" label={c.internal} dot={false} />
              </span>
            ) : null}
            {ChannelIcon && entry.channel ? (
              <span className={styles.entryRole}>
                <ChannelIcon size={14} /> {CHANNEL_LABEL[lang][entry.channel]}
              </span>
            ) : null}
            <time className={styles.entryTime} dateTime={entry.occurredAtUtc}>
              {time}
            </time>
          </div>
          {/* `dir="auto"` — AC-8. The BOX stays aligned with the page; only the
              paragraph's internal direction follows its first strong character,
              so a Latin comment in an Arabic thread starts on the same edge as
              its neighbours instead of jumping to the other side. */}
          <p className={styles.entryBody} dir="auto">
            {entry.body}
          </p>
        </div>
      </article>
    );
  }

  const describe = () => {
    switch (entry.type) {
      case 'Created':
        return c.createdTicket;
      case 'StatusChanged':
        return c.changedStatus(
          STATUS_LABEL[lang][entry.oldValue as TicketStatus] ?? entry.oldValue ?? '',
          STATUS_LABEL[lang][entry.newValue as TicketStatus] ?? entry.newValue ?? '',
        );
      case 'Assigned':
        return c.assignedTo(entry.newValue ?? '');
      case 'Unassigned':
        return c.unassignedEvent;
      case 'Escalated':
        return c.escalatedEvent;
      default:
        return '';
    }
  };

  return (
    <div className={styles.history}>
      <span className={styles.entryActor}>{entry.actor.fullName}</span>
      <span>{describe()}</span>
      <time className={styles.entryTime} dateTime={entry.occurredAtUtc}>
        {time}
      </time>
      {entry.note ? (
        <span className={styles.historyNote} dir="auto">
          {entry.note}
        </span>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * The screen
 * ------------------------------------------------------------------------- */

type Variant =
  | 'default'
  | 'closed'
  | 'unassigned'
  | 'loading'
  | 'empty'
  | 'error'
  | 'forbidden'
  | 'conflict'
  | 'clientBug'
  | 'notFound'
  | 'picker'
  | 'deactivated'
  | 'confirmClose';

const VARIANT_LABEL: Record<Variant, string> = {
  default: 'loaded — InProgress, assigned, 100 timeline entries, 200-char subject',
  closed: 'Closed — allowedTransitions is [], so NO action control and NO composer (AC-2)',
  unassigned: 'New and unassigned — assignee is null and the KEY IS PRESENT',
  loading: 'loading — skeleton per region',
  empty: 'empty — a ticket with no timeline entries; the composer stays',
  error: 'error — the timeline failed, the ticket did not. Only that region degrades',
  forbidden: '403 — inline, beside the control it refused. Not a toast',
  conflict: '409 concurrency-conflict — refetch and say so. NEVER retried (AC-4)',
  clientBug: '400 on expectedVersion — a client bug, not a user error (AC-5)',
  notFound: '404 — the whole page',
  picker: 'assignee picker — bare array, Intl.Collator order, BR-2 affordance',
  deactivated:
    'assignee picker, current assignee ABSENT from the list — deactivated account',
  confirmClose: 'Close confirm — the note is REQUIRED from New or Open (BR-1.2)',
};

function ticketFor(variant: Variant, lang: Lang): TicketResponse {
  const base: TicketResponse = {
    ...BASE_TICKET,
    subject: lang === 'ar' ? SUBJECT_AR : SUBJECT_EN,
    description: lang === 'ar' ? DESCRIPTION_AR : DESCRIPTION_EN,
    customer: {
      ...CUSTOMER,
      fullName: lang === 'ar' ? CUSTOMER.fullName : 'Riyadh Trading Est.',
    },
  };

  switch (variant) {
    case 'closed':
      return {
        ...base,
        status: 'Closed',
        /* The empty array is the case AC-2 insists on asserting directly. */
        allowedTransitions: [],
        assignee: { id: 'u-03', fullName: 'عمر خالد', role: 'Agent' },
      };
    case 'unassigned':
    case 'confirmClose':
      return {
        ...base,
        status: 'New',
        assignedToUserId: null,
        assignee: null,
        allowedTransitions: ['Open', 'Closed'],
      };
    case 'deactivated':
      return {
        ...base,
        assignedToUserId: 'u-99',
        /* A user deactivated AFTER assignment keeps their tickets and leaves
         * the picker. The name is read from HERE and never looked up in the
         * list, where it yields nothing and reads as missing data. */
        assignee: { id: 'u-99', fullName: 'منيرة العنزي', role: 'Agent' },
      };
    default:
      return base;
  }
}

/* Rebuilt on `029`'s shared `Skeleton` 2026-08-31.
 *
 * This drew its own shimmer from `.skeleton` in the module CSS. The class is gone:
 * moving that CSS beside the page it styles made it a SHIPPED component, and
 * `029` AC-12's guard — which scans by location rather than by a list somebody
 * maintains — went red on the same run. `029` established one waiting vocabulary,
 * and a second animation is not a duplicate of the first but a second answer to
 * "is this still loading": different duration, different easing, two skeletons on
 * one screen pulsing out of step. */
function LoadingPreview() {
  return (
    <>
      <Skeleton shape="text" width="60%" />
      <Skeleton shape="text" width="85%" />
      {[0, 1, 2, 3].map((i) => (
        <div className={styles.skelRow} key={i}>
          <Skeleton shape="avatar" />
          <div style={{ flex: 1 }}>
            <Skeleton shape="text" width="30%" />
            <Skeleton shape="text" />
          </div>
        </div>
      ))}
    </>
  );
}

/** The assignee picker. The list is `GET /api/support-users` — a bare array. */
function AssigneePicker({
  lang,
  ticket,
  onClose,
}: {
  lang: Lang;
  ticket: TicketResponse;
  onClose: () => void;
}) {
  const c = COPY[lang];
  const [query, setQuery] = useState('');

  /*
   * SORTED WITH `Intl.Collator`, NOT LEFT IN THE SERVER'S ORDER.
   *
   * `011` returns `FullName` ascending under the DATABASE collation, which does
   * not follow `Accept-Language`. A mixed Arabic/English list therefore looks
   * ordered in English and arbitrary in Arabic — nothing errors, and an Arabic
   * reader concludes the list is unsorted.
   */
  const collator = useMemo(() => new Intl.Collator(lang, { sensitivity: 'base' }), [lang]);
  const users = useMemo(
    () =>
      SUPPORT_USERS.filter((u) =>
        u.fullName.toLowerCase().includes(query.trim().toLowerCase()),
      )
        .slice()
        .sort((a, b) => collator.compare(a.fullName, b.fullName)),
    [collator, query],
  );

  /* BR-2, MIRRORED FOR AFFORDANCE ONLY. The server decides, and AC-7 says so:
   * a Manager assigns anyone, an Agent may only self-assign an unassigned
   * ticket. Disabling the rest here saves a round trip; it does not enforce
   * anything, and the endpoint carries no role policy because `ManagerOnly`
   * there would refuse every legitimate Agent. */
  const canAssign = (u: SupportUser) =>
    ME.role === 'Manager' || (ticket.assignee === null && u.id === ME.id);

  /* Read from the TICKET. Never `SUPPORT_USERS.find(u => u.id === ...)`. */
  const current = ticket.assignee;
  const currentInList = current
    ? SUPPORT_USERS.some((u) => u.id === current.id)
    : true;

  return (
    <div className={styles.dialogScrim}>
      <div className={styles.dialogCard} role="dialog" aria-modal="true">
        <h3 className={styles.dialogTitle}>{c.pickAssignee}</h3>
        <p className={styles.dialogBody}>{c.pickerHint}</p>

        <div className={styles.dialogField}>
          <Input label={c.pickAssignee} labelHidden value={query} onChange={setQuery} />
        </div>

        <div className={styles.pickerList}>
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              className={styles.pickerItem}
              disabled={!canAssign(u)}
            >
              <Avatar name={u.fullName} />
              <span dir="auto">{u.fullName}</span>
              <span className={styles.pickerRole}>{ROLE_LABEL[lang][u.role]}</span>
            </button>
          ))}
        </div>

        {ME.role !== 'Manager' ? (
          <p className={styles.pickerCurrent}>{c.selfAssignOnly}</p>
        ) : null}

        {current ? (
          <p className={styles.pickerCurrent}>
            <span>{c.currentAssignee}</span>
            <strong dir="auto">{current.fullName}</strong>
            {/* No leading separator. `· {text}` put the interpunct at the start
                of the rtl line, where it reads as a stray bullet rather than as
                a join. The flex wrap already separates the two clauses. */}
            {!currentInList ? <span>{c.notInList}</span> : null}
          </p>
        ) : null}

        <div className={styles.dialogActions}>
          <Button buttonType="secondary-outline" text={c.cancel} onClick={onClose} />
          <Button text={c.confirm} onClick={onClose} />
        </div>
      </div>
    </div>
  );
}

/** The status confirm. `note` is `012`'s field, required when closing from
 *  `New` or `Open` and accepted on any transition. */
function StatusConfirm({
  lang,
  to,
  requireNote,
  onClose,
}: {
  lang: Lang;
  to: TicketStatus;
  requireNote: boolean;
  onClose: () => void;
}) {
  const c = COPY[lang];
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const missing = requireNote && touched && note.trim().length === 0;

  return (
    <div className={styles.dialogScrim}>
      <div className={styles.dialogCard} role="dialog" aria-modal="true">
        <h3 className={styles.dialogTitle}>{c.moveTo(STATUS_LABEL[lang][to])}</h3>

        <div className={styles.dialogField}>
          <Textarea
            label={c.note}
            value={note}
            onChange={setNote}
            onBlur={() => setTouched(true)}
            required={requireNote}
            rows={3}
            maxLength={500}
            counterFrom={400}
            helperText={requireNote ? c.noteRequiredHelp : c.noteOptionalHelp}
            {...(missing ? { error: c.noteRequiredHelp } : {})}
          />
        </div>

        <div className={styles.dialogActions}>
          <Button buttonType="secondary-outline" text={c.cancel} onClick={onClose} />
          <Button
            text={c.confirm}
            disabled={requireNote && note.trim().length === 0}
            onClick={onClose}
          />
        </div>
      </div>
    </div>
  );
}

function Screen({
  lang,
  variant,
  width,
  anchor,
  onMeasure,
}: {
  lang: Lang;
  variant: Variant;
  width: number;
  anchor: boolean;
  onMeasure: (m: FeedMeasurement) => void;
}) {
  const c = COPY[lang];
  const ticket = ticketFor(variant, lang);
  const [menuOpen, setMenuOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(true);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [comment, setComment] = useState('');
  const [internal, setInternal] = useState(false);
  const [commentChannel, setCommentChannel] = useState('');
  const [dialog, setDialog] = useState<null | 'picker' | 'close'>(
    variant === 'picker' || variant === 'deactivated'
      ? 'picker'
      : variant === 'confirmClose'
        ? 'close'
        : null,
  );

  const isClosed = ticket.status === 'Closed';
  /* An EMPTY array renders no control at all. Assignment is bundled into the
   * same menu, which is only safe because `Closed` is terminal for assignment
   * too — a reassign on a closed ticket is a `409`. */
  const hasActions = ticket.allowedTransitions.length > 0;
  const ChannelIcon = CHANNEL_ICON[ticket.channel];

  if (variant === 'notFound') {
    return (
      <div className={styles.screen} style={{ inlineSize: width }}>
        <div className={styles.empty}>
          <h3 className={styles.emptyTitle}>{c.notFoundTitle}</h3>
          <p className={styles.emptyBody}>{c.notFoundBody}</p>
          <div className={styles.emptyAction}>
            <Button buttonType="secondary-outline" text={c.backToList} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.screen} style={{ inlineSize: width }}>
      <header className={styles.topBar}>
        <Button buttonType="secondary-outline" text={c.back} />
        {/* `bdi` and `dir="ltr"`. A ticket number is an identifier: never
            localized, never digit-shaped by the locale, and never reordered by
            the surrounding paragraph's direction. */}
        <bdi className={styles.ticketNo} dir="ltr">
          {ticket.ticketNumber}
        </bdi>
        <Badge
          tone={STATUS_TONE[ticket.status]}
          label={STATUS_LABEL[lang][ticket.status]}
        />

        <div className={cx(styles.topActions, styles.topSpacer)}>
          {hasActions ? (
            <div className={styles.menuWrap}>
              {/* A MENU, not inline buttons — `027` Q-3. Controls that appear
                  and disappear per state read as a broken toolbar. */}
              <Button
                text={c.takeAction}
                iconEnd={<IconChevronDown size={16} />}
                onClick={() => setMenuOpen((o) => !o)}
              />
              {menuOpen ? (
                <div className={styles.menu} role="menu">
                  {/* RENDERED FROM `allowedTransitions`. BR-1 lives in
                      Wasl.Domain once; a second copy here is correct until the
                      map changes and then wrong where nobody looks. */}
                  {ticket.allowedTransitions.map((to) => (
                    <button
                      key={to}
                      type="button"
                      role="menuitem"
                      className={styles.menuItem}
                      onClick={() => {
                        setMenuOpen(false);
                        setDialog('close');
                      }}
                    >
                      {c.moveTo(STATUS_LABEL[lang][to])}
                    </button>
                  ))}
                  <hr className={styles.menuSep} />
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.menuItem}
                    onClick={() => {
                      setMenuOpen(false);
                      setDialog('picker');
                    }}
                  >
                    <IconAssign size={16} />
                    {ticket.assignee ? c.reassign : c.assign}
                  </button>
                  {ticket.assignee ? (
                    <button type="button" role="menuitem" className={styles.menuItem}>
                      {c.unassign}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      {/* 700, NOT 900. The first threshold was 900, which stacked the rail at
          the 880 frame — the one frame the review exists to look at — so the
          two-column layout the design document specifies was never rendered
          once. A breakpoint that skips the case under review is worse than no
          breakpoint. At 880 the content column gets 880 − 240 − 24 − 48 = 568px,
          and whether 568px is enough IS the question. */}
      <div className={cx(styles.layout, width < 700 && styles.layoutNarrow)}>
        <aside className={styles.rail}>
          <div className={styles.railBlock}>
            <span className={styles.railLabel}>{c.priority}</span>
            <span className={styles.railValue}>{PRIORITY_LABEL[lang][ticket.priority]}</span>
          </div>

          {ticket.isEscalated ? (
            <div className={cx(styles.railBlock, styles.escalated)}>
              <span className={styles.escalatedHead}>
                <IconEscalate size={16} />
                {c.escalated}
              </span>
              {/* READ-ONLY. Escalation is `016`; the flag is on this response. */}
              <p className={styles.escalatedBody}>{c.escalatedBy}</p>
            </div>
          ) : null}

          <nav className={styles.anchors}>
            <button
              type="button"
              className={cx(styles.anchor, styles.anchorActive)}
              onClick={() => setDescOpen(true)}
            >
              {c.description}
            </button>
            <button
              type="button"
              className={styles.anchor}
              onClick={() => setTimelineOpen(true)}
            >
              {c.timeline}
            </button>
          </nav>
        </aside>

        <div className={styles.main}>
          {variant === 'conflict' ? (
            /* AC-4. Refetch and say what happened. NEVER retried: the second
               write would apply to a state the reader never saw. */
            <div className={styles.banner}>
              <strong>{c.conflictTitle}</strong>
              <span>{c.conflictBody}</span>
              <span className={styles.bannerAction}>
                <Button buttonType="secondary-outline" text={c.reload} />
              </span>
            </div>
          ) : null}

          <h2 className={styles.subject} dir="auto">
            {ticket.subject}
          </h2>

          <div className={styles.strip}>
            <StripItem label={c.status}>
              <Badge
                tone={STATUS_TONE[ticket.status]}
                label={STATUS_LABEL[lang][ticket.status]}
              />
            </StripItem>
            <StripItem label={c.customer}>
              <span dir="auto">{ticket.customer.fullName}</span>
            </StripItem>
            <StripItem label={c.assignee}>
              {ticket.assignee ? (
                <span dir="auto">{ticket.assignee.fullName}</span>
              ) : (
                <span className={styles.stripMuted}>{c.unassigned}</span>
              )}
            </StripItem>
            <StripItem label={c.channel}>
              <ChannelIcon size={14} /> {CHANNEL_LABEL[lang][ticket.channel]}
            </StripItem>
            <StripItem label={c.category}>{CATEGORY_LABEL[lang][ticket.category]}</StripItem>
            <StripItem label={c.priority}>{PRIORITY_LABEL[lang][ticket.priority]}</StripItem>
            <StripItem label={c.created}>{formatDateTime(ticket.createdAtUtc, lang)}</StripItem>
            <StripItem label={c.updated}>{formatDateTime(ticket.updatedAtUtc, lang)}</StripItem>
          </div>

          {variant === 'forbidden' ? (
            <p className={styles.denial}>{c.forbidden}</p>
          ) : null}
          {variant === 'clientBug' ? (
            <div className={styles.clientBug}>
              <strong>{c.clientBugTitle}</strong>
              <p style={{ margin: 0 }}>{c.clientBugBody}</p>
            </div>
          ) : null}

          <Section
            id={`desc-${variant}`}
            title={c.description}
            open={descOpen}
            onToggle={() => setDescOpen((o) => !o)}
          >
            {variant === 'loading' ? (
              <LoadingPreview />
            ) : (
              /* `dir="auto"` and the line breaks preserved. */
              <p className={styles.description} dir="auto">
                {ticket.description}
              </p>
            )}
          </Section>

          <Section
            id={`timeline-${variant}`}
            title={c.timeline}
            count={
              variant === 'default' || variant === 'picker' || variant === 'deactivated'
                ? c.entries(formatNumber(WIRE.length, lang))
                : undefined
            }
            open={timelineOpen}
            onToggle={() => setTimelineOpen((o) => !o)}
          >
            {variant === 'loading' ? <LoadingPreview /> : null}

            {variant === 'empty' ? (
              <div className={styles.empty}>
                <h3 className={styles.emptyTitle}>{c.emptyTitle}</h3>
                <p className={styles.emptyBody}>{c.emptyBody}</p>
              </div>
            ) : null}

            {variant === 'error' ? (
              /* Only this region degrades. The ticket loaded. */
              <div className={styles.empty}>
                <h3 className={styles.emptyTitle}>{c.errorTitle}</h3>
                <p className={styles.emptyBody}>{c.errorBody}</p>
                <div className={styles.emptyAction}>
                  <Button buttonType="secondary-outline" text={c.retry} />
                </div>
              </div>
            ) : null}

            {variant !== 'loading' && variant !== 'empty' && variant !== 'error' ? (
              <Feed lang={lang} anchor={anchor} onMeasure={onMeasure} />
            ) : null}

            {isClosed ? (
              /* HIDDEN ENTIRELY, not disabled. A disabled composer invites a
                 reader to work out why; an absent one says the thread is over,
                 and the sentence beside it says which. */
              <p className={styles.composerHidden}>{c.closedNoComment}</p>
            ) : (
              <div className={styles.composer}>
                <Textarea
                  label={c.commentLabel}
                  labelHidden
                  value={comment}
                  onChange={setComment}
                  placeholder={c.commentPlaceholder}
                  rows={3}
                  maxLength={4000}
                  counterFrom={3800}
                />
                <div className={styles.composerControls}>
                  <Checkbox
                    label={c.markInternal}
                    checked={internal}
                    onChange={setInternal}
                    helperText={c.internalHint}
                  />
                  <Dropdown
                    label={c.commentChannel}
                    labelHidden
                    value={commentChannel || null}
                    onChange={(value) => setCommentChannel(value ?? '')}
                    placeholder={c.channelNone}
                    size="sm"
                    options={(
                      ['Email', 'WhatsApp', 'LiveChat', 'Sms', 'WebForm'] as CommunicationChannel[]
                    ).map((ch) => ({ value: ch, label: CHANNEL_LABEL[lang][ch] }))}
                  />
                  <span className={styles.composerSend}>
                    <Button
                      text={c.send}
                      iconStart={<IconComment size={16} />}
                      disabled={comment.trim().length === 0}
                    />
                  </span>
                </div>
              </div>
            )}
          </Section>
        </div>
      </div>

      {/* Sticky, so a hundred entries never force a scroll back up to act. */}
      <div className={styles.stickyBar}>
        <Button buttonType="secondary-outline" text={c.back} />
        {hasActions ? (
          <span className={styles.stickyEnd}>
            <Button text={c.takeAction} iconEnd={<IconChevronDown size={16} />} />
          </span>
        ) : null}
      </div>

      {dialog === 'picker' ? (
        <AssigneePicker lang={lang} ticket={ticket} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === 'close' ? (
        <StatusConfirm
          lang={lang}
          to="Closed"
          /* BR-1.2 — required from `New` or `Open`, and this variant is `New`. */
          requireNote={ticket.status === 'New' || ticket.status === 'Open'}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Root
 * ------------------------------------------------------------------------- */

/* 1280 − 288 sidebar − 2×56 content padding. Previewing at 1280 full-bleed
 * would measure 400px that do not exist. */
const FRAME: Record<'shell-1280' | 'shell-1440', { width: number; label: string }> = {
  'shell-1280': { width: 880, label: '880px — what a 1280 viewport actually leaves' },
  'shell-1440': { width: 1152, label: '1152px — --content-width, the 1440 frame' },
};

/** One `bdi` per name, each prefixed with its index. See the call site. */
function Names({ names }: { names: readonly string[] }) {
  return (
    <>
      {names.map((n, i) => (
        <span key={n} className={styles.sample}>
          {i + 1}. <bdi>{n}</bdi>
        </span>
      ))}
    </>
  );
}

const VARIANTS: Variant[] = [
  'closed',
  'unassigned',
  'loading',
  'empty',
  'error',
  'forbidden',
  'conflict',
  'clientBug',
  'notFound',
  'picker',
  'deactivated',
  'confirmClose',
];

export default function TicketDetailPreview() {
  const [lang, setLang] = useState<Lang>('ar');
  const [anchor, setAnchor] = useState(true);
  const [measure, setMeasure] = useState<FeedMeasurement | null>(null);

  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  /* The real product writes these in index.html before first paint. Here they
   * are a toggle, because the point is to compare. */
  useEffect(() => {
    const root = document.documentElement;
    const prevDir = root.dir;
    const prevLang = root.lang;
    root.dir = dir;
    root.lang = lang;
    return () => {
      root.dir = prevDir;
      root.lang = prevLang;
    };
  }, [dir, lang]);

  const collator = useMemo(() => new Intl.Collator(lang, { sensitivity: 'base' }), [lang]);
  const collated = useMemo(
    () =>
      SUPPORT_USERS.slice()
        .sort((a, b) => collator.compare(a.fullName, b.fullName))
        .map((u) => u.fullName),
    [collator],
  );

  return (
    <div className={styles.page} dir={dir} lang={lang}>
      <header className={styles.pageHead}>
        <h1 className={styles.pageTitle}>
          {lang === 'ar' ? 'تفاصيل التذكرة' : 'Ticket detail'}
        </h1>
        <div className={styles.controls}>
          <button
            type="button"
            className={cx(styles.toggle, lang === 'ar' && styles.toggleOn)}
            onClick={() => setLang('ar')}
          >
            العربية
          </button>
          <button
            type="button"
            className={cx(styles.toggle, lang === 'en' && styles.toggleOn)}
            onClick={() => setLang('en')}
          >
            English
          </button>
          <button
            type="button"
            className={cx(styles.toggle, !anchor && styles.toggleDanger)}
            onClick={() => setAnchor((a) => !a)}
          >
            scroll anchoring: {anchor ? 'on' : 'OFF — the negative control'}
          </button>
        </div>
      </header>

      {/* THE MEASUREMENT, printed rather than claimed. Every number on this
          line is read off the render or off a string in this file. */}
      <p className={styles.note} dir="ltr">
        subject: {SUBJECT_AR.length} chars (ar) · {SUBJECT_EN.length} chars (en) ·
        timeline: {WIRE.length} entries, page limit {PAGE_LIMIT} (013 default) ·
        comments {WIRE.filter((e) => e.type === 'Comment').length} · history{' '}
        {WIRE.length - WIRE.filter((e) => e.type === 'Comment').length} · internal{' '}
        {WIRE.filter((e) => e.isInternal).length} · Latin bodies in an Arabic thread{' '}
        {WIRE.filter((e) => e.body && /^[A-Za-z]/.test(e.body)).length}
        <br />
        {/* NUMBERED, AND ONE `bdi` PER NAME — not one `bdi` around the joined
            string. The first attempt joined all eight names into a single
            `bdi`; that run is mostly Arabic, so `bdi` resolved it rtl and the
            whole list rendered reversed INSIDE an ltr paragraph. The two
            orderings then looked identical on screen while being genuinely
            different, which is the worst kind of measurement: one that is
            believed. The indices are what make the difference readable at all. */}
        support-users, DATABASE order (011, `FullName` asc under the SQL
        collation): <Names names={SUPPORT_USERS.map((u) => u.fullName)} />
        <br />
        support-users, Intl.Collator(&quot;{lang}&quot;): <Names names={collated} />
        <br />
        {measure ? (
          <>
            last prepend: scrollHeight {measure.before} → {measure.after} (+{measure.delta}
            ) · scrollTop {measure.corrected ? `corrected by +${measure.delta}` : 'NOT corrected — this is the jump'}
          </>
        ) : (
          <>last prepend: none yet — press &quot;load earlier&quot; in the feed below</>
        )}
      </p>

      <div className={styles.frame}>
        <p className={styles.frameLabel}>
          {FRAME['shell-1280'].label} · {VARIANT_LABEL.default}
        </p>
        <Screen
          lang={lang}
          variant="default"
          width={FRAME['shell-1280'].width}
          anchor={anchor}
          onMeasure={setMeasure}
        />
      </div>

      <div className={styles.frame}>
        <p className={styles.frameLabel}>
          {FRAME['shell-1440'].label} · {VARIANT_LABEL.default}
        </p>
        <Screen
          lang={lang}
          variant="default"
          width={FRAME['shell-1440'].width}
          anchor={anchor}
          onMeasure={setMeasure}
        />
      </div>

      {VARIANTS.map((v) => (
        <div className={styles.frame} key={v}>
          <p className={styles.frameLabel}>{VARIANT_LABEL[v]}</p>
          <Screen
            lang={lang}
            variant={v}
            width={FRAME['shell-1280'].width}
            anchor={anchor}
            onMeasure={setMeasure}
          />
        </div>
      ))}
    </div>
  );
}
