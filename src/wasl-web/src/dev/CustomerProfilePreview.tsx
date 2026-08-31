import { useMemo, useState } from 'react';
import { I18nextProvider } from 'react-i18next';

import { Toast } from '../components/Toast/Toast';
import { CustomerProfileView } from '../features/customers/CustomerProfileView';
import { IconCheck } from '../icons/icons';
import type { CustomerDetail } from '../lib/api-types.provisional';
import { cx } from '../lib/cx';
import type { Lang } from '../lib/formatters';
import i18n from '../lib/i18n';
import styles from './CustomerProfilePreview.module.css';

/**
 * FE-032-00 — `/customers/:id`, previewed BEFORE any wiring (ADR-009).
 *
 * Source: `Wasl Customer Screens.dc.html`, plus
 * `docs/sdd/design/screens/07-customer-profile.md` — **and those two describe
 * different screens.** `07` specifies a 240px rail, counts by status and the ten
 * most recent tickets, all of which come from `GET /api/customers/{id}/overview`,
 * an endpoint that does not exist. The canvas document describes the screen
 * `008`'s delivered `GET /api/customers/{id}` can actually serve, and puts a
 * named placeholder where the ticket history will go. This previews the second
 * one (spec Q-2).
 *
 * NOTHING HERE CALLS THE SERVER. `CustomerProfileView` takes a state and a
 * customer as props, which is what lets `notFound` and `error` be rendered on
 * demand rather than by breaking something — and those two are the states this
 * screen exists to get right, because a `404` is an ANSWER and a failed request
 * is not.
 *
 * ARABIC FIRST, side by side with English. The defects available here are
 * comparative: a divider that did not move to the inline-end, an address that
 * dragged its label to the wrong edge, a colon in a trace id that jumped ends.
 * A toggle would make each of those a memory test.
 *
 * THE ARABIC BELOW IS AUTHORED HERE, NOT TRANSCRIBED FROM THE SOURCE. The
 * document arrived by paste and the channel is lossy on non-ASCII — cp1252
 * mojibake with the C1 bytes stripped, so `تفاصيل العميل` round-trips to
 * `ت?اص?? ا?ع???`. Spec §2 records the measurement and Q-6 gates the transcription
 * on the file being vendored byte-exact. What is here is real copy for review,
 * and it is what the catalogues hold; it is diffed against the source's own
 * wording once the file lands.
 */

const CUSTOMER: Record<Lang, CustomerDetail> = {
  ar: {
    id: 'a3f19c04-7b62-4d18-9f30-5c2ab41c8e21',
    fullName: 'علي الأحمد',
    email: 'ali.ahmed@abyan.sa',
    phone: '+966501234567',
    companyName: 'شركة أبيان للتقنية',
    notes:
      'يفضّل التواصل عبر واتساب في الفترة الصباحية. لديه عقد سنوي مُجدّد في يناير، وطلب أن تُرسل الفواتير إلى قسم المحاسبة لا إليه شخصيًا.',
    isActive: true,
    createdAtUtc: '2026-08-29T09:12:00.000Z',
    updatedAtUtc: '2026-08-29T09:12:00.000Z',
    version: 'AAAAAAAAB9E=',
  },
  en: {
    id: 'a3f19c04-7b62-4d18-9f30-5c2ab41c8e21',
    fullName: 'Ali Al-Ahmad',
    email: 'ali.ahmed@abyan.sa',
    phone: '+966501234567',
    companyName: 'Abyan Technology Co.',
    notes:
      'Prefers WhatsApp in the morning. Annual contract renews in January; asked for invoices to go to accounts rather than to him directly.',
    isActive: true,
    createdAtUtc: '2026-08-29T09:12:00.000Z',
    updatedAtUtc: '2026-08-29T09:12:00.000Z',
    version: 'AAAAAAAAB9E=',
  },
};

/* Eight variants, and the last four are the ones a wired screen cannot show on
 * demand. `emptyNotes` and `inactive` are data states; `loading`, `notFound` and
 * `error` are transport states. */
type Variant =
  | 'loaded'
  | 'emptyNotes'
  | 'noPhone'
  | 'longName'
  | 'inactive'
  | 'loading'
  | 'notFound'
  | 'error';

const VARIANTS: Array<{ variant: Variant; note: string }> = [
  { variant: 'loaded', note: 'Loaded — three copyable values, notes, the record card' },
  {
    variant: 'emptyNotes',
    note: 'No notes — a MUTED LINE, never an absent section. It must not read like the skeleton or the error',
  },
  {
    variant: 'noPhone',
    note: 'Email only — BR-4.1 needs one contact method, so an em dash and no copy control',
  },
  {
    variant: 'longName',
    note: 'A 96-character name and a long company — one line each, ellipsis, and the copy buttons stay put',
  },
  {
    variant: 'inactive',
    note: 'isActive: false — the contract says the field is not there and the build sends it (spec Q-5)',
  },
  { variant: 'loading', note: 'Loading — skeletons shaped like what is coming, ONE announcement' },
  {
    variant: 'notFound',
    note: '404 — an ANSWER. No trace id, no Retry: retrying a definite answer is how a state becomes a loop',
  },
  {
    variant: 'error',
    note: 'A failed request — the trace id verbatim and LTR-isolated, plus Retry',
  },
];

const LONG_NAME =
  'مؤسسة عبدالله بن محمد العتيبي للتجارة العامة والتوريدات الصناعية والخدمات اللوجستية';

