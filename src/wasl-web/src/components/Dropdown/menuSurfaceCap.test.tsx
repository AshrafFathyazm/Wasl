import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useMenuSurface } from './useMenuSurface';

/* ============================================================================
 * `039` — the measured height cap, and the flip it follows
 * ============================================================================
 * jsdom performs no layout, so every rect is zero and every `offsetHeight` is
 * zero. Both are stubbed HERE, deliberately and visibly: the thing under test is
 * the arithmetic that turns a trigger's position into a ceiling, and a browser
 * is not required to check arithmetic.
 *
 * WHAT THIS CANNOT SEE, stated rather than implied: whether the panel actually
 * paints inside the ceiling. That is CSS, and `AssigneePanel.module.css` takes
 * `min()` of this number and its own — the source scan at the foot of this file
 * is what holds that half.
 *
 * THE TRIGGER IS POSITIONED DELIBERATELY, never by scrolling a page and hoping.
 * `039` M-4: in the product owner's own mock the upward flip is unreachable —
 * the document's entire scroll range is 162px, so the trigger can never sit low
 * enough in the viewport — and the branch was dead until 1400px of padding was
 * injected. A test that scrolls and asserts "it flipped" would report a pass it
 * never earned.
 * ========================================================================= */

const VIEWPORT_HEIGHT = 800;
const VIEWPORT_WIDTH = 1200;

/** A trigger at a chosen place in the viewport, with a menu of a chosen height
 *  already mounted under it. Both halves matter: the flip is decided by the
 *  trigger's rect and the flipped POSITION is decided by the menu's height. */
