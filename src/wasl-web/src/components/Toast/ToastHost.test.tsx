import { render, screen, act, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '../../lib/i18n';
import { ToastProvider, useToast, type ToastRequest } from './ToastHost';

/* ============================================================================
 * The toast host's rules — `design/feedback-layer.md` §2.
 * ============================================================================
 * THE CARD IS NOT WHAT IS UNDER TEST HERE. Its stripe, its glyph and its layout
 * are drawn things that jsdom cannot judge — no layout, no paint. What jsdom can
 * judge is every rule §2 actually states as behaviour: the timing table, the
 * three-deep stack, the eviction, the de-duplication counter, the role split,
 * and the pause. Those are the things that break silently.
 * ========================================================================= */

function Harness({ requests }: { requests: ToastRequest[] }) {
  const toast = useToast();

  return (
    <>
      {requests.map((request, index) => (
        <button key={index} type="button" onClick={() => toast.show(request)}>
          {`fire ${index}`}
        </button>
      ))}
    </>
  );
}

const mount = (requests: ToastRequest[]) =>
  render(
    <I18nextProvider i18n={i18n}>
      <ToastProvider>
        <Harness requests={requests} />
      </ToastProvider>
    </I18nextProvider>,
  );

/* `fireEvent`, NOT `userEvent`, AND THAT IS THE WHOLE REASON THIS FILE IS
 * DETERMINISTIC.
 *
 * `userEvent` inserts REAL timers between the parts of a click. Under a frozen
 * fake clock they never fire and every click hangs to the 20s timeout — fifteen
 * of these did on their first run, reading as a deadlock in the host rather than
 * as the harness stopping its own clock. `delay: null` does not remove them
 * either; it was tried, and fourteen tests still hung.
 *
 * The fix that worked first was `useFakeTimers({ shouldAdvanceTime: true })`,
 * and it was wrong in a way that only appeared under load: wall-clock time then
 * advances the fake clock too, so the real milliseconds burned by every await
 * accumulate on top of each `advanceTimersByTime`. A margin like "alive at 3900,
 * gone at 4100" around a 4000ms timer becomes a question about how busy the
 * machine is. THE WHOLE SUITE WENT RED EXACTLY ONCE IN FIVE RUNS, on a test the
 * reporter did not name, and six runs of this file alone never reproduced it.
 *
 * `fireEvent` is synchronous and uses no timers at all, so the clock only moves
 * through `tick()` and the margins below mean exactly what they say. */
const fire = (index: number) => {
  fireEvent.click(screen.getByRole('button', { name: `fire ${index}` }));
};

const tick = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};

