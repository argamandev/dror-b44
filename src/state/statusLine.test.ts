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

  // Round-1 fix: multi-word types are construct chains (סמיכות) — the
  // definite article belongs on the LAST word, not glued onto the front of
  // the whole phrase. The original always-prefix-the-front rule produced
  // "החוות דעת" / "האישור טיפול", which don't read as Hebrew. Covers all
  // four shipped docS1 chip labels (FlowOverlay.tsx) plus the brief's own
  // "סיכום טיפול" example.
  describe('multi-word construct-chain types (round-1 fix)', () => {
    it('inserts ה before the last word of a two-word construct chain — "חוות דעת" chip', () => {
      expect(docStatusLine('חוות דעת')).toBe('דרור מנסח את חוות הדעת…');
    });

    it('inserts ה before the last word — "אישור טיפול" chip', () => {
      expect(docStatusLine('אישור טיפול')).toBe('דרור מנסח את אישור הטיפול…');
    });

    it('inserts ה before the last word — "מסמך אינטייק" chip', () => {
      expect(docStatusLine('מסמך אינטייק')).toBe('דרור מנסח את מסמך האינטייק…');
    });

    it('inserts ה before the last word — the brief\'s own "סיכום טיפול" example', () => {
      expect(docStatusLine('סיכום טיפול')).toBe('דרור מנסח את סיכום הטיפול…');
    });

    it('prefixes ה onto the FIRST word instead — "מכתב לקופת חולים" chip (curated exact match, round-2)', () => {
      // "לקופת" is ל + קופת ("to the fund of") — a pure last-word ה would
      // give the awkward "מכתב לקופת החולים"; prefixing the first word
      // instead reads naturally: "the letter to Kupat Holim". Round-1 got
      // this via a letter-level heuristic on the 2nd word; round-2 replaced
      // that (it overgeneralized — see the block below) with an exact
      // curated lookup for this specific known-correct phrase.
      expect(docStatusLine('מכתב לקופת חולים')).toBe('דרור מנסח את המכתב לקופת חולים…');
    });
  });

  // Round-2 fix: round-1's heuristic — "2nd word starts with ל/ב/מ, or is
  // the word של, so prefix ה onto the FIRST word instead" — overgeneralized.
  // ל/ב/מ/ש are ALSO the ordinary root-initial letters of countless unrelated
  // nouns (בקשה request, מטופל patient, מפגש meeting, שלב stage), so the same
  // check misfired on real free-typed types, e.g. wrongly producing "האישור
  // מטופל". There's no reliable local signal that tells a bound preposition
  // apart from a word's own first letter, so non-curated multi-word types now
  // either take the safe construct-chain default (ה before the last word,
  // when the 2nd word ISN'T one of the ambiguous letters) or fall back to the
  // generic line (when it is) — the brand voice must never read as broken
  // Hebrew, so an ambiguous case is refused rather than guessed.
  describe('non-curated multi-word types (round-2 fix)', () => {
    it('applies the safe construct default when the 2nd word only coincidentally starts with ש, not an ambiguous letter — "סיכום שלב"', () => {
      // "שלב" (stage) starts with ש (not ל/ב/מ) and isn't the word "של"
      // itself, so it's unambiguous — the construct default applies safely.
      expect(docStatusLine('סיכום שלב')).toBe('דרור מנסח את סיכום השלב…');
    });

    it('falls back to the generic line — reviewer probe "אישור מטופל" (2nd word starts with מ)', () => {
      expect(docStatusLine('אישור מטופל')).toBe(DOC_STATUS_FALLBACK);
    });

    it('falls back to the generic line — reviewer probe "מכתב בקשה" (2nd word starts with ב)', () => {
      expect(docStatusLine('מכתב בקשה')).toBe(DOC_STATUS_FALLBACK);
    });

    it('falls back to the generic line — reviewer probe "סיכום מפגש" (2nd word starts with מ)', () => {
      expect(docStatusLine('סיכום מפגש')).toBe(DOC_STATUS_FALLBACK);
    });

    it('falls back to the generic line when the 2nd word is the whole word "של"', () => {
      expect(docStatusLine('אישור של טיפול')).toBe(DOC_STATUS_FALLBACK);
    });
  });
});

describe('SUMMARY_STATUS_LINE', () => {
  it('names the session being summarized', () => {
    expect(SUMMARY_STATUS_LINE).toBe('דרור מסכם את הפגישה…');
  });
});
