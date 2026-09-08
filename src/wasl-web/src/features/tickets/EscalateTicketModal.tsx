import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../components/Button/Button';
import { Modal } from '../../components/Modal/Modal';
import { Textarea } from '../../components/Textarea/Textarea';
import { useToast } from '../../components/Toast/ToastHost';
import { IconAlert, IconEscalate, IconTriangleAlert } from '../../icons/icons';
import { ApiError } from '../../lib/api';
import { cx } from '../../lib/cx';
import { escalateTicket, ticketKeys } from './tickets.api';
import styles from './EscalateTicketModal.module.css';

/* ============================================================================
 * EscalateTicketModal — `016`
 * ============================================================================
 * ONE FIELD AND ONE BUTTON, and everything interesting about it is what it does
 * NOT do.
 *
 * NO PRIORITY CONTROL. BR-3.6 raises the priority to a floor of `High` and
 * leaves `Critical` alone, and the server owns that. A picker here could set a
 * priority BELOW the floor, which is the one outcome that rule exists to
 * prevent — and it would look like it worked. The dialog says what will happen
 * to the priority instead, and the body it sends has no `priority` field at all.
 *
 * NO OPTIMISTIC PRIORITY UPDATE. Same reason from the other side: the client
 * cannot compute the result without re-implementing BR-3.6, so it refetches and
 * renders what came back (`026` §5, FE-016-02).
 *
 * NO UNDO, AND NO OFFER OF ONE. Escalation is one-way (BR-3.9) — there is no
 * de-escalate endpoint, no `isEscalated: false` on any request, and there never
 * will be in this contract. A dialog that says "you can change this later"
 * about a permanent act is worse than one that says nothing.
 *
 * NO CLIENT-SIDE BR-3 CHECK. Whether this dialog can be opened at all is
 * `ticket.canEscalate` — computed by the server from the ticket's state (BR-3.3,
 * BR-3.4) and the caller's role (BR-3.2). This component never reads `status`,
 * never reads `isEscalated`, and never reads a role. `rowActions.guards` scans
 * for exactly that.
 *
 * ERRORS INLINE, NEVER A TOAST (AC-16). A `403` or a `409` is about the thing
 * the reader is looking at and the reason they typed is still in the field — a
 * toast takes the answer away from the question and can be missed entirely. The
 * SUCCESS toast is the opposite case and follows `CloseTicketModal`: the surface
 * it would render on is already leaving.
 * ========================================================================= */

/** `Ticket.EscalationReason` is `nvarchar(500)` and the server answers `400` at
 *  501 — measured AFTER trimming (BR-3.5). Counted in UTF-16 code units, the
 *  same unit `string.Length` counts in C#, so the client's ceiling and the
 *  server's are the same number of the same thing. */
export const REASON_MAX = 500;

export interface EscalateTicketModalProps {
  ticketId: string;
  ticketNumber: string;

  /** The `version` from the ticket the reader was looking at. Passed in rather
   *  than refetched: the detail route already holds the ticket, and a second
   *  fetch here would be a second answer to "which version am I editing". */
  expectedVersion: string;

  /** The current priority, for the sentence about what the floor will do.
   *  Read-only — see the header note on why there is no control. */
  priority: 'Low' | 'Normal' | 'High' | 'Critical';

  onClose: () => void;
}

