import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';

/* ============================================================================
 * useMenuSurface
 * ============================================================================
 * Everything a floating menu needs and nothing about what is inside one: open
 * state, dismissal, portal geometry, and the flip. No value model, no options,
 * no selection.
 *
 * SPLIT OUT ON PURPOSE, AND THE DESIGN DOCUMENT ASKED FOR IT. Abyan Dropdown
 * §10, under "do not": «لا تستخدمها كقائمة إجراءات مع حالة اختيار — افصل بين
 * النوعين» — do not use the dropdown as an action menu with a selection state;
 * keep the two apart. `027`'s status control is an action menu (a status change
 * is an action, not a value) and it needs every line below and none of the
 * value model above it. One implementation of the hard part, two components.
 *
 * It lives under `components/Dropdown/` rather than in `lib/` because it is not
 * a general utility — it is this primitive's mechanism, and the second consumer
 * should be able to see where it came from.
 * ============================================================================ */

/** Below this much room underneath the trigger, the menu opens upward.
 *  Abyan Dropdown §06: «الانقلاب لأعلى — < 200px مساحة». */
const FLIP_THRESHOLD = 200;

/** `039`. How close to the viewport edge a capped menu is allowed to come. The
 *  mock measures the same 12. */
const EDGE = 12;

/** `039`. A cap never shortens a menu below this: a two-row menu with a scrollbar
 *  is worse than one that overhangs slightly, and it is what the mock's own
 *  `Math.max(220, …)` protects. */
const MIN_MENU_BLOCK_SIZE = 220;

/** `039`. How the menu lines up with its trigger across the inline axis.
 *
 *  `'stretch'` is what `031` built and is still the default: the menu takes the
 *  trigger's width, so their physical left edges coincide in both directions —
 *  see the note on `insetInlineStartPx`.
 *
 *  `'end'` is for a menu WIDER than its trigger, which the stretch reasoning does
 *  not cover: two boxes of different widths cannot share both edges, so one has
 *  to be chosen, and it is the inline-END — the edge the trigger sits at in a
 *  row of actions. That one IS direction-dependent, and it is the only place in
 *  this hook that reads `dir`. */
export type MenuAlign = 'stretch' | 'end';

export interface MenuSurfaceOptions {
  /** Default `'stretch'`. */
  align?: MenuAlign | undefined;
}

export interface MenuPosition {
  /** Physical, from `getBoundingClientRect`, for a `position: fixed` portal.
   *
   *  NOT a bug in RTL, and this is the line that looks like one. The menu's
   *  width is the trigger's width, so aligning their physical left edges aligns
   *  their inline-start in `ltr` AND their inline-end in `rtl` — both edges
   *  coincide. Mirroring here would move the menu off the trigger in one
   *  direction while looking correct in the other. */
  insetBlockStart: number;
  insetInlineStartPx: number;
  inlineSize: number;
  /** `true` when the menu was flipped above the trigger. The caller uses it for
   *  the transform origin, so the animation grows from the trigger either way. */
  flipped: boolean;

  /** `039`. The room actually available on the side the menu opened towards,
   *  in pixels, measured at this open and re-measured on resize.
   *
   *  IT IS A CEILING AND NEVER A HEIGHT. The caller publishes it as
   *  `--menu-max-block-size` and the stylesheet takes `min()` of it and its own
   *  token, so a cap can only ever make a menu shorter than it already was —
   *  which is what keeps the eight `Dropdown` consumers unchanged. Handing this
   *  straight to `block-size` would stretch a three-row menu down the viewport.
   *
   *  `null` until the menu has a height to measure against. */
  maxBlockSize: number | null;
}

export interface MenuSurface {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** Closes AND returns focus to the trigger. Never one without the other — a
   *  menu that closes without restoring focus strands a keyboard user on the
   *  page body, which is what AC-7 asserts. */
  closeAndFocusTrigger: () => void;
  triggerRef: MutableRefObject<HTMLElement | null>;
  menuRef: MutableRefObject<HTMLDivElement | null>;
  position: MenuPosition | null;
}

