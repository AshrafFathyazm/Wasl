import { describe, expect, it } from 'vitest';

import {
  activeFilterCount,
  createdRangeIsInverted,
  isFiltering,
  MAX_FILTER_VALUES,
  NO_FILTERS,
  readFilters,
  toListParams,
  withFilters,
} from './ticketFilters';

/* `015` frontend half — the URL is the filter state (AC-14, ADR-011 §2), so
 * these are the tests for the thing that would otherwise fail silently: a
 * parameter read wrongly shows the wrong list and no error anywhere. */

const read = (search: string) => readFilters(new URLSearchParams(search));

describe('reading filters out of the URL', () => {
  it('starts from nothing when the URL is empty', () => {
    expect(read('')).toEqual(NO_FILTERS);
    expect(isFiltering(read(''))).toBe(false);
  });

  it('reads a repeated parameter as several values', () => {
    expect(read('status=New&status=Open').status).toEqual(['New', 'Open']);
  });

  it('normalises case, because the server accepts a case variant and so must a link', () => {
    expect(read('status=open&priority=high').status).toEqual(['Open']);
    expect(read('status=open&priority=high').priority).toEqual(['High']);
  });

  it('collapses a duplicate rather than sending it twice', () => {
    expect(read('status=Open&status=Open').status).toEqual(['Open']);
  });

  /* A URL is user input — hand-edited, pasted, or left over from an older build.
   * The server answers 400 for a value it does not accept, which is right for a
   * client that guessed and wrong to show somebody who followed a stale link. */
  it('drops a value the server would refuse instead of sending it', () => {
    expect(read('status=New&status=Bogus').status).toEqual(['New']);
    expect(read('status=3').status).toEqual([]);
  });

  it('clamps a repeated parameter to the server’s limit', () => {
    const many = Array.from({ length: 40 }, () => 'status=Open').join('&');

    /* Duplicates collapse FIRST, so forty repeats of one value is one value —
     * asserting the clamp needs distinct ones, and there are only six statuses.
     * So the clamp is asserted on the code path with a synthetic list. */
    expect(read(many).status).toEqual(['Open']);
    expect(MAX_FILTER_VALUES).toBe(20);
  });

  describe('?assignee= has three shapes and nothing else', () => {
    it('reads me and unassigned', () => {
      expect(read('assignee=me').assignee).toBe('me');
      expect(read('assignee=UNASSIGNED').assignee).toBe('unassigned');
    });

    it('reads a user id', () => {
      const id = '01a056ba-924d-78d6-80ae-3000a5137118';
      expect(read(`assignee=${id}`).assignee).toBe(id);
    });

    it('drops anything else', () => {
      expect(read('assignee=nobody').assignee).toBe('');
      expect(read('assignee=42').assignee).toBe('');
    });
  });

  /* THE ONE THAT FAILS SILENTLY. Absent means "any" and false means "not
   * escalated". Reading it as a plain boolean makes every unfiltered list a
   * request for non-escalated tickets — invisible until something is escalated,
   * and then it looks like the escalated ones were deleted. */
  describe('?escalated= is three states, not two', () => {
    it('is undefined when absent', () => {
      expect(read('').escalated).toBeUndefined();
    });

    it('is false only when it says false', () => {
      expect(read('escalated=false').escalated).toBe(false);
    });

    it('is true when it says true', () => {
      expect(read('escalated=true').escalated).toBe(true);
    });

    it('is undefined for anything else, rather than defaulting to false', () => {
      expect(read('escalated=1').escalated).toBeUndefined();
      expect(read('escalated=').escalated).toBeUndefined();
    });
  });

  it('trims the search term and treats whitespace as absent', () => {
    expect(read('search=%20%20').search).toBe('');
    expect(read('search=%20abc%20').search).toBe('abc');
  });
});

describe('writing filters back to the URL', () => {
  /* Page 5 of an unfiltered list is rarely page 5 of a filtered one. Keeping the
   * page turns "filter to Open" into an empty table with a pager reading 5 of 2,
   * and the empty table reads as "no matching tickets" — so the filter looks
   * broken rather than the pager. */
  it('drops the page but keeps the page size', () => {
    const next = withFilters(new URLSearchParams('page=5&pageSize=50'), {
      ...NO_FILTERS,
      status: ['Open'],
    });

    expect(next.get('page')).toBeNull();
    expect(next.get('pageSize')).toBe('50');
    expect(next.getAll('status')).toEqual(['Open']);
  });

  it('writes a repeated parameter once per value', () => {
    const next = withFilters(new URLSearchParams(), {
      ...NO_FILTERS,
      status: ['New', 'Open'],
    });

    expect(next.toString()).toBe('status=New&status=Open');
  });

  it('omits an empty filter rather than writing it blank', () => {
    expect(withFilters(new URLSearchParams(), NO_FILTERS).toString()).toBe('');
  });

  it('writes escalated=false but omits it when it is any', () => {
    expect(
      withFilters(new URLSearchParams(), { ...NO_FILTERS, escalated: false }).get(
        'escalated',
      ),
    ).toBe('false');

    expect(withFilters(new URLSearchParams(), NO_FILTERS).has('escalated')).toBe(false);
  });

  it('round-trips — what is written is what is read', () => {
    const filters = {
      status: ['Open', 'Resolved'],
      priority: ['High'],
      category: ['Billing'],
      channel: ['Email'],
      assignee: 'me',
      escalated: true,
      search: 'gulf',
      createdFrom: '',
      createdTo: '',
    };

    expect(readFilters(withFilters(new URLSearchParams(), filters))).toEqual(filters);
  });
});

describe('the request parameters', () => {
  /* ?status= present and empty is a defect magnet: the backend half's first run
   * answered 400 for it, because it binds as an array holding one empty string
   * rather than an empty array. Sending nothing is unambiguous against any
   * server. */
  it('omits every empty filter instead of sending it blank', () => {
    expect(toListParams(NO_FILTERS, 1, 20)).toEqual({ page: 1, pageSize: 20 });
  });

  it('sends escalated=false, which is not the same as sending nothing', () => {
    expect(toListParams({ ...NO_FILTERS, escalated: false }, 1, 20)).toEqual({
      page: 1,
      pageSize: 20,
      escalated: false,
    });
  });
});

describe('counting active filters', () => {
  it('does not count the search term', () => {
    /* The badge on the Filters button counts what the PANEL holds. The search
     * box is beside it with its own clear, so counting it there would say "1"
     * for something the panel cannot show. */
    expect(activeFilterCount({ ...NO_FILTERS, search: 'gulf' })).toBe(0);
    expect(isFiltering({ ...NO_FILTERS, search: 'gulf' })).toBe(true);
  });

  it('counts each value of a repeated filter', () => {
    expect(activeFilterCount({ ...NO_FILTERS, status: ['New', 'Open'] })).toBe(2);
  });

  it('counts escalated=false as an active filter', () => {
    expect(activeFilterCount({ ...NO_FILTERS, escalated: false })).toBe(1);
  });
});

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
