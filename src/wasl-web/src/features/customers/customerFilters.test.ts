import { describe, expect, it } from 'vitest';

import { createdRangeIsInverted, readCustomerFilters } from './customerFilters';

/* The directory's URL reader. `033` shipped this module covered only through
 * `CustomersListPage.test.tsx` — a page test cannot say which of a dozen
 * parameters was misread, and a parameter read wrongly shows the wrong list
 * with no error anywhere. */

const read = (search: string) => readCustomerFilters(new URLSearchParams(search));

/* ============================================================================
 * AN INVERTED CREATED RANGE NEVER LEAVES THE URL
 * ============================================================================
 * Each bound survives validation on its own, so nothing here rejected the PAIR
 * — and the endpoint refuses it: `400`, `errors.createdTo`. That refusal is
 * right, and it must not reach a reader, because it arrives as an error pane
 * over a list that was working.
 *
 * Measured 2026-09-03, Arabic, before this existed:
 *   /tickets?createdFrom=2026-09-01&createdTo=2026-08-01
 *     -> 400, and the screen read «تعذّر تحميل القائمة · راجع خاصية errors
 *        للاطّلاع على رسائل الحقول» — the server's DEVELOPER-facing detail.
 *   /customers?createdFrom=2026-09-01&createdTo=2026-08-01
 *     -> 200 totalCount 0, and the screen read «لا عميل يطابق هذا» — a false
 *        claim about the data. The server answers 400 there too now.
 *
 * Dropping BOTH bounds is the policy this module already states for every other
 * unreadable value: the link degrades to a wider list. Keeping one would filter
 * by a bound the reader never chose.
 * ========================================================================= */

describe('an inverted created range never leaves the URL', () => {
  it('drops BOTH created bounds when the range is inverted', () => {
    const state = read('createdFrom=2026-09-01&createdTo=2026-08-01');
    expect(state.createdFrom).toBe('');
    expect(state.createdTo).toBe('');
  });

  it('keeps a range that runs forwards', () => {
    const state = read('createdFrom=2026-08-01&createdTo=2026-09-01');
    expect(state.createdFrom).toBe('2026-08-01');
    expect(state.createdTo).toBe('2026-09-01');
  });

  it('keeps a single-day window — the control against a `to <= from` rule', () => {
    /* Without this, writing the check as `<=` would pass the test above while
       silently deleting every one-day filter in the product. */
    const state = read('createdFrom=2026-08-15&createdTo=2026-08-15');
    expect(state.createdFrom).toBe('2026-08-15');
    expect(state.createdTo).toBe('2026-08-15');
  });

  it('keeps a lone bound, which cannot be inverted', () => {
    expect(read('createdTo=2026-08-01').createdTo).toBe('2026-08-01');
    expect(read('createdFrom=2026-09-01').createdFrom).toBe('2026-09-01');
  });

  it('leaves the rest of the URL alone when it drops the pair', () => {
    /* The pair is dropped, not the query — a reader who followed a stale link
       still gets the list they were pointed at, just unwindowed. */
    const state = read('search=acme&createdFrom=2026-09-01&createdTo=2026-08-01');
    expect(state.search).toBe('acme');
    expect(state.createdFrom).toBe('');
  });

  it('reports an inverted DRAFT so a panel can refuse to apply it', () => {
    expect(createdRangeIsInverted('2026-09-01', '2026-08-01')).toBe(true);
    expect(createdRangeIsInverted('2026-08-01', '2026-09-01')).toBe(false);
    expect(createdRangeIsInverted('2026-08-15', '2026-08-15')).toBe(false);

    /* An INCOMPLETE draft is not inverted — the reader is mid-way through it,
       and disabling «تطبيق» after one date would refuse a legitimate open
       range. */
    expect(createdRangeIsInverted('', '2026-08-01')).toBe(false);
    expect(createdRangeIsInverted('2026-09-01', '')).toBe(false);
    expect(createdRangeIsInverted('', '')).toBe(false);
  });
});
