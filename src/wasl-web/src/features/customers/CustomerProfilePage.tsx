import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';

import { Toast } from '../../components/Toast/Toast';
import { IconCheck } from '../../icons/icons';
import { ApiError } from '../../lib/api';
import type { Lang } from '../../lib/formatters';
import { CustomerProfileView, type ProfileState } from './CustomerProfileView';
import { getCustomer } from './customers.api';
import styles from './Customers.module.css';

/* ============================================================================
 * CustomerProfilePage — the ROUTE (ADR-011 §4)
 * ============================================================================
 * THE ONLY FETCH ON THIS SCREEN LIVES HERE, and `CustomerProfileView` receives
 * a state and a customer. That split is what makes the ADR-009 preview able to
 * render `error` and `notFound` on demand instead of by breaking the server.
 *
 * NOTHING RENDERS A CUSTOMER FROM A WRITE RESPONSE (AC-1, `026` §5). The create
 * screen navigates here by the `Location` header and this page fetches its own
 * copy; there is no `setQueryData` seeding `['customer', id]` from a `201`. The
 * two response shapes are now identical types (see `api-types.provisional.ts`),
 * so the compiler would no longer object — which is exactly why the rule is
 * asserted by a test rather than left to the type.
 * ========================================================================== */

/** How long the copy confirmation stays. Long enough to read, short enough that
 *  it is gone before the reader wonders whether it is a permanent state. */
const TOAST_MS = 1800;

export default function CustomerProfilePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { id = '' } = useParams<{ id: string }>();
  const lang: Lang = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en';

  const [copied, setCopied] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['customer', id],
    queryFn: ({ signal }) => getCustomer(id, signal),
    /* NO RETRY ON A `404`, and the default would retry three times.
     *
     * It is not a transient fault — it is an answer, and retrying it makes the
     * not-found state take three round trips to appear while the skeleton sits
     * there looking like a slow network. A `500` and a dropped connection still
     * retry once, because those genuinely can succeed on a second attempt. */
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 404 ? false : failureCount < 1,
  });

  /**
   * The four states, and the mapping is the whole decision on this page.
   *
   * A MALFORMED ID LANDS ON `notFound` TOO, and it is not a special case here
   * because the server does not give it one: `[HttpGet("{id:guid}")]` fails the
   * route match, so `/api/customers/not-a-guid` answers `404 errors/not-found`
   * — measured, and asserted by the backend's own
   * `A_malformed_id_returns_404_which_the_contract_says_should_be_400`. The
   * frozen contract promises `400 errors/validation` naming `id`.
   *
   * So the branch below reads the STATUS and not the `type`, and one state
   * serves both causes (AC-2). That is the only mapping that stays correct
   * however the difference is resolved: if the backend later returns the
   * contract's `400`, a `400` on a GET with no form to attach messages to is
   * still "this id does not resolve", and the `else` branch — the error state —
   * would be wrong for it. Handled explicitly rather than by falling through.
   */
  const state: ProfileState = query.isPending
    ? 'loading'
    : query.isError
      ? query.error instanceof ApiError &&
        (query.error.status === 404 || query.error.status === 400)
        ? 'notFound'
        : 'error'
      : 'loaded';

  /* The `traceId` is read off the problem, never synthesised. A transport
   * failure has none — the request never reached a server, so no server logged
   * it — and showing an invented one would send someone hunting through logs
   * for a string that was never written. */
  const traceId =
    query.error instanceof ApiError ? query.error.problem.traceId : undefined;

  return (
    <>
      <CustomerProfileView
        state={state}
        customer={query.data}
        traceId={traceId}
        onRetry={() => void query.refetch()}
        onCopied={(fieldLabel) => setCopied(fieldLabel)}
        lang={lang}
        onEdit={(customerId) => void navigate(`/customers/${customerId}/edit`)}
      />

      {/* ONE TOAST, NAMING WHAT WAS COPIED. Three copy controls share it, and the
          message says which value it was — "Copied" alone leaves the reader
          checking their clipboard to find out which of three buttons they hit.

          Keyed on the field name so a second copy remounts the region and is
          announced again; without the key, React reuses the node and a screen
          reader stays silent on the second copy because the text did not change
          when the same field is copied twice. */}
      {copied === null ? null : (
        <div className={styles.toastSlot}>
          <Toast
            key={copied}
            /* THE DARK PILL WITH A TICK, which is what the design draws — and the
               tone is new (`Toast.module.css` records why it is additive rather
               than a change to the other three). A light-green panel at the
               corner of a light page has no edge to sit against. */
            tone="inverse"
            dismissLabel={t('common:dismiss')}
            onDismiss={() => setCopied(null)}
            autoDismissMs={TOAST_MS}
          >
            <span className={styles.toastBody}>
              {/* The tick is the design's, and it is decoration: the sentence
                  beside it already says what happened, so announcing the glyph
                  too would say it twice. */}
              <span className={styles.toastTick} aria-hidden="true">
                <IconCheck size={14} />
              </span>
              {t('customers:profile.copied', { field: copied })}
            </span>
          </Toast>
        </div>
      )}
    </>
  );
}
