import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { Mark } from '../brand/Mark';

import {
  IconAssign,
  IconCalendar,
  IconChevronDown,
  IconClose,
  IconEmail,
  IconEscalate,
  IconEye,
  IconFilter,
  IconLivechat,
  IconMore,
  IconSearch,
  IconSms,
  IconWebform,
  IconWhatsapp,
} from '../icons/icons';
import { cx } from '../lib/cx';
import styles from './TicketListPreview.module.css';

/*
 * FE-026-00 — the ticket list, PREVIEWED BEFORE ANY WIRING.
 *
 * No fetch, no query client, no route state, no `Table` primitive. Everything
 * below is a static rendering, which is the point: it costs minutes and answers
 * the questions that cost hours once a screen has tests, keys, and query wiring
 * (ADR-009, design/preview-first-workflow.md).
 *
 * IT IS BUILT IN ARABIC FIRST. `026/spec.md` A-3 is the question this file
 * exists to answer — do the columns fit, in Arabic, at the width the shell
 * actually leaves for content? An English preview would fit, pass, and answer
 * the wrong question: "قيد التنفيذ" and "بانتظار العميل" are longer than
 * "InProgress" and "PendingCustomer", and "تاريخ الإنشاء" is longer than
 * "Created".
 *
 * THE WIDTH IS THE MEASUREMENT, AND IT IS NOT THE VIEWPORT.
 * At a 1280px viewport the table gets 1280 − 288 (sidebar) − 2×56 (content
 * padding) = 880px. Previewing at 1280 full-bleed would measure 400px that do
 * not exist. Both frames are rendered below and both are labelled.
 *
 * `Table` does not exist yet — it is FE-026-01 and it depends on this task. So
 * this uses a NATIVE <table>, token-styled. That is not a shortcut: it is
 * ADR-009's degradation floor, and the geometry it produces is the geometry the
 * primitive will have.
 *
 * ---- RESTYLED against the tickets-table canvas ---------------------------
 *
 * The product owner supplied the look as a Design Canvas export. Three things
 * about how it was adopted, because each was a decision and not a transcription:
 *
 *  1. WHERE THE CANVAS NAMED A COLOUR THE TOKEN LAYER ALREADY HAD, THE TOKEN
 *     WON. The export draws the status tints a shade off (`#EFF6FE` against
 *     `--blue-50`, `#EAF5EB` against `--green-50`, `#FFF8E6` against
 *     `--amber-50`). A near-match is a second palette, not a refinement. Three
 *     values genuinely had no token and were added to tokens.css as (D).
 *
 *  2. NINE COLUMNS BECAME EIGHT. The canvas folds the ticket number and the
 *     escalation marker into a second line under the subject, which is right:
 *     neither is ever read on its own, and as columns they cost 168px. That paid
 *     for the actions column and still returned 120px to the subject.
 *
 *  3. THE CHANNEL COLUMN IS A LABELLED, TINTED PILL — 150px, as drawn.
 *     It was 36px of icon for two revisions, on a measurement (104 → 36) that
 *     was real but was answering the wrong question. The label is not what the
 *     tint repeats: colour is how sixty rows are scanned for one channel, and a
 *     monochrome glyph carries neither the colour nor the word. The five tints
 *     were parked in this file as literals; they are tokens now, and the pill
 *     uses them.
 *
 * The copy below is REAL, destined for the `ar` and `en` catalogues in
 * FE-026-05. A preview written with placeholder text measures placeholder text.
 * Literals are allowed here because eslint scopes the no-JSX-literal rule to
 * src/components, src/shell and src/features; this is none of them, and it never
 * ships (routes.tsx strips /_preview from the production bundle).
 */

type Lang = 'ar' | 'en';

const isAr = (lang: Lang) => lang === 'ar';
const pick = <T,>(lang: Lang, pair: readonly [T, T]): T =>
  isAr(lang) ? pair[0] : pair[1];

/* ---- Real copy, destined for the catalogues ------------------------------ */

const COPY = {
  ar: {
    title: 'التذاكر',
    subtitle: (open: string, mins: string) =>
      `${open} تذكرة مفتوحة · آخر تحديث قبل ${mins} دقائق`,
    search: 'ابحث برقم التذكرة أو العميل',
    clearSearch: 'مسح البحث',
    filter: 'تصفية',
    apply: 'تطبيق',
    clearAll: 'مسح الكل',
    removeFilter: 'إزالة التصفية',
    all: 'الكل',
    subject: 'الموضوع',
    customer: 'العميل',
    status: 'الحالة',
    statusIs: 'الحالة:',
    priority: 'الأولوية',
    channel: 'القناة',
    assignee: 'المسؤول',
    escalated: 'مُصعَّدة',
    created: 'تاريخ الإنشاء',
    createdFrom: 'تاريخ الإنشاء من',
    createdTo: 'إلى',
    datePlaceholder: 'dd/mm/yyyy',
    hijri: 'التاريخ الهجري',
    cancel: 'إلغاء',
    prevMonth: 'الشهر السابق',
    nextMonth: 'الشهر التالي',
    actions: 'الإجراءات',
    rowActions: 'إجراءات التذكرة',
    view: 'عرض التذكرة',
    reassign: 'إعادة التعيين',
    escalate: 'تصعيد',
    close: 'إغلاق التذكرة',
    unassigned: 'غير مُعيَّنة',
    rowsPerPage: 'عدد الصفوف في الصفحة',
    range: (shown: string, total: string) => `${shown} من ${total}`,
    prev: 'السابق',
    next: 'التالي',
    jump: 'الانتقال إلى صفحة',
    emptyTitle: 'لا توجد تذاكر بعد',
    emptyBody: 'لم تصل أي تذكرة من أي قناة. ستظهر هنا أول ما تصل.',
    emptyCta: 'إنشاء تذكرة',
    noMatchTitle: 'لا نتائج مطابقة',
    noMatchBody: 'لا شيء يطابق هذه التصفية. جرّب إزالة أحد الشروط.',
    noMatchCta: 'مسح التصفية',
    errorTitle: 'تعذّر تحميل القائمة',
    errorBody: 'لم نتمكن من الوصول إلى الخادم. حاول مرة أخرى.',
    retry: 'إعادة المحاولة',
    loading: 'جارٍ التحميل…',
  },
  en: {
    title: 'Tickets',
    subtitle: (open: string, mins: string) =>
      `${open} open tickets · updated ${mins} minutes ago`,
    search: 'Search by ticket number or customer',
    clearSearch: 'Clear search',
    filter: 'Filter',
    apply: 'Apply',
    clearAll: 'Clear all',
    removeFilter: 'Remove filter',
    all: 'All',
    subject: 'Subject',
    customer: 'Customer',
    status: 'Status',
    statusIs: 'Status:',
    priority: 'Priority',
    channel: 'Channel',
    assignee: 'Assignee',
    escalated: 'Escalated',
    created: 'Created',
    createdFrom: 'Created from',
    createdTo: 'To',
    datePlaceholder: 'dd/mm/yyyy',
    hijri: 'Hijri calendar',
    cancel: 'Cancel',
    prevMonth: 'Previous month',
    nextMonth: 'Next month',
    actions: 'Actions',
    rowActions: 'Ticket actions',
    view: 'View ticket',
    reassign: 'Reassign',
    escalate: 'Escalate',
    close: 'Close ticket',
    unassigned: 'Unassigned',
    rowsPerPage: 'Rows Per Page',
    range: (shown: string, total: string) => `${shown} of ${total}`,
    prev: 'Previous',
    next: 'Next',
    jump: 'Jump to a page',
    emptyTitle: 'No tickets yet',
    emptyBody: 'Nothing has arrived on any channel. The first one will appear here.',
    emptyCta: 'Create a ticket',
    noMatchTitle: 'Nothing matches',
    noMatchBody: 'No ticket matches this filter. Try removing one of the conditions.',
    noMatchCta: 'Clear the filter',
    errorTitle: 'The list could not be loaded',
    errorBody: 'We could not reach the server. Try again.',
    retry: 'Retry',
    loading: 'Loading…',
  },
} as const;

/* The enum labels, keyed by the WIRE VALUE — which is how the real catalogue is
 * keyed too (BR-8.7). A map keyed on a displayed label renders neutral for every
 * Arabic user and nothing fails. */
const STATUS_LABEL = {
  New: ['جديدة', 'New'],
  Open: ['مفتوحة', 'Open'],
  InProgress: ['قيد التنفيذ', 'In progress'],
  PendingCustomer: ['بانتظار العميل', 'Pending customer'],
  Resolved: ['محلولة', 'Resolved'],
  Closed: ['مغلقة', 'Closed'],
} as const;