/* A FROZEN CLOCK. Nothing moves except through `tick()`. See the note on
   `fire` for the two attempts this replaced. */
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('§2 — the timing table', () => {
  it('dismisses a success at 4s and not a moment before', async () => {
    mount([{ title: 'saved' }]);
    fire(0);

    expect(screen.getByText('saved')).toBeInTheDocument();

    /* JUST SHORT, then over. A single `advance(4000)` would pass against an
       implementation that dismissed at 100ms, so the near miss is the half of
       this assertion that has any content. */
    await tick(3900);
    expect(screen.queryByText('saved')).toBeInTheDocument();

    await tick(200);
    expect(screen.queryByText('saved')).toBeNull();
  });

  it('gives info 5s and warning 6s, which is what makes it a TABLE and not a constant', async () => {
    mount([
      { tone: 'info', title: 'rules updated' },
      { tone: 'warning', title: 'past due' },
    ]);
    fire(0);
    fire(1);

    /* At 5.5s the info has gone and the warning has not. One assertion at one
       instant separates the two durations; asserting each alone would pass with
       both set to the same number. */
    await tick(5500);
    expect(screen.queryByText('rules updated')).toBeNull();
    expect(screen.queryByText('past due')).toBeInTheDocument();

    await tick(700);
    expect(screen.queryByText('past due')).toBeNull();
  });

  it('NEVER dismisses an error on its own', async () => {
    mount([{ tone: 'error', title: 'could not send' }]);
    fire(0);

    /* A minute. There is no toast history in this product, so an error that
       removes itself is a failure the reader cannot get back. */
    await tick(60_000);
    expect(screen.getByText('could not send')).toBeInTheDocument();
  });

  it('holds a toast with an action for 10s, overriding its tone', async () => {
    mount([
      {
        tone: 'success',
        title: 'undoable',
        action: { label: 'undo', onClick: () => {} },
      },
    ]);
    fire(0);

    /* Past the tone's own 4s — the reader has to notice the action, decide, and
       reach it, and 4s is not enough for all three. */
    await tick(9000);
    expect(screen.getByText('undoable')).toBeInTheDocument();

    await tick(1500);
    expect(screen.queryByText('undoable')).toBeNull();
  });

  it('pauses the countdown while the pointer is on the card', async () => {
    mount([{ title: 'read me' }]);
    fire(0);

    fireEvent.pointerEnter(screen.getByText('read me').closest('[role]')!);

    /* Three times its own duration, under the pointer. */
    await tick(12_000);
    expect(screen.getByText('read me')).toBeInTheDocument();

    fireEvent.pointerLeave(screen.getByText('read me').closest('[role]')!);
    await tick(4200);
    expect(screen.queryByText('read me')).toBeNull();
  });

  it('pauses on FOCUS too, because a keyboard user cannot hover', async () => {
    /* AC-8 names both paths and says why: hover is not available to the people
       most likely to need the extra seconds. The toast carries an action here
       because that is the only thing inside it focus can land on — a card with
       nothing focusable is one a keyboard never enters, and the pause would be
       untestable and pointless. */
    mount([
      {
        title: 'reachable',
        action: { label: 'do it', onClick: () => {} },
      },
    ]);
    fire(0);

    fireEvent.focusIn(screen.getByRole('button', { name: 'do it' }));

    /* Well past the 10s an action-bearing toast gets. */
    await tick(15_000);
    expect(screen.getByText('reachable')).toBeInTheDocument();

    fireEvent.focusOut(screen.getByRole('button', { name: 'do it' }));
    await tick(10_500);
    expect(screen.queryByText('reachable')).toBeNull();
  });
});

