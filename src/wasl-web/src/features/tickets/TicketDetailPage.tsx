import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { Badge } from '../../components/Badge/Badge';
import { Button } from '../../components/Button/Button';
import { Checkbox } from '../../components/Checkbox/Checkbox';
import { Dropdown } from '../../components/Dropdown/Dropdown';
import { Textarea } from '../../components/Textarea/Textarea';
import { IconClose } from '../../icons/icons';
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

function StripItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.stripItem}>
      <span className={styles.stripLabel}>{label}</span>
      <span className={styles.stripValue}>{children}</span>
    </div>
  );
}

/** One timeline row. Flat entry, `type` discriminating — the shape the server sends. */
function Entry({ entry, lang }: { entry: TimelineEntry; lang: Lang }) {
  const { t } = useTranslation('tickets');
  const actor = entry.actor?.fullName ?? '';

  return (
    <article className={styles.entry}>
      <div className={styles.entryHead}>
        {actor ? <Avatar name={actor} /> : null}
        <span className={styles.entryActor} dir="auto">
          {actor}
        </span>
        {entry.actor?.role ? (
          <span className={styles.entryRole}>{t(`role.${entry.actor.role}`)}</span>
        ) : null}
        <time className={styles.entryTime} dateTime={entry.occurredAtUtc}>
          {formatDateTime(entry.occurredAtUtc, lang)}
        </time>
        {entry.isInternal === true ? (
          <span className={styles.internalMark}>{t('detail.internal')}</span>
        ) : null}
      </div>

      <div className={styles.entryMain}>
        {entry.type === 'Comment' ? (
          /* dir="auto" on every body: a Latin comment in an Arabic thread starts
             on the same edge as its neighbours (AC-8). */
          <p className={styles.entryBody} dir="auto">
            {entry.body}
          </p>
        ) : (
          <p className={styles.history}>
            {t(`detail.event.${entry.type.charAt(0).toLowerCase()}${entry.type.slice(1)}`, {
              defaultValue: entry.type,
            })}
            {entry.newValue ? ` — ${t(`status.${entry.newValue}`, { defaultValue: entry.newValue })}` : ''}
          </p>
        )}
        {entry.note ? (
          <p className={styles.historyNote} dir="auto">
            {entry.note}
          </p>
        ) : null}
      </div>
    </article>
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

  return (
    <main className={styles.page}>
      <div className={styles.pageHead}>
        <h1 className={styles.pageTitle}>
          <span className={styles.ticketNo} dir="ltr">
            {ticket.ticketNumber}
          </span>
        </h1>
      </div>

      {conflict ? (
        <div className={styles.banner} role="alert">
          <div>
            <strong>{t('detail.conflictTitle')}</strong>
            <p>{t('detail.conflictBody')}</p>
          </div>
          <button
            type="button"
            className={styles.bannerAction}
            onClick={() => {
              setConflict(false);
              void ticketQuery.refetch();
            }}
          >
            {t('detail.reload')}
          </button>
        </div>
      ) : null}

      {/* A `400` on expectedVersion is a defect in this client. It is shown as
          one — not as a recoverable error with a retry — because a reader cannot
          cause it and cannot fix it, and "try again" would be a lie (AC-5). */}
      {clientBug ? (
        <div className={cx(styles.banner, styles.clientBug)} role="alert">
          <div>
            <strong>{t('detail.versionRejectedTitle')}</strong>
            <p>{clientBug}</p>
          </div>
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
        <StripItem label={t('list.column.priority')}>
          {t(`priority.${ticket.priority}`)}
        </StripItem>
        <StripItem label={t('field.category')}>{t(`category.${ticket.category}`)}</StripItem>
        <StripItem label={t('list.column.channel')}>{t(`channel.${ticket.channel}`)}</StripItem>
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
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h3>{t('detail.description')}</h3>
        </div>
        <div className={styles.sectionBody}>
          <p className={styles.description} dir="auto">
            {ticket.description}
          </p>
        </div>
      </section>

      {/* ── the actions ──────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h3>{t('detail.takeAction')}</h3>
        </div>
        <div className={styles.sectionBody}>
          <div className={styles.controls}>
            {transitions.length > 0 ? (
              <div className={styles.menuWrap}>
                {/* ONE CONTROL PER ALLOWED TRANSITION, not a select.
                 *
                 * The catalogue decided this and it is the better shape anyway:
                 * `detail.moveTo` is `"Move to {{status}}"` — an interpolated
                 * per-transition label, which the design's take-action menu asks
                 * for. The first version of this screen used it as a select's
                 * label with no variable, so the control rendered literally
                 * `Move to {{status}}` — caught by a test looking for the
                 * accessible name, and it would otherwise have shipped as visible
                 * text.
                 *
                 * Buttons also render what the server sent where a reader can see
                 * it, instead of hiding the permitted set one click deep. */}
                {transitions.map((next) => (
                  <Button
                    key={next}
                    buttonType="secondary-outline"
                    text={t('detail.moveTo', { status: t(`status.${next}`) })}
                    loading={status.isPending && pending === next}
                    onClick={() => {
                      setPending(next);
                      setNote('');

                      /* Applied immediately unless BR-1.2 wants a reason. Asking
                         for a note on every transition would train people to type
                         nothing useful — `012` Q-1's own wording. */
                      if (!noteRequiredFor(next)) {
                        status.mutate({ next, note: '' });
                      }
                    }}
                  />
                ))}

                {pending && noteRequiredFor(pending) ? (
                  <div className={styles.dialogField}>
                    <Textarea
                      label={t('detail.note')}
                      placeholder={t('detail.noteRequired')}
                      value={note}
                      onChange={setNote}
                      rows={2}
                    />
                    <div className={styles.dialogActions}>
                      <Button
                        text={t('detail.confirm')}
                        loading={status.isPending}
                        disabled={note.trim() === ''}
                        onClick={() => status.mutate({ next: pending, note })}
                      />
                      <Button
                        buttonType="secondary-outline"
                        text={t('detail.cancel', { defaultValue: '' }) || 'Cancel'}
                        onClick={() => {
                          setPending(null);
                          setNote('');
                        }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              /* `Closed` is terminal — BR-1.5. The array is empty and nothing is
                 rendered, which is AC-2 asserted with `[]` rather than only with
                 a populated array. */
              <p className={styles.stripMuted}>{t('detail.closedNoComment')}</p>
            )}

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
              helperText={t('detail.pickerHint')}
              loading={supportUsers.isPending}
              clearable
              disabled={assignee.isPending}
              size="md"
            />
          </div>
        </div>
      </section>

      {/* ── the timeline ─────────────────────────────────────────────────── */}
      {/* ── `034`'s tags ─────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h3>{t('detail.tags')}</h3>
        </div>
        <div className={styles.sectionBody}>
          <div className={styles.controls}>
            {ticket.tags.length === 0 ? (
              <span className={styles.stripMuted}>{t('detail.noTags')}</span>
            ) : (
              ticket.tags.map((tag) => (
                /* The name is Arabic user content, so dir="auto" — a Latin tag
                   beside an Arabic one must not drag the row's direction. */
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
              size="md"
            />
          </div>
        </div>
      </section>

      <section className={styles.section} id="timeline">
        <div className={styles.sectionHead}>
          <h3>{t('detail.timeline')}</h3>
          {counts ? (
            <span className={styles.sectionCount}>
              {t('detail.timelineEntries', {
                count: counts.commentCount + counts.historyCount,
                defaultValue: String(counts.commentCount + counts.historyCount),
              })}
            </span>
          ) : null}
        </div>

        <div className={styles.sectionBody}>
          {/* LOAD EARLIER IS AT THE TOP and appends older entries, which is Q-2's
              ruling: a conversation reads down and the newest entry is what the
              reader came for. */}
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
              <p className={styles.emptyBody}>{t('detail.emptyBody')}</p>
            ) : (
              /* The server sends newest first and the feed reads down, so the
                 list is reversed for DISPLAY only — never for the cursor, which
                 must keep the server's order. */
              [...entries]
                .reverse()
                .map((entry) => <Entry key={entry.id} entry={entry} lang={lang} />)
            )}
          </div>

          {/* `Closed` is terminal for comments too (BR-1.5), so the composer is
              absent rather than disabled: a disabled box invites a reader to
              hunt for what would enable it. */}
          {transitions.length === 0 ? null : (
            <div className={styles.composer}>
              {/* `034`'s reply templates. THEY INSERT INTO THE DRAFT rather than
                  sending: a template is a starting point, and a picker that sent
                  it would post an unedited form letter with one click. */}
              {(cannedReplies.data ?? []).length > 0 ? (
                <Dropdown
                  label={t('detail.useTemplate')}
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
                  size="md"
                />
              ) : null}

              <Textarea
                label={t('detail.comment')}
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
                <Button
                  text={t('detail.send')}
                  loading={comment.isPending}
                  disabled={draft.trim() === ''}
                  onClick={() => comment.mutate(draft.trim())}
                />
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