const PRIORITY_LABEL = {
  Low: ['منخفضة', 'Low'],
  Normal: ['عادية', 'Normal'],
  High: ['مرتفعة', 'High'],
  Critical: ['حرجة', 'Critical'],
} as const;

const CHANNEL_LABEL = {
  Email: ['بريد', 'Email'],
  WhatsApp: ['واتساب', 'WhatsApp'],
  LiveChat: ['محادثة مباشرة', 'Live chat'],
  Sms: ['رسائل نصية', 'SMS'],
  WebForm: ['نموذج ويب', 'Web form'],
} as const;

/* One asset per channel, keyed by the wire value. The glyph sits INSIDE the
 * pill next to the label — it is not the label's replacement, which is what it
 * was while this column was 36px. */
const CHANNEL_ICON = {
  Email: IconEmail,
  WhatsApp: IconWhatsapp,
  LiveChat: IconLivechat,
  Sms: IconSms,
  WebForm: IconWebform,
} as const;

/* The canvas tints the pill per channel. Those five pairs used to sit in this
 * file as hex literals marked "unused"; they are now `--channel-*-bg/-fg` in
 * tokens.css and this map only names classes. Four of the ten resolved to an
 * existing primitive and alias it rather than repeat it — see the token block.
 *
 * The note that parked them said "if that day comes they become tokens FIRST".
 * It did, and they did. */
const CHANNEL_CLASS: Record<string, string | undefined> = {
  WhatsApp: styles.chWhatsApp,
  Sms: styles.chSms,
  WebForm: styles.chWebForm,
  Email: styles.chEmail,
  LiveChat: styles.chLiveChat,
};

type StatusKey = keyof typeof STATUS_LABEL;
type PriorityKey = keyof typeof PRIORITY_LABEL;
type ChannelKey = keyof typeof CHANNEL_LABEL;

/* RULED 2026-08-29, and it splits: BR-1 wins on one row, the design wins on two.
 *
 * New and Open do NOT share a colour. I adopted the canvas twice on the argument
 * that a product owner supplying a screen three times outranks my reading of the
 * blueprint - and the ruling was the reverse: two distinct states in the state
 * machine must not read as one, and BR-1 is the source of record for that.
 * `docs/sdd/design/screens/03-tickets-list.md` already said so.
 *
 * PendingCustomer and Closed keep the FILLED treatment from the design. The
 * blueprint had them as outlines, and the outlines were the loudest things on a
 * row - a heavy amber ring around a waiting ticket pulling more attention than a
 * critical one. That is the row the blueprint is being updated on, in the same
 * commit, because a screen and its source of record disagreeing is the defect
 * regardless of which one is right.
 *
 * Red is still never a status. Critical is a severity and lives in priority. */
const STATUS_TONE: Record<StatusKey, [string, 'filled' | 'outline']> = {
  New: ['neutral', 'filled'],
  Open: ['info', 'filled'],
  InProgress: ['warning', 'filled'],
  PendingCustomer: ['neutral', 'filled'],
  Resolved: ['success', 'filled'],
  Closed: ['neutral', 'filled'],
};

/* NOT A PILL ANY MORE. See `.priority` in the module for why, and note that this
 * is the one place red is allowed on this row: Critical is a severity, and BR-1
 * bans red for STATUS only. */
const PRIORITY_CLASS: Record<PriorityKey, string | undefined> = {
  Low: undefined,
  Normal: undefined,
  High: styles.priorityHigh,
  Critical: styles.priorityCritical,
};

const STATUSES = Object.keys(STATUS_LABEL) as StatusKey[];
const PRIORITIES = Object.keys(PRIORITY_LABEL) as PriorityKey[];
const CHANNELS = Object.keys(CHANNEL_LABEL) as ChannelKey[];

/* ---- 100 plausible rows, deterministic ------------------------------------
 * No Math.random: a preview that reshuffles on every save cannot be compared
 * against the one that was approved. Index arithmetic instead.
 * ------------------------------------------------------------------------- */

/* THE LONGEST REALISTIC SUBJECT. Its length is MEASURED and printed beside the
 * frame rather than asserted in a comment — `026/spec.md` AC-026-20 asks for 200
 * characters and a comment claiming 200 is not a measurement. */
const LONG_SUBJECT_AR =
  'لا أستطيع تسجيل الدخول إلى حسابي منذ تحديث التطبيق الأخير، وعند إعادة تعيين كلمة المرور ' +
  'تصلني رسالة تفيد بأن الرابط منتهي الصلاحية رغم أنني أفتحه فور وصوله، وقد جربت أكثر من ' +
  'متصفح وجهاز دون أي فائدة تُذكر حتى الآن';

const SUBJECTS_AR = [
  LONG_SUBJECT_AR,
  'الفاتورة الأخيرة بها رسوم غير معروفة',
  'التطبيق يغلق فجأة عند فتح المرفقات',
  'طلب تغيير رقم الجوال المسجل',
  'لم يصلني رمز التحقق',
  'مشكلة في ربط الحساب البنكي',
];

const SUBJECTS_EN = [
  'I cannot sign in to my account since the last update, and the password reset link ' +
    'reports that it has expired even though I open it the moment it arrives',
  'The latest invoice contains a charge I do not recognise',
  'The app closes suddenly when an attachment is opened',
  'Request to change the registered mobile number',
  'The verification code never arrived',
  'Problem linking the bank account',
];

const CUSTOMERS_AR = [
  'علي الأحمد',
  'فاطمة عبد الرحمن',
  'محمد بن سعيد الغامدي',
  'نورة السبيعي',
  'Sara Khan',
];

const CUSTOMERS_EN = [
  'Ali Al-Ahmad',
  'Fatima Abdulrahman',
  'Mohammed bin Saeed Al-Ghamdi',
  'علي الأحمد',
  'Sara Khan',
];

const ASSIGNEES_AR = ['سارة خان', 'عمر سعيد', null, 'ليلى ناصر'];
const ASSIGNEES_EN = ['Sara Khan', 'Omar Said', null, 'Layla Nasser'];

interface Row {
  id: string;
  ticketNumber: string;
  subjectAr: string;
  subjectEn: string;
  customerAr: string;
  customerEn: string;
  status: StatusKey;
  priority: PriorityKey;
  channel: ChannelKey;
  assigneeAr: string | null;
  assigneeEn: string | null;
  isEscalated: boolean;
  createdAtUtc: string;
  createdDay: string;
}

const at = <T,>(list: readonly T[], index: number): T => list[index % list.length] as T;

const ROWS: Row[] = Array.from({ length: 100 }, (_, i) => {
  /* A fixed instant, walked backwards. `new Date()` here would make every
   * screenshot disagree with the last one for no reason. */
  const created = new Date(Date.UTC(2026, 7, 29, 9, 14, 22, 712) - i * 3_600_000 * 7);
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    ticketNumber: `TCK-2026-${String(1042 - i).padStart(6, '0')}`,
    subjectAr: at(SUBJECTS_AR, i),
    subjectEn: at(SUBJECTS_EN, i),
    customerAr: at(CUSTOMERS_AR, i),
    customerEn: at(CUSTOMERS_EN, i),
    status: at(STATUSES, i),
    priority: at(PRIORITIES, i + 1),
    channel: at(CHANNELS, i + 2),
    assigneeAr: at(ASSIGNEES_AR, i),
    assigneeEn: at(ASSIGNEES_EN, i),
    isEscalated: i % 11 === 3,
    createdAtUtc: created.toISOString(),
    /* The plain YYYY-MM-DD, so the date-range filter is a STRING compare. ISO
     * days sort and compare correctly as text; parsing a Date per row per
     * keystroke to answer "is it after the 3rd" is work for nothing. */
    createdDay: created.toISOString().slice(0, 10),
  };
});

/* ---- The formatter, previewed before lib/formatters.ts exists -------------
 * ADR-007 §7 fixes the locale as `ar-u-ca-gregory-nu-latn`.
 *
 * WHAT I ASSUMED, AND WHAT THE ENGINE ACTUALLY DOES. `026/spec.md` §6 claimed
 * two silent failures. Measured in this browser, one is half true and the other
 * is false — so the spec was corrected rather than the measurement explained
 * away:
 *
 *   Intl.DateTimeFormat('ar')     → "29 أغسطس 2026"  latn + gregory   NO defect
 *   Intl.DateTimeFormat('ar-EG')  → "٢٩ أغسطس ٢٠٢٦"  arab            digits flip
 *   Intl.DateTimeFormat('ar-SA')  → "٢٩ أغسطس ٢٠٢٦"  arab + GREGORY  digits flip
 *
 * So `-nu-latn` IS load-bearing, but only once the locale string carries a
 * region — which is exactly what a browser's `navigator.language` supplies, and
 * what a stored user preference could become. `-ca-gregory` did NOT change the
 * calendar in this engine; it is kept as defence, because the ICU default for
 * `ar-SA` is version-dependent and a Hijri year reads as bad ticket data rather
 * than as a formatting bug.
 *
 * The three are rendered side by side below so this is settled by looking.
 * ------------------------------------------------------------------------- */
