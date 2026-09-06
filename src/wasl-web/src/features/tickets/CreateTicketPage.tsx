import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '../../components/Button/Button';
import { Dropdown } from '../../components/Dropdown/Dropdown';
import { Input } from '../../components/Input/Input';
import { Modal } from '../../components/Modal/Modal';
import { SideSheet } from '../../components/SideSheet/SideSheet';
import { Textarea } from '../../components/Textarea/Textarea';
import { useToast } from '../../components/Toast/ToastHost';
import { IconAddCustomer, IconChevron, IconCircleX } from '../../icons/icons';
import { ApiError } from '../../lib/api';
import { TICKET_CATEGORIES, type CustomerListItem } from '../../lib/api-types.provisional';
import { formatNumber, type Lang } from '../../lib/formatters';
import { CreateCustomerForm } from '../customers/CreateCustomerPage';
import { getCustomer } from '../customers/customers.api';
import { ChannelPicker } from './ChannelPicker';
import styles from './CreateTicket.module.css';
import {
  createTicketSchema,
  emptyCreateTicketForm,
  toCreateTicketRequest,
  type CreateTicketFormValues,
  type CreateTicketParsed,
} from './createTicket.schema';
import { CustomerPicker, SEARCH_MIN_CHARS } from './CustomerPicker';
import {
  DuplicateWarning,
  OPEN_PAGE_SIZE,
  OPEN_STATUSES,
  PRIOR_PAGE_SIZE,
  PRIOR_STATUSES,
  PriorTickets,
} from './DuplicateWarning';
import { PriorityPicker } from './PriorityPicker';
import { createTicket, listTickets, searchCustomers, ticketKeys } from './tickets.api';

/* ============================================================================
 * CreateTicketPage — the ROUTE (ADR-011 §4)
 * ============================================================================
 * ALL THREE FETCHES LIVE HERE: the customer search, the open-ticket check, and
 * the create mutation. `CustomerPicker` and `DuplicateWarning` receive data and
 * handlers as props. A child that fetches is the request-waterfall pattern the
 * rule exists to prevent, and both of them are exactly where it is tempting —
 * the search *feels* local to the picker and the warning *feels* local to the
 * banner.
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
 *   open tickets     TanStack Query, keyed on the selected customer
 *
 * ---------------------------------------------------------------------------
 * WHAT `038` CHANGED
 * ---------------------------------------------------------------------------
 * 1. NOTHING IS DISABLED WAITING FOR A CUSTOMER. The whole form is live from
 *    first paint, because an agent on the phone hears the problem before they
 *    hear who is calling. The `fieldset[disabled]` and its `<legend>` are gone —
 *    and so is the accessibility problem they existed to solve, which was
 *    announcing WHY four fields were dead. There is no longer a why.
 * 2. Validation is `onSubmit`, then live per field. Nothing is red before the
 *    first attempt; after it, fixing a field clears that field.
 * 3. Two columns above 1100px, and the grid lives in the STYLESHEET. The
 *    supplied mock-up declared it inline and its own media query never won —
 *    measured, spec M-1, and the same defect `027` found in `Sidebar.tsx`.
 * 4. A fixed footer carrying the error summary and the two actions.
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

/**
 * A fresh `Idempotency-Key`.
 *
 * `crypto.randomUUID` where it exists — every browser this product supports, and
 * jsdom under Node 19+. The fallback is not decoration: `randomUUID` is only
 * exposed on a SECURE CONTEXT, so a developer opening the app over plain HTTP on
 * a LAN address gets `undefined` and a create would throw where it used to work.
 */
