import { useState } from 'react';

import { Loader } from '../components/Loader/Loader';
import { cx } from '../lib/cx';
import { formatDateLong, formatNumber, type Lang } from '../lib/formatters';
import styles from './LocalizationPreview.module.css';

/**
 * FE-014-00 — the `/settings/localization` preview, BEFORE any wiring (ADR-009).
 *
 * Source: `docs/sdd/design/screens/09-settings-localization.md`. Arabic first,
 * because this is the screen whose whole job is to be usable by someone who
 * cannot read the interface they are looking at.
 *
 * NOTHING HERE CALLS THE SERVER. `PUT /api/me/language` exists — `014`'s backend
 * half landed 2026-08-30 — and is deliberately not reached: a preview is a
 * measuring instrument, and one that fetches cannot render its own failure
 * states on demand.
 *
 * The literals below are REAL copy, destined for `settings:*` in FE-014-08.
 * eslint scopes the no-JSX-literal rule to src/components, src/shell and
 * src/features; this is none of them, and routes.tsx strips /_preview from the
 * production bundle.
 */

type State = 'idle' | 'saving' | 'failed' | 'same';

/* THE TWO NAMES ARE NEVER TRANSLATED, and that is the point of the screen.
 * Someone who cannot read the current interface still has to find their own
 * language — the same reasoning that put the switcher on the login screen. So
 * `English` stays `English` in Arabic, and `العربية` stays `العربية` in English. */
const LANGUAGE_NAME: Record<Lang, string> = {
  en: 'English',
  ar: 'العربية',
};

const COPY = {
  ar: {
    back: 'رجوع',
    settings: 'الإعدادات',
    general: 'عام',
    profile: 'الملف الشخصي',
    localization: 'اللغة والمنطقة',
    body: 'كيف تُعرض الواجهة لك.',
    group: 'اللغة',
    preview: 'معاينة',
    saving: 'يُحفظ…',
    failed: 'تعذّر حفظ اللغة. لم يتغيّر شيء.',
  },
  en: {
    back: 'Back',
    settings: 'Settings',
    general: 'General',
    profile: 'Profile',
    localization: 'Localization',
    body: 'How the interface is shown to you.',
    group: 'Language',
    preview: 'Preview',
    saving: 'Saving…',
    failed: 'Could not save the language. Nothing changed.',
  },
} as const;

/* A fixed instant. A preview that changes between two reads cannot be compared
 * against itself, and a screenshot of it is evidence of nothing. */
const SAMPLE_INSTANT = '2026-08-24T09:00:00Z';
const SAMPLE_COUNT = 1250;

function Screen({ lang, state }: { lang: Lang; state: State }) {
  const c = COPY[lang];
  const [selected, setSelected] = useState<Lang>(lang);
  const busy = state === 'saving';

  return (
    <div className={styles.frame} dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang}>
      <div className={styles.crumb}>
        <span className={styles.back}>‹ {c.back}</span>
        <span className={styles.crumbTitle}>{c.settings}</span>
      </div>

      <div className={styles.body}>
        {/* RTL moves the sub-nav to the inline-end. It is `order` on a flex row
            rather than a second layout, so the two directions cannot drift. */}
        <nav className={styles.subnav} aria-label={c.settings}>
          <p className={styles.navCaption}>{c.general}</p>
          <a className={styles.navItem} href="#">
            {c.profile}
          </a>
          <a
            className={cx(styles.navItem, styles.navItemActive)}
            href="#"
            aria-current="page"
          >
            {c.localization}
          </a>
        </nav>

        <section className={styles.content}>
          <h2 className={styles.title}>{c.localization}</h2>
          <p className={styles.subtitle}>{c.body}</p>

          {/* The error sits ABOVE the group, per the design — a message below a
              control that has already reverted explains a change the reader has
              just watched undo itself. */}
          {state === 'failed' ? (
            <p className={styles.error} role="alert">
              {c.failed}
            </p>
          ) : null}

          <fieldset
            className={cx(styles.group, busy && styles.groupBusy)}
            disabled={busy}
          >
            <legend className={styles.legend}>{c.group}</legend>

            {(['en', 'ar'] as const).map((option) => (
              <label key={option} className={styles.row}>
                <input
                  type="radio"
                  name={`lang-${lang}-${state}`}
                  className={styles.radio}
                  checked={selected === option}
                  onChange={() => setSelected(option)}
                />
                {/* Its own language, never translated.

                    `lang` STAYS, `dir` GOES. Both isolate the run; only `dir`
                    also rewrites the element direction, and `text-align: start`
                    resolves against that — so `English` sat at the far LEFT of
                    an RTL row while its radio stayed at the right, with the
                    whole row width between them. `lang` still earns its place:
                    it selects the Arabic face and the Latin one correctly.

                    The same defect as the ticket list customer column, in a
                    screen written after that one was fixed. */}
                <span className={styles.name} lang={option}>
                  {LANGUAGE_NAME[option]}
                </span>
                {busy && selected === option ? (
                  <span className={styles.rowBusy}>
                    <Loader size="sm" label={c.saving} />
                  </span>
                ) : null}
              </label>
            ))}
          </fieldset>

          {/* THE POINT OF THE SCREEN. The callout re-renders on switch, so the
              reader sees the date and number format change BEFORE committing to
              a language they may not be able to read the rest of. */}
          <p className={styles.callout}>
            <span className={styles.calloutLabel}>{c.preview}</span>
            <span className={styles.calloutValue}>
              {formatDateLong(SAMPLE_INSTANT, selected)} ·{' '}
              {formatNumber(SAMPLE_COUNT, selected)}
            </span>
          </p>
        </section>
      </div>
    </div>
  );
}

const STATES: Array<{ state: State; note: Record<Lang, string> }> = [
  { state: 'idle', note: { ar: 'الحالة العادية', en: 'Idle' } },
  {
    state: 'saving',
    note: {
      ar: 'يُحفظ — الصفّان غير قابلين للنقر',
      en: 'Saving — both rows non-interactive',
    },
  },
  {
    state: 'failed',
    note: { ar: 'فشل الحفظ — الاختيار رجع', en: 'Save failed — selection reverted' },
  },
  {
    state: 'same',
    note: {
      ar: 'نفس اللغة — النقر لا يرسل شيئًا',
      en: 'Already this language — click sends nothing',
    },
  },
];

/**
 * ARABIC FIRST, and both languages side by side rather than behind a toggle.
 *
 * A toggle shows one at a time, so the two are compared from memory — and the
 * defects this screen can have are comparative: a sub-nav that does not move to
 * the inline-end, a language name that got translated, a preview callout whose
 * digits did not change. Side by side, each of those is visible without
 * remembering anything.
 */
export default function LocalizationPreview() {
  return (
    <main className={styles.page}>
      <h1 className={styles.pageTitle}>/settings/localization — FE-014-00</h1>
      <p className={styles.pageNote}>
        Preview only. Nothing here calls <code>PUT /api/me/language</code>. Four states,
        both directions. Language names are never translated — that is the screen&rsquo;s
        reason for existing.
      </p>

      {STATES.map(({ state, note }) => (
        <section key={state} className={styles.block}>
          <h2 className={styles.blockTitle}>
            {state} — {note.en} · {note.ar}
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
