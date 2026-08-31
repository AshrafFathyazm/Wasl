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

export function useMenuSurface(): MenuSurface {
  const [open, setOpenState] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const triggerRef = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 0;
    const roomBelow = window.innerHeight - rect.bottom;

    /* Flip only when there is not enough room below AND there is more above.
     * The second half matters: in a short viewport both are cramped, and
     * flipping into the smaller of two bad options is worse than not flipping,
     * because the menu then covers the trigger the user is reading. */
    const flipped = roomBelow < FLIP_THRESHOLD && rect.top > roomBelow;

    setPosition({
      insetBlockStart: flipped ? rect.top - menuHeight - GAP : rect.bottom + GAP,
      insetInlineStartPx: rect.left,
      inlineSize: rect.width,
      flipped,
    });
  }, []);

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      if (!next) setPosition(null);
    },
    [],
  );

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