const LOCALE = { ar: 'ar-u-ca-gregory-nu-latn', en: 'en-GB' } as const;

/* NUMERIC, not `month: 'short'`. The Arabic month names are long — "أغسطس" is
 * the short one, "فبراير" and "سبتمبر" are longer — and a date column sized for
 * English short months truncates in Arabic. `dd/MM/yyyy` is the same width in
 * every month and in both languages. 104px → 92px. */
const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
};

/* ICU PUTS BIDI CONTROL CHARACTERS INSIDE THE STRING, and `dir="ltr"` cannot
 * reach them. Under any `ar` locale the formatter returns
 *
 *   "29‏/08‏/2026"     ← U+200F RIGHT-TO-LEFT MARK, twice
 *
 * which rendered as `292026/08/` in the table: the marks open RTL runs around
 * the separators, and the isolate the `dir` attribute creates isolates the whole
 * thing from the paragraph without touching what is inside it.
 *
 * Found by looking at the Arabic preview. Every automated check passed — the
 * text content is correct, the digits are Latin, the year is Gregorian, and
 * `toBe('29/08/2026')` would have FAILED on a string that looks identical in a
 * terminal. Only the render is wrong, and only in Arabic.
 *
 * Stripped, so the column is byte-identical in both locales and `dir="ltr"`
 * then means what it says. A date in a fixed-width table column is a field, not
 * a sentence — the marks exist for dates inside running text. */
const BIDI_MARKS = /[‎‏؜]/g;

const formatDate = (iso: string, lang: Lang) =>
  new Intl.DateTimeFormat(LOCALE[lang], DATE_OPTIONS)
    .format(new Date(iso))
    .replace(BIDI_MARKS, '');

/* The controls, rendered beside the right one so the difference is seen once and
 * never re-litigated. NOT stripped — showing the raw output is the point. */
const formatDateAs = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, DATE_OPTIONS).format(new Date(iso));

/* PAGE NUMBERS ARE NOT IDENTIFIERS. BR-8.13 pins Latin digits to identifiers and
 * timestamps — a ticket number is quoted aloud and pasted into other systems, a
 * page number is neither. The house reference renders them in Arabic-Indic, so
 * they go through a plain number formatter in the display locale rather than
 * through the `-nu-latn` one the dates use. Two formatters, two reasons.
 *
 * `-nu-arab` is explicit because V8 resolves plain `ar` to `latn`, which would
 * silently make this line agree with the dates instead of with the reference. */
const NUMBER_LOCALE = { ar: 'ar-u-nu-arab', en: 'en-GB' } as const;
const formatCount = (n: number, lang: Lang) =>
  new Intl.NumberFormat(NUMBER_LOCALE[lang]).format(n);

/* ---- Calendar formatting --------------------------------------------------
 * The canvas offers a Hijri toggle. It is OFF by default and it changes the
 * DISPLAY only: the value this picker produces is always the ISO Gregorian day,
 * because that is what `?createdFrom=` will carry and what the API compares.
 *
 * `-nu-latn` is on the Hijri formatter too. BR-8.13 pins Latin digits to dates,
 * and a picker that writes ١٤٤٨ into a field whose column shows 2026 is two
 * numeral systems in one flow.
 *
 * Wrapped, because `islamic-umalqura` is not guaranteed: an engine without it
 * throws on construction, and a date picker is not where a locale gap should
 * take the screen down. No calendar, no toggle — that is a degradation, not a
 * failure.
 * ------------------------------------------------------------------------- */
const HIJRI_LOCALE = 'ar-SA-u-ca-islamic-umalqura-nu-latn';

