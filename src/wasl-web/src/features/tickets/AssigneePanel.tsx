import { useTranslation } from 'react-i18next';

import { Input } from '../../components/Input/Input';
import { IconAlert, IconCheck, IconClose } from '../../icons/icons';
import { cx } from '../../lib/cx';
import { formatNumber, type Lang } from '../../lib/formatters';
import { Avatar } from './Avatar';
import styles from './AssigneePanel.module.css';

/* ============================================================================
 * AssigneePanel — `039`
 * ============================================================================
 * ONE panel, two surfaces. It was a function inside `TicketDetailPage.tsx`;
 * `039` needs the same thing hanging off a table row, and a second copy is how
 * the two drift — `037` found `IconEye` declared twice with different geometry,
 * rendering two drawings under one import name for four features.
 *
 * IT DOES NOT POSITION ITSELF, does not fetch, and does not mutate. The rail
 * hangs it off a `position: relative` block; the list row hangs it off a
 * `position: fixed` portal with a measured height cap. A component that decided
 * its own placement could serve exactly one of them.
 *
 * NOT `Dropdown`, and that is the design system's own instruction rather than a
 * preference. Abyan Dropdown §10, under "do not": «لا تستخدمها كقائمة إجراءات مع
 * حالة اختيار — افصل بين النوعين». `DropdownOption` is
 * `{ value, label, description, icon, disabled }` — it has no trailing slot for
 * the count and no pinned foot outside the scroller, which are the two things
 * this panel exists for. What IS reused is the mechanism: `useMenuSurface`, by
 * the caller.
 *
 * WHAT IT DOES NOT DRAW, because the data does not exist:
 *
 *   the team beside each name
 *     The mock draws «الدعم الأول». `SupportUser` is `(id, fullName, role)` —
 *     `027` met this first and recorded it: "the department does not exist".
 *     The second line is the ROLE, which is real.
 *
 *   who is ALLOWED to take this ticket
 *     BR-2 is enforced in the handler off `ICurrentUser`, so no client can know.
 *     The only honest picker offers the list and reports the refusal. Filtering
 *     would tell an Agent that self-assignment is impossible rather than that
 *     THIS assignment is.
 * ========================================================================= */

/** `039` §3.1, and the thresholds are the product owner's: eight or more is the
 *  person you should not add to, five to seven is a warning, below that is
 *  ordinary. Exported because the test asserts each boundary individually — the
 *  mock's fixture has nobody on exactly 8, so the upper edge is unexercised
 *  there and a `>` for a `>=` would have looked correct in it. */
export const LOAD_HEAVY = 8;
export const LOAD_BUSY = 5;

export interface AssigneeOption {
  id: string;
  fullName: string;
  role: string;
}

export interface AssigneePanelProps {
  users: readonly AssigneeOption[];
  currentId: string | null;

  filter: string;
  onFilter: (next: string) => void;

  /** Disables every control while a write is in flight. The rows stay VISIBLE
   *  and stay in place — replacing them with a spinner loses the reader's
   *  position in a list they were half way down. */
  busy: boolean;

  onPick: (next: string | null) => void;

  /** `039` Q-1, and **optional on purpose**. The detail rail passes nothing and
   *  renders exactly what it rendered before this feature (Q-5); the list menu
   *  passes the fan-out's result.
   *
   *  A missing entry is NOT a zero. `undefined` renders «—» in the placeholder
   *  ink, because a zero is a fact — "this person has nothing open" — and "we
   *  have not counted yet" is a different fact that looks identical. */
  counts?: Readonly<Record<string, number | undefined>> | undefined;

  /** A refusal, already translated. It belongs HERE and not in a toast: `039`
   *  AC-27 — a failure is reported where the action was taken, because a toast
   *  is dismissible, has no history, and this panel is still open behind it.
   *  Optional, so the detail rail is unchanged (Q-5). */
  error?: string | undefined;

