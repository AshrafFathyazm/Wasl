import { describe, expect, it } from 'vitest';

import {
  createCustomerSchema,
  emptyCreateCustomerForm,
  toCreateCustomerRequest,
} from './createCustomer.schema';

/* ============================================================================
 * AC-9 — the client mirror, and the shapes it must not send
 * ============================================================================
 * Every rule here is also the server's. What these tests protect is the
 * DIFFERENCE between the two being zero in the cases that matter — a client that
 * accepts what the server rejects produces a `400` on a field the form had just
 * called valid, and a client that rejects what the server accepts narrows the
 * API from the outside.
 * ========================================================================== */

const base = { ...emptyCreateCustomerForm, fullName: 'Noura Al-Salem' };

/** The messages are CATALOGUE KEYS, so an assertion reads the key. A sentence in
 *  the schema would be an untranslated string in a file the JSX lint rule does
 *  not scan. */
function issuesFor(values: Partial<typeof emptyCreateCustomerForm>) {
  const result = createCustomerSchema.safeParse({ ...base, ...values });
  if (result.success) return {} as Record<string, string[]>;

  const map: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? '_');
    map[key] = [...(map[key] ?? []), issue.message];
  }
  return map;
}

describe('BR-4.1 — at least one contact method', () => {
  it('names BOTH fields when neither is present', () => {
    const issues = issuesFor({ email: '', phone: '' });

    /* BOTH, because `007`'s own `400` example carries the same message under
     * `email` and under `phone`. Naming one tells the user to fix the field they
     * did not choose. */
    expect(issues['email']).toContain('customers:new.contactRequired');
    expect(issues['phone']).toContain('customers:new.contactRequired');
  });

  it('accepts an email alone, and a phone alone', () => {
    expect(createCustomerSchema.safeParse({ ...base, email: 'a@b.co' }).success).toBe(true);
    expect(createCustomerSchema.safeParse({ ...base, phone: '+966501234567' }).success).toBe(
      true,
    );
  });

  it('treats a whitespace-only contact method as absent', () => {
    /* THE CASE A NAIVE MIRROR GETS WRONG. `'   '` is truthy, so a check written
     * as `email || phone` passes it — and the server then rejects the request
     * for a rule the form said was satisfied. */
    const issues = issuesFor({ email: '   ', phone: '\t' });
    expect(issues['email']).toContain('customers:new.contactRequired');
  });
});

describe('the blank-to-null transform', () => {
  it('sends null rather than an empty string for every untouched optional', () => {
    const parsed = createCustomerSchema.parse({ ...base, email: 'a@b.co' });
    const body = toCreateCustomerRequest(parsed);

    /* `""` IS NOT THE SAME REQUEST AS AN OMITTED FIELD. The server validates the
     * syntax of a value that is present, so `"phone": ""` earns a `400` on a
     * field the user never filled in. The contract's own example sends `null`. */
    expect(body).toEqual({
      fullName: 'Noura Al-Salem',
      email: 'a@b.co',
      phone: null,
      companyName: null,
      notes: null,
    });
  });

  it('trims before it measures, and sends the trimmed value', () => {
    const parsed = createCustomerSchema.parse({
      ...base,
      fullName: '  Noura Al-Salem  ',
      email: '  a@b.co ',
    });

    /* What is measured is what is left, and what is SENT is what was measured —
     * the same rule `024` wrote for `subject`. A name of three spaces passes a
     * bare `min(1)` and comes back a `400`. */
    expect(parsed.fullName).toBe('Noura Al-Salem');
    expect(parsed.email).toBe('a@b.co');
    expect(issuesFor({ fullName: '   ', email: 'a@b.co' })['fullName']).toContain(
      'customers:new.nameRequired',
    );
  });
});

describe('the email rule', () => {
  it('refuses a malformed address', () => {
    for (const bad of ['noura', 'noura@', '@example.com', 'a b@example.com']) {
      expect(issuesFor({ email: bad })['email']).toContain('customers:new.emailInvalid');
    }
  });

  it('does not lowercase or otherwise normalise it', () => {
    /* BR-4.2 is the SERVER's: it trims and lowercases before comparing and
     * storing, and the `201` returns the normalised form. A client that
     * lowercases too would look identical until the day the two rules differ,
     * and then the difference would be invisible on this side. */
    const parsed = createCustomerSchema.parse({ ...base, email: 'Ali@Example.COM' });
    expect(parsed.email).toBe('Ali@Example.COM');
  });
});

describe('the phone rule — a light check, deliberately', () => {
  it('accepts every form the server normalises', () => {
    /* Each of these is a shape `007`'s contract or its tests show the server
     * accepting. A stricter client pattern would refuse input the API accepts —
     * a client narrowing its own API (spec Q-3). */
    for (const good of ['+966501234567', '+966 50 123 4567', '0501234567', '(050) 123-4567']) {
      expect(createCustomerSchema.safeParse({ ...base, phone: good }).success).toBe(true);
    }
  });

  it('refuses what cannot be a number at all', () => {
    for (const bad of ['not a phone', '+', '12345']) {
      expect(issuesFor({ phone: bad })['phone']).toContain('customers:new.phoneInvalid');
    }
  });

  it('leaves E.164 normalisation to the server', () => {
    /* BR-4.3. The client sends what was typed; the server returns `+966501234567`
     * and the screen renders what came back. Normalising here would mean two
     * implementations of one rule, and the client's would be the wrong one. */
    const parsed = createCustomerSchema.parse({ ...base, phone: '0501234567' });
    expect(parsed.phone).toBe('0501234567');
  });
});

describe('the length limits', () => {
  it('matches the contract’s maxima', () => {
    const cases: Array<[keyof typeof emptyCreateCustomerForm, number]> = [
      ['fullName', 200],
      ['email', 320],
      ['phone', 20],
      ['companyName', 200],
      ['notes', 2000],
    ];

    for (const [field, max] of cases) {
      const atLimit =
        field === 'email'
          ? `${'a'.repeat(max - '@example.com'.length)}@example.com`
          : field === 'phone'
            ? `+${'9'.repeat(max - 1)}`
            : 'ن'.repeat(max);

      expect(
        createCustomerSchema.safeParse({ ...base, email: 'a@b.co', [field]: atLimit }).success,
      ).toBe(true);

      const overLimit = field === 'phone' ? `+${'9'.repeat(max)}` : `${atLimit}x`;
      expect(
        issuesFor({ email: 'a@b.co', [field]: overLimit })[field],
      ).toContain('customers:new.tooLong');
    }
  });

  it('counts Arabic characters, not bytes', () => {
    /* An Arabic name of 200 characters is 200 characters. A byte-based limit
     * would refuse it at about 100 and read as a mysterious length rule to
     * anyone typing in Arabic — the product's primary language. */
    const arabic200 = 'ن'.repeat(200);
    expect(
      createCustomerSchema.safeParse({ ...base, fullName: arabic200, email: 'a@b.co' })
        .success,
    ).toBe(true);
  });
});
