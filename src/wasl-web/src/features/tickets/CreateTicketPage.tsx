import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '../../components/Button/Button';
import { Input } from '../../components/Input/Input';
import { Select } from '../../components/Select/Select';
import { Textarea } from '../../components/Textarea/Textarea';
import { ApiError } from '../../lib/api';
import {
  COMMUNICATION_CHANNELS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  type CustomerListItem,
} from '../../lib/api-types.provisional';
import styles from './CreateTicket.module.css';
import {
  createTicketSchema,
  emptyCreateTicketForm,
  toCreateTicketRequest,
  type CreateTicketFormValues,
  type CreateTicketParsed,
} from './createTicket.schema';
import { CustomerPicker, SEARCH_MIN_CHARS } from './CustomerPicker';
import { createTicket, searchCustomers } from './tickets.api';

/* ============================================================================
 * CreateTicketPage — the ROUTE (ADR-011 §4)
 * ============================================================================
 * BOTH FETCHES LIVE HERE. The search query and the create mutation are the
 * route's; `CustomerPicker` receives results and handlers as props. A child that
 * fetches is the request-waterfall pattern the rule exists to prevent, and the
 * picker is exactly where it is tempting because the search *feels* local to it.
 *
 * No global store. The complete client state on this screen:
 *   form values      React Hook Form
 *   the selection    a form FIELD — `customerId` — plus the row for display
 *   the search term  useState here. NOT the URL: a half-typed search inside a
 *                    create form is not a shareable view, and pushing it would
 *                    put a history entry behind every keystroke. A deliberate
 *                    departure from ADR-011 §2, recorded in `009`'s frontend
 *                    spec.
 *   results          TanStack Query, keyed on the debounced term
 * ============================================================================ */

const SEARCH_DEBOUNCE_MS = 300;

/**
 * The `Location` header → a path this app can route to.
 *
 * FOUND AGAINST THE RUNNING SERVER, not against the contract. The contract
 * promises `Location: /api/tickets/{id}`; the API returns
 * `http://localhost:5272/api/tickets/{id}`. Both are legal per RFC 9110, and the
 * previous `location.replace(/^\/api/, '')` handled only the relative form — an
 * absolute URL passed straight through and React Router treated the whole thing
 * as a path. Recorded as a contract difference in `tests.md`; one of the two
 * documents is wrong and that is not settled here.
 *
 * `new URL(value, origin)` parses both forms with one call and no branch, so
 * whichever way the difference is resolved this keeps working. Only the
 * PATHNAME is used — a host in the header is the API's, never a route in this
 * app, and following it would navigate away from the SPA.
 *
 * Falls back to the id when the header is absent or unparseable, so a missing
 * header costs the user nothing.
 */
function toAppPath(location: string | null, ticketId: string): string {
  const fallback = `/tickets/${ticketId}`;
  if (location === null) return fallback;

  try {
    const { pathname } = new URL(location, window.location.origin);
    const stripped = pathname.replace(/^\/api/, '');
    return stripped === '' ? fallback : stripped;
  } catch {
    return fallback;
  }
}