function place({
  top,
  left = 600,
  height = 34,
  width = 34,
  menuHeight = 429,
  menuWidth = 308,
  dir = 'rtl',
}: {
  top: number;
  left?: number;
  height?: number;
  width?: number;
  menuHeight?: number;
  menuWidth?: number;
  dir?: 'rtl' | 'ltr';
}) {
  document.documentElement.dir = dir;

  const trigger = document.createElement('button');
  document.body.append(trigger);
  nodes.push(trigger);
  trigger.getBoundingClientRect = () =>
    ({
      top,
      bottom: top + height,
      left,
      right: left + width,
      width,
      height,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;

  const menu = document.createElement('div');
  document.body.append(menu);
  nodes.push(menu);
  Object.defineProperty(menu, 'offsetHeight', { value: menuHeight, configurable: true });
  Object.defineProperty(menu, 'offsetWidth', { value: menuWidth, configurable: true });

  return { trigger, menu };
}

function open(
  options: Parameters<typeof useMenuSurface>[0] & Parameters<typeof place>[0],
) {
  const { trigger, menu } = place(options);
  const view = renderHook(() => useMenuSurface({ align: options.align }));

  act(() => {
    view.result.current.triggerRef.current = trigger;
    view.result.current.menuRef.current = menu;
    view.result.current.setOpen(true);
  });

  return view;
}

/* RESTORED, NOT BLANKED, and both halves of that were a real defect in this
   file's first version.

   `document.documentElement.dir = ''` is not "put it back": `lib/direction.ts`
   writes `ar` or `en` there and the whole product reads it, so blanking it hands
   every file that runs after this one a document with no direction. And
   `document.body.innerHTML = ''` removes Testing Library's own containers along
   with this file's stubs.

   Neither is visible while the file runs alone. Under one shared process the
   suite reported twenty-one failures in `CustomerProfilePage.test.tsx` — a
   screen neither lane had touched — and a different set on the run before it.
   A failure set that moves between identical runs is the environment, not the
   code. */
const nodes: HTMLElement[] = [];
let documentDir = '';

beforeEach(() => {
  documentDir = document.documentElement.dir;
  window.innerHeight = VIEWPORT_HEIGHT;
  window.innerWidth = VIEWPORT_WIDTH;
});

afterEach(() => {
  for (const node of nodes.splice(0)) node.remove();
  document.documentElement.dir = documentDir;
});

describe('AC-13 — the cap is measured per open, and it is a number, not a token', () => {
  it('reports the room under the trigger when the menu opens downward', () => {
    const view = open({ top: 100 });

    const position = view.result.current.position!;
    expect(position.flipped).toBe(false);
    /* 800 − (100 + 34) − 4 gap − 12 edge */
    expect(position.maxBlockSize).toBe(650);
  });

  it('reports the room ABOVE when there is not enough below and more above', () => {
    /* 46px of room below the trigger — under the 200px flip threshold — and 720
       above it. The mock's own `place()` makes the same call. */
    const view = open({ top: 720 });

    const position = view.result.current.position!;
    expect(position.flipped).toBe(true);
    /* 720 − 4 gap − 12 edge */
    expect(position.maxBlockSize).toBe(704);
    /* And the menu sits above the trigger rather than over it. */
    expect(position.insetBlockStart).toBe(720 - 429 - 4);
    expect(position.insetBlockStart + 429).toBeLessThanOrEqual(720);
  });

  it('does NOT flip into the smaller of two bad options', () => {
    /* THE FIRST VERSION OF THIS TEST DID NOT REACH THE BRANCH IT NAMED. It
       placed the trigger at the top of an 800px viewport, where 706px of room
       remain below — so the flip was never considered at all and the assertion
       passed on the wrong reason.
       Both halves have to be cramped: a 300px viewport leaves 166px below (under
       the 200px threshold, so a flip is considered) and 100px above (less than
       below, so it is refused). Flipping here would cover the trigger the reader
       is looking at. */
    window.innerHeight = 300;
    const view = open({ top: 100, height: 34, menuHeight: 900 });

    const position = view.result.current.position!;
    expect(position.flipped).toBe(false);
    expect(position.maxBlockSize).toBe(220);
  });

  it('never caps below a usable height, however cramped the viewport', () => {
    window.innerHeight = 120;
    const view = open({ top: 60 });

    /* 120 − 94 − 16 = 10px of real room. A 10px menu is not a menu. */
    expect(view.result.current.position!.maxBlockSize).toBe(220);
  });

  it('reports no cap before the menu has a height to measure against', () => {
    const { trigger } = place({ top: 100 });
    const view = renderHook(() => useMenuSurface());

    act(() => {
      view.result.current.triggerRef.current = trigger;
      view.result.current.setOpen(true);
    });

    expect(view.result.current.position!.maxBlockSize).toBeNull();
  });
});

describe('align — a menu wider than its trigger keeps the inline-END edge', () => {
  it('under rtl, inline-end is the physical left, so the two left edges meet', () => {
    const view = open({ top: 100, align: 'end', dir: 'rtl' });

    /* The menu then extends towards the inline-START, which under rtl is
       rightwards — the same thing the mock's `inset-inline-end: 0` does. */
    expect(view.result.current.position!.insetInlineStartPx).toBe(600);
  });

  it('under ltr, inline-end is the physical right, so the menu is pulled back by its width', () => {
    const view = open({ top: 100, align: 'end', dir: 'ltr' });

    /* trigger right 634, menu 308 wide */
    expect(view.result.current.position!.insetInlineStartPx).toBe(634 - 308);
  });

  it('clamps a wide menu at the page edge instead of placing it off-screen', () => {
    window.innerWidth = 1100;
    /* rtl, so the menu's left edge wants to be the trigger's — 900 to the right
       of it, which is 200px past the fold. The actions column sits at exactly
       this edge of the page, so this is the real case and not a contrived one. */
    const view = open({ top: 100, left: 900, align: 'end', dir: 'rtl', menuWidth: 900 });

    expect(view.result.current.position!.insetInlineStartPx).toBeGreaterThanOrEqual(12);
    expect(view.result.current.position!.insetInlineStartPx + 900).toBeLessThanOrEqual(
      1100,
    );
  });
});

describe('the menu is measured with ITS OWN size, not the trigger’s', () => {
  /* REPORTED FROM THE RUNNING APP, in English: «الـ reassign في جدول التيكت بيفتح
     خارج الجدول بعيد» — the panel opened a whole panel-width to the right of the
     table and ran off the page.

     Every test above sets `menuRef.current` by hand BEFORE opening, which is the
     one order the real app can never produce: a ref attaches after the render
     that mounts the node, and the surface only mounts once `position` exists. So
     those tests measured a menu that was already there and could not see the
     first pass being the last one.

     This one mounts the node the way the app does — after the first position —
     and asserts the SECOND measurement happened. */
  /* A REAL COMPONENT, not `renderHook`. The first version of this test used
     `renderHook`, set `menuRef.current` by hand and called `rerender()` — and it
     PASSED WITH THE FIX REMOVED, because an explicit re-render re-evaluates the
     `[open, menuRef.current]` dependency array with the node in place, which is
     the one thing the real mount never does. Recorded because it is the whole
     lesson: the bug lives in an ORDER, so a test that supplies its own order
     measures nothing. */
  function Harness({ left = 600 }: { left?: number }) {
    const surface = useMenuSurface({ align: 'end' });

    return (
      <>
        <button
          type="button"
          ref={(node) => {
            if (node === null) return;
            node.getBoundingClientRect = () =>
              ({
                top: 100,
                bottom: 134,
                left,
                right: left + 34,
                width: 34,
                height: 34,
                x: left,
                y: 100,
                toJSON: () => ({}),
              }) as DOMRect;
            surface.triggerRef.current = node;
          }}
          onClick={() => surface.setOpen(true)}
        >
          {'open'}
        </button>

        {/* MOUNTED ONLY ONCE THERE IS A POSITION — exactly what `RowAssignMenu`
            and `Dropdown` both do, and the reason the ref lands after the render
            that would have re-measured. */}
        {surface.position === null ? null : (
          <div
            data-testid="menu"
            data-left={surface.position.insetInlineStartPx}
            ref={(node) => {
              if (node === null) return;
              Object.defineProperty(node, 'offsetWidth', {
                value: 308,
                configurable: true,
              });
              Object.defineProperty(node, 'offsetHeight', {
                value: 429,
                configurable: true,
              });
              surface.menuRef.current = node;
            }}
          />
        )}
      </>
    );
  }

  it('re-measures once the menu node exists, the way a real mount orders it', async () => {
    document.documentElement.dir = 'ltr';
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'open' }));

    /* trigger right 634, menu 308 wide. Before the fix this settled on 600 —
       `rect.right - rect.width`, the trigger's own left edge — which put a 308px
       panel 274px further along than it belonged and off the page at the table's
       actions column. */
    await waitFor(() =>
      expect(screen.getByTestId('menu')).toHaveAttribute('data-left', String(634 - 308)),
    );
  });
});

describe('AC-36 — the cap cannot make an existing Dropdown menu taller', () => {
  const read = (file: string) => readFileSync(resolve(__dirname, file), 'utf8');

  it('takes min() of the design token and the measurement', () => {
    const css = read('./Dropdown.module.css');

    /* The measurement is a CEILING and never a height. Written straight to
       `max-block-size` it would REPLACE the token and could only ever be an
       improvement by accident; written to `block-size` it would stretch a
       three-row menu down the viewport. */
    expect(css).toMatch(/max-block-size:\s*min\(/);
    expect(css).toContain('var(--dropdown-menu-max-height)');
    expect(css).toContain('var(--menu-max-block-size, 100vh)');
  });

  it('leaves `Dropdown` passing neither of the new options', () => {
    const source = read('./Dropdown.tsx');

    /* `031`'s eight consumers are unchanged because `Dropdown` opts into
       nothing: no `align`, and it publishes no custom property, so `min()`
       resolves to the token exactly as it did before `039`. */
    expect(source).toContain('useMenuSurface()');
    expect(source).not.toContain('--menu-max-block-size');
    expect(source).not.toMatch(/useMenuSurface\(\s*\{/);
  });
});
