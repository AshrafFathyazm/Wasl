import { useEffect, useState, type ReactNode } from 'react';

import { Badge, type BadgeTone } from '../components/Badge/Badge';
import { Button } from '../components/Button/Button';
import { Dropdown, type DropdownOption } from '../components/Dropdown/Dropdown';
import { Input } from '../components/Input/Input';
import { Loader } from '../components/Loader/Loader';
import { IconAdd, IconChevronDown } from '../icons/icons';
import { cx } from '../lib/cx';
import styles from './PreviewPage.module.css';

/*
 * A DEVELOPMENT ARTIFACT. Removed from the production bundle by
 * `import.meta.env.DEV` in routes.tsx.
 *
 * Why the literal strings below do not fail the build: eslint.config.js scopes the
 * no-user-facing-literal rule to src/components, src/shell, and src/features. This
 * file is none of those, deliberately — its labels name STATES for a reviewer
 * ("hover", "disabled"), they are not product copy, they never ship, and routing
 * them through the catalogue would put twenty untranslatable keys in `ar.json`.
 *
 * It exists because component-inventory.md's definition of done for a primitive
 * requires every state "implemented and visible in isolation", and :hover and
 * :active cannot be forced. The `data-preview-state` wrapper is what makes them
 * visible; it adds no prop to any component's frozen contract.
 */

type ForcedState = 'default' | 'hover' | 'active' | 'focus' | 'open';

const FORCED_STATES: ForcedState[] = ['default', 'hover', 'active', 'focus'];
const TONES: BadgeTone[] = ['neutral', 'info', 'success', 'warning', 'danger'];

/* Four options with one DISABLED and one carrying a description — the two rows
 * that reveal whether the menu is finished. A list of four plain strings looks
 * right in every state and proves neither. */
const PREVIEW_OPTIONS: DropdownOption[] = [
  { value: 'Billing', label: 'Billing', description: 'Invoices, refunds, payment methods' },
  { value: 'Technical', label: 'Technical' },
  { value: 'Account', label: 'Account', disabled: true },
  { value: 'General', label: 'General' },
];

const SEMANTIC_TOKENS = [
  '--surface-page',
  '--surface-content',
  '--surface-card',
  '--surface-subtle',
  '--surface-sunken',
  '--surface-inverse',
  '--brand',
  '--brand-hover',
  '--brand-active',
  '--brand-subtle',
  '--brand-border',
  '--action-primary-bg',
  '--action-secondary-bg',
  '--action-danger-bg',
  '--border-subtle',
  '--border-default',
  '--border-focus',
  '--state-success-bg',
  '--state-success-text',
  '--state-warning-bg',
  '--state-warning-text',
  '--state-danger-bg',
  '--state-danger-text',
  '--state-info-bg',
  '--state-info-text',
  '--state-neutral-bg',
  '--state-neutral-text',
];

const TYPE_ROLES = [
  '--text-page-title',
  '--text-section-title',
  '--text-card-title',
  '--text-body',
  '--text-ui',
  '--text-label',
  '--text-helper',
];

/* Marks above cap height (ث ض) and descenders below the baseline (final ي ج ع).
 * If --leading-ar-* is missing or cap-height trim is applied, this clips — and it
 * presents as a font rendering fault rather than a missing token. */
const ARABIC_SAMPLE = 'تذكرة ضمان جديدة على حساب العميل';
const ARABIC_LONG = 'إنشاء تذكرة دعم فني جديدة لعميل مسجّل في النظام';
const LATIN_LONG = 'Create a new support ticket for a registered customer';

/*
 * dir="ltr" ON EVERY TOKEN NAME BELOW.
 *
 * `--surface-page` begins with two hyphens, and a hyphen is directionally
 * NEUTRAL. In an rtl paragraph the leading neutrals are laid out on the visual
 * right, so the identifier renders as `surface-page--`. Measured, not guessed:
 * the range covering the two hyphens sat at x 1365 inside a box spanning
 * 1224–1380.
 *
 * ADR-007 §3 says machine-readable values are never localized — `type`, the keys
 * of `errors`, enum values, `TicketNumber`. It does not say they are safe to
 * render: an identifier still has to be pinned to ltr, or bidi reorders it and
 * the reader copies a string that does not exist. The first product consumer of
 * this rule is the ticket-number column.
 */

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.cell}>
      <span className={styles.cellLabel}>{label}</span>
      <div className={styles.row}>{children}</div>
    </div>
  );
}

