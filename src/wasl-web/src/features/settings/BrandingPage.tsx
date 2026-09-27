import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '../../components/Button/Button';
import { Input } from '../../components/Input/Input';
import { Loader } from '../../components/Loader/Loader';
import { useToast } from '../../components/Toast/ToastHost';
import { ApiError } from '../../lib/api';
import type {
  BrandingResponse,
  InaccessibleBrandColorProblem,
} from '../../lib/api-types.provisional';
import { cx } from '../../lib/cx';
import { formatNumber, type Lang } from '../../lib/formatters';
import { applyTheme, writeCachedTheme, type Theme } from '../../lib/theme';
import { brandingKeys, getBranding, updateBranding } from './branding.api';
import { SettingsNav } from './SettingsNav';
import styles from './Branding.module.css';

/* ============================================================================
 * `/settings/branding` — `022`
 * ============================================================================
 * WHAT IS DELIBERATELY ABSENT, each with a reason:
 *
 *   NO CLIENT CONTRAST GATE. The screen does not decide whether a colour is
 *   acceptable — it submits and renders the server's verdict. A mirror here
 *   would be the luminance rule implemented twice, and the copy that drifts is
 *   the one that offers a colour the server refuses (Constitution III, AC-23).
 *
 *   NO PALETTE EDITOR. ADR-012: a tenant who wants to set nine values wants a
 *   design system, not a settings page, and every extra field is another
 *   contrast pair to validate.
 *
 *   NO PER-USER THEME. A screenshot pasted into a support conversation would
 *   not match what the other person sees. That is the whole reason this is an
 *   organisation setting.
 *
 *   NO LOGO UPLOAD. `settings-and-uploads.md` puts it later than this feature,
 *   and nothing here creates a logo column speculatively.
 * ========================================================================= */

const SIDEBAR_MODES = ['Light', 'Dark', 'Brand'] as const;

type SidebarMode = (typeof SIDEBAR_MODES)[number];

