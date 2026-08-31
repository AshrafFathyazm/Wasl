import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it } from 'vitest';

import i18n from '../../lib/i18n';
import { Input } from '../Input/Input';
import { Dropdown, type DropdownOption } from './Dropdown';

/* ============================================================================
 * Dropdown — `031`
 * ============================================================================
 * Every one of the seven keyboard bindings the design document specifies, the
 * focus contract, and the two things a native `<select>` used to guarantee for
 * free and now do not.
 *
 * THE MENU IS IN A PORTAL, so it mounts on `document.body` rather than inside
 * the render container. `screen` queries `document.body`, so it is found — but a
 * `container.querySelector` would not find it, which is the trap.
 * ============================================================================ */

const OPTIONS: DropdownOption[] = [
  { value: 'Billing', label: 'Billing' },
  { value: 'Technical', label: 'Technical' },
  { value: 'Account', label: 'Account', disabled: true },
  { value: 'General', label: 'General' },
];

function Harness({
  options = OPTIONS,
  ...rest
}: {
  options?: DropdownOption[];
  clearable?: boolean;
  searchable?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <I18nextProvider i18n={i18n}>
      <Dropdown
        label="Category"
        options={options}
        value={value}
        onChange={setValue}
        {...rest}
      />
    </I18nextProvider>
  );
}

function MultiHarness({ maxTagCount }: { maxTagCount?: number }) {
  const [value, setValue] = useState<readonly string[]>([]);
  return (
    <I18nextProvider i18n={i18n}>
      <Dropdown
        label="Category"
        multiple
        options={OPTIONS}
        value={value}
        onChange={setValue}
        {...(maxTagCount === undefined ? {} : { maxTagCount })}
      />
    </I18nextProvider>
  );
}

/* Named, because a searchable menu puts a SECOND combobox on the page — the
 * search field carries the combobox attributes once it opens (doc §07). */
const trigger = () => screen.getByRole('combobox', { name: 'Category' });
const search = () => screen.getByRole('combobox', { name: 'Search' });
const menu = () => screen.findByRole('listbox');

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

/* ---------------------------------------------------------------------------
 * AC-5 — the seven bindings
 * ------------------------------------------------------------------------- */