function Forced({ state, children }: { state: ForcedState; children: ReactNode }) {
  return (
    <div data-preview-state={state === 'default' ? undefined : state}>{children}</div>
  );
}

export default function PreviewPage() {
  const [dir, setDir] = useState<'ltr' | 'rtl'>('ltr');
  const [lang, setLang] = useState<'en' | 'ar'>('en');
  const [grey, setGrey] = useState(false);
  const [text, setText] = useState('');
  const [choice, setChoice] = useState<string | null>('Billing');
  const [, setChoices] = useState<readonly string[]>(['Billing']);

  /* The real product sets these before first paint, in index.html. Here they are
   * toggles, because the point is to compare. */
  useEffect(() => {
    const root = document.documentElement;
    const previousDir = root.dir;
    const previousLang = root.lang;
    root.dir = dir;
    root.lang = lang;
    return () => {
      root.dir = previousDir;
      root.lang = previousLang;
    };
  }, [dir, lang]);

  const sample = lang === 'ar' ? ARABIC_SAMPLE : 'New ticket';

  return (
    <div className={cx(styles.page, grey && styles.greyscale)}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarGroup}>
          <span className={styles.toolbarLabel}>dir</span>
          <Button
            buttonType={dir === 'ltr' ? 'primary' : 'secondary-outline'}
            text="ltr"
            onClick={() => setDir('ltr')}
          />
          <Button
            buttonType={dir === 'rtl' ? 'primary' : 'secondary-outline'}
            text="rtl"
            onClick={() => setDir('rtl')}
          />
        </div>
        <div className={styles.toolbarGroup}>
          <span className={styles.toolbarLabel}>lang</span>
          <Button
            buttonType={lang === 'en' ? 'primary' : 'secondary-outline'}
            text="en"
            onClick={() => setLang('en')}
          />
          <Button
            buttonType={lang === 'ar' ? 'primary' : 'secondary-outline'}
            text="ar"
            onClick={() => setLang('ar')}
          />
        </div>
        <div className={styles.toolbarGroup}>
          <span className={styles.toolbarLabel}>greyscale</span>
          <Button
            buttonType={grey ? 'primary' : 'secondary-outline'}
            text={grey ? 'on' : 'off'}
            onClick={() => setGrey(!grey)}
          />
        </div>
      </div>

      {/* ---- Button ---------------------------------------------------- */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Button — Type × Status</h2>

        {(['primary', 'secondary-outline'] as const).map((buttonType) => (
          <div key={buttonType}>
            <h3 className={styles.subTitle}>{buttonType}</h3>
            <div className={styles.grid}>
              {FORCED_STATES.map((state) => (
                <Cell key={state} label={state}>
                  <Forced state={state}>
                    <Button buttonType={buttonType} text={sample} />
                  </Forced>
                </Cell>
              ))}
              <Cell label="disabled">
                <Button buttonType={buttonType} text={sample} disabled />
              </Cell>
              <Cell label="loading (width must not change)">
                <Button buttonType={buttonType} text={sample} loading />
              </Cell>
            </div>
          </div>
        ))}

        <h3 className={styles.subTitle}>Icon slots — logical, not physical</h3>
        <div className={styles.grid}>
          <Cell label="iconStart">
            <Button text={sample} iconStart={<IconAdd size={16} />} />
          </Cell>
          <Cell label="iconEnd">
            <Button text={sample} iconEnd={<IconChevronDown size={16} />} />
          </Cell>
          <Cell label="icon-only (aria-label required)">
            <Button withText={false} iconStart={<IconAdd size={16} />} aria-label="Add" />
          </Cell>
          <Cell label="long label, no wrap">
            <Button text={lang === 'ar' ? ARABIC_LONG : LATIN_LONG} />
          </Cell>
        </div>
      </section>

      {/* ---- Loader ---- */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Loader — 'Converge', not a spinner</h2>
        <div className={styles.grid}>
          <Cell label="md — full 34px travel">
            <Loader />
          </Cell>
          <Cell label="sm — reduced travel, fits a 40px control">
            <Loader size="sm" />
          </Cell>
          <Cell label="on --surface-inverse">
            <span
              style={{
                display: 'inline-flex',
                padding: 'var(--space-3)',
                backgroundColor: 'var(--surface-inverse)',
                color: 'var(--text-on-inverse)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <Loader />
            </span>
          </Cell>
        </div>
      </section>

      {/* ---- Input ----------------------------------------------------- */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Input</h2>

        <h3 className={styles.subTitle}>States</h3>
        <div className={styles.grid}>
          <Cell label="default + helper">
            <Input
              label="Full name"
              value={text}
              onChange={setText}
              helperText="As it appears on the account"
            />
          </Cell>
          <Cell label="placeholder shown">
            <Input
              label="Full name"
              value=""
              onChange={setText}
              placeholder="e.g. Sara"
            />
          </Cell>
          <Cell label="hover">
            <Forced state="hover">
              <Input label="Full name" value={text} onChange={setText} />
            </Forced>
          </Cell>
          <Cell label="focus">
            <Forced state="focus">
              <Input label="Full name" value={text} onChange={setText} />
            </Forced>
          </Cell>
          <Cell label="disabled">
            <Input label="Full name" value="Sara" onChange={setText} disabled />
          </Cell>
          <Cell label="error (replaces helper)">
            <Input
              label="Email"
              value="not-an-email"
              onChange={setText}
              helperText="This helper must NOT be visible"
              error="Enter a valid email address"
            />
          </Cell>
          <Cell label="error + focus">
            <Forced state="focus">
              <Input
                label="Email"
                value="not-an-email"
                onChange={setText}
                error="Enter a valid email address"
              />
            </Forced>
          </Cell>
          <Cell label="required marker">
            <Input label="Full name" value={text} onChange={setText} required />
          </Cell>
        </div>

        <h3 className={styles.subTitle}>Sizes — 39 / 47 / 51</h3>
        <div className={styles.grid}>
          {(['sm', 'md', 'lg'] as const).map((size) => (
            <Cell key={size} label={size}>
              <Input label="Full name" value={text} onChange={setText} size={size} />
            </Cell>
          ))}
        </div>

        <h3 className={styles.subTitle}>dir=&quot;auto&quot; on the control</h3>
        <div className={styles.grid}>
          <Cell label="Arabic value in an English form">
            <Input label="Subject" value={ARABIC_SAMPLE} onChange={setText} />
          </Cell>
          <Cell label="Latin value">
            <Input label="Subject" value={LATIN_LONG} onChange={setText} />
          </Cell>
        </div>
      </section>

      {/* ---- Dropdown --------------------------------------------------- */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Dropdown</h2>

        {/* Twelve tiles, `031` §6. Two of them cannot be produced by a pointer
            and use the `[data-preview-state]` wrapper; `open` is one of those,
            because a real open menu is portalled to document.body and would
            float over the whole preview page rather than sit in its cell. */}
        <h3 className={styles.subTitle}>States</h3>
        <div className={styles.grid}>
          <Cell label="default">
            <Dropdown
              label="Category"
              options={PREVIEW_OPTIONS}
              value={null}
              onChange={setChoice}
              helperText="Pick the closest match"
            />
          </Cell>
          <Cell label="hover">
            <Forced state="hover">
              <Dropdown
                label="Category"
                options={PREVIEW_OPTIONS}
                value={null}
                onChange={setChoice}
              />
            </Forced>
          </Cell>
          <Cell label="focus">
            <Forced state="focus">
              <Dropdown
                label="Category"
                options={PREVIEW_OPTIONS}
                value={null}
                onChange={setChoice}
              />
            </Forced>
          </Cell>
          <Cell label="open (forced — the real menu is portalled)">
            <Forced state="open">
              <Dropdown
                label="Category"
                options={PREVIEW_OPTIONS}
                value="Billing"
                onChange={setChoice}
              />
            </Forced>
          </Cell>
          <Cell label="filled + clearable">
            <Dropdown
              label="Category"
              options={PREVIEW_OPTIONS}
              value={choice}
              onChange={setChoice}
              clearable
            />
          </Cell>
          <Cell label="error (replaces helper)">
            <Dropdown
              label="Category"
              options={PREVIEW_OPTIONS}
              value={null}
              onChange={setChoice}
              helperText="This helper must NOT be visible"
              error="Choose a category"
              required
            />
          </Cell>
          <Cell label="disabled">
            <Dropdown
              label="Category"
              options={PREVIEW_OPTIONS}
              value="Billing"
              onChange={setChoice}
              disabled
            />
          </Cell>
          <Cell label="read only — value stays, caret goes">
            <Dropdown
              label="Category"
              options={PREVIEW_OPTIONS}
              value="Billing"
              onChange={setChoice}
              readOnly
            />
          </Cell>
          <Cell label="loading">
            <Dropdown
              label="Category"
              options={PREVIEW_OPTIONS}
              value={null}
              onChange={setChoice}
              loading
            />
          </Cell>
          <Cell label="multi — empty">
            <Dropdown
              label="Modules"
              multiple
              options={PREVIEW_OPTIONS}
              value={[]}
              onChange={setChoices}
            />
          </Cell>
          <Cell label="multi — filled, +N past two">
            <Dropdown
              label="Modules"
              multiple
              options={PREVIEW_OPTIONS}
              value={['Billing', 'Technical', 'General']}
              onChange={setChoices}
            />
          </Cell>
          <Cell label="empty menu — nothing to choose">
            <Dropdown
              label="Assignee"
              options={[]}
              value={null}
              onChange={setChoice}
              helperText="Open it: the menu says so rather than showing a blank box"
            />
          </Cell>
        </div>

        <h3 className={styles.subTitle}>Sizes — 39 / 47 / 51, the FIELD heights</h3>
        <div className={styles.grid}>
          {(['sm', 'md', 'lg'] as const).map((size) => (
            <Cell key={size} label={size}>
              {/* Beside an Input of the same size on purpose. The Abyan document
                  draws 32/40/48 and this is the tile where a reader who
                  "corrects" it back sees the two boxes stop agreeing. */}
              <Dropdown
                label="Category"
                size={size}
                options={PREVIEW_OPTIONS}
                value="Billing"
                onChange={setChoice}
              />
              <Input label="Beside it" value={text} onChange={setText} size={size} />
            </Cell>
          ))}
        </div>

        <h3 className={styles.subTitle}>Direction</h3>
        <div className={styles.grid}>
          <Cell label="Arabic value in an English interface">
            <Dropdown
              label="Category"
              options={[{ value: 'ar', label: ARABIC_SAMPLE }]}
              value="ar"
              onChange={setChoice}
            />
          </Cell>
          <Cell label="searchable — the field sits inside the menu">
            <Dropdown
              label="Assignee"
              searchable
              options={PREVIEW_OPTIONS}
              value={null}
              onChange={setChoice}
              helperText="Open it — focus moves into the search field"
            />
          </Cell>
        </div>
      </section>

      {/* ---- Badge ----------------------------------------------------- */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Badge — tone × appearance</h2>
        <div className={styles.grid}>
          {TONES.map((tone) => (
            <Cell key={tone} label={`${tone} — filled · outline · filled dot={false}`}>
              <Badge tone={tone} label={tone} />
              <Badge tone={tone} appearance="outline" label={tone} />
              <Badge tone={tone} label={tone} dot={false} />
            </Cell>
          ))}
        </div>
        <p className={styles.cellLabel}>
          Two appearances only — filled and outline. The third badge in each cell is the
          same <strong>filled</strong> appearance with <code>dot={'{false}'}</code>, not a
          third shape. Every badge carries a label, so it stays readable with greyscale
          on.
        </p>
      </section>

      {/* ---- Type scale ------------------------------------------------ */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Type scale — Arabic must not clip</h2>
        {TYPE_ROLES.map((role) => (
          <div key={role} className={styles.typeRow}>
            <span className={styles.typeName} dir="ltr">
              {role}
            </span>
            <span style={{ fontSize: `var(${role})` }}>{LATIN_LONG}</span>
            <span style={{ fontSize: `var(${role})` }} lang="ar" dir="rtl">
              {ARABIC_SAMPLE}
            </span>
          </div>
        ))}
      </section>

      {/* ---- Palette --------------------------------------------------- */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Semantic tokens</h2>
        <div className={styles.grid}>
          {SEMANTIC_TOKENS.map((token) => (
            <div key={token} className={styles.cell}>
              <div
                className={styles.swatch}
                style={{ backgroundColor: `var(${token})` }}
              />
              <span className={styles.swatchName} dir="ltr">
                {token}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
