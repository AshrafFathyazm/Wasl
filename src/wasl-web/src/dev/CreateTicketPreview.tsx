import { useEffect, useState, type ReactNode } from 'react';

import { Button } from '../components/Button/Button';
import { Input } from '../components/Input/Input';
import { Loader } from '../components/Loader/Loader';
import { IconAdd, IconCustomer, IconSearch } from '../icons/icons';
import { cx } from '../lib/cx';
import styles from './CreateTicketPreview.module.css';
import {
  COMMUNICATION_CHANNELS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  type CommunicationChannel,
  type TicketCategory,
  type TicketPriority,
} from '../lib/api-types.provisional';

/*
 * FE-024-00 — the create-ticket screen, PREVIEWED BEFORE ANY WIRING.
 *
 * No fetch, no form library, no mutation, no route state. Every "state" below is
 * a static rendering, which is the point: it costs minutes and answers the
 * questions that cost hours once a screen has tests, keys, and query wiring
 * (ADR-009, design/preview-first-workflow.md).
 *
 * IT IS BUILT IN ARABIC FIRST, and that is the whole reason it is useful. An
 * English preview of this screen would fit, pass, and answer the wrong question:
 * `009/frontend-spec.md` predicts the three selects do not fit on one row at
 * 720px with Arabic labels, and English labels are the shorter ones.
 *
 * THE COPY BELOW IS REAL c. These strings become the `ar` catalogue values in
 * FE-024-12 — a preview written with placeholder text measures placeholder text.
 * Literals are allowed here because eslint scopes the no-JSX-literal rule to
 * src/components, src/shell, and src/features; this is none of them, and it never
 * ships.
 *
 * `Select` and `Textarea` do not exist yet — they are FE-024-02 and FE-024-03,
 * and they depend on this task. So the preview uses NATIVE `<select>` and
 * `<textarea>`, already token-styled by base.css. That is not a shortcut: it is
 * ADR-009's degradation floor being used for what it was built for, and the
 * geometry it produces is the geometry the real controls will have.
 */

/* ---- Real copy, destined for the ar catalogue ----------------------------- */

const COPY_AR = {
  title: 'تذكرة جديدة',
  back: 'رجوع',
  customerSection: 'العميل',
  ticketSection: 'التذكرة',
  findCustomer: 'ابحث عن عميل…',
  newCustomer: 'عميل جديد',
  change: 'تغيير',
  subject: 'الموضوع',
  description: 'الوصف',
  descriptionHelper: 'اشرح المشكلة بالتفصيل حتى يستطيع الفريق متابعتها',
  category: 'التصنيف',
  priority: 'الأولوية',
  channel: 'القناة',
  cancel: 'إلغاء',
  submit: 'إنشاء التذكرة',
  submitting: 'جارٍ الإنشاء…',
  selectCustomerFirst: 'اختر عميلاً للمتابعة',
  noMatches: 'لا يوجد عملاء مطابقون',
  newCustomerUnavailable: '(إنشاء عميل جديد لم يُبنَ بعد)',
  customerGone: 'هذا العميل لم يعد متاحاً. اختر عميلاً آخر — بقية ما كتبته محفوظ.',
  created: 'تم إنشاء التذكرة',
  subjectRequired: 'الموضوع مطلوب',
  descriptionTooLong: 'يجب ألا يزيد الوصف عن ٤٠٠٠ حرف',
} as const;

/* The English half, so the toggle does not lie. A preview that says "en" and
 * renders Arabic in LTR answers neither question — and the workflow's checklist
 * asks whether the longest realistic value fits in BOTH languages. */
/* `Record<keyof …, string>` and not `typeof COPY_AR`: the Arabic table is
 * `as const`, so its type is the literal strings themselves. This form also
 * makes a key missing from English a COMPILE error — the same guarantee
 * `lint:i18n` gives the real catalogues, for free, inside the preview. */