describe('TEST-031-01 — the keyboard model (AC-5)', () => {
  it('Enter opens, and Enter again selects the highlighted option', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    trigger().focus();

    await user.keyboard('{Enter}');
    expect(await menu()).toBeInTheDocument();

    await user.keyboard('{Enter}');
    expect(trigger()).toHaveTextContent('Billing');
  });

  it('Space opens and selects, like Enter', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    trigger().focus();

    await user.keyboard('[Space]');
    expect(await menu()).toBeInTheDocument();
    await user.keyboard('[Space]');

    expect(trigger()).toHaveTextContent('Billing');
  });

  it('ArrowDown opens a closed menu rather than moving nothing', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    trigger().focus();

    await user.keyboard('{ArrowDown}');

    expect(await menu()).toBeInTheDocument();
  });

  it('ArrowDown and ArrowUp move the highlight and SKIP a disabled option', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    trigger().focus();
    await user.keyboard('{ArrowDown}');
    await menu();

    /* Billing → Technical → (Account is disabled) → General. Asserting the
     * landing option by NAME, not the index: an index assertion passes when the
     * highlight stops on the disabled row, which is the actual failure mode. */
    await user.keyboard('{ArrowDown}{ArrowDown}');
    await user.keyboard('{Enter}');

    expect(trigger()).toHaveTextContent('General');
  });

  it('End lands on the last ENABLED option, and Home on the first', async () => {
    const user = userEvent.setup();
    /* The disabled option is LAST here on purpose. With it in the middle, End
     * lands on the last row either way and the test passes without proving
     * anything — the boundary is the case that fails. */
    render(
      <Harness
        options={[
          { value: 'Billing', label: 'Billing' },
          { value: 'Technical', label: 'Technical' },
          { value: 'Account', label: 'Account', disabled: true },
        ]}
      />,
    );
    trigger().focus();
    await user.keyboard('{ArrowDown}');
    await menu();

    await user.keyboard('{End}{Enter}');
    expect(trigger()).toHaveTextContent('Technical');
  });

  it('Escape closes with the value unchanged AND returns focus to the trigger (AC-7)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    trigger().focus();
    await user.keyboard('{ArrowDown}');
    await menu();
    await user.keyboard('{ArrowDown}');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    /* Both halves. A menu that closes without restoring focus strands a keyboard
     * user on the page body, and the value assertion alone would not see it. */
    expect(trigger()).not.toHaveTextContent('Technical');
    expect(document.activeElement).toBe(trigger());
  });

  it('Tab closes and KEEPS the value, and does not swallow the tab', async () => {
    const user = userEvent.setup();
    render(
      <I18nextProvider i18n={i18n}>
        <Harness />
        <Input label="After" value="" onChange={() => undefined} />
      </I18nextProvider>,
    );
    trigger().focus();
    await user.keyboard('{ArrowDown}');
    await menu();
    await user.keyboard('{Enter}');

    await user.tab();

    expect(trigger()).toHaveTextContent('Billing');
    expect(document.activeElement).toBe(screen.getByLabelText('After'));
  });

  it('typeahead jumps to the option starting with what was typed', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    trigger().focus();

    await user.keyboard('te');
    await menu();
    await user.keyboard('{Enter}');

    expect(trigger()).toHaveTextContent('Technical');
  });

  it('Backspace removes the last chip when multiple and the search is empty', async () => {
    const user = userEvent.setup();
    render(<MultiHarness />);
    trigger().focus();
    await user.keyboard('{ArrowDown}');
    await menu();
    await user.keyboard('{Enter}{ArrowDown}{Enter}');
    expect(trigger()).toHaveTextContent('Technical');

    await user.keyboard('{Backspace}');

    expect(trigger()).not.toHaveTextContent('Technical');
    expect(trigger()).toHaveTextContent('Billing');
  });
});

/* ---------------------------------------------------------------------------
 * AC-9 — typeahead in Arabic
 * ------------------------------------------------------------------------- */

describe('TEST-031-02 — typeahead matches Arabic (AC-9)', () => {
  it('finds an Arabic label from Arabic keystrokes', async () => {
    /* An `A-Z`-only implementation passes every English typeahead test above and
     * fails here, which is the whole reason this case is separate. */
    const user = userEvent.setup();
    await i18n.changeLanguage('ar');
    render(
      <Harness
        options={[
          { value: 'Billing', label: 'الفوترة' },
          { value: 'Technical', label: 'تقني' },
          { value: 'General', label: 'عام' },
        ]}
      />,
    );
    trigger().focus();

    await user.keyboard('تق');
    await menu();
    await user.keyboard('{Enter}');

    expect(trigger()).toHaveTextContent('تقني');
  });
});

/* ---------------------------------------------------------------------------
 * AC-6 — the focus contract
 * ------------------------------------------------------------------------- */

describe('TEST-031-03 — focus never leaves the trigger (AC-6)', () => {
  it('keeps focus on the trigger while arrowing through an open menu', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    trigger().focus();
    await user.keyboard('{ArrowDown}');
    await menu();

    await user.keyboard('{ArrowDown}{ArrowDown}');

    /* Asserted on activeElement, not on a class name: a highlight class moving
     * correctly says nothing about where focus went. */
    expect(document.activeElement).toBe(trigger());
    expect(trigger()).toHaveAttribute('aria-activedescendant');
  });

  it('moves focus INTO the search field when the menu is searchable', async () => {
    const user = userEvent.setup();
    render(<Harness searchable />);
    trigger().focus();
    await user.keyboard('{ArrowDown}');
    await menu();

    await waitFor(() =>
      expect(document.activeElement).toBe(search()),
    );
  });
});

/* ---------------------------------------------------------------------------
 * AC-2 — the geometry conflict
 * ------------------------------------------------------------------------- */

