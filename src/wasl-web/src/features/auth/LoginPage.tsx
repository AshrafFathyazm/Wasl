import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { ApiError, TRANSPORT_PROBLEM_TYPES } from '../../lib/api';
import type { SignInResponse } from '../../lib/api-types.provisional';
import { useAuth } from './AuthContext';
import { signIn as signInRequest } from './auth.api';
import { RETURN_URL_PARAM, safeReturnPath } from './guards';
import { BrandPanel } from './BrandPanel';
import { LanguageSwitch } from './LanguageSwitch';
import styles from './Login.module.css';
import { LoginForm } from './LoginForm';
import { toSignInRequest, type SignInParsed } from './signIn.schema';

/* ============================================================================
 * LoginPage — the route, and the only place in the feature that fetches
 * ============================================================================
 *
 * ADR-011 §4: fetching happens at the route level. One mutation, in one place.
 *
 * `401` IS THIS SCREEN'S ERROR STATE, AND ONLY THIS SCREEN'S.
 *
 * Everywhere else in the product a `401` clears the token and redirects here.
 * That is `lib/api.ts`'s interceptor, and it excludes `SIGN_IN_PATH` by name —
 * without the exclusion a wrong password would redirect `/login` → `/login`,
 * discarding the form and its error, and the screen would look like the submit
 * button does nothing (AC-27).
 *
 * So this component renders the failure and never navigates on one.
 * ============================================================================ */

type FieldErrors = Partial<Record<'email' | 'password', string>>;

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn } = useAuth();

  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors | undefined>(undefined);

  const mutation = useMutation<SignInResponse, unknown, SignInParsed>({
    mutationFn: (values) => signInRequest(toSignInRequest(values)),

    onMutate: () => {
      /* Clear both before the request, so a second attempt does not show the
       * previous failure while it is still in flight. */
      setErrorMessage(undefined);
      setFieldErrors(undefined);
    },

    onSuccess: (response, values) => {
      /* The ORDER matters. `signIn` writes storage, adopts the language, and
       * arms the credential resolver; navigating first would mount the
       * destination route, fire its queries with no credential attached, and
       * collect a `401` on the way in. */
      signIn(response, values.rememberMe ? 'remember' : 'session');

      /* `replace`, so Back does not return to the sign-in screen the user has
       * just left — half of AC-28, and the half that is easy to miss because
       * nothing looks wrong until someone presses Back. */
      navigate(safeReturnPath(searchParams.get(RETURN_URL_PARAM)), { replace: true });
    },

    onError: (error) => {
      if (!(error instanceof ApiError)) {
        setErrorMessage(t('auth:error.unreachable'));
        return;
      }

      /* The transport never reached a server. A different sentence from a
       * rejected credential, because the user's next action is different:
       * retry, not retype. */
      if (error.problem.type === TRANSPORT_PROBLEM_TYPES.network) {
        setErrorMessage(t('auth:error.unreachable'));
        return;
      }

      /* `400` — the client mirror should have caught these, so arriving here
       * means the two disagree. The SERVER's messages are rendered, already
       * translated (BR-8.6); re-translating them client-side would put the same
       * sentence in two catalogues and let them drift.
       *
       * The keys of `errors` are REQUEST FIELD NAMES and are never localized,
       * which is why they can be switched on. */
      if (error.status === 400 && error.problem.errors !== undefined) {
        const next: FieldErrors = {};
        for (const field of ['email', 'password'] as const) {
          const messages = error.problem.errors[field];
          if (messages && messages.length > 0) next[field] = messages[0] ?? '';
        }
        if (Object.keys(next).length > 0) {
          setFieldErrors(next);
          return;
        }
      }

      /* `401`, and anything else. ONE BLOCK, NEVER A FIELD MESSAGE — the server
       * deliberately does not say which of the three causes it was, and
       * inventing a field-level message here would tell the user the email
       * exists.
       */

      setErrorMessage(
        error.problem.title !== '' ? error.problem.title : t('auth:error.invalid'),
      );
    },
  });

  return (
    /* TWO ELEMENTS, NOT ONE, and the split is what the frame needs.
     *
     * `.page` is the ground — full viewport, the light wash, and the centring.
     * `.screen` is the CARD, and it is the container query's subject: the
     * breakpoint is on the card's own width, so it fires when the card is
     * narrow rather than when the window is (01-login.md).
     *
     * `<main>` stays on the card. The ground is a background, and a landmark
     * whose bounds include the page's own padding is a landmark that claims
     * territory it does not own. */
    <div className={styles.page}>
      <main className={styles.screen}>
        <BrandPanel />

        <div className={styles.formColumn}>
          <LanguageSwitch />

          <div className={styles.formWrap}>
            <LoginForm
              onSubmit={(values) => mutation.mutate(values)}
              submitting={mutation.isPending}
              errorMessage={errorMessage}
              fieldErrors={fieldErrors}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