const COPY_EN: Record<keyof typeof COPY_AR, string> = {
  title: 'New ticket',
  back: 'Back',
  customerSection: 'Customer',
  ticketSection: 'Ticket',
  findCustomer: 'Search a customer…',
  newCustomer: 'New customer',
  change: 'Change',
  subject: 'Subject',
  description: 'Description',
  descriptionHelper: 'Describe the problem in enough detail for the team to follow it',
  category: 'Category',
  priority: 'Priority',
  channel: 'Channel',
  cancel: 'Cancel',
  submit: 'Create ticket',
  submitting: 'Creating…',
  selectCustomerFirst: 'Select a customer to continue',
  noMatches: 'No matching customers',
  newCustomerUnavailable: '(creating a customer is not built yet)',
  customerGone:
    'This customer is no longer available. Choose another — everything else you typed is kept.',
  created: 'Created ticket',
  subjectRequired: 'Subject is required',
  descriptionTooLong: 'Description must be 4000 characters or fewer',
};

/* THE WIRE VALUES COME FROM THE CONTRACT, not from this file.
 *
 * These were three hand-written lists until `TEST-024-03` grepped for exactly
 * that. The preview is a design surface, so the drift is quiet: the contract
 * gains a channel, the preview keeps showing four, and the screen it is
 * previewing shows five. Same argument that put the dev-only selector stripping
 * in `vite.config.ts` — a preview that restates a value is a preview that can
 * lie about it.
 *
 * `Record<T, …>` rather than an array: a value added to the contract becomes a
 * MISSING KEY and a value removed becomes an EXTRA one, and both are compile
 * errors here rather than a rendering difference nobody is looking for. The
 * labels stay local — the preview shows both languages side by side, which the
 * runtime catalogues cannot do. */
const CATEGORY_LABELS: Record<TicketCategory, readonly [string, string]> = {
  Billing: ['الفوترة', 'Billing'],
  Technical: ['فني', 'Technical'],
  Account: ['الحساب', 'Account'],
  General: ['عام', 'General'],
};

const PRIORITY_LABELS: Record<TicketPriority, readonly [string, string]> = {
  Low: ['منخفضة', 'Low'],
  Normal: ['عادية', 'Normal'],
  High: ['مرتفعة', 'High'],
  Critical: ['حرجة', 'Critical'],
};

/* The longest options in the set, which is why they are the ones that decide
 * whether three selects fit on one row. */
const CHANNEL_LABELS: Record<CommunicationChannel, readonly [string, string]> = {
  Email: ['بريد إلكتروني', 'Email'],
  WhatsApp: ['واتساب', 'WhatsApp'],
  LiveChat: ['محادثة مباشرة', 'Live chat'],
  Sms: ['رسالة نصية', 'SMS'],
  WebForm: ['نموذج ويب', 'Web form'],
};

/** Ordered by the contract's own list, so the preview's order is its order. */
const rows = <T extends string>(
  values: readonly T[],
  labels: Record<T, readonly [string, string]>,
) => values.map((value) => [value, labels[value][0], labels[value][1]] as const);

const CATEGORY = rows(TICKET_CATEGORIES, CATEGORY_LABELS);
const PRIORITY = rows(TICKET_PRIORITIES, PRIORITY_LABELS);
const CHANNEL = rows(COMMUNICATION_CHANNELS, CHANNEL_LABELS);

const CUSTOMERS = [
  ['شركة الرياض القابضة', 'ali@example.com · +966501234567'],
  ['مؤسسة الخليج للتقنية', 'noura@example.com · +966555512345'],
  ['عبدالله بن محمد العتيبي', 'abdullah@example.com'],
] as const;

