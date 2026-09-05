import { useToast } from '../../components/Toast/ToastHost';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { Button } from '../../components/Button/Button';
import { Input } from '../../components/Input/Input';
import { Skeleton } from '../../components/Loader/Skeleton';
import { Textarea } from '../../components/Textarea/Textarea';
import { ApiError } from '../../lib/api';
import { cx } from '../../lib/cx';

import { CustomerScreenSwitcher } from './CustomerScreenSwitcher';
import {
  createCustomerSchema,
  type CreateCustomerFormValues,
  type CreateCustomerParsed,
} from './createCustomer.schema';
import { customerKeys, getCustomer, updateCustomer } from './customers.api';
import styles from './CreateCustomer.module.css';

/* ============================================================================
 * `/customers/:id/edit` — `035` §4.2, on `017`'s frozen contract.
 * ============================================================================
 * THE SAME ZOD SCHEMA AS THE CREATE, and that is not laziness: BR-4.1 (one of
 * email or phone), BR-4.2's email shape and BR-4.3's phone shape are the same
 * rules on both endpoints, and the server enforces them from the same
 * `ContactNormalisation`. A second schema would be a second opinion about the
 * same business rules, and the drift would show up as a form that accepts what
 * the server refuses — or refuses what it accepts, which is worse because
 * nothing on the server ever hears about it.
 *
 * WHAT IS DIFFERENT is `expectedVersion`, and it is not in the schema because it
 * is not something the reader types. It comes from the READ, and the whole
 * concurrency story turns on that: taking it from a previous write's response
 * would be taking it from a value the client generated rather than one it
 * observed.
 * ========================================================================= */

