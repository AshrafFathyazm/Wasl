import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { Button } from '../../components/Button/Button';
import { Skeleton } from '../../components/Loader/Skeleton';
import { Textarea } from '../../components/Textarea/Textarea';
/* TWO ICON FILES, and `icons-added.tsx` is not re-exported from `icons.tsx` —
   so an import naming the wrong one type-checks nowhere and, worse, breaks the
   MODULE at runtime: the screen renders blank with one line in the console. */
import {
  IconArrowRight,
  IconArrowUp,
  IconEdit,
  IconEyeOff,
} from '../../icons/icons-added';
import {
  IconAdd,
  IconAssign,
  IconCheck,
  IconChevronDown,
  IconClose,
  IconComment,
  IconEmail,
  IconEscalate,
  IconLivechat,
  IconSearch,
  IconSms,
  IconTicket,
  IconWebform,
  IconWhatsapp,
} from '../../icons/icons';
import { useToast } from '../../components/Toast/ToastHost';
import { ApiError } from '../../lib/api';
import type {
  TicketResponse,
  TicketStatus,
  TimelineEntry,
  TimelineFilter,
} from '../../lib/api-types.provisional';
import { cx } from '../../lib/cx';
import { tint } from '../../lib/tint';
import { formatDateTime, formatNumber, type Lang } from '../../lib/formatters';
import { Mark } from '../../brand/Mark';

import styles from './TicketDetail.module.css';
import {
  addTicketComment,
  attachTicketTag,
  changeTicketAssignee,
  changeTicketStatus,
  detachTicketTag,
  getCannedReplies,
  getSupportUsers,
  getTags,
  getTicket,
  getTicketTimeline,
  listTickets,
  ticketKeys,
} from './tickets.api';

/* ============================================================================
 * `027` — the ticket detail screen, rebuilt to the v3 design 2026-09-01
 * ============================================================================
 * SEVEN ENDPOINTS, and every region below is one of them. Nothing on this screen
 * is drawn from anything else:
 *
 *   GET  /api/tickets/{id}                 the ticket, allowedTransitions, tags
 *   GET  /api/tickets/{id}/timeline?type=  a CURSOR, and the two tab counts
 *   POST /api/tickets/{id}/comments        isInternal
 *   PUT  /api/tickets/{id}/status          expectedVersion
 *   PUT  /api/tickets/{id}/assignee        expectedVersion
 *   PUT/DELETE /api/tickets/{id}/tags/{id}
 *   GET  /api/tickets?customerId=          the customer's other tickets
 *   GET  /api/support-users · /api/tags · /api/canned-replies?category=
 *
 * ── THE RULE THIS REBUILD WAS GIVEN ────────────────────────────────────────
 * The product owner's instruction, 2026-09-01: build the columns that exist in
 * the backend, and *"لو حاجه او اكشن او كولوم ملهوش موازي ليه في الباك اند اعتبره
 * مش موجود في الديزاين"* — anything with no backend counterpart is treated as
 * absent from the design.
 *
 * So five regions the v3 canvas draws are DELIBERATELY NOT HERE, and they are
 * listed rather than quietly dropped, because the next person with the canvas
 * open will otherwise read their absence as unfinished work:
 *
 *   the SLA pill, the rail's SLA block, and the «خُرق زمن الحل» banner
 *       There is no due date, no first-response time, and no SLA anywhere in the
 *       domain — not a field, not a table, not a setting. A countdown drawn from
 *       nothing is the one defect a screenshot cannot catch, because it looks
 *       exactly like a working one.
 *   «@ مناداة زميل»
 *       No mentions: no field on a comment, no notification, nothing to resolve a
 *       name against. The button would type an `@` into a body nobody is told
 *       about.
 *   per-tag colours
 *       `TagSummary` is `(id, name)`. The canvas tints three chips three ways; a
 *       tint chosen in the client is a meaning the data does not carry, so every
 *       chip wears one style.
 *   the assignee's department («وكيل · الفوترة»)
 *       `SupportUserOption` is `(id, fullName, role)`. The role is real and is
 *       rendered; the department does not exist.
 *
 * ── AND ONE REGION THAT IS DRAWN, DISABLED, ON THE OWNER'S RULING ──────────
 * «اتخاذ إجراء» was left out on the first pass, on the grounds that three of its
 * four items have no endpoint and the fourth duplicates the status control. The
 * product owner overruled that on 2026-09-01: *"شوف ايه الاكشنز الموجود ليها باك
 * اند والي مش موجود حطها بس خليها read only"* — draw them all, and leave the
 * unbuilt ones inert.
 *
 * It is the better answer, and the reason is worth keeping: an ABSENT control
 * says the product cannot do this; a DISABLED one with a reason says not yet, and
 * it is the roadmap the screen itself carries. What it must never be is enabled
 * and silent.
 *
 *   إغلاق التذكرة        LIVE — `PUT /status` to `Closed`, and only when
 *                        `allowedTransitions` contains it
 *   تصعيد                inert — `016`, unbuilt. `isEscalated` is read-only here
 *   دمج مع تذكرة أخرى     inert — no endpoint of any kind
 *   تمديد الاستحقاق       inert — and it needs the SLA that does not exist first
 *
 * Every inert row carries the SAME reason string, and it names the cause rather
 * than apologising: the server has nothing behind it yet.
 *
 * ── WHAT THE V3 CANVAS CHANGED, AND IS BUILT ───────────────────────────────
 *   the status pill IS the control — a menu headed «نقل الحالة إلى», the current
 *     status ticked and inert, and only `allowedTransitions` actionable
 *   two tabs with their own totals, served by `?type=Comments|History`
 *   newest first, «تحميل الأقدم» at the FOOT — which reverses `027` Q-2, and the
 *     canvas is the later ruling
 *   a 292px rail: assignee · customer and their other tickets · the four facts
 *   the composer ABOVE the feed, with the internal switch and the templates
 *
 * NOTHING RENDERS A TICKET FROM A WRITE RESPONSE, and no mutation calls
 * `setQueryData` (`026` §5, `027` AC-1). Every write invalidates and the read is
 * the single source. That rule is why `assigneeName` was missing from the list
 * for three days, and why the fix had to be in the projection rather than here.
 * ========================================================================== */

const TIMELINE_LIMIT = 50; /* `013`'s own default. */

/** The canvas's four, and the step «تحميل الأقدم» reveals. */
const FEED_STEP = 4;

/** The canvas's separator. A glyph, not a word — it is not in the catalogues and
 *  it must not be: there is nothing to translate and a middot is a middot in
 *  both languages. Named so BR-8.8's rule does not have to be argued with at two
 *  call sites. */
const DOT = '\u00B7';

/* One asset per channel, keyed on the WIRE value — the same map the list row
 * carries, and the canvas puts the glyph beside the rail's channel value too. */
const CHANNEL_ICON = {
  Email: IconEmail,
  WhatsApp: IconWhatsapp,
  LiveChat: IconLivechat,
  Sms: IconSms,
  WebForm: IconWebform,
} as const;

/* ==========================================================================
 * TINTS, AND WHY THEY ARE DERIVED RATHER THAN STORED
 * ==========================================================================
 * The product owner ruled on 2026-09-01 that tags carry different colours and
 * that a person's avatar colour differs from the next person's — in the rail, in
 * the comments, in the assignee panel, and on the history's person glyph.
 *
 * NEITHER COLOUR EXISTS IN THE BACKEND. `TagSummary` is `(id, name)` and
 * `SupportUserOption` is `(id, fullName, role)`. So the tint is DERIVED from the
 * identity, deterministically, and that is the whole difference between
 * decoration and invented data:
 *
 *   - the same tag is the same colour on every ticket and every reload
 *   - the same person is the same colour in the rail, in their comments and in
 *     the picker — which is what makes it a scanning aid rather than confetti
 *   - nothing is claimed by the colour. It says "this is a different one", not
 *     "this one is urgent" — a tag tint that MEANT something would need a field
 *
 * ── THE HASH WAS THE WEAK PART, AND IT WAS MEASURED ───────────────────────
 * The first version summed code units, on the grounds that a reader never sees
 * the buckets. That was wrong for THIS alphabet: Arabic names are built from a
 * small set of letters, so their sums cluster, and two of the three seeded
 * support users landed in the same bucket at four AND at five colours —
 * «نورة السالم» and «منى العتيبي», measured against the running server.
 *
 * FNV-1a spreads them. Over ten real names from the seed:
 *
 *   sum, 5 buckets   group sizes 4,3,1,1,1   ← clustered
 *   FNV, 5 buckets   group sizes 3,2,2,2,1   ← as even as ten over five can be
 *
 * TEN NAMES OVER FIVE COLOURS MUST COLLIDE — that is arithmetic, not a defect,
 * and it is why the trade-off below is stated rather than hidden. `Math.imul`
 * keeps the multiply in 32 bits, which is what makes the result identical in
 * every engine; without it the float multiply loses the low bits and the same
 * name can tint differently in two browsers. */
