import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';

import { useToast } from '../../components/Toast/ToastHost';
import { ApiError } from '../../lib/api';
import type { Lang } from '../../lib/formatters';
import { CustomerProfileView, type ProfileState } from './CustomerProfileView';
import { getCustomer } from './customers.api';

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

/* THE COPY CONFIRMATION IS THE SYSTEM TOAST NOW — 2026-09-06.
 *
 * It used to render `<Toast tone="inverse">` into a slot of this page's own,
 * with its own tick glyph and its own 1800ms: a dark pill twice the height of
 * every other toast in the product, in a different corner, dismissing on a
 * different clock. Reported as «غير توستر الكوبي دا بتوستر من الموجودين في
 * السيستم وخلي حجمه اصغر ومتنساق».
 *
 * `useToast()` gives it the shared stack — one position, one size, one
 * duration, the same dismiss affordance. THE DEDUPE COMES FREE AND IS BETTER
 * THAN WHAT WAS HERE: this page keyed the element on the field name so a second
 * copy would remount and re-announce; the host keys on the title, refreshes the
 * card with a new id — which remounts and re-announces — and shows «×2».
 *
 * The `inverse` tone stays in `Toast.module.css` and keeps its own note. It is
 * no longer used by this page, and whether anything else should use it is a
 * question for whoever wants a dark toast next.
 */

export default function CustomerProfilePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { id = '' } = useParams<{ id: string }>();
  const lang: Lang = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en';
  const toast = useToast();

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
    <CustomerProfileView
      state={state}
      customer={query.data}
      traceId={traceId}
      onRetry={() => void query.refetch()}
      /* NAMES WHAT WAS COPIED, and that has not changed: three copy controls
         share one toast, and "Copied" alone leaves the reader checking their
         clipboard to find out which button they hit. */
      onCopied={(fieldLabel) =>
        toast.show({
          tone: 'success',
          title: t('customers:profile.copied', { field: fieldLabel }),
        })
      }
      lang={lang}
      onEdit={(customerId) => void navigate(`/customers/${customerId}/edit`)}
    />
  );
}
