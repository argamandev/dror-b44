import { describe, it, expect } from 'vitest';
import { docStatusLine, DOC_STATUS_FALLBACK, SUMMARY_STATUS_LINE } from './statusLine';

// docStatusLine names the actual document type being drafted (Task W5.7), so
// the generating-state status reads "דרור מנסח את המכתב…" rather than a
// generic "…את הטיוטה…". The branches worth guarding: a normal type, a type
// whose own first letter is ה (Hebrew nouns from the הפעיל/הפעלה pattern —
// e.g. החלטה, הצעה, הסבר — take the definite article by DOUBLING the ה, so
// "ההחלטה" is correct Hebrew, not an accidental duplicate to strip), and the
// two situations with nothing usable to name (empty/undefined, and free text
// too long to read naturally in a short status line).
describe('docStatusLine', () => {
  it('prefixes a normal type with the definite article ה', () => {
    expect(docStatusLine('מכתב')).toBe('דרור מנסח את המכתב…');
  });

  it('prefixes a type that already starts with ה, doubling the letter (correct Hebrew)', () => {
    expect(docStatusLine('החלטה')).toBe('דרור מנסח את ההחלטה…');
  });

  it('falls back to the generic מסמך line when the type is undefined', () => {
    expect(docStatusLine(undefined)).toBe(DOC_STATUS_FALLBACK);
  });

  it('falls back to the generic מסמך line when the type is empty or whitespace-only', () => {
    expect(docStatusLine('')).toBe(DOC_STATUS_FALLBACK);
    expect(docStatusLine('   ')).toBe(DOC_STATUS_FALLBACK);
  });

  it('falls back to the generic מסמך line when the type is longer than 30 characters', () => {
    const tooLong = 'א'.repeat(31);
    expect(docStatusLine(tooLong)).toBe(DOC_STATUS_FALLBACK);
  });

  it('accepts a type of exactly 30 characters', () => {
    const exact = 'א'.repeat(30);
    expect(docStatusLine(exact)).toBe(`דרור מנסח את ה${exact}…`);
  });

  it('trims surrounding whitespace before measuring length and composing the line', () => {
    expect(docStatusLine('  מכתב  ')).toBe('דרור מנסח את המכתב…');
  });
});

describe('SUMMARY_STATUS_LINE', () => {
  it('names the session being summarized', () => {
    expect(SUMMARY_STATUS_LINE).toBe('דרור מסכם את הפגישה…');
  });
});