/* MOVED TO `lib/tint.ts` by `035`, and re-exported here so this file's own call
 * sites and `027`'s tests keep working. The reasoning above is the reasoning
 * there — read it in one place. The customer screens need the same guarantee,
 * and two implementations of "one person, one colour" would drift invisibly. */
export { tint };

/* FIVE, the same count the tags use, and the reason they are not de-collided the
 * way tags are is a deliberate trade-off in the other direction:
 *
 *   A TAG must differ from the tag beside it — the owner ruled that, and a
 *   ticket's tags are one visible set, so the walk runs within the ticket.
 *
 *   A PERSON must be the same colour everywhere — in the rail, on every comment
 *   they wrote, and in the picker. That is what makes the colour a scanning aid
 *   ("منى's circle") rather than decoration. De-colliding within each region
 *   would give the same person two colours on one screen, which is worse than
 *   two people sharing one.
 *
 * So: a better hash rather than a walk, and two people CAN still match. With
 * three seeded agents they do not (measured); with ten they must. */
const AVATAR_TINT = [styles.av0, styles.av1, styles.av2, styles.av3, styles.av4];

const TAG_TINT = [styles.tagA, styles.tagB, styles.tagC, styles.tagD, styles.tagE];

/**
 * A tint per tag, and no two tags on one ticket wearing the same one.
 *
 * THE HASH ALONE WAS NOT ENOUGH and the owner's frame is the measurement: five
 * tags came out four amber and one grey. With three buckets over five tags a
 * collision is arithmetic, not luck.
 *
 * So the hash still CHOOSES — that is what keeps a tag the same colour from one
 * ticket to the next, which is the whole point of deriving it from the name — and
 * a collision walks to the next free bucket. Both properties, in the order they
 * matter:
 *
 *   the same tag alone on two tickets  → the same colour, always
 *   two tags on one ticket             → never the same colour (up to six)
 *   a seventh tag                      → wraps, because six colours is six
 *
 * The walk is over the tags in the order the server sent them, and `034` orders
 * them by name — so the assignment is stable across reloads rather than depending
 * on which tag was attached last.
 */
function tagTints(tags: { name: string }[]): string[] {
  const used = new Set<number>();
  return tags.map((tag) => {
    let index = tint(tag.name, TAG_TINT.length);
    for (let step = 0; used.size < TAG_TINT.length && used.has(index); step += 1) {
      index = (index + 1) % TAG_TINT.length;
    }
    used.add(index);
    return TAG_TINT[index] ?? '';
  });
}

/** The canvas tints the status pill and its dot per status. One map, and it is
 *  the same six keys BR-1 defines — a status with no entry falls back to
 *  neutral rather than rendering unstyled. */
const STATUS_CLASS: Record<string, string | undefined> = {
  New: styles.stNew,
  Open: styles.stOpen,
  InProgress: styles.stProgress,
  PendingCustomer: styles.stPending,
  Resolved: styles.stResolved,
  Closed: styles.stClosed,
};

/** Two of four priorities carry emphasis, and it is the same ruling the list
 *  row carries: red is `Critical` and escalation only. */
const PRIORITY_CLASS: Record<string, string | undefined> = {
  Critical: styles.prCritical,
  High: styles.prHigh,
  Normal: styles.prNormal,
  Low: styles.prLow,
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => [...part][0] ?? '')
    .join('');
}

function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  return (
    <span
      /* THE TINT IS THE PERSON'S, not the row's — see `tint` above. Keyed on the
         name rather than the id because a comment's actor carries a name and, on
         a customer's reply, no id at all. */
      className={cx(styles.avatar, AVATAR_TINT[tint(name, AVATAR_TINT.length)])}
      style={{ inlineSize: size, blockSize: size }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

/* Sentinels, and the reason they are here rather than two catalogue fragments.
 *
 * The canvas colours BOTH status names inside one sentence — «غيّر الحالة من
 * *بانتظار العميل* إلى *قيد التنفيذ*». Splitting that into fragments would put
 * Arabic word order in this file, and `{{from}} … {{to}}` in one string cannot
 * carry a class. So the string is interpolated with two characters that cannot
 * occur in any catalogue, then split on them and the nodes dropped in — the
 * translator keeps the word order, and each value keeps its tone. */
const SLOT_A = '\u0001';
const SLOT_B = '\u0002';

/* Built with `new RegExp` rather than written as a literal: `no-control-regex`
 * refuses the literal form, and the alternative — pasting the two characters in
 * directly — puts invisible bytes in the source, which is how the first attempt
 * at these sentinels vanished through a file write entirely. */
const SLOT_SPLIT = new RegExp('([' + SLOT_A + SLOT_B + '])');

function withSlots(text: string, nodes: [React.ReactNode, React.ReactNode]) {
  return text
    .split(SLOT_SPLIT)
    .map((piece, index) => (
      <Fragment key={index}>
        {piece === SLOT_A ? nodes[0] : piece === SLOT_B ? nodes[1] : piece}
      </Fragment>
    ));
}

/**
 * The glyph a history row leads with, by `type` and never by which fields are
 * populated — `013` put a discriminator on every entry for exactly this.
 *
 * FOUR GLYPHS, and the canvas's own: an arrow for a transition, a red arrow up
 * for an escalation, a person for an assignment, a ticket for the creation. The
 * person's circle takes the ACTOR'S TINT, so a row about assigning matches the
 * avatar of whoever did it — the canvas draws that ring in a different colour on
 * every row and this is what makes it the same colour as the same person.
 *
 * The canvas ALSO draws a priority-change row. There is no priority event in
 * `TicketHistoryEventType` and no change-priority endpoint, so that row cannot
 * arrive and nothing renders it.
 */
function EventIcon({ type, actor }: { type: TimelineEntry['type']; actor: string }) {
  if (type === 'Escalated') {
    return (
      <span className={cx(styles.eventIcon, styles.eventIconDanger)} aria-hidden="true">
        <IconArrowUp size={13} />
      </span>
    );
  }

  if (type === 'Assigned' || type === 'Unassigned') {
    return (
      <span
        className={cx(styles.eventIcon, AVATAR_TINT[tint(actor, AVATAR_TINT.length)])}
        aria-hidden="true"
      >
        <IconAssign size={13} />
      </span>
    );
  }

  return (
    <span className={styles.eventIcon} aria-hidden="true">
      {type === 'CommentAdded' ? (
        <IconComment size={13} />
      ) : type === 'Created' ? (
        <IconTicket size={13} />
      ) : (
        /* A transition. Not mirrored in rtl — it diagrams "from → to" rather than
           a reading direction; the note is on the icon itself. */
        <IconArrowRight size={13} />
      )}
    </span>
  );
}

/**
 * One comment. The only entry with a body, and the only one with an author kind.
 *
 * `AuthorKind` is read rather than inferred from whether `actor.role` happens to
 * be null (`034` says so in the DTO): the badge it drives is the difference
 * between the customer's words and ours, and an inferred one is a refactor away
 * from being wrong.
 */
function CommentRow({ entry }: { entry: TimelineEntry }) {
  const { t, i18n } = useTranslation('tickets');
  const lang: Lang = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en';
  const fromCustomer = entry.authorKind === 'Customer';

  return (
    <article className={styles.comment}>
      <Avatar name={entry.actor.fullName} />
      <div className={styles.commentMain}>
        <div className={styles.commentHead}>
          <span className={styles.commentActor} dir="auto">
            {entry.actor.fullName}
          </span>

          {/* WHO IT IS FROM, then their role. On a customer's reply the role is
              the customer badge — `actor.role` is null there, which is exactly
              why the kind is a field of its own. */}
          {fromCustomer ? (
            <span className={cx(styles.rolePill, styles.rolePillCustomer)}>
              {t('list.column.customer')}
            </span>
          ) : entry.actor.role ? (
            <span className={styles.rolePill}>{t(`role.${entry.actor.role}`)}</span>
          ) : null}

          <time className={styles.commentTime} dateTime={entry.occurredAtUtc}>
            {formatDateTime(entry.occurredAtUtc, lang)}
          </time>

          {entry.isInternal ? (
            /* BR-5.4 — MARKED, never hidden. The server does not filter these
               and neither does the client. */
            <span className={styles.internalPill}>
              <IconEyeOff size={11} aria-hidden="true" />
              {t('detail.internal')}
            </span>
          ) : null}

          {/* Who typed a customer's reply in. The customer never signs in, so
              somebody recorded it, and the row records both people. */}
          {entry.recordedBy ? (
            <span className={styles.recordedBy} dir="auto">
              {t('detail.recordedBy', { name: entry.recordedBy.fullName })}
            </span>
          ) : null}
        </div>

        {/* `dir="auto"` — AC-8. The BOX stays aligned with the page; only the
            paragraph's internal direction follows its first strong character, so
            a Latin comment in an Arabic thread starts on the same edge as its
            neighbours instead of jumping to the other side. */}
        <p className={styles.commentBody} dir="auto">
          {entry.body}
        </p>
      </div>
    </article>
  );
}

/** One history row: glyph, sentence, time — and the note when there is one. */
function HistoryRow({
  entry,
  nameOf,
}: {
  entry: TimelineEntry;
  nameOf: (id: string | null) => string | null;
}) {
  const { t, i18n } = useTranslation('tickets');
  const lang: Lang = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en';

  const statusNode = (value: string | null, tone: 'from' | 'to') =>
    value ? (
      <span className={cx(styles.eventStatus, STATUS_CLASS[value])} data-tone={tone}>
        {t(`status.${value}`)}
      </span>
    ) : null;

  const sentence = () => {
    switch (entry.type) {
      case 'Created':
        return t('detail.event.created');

      case 'StatusChanged':
        /* Both names translated AND toned, in the translator's word order. The
           first build of this screen passed neither value and three rows read
           "غيّر الحالة من {{from}} إلى {{to}}" on screen. */
        return withSlots(t('detail.event.statusChanged', { from: SLOT_A, to: SLOT_B }), [
          statusNode(entry.oldValue, 'from'),
          statusNode(entry.newValue, 'to'),
        ]);

      case 'Assigned': {
        /* An `Assigned` row's `newValue` is the assignee's ID, not their name —
           measured on the wire. Resolved against the picker's list, which this
           page already holds, so the feed costs no extra request. A GUID on
           screen is worse than a missing name. */
        const name = nameOf(entry.newValue);
        return name
          ? t('detail.event.assigned', { name })
          : t('detail.event.assignedUnknown');
      }

      case 'Unassigned':
        return t('detail.event.unassigned');

      case 'Escalated':
        return t('detail.event.escalated');

      case 'CommentAdded':
        /* Its `newValue` is the COMMENT'S id, and it was once printed raw. */
        return t('detail.event.commentAdded');

      default:
        return '';
    }
  };

  return (
    <div className={styles.event}>
      <EventIcon type={entry.type} actor={entry.actor.fullName} />
      <span className={styles.eventText}>
        <b className={styles.eventActor} dir="auto">
          {entry.actor.fullName}
        </b>{' '}
        {sentence()}
        {entry.note ? (
          <span className={styles.eventNote} dir="auto">
            {entry.note}
          </span>
        ) : null}
      </span>
      <time className={styles.eventTime} dateTime={entry.occurredAtUtc}>
        {formatDateTime(entry.occurredAtUtc, lang)}
      </time>
    </div>
  );
}

/**
 * Three skeleton comment rows — the shape of what is coming, not a spinner.
 *
 * EVERY SHAPE IS `Skeleton`'s, and the widths are the canvas's. The staggered
 * delay went with the local keyframes: one animation means one timing, and
 * `029`'s guard is what stops a second one appearing here (AC-12, and it went
 * red on this file's first run).
 */
function FeedSkeleton() {
  return (
    <div className={styles.skFeed} aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <div key={row} className={styles.skRow}>
          <Skeleton shape="avatar" width="34px" height="34px" />
          <span className={styles.skLines}>
            <Skeleton width="38%" />
            <Skeleton width="100%" />
            <Skeleton width="72%" />
          </span>
        </div>
      ))}
    </div>
  );
}