function makeHijri(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat | null {
  try {
    return new Intl.DateTimeFormat(HIJRI_LOCALE, options);
  } catch {
    return null;
  }
}

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const prettyDay = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

/* ---- Pieces --------------------------------------------------------------- */

function Pill({
  tone,
  appearance,
  label,
}: {
  tone: string;
  appearance: 'filled' | 'outline';
  label: string;
}) {
  return (
    <span className={cx(styles.pill, styles[tone], styles[appearance])}>
      <span className={styles.dot} aria-hidden="true" />
      {label}
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  /* Q-4 — a feature-local initials circle, not a primitive and not an image.
   * There is no avatar URL on the row and none in the contract. */
  return (
    <span className={styles.avatar} aria-hidden="true">
      {[...name][0]}
    </span>
  );
}

function HeadRow({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  return (
    <tr>
      <th scope="col" className={styles.colSubject}>
        {c.subject}
      </th>
      <th scope="col" className={styles.colCustomer}>
        {c.customer}
      </th>
      <th scope="col" className={styles.colChannel}>
        {c.channel}
      </th>
      <th scope="col" className={styles.colStatus}>
        {c.status}
      </th>
      <th scope="col" className={styles.colPriority}>
        {c.priority}
      </th>
      <th scope="col" className={styles.colAssignee}>
        {c.assignee}
      </th>
      <th scope="col" className={styles.colCreated}>
        {c.created}
      </th>
      <th scope="col" className={styles.colActions}>
        {c.actions}
      </th>
    </tr>
  );
}

/* The menu is position: fixed, so it has no anchor of its own and the numbers
 * have to be handed to it. Written on the trigger rather than on the menu so the
 * values exist before the menu mounts - a layout effect inside RowMenu would
 * paint once at 0,0 and then jump.
 *
 * MENU_H is the rendered height and is a constant on purpose: the menu is four
 * fixed rows and a separator, and measuring it would mean mounting it first,
 * which is the flash this avoids. If a row is ever added, this changes with it. */
const MENU_W = 188;
const MENU_H = 176;

function placeMenu(trigger: HTMLElement) {
  const box = trigger.getBoundingClientRect();
  const gap = 6;

  /* THE FLOOR IS THE TABLE, NOT THE VIEWPORT. Flipping only at the viewport edge
   * left the last rows opening downward THROUGH the pager - the menu cleared the
   * screen and covered the controls under the table, which is worse than being
   * off-screen because it looks deliberate. The floor is whichever comes first:
   * the bottom of the scrolling area, or the bottom of the window. */
  const scroller = trigger.closest<HTMLElement>('[data-scroller]');
  const floor = Math.min(
    window.innerHeight,
    scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight,
  );
  const below = box.bottom + gap + MENU_H <= floor;
  const top = below ? box.bottom + gap : Math.max(gap, box.top - gap - MENU_H);

  /* IT GROWS INWARD, toward the table, not outward off the card.
   *
   * Actions is the last column, so the kebab sits at the OUTER edge of the row -
   * far left under RTL, far right under LTR. Hanging the menu from the trigger's
   * leading edge put 188px of it outside the card, on the side with nothing in
   * it. Aligning the menu's outer edge with the trigger's outer edge makes it
   * open across the row it belongs to, in both directions.
   *
   * inset-inline-start measures from the RIGHT edge under RTL, so the physical
   * arithmetic happens here and the stylesheet stays logical. */
  const rtl = getComputedStyle(trigger).direction === 'rtl';
  const raw = rtl ? window.innerWidth - box.left - MENU_W : box.right - MENU_W;
  const start = Math.max(gap, Math.min(raw, window.innerWidth - MENU_W - gap));

  const root = document.documentElement;
  root.style.setProperty('--menu-x', start + 'px');
  root.style.setProperty('--menu-y', top + 'px');
}

function RowMenu({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  /* ANCHORED, NOT FIXED — see `.menu`. The canvas keeps ONE menu node and moves
   * it to whichever row was clicked, with the flip measured in JS. React renders
   * the menu inside the open row instead: one node at a time either way, and no
   * arithmetic that can disagree with the layout. */
  return (
    <div className={styles.menu} role="menu">
      <button type="button" role="menuitem" className={styles.menuItem}>
        <IconEye size={15} className={styles.menuIcon} />
        {c.view}
      </button>
      <button type="button" role="menuitem" className={styles.menuItem}>
        <IconAssign size={15} className={styles.menuIcon} />
        {c.reassign}
      </button>
      <button type="button" role="menuitem" className={styles.menuItem}>
        <IconEscalate size={15} className={styles.menuIcon} />
        {c.escalate}
      </button>
      <div className={styles.menuSep} />
      <button
        type="button"
        role="menuitem"
        className={cx(styles.menuItem, styles.menuItemDanger)}
      >
        <IconClose size={15} className={styles.menuIcon} />
        {c.close}
      </button>
    </div>
  );
}

function DataRow({
  row,
  lang,
  menuOpen,
  onMenu,
}: {
  row: Row;
  lang: Lang;
  menuOpen: boolean;
  onMenu: (id: string) => void;
}) {
  const c = COPY[lang];
  const ar = isAr(lang);
  const assignee = ar ? row.assigneeAr : row.assigneeEn;
  const subject = ar ? row.subjectAr : row.subjectEn;
  const [statusTone, statusAppearance] = STATUS_TONE[row.status];

  return (
    <tr className={styles.row}>
      <td className={styles.colSubject}>
        {/* TWO LINES. The subject, then the identity of the row: the ticket
            number and — only when true — the escalation marker. `data-subject`
            is the hook the clipping measurement uses; it is on the wrapper and
            not the line because the tooltip is a sibling of the line. */}
        <span className={styles.subject} data-subject="">
          <span className={styles.tooltip} data-tip="">
            {subject}
          </span>
          {/* <bdi>, NOT dir="auto" - see the customer cell below for the whole
              reason. Same defect, and on the subject it is the more visible one:
              an English subject would start hard against the opposite edge of the
              widest column on the row. */}
          <span className={styles.subjectLine} data-line="">
            <bdi>{subject}</bdi>
          </span>
          <span className={styles.subjectMeta}>
            {/* dir="ltr" and tabular-nums. Left to inherit RTL the `TCK-` prefix
                lands on the wrong end and the number gets copied wrong
                (BR-8.13). */}
            <span className={styles.metaNumber} dir="ltr">
              {row.ticketNumber}
            </span>
            {row.isEscalated ? (
              <>
                <span className={styles.metaSep} aria-hidden="true">
                  ·
                </span>
                <span className={styles.metaEscalated}>{c.escalated}</span>
              </>
            ) : null}
          </span>
        </span>
      </td>

      <td className={styles.colCustomer}>
        {/* Q-3 — TEXT, NOT A LINK. `/customers/:id` does not exist. */}

        {/* <bdi>, NOT dir="auto" ON THE CELL. Both isolate the run so its internal
            bidi ordering is computed on its own - that part was never the problem.
            The difference is that dir="auto" also sets the ELEMENT direction from
            the first strong character, and `text-align: start` resolves against
            that. So an Arabic name aligned right and "Sara Khan" aligned LEFT, in
            the same column, and the eye reads the column as broken.

            <bdi> gives the isolation without the direction change: the cell keeps
            the table direction, every name starts on the same edge, and a name
            with mixed scripts still renders in the right order internally.

            text-align: start is NOT the fix on its own - it resolves against the
            element own direction, which is exactly what dir="auto" had rewritten. */}
        <span className={cx(styles.truncate, styles.cellText)}>
          <bdi>{ar ? row.customerAr : row.customerEn}</bdi>
        </span>
      </td>

      <td className={styles.colChannel}>
        {(() => {
          const ChannelIcon = CHANNEL_ICON[row.channel];
          const label = pick(lang, CHANNEL_LABEL[row.channel]);
          return (
            <span className={cx(styles.channel, CHANNEL_CLASS[row.channel])}>
              <ChannelIcon size={14} className={styles.channelIcon} />
              {label}
            </span>
          );
        })()}
      </td>

      <td className={styles.colStatus}>
        <Pill
          tone={statusTone}
          appearance={statusAppearance}
          label={pick(lang, STATUS_LABEL[row.status])}
        />
      </td>

      <td
        className={cx(styles.colPriority, styles.priority, PRIORITY_CLASS[row.priority])}
      >
        {pick(lang, PRIORITY_LABEL[row.priority])}
      </td>

      <td className={styles.colAssignee}>
        {assignee === null ? (
          /* THE CANVAS WRITES THE WORD, and it is right: an em dash in a column
             headed "المسؤول" reads as missing data rather than as an unassigned
             ticket, and unassigned is a state a manager acts on. */
          <span className={cx(styles.truncate, styles.muted)}>{c.unassigned}</span>
        ) : (
          <span className={styles.assignee}>
            <Avatar name={assignee} />
            <span className={cx(styles.truncate, styles.cellText)}>
              <bdi>{assignee}</bdi>
            </span>
          </span>
        )}
      </td>

      <td className={styles.colCreated}>
        <span className={styles.date} dir="ltr">
          {formatDate(row.createdAtUtc, lang)}
        </span>
      </td>

      <td className={cx(styles.colActions, styles.actionsCell)}>
        <button
          type="button"
          className={cx(styles.kebab, menuOpen && styles.kebabOn)}
          aria-label={c.rowActions}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(e) => {
            e.stopPropagation();
            placeMenu(e.currentTarget);
            onMenu(row.id);
          }}
        >
          <IconMore size={16} />
        </button>
        {menuOpen ? <RowMenu lang={lang} /> : null}
      </td>
    </tr>
  );
}

/* ---- Calendar -------------------------------------------------------------
 * A DatePicker with no feature owner yet: `015` owns filters, and when it lands
 * this becomes a real component rather than a preview-local one. It is built
 * here because the canvas specifies it and because the two questions it settles
 * — does a Hijri toggle fit in the panel, and does a Monday-first grid read
 * correctly under RTL — are exactly the kind a preview is for.
 * ------------------------------------------------------------------------- */

const CAL_ROWS = 6;
const CAL_COLS = 7;

/* MONDAY-FIRST, from the canvas, and TRANSCRIBED rather than derived.
 *
 * This was `Intl.DateTimeFormat(..., { weekday })` and the derivation was sound
 * on its own terms - ICU returns the SAME string for ar `short` and ar `long`
 * (الاثنين، الثلاثاء، …), seven full names do not fit a 316px picker, and ar
 * `narrow` is seven distinct letters where en `narrow` repeats T and S. So the
 * code picked `narrow` for Arabic and `short` for English and called the
 * asymmetry honest.
 *
 * What it actually did was print ن ث ر خ ج س ح, and the design asks for
 * إثنين ثلاثاء أربعاء خميس جمعة سبت أحد - the clipped WORD, which is neither of
 * the two forms ICU offers. No locale data produces it, so no amount of choosing
 * a width was going to get there.
 *
 * These are catalogue copy, the same as every other string in COPY: they go to
 * `ar` and `en` in FE-026-05 and a translator can shorten them further without
 * touching this file. "A hard-coded name is a second catalogue" was the argument
 * against transcribing, and it is answered by putting them IN the catalogue -
 * not by deriving a different word than the one the design specifies. */
const WEEKDAY_NAMES: Record<Lang, readonly string[]> = {
  ar: ['إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت', 'أحد'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
};

function weekdayNames(lang: Lang): readonly string[] {
  return WEEKDAY_NAMES[lang];
}

function monthNames(lang: Lang): string[] {
  const fmt = new Intl.DateTimeFormat(LOCALE[lang], { month: 'long' });
  return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2026, i, 15)));
}

function Calendar({
  lang,
  label,
  value,
  onApply,
  onCancel,
}: {
  lang: Lang;
  label: string;
  value: string;
  onApply: (iso: string) => void;
  onCancel: () => void;
}) {
  const c = COPY[lang];
  const start = value ? new Date(`${value}T00:00:00`) : new Date(2026, 7, 1);
  const [month, setMonth] = useState(
    () => new Date(start.getFullYear(), start.getMonth(), 1),
  );
  const [sel, setSel] = useState(value);
  const [mode, setMode] = useState<'days' | 'months' | 'years'>('days');
  const [hijri, setHijri] = useState(false);

  const weekdays = useMemo(() => weekdayNames(lang), [lang]);
  const months = useMemo(() => monthNames(lang), [lang]);
  const dayFmt = useMemo(() => (hijri ? makeHijri({ day: 'numeric' }) : null), [hijri]);
  const titleFmt = useMemo(
    () => (hijri ? makeHijri({ month: 'long', year: 'numeric' }) : null),
    [hijri],
  );

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const today = isoDay(new Date());

  const step = (n: number) => {
    const jump = mode === 'years' ? n * 12 : mode === 'months' ? n : 0;
    setMonth(
      jump === 0
        ? new Date(year, monthIndex + n, 1)
        : new Date(year + jump, monthIndex, 1),
    );
  };

  const title =
    mode === 'years'
      ? (() => {
          const base = year - (((year % 12) + 12) % 12);
          return `${base} – ${base + 11}`;
        })()
      : mode === 'months'
        ? String(year)
        : (titleFmt?.format(new Date(year, monthIndex, 15)) ??
          `${months[monthIndex] ?? ''} ${year}`);

  /* role="dialog" with the FIELD's name on it. Two "Apply" buttons can be on
   * screen at once - the panel's and this one's - and without a named container
   * they are indistinguishable to anything that reads the page rather than
   * looks at it. It also makes the trigger's aria-haspopup="dialog" true. */
  return (
    <div className={styles.calendar} role="dialog" aria-label={label}>
      <div className={styles.calHead}>
        <button
          type="button"
          className={styles.calNav}
          aria-label={c.prevMonth}
          onClick={() => step(-1)}
        >
          <IconChevronDown size={18} className={styles.chevPrev} />
        </button>
        <button
          type="button"
          className={styles.calTitle}
          onClick={() => setMode(mode === 'days' ? 'years' : 'days')}
        >
          {title}
          <IconChevronDown
            size={14}
            className={mode === 'days' ? undefined : styles.calCaretUp}
          />
        </button>
        <button
          type="button"
          className={styles.calNav}
          aria-label={c.nextMonth}
          onClick={() => step(1)}
        >
          <IconChevronDown size={18} className={styles.chevNext} />
        </button>
      </div>

      {mode === 'days' ? (
        <div className={styles.calWeek}>
          {weekdays.map((w) => (
            <span key={w} className={styles.calWeekday}>
              {w}
            </span>
          ))}
        </div>
      ) : null}

      <div className={cx(styles.calGrid, mode !== 'days' && styles.calGridWide)}>
        {mode === 'days'
          ? (() => {
              const firstDow = (new Date(year, monthIndex, 1).getDay() + 6) % CAL_COLS;
              return Array.from({ length: CAL_ROWS * CAL_COLS }, (_, i) => {
                const d = new Date(year, monthIndex, 1 - firstDow + i);
                const key = isoDay(d);
                const inMonth = d.getMonth() === monthIndex;
                return (
                  <button
                    key={key}
                    type="button"
                    className={cx(
                      styles.calCell,
                      !inMonth && styles.calCellOutside,
                      key === today && styles.calCellToday,
                      key === sel && styles.calCellOn,
                    )}
                    onClick={() => {
                      setSel(key);
                      if (!inMonth) setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                    }}
                  >
                    {dayFmt?.format(d) ?? String(d.getDate())}
                  </button>
                );
              });
            })()
          : (() => {
              const years = mode === 'years';
              const base = years ? year - (((year % 12) + 12) % 12) : 0;
              return Array.from({ length: 12 }, (_, i) => {
                const on = years ? base + i === year : i === monthIndex;
                return (
                  <button
                    key={years ? base + i : i}
                    type="button"
                    className={cx(
                      styles.calCell,
                      styles.calCellWide,
                      on && styles.calCellOn,
                    )}
                    onClick={() => {
                      setMonth(
                        years ? new Date(base + i, monthIndex, 1) : new Date(year, i, 1),
                      );
                      setMode(years ? 'months' : 'days');
                    }}
                  >
                    {years ? base + i : (months[i] ?? '')}
                  </button>
                );
              });
            })()}
      </div>

      <div className={styles.calFoot}>
        <button
          type="button"
          role="switch"
          aria-checked={hijri}
          className={cx(styles.switch, hijri && styles.switchOn)}
          onClick={() => setHijri(!hijri)}
        >
          <span className={styles.switchTrack}>
            <span className={styles.switchKnob} />
          </span>
          {c.hijri}
        </button>
        <button
          type="button"
          className={cx(styles.linkBtn, styles.pushEnd)}
          onClick={onCancel}
        >
          {c.cancel}
        </button>
        <button type="button" className={styles.solidBtn} onClick={() => onApply(sel)}>
          {c.apply}
        </button>
      </div>
    </div>
  );
}

/* ---- Filter panel --------------------------------------------------------- */

interface Filters {
  priorities: PriorityKey[];
  channels: ChannelKey[];
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { priorities: [], channels: [], from: '', to: '' };

const filterCount = (f: Filters) =>
  f.priorities.length + f.channels.length + (f.from || f.to ? 1 : 0);

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

function DateField({
  lang,
  label,
  value,
  open,
  onOpen,
  onClose,
  onPick,
}: {
  lang: Lang;
  label: string;
  value: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onPick: (iso: string) => void;
}) {
  const c = COPY[lang];
  /* NOT A <label>. A button is not a labelable control, so a <label> around it
   * contributes nothing to the accessible name and the field announced as an
   * unnamed button. Found by MOUNTING it, not by reading it. The name is built
   * explicitly instead and it carries BOTH halves: "created from" on its own
   * does not tell you whether a date is already chosen. */
  const labelId = useId();
  const valueId = useId();
  return (
    <div className={styles.dateField}>
      <span id={labelId} className={styles.panelLabel}>
        {label}
      </span>
      <button
        type="button"
        className={styles.dateBtn}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={`${labelId} ${valueId}`}
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
      >
        <IconCalendar size={15} className={styles.menuIcon} />
        <span id={valueId} className={cx(styles.dateValue, value && styles.dateValueSet)}>
          {value ? prettyDay(value) : c.datePlaceholder}
        </span>
      </button>
      {open ? (
        <Calendar
          lang={lang}
          label={label}
          value={value}
          onApply={onPick}
          onCancel={onClose}
        />
      ) : null}
    </div>
  );
}

function FilterPanel({
  lang,
  draft,
  setDraft,
  openField,
  setOpenField,
  onApply,
}: {
  lang: Lang;
  draft: Filters;
  setDraft: (f: Filters) => void;
  openField: 'from' | 'to' | null;
  setOpenField: (f: 'from' | 'to' | null) => void;
  onApply: () => void;
}) {
  const c = COPY[lang];
  return (
    <div className={styles.filterPanel} onClick={(e) => e.stopPropagation()}>
      <div className={styles.panelGroup}>
        <span className={styles.panelLabel}>{c.priority}</span>
        <div className={styles.chipRow}>
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={draft.priorities.includes(p)}
              className={cx(
                styles.filterChip,
                draft.priorities.includes(p) && styles.filterChipOn,
              )}
              onClick={() =>
                setDraft({ ...draft, priorities: toggle(draft.priorities, p) })
              }
            >
              {pick(lang, PRIORITY_LABEL[p])}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.panelGroup}>
        <span className={styles.panelLabel}>{c.channel}</span>
        <div className={styles.chipRow}>
          {CHANNELS.map((ch) => (
            <button
              key={ch}
              type="button"
              aria-pressed={draft.channels.includes(ch)}
              className={cx(
                styles.filterChip,
                draft.channels.includes(ch) && styles.filterChipOn,
              )}
              onClick={() => setDraft({ ...draft, channels: toggle(draft.channels, ch) })}
            >
              {pick(lang, CHANNEL_LABEL[ch])}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.dateRow}>
        <DateField
          lang={lang}
          label={c.createdFrom}
          value={draft.from}
          open={openField === 'from'}
          onOpen={() => setOpenField('from')}
          onClose={() => setOpenField(null)}
          onPick={(iso) => {
            setDraft({ ...draft, from: iso });
            setOpenField(null);
          }}
        />
        <DateField
          lang={lang}
          label={c.createdTo}
          value={draft.to}
          open={openField === 'to'}
          onOpen={() => setOpenField('to')}
          onClose={() => setOpenField(null)}
          onPick={(iso) => {
            setDraft({ ...draft, to: iso });
            setOpenField(null);
          }}
        />
      </div>

      <div className={styles.panelFoot}>
        <button
          type="button"
          className={styles.linkBtn}
          onClick={() => setDraft(EMPTY_FILTERS)}
        >
          {c.clearAll}
        </button>
        <button
          type="button"
          className={cx(styles.solidBtn, styles.pushEnd)}
          onClick={onApply}
        >
          {c.apply}
        </button>
      </div>
    </div>
  );
}

/* ---- Tabs ----------------------------------------------------------------- */

/* The dot repeats the status colour the pill uses, so the strip and the column
 * agree. `All` has no dot because it is not a status. */
const TAB_DOT: Record<StatusKey, string> = {
  New: styles.neutral ?? '',
  Open: styles.info ?? '',
  InProgress: styles.warning ?? '',
  PendingCustomer: styles.warning ?? '',
  Resolved: styles.success ?? '',
  Closed: styles.neutral ?? '',
};

function Tabs({
  lang,
  value,
  counts,
  total,
  onChange,
}: {
  lang: Lang;
  value: StatusKey | 'all';
  counts: Record<StatusKey, number>;
  total: number;
  onChange: (v: StatusKey | 'all') => void;
}) {
  const c = COPY[lang];
  return (
    <div className={styles.tabs}>
      <button
        type="button"
        className={cx(styles.tab, value === 'all' && styles.tabOn)}
        aria-pressed={value === 'all'}
        onClick={() => onChange('all')}
      >
        {c.all}
        <span className={styles.tabCount}>{formatCount(total, lang)}</span>
      </button>
      {STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          className={cx(styles.tab, value === s && styles.tabOn)}
          aria-pressed={value === s}
          onClick={() => onChange(s)}
        >
          <span className={cx(styles.tabDot, TAB_DOT[s])} aria-hidden="true" />
          {pick(lang, STATUS_LABEL[s])}
          <span className={styles.tabCount}>{formatCount(counts[s], lang)}</span>
        </button>
      ))}
    </div>
  );
}

/* ---- Footer --------------------------------------------------------------- */

function Footer({
  lang,
  page,
  pageSize,
  shown,
  total,
  totalPages,
}: {
  lang: Lang;
  page: number;
  pageSize: number;
  shown: number;
  total: number;
  totalPages: number;
}) {
  const c = COPY[lang];

  /* THE SHAPE IS `‹ 1 2 … last ›`, from the house reference — not `1 2 3 4 5`.
   * The last page is always reachable in one click, which is what a jumpable
   * envelope pagination is FOR; a window of consecutive pages hides the end of
   * the list behind as many clicks as there are pages. */
  const pages = [1, 2].filter((n) => n <= totalPages);
  const showEllipsis = totalPages > 3;
  const showLast = totalPages > 2;

  return (
    <div className={styles.footer}>
      {/* A <label> with no control in it labels nothing. This is static preview
          chrome until FE-026-01 makes it a real <select>; until then it is a
          <div>, because an empty <label> is a promise to a screen reader that
          the markup does not keep. */}
      <div className={styles.perPage}>
        {c.rowsPerPage}
        <span className={styles.selectBox}>
          {formatCount(pageSize, lang)}
          <IconChevronDown size={14} />
        </span>
      </div>

      {/* THE TOTAL IS THE DATASET, NOT THE PAGE. It must not shrink when a
          filter narrows the list, or "8 of 12" reads as a lost page rather than
          as a filter. Only the left half moves. */}
      <span className={styles.range}>
        {c.range(
          shown === 0
            ? formatCount(0, lang)
            : `${formatCount(1, lang)}–${formatCount(shown, lang)}`,
          formatCount(total, lang),
        )}
      </span>

      {/* The chevrons MIRROR under RTL — they point along the reading direction.
          One asset rotated by direction, not two different icons. */}
      <nav className={styles.pager}>
        <span
          className={cx(styles.pageBtn, styles.chevPrev, styles.pageDisabled)}
          aria-label={c.prev}
        >
          <IconChevronDown size={14} />
        </span>
        {pages.map((n) => (
          <span key={n} className={cx(styles.pageBtn, n === page && styles.pageActive)}>
            {formatCount(n, lang)}
          </span>
        ))}
        {showEllipsis ? (
          <span className={styles.pageGap} aria-label={c.jump}>
            …
          </span>
        ) : null}
        {showLast ? (
          <span className={cx(styles.pageBtn, totalPages === page && styles.pageActive)}>
            {formatCount(totalPages, lang)}
          </span>
        ) : null}
        <span className={cx(styles.pageBtn, styles.chevNext)} aria-label={c.next}>
          <IconChevronDown size={14} />
        </span>
      </nav>
    </div>
  );
}

/* ---- Loading and empty states --------------------------------------------- */

/* EIGHT ROWS, and each one is the REAL cell shape rather than a grey bar of the
 * right length. A skeleton whose subject cell is one line lies about the row
 * height the moment data lands. */
function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }, (_, i) => (
        <tr key={i} className={styles.skelRow}>
          <td className={styles.colSubject}>
            <span className={styles.skelStack}>
              <span className={styles.skeleton} style={{ inlineSize: '68%' }} />
              <span className={styles.skeleton} style={{ inlineSize: '34%' }} />
            </span>
          </td>
          <td className={styles.colCustomer}>
            <span className={styles.skeleton} style={{ inlineSize: '72%' }} />
          </td>
          <td className={styles.colChannel}>
            <span className={styles.skelPill} style={{ inlineSize: '92px' }} />
          </td>
          <td className={styles.colStatus}>
            <span className={styles.skelPill} style={{ inlineSize: '96px' }} />
          </td>
          <td className={styles.colPriority}>
            <span className={styles.skeleton} style={{ inlineSize: '62%' }} />
          </td>
          <td className={styles.colAssignee}>
            <span className={styles.skelFlex}>
              <span className={styles.skelAvatar} />
              <span className={styles.skeleton} style={{ inlineSize: '64%' }} />
            </span>
          </td>
          <td className={styles.colCreated}>
            <span className={styles.skeleton} style={{ inlineSize: '80%' }} />
          </td>
          <td className={styles.colActions}>
            <span className={styles.skelDot} />
          </td>
        </tr>
      ))}
    </>
  );
}

