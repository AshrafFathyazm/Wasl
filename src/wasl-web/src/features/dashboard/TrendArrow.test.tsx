import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import i18n from '../../lib/i18n';
import { TrendArrow } from './TrendArrow';

/*
 * `020b` AC-10, AC-13, AC-14.
 *
 * THE CENTRAL TEST IS `the tone follows the DECLARATION, not the sign`. It renders
 * the same delta twice with `higherIsWorse` flipped and requires the tone to
 * change — which is the only assertion that can tell a declared direction from an
 * inferred one. Everything else here would pass on the banned
 * `delta > 0 ? 'bad' : 'good'`.
 */

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

function mount(props: Partial<Parameters<typeof TrendArrow>[0]> = {}) {
  return render(
    <TrendArrow current={12} previous={9} higherIsWorse unit="count" lang="en" {...props} />,
  );
}

describe('no baseline renders nothing at all', () => {
  it.each([
    ['absent', undefined],
    ['null', null],
  ])('renders nothing when previous is %s', (_label, previous) => {
    /* Ruled Q-2. Not a dash, not a zero, not a grey arrow: for the first fortnight
     * after the capture starts there is no answer, and a UI implying a comparison
     * that does not exist is worse than a tile that looks like today's. */
    const { container } = mount({ previous });

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing rather than treating a missing baseline as zero', () => {
    /* The tempting bug: `previous ?? 0`, which turns "no answer" into "it was zero"
     * and puts a ▲12 under a tile that has never been compared to anything. */
    const { container } = mount({ current: 12, previous: undefined });

    expect(container.textContent).not.toContain('12');
  });
});

describe('AC-13 — the tone follows the declaration, never the sign', () => {
  it('renders the SAME rise as bad or good depending on higherIsWorse', () => {
    /* THIS IS THE ASSERTION THE RULING EXISTS FOR. One delta, two declarations,
     * two tones. A renderer inferring sentiment from the sign cannot pass it. */
    const worse = render(
      <TrendArrow current={12} previous={9} higherIsWorse unit="count" lang="en" />,
    );

    const worseClass = worse.container.firstElementChild?.className ?? '';

    const better = render(
      <TrendArrow current={12} previous={9} higherIsWorse={false} unit="count" lang="en" />,
    );

    const betterClass = better.container.firstElementChild?.className ?? '';

    expect(worseClass).toMatch(/trendWorse/);
    expect(betterClass).toMatch(/trendBetter/);
    expect(worseClass).not.toBe(betterClass);
  });

  it('renders the same FALL both ways too', () => {
    const worse = render(
      <TrendArrow current={9} previous={12} higherIsWorse={false} unit="count" lang="en" />,
    );
    const better = render(
      <TrendArrow current={9} previous={12} higherIsWorse unit="count" lang="en" />,
    );

    expect(worse.container.firstElementChild?.className).toMatch(/trendWorse/);
    expect(better.container.firstElementChild?.className).toMatch(/trendBetter/);
  });

  it('draws the glyph from the SIGN while the tone comes from the declaration', () => {
    /* The two are independent, and conflating them is the defect: a fall in a
     * good-when-lower metric is a DOWN arrow in a POSITIVE tone. */
    const { container } = render(
      <TrendArrow current={9} previous={12} higherIsWorse unit="count" lang="en" />,
    );

    expect(container.textContent).toContain('▼');
    expect(container.firstElementChild?.className).toMatch(/trendBetter/);
  });
});

describe('unchanged is its own state', () => {
  it('says so rather than drawing an arrow of length zero', () => {
    /* "▲ 0 vs prev" reads as a rise that happens to be nothing. */
    mount({ current: 9, previous: 9 });

    expect(screen.getByText('no change vs prev')).toBeInTheDocument();
    expect(screen.queryByText(/▲|▼/)).not.toBeInTheDocument();
  });
});

describe('AC-14 — the age copy claims nothing about the backlog', () => {
  it('says the AGE got older or newer, never that anything improved', () => {
    /* A fall in the oldest-untouched age can mean somebody answered the ticket —
     * or that it was closed and left the set. Both produce the same arrow, so the
     * copy states what the number did and stops there. */
    const fell = render(
      <TrendArrow current={24} previous={48} higherIsWorse unit="hours" lang="en" />,
    );

    expect(fell.container.textContent).toContain('24h newer vs prev');
    expect(fell.container.textContent).not.toMatch(/improv|better|backlog|resolved/i);

    const rose = render(
      <TrendArrow current={48} previous={24} higherIsWorse unit="hours" lang="en" />,
    );

    expect(rose.container.textContent).toContain('24h older vs prev');
    expect(rose.container.textContent).not.toMatch(/worse|failing|behind/i);
  });

  it('renders a count without an hours suffix, and hours with one', () => {
    const count = render(
      <TrendArrow current={12} previous={9} higherIsWorse unit="count" lang="en" />,
    );
    expect(count.container.textContent).toContain('3 vs prev');
    expect(count.container.textContent).not.toContain('h ');

    const hours = render(
      <TrendArrow current={12} previous={9} higherIsWorse unit="hours" lang="en" />,
    );
    expect(hours.container.textContent).toContain('3h older vs prev');
  });
});

describe('the magnitude is absolute and the digits are Latin', () => {
  it('never renders a signed number', () => {
    /* The glyph carries the direction. "▼ -24" states it twice and disagrees with
     * itself the first time somebody changes one of them. */
    const { container } = render(
      <TrendArrow current={9} previous={12} higherIsWorse unit="count" lang="en" />,
    );

    expect(container.textContent).not.toContain('-3');
    expect(container.textContent).toContain('3 vs prev');
  });

  it('keeps Latin digits in Arabic — BR-8.13', async () => {
    await i18n.changeLanguage('ar');

    const { container } = render(
      <TrendArrow current={112} previous={9} higherIsWorse unit="count" lang="ar" />,
    );

    expect(container.textContent).toContain('103');

    await i18n.changeLanguage('en');
  });
});