export default function BrandingPage() {
  const { t, i18n } = useTranslation('settings');
  const lang: Lang = i18n.resolvedLanguage === 'ar' ? 'ar' : 'en';
  const queryClient = useQueryClient();
  const toast = useToast();

  const branding = useQuery({
    queryKey: brandingKeys.detail(),
    queryFn: ({ signal }) => getBranding(signal),
  });

  const [color, setColor] = useState('');
  const [mode, setMode] = useState<SidebarMode>('Light');

  /* THE FORM IS SEEDED FROM THE SERVER ONCE PER LOADED VERSION, not on every
   * render and not on every refetch. Keying on `version` means a `409` refetch
   * DOES reseed — which is what the user needs after someone else's change —
   * while an ordinary background refetch of identical data does not stamp on
   * what they are typing. */
  const loadedVersion = branding.data?.version;

  useEffect(() => {
    if (branding.data === undefined) return;

    setColor(branding.data.brandColor);
    setMode(branding.data.sidebarMode);
  }, [loadedVersion, branding.data]);

  const save = useMutation({
    mutationFn: (body: { brandColor: string; sidebarMode: SidebarMode; expectedVersion: string }) =>
      updateBranding(body),
    onSuccess: (result: BrandingResponse) => {
      queryClient.setQueryData(brandingKeys.detail(), result);

      /* APPLIED AND CACHED IN ONE PLACE. The interface retints immediately —
       * which is the only way the person choosing a colour can judge it — and
       * the cache is what makes the NEXT load paint it before first paint. */
      applyTheme(result as Theme, document.documentElement);
      writeCachedTheme(result as Theme);



      /* A TOAST AS WELL AS THE INLINE LINE, and the two say different things.
       *
       * The retint is instant and global, so the strongest confirmation is the
       * interface itself changing colour — but that is exactly what a reader
       * scrolled to the bottom of a form does NOT see, because the button they
       * pressed is nowhere near the sidebar that changed. The toast is the
       * acknowledgement that the press landed; the colour is the result. */
      toast.show({ tone: 'success', title: t('branding.saved') });
    },
    onError: () => {

    },
  });

  if (branding.isPending) {
    return (
      <div className={styles.page}>
        <SettingsNav />
        <Loader label={t('branding.loading')} />
      </div>
    );
  }

  if (branding.isError || branding.data === undefined) {
    const forbidden = branding.error instanceof ApiError && branding.error.status === 403;

    return (
      <div className={styles.page}>
        <SettingsNav />
        <p className={styles.error} role="alert">
          {forbidden ? t('branding.forbidden') : t('branding.loadFailed')}
        </p>
        {forbidden ? null : (
          <Button text={t('branding.retry')} onClick={() => void branding.refetch()} />
        )}
      </div>
    );
  }

  const refusal = refusalFrom(save.error);
  const conflict = save.error instanceof ApiError && save.error.status === 409;
  const forbidden = save.error instanceof ApiError && save.error.status === 403;

  const fieldError =
    save.error instanceof ApiError
      ? save.error.problem.errors?.['brandColor']?.[0]
      : undefined;

  return (
    <div className={styles.page}>
      <SettingsNav />

      <h1 className={styles.title}>{t('branding.title')}</h1>
      <p className={styles.subtitle}>{t('branding.body')}</p>

      {conflict ? (
        <div className={styles.notice} role="alert">
          <p>{t('branding.conflict')}</p>
          <Button
            text={t('branding.reload')}
            buttonType="secondary-outline"
            onClick={() => void branding.refetch()}
          />
        </div>
      ) : null}

      {forbidden ? (
        <p className={styles.error} role="alert">
          {t('branding.forbidden')}
        </p>
      ) : null}

      {save.isError && !conflict && !forbidden && refusal === null && fieldError === undefined ? (
        <p className={styles.error} role="alert">
          {t('branding.failed')}
        </p>
      ) : null}

      <fieldset className={styles.group}>
        <legend className={styles.legend}>{t('branding.colorGroup')}</legend>

        <div className={styles.colorRow}>
          {/* THE HEX FIELD IS PRIMARY AND THE SWATCH IS SECONDARY (AC-22). A
              tenant has a hex value from a brand document, not a mouse gesture,
              and a native colour input alone is unusable by keyboard for anyone
              who needs an exact value.

              `dir="ltr"`: a hex colour is an identifier, not language content,
              and reversing it in Arabic makes the one thing a reader does with
              it — check it against their brand book — impossible. */}
          <Input
            label={t('branding.colorLabel')}
            value={color}
            onChange={(next) => {
              setColor(next);

            }}
            helperText={t('branding.colorHelp')}
            {...(fieldError === undefined ? {} : { error: fieldError })}
            dir="ltr"
            required
          />

          <label className={styles.swatch}>
            <span className={styles.swatchLabel}>{t('branding.colorPicker')}</span>
            <input
              type="color"
              className={styles.swatchInput}
              value={/^#[0-9A-Fa-f]{6}$/.test(color.trim()) ? color.trim() : '#000000'}
              onChange={(event) => {
                setColor(event.target.value.toUpperCase());

              }}
            />
          </label>
        </div>
      </fieldset>

      {/* THE REFUSAL, ANNOUNCED AND NOT ONLY COLOURED (AC-21). `aria-live`
          polite, the server's own sentence as text, and the ratios rendered
          client-side in the active locale — the server sends numbers precisely
          so this can happen here (BR-8.7). */}
      <div className={styles.verdict} aria-live="polite">
        {refusal === null ? null : (
          <div className={styles.refusal}>
            <p className={styles.refusalTitle}>{t('branding.verdictHeading')}</p>
            <p>{t(`branding.refusedBy.${refusal.refusedBy}`)}</p>

            <dl className={styles.ratios}>
              <div>
                <dt>{t('branding.measuredText')}</dt>
                <dd>
                  <span dir="ltr">
                    {t('branding.ratio', {
                      value: formatNumber(refusal.bestContrastRatio, lang),
                    })}
                  </span>{' '}
                  <span className={styles.needed} dir="ltr">
                    {t('branding.ratioNeeded', {
                      value: formatNumber(refusal.requiredContrastRatio, lang),
                    })}
                  </span>
                </dd>
              </div>
              <div>
                <dt>{t('branding.measuredSurface')}</dt>
                <dd>
                  <span dir="ltr">
                    {t('branding.ratio', {
                      value: formatNumber(refusal.surfaceContrastRatio, lang),
                    })}
                  </span>{' '}
                  <span className={styles.needed} dir="ltr">
                    {t('branding.ratioNeeded', {
                      value: formatNumber(
                        refusal.requiredSurfaceContrastRatio,
                        lang,
                      ),
                    })}
                  </span>
                </dd>
              </div>
            </dl>
          </div>
        )}

      </div>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>{t('branding.sidebarGroup')}</legend>

        {SIDEBAR_MODES.map((option) => (
          <label
            key={option}
            className={cx(styles.row, mode === option && styles.rowActive)}
          >
            <input
              type="radio"
              name="sidebarMode"
              className={styles.radio}
              checked={mode === option}
              onChange={() => {
                setMode(option);

              }}
            />
            <span>
              <span className={styles.rowName}>{t(`branding.sidebar.${option}`)}</span>
              <span className={styles.rowHint}>{t(`branding.sidebar.${option}Hint`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {/* AC-20. PERMANENTLY VISIBLE, not a tooltip and not behind a disclosure.
          ADR-012 part 3: enforcement without explanation reads as a missing
          feature, and the first question is "why can't I change these?" */}
      <p className={styles.fixedNotice}>{t('branding.fixedNotice')}</p>

      <div className={styles.actions}>
        <Button
          text={save.isPending ? t('branding.saving') : t('branding.save')}
          loading={save.isPending}
          disabled={save.isPending || color.trim() === ''}
          onClick={() => {

            save.mutate({
              brandColor: color.trim(),
              sidebarMode: mode,
              expectedVersion: branding.data.version,
            });
          }}
        />
      </div>
    </div>
  );
}

/**
 * The four ratios off a refusal, or `null` for any other failure.
 *
 * **Narrow on purpose.** A `400` that is not this `type` is an ordinary
 * validation failure and belongs under the field; only `inaccessible-brand-color`
 * carries the measurements, and reading them off anything else would render
 * `undefined:1`.
 */
function refusalFrom(error: unknown): InaccessibleBrandColorProblem | null {
  if (!(error instanceof ApiError)) return null;
  if (!error.problem.type.endsWith('/inaccessible-brand-color')) return null;

  /* `as unknown as` rather than an index signature on `ProblemDetails`. An index
   * signature would let every screen read any misspelled extension off any
   * problem and get `undefined` — the checks below are what make this one safe,
   * and they run on data that crossed the network. */
  const problem = error.problem as unknown as Partial<InaccessibleBrandColorProblem>;

  if (
    typeof problem.bestContrastRatio !== 'number'
    || typeof problem.surfaceContrastRatio !== 'number'
    || typeof problem.requiredContrastRatio !== 'number'
    || typeof problem.requiredSurfaceContrastRatio !== 'number'
    || (problem.refusedBy !== 'text'
      && problem.refusedBy !== 'hover'
      && problem.refusedBy !== 'surface')
  ) {
    return null;
  }

  return problem as InaccessibleBrandColorProblem;
}