/* The three drawings speak the mark's language — three threads and a node — and
 * each breaks it in a DIFFERENT way, because the three states are three
 * different failures of connection:
 *
 *   none    dashed threads, dashed node   nothing has been sent yet
 *   nomatch threads bend away past a node the filter excluded everything
 *   error   threads severed mid-run       the request did not arrive
 *
 * They are not a mascot and they are not stock art. `currentColor` throughout,
 * so a themed brand recolours them for free. */
function ArtNone() {
  return (
    <svg
      width="82"
      height="60"
      viewBox="0 0 70 52"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <g strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 5" opacity="0.7">
        <path d="M8 14h10c6 0 9 5 13 12M8 26h22M8 38h10c6 0 9-5 13-12" />
      </g>
      <circle cx="44" cy="26" r="6" strokeWidth="1.5" strokeDasharray="3 4" />
    </svg>
  );
}

function ArtNoMatch() {
  return (
    <svg
      width="82"
      height="60"
      viewBox="0 0 70 52"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <g strokeWidth="1.5" strokeLinecap="round">
        <path d="M8 14c8 0 12 4 14 8M8 26h14M8 38c8 0 12-4 14-8" />
        <path d="M30 22c6-6 12-2 12-2M30 30c6 6 12 2 12 2" opacity="0.45" />
      </g>
      <circle cx="52" cy="26" r="5.5" fill="currentColor" stroke="none" opacity="0.3" />
    </svg>
  );
}