export function EscalateTicketModal({
  ticketId,
  ticketNumber,
  expectedVersion,
  priority,
  onClose,
}: EscalateTicketModalProps) {
  const { t } = useTranslation('tickets');
  const toast = useToast();
  const queryClient = useQueryClient();

  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);

  const trimmed = reason.trim();

  const escalate = useMutation({
    mutationFn: () => escalateTicket(ticketId, { reason: trimmed, expectedVersion }),
    onSuccess: () => {
      /* THE WHOLE `tickets` TREE, not just this ticket's detail. An escalation
         changes the ticket's priority and the list's `escalated` filter and the
         dashboard's escalated tile — and `026` §5 forbids painting any of them
         from this response. */
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
      void queryClient.invalidateQueries({ queryKey: ticketKeys.detail(ticketId) });

      onClose();

      toast.show({
        tone: 'success',
        title: t('escalate.toast.title'),
        body: t('escalate.toast.body', { number: ticketNumber }),
        dedupeKey: `escalate:${ticketId}`,
      });
    },
    onError: (cause) => setFailure(refusalToEscalate(cause, t)),
  });

  const reasonMissing = submitted && trimmed === '';
  const reasonTooLong = trimmed.length > REASON_MAX;

  function submit() {
    setSubmitted(true);
    setFailure(undefined);
    if (trimmed === '' || reasonTooLong) return;
    escalate.mutate();
  }

  /* THE SENTENCE ABOUT THE PRIORITY, and it mirrors BR-3.6 rather than
     computing it: two copies, both read-only, and the server's is the one that
     runs. Which of the two sentences to show is the only thing decided here —
     `High` and `Critical` are already at or above the floor, so nothing moves,
     and telling the reader their `Critical` ticket will become `High` would be
     an announcement of the exact defect BR-3.6 exists to prevent. */
  const priorityMoves = priority === 'Low' || priority === 'Normal';

  return (
    <Modal
      open
      onClose={onClose}
      title={t('escalate.title')}
      size="sm"
      /* `unsavedInput` — the scrim does not close a modal holding input, and
         this one holds the only record of why a ticket was escalated.

         `destructive` is deliberately NOT set, and it is a closer call here than
         on the close modal: escalation cannot be undone, which is the literal
         wording of that flag. What the flag actually does is move opening focus
         to cancel — and this dialog's first control is the field the reader came
         to fill in. Ruled: the permanence is stated in the body, and focus stays
         where the work is. */
      unsavedInput
      footer={
        <div className={styles.footer}>
          <Button
            buttonType="secondary-outline"
            text={t('escalate.cancel')}
            onClick={onClose}
            disabled={escalate.isPending}
          />
          <span className={styles.grow}>
            <Button
              text={t('escalate.confirm')}
              onClick={submit}
              loading={escalate.isPending}
              /* Disabled at 0 characters and above 500 (FE-016-04). Not a
                 substitute for the server's check — it is one round trip the
                 reader does not have to spend to learn something the field
                 already knows. */
              disabled={escalate.isPending || trimmed === '' || reasonTooLong}
            />
          </span>
        </div>
      }
    >
      <div className={styles.body}>
        <p className={styles.lead}>
          {t('escalate.lead', { number: ticketNumber })}
        </p>

        {/* WHAT WILL HAPPEN, in words, before it happens. Icon plus label — the
            amber is not carrying the meaning on its own. */}
        <p className={cx(styles.notice, styles.noticeInfo)}>
          <IconEscalate size={16} aria-hidden="true" className={styles.noticeIcon} />
          {priorityMoves
            ? t('escalate.priorityRaised', { from: t(`priority.${priority}`) })
            : t('escalate.priorityKept', { current: t(`priority.${priority}`) })}
        </p>

        <p className={cx(styles.notice, styles.noticeWarn)}>
          <IconTriangleAlert
            size={16}
            aria-hidden="true"
            className={styles.noticeIcon}
          />
          {t('escalate.oneWay')}
        </p>

        {/* THE SERVER'S ANSWER, INLINE AND BESIDE THE CONTROL (AC-16). `role`
            is `alert`, so it is announced without moving focus away from the
            field that still holds the reader's text. */}
        {failure === undefined ? null : (
          <p className={cx(styles.notice, styles.noticeError)} role="alert">
            <IconAlert size={16} aria-hidden="true" className={styles.noticeIcon} />
            {failure}
          </p>
        )}

        <Textarea
          label={t('escalate.reason')}
          value={reason}
          onChange={setReason}
          placeholder={t('escalate.reasonPlaceholder')}
          helperText={t('escalate.reasonHelp')}
          error={
            reasonMissing
              ? t('escalate.reasonRequired')
              : reasonTooLong
                ? t('escalate.reasonTooLong', { max: REASON_MAX })
                : undefined
          }
          rows={4}
          required
          /* The native ceiling AND the counter's. `maxLength` stops the reader
             typing past 500 rather than letting them write 600 and find out from
             the server — and the counter appears at 450 so the limit is not a
             surprise at 499. */
          maxLength={REASON_MAX}
          counterFrom={REASON_MAX - 50}
          disabled={escalate.isPending}
        />
      </div>
    </Modal>
  );
}

/**
 * What the server said, in words. Exported for its own test.
 *
 * FOUR DISTINCT `409`s REACH THIS SCREEN and three of them can come from this
 * endpoint, which is the whole reason `002`'s registry gives each conflict its
 * own `type` rather than sharing one:
 *
 *   ticket-not-escalatable   BR-3.3 — the ticket is Resolved or Closed
 *   already-escalated        BR-3.4 — somebody got there first
 *   concurrency-conflict     ADR-006 — the reader's copy is stale
 *
 * Branching on the last path segment, never on the full URI: `002` AC-25 says
 * so, and it is what makes `ProblemTypes.TypeBase` safe to change.
 *
 * `concurrency-conflict` NEVER AUTO-RETRIES. A retry would send the reason
 * against a state the reader has not seen — which is the same argument that puts
 * the server's version check ahead of its state rules.
 */
export function refusalToEscalate(
  cause: unknown,
  t: (key: string) => string,
): string {
  if (!(cause instanceof ApiError)) return t('escalate.error.unknown');

  if (cause.status === 409) {
    const type = cause.problem.type ?? '';
    if (type.endsWith('ticket-not-escalatable')) return t('escalate.error.notEscalatable');
    if (type.endsWith('already-escalated')) return t('escalate.error.already');
    return t('escalate.error.stale');
  }

  /* A `403` HERE MEANS THE ROLE, not the ticket. The action was offered because
     `canEscalate` was true when the ticket was fetched, so a `403` means the
     caller is not a Manager — which after `004` cannot change mid-session,
     because the token is signed and immutable until the next sign-in (`014`).
     So the message says to reload rather than to try again. */
  if (cause.status === 403) return t('escalate.error.forbidden');

  /* `036` §3.3 — a deadlock victim, and the ONE failure a retry should fix. */
  if (cause.status === 503) return t('escalate.error.transient');

  /* A `400` should be unreachable: the confirm is disabled at 0 and above 500.
     It is here because "unreachable" and "unhandled" are different words, and
     the field-level message is the one that names what is wrong. */
  if (cause.status === 400) return t('escalate.error.invalid');

  return t('escalate.error.unknown');
}