export default function TicketDetailPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation('tickets');
  const { t: tCommon } = useTranslation('common');
  const lang: Lang = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en';
  const queryClient = useQueryClient();
  const toast = useToast();

  const [draft, setDraft] = useState('');
  const [internal, setInternal] = useState(false);
  const [conflict, setConflict] = useState(false);
  /* `forbidden` was a boolean here and is gone — the `403` is a toast now, so
     there is no banner whose visibility needs tracking. */
  const [clientBug, setClientBug] = useState<string | null>(null);
  const [sendFailed, setSendFailed] = useState(false);

  /* The transition awaiting its note. Local, because it is a step in one
   * interaction rather than a fact about the ticket — nothing else needs it and
   * a reload should not resume a half-finished status change. */
  const [pending, setPending] = useState<TicketStatus | null>(null);
  const [note, setNote] = useState('');

  /* View state, all local: a reload should not restore a half-open popover. */
  const [tab, setTab] = useState<TimelineFilter>('Comments');

  /* HOW MANY ENTRIES ARE ON SCREEN, which is not how many were fetched.
   *
   * The canvas shows FOUR and then «تحميل الأقدم» — on both tabs. `013`'s page is
   * fifty, and asking for four would be four times the requests for the same
   * reading. So the page stays fifty and the SCREEN reveals four at a time: the
   * control fetches only when the fetched rows run out.
   *
   * Reset with the tab, because it is a position in one list and the other tab is
   * a different list. */
  const [shown, setShown] = useState(FEED_STEP);
  const [openPop, setOpenPop] = useState<
    'status' | 'assignee' | 'template' | 'tag' | 'actions' | null
  >(null);
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const screenRef = useRef<HTMLDivElement>(null);

  /* ONE OUTSIDE-PRESS HANDLER FOR EVERY POPOVER, on the container rather than
   * per popover: four independent handlers is four chances for two to be open at
   * once, and two open popovers over the same composer is a state nobody can
   * read. Escape closes for the same reason. */
  useEffect(() => {
    if (openPop === null) return undefined;

    const close = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && screenRef.current?.contains(target)) {
        if ((target as HTMLElement).closest?.('[data-pop]')) return;
      }
      setOpenPop(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenPop(null);
    };

    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [openPop]);

  const ticketQuery = useQuery({
    queryKey: ticketKeys.detail(id),
    queryFn: ({ signal }) => getTicket(id, signal),
    enabled: id !== '',
  });

  const ticket: TicketResponse | undefined = ticketQuery.data;

  /* THE CURSOR IS NOT IN THE KEY, THE TAB IS — see `ticketKeys.timeline`. A
   * cursor is a position inside one logical list; putting it in the key makes
   * every scroll-back a cache entry nothing invalidates. `Comments` and
   * `History` genuinely are two lists, with two counts, so those are two keys. */
  const timelineQuery = useInfiniteQuery({
    queryKey: ticketKeys.timeline(id, tab),
    queryFn: ({ pageParam, signal }) =>
      getTicketTimeline(
        id,
        { limit: TIMELINE_LIMIT, type: tab, ...(pageParam ? { before: pageParam } : {}) },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.hasMore ? (last.nextCursor ?? undefined) : undefined,
    enabled: id !== '',
  });

  const supportUsers = useQuery({
    queryKey: ticketKeys.supportUsers(),
    queryFn: ({ signal }) => getSupportUsers(signal),
  });

  /* THE CUSTOMER'S OTHER TICKETS — `?customerId=`, which `010` has accepted the
   * whole time and no screen had asked for. Four are fetched and at most three
   * are shown: the fourth is the one this page is already displaying, and
   * filtering after the fetch is what makes the count honest without a second
   * request. */
  const otherTickets = useQuery({
    queryKey: ticketKeys.list({
      page: 1,
      pageSize: 4,
      customerId: ticket?.customer?.id ?? '',
    }),
    queryFn: ({ signal }) =>
      listTickets(
        { page: 1, pageSize: 4, customerId: ticket?.customer?.id ?? '' },
        signal,
      ),
    enabled: ticket?.customer?.id !== undefined,
    staleTime: 60_000,
  });

  const tagVocabulary = useQuery({
    queryKey: ticketKeys.tags(),
    queryFn: ({ signal }) => getTags(signal),
  });

  /* Keyed by the ticket's category, because `?category=` returns a DIFFERENT
   * list — and it WIDENS rather than narrows. Measured: asking for `Billing`
   * returned the two Billing templates PLUS the two with no category. A template
   * with no category applies to every ticket, so filtering them out would hide
   * the general replies exactly when a category is known, which is always. */
  const cannedReplies = useQuery({
    queryKey: ticketKeys.cannedReplies(ticket?.category),
    queryFn: ({ signal }) => getCannedReplies(ticket?.category, signal),
    enabled: ticket !== undefined,
  });

  /* ── the four answers a write can give ─────────────────────────────────────
   *
   * 200  applied — invalidate; the READ brings the new version
   * 409  concurrency-conflict — refetch and say what happened. NEVER retried:
   *      the second write would apply to a state the reader never saw
   * 403  not permitted — BR-6's handler denial. Said plainly, and the control
   *      stays: hiding it would tell an Agent that self-assignment is impossible
   *      rather than that this assignment is
   * 400  a bug in this client, not a user error. `expectedVersion` was missing,
   *      empty, or not base64 — which a reader cannot cause and cannot fix, so it
   *      must not reach them as "try again"
   *
   * Collapsing them into "it failed" throws away the only ones the reader can act
   * on: `027` AC-4 and AC-5. */
  const onWriteError = (error: unknown, retry?: () => void) => {
    if (
      error instanceof ApiError &&
      error.problem?.type?.endsWith('errors/concurrency-conflict')
    ) {
      setConflict(true);
      void queryClient.invalidateQueries({ queryKey: ticketKeys.detail(id) });
      return;
    }

    /* A TOAST, AND NO RETRY ACTION — `feedback-layer.md` §1.2. Permission denied
       is request-wide, so it has no field to sit beside; and it is the one
       failure where a retry button would be a lie, because the identical request
       will be refused identically. The message says who to ask instead.
       `tone: 'error'` therefore never auto-dismisses. */
    if (error instanceof ApiError && error.status === 403) {
      toast.show({
        tone: 'error',
        title: t('detail.forbiddenTitle'),
        body: t('detail.forbidden'),
        /* One denial at a time. Without a stable key each refused write would be
           its own card — three refusals fill the whole stack with one fact and
           evict everything else. */
        dedupeKey: 'ticket-forbidden',
      });
      return;
    }

    if (error instanceof ApiError && error.status === 400) {
      /* THE CATALOGUE'S BODY, not the server's `detail`. The server says
       * "expectedVersion is required" — accurate, and meaningless to a reader who
       * never typed a version. */
      setClientBug(t('detail.versionRejectedBody'));
      return;
    }

    /* EVERYTHING LEFT IS REQUEST-WIDE — `feedback-layer.md` §1.2. A dropped
       connection, a `5xx`, a channel that is down: none of them belong to a
       field, so none of them can be shown under one. This branch used to be
       `setClientBug(null)`, which is to say NOTHING AT ALL — a write that failed
       on the network left the screen exactly as it was, and the reader's next
       move was to assume it had worked.

       It carries a retry, and here the retry is honest: the same request may
       well succeed. That is what separates it from the `403` above, where the
       identical request is refused identically and a retry button would be a
       lie. `tone: 'error'` never auto-dismisses either way. */
    setClientBug(null);
    toast.show({
      tone: 'error',
      title: t('detail.writeFailedTitle'),
      body: t('detail.writeFailedBody'),
      dedupeKey: 'ticket-write-failed',
      ...(retry === undefined
        ? {}
        : { action: { label: tCommon('retry'), onClick: retry } }),
    });
  };

  const afterWrite = async () => {
    setConflict(false);
    /* No `setForbidden` — the `403`'s toast dismisses itself or is dismissed by
       hand, and a later successful write must not silently retract a denial the
       reader may not have read yet. */
    setClientBug(null);
    await queryClient.invalidateQueries({ queryKey: ticketKeys.detail(id) });
    await queryClient.invalidateQueries({ queryKey: ['tickets', 'timeline', id] });
  };

  const comment = useMutation({
    mutationFn: (body: string) => addTicketComment(id, { body, isInternal: internal }),
    onSuccess: async () => {
      setDraft('');
      setInternal(false);
      setSendFailed(false);
      /* A new comment lands in the comments tab. Switching to it is what makes
         the write visible — posting from the history tab otherwise looks like
         nothing happened. */
      setTab('Comments');

      /* §1.1's "reply sent". The tab switch above already makes the write
         visible, so this is close to tie-break 5 — but §1.1 names this row
         explicitly, and the document decides. The tab switch is also NOT
         feedback for a reader who was already on the Comments tab: for them
         nothing moved except a list they were not watching the end of. */
      toast.show({ tone: 'success', title: t('detail.commentToastTitle') });
      await afterWrite();
    },
    onError: (error, body) => {
      setSendFailed(true);
      onWriteError(error, () => comment.mutate(body));
    },
  });

  /* BR-1.2. A NOTE IS REQUIRED WHEN CLOSING WORK THAT WAS NEVER STARTED, and
   * nothing about `allowedTransitions` says so — `New → Closed` and `Open →
   * Closed` are both permitted and both answer `400` with `errors.note`.
   *
   * This client asks for it rather than discovering it: sending the transition
   * bare would surface a validation error on a field the reader was never shown.
   *
   * `Resolved → Closed` deliberately does NOT need one (`012` Q-1: asking for a
   * reason for the expected outcome trains people to type nothing useful). */
  const noteRequiredFor = (next: string) =>
    next === 'Closed' && (ticket?.status === 'New' || ticket?.status === 'Open');

  const status = useMutation({
    mutationFn: ({ next, note: text }: { next: TicketStatus; note: string }) =>
      changeTicketStatus(id, {
        status: next,
        expectedVersion: ticket?.version ?? '',
        ...(text.trim() ? { note: text.trim() } : {}),
      }),
    onSuccess: async () => {
      setPending(null);
      setNote('');
      /* §1.1 names this row: "ticket status changed → toast success 4s". */
      toast.show({ tone: 'success', title: t('detail.statusToastTitle') });
      await afterWrite();
    },
    /* NO RETRY THUNK. `expectedVersion` is read off the ticket the page is
       holding, and by the time the reader presses retry the refetch behind this
       error may have replaced it — so a retry would re-send a version that is no
       longer current and turn a network failure into a `409`. The toast is
       fired without an action; §1.2's retry is for requests that carry
       everything they need, and a versioned write does not. */
    onError: (error) => onWriteError(error),
  });

  const assignee = useMutation({
    mutationFn: (assigneeId: string | null) =>
      changeTicketAssignee(id, { assigneeId, expectedVersion: ticket?.version ?? '' }),
    onSuccess: async () => {
      setOpenPop(null);
      setAssigneeFilter('');

      /* NO TOAST, and the absence is a reading of §1.5 rather than an omission.
         Tie-break 5: "is the visible change its own feedback? → no surface at
         all. Adding a toast is noise." The rail's assignee block is the thing
         the reader was just looking at and it changes under them. §1.1 does not
         list assignment, and the same argument covers the tag writes below. */
      await afterWrite();
    },
    /* Versioned, like the status write — see its note. */
    onError: (error) => onWriteError(error),
  });

  const tagWrite = useMutation({
    mutationFn: ({ tagId, attach }: { tagId: string; attach: boolean }) =>
      attach ? attachTicketTag(id, tagId) : detachTicketTag(id, tagId),
    onSuccess: async () => {
      setOpenPop(null);
      await afterWrite();
    },

    /* NO expectedVersion on either write, and that is the server's shape rather
     * than an omission here: attaching is not a state transition, and two people
     * attaching different tags do not conflict. So this is the one write on the
     * screen that cannot answer a 409 — and `onWriteError` still routes the rest,
     * which `034` Q-4 makes reachable: detaching is open to the assignee and any
     * Manager, so an Agent who is neither gets a 403.
     *
     * AND IT IS THE ONE WRITE ON THIS SCREEN THAT CAN CARRY A RETRY, for the
     * same reason: with no `expectedVersion` in the request, re-sending it later
     * is the same request rather than a stale one. */
    onError: (error, variables) => onWriteError(error, () => tagWrite.mutate(variables)),
  });

  /* Sorted for the DISPLAY language, which is what `getSupportUsers` declines to
   * do at fetch time: the server orders by the database collation, so a mixed
   * Arabic and English set looks ordered in one language and arbitrary in the
   * other. Sorting in the fetcher would go stale when the language changes
   * without a refetch. */
  const collator = useMemo(() => new Intl.Collator(lang), [lang]);
  const users = useMemo(
    () =>
      [...(supportUsers.data ?? [])].sort((a, b) =>
        collator.compare(a.fullName, b.fullName),
      ),
    [supportUsers.data, collator],
  );

  if (ticketQuery.isPending) {
    return (
      <main className={styles.page}>
        <div className={styles.sheet} aria-busy="true" aria-live="polite">
          <div className={cx(styles.layout, styles.layoutWide)}>
            <aside className={cx(styles.rail, styles.railCard)} aria-hidden="true">
              <Skeleton shape="block" height="84px" />
              <Skeleton width="96px" />
              <Skeleton shape="block" height="44px" />
              <Skeleton width="130px" />
            </aside>
            <div className={cx(styles.main, styles.mainGap)}>
              <div
                className={cx(styles.subjectCard, styles.skSubject)}
                aria-hidden="true"
              >
                <Skeleton width="62%" height="15px" />
                <Skeleton width="100%" />
                <Skeleton width="88%" />
              </div>
              <div className={styles.feedCard}>
                <FeedSkeleton />
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (ticketQuery.isError || !ticket) {
    const notFound =
      ticketQuery.error instanceof ApiError && ticketQuery.error.status === 404;

    return (
      <main className={styles.page}>
        <div className={styles.missing}>
          <span className={styles.patternMark} aria-hidden="true">
            <Mark size={44} />
          </span>
          <p className={styles.missingTitle}>
            {t(notFound ? 'detail.notFoundTitle' : 'detail.errorTitle')}
          </p>
          <p className={styles.missingBody}>
            {t(notFound ? 'detail.notFoundBody' : 'detail.errorBody')}
          </p>
          {notFound ? (
            <Link className={styles.missingCta} to="/tickets">
              {t('detail.backToList')}
            </Link>
          ) : (
            <button
              type="button"
              className={styles.missingCta}
              onClick={() => void ticketQuery.refetch()}
            >
              {t('detail.retry')}
            </button>
          )}
        </div>
      </main>
    );
  }

  /* ── NEWEST FIRST, AND IT IS REVERSED PER PAGE RATHER THAN ONCE ────────────
   *
   * MEASURED ON THE WIRE 2026-09-01, because the screen said otherwise: the tab
   * strip is labelled «الأحدث أولاً» and the history read oldest-first under it.
   *
   *   GET …/timeline?limit=4&type=History
   *   08:51:33 CommentAdded · 08:52:27 CommentAdded · 08:52:38 Assigned · 08:53:10 StatusChanged
   *
   * ASCENDING. The SQL orders `OccurredAtUtc DESC` — so the handler takes the
   * newest N and hands them back oldest-first, which is `013` Q-2's chat order:
   * newest at the BOTTOM, "load earlier" above. The v3 canvas reverses that
   * ruling, so the client is what has to flip.
   *
   * PER PAGE, NOT OVER THE WHOLE LIST, and the difference is the defect:
   *
   *   page 0 asc [a b c]   page 1 asc [x y z]   (z older than a)
   *   flat then reverse  → [z y x c b a]        WRONG: the second page's rows
   *                                             sort ahead of the first page's
   *   reverse each page  → [c b a] + [z y x]    right, and strictly descending
   *
   * The cursor is untouched by either — `getNextPageParam` reads `nextCursor`
   * from the page, never from an entry — which is exactly why a display-order bug
   * here cannot be caught by the paging assertions. */
  const entries =
    timelineQuery.data?.pages.flatMap((page) => [...page.items].reverse()) ?? [];
  const counts = timelineQuery.data?.pages[0];

  /* RENDER ONLY WHAT THE SERVER SENT (AC-2). A control for a transition absent
   * from `allowedTransitions` is a control whose only outcome is a `409`, and
   * BR-1 lives in `Wasl.Domain` once. An EMPTY array renders no menu at all,
   * which is the `Closed` case — and `Closed` is terminal for comments too
   * (BR-1.5), so it is what locks the composer. */
  const transitions = ticket.allowedTransitions ?? [];
  const terminal = transitions.length === 0;

  const nameOf = (userId: string | null) =>
    users.find((user) => user.id === userId)?.fullName ?? null;

  const siblings = (otherTickets.data?.items ?? []).filter((row) => row.id !== ticket.id);
  const siblingsShown = siblings.slice(0, 3);
  const siblingsMore = (otherTickets.data?.totalCount ?? 0) - 1 - siblingsShown.length;

  const tints = tagTints(ticket.tags);
  const templates = cannedReplies.data ?? [];
  const attachable = (tagVocabulary.data ?? []).filter(
    (tag) => !ticket.tags.some((attached) => attached.id === tag.id),
  );

  return (
    <main className={styles.page}>
      <div className={styles.sheet} ref={screenRef}>
        {/* ── the header row ───────────────────────────────────────────────── */}
        <header className={styles.headRow}>
          <Link className={styles.backLink} to="/tickets">
            <span className={styles.backChevron} aria-hidden="true">
              <IconChevronDown size={15} />
            </span>
            {t('detail.backToList')}
          </Link>

          <span className={styles.topDivider} aria-hidden="true" />

          {/* `bdi` and `dir="ltr"`. A ticket number is an identifier: never
              localized, never digit-shaped by the locale, and never reordered by
              the surrounding paragraph's direction. */}
          <bdi className={styles.ticketId} dir="ltr">
            {ticket.ticketNumber}
          </bdi>

          {/* THE STATUS PILL IS THE CONTROL — the v3 canvas's own change, and it
              replaces a «اتخاذ إجراء» menu whose only buildable item was a status
              transition. Terminal renders the pill as text: there is nothing to
              move to, and a disabled control invites a hunt for what enables it. */}
          {terminal ? (
            <span className={cx(styles.statusPill, STATUS_CLASS[ticket.status])}>
              <span className={styles.statusDot} aria-hidden="true" />
              {t(`status.${ticket.status}`)}
            </span>
          ) : (
            <div className={styles.popWrap} data-pop="status">
              <button
                type="button"
                className={cx(
                  styles.statusPill,
                  styles.statusButton,
                  STATUS_CLASS[ticket.status],
                )}
                aria-haspopup="menu"
                aria-expanded={openPop === 'status'}
                onClick={() => setOpenPop((at) => (at === 'status' ? null : 'status'))}
              >
                <span className={styles.statusDot} aria-hidden="true" />
                {t(`status.${ticket.status}`)}
                <IconChevronDown size={12} aria-hidden="true" />
              </button>

              {openPop === 'status' ? (
                <div className={styles.statusMenu} role="menu">
                  <span className={styles.popHead}>{t('detail.statusMenuHead')}</span>

                  {/* THE CURRENT STATUS IS SHOWN AND IS NOT ACTIONABLE. It is
                      absent from `allowedTransitions` — a same-status transition
                      is a `409`, not a no-op — so it is rendered from
                      `ticket.status` with the tick, as the canvas draws it, and
                      as a `<span>` rather than a disabled button. */}
                  <span className={cx(styles.statusItem, styles.statusItemCurrent)}>
                    <span
                      className={cx(styles.statusDot, STATUS_CLASS[ticket.status])}
                      aria-hidden="true"
                    />
                    {t(`status.${ticket.status}`)}
                    <span className={styles.statusTick} aria-hidden="true">
                      <IconCheck size={14} />
                    </span>
                  </span>

                  {transitions.map((next) => (
                    <button
                      key={next}
                      type="button"
                      role="menuitem"
                      className={styles.statusItem}
                      disabled={status.isPending}
                      onClick={() => {
                        setOpenPop(null);
                        setPending(next);
                        setNote('');
                        if (!noteRequiredFor(next)) status.mutate({ next, note: '' });
                      }}
                    >
                      <span
                        className={cx(styles.statusDot, STATUS_CLASS[next])}
                        aria-hidden="true"
                      />
                      {t(`status.${next}`)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}

          {/* Priority, and it is READ-ONLY on purpose: there is no
              change-priority endpoint. The canvas draws it as a pill and the
              subject card repeats it as a coloured edge — one small chip is not
              enough to change a triage decision. */}
          <span className={cx(styles.prioPill, PRIORITY_CLASS[ticket.priority])}>
            <IconArrowUp size={13} aria-hidden="true" />
            {t(`priority.${ticket.priority}`)}
          </span>

          {/* «اتخاذ إجراء» — one live item and three inert ones. See the header
              note; the ruling that put them on screen is the owner's. */}
          <div className={cx(styles.popWrap, styles.headEnd)} data-pop="actions">
            <button
              type="button"
              className={styles.actionButton}
              aria-haspopup="true"
              aria-expanded={openPop === 'actions'}
              onClick={() => setOpenPop((at) => (at === 'actions' ? null : 'actions'))}
            >
              {t('detail.takeAction')}
              <IconChevronDown size={14} aria-hidden="true" />
            </button>

            {openPop === 'actions' ? (
              <div className={styles.actionMenu} role="menu">
                {/* THE INERT THREE. `disabled` AND a title: a control that
                    refuses without saying why is the defect this whole screen was
                    rebuilt to avoid. `aria-disabled` is not used instead —
                    `disabled` is what keeps it out of the tab order, and there is
                    nothing here for a keyboard to reach. */}
                {(
                  [
                    ['escalate', <IconArrowUp size={15} aria-hidden="true" key="e" />],
                    ['merge', <IconTicket size={15} aria-hidden="true" key="m" />],
                    ['extendDue', <IconEscalate size={15} aria-hidden="true" key="d" />],
                  ] as const
                ).map(([key, glyph]) => (
                  <button
                    key={key}
                    type="button"
                    role="menuitem"
                    className={styles.actionItem}
                    disabled
                    title={t('detail.actionUnavailable')}
                  >
                    {glyph}
                    {t(`detail.action.${key}`)}
                  </button>
                ))}

                <span className={styles.actionSep} aria-hidden="true" />

                {/* THE ONE THAT WORKS, and it is the status machine's — not a
                    second path to Closed. Absent when BR-1 does not allow it,
                    which is every ticket already Closed and every
                    `PendingCustomer`. */}
                {transitions.includes('Closed') ? (
                  <button
                    type="button"
                    role="menuitem"
                    className={cx(styles.actionItem, styles.actionItemDanger)}
                    onClick={() => {
                      setOpenPop(null);
                      setPending('Closed');
                      setNote('');
                      if (!noteRequiredFor('Closed'))
                        status.mutate({ next: 'Closed', note: '' });
                    }}
                  >
                    <IconClose size={15} aria-hidden="true" />
                    {t('detail.action.close')}
                  </button>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.actionItem}
                    disabled
                    title={t('detail.closeNotAllowed')}
                  >
                    <IconClose size={15} aria-hidden="true" />
                    {t('detail.action.close')}
                  </button>
                )}
              </div>
            ) : null}
          </div>

          {ticket.isEscalated ? (
            /* READ-ONLY too. `016` owns raising and clearing it; the flag is on
               this response and nothing here can change it. */
            <span className={styles.escalatedPill}>
              <IconEscalate size={13} aria-hidden="true" />
              {t('detail.escalated')}
            </span>
          ) : null}
        </header>

        {/* ── the banners, one per answer the server can give ───────────────── */}
        {conflict ? (
          <div className={cx(styles.noticeBar, styles.noticeWarn)} role="alert">
            <div className={styles.noticeText}>
              <strong>{t('detail.conflictTitle')}</strong>
              <span>{t('detail.conflictBody')}</span>
            </div>
            <Button
              buttonType="secondary-outline"
              text={t('detail.reload')}
              onClick={() => {
                setConflict(false);
                void ticketQuery.refetch();
              }}
            />
          </div>
        ) : null}

        {/* THE `403` IS A TOAST NOW, not a banner — `design/feedback-layer.md`
            §1.2, ruled 2026-09-05. It is fired from `onWriteError`; nothing is
            rendered here.

            The scope of the failure is what decides the surface, and a denial is
            REQUEST-WIDE: there is no field the reader can correct, so an inline
            message sits beside controls that are not the problem. The `409`
            directly above stays inline for the same rule read the other way — it
            is about this record, it offers a reload, and the reader has to see
            it next to what changed.

            `10-shared-patterns.md` said the opposite — "forbidden goes inline
            beside the control, never a toast" — and it was one of only two rules
            recoverable before §04 arrived. The matrix overturned it. Guessing
            from the two known rules would have preserved exactly the wrong
            one. */}

        {/* A `400` on `expectedVersion` is a defect in THIS client. Shown as one —
            not as a recoverable error with a retry — because a reader cannot cause
            it and cannot fix it, and "try again" would be a lie (AC-5). */}
        {clientBug ? (
          <div className={cx(styles.noticeBar, styles.noticeDanger)} role="alert">
            <div className={styles.noticeText}>
              <strong>{t('detail.versionRejectedTitle')}</strong>
              <span>{clientBug}</span>
            </div>
          </div>
        ) : null}

        {/* The note BR-1.2 demands, when the chosen transition needs one. */}
        {pending && noteRequiredFor(pending) ? (
          <div className={styles.noteCard}>
            <h3 className={styles.noteTitle}>
              {t('detail.moveTo', { status: t(`status.${pending}`) })}
            </h3>
            <Textarea
              label={t('detail.note')}
              placeholder={t('detail.noteRequired')}
              value={note}
              onChange={setNote}
              rows={2}
            />
            <div className={styles.noteActions}>
              <Button
                buttonType="secondary-outline"
                text={t('cancel', { ns: 'common' })}
                onClick={() => {
                  setPending(null);
                  setNote('');
                }}
              />
              <Button
                text={t('detail.confirm')}
                loading={status.isPending}
                disabled={note.trim() === ''}
                onClick={() => status.mutate({ next: pending, note })}
              />
            </div>
          </div>
        ) : null}

        <div className={cx(styles.layout, styles.layoutWide)}>
          {/* ── the rail ───────────────────────────────────────────────────── */}
          <aside className={cx(styles.rail, styles.railCard)}>
            {/* THE GROUP IS THE ANCHOR, not the control that opens the panel.
                The owner's frame puts the panel's start edge flush with the
                rail's, growing over the content column — and a 316px panel
                anchored to a 28px pencil lands wherever that arithmetic puts it.
                One `position: relative` box, one panel. */}
            <div className={cx(styles.railGroup, styles.popWrap)} data-pop="assignee">
              <span className={styles.groupLabel}>{t('detail.assignee')}</span>

              {ticket.assignee ? (
                <div className={styles.assigneeRow}>
                  <Avatar name={ticket.assignee.fullName} size={30} />
                  <span className={styles.assigneeName} dir="auto">
                    {ticket.assignee.fullName}
                  </span>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={t('detail.changeAssignee')}
                    aria-expanded={openPop === 'assignee'}
                    onClick={() =>
                      setOpenPop((at) => (at === 'assignee' ? null : 'assignee'))
                    }
                  >
                    <IconEdit size={15} aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <div className={styles.unassignedBlock}>
                  <span className={styles.assigneeRow}>
                    <span className={styles.avatarEmpty} aria-hidden="true">
                      <IconAssign size={15} />
                    </span>
                    <span className={styles.assigneeMuted}>{t('detail.unassigned')}</span>
                  </span>

                  {/* BR-2.2 — an Agent may self-assign an UNASSIGNED ticket, and
                      the server decides (AC-7). Offered to everyone; a refusal
                      comes back as the 403 banner above, which is the honest
                      shape: hiding it would say self-assignment is impossible
                      rather than that this one is. */}
                  <button
                    type="button"
                    className={styles.selfAssign}
                    aria-expanded={openPop === 'assignee'}
                    onClick={() =>
                      setOpenPop((at) => (at === 'assignee' ? null : 'assignee'))
                    }
                  >
                    {t('detail.assign')}
                  </button>
                </div>
              )}

              {/* ONE PANEL FOR BOTH BRANCHES. It was two — one inside each — and
                  they had to agree about geometry, `currentId` and the busy flag;
                  only the stylesheet was keeping them looking alike. */}
              {openPop === 'assignee' ? (
                <AssigneePanel
                  users={users}
                  currentId={ticket.assignee?.id ?? null}
                  filter={assigneeFilter}
                  onFilter={setAssigneeFilter}
                  busy={assignee.isPending}
                  onPick={(next) => assignee.mutate(next)}
                />
              ) : null}
            </div>

            <span className={styles.railRule} aria-hidden="true" />

            <div className={styles.railGroup}>
              <span className={styles.groupLabel}>{t('list.column.customer')}</span>
              <div className={styles.customerBlock}>
                {/* `032` built the profile, so this is a link rather than the text
                    `026` Q-3 settled for. */}
                <Link
                  className={styles.customerName}
                  to={`/customers/${ticket.customer.id}`}
                  dir="auto"
                >
                  {ticket.customer.fullName}
                </Link>
                {ticket.customer.companyName ? (
                  <span className={styles.customerCompany} dir="auto">
                    {ticket.customer.companyName}
                  </span>
                ) : null}
              </div>

              {siblingsShown.length > 0 ? (
                <div className={styles.siblings}>
                  <span className={styles.groupLabel}>{t('detail.otherTickets')}</span>
                  {siblingsShown.map((row) => (
                    <Link
                      key={row.id}
                      className={styles.siblingRow}
                      to={`/tickets/${row.id}`}
                    >
                      <span
                        className={cx(styles.siblingDot, STATUS_CLASS[row.status])}
                        aria-hidden="true"
                      />
                      <span className={styles.siblingSubject} dir="auto">
                        {row.subject}
                      </span>
                      {/* The last four digits, LTR-isolated. The full number is
                          the row's accessible name; the tail is what fits. */}
                      <bdi className={styles.siblingNo} dir="ltr">
                        {`${DOT}${row.ticketNumber.slice(-3)}`}
                      </bdi>
                    </Link>
                  ))}
                  {siblingsMore > 0 ? (
                    <span className={styles.siblingMore}>
                      {t('detail.otherTicketsMore', {
                        count: siblingsMore,
                        formatted: formatNumber(siblingsMore, lang),
                      })}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            <span className={styles.railRule} aria-hidden="true" />

            <div className={styles.facts}>
              <div className={styles.factRow}>
                <span className={styles.factLabel}>{t('list.column.channel')}</span>
                <span className={cx(styles.factValue, styles.factWithIcon)}>
                  {(() => {
                    /* The glyph BESIDE the label, never instead of it — the same
                       rule the list row keeps. An icon alone would make the one
                       fact a reader scans for depend on recognising five
                       silhouettes. */
                    const Glyph = CHANNEL_ICON[ticket.channel];
                    return Glyph ? <Glyph size={14} aria-hidden="true" /> : null;
                  })()}
                  {t(`channel.${ticket.channel}`)}
                </span>
              </div>
              <div className={styles.factRow}>
                <span className={styles.factLabel}>{t('field.category')}</span>
                <span className={styles.factValue}>
                  {t(`category.${ticket.category}`)}
                </span>
              </div>
              <div className={styles.factRow}>
                <span className={styles.factLabel}>{t('list.column.created')}</span>
                <span className={cx(styles.factValue, styles.factDate)}>
                  {formatDateTime(ticket.createdAtUtc, lang)}
                </span>
              </div>
              <div className={styles.factRow}>
                <span className={styles.factLabel}>{t('detail.updated')}</span>
                <span className={cx(styles.factValue, styles.factDate)}>
                  {formatDateTime(ticket.updatedAtUtc, lang)}
                </span>
              </div>
              {/* Only when there is one. `ClosedAtUtc` is on the response and the
                  canvas has no row for it — it drew a closing time inside the SLA
                  block, which is not built. This is that fact, kept, in the one
                  place on the rail that is only facts. */}
              {ticket.closedAtUtc ? (
                <div className={styles.factRow}>
                  <span className={styles.factLabel}>{t('detail.closedAt')}</span>
                  <span className={cx(styles.factValue, styles.factDate)}>
                    {formatDateTime(ticket.closedAtUtc, lang)}
                  </span>
                </div>
              ) : null}
            </div>
          </aside>

          {/* ── the main column ────────────────────────────────────────────── */}
          <div className={cx(styles.main, styles.mainGap)}>
            <section
              className={cx(styles.subjectCard, PRIORITY_CLASS[ticket.priority])}
              aria-label={t('detail.description')}
            >
              <h1 className={styles.subjectTitle} dir="auto">
                {ticket.subject}
              </h1>
              <p className={styles.descriptionText} dir="auto">
                {ticket.description}
              </p>

              <div className={styles.tagRow}>
                {ticket.tags.map((tag, index) => (
                  <span
                    key={tag.id}
                    /* Chosen by the tag's NAME and de-collided within the ticket —
                       `tagTints` says why it is both. */
                    className={cx(styles.tag, tints[index])}
                    dir="auto"
                  >
                    {tag.name}
                    <button
                      type="button"
                      className={styles.tagRemove}
                      aria-label={t('detail.removeTag', { name: tag.name })}
                      disabled={tagWrite.isPending}
                      onClick={() => tagWrite.mutate({ tagId: tag.id, attach: false })}
                    >
                      <IconClose size={11} aria-hidden="true" />
                    </button>
                  </span>
                ))}

                {attachable.length > 0 ? (
                  <div className={styles.popWrap} data-pop="tag">
                    <button
                      type="button"
                      className={styles.tagAdd}
                      aria-expanded={openPop === 'tag'}
                      onClick={() => setOpenPop((at) => (at === 'tag' ? null : 'tag'))}
                    >
                      <IconAdd size={12} aria-hidden="true" />
                      {t('detail.addTag')}
                    </button>
                    {openPop === 'tag' ? (
                      <div className={styles.tagMenu} role="menu">
                        {/* Only the tags NOT already attached — offering an
                            attached one offers a write the server has applied. */}
                        {attachable.map((tag) => (
                          <button
                            key={tag.id}
                            type="button"
                            role="menuitem"
                            className={styles.tagMenuItem}
                            disabled={tagWrite.isPending}
                            onClick={() =>
                              tagWrite.mutate({ tagId: tag.id, attach: true })
                            }
                            dir="auto"
                          >
                            {tag.name}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>

            <section className={styles.feedCard}>
              {/* ── the composer, ABOVE the feed ──────────────────────────── */}
              {terminal ? (
                <div className={styles.composeLocked}>
                  <span className={styles.lockedIcon} aria-hidden="true">
                    <IconEyeOff size={16} />
                  </span>
                  <span>{t('detail.closedNoComment')}</span>
                </div>
              ) : (
                <div className={styles.composeBox}>
                  {sendFailed && !conflict && !clientBug ? (
                    <div className={styles.sendError} role="alert">
                      <strong>{t('detail.sendFailedTitle')}</strong>
                      <span>{t('detail.sendFailedBody')}</span>
                    </div>
                  ) : null}

                  <div
                    className={cx(
                      styles.composeShell,
                      sendFailed && styles.composeShellBad,
                    )}
                  >
                    <Textarea
                      label={t('detail.comment')}
                      labelHidden
                      placeholder={t(
                        internal
                          ? 'detail.internalPlaceholder'
                          : 'detail.commentPlaceholder',
                      )}
                      value={draft}
                      onChange={setDraft}
                      rows={3}
                    />

                    <div className={styles.composeBar}>
                      {templates.length > 0 ? (
                        <div className={styles.popWrap} data-pop="template">
                          {/* `034`'s templates. They INSERT into the draft rather
                              than sending: a template is a starting point, and a
                              picker that sent would post an unedited form letter
                              with one click. */}
                          <button
                            type="button"
                            className={styles.composeTool}
                            aria-expanded={openPop === 'template'}
                            onClick={() =>
                              setOpenPop((at) => (at === 'template' ? null : 'template'))
                            }
                          >
                            <IconComment size={14} aria-hidden="true" />
                            {t('detail.useTemplate')}
                          </button>
                          {openPop === 'template' ? (
                            <div className={styles.templateMenu} role="menu">
                              <span className={styles.popHead}>
                                {`${t('detail.cannedReplies')} ${DOT} ${t(
                                  `category.${ticket.category}`,
                                )}`}
                              </span>
                              {templates.map((reply) => (
                                <button
                                  key={reply.id}
                                  type="button"
                                  role="menuitem"
                                  className={styles.templateItem}
                                  onClick={() => {
                                    setDraft(reply.body);
                                    setOpenPop(null);
                                  }}
                                >
                                  <span className={styles.templateTitle} dir="auto">
                                    {reply.title}
                                  </span>
                                  <span className={styles.templatePreview} dir="auto">
                                    {reply.body}
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      <span className={styles.composeSep} aria-hidden="true" />

                      {/* BR-5.4's switch. `role="switch"` rather than a checkbox:
                          it is not a form field being submitted, it is a mode the
                          next comment is written in — and the note under it
                          changes with the mode, which is the only place a reader
                          learns what internal means. */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={internal}
                        className={styles.switchWrap}
                        onClick={() => setInternal((on) => !on)}
                      >
                        <span
                          className={cx(styles.switchTrack, internal && styles.switchOn)}
                        >
                          <span className={styles.switchKnob} />
                        </span>
                        {t('detail.markInternal')}
                      </button>

                      <span
                        /* AMBER WHEN THE COMMENT IS INTERNAL — the product
                           owner's frame, and it is the switch's own colour: the
                           button that sends it says which kind it is sending. */
                        className={cx(
                          styles.composeSend,
                          internal && styles.composeSendInternal,
                        )}
                      >
                        <Button
                          text={t('detail.send')}
                          loading={comment.isPending}
                          disabled={draft.trim() === ''}
                          onClick={() => comment.mutate(draft.trim())}
                        />
                      </span>
                    </div>

                    <span
                      className={cx(
                        styles.internalNote,
                        internal && styles.internalNoteOn,
                      )}
                    >
                      {t(internal ? 'detail.internalHintOn' : 'detail.internalHint')}
                    </span>
                  </div>
                </div>
              )}

              {/* ── the two tabs, each labelled with its own total ─────────── */}
              <div className={styles.tabs} role="tablist">
                {(['Comments', 'History'] as const).map((which) => {
                  const count =
                    which === 'Comments' ? counts?.commentCount : counts?.historyCount;
                  return (
                    <button
                      key={which}
                      type="button"
                      role="tab"
                      aria-selected={tab === which}
                      className={cx(styles.tab, tab === which && styles.tabActive)}
                      onClick={() => {
                        setTab(which);
                        setShown(FEED_STEP);
                      }}
                    >
                      {t(
                        which === 'Comments' ? 'detail.tabComments' : 'detail.tabHistory',
                      )}
                      {/* BOTH counts come back on EITHER request (`034` says so
                          in the DTO), so the inactive tab is labelled without a
                          second fetch. Absent until the first page lands —
                          rendering a 0 that becomes 12 is worse than a gap. */}
                      {count === undefined ? null : (
                        <span className={styles.tabCount}>
                          {formatNumber(count, lang)}
                        </span>
                      )}
                    </button>
                  );
                })}
                <span className={styles.tabsNote}>{t('detail.newestFirst')}</span>
              </div>

              {/* ── the feed ──────────────────────────────────────────────── */}
              {timelineQuery.isPending ? (
                <FeedSkeleton />
              ) : timelineQuery.isError ? (
                <div className={styles.pane}>
                  <span className={styles.patternMark} aria-hidden="true">
                    <Mark size={40} />
                  </span>
                  <p className={styles.paneTitle}>{t('detail.errorTitle')}</p>
                  <p className={styles.paneBody}>{t('detail.errorBody')}</p>
                  {/* The trace id, LTR and monospaced: it is the one string a
                      reader can hand to somebody who can act on it, and it
                      matches the server log by construction (`002`). */}
                  {timelineQuery.error instanceof ApiError &&
                  timelineQuery.error.problem?.traceId ? (
                    <bdi className={styles.paneTrace} dir="ltr">
                      {timelineQuery.error.problem.traceId}
                    </bdi>
                  ) : null}
                  <button
                    type="button"
                    className={styles.paneCta}
                    onClick={() => void timelineQuery.refetch()}
                  >
                    {t('detail.retry')}
                  </button>
                </div>
              ) : entries.length === 0 ? (
                <div className={styles.pane}>
                  <span className={styles.patternMark} aria-hidden="true">
                    <Mark size={40} />
                  </span>
                  <p className={styles.paneTitle}>{t('detail.emptyTitle')}</p>
                  <p className={styles.paneBody}>{t('detail.emptyBody')}</p>
                </div>
              ) : (
                <div className={styles.feedList}>
                  {/* FOUR AT A TIME. `entries` holds every row fetched; this is
                      the window on it. */}
                  {/* Newest first — the v3 canvas's «الأحدث أولاً», and a reversal
                      of `027` Q-2. The flip happens where `entries` is built, per
                      page; see the block there for the measurement and for why
                      one reverse over the flattened list is wrong. */}
                  {entries
                    .slice(0, shown)
                    .map((entry) =>
                      entry.type === 'Comment' ? (
                        <CommentRow key={entry.id} entry={entry} />
                      ) : (
                        <HistoryRow key={entry.id} entry={entry} nameOf={nameOf} />
                      ),
                    )}

                  {/* AT THE FOOT, because the feed reads newest-first: older is
                      further down. Not a page number — `013` measured a comment
                      appearing on two consecutive pages when the cursor and the
                      order disagreed. */}
                  {shown < entries.length || timelineQuery.hasNextPage ? (
                    <div className={styles.loadOlderWrap}>
                      <button
                        type="button"
                        className={styles.loadOlder}
                        onClick={() => {
                          /* REVEAL FIRST, FETCH ONLY WHEN THE FETCHED ROWS RUN
                             OUT. One control for both, because to a reader they
                             are one action — "show me older" — and a second
                             button that appeared every fifty rows would be a
                             control whose meaning changes with the scroll. */
                          if (shown < entries.length) {
                            setShown((n) => n + FEED_STEP);
                            return;
                          }
                          void timelineQuery.fetchNextPage().then(() => {
                            setShown((n) => n + FEED_STEP);
                          });
                        }}
                        disabled={timelineQuery.isFetchingNextPage}
                      >
                        <IconChevronDown size={14} aria-hidden="true" />
                        {t('detail.loadOlder')}
                      </button>
                    </div>
                  ) : (
                    <p className={styles.feedEnd}>{t('detail.feedStart')}</p>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

/**
 * The assignee panel — a search box and the list, as the canvas draws it.
 *
 * Two things it does NOT draw, because the data does not exist: the department
 * beside each role (`SupportUserOption` is `(id, fullName, role)`), and any
 * indication of who is *allowed* to take this ticket. The second is deliberate
 * as well as unavoidable: BR-2 is enforced in the handler off `ICurrentUser`, so
 * the only honest client is one that offers the list and reports the refusal.
 */
function AssigneePanel({
  users,
  currentId,
  filter,
  onFilter,
  busy,
  onPick,
}: {
  users: { id: string; fullName: string; role: string }[];
  currentId: string | null;
  filter: string;
  onFilter: (next: string) => void;
  busy: boolean;
  onPick: (next: string | null) => void;
}) {
  const { t } = useTranslation('tickets');
  const needle = filter.trim().toLocaleLowerCase();
  const shown =
    needle === ''
      ? users
      : users.filter((u) => u.fullName.toLocaleLowerCase().includes(needle));

  return (
    <div className={styles.assignPanel} data-pop="assignee">
      <div className={styles.assignHead}>
        <span className={styles.assignTitle}>{t('detail.assigneePanelTitle')}</span>
        <label className={styles.assignSearch}>
          <IconSearch size={14} aria-hidden="true" />
          <input
            type="text"
            value={filter}
            onChange={(event) => onFilter(event.target.value)}
            placeholder={t('detail.assigneeSearch')}
            aria-label={t('detail.assigneeSearch')}
          />
        </label>
      </div>

      <div className={styles.assignList}>
        {shown.length === 0 ? (
          <p className={styles.assignNone}>{t('detail.assigneeNoMatch')}</p>
        ) : (
          shown.map((user) => (
            <button
              key={user.id}
              type="button"
              className={cx(
                styles.assignRow,
                user.id === currentId && styles.assignRowCurrent,
              )}
              disabled={busy}
              onClick={() => onPick(user.id)}
            >
              <Avatar name={user.fullName} size={28} />
              <span className={styles.assignWho}>
                <span className={styles.assignName} dir="auto">
                  {user.fullName}
                </span>
                <span className={styles.assignRole}>{t(`role.${user.role}`)}</span>
              </span>
              {user.id === currentId ? (
                <span className={styles.statusTick} aria-hidden="true">
                  <IconCheck size={15} />
                </span>
              ) : null}
            </button>
          ))
        )}
      </div>

      {currentId ? (
        <button
          type="button"
          className={styles.assignClear}
          disabled={busy}
          onClick={() => onPick(null)}
        >
          {t('detail.unassign')}
        </button>
      ) : null}

      <p className={styles.assignNote}>{t('detail.pickerHint')}</p>
    </div>
  );
}
