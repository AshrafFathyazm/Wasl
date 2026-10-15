import { describe, expect, it } from 'vitest';

import { relativeAgeParts } from './relativeTime';

const NOW = Date.parse('2026-10-15T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('relativeAgeParts', () => {
  it('uses the largest whole unit', () => {
    expect(relativeAgeParts(ago(11 * 3_600_000 + 5 * 60_000), NOW)).toEqual({ unit: 'hours', value: 11 });
    expect(relativeAgeParts(ago(2 * 86_400_000 + 3_600_000), NOW)).toEqual({ unit: 'days', value: 2 });
    expect(relativeAgeParts(ago(7 * 60_000), NOW)).toEqual({ unit: 'minutes', value: 7 });
  });
  it('never says zero minutes', () => {
    expect(relativeAgeParts(ago(5_000), NOW)).toEqual({ unit: 'minutes', value: 1 });
    expect(relativeAgeParts(ago(-5_000), NOW)).toEqual({ unit: 'minutes', value: 1 });
  });
  it('hands over to the absolute date after 30 days', () => {
    expect(relativeAgeParts(ago(29 * 86_400_000), NOW)).toEqual({ unit: 'days', value: 29 });
    expect(relativeAgeParts(ago(30 * 86_400_000), NOW)).toBeNull();
  });
});
