import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearSessionCulture, currentSessionCulture } from '../../lib/api';
import { SUPPORTED_LANGUAGES } from '../../lib/direction';
import i18n from '../../lib/i18n';

vi.mock('./me.api', () => ({ changeMyLanguage: vi.fn() }));

const { changeMyLanguage } = await import('./me.api');
const { default: LocalizationPage } = await import('./LocalizationPage');

const mounted = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <LocalizationPage />
    </I18nextProvider>,
  );

const row = (name: string) => screen.getByRole('radio', { name });

beforeEach(async () => {
  vi.mocked(changeMyLanguage).mockReset();
  vi.mocked(changeMyLanguage).mockResolvedValue(undefined);
  clearSessionCulture();
  await i18n.changeLanguage('en');
});

describe('FE-014-03 — the language names are never translated', () => {
  it('shows English and العربية in their own script, in both interfaces', async () => {
    mounted();
    expect(row('English')).toBeInTheDocument();
    expect(row('العربية')).toBeInTheDocument();

    await i18n.changeLanguage('ar');
    /* THE WHOLE REASON THE SCREEN EXISTS. Someone who cannot read the current
     * interface has to find their own language — so neither name is ever
     * translated into the other. */
    expect(row('English')).toBeInTheDocument();
    expect(row('العربية')).toBeInTheDocument();
    await i18n.changeLanguage('en');
  });
});

describe('FE-014-04 — no Save button, so the failure path has to be honest', () => {
  it('applies the change and sends it', async () => {
    const u = userEvent.setup();
    mounted();
    await u.click(row('العربية'));
    await waitFor(() => expect(changeMyLanguage).toHaveBeenCalledWith('ar'));
    await waitFor(() => expect(i18n.resolvedLanguage).toBe('ar'));
    await i18n.changeLanguage('en');
  });

  it('REVERTS when the request fails, and says so', async () => {
    const u = userEvent.setup();
    vi.mocked(changeMyLanguage).mockRejectedValue(new Error('nope'));
    mounted();

    await u.click(row('العربية'));

    /* The server did not take the change, so the interface must not claim it
     * did: a reload would silently undo it and look like the setting does not
     * persist. */
    await waitFor(() => expect(i18n.resolvedLanguage).toBe('en'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('sends nothing when the chosen language is already current', async () => {
    const u = userEvent.setup();
    mounted();
    /* Re-selecting the current row would otherwise send a PUT that changes
     * nothing and can still fail — a failure the user could not have caused. */
    await u.click(row('English'));
    expect(changeMyLanguage).not.toHaveBeenCalled();
  });
});

describe('FE-014-10 — the culture override, and its lifetime', () => {
  it('is not set before any change', () => {
    expect(currentSessionCulture()).toBeNull();
  });

  it('is set after a SUCCESSFUL change', async () => {
    const u = userEvent.setup();
    mounted();
    await u.click(row('العربية'));
    /* Without it, the stale `preferred_language` claim outranks
     * Accept-Language and every server-authored sentence keeps arriving in the
     * old language: Arabic labels around an English error. */
    await waitFor(() => expect(currentSessionCulture()).toBe('ar'));
    await i18n.changeLanguage('en');
  });

  it('is NOT set when the change failed', async () => {
    const u = userEvent.setup();
    vi.mocked(changeMyLanguage).mockRejectedValue(new Error('nope'));
    mounted();
    await u.click(row('العربية'));
    await screen.findByRole('alert');
    /* An override for a preference the server rejected would make every
     * subsequent response contradict the stored value. */
    expect(currentSessionCulture()).toBeNull();
  });
});

/*
 * THE ENDPOINT TAKES EXACTLY `en` AND `ar`, AND NOTHING ELSE.
 *
 * Measured against the running server 2026-08-30:
 *
 *   ar     -> 204      ar-SA  -> 400
 *   en     -> 204      AR     -> 400
 *
 * Exact match, case-sensitive. `ar-SA` is rejected on WRITE even though
 * `Accept-Language: ar-SA` resolves to `ar` on READ — the two are not the same
 * question, and a stored preference with no catalogue behind it is a false
 * value, not a fallback.
 *
 * TypeScript already stops this today, because `Language` is the union of
 * `SUPPORTED_LANGUAGES`. The risk this guards is the NEXT change: adding a
 * regional variant to that list for display or for `Accept-Language`, which
 * would compile, render a third row, and `400` on click.
 */
describe('the values this screen can send are the values the endpoint accepts', () => {
  it('offers exactly en and ar', () => {
    expect([...SUPPORTED_LANGUAGES]).toEqual(['en', 'ar']);
  });

  it('renders one row per supported language, and no others', () => {
    mounted();
    expect(screen.getAllByRole('radio')).toHaveLength(SUPPORTED_LANGUAGES.length);
  });

  it('sends the wire value verbatim — never a resolved or lower-cased one', async () => {
    const u = userEvent.setup();
    mounted();
    await u.click(row('العربية'));
    /* `AR` is a 400. So is `ar-SA`. Whatever transformation looks harmless here
     * is a request the server refuses. */
    await waitFor(() => expect(changeMyLanguage).toHaveBeenCalledWith('ar'));
    await i18n.changeLanguage('en');
  });
});
