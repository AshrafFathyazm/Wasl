import { render, screen, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import i18n from '../../lib/i18n';
import { Table, type TableColumn } from './Table';

/* ============================================================================
 * `041` AC-6 / AC-16 — table at md and up, cards below, never both
 * ============================================================================ */

interface Row {
  id: string;
  name: string;
}

const ROWS: Row[] = [
  { id: 'a', name: 'First' },
  { id: 'b', name: 'Second' },
];

const MENU_BODY = 'menu body';
const PAGER = 'pager here';

const COLUMNS: TableColumn<Row>[] = [
  { id: 'name', header: 'Name', cell: (row) => row.name },
];

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

const ORIGINAL_WIDTH = window.innerWidth;
afterEach(() => {
  window.innerWidth = ORIGINAL_WIDTH;
});

function mount(over: Partial<Parameters<typeof Table<Row>>[0]> = {}, withCard = true) {
  return render(
    <I18nextProvider i18n={i18n}>
      <Table
        label="Rows"
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(row) => row.id}
        {...(withCard
          ? {
              renderCard: (row: Row, menu: React.ReactNode) => (
                <article data-testid="card">
                  {row.name}
                  {menu}
                </article>
              ),
            }
          : {})}
        rowFlyout={{
          header: 'Actions',
          triggerLabel: 'Row actions',
          render: () => <span>{MENU_BODY}</span>,
        }}
        {...over}
      />
    </I18nextProvider>,
  );
}

describe('below md the rows are cards', () => {
  it('renders ONE of the two on the FIRST render — no table is ever in the DOM', () => {
    window.innerWidth = 390;
    mount();

    /* Rendered synchronously: `getBy`, not `findBy`. A hook that read the width in
       an effect would paint the table first, and this would fail on the table. */
    expect(screen.getAllByTestId('card')).toHaveLength(2);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Rows' })).toBeInTheDocument();
  });

  it('hands each card the row’s own actions trigger', () => {
    window.innerWidth = 390;
    mount();

    const first = screen.getAllByTestId('card')[0]!;
    expect(
      within(first).getByRole('button', { name: 'Row actions' }),
    ).toBeInTheDocument();
  });

  it('draws skeleton cards while loading, not table rows', () => {
    window.innerWidth = 390;
    mount({ state: 'loading', rows: [] });

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('card')).toHaveLength(0);
    expect(screen.getByRole('list', { name: 'Rows' }).children.length).toBeGreaterThan(0);
  });

  it('keeps the footer and the notice — the state is the table’s either way', () => {
    window.innerWidth = 390;
    mount({ footer: <p>{PAGER}</p> });
    expect(screen.getByText(PAGER)).toBeInTheDocument();
  });
});

describe('at md and up it is the table', () => {
  it('renders the table with its headings and no cards', () => {
    window.innerWidth = 1280;
    mount();

    expect(screen.getByRole('table', { name: 'Rows' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.queryAllByTestId('card')).toHaveLength(0);
  });

  it('switches exactly at 768', () => {
    window.innerWidth = 768;
    mount();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('is a plain table when the caller supplies no card', () => {
    window.innerWidth = 390;
    mount({}, false);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});

describe('the element’s own width wins over the viewport once it is measured', () => {
  /* jsdom lays nothing out: every box is 0px wide, which the hook reads as "not
     measured" and answers from the viewport. These tests give the card a real
     width, which is what a browser does. */
  const stubWidth = (px: number) => {
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      return { ...original.call(this), width: px } as DOMRect;
    };
    return () => {
      Element.prototype.getBoundingClientRect = original;
    };
  };

  it('shows cards in a narrow content area on a wide screen (1024px viewport, 620px room)', () => {
    window.innerWidth = 1280;
    const restore = stubWidth(620);
    try {
      mount();
      expect(screen.getAllByTestId('card')).toHaveLength(2);
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('shows the table in a wide content area even on a phone-width viewport', () => {
    window.innerWidth = 390;
    const restore = stubWidth(900);
    try {
      mount();
      expect(screen.getByRole('table')).toBeInTheDocument();
    } finally {
      restore();
    }
  });
});
