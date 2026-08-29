import { useTranslation } from 'react-i18next';

import { IconGlobe } from '../../icons/icons-added';
import { changeLanguage } from '../../lib/i18n';
import { isLanguage, type Language } from '../../lib/direction';
import styles from './Login.module.css';

/* ============================================================================
 * LanguageSwitch — the one control on `/login` that is not the form
 * ============================================================================
 *
 * `004/frontend-spec.md` puts this out of scope and hands it to `014`, and it
 * states the consequence: *someone who cannot read English cannot change the
 * language before signing in.* The product owner asked for it on 2026-08-28, so
 * the consequence is what has been removed.
 *
 * **This is the client half only.** `014` still owns the server side —
 * persisting a preference against the user, and the resolution order in
 * ADR-007 §4 where a stored `PreferredLanguage` outranks what the client asks
 * for. This writes `wasl.lang` and nothing else, which is what `direction.ts`
 * already reads before paint.
 *
 * IT DOES NOT SURVIVE SIGN-IN, AND THAT IS CORRECT. `AuthContext` adopts
 * `user.preferredLanguage` from the sign-in response (AC-30), so a choice made
 * on this screen is overridden the moment the server states its own. The
 * switcher is for reading THIS page, not for setting a preference — the latter
 * is `014`'s, and building it here would be two places writing one setting.
 *
 * IT SHOWS THE CURRENT LANGUAGE AS A TWO-LETTER CODE — `EN` while the interface
 * is English, `AR` while it is Arabic. That is the reference's own behaviour and
 * the product owner asked for those labels by name (2026-08-28).
 *
 * A control that displays its current state rather than its next one is normally
 * a bad toggle, and an earlier version of this button showed the TARGET's endonym
 * for that reason. What makes the current-state form safe here is the accessible
 * name: it says the action in full — "Switch language to العربية" — so the two
 * letters are a state indicator for sighted users and the button still announces
 * what pressing it does. Without that name this would be a label pretending to be
 * a button.
 *
 * The codes are identical in both catalogues on purpose: a language code is an
 * identifier rendered as-is, not copy to be translated.
 *
 * THE GLOBE IS DECORATIVE, and it is `aria-hidden` for a reason that is easy to
 * get wrong. The button's accessible name is the `aria-label` below, which says
 * the whole action. An icon contributing its own name here would either duplicate
 * that or compete with it, and a decorative glyph inside a control that already
 * has a name is exactly the case where `aria-hidden` is correct rather than lazy.
 *
 * It is also NOT DIRECTIONAL — see the note on `IconGlobe`.
 * ============================================================================ */

export function LanguageSwitch() {
  const { t, i18n } = useTranslation();

  const current: Language = isLanguage(i18n.resolvedLanguage)
    ? i18n.resolvedLanguage
    : 'en';
  const target: Language = current === 'ar' ? 'en' : 'ar';

  /* Shown: the CURRENT language. Announced: the language pressing it moves to. */
  const currentCode = current === 'ar' ? t('common:lang.codeAr') : t('common:lang.codeEn');
  const targetName = target === 'ar' ? t('common:lang.arabic') : t('common:lang.english');

  return (
    <button
      type="button"
      className={styles.lang}
      /* The two visible letters cannot say what pressing this does. The name can. */
      aria-label={t('common:lang.switchTo', { language: targetName })}
      onClick={() => changeLanguage(target)}
    >
      {/* THE PAIR MIRRORS, THE CODE DOES NOT — and until the globe arrived those
          were the same thing, so `dir="ltr"` sat on the button.

          It cannot stay there. `dir` on a flex container sets which end its
          children start from, so `dir="ltr"` on the button pins the glyph to the
          physical left in both languages. An icon beside a label is a control
          layout, and control layouts mirror — Button's `iconStart` prop is
          documented on exactly that rule.

          The original reason for the attribute is still real, so it moves to the
          thing it was protecting: a Latin-script code in both locales, pinned
          LTR so bidi cannot reorder it against what sits next to it. */}
      <span className={styles.langIcon} aria-hidden="true">
        <IconGlobe size={13} />
      </span>
      <span dir="ltr">{currentCode}</span>
    </button>
  );
}
