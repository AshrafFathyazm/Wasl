import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '../../components/Button/Button';
import { Input } from '../../components/Input/Input';
import { Textarea } from '../../components/Textarea/Textarea';
import { ApiError } from '../../lib/api';
import styles from './CreateCustomer.module.css';
import {
  createCustomerSchema,
  emptyCreateCustomerForm,
  toCreateCustomerRequest,
  type CreateCustomerFormValues,
  type CreateCustomerParsed,
} from './createCustomer.schema';
import { createCustomer } from './customers.api';

/* ============================================================================
 * CreateCustomerPage — the ROUTE, wiring FE-007-00's preview to `007`
 * ============================================================================
 * The preview at `/_preview/create-customer` established the layout, the six
 * states and the copy. This is the same screen with a server behind it.
 *
 * WHAT THIS SCREEN DOES NOT DO, and each absence is a rule:
 *   - it does not pre-check for a duplicate. BR-4.8's two filtered unique
 *     indexes are the guarantee and the `409` is how this client learns. A
 *     check-then-create is a race two concurrent requests both pass (`007`
 *     AC-13 is the test that exists because of it), and it would leak whether
 *     an address is on file to anyone who can open this form.
 *   - it does not render the created customer. It navigates to the profile,
 *     which fetches its own (AC-1).
 *   - it does not translate a server message. `errors[field]` arrives already
 *     translated (BR-8.6) and is rendered as received.
 * ========================================================================== */

/**
 * The `Location` header → a path this app can route to.
 *
 * The same two-form problem `024` measured: the contract shows
 * `Location: /api/customers/{id}` and the running server sends the absolute
 * form. `new URL(value, origin)` parses both with no branch, and only the
 * PATHNAME is used — a host in the header is the API's, never a route in this
 * app, and following it would navigate out of the SPA.
 */
function toAppPath(location: string | null, customerId: string): string {
  const fallback = `/customers/${customerId}`;
  if (location === null) return fallback;

  try {
    const { pathname } = new URL(location, window.location.origin);
    const stripped = pathname.replace(/^\/api/, '');
    return stripped === '' ? fallback : stripped;
  } catch {
    return fallback;
  }
}

/**
 * Where to go after a create, when the caller asked to be returned somewhere.
 *
 * `08-create-customer.md` specifies the ticket form sending the user here and
 * getting them back with the new customer selected. The parameter is read here
 * so the path exists the moment `024`'s picker offers the link.
 *
 * IT MUST BE AN INTERNAL, ABSOLUTE PATH AND NOTHING ELSE. A `returnUrl` copied
 * into a navigation unchecked is an open redirect: `?returnUrl=https://evil…`
 * would take a signed-in user off the product on a link that looks like ours,
 * and `//evil.example` is protocol-relative — it has no scheme, so a check for
 * `http` passes it and the browser still leaves the origin. One leading slash,
 * not two, and no scheme.
 */