const SAMPLE_SUBJECT = {
  ar: 'لا يمكنني تسجيل الدخول إلى حسابي منذ صباح اليوم',
  en: 'I cannot sign in to my account since this morning',
} as const;
const SAMPLE_DESCRIPTION = {
  ar: 'حاولت إعادة تعيين كلمة المرور ثلاث مرات ولم تصلني رسالة التأكيد على البريد الإلكتروني المسجَّل. جربت أيضاً من متصفح آخر ومن الهاتف بنفس النتيجة.',
  en: 'I tried resetting the password three times and the confirmation email never arrived at the registered address. I also tried another browser and my phone, with the same result.',
} as const;

type Lang = 'ar' | 'en';

/* Threaded as a prop rather than read from a module-level variable: the whole
 * page renders both languages one after the other in a single pass when the
 * reviewer wants to compare, and a global would make that impossible. */
const copyFor = (lang: Lang) => (lang === 'ar' ? COPY_AR : COPY_EN);
const labelFor = (row: readonly [string, string, string], lang: Lang) =>
  lang === 'ar' ? row[1] : row[2];

/* -------------------------------------------------------------------------- */

function Field({
  label,
  required,
  children,
  message,
  invalid,
}: {
  label: string;
  /* `| undefined` explicitly: exactOptionalPropertyTypes is on, so an optional
   * property that does not list undefined cannot RECEIVE one — and a conditional
   * like `showErrors ? msg : undefined` passes exactly that. */
  required?: boolean | undefined;
  children: ReactNode;
  message?: string | undefined;
  invalid?: boolean | undefined;
}) {
  return (
    <div className={styles.field}>
      <span className={cx(styles.label, required && styles.required)}>{label}</span>
      {children}
      {message ? (
        <span className={invalid ? styles.errorText : styles.helper}>
          <bdi>{message}</bdi>
        </span>
      ) : null}
    </div>
  );
}

function NativeSelect({
  options,
  invalid,
  defaultValue,
  lang,
}: {
  options: readonly (readonly [string, string, string])[];
  invalid?: boolean | undefined;
  defaultValue?: string | undefined;
  lang: Lang;
}) {
  return (
    <select
      className={cx(styles.control, invalid && styles.invalid)}
      defaultValue={defaultValue ?? ''}
    >
      <option value="" disabled>
        —
      </option>
      {options.map((row) => (
        <option key={row[0]} value={row[0]}>
          {labelFor(row, lang)}
        </option>
      ))}
    </select>
  );
}

function TicketFields({
  showErrors = false,
  lang,
}: {
  showErrors?: boolean | undefined;
  lang: Lang;
}) {
  const c = copyFor(lang);
  return (
    <>
      <Field
        label={c.subject}
        required
        invalid={showErrors}
        message={showErrors ? c.subjectRequired : undefined}
      >
        <input
          className={cx(styles.control, showErrors && styles.invalid)}
          dir="auto"
          defaultValue={showErrors ? '' : SAMPLE_SUBJECT[lang]}
          maxLength={200}
        />
        <span className={styles.counterRow}>
          <span />
          <span className={styles.counter} dir="ltr">
            186 / 200
          </span>
        </span>
      </Field>

      <Field label={c.description} required message={c.descriptionHelper}>
        <textarea
          className={cx(styles.control, styles.textarea)}
          dir="auto"
          defaultValue={SAMPLE_DESCRIPTION[lang]}
          maxLength={4000}
        />
      </Field>

      {/* THE QUESTION. Three selects, one row, 720px, Arabic. */}
      <div className={styles.selectRow} data-measure="select-row">
        <Field label={c.category} required>
          <NativeSelect options={CATEGORY} defaultValue="Technical" lang={lang} />
        </Field>
        <Field label={c.priority}>
          <NativeSelect options={PRIORITY} defaultValue="Normal" lang={lang} />
        </Field>
        <Field label={c.channel} required>
          <NativeSelect options={CHANNEL} defaultValue="LiveChat" lang={lang} />
        </Field>
      </div>
    </>
  );
}

