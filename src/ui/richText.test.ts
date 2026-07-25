import { describe, it, expect } from 'vitest';
import { normalizeBulletLines, parseAssistantText } from './richText';

// Guards the live-QA bug: Dror's replies came back with literal markdown
// (**bold**, * bullets) shown as plain asterisks in the chat bubble. These
// are the pure, string-level building blocks renderAssistantText composes —
// tested directly so the parsing/normalizing logic doesn't need a DOM.
describe('parseAssistantText', () => {
  it('leaves plain text unchanged', () => {
    expect(parseAssistantText('שלום, מה שלומך?')).toEqual([
      { type: 'text', value: 'שלום, מה שלומך?' },
    ]);
  });

  it('splits out one bold span', () => {
    expect(parseAssistantText('לפני **מודגש** אחרי')).toEqual([
      { type: 'text', value: 'לפני ' },
      { type: 'bold', value: 'מודגש' },
      { type: 'text', value: ' אחרי' },
    ]);
  });

  it('splits out two bold spans', () => {
    expect(parseAssistantText('א **ב** ג **ד** ה')).toEqual([
      { type: 'text', value: 'א ' },
      { type: 'bold', value: 'ב' },
      { type: 'text', value: ' ג ' },
      { type: 'bold', value: 'ד' },
      { type: 'text', value: ' ה' },
    ]);
  });

  it('keeps an unmatched ** literal instead of dropping it', () => {
    expect(parseAssistantText('התחלה **סוגר תקין** אבל **פתוח בלי סגירה')).toEqual([
      { type: 'text', value: 'התחלה ' },
      { type: 'bold', value: 'סוגר תקין' },
      { type: 'text', value: ' אבל **פתוח בלי סגירה' },
    ]);
  });
});

describe('normalizeBulletLines', () => {
  it('turns a line-leading "* " into "• "', () => {
    expect(normalizeBulletLines('* פריט ראשון')).toBe('• פריט ראשון');
  });

  it('turns a line-leading "- " into "• "', () => {
    expect(normalizeBulletLines('- פריט ראשון')).toBe('• פריט ראשון');
  });

  it('does not touch a mid-line asterisk or hyphen', () => {
    expect(normalizeBulletLines('זה 5 * 2 ולא 5 - 2')).toBe('זה 5 * 2 ולא 5 - 2');
  });

  it('preserves newlines and normalizes only bullet lines across a multiline string', () => {
    expect(normalizeBulletLines('שורה ראשונה\n* פריט\n- פריט נוסף\nשורה אחרונה')).toBe(
      'שורה ראשונה\n• פריט\n• פריט נוסף\nשורה אחרונה'
    );
  });
});
