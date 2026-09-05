import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import i18n from '../../lib/i18n';
import { SideSheet } from './SideSheet';

/* ============================================================================
 * The side sheet's keyboard behaviour — `035` §4.3
 * ============================================================================
 * THIS IS THE ONE PART OF THE SHEET jsdom CAN ACTUALLY JUDGE. It draws no boxes,
 * so the panel's width, its edge and its scrolling are measured in a browser and
 * recorded in `tests.md`. But it does run focus, and focus is where the sheet's
 * real defects were: `aria-modal="true"` tells a screen reader the rest of the
 * document is inert and does NOTHING about the Tab key, so a reader could tab
 * out of a sheet into a form they could not see behind the scrim.
 *
 * ALL OF THAT IS THE BLOCKING VARIANT, and it is only one of two now.
 * `feedback-layer.md` §4 makes the scrim conditional, and the three behaviours
 * this file tests — the lock, the trap, `aria-modal` — go with it. So the
 * harness defaults to `scrim` and the tests below keep measuring the sheet that
 * blocks; the second describe measures the one that does not, where every one of
 * those three assertions INVERTS. The default in the component is the opposite
 * of the default here, deliberately: the common case ships without a scrim, and
 * the case with the interesting keyboard behaviour is the rarer one.
 * ========================================================================= */

function Harness({
  withFields = true,
  scrim = true,
}: {
  withFields?: boolean;
  scrim?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <I18nextProvider i18n={i18n}>
      <button type="button" onClick={() => setOpen(true)}>
        {'open the sheet'}
      </button>

      {/* THE PAGE BEHIND IT. Without something focusable out here, "focus does
          not leave the panel" is unfalsifiable — Tab would have nowhere to go
          and the test would pass on an empty document. */}
      <button type="button">{'behind the scrim'}</button>

      <SideSheet
        scrim={scrim}
        open={open}
        onClose={() => setOpen(false)}
        label="the sheet"
        badge={<span>{'+'}</span>}
        title="the sheet"
      >
        {withFields ? (
          <>
            <input aria-label="first" />
            <input aria-label="second" />
          </>
        ) : (
          <p>{'nothing focusable'}</p>
        )}
      </SideSheet>
    </I18nextProvider>
  );
}

const openIt = async (u: ReturnType<typeof userEvent.setup>) => {
  await u.click(screen.getByRole('button', { name: 'open the sheet' }));
  return screen.findByRole('dialog');
};

