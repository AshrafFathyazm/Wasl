import { useState } from 'react';

import { Button } from '../components/Button/Button';
import { Input } from '../components/Input/Input';
import { Textarea } from '../components/Textarea/Textarea';
import { Toast } from '../components/Toast/Toast';
import { cx } from '../lib/cx';
import type { Lang } from '../lib/formatters';
import styles from './CreateCustomerPreview.module.css';

/**
 * FE-007-00 — `/customers/new`, previewed BEFORE any wiring (ADR-009).
 *
 * Source: `docs/sdd/design/screens/08-create-customer.md`. Arabic first.
 *
 * NOTHING HERE CALLS THE SERVER. `POST /api/customers` is delivered (`007`,
 * 434 tests) and deliberately not reached — a preview that fetches cannot render
 * its own duplicate-conflict state on demand, which is the state this screen
 * exists to get right.
 *
 * Copy below is REAL, bound for `customers:*` in FE-007-08. eslint scopes the
 * no-JSX-literal rule to src/components, src/shell and src/features; this is
 * none of them, and routes.tsx strips /_preview from the production bundle.
 */

type State =
  'empty' | 'valid' | 'submitting' | 'duplicateEmail' | 'duplicateBoth' | 'returning';

/* NO "Creating…" STRING. It was here and is deliberately gone: `Button`
 * keeps its accessible name while `loading`, so swapping the label renames
 * the control mid-action and a screen reader announces a different button
 * from the one that was pressed. The loader carries the state; the name does
 * not move. */
const COPY = {
  ar: {
    back: 'رجوع',
    title: 'عميل جديد',
    name: 'الاسم الكامل',
    contactRequired: 'مطلوب وسيلة تواصل واحدة على الأقل',
    email: 'البريد الإلكتروني',
    phone: 'رقم الهاتف',
    company: 'الشركة',
    notes: 'ملاحظات',
    cancel: 'إلغاء',
    submit: 'إنشاء',
    dupEmail: 'يوجد عميل بهذا البريد الإلكتروني.',
    dupPhone: 'يوجد عميل بهذا الرقم.',
    findExisting: 'ابحث عن العميل الحالي',
    created: 'أُنشئ العميل',
    dismiss: 'إغلاق',
  },
  en: {
    back: 'Back',
    title: 'New customer',
    name: 'Full name',
    contactRequired: 'At least one contact method is required',
    email: 'Email',
    phone: 'Phone',
    company: 'Company',
    notes: 'Notes',
    cancel: 'Cancel',
    submit: 'Create',
    dupEmail: 'A customer with this email already exists.',
    dupPhone: 'A customer with this phone number already exists.',
    findExisting: 'Find the existing customer',
    created: 'Customer created',
    dismiss: 'Dismiss',
  },
} as const;

const FILLED = {
  ar: {
    name: 'نورة السالم',
    email: 'noura@example.com',
    phone: '+966501234567',
    company: 'شركة الرياض القابضة',
  },
  en: {
    name: 'Noura Al-Salem',
    email: 'noura@example.com',
    phone: '+966501234567',
    company: 'Riyadh Holding Co.',
  },
} as const;

