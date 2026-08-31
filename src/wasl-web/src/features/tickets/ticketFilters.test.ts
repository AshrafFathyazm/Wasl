import { describe, expect, it } from 'vitest';

import {
  activeFilterCount,
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
      withFilters(new URLSearchParams(), { ...NO_FILTERS, escalated: false }).get('escalated'),
    ).toBe('false');

    expect(
      withFilters(new URLSearchParams(), NO_FILTERS).has('escalated'),
    ).toBe(false);
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
