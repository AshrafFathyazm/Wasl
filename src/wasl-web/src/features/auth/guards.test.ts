import { describe, expect, it } from 'vitest';

import { DEFAULT_SIGNED_IN_PATH, safeReturnPath } from './guards';

/* ============================================================================
 * `returnUrl` is attacker-influenced input
 * ============================================================================
 *
 * It arrives on the query string of the one page in the product that asks for a
 * password, and it is used as a navigation target. An unchecked value is an open
 * redirect: `?returnUrl=https://evil.example` sends someone who has just signed
 * in straight off the origin, from a link that looks like a normal sign-in link
 * for this application.
 *
 * The protocol-relative forms are the ones that get missed — `//evil.example`
 * passes a "starts with /" check and still leaves the origin. `023` upgraded
 * `react-router-dom` over that same class of defect (GHSA-wrjc-x8rr-h8h6).
 * ============================================================================ */

describe('safeReturnPath rejects anything that could leave the origin', () => {
  it.each([
    ['protocol-relative', '//evil.example/steal'],
    ['protocol-relative, backslash', '/\\evil.example'],
    ['absolute http', 'http://evil.example'],
    ['absolute https', 'https://evil.example'],
    ['scheme-less host', 'evil.example/path'],
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:text/html,<script>'],
  ])('%s → the default, not the value', (_label, hostile) => {
    expect(safeReturnPath(hostile)).toBe(DEFAULT_SIGNED_IN_PATH);
  });

  it('falls back for an absent or empty value', () => {
    expect(safeReturnPath(null)).toBe(DEFAULT_SIGNED_IN_PATH);
    expect(safeReturnPath('')).toBe(DEFAULT_SIGNED_IN_PATH);
  });
});

describe('safeReturnPath keeps a real in-app destination intact', () => {
  it('accepts a plain path', () => {
    expect(safeReturnPath('/tickets')).toBe('/tickets');
  });

  it('keeps the query, so a filtered list survives the round trip', () => {
    /* A `returnUrl` that drops the query lands the user on an unfiltered list
     * wondering where their filters went — which is `015`'s whole screen. */
    expect(safeReturnPath('/tickets?status=Open&page=2')).toBe(
      '/tickets?status=Open&page=2',
    );
  });

  it('keeps a hash', () => {
    expect(safeReturnPath('/tickets/9#history')).toBe('/tickets/9#history');
  });
});
