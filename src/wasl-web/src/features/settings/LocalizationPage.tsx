import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Loader } from '../../components/Loader/Loader';
import { setSessionCulture } from '../../lib/api';
import { cx } from '../../lib/cx';
import {
  applyDocumentLanguage,
  SUPPORTED_LANGUAGES,
  storeLanguage,
  type Language,
} from '../../lib/direction';
import { formatDateLong, formatNumber } from '../../lib/formatters';
import { changeLanguage } from '../../lib/i18n';
import { changeMyLanguage } from './me.api';
import styles from './Localization.module.css';

/**
 * `/settings/localization` — FE-014-03, FE-014-04, FE-014-10.
 *
 * Previewed and reviewed before wiring (ADR-009). Design:
 * `docs/sdd/design/screens/09-settings-localization.md`.
 *
 * NO SAVE BUTTON. One setting with an instantly visible effect does not need a
 * commit step, and a Save button beside a change you can already see is
 * confusing. The consequence is that the failure path has to be honest: if the
 * request fails, the local change is **reverted**, never left inconsistent with
 * the server.
 */

/* NEVER TRANSLATED. Someone who cannot read the current interface still has to
 * find their own language — the same reasoning that put the switcher on the
 * login screen. `English` stays `English` in Arabic. */
const LANGUAGE_NAME: Record<Language, string> = {
  en: 'English',
  ar: 'العربية',
};

const SAMPLE_INSTANT = '2026-08-24T09:00:00Z';
const SAMPLE_COUNT = 1250;

export default function LocalizationPage() {
  const { t, i18n } = useTranslation('settings');
  const current = (i18n.resolvedLanguage === 'ar' ? 'ar' : 'en') as Language;

  const [pending, setPending] = useState<Language | null>(null);
  const [failed, setFailed] = useState(false);

  const choose = async (next: Language) => {
    /* ALREADY THIS LANGUAGE IS A NO-OP, NOT A REQUEST. Re-selecting the current
     * row would otherwise send a PUT that changes nothing and can still fail —
     * a failure the user cannot have caused. */
    if (next === current || pending !== null) return;

    const previous = current;
    setFailed(false);
    setPending(next);

    /* Applied LOCALLY FIRST. The screen's whole promise is that the effect is
     * immediate, and waiting on a round trip to change the interface is what
     * makes a settings screen feel broken on a slow connection. */
    apply(next);

    try {
      await changeMyLanguage(next);

      /* FE-014-10 — the token still carries the OLD language and the claim
       * outranks Accept-Language, so without this every server-authored
       * sentence keeps arriving in the previous language for the rest of the
       * session: Arabic labels around an English error. `?culture=` is the top
       * of BR-8.4's order and is dropped at the next token issue. */
      setSessionCulture(next);
    } catch {
      /* REVERTED, not left inconsistent. The server did not take the change, so
       * the interface must not claim it did — the next reload would silently
       * undo it and look like the setting does not persist. */
      apply(previous);
      setFailed(true);
    } finally {
      setPending(null);
    }
  };

  return (
    <main className={styles.page}>
      <h2 className={styles.title}>{t('localization.title')}</h2>
      <p className={styles.subtitle}>{t('localization.body')}</p>

      {/* Above the group, per the design: a message below a control that has
          already reverted explains a change the reader just watched undo. */}
      {failed ? (
        <p className={styles.error} role="alert">
          {t('localization.failed')}
        </p>
      ) : null}

      <fieldset
        className={cx(styles.group, pending !== null && styles.groupBusy)}
        disabled={pending !== null}
      >
        <legend className={styles.legend}>{t('localization.group')}</legend>

        {SUPPORTED_LANGUAGES.map((option) => (
          <label key={option} className={styles.row}>
            <input
              type="radio"
              name="language"
              className={styles.radio}
              checked={current === option}
              onChange={() => void choose(option)}
            />
            {/* `lang` selects the face; `dir` is deliberately absent — it would
                rewrite the element direction and push a Latin name to the far
                edge of an RTL row. */}
            <span className={styles.name} lang={option}>
              {LANGUAGE_NAME[option]}
            </span>
            {pending === option ? (
              <span className={styles.rowBusy}>
                <Loader size="sm" label={t('localization.saving')} />
              </span>
            ) : null}
          </label>
        ))}
      </fieldset>

      {/* The reader sees the format change BEFORE committing to a language they
          may not be able to read the rest of. It uses the LONG date on purpose:
          the numeric form is byte-identical in both locales once BR-8.13 pins
          the digits, so a `dd/MM/yyyy` preview would change nothing and imply
          it had. The month name is the only part that can differ. */}
      <p className={styles.callout}>
        <span className={styles.calloutLabel}>{t('localization.preview')}</span>
        <span className={styles.calloutValue}>
          {/* The separator is catalogued, not a literal — the eslint rule is
              right that a punctuation mark between two values is copy, and an
              RTL locale may want a different one. */}
          {t('localization.sample', {
            date: formatDateLong(SAMPLE_INSTANT, current),
            count: formatNumber(SAMPLE_COUNT, current),
          })}
        </span>
      </p>
    </main>
  );
}

/** The three things a language change means on the client, in one place so a
 *  revert cannot restore two of them and miss the third. */
function apply(language: Language): void {
  storeLanguage(language);
  applyDocumentLanguage(language);
  changeLanguage(language);
}
