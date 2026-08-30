import { useState } from 'react';

import { Table, type TableColumn, type TableSort } from '../components/Table/Table';
import { Badge } from '../components/Badge/Badge';
import styles from './TablePreview.module.css';

/**
 * FE-026-01 — the `Table` primitive, in isolation, and NOT holding tickets.
 *
 * This is AC-T-11. The ticket-list preview proves the geometry; it cannot prove
 * the primitive is a primitive, because a component used by exactly one screen
 * and shaped by that screen is indistinguishable from that screen's private
 * layout. So this renders a CUSTOMER table — different columns, different cell
 * shapes, a different flexible column, sorting on — through the same component,
 * with no change to it.
 *
 * If a future edit makes `Table` need to know what a ticket is, this page is
 * what goes red first.
 *
 * Literals are allowed here: eslint scopes the no-JSX-literal rule to
 * src/components, src/shell and src/features, and this is none of them. It never
 * ships — routes.tsx strips /_preview from the production bundle.
 */

interface Customer {
  id: string;
  ref: string;
  name: string;
  kind: 'فرد' | 'شركة';
  email: string;
  tickets: number;
  registered: string;
}

const KINDS = ['فرد', 'شركة'] as const;
const NAMES = [
  'Osama Ali',
  'محمد بن سعيد',
  'Sara Khan',
  'نورة السبيعي',
  'Haashir',
  'فاطمة عبد الرحمن',
];

/* Deterministic — a preview that changes between two reads cannot be compared
 * against itself, and a screenshot of it is not evidence of anything. */
const CUSTOMERS: Customer[] = Array.from({ length: 24 }, (_, i) => ({
  id: `c-${i}`,
  ref: String(54632 + i * 137),
  name: NAMES[i % NAMES.length]!,
  kind: KINDS[i % 2]!,
  email: `user${i}@yopmail.com`,
  tickets: (i % 4) + 1,
  registered: `${String((i % 28) + 1).padStart(2, '0')}/08/2026`,
}));

export default function TablePreview() {
  const [sort, setSort] = useState<TableSort | null>(null);
  const [state, setState] = useState<'data' | 'loading' | 'empty'>('data');

  const sorted = (() => {
    if (!sort) return CUSTOMERS;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...CUSTOMERS].sort((a, b) => {
      const key = sort.columnId as keyof Customer;
      return String(a[key]).localeCompare(String(b[key]), 'ar') * dir;
    });
  })();

  const columns: TableColumn<Customer>[] = [
    { id: 'ref', header: 'المعرّف', width: 96, cell: (c) => c.ref, sortable: true },
    /* The flexible column here is the NAME, not the subject. A primitive that
     * only works when the wide column is second is not a primitive. */
    { id: 'name', header: 'الاسم', cell: (c) => c.name, sortable: true },
    {
      id: 'kind',
      header: 'نوع العميل',
      width: 120,
      skeleton: 'pill',
      cell: (c) => <Badge tone={c.kind === 'شركة' ? 'info' : 'neutral'} label={c.kind} />,
    },
    {
      id: 'tickets',
      header: 'الطلبات',
      width: 88,
      align: 'center',
      cell: (c) => c.tickets,
    },
    { id: 'email', header: 'البريد الإلكتروني', width: 200, cell: (c) => c.email },
    {
      id: 'registered',
      header: 'تاريخ التسجيل',
      width: 128,
      cell: (c) => c.registered,
      sortable: true,
    },
  ];

  return (
    <main className={styles.page} dir="rtl" lang="ar">
      <h1 className={styles.title}>Table — عملاء، لا تذاكر</h1>
      <p className={styles.note}>
        AC-T-11. نفس المكوّن، أعمدة مختلفة، عمود مرن مختلف، فرز مفعّل — بدون أي تغيير في
        الـ primitive.
      </p>

      <div className={styles.controls}>
        {(['data', 'loading', 'empty'] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={state === s ? styles.toggleOn : styles.toggle}
            onClick={() => setState(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <Table
        label="جدول العملاء"
        columns={columns}
        rows={sorted}
        rowKey={(c) => c.id}
        state={state}
        sort={sort}
        onSortChange={setSort}
        sortLabel="ترتيب"
        empty={<p className={styles.empty}>لا عملاء بعد.</p>}
        rowFlyout={{
          header: 'الإجراءات',
          triggerLabel: 'إجراءات العميل',
          render: (c, close) => (
            <div className={styles.menu}>
              <button type="button" onClick={close}>
                عرض الملف — {c.name}
              </button>
              <button type="button" onClick={close}>
                تعديل
              </button>
            </div>
          ),
        }}
        footer={<div className={styles.footer}>٢٤ عميلًا</div>}
      />
    </main>
  );
}
