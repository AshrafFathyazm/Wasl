import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import i18n from '../../lib/i18n';
import { AssigneePanel, type AssigneeOption } from './AssigneePanel';

/* ============================================================================
 * `039` — the shared assignee panel
 * ============================================================================
 * The panel takes no queries and fires no mutations, so everything below is a
 * property of what it was handed. The surface that feeds it — the fetch, the
 * version, the toasts — is `rowActions.test.tsx`.
 * ========================================================================= */

const USERS: AssigneeOption[] = [
  { id: 'u-heavy', fullName: 'سعد الدوسري', role: 'Agent' },
  { id: 'u-eight', fullName: 'نورة الغامدي', role: 'Agent' },
  { id: 'u-seven', fullName: 'فيصل العنزي', role: 'Manager' },
  { id: 'u-five', fullName: 'منى العتيبي', role: 'Agent' },
  { id: 'u-four', fullName: 'ريم الحربي', role: 'Agent' },
];

/* The boundaries are asserted INDIVIDUALLY, and 8 is the one that matters: the
   product owner's mock has nobody on exactly eight, so `>` where the rule says
   `>=` renders correctly in the mock and wrongly in the product. */
const COUNTS = {
  'u-heavy': 9,
  'u-eight': 8,
  'u-seven': 7,
  'u-five': 5,
  'u-four': 4,
};

function mount(over: Partial<Parameters<typeof AssigneePanel>[0]> = {}) {
  const onPick = vi.fn();
  const onFilter = vi.fn();
  const view = render(
    <I18nextProvider i18n={i18n}>
      <AssigneePanel
        users={USERS}
        currentId="u-five"
        filter=""
        onFilter={onFilter}
        busy={false}
        onPick={onPick}
        counts={COUNTS}
        lang="ar"
        {...over}
      />
    </I18nextProvider>,
  );
  return { ...view, onPick, onFilter };
}

const rowFor = (name: string) => screen.getByRole('button', { name: new RegExp(name) });

describe('AC-5 — the panel is a head, a list, a rule and one clear row', () => {
  it('renders the search field, every user, and «إلغاء الإسناد» last', () => {
    mount();

    expect(screen.getByRole('textbox')).toBeInTheDocument();
    for (const user of USERS) {
      expect(screen.getByText(user.fullName)).toBeInTheDocument();
    }

    const buttons = screen.getAllByRole('button');
    const last = buttons[buttons.length - 1];
    expect(last).toHaveTextContent(i18n.t('detail.unassign', { ns: 'tickets' }));
  });
});

describe('AC-6 — the search filters, and an empty result says so', () => {
  it('shows only the matching name', () => {
    mount({ filter: 'منى' });

    expect(screen.getByText('منى العتيبي')).toBeInTheDocument();
    expect(screen.queryByText('سعد الدوسري')).not.toBeInTheDocument();
  });

  it('shows the empty line rather than an empty box', () => {
    mount({ filter: 'لا أحد بهذا الاسم' });

    expect(
      screen.getByText(i18n.t('detail.assigneeNoMatch', { ns: 'tickets' })),
    ).toBeInTheDocument();
  });

  it('reports what was typed instead of holding the term itself', async () => {
    const { onFilter } = mount();

    await userEvent.type(screen.getByRole('textbox'), 'م');

    expect(onFilter).toHaveBeenCalledWith('م');
  });
});

describe('AC-7 / AC-8 — the second line is the ROLE, because there is no team', () => {
  it('renders the role and never a department', () => {
    mount();

    const manager = rowFor('فيصل العنزي');
    expect(manager).toHaveTextContent(i18n.t('role.Manager', { ns: 'tickets' }));

    const agent = rowFor('سعد الدوسري');
    expect(agent).toHaveTextContent(i18n.t('role.Agent', { ns: 'tickets' }));
  });
});

