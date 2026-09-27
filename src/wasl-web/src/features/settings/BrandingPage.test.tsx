import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../lib/api';
import type { BrandingResponse } from '../../lib/api-types.provisional';
import i18n from '../../lib/i18n';
import { THEME_CACHE_KEY } from '../../lib/theme';
import { SESSION_STORAGE_KEY } from '../../lib/tokenStorage';
import { ToastProvider } from '../../components/Toast/ToastHost';
import { AuthProvider } from '../auth/AuthContext';

/* ============================================================================
 * /settings/branding — `022`
 * ========================================================================= */

vi.mock('./branding.api', async () => {
  const actual = await vi.importActual<typeof import('./branding.api')>('./branding.api');
  return { ...actual, getBranding: vi.fn(), updateBranding: vi.fn() };
});

const { getBranding, updateBranding } = await import('./branding.api');
const { default: BrandingPage } = await import('./BrandingPage');

const BRANDING: BrandingResponse = {
  brandColor: '#1D174D',
  onBrand: '#FFFFFF',
  sidebarMode: 'Light',
  updatedAtUtc: '2026-09-27T00:00:00Z',
  version: 'AAAAAAAAB9E=',
};

function problem(
  type: string,
  status: number,
  extras: Record<string, unknown> = {},
): ApiError {
  return new ApiError(
    {
      type: `https://wasl.local/${type}`,
      title: 'Refused',
      status,
      ...extras,
    } as never,
    'en',
  );
}

const mounted = () => {
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      accessToken: 'test-token',
      tokenType: 'Bearer',
      expiresAtUtc: new Date(Date.now() + 3_600_000).toISOString(),
      user: {
        id: '01a0452e-3cf5-765a-a947-1b32c47e38b4',
        fullName: 'Support Manager',
        email: 'manager@wasl.local',
        role: 'Manager',
        preferredLanguage: 'en',
      },
    }),
  );

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/settings/branding']}>
          <AuthProvider>
            <ToastProvider>
              <BrandingPage />
            </ToastProvider>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
};

beforeEach(async () => {
  localStorage.clear();
  vi.mocked(getBranding).mockReset().mockResolvedValue(BRANDING);
  vi.mocked(updateBranding).mockReset();
  await i18n.changeLanguage('en');
});

describe('the form reflects what the server stored', () => {
  it('seeds the hex field from the read', async () => {
    mounted();

    expect(await screen.findByDisplayValue('#1D174D')).toBeInTheDocument();
  });

  /* AC-20. PERMANENTLY VISIBLE — present in the DOM with no interaction, not a
   * tooltip and not behind a disclosure. ADR-012 part 3: enforcement without
   * explanation reads as a missing feature. */
  it('states that status colours are fixed, with no interaction', async () => {
    mounted();

    const notice = await screen.findByText(/Status and priority colours are fixed/);

    expect(notice).toBeVisible();
  });

  /* AC-22. The hex field is keyboard-operable and is never the only way in — but
   * it IS the primary one, because a tenant has a hex value, not a gesture. */
  it('offers the colour as text, not only as a swatch', async () => {
    mounted();

    const field = await screen.findByLabelText('Hex value');

    await userEvent.clear(field);
    await userEvent.type(field, '#1570EF');

    expect(field).toHaveValue('#1570EF');
  });
});

