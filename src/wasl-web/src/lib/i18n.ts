import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import arAuth from '../locales/ar/auth.json';
import arCommon from '../locales/ar/common.json';
import arCustomers from '../locales/ar/customers.json';
import arSettings from '../locales/ar/settings.json';
import arTickets from '../locales/ar/tickets.json';
import enAuth from '../locales/en/auth.json';
import enCommon from '../locales/en/common.json';
import enCustomers from '../locales/en/customers.json';
import enSettings from '../locales/en/settings.json';
import enTickets from '../locales/en/tickets.json';
import { setLanguageResolver } from './api';
import {
  applyDocumentLanguage,
  FALLBACK_LANGUAGE,
  isLanguage,
  resolveLanguage,
  storeLanguage,
  type Language,
} from './direction';

/* ============================================================================
 * i18n.ts
 * ============================================================================
 *
 * FIVE NAMESPACES. `customers` WAS registered with an empty catalogue, on the
 * grounds that no customer screen was built. `032` built two — the profile and
 * the create form — and filled it. The empty-catalogue note is kept in this
 * shape as the record of why the namespace existed before its screens did.
 *
 * `settings` was added by `014` for /settings/localization. **This said FOUR
 * until then** — a count in prose is a fact that goes stale the moment the list
 * it describes is edited, and nothing fails when it does. Corrected in the same
 * commit that added the fifth, which is the only time it is cheap.
 *
 * Keys are SYMBOLIC — `common:nav.tickets`, never the English text as the key.
 * Using the source text is a common shortcut and it was rejected twice over
 * (ADR-007 §5): a missing Arabic entry then renders a plausible English sentence
 * that looks deliberate, and editing the English copy silently orphans the
 * Arabic translation.
 *
 * PLURALS need no configuration. i18next resolves categories through
 * `Intl.PluralRules`, so Arabic gets its full CLDR set — `_zero` `_one` `_two`
 * `_few` `_many` `_other` — rather than English's two (ADR-007 §9). No key here
 * is a plural yet; the first one will not need a config change.
 *
 * String concatenation around a value stays banned: `t('tickets') + ' ' + n` is
 * grammatically wrong for Arabic in most of those six categories.
 *
 * The catalogues are IMPORTED, not lazily fetched. Eight small JSON files cost
 * less than a request waterfall, and a fetched catalogue means the first paint
 * has no strings in it.
 * ============================================================================ */

export const NAMESPACES = ['common', 'auth', 'tickets', 'customers', 'settings'] as const;

const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    tickets: enTickets,
    customers: enCustomers,
    settings: enSettings,
  },
  ar: {
    common: arCommon,
    auth: arAuth,
    tickets: arTickets,
    customers: arCustomers,
    settings: arSettings,
  },
} as const;

const initialLanguage = resolveLanguage();

void i18next.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: FALLBACK_LANGUAGE,
  ns: NAMESPACES,
  defaultNS: 'common',
  interpolation: {
    /* React escapes for us. Double-escaping turns an apostrophe into `&#39;` in
     * the rendered output. */
    escapeValue: false,
  },
});

/* `dir` and `lang` follow the language from ONE place, for every change after the
 * first. The first write already happened inline in index.html, before paint. */
i18next.on('languageChanged', (language) => {
  if (!isLanguage(language)) return;
  applyDocumentLanguage(language);
  storeLanguage(language);
});

/* The client half of ADR-007 §4: every request advertises the active locale.
 * A resolver rather than an import, so lib/api.ts never depends on i18next and
 * stays testable on its own. */
setLanguageResolver(() => i18next.resolvedLanguage ?? FALLBACK_LANGUAGE);

export function changeLanguage(language: Language): void {
  void i18next.changeLanguage(language);
}

export default i18next;
