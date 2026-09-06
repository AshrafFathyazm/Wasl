import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/Button/Button';
import { Input } from '../../components/Input/Input';
import { Modal } from '../../components/Modal/Modal';
import { Skeleton } from '../../components/Loader/Skeleton';
import { Textarea } from '../../components/Textarea/Textarea';
import { useToast } from '../../components/Toast/ToastHost';
import { IconAlert, IconTriangleAlert } from '../../icons/icons';
import { ApiError } from '../../lib/api';
import { cx } from '../../lib/cx';
import { changeTicketStatus, getTicket, ticketKeys } from './tickets.api';
import styles from './CloseTicketModal.module.css';

/* ============================================================================
 * CloseTicketModal — `039`
 * ============================================================================
 * Closing IS a decision, so it gets a surface that blocks: a reason, an optional
 * summary, and — when the reason is «مكرّرة» — the original ticket's number.
 *
 * THREE THINGS THE MOCK DRAWS AND THIS DOES NOT, each because the product does
 * not have them. They are absent rather than disabled, and `rowActions.guards`
 * asserts the absence:
 *
 *   «إشعار العميل»
 *     `021` (`ICommunicationProvider`) is specified and NOT built. Nothing in
 *     this product sends a customer anything, so a checkbox promising a message
 *     is a fact the product does not have that looks exactly like a working one.
 *     Ruled 2026-09-06, Q-2. A DISABLED checkbox was the other option and was
 *     turned down: `027`'s "draw it inert" ruling covers ACTIONS, and a disabled
 *     input in a form reads as "not yet" rather than "never".
 *
 *   the amber «آخر رسالة من العميل بلا ردّ» banner
 *     There is no customer message in this product. `Interaction` was never
 *     built — `034` went looking for a home for one and found
 *     `Wasl.Domain/Communications/` holds a single enum. A countdown drawn from
 *     nothing is worse than no countdown.
 *
 *   a link, a merge, or any relation on «التذكرة الأصلية»
 *     No endpoint, no field, nothing that resolves a number to an id. It is text
 *     in a note, and the field's helper says so.
 *
 * THE FOUR REASONS ARE NOT AN ENUM IN DISGUISE. `PUT /status` carries one free
 * `note` of 500 characters — `TicketHistory.Note` is `nvarchar(500)` — and the
 * timeline renders it verbatim without translating it. So the reason is composed
 * INTO the note, in the language of the person acting, and nothing downstream
 * can read it back. That is a property of the field, not a choice made here.
 * ========================================================================= */

/** The four, in the order the mock draws them. `dot` is the severity glyph and
 *  carries no meaning the label does not — see the stylesheet. */
const REASONS = [
  { id: 'solved', dot: 'dotSolved' },
  { id: 'duplicate', dot: undefined },
  { id: 'noAction', dot: undefined },
  { id: 'noReply', dot: 'dotNoReply' },
] as const;

type ReasonId = (typeof REASONS)[number]['id'];

/** `TicketHistory.Note` is `nvarchar(500)` and `012` answers `400` at 501 — a
 *  truncated reason is worse than a rejected one, so this is the client's floor
 *  as well as the server's ceiling. Counted in UTF-16 code units, the same unit
 *  `string.Length` counts in C#. */
export const NOTE_MAX = 500;

export interface CloseTicketModalProps {
  ticketId: string;
  ticketNumber: string;
  onClose: () => void;
}

