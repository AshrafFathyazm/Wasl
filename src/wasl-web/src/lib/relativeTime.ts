import type { TFunction } from 'i18next';

import { formatDate, formatNumber, type Lang } from './formatters';

/* ============================================================================
 * relativeTime.ts — `040` item 2
 * ============================================================================
 * "11h", "2d" — ONE unit, the largest that fits. This is the single place the
 * copy for a relative age is decided: it reuses the unabbreviated-in-Arabic
 * `duration.*` keys in the `dashboard` namespace (ruled 2026-10-15), so
 * changing the wording is one catalogue edit and no call site moves.
 *
 * FOLLOW-UP under Q-8: the Arabic copy for these keys has not been reviewed.
 *
 * Older than 30 days the age stops being useful and the absolute date takes
 * over — "412d" is a calculation the reader should not have to do.
 * ========================================================================= */

export type AgeUnit = 'days' | 'hours' | 'minutes';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The largest whole unit, or `null` past 30 days. Under a minute is `1 minute`:
 *  "0m" would claim the ticket predates its own creation. */
export function relativeAgeParts(
  iso: string,
  nowMs: number,
): { unit: AgeUnit; value: number } | null {
  const elapsed = Math.max(0, nowMs - new Date(iso).getTime());
  if (elapsed >= 30 * DAY) return null;
  if (elapsed >= DAY) return { unit: 'days', value: Math.floor(elapsed / DAY) };
  if (elapsed >= HOUR) return { unit: 'hours', value: Math.floor(elapsed / HOUR) };
  return { unit: 'minutes', value: Math.max(1, Math.floor(elapsed / MINUTE)) };
}

export function formatRelativeAge(
  iso: string,
  nowMs: number,
  lang: Lang,
  t: TFunction,
): string {
  const parts = relativeAgeParts(iso, nowMs);
  if (parts === null) return formatDate(iso, lang);
  return t(`duration.${parts.unit}`, {
    ns: 'dashboard',
    count: parts.value,
    formatted: formatNumber(parts.value, lang),
  });
}