function SelectedCustomer({ lang }: { lang: Lang }) {
  const c = copyFor(lang);
  return (
    <div className={styles.selected}>
      <IconCustomer size={18} />
      <span className={styles.selectedBody}>
        <span className={styles.resultName} dir="auto">
          <bdi>{CUSTOMERS[0][0]}</bdi>
        </span>
        <span className={styles.resultMeta} dir="auto">
          <bdi>{CUSTOMERS[0][1]}</bdi>
        </span>
      </span>
      <Button buttonType="secondary-outline" text={c.change} />
    </div>
  );
}

function Screen({
  state,
  lang,
}: {
  lang: Lang;
  state:
    | 'idle'
    | 'searching'
    | 'noMatches'
    | 'selected'
    | 'errors'
    | 'submitting'
    | 'customerGone'
    | 'success';
}) {
  const c = copyFor(lang);
  const hasCustomer =
    state === 'selected' || state === 'errors' || state === 'submitting';

  return (
    <div>
      <div className={styles.pageHead}>
        <a className={styles.backLink} href="#back">
          ‹ {c.back}
        </a>
        <h2 className={styles.pageTitle}>{c.title}</h2>
      </div>

      {state === 'success' ? (
        <div className={styles.toast} role="status">
          <span>
            {c.created}{' '}
            {/* Latin digits, verbatim, never through a locale number formatter.
                dir="ltr" because it is an identifier, not prose (BR-8.13). */}
            <span className={styles.toastNumber} dir="ltr">
              TCK-2026-000042
            </span>
          </span>
          <button type="button" className={styles.toastDismiss}>
            ✕
          </button>
        </div>
      ) : null}

      {state === 'customerGone' ? (
        <div className={styles.notice} role="alert">
          <bdi>{c.customerGone}</bdi>
        </div>
      ) : null}

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>{c.customerSection}</h3>

        {hasCustomer ? (
          <SelectedCustomer lang={lang} />
        ) : (
          <>
            <div className={styles.searchRow}>
              <div className={cx(styles.searchField, styles.searchAnchor)}>
                <Input
                  label={c.findCustomer}
                  value={state === 'idle' ? '' : 'الري'}
                  onChange={() => undefined}
                  placeholder={c.findCustomer}
                />
                {state === 'searching' ? (
                  <span className={styles.searchSpinner}>
                    <Loader size="sm" />
                  </span>
                ) : null}
              </div>
              <Button
                buttonType="secondary-outline"
                text={c.newCustomer}
                iconStart={<IconAdd size={16} />}
                disabled
              />
            </div>

            {state === 'searching' ? (
              <ul className={styles.results} role="listbox">
                {CUSTOMERS.map(([name, meta], i) => (
                  <li
                    key={name}
                    role="option"
                    aria-selected={i === 0}
                    className={cx(styles.result, i === 0 && styles.resultActive)}
                  >
                    <span className={styles.resultName} dir="auto">
                      <bdi>{name}</bdi>
                    </span>
                    <span className={styles.resultMeta} dir="auto">
                      <bdi>{meta}</bdi>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {state === 'noMatches' || state === 'customerGone' ? (
              <div className={styles.empty}>
                <IconSearch size={16} />
                <span>{c.noMatches}</span>
                {/* Q-3: /customers/new does not exist (007). Visibly unavailable
                    with the reason, never a link to nowhere. */}
                <span className={styles.linkDisabled}>{c.newCustomer}</span>
                <span className={styles.helper}>{c.newCustomerUnavailable}</span>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className={styles.card}>
        <fieldset className={styles.fieldset} disabled={!hasCustomer}>
          <h3 className={styles.cardTitle}>{c.ticketSection}</h3>

          {/* Rendered disabled with the reason, NOT hidden. A section that
              appears after a selection reads as a page that was broken until it
              wasn't. The fieldset puts the state in the accessibility tree. */}
          {!hasCustomer ? (
            <p className={styles.disabledNote}>{c.selectCustomerFirst}</p>
          ) : null}

          <TicketFields showErrors={state === 'errors'} lang={lang} />
        </fieldset>
      </div>

      <div className={styles.actions}>
        <Button buttonType="secondary-outline" text={c.cancel} />
        <Button
          text={state === 'submitting' ? c.submitting : c.submit}
          loading={state === 'submitting'}
          disabled={!hasCustomer}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const STATES: Array<[string, Parameters<typeof Screen>[0]['state']]> = [
  ['1 · idle — no customer selected', 'idle'],
  ['2 · searching', 'searching'],
  ['3 · no matches', 'noMatches'],
  ['4 · customer selected', 'selected'],
  ['5 · validation errors', 'errors'],
  ['6 · submitting', 'submitting'],
  ['7 · customer gone (404)', 'customerGone'],
  ['8 · success', 'success'],
];

export default function CreateTicketPreview() {
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [measured, setMeasured] = useState('');

  useEffect(() => {
    const root = document.documentElement;
    const prevLang = root.lang;
    const prevDir = root.dir;
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';
    return () => {
      root.lang = prevLang;
      root.dir = prevDir;
    };
  }, [lang]);

  /* The measurement is part of the artifact, not a console exercise: the answer
   * to "do three selects fit" has to be readable by whoever reviews the preview,
   * not re-derived by them. */
  useEffect(() => {
    const id = window.setTimeout(() => {
      const row = document.querySelector('[data-measure="select-row"]');
      if (!row) return;
      const selects = [...row.querySelectorAll('select')];
      /* By CLASS, not by index. The first pass picked `span[i * 2]`, which is
       * arithmetic over a DOM that has other spans in it — it printed the wrong
       * label for one select and an empty string for another. A measurement
       * readout that names the wrong thing is worse than none, because it is
       * believed. */
      const labels = [...row.querySelectorAll('span')].filter((n) =>
        n.className.includes('label'),
      );
      const lines = selects.map((s, i) => {
        const r = s.getBoundingClientRect();
        const label = labels[i]?.textContent?.trim() ?? '(none)';
        const longest = [...s.options].reduce(
          (a, o) => (o.text.length > a.length ? o.text : a),
          '',
        );
        /* The real Select draws a chevron the native control does not, so the
         * headroom is measured against text + padding-inline + a chevron. */
        const probe = document.createElement('span');
        probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
        probe.style.font = getComputedStyle(s).font;
        probe.textContent = longest;
        document.body.appendChild(probe);
        const textWidth = probe.getBoundingClientRect().width;
        probe.remove();
        const headroom = r.width - textWidth - 48;
        return `select ${i + 1}  width ${r.width.toFixed(1)}  headroom ${headroom.toFixed(1)}  label ⁦${label}⁩  longest ⁦${longest}⁩`;
      });
      const rowRect = row.getBoundingClientRect();
      setMeasured(
        [
          `frame 720   row ${rowRect.width.toFixed(1)}   headroom = width - longest option - padding - chevron`,
          ...lines,
        ].join('\n'),
      );
    }, 400);
    return () => window.clearTimeout(id);
  }, [lang]);

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <span className={styles.toolbarLabel}>lang</span>
        <Button
          buttonType={lang === 'ar' ? 'primary' : 'secondary-outline'}
          text="ar · rtl"
          onClick={() => setLang('ar')}
        />
        <Button
          buttonType={lang === 'en' ? 'primary' : 'secondary-outline'}
          text="en · ltr"
          onClick={() => setLang('en')}
        />
        <span className={styles.toolbarLabel}>
          FE-024-00 · preview only · nothing is wired
        </span>
      </div>

      <div className={styles.frame}>
        {STATES.map(([name, state]) => (
          <section key={state} className={styles.stateBlock}>
            <span className={styles.stateName}>{name}</span>
            <Screen state={state} lang={lang} />
            {state === 'selected' && measured ? (
              <pre className={styles.measure} dir="ltr">
                {measured}
              </pre>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}