  lang: Lang;
}

export function AssigneePanel({
  users,
  currentId,
  filter,
  onFilter,
  busy,
  onPick,
  counts,
  error,
  lang,
}: AssigneePanelProps) {
  const { t } = useTranslation('tickets');

  const needle = filter.trim().toLocaleLowerCase();
  const shown =
    needle === ''
      ? users
      : users.filter((user) => user.fullName.toLocaleLowerCase().includes(needle));

  return (
    <div className={styles.panel} data-pop="assignee">
      <div className={styles.head}>
        <span className={styles.title}>{t('detail.assigneePanelTitle')}</span>
        <Input
          label={t('detail.assigneeSearch')}
          labelHidden
          value={filter}
          onChange={onFilter}
          placeholder={t('detail.assigneeSearch')}
          size="sm"
        />
      </div>

      <div className={styles.list}>
        {shown.length === 0 ? (
          <p className={styles.none}>{t('detail.assigneeNoMatch')}</p>
        ) : (
          shown.map((user) => {
            const current = user.id === currentId;
            return (
              <button
                key={user.id}
                type="button"
                className={cx(styles.row, current && styles.rowCurrent)}
                disabled={busy}
                /* The tick is decoration for a mouse and the whole meaning for a
                   screen reader, so the state is announced rather than drawn
                   only. `aria-current` and not `aria-selected`: this is not a
                   listbox, and a lone `aria-selected` on a button in a menu is
                   a role mismatch that some readers drop entirely. */
                aria-current={current ? 'true' : undefined}
                onClick={() => onPick(user.id)}
              >
                <Avatar name={user.fullName} size={30} />
                <span className={styles.who}>
                  <span className={styles.name} dir="auto">
                    {user.fullName}
                  </span>
                  <span className={styles.role}>{t(`role.${user.role}`)}</span>
                </span>
                {counts === undefined ? null : (
                  <LoadCount value={counts[user.id]} lang={lang} />
                )}
                {current ? (
                  <span className={styles.tick} aria-hidden="true">
                    <IconCheck size={16} />
                  </span>
                ) : null}
              </button>
            );
          })
        )}
      </div>

      {error === undefined ? null : (
        <p className={styles.error} role="alert">
          <IconAlert size={14} aria-hidden="true" />
          {error}
        </p>
      )}

      <div className={styles.foot}>
        <button
          type="button"
          className={styles.clear}
          disabled={busy || currentId === null}
          aria-current={currentId === null ? 'true' : undefined}
          onClick={() => onPick(null)}
        >
          {/* The dashed circle and the rule above it are what separate this from
              the names — NOT a red. Red is for what cannot be taken back, and an
              unassign is one click from being undone. */}
          <span className={styles.dashed} aria-hidden="true">
            <IconClose size={15} />
          </span>
          <span className={styles.clearLabel}>{t('detail.unassign')}</span>
          {currentId === null ? (
            <span className={styles.tick} aria-hidden="true">
              <IconCheck size={16} />
            </span>
          ) : null}
        </button>
      </div>

      <p className={styles.hint}>{t('detail.pickerHint')}</p>
    </div>
  );
}

/** The count, in the ink its size earns. Split out so the threshold is one
 *  expression rather than one per class. */
function LoadCount({ value, lang }: { value: number | undefined; lang: Lang }) {
  const { t } = useTranslation('tickets');

  if (value === undefined) {
    return (
      <span
        className={cx(styles.load, styles.loadUnknown)}
        aria-label={t('assign.loadUnknown')}
      >
        {'—'}
      </span>
    );
  }

  return (
    <span
      className={cx(
        styles.load,
        value >= LOAD_HEAVY
          ? styles.loadHeavy
          : value >= LOAD_BUSY
            ? styles.loadBusy
            : undefined,
      )}
    >
      {t('assign.openCount', { count: value, formatted: formatNumber(value, lang) })}
    </span>
  );
}