export default function CreateTicketPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [term, setTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [selected, setSelected] = useState<CustomerListItem | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  /* THE DOUBLE-SUBMIT GUARD, and it is a ref rather than the mutation's own
   * `isPending`.
   *
   * Measured, not assumed: two synchronous clicks sent TWO `POST`s. Both the
   * `disabled` attribute and `isPending` are state — they are true only after
   * React re-renders, and the second click happens before that. A ref flips in
   * the same tick, so the second submit returns before it can reach the network.
   *
   * The endpoint is not idempotent and has no duplicate rule (`009` contract,
   * *Idempotency*): two identical tickets would both be real, and the support
   * team would find them rather than the developer. */
  const submitting = useRef(false);

  const form = useForm<CreateTicketFormValues, unknown, CreateTicketParsed>({
    defaultValues: emptyCreateTicketForm,
    resolver: zodResolver(createTicketSchema),
    /* On blur, not on change. Validating as someone types tells them they are
     * wrong before they have finished being right (`10-shared-patterns.md`). */
    mode: 'onBlur',
  });

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedTerm(term), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [term]);

  const ready = debouncedTerm.trim().length >= SEARCH_MIN_CHARS;

  const search = useQuery({
    queryKey: ['customers', 'search', debouncedTerm],
    queryFn: ({ signal }) => searchCustomers(debouncedTerm, signal),
    /* Below two characters no request is issued at all — not issued and
     * discarded. `enabled` is what makes AC-3 true rather than merely
     * unobservable. */
    enabled: ready,
  });

  const mutation = useMutation({
    mutationFn: (values: CreateTicketParsed) =>
      createTicket(toCreateTicketRequest(values)),
    onSuccess: ({ ticket, location }) => {
      /* Navigate by the `Location` header, falling back to the id only if the
       * header is absent. Re-deriving the server's route from `ticket.id` as the
       * primary path would be a client re-implementing routing it was handed. */
      navigate(toAppPath(location, ticket.id), {
        state: { ticketNumber: ticket.ticketNumber },
      });
    },
    onError: (error: unknown) => handleFailure(error),
  });

  function handleFailure(error: unknown) {
    if (!(error instanceof ApiError)) {
      setFormError(t('tickets:new.unknownError'));
      return;
    }

    /* 400 — attach each message to the field the SERVER named. The keys are
     * request field names and are part of the contract, so no mapping table
     * exists to drift. */
    if (error.status === 400 && error.problem.errors) {
      const fields = Object.keys(emptyCreateTicketForm) as Array<
        keyof CreateTicketFormValues
      >;
      let first: keyof CreateTicketFormValues | null = null;
      for (const field of fields) {
        const messages = error.problem.errors[field];
        if (messages && messages.length > 0) {
          /* Rendered as received. Server messages arrive already translated
           * (BR-8.6) — re-translating or mapping them is how a client ends up
           * showing a key. */
          form.setError(field, { type: 'server', message: messages[0] ?? '' });
          if (!first) first = field;
        }
      }
      if (first) form.setFocus(first);
      else setFormError(error.problem.title);
      return;
    }

    /* 404 — the customer disappeared between picking and submitting. Clear the
     * SELECTION and nothing else: losing someone's typing because another user
     * changed data is the worst response available. Identified by the KEY inside
     * `errors`, because `errors/not-found` is shared with every other
     * unresolvable reference in the system. */
    if (error.status === 404 && error.problem.errors?.['customerId']) {
      setSelected(null);
      setTerm('');
      form.setValue('customerId', '');
      setFormError(t('tickets:new.customerGone'));
      return;
    }

    /* 401 — the session expired. Not a form error.
     * TODO — 004-auth-and-roles: this goes to the sign-in screen. There is none,
     * so it goes home; the branch exists because the contract is frozen and
     * leaving it out means `004` has to find every call site. */
    if (error.status === 401) {
      navigate('/');
      return;
    }

    setFormError(error.problem.title);
  }

  const onSubmit = form.handleSubmit((values) => {
    if (submitting.current) return;
    submitting.current = true;
    setFormError(null);
    mutation.mutate(values, {
      onSettled: () => {
        submitting.current = false;
      },
    });
  });

  const hasCustomer = selected !== null;
  const busy = mutation.isPending;
  const errors = form.formState.errors;

  /* A message is either a server sentence, already translated, or one of our
   * keys. `t()` returns the key unchanged when it is not a key, so a server
   * sentence passes through untouched. */
  const message = (raw: string | undefined) => (raw === undefined ? undefined : t(raw));

  const options = (values: readonly string[], ns: string) =>
    values.map((value) => ({ value, label: t(`tickets:${ns}.${value}`) }));

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <Link className={styles.back} to="/tickets">
          {t('common:back')}
        </Link>
        <h2 className={styles.title}>{t('tickets:new.title')}</h2>
      </div>

      {formError === null ? null : (
        <div className={styles.notice} role="alert">
          <bdi>{formError}</bdi>
        </div>
      )}

      <form onSubmit={onSubmit} noValidate>
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>{t('tickets:new.customerSection')}</h3>
          <CustomerPicker
            term={term}
            onTermChange={setTerm}
            results={search.data?.items ?? []}
            isSearching={search.isFetching}
            hasSearched={ready && !search.isFetching && search.isFetched}
            selected={selected}
            onSelect={(customer) => {
              setSelected(customer);
              form.setValue('customerId', customer.id, { shouldValidate: true });
            }}
            onClear={() => {
              setSelected(null);
              form.setValue('customerId', '', { shouldValidate: true });
            }}
            error={message(errors.customerId?.message)}
          />
        </div>

        <div className={styles.card}>
          {/* Disabled with the reason, NOT hidden. A section that appears after a
              selection reads as a page that was broken until it wasn't. The
              fieldset puts the state in the accessibility tree, and the note
              puts the "why" there too. */}
          <fieldset className={styles.fieldset} disabled={!hasCustomer || busy}>
            {/* A REAL <legend>, and the reason lives inside it.
             *
             * The note was a <p> next to the heading. Measured with the
             * accessibility tree: a screen reader landing on Subject announced
             * "Subject, edit, disabled" and nothing else — the fieldset carried
             * the STATE but not the REASON, and the sentence explaining it was
             * a sibling nobody was directed to. `aria-describedby` on a
             * <fieldset> is not reliably announced when focus lands on a child;
             * a legend is, because it is the group's accessible name and every
             * control inside inherits the announcement.
             *
             * The <h3> stays inside it so the section is still reachable by
             * heading navigation — legend permits heading content. */}
            <legend className={styles.legend}>
              <h3 className={styles.cardTitle}>{t('tickets:new.ticketSection')}</h3>

              {hasCustomer ? null : (
                <p className={styles.disabledNote}>
                  {t('tickets:new.selectCustomerFirst')}
                </p>
              )}
            </legend>

            <div className={styles.stack}>
              <Controller
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <Input
                    /* `field.ref` is what `shouldFocusError` and `setFocus`
                       reach for. Registered but never attached, focus silently
                       stays where it was on a failed submit. */
                    ref={field.ref}
                    label={t('tickets:field.subject')}
                    required
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    maxLength={200}
                    counterFrom={180}
                    error={message(errors.subject?.message)}
                  />
                )}
              />

              <Controller
                control={form.control}
                name="description"
                render={({ field }) => (
                  <Textarea
                    ref={field.ref}
                    label={t('tickets:field.description')}
                    required
                    rows={5}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    maxLength={4000}
                    counterFrom={3800}
                    helperText={t('tickets:new.descriptionHelper')}
                    error={message(errors.description?.message)}
                  />
                )}
              />

              <div className={styles.selectRow}>
                <Controller
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <Select
                      ref={field.ref}
                      label={t('tickets:field.category')}
                      required
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      /* Built from the constants, never hand-typed. A literal
                         list here is how a value added on the server goes
                         silently missing from the dropdown. */
                      options={options(TICKET_CATEGORIES, 'category')}
                      placeholder={t('tickets:new.choose')}
                      error={message(errors.category?.message)}
                    />
                  )}
                />
                <Controller
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <Select
                      ref={field.ref}
                      label={t('tickets:field.priority')}
                      /* `priority` is the one optional field, so RHF hands back
                         `string | undefined`. The control's value is always a
                         string — `''` IS "untouched", which is exactly the state
                         the empty option represents. */
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      options={options(TICKET_PRIORITIES, 'priority')}
                      /* The VALUE is left empty on purpose — the server defaults
                         an absent `priority` to `Normal`, and pinning it here
                         would keep the old default the day the server's changes.
                         The LABEL says so, and it has to say more than the
                         plain name: the Arabic walk found "عادية" listed twice,
                         once as this empty option and once as the real `Normal`,
                         with nothing on screen to tell them apart — while the
                         two send different requests (`priority` omitted versus
                         `priority: "Normal"`). Marking it as the default rather
                         than dropping `Normal` from the list keeps the contract
                         enum whole; a UI that filters an enum is a UI editing a
                         contract. */
                      placeholder={t('tickets:new.priorityDefault', {
                        value: t('tickets:priority.Normal'),
                      })}
                      error={message(errors.priority?.message)}
                    />
                  )}
                />
                <Controller
                  control={form.control}
                  name="channel"
                  render={({ field }) => (
                    <Select
                      ref={field.ref}
                      label={t('tickets:field.channel')}
                      required
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      options={options(COMMUNICATION_CHANNELS, 'channel')}
                      placeholder={t('tickets:new.choose')}
                      error={message(errors.channel?.message)}
                    />
                  )}
                />
              </div>
            </div>
          </fieldset>
        </div>

        <div className={styles.actions}>
          <Button
            buttonType="secondary-outline"
            type="button"
            text={t('common:cancel')}
            onClick={() => navigate('/tickets')}
            disabled={busy}
          />
          {/* THE ONLY THING BETWEEN A DOUBLE-CLICK AND TWO REAL TICKETS.
              The endpoint is not idempotent and has no duplicate rule, so this
              is the client obligation the contract names (AC-15). `loading`
              implies `disabled` inside Button, and the fieldset above goes
              read-only with it. */}
          <Button
            type="submit"
            text={busy ? t('tickets:new.submitting') : t('tickets:new.submit')}
            loading={busy}
            disabled={!hasCustomer}
          />
        </div>
      </form>
    </div>
  );
}
