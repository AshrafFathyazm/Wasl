import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Mark } from '../../brand/Mark';
import { WORDMARK_AR, WORDMARK_LATIN } from '../../brand/wordmark';
import { Button } from '../../components/Button/Button';
import { Checkbox } from '../../components/Checkbox/Checkbox';
import { Input } from '../../components/Input/Input';
import styles from './Login.module.css';
import {
  emptySignInForm,
  signInSchema,
  type SignInFormValues,
  type SignInParsed,
} from './signIn.schema';

/* ============================================================================
 * LoginForm — a `<form>`, and the four things that follow from that
 * ============================================================================
 *
 * Each is verifiable, each is silently absent when it is wrong, and together
 * they are AC-26:
 *
 *   1. `<form onSubmit>` with a `type="submit"` button → ENTER SUBMITS. People
 *      feel its absence without being able to name it.
 *   2. `name` + `autocomplete` on both inputs → PASSWORD MANAGERS FILL.
 *   3. `role="alert"` on the error block → a screen reader hears the failure.
 *   4. Focus returns to `email` after a failure → the user retypes without
 *      reaching for the mouse.
 *
 * THE ERROR IS ONE BLOCK, NEVER A FIELD MESSAGE.
 *
 * The server returns one `401` body for three causes — unknown email, wrong
 * password, inactive account — and they are identical apart from `traceId`. A
 * field-level message would say which field was wrong, which is precisely the
 * enumeration that response shape exists to prevent. So the block sits above the
 * submit, both inputs take the danger border, and neither is told why.
 *
 * This component FETCHES NOTHING (ADR-011 §4). `LoginPage` owns the mutation and
 * hands down `onSubmit`, `submitting`, and `errorMessage`.
 * ============================================================================ */

export interface LoginFormProps {
  onSubmit: (values: SignInParsed) => void;
  submitting: boolean;
  /** Already translated: either a server sentence rendered as received, or one
   *  of ours resolved from a key. `undefined` = no failure to show. */
  errorMessage?: string | undefined;
  /** Field messages the SERVER named on a `400`. Rare — the client mirror
   *  catches these first — but the contract defines the shape, so it is handled
   *  rather than swallowed. */
  fieldErrors?: Partial<Record<'email' | 'password', string>> | undefined;
}