export function CloseTicketModal({
  ticketId,
  ticketNumber,
  onClose,
}: CloseTicketModalProps) {
  const { t } = useTranslation('tickets');
  const toast = useToast();
  const queryClient = useQueryClient();

  const [reason, setReason] = useState<ReasonId | null>(null);
  const [duplicateOf, setDuplicateOf] = useState('');
  const [summary, setSummary] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);

  /* THE ROW HAS NO VERSION AND NO `allowedTransitions` — `010` left both out of
     `TicketListItem` on purpose. One fetch, under the detail route's own key,
     answers both. */
  const ticketQuery = useQuery({
    queryKey: ticketKeys.detail(ticketId),
    queryFn: ({ signal }) => getTicket(ticketId, signal),
  });

  const ticket = ticketQuery.data;

  /* BR-1 IS NOT MIRRORED HERE, and that is the rule rather than a shortcut:
     "the API returns `allowedTransitions` with the ticket and the UI renders
     only what it was given". The mock closes a ticket in `InProgress`, which
     BR-1 forbids and the server answers `409` — so a client carrying its own
     copy of the table would either agree with the server or drift from it, and
     there is no third option worth having. */
  const allowed = ticket === undefined || ticket.allowedTransitions.includes('Closed');

  const close = useMutation({
    mutationFn: (note: string) =>
      changeTicketStatus(ticketId, {
        status: 'Closed',
        note,
        /* Never a fallback. The confirm is disabled until the ticket has
           loaded, so this is always a real token by the time it is read. */
        expectedVersion: ticket?.version ?? '',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });

      /* CLOSE FIRST, THEN TOAST — `feedback-layer.md` §1.1 and AC-26. A success
         message rendered inside the modal it is about is a message the reader
         has to dismiss twice, and the toast host sits above the modal layer so
         it would be read over a surface that is already leaving. */
      onClose();

      toast.show({
        tone: 'success',
        title: t('close.toast.title'),
        body: t('close.toast.body', {
          number: ticketNumber,
          reason: reason === null ? '' : t(`close.reason.${reason}`),
        }),
        dedupeKey: `close:${ticketId}`,
      });
    },
    onError: (cause) => setFailure(refusalToClose(cause, t)),
  });

  const reasonMissing = submitted && reason === null;
  const duplicateMissing =
    submitted && reason === 'duplicate' && duplicateOf.trim() === '';

  const note = composeNote({
    reason: reason === null ? '' : t(`close.reason.${reason}`),
    duplicateOf: reason === 'duplicate' ? duplicateOf.trim() : '',
    duplicateLabel: t('close.noteDuplicatePrefix'),
    summary: summary.trim(),
  });

  function submit() {
    setSubmitted(true);
    setFailure(undefined);
    if (reason === null) return;
    if (reason === 'duplicate' && duplicateOf.trim() === '') return;
    if (!allowed || ticket === undefined) return;
    close.mutate(note);
  }

  const busy = ticketQuery.isPending || close.isPending;

  return (
    <Modal
      open
      onClose={onClose}
      title={t('close.title')}
      /* 420, ruled 2026-09-06 (Q-3). The mock is 440 and the twenty pixels are
         recorded rather than chased — a fourth size on a primitive eight screens
         depend on is the change with the wider blast radius.

         `destructive` is deliberately NOT set: it moves the opening focus to
         cancel, and closing is not destructive. `unsavedInput` IS — it is
         exactly "the scrim does not close it", and this modal holds input. */
      size="sm"
      unsavedInput
      footer={
        <div className={styles.footer}>
          <Button
            buttonType="secondary-outline"
            text={t('close.cancel')}
            onClick={onClose}
            disabled={close.isPending}
          />
          <span className={styles.grow}>
            <Button
              text={t('close.confirm')}
              onClick={submit}
              loading={close.isPending}
              disabled={busy || !allowed}
            />
          </span>
        </div>
      }
    >
      <div className={styles.body}>
        {ticketQuery.isPending ? (
          <>
            <Skeleton shape="text" />
            <Skeleton shape="text" />
            <Skeleton shape="text" />
          </>
        ) : null}

        {ticket !== undefined && !allowed ? (
          <p className={cx(styles.notice, styles.noticeBlocked)}>
            <IconTriangleAlert
              size={16}
              aria-hidden="true"
              className={styles.noticeIcon}
            />
            {t('close.blocked', { status: t(`status.${ticket.status}`) })}
          </p>
        ) : null}

        {failure === undefined ? null : (
          <p className={cx(styles.notice, styles.noticeError)} role="alert">
            <IconAlert size={16} aria-hidden="true" className={styles.noticeIcon} />
            {failure}
          </p>
        )}

        <div className={styles.group}>
          <span className={styles.groupLabel} id={`${ticketId}-reason`}>
            {t('close.reasonLabel')}{' '}
            <span className={styles.required} aria-hidden="true">
              {'*'}
            </span>
          </span>
          <div
            className={styles.reasons}
            role="group"
            aria-labelledby={`${ticketId}-reason`}
          >
            {REASONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={cx(styles.reason, reason === option.id && styles.reasonOn)}
                aria-pressed={reason === option.id}
                disabled={busy || !allowed}
                onClick={() => setReason(option.id)}
              >
                <span
                  className={cx(styles.dot, option.dot && styles[option.dot])}
                  aria-hidden="true"
                />
                {t(`close.reason.${option.id}`)}
              </button>
            ))}
          </div>
          {reasonMissing ? (
            <p className={styles.fieldError} role="alert">
              <IconAlert size={13} aria-hidden="true" />
              {t('close.reasonRequired')}
            </p>
          ) : null}
        </div>

        {/* IN THE DOM ONLY WHILE «مكرّرة» IS SELECTED. Not hidden — a hidden
            required field is a form that cannot be completed and does not say
            why. Free text, and the helper says it is not a link: there is no
            merge endpoint and no duplicate relation on any contract. */}
        {reason === 'duplicate' ? (
          <Input
            label={t('close.duplicateOf')}
            value={duplicateOf}
            onChange={setDuplicateOf}
            placeholder={t('close.duplicateOfPlaceholder')}
            helperText={t('close.duplicateOfHelp')}
            error={duplicateMissing ? t('close.duplicateOfRequired') : undefined}
            required
            disabled={busy}
          />
        ) : null}

        <Textarea
          label={t('close.summary')}
          value={summary}
          onChange={setSummary}
          placeholder={t('close.summaryPlaceholder')}
          helperText={t('close.summaryHelp')}
          rows={3}
          /* The note is composed from three parts and the SERVER counts the
             whole thing, so the ceiling here is what is left after the reason
             and the duplicate reference have taken their share. A flat 500 on
             this box would let a valid-looking form produce a `400`. */
          maxLength={Math.max(0, NOTE_MAX - (note.length - summary.trim().length))}
          counterFrom={Math.max(0, NOTE_MAX - 50)}
          disabled={busy || !allowed}
        />
      </div>
    </Modal>
  );
}

