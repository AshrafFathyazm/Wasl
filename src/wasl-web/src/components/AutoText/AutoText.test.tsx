import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AutoText } from './AutoText';

const ARABIC_NAME = 'سارة المطيري';
const LATIN = 'Hello';

describe('AutoText (040 item 23)', () => {
  it('carries dir="auto" and the start-aligned class together', () => {
    render(<AutoText title="full">{ARABIC_NAME}</AutoText>);

    const node = screen.getByText(ARABIC_NAME);
    expect(node).toHaveAttribute('dir', 'auto');
    expect(node.className).toMatch(/autoText/);
    expect(node).toHaveAttribute('title', 'full');
  });

  it('can render as another element', () => {
    render(<AutoText as="p">{LATIN}</AutoText>);
    expect(screen.getByText(LATIN).tagName).toBe('P');
  });
});