export function LoginForm({
  onSubmit,
  submitting,
  errorMessage,
  fieldErrors,
}: LoginFormProps) {
  const { t } = useTranslation();
  const [capsLock, setCapsLock] = useState(false);

  /* AC-26 requirement 4, and RHF cannot do this one.
   *
   * `shouldFocusError` moves focus to the first field with a VALIDATION error.
   * A rejected credential is not one: the schema passed, the request went out,
   * and the server said no — so RHF has no error to focus and the caret stays
   * wherever it was. Worse, the inputs are disabled while the request is in
   * flight, which BLURS the focused element, so after a 401 focus has actually
   * moved to <body> and the next Tab starts from the top of the page.
   *
   * Measured in the browser: `document.activeElement` was BODY. */
  const emailRef = useRef<HTMLInputElement | null>(null);

  const form = useForm<SignInFormValues, unknown, SignInParsed>({
    resolver: zodResolver(signInSchema),
    defaultValues: emptySignInForm,
    /* Validate on blur, not on change: telling someone their email is invalid
     * while they are still typing it tells them they are wrong before they have
     * finished being right. */
    mode: 'onBlur',
    /* Requirement 4. RHF moves focus to the first field with an error, which is
     * what makes the `forwardRef` on `Input` load-bearing rather than
     * decorative. */
    shouldFocusError: true,
  });

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = form;

  /* THE SUBMIT IS GATED ON BOTH FIELDS BEING NON-EMPTY.
   *
   * A deviation, and a deliberate one: `004/frontend-spec.md`'s States table
   * gives Idle as "empty form, submit enabled". The product owner asked for the
   * button to stay disabled until an email and a password have been typed
   * (2026-08-28).
   *
   * PRESENCE, NOT VALIDITY. The gate tests `!== ''` and nothing else — it does
   * not wait for the email to parse. A button that stays dead while someone
   * types a valid-looking address gives them no way to find out what is wrong
   * with it; Zod's message on blur does that job, and it can only do it if the
   * form can be submitted.
   *
   * The password is checked WITHOUT trimming. A password of three spaces is a
   * password, and trimming here would leave the button dead for the one person
   * whose password that is.
   *
   * `useWatch` rather than `form.watch()`: it subscribes this component to these
   * two fields instead of re-rendering the whole form on every keystroke.
   *
   * Consequence, stated because it is easy to miss: with the button disabled
   * there is no enabled submit control, so ENTER DOES NOT SUBMIT either. That is
   * correct while the form is incomplete and it restores itself the moment both
   * fields have content — AC-26's first requirement still holds for every case
   * where submitting means anything. */
  const [emailValue, passwordValue] = useWatch({
    control,
    name: ['email', 'password'],
  });
  const incomplete = emailValue === '' || passwordValue === '';

  /* A message is either a server sentence, already translated, or one of our
   * keys. `t()` on a sentence returns it unchanged — the same helper `024` uses,
   * for the same reason. */
  const message = (raw: string | undefined) => (raw === undefined ? undefined : t(raw));

  const emailError = fieldErrors?.email ?? message(errors.email?.message);
  const passwordError = fieldErrors?.password ?? message(errors.password?.message);

  /* Requirement 3's other half: the inputs SHOW the failure without NAMING it.
   * `invalid` paints the danger border and sets `aria-invalid` while the only
   * explanation stays in the one block above the submit. */
  const credentialsRejected = errorMessage !== undefined;

  useEffect(() => {
    if (credentialsRejected) emailRef.current?.focus();
  }, [credentialsRejected, errorMessage]);

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      {/* THE LOCKUP. `01-login.md`'s Elements table gives the form side a mark
          tile, and the plain build owes it — it is not part of the Phase 6 panel.
          It was missing until the product owner compared the screen against the
          reference.

          The wordmark is a BRAND ASSET, not copy: `WORDMARK_AR` and
          `WORDMARK_LATIN` are constants, never `t()` keys, because "وصل" is the
          mark rendered as text and is not translated in either direction. */}
      <div className={styles.lockup}>
        <span className={styles.lockupTile} aria-hidden="true">
          <Mark size={22} />
        </span>
        <span className={styles.lockupText}>
          <span className={styles.wordmarkAr}>{WORDMARK_AR}</span>
          {/* `lang="en"` is correct markup for a Latin wordmark inside an Arabic
              page, and it is also what lets locale.css leave this alone: tracking
              is neutralised on untagged Arabic descendants, and 0.19em here is
              deliberate. Untagged, it would be flattened with the rest. */}
          <span className={styles.wordmarkLatin} lang="en">
            {WORDMARK_LATIN}
          </span>
        </span>
      </div>

      <div className={styles.formHeader}>
        <h1 className={styles.title}>{t('auth:signIn.title')}</h1>
        <p className={styles.subtitle}>{t('auth:signIn.subtitle')}</p>
      </div>

      {/* Requirement 3. Rendered only when there is something to say — an
          always-present empty alert is announced on mount and says nothing. */}
      {errorMessage === undefined ? null : (
        <div className={styles.error} role="alert">
          <bdi>{errorMessage}</bdi>
        </div>
      )}

      {/* A WRAPPER, and its only job is to be a thing the stylesheet can name.
          The password field already had one for its caps-lock hint; the email
          field had none, so the entrance stagger had nothing to attach to and
          `nth-child` would have shifted by one the moment the error block above
          it appeared. Symmetric with `.passwordBlock`, which is what it should
          have been anyway. */}
      <div className={styles.fieldBlock}>
        <Controller
          control={control}
          name="email"
          render={({ field }) => (
            <Input
              /* `field.ref` is what `shouldFocusError` and `setFocus` call
                 .focus() on. Without it a failed submit leaves the caret where it
                 was and the user hunts for the message — AC-26 requirement 4. */
              ref={(node) => {
                emailRef.current = node;
                field.ref(node);
              }}
              label={t('auth:field.email')}
              type="email"
              /* Requirement 2. Both attributes, or a password manager will not
                 fill and every sign-in becomes manual. */
              name="email"
              autoComplete="email"
              inputMode="email"
              placeholder={t('auth:field.emailPlaceholder')}
              maxLength={320}
              required
              /* Both fields on this form are required, so a marker on each one
                 distinguishes nothing — it is a column of asterisks that reads as
                 a warning. `required` itself stays, so the native attribute and
                 the `aria-required` it carries are unchanged. */
              requiredMarker={false}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              disabled={submitting}
              error={emailError}
              invalid={credentialsRejected}
            />
          )}
        />
      </div>

      <div className={styles.passwordBlock}>
        <Controller
          control={control}
          name="password"
          render={({ field }) => (
            <Input
              ref={field.ref}
              label={t('auth:field.password')}
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder={t('auth:field.passwordPlaceholder')}
              revealLabel={t('auth:field.revealPassword')}
              hideLabel={t('auth:field.hidePassword')}
              maxLength={256}
              required
              /* Both fields on this form are required, so a marker on each one
                 distinguishes nothing — it is a column of asterisks that reads as
                 a warning. `required` itself stays, so the native attribute and
                 the `aria-required` it carries are unchanged. */
              requiredMarker={false}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              disabled={submitting}
              error={passwordError}
              invalid={credentialsRejected}
              /* `keyup`, not `keydown`: on `keydown` for the Caps Lock key
                 itself the modifier still reports its PREVIOUS state, so the
                 hint appears exactly one keystroke late and disappears one
                 late — which reads as the hint being wrong rather than delayed. */
              onKeyUp={(event) => setCapsLock(event.getModifierState('CapsLock'))}
            />
          )}
        />

        {/* A HINT, NOT AN ALERT. `role="alert"` here would interrupt a screen
            reader on every keystroke. One failed sign-in from Caps Lock
            convinces someone they have forgotten their password. */}
        {capsLock ? <span className={styles.capsLock}>{t('auth:capsLock')}</span> : null}
      </div>

      <div className={styles.formRow}>
        <Controller
          control={control}
          name="rememberMe"
          render={({ field }) => (
            <Checkbox
              ref={field.ref}
              label={t('auth:rememberMe')}
              name="rememberMe"
              checked={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              disabled={submitting}
            />
          )}
        />

        {/* `<details>` rather than a link or a modal. There IS no reset flow
            (ADR-005), so a link would have nowhere to go and a modal would be a
            dialog to say one sentence. Native disclosure: keyboard reachable,
            announced, and it needs no state. */}
        <details className={styles.forgot}>
          <summary className={styles.forgotSummary}>{t('auth:forgotPassword')}</summary>
          <p className={styles.forgotAnswer}>{t('auth:forgotPasswordAnswer')}</p>
        </details>
      </div>

      {/* Requirement 1. `type="submit"` is what makes Enter work; the wrapper is
          what makes it full-width without `Button` growing a layout prop. */}
      <div className={styles.submit}>
        <Button
          type="submit"
          buttonType="primary"
          text={submitting ? t('auth:signIn.submitting') : t('auth:signIn.submit')}
          loading={submitting}
          disabled={incomplete}
        />
      </div>

      {/* The year is INTERPOLATED, not written into the catalogue — a hard-coded
          2026 in two locale files is two places to be wrong next January. */}
      <p className={styles.footer}>
        <span className={styles.footerMark} aria-hidden="true">
          <Mark size={12} />
        </span>
        {t('auth:copyright', { year: new Date().getFullYear() })}
      </p>
    </form>
  );
}
