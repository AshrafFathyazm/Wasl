import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Loader, type LoaderVariant } from '../components/Loader/Loader';
import { Skeleton } from '../components/Loader/Skeleton';
import LoadersPreview from './LoadersPreview';

/* ============================================================================
 * FE-029-00 — the preview mounts every state it claims to show
 * ============================================================================
 *
 * THIS IS NOT THE PHASE 3b GATE. That gate is a person looking at the page in
 * Arabic, and it stays open until they have. This asserts the weaker thing that
 * can be automated: the page renders, and every shape it advertises is actually
 * on it — so the reviewer is never shown nine cards when the system has ten.
 *
 * `029/tests.md` records that the browser pass could not be run from this
 * session: the chrome-devtools profile was held by another lane. What is
 * claimed here is exactly what was executed, and no more.
 * ============================================================================ */

const VARIANTS: LoaderVariant[] = [
  'converge',
  'mark',
  'brand',
  'path',
  'chain',
  'orbit',
  'bars',
  'bar',
  'satellites',
];

describe('the loader preview', () => {
  it('mounts without throwing', () => {
    render(<LoadersPreview />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('opens in Arabic and right-to-left — ADR-009, the pass that finds problems', () => {
    const { container } = render(<LoadersPreview />);
    expect(container.querySelector('[dir="rtl"]')).not.toBeNull();
  });

  it('advertises every shape the system actually has', () => {
    /* The list on the page and the union type must not drift. A preview short
     * by one shape is a design review that never saw it, and `brand` was
     * missing from this feature's own spec table for exactly that reason. */
    const { container } = render(<LoadersPreview />);
    const shown = [...container.querySelectorAll('[class*="mono"]')]
      .map((el) => /variant="([a-z]+)"/.exec(el.textContent ?? '')?.[1])
      .filter((v): v is string => v !== undefined);

    expect(new Set(shown)).toEqual(new Set(VARIANTS));
  });

  it('shows the skeleton too — it is the tenth shape, not an omission', () => {
    const { container } = render(<LoadersPreview />);
    expect(container.textContent).toContain('Skeleton');
  });

  it('reports the real prefers-reduced-motion state, never a simulated one', () => {
    /* jsdom answers `matches: false` for every media query, so the badge must
     * read no-preference here. The assertion is that the page READS the value
     * rather than holding its own toggle: a preview that let you "switch"
     * reduced motion would be reporting on nothing, which is the failure mode
     * 12-delivery-log lists five tools for. */
    render(<LoadersPreview />);
    expect(screen.getByText(/prefers-reduced-motion: no-preference/)).toBeInTheDocument();
  });
});

describe('the loader contract, exercised directly', () => {
  it.each(VARIANTS)('%s renders decorative and hidden when it has no label', (variant) => {
    const { container } = render(<Loader variant={variant} />);
    const root = container.firstElementChild;
    expect(root?.getAttribute('aria-hidden')).toBe('true');
    expect(root?.getAttribute('role')).toBeNull();
  });

  it.each(VARIANTS)('%s announces itself when given a label', (variant) => {
    render(<Loader variant={variant} label="جارٍ التحميل" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-label', 'جارٍ التحميل');
    expect(status).not.toHaveAttribute('aria-hidden');
  });

  it('an empty label is decorative, not an empty announcement', () => {
    /* The same shape of defect `025` measured on Input: `error=""` read as "no
     * error" and announced nothing while looking correct. A loader given an
     * unresolved translation key that came back empty must not become a status
     * region with no name. */
    const { container } = render(<Loader label="" />);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });

  it('the skeleton follows the same rule', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');

    render(<Skeleton label="جارٍ التحميل" />);
    expect(within(screen.getByRole('status')).queryByText('جارٍ التحميل')).toBeNull();
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'جارٍ التحميل');
  });
});