function Screen({ lang, state }: { lang: Lang; state: State }) {
  const c = COPY[lang];
  const f = FILLED[lang];
  const filled = state !== 'empty';
  const busy = state === 'submitting';
  const dupEmail = state === 'duplicateEmail' || state === 'duplicateBoth';

  const [name, setName] = useState(filled ? f.name : '');
  const [email, setEmail] = useState(filled ? f.email : '');
  const [phone, setPhone] = useState(state === 'duplicateBoth' ? f.phone : '');
  const [company, setCompany] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <div className={styles.frame} dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang}>
      <div className={styles.crumb}>
        <span className={styles.back}>‹ {c.back}</span>
        <span className={styles.crumbTitle}>{c.title}</span>
      </div>

      {state === 'returning' ? (
        <div className={styles.toastSlot}>
          <Toast dismissLabel={c.dismiss} onDismiss={() => {}}>
            {c.created} — <strong>{f.name}</strong>
          </Toast>
        </div>
      ) : null}

      <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
        <Input
          label={c.name}
          value={name}
          onChange={setName}
          required
          maxLength={200}
          disabled={busy}
        />

        {/* ABOVE the two fields it governs. A cross-field rule explained under the
            second field is explained too late — and it is a HINT, not an error:
            an empty form has not failed anything yet. */}
        <p className={styles.hint}>{c.contactRequired}</p>

        {/* NO WRAPPER. `Input` gives these `dir="auto"`, and `dir="auto"` with no
            strong character resolves to LTR per the HTML spec — not to the parent
            direction. Measured, then controlled: see the note in the module. */}
        <Input
          label={c.email}
          value={email}
          onChange={setEmail}
          type="email"
          inputMode="email"
          disabled={busy}
          {...(dupEmail ? { error: c.dupEmail } : {})}
        />

        <Input
          label={c.phone}
          value={phone}
          onChange={setPhone}
          inputMode="tel"
          disabled={busy}
        />

        {dupEmail ? (
          <p className={styles.findExisting}>
            <a href="#">{c.findExisting}</a>
          </p>
        ) : null}

        <Input
          label={c.company}
          value={company}
          onChange={setCompany}
          maxLength={200}
          disabled={busy}
        />

        <Textarea
          label={c.notes}
          value={notes}
          onChange={setNotes}
          rows={4}
          maxLength={2000}
          disabled={busy}
        />

        <div className={styles.actions}>
          <Button buttonType="secondary-outline" text={c.cancel} disabled={busy} />

          {/* THE SYSTEM LOADER, AND IT IS ALREADY A PROP.

              `loading` swaps in "Converge" — the three dots travelling into a node
              from design/brand.md §2, which replaces the spinner product-wide. It
              is the most-seen brand asset there is, because a loader appears far
              more often than a logo does.

              The TEXT DOES NOT CHANGE. `Button` keeps its accessible name while
              busy and carries `aria-busy` instead — swapping the label to
              "Creating…" renames the control mid-action, so a screen reader
              announces a different button from the one that was pressed.

              `loading` also disables: double submit is impossible without a
              second guard (AC-17). */}
          <Button
            buttonType="primary"
            text={c.submit}
            loading={busy}
            disabled={state === 'empty'}
          />
        </div>
      </form>
    </div>
  );
}

const STATES: Array<{ state: State; note: string }> = [
  {
    state: 'empty',
    note: 'Empty — Create disabled, the contact rule is a HINT not an error',
  },
  { state: 'valid', note: 'Valid — Create enabled' },
  {
    state: 'submitting',
    note: 'Submitting — fields read-only, double submit impossible',
  },
  { state: 'duplicateEmail', note: '409 on email — field error plus find-existing' },
  {
    state: 'duplicateBoth',
    note: 'Both duplicate — names EMAIL FIRST and stops. One conflict is enough to act on',
  },
  { state: 'returning', note: 'Returned from a ticket form — toast confirms' },
];

export default function CreateCustomerPreview() {
  return (
    <main className={styles.page}>
      <h1 className={styles.pageTitle}>/customers/new — FE-007-00</h1>
      <p className={styles.pageNote}>
        Preview only. Nothing calls <code>POST /api/customers</code>. Six states, both
        directions. The client deliberately does <strong>not</strong> pre-check
        duplicates: check-then-create is a race two requests can both pass, so the unique
        index is the guarantee and the <code>409</code> is how the client learns.
      </p>
      <p className={cx(styles.pageNote, styles.finding)}>
        <strong>A finding I withdrew.</strong> I reported that <code>Input</code> could
        not keep email and phone LTR in the Arabic form — that{' '}
        <code>dir=&quot;auto&quot;</code>
        on an empty field falls back to the paragraph direction. It does not:{' '}
        <code>dir=&quot;auto&quot;</code> with no strong character resolves to LTR per the
        HTML spec. Measured in the Arabic frame, then controlled by removing the wrapper I
        had added — email and phone stayed LTR without it. The primitive already meets the
        design. Left here because the wrong version was on this page first.
      </p>

      {STATES.map(({ state, note }) => (
        <section key={state} className={styles.block}>
          <h2 className={styles.blockTitle}>
            {state} — {note}
          </h2>
          <div className={styles.pair}>
            <Screen lang="ar" state={state} />
            <Screen lang="en" state={state} />
          </div>
        </section>
      ))}
    </main>
  );
}
