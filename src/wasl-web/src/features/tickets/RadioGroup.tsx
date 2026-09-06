import { useRef, type KeyboardEvent, type ReactNode } from 'react';

import { cx } from '../../lib/cx';
import styles from './CreateTicket.module.css';

/* ============================================================================
 * RadioGroup — feature-local, `038`
 * ============================================================================
 * ONE COMPONENT FOR CHANNEL AND PRIORITY, and the reason is the keyboard rather
 * than the paint. The two look nothing alike — five icon-only cells against four
 * dot-and-label cells — and they share every behaviour that is easy to get
 * wrong: roving tabindex, arrows that MOVE THE SELECTION rather than just focus,
 * Home/End, and one tab stop for the whole group. Written twice, the second copy
 * is where the wrap-around is off by one and nobody notices, because both look
 * right until you hold the arrow key down.
 *
 * FEATURE-LOCAL, NOT A NINTH PRIMITIVE. `component-inventory.md` lists eight and
 * this is one screen's need; ADR-011 §3 promotes on the SECOND consumer, with a
 * written reason. `CreateTicket.module.css` already carries that same note about
 * the section card.
 *
 * ---------------------------------------------------------------------------
 * `aria-checked` ON A RADIO, NOT `aria-pressed` ON A TOGGLE
 * ---------------------------------------------------------------------------
 * The supplied mock-up sets `aria-pressed`, which is a toggle BUTTON — an
 * independent on/off. Five mutually exclusive options are a radio group, and the
 * difference is audible: `aria-pressed` announces "pressed"/"not pressed" per
 * button with no group and no "3 of 5", so a screen-reader user is told the
 * state of one control and never that the others just changed. Deliberate
 * departure, spec §3.3.
 *
 * ---------------------------------------------------------------------------
 * NOTHING SELECTED IS A REAL STATE, and it is why `value` is `string | null`
 * ---------------------------------------------------------------------------
 * Priority ships with no selection (R-3), so the group must be reachable with
 * nothing checked. WAI-ARIA's answer is that the FIRST option holds the tab stop
 * in that case — not "no tab stop", which makes the group unreachable, and not
 * "every option tabbable", which is the default `tabIndex` and turns one control
 * into five stops.
 * ============================================================================ */

export interface RadioGroupOption {
  /** The RAW wire value — an enum member, never a translated label. */
  value: string;
  /** Already translated by the caller. */
  label: string;
  /** Rendered before the label. An icon for channel, a colour dot for priority. */
  adornment?: ReactNode;
}

interface RadioGroupProps {
  /** The group's accessible name, already translated. */
  label: string;
  options: readonly RadioGroupOption[];
  value: string | null;
  onChange: (value: string) => void;
  onBlur?: (() => void) | undefined;

  /** `'icon'` hides the label visually and puts it on `aria-label` + `title`;
   *  `'label'` renders it. */
  variant: 'icon' | 'label';

  /** Set when the group is invalid, so the container can carry the danger
   *  border and `aria-invalid` sits on the group rather than on one option. */
  invalid?: boolean | undefined;

  /** `aria-describedby` target — the hint line under channel, the error under
   *  either. */
  describedBy?: string | undefined;

  id?: string | undefined;
}

export function RadioGroup({
  label,
  options,
  value,
  onChange,
  onBlur,
  variant,
  invalid,
  describedBy,
  id,
}: RadioGroupProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  /** The index that holds the tab stop. The selection when there is one, else
   *  the first option — never `-1`, which would make the group unreachable. */
  const selectedIndex = options.findIndex((option) => option.value === value);
  const tabIndexAt = selectedIndex === -1 ? 0 : selectedIndex;

  /* MOVE selects, and that is the radiogroup pattern rather than the listbox
   * one: in a radio group the arrow key changes the value, so focus and
   * selection never disagree. With nothing selected yet, the first arrow selects
   * the first option rather than the second — starting from `tabIndexAt` and
   * adding one would skip it. */
  const move = (delta: number) => {
    const from = selectedIndex === -1 ? (delta > 0 ? -1 : 0) : selectedIndex;
    const next = (from + delta + options.length) % options.length;
    const option = options[next];
    if (option === undefined) return;
    onChange(option.value);
    refs.current[next]?.focus();
  };

  const select = (index: number) => {
    const option = options[index];
    if (option === undefined) return;
    onChange(option.value);
    refs.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    /* LOGICAL, NOT PHYSICAL. Under `dir="rtl"` the visually-next cell is to the
     * inline-end, which ArrowLeft reaches — so the two horizontal keys swap with
     * the document direction. `Down`/`Up` never swap: block direction is
     * top-to-bottom in both languages. Reading `document.dir` rather than a prop
     * because the same group renders in both without re-mounting. */
    const rtl = document.documentElement.dir === 'rtl';
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        move(rtl ? -1 : 1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        move(rtl ? 1 : -1);
        break;
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Home':
        event.preventDefault();
        select(0);
        break;
      case 'End':
        event.preventDefault();
        select(options.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={label}
      aria-invalid={invalid === true ? true : undefined}
      aria-describedby={describedBy}
      className={cx(
        variant === 'icon' ? styles.groupIcons : styles.groupLabels,
        invalid === true && styles.groupInvalid,
      )}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            /* Icon-only cells have no text child, so the name comes from here.
               `Button`'s own rule — an icon-only control REQUIRES a label — is
               the same rule, enforced by a different component. */
            {...(variant === 'icon' ? { 'aria-label': option.label, title: option.label } : {})}
            tabIndex={index === tabIndexAt ? 0 : -1}
            className={cx(styles.option, checked && styles.optionChecked)}
            onClick={() => onChange(option.value)}
          >
            {option.adornment}
            {variant === 'label' ? <span>{option.label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