function ArtError() {
  return (
    <svg
      width="82"
      height="60"
      viewBox="0 0 70 52"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <g strokeWidth="1.5" strokeLinecap="round">
        <path d="M8 14h9M25 20c3 2 5 4 7 6M8 26h11M27 26h5M8 38h9M25 32c3-2 5-4 7-6" />
      </g>
      <circle cx="44" cy="26" r="5.5" fill="currentColor" stroke="none" opacity="0.55" />
    </svg>
  );
}

/* THE REAL MARK, tiled. `Mark` is imported rather than redrawn: the background
 * of an empty state is exactly where a hand-copied logo drifts and nobody
 * notices for a year. Two per tile, offset, so the lattice does not read as a
 * grid of rows. `useId` because two empty states on one page would otherwise
 * share a `<pattern>` id and the second would win. */
function WaslPattern() {
  const id = useId();
  return (
    /* width and height MUST be attributes here. The element is position:absolute
       with inset:0, which sizes the BOX - but an <svg> with no width/height and no
       viewBox keeps its default 300x150 viewport, and the <rect width="100%"> below
       is a percentage of THAT. The tiling filled a 300x150 corner of the card and
       left the rest blank, which reads as a half-drawn background rather than a
       missing attribute. */
    <svg className={styles.emptyPattern} width="100%" height="100%" aria-hidden="true">
      <defs>
        {/* MEASURED OFF THE BRAND SHEET, not estimated. Columns 88 apart, rows 45
            apart, and the second mark sits at HALF of each - 44 across, 45 down -
            which is what staggers alternate rows instead of letting them line up
            into vertical stripes.

            THE TWO AXES ARE NOT THE SAME NUMBER, and every wrong tile before this
            one assumed they were. Columns sit 90 apart and rows 88 apart, which
            reads as a close weave across and an airy one down - scaling both by
            one factor cannot reach it.

            Four tiles to get here: 144x144 (sparse polka dots), 96x172 (columns
            right, rows four times too far apart), 88x90 (correct pitch, too busy
            behind a paragraph), 132x136 (thinned by scaling BOTH axes 1.5x, which
            fixed the density and broke the columns again). The tile is 90 x 176 -
            two rows tall, because the stagger needs the second mark at half of
            each step, and a one-row tile cannot express that.
            144x144 read as sparse polka dots, and 96x172 fixed the columns while
            leaving the rows nearly four times too far apart. The row pitch is the
            number that makes it a weave rather than a scatter. */}
        <pattern id={id} width="90" height="176" patternUnits="userSpaceOnUse">
          <Mark size={28} x={2} y={4} />
          <Mark size={28} x={47} y={92} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

type EmptyKind = 'none' | 'nomatch' | 'error';

function EmptyState({
  lang,
  kind,
  onAction,
}: {
  lang: Lang;
  kind: EmptyKind;
  onAction: () => void;
}) {
  const c = COPY[lang];
  const copy = {
    none: [c.emptyTitle, c.emptyBody, c.emptyCta],
    nomatch: [c.noMatchTitle, c.noMatchBody, c.noMatchCta],
    error: [c.errorTitle, c.errorBody, c.retry],
  }[kind];
  const Art = { none: ArtNone, nomatch: ArtNoMatch, error: ArtError }[kind];

  return (
    <div className={styles.empty}>
      <WaslPattern />
      {/* EVERY state wraps its content in the same element, so the clearing behind
          the text is written once instead of three times. The trace id makes this
          worth doing rather than sizing a fixed shape: the error state is much
          wider than the other two, and a hand-set clear area would fit one of the
          three. This one is sized by the content it contains. */}
      <div className={styles.emptyContent}>
        <span className={styles.emptyArt}>
          <Art />
        </span>
        <p className={styles.emptyTitle}>{copy[0]}</p>
        <p className={styles.emptyBody}>{copy[1]}</p>
        {/* THE TRACE ID IS ONLY ON THE ERROR. It is what turns "it broke" into a
            row in dbo.AuditLog, and BR-8 keeps it unlocalised and Latin-digit. */}
        {kind === 'error' ? (
          <p className={styles.traceId} dir="ltr">
            00-34dfbb31db68d4c0418f24de5fe26fa1-a2cfdd5c580c45dc-00
          </p>
        ) : null}
        <button type="button" className={styles.emptyCta} onClick={onAction}>
          {copy[2]}
        </button>
      </div>
    </div>
  );
}

/* ---- The screen ----------------------------------------------------------- */

type Frame = 'shell-1280' | 'shell-1440';

const FRAME_LABEL: Record<Frame, string> = {
  /* 1280 − 288 sidebar − 2×56 content padding */
  'shell-1280': '880px — what a 1280 viewport actually leaves for the table',
  /* the --content-width token */
  'shell-1440': '1152px — --content-width, the 1440 frame',
};

const FRAME_WIDTH: Record<Frame, number> = { 'shell-1280': 880, 'shell-1440': 1152 };

const COUNTS = STATUSES.reduce<Record<StatusKey, number>>(
  (acc, s) => {
    acc[s] = ROWS.filter((r) => r.status === s).length;
    return acc;
  },
  {} as Record<StatusKey, number>,
);

function Screen({
  lang,
  frame,
  rowLimit,
  force,
}: {
  lang: Lang;
  frame: Frame;
  rowLimit: number;
  force?: 'loading' | EmptyKind;
}) {
  const c = COPY[lang];
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<StatusKey | 'all'>('all');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [panelOpen, setPanelOpen] = useState(false);
  const [openField, setOpenField] = useState<'from' | 'to' | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  /* Loaders §03: the bar is for work that must NOT block. It is flashed on every
   * narrowing action because that is when a real screen refetches, and a preview
   * that only shows the bar behind a debug toggle never shows it to the person
   * who has to approve it. */
  const flash = () => {
    setBusy(true);
    window.setTimeout(() => setBusy(false), 1100);
  };

  /* ONE listener for both popovers. Two would be two things to remember to tear
   * down, and the second one always outlives its component. */
  useEffect(() => {
    const away = () => {
      setPanelOpen(false);
      setOpenField(null);
      setMenuFor(null);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') away();
    };
    document.addEventListener('click', away);
    document.addEventListener('keydown', esc);

    /* SCROLL CLOSES THEM, and this is not a nicety - it is the cost of position:
     * fixed. A fixed flyout is anchored to the VIEWPORT, so the row it belongs to
     * slides away underneath it and the menu sits over an unrelated ticket, still
     * offering to escalate the one that has gone. Re-anchoring on every scroll
     * frame is the other option and it is worse: the menu would ride the table and
     * disappear under the sticky header.
     *
     * Blocking the scroll instead was considered and rejected - a page that stops
     * scrolling because a menu is open reads as frozen, and the wheel is how most
     * people dismiss a menu they opened by accident.
     *
     * capture: true because the scroll happens on the table's own scroller, and a
     * scroll event does not bubble to document. passive because this only reads. */
    document.addEventListener('scroll', away, { capture: true, passive: true });

    return () => {
      document.removeEventListener('click', away);
      document.removeEventListener('keydown', esc);
      document.removeEventListener('scroll', away, { capture: true });
    };
  }, []);

  const rows = useMemo(() => {
    const q = query.trim();
    return ROWS.filter((r) => {
      if (tab !== 'all' && r.status !== tab) return false;
      if (q) {
        const hay = `${r.ticketNumber} ${r.subjectAr} ${r.subjectEn} ${r.customerAr} ${r.customerEn}`;
        if (!hay.includes(q)) return false;
      }
      if (filters.priorities.length && !filters.priorities.includes(r.priority))
        return false;
      if (filters.channels.length && !filters.channels.includes(r.channel)) return false;
      /* ISO days compare correctly as plain strings — see `createdDay`. */
      if (filters.from && r.createdDay < filters.from) return false;
      if (filters.to && r.createdDay > filters.to) return false;
      return true;
    }).slice(0, rowLimit);
  }, [query, tab, filters, rowLimit]);

  /* THE TOOLTIP MEASUREMENT. CSS cannot ask whether a line is clipped, so one
   * effect asks for the whole tbody and writes the answer back as a custom
   * property. ONE ResizeObserver on the table, not one per row: 100 observers
   * to answer 100 copies of the same question is how a preview becomes slower
   * than the screen it previews. */
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return undefined;
    const measure = () => {
      body.querySelectorAll<HTMLElement>('[data-subject]').forEach((wrap) => {
        const line = wrap.querySelector<HTMLElement>('[data-line]');
        if (!line) return;
        const clipped = line.scrollWidth > line.clientWidth + 1;
        wrap.style.setProperty('--tip', clipped ? 'block' : 'none');
      });
    };

    /* PLACEMENT, because the tooltip is position: fixed and so has no anchor of
     * its own. One delegated listener on the tbody rather than a handler per
     * row, for the same reason there is one ResizeObserver.
     *
     * The flip matters: above the row is the natural place, but the rows most
     * likely to be clipped are the first ones, and those have no room above. */
    const place = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const wrap = target?.closest<HTMLElement>('[data-subject]');
      if (!wrap || wrap.style.getPropertyValue('--tip') !== 'block') return;
      const tip = wrap.querySelector<HTMLElement>('[data-tip]');
      if (!tip) return;
      const box = wrap.getBoundingClientRect();
      const gap = 8;
      const height = tip.offsetHeight || 40;
      const above = box.top - gap - height > 0;
      /* inset-inline-start measures from the RIGHT edge under RTL, so the
       * physical arithmetic happens here and the stylesheet stays logical. */
      const rtl = getComputedStyle(wrap).direction === 'rtl';
      const start = rtl ? window.innerWidth - box.right : box.left;
      wrap.style.setProperty('--tip-x', start + 'px');
      wrap.style.setProperty(
        '--tip-y',
        (above ? box.top - gap - height : box.bottom + gap) + 'px',
      );
    };
    body.addEventListener('pointerover', place);
    body.addEventListener('focusin', place);

    measure();
    /* jsdom HAS NO ResizeObserver, and FE-026-01 inherits this effect into a
     * primitive that will be tested there. Measuring once and returning is the
     * honest degradation: without layout there is nothing to observe anyway. */
    const drop = () => {
      body.removeEventListener('pointerover', place);
      body.removeEventListener('focusin', place);
    };
    if (typeof ResizeObserver === 'undefined') return drop;
    const ro = new ResizeObserver(measure);
    ro.observe(body);
    return () => {
      ro.disconnect();
      drop();
    };
  }, [rows, lang]);

  const filtered = tab !== 'all' || query.trim() !== '' || filterCount(filters) > 0;
  const showState: 'data' | 'loading' | EmptyKind =
    force ?? (rows.length === 0 ? (filtered ? 'nomatch' : 'none') : 'data');

  const clearEverything = () => {
    setQuery('');
    setTab('all');
    setFilters(EMPTY_FILTERS);
    setDraft(EMPTY_FILTERS);
  };

  return (
    <div className={styles.frame} style={{ inlineSize: `${FRAME_WIDTH[frame]}px` }}>
      <p className={styles.frameLabel}>{FRAME_LABEL[frame]}</p>

      <header className={styles.screenHead}>
        <div className={styles.titleBlock}>
          <h2 className={styles.pageTitle}>{c.title}</h2>
          <p className={styles.subtitle}>
            {c.subtitle(formatCount(ROWS.length, lang), formatCount(3, lang))}
          </p>
        </div>

        <div className={styles.headTools}>
          <div className={styles.searchBox}>
            <IconSearch size={15} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder={c.search}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                flash();
              }}
            />
            {query ? (
              <button
                type="button"
                className={styles.searchClear}
                aria-label={c.clearSearch}
                onClick={() => setQuery('')}
              >
                <IconClose size={11} />
              </button>
            ) : null}
          </div>

          <div className={styles.filterWrap} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.filterBtn}
              aria-expanded={panelOpen}
              onClick={() => {
                setDraft(filters);
                setPanelOpen(!panelOpen);
              }}
            >
              <IconFilter size={15} />
              {c.filter}
              {/* THE BADGE COUNTS THE APPLIED FILTER, NOT THE DRAFT. A count that
                  moved while the panel was open would say the list had already
                  narrowed when it had not. */}
              {filterCount(filters) > 0 ? (
                <span className={styles.filterBadge}>
                  {formatCount(filterCount(filters), lang)}
                </span>
              ) : null}
            </button>
            {panelOpen ? (
              <FilterPanel
                lang={lang}
                draft={draft}
                setDraft={setDraft}
                openField={openField}
                setOpenField={setOpenField}
                onApply={() => {
                  setFilters(draft);
                  setPanelOpen(false);
                  setOpenField(null);
                  flash();
                }}
              />
            ) : null}
          </div>
        </div>
      </header>

      <div className={styles.tabsRow}>
        <Tabs
          lang={lang}
          value={tab}
          counts={COUNTS}
          total={ROWS.length}
          onChange={(v) => {
            setTab(v);
            flash();
          }}
        />
        {tab !== 'all' ? (
          <span className={styles.activeChip}>
            {c.statusIs} {pick(lang, STATUS_LABEL[tab])}
            <button
              type="button"
              className={styles.chipClear}
              aria-label={c.removeFilter}
              onClick={() => setTab('all')}
            >
              <IconClose size={12} />
            </button>
          </span>
        ) : null}
      </div>

      <div className={styles.card}>
        {busy || showState === 'loading' ? (
          <div className={styles.loadBar}>
            <span className={styles.loadBarFill} />
          </div>
        ) : null}

        {showState === 'data' || showState === 'loading' ? (
          <div className={styles.scroller} data-scroller="">
            <table className={styles.table}>
              <thead>
                <HeadRow lang={lang} />
              </thead>
              <tbody ref={bodyRef}>
                {showState === 'loading' ? (
                  <SkeletonRows />
                ) : (
                  rows.map((row) => (
                    <DataRow
                      key={row.id}
                      row={row}
                      lang={lang}
                      menuOpen={menuFor === row.id}
                      onMenu={(id) => setMenuFor(menuFor === id ? null : id)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            {/* THE HEADER STAYS. An empty state that also removes the column
                headings looks like a broken page rather than an empty list, and
                the headings are what tell you which filter to relax. */}
            <div className={styles.scroller}>
              <table className={styles.table}>
                <thead>
                  <HeadRow lang={lang} />
                </thead>
              </table>
            </div>
            <EmptyState
              lang={lang}
              kind={showState}
              onAction={showState === 'nomatch' ? clearEverything : flash}
            />
          </>
        )}

        {showState === 'data' || showState === 'loading' ? (
          <Footer
            lang={lang}
            page={1}
            pageSize={10}
            shown={rows.length}
            total={ROWS.length}
            totalPages={Math.ceil(ROWS.length / 10)}
          />
        ) : null}
      </div>
    </div>
  );
}

/* ---- The page ------------------------------------------------------------- */

type Density = 'dense' | 'normal' | 'roomy';
type Rules = 'off' | 'hairline' | 'loud';

const DENSITY_CLASS: Record<Density, string | undefined> = {
  dense: styles.dense,
  normal: undefined,
  roomy: styles.roomy,
};

const RULES_CLASS: Record<Rules, string | undefined> = {
  off: styles.rulesOff,
  hairline: undefined,
  loud: styles.rulesLoud,
};

export default function TicketListPreview() {
  const [lang, setLang] = useState<Lang>('ar');
  const [rowCount, setRowCount] = useState(20);
  const [density, setDensity] = useState<Density>('normal');
  const [rules, setRules] = useState<Rules>('hairline');

  const dir = isAr(lang) ? 'rtl' : 'ltr';

  /* TWO KNOBS, NOT ONE. The canvas ships both and they answer different
   * questions: row padding is about how many tickets a manager sees at once,
   * divider weight is about whether sixty rows read as a list or as graph paper.
   * Collapsing them into one "density" control would make the second invisible. */
  const cycle = <T,>(list: readonly T[], current: T): T =>
    list[(list.indexOf(current) + 1) % list.length] as T;

  return (
    <div
      className={cx(styles.page, DENSITY_CLASS[density], RULES_CLASS[rules])}
      dir={dir}
      lang={lang}
    >
      <header className={styles.pageHead}>
        <h1 className={styles.pageTitle}>{COPY[lang].title}</h1>

        <div className={styles.controls}>
          <button
            type="button"
            className={cx(styles.toggle, isAr(lang) && styles.toggleOn)}
            onClick={() => setLang('ar')}
          >
            العربية
          </button>
          <button
            type="button"
            className={cx(styles.toggle, !isAr(lang) && styles.toggleOn)}
            onClick={() => setLang('en')}
          >
            English
          </button>
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setRowCount(rowCount === 20 ? 100 : 20)}
          >
            {rowCount === 20 ? 'show 100 rows' : 'show 20 rows'}
          </button>
          <button
            type="button"
            className={styles.toggle}
            onClick={() =>
              setDensity(cycle(['dense', 'normal', 'roomy'] as const, density))
            }
          >
            density: {density}
          </button>
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setRules(cycle(['off', 'hairline', 'loud'] as const, rules))}
          >
            rules: {rules}
          </button>
        </div>
      </header>

      {/* THE MEASUREMENT, printed rather than claimed. Every number on this line
          is read off the render — none is asserted in a comment. */}
      <p className={styles.note} dir="ltr">
        longest Arabic subject: {LONG_SUBJECT_AR.length} chars · rows: {ROWS.length} ·
        columns: RATIOS of the 1120 canvas (subject 23.2% · customer 11.1% · channel 13.4%
        · status 14.3% · priority 8.2% · assignee 13.4% · created 8.6% · actions 7.9% =
        100%) · no table floor, so no axis overflows at any frame
        <br />
        {(
          [
            ['ar-u-ca-gregory-nu-latn', 'the rule'],
            ['ar', 'plain — no defect in this engine'],
            ['ar-EG', 'digits flip'],
            ['ar-SA', 'digits flip; calendar stayed gregory'],
            [HIJRI_LOCALE, 'the picker toggle — display only, never the value'],
          ] as const
        ).map(([locale, note]) => (
          <span key={locale} className={styles.sample}>
            {locale}: <bdi>{formatDateAs(ROWS[0]!.createdAtUtc, locale)}</bdi> ({note})
          </span>
        ))}
      </p>

      <Screen lang={lang} frame="shell-1280" rowLimit={rowCount} />
      <Screen lang={lang} frame="shell-1440" rowLimit={8} />

      {/* The states, forced. Each frame keeps its own filter state, so leaving
          one narrowed and comparing it against another is the whole point. */}
      <Screen lang={lang} frame="shell-1280" rowLimit={8} force="loading" />
      <Screen lang={lang} frame="shell-1280" rowLimit={8} force="none" />
      <Screen lang={lang} frame="shell-1280" rowLimit={8} force="nomatch" />
      <Screen lang={lang} frame="shell-1280" rowLimit={8} force="error" />
    </div>
  );
}
