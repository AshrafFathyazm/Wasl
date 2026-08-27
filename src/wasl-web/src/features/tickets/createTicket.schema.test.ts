import { describe, expect, it } from 'vitest';

import {
  createTicketSchema,
  emptyCreateTicketForm,
  toCreateTicketRequest,
  type CreateTicketFormValues,
} from './createTicket.schema';

/* ============================================================================
 * The two schema claims, tested WITHOUT a DOM.
 * ============================================================================
 * Both are properties of the schema, not of the screen. Rendering a form to
 * assert them would make the test slower and — worse — able to pass for the
 * wrong reason: a form that never submits also never sends `""`.
 * ============================================================================ */

const valid: CreateTicketFormValues = {
  ...emptyCreateTicketForm,
  customerId: '3f1a6c2e-8b44-4d5e-9a01-0c7f2e6b8d31',
  subject: 'Card declined at checkout',
  description: 'The customer says the payment page returns an error.',
  category: 'Billing',
  channel: 'Email',
};

describe('TEST-024-01 — whitespace-only subject (AC-6)', () => {
  it('rejects a subject of spaces alone', () => {
    const result = createTicketSchema.safeParse({ ...valid, subject: '   ' });

    expect(result.success).toBe(false);
    /* The MESSAGE matters as much as the rejection: it is the i18n key the form
     * resolves, so a message change that breaks the catalogue lookup shows up
     * here rather than as a blank error beside the field. */
    expect(result.error?.issues[0]?.message).toBe('tickets:new.subjectRequired');
    expect(result.error?.issues[0]?.path).toEqual(['subject']);
  });

  /* THE MUTANT THE TASK NAMES. Swapping `.trim().min(1)` for a bare `.min(1)`
   * has to turn this red — otherwise the test above is passing on `min(1)`
   * alone and would keep passing after the regression it exists to catch. */
  it('is not satisfiable by length alone — three spaces have length 3', () => {
    expect('   '.length).toBeGreaterThanOrEqual(1);
    expect(createTicketSchema.safeParse({ ...valid, subject: '   ' }).success).toBe(
      false,
    );
  });

  it('sends the TRIMMED value, which is what the server stores', () => {
    const parsed = createTicketSchema.parse({ ...valid, subject: '  Card declined  ' });
    expect(parsed.subject).toBe('Card declined');
  });

  it('applies the same rule to description', () => {
    const result = createTicketSchema.safeParse({ ...valid, description: '\t \n ' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('tickets:new.descriptionRequired');
  });
});

describe('TEST-024-02 — an untouched priority never reaches the wire (AC-8)', () => {
  it('OMITS the key entirely rather than sending null or an empty string', () => {
    const parsed = createTicketSchema.parse({ ...valid, priority: '' });
    const body = toCreateTicketRequest(parsed);

    /* Asserted on the SERIALISED payload, not on the object: `undefined` is
     * invisible to `toEqual` but also invisible to `JSON.stringify`, and it is
     * the second one the server sees. A `priority: undefined` property would
     * pass a naive object assertion and still be correct here — this checks the
     * bytes. */
    expect(Object.keys(body)).not.toContain('priority');
    expect(JSON.parse(JSON.stringify(body))).not.toHaveProperty('priority');
    expect(JSON.stringify(body)).not.toContain('priority');
  });

  it('sends a chosen priority verbatim', () => {
    const body = toCreateTicketRequest(
      createTicketSchema.parse({ ...valid, priority: 'High' }),
    );
    expect(JSON.parse(JSON.stringify(body)).priority).toBe('High');
  });

  it('rejects a priority outside the contract enum', () => {
    expect(createTicketSchema.safeParse({ ...valid, priority: 'Urgent' }).success).toBe(
      false,
    );
  });
});
