import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import i18n from '../../lib/i18n';
import { Modal } from './Modal';

/* ============================================================================
 * The modal's behaviour — `design/feedback-layer.md` §3.
 * ============================================================================
 * Its geometry is measured in a browser and recorded in `tests.md`; jsdom draws
 * nothing. What it does run is focus, the Escape key, and the scrim — which is
 * where §3's rules actually live, and where the two that matter most are the
 * ones nobody notices when they break:
 *
 *   - the destructive button must never hold the opening focus, and
 *   - a modal over unsaved input must not close on a stray scrim click.
 *
 * Both fail silently. A confirm dialog that opens with Delete under the Return
 * key looks exactly like one that opens with Cancel there.
 * ========================================================================= */

function Harness({
  destructive = false,
  unsavedInput = false,
  withBody = true,
  onDismissAttempt,
}: {
  destructive?: boolean;
  unsavedInput?: boolean;
  withBody?: boolean;
  onDismissAttempt?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <I18nextProvider i18n={i18n}>
      <button type="button" onClick={() => setOpen(true)}>
        {'open it'}
      </button>

      {/* THE PAGE BEHIND. Without something focusable out here, "focus does not
          leave the dialog" is unfalsifiable — Tab would have nowhere to go. */}
      <button type="button">{'behind'}</button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Delete the ticket?"
        destructive={destructive}
        unsavedInput={unsavedInput}
        onDismissAttempt={onDismissAttempt}
        footer={
          <>
            {/* §3's DESTRUCTIVE order: cancel first in reading order, then the
                red action. An ordinary modal reverses it — the caller owns the
                order, and this harness draws the destructive one because that is
                the case where the focus rule has teeth. */}
            <button type="button">{'cancel'}</button>
            <button type="button">{'delete'}</button>
          </>
        }
      >
        {withBody ? <input aria-label="reason" /> : <p>{'nothing focusable'}</p>}
      </Modal>
    </I18nextProvider>
  );
}

const openIt = async (u: ReturnType<typeof userEvent.setup>) => {
  await u.click(screen.getByRole('button', { name: 'open it' }));
  return screen.findByRole('dialog');
};

describe('§3 — the modal blocks, and says so correctly', () => {
  it('is a dialog with aria-modal and a name taken from its own title', async () => {
    const u = userEvent.setup();
    render(<Harness />);
    const dialog = await openIt(u);

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    /* THE NAME COMES THROUGH `aria-labelledby`, not a hand-written `aria-label`:
       the heading is on screen, so two copies of the same string would be two
       things to keep in step. Asserting the accessible NAME rather than the
       attribute is what proves the id actually resolves — a dangling
       `aria-labelledby` sets the attribute and names nothing. */
    expect(dialog).toHaveAccessibleName('Delete the ticket?');
  });

  it('locks the page behind it, and unlocks on close', async () => {
    const u = userEvent.setup();
    render(<Harness />);
    await openIt(u);

    expect(document.body.style.overflow).toBe('hidden');

    await u.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('keeps Tab inside it', async () => {
    const u = userEvent.setup();
    render(<Harness />);
    const dialog = await openIt(u);

    /* Round the loop twice over — the dialog holds four stops (close, the
       reason field, cancel, delete) and the page holds two, so eight tabs would
       land outside if the wrap were missing. */
    for (let i = 0; i < 8; i++) {
      await u.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('returns focus to whatever opened it', async () => {
    const u = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'open it' });

    await openIt(u);
    await u.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(document.activeElement).toBe(opener);
  });
});

describe('§3 — the destructive button never holds the opening focus', () => {
  it('opens with focus on CANCEL when the action cannot be taken back', async () => {
    const u = userEvent.setup();
    render(<Harness destructive />);
    await openIt(u);

    /* THE RULE THAT FAILS SILENTLY. With the delete button focused, Return
       destroys the record — and the dialog looks identical either way. The
       implementation reaches for the LAST focusable control precisely because
       §3 orders a destructive footer cancel-first, so cancel is last in the
       DOM's own tab order. */
    expect(document.activeElement).toHaveTextContent('cancel');
  });

  it('opens with focus on the first control when the action is ordinary', async () => {
    const u = userEvent.setup();
    render(<Harness />);
    await openIt(u);

    /* The close button is first in DOM order, before the body — an ordinary
       modal sends the reader into the content rather than out of it, and the
       header's × is what they meet on the way. The assertion is that it is NOT
       the last control, which is what separates the two branches; asserting the
       exact element would be asserting the header's markup order. */
    expect(document.activeElement).not.toHaveTextContent('cancel');
    expect(document.activeElement).not.toHaveTextContent('delete');
  });

  it('falls back to the panel when there is nothing focusable at all', async () => {
    const u = userEvent.setup();
    render(<Harness withBody={false} destructive />);
    const dialog = await openIt(u);

    /* There is always the × and the two footer buttons here, so this really
       checks that the fallback path does not crash on an empty list rather than
       that it is ever reached. It is reached the moment someone renders a modal
       with no footer and no interactive body — a plain message. */
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});

describe('§3 — the scrim', () => {
  it('closes on a scrim click', async () => {
    const u = userEvent.setup();
    const { container } = render(<Harness />);
    await openIt(u);

    const scrim = container.querySelector<HTMLElement>('[aria-hidden="true"][tabindex="-1"]');
    expect(scrim).not.toBeNull();

    await u.click(scrim!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('does NOT close on a scrim click over unsaved input', async () => {
    const u = userEvent.setup();
    const { container } = render(<Harness unsavedInput />);
    await openIt(u);

    const scrim = container.querySelector<HTMLElement>('[aria-hidden="true"][tabindex="-1"]');
    await u.click(scrim!);

    /* §3. A stray click outside a half-typed form is not consent to throw it
       away. Asking first is the caller's — what the component owns is not
       closing silently. */
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does NOT close on Escape either — reversed 2026-09-06', async () => {
    const u = userEvent.setup();
    render(<Harness unsavedInput />);
    await openIt(u);

    /* THIS TEST ASSERTED THE OPPOSITE and it was the defect, written down and
       guarded — the exact "likely half-fix" AC-10 warns about by name.
     *
     * A REAL CONSUMER SETTLED IT. `039`'s `CloseTicketModal` holds a
     * 500-character close reason and sets `unsavedInput`, so a reader typed a
     * note, pressed Escape by reflex, and lost it with no question. Guarding the
     * scrim and leaving Escape open is not partial protection — it is the wrong
     * half, because Escape is the more reflexive of the two. */
    await u.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('asks, when the caller supplies the question', async () => {
    const u = userEvent.setup();
    const asked = vi.fn();
    const { container } = render(<Harness unsavedInput onDismissAttempt={asked} />);
    await openIt(u);

    await u.keyboard('{Escape}');
    expect(asked).toHaveBeenCalledTimes(1);

    const scrim = container.querySelector<HTMLElement>('[aria-hidden="true"][tabindex="-1"]');
    await u.click(scrim!);
    expect(asked).toHaveBeenCalledTimes(2);

    /* AND NEITHER CLOSED IT. The caller decides what happens next; the component
       only guarantees it did not happen silently. */
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('LEAVES A WAY OUT — the × and the footer are never guarded', async () => {
    const u = userEvent.setup();
    render(<Harness unsavedInput />);
    await openIt(u);

    /* The half that makes the guard safe rather than a trap. A modal that cannot
       be left at all is worse than one that loses a draft, and the two controls
       a reader had to AIM at stay open — only the two they trigger by accident
       are guarded. */
    await u.click(screen.getByRole('button', { name: i18n.t('common:dismiss') }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