function safeReturnUrl(raw: string | null): string | null {
  if (raw === null) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

export default function CreateCustomerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnUrl = safeReturnUrl(params.get('returnUrl'));

  /** A `409`, or any failure with no field to attach itself to. */
  const [formError, setFormError] = useState<string | null>(null);
  /** The value to search for, set only by a `409`. It is the ONLY route to the
   *  existing record: BR-4.7 forbids the response naming its id. */
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null);

  /* THE DOUBLE-SUBMIT GUARD IS A REF, not `isPending` and not `disabled`.
   * Measured in `024`: two synchronous clicks sent two `POST`s, because both of
   * those are state and are only true after a re-render, while the second click
   * lands before it. A ref flips in the same tick.
   *
   * `POST /api/customers` is not idempotent. Two identical submits with the same
   * email are caught by BR-4.8's index — but two submits with only a NAME are
   * two real customers, and nothing on the server objects (BR-4.6: name is
   * deliberately not part of the duplicate rule). */
  const submitting = useRef(false);

  const form = useForm<CreateCustomerFormValues, unknown, CreateCustomerParsed>({
    defaultValues: emptyCreateCustomerForm,
    resolver: zodResolver(createCustomerSchema),
    /* On blur. Validating as someone types tells them they are wrong before they
     * have finished being right (`10-shared-patterns.md`). */
    mode: 'onBlur',
  });

  const mutation = useMutation({
    mutationFn: (values: CreateCustomerParsed) =>
      createCustomer(toCreateCustomerRequest(values)),
    onSuccess: ({ customer, location }) => {
      if (returnUrl !== null) {
        /* Back where they came from, carrying the new customer so the ticket
         * form can select it without a second request. The ROUTE state, not a
         * query cache write: seeding `['customer', id]` from a create response
         * is the thing AC-1 forbids. */
        navigate(returnUrl, {
          state: { createdCustomerId: customer.id, createdCustomerName: customer.fullName },
        });
        return;
      }
      navigate(toAppPath(location, customer.id));
    },
    onError: (error: unknown) => handleFailure(error),
  });

  function handleFailure(error: unknown) {
    setDuplicateOf(null);

    if (!(error instanceof ApiError)) {
      setFormError(t('customers:new.unknownError'));
      return;
    }

    /* 400 — one message per field, attached to the field the SERVER named. The
     * keys are request field names and part of the frozen contract, so there is
     * no mapping table to drift.
     *
     * RENDERED AS RECEIVED. Server messages arrive translated; re-translating
     * one is how a client ends up displaying a resource key, which has shipped
     * three times in this product. */
    if (error.status === 400 && error.problem.errors) {
      const fields = Object.keys(emptyCreateCustomerForm) as Array<
        keyof CreateCustomerFormValues
      >;
      let first: keyof CreateCustomerFormValues | null = null;

      for (const field of fields) {
        const messages = error.problem.errors[field];
        if (messages && messages.length > 0) {
          form.setError(field, { type: 'server', message: messages[0] ?? '' });
          if (!first) first = field;
        }
      }

      if (first) form.setFocus(first);
      else setFormError(error.problem.title);
      return;
    }

    /* 409 — a duplicate, and the response names ONE field even when both
     * collide: `007`'s contract says it names `email` and stops, because one
     * conflict is enough to act on.
     *
     * The body carries nothing else — no id, no name (BR-4.7) — so the only way
     * to reach the existing record is a search for the value the user typed.
     * That constraint is deliberate and this is where it is felt. */
    if (error.status === 409 && error.problem.errors) {
      const field = (['email', 'phone'] as const).find(
        (name) => (error.problem.errors?.[name]?.length ?? 0) > 0,
      );

      if (field) {
        const messages = error.problem.errors[field] ?? [];
        form.setError(field, { type: 'server', message: messages[0] ?? '' });
        form.setFocus(field);
        setDuplicateOf(form.getValues(field).trim());
        return;
      }

      setFormError(error.problem.title);
      return;
    }

    /* 401 is the interceptor's — `lib/api.ts` clears the session and redirects
     * once per burst. Reaching here with one would mean it fired; nothing to add.
     *
     * Everything else, including a network failure, is the server's own title:
     * translated by it, and more specific than anything this screen could say. */
    setFormError(error.problem.title);
  }

  const onSubmit = form.handleSubmit((values) => {
    if (submitting.current) return;
    submitting.current = true;
    setFormError(null);
    setDuplicateOf(null);
    mutation.mutate(values, {
      onSettled: () => {
        submitting.current = false;
      },
    });
  });

  const busy = mutation.isPending;
  const errors = form.formState.errors;

  /* A message is either a server sentence, already translated, or one of our
   * keys. `t()` returns its input unchanged when it is not a key, so a server
   * sentence passes through untouched. */
  const message = (raw: string | undefined) => (raw === undefined ? undefined : t(raw));

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <Link className={styles.back} to={returnUrl ?? '/customers'}>
          {t('common:back')}
        </Link>
        <h2 className={styles.title}>{t('customers:new.title')}</h2>
      </div>

      {formError === null ? null : (
        <div className={styles.notice} role="alert">
          <bdi>{formError}</bdi>
        </div>
      )}

      <form onSubmit={onSubmit} noValidate>
        <div className={styles.card}>
          <Controller
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <Input
                ref={field.ref}
                label={t('customers:field.name')}
                required
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                maxLength={200}
                helperText={t('customers:new.nameHelp')}
                error={message(errors.fullName?.message)}
              />
            )}
          />

          {/* ABOVE THE TWO FIELDS IT GOVERNS, and a HINT rather than an error: an
              empty form has not failed anything yet. A cross-field rule explained
              under the second field is explained too late (AC-9). */}
          <p className={styles.hint}>{t('customers:new.contactRequired')}</p>

          <Controller
            control={form.control}
            name="email"
            render={({ field }) => (
              <Input
                ref={field.ref}
                label={t('customers:field.email')}
                type="email"
                inputMode="email"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                maxLength={320}
                error={message(errors.email?.message)}
              />
            )}
          />

          <Controller
            control={form.control}
            name="phone"
            render={({ field }) => (
              <Input
                ref={field.ref}
                label={t('customers:field.phone')}
                inputMode="tel"
                /* PINNED LTR, and it is a contract change on `Input` (see the
                   prop's own note). Measured in Arabic: with `dir="auto"` the
                   placeholder rendered `5X XXX XXXX 966+` — the country code at
                   the far end of the field, still looking like a phone number. */
                dir="ltr"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                maxLength={20}
                /* NO FIXED `+966` PREFIX BOX, and the design draws one (spec
                   Q-3). A static prefix makes a non-Saudi number unenterable
                   through this form while `POST /api/customers` accepts any
                   parseable E.164 — a client narrowing its own API. The country
                   code is a placeholder instead, and the server normalises. */
                placeholder={t('customers:new.phonePlaceholder')}
                helperText={t('customers:new.phoneHelp')}
                error={message(errors.phone?.message)}
              />
            )}
          />

          {/* THE ONLY ROUTE TO THE EXISTING RECORD. The `409` names a field and
              nothing else, so this searches for the value that collided. */}
          {duplicateOf === null ? null : (
            <p className={styles.findExisting}>
              <Link to={`/customers?search=${encodeURIComponent(duplicateOf)}`}>
                {t('customers:new.findExisting')}
              </Link>
            </p>
          )}

          <Controller
            control={form.control}
            name="companyName"
            render={({ field }) => (
              <Input
                ref={field.ref}
                label={t('customers:field.company')}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                maxLength={200}
                error={message(errors.companyName?.message)}
              />
            )}
          />

          <Controller
            control={form.control}
            name="notes"
            render={({ field }) => (
              <Textarea
                ref={field.ref}
                label={t('customers:field.notes')}
                rows={4}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                maxLength={2000}
                counterFrom={1900}
                error={message(errors.notes?.message)}
              />
            )}
          />
        </div>

        <div className={styles.actions}>
          {/* `loading` disables AND shows the system loader, and THE LABEL DOES
              NOT CHANGE. `Button` keeps its accessible name while busy and
              carries `aria-busy` — swapping it to "Saving…" renames the control
              mid-action, so a screen reader announces a different button from the
              one that was pressed (AC-6). */}
          <Button
            type="submit"
            text={t('customers:new.submit')}
            loading={busy}
          />
          <Link className={styles.cancel} to={returnUrl ?? '/customers'}>
            {t('common:cancel')}
          </Link>
          <span className={styles.optionalNote}>{t('customers:new.optionalNote')}</span>
        </div>
      </form>
    </div>
  );
}