function mintKey(): string {
  const api = globalThis.crypto;
  if (api !== undefined && typeof api.randomUUID === 'function') return api.randomUUID();
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function CreateTicketPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('ar') ? 'ar' : ('en' as Lang);
  const navigate = useNavigate();
  const toast = useToast();

  const [term, setTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [selected, setSelected] = useState<CustomerListItem | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetDirty, setSheetDirty] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  /* THE DOUBLE-SUBMIT GUARD, and it is a ref rather than the mutation's own
   * `isPending`.
   *
   * Measured, not assumed: two synchronous clicks sent TWO `POST`s. Both the
   * `disabled` attribute and `isPending` are state — they are true only after
   * React re-renders, and the second click happens before that. A ref flips in
   * the same tick, so the second submit returns before it can reach the network.
   *
   * It is the FIRST of two guards now. It stops a double click inside one
   * session; `Idempotency-Key` below stops a retry whose first response was
   * lost, which this ref cannot see at all. */
  const submitting = useRef(false);

  /* THE IDEMPOTENCY KEY, AND ITS LIFETIME IS THE WHOLE DESIGN.
   *
   * `036` Q-5: the same key with a DIFFERENT body answers `409`, scoped per
   * user, retained 24 hours. Two obvious policies are both wrong:
   *
   *   a key per REQUEST   never collides, so the header is decorative
   *   one key per FORM    a `400`, an edit, a resubmit → `409` on a form the
   *                       user has just corrected, and no way out of it
   *
   * So: minted at mount, and re-minted on the first EDIT after a failed submit.
   * An edited resubmit is a new intent and gets a new key; a resubmit the user
   * did NOT edit — the lost-response case the header exists for — keeps the old
   * one and replays the original response instead of creating a second ticket.
   *
   * A ref, not state: nothing renders it, and re-rendering on a value the user
   * cannot see is a render for nobody. */
  const idempotencyKey = useRef(mintKey());
  const staleKey = useRef(false);

  const form = useForm<CreateTicketFormValues, unknown, CreateTicketParsed>({
    defaultValues: emptyCreateTicketForm,
    resolver: zodResolver(createTicketSchema),
    /* `onSubmit`, NOT `024`'s `onBlur`. The screen no longer disables anything,
     * so an agent may legitimately tab through empty fields on the way to the
     * one they want — and `onBlur` would paint four errors behind them for
     * fields they have not finished with. `reValidateMode` is what makes the
     * form live AFTER the first attempt, which is where per-field feedback stops
     * being an interruption and starts being an answer. */
    mode: 'onSubmit',
    reValidateMode: 'onChange',

    /* OFF, AND THIS IS LOAD-BEARING. React Hook Form focuses the first errored
     * field that has a registered ref, and it does so AFTER the invalid
     * callback below has run — so with it on, this screen focused the customer
     * search correctly and RHF immediately moved focus to SUBJECT.
     *
     * That is spec M-3 exactly, the mock-up bug this feature exists to fix,
     * arriving by a different route: the summary names «Customer» first and the
     * caret lands somewhere else. Measured — the AC-19 test failed with this
     * line absent, and passes with it.
     *
     * Registration order is also the wrong order for this form regardless:
     * `customerId` has no rendered control for RHF to reach at all. */
    shouldFocusError: false,
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

  /* THE DUPLICATE CHECK. One request per selected customer, cached by the key,
   * so re-selecting the same customer costs nothing (AC-12).
   *
   * `listTickets`, not a new fetcher: `034` added `?customerId=` and `015` added
   * repeated `?status=`, so the question is already expressible. A third named
   * query class would need a written reason (CLAUDE.md), and "the same query
   * with two filters" is not one. */
  const openParams = {
    page: 1,
    pageSize: OPEN_PAGE_SIZE,
    customerId: selected?.id ?? '',
    status: OPEN_STATUSES,
  };

  const openTickets = useQuery({
    queryKey: ticketKeys.list(openParams),
    queryFn: ({ signal }) => listTickets(openParams, signal),
    enabled: selected !== null,
    /* ADVISORY, so it does not retry and it does not report. A failed duplicate
     * check must cost the user nothing at all (AC-17) — the banner simply does
     * not appear, and creating a ticket stays possible. Retrying would make a
     * failing endpoint slow down every selection. */
    retry: false,
  });

  /* THE SECOND QUESTION, and it is a second request on purpose.
   *
   * `Closed` is terminal (BR-1.5), so the customer whose problem was closed
   * yesterday and who calls back today gets a NEW ticket — and the banner above
   * is scoped to the four OPEN statuses, so it says nothing about the very
   * ticket the agent needs. Ruled 2026-09-06: the fix is visibility, not a
   * reopen transition.
   *
   * NOT FOLDED INTO ONE REQUEST. Asking for all six statuses at once and
   * splitting the rows client-side returns five rows that could be five closed
   * ones, so the open count — the thing that actually warns — would come back
   * wrong. Two questions, two counts, each from its own `totalCount`. It is the
   * same reasoning `countTickets` records for the list's chip counts. */
  const priorParams = {
    page: 1,
    pageSize: PRIOR_PAGE_SIZE,
    customerId: selected?.id ?? '',
    status: PRIOR_STATUSES,
  };

  const priorTickets = useQuery({
    queryKey: ticketKeys.list(priorParams),
    queryFn: ({ signal }) => listTickets(priorParams, signal),
    enabled: selected !== null,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (values: CreateTicketParsed) =>
      createTicket(toCreateTicketRequest(values), idempotencyKey.current),
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
    /* THE KEY IS NOW STALE. Whatever the failure was, the next submit either
     * repeats this exact body — in which case the old key is what makes the
     * retry safe — or carries an edit, in which case it must not. `staleKey`
     * defers the decision to the first change, which is the only moment that
     * tells the two apart. */
    staleKey.current = true;

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
      if (first) focusField(first);
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

    /* 401 — the session expired. Not a form error. */
    if (error.status === 401) {
      navigate('/');
      return;
    }

    setFormError(error.problem.title);
  }

  /* ---- Focus, and why the customer field is a special case ------------------
   * `form.setFocus` reaches a field's registered `ref`. `customerId` HAS no
   * rendered control — it is a hidden form value written by the picker, and the
   * thing a person types into is the picker's search input, which is a different
   * element that also disappears once a customer is chosen.
   *
   * The mock-up has this bug: submitting empty names «العميل» first in the
   * summary and then moves focus to SUBJECT, because its focus lookup only sees
   * fields carrying `aria-invalid` (spec M-3). AC-19 is that criterion.
   * -------------------------------------------------------------------------- */
  const CUSTOMER_INPUT_ID = 'nt-customer-search';

  function focusField(field: keyof CreateTicketFormValues) {
    if (field === 'customerId') {
      document.getElementById(CUSTOMER_INPUT_ID)?.focus();
      return;
    }
    form.setFocus(field);
  }

  /* THE ORDER IS READING ORDER, and it is declared once so the summary and the
   * focus cannot disagree — which is precisely how they disagreed in the
   * mock-up. Both read this array. */
  const FIELD_ORDER = [
    { name: 'customerId', label: 'tickets:new.customerSection' },
    { name: 'subject', label: 'tickets:field.subject' },
    { name: 'description', label: 'tickets:field.description' },
    { name: 'channel', label: 'tickets:field.channel' },
    { name: 'category', label: 'tickets:field.category' },
  ] as const;

  const onSubmit = form.handleSubmit(
    (values) => {
      if (submitting.current) return;
      submitting.current = true;
      setFormError(null);
      mutation.mutate(values, {
        onSettled: () => {
          submitting.current = false;
        },
      });
    },
    (errors) => {
      /* THE INVALID BRANCH. React Hook Form's `shouldFocusError` would focus the
       * first field in REGISTRATION order and cannot reach `customerId` at all,
       * so focus is taken over here and driven off `FIELD_ORDER`. */
      staleKey.current = true;
      const firstInvalid = FIELD_ORDER.find((field) => errors[field.name] !== undefined);
      if (firstInvalid) focusField(firstInvalid.name);
    },
  );

  const errors = form.formState.errors;
  const busy = mutation.isPending;

  /** The missing-field summary. Derived from `errors` on every render rather
   *  than stored — a second copy of what is wrong is a second thing to keep in
   *  step with the form. */
  const missing = FIELD_ORDER.filter((field) => errors[field.name] !== undefined);

  /* A message is either a server sentence, already translated, or one of our
   * keys. `t()` returns the key unchanged when it is not a key, so a server
   * sentence passes through untouched. */
  const message = (raw: string | undefined) => (raw === undefined ? undefined : t(raw));

  /** Re-mint on the first edit after a failure. See `idempotencyKey` above. */
  const touched = () => {
    if (!staleKey.current) return;
    idempotencyKey.current = mintKey();
    staleKey.current = false;
  };

  const options = (values: readonly string[], ns: string) =>
    values.map((value) => ({ value, label: t(`tickets:${ns}.${value}`) }));

  function closeSheet() {
    setSheetOpen(false);
    setSheetDirty(false);
  }

  /** Escape, the scrim, the ×, and «إلغاء» all route here — one handler, so
   *  the four cannot disagree about what closing means. It ASKS only when
   *  there is something to lose; a confirmation on an untouched form is a
   *  dialog that teaches people to dismiss dialogs. */
  function requestCloseSheet() {
    if (sheetDirty) {
      setDiscarding(true);
      return;
    }
    closeSheet();
  }

  return (
    <div className={styles.page}>
      {/* A BREADCRUMB, and the chevron sits BETWEEN the two — not inside the
          link as a back arrow.
          `IconChevron` points FORWARD (right) and mirrors under RTL, so as a
          back arrow it would point the wrong way in both languages: right is
          forward in English, and the mirror makes it left in Arabic, which is
          forward there. As a separator the same glyph is correct in both —
          «Tickets › New ticket» and «تذكرة جديدة ‹ التذاكر» — because it points
          from parent to child in reading order, which is what the mirror is for.
          It also replaces the mock-up's extra vertical rule: one element instead
          of two, which is the whole shape of the no-dead-space ruling. */}
      <nav className={styles.head} aria-label={t('tickets:list.title')}>
        <Link className={styles.back} to="/tickets">
          {t('tickets:list.title')}
        </Link>
        <IconChevron size={14} aria-hidden="true" className={styles.crumbSep} />
        <h2 className={styles.title}>{t('tickets:new.title')}</h2>
      </nav>

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <div className={styles.scroll}>
          {formError === null ? null : (
            <div className={styles.notice} role="alert">
              <bdi>{formError}</bdi>
            </div>
          )}

          {/* TWO TRACKS ABOVE 1100px, AND THE DECLARATION IS IN THE STYLESHEET.
              Nothing inline sets a grid property on this element — that is not a
              preference, it is spec M-1: the supplied mock-up put
              `grid-template-columns` in its `style` attribute, which outranks
              any stylesheet rule, so its own `@media (min-width:1100px)` never
              applied and the design shipped as one column. `newTicketLayout`
              scans this file for it, because jsdom paints nothing and no
              rendered test can see a cascade being lost. */}
          <div className={styles.grid}>
            <div className={styles.main}>
              <section className={styles.card}>
                <CustomerPicker
                  inputId={CUSTOMER_INPUT_ID}
                  term={term}
                  onTermChange={setTerm}
                  results={search.data?.items ?? []}
                  isSearching={search.isFetching}
                  hasSearched={ready && !search.isFetching && search.isFetched}
                  selected={selected}
                  onSelect={(customer) => {
                    setSelected(customer);
                    form.setValue('customerId', customer.id, { shouldValidate: true });
                    touched();
                  }}
                  onClear={() => {
                    setSelected(null);
                    form.setValue('customerId', '', { shouldValidate: true });
                    touched();
                  }}
                  onNewCustomer={() => setSheetOpen(true)}
                  error={message(errors.customerId?.message)}
                />

                {/* The banner belongs to the CUSTOMER card, under the selection
                    it is about. In the rail it would be a warning about
                    something on the other side of the screen. */}
                {selected !== null && openTickets.data !== undefined ? (
                  <DuplicateWarning
                    count={openTickets.data.totalCount}
                    tickets={openTickets.data.items}
                    customerId={selected.id}
                    lang={lang}
                  />
                ) : null}

                {/* UNDER the warning, and independent of it. A customer can have
                    both, either, or neither — and the common case this exists
                    for is *no* open tickets and one closed yesterday, where the
                    amber banner is correctly silent. */}
                {selected !== null && priorTickets.data !== undefined ? (
                  <PriorTickets
                    count={priorTickets.data.totalCount}
                    tickets={priorTickets.data.items}
                    customerId={selected.id}
                    lang={lang}
                  />
                ) : null}
              </section>

              <section className={styles.card}>
                <Controller
                  control={form.control}
                  name="subject"
                  render={({ field }) => (
                    <Input
                      /* `field.ref` is what `setFocus` reaches for. Registered
                         but never attached, focus silently stays where it was on
                         a failed submit. */
                      ref={field.ref}
                      label={t('tickets:field.subject')}
                      required
                      placeholder={t('tickets:new.subjectPlaceholder')}
                      value={field.value}
                      onChange={(value) => {
                        field.onChange(value);
                        touched();
                      }}
                      onBlur={field.onBlur}
                      /* 200, THE CONTRACT'S NUMBER (R-2). The mock-up asks for
                         120; a client that caps below the server refuses text
                         the server accepts, which is a client editing a frozen
                         contract. */
                      maxLength={200}
                      helperText={t('tickets:new.subjectHelper')}
                      error={message(errors.subject?.message)}
                    />
                  )}
                />
                {/* THE COUNTER IS ALWAYS ON, not `counterFrom`-gated. `023`'s
                    Input reveals its counter near the ceiling, which is right
                    for a field whose limit is a safety net; the design asks for
                    `0/200` from the first paint because the subject's length is
                    a WRITING instruction — one line — not a warning. */}
                <div className={styles.counter} aria-hidden="true">
                  <bdi>
                    {formatNumber(form.watch('subject').length, lang)}
                    {'/'}
                    {formatNumber(200, lang)}
                  </bdi>
                </div>

                <div className={styles.rule} aria-hidden="true" />

                <Controller
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <Textarea
                      ref={field.ref}
                      label={t('tickets:field.description')}
                      required
                      rows={6}
                      placeholder={t('tickets:new.descriptionPlaceholder')}
                      value={field.value}
                      onChange={(value) => {
                        field.onChange(value);
                        touched();
                      }}
                      onBlur={field.onBlur}
                      maxLength={4000}
                      counterFrom={3800}
                      error={message(errors.description?.message)}
                    />
                  )}
                />
              </section>
            </div>

            <aside className={styles.rail}>
              <section className={styles.card}>
                <h3 className={styles.cardTitle}>{t('tickets:new.routingSection')}</h3>

                <Controller
                  control={form.control}
                  name="channel"
                  render={({ field }) => (
                    <ChannelPicker
                      value={field.value}
                      onChange={(value) => {
                        field.onChange(value);
                        touched();
                      }}
                      onBlur={field.onBlur}
                      error={message(errors.channel?.message)}
                    />
                  )}
                />

                <Controller
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <Dropdown
                      ref={field.ref}
                      label={t('tickets:field.category')}
                      required
                      value={field.value || null}
                      onChange={(value) => {
                        field.onChange(value ?? '');
                        touched();
                      }}
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
                    <PriorityPicker
                      value={field.value ?? ''}
                      onChange={(value) => {
                        field.onChange(value);
                        touched();
                      }}
                      onBlur={field.onBlur}
                      error={message(errors.priority?.message)}
                    />
                  )}
                />

                {/* ASSIGNMENT — DRAWN, DISABLED, WITH THE REASON (R-1).
                    `POST /api/tickets` carries no `assigneeId` and
                    `05-create-ticket.md` puts assigning-at-creation out of scope
                    on purpose (US-007: creation and routing are separate
                    decisions).

                    `027`'s rule, and its refinement: an unbuilt ACTION may be
                    drawn read-only, because a control promises nothing until it
                    is pressed — while an unbuilt DATA region drawn from nothing
                    is a fact the product does not have and looks exactly like a
                    working one.

                    AND IT HAS NO FETCHER. `getSupportUsers` exists and is
                    deliberately not called: a `disabled` prop is one edit away
                    from deletion, a function that is not imported is not.
                    `newTicketLayout` asserts the absence. */}
                <Dropdown
                  label={t('tickets:new.assignment')}
                  value={null}
                  onChange={() => undefined}
                  options={[]}
                  placeholder={t('tickets:new.assignmentNone')}
                  helperText={t('tickets:new.assignmentUnavailable')}
                  disabled
                />
              </section>
            </aside>
          </div>
        </div>

        {/* THE FOOTER IS FIXED, and it is a footer rather than a row at the end
            of the form. `AppShell` already fixes its own height and moves the
            scroll inside (`.content`), so this sits outside `.scroll` and the
            form scrolls under it — the two actions never scroll out of reach on
            a short viewport. */}
        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            {missing.length === 0 ? null : (
              <div className={styles.summary} role="alert">
                <IconCircleX size={15} aria-hidden="true" />
                <span>
                  {t('tickets:new.missing', {
                    count: missing.length,
                    formatted: formatNumber(missing.length, lang),
                    fields: missing.map((field) => t(field.label)).join(t('common:listSeparator')),
                  })}
                </span>
              </div>
            )}

            <div className={styles.footerActions}>
              <Button
                buttonType="secondary-outline"
                type="button"
                text={t('common:cancel')}
                onClick={() => navigate('/tickets')}
                disabled={busy}
              />
              {/* NOT `disabled` ON AN INCOMPLETE FORM. A disabled submit is how
                  a screen refuses without saying why — the person is left
                  hunting for what is missing. It stays live, and pressing it
                  produces the summary and the focus jump, which is the answer
                  they were looking for. */}
              <Button
                type="submit"
                text={busy ? t('tickets:new.submitting') : t('tickets:new.submit')}
                loading={busy}
              />
            </div>
          </div>
        </footer>
      </form>

      {/* «عميل جديد» — R-5, and `035`'s sheet, not a navigation. Leaving the
          route to create a customer would take everything typed with it. */}
      <SideSheet
        scrim
        open={sheetOpen}
        onClose={requestCloseSheet}
        label={t('customers:new.title')}
        badge={
          <span className={styles.sheetBadge}>
            <IconAddCustomer size={20} aria-hidden="true" />
          </span>
        }
        title={t('customers:new.title')}
        subtitle={t('tickets:new.newCustomerHint')}
      >
        <CreateCustomerForm
          chrome={false}
          onCancel={requestCloseSheet}
          onDirtyChange={setSheetDirty}
          onCreated={(id) => {
            closeSheet();
            /* READ BACK, never seeded from the write response. `onCreated` hands
             * over the id and the name; the card shows email and company too,
             * and `026` §5 / `032` AC-1 already rule that a screen does not
             * render what a create returned in place of what a read says.
             *
             * The selection is set from the READ, so a failure leaves the form
             * exactly as it was rather than half-selecting a customer. */
            void getCustomer(id).then(
              (customer) => {
                setSelected({
                  id: customer.id,
                  fullName: customer.fullName,
                  email: customer.email,
                  phone: customer.phone,
                  companyName: customer.companyName,
                  createdAtUtc: customer.createdAtUtc,
                });
                form.setValue('customerId', customer.id, { shouldValidate: true });
                touched();
                toast.show({ tone: 'success', title: t('customers:new.createdToast') });
              },
              () => {
                setFormError(t('tickets:new.unknownError'));
              },
            );
          }}
        />
      </SideSheet>

      {/* «إغلاق نموذج فيه إدخال غير محفوظ» — `feedback-layer.md` §1.3, and the
          question is asked BEFORE the close completes.
          The KEYS are `customers:new.*`, deliberately: it is the same form
          asking the same question, and a second set of words for one decision
          is how the two come to differ in one language only. */}
      <Modal
        open={discarding}
        /* Closing the QUESTION is not answering it. Escape leaves the sheet open
           with everything still typed — the safe answer, and the one «متابعة
           التحرير» gives. */
        onClose={() => setDiscarding(false)}
        title={t('customers:new.discardTitle')}
        /* Opening focus goes to «متابعة التحرير», not «تجاهل». A dialog about
           throwing away a half-typed form, with Discard under the Return key, is
           one keystroke from doing the thing it exists to prevent. */
        destructive
        footer={
          <>
            <Button
              buttonType="secondary-outline"
              withText
              text={t('customers:new.keepEditing')}
              onClick={() => setDiscarding(false)}
            />
            <Button
              buttonType="danger"
              withText
              text={t('customers:new.discardConfirm')}
              onClick={() => {
                setDiscarding(false);
                closeSheet();
              }}
            />
          </>
        }
      >
        {t('customers:new.discardBody')}
      </Modal>
    </div>
  );
}