describe('§2 / 006 AC-23 — reduced motion removes the movement, not the message', () => {
  it('still renders every tone when the animation is gone', async () => {
    /* `030` AC-16. THE RISK IS SPECIFIC AND IT IS NOT HYPOTHETICAL: the toast
       enters from `opacity: 0`, so a reduced-motion rule that removes the
       animation without restoring the end state deletes the message outright for
       exactly the readers who asked for less movement.

       jsdom applies no media queries, so this cannot assert the CSS branch — it
       asserts the half that CAN be checked here, which is that the text and the
       role exist independently of any animation. The stylesheet half is
       `nearMatch`-style source evidence, recorded in `tests.md`. */
    mount([
      { tone: 'success', title: 'a' },
      { tone: 'error', title: 'b' },
    ]);
    fire(0);
    fire(1);

    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('§2 — the stack', () => {
  it('shows three and evicts the OLDEST when a fourth arrives', async () => {
    mount([
      { tone: 'error', title: 'first' },
      { tone: 'error', title: 'second' },
      { tone: 'error', title: 'third' },
      { tone: 'error', title: 'fourth' },
    ]);

    /* All four are `error`, so nothing leaves on a timer and eviction is the
       only thing that can remove one. A success here would make the test pass on
       an implementation with no cap at all, given a slow enough run. */
    fire(0);
    fire(1);
    fire(2);
    fire(3);

    expect(screen.queryByText('first')).toBeNull();
    expect(screen.getByText('second')).toBeInTheDocument();
    expect(screen.getByText('third')).toBeInTheDocument();
    expect(screen.getByText('fourth')).toBeInTheDocument();
  });

  it('puts the newest at the top, in document order', async () => {
    mount([
      { tone: 'error', title: 'older' },
      { tone: 'error', title: 'newer' },
    ]);
    fire(0);
    fire(1);

    const cards = screen.getAllByRole('alert');
    expect(cards[0]).toHaveTextContent('newer');
    expect(cards[1]).toHaveTextContent('older');
  });
});

describe('§2 — de-duplication', () => {
  it('refreshes the existing card with ×2 instead of stacking a copy', async () => {
    mount([{ tone: 'error', title: 'could not send' }]);

    fire(0);
    fire(0);

    /* ONE card, not two. Three identical failures is one fact and two copies,
       and it would evict two unrelated messages out of a stack of three. */
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByText('×2')).toBeInTheDocument();

    fire(0);
    expect(screen.getByText('×3')).toBeInTheDocument();
  });

  it('shows no counter on the first arrival, because ×1 is noise', async () => {
    mount([{ tone: 'error', title: 'once' }]);
    fire(0);

    expect(screen.queryByText('×1')).toBeNull();
  });

  it('restarts the countdown when a duplicate refreshes a dismissible toast', async () => {
    mount([{ title: 'saving' }]);

    fire(0);
    await tick(3500);

    /* 500ms from leaving. The duplicate must reset it to a full 4s rather than
       inherit the remainder — otherwise the second occurrence of a message is on
       screen for half a second. */
    fire(0);
    await tick(3500);
    expect(screen.getByText('saving')).toBeInTheDocument();

    await tick(700);
    expect(screen.queryByText('saving')).toBeNull();
  });

  it('keeps two DIFFERENT messages apart', async () => {
    mount([
      { tone: 'error', title: 'alpha' },
      { tone: 'error', title: 'beta' },
    ]);
    fire(0);
    fire(1);

    expect(screen.getAllByRole('alert')).toHaveLength(2);
  });
});

describe('§2 — the accessibility role follows the tone', () => {
  it('gives success and info role=status, which is polite', async () => {
    mount([
      { tone: 'success', title: 'done' },
      { tone: 'info', title: 'noted' },
    ]);
    fire(0);
    fire(1);

    expect(screen.getAllByRole('status')).toHaveLength(2);
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });

  it('gives error and warning role=alert, which interrupts', async () => {
    mount([
      { tone: 'error', title: 'failed' },
      { tone: 'warning', title: 'partly' },
    ]);
    fire(0);
    fire(1);

    /* The shipped primitive used `status` for every tone, with an argument that
       held for one screen. A request-wide failure has no field to sit beside, so
       waiting politely for a pause means the reader walks away believing the
       write went through. */
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(screen.queryAllByRole('status')).toHaveLength(0);
  });
});

describe('the host itself', () => {
  it('renders no region at all when there is nothing to say', () => {
    const { container } = mount([{ title: 'unused' }]);

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    /* Only the harness's button. An empty positioned region is a box that a
       later style change can make clickable across the end of every screen. */
    expect(container.querySelectorAll('div')).toHaveLength(0);
  });

  it('THROWS outside a provider rather than quietly doing nothing', () => {
    /* The most important test in this file. A no-op `useToast` is a failure the
       user never sees: the write succeeded, the toast was requested, nothing
       appeared, and no test anywhere goes red. */
    const Orphan = () => {
      useToast();
      return null;
    };

    const noise = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Orphan />)).toThrow(/ToastProvider/);
    noise.mockRestore();
  });

  it('dismisses by hand, which an auto-dismissing message must always allow', async () => {
    mount([{ tone: 'error', title: 'stubborn' }]);
    fire(0);

    fireEvent.click(screen.getByRole('button', { name: i18n.t('common:dismiss') }));
    expect(screen.queryByText('stubborn')).toBeNull();
  });
});