export default function EditCustomerPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const { id = '' } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: customerKeys.detail(id),
    queryFn: ({ signal }) => getCustomer(id, signal),
    enabled: id !== '',
  });

  /** A `409`, or any failure with no field to attach itself to. */
  const [formError, setFormError] = useState<string | null>(null);

  /** True after a `409 concurrency-conflict`, which needs a different action
   *  from every other failure: refetch, not retype. */
  const [stale, setStale] = useState(false);

  /* THE DOUBLE-SUBMIT GUARD IS A REF, for the reason `024` measured: two
   * synchronous clicks sent two requests, because `isPending` and `disabled` are
   * both state and are only true after a re-render, while the second click lands
   * before it. A ref flips in the same tick. */
  const submitting = useRef(false);

  const form = useForm<CreateCustomerFormValues, unknown, CreateCustomerParsed>({
    /* PRE-FILLED FROM THE READ, through `values` rather than `defaultValues`:
     * the query resolves after the first render, and `defaultValues` is read
     * once. `values` re-syncs while the field is untouched and leaves a dirty
     * field alone, which is what stops a background refetch wiping something
     * half-typed. */
    values: {
      fullName: query.data?.fullName ?? '',
      email: query.data?.email ?? '',
      phone: query.data?.phone ?? '',
      companyName: query.data?.companyName ?? '',
      notes: query.data?.notes ?? '',
    },
    resolver: zodResolver(createCustomerSchema),

    /* Same change as the create form, and for the same reason — see the long
       note there. It matters slightly less here because the fields arrive
       pre-filled from the read, but a reader who CLEARS a field and tabs on
       would have been accused mid-edit. */
    mode: 'onSubmit',
    reValidateMode: 'onBlur',
  });

  const mutation = useMutation({
    mutationFn: (values: CreateCustomerParsed) => {
      /* THE VERSION COMES FROM THE READ. `query.data` is refetched after every
       * save, so this is always the value the server last handed over — never
       * one this client derived. */
      const expectedVersion = query.data?.version;
      if (expectedVersion === undefined) {
        return Promise.reject(new Error('no version to send'));
      }

      /* EVERY FIELD, ALWAYS. `PUT` replaces: an omitted or `null` optional is
       * CLEARED, and the contract calls that "the only failure on this endpoint
       * that produces no error at all". Spreading a partial object here would
       * silently delete whatever the reader did not touch. */
      return updateCustomer(id, {
        fullName: values.fullName,
        email: values.email,
        phone: values.phone,
        companyName: values.companyName,
        notes: values.notes,
        expectedVersion,
      });
    },
    onSuccess: () => {
      /* REFETCHED, never seeded. `032` AC-1 forbids writing a customer into the
       * detail key from a write response, and the reason applies twice as much
       * here: the next save's `expectedVersion` is read from this key, so a
       * seeded value would be a version the client wrote rather than one the
       * server issued. */
      void queryClient.invalidateQueries({ queryKey: customerKeys.detail(id) });
      /* THE LIST PREFIX, not one keyed page: `customerKeys.list` is keyed by the
         whole filter object, so invalidating a single key would leave every other
         page and every other filter showing the old name. */
      void queryClient.invalidateQueries({ queryKey: ['customers', 'list'] });
      void navigate(`/customers/${id}`);

      /* §1.1: "customer created or edited → close the panel, THEN toast". Here
         the equivalent of closing is the navigation above, and the toast follows
         it for the same reason — the host is mounted in `AppShell`, above the
         route, so the message survives the page change and lands on the profile
         the reader is now looking at. A toast fired from a component that is
         about to unmount would go with it. */
      toast.show({ tone: 'success', title: t('customers:edit.savedToast') });
    },
    onError: (error: unknown) => {
      setStale(false);

      if (!(error instanceof ApiError)) {
        setFormError(t('customers:new.unknownError'));
        return;
      }

      const problem = error.problem;

      /* TWO DIFFERENT `409`s, and they need opposite actions from the reader —
       * which is why the client branches on `type` and never on `title` or
       * `detail`, both of which are localized (BR-8). */
      if (problem.type.endsWith('errors/concurrency-conflict')) {
        setStale(true);
        setFormError(t('customers:edit.staleBody'));
        return;
      }

      /* A `400` or a duplicate `409` names fields. The message is the SERVER's
       * sentence, already translated — `t()` returns its input unchanged when it
       * is not a key, so it passes through untouched. */
      const fields = problem.errors ?? {};
      let attached = false;
      for (const [field, messages] of Object.entries(fields)) {
        const message = messages[0];
        if (message === undefined) continue;
        if (
          field === 'fullName' ||
          field === 'email' ||
          field === 'phone' ||
          field === 'companyName' ||
          field === 'notes'
        ) {
          form.setError(field, { message });
          attached = true;
        }
      }

      /* A failure that named no field this form has still has to say something:
       * the problem's own title, never an empty banner. */
      if (!attached) setFormError(problem.title);
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    if (submitting.current) return;
    submitting.current = true;
    setFormError(null);
    setStale(false);
    mutation.mutate(values, {
      onSettled: () => {
        submitting.current = false;
      },
    });
  });

  const busy = mutation.isPending;
  const errors = form.formState.errors;
  const message = (raw: string | undefined) => (raw === undefined ? undefined : t(raw));

  /* NOT FOUND AND MALFORMED ARE ONE STATE, because the API answers `404` to
   * both — `{id:guid}` on the action means an unparseable id never matches the
   * route. `032` AC-2 asserts it with both inputs. */
  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className={styles.page}>
        <p className={styles.notice} role="alert">
          {notFound
            ? t('customers:profile.notFoundBody')
            : t('customers:profile.errorBody')}
        </p>
        <Link className={styles.back} to="/customers">
          {t('customers:profile.backToList')}
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {id === '' ? null : <CustomerScreenSwitcher id={id} />}

      <nav className={styles.crumbs} aria-label={t('common:nav.customers')}>
        <Link className={styles.back} to="/customers">
          {t('common:nav.customers')}
        </Link>
      </nav>

      <div className={styles.head}>
        <h2 className={styles.title}>{t('customers:edit.title')}</h2>

        {/* The id as a chip, matching the frame. TRUNCATED and LTR-isolated: a
            GUID is an identifier, and its leading run lays out on the wrong edge
            in an RTL paragraph. */}
        {query.data === undefined ? (
          <Skeleton width="88px" height="22px" label={t('common:loading')} />
        ) : (
          <bdi className={styles.idChip} dir="ltr">
            {query.data.id.slice(0, 8)}
          </bdi>
        )}
      </div>

      {formError === null ? null : (
        <div className={cx(styles.notice, stale && styles.noticeStale)} role="alert">
          <bdi>{formError}</bdi>
          {/* A `409 concurrency-conflict` cannot be fixed by retyping, so the
              only useful control is the one that fetches the current copy. */}
          {!stale ? null : (
            <button
              type="button"
              className={styles.noticeAction}
              onClick={() => {
                setStale(false);
                setFormError(null);
                void query.refetch();
              }}
            >
              {t('customers:edit.reload')}
            </button>
          )}
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

          <hr className={styles.rule} />

          {/* THE STANDING HINT IS GONE — see the same removal in
              `CreateCustomerPage.tsx` for the reason. The schema emits this key
              on both contact fields, so the hint made one sentence appear three
              times the moment the rule was broken. Removed from BOTH forms in
              one change: leaving it here would be the same duplicate on the
              screen next door. */}

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
                placeholder={t('customers:new.emailPlaceholder')}
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
                /* PINNED LTR. Measured in Arabic by `032`: with `dir="auto"` the
                   placeholder rendered `5X XXX XXXX 966+` — the country code at
                   the far end of the field, still looking like a phone number.
                   NO FIXED `+966` BOX, and the frames draw one: both write
                   endpoints accept any parseable E.164 (BR-4.3), so a static
                   prefix makes a non-Saudi number unenterable through a form
                   whose own API would have taken it. Ruled 2026-09-03. */
                dir="ltr"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                maxLength={20}
                placeholder={t('customers:new.phonePlaceholder')}
                helperText={t('customers:new.phoneHelp')}
                error={message(errors.phone?.message)}
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
                placeholder={t('customers:new.notesPlaceholder')}
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

        <hr className={styles.rule} />

        <div className={styles.actions}>
          {/* `loading` disables AND shows the system loader, and THE LABEL DOES
              NOT CHANGE: `Button` keeps its accessible name while busy and
              carries `aria-busy`. Swapping it to "Saving…" renames the control
              mid-action, so a screen reader announces a different button from
              the one that was pressed. */}
          <Button
            type="submit"
            text={t('customers:edit.submit')}
            loading={busy}
            disabled={query.data === undefined}
          />
          <Link className={styles.cancel} to={`/customers/${id}`}>
            {t('common:cancel')}
          </Link>
          <span className={styles.optionalNote}>{t('customers:new.optionalNote')}</span>
        </div>
      </form>
    </div>
  );
}
