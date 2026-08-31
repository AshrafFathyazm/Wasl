import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BUSY_APPEAR_AFTER_MS,
  BUSY_LONG_WAIT_MS,
  BUSY_MIN_VISIBLE_MS,
  useDeferredBusy,
} from './useDeferredBusy';

/* ============================================================================
 * The four timing gates — 029, design/loaders.md §3
 * ============================================================================
 *
 * THE HOOK NEEDS BOTH CLOCKS MOVED, and this project's vitest moves both.
 *
 * `setTimeout` schedules the transitions; `Date.now()` measures how long the
 * loader has actually been on screen. If only the timers were faked, `elapsed`
 * would compute against a clock that never advanced, the 400ms floor would
 * never be reported as expired, and the hold test below would pass for the
 * wrong reason.
 *
 * MEASURED, not assumed: `vi.useFakeTimers()` with no options, then
 * `advanceTimersByTime(5000)`, moves `Date.now()` by exactly 5000 here — so
 * vitest's default `toFake` includes 'Date' and no extra configuration is
 * needed. If a future vitest changes that default, the AC-7 test is the one
 * that goes red, and this paragraph is why.
 * ============================================================================ */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Advance both the timer queue and the clock the hook measures against. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('AC-6 — a fast answer paints no loader at all', () => {
  it('shows nothing while the wait is under the appear delay', async () => {
    const { result } = renderHook(() => useDeferredBusy(true));

    expect(result.current.visible).toBe(false);

    await advance(BUSY_APPEAR_AFTER_MS - 10);
    expect(result.current.visible).toBe(false);
  });

  it('a 90ms round trip never renders the loader — not once, not for a frame', async () => {
    const { result, rerender } = renderHook(({ busy }) => useDeferredBusy(busy), {
      initialProps: { busy: true },
    });

    await advance(90);
    rerender({ busy: false });

    /* The assertion that matters is AFTER the answer landed: the appear timer
     * is still queued at this point, and a hook that only cleared it on unmount
     * would flash the loader 60ms later on a request that already finished. */
    expect(result.current.visible).toBe(false);
    await advance(1000);
    expect(result.current.visible).toBe(false);
  });

  it('appears once the wait passes the delay', async () => {
    const { result } = renderHook(() => useDeferredBusy(true));

    await advance(BUSY_APPEAR_AFTER_MS + 5);
    expect(result.current.visible).toBe(true);
  });
});

describe('AC-7 — once shown, it stays for the floor', () => {
  it('a 160ms answer keeps the loader up past 400ms', async () => {
    const { result, rerender } = renderHook(({ busy }) => useDeferredBusy(busy), {
      initialProps: { busy: true },
    });

    /* Appears at 150. The answer lands at 160 — ten milliseconds later. */
    await advance(160);
    expect(result.current.visible).toBe(true);

    rerender({ busy: false });
    expect(result.current.visible).toBe(true);

    /* At 500ms of total wall time the loader has been up for 350ms. Still up:
     * THE PRODUCT IS DELIBERATELY SLOWER HERE. A three-frame blink reads as a
     * glitch and costs more attention than the wait it saved. */
    await advance(340);
    expect(result.current.visible).toBe(true);

    await advance(100);
    expect(result.current.visible).toBe(false);
  });

  it('a long wait ends immediately — the floor is a minimum, not a delay', async () => {
    const { result, rerender } = renderHook(({ busy }) => useDeferredBusy(busy), {
      initialProps: { busy: true },
    });

    await advance(BUSY_APPEAR_AFTER_MS + BUSY_MIN_VISIBLE_MS + 500);
    expect(result.current.visible).toBe(true);

    rerender({ busy: false });
    await advance(1);
    expect(result.current.visible).toBe(false);
  });
});

describe('the long wait says so in words', () => {
  it('reports isLongWait after ten seconds, and not before', async () => {
    const { result } = renderHook(() => useDeferredBusy(true));

    await advance(BUSY_LONG_WAIT_MS - 100);
    expect(result.current.isLongWait).toBe(false);

    await advance(200);
    expect(result.current.isLongWait).toBe(true);
  });

  it('clears when the wait ends', async () => {
    const { result, rerender } = renderHook(({ busy }) => useDeferredBusy(busy), {
      initialProps: { busy: true },
    });

    await advance(BUSY_LONG_WAIT_MS + 100);
    expect(result.current.isLongWait).toBe(true);

    rerender({ busy: false });
    await advance(BUSY_MIN_VISIBLE_MS + 50);
    expect(result.current.isLongWait).toBe(false);
  });
});

describe('a second wait does not restart a loader already on screen', () => {
  it('stays visible across a busy → busy transition', async () => {
    /* A refetch starting while the first is still in flight must not blink the
     * loader off and back. The hook returns early when it is already showing,
     * and this is the assertion that the early return is doing that job. */
    const { result, rerender } = renderHook(({ busy }) => useDeferredBusy(busy), {
      initialProps: { busy: true },
    });

    await advance(BUSY_APPEAR_AFTER_MS + 50);
    expect(result.current.visible).toBe(true);

    rerender({ busy: true });
    await advance(10);
    expect(result.current.visible).toBe(true);
  });
});
