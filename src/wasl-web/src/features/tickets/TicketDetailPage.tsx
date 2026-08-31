import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { Badge } from '../../components/Badge/Badge';
import { Button } from '../../components/Button/Button';
import { Checkbox } from '../../components/Checkbox/Checkbox';
import { Dropdown } from '../../components/Dropdown/Dropdown';
import { Textarea } from '../../components/Textarea/Textarea';
import { IconChevronDown, IconClose } from '../../icons/icons';
import { ApiError } from '../../lib/api';
import type {
  TicketResponse,
  TicketStatus,
  TimelineEntry,
} from '../../lib/api-types.provisional';
import { cx } from '../../lib/cx';
import { formatDateTime, type Lang } from '../../lib/formatters';

import styles from './TicketDetail.module.css';
import {
  addTicketComment,
  attachTicketTag,
  detachTicketTag,
  getCannedReplies,
  getTags,
  changeTicketAssignee,
  changeTicketStatus,
  getSupportUsers,
  getTicket,
  getTicketTimeline,
  ticketKeys,
} from './tickets.api';

/* ============================================================================
 * `027` — the ticket detail screen. The route, and the only thing that fetches.
 * ============================================================================
 * SIX ENDPOINTS, delivered across `009`, `011`, `012`, `013` and `034`, and until
 * now called by nothing:
 *
 *   GET  /api/tickets/{id}                 the ticket, with allowedTransitions
 *   GET  /api/tickets/{id}/timeline        a CURSOR — see `getTicketTimeline`
 *   POST /api/tickets/{id}/comments
 *   PUT  /api/tickets/{id}/status          expectedVersion
 *   PUT  /api/tickets/{id}/assignee        expectedVersion
 *   GET  /api/support-users                the picker
 *
 * The design is `docs/sdd/design/screens/04-ticket-detail.md` and the approved
 * preview, whose CSS module this file imports — `027` Q-5 ruled the preview IS
 * the design, so there is one stylesheet and the preview is not a second copy.
 *
 * NOTHING RENDERS A TICKET FROM A WRITE RESPONSE, and no mutation calls
 * `setQueryData` (`026` §5, `027` AC-1). Every write invalidates and the read is
 * the single source. That rule is why `assigneeName` was missing from the list for
 * three days and why the fix had to be in the projection rather than here.
 * ========================================================================== */

const TIMELINE_LIMIT = 50; /* `013`'s own default. */

/** BR-1's tone map, from `03-tickets-list.md` — one place, shared with the list. */
const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning'> = {
  New: 'neutral',
  Open: 'info',
  InProgress: 'warning',
  PendingCustomer: 'neutral',
  Resolved: 'success',
  Closed: 'neutral',
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => [...part][0] ?? '')
    .join('');
}

function Avatar({ name }: { name: string }) {
  return (
    <span className={styles.avatar} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/**
 * A collapsible section — the preview's, and the design document's accordion.
 *
 * The first version of this page rendered flat `<section>` boxes with an `<h3>`,
 * which is why the screen looked like a stack of panels rather than the approved
 * screen. The chevron ROTATES and does not mirror: a vertical disclosure has no
 * direction, so `transform: rotate` is correct in both.
 */
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
  children: React.ReactNode;
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

function StripItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.stripItem}>
      <span className={styles.stripLabel}>{label}</span>
      <span className={styles.stripValue}>{children}</span>
    </div>
  );
}

