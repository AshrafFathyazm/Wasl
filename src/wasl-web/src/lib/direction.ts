/* ============================================================================
 * direction.ts — the ONE place `dir` and `lang` are written
 * ============================================================================
 *
 * Direction is set once, on the document root. There is no mirrored stylesheet
 * and no flipping tool: a second stylesheet doubles what has to be maintained,
 * and a flipper flips things that must not flip — code snippets, phone numbers,
 * and the ticket number among them (ADR-007 §6).
 *
 * If a component ever sets `dir` on itself, it is either rendering user content
 * — in which case it wants `dir="auto"`, not a fixed direction — or it is wrong.
 * ============================================================================ */

export const SUPPORTED_LANGUAGES = ['en', 'ar'] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number];

/** BR-8.12: runtime falls back to English. The fallback is the safety net; the
 *  parity gate is the actual control. */
export const FALLBACK_LANGUAGE: Language = 'en';

/** Kept in step with the inline pre-paint script in index.html. */
export const LANGUAGE_STORAGE_KEY = 'wasl.lang';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && SUPPORTED_LANGUAGES.some((l) => l === value);
}

export function directionFor(language: Language): 'ltr' | 'rtl' {
  return language === 'ar' ? 'rtl' : 'ltr';
}

/** A private window can throw on localStorage rather than return null. */
export function readStoredLanguage(): Language | null {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function storeLanguage(language: Language): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    /* Nothing to do. The choice lasts this session and no further. */
  }
}

/**
 * The client half of ADR-007 §4's resolution order.
 *
 *   localStorage → navigator.language → 'en'
 *
 * The server's own order is `?culture=` → the user's stored PreferredLanguage →
 * `Accept-Language` → `en`, and it OUTRANKS this: what the client resolves here
 * is only what it advertises in `Accept-Language`. A stored server-side
 * preference still wins for anything the server authors.
 */
export function resolveLanguage(): Language {
  const stored = readStoredLanguage();
  if (stored) return stored;

  const preferred = typeof navigator === 'undefined' ? '' : navigator.language;
  return preferred.toLowerCase().startsWith('ar') ? 'ar' : FALLBACK_LANGUAGE;
}

/**
 * Write `lang` and `dir` onto <html>.
 *
 * `lang` also drives styles/locale.css — the per-locale leading, the absence of
 * cap-height trim, and letter-spacing 0 (tokens.css note 4). Setting `dir`
 * without `lang` therefore produces right-to-left Arabic that is CLIPPED, which
 * presents as a font rendering fault rather than a missing attribute.
 *
 * NEVER call this from a useEffect on first load. useEffect runs after paint, and
 * the result is a visible flash of LTR on every load for every Arabic user:
 * everyone sees it and nobody files it. index.html does the first write inline,
 * before anything paints; this function owns every write after that.
 */
export function applyDocumentLanguage(language: Language): void {
  const root = document.documentElement;
  root.lang = language;
  root.dir = directionFor(language);
}