describe('AC-9 — the count wears the ink its size earns', () => {
  /* Each boundary on its own row. A single "the colours are right" assertion
     over five rows passes when two of the three thresholds are wrong. */
  it.each([
    ['u-heavy', 'سعد الدوسري', 9, 'loadHeavy'],
    ['u-eight', 'نورة الغامدي', 8, 'loadHeavy'],
    ['u-seven', 'فيصل العنزي', 7, 'loadBusy'],
    ['u-five', 'منى العتيبي', 5, 'loadBusy'],
    ['u-four', 'ريم الحربي', 4, 'load'],
  ])('%s with %i open renders %s', (_id, name, _count, expected) => {
    mount();

    const row = rowFor(name);
    const count = within(row).getByText(/\d/);

    expect(count.className).toContain(expected);
    if (expected === 'load') {
      expect(count.className).not.toContain('loadBusy');
      expect(count.className).not.toContain('loadHeavy');
    }
    if (expected === 'loadBusy') expect(count.className).not.toContain('loadHeavy');
  });

  it('renders a dash and not a zero for a count that has not arrived', () => {
    mount({ counts: {} });

    const row = rowFor('سعد الدوسري');
    expect(within(row).getByLabelText(i18n.t('assign.loadUnknown', { ns: 'tickets' })))
      .toHaveTextContent('—');
    expect(within(row).queryByText('0')).not.toBeInTheDocument();
  });

  it('renders no count column at all when the caller passes none — the detail rail', () => {
    mount({ counts: undefined });

    const row = rowFor('سعد الدوسري');
    expect(within(row).queryByText(/\d/)).not.toBeInTheDocument();
  });
});

describe('AC-10 — exactly one row is the current one', () => {
  it('marks the assignee and nobody else', () => {
    mount();

    const marked = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-current') === 'true');

    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveTextContent('منى العتيبي');
    expect(marked[0]!.className).toContain('rowCurrent');
  });

  it('marks «إلغاء الإسناد» instead when nothing is assigned', () => {
    mount({ currentId: null });

    const marked = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-current') === 'true');

    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveTextContent(i18n.t('detail.unassign', { ns: 'tickets' }));
  });
});

describe('AC-11 — picking commits, and there is no confirm control', () => {
  it('reports the pick on the first click', async () => {
    const { onPick } = mount();

    await userEvent.click(rowFor('سعد الدوسري'));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('u-heavy');
  });

  it('has no button that would confirm a selection', () => {
    mount();

    /* ASSERTED BY ABSENCE and by counting: five users, one clear row, and
       nothing else. A confirm button added later lands here rather than in a
       review. */
    expect(screen.getAllByRole('button')).toHaveLength(USERS.length + 1);
  });
});

describe('AC-12 — «إلغاء الإسناد» sends null and is not a danger control', () => {
  it('reports null explicitly', async () => {
    const { onPick } = mount();

    await userEvent.click(
      screen.getByRole('button', {
        name: new RegExp(i18n.t('detail.unassign', { ns: 'tickets' })),
      }),
    );

    expect(onPick).toHaveBeenCalledWith(null);
  });

  it('carries no danger class — red is for what cannot be taken back', () => {
    mount();

    const clear = screen.getByRole('button', {
      name: new RegExp(i18n.t('detail.unassign', { ns: 'tickets' })),
    });

    expect(clear.className).not.toMatch(/danger/i);
  });
});

describe('the busy flag disables without removing anything', () => {
  it('keeps every row on screen and every one unusable', () => {
    mount({ busy: true });

    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByText('سعد الدوسري')).toBeInTheDocument();
  });
});

describe('a refusal is rendered in the panel, never as a toast', () => {
  it('announces it where the action was taken', () => {
    mount({ error: 'لا تملك صلاحية هذا الإسناد.' });

    expect(screen.getByRole('alert')).toHaveTextContent('لا تملك صلاحية هذا الإسناد.');
  });
});