/**
 * One timeline row, and it is TWO shapes rather than one.
 *
 * **The kind comes from `type`, never from which fields are null.** Inference is
 * a rule, and two renderers eventually disagree about what an entry with a null
 * body and a null `oldValue` means — the preview says so in the same words.
 *
 * THREE CONTENT DEFECTS WERE VISIBLE ON THE FIRST SCREENSHOT and are fixed here.
 * All three shipped because this component rendered the wire's raw fields, and
 * none of them is visible from jsdom, a type, or a passing test:
 *
 *   غيّر الحالة من {{from}} إلى {{to}}     ← the interpolation was never passed
 *   CommentAdded — 01a053bb-fbb5-…         ← no key, and the raw comment id
 *   عيّن التذكرة إلى {{name}} — 01a053ba…  ← both at once
 *
 * The last one is the interesting one: an `Assigned` row's `newValue` is the
 * assignee's **id**, not their name — measured on the wire. The preview's own
 * fixture put a name there, so the design could not have shown this. The id is
 * resolved against the support-user list this page already fetches, and when it
 * cannot be resolved the row says who assigned and drops the name rather than
 * printing a GUID at a reader.
 */
function Entry({
  entry,
  lang,
  nameOf,
}: {
  entry: TimelineEntry;
  lang: Lang;
  nameOf: (id: string | null) => string | null;
}) {
  const { t } = useTranslation('tickets');
  const time = formatDateTime(entry.occurredAtUtc, lang);

  /* A COMMENT, which is the only entry with a body. `CommentAdded` is its history
   * shadow — same instant, same actor, `body: null` — so it is NOT grouped here:
   * grouping it renders an empty paragraph, and `013` writes both rows from one
   * memoized instant so the feed would show the comment twice. */
  if (entry.type === 'Comment') {
    return (
      <article className={styles.entry}>
        <Avatar name={entry.actor.fullName} />
        <div className={styles.entryMain}>
          <div className={styles.entryHead}>
            <span className={styles.entryActor} dir="auto">
              {entry.actor.fullName}
            </span>
            {entry.actor.role ? (
              <span className={styles.entryRole}>{t(`role.${entry.actor.role}`)}</span>
            ) : null}
            {entry.isInternal ? (
              /* BR-5.4 — MARKED, never hidden. The server does not filter these
                 and neither does the client. */
              <span className={styles.internalMark}>
                <Badge tone="warning" appearance="outline" label={t('detail.internal')} dot={false} />
              </span>
            ) : null}
            {entry.channel ? (
              <span className={styles.entryRole}>{t(`channel.${entry.channel}`)}</span>
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

  /* A HISTORY ROW. One line: who, what, when — the preview's shape. */
  const describe = () => {
    switch (entry.type) {
      case 'Created':
        return t('detail.event.created');

      case 'StatusChanged':
        /* The two statuses, TRANSLATED. The catalogue string interpolates them and
           the first version passed neither, so three rows read
           "غيّر الحالة من {{from}} إلى {{to}}" on screen. */
        return t('detail.event.statusChanged', {
          from: entry.oldValue ? t(`status.${entry.oldValue}`) : '',
          to: entry.newValue ? t(`status.${entry.newValue}`) : '',
        });

      case 'Assigned': {
        const name = nameOf(entry.newValue);
        return name
          ? t('detail.event.assigned', { name })
          : /* The id did not resolve — a deactivated user, or a row from before
               `011` fixed the actor columns. Say the ticket was assigned and stop;
               a GUID on screen is worse than a missing name. */
            t('detail.event.assignedUnknown');
      }

      case 'Unassigned':
        return t('detail.event.unassigned');

      case 'Escalated':
        return t('detail.event.escalated');

      case 'CommentAdded':
        /* Its `newValue` is the COMMENT'S ID. It was being appended raw. */
        return t('detail.event.commentAdded');

      default:
        return '';
    }
  };

  return (
    <div className={styles.history}>
      <span className={styles.entryActor} dir="auto">
        {entry.actor.fullName}
      </span>
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

export default function TicketDetailPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation('tickets');
  const lang: Lang = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en';
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState('');
  const [internal, setInternal] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [clientBug, setClientBug] = useState<string | null>(null);

  /* The transition awaiting its note. Local, because it is a step in one
   * interaction rather than a fact about the ticket — nothing else needs it and
   * a reload should not resume a half-finished status change. */
  const [pending, setPending] = useState<TicketStatus | null>(null);
  const [note, setNote] = useState('');

  /* The accordion and the action menu. Local: they are view state, and a reload
   * should not restore a half-open menu. */
  const [descOpen, setDescOpen] = useState(true);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [tagsOpen, setTagsOpen] = useState(true);
  /* WHICH trigger opened the take-action menu, not merely whether one did.
   *
   * There are two — the top bar's and the sticky bar's — and the sticky one exists
   * so a hundred timeline entries never force a scroll back up to act. A single
   * boolean rendered the menu in the top bar only, so pressing the sticky trigger
   * opened a menu off-screen: nothing appeared to happen. Two tests said "Found
   * multiple elements with the role button and name Take action" and that was the
   * same defect wearing a different hat. */
  const [menuAt, setMenuAt] = useState<'top' | 'sticky' | null>(null);

  const ticketQuery = useQuery({
    queryKey: ticketKeys.detail(id),
    queryFn: ({ signal }) => getTicket(id, signal),
    enabled: id !== '',
  });

  /* THE CURSOR IS NOT IN THE KEY — see `ticketKeys.timeline`. `useInfiniteQuery`
   * accumulates the pages under one key, so a write invalidates the whole feed
   * rather than one page of it, and scrolling back does not create cache entries
   * nothing ever cleans up. */
  const timelineQuery = useInfiniteQuery({
    queryKey: ticketKeys.timeline(id),
    queryFn: ({ pageParam, signal }) =>
      getTicketTimeline(
        id,
        { limit: TIMELINE_LIMIT, ...(pageParam ? { before: pageParam } : {}) },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    /* `hasMore` is the server's answer, and `nextCursor` is the only way back.
     * There is no totalCount, so nothing here counts pages. */
    getNextPageParam: (last) => (last.hasMore ? (last.nextCursor ?? undefined) : undefined),
    enabled: id !== '',
  });

  const supportUsers = useQuery({
    queryKey: ticketKeys.supportUsers(),
    queryFn: ({ signal }) => getSupportUsers(signal),
  });

  const ticket: TicketResponse | undefined = ticketQuery.data;

  /* ── the three answers a write can give ────────────────────────────────────
   *
   * 200  applied — invalidate; the READ brings the new version
   * 409  concurrency-conflict — refetch and say what happened. NEVER retried:
   *      the second write would apply to a state the reader never saw
   * 400  a bug in this client, not a user error. `expectedVersion` was missing,
   *      empty, or not base64, which a user cannot cause and cannot fix — so it
   *      must not reach them as "try again"
   *
   * Collapsing the three into "it failed" throws away the only one the reader can
   * act on, which is `027` AC-4 and AC-5. */
  const onWriteError = (error: unknown) => {
    if (error instanceof ApiError && error.problem?.type?.endsWith('errors/concurrency-conflict')) {
      setConflict(true);
      void queryClient.invalidateQueries({ queryKey: ticketKeys.detail(id) });
      return;
    }

    if (error instanceof ApiError && error.status === 400) {
      /* THE CATALOGUE'S BODY, not the server's `detail`. The server says
       * "expectedVersion is required" — accurate, and meaningless to a reader
       * who never typed a version. `detail.versionRejectedBody` says it is a
       * fault in the application, that nothing changed, and that retrying will
       * not help, which is the only useful thing to say about a 400 here. */
      setClientBug(t('detail.versionRejectedBody'));
      return;
    }

    setClientBug(null);
  };

  const afterWrite = async () => {
    setConflict(false);
    setClientBug(null);
    await queryClient.invalidateQueries({ queryKey: ticketKeys.detail(id) });
    await queryClient.invalidateQueries({ queryKey: ticketKeys.timeline(id) });
  };

  const comment = useMutation({
    mutationFn: (body: string) =>
      addTicketComment(id, { body, isInternal: internal }),
    onSuccess: async () => {
      setDraft('');
      setInternal(false);
      await afterWrite();
    },
    onError: onWriteError,
  });

  /* BR-1.2. A NOTE IS REQUIRED WHEN CLOSING WORK THAT WAS NEVER STARTED, and
   * nothing about `allowedTransitions` says so — `New → Closed` and `Open →
   * Closed` are both permitted and both answer `400` with `errors.note` when the
   * note is absent.
   *
   * This client asks for it rather than discovering it: sending the transition
   * bare would surface a validation error on a field the reader was never shown,
   * which is the worst kind — it names something that is not on screen.
   *
   * `Resolved → Closed` deliberately does NOT need one (`012` Q-1: asking for a
   * reason for the expected outcome trains people to type nothing useful), so the
   * field is offered as optional there rather than demanded. */
  const noteRequiredFor = (next: string) =>
    next === 'Closed' && (ticket?.status === 'New' || ticket?.status === 'Open');

  const status = useMutation({
    mutationFn: ({ next, note }: { next: TicketStatus; note: string }) =>
      changeTicketStatus(id, {
        status: next,
        expectedVersion: ticket?.version ?? '',
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: async () => {
      setPending(null);
      setNote('');
      await afterWrite();
    },
    onError: onWriteError,
  });

  const assignee = useMutation({
    mutationFn: (assigneeId: string | null) =>
      changeTicketAssignee(id, {
        assigneeId,
        expectedVersion: ticket?.version ?? '',
      }),
    onSuccess: afterWrite,
    onError: onWriteError,
  });

  /* `034`. The vocabulary and the templates, both bounded seeded sets — so they are
   * fetched once and cached under their own keys rather than under the ticket's:
   * invalidating a ticket must not refetch a set that did not change.
   *
   * THIS IS THE READ HALF `034` SHIPPED WITHOUT. It built the two tag writes and
   * nothing that returns the set to attach FROM, nor `tags` on the ticket, so a UI
   * could change tags it could neither list nor display. The backend lane added
   * both on 2026-08-31. */
  const tagVocabulary = useQuery({
    queryKey: ticketKeys.tags(),
    queryFn: ({ signal }) => getTags(signal),
  });

  /* Keyed by the ticket's category, because `?category=` returns a DIFFERENT list —
   * and it WIDENS rather than narrows. Measured: asking for `Billing` returned the
   * two Billing templates PLUS the two with no category, and not the Technical one.
   * A template with no category applies to every ticket, so filtering them out
   * would hide the general replies exactly when a category is known, which is
   * always. */
  const cannedReplies = useQuery({
    queryKey: ticketKeys.cannedReplies(ticketQuery.data?.category),
    queryFn: ({ signal }) => getCannedReplies(ticketQuery.data?.category, signal),
    enabled: ticketQuery.data !== undefined,
  });

  const tagWrite = useMutation({
    mutationFn: ({ tagId, attach }: { tagId: string; attach: boolean }) =>
      attach ? attachTicketTag(id, tagId) : detachTicketTag(id, tagId),
    onSuccess: afterWrite,

    /* NO expectedVersion on either write, and that is the server's shape rather
     * than an omission here: attaching is not a state transition, and two people
     * attaching different tags do not conflict. So this is the one write on the
     * screen that cannot answer a 409 — and `onWriteError` still routes anything
     * else, which `034` Q-4 makes reachable: detaching is open to the assignee and
     * any Manager, so an Agent who is neither gets a 403. */
    onError: onWriteError,
  });

  if (ticketQuery.isPending) {
    return (
      <main className={styles.page}>
        <div className={styles.skelRow} aria-busy="true" aria-live="polite">
          {t('detail.loading', { defaultValue: '' })}
        </div>
      </main>
    );
  }

  if (ticketQuery.isError || !ticket) {
    const notFound = ticketQuery.error instanceof ApiError && ticketQuery.error.status === 404;

    return (
      <main className={styles.page}>
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>
            {t(notFound ? 'detail.notFoundTitle' : 'detail.errorTitle')}
          </p>
          <p className={styles.emptyBody}>
            {t(notFound ? 'detail.notFoundBody' : 'detail.errorBody')}
          </p>
          {notFound ? (
            <Link className={styles.emptyAction} to="/tickets">
              {t('detail.backToList')}
            </Link>
          ) : (
            <button
              type="button"
              className={styles.emptyAction}
              onClick={() => void ticketQuery.refetch()}
            >
              {t('detail.retry')}
            </button>
          )}
        </div>
      </main>
    );
  }

  const entries = timelineQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const counts = timelineQuery.data?.pages[0];

  /* RENDER ONLY WHAT THE SERVER SENT (AC-2). A control for a transition absent
   * from `allowedTransitions` is a control whose only outcome is a `409`, and
   * BR-1 lives in `Wasl.Domain` once. An EMPTY array renders no control at all,
   * which is the `Closed` case. */
  const transitions = ticket.allowedTransitions ?? [];

  /* BR-2 mirrored for AFFORDANCE ONLY — the server decides (AC-7). The picker is
   * offered to everyone and a refusal comes back as a `403`, which is the honest
   * shape: hiding the control would make an Agent believe self-assignment is
   * impossible rather than that this particular assignment is. */
  const users = supportUsers.data ?? [];

  /* An `Assigned` row carries the assignee's ID, not their name — measured. This
   * resolves it against the list the picker already loaded, so the timeline costs
   * no extra request. Null when it cannot be resolved: a deactivated user is
   * absent from the picker (`011`'s contract says so explicitly), and a GUID on
   * screen is worse than a missing name. */
  const nameOf = (userId: string | null) =>
    users.find((user) => user.id === userId)?.fullName ?? null;

  return (
    /* THE PREVIEW'S STRUCTURE, and the first version of this page used none of it.
     *
     * `027` Q-5 ruled the preview IS the design, and this file already imported
     * its stylesheet — so every class below existed and went unused while the
     * screen rendered as a stack of full-width boxes. A screenshot is what showed
     * it; no test could, because jsdom has no layout and every assertion here is
     * about behaviour.
     *
     * page › screen › topBar › layout( rail | main ) › sections › stickyBar.
     *
     * THE OUTER `.page` IS LOAD-BEARING and the first relayout dropped it. It is
     * where `--rail-width` is declared, and `.layout` reads
     * `grid-template-columns: var(--rail-width) minmax(0, 1fr)` — an undefined
     * custom property makes the whole declaration invalid, so the grid silently
     * collapses to one column and the rail stacks full-width above the content.
     * Nothing errors, the classes are all applied, and only a screenshot shows it. */
    <main className={styles.page}>
      <div className={styles.screen}>
      <header className={styles.topBar}>
        <Link className={styles.anchor} to="/tickets">
          {t('detail.backToList')}
        </Link>

        {/* `bdi` and `dir="ltr"`. A ticket number is an identifier: never
            localized, never digit-shaped by the locale, and never reordered by
            the surrounding paragraph's direction. */}
        <bdi className={styles.ticketNo} dir="ltr">
          {ticket.ticketNumber}
        </bdi>

        <Badge
          tone={STATUS_TONE[ticket.status] ?? 'neutral'}
          label={t(`status.${ticket.status}`)}
        />

        <div className={cx(styles.topActions, styles.topSpacer)}>
          {transitions.length > 0 ? (
            <div className={styles.menuWrap}>
              {/* A MENU, not inline buttons — `027` Q-3, ruled by the product
                  owner: "controls that appear and disappear per state read as a
                  broken toolbar". The first version of this page rendered one
                  button per transition and contradicted that ruling. */}
              <Button
                text={t('detail.takeAction')}
                iconEnd={<IconChevronDown size={16} />}
                onClick={() => setMenuAt((at) => (at === 'top' ? null : 'top'))}
                aria-expanded={menuAt === 'top'}
                aria-controls="take-action-top"
              />
              {menuAt === 'top' ? (
                <div className={styles.menu} role="menu" id="take-action-top">
                  {/* RENDERED FROM `allowedTransitions`. BR-1 lives in
                      `Wasl.Domain` once; an empty array renders no menu at all,
                      which is the `Closed` case. */}
                  {transitions.map((next) => (
                    <button
                      key={next}
                      type="button"
                      role="menuitem"
                      className={styles.menuItem}
                      onClick={() => {
                        setMenuAt(null);
                        setPending(next);
                        setNote('');
                        if (!noteRequiredFor(next)) {
                          status.mutate({ next, note: '' });
                        }
                      }}
                    >
                      {t('detail.moveTo', { status: t(`status.${next}`) })}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <div className={styles.layout}>
        <aside className={styles.rail}>
          <div className={styles.railBlock}>
            <span className={styles.railLabel}>{t('list.column.priority')}</span>
            <span className={styles.railValue}>{t(`priority.${ticket.priority}`)}</span>
          </div>

          {ticket.isEscalated ? (
            /* READ-ONLY. Escalation is `016`; the flag is on this response and
               nothing here can raise or clear it. */
            <div className={cx(styles.railBlock, styles.escalated)}>
              <span className={styles.escalatedHead}>{t('detail.escalated')}</span>
              <p className={styles.escalatedBody}>{t('detail.escalatedNote')}</p>
            </div>
          ) : null}

          <nav className={styles.anchors}>
            <button
              type="button"
              className={cx(styles.anchor, descOpen && styles.anchorActive)}
              onClick={() => setDescOpen(true)}
            >
              {t('detail.description')}
            </button>
            <button
              type="button"
              className={cx(styles.anchor, tagsOpen && styles.anchorActive)}
              onClick={() => setTagsOpen(true)}
            >
              {t('detail.tags')}
            </button>
            <button
              type="button"
              className={cx(styles.anchor, timelineOpen && styles.anchorActive)}
              onClick={() => setTimelineOpen(true)}
            >
              {t('detail.timeline')}
            </button>
          </nav>
        </aside>

        <div className={styles.main}>
          {conflict ? (
            <div className={styles.banner} role="alert">
              <strong>{t('detail.conflictTitle')}</strong>
              <span>{t('detail.conflictBody')}</span>
              <span className={styles.bannerAction}>
                <Button
                  buttonType="secondary-outline"
                  text={t('detail.reload')}
                  onClick={() => {
                    setConflict(false);
                    void ticketQuery.refetch();
                  }}
                />
              </span>
            </div>
          ) : null}

          {/* A `400` on `expectedVersion` is a defect in THIS client. Shown as one
              — not as a recoverable error with a retry — because a reader cannot
              cause it and cannot fix it, and "try again" would be a lie (AC-5). */}
          {clientBug ? (
            <div className={styles.clientBug} role="alert">
              <strong>{t('detail.versionRejectedTitle')}</strong>
              <p style={{ margin: 0 }}>{clientBug}</p>
            </div>
          ) : null}

          <h2 className={styles.subject} dir="auto">
            {ticket.subject}
          </h2>

          <div className={styles.strip}>
            <StripItem label={t('list.column.status')}>
              <Badge
                tone={STATUS_TONE[ticket.status] ?? 'neutral'}
                label={t(`status.${ticket.status}`)}
              />
            </StripItem>
            <StripItem label={t('list.column.customer')}>
              <span dir="auto">{ticket.customer?.fullName ?? ''}</span>
            </StripItem>
            <StripItem label={t('detail.assignee')}>
              {ticket.assignee ? (
                <span dir="auto">{ticket.assignee.fullName}</span>
              ) : (
                <span className={styles.stripMuted}>{t('detail.unassigned')}</span>
              )}
            </StripItem>
            <StripItem label={t('list.column.channel')}>
              {t(`channel.${ticket.channel}`)}
            </StripItem>
            <StripItem label={t('field.category')}>
              {t(`category.${ticket.category}`)}
            </StripItem>
            <StripItem label={t('list.column.priority')}>
              {t(`priority.${ticket.priority}`)}
            </StripItem>
            <StripItem label={t('list.column.created')}>
              {formatDateTime(ticket.createdAtUtc, lang)}
            </StripItem>
            <StripItem label={t('detail.updated')}>
              {formatDateTime(ticket.updatedAtUtc, lang)}
            </StripItem>
          </div>

          {/* The note BR-1.2 demands, when the chosen transition needs one. */}
          {pending && noteRequiredFor(pending) ? (
            <div className={styles.dialogCard}>
              <h3 className={styles.dialogTitle}>
                {t('detail.moveTo', { status: t(`status.${pending}`) })}
              </h3>
              <div className={styles.dialogBody}>
                <Textarea
                  label={t('detail.note')}
                  placeholder={t('detail.noteRequired')}
                  value={note}
                  onChange={setNote}
                  rows={2}
                />
              </div>
              <div className={styles.dialogActions}>
                <Button
                  buttonType="secondary-outline"
                  text={t('detail.reload') === '' ? 'Cancel' : t('cancel', { ns: 'common' })}
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

          <Section
            id="description"
            title={t('detail.description')}
            open={descOpen}
            onToggle={() => setDescOpen((open) => !open)}
          >
            <p className={styles.description} dir="auto">
              {ticket.description}
            </p>
          </Section>

          <Section
            id="assignment"
            title={t('detail.assignee')}
            open
            onToggle={() => undefined}
          >
            {/* BR-2 is mirrored for AFFORDANCE ONLY — the server decides (AC-7).
                The picker is offered to everyone and a refusal comes back as a
                `403`: hiding it would tell an Agent that self-assignment is
                impossible rather than that this assignment is. */}
            <Dropdown
              label={ticket.assignee ? t('detail.reassign') : t('detail.assign')}
              options={users.map((user) => ({
                value: user.id,
                label: user.fullName,
                description: t(`role.${user.role}`),
              }))}
              value={ticket.assignee?.id ?? null}
              onChange={(next) => assignee.mutate(next)}
              placeholder={t('detail.pickAssignee')}
              loading={supportUsers.isPending}
              clearable
              disabled={assignee.isPending}
              size="md"
            />
          </Section>

          <Section
            id="tags"
            title={t('detail.tags')}
            open={tagsOpen}
            onToggle={() => setTagsOpen((open) => !open)}
          >
            <div className={styles.controls}>
              {ticket.tags.length === 0 ? (
                <span className={styles.stripMuted}>{t('detail.noTags')}</span>
              ) : (
                ticket.tags.map((tag) => (
                  <span key={tag.id} className={styles.internalMark} dir="auto">
                    {tag.name}
                    <button
                      type="button"
                      className={styles.searchClear}
                      aria-label={t('detail.removeTag', { name: tag.name })}
                      disabled={tagWrite.isPending}
                      onClick={() => tagWrite.mutate({ tagId: tag.id, attach: false })}
                    >
                      <IconClose size={12} />
                    </button>
                  </span>
                ))
              )}

              {/* Only the tags NOT already attached. Offering an attached one is
                  offering a write whose outcome the server has already applied. */}
              <Dropdown
                label={t('detail.addTag')}
                labelHidden
                options={(tagVocabulary.data ?? [])
                  .filter((tag) => !ticket.tags.some((attached) => attached.id === tag.id))
                  .map((tag) => ({ value: tag.id, label: tag.name }))}
                value={null}
                onChange={(tagId) => {
                  if (tagId) tagWrite.mutate({ tagId, attach: true });
                }}
                placeholder={t('detail.addTag')}
                loading={tagVocabulary.isPending}
                disabled={tagWrite.isPending}
                size="sm"
              />
            </div>
          </Section>

          <Section
            id="timeline"
            title={t('detail.timeline')}
            {...(counts
              ? {
                  count: t('detail.timelineEntries', {
                    count: counts.commentCount + counts.historyCount,
                  }),
                }
              : {})}
            open={timelineOpen}
            onToggle={() => setTimelineOpen((open) => !open)}
          >
            {/* LOAD EARLIER IS AT THE TOP — Q-2: a conversation reads down and
                the newest entry is what the reader came for. */}
            {timelineQuery.hasNextPage ? (
              <button
                type="button"
                className={styles.loadEarlier}
                onClick={() => void timelineQuery.fetchNextPage()}
                disabled={timelineQuery.isFetchingNextPage}
              >
                {t('detail.loadEarlier')}
              </button>
            ) : entries.length > 0 ? (
              <p className={styles.feedStart}>{t('detail.feedStart')}</p>
            ) : null}

            <div className={styles.feed}>
              {entries.length === 0 && !timelineQuery.isPending ? (
                <div className={styles.empty}>
                  <p className={styles.emptyTitle}>{t('detail.emptyTitle')}</p>
                  <p className={styles.emptyBody}>{t('detail.emptyBody')}</p>
                </div>
              ) : (
                /* The server sends newest first and the feed reads down, so the
                   list is reversed for DISPLAY only — never for the cursor, which
                   must keep the server's order. */
                [...entries]
                  .reverse()
                  .map((item) => (
                    <Entry key={item.id} entry={item} lang={lang} nameOf={nameOf} />
                  ))
              )}
            </div>

            {/* `Closed` is terminal for comments too (BR-1.5), so the composer is
                ABSENT rather than disabled: a disabled box invites a reader to
                hunt for what would enable it. */}
            {transitions.length === 0 ? (
              <p className={styles.stripMuted}>{t('detail.closedNoComment')}</p>
            ) : (
              <div className={styles.composer}>
                {(cannedReplies.data ?? []).length > 0 ? (
                  /* `034`'s templates. They INSERT into the draft rather than
                     sending: a template is a starting point, and a picker that
                     sent would post an unedited form letter with one click. */
                  <Dropdown
                    label={t('detail.useTemplate')}
                    labelHidden
                    options={(cannedReplies.data ?? []).map((reply) => ({
                      value: reply.id,
                      label: reply.title,
                      description: reply.category
                        ? t(`category.${reply.category}`)
                        : t('detail.templateGeneral'),
                    }))}
                    value={null}
                    onChange={(replyId) => {
                      const reply = (cannedReplies.data ?? []).find((r) => r.id === replyId);
                      if (reply) setDraft(reply.body);
                    }}
                    placeholder={t('detail.useTemplate')}
                    size="sm"
                  />
                ) : null}

                <Textarea
                  label={t('detail.comment')}
                  labelHidden
                  placeholder={t('detail.commentPlaceholder')}
                  value={draft}
                  onChange={setDraft}
                  rows={3}
                />
                <div className={styles.composerControls}>
                  <Checkbox
                    label={t('detail.markInternal')}
                    checked={internal}
                    onChange={setInternal}
                    helperText={t('detail.internalHint')}
                  />
                  <span className={styles.composerSend}>
                    <Button
                      text={t('detail.send')}
                      loading={comment.isPending}
                      disabled={draft.trim() === ''}
                      onClick={() => comment.mutate(draft.trim())}
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
        <Link className={styles.anchor} to="/tickets">
          {t('detail.backToList')}
        </Link>
        {transitions.length > 0 ? (
          <span className={styles.stickyEnd}>
            <div className={styles.menuWrap}>
              <Button
                text={t('detail.takeAction')}
                iconEnd={<IconChevronDown size={16} />}
                onClick={() => setMenuAt((at) => (at === 'sticky' ? null : 'sticky'))}
                aria-expanded={menuAt === 'sticky'}
                aria-controls="take-action-sticky"
              />
              {menuAt === 'sticky' ? (
                <div className={styles.menu} role="menu" id="take-action-sticky">
                  {transitions.map((next) => (
                    <button
                      key={next}
                      type="button"
                      role="menuitem"
                      className={styles.menuItem}
                      onClick={() => {
                        setMenuAt(null);
                        setPending(next);
                        setNote('');
                        if (!noteRequiredFor(next)) {
                          status.mutate({ next, note: '' });
                        }
                      }}
                    >
                      {t('detail.moveTo', { status: t(`status.${next}`) })}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </span>
        ) : null}
        </div>
      </div>
    </main>
  );
}
