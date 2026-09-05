import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createCustomerSchema, emptyCreateCustomerForm } from './createCustomer.schema';

/*
 * =============================================================================
 * THE FORM DOES NOT NARROW THE API — `035` §2, ruled 2026-09-03
 * =============================================================================
 *   «لو مش بتوافق الفلاديشن وشغل الباك اند متعملهوش»
 *
 * Two things the supplied frames draw and this product refuses to build, because
 * each contradicts a rule the server enforces:
 *
 *   A FIXED `+966` PREFIX BOX. `POST /api/customers` and `PUT /api/customers/{id}`
 *   accept any parseable E.164 (BR-4.3). A static country code makes a non-Saudi
 *   number unenterable through a form whose own API would have taken it.
 *
 *   A REQUIRED ASTERISK ON THE EMAIL. BR-4.1 requires ONE OF email or phone.
 *   A phone-only customer is valid and the server creates one; an asterisk the
 *   server does not enforce blocks that customer at the client.
 *
 * WHY A TEST AND NOT A NOTE. `032` already ruled the prefix box out once, with
 * the reason written in the component. It was drawn again in the next set of
 * frames, and a comment is not something a frame can be checked against. These
 * assertions are what a later change has to argue with.
 */

const read = (rel: string) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8');

const FORM = read('features/customers/CreateCustomerPage.tsx');
const SCHEMA = read('features/customers/createCustomer.schema.ts');

/** Comments stripped: both files EXPLAIN what they refuse, so a scan over raw
 *  text finds the words in the prose. The control below proves it ran. */
const code = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('the create form accepts everything the API accepts', () => {
  it('read both files, and stripped their comments', () => {
    expect(FORM.length).toBeGreaterThan(1000);
    expect(SCHEMA.length).toBeGreaterThan(200);

    /* The prose names the very things the scans forbid. */
    expect(FORM).toContain('+966');
    expect(code(FORM)).not.toContain('/*');
  });

  /* ---- BR-4.1: one of the two, and the server decides -------------------- */

  it('accepts a phone with NO email', () => {
    /* The server creates this customer. A form that refuses it is a client
       narrowing its own API — and it fails silently, because nothing on the
       server ever hears about the attempt. */
    const parsed = createCustomerSchema.safeParse({
      ...emptyCreateCustomerForm,
      fullName: 'عميل بالجوال فقط',
      phone: '+966501234567',
    });

    expect(parsed.success).toBe(true);
  });

  it('accepts an email with NO phone', () => {
    const parsed = createCustomerSchema.safeParse({
      ...emptyCreateCustomerForm,
      fullName: 'عميل بالبريد فقط',
      email: 'only@example.com',
    });

    expect(parsed.success).toBe(true);
  });

  it('refuses NEITHER contact method — BR-4.1, and only that', () => {
    const parsed = createCustomerSchema.safeParse({
      ...emptyCreateCustomerForm,
      fullName: 'بلا وسيلة تواصل',
    });

    expect(parsed.success).toBe(false);
  });

  it('marks the email field NOT required in the markup', () => {
    /* The frame draws a red asterisk on it. `Input` renders the asterisk from
       `required`, so this is the assertion that keeps the two apart: the field
       is optional, and BR-4.1 is a rule about the PAIR, not about either one. */
    const email = /name="email"[\s\S]{0,600}?\/>/.exec(code(FORM))?.[0] ?? '';
    expect(email).not.toBe('');
    expect(email).not.toMatch(/\brequired\b/);
  });

  it('carries BR-4.1 in ONE place, and it is the validator', () => {
    /* THIS ASSERTION IS INVERTED FROM WHAT IT WAS, and the inversion is the
       point. It used to require a standing hint above the pair, on the argument
       that a cross-field rule explained under the second field is explained too
       late. The argument was sound and the implementation was not:
       `createCustomer.schema.ts` emits `customers:new.contactRequired` on BOTH
       `email` and `phone`, so a broken rule put one sentence on screen three
       times — a hint and two identical red lines.

       Removed by the product owner 2026-09-05, and guarded here so it does not
       come back by sympathy for the original argument. `feedback-layer.md` §1.6:
       never two surfaces for one event.

       The message itself stays a full sentence in the catalogue precisely
       because it is now the only carrier — a validator message shortened to
       "مطلوب" would leave the rule unexplained anywhere. */
    expect(code(FORM)).not.toContain("t('customers:new.contactRequired')");
  });

  /* ---- BR-4.3: any parseable E.164 --------------------------------------- */

  it('has no fixed country-code prefix element on the phone field', () => {
    /* A prefix box would be markup beside the input — an adornment slot, a
       sibling span, a hard-coded `+966` in JSX. The country code appears in
       exactly one place: the placeholder, which is a suggestion. */
    const stripped = code(FORM);
    expect(stripped).not.toContain('+966');
    expect(stripped).not.toMatch(/prefix/i);
    expect(stripped).toContain("t('customers:new.phonePlaceholder')");
  });

  it('accepts a non-Saudi number', () => {
    /* The point of refusing the prefix box, asserted rather than argued. */
    const parsed = createCustomerSchema.safeParse({
      ...emptyCreateCustomerForm,
      fullName: 'عميل من الأردن',
      phone: '+962790000000',
    });

    expect(parsed.success).toBe(true);
  });

  it('leaves phone NORMALISATION to the server, and does not reformat', () => {
    /* BR-4.3 is the server's. A client that normalises too produces a second
       opinion about the stored form, and `007` recorded what that costs: a
       duplicate rule comparing a raw input against a stored normalised value
       misses the duplicate it exists to catch. */
    const stripped = code(FORM);
    expect(stripped).not.toMatch(/replace\([^)]*\+966/);
    expect(stripped).not.toMatch(/E164|toE164/);
  });
});