describe('the side sheet keeps the keyboard inside it', () => {
  it('moves focus to the first focusable thing, not to the panel', async () => {
    /* The panel itself is the fallback, not the target: announcing the sheet and
       then making the reader Tab into it is a step nobody needs. */
    const u = userEvent.setup();
    render(<Harness />);
    await openIt(u);

    expect(screen.getByLabelText('first')).toHaveFocus();
  });

  it('falls back to the panel when there is nothing to focus', async () => {
    const u = userEvent.setup();
    render(<Harness withFields={false} />);
    const sheet = await openIt(u);

    /* The × is a button, so a sheet is never truly empty — but the branch has to
       exist, and this asserts focus is INSIDE the panel either way. */
    expect(sheet.contains(document.activeElement)).toBe(true);
  });

  it('wraps Tab at the end instead of leaving the panel', async () => {
    const u = userEvent.setup();
    render(<Harness />);
    const sheet = await openIt(u);

    /* CHECKED AFTER EVERY PRESS, not once at the end — and a control is what
       forced that. Asserting only the final position passed with the trap
       DETACHED: six presses walk out of the panel, around the rest of the
       document and back in, so focus was inside again by coincidence. The
       claim is that it never leaves. */
    for (let i = 0; i < 6; i += 1) {
      await u.tab();
      expect(sheet.contains(document.activeElement), `after Tab #${i + 1}`).toBe(true);
    }
  });

  it('wraps Shift+Tab at the start, in the other direction', async () => {
    const u = userEvent.setup();
    render(<Harness />);
    const sheet = await openIt(u);

    for (let i = 0; i < 6; i += 1) {
      await u.tab({ shift: true });
      expect(sheet.contains(document.activeElement), `after Shift+Tab #${i + 1}`).toBe(
        true,
      );
    }
  });

  it('returns focus to whatever opened it', async () => {
    /* Without this, closing drops focus onto <body> and the reader's next Tab
       starts from the top of the document — the control they came from is
       however many stops away. */
    const u = userEvent.setup();
    render(<Harness />);
    await openIt(u);

    await u.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(screen.getByRole('button', { name: 'open the sheet' })).toHaveFocus();
  });

  it('closes on Escape from anywhere inside', async () => {
    const u = userEvent.setup();
    render(<Harness />);
    await openIt(u);

    await u.click(screen.getByLabelText('second'));
    await u.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('offers ONE close control to the accessibility tree, not two', async () => {
    /* The scrim used to be a labelled button with the same accessible name as
       the ×, sitting OUTSIDE the panel — a duplicate that the focus trap would
       have had to make an exception for. It is a mouse affordance now:
       `aria-hidden`, out of the tab order, still clickable. */
    const u = userEvent.setup();
    render(<Harness />);
    const sheet = await openIt(u);

    const dismissers = screen.getAllByRole('button', { name: i18n.t('common:dismiss') });
    expect(dismissers).toHaveLength(1);
    expect(sheet.contains(dismissers[0]!)).toBe(true);
  });

  it('still closes when the scrim is clicked', async () => {
    /* Hiding it from the accessibility tree must not disable it. */
    const u = userEvent.setup();
    const { container } = render(<Harness />);
    await openIt(u);

    const scrim = container.querySelector<HTMLElement>(
      '[aria-hidden="true"][tabindex="-1"]',
    );
    expect(scrim).not.toBeNull();

    await u.click(scrim!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('locks the page behind it, and unlocks on close', async () => {
    /* Without it the wheel scrolls the list under the scrim, so the row the
       sheet is describing slides away. The RESTORE is the half that breaks
       quietly: a sheet that forgets it leaves the next screen unscrollable. */
    const u = userEvent.setup();
    render(<Harness />);
    await openIt(u);

    expect(document.body.style.overflow).toBe('hidden');

    await u.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});

/* ============================================================================
 * The variant that does NOT block — `feedback-layer.md` §1.4 and §4
 * ============================================================================
 * Every assertion here is the inverse of one above, and that is the point: the
 * `scrim` prop is not a finish, it switches three behaviours that are each a
 * CLAIM ABOUT THE DOCUMENT BEHIND. A profile panel that locked scrolling, caged
 * Tab and announced `aria-modal` would be telling a screen-reader user the list
 * is unreachable while a sighted user goes on clicking it.
 *
 * `035` shipped both of this screen's sheets blocking, so all four of these
 * would have failed against it.
 * ========================================================================= */
describe('the side sheet without a scrim does not block the page', () => {
  it('renders no scrim at all', async () => {
    const u = userEvent.setup();
    const { container } = render(<Harness scrim={false} />);
    await openIt(u);

    /* THE SAME QUERY the blocking test uses to prove the scrim is there, so the
       two cannot drift into measuring different things — and the dialog
       assertion beside it is what stops this passing on a sheet that simply
       failed to open. */
    expect(container.querySelector('[aria-hidden="true"][tabindex="-1"]')).toBeNull();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not lock the page behind it', async () => {
    const u = userEvent.setup();
    render(<Harness scrim={false} />);
    await openIt(u);

    /* The reader opened a profile to compare it against the rows they just
       scanned. Locking the body takes away the one thing this variant is for. */
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('does not claim aria-modal, because the page behind IS reachable', async () => {
    const u = userEvent.setup();
    render(<Harness scrim={false} />);
    const dialog = await openIt(u);

    expect(dialog).not.toHaveAttribute('aria-modal');
  });

  it('lets Tab leave the panel', async () => {
    const u = userEvent.setup();
    render(<Harness scrim={false} />);
    const dialog = await openIt(u);

    /* ASSERTED OVER A WALK, not at a fixed stop — and the first version was the
       fixed stop, which FAILED against correct code. Tab cycles: the panel holds
       three stops (close, then the two fields) and the page holds two, so five
       tabs from the first field lands back INSIDE the panel. It read as "focus
       never left" and it was "focus left and came round again".

       What the blocking variant forbids is focus being outside AT ALL, so the
       inverse to measure is that it gets outside at least once — not where it
       is after some particular count, which is the browser's ordering rather
       than this component's rule. */
    let escaped = false;
    for (let i = 0; i < 5; i++) {
      await u.tab();
      if (!dialog.contains(document.activeElement)) escaped = true;
    }

    expect(escaped).toBe(true);
  });
});