/** Reason first, then the duplicate reference, then the summary — one string,
 *  never longer than `NOTE_MAX`.
 *
 *  Exported for its own test. The composition is the only place three separate
 *  fields become the single value the contract carries, so it is the one place
 *  the 500-character ceiling can be got wrong. */
export function composeNote({
  reason,
  duplicateOf,
  duplicateLabel,
  summary,
}: {
  reason: string;
  duplicateOf: string;
  duplicateLabel: string;
  summary: string;
}): string {
  const head =
    duplicateOf === '' ? reason : `${reason} — ${duplicateLabel} ${duplicateOf}`;
  const whole = summary === '' ? head : `${head}\n${summary}`;
  return whole.slice(0, NOTE_MAX);
}

/** What the server said, in words. `409` is the one that matters and it is the
 *  one a list row is most likely to meet: the reader has been looking at a page
 *  that was fetched before somebody else moved this ticket. */
export function refusalToClose(cause: unknown, t: (key: string) => string): string {
  if (!(cause instanceof ApiError)) return t('close.error.unknown');
  if (cause.status === 409) {
    return cause.problem.type?.endsWith('invalid-status-transition') === true
      ? t('close.error.transition')
      : t('close.error.stale');
  }
  if (cause.status === 403) return t('close.error.forbidden');
  if (cause.status === 503) return t('close.error.transient');
  return t('close.error.unknown');
}