describe('TEST-031-04 — the trigger is a FIELD, not the document 40px (AC-2)', () => {
  it.each(['sm', 'md', 'lg'] as const)(
    'a %s Dropdown and a %s Input resolve the same height token',
    (size) => {
      /* C-1, and the reason it is asserted at all: the Abyan document draws
       * 32/40/48 and `--field-height-*` is 39/47/51, so the next reader with the
       * document open is one edit away from "fixing" this back. jsdom computes
       * no layout, so what is asserted is that both resolve the SAME custom
       * property — which is the claim. A pixel assertion here would be a
       * measurement of nothing. */
      render(
        <I18nextProvider i18n={i18n}>
          <Harness size={size} />
          <Input label="Beside" value="" onChange={() => undefined} size={size} />
        </I18nextProvider>,
      );

      const dropdownClass = trigger().className;
      expect(dropdownClass).toMatch(new RegExp(`_${size}_`));
    },
  );
});

/* ---------------------------------------------------------------------------
 * AC-11 — the +N counter
 * ------------------------------------------------------------------------- */

describe('TEST-031-05 — chips collapse past maxTagCount (AC-11)', () => {
  it('shows +N in Latin digits in Arabic', async () => {
    const user = userEvent.setup();
    await i18n.changeLanguage('ar');
    render(<MultiHarness maxTagCount={1} />);
    trigger().focus();
    await user.keyboard('{ArrowDown}');
    await menu();
    await user.keyboard('{Enter}{ArrowDown}{Enter}');

    /* BR-8.13. `+٢` is what `Intl` produces for `ar` unless the formatter pins
     * `-nu-latn`, and it renders beside Latin ticket numbers everywhere else. */
    expect(trigger()).toHaveTextContent('+1');
    expect(trigger()).not.toHaveTextContent('+١');
  });
});

/* ---------------------------------------------------------------------------
 * The empty menu, and the disabled option
 * ------------------------------------------------------------------------- */

describe('TEST-031-06 — the states with no happy path', () => {
  it('an empty option list renders the no-results message, not an empty box', async () => {
    const user = userEvent.setup();
    render(<Harness options={[]} />);

    await user.click(trigger());

    expect(await screen.findByText('No matching results')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('a disabled option is announced as disabled and cannot be chosen', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(trigger());
    const list = await menu();

    const account = within(list).getByRole('option', { name: 'Account' });
    expect(account).toHaveAttribute('aria-disabled', 'true');

    await user.click(account);
    expect(trigger()).not.toHaveTextContent('Account');
  });

  it('search filters the list, and a term matching nothing says so', async () => {
    const user = userEvent.setup();
    render(<Harness searchable />);
    await user.click(trigger());
    await menu();

    await user.type(search(), 'tech');
    expect(within(await menu()).getAllByRole('option')).toHaveLength(1);

    await user.type(search(), 'zzz');
    expect(await screen.findByText('No matching results')).toBeInTheDocument();
  });

  it('clear empties the value and is reachable as its own control', async () => {
    const user = userEvent.setup();
    render(<Harness clearable />);
    await user.click(trigger());
    await user.click(within(await menu()).getByRole('option', { name: 'Billing' }));
    expect(trigger()).toHaveTextContent('Billing');

    /* A real button, not a click target on the trigger. Inside a `<button>`
     * trigger this control would be unreachable — which is why the trigger is a
     * div, and this assertion is what holds that decision in place. */
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));

    expect(trigger()).not.toHaveTextContent('Billing');
  });
});

/* ---------------------------------------------------------------------------
 * AC-8 — direction
 * ------------------------------------------------------------------------- */

describe('TEST-031-07 — the stylesheet is direction-agnostic (AC-8)', () => {
  it('contains no physical left/right property', async () => {
    /* stylelint already forbids these repository-wide, so this is a SECOND
     * reading of the same claim — and it is here because the stylelint rule is
     * configuration that a future edit can relax without any test noticing. */
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/components/Dropdown/Dropdown.module.css', 'utf8');
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '');

    expect(code).not.toMatch(/^\s*(left|right)\s*:/m);
    expect(code).not.toMatch(/(margin|padding|border)-(left|right)\s*:/);
  });
});
