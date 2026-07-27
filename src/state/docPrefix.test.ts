import { describe, it, expect } from 'vitest';
import { composeDocMessage, DOC_PREFIX_CAP, DOC_PREFIX_LABEL, type ChatDoc } from './docPrefix';

// A document uploaded "רק לשיחה הזאת" is never persisted — its extracted text
// rides along with the NEXT message the therapist sends, and only that one.
// The branching worth guarding: nothing to prefix, a normal prefix, and the
// cap (a scanned 40-page PDF must not blow the agent's context).
describe('composeDocMessage', () => {
  const doc = (text: string): ChatDoc => ({ title: 'הפניה', text });

  it('returns the message untouched when there is no document', () => {
    expect(composeDocMessage(null, 'מה שלום דנה?')).toBe('מה שלום דנה?');
  });

  it('returns the message untouched when the document has no readable text', () => {
    // Extraction failed / the file was an unreadable scan: there is nothing to
    // ground the agent with, so we must not send an empty labelled prefix.
    expect(composeDocMessage(doc(''), 'שאלה')).toBe('שאלה');
    expect(composeDocMessage(doc('   \n  '), 'שאלה')).toBe('שאלה');
  });

  it('prefixes the extracted text above the message, separated by a blank line', () => {
    expect(composeDocMessage(doc('סיכום פסיכיאטרי'), 'מה עולה מהמסמך?')).toBe(
      `${DOC_PREFIX_LABEL}סיכום פסיכיאטרי\n\nמה עולה מהמסמך?`
    );
  });

  it('keeps the message intact, including its own newlines', () => {
    expect(composeDocMessage(doc('טקסט'), 'שורה\nשורה שנייה')).toBe(
      `${DOC_PREFIX_LABEL}טקסט\n\nשורה\nשורה שנייה`
    );
  });

  it('trims surrounding whitespace off the extracted text', () => {
    expect(composeDocMessage(doc('\n  טקסט  \n'), 'שאלה')).toBe(`${DOC_PREFIX_LABEL}טקסט\n\nשאלה`);
  });

  it('passes text of exactly the cap through whole, with no ellipsis', () => {
    const text = 'א'.repeat(DOC_PREFIX_CAP);
    const out = composeDocMessage(doc(text), 'שאלה');
    expect(out).toBe(`${DOC_PREFIX_LABEL}${text}\n\nשאלה`);
    expect(out).not.toContain('…');
  });

  it('caps longer text at DOC_PREFIX_CAP characters and marks the truncation', () => {
    const text = 'ב'.repeat(DOC_PREFIX_CAP + 500);
    const out = composeDocMessage(doc(text), 'שאלה');
    expect(out).toBe(`${DOC_PREFIX_LABEL}${'ב'.repeat(DOC_PREFIX_CAP)}…\n\nשאלה`);
    // The therapist's own message always survives the cap.
    expect(out.endsWith('\n\nשאלה')).toBe(true);
  });
});
