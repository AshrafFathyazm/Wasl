import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import i18n from '../../lib/i18n';
import type { TicketPriority, TicketStatus } from '../../lib/api-types.provisional';
import { STATUS_TONE_MAP, TicketPriorityText, TicketStatusBadge } from './TicketBadges';

/*
 * TEST-026-04. Two things, and the second is the one that would ship broken.
 *
 * The map itself is asserted against BR-1 by value, because a colour map is the
 * kind of thing that gets "tidied" — and the tidy that was actually proposed,
 * twice, was giving New and Open the same blue.
 *
 * Then: switching language must change the LABEL and nothing else. Keying a
 * tone on displayed text renders every badge neutral for an Arabic user, and it
 * fails silently — no exception, no test failure, no visible error in English.
 */

const ALL_STATUSES: TicketStatus[] = [
  'New',
  'Open',
  'InProgress',
  'PendingCustomer',
  'Resolved',
  'Closed',
];

describe('BR-1 — the status colour map, by value', () => {
  it('gives New and Open DIFFERENT tones', () => {
    /* Ruled 2026-08-29. The supplied design painted both the same blue and was
     * overruled: two distinct states in the state machine must not read as one
     * appearance. This is the assertion that stops it being re-adopted. */
    expect(STATUS_TONE_MAP.New[0]).not.toBe(STATUS_TONE_MAP.Open[0]);
    expect(STATUS_TONE_MAP.New).toEqual(['neutral', 'filled']);
    expect(STATUS_TONE_MAP.Open).toEqual(['info', 'filled']);
  });

  it('never uses danger — red is a severity, not a state', () => {
    /* BR-1: red on a ticket always means "needs attention now", never "this
     * ended badly". A closed thing is neutral. */
    for (const s of ALL_STATUSES) {
      expect(STATUS_TONE_MAP[s][0], s).not.toBe('danger');
    }
  });

  it('is filled throughout — there is no outline treatment', () => {
    for (const s of ALL_STATUSES) {
      expect(STATUS_TONE_MAP[s][1], s).toBe('filled');
    }
  });

  it('covers every status the contract declares, and nothing else', () => {
    expect(Object.keys(STATUS_TONE_MAP).sort()).toEqual([...ALL_STATUSES].sort());
  });
});

describe('AC-026-12 — language changes the label and nothing else', () => {
  it.each(ALL_STATUSES)('renders %s with the same tone in ar and en', async (status) => {
    await i18n.changeLanguage('en');
    const { container: en, unmount } = render(<TicketStatusBadge status={status} />);
    const enClass = en.firstElementChild!.className;
    const enText = en.textContent;
    unmount();

    await i18n.changeLanguage('ar');
    const { container: ar } = render(<TicketStatusBadge status={status} />);

    /* Same classes — the tone came from the wire value, not from the text. */
    expect(ar.firstElementChild!.className).toBe(enClass);
    /* Different text — otherwise the catalogue is not wired at all and the
     * assertion above passes for the wrong reason. */
    expect(ar.textContent).not.toBe(enText);

    await i18n.changeLanguage('en');
  });
});

describe('priority is coloured text, and only where it demands action', () => {
  it.each<[TicketPriority, boolean]>([
    ['Low', false],
    ['Normal', false],
    ['High', true],
    ['Critical', true],
  ])('%s carries a colour modifier: %s', (priority, coloured) => {
    const { container } = render(<TicketPriorityText priority={priority} />);
    const cls = container.firstElementChild!.className;
    expect(cls.includes('priority-'), priority).toBe(coloured);
  });

  it('is the one place red is allowed on a ticket row', () => {
    const { container } = render(<TicketPriorityText priority="Critical" />);
    expect(container.firstElementChild!.className).toContain('priority-critical');
  });

  it('renders a translated label, not the wire value', async () => {
    await i18n.changeLanguage('ar');
    render(<TicketPriorityText priority="High" />);
    expect(screen.getByText('مرتفعة')).toBeInTheDocument();
    await i18n.changeLanguage('en');
  });
});
