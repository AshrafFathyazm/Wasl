import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { useMenuSurface } from '../../components/Dropdown/useMenuSurface';
import { useToast } from '../../components/Toast/ToastHost';
import { ApiError } from '../../lib/api';
import { cx } from '../../lib/cx';
import type { Lang } from '../../lib/formatters';
import { AssigneePanel } from './AssigneePanel';
import { useOpenTicketCounts } from './openTicketCounts';
import styles from './RowAssignMenu.module.css';
import {
  changeTicketAssignee,
  getSupportUsers,
  getTicket,
  ticketKeys,
} from './tickets.api';

/* ============================================================================
 * RowAssignMenu — `039`
 * ============================================================================
 * The assignee panel, hung off a ticket ROW instead of the detail rail.
 *
 * IT REVERSES `026`'s RULING, and the objection `026` recorded was correct:
 *
 *   "Firing either from a list row would mean a second implementation of the
 *    concurrency handling, in a component that has no version to send."
 *
 * The row genuinely has neither — `010` excluded `version` and
 * `allowedTransitions` from `TicketListItem` deliberately, on the grounds that
 * "nothing on the list acts". What changes is where they come from, not whether
 * they are needed: **opening this menu fetches the ticket**, under the SAME
 * `ticketKeys.detail(id)` the detail route uses. One request answers all three
 * of the row's absences — the version, the current assignee, and (for the close
 * modal) the legal transitions — and no rule is implemented twice.
 *
 * The cost is one round trip before the first pick can commit, and it is paid
 * visibly: every row is disabled until the version is in hand. A menu that let
 * you pick before it could send `expectedVersion` would either drop the check
 * or send an empty string, and `004b` length-checks that into a `400`.
 * ========================================================================= */

export interface RowAssignMenuProps {
  ticketId: string;
  ticketNumber: string;

  /** The element the menu hangs from — the row's actions cell. Supplied by the
   *  caller because `Table` owns the flyout trigger and this component is not
   *  allowed to know that; a `document.querySelector` for the primitive's own
   *  button would be this feature reaching inside another one. */
  anchor: HTMLElement;

  lang: Lang;
  onClose: () => void;
}

