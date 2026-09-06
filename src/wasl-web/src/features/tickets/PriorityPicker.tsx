import { useTranslation } from 'react-i18next';

import { TICKET_PRIORITIES } from '../../lib/api-types.provisional';
import type { TicketPriority } from '../../lib/api-types.provisional';
import { cx } from '../../lib/cx';
import styles from './CreateTicket.module.css';
import { RadioGroup } from './RadioGroup';

/* ============================================================================
 * PriorityPicker — `038` §3.3b
 * ============================================================================
 * NOTHING IS SELECTED ON FIRST PAINT (R-3), and the mock-up's pre-selected
 * «عادية» is deliberately not reproduced.
 *
 * The reason is one the product already paid for. `priority` is OMITTED from the
 * request when untouched, so the SERVER's default governs — and `024`'s Arabic
 * walk found «عادية» listed twice, once as the empty option and once as the real
 * `Normal`, with nothing on screen to tell them apart while the two sent
 * different bodies. Pre-selecting `Normal` here re-creates that: the screen
 * would show a choice it does not send, or it would start sending `Normal` and
 * pin today's server default forever.
 *
 * So: four options, none checked, and the default is stated in words on the
 * `Normal` cell — `tickets:new.priorityDefault`, the key `024` added for exactly
 * this sentence.
 *
 * ---------------------------------------------------------------------------
 * WHY ALL FOUR DOTS CARRY COLOUR HERE, WHEN THE LIST ONLY COLOURS TWO
 * ---------------------------------------------------------------------------
 * `TicketBadges` mutes `Low` and `Normal` on purpose — "a table where every cell
 * shouts says nothing". That rule is about a ROW among hundreds. This is a
 * chooser of four, where the dot's whole job is telling the options apart, and
 * two identical grey dots tell nothing apart. The ramp still agrees with the
 * list at the loud end: `High` takes the amber SHAPE token (which `tokens.css`
 * says is what `--state-warning-fill` exists for) and `Critical` takes danger.
 * ============================================================================ */

/* `string | undefined`, matching `TicketBadges`' own map: a CSS-module class is
 * typed optional in this project, and widening it here is what keeps the map
 * exhaustive over the union — which is the property that matters. */
const DOT_CLASS: Record<TicketPriority, string | undefined> = {
  Low: styles.dotLow,
  Normal: styles.dotNormal,
  High: styles.dotHigh,
  Critical: styles.dotCritical,
};

interface PriorityPickerProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: (() => void) | undefined;
  error?: string | undefined;
}

export function PriorityPicker({ value, onChange, onBlur, error }: PriorityPickerProps) {
  const { t } = useTranslation();

  const options = TICKET_PRIORITIES.map((priority) => ({
    value: priority,
    label:
      priority === 'Normal'
        ? t('tickets:new.priorityDefault', { value: t('tickets:priority.Normal') })
        : t(`tickets:priority.${priority}`),
    adornment: (
      <span className={cx(styles.dot, DOT_CLASS[priority])} aria-hidden="true" />
    ),
  }));

  return (
    <div className={styles.field}>
      {/* NO required marker. `priority` is the one optional field on this form,
          and marking it would be the screen claiming a rule the contract does
          not have. */}
      <span className={styles.fieldLabel}>{t('tickets:field.priority')}</span>

      <RadioGroup
        label={t('tickets:field.priority')}
        options={options}
        value={value === '' ? null : value}
        onChange={onChange}
        onBlur={onBlur}
        variant="label"
        invalid={error !== undefined}
      />

      {error === undefined ? null : (
        <span className={styles.fieldError} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
