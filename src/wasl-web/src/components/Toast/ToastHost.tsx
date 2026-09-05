import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';

import {
  Toast,
  TOAST_ACTION_MS,
  TOAST_MS,
  type ToastAction,
  type ToastTone,
} from './Toast';
import styles from './ToastHost.module.css';

/* ============================================================================
 * The toast host — `design/feedback-layer.md` §2.
 * ============================================================================
 * `006` deferred the toast on the grounds that it is "a system — a portal, a
 * stack, a timer per item, a manual-dismiss path" rather than a component, and
 * that was right. This is the system; `Toast` stayed the card.
 *
 * WHY A CONTEXT AND NOT A STORE. ADR-011 §1 forbids a global state store, and
 * this is not one: nothing here is application state. A toast is a transient
 * fact about the last few seconds, it is never read back, it never survives a
 * reload, and it has exactly one writer per event. A context holding an array
 * that empties itself is the smallest thing that can span the route tree, which
 * is what it has to do — the sheet that fires a toast is closed by the time the
 * toast is read (§1.1: "close the panel, THEN toast").
 *
 * WHAT IS DELIBERATELY ABSENT: a toast history, a queue that outlives the mount,
 * and any way to read a toast back. §1.6 — "a toast never carries information
 * the user cannot afford to miss" — is only true while there is nowhere to look
 * one up, because the moment there is, someone will put something in it.
 * ========================================================================= */

export interface ToastRequest {
  /** Default `success`. */
  tone?: ToastTone | undefined;

  /** The first line, ALREADY TRANSLATED. */
  title: ReactNode;

  /** The second line. Optional, and already translated. */
  body?: ReactNode | undefined;

  /** One action. Its presence overrides the tone's duration with 10s (§2). */
  action?: ToastAction | undefined;

  /** What makes two toasts "the same message" for §2's de-duplication. Supply it
   *  whenever the title is not a plain string — a `ReactNode` cannot be
   *  compared, so without a key every fire of a rich message is a new toast. */
  dedupeKey?: string | undefined;
}

interface Entry extends ToastRequest {
  id: number;
  key: string;
  count: number;
}

interface ToastApi {
  /** Fire one. Returns nothing: a caller that wants to dismiss its own toast
   *  wants a modal instead — see §1.5. */
  show: (request: ToastRequest) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** §2: three visible at once; a fourth evicts the oldest. */
const MAX_VISIBLE = 3;

/**
 * The API. Throws rather than returning a no-op when the provider is missing,
 * because a silent no-op here is a failure the user never sees: the write
 * succeeded, the toast was requested, and nothing appeared.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return api;
}

/**
 * Holds the stack and renders it. Mounted once, inside the shell.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation('common');
  const [entries, setEntries] = useState<Entry[]>([]);

  /* A COUNTER, NOT `Date.now()` AND NOT A RANDOM. Two toasts fired in the same
     millisecond — a bulk action reporting per row — would collide on a
     timestamp, and React would reuse one DOM node for two different messages.
     A ref rather than state because incrementing it must not itself render. */
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const show = useCallback((request: ToastRequest) => {
    setEntries((current) => {
      const key =
        request.dedupeKey ??
        (typeof request.title === 'string' ? request.title : String(nextId.current));

      /* §2: A DUPLICATE DOES NOT STACK. It refreshes the one already there and
         shows «×2». Three identical "could not send" cards is not three facts —
         it is one fact and two copies, and it evicts the two unrelated messages
         underneath it out of a stack that only holds three. */
      const existing = current.findIndex((entry) => entry.key === key);
      if (existing !== -1) {
        const next = [...current];
        const found = next[existing];
        if (found !== undefined) {
          /* A NEW `id` on the refreshed entry. It is what remounts the card, and
             the remount is what restarts the countdown and re-announces the
             message to a screen reader — an assistive technology says nothing
             when text it has already read does not change. */
          next[existing] = {
            ...found,
            ...request,
            key,
            id: nextId.current++,
            count: found.count + 1,
          };
        }
        return next;
      }

      const entry: Entry = { ...request, key, id: nextId.current++, count: 1 };

      /* NEWEST FIRST in the array, and the stylesheet does not reverse it: §2
         says the newest sits at the top and the stack is anchored to the top
         edge, so document order and reading order agree. The slice is what
         evicts the oldest — which is at the END of this array. */
      return [entry, ...current].slice(0, MAX_VISIBLE);
    });
  }, []);

  const api = useMemo<ToastApi>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}

      {/* NOT RENDERED AT ALL when empty, rather than an empty positioned box.
          The region is `position: fixed` over the whole inline-end column; an
          empty one with `pointer-events: none` would still be a box that a
          future style change can make clickable, and there is nothing to
          announce. */}
      {entries.length === 0 ? null : (
        <div className={styles.region}>
          {entries.map((entry) => (
            <Toast
              key={entry.id}
              tone={entry.tone}
              body={entry.body}
              action={entry.action}
              count={entry.count}
              dismissLabel={t('dismiss')}
              onDismiss={() => dismiss(entry.id)}
              autoDismissMs={durationFor(entry) ?? undefined}
            >
              {entry.title}
            </Toast>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

/**
 * §2's timing table, applied.
 *
 * The action rule wins over the tone's own duration and it is not a maximum: a
 * success carrying "undo" gets 10s, not 4s, because the reader has to notice the
 * action, decide, and reach it. An error stays `null` either way — a retry
 * button does not make a failure something that should disappear.
 */
function durationFor(entry: Entry): number | null {
  const base = TOAST_MS[entry.tone ?? 'success'];
  if (base === null) return null;
  return entry.action === undefined ? base : TOAST_ACTION_MS;
}