export function RowAssignMenu({
  ticketId,
  ticketNumber,
  anchor,
  lang,
  onClose,
}: RowAssignMenuProps) {
  const { t } = useTranslation('tickets');
  const toast = useToast();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  const surface = useMenuSurface({ align: 'end' });

  /* The anchor is the caller's element, not one this component renders, so the
     ref is assigned rather than passed to a node. A layout effect and not a
     passive one: `useMenuSurface` measures in a layout effect of its own, and a
     ref written after that measures against `null` and paints at 0,0 for a
     frame — the flicker its own comment warns about. */
  useLayoutEffect(() => {
    surface.triggerRef.current = anchor;
    surface.setOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  /* The hook owns dismissal — an outside pointerdown, a scroll of anything that
     is not this menu — and reports it by flipping `open`. The parent owns
     MOUNTING, so the two are joined here.

     `wasOpen` and not a bare `!surface.open`: on the first render the hook has
     not been told to open yet, and an unguarded effect would unmount the menu
     before it appeared. */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (surface.open) wasOpen.current = true;
    else if (wasOpen.current) onClose();
  }, [surface.open, onClose]);

  /* Escape. `useMenuSurface` handles the pointer and the scroll and deliberately
     not the keyboard — `Dropdown` owns its own key handling because it has a
     focus model this panel does not. Focus returns to the trigger, never one
     without the other. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      surface.closeAndFocusTrigger();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [surface]);

  const usersQuery = useQuery({
    queryKey: ticketKeys.supportUsers(),
    queryFn: ({ signal }) => getSupportUsers(signal),
  });

  /* THE ROW'S MISSING HALF. Same key as the detail route, so a user who has just
     come back from a ticket pays nothing and the same writes invalidate it. */
  const ticketQuery = useQuery({
    queryKey: ticketKeys.detail(ticketId),
    queryFn: ({ signal }) => getTicket(ticketId, signal),
  });

  const users = usersQuery.data ?? [];
  const counts = useOpenTicketCounts(
    users.map((user) => user.id),
    users.length > 0,
  );

  const assign = useMutation({
    mutationFn: (assigneeId: string | null) =>
      changeTicketAssignee(ticketId, {
        assigneeId,
        /* Never `?? ''`. An empty token is a `400` from `004b`'s length check,
           and a fallback here would turn "we have not loaded the ticket" into a
           request that looks like a client bug. The controls are disabled until
           this is a real value, which is what makes the assertion safe. */
        expectedVersion: ticketQuery.data?.version ?? '',
      }),
    onSuccess: (_updated, assigneeId) => {
      /* NOTHING IS READ FROM THE WRITE RESPONSE — `026` §5. A body returned by a
         write is what the server HAD, not what it stored. Invalidate and let the
         list refetch. */
      void queryClient.invalidateQueries({ queryKey: ['tickets'] });
      void queryClient.invalidateQueries({ queryKey: ticketKeys.supportUsers() });

      /* §1.1 of the feedback layer, and `039` AC-26: close the surface, THEN
         toast. A success message inside the thing it is about is a message the
         reader has to dismiss twice. */
      onClose();

      const name = users.find((user) => user.id === assigneeId)?.fullName;
      if (assigneeId !== null && name !== undefined) {
        toast.show({
          tone: 'success',
          title: t('assign.toast.assigned', { name }),
          body: t('assign.toast.assignedBody', { number: ticketNumber }),
          dedupeKey: `assign:${ticketId}`,
        });
      } else {
        /* `info`, not `success`, and the duration follows the tone — 5s, from
           `feedback-layer.md` §2's table. Ruled 2026-09-06 (Q-4). An unassign is
           not an achievement; it is a state the ticket moved back to. */
        toast.show({
          tone: 'info',
          title: t('assign.toast.unassigned'),
          body: t('assign.toast.unassignedBody', { number: ticketNumber }),
          dedupeKey: `assign:${ticketId}`,
        });
      }
    },
    onError: (cause) => setError(refusal(cause, t)),
  });

  const position = surface.position;
  const busy = ticketQuery.isPending || assign.isPending;

  /* NOT RENDERED UNTIL IT HAS BEEN PLACED — the same shape `Dropdown` uses. A
     surface that mounts before its geometry paints once at the page's top-left
     corner and jumps, which reads as a rendering fault rather than as a menu. */
  if (position === null) return null;

  return createPortal(
    <div
      ref={surface.menuRef}
      role="dialog"
      aria-label={t('assign.menuLabel')}
      className={cx(styles.surface, position.flipped && styles.flipped)}
      style={{
        /* Physical, and that is not a bug in RTL. `useMenuSurface` has already
           resolved the inline-end alignment against the page direction — this
           panel is WIDER than its trigger, so the two cannot share both edges
           and the hook picked the one they do share. Mirroring again here would
           undo it. */
        top: position.insetBlockStart,
        left: position.insetInlineStartPx,
        /* THE CAP, PUBLISHED AND NOT APPLIED. `AssigneePanel.module.css` takes
           `min()` of this and its own ceiling, so a measurement can only ever
           shorten the panel. Absent until there is a height to measure against,
           and absent means "no extra ceiling". */
        ...(position.maxBlockSize == null
          ? {}
          : { ['--menu-max-block-size' as string]: `${position.maxBlockSize}px` }),
      }}
    >
      <AssigneePanel
        users={users}
        currentId={ticketQuery.data?.assignee?.id ?? null}
        filter={filter}
        onFilter={setFilter}
        busy={busy}
        onPick={(next) => {
          setError(undefined);
          assign.mutate(next);
        }}
        counts={counts}
        error={error}
        lang={lang}
      />
    </div>,
    document.body,
  );
}

/** The server's refusal, in words. Three of these are real answers this endpoint
 *  gives and the fourth is everything else.
 *
 *  `403` IS NOT AN ERROR STATE OF THE CLIENT — BR-2.2 lets an Agent self-assign
 *  an unassigned ticket and nothing more, the rule is enforced in the handler,
 *  and no client can know it in advance. Offering the list and reporting this is
 *  the honest picker; filtering the list would say self-assignment is impossible
 *  rather than that THIS assignment is. */
export function refusal(cause: unknown, t: (key: string) => string): string {
  if (!(cause instanceof ApiError)) return t('assign.error.unknown');
  if (cause.status === 403) return t('assign.error.forbidden');
  if (cause.status === 409) return t('assign.error.stale');
  if (cause.status === 503) return t('assign.error.transient');
  return t('assign.error.unknown');
}