export function useMenuSurface(options: MenuSurfaceOptions = {}): MenuSurface {
  const { align = 'stretch' } = options;

  const [open, setOpenState] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const triggerRef = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menu = menuRef.current;
    const menuHeight = menu?.offsetHeight ?? 0;
    const roomBelow = window.innerHeight - rect.bottom;

    /* Flip only when there is not enough room below AND there is more above.
     * The second half matters: in a short viewport both are cramped, and
     * flipping into the smaller of two bad options is worse than not flipping,
     * because the menu then covers the trigger the user is reading. */
    const flipped = roomBelow < FLIP_THRESHOLD && rect.top > roomBelow;

    /* `039`. The room on the side it actually opened towards, floored so a very
     * cramped viewport does not produce a menu too short to use. */
    const room = flipped ? rect.top - GAP - EDGE : roomBelow - GAP - EDGE;
    const maxBlockSize = menu ? Math.max(MIN_MENU_BLOCK_SIZE, Math.round(room)) : null;

    /* `039`. A menu the trigger's width shares both edges with it, so `rect.left`
     * is correct in both directions (the note on `insetInlineStartPx`). A WIDER
     * menu shares only one, and the one it keeps is the inline-end — which under
     * `rtl` is the physical LEFT and under `ltr` the physical RIGHT, so this is
     * the one measurement in the hook that has to ask which way the page reads.
     *
     * Measured from the MENU's own width rather than a constant: the caller sets
     * that width in CSS, and a number duplicated here goes stale the first time
     * the stylesheet changes and nothing errors. */
    const menuWidth = menu?.offsetWidth ?? rect.width;
    /* `document.documentElement.dir`, NOT `getComputedStyle(el).direction`.
     * `lib/direction.ts` writes the root's `dir` from the language and is the
     * product's single source for it, so this reads the same fact the rest of
     * the app does — and it is the pattern `RadioGroup` already follows.
     *
     * The computed style was the first version and it is the one that looks more
     * correct: it also sees a `direction` set in CSS. jsdom models no cascade for
     * a presentational `dir` attribute, so it answers `ltr` for an RTL page —
     * which made the RTL branch of this function untestable, in the product
     * whose whole point is RTL. Measured, not assumed: the first run of
     * `menuSurfaceCap.test.ts` reported `expected 726 to be 1000`. */
    const rtl = document.documentElement.dir === 'rtl';
    const alignedStart =
      align === 'stretch' ? rect.left : rtl ? rect.left : rect.right - menuWidth;

    setPosition({
      insetBlockStart: flipped ? rect.top - menuHeight - GAP : rect.bottom + GAP,
      /* Clamped into the viewport, and ONLY under `'end'`. A menu wider than its
       * trigger at the edge of the page is otherwise placed at a negative offset
       * and is partly unreachable — the `026` actions column sits at exactly that
       * edge. Under `'stretch'` the menu is the trigger's width, so the clamp
       * could only ever MOVE a menu that was already correct, and moving it
       * would be a change to the eight consumers this feature must not touch. */
      insetInlineStartPx:
        align === 'stretch'
          ? alignedStart
          : Math.max(EDGE, Math.min(alignedStart, window.innerWidth - menuWidth - EDGE)),
      inlineSize: rect.width,
      flipped,
      maxBlockSize,
    });
  }, [align]);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    if (!next) setPosition(null);
  }, []);

  const toggle = useCallback(() => setOpen(!open), [open, setOpen]);

  const closeAndFocusTrigger = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, [setOpen]);

  /* Measured in a layout effect, before paint. In a passive effect the menu
   * renders once at 0,0 and jumps into place — one frame, visible, and it reads
   * as a flicker rather than as a bug. */
  useLayoutEffect(() => {
    if (!open) return;
    measure();
  }, [open, measure]);

  /* A second measure after the menu has its height. The first pass runs with
   * `offsetHeight === 0` for a menu that has not mounted yet, so a flipped menu
   * would be positioned as if it were zero-height. Cheap, and only when open. */
  useLayoutEffect(() => {
    if (!open || !menuRef.current) return;
    measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, menuRef.current]);

  /* `039` — AND IT WAS NOT ENOUGH. Reported from the running app in English: the
   * assignee menu opened far to the right of the table and off the edge of the
   * page.
   *
   * `menuRef.current` is READ AT RENDER TIME to build that dependency array, and
   * a ref attaches AFTER the render that mounts the node. On the render where the
   * menu first appears the dependency is therefore still `null` — unchanged — so
   * the effect above does not re-run and the geometry stays the one measured with
   * NO MENU. `031` never saw it because a `Dropdown` menu takes the trigger's
   * width, so only the flip depended on the second pass and a flip is rare.
   * `039`'s panel is 308px against a 34px trigger: the miss put the menu a whole
   * panel-width out.
   *
   * No dependency array on purpose — it runs after every render while open, and
   * the ref stops it after the one that matters. A `[position]` dependency would
   * be a loop, because measuring is what sets `position`. */
  const measuredWithMenu = useRef(false);
  useEffect(() => {
    if (!open) {
      measuredWithMenu.current = false;
      return;
    }
    if (measuredWithMenu.current || !menuRef.current) return;
    measuredWithMenu.current = true;
    measure();
  });

  useEffect(() => {
    if (!open) return;

    /* `pointerdown`, not `click`. A click fires after the pointer is released,
     * so a press that starts inside the menu and drifts out closes it on
     * release — and a press that starts on the trigger would toggle twice. */
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };

    /* Capture, and `true` for the third argument: a scroll inside the menu's
     * own list must NOT close it, but a scroll of anything else must, because
     * a fixed-position menu does not travel with the page. */
    const onScroll = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };

    const onResize = () => measure();

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, measure, setOpen]);

  return { open, setOpen, toggle, closeAndFocusTrigger, triggerRef, menuRef, position };
}

/** 4px, matching `--dropdown-menu-offset`. A duplicated value, and the only one
 *  in this feature: the gap is needed as a NUMBER to position a fixed element in
 *  JavaScript, and CSS custom properties are strings until something resolves
 *  them. Reading it back with `getComputedStyle` on every measure is a layout
 *  read per scroll event to avoid one constant. */
const GAP = 4;