describe('the refusal is explained, not just reported', () => {
  /* AC-21 AND AC-8. The screen renders the server's sentence AND the measured
   * ratios — which arrive as NUMBERS precisely so the client can format them in
   * the active locale. A server-composed "4.02:1, needs 4.5:1" would be a
   * formatted number inside a translated string. */
  it('renders the gate that refused and every ratio', async () => {
    vi.mocked(updateBranding).mockRejectedValue(
      problem('errors/inaccessible-brand-color', 400, {
        refusedBy: 'text',
        bestContrastRatio: 4.02,
        requiredContrastRatio: 4.5,
        surfaceContrastRatio: 3.95,
        requiredSurfaceContrastRatio: 3,
      }),
    );

    mounted();
    await screen.findByDisplayValue('#1D174D');
    await userEvent.click(screen.getByRole('button', { name: 'Save branding' }));

    expect(await screen.findByText('This colour cannot be used')).toBeInTheDocument();
    expect(screen.getByText('No text colour is readable on it.')).toBeInTheDocument();
    expect(screen.getByText('4.02:1')).toBeInTheDocument();
    expect(screen.getByText('needs 4.5:1')).toBeInTheDocument();
    expect(screen.getByText('3.95:1')).toBeInTheDocument();
  });

  /* THE REGION IS ANNOUNCED WITHOUT MOVING FOCUS (AC-21). A refusal that only
   * changed colour would be invisible to a screen reader, and one that stole
   * focus would throw away the reader's place in the form. */
  it('announces the refusal politely', async () => {
    vi.mocked(updateBranding).mockRejectedValue(
      problem('errors/inaccessible-brand-color', 400, {
        refusedBy: 'surface',
        bestContrastRatio: 14.22,
        requiredContrastRatio: 4.5,
        surfaceContrastRatio: 1.12,
        requiredSurfaceContrastRatio: 3,
      }),
    );

    const { container } = mounted();
    await screen.findByDisplayValue('#1D174D');
    await userEvent.click(screen.getByRole('button', { name: 'Save branding' }));

    await screen.findByText('It is too close to the page background.');

    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live?.textContent).toContain('1.12:1');
  });

  /* A DIFFERENT `400` MUST NOT BE READ AS A REFUSAL. Reading the ratios off an
   * ordinary validation failure would render `undefined:1` — which is why
   * `refusalFrom` checks the `type` AND every field before trusting any of it. */
  it('does not render ratios for an ordinary validation failure', async () => {
    vi.mocked(updateBranding).mockRejectedValue(
      problem('errors/validation', 400, {
        errors: { brandColor: ['Provide a colour as six hexadecimal digits.'] },
      }),
    );

    mounted();
    await screen.findByDisplayValue('#1D174D');
    await userEvent.click(screen.getByRole('button', { name: 'Save branding' }));

    expect(
      await screen.findByText('Provide a colour as six hexadecimal digits.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('This colour cannot be used')).toBeNull();
    expect(screen.queryByText(/undefined/)).toBeNull();
  });
});

describe('the conflict path refetches rather than retrying blind', () => {
  it('offers a reload on a 409 (ADR-006)', async () => {
    vi.mocked(updateBranding).mockRejectedValue(
      problem('errors/concurrency-conflict', 409),
    );

    mounted();
    await screen.findByDisplayValue('#1D174D');
    await userEvent.click(screen.getByRole('button', { name: 'Save branding' }));

    expect(await screen.findByText(/changed the branding while this page was open/))
      .toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));

    await waitFor(() => {
      expect(vi.mocked(getBranding)).toHaveBeenCalledTimes(2);
    });
  });
});

describe('a successful save retints and caches', () => {
  /* AC-18's OTHER HALF. The save applies the theme immediately — the person
   * choosing a colour has to see it — and caches it so the NEXT load paints it
   * before first paint rather than flashing the default. */
  it('applies the theme and stores it for the next load', async () => {
    const saved: BrandingResponse = {
      ...BRANDING,
      brandColor: '#1570EF',
      sidebarMode: 'Brand',
      version: 'AAAAAAAAB9M=',
    };

    vi.mocked(updateBranding).mockResolvedValue(saved);

    mounted();
    await screen.findByDisplayValue('#1D174D');
    await userEvent.click(screen.getByRole('button', { name: 'Save branding' }));

    /* THE CONFIRMATION IS THE TOAST, and it is the only one. An inline line
       saying the same sentence shipped first and this test found it by matching
       two elements — which is the right failure: two acknowledgements of one
       action is a screen telling the reader the same thing twice. */
    const toasts = await screen.findAllByText('Branding saved.');
    expect(toasts).toHaveLength(1);

    expect(document.documentElement.style.getPropertyValue('--brand')).toBe('#1570EF');
    expect(document.documentElement.dataset['sidebarMode']).toBe('brand');
    expect(JSON.parse(localStorage.getItem(THEME_CACHE_KEY) ?? '{}')).toMatchObject({
      brandColor: '#1570EF',
      sidebarMode: 'Brand',
    });
  });

  /* THE VERSION FROM THE LAST READ IS SENT, NEVER OMITTED AND NEVER GUESSED. */
  it('sends the expectedVersion it was given', async () => {
    vi.mocked(updateBranding).mockResolvedValue(BRANDING);

    mounted();
    await screen.findByDisplayValue('#1D174D');
    await userEvent.click(screen.getByRole('button', { name: 'Save branding' }));

    await waitFor(() => {
      expect(vi.mocked(updateBranding)).toHaveBeenCalledWith(
        expect.objectContaining({ expectedVersion: 'AAAAAAAAB9E=' }),
      );
    });
  });

  /* THE SIDEBAR MODE GOES OUT AS THE ENUM IDENTIFIER, never a translated label.
   * `light` is a `400`, and a client that sent its own label would discover that
   * only in production, in Arabic. */
  it('sends the mode as the wire value, not the label', async () => {
    vi.mocked(updateBranding).mockResolvedValue(BRANDING);

    mounted();
    await screen.findByDisplayValue('#1D174D');
    await userEvent.click(screen.getByRole('radio', { name: /Dark/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save branding' }));

    await waitFor(() => {
      expect(vi.mocked(updateBranding)).toHaveBeenCalledWith(
        expect.objectContaining({ sidebarMode: 'Dark' }),
      );
    });
  });
});

describe('the forbidden state', () => {
  /* ADR-011 §5 — a `403` is information, handled inline. No form is rendered, so
   * no request can be made from it. */
  it('renders inline with no form when the read is refused', async () => {
    vi.mocked(getBranding).mockRejectedValue(problem('errors/forbidden', 403));

    mounted();

    expect(await screen.findByText('Only a manager can change the branding.'))
      .toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save branding' })).toBeNull();
  });
});
