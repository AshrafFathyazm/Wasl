import { apiFetch } from '../../lib/api';
import type {
  BrandingResponse,
  UpdateBrandingRequest,
} from '../../lib/api-types.provisional';

/* ============================================================================
 * branding.api.ts — `022`
 * ============================================================================
 * Thin, like every other fetcher here: build a path, call the wrapper, return
 * the body. `lib/api.ts` throws a typed `ApiError` and the ROUTE decides what
 * each status means on this screen.
 * ========================================================================= */

const BRANDING_PATH = '/api/settings/branding';

/** `GET /api/settings/branding`. Any authenticated support user. */
export function getBranding(signal?: AbortSignal): Promise<BrandingResponse> {
  return apiFetch<BrandingResponse>(BRANDING_PATH, {
    ...(signal ? { signal } : {}),
  });
}

/**
 * `PUT /api/settings/branding`. Manager only.
 *
 * `expectedVersion` is required and comes from the last read. A mismatch is a
 * `409` and the screen refetches — it never retries blind (ADR-006).
 */
export function updateBranding(
  body: UpdateBrandingRequest,
  signal?: AbortSignal,
): Promise<BrandingResponse> {
  return apiFetch<BrandingResponse>(BRANDING_PATH, {
    method: 'PUT',
    body,
    ...(signal ? { signal } : {}),
  });
}

/** The query keys for this feature. */
export const brandingKeys = {
  all: ['branding'] as const,
  detail: () => ['branding', 'detail'] as const,
};
