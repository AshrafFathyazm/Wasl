/* ============================================================================
 * THEME — `022`, FE-022-02
 * ============================================================================
 * THE THEME REACHES `:root` BEFORE FIRST PAINT, OR IT IS A DEFECT NOBODY FILES.
 *
 * A `useEffect` implementation passes every other acceptance criterion in this
 * feature: the row is right, the endpoints are right, the colour is right. It
 * also renders the default theme and then snaps to the tenant's, on every load,
 * for every user — and because it is a flash rather than an error, it gets
 * described as "the app feels slow" or not reported at all.
 *
 * THIS MODULE DUPLICATES THE WRITE IN `index.html`, ON PURPOSE, and the two must
 * agree. A module cannot run before first paint, so the inline script does the
 * first write from cache and this does every write after it — the same shape
 * `direction.ts` already has for `lang`/`dir`, and for the same reason.
 * ========================================================================= */

/** Matches `BrandingResponse` on the wire. Provisional until types are generated. */
export interface Theme {
  brandColor: string;
  onBrand: string;
  sidebarMode: 'Light' | 'Dark' | 'Brand';
  updatedAtUtc: string;
  version: string;
}

/** Shared with the inline script in `index.html`. Change one, change both. */
export const THEME_CACHE_KEY = 'wasl.theme';

/**
 * The direction `--brand-hover` and `--brand-active` mix in.
 *
 * **Not a second implementation of the contrast rule.** It reads the decision
 * the server already made — which of the two candidate foregrounds won — and
 * maps it to a CSS keyword. The luminance computation, and the refusal that
 * goes with it, live in `Wasl.Domain/Settings/BrandContrast.cs` and nowhere
 * else (Constitution III).
 */
export function awayFrom(onBrand: string): 'black' | 'white' {
  return onBrand.toUpperCase() === '#FFFFFF' ? 'black' : 'white';
}

/**
 * Writes a theme to the document. Three custom properties and one attribute.
 *
 * **Only brand tokens are touched (AC-16).** No status colour, no neutral, no
 * text or border token is written here, and a tenant therefore cannot make the
 * product lie about state — a "success" that could be set to red is a worse
 * feature than no theming at all (ADR-012 part 3).
 */
export function applyTheme(theme: Theme, root: HTMLElement): void {
  root.style.setProperty('--brand', theme.brandColor);
  root.style.setProperty('--on-brand', theme.onBrand);
  root.style.setProperty('--brand-away', awayFrom(theme.onBrand));

  /* The sidebar preset is an ATTRIBUTE, not a colour. The three presets live in
   * `tokens.css`; sending their values would be the stylesheet stated twice. */
  root.dataset['sidebarMode'] = theme.sidebarMode.toLowerCase();
}

/**
 * Reads the cached theme, or `null`.
 *
 * **Never throws.** `localStorage` throws in a private window, the value can be
 * corrupt JSON, and a release can change the shape. A theme cache that breaks
 * the application is worse than a flash — so every failure path is the same
 * one: return null, paint the default, let the server correct it once (A-4).
 */
export function readCachedTheme(storage: Storage | undefined = safeStorage()): Theme | null {
  if (storage === undefined) {
    return null;
  }

  try {
    const raw = storage.getItem(THEME_CACHE_KEY);

    if (raw === null) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);

    return isTheme(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Stores a theme. Never throws, for the same reasons as the read. */
export function writeCachedTheme(
  theme: Theme,
  storage: Storage | undefined = safeStorage(),
): void {
  if (storage === undefined) {
    return;
  }

  try {
    storage.setItem(THEME_CACHE_KEY, JSON.stringify(theme));
  } catch {
    /* A full or unavailable store costs a flash on the next load, nothing more. */
  }
}

/**
 * Whether two themes would paint identically.
 *
 * **AC-18 is the reason this exists.** After one signed-in load, a reload must
 * paint the tenant's brand with exactly ONE write to `:root` — the pre-paint
 * one. Re-applying an identical theme when the server response arrives would be
 * a second write, and a second write is how a flash survives a fix.
 */
export function paintsTheSame(left: Theme | null, right: Theme | null): boolean {
  if (left === null || right === null) {
    return false;
  }

  return (
    left.brandColor === right.brandColor
    && left.onBrand === right.onBrand
    && left.sidebarMode === right.sidebarMode
  );
}

function isTheme(value: unknown): value is Theme {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<Theme>;

  return (
    typeof candidate.brandColor === 'string'
    && typeof candidate.onBrand === 'string'
    && (candidate.sidebarMode === 'Light'
      || candidate.sidebarMode === 'Dark'
      || candidate.sidebarMode === 'Brand')
    && typeof candidate.version === 'string'
    && typeof candidate.updatedAtUtc === 'string'
  );
}

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