function customerFor(variant: Variant, lang: Lang): CustomerDetail {
  const base = CUSTOMER[lang];
  if (variant === 'emptyNotes') return { ...base, notes: null };
  if (variant === 'noPhone') return { ...base, phone: null };
  if (variant === 'inactive') return { ...base, isActive: false };
  if (variant === 'longName') {
    return {
      ...base,
      fullName: lang === 'ar' ? LONG_NAME : 'Abdullah bin Mohammed Al-Otaibi General Trading and Industrial Supplies Company',
      companyName: lang === 'ar' ? LONG_NAME : 'Al-Otaibi General Trading and Industrial Supplies',
    };
  }
  return base;
}

function stateFor(variant: Variant) {
  if (variant === 'loading') return 'loading' as const;
  if (variant === 'notFound') return 'notFound' as const;
  if (variant === 'error') return 'error' as const;
  return 'loaded' as const;
}

/* ============================================================================
 * ONE i18next INSTANCE PER LANGUAGE, and this is why the older previews carry
 * their own hard-coded copy maps.
 * ============================================================================
 * i18next has ONE current language per instance, so two frames sharing the app's
 * instance both render whichever language is active. Measured on the first
 * browser pass: the Arabic frame rendered Arabic DATA under English LABELS —
 * "Email", "Record details", "Added" — inside a correct RTL layout. It looked
 * like a translation gap and was a preview bug.
 *
 * `cloneInstance` shares the resource store and takes its own `lng`, so each
 * frame resolves the REAL catalogue in its own language. That is worth more than
 * the copy maps in `CreateCustomerPreview` and `TicketDetailPreview`: those
 * previews review strings that are not the ones the product will render, so a
 * key missing from `ar` is invisible in exactly the place it should be loudest.
 * ========================================================================== */
const instances: Partial<Record<Lang, typeof i18n>> = {};

function instanceFor(lang: Lang) {
  instances[lang] ??= i18n.cloneInstance({ lng: lang });
  return instances[lang];
}

function Frame({ variant, lang }: { variant: Variant; lang: Lang }) {
  const [copied, setCopied] = useState<string | null>(null);
  const state = stateFor(variant);
  const instance = useMemo(() => instanceFor(lang), [lang]);

  return (
    <I18nextProvider i18n={instance}>
    <div className={styles.frame} dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang}>
      {/* NO ROUTER HERE, AND THE FIRST VERSION HAD ONE.
          The view holds three `Link`s — the breadcrumb and the two back-to-list
          controls — so I wrapped each frame in a `MemoryRouter`. This route is
          already inside the application's router (`routes.tsx` mounts it), and
          react-router refuses:

            You cannot render a <Router> inside another <Router>.

          The whole page rendered as an error boundary. FIFTY-NINE UNIT TESTS
          WERE GREEN while this was broken, because each of them mounts the page
          in its own `MemoryRouter` and never goes through `routes.tsx` — the
          same blind spot that let `/tickets` render a placeholder for a release.
          Found by opening the page in a browser, which is the only tool that
          sees it. */}
      <CustomerProfileView
        state={state}
        customer={customerFor(variant, lang)}
        traceId={variant === 'error' ? '0HN7QK3M9V2P1:0000000B' : undefined}
        onRetry={() => {}}
        onCopied={(field) => setCopied(field)}
        lang={lang}
      />

      {/* THE REAL TOAST, and the first version of this page did not show it.
          It stood in with a line of text — `copy → toast` — on the grounds that
          eight fixed-position toasts would stack in one corner of the harness.
          True, and it made the confirmation unreviewable: the product owner
          asked where the toast was, which is the correct question to ask of a
          preview that claims to show every state.

          Fixed by rendering it INSIDE the frame rather than fixed to the
          viewport. The page still positions it at the bottom inline-start; this
          shows the pill itself — tone, tick, copy, dismiss control. */}
      <div className={styles.toastSlot}>
        {copied === null ? (
          <p className={cx(styles.copyEcho, styles.copyEchoIdle)}>
            {'press a copy control →'}
          </p>
        ) : (
          <Toast
            key={copied}
            tone="inverse"
            dismissLabel="Dismiss"
            onDismiss={() => setCopied(null)}
          >
            <span className={styles.toastBody}>
              <span className={styles.toastTick} aria-hidden="true">
                <IconCheck size={14} />
              </span>
              {instance.t('customers:profile.copied', { field: copied })}
            </span>
          </Toast>
        )}
      </div>
    </div>
    </I18nextProvider>
  );
}

export default function CustomerProfilePreview() {
  return (
    <main className={styles.page}>
      <h1 className={styles.pageTitle}>/customers/:id — FE-032-00</h1>

      <p className={styles.pageNote}>
        Preview only. Nothing calls <code>GET /api/customers/{'{id}'}</code>. Eight
        variants, both directions, Arabic first. The <strong>Edit</strong> control the
        design shows is deliberately absent: <code>017</code> is not built and no{' '}
        <code>PUT /api/customers/{'{id}'}</code> exists, so a disabled button would be a
        promise about an endpoint.
      </p>

      <p className={cx(styles.pageNote, styles.finding)}>
        <strong>Two findings against the frozen contracts, measured not read.</strong>{' '}
        <code>isActive</code> is in the built response and{' '}
        <code>008</code>&apos;s contract says it is not — a deactivated customer answers{' '}
        <code>200</code> and, without the badge below, renders identically to a live one.
        And a malformed id answers <code>404</code>, not the contract&apos;s{' '}
        <code>400</code>, because the action carries a <code>{'{id:guid}'}</code> route
        constraint — so <em>one</em> not-found state serves both causes. Both are raised in
        the spec, not normalised.
      </p>

      {VARIANTS.map(({ variant, note }) => (
        <section key={variant} className={styles.block}>
          <h2 className={styles.blockTitle}>
            {variant} — {note}
          </h2>
          <div className={styles.pair}>
            <Frame variant={variant} lang="ar" />
            <Frame variant={variant} lang="en" />
          </div>
        </section>
      ))}
    </main>
  );
}
